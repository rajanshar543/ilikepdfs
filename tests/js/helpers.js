import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { setCanvasBackend } from '../../resources/js/core/canvas.js';

/** Runs the canvas code against @napi-rs/canvas instead of a browser. */
export function useNodeCanvas() {
    setCanvasBackend({
        createCanvas: (width, height) => createCanvas(width, height),
        async decode(blob) {
            return loadImage(Buffer.from(await blob.arrayBuffer()));
        },
        async toBlob(canvas, type, quality) {
            const buffer = type === 'image/png'
                ? canvas.toBuffer('image/png')
                : canvas.toBuffer(type, Math.round((quality ?? 0.92) * 100));

            return new Blob([buffer], { type });
        },
    });
}

export async function makePdf(pageCount = 1, { width = 300, height = 400, label = 'Page' } = {}) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    for (let index = 1; index <= pageCount; index += 1) {
        const page = pdf.addPage([width, height]);
        page.drawText(`${label} ${index}`, { x: 40, y: height - 80, size: 28, font });
    }

    return new File([await pdf.save()], 'sample.pdf', { type: 'application/pdf' });
}

export async function pageCountOf(blob) {
    const pdf = await PDFDocument.load(await blob.arrayBuffer());

    return pdf.getPageCount();
}

/** Draws a picture with enough detail that compression and resizing matter. */
export function makeCanvas(width = 120, height = 80, { transparent = false } = {}) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    if (!transparent) {
        context.fillStyle = '#3366cc';
        context.fillRect(0, 0, width, height);
    }

    context.fillStyle = '#ffcc00';
    context.fillRect(width * 0.25, height * 0.25, width * 0.5, height * 0.5);

    for (let index = 0; index < 200; index += 1) {
        context.fillStyle = `rgb(${(index * 37) % 255},${(index * 91) % 255},${(index * 53) % 255})`;
        context.fillRect((index * 7) % width, (index * 13) % height, 3, 3);
    }

    return canvas;
}

export function makeImageFile(type, name, options = {}) {
    const { width = 120, height = 80, transparent = false } = options;
    const canvas = makeCanvas(width, height, { transparent });
    const buffer = type === 'image/png' ? canvas.toBuffer('image/png') : canvas.toBuffer(type, 90);

    return new File([buffer], name, { type });
}

export async function imageSizeOf(blob) {
    const image = await loadImage(Buffer.from(await blob.arrayBuffer()));

    return { width: image.width, height: image.height };
}

export async function head(blob, length = 16) {
    return new Uint8Array(await blob.slice(0, length).arrayBuffer());
}

/** Reads the Noto Sans files from node_modules instead of fetching them over HTTP. */
export async function useDiskFonts() {
    const { default: fs } = await import('node:fs');
    const { default: path } = await import('node:path');
    const { setFontLoader } = await import('../../resources/js/core/fonts.js');

    setFontLoader(async (url) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), url.split('?')[0]))));
}
