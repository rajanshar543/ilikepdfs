import { PDFDocument, rgb } from 'pdf-lib';
import { canvasToBlob, decodeImage, drawToCanvas, releaseImage } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { createFontSet } from '../core/fonts.js';
import { readPresentation } from '../core/pptxRead.js';

export const kinds = ['pptx'];

const LINE = 1.2;
const DEFAULT_SIZE = 18;

/** Words of a paragraph with their style, ready to be wrapped. */
function wordsOf(paragraph, size, defaultColor) {
    const words = [];

    for (const run of paragraph.runs) {
        for (const piece of run.text.split(/(\n| )/)) {
            if (piece === '' || piece === ' ') {
                continue;
            }

            words.push(piece === '\n'
                ? { break: true }
                : { text: piece, size: run.size ?? size, bold: run.bold, italic: run.italic, color: run.color ?? defaultColor });
        }
    }

    return words;
}

function wrapWords(fonts, words, width, scale) {
    const lines = [];
    let line = { words: [], width: 0, size: 0 };

    const push = () => {
        lines.push(line);
        line = { words: [], width: 0, size: 0 };
    };

    for (const word of words) {
        if (word.break) {
            push();
            continue;
        }

        const size = word.size * scale;
        const wordWidth = fonts.width(word.text, size, word);
        const space = line.words.length > 0 ? fonts.width(' ', size, word) : 0;

        if (line.words.length > 0 && line.width + space + wordWidth > width) {
            push();
            line.words.push({ ...word, gap: 0, width: wordWidth });
            line.width = wordWidth;
        } else {
            line.words.push({ ...word, gap: space, width: wordWidth });
            line.width += space + wordWidth;
        }

        line.size = Math.max(line.size, size);
    }

    if (line.words.length > 0 || lines.length === 0) {
        push();
    }

    return lines;
}

/** Lays a shape's paragraphs out in its box, shrinking the text a little if it does not fit. */
function layoutText(fonts, shape, box) {
    const baseSize = shape.defaultSize ?? DEFAULT_SIZE;
    const pad = 5;

    for (let scale = 1; scale >= 0.4; scale -= 0.1) {
        let height = pad * 2;
        const paragraphs = shape.paragraphs.map((paragraph) => {
            const indent = paragraph.level * 18 * scale + (paragraph.bullet ? 14 * scale : 0);
            const words = wordsOf(paragraph, baseSize, null);

            if (paragraph.bullet && words.length > 0) {
                words.unshift({ text: paragraph.bullet, size: words[0].size, bold: false, italic: false, color: null });
            }

            const lines = wrapWords(fonts, words, Math.max(10, box.w - pad * 2 - indent), scale);
            height += lines.reduce((sum, line) => sum + (line.size || baseSize * scale) * LINE, 0);

            return { paragraph, lines, indent };
        });

        if (height <= box.h + 2 || scale <= 0.45) {
            return { paragraphs, pad };
        }
    }

    return { paragraphs: [], pad };
}

function drawText(page, fonts, layout, box, pageHeight, vertical) {
    let y = pageHeight - box.y - layout.pad;
    const total = layout.paragraphs.reduce((sum, entry) => sum + entry.lines.reduce((inner, line) => inner + (line.size || 0) * LINE, 0), 0);

    if (vertical === 'ctr') {
        y -= Math.max(0, (box.h - layout.pad * 2 - total) / 2);
    }

    for (const { paragraph, lines, indent } of layout.paragraphs) {
        for (const line of lines) {
            const height = (line.size || 12) * LINE;
            const free = box.w - layout.pad * 2 - indent - line.width;
            let x = box.x + layout.pad + indent + (paragraph.align === 'ctr' ? free / 2 : paragraph.align === 'r' ? free : 0);

            for (const word of line.words) {
                x += word.gap;
                fonts.draw(page, word.text, {
                    x, y: y - word.size * 0.85, size: word.size, bold: word.bold, italic: word.italic, color: rgb(...(word.color ?? [0.1, 0.1, 0.1])),
                });
                x += word.width;
            }

            y -= height;
        }
    }
}

/**
 * Converts a PowerPoint (.pptx) file to PDF, one page per slide. Text boxes,
 * filled shapes, pictures and simple tables are drawn; animations, charts,
 * SmartArt and effects are not.
 *
 * @param {File[]} files exactly one PPTX file
 */
export async function process(files, _options = {}, onProgress = () => {}) {
    if (files.length !== 1) {
        throw new ToolError('Add one PowerPoint file to convert.');
    }

    const file = files[0];
    const deck = readPresentation(new Uint8Array(await file.arrayBuffer()));
    const pdf = await PDFDocument.create();
    const fonts = createFontSet(pdf);
    const allText = deck.slides.flatMap((slide) => slide.shapes.flatMap((shape) => [
        ...shape.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.text)),
        ...(shape.table ? shape.table.rows.flatMap((row) => row.cells) : []),
    ])).join(' ');

    for (const style of [{}, { bold: true }, { italic: true }, { bold: true, italic: true }]) {
        await fonts.prepare(`${allText} • 0123456789`, style);
    }

    for (const [index, slide] of deck.slides.entries()) {
        onProgress(index / deck.slides.length, `Slide ${index + 1} of ${deck.slides.length}`);

        const page = pdf.addPage([deck.width, deck.height]);

        if (slide.background) {
            page.drawRectangle({ x: 0, y: 0, width: deck.width, height: deck.height, color: rgb(...slide.background) });
        }

        for (const shape of slide.shapes) {
            if (!shape.frame) {
                continue;
            }

            const box = shape.frame;
            const bottom = deck.height - box.y - box.h;

            if (shape.kind === 'picture') {
                const media = slide.media.get(shape.embed);

                if (!media) {
                    continue;
                }

                const image = await embedPicture(pdf, media.bytes);

                if (image) {
                    page.drawImage(image, { x: box.x, y: bottom, width: box.w, height: box.h });
                }

                continue;
            }

            if (shape.kind === 'table' && shape.table) {
                drawTable(page, fonts, shape.table, box, deck.height);
                continue;
            }

            if (shape.fill && shape.geometry !== 'line') {
                if (shape.geometry === 'ellipse') {
                    page.drawEllipse({ x: box.x + box.w / 2, y: bottom + box.h / 2, xScale: box.w / 2, yScale: box.h / 2, color: rgb(...shape.fill) });
                } else {
                    page.drawRectangle({ x: box.x, y: bottom, width: box.w, height: box.h, color: rgb(...shape.fill) });
                }
            }

            if (shape.paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text.trim() !== ''))) {
                drawText(page, fonts, layoutText(fonts, shape, box), box, deck.height, shape.isTitle ? 'ctr' : 't');
            }
        }
    }

    onProgress(0.95, 'Saving');
    pdf.setTitle(baseName(file.name));

    return [{
        name: `${baseName(file.name)}.pdf`,
        blob: new Blob([await pdf.save()], { type: 'application/pdf' }),
        note: `${deck.slides.length} page${deck.slides.length === 1 ? '' : 's'}. Text, shapes, pictures and simple tables are included; animations and charts are not.`,
    }];
}

async function embedPicture(pdf, bytes) {
    try {
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;

        if (isPng) {
            return await pdf.embedPng(bytes);
        }

        if (isJpeg) {
            return await pdf.embedJpg(bytes);
        }

        const decoded = await decodeImage(new Blob([bytes]));

        try {
            return await pdf.embedPng(new Uint8Array(await (await canvasToBlob(drawToCanvas(decoded), 'image/png')).arrayBuffer()));
        } finally {
            releaseImage(decoded);
        }
    } catch {
        return null;
    }
}

function drawTable(page, fonts, table, box, pageHeight) {
    let y = pageHeight - box.y;
    const size = 11;

    for (const row of table.rows) {
        const height = row.height || size * 2;
        let x = box.x;

        row.cells.forEach((text, column) => {
            const width = table.columns[column] ?? 60;
            page.drawRectangle({ x, y: y - height, width, height, borderColor: rgb(0.6, 0.6, 0.65), borderWidth: 0.6 });

            text.split('\n').forEach((line, lineIndex) => {
                const words = line.split(' ').filter(Boolean).map((word) => ({ text: word, size, bold: false, italic: false, color: null }));
                const wrapped = wrapWords(fonts, words, width - 8, 1);

                wrapped.forEach((wrappedLine, wrappedIndex) => {
                    let cursor = x + 4;

                    wrappedLine.words.forEach((word) => {
                        cursor += word.gap;
                        fonts.draw(page, word.text, { x: cursor, y: y - 4 - size - (lineIndex + wrappedIndex) * size * LINE, size, color: rgb(0.1, 0.1, 0.1) });
                        cursor += word.width;
                    });
                });
            });

            x += width;
        });

        y -= height;
    }
}
