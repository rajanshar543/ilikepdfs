import { PDFDocument } from 'pdf-lib';
import { canvasToBlob } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { looksEncrypted, MAX_PDF_PAGES } from '../core/pdf.js';
import { closePdf, openPdf, renderPage } from '../core/pdfjs.js';
import { runQpdf } from '../core/qpdf.js';

export const kinds = ['pdf'];

export function readOptions(root) {
    return { rebuild: root.querySelector('input[name="rebuild"]')?.checked ?? false };
}

/** A repaired file must open and have pages, otherwise the attempt counts as failed. */
async function pageCountIfValid(bytes) {
    try {
        const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
        const count = pdf.getPageCount();

        return count > 0 && count <= MAX_PDF_PAGES ? count : 0;
    } catch {
        return 0;
    }
}

/** Step 1: qpdf re-reads the file, rebuilds the cross-reference table and writes a clean copy. */
async function repairStructure(input) {
    try {
        const output = await runQpdf(input, ['--object-streams=generate', '--recompress-flate']);

        return (await pageCountIfValid(output)) > 0 ? output : null;
    } catch {
        return null;
    }
}

/** Step 2: pdf-lib is more forgiving about broken objects in some files. */
async function repairLenient(input) {
    try {
        const pdf = await PDFDocument.load(input, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
        const output = await pdf.save();

        return (await pageCountIfValid(output)) > 0 ? output : null;
    } catch {
        return null;
    }
}

/** Last resort: draw every page that can still be rendered onto a new PDF as an image. */
async function rebuildFromImages(file, onProgress) {
    const source = await openPdf(file).catch(() => null);

    if (!source) {
        return null;
    }

    const output = await PDFDocument.create();
    let rebuilt = 0;

    try {
        for (let number = 1; number <= source.numPages; number += 1) {
            onProgress((number - 1) / source.numPages, `Rebuilding page ${number} of ${source.numPages}`);

            try {
                const page = await source.getPage(number);
                const { canvas, width, height } = await renderPage(page, 1.6);
                const jpeg = await output.embedJpg(new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.85)).arrayBuffer()));
                output.addPage([width, height]).drawImage(jpeg, { x: 0, y: 0, width, height });
                rebuilt += 1;
            } catch {
                // A page that cannot be drawn is skipped; the rest are still recovered.
            }
        }
    } finally {
        await closePdf(source);
    }

    return rebuilt > 0 ? { bytes: await output.save(), pages: rebuilt, total: source.numPages } : null;
}

/**
 * Tries to recover a damaged PDF, from the gentlest fix to the most drastic.
 *
 * @param {File[]} files exactly one PDF
 * @param {{rebuild?: boolean}} options `rebuild` skips the gentle fixes and redraws the pages as images
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { rebuild = false } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to repair.');
    }

    const file = files[0];
    const input = new Uint8Array(await file.arrayBuffer());
    const name = `${baseName(file.name)}-repaired.pdf`;

    if (looksEncrypted(input)) {
        throw new ToolError(`"${file.name}" is password protected. Unlock it first.`);
    }

    if (!rebuild) {
        onProgress(0.2, 'Repairing the file structure');
        const fixed = await repairStructure(input);

        if (fixed) {
            return [{ name, blob: new Blob([fixed], { type: 'application/pdf' }), note: 'File structure repaired. Text and layout are kept.' }];
        }

        onProgress(0.5, 'Trying another method');
        const lenient = await repairLenient(input);

        if (lenient) {
            return [{ name, blob: new Blob([lenient], { type: 'application/pdf' }), note: 'Damaged objects skipped. Text and layout are kept.' }];
        }
    }

    onProgress(0.6, 'Rebuilding pages');
    const rebuilt = await rebuildFromImages(file, onProgress);

    if (!rebuilt) {
        throw new ToolError(`"${file.name}" is too damaged to recover.`);
    }

    return [{
        name,
        blob: new Blob([rebuilt.bytes], { type: 'application/pdf' }),
        note: `${rebuilt.pages} of ${rebuilt.total} pages rebuilt as images. Text can no longer be selected.`,
    }];
}
