import { popGraphicsState, pushGraphicsState, rgb, setTextRenderingMode, TextRenderingMode } from 'pdf-lib';
import { canvasToBlob } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { createFontSet } from '../core/fonts.js';
import { visualToPage } from '../core/geometry.js';
import { isSupportedLanguage, openOcr } from '../core/ocr.js';
import { loadPdf } from '../core/pdf.js';
import { closePdf, openPdf, renderPage } from '../core/pdfjs.js';

export const kinds = ['pdf'];

const MAX_OCR_PAGES = 200;
const MIN_CONFIDENCE = 25;
const SCALE = 2.5;

export function readOptions(root) {
    return {
        language: root.querySelector('select[name="language"]')?.value ?? 'eng',
        skipText: root.querySelector('input[name="skipText"]')?.checked ?? true,
    };
}

/** A page that already carries real text does not need OCR. */
async function hasText(page) {
    const content = await page.getTextContent();

    const words = content.items.reduce((sum, item) => sum + item.str.split(/\s+/).filter(Boolean).length, 0);

    return words >= 8;
}

/**
 * Adds an invisible text layer to scanned pages so the PDF can be searched and
 * its text copied. The pages look exactly the same afterwards.
 *
 * @param {File[]} files exactly one PDF
 * @param {{language?: string, skipText?: boolean}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { language = 'eng', skipText = true } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to make searchable.');
    }

    if (!isSupportedLanguage(language)) {
        throw new ToolError('Choose a valid language.');
    }

    const file = files[0];
    const target = await loadPdf(file);

    if (target.getPageCount() > MAX_OCR_PAGES) {
        throw new ToolError(`Choose a PDF with at most ${MAX_OCR_PAGES} pages.`);
    }

    const source = await openPdf(file);
    const fonts = createFontSet(target);
    let session = null;
    let recognized = 0;
    let wordsAdded = 0;

    try {
        for (let number = 1; number <= source.numPages; number += 1) {
            const base = (number - 1) / source.numPages;
            const share = 1 / source.numPages;
            onProgress(base, `Page ${number} of ${source.numPages}`);

            const page = await source.getPage(number);

            if (skipText && await hasText(page)) {
                page.cleanup();
                continue;
            }

            const { canvas } = await renderPage(page, SCALE);
            const png = new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer());
            session ??= await openOcr(language, (fraction) => onProgress(base + fraction * share * 0.9, `Reading page ${number} of ${source.numPages}`));

            const { words } = await session.read(png);
            const kept = words.filter((word) => word.text.trim() !== '' && word.confidence >= MIN_CONFIDENCE);
            const pdfPage = target.getPage(number - 1);
            const box = pdfPage.getMediaBox();
            const rotation = ((pdfPage.getRotation().angle % 360) + 360) % 360;
            const sideways = rotation === 90 || rotation === 270;
            // The image shows the page as a viewer does; its size in points maps back to pixels.
            const pixelsPerPoint = canvas.width / (sideways ? box.height : box.width);

            await fonts.prepare(kept.map((word) => word.text).join(' '));
            pdfPage.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));

            for (const word of kept) {
                const text = word.text.trim();
                const wantedWidth = (word.x1 - word.x0) / pixelsPerPoint;
                const natural = fonts.width(text, 1);

                if (natural <= 0 || wantedWidth <= 0) {
                    continue;
                }

                const size = Math.min(Math.max(wantedWidth / natural, 2), ((word.y1 - word.y0) / pixelsPerPoint) * 3);
                const [x, y] = visualToPage(word.x0 / pixelsPerPoint, (canvas.height - word.y1) / pixelsPerPoint + size * 0.2, rotation, box.width, box.height);

                fonts.draw(pdfPage, text, { x: box.x + x, y: box.y + y, size, color: rgb(0, 0, 0), rotate: { type: 'degrees', angle: rotation } });
                wordsAdded += 1;
            }

            pdfPage.pushOperators(popGraphicsState());
            recognized += 1;
            page.cleanup();
        }
    } finally {
        await session?.close();
        await closePdf(source);
    }

    if (recognized === 0) {
        throw new ToolError('Every page already has selectable text, so there is nothing to do.');
    }

    if (wordsAdded === 0) {
        throw new ToolError('No text could be recognised. Try a sharper scan or another language.');
    }

    onProgress(0.97, 'Saving');

    return [{
        name: `${baseName(file.name)}-ocr.pdf`,
        blob: new Blob([await target.save()], { type: 'application/pdf' }),
        note: `${recognized} page${recognized === 1 ? '' : 's'} made searchable (${wordsAdded} words).`,
    }];
}
