import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { canvasToBlob } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { diffBoxes } from '../core/pixelDiff.js';
import { closePdf, openPdf, renderPage } from '../core/pdfjs.js';
import { extractPages, groupLines } from '../core/pdfText.js';
import { diffWords } from '../core/textDiff.js';

export const kinds = ['pdf'];

const MAX_COMPARE_PAGES = 100;
const SCALE = 1.25;
const MAX_SNIPPETS_PER_PAGE = 12;

const pageText = (page) => groupLines(page.items).map((line) => line.text).join(' ');

async function renderAll(file, count) {
    const document = await openPdf(file);
    const rendered = [];

    try {
        for (let number = 1; number <= Math.min(document.numPages, count); number += 1) {
            const page = await document.getPage(number);
            const { canvas, width, height } = await renderPage(page, SCALE);
            rendered.push({ canvas, width, height });
            page.cleanup();
        }
    } finally {
        await closePdf(document);
    }

    return rendered;
}

const trim = (text) => (text.length > 90 ? `${text.slice(0, 87)}...` : text);

/**
 * Compares an old and a new PDF page by page, by text and by looks. Produces a
 * report PDF with both pages side by side and the changed areas marked, and a
 * text summary of the changed words.
 *
 * @param {File[]} files [original, revised]
 */
export async function process(files, _options = {}, onProgress = () => {}) {
    if (files.length !== 2) {
        throw new ToolError('Add two PDF files to compare: the original first, then the new version.');
    }

    const [original, revised] = files;
    const [textA, textB] = [await extractPages(original, (fraction, label) => onProgress(fraction * 0.2, label)), await extractPages(revised, (fraction, label) => onProgress(0.2 + fraction * 0.2, label))];
    const count = Math.max(textA.length, textB.length);

    if (count > MAX_COMPARE_PAGES) {
        throw new ToolError(`Choose PDFs with at most ${MAX_COMPARE_PAGES} pages.`);
    }

    onProgress(0.45, 'Drawing the pages');
    const [imagesA, imagesB] = [await renderAll(original, count), await renderAll(revised, count)];

    const report = await PDFDocument.create();
    const font = await report.embedFont(StandardFonts.Helvetica);
    const bold = await report.embedFont(StandardFonts.HelveticaBold);
    const summary = [];
    let changedPages = 0;

    for (let index = 0; index < count; index += 1) {
        onProgress(0.5 + (index / count) * 0.45, `Comparing page ${index + 1} of ${count}`);

        const left = imagesA[index];
        const right = imagesB[index];
        const changes = diffWords(textA[index] ? pageText(textA[index]) : '', textB[index] ? pageText(textB[index]) : '');
        let boxes = [];
        let note = '';

        if (!left || !right) {
            note = left ? 'This page only exists in the original.' : 'This page only exists in the new version.';
        } else if (left.canvas.width !== right.canvas.width || left.canvas.height !== right.canvas.height) {
            note = 'The page size changed.';
            boxes = [{ x: 0, y: 0, w: right.canvas.width, h: right.canvas.height }];
        } else {
            const { width, height } = left.canvas;
            const a = left.canvas.getContext('2d').getImageData(0, 0, width, height).data;
            const b = right.canvas.getContext('2d').getImageData(0, 0, width, height).data;
            boxes = diffBoxes(a, b, width, height);
        }

        if (changes.length === 0 && boxes.length === 0 && note === '') {
            continue;
        }

        changedPages += 1;
        summary.push(`Page ${index + 1}${note ? ` - ${note}` : ''}`);
        changes.slice(0, MAX_SNIPPETS_PER_PAGE).forEach((change) => summary.push(`  ${change.type === 'removed' ? '-' : '+'} ${trim(change.text)}`));

        if (changes.length > MAX_SNIPPETS_PER_PAGE) {
            summary.push(`  ... and ${changes.length - MAX_SNIPPETS_PER_PAGE} more changes`);
        }

        if (changes.length === 0 && boxes.length > 0 && !note) {
            summary.push('  (the page looks different, but the words are the same)');
        }

        const page = report.addPage([842, 595]);
        page.drawText(`Page ${index + 1}${note ? `: ${note}` : `: ${changes.length} text change${changes.length === 1 ? '' : 's'}, ${boxes.length} changed area${boxes.length === 1 ? '' : 's'}`}`, { x: 30, y: 565, size: 12, font: bold });

        for (const [side, source, label] of [[0, left, 'Original'], [1, right, 'New version']]) {
            const x0 = 30 + side * 400;
            page.drawText(label, { x: x0, y: 545, size: 10, font, color: rgb(0.3, 0.3, 0.3) });

            if (!source) {
                continue;
            }

            const fit = Math.min(380 / source.width, 500 / source.height);
            const embedded = await report.embedJpg(new Uint8Array(await (await canvasToBlob(source.canvas, 'image/jpeg', 0.8)).arrayBuffer()));
            const drawWidth = source.width * fit;
            const drawHeight = source.height * fit;
            const top = 535;
            page.drawImage(embedded, { x: x0, y: top - drawHeight, width: drawWidth, height: drawHeight });
            page.drawRectangle({ x: x0, y: top - drawHeight, width: drawWidth, height: drawHeight, borderColor: rgb(0.7, 0.7, 0.75), borderWidth: 0.5 });

            for (const box of boxes) {
                page.drawRectangle({
                    x: x0 + (box.x / source.canvas.width) * drawWidth,
                    y: top - ((box.y + box.h) / source.canvas.height) * drawHeight,
                    width: (box.w / source.canvas.width) * drawWidth,
                    height: (box.h / source.canvas.height) * drawHeight,
                    color: rgb(0.9, 0.1, 0.1),
                    opacity: 0.22,
                    borderColor: rgb(0.9, 0.1, 0.1),
                    borderWidth: 0.8,
                });
            }
        }
    }

    const header = `Compared "${original.name}" with "${revised.name}": ${count} page${count === 1 ? '' : 's'}, ${changedPages} with differences.`;

    if (changedPages === 0) {
        return [{ name: 'comparison.txt', text: `${header}\n\nNo differences were found. The two PDFs look and read the same.` }];
    }

    return [
        { name: 'comparison.pdf', blob: new Blob([await report.save()], { type: 'application/pdf' }), note: `${changedPages} page${changedPages === 1 ? '' : 's'} with differences marked in red` },
        { name: 'changes.txt', text: `${header}\n\n${summary.join('\n')}\n\n(- removed from the original, + added in the new version)` },
    ];
}

