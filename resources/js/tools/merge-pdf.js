import { PDFDocument } from 'pdf-lib';
import { ToolError } from '../core/errors.js';
import { loadPdf, MAX_PDF_PAGES, savePdf } from '../core/pdf.js';

export const kinds = ['pdf'];

/**
 * Merges the PDFs in the order given.
 *
 * @param {File[]} files
 * @param {object} _options
 * @param {(fraction: number, text?: string) => void} onProgress
 */
export async function process(files, _options = {}, onProgress = () => {}) {
    if (files.length < 2) {
        throw new ToolError('Add at least two PDF files to merge.');
    }

    const merged = await PDFDocument.create();

    for (const [index, file] of files.entries()) {
        onProgress(index / files.length, `Reading ${file.name}`);

        const source = await loadPdf(file);

        if (merged.getPageCount() + source.getPageCount() > MAX_PDF_PAGES) {
            throw new ToolError(`The merged file would have more than ${MAX_PDF_PAGES} pages.`);
        }

        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
    }

    onProgress(0.95, 'Saving');

    return [{ name: 'merged.pdf', blob: await savePdf(merged) }];
}

export const thumbs = false;
