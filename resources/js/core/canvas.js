import { ToolError } from './errors.js';
import { assertPixelBudget } from './files.js';

/**
 * Canvas access sits behind a small backend so the conversion code can run in
 * a real browser and, under test, against @napi-rs/canvas.
 */
const browserBackend = {
    createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        return canvas;
    },

    async decode(blob) {
        if (blob.type === 'image/svg+xml') {
            return decodeWithImageElement(blob);
        }

        try {
            return await createImageBitmap(blob);
        } catch {
            return decodeWithImageElement(blob);
        }
    },

    toBlob(canvas, type, quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new ToolError('Your browser could not create this file type.'))),
                type,
                quality,
            );
        });
    },
};

function decodeWithImageElement(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new ToolError('This image could not be read.'));
        };
        image.src = url;
    });
}

let backend = browserBackend;

export function setCanvasBackend(custom) {
    backend = custom ?? browserBackend;
}

export function createCanvas(width, height) {
    const w = Math.round(width);
    const h = Math.round(height);
    assertPixelBudget(w, h);

    return backend.createCanvas(w, h);
}

/**
 * Decodes any image Blob to something drawImage accepts, with size checks.
 * `label` (usually the file name) is used in error messages.
 */
export async function decodeImage(blob, label = null) {
    let image;

    try {
        image = await backend.decode(blob);
    } catch (error) {
        const subject = label ? `"${label}"` : 'This image';

        throw new ToolError(`${subject} could not be read. The file may be damaged.`);
    }

    assertPixelBudget(image.width, image.height);

    return image;
}

export function releaseImage(image) {
    if (typeof image?.close === 'function') {
        image.close();
    }
}

export function canvasToBlob(canvas, type, quality) {
    return backend.toBlob(canvas, type, quality);
}

/**
 * Draws an image onto a new canvas, optionally resized and with a solid
 * background (needed when converting transparent images to JPG).
 */
export function drawToCanvas(image, { width = image.width, height = image.height, background = null } = {}) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';

    if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas;
}
