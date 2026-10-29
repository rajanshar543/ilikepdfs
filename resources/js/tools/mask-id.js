import { canvasToBlob, decodeImage, drawToCanvas, releaseImage } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName, checkFileKind } from '../core/files.js';
import { ID_KINDS, maskRanges } from '../core/idPatterns.js';
import { openOcr } from '../core/ocr.js';
import { extractPages } from '../core/pdfText.js';
import { applyRedactions } from './redact-pdf.js';

export const kinds = ['pdf', 'jpeg', 'png'];

export function readOptions(root) {
    return {
        kinds: [...root.querySelectorAll('input[name="idkind"]:checked')].map((input) => input.value),
    };
}

/** Boxes (displayed points) covering the hidden part of each number found in the text items of a PDF. */
export function boxesFromItems(pages, selected) {
    const boxes = [];

    for (const page of pages) {
        for (const item of page.items) {
            const share = item.w / item.str.length;

            for (const range of maskRanges(item.str, selected)) {
                boxes.push({
                    page: page.number - 1,
                    x: item.x + share * range.start - 1,
                    y: item.y - item.size * 0.95,
                    w: share * (range.end - range.start) + 2,
                    h: item.size * 1.25,
                    kind: range.kind,
                });
            }
        }
    }

    return boxes;
}

/** Boxes (pixels) over the hidden part of numbers that OCR found, working line by line. */
export function boxesFromWords(words, selected) {
    const boxes = [];
    const lines = new Map();

    words.forEach((word) => {
        if (!lines.has(word.line)) {
            lines.set(word.line, []);
        }

        lines.get(word.line).push(word);
    });

    for (const lineWords of lines.values()) {
        let text = '';
        const spans = lineWords.map((word) => {
            const start = text.length;
            text += `${word.text} `;

            return { word, start, end: start + word.text.length };
        });

        for (const range of maskRanges(text, selected)) {
            for (const { word, start, end } of spans) {
                const from = Math.max(range.start, start);
                const to = Math.min(range.end, end);

                if (from >= to) {
                    continue;
                }

                const share = (word.x1 - word.x0) / (end - start);
                boxes.push({
                    x: word.x0 + share * (from - start) - 2,
                    y: word.y0 - 3,
                    w: share * (to - from) + 4,
                    h: word.y1 - word.y0 + 6,
                    kind: range.kind,
                });
            }
        }
    }

    return boxes;
}

async function maskImage(file, kind, selected, onProgress) {
    const image = await decodeImage(file, file.name);
    let ocr;

    try {
        const canvas = drawToCanvas(image, { background: '#ffffff' });
        const png = new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer());

        onProgress(0.15, 'Reading the numbers (first run loads the reader)');
        ocr = await openOcr('eng', (fraction) => onProgress(0.15 + fraction * 0.7, 'Reading the numbers'));
        const { words } = await ocr.read(png);
        const boxes = boxesFromWords(words, selected);
        const context = canvas.getContext('2d');
        context.fillStyle = '#000000';
        boxes.forEach((box) => context.fillRect(box.x, box.y, box.w, box.h));

        const type = kind === 'png' ? 'image/png' : 'image/jpeg';

        return { blob: await canvasToBlob(canvas, type, 0.92), count: boxes.length, type };
    } finally {
        releaseImage(image);
        await ocr?.close();
    }
}

/**
 * Hides the personal numbers in a PDF or a photo of a document (Aadhaar, PAN,
 * mobile and card numbers) before you share it. Only part of each number is
 * covered, as is normal when masking, and PDF pages are flattened so the
 * hidden digits are really gone.
 *
 * @param {File[]} files exactly one PDF or image
 * @param {{kinds: string[]}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { kinds: selected = [] } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF or photo to mask.');
    }

    if (!Array.isArray(selected) || selected.length === 0 || !selected.every((item) => item in ID_KINDS)) {
        throw new ToolError('Choose at least one kind of number to hide.');
    }

    const file = files[0];
    const kind = await checkFileKind(file, kinds);

    if (kind === 'pdf') {
        onProgress(0.1, 'Looking for numbers');
        const pages = await extractPages(file, (fraction, label) => onProgress(fraction * 0.4, label));
        const boxes = boxesFromItems(pages, selected);

        if (boxes.length === 0) {
            throw new ToolError('No numbers of that kind were found in the text of this PDF. If it is a scan, save a page as an image and mask that, or use Redact PDF.');
        }

        const { bytes } = await applyRedactions(file, boxes, (fraction, label) => onProgress(0.4 + fraction * 0.6, label));

        return [{
            name: `${baseName(file.name)}-masked.pdf`,
            blob: new Blob([bytes], { type: 'application/pdf' }),
            note: `${boxes.length} number${boxes.length === 1 ? '' : 's'} partly hidden. Pages with hidden numbers are flattened.`,
        }];
    }

    const { blob, count, type } = await maskImage(file, kind, selected, onProgress);

    if (count === 0) {
        throw new ToolError('No numbers of that kind were found. Try a sharper, larger photo, or use Redact PDF to cover areas by hand.');
    }

    return [{
        name: `${baseName(file.name)}-masked.${type === 'image/png' ? 'png' : 'jpg'}`,
        blob,
        note: `${count} area${count === 1 ? '' : 's'} covered. Check the result before you share it.`,
    }];
}
