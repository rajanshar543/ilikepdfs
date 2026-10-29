import { PDFDocument, PDFArray, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { canvasToBlob, decodeImage, drawToCanvas, releaseImage } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { formatBytes } from '../core/files.js';
import { loadPdf } from '../core/pdf.js';
import { closePdf, openPdf, renderPage } from '../core/pdfjs.js';
import { optimizeStructure } from '../core/qpdf.js';

export const kinds = ['pdf'];

const LEVELS = {
    low: { images: false },
    recommended: { images: true, quality: 0.7, maxSide: 1600 },
    extreme: { rasterize: true, quality: 0.55, scale: 1.4 },
};

export function readOptions(root) {
    return { level: root.querySelector('input[name="level"]:checked')?.value ?? 'recommended' };
}

const name = (value) => PDFName.of(value);

/** Names of the filters on a stream, as plain strings. */
function filtersOf(dict) {
    const filter = dict.get(name('Filter'));

    if (filter instanceof PDFArray) {
        return filter.asArray().map((item) => item.toString());
    }

    return filter ? [filter.toString()] : [];
}

/**
 * Re-encodes the JPEG photos inside a PDF at lower quality and, if needed,
 * lower resolution. Text and vector graphics are left untouched.
 */
async function recompressImages(pdf, { quality, maxSide }, onProgress) {
    const context = pdf.context;
    const candidates = [];

    for (const [ref, object] of context.enumerateIndirectObjects()) {
        if (!(object instanceof PDFRawStream)) {
            continue;
        }

        const { dict } = object;
        const isImage = dict.get(name('Subtype'))?.toString() === '/Image';
        const filters = filtersOf(dict);
        const colorSpace = dict.get(name('ColorSpace'))?.toString();

        if (!isImage || filters.length !== 1 || filters[0] !== '/DCTDecode') {
            continue;
        }

        // Stencil masks and CMYK photos keep their exact encoding.
        if (dict.has(name('ImageMask')) || dict.has(name('Mask')) || dict.has(name('Decode')) || colorSpace === '/DeviceCMYK') {
            continue;
        }

        candidates.push([ref, object]);
    }

    for (const [index, [ref, object]] of candidates.entries()) {
        onProgress(0.1 + (0.6 * index) / candidates.length, `Compressing image ${index + 1} of ${candidates.length}`);

        const original = object.contents;
        let image;

        try {
            image = await decodeImage(new Blob([original], { type: 'image/jpeg' }));
            const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
            const canvas = drawToCanvas(image, {
                width: Math.max(1, Math.round(image.width * ratio)),
                height: Math.max(1, Math.round(image.height * ratio)),
                background: '#ffffff',
            });
            const smaller = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', quality)).arrayBuffer());

            if (smaller.length >= original.length * 0.95) {
                continue;
            }

            const dict = context.obj({
                Type: 'XObject',
                Subtype: 'Image',
                Width: PDFNumber.of(canvas.width),
                Height: PDFNumber.of(canvas.height),
                ColorSpace: 'DeviceRGB',
                BitsPerComponent: 8,
                Filter: 'DCTDecode',
                Length: PDFNumber.of(smaller.length),
            });

            for (const key of ['SMask', 'Intent', 'Interpolate']) {
                const value = object.dict.get(name(key));

                if (value) {
                    dict.set(name(key), value);
                }
            }

            context.assign(ref, PDFRawStream.of(dict, smaller));
        } catch {
            // An image we cannot decode is simply kept as it is.
        } finally {
            releaseImage(image);
        }
    }
}

/** Replaces every page by a JPEG snapshot of it: smallest result, no selectable text. */
async function rasterize(file, { quality, scale }, onProgress) {
    const source = await openPdf(file);
    const output = await PDFDocument.create();

    try {
        for (let number = 1; number <= source.numPages; number += 1) {
            onProgress((number - 1) / source.numPages, `Page ${number} of ${source.numPages}`);

            const page = await source.getPage(number);
            const { canvas, width, height } = await renderPage(page, scale);
            const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
            const image = await output.embedJpg(new Uint8Array(await blob.arrayBuffer()));
            output.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
            page.cleanup();
        }
    } finally {
        await closePdf(source);
    }

    return new Uint8Array(await output.save());
}

/**
 * Compresses one PDF with explicit settings and returns the optimised bytes.
 *
 * @param {File} file
 * @param {{images?: boolean, quality?: number, maxSide?: number, rasterize?: boolean, scale?: number}} settings
 * @returns {Promise<Uint8Array>}
 */
export async function compressBytes(file, settings, onProgress = () => {}) {
    let bytes;

    if (settings.rasterize) {
        bytes = await rasterize(file, settings, onProgress);
    } else {
        const pdf = await loadPdf(file);

        if (settings.images) {
            await recompressImages(pdf, settings, onProgress);
        }

        bytes = new Uint8Array(await pdf.save({ useObjectStreams: false }));
    }

    return optimizeStructure(bytes);
}

/**
 * @param {File[]} files exactly one PDF
 * @param {{level?: 'low'|'recommended'|'extreme'}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { level = 'recommended' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to compress.');
    }

    if (!(level in LEVELS)) {
        throw new ToolError('Choose a compression level.');
    }

    const file = files[0];
    const settings = LEVELS[level];

    const optimized = await compressBytes(file, settings, onProgress);
    const original = file.size;

    if (optimized.length >= original) {
        return [{
            name: file.name,
            blob: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }),
            note: 'Already well optimised. File kept as it was.',
        }];
    }

    const saved = Math.round((1 - optimized.length / original) * 100);

    return [{
        name: compressedName(file.name),
        blob: new Blob([optimized], { type: 'application/pdf' }),
        note: `${saved}% smaller (was ${formatBytes(original)})`,
    }];
}

function compressedName(original) {
    const stem = original.replace(/\.pdf$/i, '').split(/[\\/]/).pop();

    return `${stem || 'document'}-compressed.pdf`;
}
