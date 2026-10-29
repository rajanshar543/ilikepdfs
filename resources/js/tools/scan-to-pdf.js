import { PDFDocument } from 'pdf-lib';
import { canvasToBlob, decodeImage, drawToCanvas, releaseImage } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { checkFileKind } from '../core/files.js';
import { adaptiveBlackWhite, autoLevels, toGray } from '../core/scanFilters.js';

export const kinds = ['jpeg', 'png', 'webp'];
export const thumbs = true;

const MODES = ['color', 'gray', 'bw', 'original'];
const SIZES = { a4: [595.28, 841.89], letter: [612, 792], fit: null };
const MAX_SIDE = 2400;

export function readOptions(root) {
    return {
        mode: root.querySelector('select[name="mode"]')?.value ?? 'color',
        pageSize: root.querySelector('select[name="pageSize"]')?.value ?? 'a4',
    };
}

/** Cleans one photographed page and returns it as JPEG bytes. */
async function enhance(file, mode) {
    const image = await decodeImage(file, file.name);

    try {
        const ratio = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
        const canvas = drawToCanvas(image, {
            width: Math.max(1, Math.round(image.width * ratio)),
            height: Math.max(1, Math.round(image.height * ratio)),
            background: '#ffffff',
        });

        if (mode !== 'original') {
            const context = canvas.getContext('2d');
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);

            if (mode === 'bw') {
                adaptiveBlackWhite(pixels.data, canvas.width, canvas.height);
            } else {
                autoLevels(pixels.data);

                if (mode === 'gray') {
                    toGray(pixels.data);
                }
            }

            context.putImageData(pixels, 0, 0);
        }

        return {
            bytes: new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', mode === 'bw' ? 0.7 : 0.85)).arrayBuffer()),
            width: canvas.width,
            height: canvas.height,
        };
    } finally {
        releaseImage(image);
    }
}

/**
 * Turns photos of documents into a clean PDF: brightness is evened out and
 * pages can be made grey or black and white, one PDF page per photo.
 *
 * @param {File[]} files
 * @param {{mode?: 'color'|'gray'|'bw'|'original', pageSize?: 'a4'|'letter'|'fit'}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { mode = 'color', pageSize = 'a4' } = options;

    if (files.length === 0) {
        throw new ToolError('Add at least one photo.');
    }

    if (!MODES.includes(mode) || !(pageSize in SIZES)) {
        throw new ToolError('Choose valid scan options.');
    }

    const pdf = await PDFDocument.create();

    for (const [index, file] of files.entries()) {
        onProgress(index / files.length, `Cleaning ${file.name}`);
        await checkFileKind(file, kinds);

        const scan = await enhance(file, mode);
        const image = await pdf.embedJpg(scan.bytes);
        let [pageWidth, pageHeight] = SIZES[pageSize] ?? [scan.width * 0.75, scan.height * 0.75];

        if (SIZES[pageSize] && scan.width > scan.height) {
            [pageWidth, pageHeight] = [pageHeight, pageWidth];
        }

        const margin = pageSize === 'fit' ? 0 : 18;
        const fit = Math.min((pageWidth - margin * 2) / scan.width, (pageHeight - margin * 2) / scan.height);
        const width = scan.width * fit;
        const height = scan.height * fit;

        pdf.addPage([pageWidth, pageHeight]).drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
    }

    onProgress(0.95, 'Saving');

    return [{ name: 'scan.pdf', blob: new Blob([await pdf.save()], { type: 'application/pdf' }) }];
}
