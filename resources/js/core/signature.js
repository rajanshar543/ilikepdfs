import { canvasToBlob, createCanvas } from './canvas.js';
import { ToolError } from './errors.js';

const FONTS = {
    script: "'Brush Script MT', 'Segoe Script', 'Snell Roundhand', cursive",
    serif: "italic 'Georgia', 'Times New Roman', serif",
    plain: "'Helvetica Neue', Arial, sans-serif",
};

/** Crops a canvas to the area that has ink, with a small margin. Returns null when it is empty. */
export function trimCanvas(source, margin = 6) {
    const { width, height } = source;
    const { data } = source.getContext('2d').getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] > 16) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }
    }

    if (maxX < 0) {
        return null;
    }

    const left = Math.max(0, minX - margin);
    const top = Math.max(0, minY - margin);
    const trimmed = createCanvas(Math.min(width, maxX + margin + 1) - left, Math.min(height, maxY + margin + 1) - top);
    trimmed.getContext('2d').drawImage(source, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);

    return trimmed;
}

/** PNG bytes and size of a signature drawn on a canvas; the background stays transparent. */
export async function signatureFromCanvas(canvas) {
    const trimmed = trimCanvas(canvas);

    if (!trimmed) {
        throw new ToolError('Draw your signature first.');
    }

    return { bytes: new Uint8Array(await (await canvasToBlob(trimmed, 'image/png')).arrayBuffer()), width: trimmed.width, height: trimmed.height };
}

/** Renders a typed name as a signature picture. */
export async function signatureFromText(text, style = 'script', color = '#111827') {
    const name = String(text).replace(/\s+/g, ' ').trim();

    if (name === '') {
        throw new ToolError('Type your name first.');
    }

    if (name.length > 60) {
        throw new ToolError('Use at most 60 characters.');
    }

    if (!(style in FONTS)) {
        throw new ToolError('Choose a valid style.');
    }

    const size = 110;
    const measure = createCanvas(10, 10).getContext('2d');
    measure.font = `${style === 'serif' ? '' : 'italic '}${size}px ${FONTS[style]}`;
    const canvas = createCanvas(Math.max(40, Math.ceil(measure.measureText(name).width) + size), Math.ceil(size * 1.8));
    const context = canvas.getContext('2d');
    context.font = measure.font;
    context.fillStyle = /^#[0-9a-f]{6}$/i.test(color) ? color : '#111827';
    context.textBaseline = 'middle';
    context.fillText(name, size / 2, canvas.height / 2);

    return signatureFromCanvas(canvas);
}
