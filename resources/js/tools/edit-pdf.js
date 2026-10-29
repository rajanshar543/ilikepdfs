import { ToolError } from '../core/errors.js';
import { baseName, checkFileKind } from '../core/files.js';
import { applyItems } from '../core/pdfAnnotate.js';
import { loadPdf, savePdf } from '../core/pdf.js';
import { createAnnotator, mountViewer } from '../core/pageViewer.js';

export const kinds = ['pdf'];
export const thumbs = false;

let viewer = null;
let annotator = null;
let current = [];
let pendingImage = null;

export function readOptions() {
    return { items: current };
}

/** Test helper. */
export function resetEditor() {
    viewer = null;
    annotator = null;
    current = [];
    pendingImage = null;
}

function read(root) {
    const value = (selector, fallback) => root.querySelector(selector)?.value ?? fallback;

    return { color: value('input[name="color"]', '#dd3333'), size: Number(value('select[name="size"]', 16)), stroke: Number(value('select[name="stroke"]', 2)) };
}

const TOOLS = {
    text: (root) => ({ kind: 'click', create: (page, { x, y }) => ({ type: 'text', x, y, text: 'Text', ...pick(read(root), ['color', 'size']), editing: true }) }),
    rect: (root) => ({ kind: 'drag', create: (page, g) => ({ type: 'rect', x: g.x, y: g.y, w: g.w, h: g.h, ...pick(read(root), ['color', 'stroke']) }) }),
    ellipse: (root) => ({ kind: 'drag', create: (page, g) => ({ type: 'ellipse', x: g.x, y: g.y, w: g.w, h: g.h, ...pick(read(root), ['color', 'stroke']) }) }),
    line: (root) => ({ kind: 'drag', create: (page, g) => ({ type: 'line', x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, ...pick(read(root), ['color', 'stroke']) }) }),
    ink: (root) => ({ kind: 'freehand', create: (page, { points }) => ({ type: 'ink', points: simplify(points), ...pick(read(root), ['color', 'stroke']) }) }),
    image: () => ({
        kind: 'click',
        create: (page, { x, y }) => {
            if (!pendingImage) {
                return null;
            }

            const width = Math.min(200, page.width / 2);

            return { type: 'image', x, y, w: width, h: width * (pendingImage.height / pendingImage.width), bytes: pendingImage.bytes, url: pendingImage.url, keepAspect: true };
        },
    }),
};

function pick(source, keys) {
    return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

/** Drops points that are very close to the previous one, to keep drawings small. */
function simplify(points) {
    const kept = [points[0]];

    for (const point of points.slice(1)) {
        const last = kept[kept.length - 1];

        if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 1.5) {
            kept.push(point);
        }
    }

    return kept;
}

function textElement(item, page) {
    const element = globalThis.document.createElement('div');
    element.className = 'pv-item pv-item--text';
    element.style.left = `${item.x * page.scale}px`;
    element.style.top = `${item.y * page.scale}px`;
    element.style.fontSize = `${item.size * page.scale}px`;
    element.style.color = item.color;
    element.textContent = item.text;
    element.addEventListener('dblclick', () => {
        element.contentEditable = 'true';
        element.focus();
    });
    element.addEventListener('blur', () => {
        element.contentEditable = 'false';
        annotator.update(item.id, { text: element.textContent.slice(0, 2000) });
    });

    if (item.editing) {
        queueMicrotask(() => {
            element.contentEditable = 'true';
            element.focus();
            globalThis.getSelection?.().selectAllChildren(element);
            item.editing = false;
        });
    }

    return element;
}

function imageElement(item) {
    const element = globalThis.document.createElement('div');
    element.className = 'pv-item pv-item--image';
    const image = globalThis.document.createElement('img');
    image.alt = '';
    image.src = item.url;
    element.append(image);

    return element;
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

    annotator = createAnnotator(viewer, {
        onChange: (items) => { current = items; },
        render: { text: textElement, image: imageElement },
    });

    const buttons = [...root.querySelectorAll('[data-tool-button]')];
    const choose = (name) => {
        buttons.forEach((button) => button.classList.toggle('is-active', button.dataset.toolButton === name));
        annotator.setTool(name ? TOOLS[name](root) : null);
    };

    buttons.forEach((button) => button.addEventListener('click', () => choose(button.classList.contains('is-active') ? null : button.dataset.toolButton)));
    root.querySelector('[data-undo]')?.addEventListener('click', () => annotator.undo());

    const picker = root.querySelector('[data-image-input]');
    picker?.addEventListener('change', async () => {
        const file = picker.files[0];
        picker.value = '';

        if (!file) {
            return;
        }

        try {
            const kind = await checkFileKind(file, ['png', 'jpeg']);
            const bytes = new Uint8Array(await file.arrayBuffer());
            const bitmap = await createImageBitmap(new Blob([bytes], { type: kind === 'png' ? 'image/png' : 'image/jpeg' }));
            pendingImage = { bytes, width: bitmap.width, height: bitmap.height, url: URL.createObjectURL(new Blob([bytes], { type: kind === 'png' ? 'image/png' : 'image/jpeg' })) };
            bitmap.close();
            choose('image');
        } catch {
            root.querySelector('[data-error]').textContent = 'Choose a PNG or JPG picture.';
            root.querySelector('[data-error]').hidden = false;
        }
    });
}

/**
 * Burns text, shapes, drawings and pictures into the PDF.
 *
 * @param {File[]} files exactly one PDF
 * @param {{items: object[]}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { items = [] } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to edit.');
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new ToolError('Add some text, a shape or a drawing to the page first.');
    }

    const file = files[0];
    const pdf = await loadPdf(file);
    onProgress(0.5, 'Adding your changes');
    await applyItems(pdf, items);

    return [{ name: `${baseName(file.name)}-edited.pdf`, blob: await savePdf(pdf), note: `${items.length} addition${items.length === 1 ? '' : 's'} saved into the PDF` }];
}
