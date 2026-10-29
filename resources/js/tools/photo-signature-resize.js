import { canvasToBlob, createCanvas, decodeImage, releaseImage } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName, checkFileKind, formatBytes } from '../core/files.js';
import { jpegUnder, KB } from '../core/imageSize.js';

export const kinds = ['jpeg', 'png', 'webp'];

/** Sizes in pixels. Check the exact rule of the form or exam you are applying to. */
export const PRESETS = {
    passport: { label: 'Passport photo 35 x 45 mm', width: 413, height: 531 },
    'small-photo': { label: 'Form photo 3.5 x 4.5 cm (small)', width: 276, height: 354 },
    square: { label: 'Square photo 2 x 2 in', width: 600, height: 600 },
    signature: { label: 'Signature 140 x 60 px', width: 140, height: 60 },
    'signature-wide': { label: 'Signature 4 x 2 cm', width: 472, height: 236 },
};

const UNITS = { px: 1, mm: 1 / 25.4, cm: 1 / 2.54, in: 1 };
const MAX_SIDE = 8000;
const MAX_KB = 20_000;

export function readOptions(root) {
    const value = (selector, fallback = '') => root.querySelector(selector)?.value ?? fallback;

    return {
        preset: value('select[name="preset"]', 'passport'),
        width: Number(value('input[name="width"]')),
        height: Number(value('input[name="height"]')),
        unit: value('select[name="unit"]', 'px'),
        dpi: Number(value('select[name="dpi"]', 300)),
        maxKb: value('input[name="maxKb"]') === '' ? null : Number(value('input[name="maxKb"]')),
        fit: value('select[name="fit"]', 'cover'),
        focus: value('select[name="focus"]', 'center'),
        background: value('select[name="background"]', 'white'),
    };
}

export function init(root) {
    const sync = () => {
        root.querySelector('[data-custom]').hidden = root.querySelector('select[name="preset"]').value !== 'custom';
    };

    root.querySelector('select[name="preset"]').addEventListener('change', sync);
    sync();
}

/** Pixel size for the chosen preset or custom measurements. */
export function targetPixels(options) {
    const { preset = 'passport', width, height, unit = 'px', dpi = 300 } = options;

    if (preset !== 'custom') {
        const known = PRESETS[preset];

        if (!known) {
            throw new ToolError('Choose a size.');
        }

        return [known.width, known.height];
    }

    if (!(unit in UNITS)) {
        throw new ToolError('Choose a unit.');
    }

    if (![72, 96, 150, 200, 300, 600].includes(dpi)) {
        throw new ToolError('Choose a valid resolution.');
    }

    const factor = unit === 'px' ? 1 : UNITS[unit] * dpi;
    const pixels = [Math.round(width * factor), Math.round(height * factor)];

    if (!pixels.every((side) => Number.isFinite(side) && side >= 16 && side <= MAX_SIDE)) {
        throw new ToolError(`Enter a width and height that make 16 to ${MAX_SIDE} pixels.`);
    }

    return pixels;
}

/**
 * Resizes photos and signatures to an exact size, and optionally keeps the
 * file under a size limit, as many forms ask for.
 *
 * @param {File[]} files
 * @param {object} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { maxKb = null, fit = 'cover', focus = 'center', background = 'white' } = options;

    if (files.length === 0) {
        throw new ToolError('Add at least one picture.');
    }

    if (!['cover', 'contain'].includes(fit) || !['center', 'top'].includes(focus) || !['white', 'black', 'gray'].includes(background)) {
        throw new ToolError('Choose valid options.');
    }

    if (maxKb !== null && !(Number.isFinite(maxKb) && maxKb >= 2 && maxKb <= MAX_KB)) {
        throw new ToolError(`Enter a size limit between 2 KB and ${MAX_KB / 1000} MB, or leave it empty.`);
    }

    const [width, height] = targetPixels(options);
    const fill = { white: '#ffffff', black: '#000000', gray: '#e5e7eb' }[background];
    const output = [];

    for (const [index, file] of files.entries()) {
        onProgress(index / files.length, `Resizing ${file.name}`);
        await checkFileKind(file, kinds);

        const image = await decodeImage(file, file.name);

        try {
            const scale = (fit === 'cover' ? Math.max : Math.min)(width / image.width, height / image.height);
            const drawWidth = image.width * scale;
            const drawHeight = image.height * scale;
            const left = (width - drawWidth) / 2;
            const top = focus === 'top' && drawHeight > height ? 0 : (height - drawHeight) / 2;

            const placed = createCanvas(width, height);
            const context = placed.getContext('2d');
            context.imageSmoothingQuality = 'high';
            context.fillStyle = fill;
            context.fillRect(0, 0, width, height);
            context.drawImage(image, left, top, drawWidth, drawHeight);

            const result = maxKb === null
                ? { blob: await canvasToBlob(placed, 'image/jpeg', 0.92), reached: true }
                : await jpegUnder(placed, { maxBytes: Math.floor(maxKb * KB), width, height, background: fill, allowShrink: false });

            output.push({
                name: `${baseName(file.name)}-${width}x${height}.jpg`,
                blob: result.blob,
                note: `${width}×${height} px, ${formatBytes(result.blob.size)}${result.reached ? '' : `. Could not get under ${maxKb} KB at this size`}`,
            });
        } finally {
            releaseImage(image);
        }
    }

    return output;
}
