import { canvasToBlob, drawToCanvas } from './canvas.js';

const MIN_QUALITY = 0.05;
const MAX_QUALITY = 0.95;
const MIN_SIDE = 16;

/**
 * Finds the best JPEG quality that keeps a canvas at or under a byte limit
 * (binary search on quality). Returns the largest blob that fits, or null
 * when even the lowest quality is too big.
 */
async function bestQuality(canvas, maxBytes) {
    let low = MIN_QUALITY;
    let high = MAX_QUALITY;
    let best = null;

    const top = await canvasToBlob(canvas, 'image/jpeg', MAX_QUALITY);

    if (top.size <= maxBytes) {
        return { blob: top, quality: MAX_QUALITY };
    }

    for (let step = 0; step < 8; step += 1) {
        const quality = (low + high) / 2;
        const blob = await canvasToBlob(canvas, 'image/jpeg', quality);

        if (blob.size <= maxBytes) {
            best = { blob, quality };
            low = quality;
        } else {
            high = quality;
        }
    }

    if (best) {
        return best;
    }

    const lowest = await canvasToBlob(canvas, 'image/jpeg', MIN_QUALITY);

    return lowest.size <= maxBytes ? { blob: lowest, quality: MIN_QUALITY } : null;
}

/**
 * Makes a JPEG no larger than `maxBytes`.
 *
 * It lowers the JPEG quality first. When `allowShrink` is true it then also
 * reduces the pixel size step by step; otherwise it keeps the size and returns
 * the smallest result it could make, with `reached: false`.
 *
 * @param {CanvasImageSource & {width: number, height: number}} image
 * @param {{maxBytes: number, width?: number, height?: number, background?: string, allowShrink?: boolean}} options
 * @returns {Promise<{blob: Blob, quality: number, width: number, height: number, reached: boolean}>}
 */
export async function jpegUnder(image, { maxBytes, width = image.width, height = image.height, background = '#ffffff', allowShrink = true }) {
    let w = Math.round(width);
    let h = Math.round(height);

    for (let attempt = 0; attempt < 14; attempt += 1) {
        const canvas = drawToCanvas(image, { width: w, height: h, background });
        const found = await bestQuality(canvas, maxBytes);

        if (found) {
            return { ...found, width: canvas.width, height: canvas.height, reached: true };
        }

        if (!allowShrink || Math.min(w, h) <= MIN_SIDE) {
            const smallest = await canvasToBlob(canvas, 'image/jpeg', MIN_QUALITY);

            return { blob: smallest, quality: MIN_QUALITY, width: canvas.width, height: canvas.height, reached: false };
        }

        w = Math.max(MIN_SIDE, Math.round(w * 0.85));
        h = Math.max(MIN_SIDE, Math.round(h * 0.85));
    }

    const canvas = drawToCanvas(image, { width: w, height: h, background });

    return { blob: await canvasToBlob(canvas, 'image/jpeg', MIN_QUALITY), quality: MIN_QUALITY, width: w, height: h, reached: false };
}

export const KB = 1024;
