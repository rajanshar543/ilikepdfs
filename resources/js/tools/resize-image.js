import { decodeImage, drawToCanvas, releaseImage } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName, checkFileKind } from '../core/files.js';
import { encodeCanvas } from '../core/imageConvert.js';

export const kinds = ['jpeg', 'png', 'webp'];
export const thumbs = true;

const MODES = ['percent', 'width', 'height', 'exact'];
const EXTENSION = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const MAX_SIDE = 16000;

export function init(root) {
    const sync = () => {
        const mode = root.querySelector('select[name="mode"]').value;
        root.querySelector('[data-field="percent"]').hidden = mode !== 'percent';
        root.querySelector('[data-field="width"]').hidden = !['width', 'exact'].includes(mode);
        root.querySelector('[data-field="height"]').hidden = !['height', 'exact'].includes(mode);
        root.querySelector('[data-field="keep"]').hidden = mode !== 'exact';
    };

    root.querySelector('select[name="mode"]').addEventListener('change', sync);
    sync();
}

export function readOptions(root) {
    const value = (name) => root.querySelector(`[name="${name}"]`)?.value ?? '';

    return {
        mode: value('mode') || 'percent',
        percent: Number(value('percent')),
        width: Number(value('width')),
        height: Number(value('height')),
        keepAspect: root.querySelector('[name="keepAspect"]')?.checked ?? true,
    };
}

function isDimension(value) {
    return Number.isInteger(value) && value >= 1 && value <= MAX_SIDE;
}

/** Works out the output size for one image from the chosen mode. */
export function targetSize(width, height, options) {
    const { mode, percent, keepAspect = true } = options;

    if (mode === 'percent') {
        if (!(percent >= 1 && percent <= 400)) {
            throw new ToolError('Enter a percentage between 1 and 400.');
        }

        return [Math.max(1, Math.round((width * percent) / 100)), Math.max(1, Math.round((height * percent) / 100))];
    }

    if (mode === 'width') {
        if (!isDimension(options.width)) {
            throw new ToolError(`Enter a width between 1 and ${MAX_SIDE} pixels.`);
        }

        return [options.width, Math.max(1, Math.round((height * options.width) / width))];
    }

    if (mode === 'height') {
        if (!isDimension(options.height)) {
            throw new ToolError(`Enter a height between 1 and ${MAX_SIDE} pixels.`);
        }

        return [Math.max(1, Math.round((width * options.height) / height)), options.height];
    }

    if (!isDimension(options.width) || !isDimension(options.height)) {
        throw new ToolError(`Enter a width and height between 1 and ${MAX_SIDE} pixels.`);
    }

    if (!keepAspect) {
        return [options.width, options.height];
    }

    const ratio = Math.min(options.width / width, options.height / height);

    return [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
}

/**
 * @param {File[]} files
 * @param {{mode?: string, percent?: number, width?: number, height?: number, keepAspect?: boolean}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const settings = { mode: 'percent', percent: 50, keepAspect: true, ...options };

    if (files.length === 0) {
        throw new ToolError('Add at least one image.');
    }

    if (!MODES.includes(settings.mode)) {
        throw new ToolError('Choose how to resize.');
    }

    const output = [];

    for (const [index, file] of files.entries()) {
        onProgress(index / files.length, `Resizing ${file.name}`);

        const kind = await checkFileKind(file, kinds);
        const image = await decodeImage(file, file.name);

        try {
            const [width, height] = targetSize(image.width, image.height, settings);
            const canvas = drawToCanvas(image, { width, height, background: kind === 'jpeg' ? '#ffffff' : null });

            output.push({
                name: `${baseName(file.name)}-${width}x${height}.${EXTENSION[kind]}`,
                blob: await encodeCanvas(canvas, kind, 0.92),
                note: `${image.width}×${image.height} → ${width}×${height}`,
            });
        } finally {
            releaseImage(image);
        }
    }

    return output;
}
