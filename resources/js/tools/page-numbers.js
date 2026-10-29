import { rgb, StandardFonts } from 'pdf-lib';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { visualToPage } from '../core/geometry.js';
import { loadPdf, parsePageRanges, savePdf } from '../core/pdf.js';

export const kinds = ['pdf'];

const POSITIONS = ['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left'];
const FORMATS = {
    number: (n) => `${n}`,
    page: (n) => `Page ${n}`,
    'number-of': (n, total) => `${n} / ${total}`,
    'page-of': (n, total) => `Page ${n} of ${total}`,
};
const SIZES = { small: 9, medium: 12, large: 15 };
const COLORS = { black: [0, 0, 0], gray: [0.4, 0.4, 0.4] };
const MARGIN = 28;

export function init(root) {
    const sync = () => {
        const only = root.querySelector('input[name="scope"]:checked')?.value === 'selected';
        root.querySelector('[data-pages]').hidden = !only;
    };

    root.querySelectorAll('input[name="scope"]').forEach((radio) => radio.addEventListener('change', sync));
    sync();
}

export function readOptions(root) {
    const value = (selector, fallback) => root.querySelector(selector)?.value ?? fallback;

    return {
        position: value('select[name="position"]', 'bottom-center'),
        format: value('select[name="format"]', 'number'),
        size: value('select[name="size"]', 'medium'),
        color: value('select[name="color"]', 'black'),
        start: Number(value('input[name="start"]', 1)),
        scope: root.querySelector('input[name="scope"]:checked')?.value ?? 'all',
        pages: value('input[name="pages"]', ''),
    };
}

/**
 * Adds page numbers. Numbering starts at `start` on the first numbered page,
 * and pages left out of a selection are not counted.
 *
 * @param {File[]} files exactly one PDF
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const {
        position = 'bottom-center', format = 'number', size = 'medium', color = 'black', start = 1, scope = 'all', pages = '',
    } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to number.');
    }

    if (!POSITIONS.includes(position) || !(format in FORMATS) || !(size in SIZES) || !(color in COLORS) || !['all', 'selected'].includes(scope)) {
        throw new ToolError('Choose valid page number options.');
    }

    if (!Number.isInteger(start) || start < 0 || start > 100000) {
        throw new ToolError('The first number must be a whole number from 0 to 100000.');
    }

    const file = files[0];
    const pdf = await loadPdf(file);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const targets = scope === 'all' ? pdf.getPageIndices() : parsePageRanges(pages, pdf.getPageCount());
    const fontSize = SIZES[size];
    const [vertical, horizontal] = position.split('-');

    for (const [step, index] of targets.entries()) {
        onProgress(step / targets.length, `Page ${index + 1}`);

        const page = pdf.getPage(index);
        const box = page.getMediaBox();
        const rotation = ((page.getRotation().angle % 360) + 360) % 360;
        const sideways = rotation === 90 || rotation === 270;
        const visualWidth = sideways ? box.height : box.width;
        const visualHeight = sideways ? box.width : box.height;

        const label = FORMATS[format](start + step, start + targets.length - 1);
        const textWidth = font.widthOfTextAtSize(label, fontSize);
        const vx = { left: MARGIN, center: (visualWidth - textWidth) / 2, right: visualWidth - MARGIN - textWidth }[horizontal];
        const vy = vertical === 'bottom' ? MARGIN : visualHeight - MARGIN - fontSize * 0.72;
        const [px, py] = visualToPage(vx, vy, rotation, box.width, box.height);

        page.drawText(label, {
            x: box.x + px, y: box.y + py, size: fontSize, font, color: rgb(...COLORS[color]), rotate: { type: 'degrees', angle: rotation },
        });
    }

    return [{ name: `${baseName(file.name)}-numbered.pdf`, blob: await savePdf(pdf) }];
}
