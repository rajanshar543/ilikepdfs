import { canvasToBlob } from './canvas.js';
import { ToolError } from './errors.js';
import { baseName } from './files.js';
import { parsePageRanges } from './pdf.js';
import { closePdf, openPdf, renderPage } from './pdfjs.js';

const DPI_CHOICES = [72, 150, 220];
const MAX_IMAGES = 500;

export function readPdfImageOptions(root) {
    return {
        dpi: Number(root.querySelector('select[name="dpi"]')?.value ?? 150),
        quality: Number(root.querySelector('select[name="quality"]')?.value ?? 0.9),
        pages: root.querySelector('input[name="pages"]')?.value ?? '',
    };
}

/**
 * Renders PDF pages to image files, one per page.
 *
 * @param {File[]} files exactly one PDF
 * @param {'jpg'|'png'} format
 * @param {{dpi?: number, quality?: number, pages?: string}} options
 */
export async function pdfToImages(files, format, options = {}, onProgress = () => {}) {
    const { dpi = 150, quality = 0.9, pages = '' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to convert.');
    }

    if (!DPI_CHOICES.includes(dpi)) {
        throw new ToolError('Choose a valid image quality.');
    }

    if (!(quality >= 0.1 && quality <= 1)) {
        throw new ToolError('Choose a valid JPG quality.');
    }

    const file = files[0];
    const document = await openPdf(file);

    try {
        const wanted = String(pages).trim() === ''
            ? Array.from({ length: document.numPages }, (_, index) => index)
            : parsePageRanges(pages, document.numPages);

        if (wanted.length > MAX_IMAGES) {
            throw new ToolError(`Choose at most ${MAX_IMAGES} pages at a time.`);
        }

        const mime = format === 'png' ? 'image/png' : 'image/jpeg';
        const stem = baseName(file.name);
        const output = [];

        for (const [position, index] of wanted.entries()) {
            onProgress(position / wanted.length, `Page ${index + 1} (${position + 1} of ${wanted.length})`);

            const page = await document.getPage(index + 1);
            const { canvas } = await renderPage(page, dpi / 72);
            output.push({
                name: `${stem}-page-${index + 1}.${format}`,
                blob: await canvasToBlob(canvas, mime, format === 'jpg' ? quality : undefined),
            });
            page.cleanup();
        }

        return output;
    } finally {
        await closePdf(document);
    }
}
