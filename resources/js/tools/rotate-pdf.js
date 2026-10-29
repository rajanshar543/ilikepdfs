import { degrees } from 'pdf-lib';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { loadPdf, parsePageRanges, savePdf } from '../core/pdf.js';

export const kinds = ['pdf'];

const ANGLES = [90, 180, 270];

export function init(root) {
    const sync = () => {
        const only = root.querySelector('input[name="scope"]:checked')?.value === 'selected';
        root.querySelector('[data-pages]').hidden = !only;
    };

    root.querySelectorAll('input[name="scope"]').forEach((radio) => radio.addEventListener('change', sync));
    sync();
}

export function readOptions(root) {
    return {
        angle: Number(root.querySelector('select[name="angle"]')?.value ?? 90),
        scope: root.querySelector('input[name="scope"]:checked')?.value ?? 'all',
        pages: root.querySelector('input[name="pages"]')?.value ?? '',
    };
}

/**
 * Rotates pages clockwise. The rotation is stored in the page, so it adds to
 * any rotation the page already has.
 *
 * @param {File[]} files exactly one PDF
 * @param {{angle?: 90|180|270, scope?: 'all'|'selected', pages?: string}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { angle = 90, scope = 'all', pages = '' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to rotate.');
    }

    if (!ANGLES.includes(angle)) {
        throw new ToolError('Choose how far to rotate: 90, 180 or 270 degrees.');
    }

    if (!['all', 'selected'].includes(scope)) {
        throw new ToolError('Choose which pages to rotate.');
    }

    const file = files[0];
    const pdf = await loadPdf(file);
    const targets = scope === 'all' ? pdf.getPageIndices() : parsePageRanges(pages, pdf.getPageCount());

    onProgress(0.5, 'Rotating pages');

    for (const index of targets) {
        const page = pdf.getPage(index);
        const current = ((page.getRotation().angle % 360) + 360) % 360;
        page.setRotation(degrees((current + angle) % 360));
    }

    return [{ name: `${baseName(file.name)}-rotated.pdf`, blob: await savePdf(pdf) }];
}
