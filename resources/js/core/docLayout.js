import { XMLParser } from 'fast-xml-parser';
import { rgb } from 'pdf-lib';
import { canvasToBlob, decodeImage, drawToCanvas, releaseImage } from './canvas.js';
import { ToolError } from './errors.js';
import { createFontSet } from './fonts.js';
import { MAX_PDF_PAGES } from './pdf.js';

const PAGE = [595.28, 841.89];
const MARGIN = 56;
const BASE_SIZE = 11;
const LINE = 1.4;
const HEADING_SIZES = { h1: 22, h2: 18, h3: 15, h4: 13, h5: 12, h6: 11 };
const LINK = rgb(0.1, 0.3, 0.8);
const INK = rgb(0.1, 0.1, 0.12);
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'div', 'li']);
const MAX_NODES = 200_000;

const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: false,
    processEntities: true,
    parseTagValue: false,
    parseAttributeValue: false,
    htmlEntities: true,
});

const tagOf = (node) => Object.keys(node).find((key) => key !== ':@' && key !== '#text');
const attrsOf = (node) => node[':@'] ?? {};

/** Parses the XHTML that mammoth produces into a tree and counts nodes to bound the work. */
export function parseHtml(html) {
    const tree = parser.parse(`<root>${html}</root>`);
    let count = 0;
    const walk = (nodes) => nodes.forEach((node) => {
        count += 1;

        if (count > MAX_NODES) {
            throw new ToolError('This document is too large to convert in the browser.');
        }

        const tag = tagOf(node);

        if (tag) {
            walk(node[tag]);
        }
    });

    walk(tree);

    return tree[0].root;
}

/** Replaces <p>/<div> children by their content separated by line breaks, so block text can flow inside a cell or list item. */
function unwrapParagraphs(nodes) {
    const flat = [];

    for (const node of nodes) {
        const tag = tagOf(node);

        if (tag === 'p' || tag === 'div') {
            if (flat.length > 0) {
                flat.push({ br: [] });
            }

            flat.push(...unwrapParagraphs(node[tag]));
        } else {
            flat.push(node);
        }
    }

    return flat;
}

/** Flattens inline content to tokens: words, spaces, line breaks and images, each with its text style. */
function inlineTokens(nodes, style = {}, out = []) {
    for (const node of nodes) {
        if ('#text' in node) {
            const text = String(node['#text']).replace(/\s+/g, ' ');

            for (const part of text.split(/( )/)) {
                if (part === ' ') {
                    out.push({ type: 'space', style });
                } else if (part !== '') {
                    out.push({ type: 'word', text: part, style });
                }
            }

            continue;
        }

        const tag = tagOf(node);

        if (tag === 'br') {
            out.push({ type: 'break' });
        } else if (tag === 'img') {
            out.push({ type: 'image', src: attrsOf(node)['@_src'] ?? '', alt: attrsOf(node)['@_alt'] ?? '' });
        } else if (tag === 'strong' || tag === 'b') {
            inlineTokens(node[tag], { ...style, bold: true }, out);
        } else if (tag === 'em' || tag === 'i') {
            inlineTokens(node[tag], { ...style, italic: true }, out);
        } else if (tag === 'u') {
            inlineTokens(node[tag], { ...style, underline: true }, out);
        } else if (tag === 's' || tag === 'strike' || tag === 'del') {
            inlineTokens(node[tag], { ...style, strike: true }, out);
        } else if (tag === 'a') {
            inlineTokens(node[tag], { ...style, link: true, underline: true }, out);
        } else if (tag && !BLOCK_TAGS.has(tag)) {
            inlineTokens(node[tag], style, out);
        }
    }

    return out;
}

/**
 * Lays a document out onto A4 pages with Noto Sans (Latin and Devanagari).
 * Supports headings, paragraphs, bold/italic, lists, tables, links and images.
 *
 * @param {import('pdf-lib').PDFDocument} pdf
 * @param {object[]} tree parsed XHTML
 */
export async function layoutDocument(pdf, tree, onProgress = () => {}) {
    const fonts = createFontSet(pdf);
    let page = null;
    let y = 0;
    const contentWidth = PAGE[0] - MARGIN * 2;

    const newPage = () => {
        if (pdf.getPageCount() >= MAX_PDF_PAGES) {
            throw new ToolError('The result would have too many pages.');
        }

        page = pdf.addPage(PAGE);
        y = PAGE[1] - MARGIN;
    };

    const ensure = (height) => {
        if (page === null || y - height < MARGIN) {
            newPage();
        }
    };

    // Every font needed is loaded first, so the layout code below can stay synchronous.
    const collectText = (nodes) => nodes.map((node) => {
        if ('#text' in node) {
            return String(node['#text']);
        }

        const tag = tagOf(node);

        return tag ? collectText(node[tag]) : '';
    }).join(' ');
    const everything = collectText(tree);

    for (const style of [{}, { bold: true }, { italic: true }, { bold: true, italic: true }]) {
        await fonts.prepare(`${everything}• 0123456789.`, style);
    }

    const widthOf = (token, size) => fonts.width(token.text, size, token.style);

    /** Breaks tokens into lines no wider than `width`. */
    function wrap(tokens, size, width) {
        const lines = [];
        let line = { items: [], width: 0 };

        const push = (force = false) => {
            while (line.items.length > 0 && line.items[line.items.length - 1].type === 'space') {
                const dropped = line.items.pop();
                line.width -= dropped.width;
            }

            if (line.items.length > 0 || force) {
                lines.push(line);
            }

            line = { items: [], width: 0 };
        };

        for (const token of tokens) {
            if (token.type === 'break') {
                push(true);
                continue;
            }

            if (token.type === 'space') {
                if (line.items.length > 0) {
                    const space = { ...token, width: fonts.width(' ', size, token.style) };
                    line.items.push(space);
                    line.width += space.width;
                }

                continue;
            }

            let remaining = token;
            let tokenWidth = widthOf(remaining, size);

            if (line.width + tokenWidth > width && line.items.length > 0) {
                push();
            }

            // A single word wider than the line is broken by characters.
            while (tokenWidth > width && remaining.text.length > 1) {
                let cut = remaining.text.length - 1;

                while (cut > 1 && widthOf({ ...remaining, text: remaining.text.slice(0, cut) }, size) > width) {
                    cut -= 1;
                }

                const head = { ...remaining, text: remaining.text.slice(0, cut), width: widthOf({ ...remaining, text: remaining.text.slice(0, cut) }, size) };
                line.items.push(head);
                line.width += head.width;
                push();
                remaining = { ...remaining, text: remaining.text.slice(cut) };
                tokenWidth = widthOf(remaining, size);
            }

            const word = { ...remaining, width: tokenWidth };
            line.items.push(word);
            line.width += tokenWidth;
        }

        push();

        return lines;
    }

    function drawLine(line, x, baseline, size, base = {}) {
        let cursor = x;

        for (const item of line.items) {
            const style = { ...base, ...item.style };

            if (item.type === 'word') {
                const color = style.link ? LINK : INK;
                fonts.draw(page, item.text, { x: cursor, y: baseline, size, bold: style.bold, italic: style.italic, color });

                if (style.underline || style.strike) {
                    const lineY = style.strike ? baseline + size * 0.3 : baseline - size * 0.12;
                    page.drawLine({ start: { x: cursor, y: lineY }, end: { x: cursor + item.width, y: lineY }, thickness: 0.6, color });
                }
            }

            cursor += item.width;
        }
    }

    const imageCache = new Map();

    async function embedDataImage(src) {
        const match = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(src);

        if (!match) {
            return null;
        }

        if (!imageCache.has(src)) {
            const bytes = Uint8Array.from(atob(match[2].replace(/\s+/g, '')), (char) => char.charCodeAt(0));
            let embedded = null;

            try {
                if (match[1] === 'image/png') {
                    embedded = await pdf.embedPng(bytes);
                } else if (match[1] === 'image/jpeg' || match[1] === 'image/jpg') {
                    embedded = await pdf.embedJpg(bytes);
                }
            } catch {
                embedded = null;
            }

            if (!embedded) {
                const decoded = await decodeImage(new Blob([bytes], { type: match[1] })).catch(() => null);

                if (decoded) {
                    try {
                        const canvas = drawToCanvas(decoded);
                        embedded = await pdf.embedPng(new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer()));
                    } finally {
                        releaseImage(decoded);
                    }
                }
            }

            imageCache.set(src, embedded);
        }

        return imageCache.get(src);
    }

    async function drawImageBlock(token, x, maxWidth) {
        const image = await embedDataImage(token.src);

        if (!image) {
            return;
        }

        const scale = Math.min(1, maxWidth / image.width, (PAGE[1] - MARGIN * 2) / image.height);
        const width = image.width * 0.75 * Math.min(scale / 0.75, scale);
        const height = image.height * (width / image.width);

        ensure(height + 6);
        page.drawImage(image, { x, y: y - height, width, height });
        y -= height + 6;
    }

    /** A paragraph-like block: inline content wrapped at `x`..`x+width`. */
    async function drawInline(nodes, { x = MARGIN, width = contentWidth, size = BASE_SIZE, style = {}, after = 6, firstPrefix = null }) {
        const tokens = inlineTokens(nodes, style);
        const images = tokens.filter((token) => token.type === 'image');
        const text = tokens.filter((token) => token.type !== 'image');

        if (firstPrefix) {
            text.unshift({ type: 'word', text: firstPrefix, style: {} }, { type: 'space', style: {} });
        }

        const lines = wrap(text, size, width);
        const lineHeight = size * LINE;

        for (const line of lines) {
            ensure(lineHeight);
            drawLine(line, x, y - size, size, style);
            y -= lineHeight;
        }

        for (const image of images) {
            await drawImageBlock(image, x, width);
        }

        if (lines.length > 0 || images.length > 0) {
            y -= after;
        }
    }

    function listPrefix(ordered, index) {
        return ordered ? `${index}.` : '•';
    }

    async function drawList(node, depth) {
        const tag = tagOf(node);
        const ordered = tag === 'ol';
        let index = 1;
        const indent = 20 + depth * 18;

        for (const item of node[tag]) {
            if (tagOf(item) !== 'li') {
                continue;
            }

            const children = item.li;
            const inline = children.filter((child) => !['ul', 'ol'].includes(tagOf(child) ?? ''));
            const nested = children.filter((child) => ['ul', 'ol'].includes(tagOf(child) ?? ''));

            // List items may wrap their text in <p>; unwrap so it flows next to the bullet.
            const flat = unwrapParagraphs(inline);

            await drawInline(flat, { x: MARGIN + indent, width: contentWidth - indent, after: 3, firstPrefix: listPrefix(ordered, index) });
            index += 1;

            for (const child of nested) {
                await drawList(child, depth + 1);
            }
        }

        y -= 3;
    }

    async function drawTable(node) {
        const rows = [];

        const collectRows = (nodes) => nodes.forEach((child) => {
            const tag = tagOf(child);

            if (tag === 'tr') {
                rows.push(child.tr.filter((cell) => ['td', 'th'].includes(tagOf(cell) ?? '')).map((cell) => ({
                    tag: tagOf(cell),
                    nodes: unwrapParagraphs(cell[tagOf(cell)]),
                    span: Math.max(1, Math.min(20, Number(attrsOf(cell)['@_colspan']) || 1)),
                })));
            } else if (['thead', 'tbody', 'tfoot'].includes(tag)) {
                collectRows(child[tag]);
            }
        });

        collectRows(node.table);

        if (rows.length === 0) {
            return;
        }

        const columns = Math.max(...rows.map((row) => row.reduce((sum, cell) => sum + cell.span, 0)));
        const pad = 4;
        const size = 10;
        const natural = Array(columns).fill(30);

        for (const row of rows) {
            let column = 0;

            for (const cell of row) {
                const tokens = inlineTokens(cell.nodes).filter((token) => token.type === 'word');
                const longest = Math.max(0, ...tokens.map((token) => widthOf(token, size)));
                const total = tokens.reduce((sum, token) => sum + widthOf(token, size) + fonts.width(' ', size), 0);
                const want = Math.min(Math.max(longest + pad * 2, Math.min(total, 220) + pad * 2), 300);

                if (cell.span === 1) {
                    natural[column] = Math.max(natural[column], want);
                }

                column += cell.span;
            }
        }

        const scale = contentWidth / natural.reduce((sum, width) => sum + width, 0);
        const widths = natural.map((width) => width * scale);

        for (const row of rows) {
            let column = 0;
            const cells = row.map((cell) => {
                const width = widths.slice(column, column + cell.span).reduce((sum, value) => sum + value, 0);
                const start = column;
                column += cell.span;
                const bold = cell.tag === 'th';
                const tokens = inlineTokens(cell.nodes, bold ? { bold: true } : {}).filter((token) => token.type !== 'image');

                return { start, width, lines: wrap(tokens, size, width - pad * 2) };
            });

            const height = Math.max(1, ...cells.map((cell) => cell.lines.length)) * size * LINE + pad * 2;
            ensure(Math.min(height, PAGE[1] - MARGIN * 2));

            for (const cell of cells) {
                const x = MARGIN + widths.slice(0, cell.start).reduce((sum, value) => sum + value, 0);
                page.drawRectangle({ x, y: y - height, width: cell.width, height, borderColor: rgb(0.65, 0.65, 0.7), borderWidth: 0.6 });
                cell.lines.forEach((line, lineIndex) => drawLine(line, x + pad, y - pad - size - lineIndex * size * LINE, size));
            }

            y -= height;
        }

        y -= 10;
    }

    async function drawBlocks(nodes) {
        let loose = [];

        const flushLoose = async () => {
            if (loose.some((node) => !('#text' in node) || String(node['#text']).trim() !== '')) {
                await drawInline(loose, {});
            }

            loose = [];
        };

        for (const node of nodes) {
            const tag = tagOf(node);

            if (tag === 'p') {
                await flushLoose();
                await drawInline(node.p, {});
            } else if (HEADING_SIZES[tag]) {
                await flushLoose();
                y -= 6;
                await drawInline(node[tag], { size: HEADING_SIZES[tag], style: { bold: true }, after: 6 });
            } else if (tag === 'ul' || tag === 'ol') {
                await flushLoose();
                await drawList(node, 0);
            } else if (tag === 'table') {
                await flushLoose();
                await drawTable(node);
            } else if (tag === 'blockquote' || tag === 'div') {
                await flushLoose();
                await drawBlocks(node[tag]);
            } else {
                loose.push(node);
            }
        }

        await flushLoose();
    }

    onProgress(0.4, 'Laying out the pages');
    await drawBlocks(tree);

    if (pdf.getPageCount() === 0) {
        throw new ToolError('This document has no content to convert.');
    }
}
