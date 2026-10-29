import { canvasToBlob, decodeImage, drawToCanvas, releaseImage } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { isSupportedLanguage, recognize } from '../core/ocr.js';

export const kinds = ['jpeg', 'png', 'webp'];
export const thumbs = true;

const MAX_SIDE = 4000;

export function readOptions(root) {
    return { language: root.querySelector('select[name="language"]')?.value ?? 'eng' };
}

/**
 * Extracts text from a photo or scan.
 *
 * @param {File[]} files exactly one image
 * @param {{language?: 'eng'|'hin'|'eng+hin'}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { language = 'eng' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one image to read.');
    }

    if (!isSupportedLanguage(language)) {
        throw new ToolError('Choose a valid language.');
    }

    const file = files[0];
    onProgress(0.05, 'Preparing image');

    // Re-drawing normalises the format and the EXIF rotation, and caps the size.
    const image = await decodeImage(file, file.name);
    let png;

    try {
        const ratio = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
        const canvas = drawToCanvas(image, {
            width: Math.max(1, Math.round(image.width * ratio)),
            height: Math.max(1, Math.round(image.height * ratio)),
            background: '#ffffff',
        });
        png = new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer());
    } finally {
        releaseImage(image);
    }

    onProgress(0.1, 'Reading text (first run downloads the language data)');
    const text = (await recognize(png, language, (fraction) => onProgress(0.1 + fraction * 0.9, 'Reading text'))).trim();

    if (text === '') {
        throw new ToolError('No text was found in this image. Try a sharper, larger picture.');
    }

    return [{ name: `${baseName(file.name)}.txt`, text }];
}
