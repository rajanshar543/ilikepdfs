import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { createAnnotator, mountViewer } from '../core/pageViewer.js';
import { pageInfo, rectToPage } from '../core/pdfAnnotate.js';
import { loadPdf, savePdf } from '../core/pdf.js';

export const kinds = ['pdf'];
export const thumbs = false;

const MIN_SIDE = 10;

let viewer = null;
let annotator = null;
let current = [];

export function readOptions(root) {
    return { items: current, scope: root.querySelector('input[name="scope"]:checked')?.value ?? 'drawn' };
}

export function resetCropper() {
    viewer = null;
    annotator = null;
    current = [];
}

export async function onFilesChanged(root, files) {
    const holder = root.querySelector('[data-viewer]');

    annotator?.destroy();
    viewer?.destroy();
    viewer = null;
    annotator = null;
    current = [];

    if (!holder || files.length === 0) {
        return;
    }

    try {
        viewer = await mountViewer(holder, files[0]);
    } catch (error) {
        holder.textContent = error instanceof ToolError ? error.message : 'This PDF could not be shown.';

        return;
    }

    annotator = createAnnotator(viewer, { onChange: (items) => { current = items; } });
    // One crop area per page: drawing a new one replaces the old one.
    annotator.setTool({
        kind: 'drag',
        create: (page, { x, y, w, h }) => {
            annotator.list().filter((item) => item.page === page.index).forEach((item) => annotator.remove(item.id));

            return { type: 'crop', x, y, w, h };
        },
    });
    root.querySelector('[data-undo]')?.addEventListener('click', () => annotator.undo());
}

/**
 * Crops pages by setting their visible area. The cut-off content stays in the
 * file but is no longer shown; use Redact PDF to remove content for good.
 *
 * @param {File[]} files exactly one PDF
 * @param {{items: {type: 'crop', page: number, x: number, y: number, w: number, h: number}[], scope?: 'drawn'|'all'}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { items = [], scope = 'drawn' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to crop.');
    }

    if (!['drawn', 'all'].includes(scope)) {
        throw new ToolError('Choose which pages to crop.');
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new ToolError('Draw the area you want to keep on a page first.');
    }

    const file = files[0];
    const pdf = await loadPdf(file);
    const pages = pdf.getPages();

    for (const item of items) {
        if (item?.type !== 'crop' || !Number.isInteger(item.page) || item.page < 0 || item.page >= pages.length
            || ![item.x, item.y, item.w, item.h].every(Number.isFinite) || item.w < MIN_SIDE || item.h < MIN_SIDE || item.x < 0 || item.y < 0) {
            throw new ToolError('The crop area is not valid.');
        }
    }

    // "All pages" reuses the first area as fractions of the page, so pages of other sizes are cropped the same way.
    const first = items[0];
    const firstInfo = pageInfo(pages[first.page]);
    const fraction = { x: first.x / firstInfo.width, y: first.y / firstInfo.height, w: first.w / firstInfo.width, h: first.h / firstInfo.height };
    const targets = scope === 'all'
        ? pages.map((_, index) => ({ page: index, fraction }))
        : items.map((item) => {
            const info = pageInfo(pages[item.page]);

            return { page: item.page, fraction: { x: item.x / info.width, y: item.y / info.height, w: item.w / info.width, h: item.h / info.height } };
        });

    targets.forEach(({ page: index, fraction: part }, step) => {
        onProgress(step / targets.length, `Page ${index + 1}`);

        const page = pages[index];
        const info = pageInfo(page);
        const x = Math.min(Math.max(0, part.x * info.width), info.width - MIN_SIDE);
        const y = Math.min(Math.max(0, part.y * info.height), info.height - MIN_SIDE);
        const w = Math.min(part.w * info.width, info.width - x);
        const h = Math.min(part.h * info.height, info.height - y);
        const rect = rectToPage(info, x, y, w, h);

        page.setCropBox(rect.x, rect.y, rect.width, rect.height);
        page.setMediaBox(rect.x, rect.y, rect.width, rect.height);
        page.setTrimBox(rect.x, rect.y, rect.width, rect.height);
        page.setBleedBox(rect.x, rect.y, rect.width, rect.height);
        page.setArtBox(rect.x, rect.y, rect.width, rect.height);
    });

    return [{ name: `${baseName(file.name)}-cropped.pdf`, blob: await savePdf(pdf), note: `${targets.length} page${targets.length === 1 ? '' : 's'} cropped` }];
}
