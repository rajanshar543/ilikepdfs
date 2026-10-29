import { decodeImage, releaseImage } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName, checkFileKind, formatBytes } from '../core/files.js';
import { jpegUnder, KB } from '../core/imageSize.js';

export const kinds = ['jpeg', 'png', 'webp'];

const MIN_KB = 2;
const MAX_KB = 20_000;

export function readOptions(root) {
    const preset = root.querySelector('select[name="preset"]')?.value ?? '100';
    const custom = root.querySelector('input[name="customKb"]')?.value ?? '';

    return { targetKb: preset === 'custom' ? Number(custom) : Number(preset) };
}

export function init(root) {
    const sync = () => {
        root.querySelector('[data-custom]').hidden = root.querySelector('select[name="preset"]').value !== 'custom';
    };

    root.querySelector('select[name="preset"]').addEventListener('change', sync);
    sync();
}

/**
 * Makes each image a JPG at or under the size you ask for: first by lowering
 * the quality, then, if needed, by making the picture a little smaller.
 *
 * @param {File[]} files
 * @param {{targetKb: number}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { targetKb } = options;

    if (files.length === 0) {
        throw new ToolError('Add at least one image.');
    }

    if (!Number.isFinite(targetKb) || targetKb < MIN_KB || targetKb > MAX_KB) {
        throw new ToolError(`Enter a size between ${MIN_KB} KB and ${MAX_KB / 1000} MB.`);
    }

    const output = [];

    for (const [index, file] of files.entries()) {
        onProgress(index / files.length, `Compressing ${file.name}`);
        await checkFileKind(file, kinds);

        const image = await decodeImage(file, file.name);

        try {
            const result = await jpegUnder(image, { maxBytes: Math.floor(targetKb * KB) });

            output.push({
                name: `${baseName(file.name)}-${targetKb}kb.jpg`,
                blob: result.blob,
                note: `${formatBytes(result.blob.size)}, ${result.width}×${result.height} px${result.reached ? '' : `. Could not get under ${targetKb} KB`}`,
            });
        } finally {
            releaseImage(image);
        }
    }

    return output;
}
