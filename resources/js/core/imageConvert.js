import { canvasToBlob, createCanvas, decodeImage, drawToCanvas, releaseImage } from './canvas.js';
import { ToolError } from './errors.js';
import { assertPixelBudget, baseName, checkFileKind, MAX_SVG_BYTES } from './files.js';

const MIME = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    gif: 'image/gif',
};

const EXTENSION = { jpeg: 'jpg', png: 'png', webp: 'webp' };

const BACKGROUNDS = { white: '#ffffff', black: '#000000', gray: '#e5e7eb' };

export function readConvertOptions(root) {
    const value = (selector, fallback) => root.querySelector(selector)?.value ?? fallback;

    return {
        quality: Number(value('select[name="quality"]', 0.9)),
        background: value('select[name="background"]', 'white'),
        scale: Number(value('select[name="scale"]', 1)),
    };
}

/**
 * TIFF is not decoded by browsers, so utif2 does it. A TIFF can hold several
 * pages; each one becomes a frame.
 */
async function decodeTiff(file) {
    const { default: UTIF } = await import('utif2');
    const buffer = await file.arrayBuffer();
    let directories;

    try {
        directories = UTIF.decode(buffer);
    } catch {
        throw new ToolError(`"${file.name}" could not be read. The file may be damaged.`);
    }

    const frames = [];

    for (const directory of directories) {
        const width = directory.t256?.[0];
        const height = directory.t257?.[0];
        assertPixelBudget(width, height);

        try {
            UTIF.decodeImage(buffer, directory);
            const rgba = UTIF.toRGBA8(directory);
            const canvas = createCanvas(width, height);
            const context = canvas.getContext('2d');
            const pixels = context.createImageData(width, height);
            pixels.data.set(rgba);
            context.putImageData(pixels, 0, 0);
            frames.push({ source: canvas, width, height });
        } catch {
            throw new ToolError(`"${file.name}" uses a TIFF format that cannot be converted.`);
        }
    }

    if (frames.length === 0) {
        throw new ToolError(`"${file.name}" does not contain any image.`);
    }

    return frames;
}

/** HEIC/HEIF from iPhones, decoded with libheif compiled to WebAssembly. */
async function decodeHeic(file) {
    const { default: libheif } = await import('libheif-js/wasm-bundle');

    let image;

    try {
        image = new libheif.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()))[0];
    } catch {
        throw new ToolError(`"${file.name}" could not be read. The file may be damaged.`);
    }

    if (!image) {
        throw new ToolError(`"${file.name}" does not contain any image.`);
    }

    const width = image.get_width();
    const height = image.get_height();
    assertPixelBudget(width, height);

    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(width, height);

    await new Promise((resolve, reject) => {
        image.display({ data: pixels.data, width, height }, (result) => (
            result ? resolve() : reject(new ToolError(`"${file.name}" could not be converted.`))
        ));
    });

    context.putImageData(pixels, 0, 0);

    return [{ source: canvas, width, height }];
}

async function decodeFrames(file, kind) {
    if (kind === 'tiff') {
        return decodeTiff(file);
    }

    if (kind === 'heic') {
        return decodeHeic(file);
    }

    if (kind === 'svg' && file.size > MAX_SVG_BYTES) {
        throw new ToolError(`"${file.name}" is larger than ${MAX_SVG_BYTES / 1024 / 1024} MB.`);
    }

    const image = await decodeImage(new Blob([await file.arrayBuffer()], { type: MIME[kind] }), file.name);

    return [{ source: image, width: image.width, height: image.height, dispose: () => releaseImage(image) }];
}

/** WebP encoding when the browser's canvas cannot produce it (older Safari). */
async function encodeWebpFallback(canvas, quality) {
    const { default: encode } = await import('@jsquash/webp/encode.js');
    const context = canvas.getContext('2d');
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = await encode(data, { quality: Math.round(quality * 100) });

    return new Blob([buffer], { type: 'image/webp' });
}

export async function encodeCanvas(canvas, target, quality) {
    if (target !== 'webp') {
        return canvasToBlob(canvas, MIME[target], target === 'jpeg' ? quality : undefined);
    }

    const blob = await canvasToBlob(canvas, 'image/webp', quality);

    return blob.type === 'image/webp' ? blob : encodeWebpFallback(canvas, quality);
}

/**
 * Converts images from one raster/vector format to another.
 *
 * @param {File[]} files
 * @param {{from: string[], to: 'jpeg'|'png'|'webp'}} format
 * @param {{quality?: number, background?: string, scale?: number}} options
 */
export async function convertImages(files, format, options = {}, onProgress = () => {}) {
    const { quality = 0.9, background = 'white', scale = 1 } = options;

    if (files.length === 0) {
        throw new ToolError('Add at least one image.');
    }

    if (!(quality >= 0.1 && quality <= 1)) {
        throw new ToolError('Choose a valid quality.');
    }

    if (!(background in BACKGROUNDS)) {
        throw new ToolError('Choose a valid background colour.');
    }

    if (![1, 2, 3, 4].includes(scale)) {
        throw new ToolError('Choose a valid size.');
    }

    const output = [];
    const used = new Set();

    for (const [index, file] of files.entries()) {
        onProgress(index / files.length, `Converting ${file.name}`);

        const kind = await checkFileKind(file, format.from);
        const frames = await decodeFrames(file, kind);

        try {
            for (const [position, frame] of frames.entries()) {
                const canvas = drawToCanvas(frame.source, {
                    width: frame.width * scale,
                    height: frame.height * scale,
                    background: format.to === 'jpeg' ? BACKGROUNDS[background] : null,
                });
                const stem = frames.length > 1 ? `${baseName(file.name)}-page-${position + 1}` : baseName(file.name);

                output.push({
                    name: uniqueName(`${stem}.${EXTENSION[format.to]}`, used),
                    blob: await encodeCanvas(canvas, format.to, quality),
                });
            }
        } finally {
            frames.forEach((frame) => frame.dispose?.());
        }
    }

    return output;
}

function uniqueName(name, used) {
    let candidate = name;
    let counter = 2;

    while (used.has(candidate)) {
        const dot = name.lastIndexOf('.');
        candidate = `${name.slice(0, dot)}-${counter}${name.slice(dot)}`;
        counter += 1;
    }

    used.add(candidate);

    return candidate;
}
