import { bodySize, groupLines } from './pdfText.js';

const BULLET = /^[•◦▪●‣⁃–—\-*·]\s+/;
const NUMBERED = /^(\d{1,3})[.)]\s+/;

/** The distinct sizes clearly larger than body text, biggest first: they become heading levels 1, 2, 3. */
function headingSizes(pages, body) {
    const sizes = new Set();

    for (const page of pages) {
        for (const item of page.items) {
            if (item.size >= body * 1.12) {
                sizes.add(Math.round(item.size));
            }
        }
    }

    return [...sizes].sort((a, b) => b - a);
}

function headingLevel(size, sizes) {
    const index = sizes.indexOf(Math.round(size));

    return index === -1 ? 0 : Math.min(index + 1, 3);
}

/** Wraps the words of a line that sit on top of a link annotation. */
export function applyLinks(line, links) {
    let text = '';
    let open = null;

    line.parts.forEach((part, index) => {
        const centreX = part.x + part.w / 2;
        const link = links.find((candidate) => centreX >= candidate.left && centreX <= candidate.right
            && part.y >= candidate.top - 2 && part.y <= candidate.bottom + 2);

        if (index > 0 && !text.endsWith(' ') && !part.str.startsWith(' ')) {
            const previous = line.parts[index - 1];

            if (part.x - (previous.x + previous.w) > 0.15 * line.size) {
                text += ' ';
            }
        }

        if (open && open !== link) {
            text = `${text.replace(/\s+$/, '')}](${open.url}) `;
            open = null;
        }

        if (link && !open) {
            text += '[';
            open = link;
        }

        text += part.str;
    });

    if (open) {
        text = `${text.replace(/\s+$/, '')}](${open.url})`;
    }

    return text.replace(/\s+$/, '');
}

function joinParagraph(previous, next) {
    if (/[a-z]-$/.test(previous) && /^[a-z]/.test(next)) {
        return previous.slice(0, -1) + next;
    }

    return `${previous} ${next}`;
}


/**
 * Turns extracted pages into a list of blocks: headings (by font size),
 * bullet and numbered items, and paragraphs (lines joined across line breaks).
 *
 * @returns {{type: 'heading'|'bullet'|'number'|'paragraph', level?: number, number?: string, text: string}[]}
 */
export function structureDocument(pages, { withLinks = true } = {}) {
    const body = bodySize(pages);
    const sizes = headingSizes(pages, body);
    const blocks = [];
    let paragraph = null;
    let lastBottom = null;

    const flush = () => {
        if (paragraph !== null) {
            blocks.push({ type: 'paragraph', text: paragraph });
            paragraph = null;
        }
    };

    for (const page of pages) {
        lastBottom = null;

        for (const line of groupLines(page.items)) {
            const text = (withLinks ? applyLinks(line, page.links) : line.text).trim();
            const level = headingLevel(line.size, sizes);
            const gap = lastBottom === null ? Infinity : line.y - lastBottom;
            lastBottom = line.y;

            if (level > 0 && text.length < 200) {
                flush();
                blocks.push({ type: 'heading', level, text });
                continue;
            }

            if (BULLET.test(text)) {
                flush();
                blocks.push({ type: 'bullet', text: text.replace(BULLET, '') });
                continue;
            }

            const numbered = NUMBERED.exec(text);

            if (numbered) {
                flush();
                blocks.push({ type: 'number', number: numbered[1], text: text.replace(NUMBERED, '') });
                continue;
            }

            if (paragraph !== null && gap <= line.size * 1.7) {
                paragraph = joinParagraph(paragraph, text);
            } else {
                flush();
                paragraph = text;
            }
        }

        flush();
    }

    return blocks;
}
