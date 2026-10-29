import { PDFDocument } from 'pdf-lib';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { loadPdf, parsePageRanges, savePdf } from '../core/pdf.js';

export const kinds = ['pdf'];

const MODES = ['each', 'ranges', 'extract'];

export function init(root) {
    const sync = () => {
        const mode = root.querySelector('input[name="mode"]:checked')?.value;
        root.querySelector('[data-ranges]').hidden = mode === 'each';
    };

    root.querySelectorAll('input[name="mode"]').forEach((radio) => radio.addEventListener('change', sync));
    sync();
}

export function readOptions(root) {
    return {
        mode: root.querySelector('input[name="mode"]:checked')?.value ?? 'each',
        ranges: root.querySelector('input[name="ranges"]')?.value ?? '',
    };
}

async function pagesToPdf(source, indexes) {
    const target = await PDFDocument.create();
    const pages = await target.copyPages(source, indexes);
    pages.forEach((page) => target.addPage(page));

    return savePdf(target);
}

/**
 * @param {File[]} files exactly one PDF
 * @param {{mode?: string, ranges?: string}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { mode = 'each', ranges = '' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to split.');
    }

    if (!MODES.includes(mode)) {
        throw new ToolError('Choose how you want to split the PDF.');
    }

    const file = files[0];
    const source = await loadPdf(file);
    const count = source.getPageCount();
    const stem = baseName(file.name);

    if (mode === 'each') {
        if (count < 2) {
            throw new ToolError('This PDF has only one page, so there is nothing to split.');
        }

        const output = [];

        for (let index = 0; index < count; index += 1) {
            onProgress(index / count, `Page ${index + 1} of ${count}`);
            output.push({ name: `${stem}-page-${index + 1}.pdf`, blob: await pagesToPdf(source, [index]) });
        }

        return output;
    }

    if (mode === 'extract') {
        const indexes = parsePageRanges(ranges, count);
        onProgress(0.5, 'Extracting pages');

        return [{ name: `${stem}-extracted.pdf`, blob: await pagesToPdf(source, indexes) }];
    }

    const parts = String(ranges).split(',').map((part) => part.trim()).filter((part) => part !== '');

    if (parts.length === 0) {
        throw new ToolError('Enter the pages you want, for example 1-3,5.');
    }

    const output = [];

    for (const [index, part] of parts.entries()) {
        onProgress(index / parts.length, `Range ${part}`);
        const indexes = parsePageRanges(part, count);
        output.push({ name: `${stem}-pages-${part.replace(/\s+/g, '')}.pdf`, blob: await pagesToPdf(source, indexes) });
    }

    return output;
}
