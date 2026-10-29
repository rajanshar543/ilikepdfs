import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { applyItems } from '../core/pdfAnnotate.js';
import { loadPdf, savePdf } from '../core/pdf.js';
import { createAnnotator, mountViewer } from '../core/pageViewer.js';
import { signatureFromCanvas, signatureFromText } from '../core/signature.js';

export const kinds = ['pdf'];
export const thumbs = false;

let viewer = null;
let annotator = null;
let current = [];
let signature = null;

export function readOptions() {
    return { items: current };
}

export function resetSigner() {
    viewer = null;
    annotator = null;
    current = [];
    signature = null;
}

function signatureElement(item) {
    const element = globalThis.document.createElement('div');
    element.className = 'pv-item pv-item--signature';
    const image = globalThis.document.createElement('img');
    image.alt = 'Signature';
    image.src = item.url;
    element.append(image);

    return element;
}

/** Freehand drawing on the signature pad, smoothed with quadratic curves. */
function bindPad(canvas, color) {
    const context = canvas.getContext('2d');
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    let last = null;

    const point = (event) => {
        const bounds = canvas.getBoundingClientRect();

        return [((event.clientX - bounds.left) / bounds.width) * canvas.width, ((event.clientY - bounds.top) / bounds.height) * canvas.height];
    };

    canvas.addEventListener('pointerdown', (event) => {
        canvas.setPointerCapture?.(event.pointerId);
        last = point(event);
        context.strokeStyle = color();
        context.beginPath();
        context.arc(last[0], last[1], 1.2, 0, Math.PI * 2);
        context.fillStyle = color();
        context.fill();
    });
    canvas.addEventListener('pointermove', (event) => {
        if (!last) {
            return;
        }

        const next = point(event);
        context.strokeStyle = color();
        context.beginPath();
        context.moveTo(last[0], last[1]);
        context.lineTo(next[0], next[1]);
        context.stroke();
        last = next;
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => canvas.addEventListener(type, () => { last = null; }));

    return () => context.clearRect(0, 0, canvas.width, canvas.height);
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

    annotator = createAnnotator(viewer, { onChange: (items) => { current = items; }, render: { signature: signatureElement } });

    const status = root.querySelector('[data-sign-status]');
    const color = () => root.querySelector('select[name="inkColor"]')?.value ?? '#111827';

    const use = (made) => {
        signature = { ...made, url: URL.createObjectURL(new Blob([made.bytes], { type: 'image/png' })) };
        status.textContent = 'Now click on the page where the signature should go. You can move and resize it.';
        annotator.setTool({
            kind: 'click',
            create: (page, { x, y }) => {
                const width = Math.min(180, page.width / 2);

                return { type: 'signature', x, y, w: width, h: width * (signature.height / signature.width), bytes: signature.bytes, url: signature.url, keepAspect: true };
            },
        });
    };

    const fail = (error) => {
        status.textContent = error instanceof ToolError ? error.message : 'That did not work. Please try again.';
    };

    const canvas = root.querySelector('[data-sigpad]');
    const clear = canvas ? bindPad(canvas, color) : () => {};

    root.querySelector('[data-sig-clear]')?.addEventListener('click', clear);
    root.querySelector('[data-sig-use-draw]')?.addEventListener('click', () => signatureFromCanvas(canvas).then(use).catch(fail));
    root.querySelector('[data-sig-use-type]')?.addEventListener('click', () => signatureFromText(
        root.querySelector('input[name="typed"]').value,
        root.querySelector('select[name="typedStyle"]').value,
        color(),
    ).then(use).catch(fail));
    root.querySelector('[data-undo]')?.addEventListener('click', () => annotator.undo());
}

/**
 * Places signature pictures on the pages. This is a visible signature (a
 * picture of your signature), not a cryptographic digital certificate.
 *
 * @param {File[]} files exactly one PDF
 * @param {{items: object[]}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { items = [] } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to sign.');
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new ToolError('Create your signature and click on the page to place it first.');
    }

    if (items.some((item) => item.type !== 'signature')) {
        throw new ToolError('Only signatures can be placed here.');
    }

    const file = files[0];
    const pdf = await loadPdf(file);
    onProgress(0.5, 'Placing your signature');
    await applyItems(pdf, items);

    return [{ name: `${baseName(file.name)}-signed.pdf`, blob: await savePdf(pdf), note: 'Visible signature added' }];
}
