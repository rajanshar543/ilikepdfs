import UPNG from 'upng-js';
import { decodeImage, drawToCanvas, releaseImage } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName, checkFileKind, formatBytes } from '../core/files.js';
import { encodeCanvas } from '../core/imageConvert.js';

export const kinds = ['jpeg', 'png', 'webp'];
export const thumbs = true;

const PRESETS = {
    small: { quality: 0.55, colors: 64 },
    balanced: { quality: 0.75, colors: 256 },
    best: { quality: 0.88, colors: 0 },
};

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const EXTENSION = { jpeg: 'jpg', png: 'png', webp: 'webp' };

export function readOptions(root) {
    return { level: root.querySelector('select[name="level"]')?.value ?? 'balanced' };
}

async function compressOne(file, kind, preset) {
    const image = await decodeImage(file, file.name);

    try {
        const canvas = drawToCanvas(image, { background: kind === 'jpeg' ? '#ffffff' : null });

        if (kind === 'png') {
            const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
            const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

            return new Blob([UPNG.encode([rgba.slice().buffer], canvas.width, canvas.height, preset.colors)], { type: 'image/png' });
        }

        return await encodeCanvas(canvas, kind, preset.quality);
    } finally {
        releaseImage(image);
    }
}

/**
 * @param {File[]} files
 * @param {{level?: 'small'|'balanced'|'best'}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { level = 'balanced' } = options;

    if (files.length === 0) {
        throw new ToolError('Add at least one image.');
    }

    if (!(level in PRESETS)) {
        throw new ToolError('Choose a compression level.');
    }

    const output = [];

    for (const [index, file] of files.entries()) {
        onProgress(index / files.length, `Compressing ${file.name}`);

        const kind = await checkFileKind(file, kinds);
        const compressed = await compressOne(file, kind, PRESETS[level]);

        if (compressed.size >= file.size) {
            output.push({
                name: file.name,
                blob: new Blob([await file.arrayBuffer()], { type: MIME[kind] }),
                note: 'Already well optimised. File kept as it was.',
            });
            continue;
        }

        const saved = Math.round((1 - compressed.size / file.size) * 100);
        output.push({
            name: `${baseName(file.name)}-compressed.${EXTENSION[kind]}`,
            blob: compressed,
            note: `${saved}% smaller (was ${formatBytes(file.size)})`,
        });
    }

    return output;
}
