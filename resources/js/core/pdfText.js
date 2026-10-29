import { closePdf, openPdf } from './pdfjs.js';

/**
 * Reads text with positions from every page. Coordinates are as the viewer
 * shows the page: origin at the top left, y growing downwards, so rotated
 * pages read correctly.
 *
 * @param {File|Blob} file
 * @param {(fraction: number, text?: string) => void} onProgress
 * @returns {Promise<{number: number, width: number, height: number, items: object[], links: object[]}[]>}
 */
export async function extractPages(file, onProgress = () => {}) {
    const document = await openPdf(file);
    const pages = [];

    try {
        for (let number = 1; number <= document.numPages; number += 1) {
            onProgress((number - 1) / document.numPages, `Reading page ${number} of ${document.numPages}`);

            const page = await document.getPage(number);
            const view = page.getViewport({ scale: 1 });
            const content = await page.getTextContent();
            const items = [];

            for (const item of content.items) {
                // pdf.js reports wide gaps as blank items; the gaps themselves are measured later.
                if (typeof item.str !== 'string' || item.str.trim() === '') {
                    continue;
                }

                const [x, y] = view.convertToViewportPoint(item.transform[4], item.transform[5]);
                const size = Math.hypot(item.transform[2], item.transform[3]) || item.height || 10;

                items.push({ str: item.str, x, y, w: item.width, size });
            }

            const links = [];

            for (const annotation of await page.getAnnotations()) {
                if (annotation.subtype === 'Link' && annotation.url && /^(https?:|mailto:)/i.test(annotation.url)) {
                    const [x1, y1] = view.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
                    const [x2, y2] = view.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
                    links.push({ url: annotation.url, left: Math.min(x1, x2), right: Math.max(x1, x2), top: Math.min(y1, y2), bottom: Math.max(y1, y2) });
                }
            }

            pages.push({ number, width: view.width, height: view.height, items, links });
            page.cleanup();
        }
    } finally {
        await closePdf(document);
    }

    return pages;
}

/**
 * Joins text pieces that sit on the same baseline into lines, top to bottom.
 *
 * @returns {{text: string, x: number, y: number, size: number, end: number, parts: object[]}[]}
 */
export function groupLines(items) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];

    for (const item of sorted) {
        const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(2, 0.4 * Math.min(candidate.size, item.size)));

        if (row) {
            row.parts.push(item);
            row.size = Math.max(row.size, item.size);
        } else {
            rows.push({ y: item.y, size: item.size, parts: [item] });
        }
    }

    return rows
        .sort((a, b) => a.y - b.y)
        .map((row) => {
            const parts = row.parts.sort((a, b) => a.x - b.x);
            let text = '';

            parts.forEach((part, index) => {
                if (index > 0) {
                    const previous = parts[index - 1];
                    const gap = part.x - (previous.x + previous.w);

                    if (gap > 0.15 * row.size && !text.endsWith(' ') && !part.str.startsWith(' ')) {
                        text += ' ';
                    }
                }

                text += part.str;
            });

            const last = parts[parts.length - 1];

            return { text: text.replace(/\s+$/, ''), x: parts[0].x, y: row.y, size: row.size, end: last.x + last.w, parts };
        })
        .filter((line) => line.text.trim() !== '');
}

/** The font size most characters use: what "normal body text" means in this document. */
export function bodySize(pages) {
    const counts = new Map();

    for (const page of pages) {
        for (const item of page.items) {
            const key = Math.round(item.size * 2) / 2;
            counts.set(key, (counts.get(key) ?? 0) + item.str.length);
        }
    }

    let best = 12;
    let most = 0;

    for (const [size, count] of counts) {
        if (count > most) {
            best = size;
            most = count;
        }
    }

    return best;
}
