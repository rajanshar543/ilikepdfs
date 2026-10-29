import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { ToolError } from './errors.js';
import { assertPixelBudget } from './files.js';
import { MAX_PDF_PAGES } from './pdf.js';
import { createCanvas } from './canvas.js';

let assetBase = '/vendor/pdfjs/';
let libraryPromise = null;

/** Tests point pdf.js at its files on disk instead of the web path. */
export function setPdfjsAssetBase(base) {
    assetBase = base;
}

function loadLibrary() {
    libraryPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((library) => {
        if (typeof window !== 'undefined') {
            library.GlobalWorkerOptions.workerSrc = workerUrl;
        }

        return library;
    });

    return libraryPromise;
}

/**
 * Opens a PDF for rendering. Scripts are never run and nothing is fetched
 * from outside this site.
 *
 * @param {File|Blob} file
 */
export async function openPdf(file) {
    const library = await loadLibrary();
    const data = new Uint8Array(await file.arrayBuffer());

    const task = library.getDocument({
        data,
        isEvalSupported: false,
        enableXfa: false,
        cMapUrl: `${assetBase}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assetBase}standard_fonts/`,
        wasmUrl: `${assetBase}wasm/`,
        iccUrl: `${assetBase}iccs/`,
    });

    try {
        const document = await task.promise;

        if (document.numPages > MAX_PDF_PAGES) {
            await closePdf(document);
            throw new ToolError(`"${file.name}" has more than ${MAX_PDF_PAGES} pages.`);
        }

        return document;
    } catch (error) {
        if (error instanceof ToolError) {
            throw error;
        }

        if (error?.name === 'PasswordException') {
            throw new ToolError(`"${file.name}" is password protected. Unlock it first.`);
        }

        throw new ToolError(`"${file.name}" could not be read. The file may be damaged.`);
    }
}

/** Frees the worker and memory held by an opened document. */
export async function closePdf(document) {
    await document.loadingTask.destroy();
}

/**
 * Renders a page to a canvas. `scale` is the zoom relative to 72 dpi; it is
 * lowered automatically when the page would be too large to hold in memory.
 */
export async function renderPage(page, scale, background = '#ffffff') {
    const base = page.getViewport({ scale: 1 });
    const limit = Math.sqrt(40_000_000 / (base.width * base.height));
    const viewport = page.getViewport({ scale: Math.min(scale, limit) });

    assertPixelBudget(Math.ceil(viewport.width), Math.ceil(viewport.height));

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    return { canvas, width: base.width, height: base.height };
}
