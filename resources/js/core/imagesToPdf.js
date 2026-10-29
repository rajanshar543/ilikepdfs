import { PDFDocument } from 'pdf-lib';
import { canvasToBlob, decodeImage, drawToCanvas, releaseImage } from './canvas.js';
import { ToolError } from './errors.js';
import { jpegOrientation } from './exif.js';

const PAGE_SIZES = {
    a4: [595.28, 841.89],
    letter: [612, 792],
};

const MARGINS = { none: 0, small: 20, big: 40 };

export function readImagePdfOptions(root) {
    const value = (selector, fallback) => root.querySelector(selector)?.value ?? fallback;

    return {
        pageSize: value('select[name="pageSize"]', 'fit'),
        orientation: value('select[name="orientation"]', 'auto'),
        margin: value('select[name="margin"]', 'none'),
    };
}

/** One embedded image, upright, with its pixel size. */
async function embedImage(pdf, file, kind) {
    const bytes = new Uint8Array(await file.arrayBuffer());

    try {
        if (kind === 'jpeg' && jpegOrientation(bytes) === 1) {
            const image = await pdf.embedJpg(bytes);

            return { image, width: image.width, height: image.height };
        }

        if (kind === 'png') {
            const image = await pdf.embedPng(bytes);

            return { image, width: image.width, height: image.height };
        }
    } catch {
        // Fall through to the canvas route, which copes with unusual encodings.
    }

    const decoded = await decodeImage(new Blob([bytes], { type: file.type || 'image/jpeg' }), file.name);

    try {
        const canvas = drawToCanvas(decoded, { background: kind === 'jpeg' ? '#ffffff' : null });
        const blob = await canvasToBlob(canvas, kind === 'png' ? 'image/png' : 'image/jpeg', 0.95);
        const data = new Uint8Array(await blob.arrayBuffer());
        const image = kind === 'png' ? await pdf.embedPng(data) : await pdf.embedJpg(data);

        return { image, width: image.width, height: image.height };
    } finally {
        releaseImage(decoded);
    }
}

function pageGeometry(imageWidth, imageHeight, { pageSize, orientation, margin }) {
    const pad = MARGINS[margin] ?? 0;

    if (pageSize === 'fit') {
        // 96 px per inch screen images become 72 pt per inch on paper.
        const width = imageWidth * 0.75 + pad * 2;
        const height = imageHeight * 0.75 + pad * 2;

        return { width, height, pad };
    }

    let [width, height] = PAGE_SIZES[pageSize];
    const landscape = orientation === 'landscape' || (orientation === 'auto' && imageWidth > imageHeight);

    if (landscape) {
        [width, height] = [height, width];
    }

    return { width, height, pad };
}

/**
 * @param {File[]} files
 * @param {'jpeg'|'png'} kind
 * @param {{pageSize?: string, orientation?: string, margin?: string}} options
 */
export async function imagesToPdf(files, kind, options = {}, onProgress = () => {}) {
    const settings = { pageSize: 'fit', orientation: 'auto', margin: 'none', ...options };

    if (files.length === 0) {
        throw new ToolError('Add at least one image.');
    }

    if (settings.pageSize !== 'fit' && !(settings.pageSize in PAGE_SIZES)) {
        throw new ToolError('Choose a valid page size.');
    }

    if (!['auto', 'portrait', 'landscape'].includes(settings.orientation) || !(settings.margin in MARGINS)) {
        throw new ToolError('Choose valid page options.');
    }

    const pdf = await PDFDocument.create();

    for (const [index, file] of files.entries()) {
        onProgress(index / files.length, `Adding ${file.name}`);

        let embedded;

        try {
            embedded = await embedImage(pdf, file, kind);
        } catch (error) {
            if (error instanceof ToolError) {
                throw error;
            }

            throw new ToolError(`"${file.name}" could not be read. The file may be damaged.`);
        }

        const { width, height, pad } = pageGeometry(embedded.width, embedded.height, settings);
        const page = pdf.addPage([width, height]);
        const scale = Math.min((width - pad * 2) / embedded.width, (height - pad * 2) / embedded.height);
        const drawWidth = embedded.width * scale;
        const drawHeight = embedded.height * scale;

        page.drawImage(embedded.image, {
            x: (width - drawWidth) / 2,
            y: (height - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight,
        });
    }

    onProgress(0.95, 'Saving');

    return [{ name: 'images.pdf', blob: new Blob([await pdf.save()], { type: 'application/pdf' }) }];
}
