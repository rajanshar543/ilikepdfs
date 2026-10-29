import { degrees, PDFDocument } from 'pdf-lib';
import { ToolError } from '../core/errors.js';
import { loadPdf, MAX_PDF_PAGES, savePdf } from '../core/pdf.js';
import { openPdf, renderPage } from '../core/pdfjs.js';

export const kinds = ['pdf'];
export const thumbs = false;

const MAX_THUMBNAILS = 400;

/** Arrangement the visitor made, kept between renders: File -> [{page, rotate, removed}]. */
let arrangement = [];
let renderToken = 0;

export function readOptions() {
    return {
        pages: arrangement.filter((entry) => !entry.removed).map((entry) => ({ file: entry.fileIndex, page: entry.page, rotate: entry.rotate })),
    };
}

/** Test helper: drop the remembered arrangement. */
export function resetArrangement() {
    arrangement = [];
}

async function thumbnail(file, pageNumber, doc) {
    const page = await doc.getPage(pageNumber);
    const { canvas } = await renderPage(page, 0.35);
    page.cleanup();
    canvas.className = 'org-thumb';

    return canvas;
}

/**
 * Called whenever the list of files changes: builds one card per page of every
 * file, keeping the order and edits of files that were already there.
 */
export async function onFilesChanged(root, files) {
    const container = root.querySelector('[data-organizer]');
    const token = (renderToken += 1);

    if (!container) {
        return;
    }

    const previous = arrangement;
    const known = new Map();

    previous.forEach((entry) => {
        if (!known.has(entry.file)) {
            known.set(entry.file, []);
        }
    });

    arrangement = [];
    const docs = new Map();

    try {
        for (const [fileIndex, file] of files.entries()) {
            const doc = await openPdf(file);
            docs.set(file, doc);
            const existing = previous.filter((entry) => entry.file === file);

            if (existing.length > 0) {
                existing.forEach((entry) => arrangement.push({ ...entry, fileIndex }));
            } else {
                for (let page = 0; page < doc.numPages; page += 1) {
                    arrangement.push({ file, fileIndex, page, rotate: 0, removed: false, id: `${fileIndex}-${page}-${Math.random()}` });
                }
            }

            if (arrangement.length > MAX_PDF_PAGES) {
                throw new ToolError(`The files together have more than ${MAX_PDF_PAGES} pages.`);
            }
        }

        if (token !== renderToken) {
            return;
        }

        render(container, docs);
    } catch (error) {
        container.textContent = error instanceof ToolError ? error.message : 'These pages could not be shown.';
    }
}

function render(container, docs) {
    container.replaceChildren();
    const grid = document.createElement('div');
    grid.className = 'org-grid';
    let dragged = null;

    const redraw = () => render(container, docs);
    const move = (from, to) => {
        const [item] = arrangement.splice(from, 1);
        arrangement.splice(to, 0, item);
        redraw();
    };

    arrangement.forEach((entry, position) => {
        const card = document.createElement('div');
        card.className = `org-card${entry.removed ? ' is-removed' : ''}`;
        card.draggable = true;
        card.dataset.position = String(position);

        const holder = document.createElement('div');
        holder.className = 'org-holder';
        holder.style.transform = `rotate(${entry.rotate}deg)`;

        if (position < MAX_THUMBNAILS) {
            thumbnail(entry.file, entry.page + 1, docs.get(entry.file)).then((canvas) => holder.append(canvas)).catch(() => {});
        }

        const label = document.createElement('span');
        label.className = 'org-label';
        label.textContent = `${position + 1}`;

        const actions = document.createElement('div');
        actions.className = 'org-actions';

        const button = (text, title, handler, disabled = false) => {
            const element = document.createElement('button');
            element.type = 'button';
            element.textContent = text;
            element.title = title;
            element.setAttribute('aria-label', title);
            element.disabled = disabled;
            element.addEventListener('click', handler);
            actions.append(element);
        };

        button('◀', 'Move earlier', () => move(position, position - 1), position === 0);
        button('↻', 'Rotate', () => { entry.rotate = (entry.rotate + 90) % 360; redraw(); });
        button(entry.removed ? '↩' : '✕', entry.removed ? 'Keep this page' : 'Remove this page', () => { entry.removed = !entry.removed; redraw(); });
        button('▶', 'Move later', () => move(position, position + 1), position === arrangement.length - 1);

        card.addEventListener('dragstart', (event) => {
            dragged = position;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(position));
        });
        card.addEventListener('dragover', (event) => event.preventDefault());
        card.addEventListener('drop', (event) => {
            event.preventDefault();

            if (dragged !== null && dragged !== position) {
                move(dragged, position);
            }

            dragged = null;
        });

        card.append(holder, label, actions);
        grid.append(card);
    });

    container.append(grid);
}

/**
 * Builds the new PDF from the arrangement: pages in the chosen order, with the
 * chosen rotations, from one or several source files.
 *
 * @param {File[]} files
 * @param {{pages: {file: number, page: number, rotate: number}[]}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { pages = null } = options;

    if (files.length === 0) {
        throw new ToolError('Add at least one PDF file.');
    }

    // Without an arrangement (for instance when called directly) every page is kept, in order.
    const plan = pages ?? (await Promise.all(files.map(async (file, fileIndex) => {
        const count = (await loadPdf(file)).getPageCount();

        return Array.from({ length: count }, (_, page) => ({ file: fileIndex, page, rotate: 0 }));
    }))).flat();

    if (!Array.isArray(plan) || plan.length === 0) {
        throw new ToolError('Keep at least one page.');
    }

    if (plan.length > MAX_PDF_PAGES) {
        throw new ToolError(`The result would have more than ${MAX_PDF_PAGES} pages.`);
    }

    const sources = new Map();
    const output = await PDFDocument.create();

    for (const [step, item] of plan.entries()) {
        onProgress(step / plan.length, `Page ${step + 1} of ${plan.length}`);

        if (!Number.isInteger(item.file) || !Number.isInteger(item.page) || !files[item.file] || ![0, 90, 180, 270].includes(item.rotate)) {
            throw new ToolError('The page arrangement is not valid.');
        }

        if (!sources.has(item.file)) {
            sources.set(item.file, await loadPdf(files[item.file]));
        }

        const source = sources.get(item.file);

        if (item.page < 0 || item.page >= source.getPageCount()) {
            throw new ToolError('The page arrangement is not valid.');
        }

        const [page] = await output.copyPages(source, [item.page]);
        const current = ((page.getRotation().angle % 360) + 360) % 360;
        page.setRotation(degrees((current + item.rotate) % 360));
        output.addPage(page);
    }

    return [{ name: 'organized.pdf', blob: await savePdf(output), note: `${plan.length} page${plan.length === 1 ? '' : 's'}` }];
}

