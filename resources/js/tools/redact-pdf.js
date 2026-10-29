import { PDFDocument } from 'pdf-lib';
import { canvasToBlob } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { createAnnotator, mountViewer } from '../core/pageViewer.js';
import { loadPdf } from '../core/pdf.js';
import { closePdf, openPdf, renderPage } from '../core/pdfjs.js';
import { extractPages } from '../core/pdfText.js';

export const kinds = ['pdf'];
export const thumbs = false;

const SCALE = 2.2;
const MAX_TERMS = 50;

let viewer = null;
let annotator = null;
let current = [];

export function readOptions(root) {
    return { items: current, terms: root.querySelector('textarea[name="terms"]')?.value ?? '' };
}

export function resetRedactor() {
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
    annotator.setTool({ kind: 'drag', create: (page, { x, y, w, h }) => ({ type: 'redact', x, y, w, h }) });
    root.querySelector('[data-undo]')?.addEventListener('click', () => annotator.undo());
}

export function parseTerms(text) {
    const terms = [...new Set(String(text).split(/[\n,;]+/).map((term) => term.trim()).filter((term) => term.length > 0))];

    if (terms.length > MAX_TERMS) {
        throw new ToolError(`Use at most ${MAX_TERMS} search words.`);
    }

    if (terms.some((term) => term.length > 100)) {
        throw new ToolError('Search words can have at most 100 characters.');
    }

    return terms;
}

/** Finds each term in the text of every page and returns black boxes (displayed points) over the matches. */
export function boxesForTerms(pages, terms) {
    const boxes = [];
    const hits = new Map(terms.map((term) => [term, 0]));

    for (const page of pages) {
        for (const item of page.items) {
            const lower = item.str.toLowerCase();

            for (const term of terms) {
                let from = 0;
                const needle = term.toLowerCase();

                while ((from = lower.indexOf(needle, from)) !== -1) {
                    const share = item.w / item.str.length;
                    boxes.push({
                        page: page.number - 1,
                        x: item.x + share * from - 1,
                        y: item.y - item.size * 0.95,
                        w: share * needle.length + 2,
                        h: item.size * 1.25,
                    });
                    hits.set(term, hits.get(term) + 1);
                    from += needle.length;
                }
            }
        }
    }

    return { boxes, hits };
}

/**
 * Redraws every page that has a box as a picture with the boxes painted black,
 * and copies the other pages unchanged.
 *
 * @param {File} file
 * @param {{page: number, x: number, y: number, w: number, h: number}[]} boxes displayed points, top-left origin
 * @returns {Promise<{bytes: Uint8Array, pages: number}>}
 */
export async function applyRedactions(file, boxes, onProgress = () => {}) {
    const source = await loadPdf(file);
    const pageCount = source.getPageCount();
    const redacted = new Set(boxes.map((box) => box.page));
    const viewing = await openPdf(file);
    const output = await PDFDocument.create();

    try {
        for (let index = 0; index < pageCount; index += 1) {
            onProgress(0.1 + (index / pageCount) * 0.85, `Page ${index + 1} of ${pageCount}`);

            if (!redacted.has(index)) {
                const [copy] = await output.copyPages(source, [index]);
                output.addPage(copy);
                continue;
            }

            const page = await viewing.getPage(index + 1);
            const { canvas, width, height } = await renderPage(page, SCALE);
            const context = canvas.getContext('2d');
            const ratio = canvas.width / width;
            context.fillStyle = '#000000';

            boxes.filter((box) => box.page === index).forEach((box) => context.fillRect(box.x * ratio, box.y * ratio, box.w * ratio, box.h * ratio));

            const jpeg = await output.embedJpg(new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.9)).arrayBuffer()));
            output.addPage([width, height]).drawImage(jpeg, { x: 0, y: 0, width, height });
            page.cleanup();
        }
    } finally {
        await closePdf(viewing);
    }

    return { bytes: await output.save(), pages: redacted.size };
}

/**
 * Permanently removes content. Every page that has a redaction is redrawn as
 * a picture with the areas painted black, so the covered text and graphics are
 * gone from the file. Other pages are copied unchanged.
 *
 * @param {File[]} files exactly one PDF
 * @param {{items: {page: number, x: number, y: number, w: number, h: number}[], terms?: string}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { items = [], terms = '' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to redact.');
    }

    const file = files[0];
    const words = parseTerms(terms);
    const source = await loadPdf(file);
    const pageCount = source.getPageCount();

    for (const item of items) {
        if (item?.type !== 'redact' || !Number.isInteger(item.page) || item.page < 0 || item.page >= pageCount || ![item.x, item.y, item.w, item.h].every(Number.isFinite) || item.w <= 0 || item.h <= 0) {
            throw new ToolError('One of the redaction areas is not valid.');
        }
    }

    let found = { boxes: [], hits: new Map() };

    if (words.length > 0) {
        onProgress(0.05, 'Searching for your words');
        found = boxesForTerms(await extractPages(file), words);
    }

    const boxes = [...items, ...found.boxes];

    if (boxes.length === 0) {
        throw new ToolError(words.length > 0
            ? 'None of your search words were found, and no area was drawn.'
            : 'Draw over the content you want to remove first, or enter words to search for.');
    }

    const { bytes, pages: redactedPages } = await applyRedactions(file, boxes, onProgress);

    const notes = [`${redactedPages} page${redactedPages === 1 ? '' : 's'} redacted and flattened`];
    const missing = [...found.hits].filter(([, count]) => count === 0).map(([term]) => `"${term}"`);

    if (found.boxes.length > 0) {
        notes.push(`${found.boxes.length} match${found.boxes.length === 1 ? '' : 'es'} found by search`);
    }

    if (missing.length > 0) {
        notes.push(`not found: ${missing.join(', ')}`);
    }

    return [{ name: `${baseName(file.name)}-redacted.pdf`, blob: new Blob([bytes], { type: 'application/pdf' }), note: notes.join('. ') }];
}
