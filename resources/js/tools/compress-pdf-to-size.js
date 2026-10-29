import { ToolError } from '../core/errors.js';
import { baseName, formatBytes } from '../core/files.js';
import { compressBytes } from './compress-pdf.js';

export const kinds = ['pdf'];

const MIN_KB = 5;
const MAX_KB = 50_000;

/** From gentle to drastic: the first step that gets under the limit is used, so quality is kept as long as possible. */
const LADDER = [
    { images: false },
    { images: true, quality: 0.75, maxSide: 1800 },
    { images: true, quality: 0.6, maxSide: 1400 },
    { images: true, quality: 0.5, maxSide: 1100 },
    { images: true, quality: 0.4, maxSide: 900 },
    { images: true, quality: 0.3, maxSide: 700 },
    { rasterize: true, scale: 1.4, quality: 0.55 },
    { rasterize: true, scale: 1.1, quality: 0.45 },
    { rasterize: true, scale: 0.9, quality: 0.4 },
    { rasterize: true, scale: 0.7, quality: 0.35 },
    { rasterize: true, scale: 0.55, quality: 0.3 },
];

export function readOptions(root) {
    const custom = root.querySelector('input[name="customKb"]')?.value ?? '';
    const unit = root.querySelector('select[name="unit"]')?.value ?? 'kb';
    const preset = root.querySelector('select[name="preset"]')?.value ?? '200';
    const amount = preset === 'custom' ? Number(custom) : Number(preset);

    return { targetKb: unit === 'mb' && preset === 'custom' ? amount * 1024 : amount };
}

export function init(root) {
    const sync = () => {
        const custom = root.querySelector('select[name="preset"]').value === 'custom';
        root.querySelector('[data-custom]').hidden = !custom;
    };

    root.querySelector('select[name="preset"]').addEventListener('change', sync);
    sync();
}

/**
 * Makes a PDF no larger than the size you ask for, using the gentlest
 * compression that is enough. If even the strongest compression is not enough
 * it returns the smallest file it can make and says so.
 *
 * @param {File[]} files exactly one PDF
 * @param {{targetKb: number}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { targetKb } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to compress.');
    }

    if (!Number.isFinite(targetKb) || targetKb < MIN_KB || targetKb > MAX_KB) {
        throw new ToolError(`Enter a size between ${MIN_KB} KB and ${MAX_KB / 1024} MB.`);
    }

    const file = files[0];
    const limit = Math.floor(targetKb * 1024);
    const label = targetKb >= 1024 ? `${Number((targetKb / 1024).toFixed(1))} MB` : `${targetKb} KB`;

    if (file.size <= limit) {
        return [{
            name: file.name,
            blob: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }),
            note: `Already ${formatBytes(file.size)}, which is under ${label}. File kept as it was.`,
        }];
    }

    let smallest = null;

    for (const [index, step] of LADDER.entries()) {
        onProgress(index / LADDER.length, `Trying compression ${index + 1} of ${LADDER.length}`);

        const bytes = await compressBytes(file, step);

        if (smallest === null || bytes.length < smallest.length) {
            smallest = bytes;
        }

        if (bytes.length <= limit) {
            const rasterized = step.rasterize === true;

            return [{
                name: `${baseName(file.name)}-under-${label.replace(' ', '')}.pdf`,
                blob: new Blob([bytes], { type: 'application/pdf' }),
                note: `${formatBytes(bytes.length)} (was ${formatBytes(file.size)})${rasterized ? '. Pages were turned into pictures to reach this size, so text is not selectable.' : ''}`,
            }];
        }
    }

    return [{
        name: `${baseName(file.name)}-smallest.pdf`,
        blob: new Blob([smallest], { type: 'application/pdf' }),
        note: `Could not reach ${label}. This is the smallest possible: ${formatBytes(smallest.length)} (was ${formatBytes(file.size)}).`,
    }];
}
