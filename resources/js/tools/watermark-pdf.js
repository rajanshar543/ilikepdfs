import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { canvasToBlob, createCanvas } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { visualToPage } from '../core/geometry.js';
import { loadPdf, parsePageRanges, savePdf } from '../core/pdf.js';

export { visualToPage };

export const kinds = ['pdf'];

const MAX_TEXT = 80;

const COLORS = {
    gray: [0.45, 0.45, 0.45],
    red: [0.8, 0.1, 0.1],
    blue: [0.1, 0.3, 0.8],
    black: [0, 0, 0],
};

const OPACITY = { light: 0.2, medium: 0.35, strong: 0.55 };
const SIZE = { small: 0.4, medium: 0.65, large: 0.9 };

/** Style = how the text is rotated and where it sits. Angles are counter-clockwise. */
const STYLES = {
    diagonal: { angle: 45, position: 'center' },
    center: { angle: 0, position: 'center' },
    top: { angle: 0, position: 'top' },
    bottom: { angle: 0, position: 'bottom' },
};

export function init(root) {
    const sync = () => {
        const only = root.querySelector('input[name="scope"]:checked')?.value === 'selected';
        root.querySelector('[data-pages]').hidden = !only;
    };

    root.querySelectorAll('input[name="scope"]').forEach((radio) => radio.addEventListener('change', sync));
    sync();
}

export function readOptions(root) {
    const value = (selector, fallback) => root.querySelector(selector)?.value ?? fallback;

    return {
        text: value('input[name="text"]', ''),
        style: value('select[name="style"]', 'diagonal'),
        color: value('select[name="color"]', 'gray'),
        opacity: value('select[name="opacity"]', 'medium'),
        size: value('select[name="size"]', 'medium'),
        scope: root.querySelector('input[name="scope"]:checked')?.value ?? 'all',
        pages: value('input[name="pages"]', ''),
    };
}

function rotateVector(x, y, angle) {
    const radians = (angle * Math.PI) / 180;

    return [x * Math.cos(radians) - y * Math.sin(radians), x * Math.sin(radians) + y * Math.cos(radians)];
}

/** Text a standard PDF font can draw is drawn as real text; anything else (e.g. Hindi) as a picture. */
async function prepareContent(pdf, text, color) {
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const supported = new Set(font.getCharacterSet());

    if ([...text].every((char) => supported.has(char.codePointAt(0)))) {
        return {
            width: (size) => font.widthOfTextAtSize(text, size),
            height: (size) => size * 0.72,
            draw: (page, { x, y, size, angle, opacity }) => page.drawText(text, {
                x, y, size, font, color: rgb(...color), opacity, rotate: degrees(angle),
            }),
        };
    }

    const unit = 160;
    const measure = createCanvas(10, 10).getContext('2d');
    measure.font = `bold ${unit}px sans-serif`;
    const textWidth = Math.max(1, Math.ceil(measure.measureText(text).width));
    const canvas = createCanvas(textWidth + unit, Math.ceil(unit * 1.6));
    const context = canvas.getContext('2d');
    context.font = `bold ${unit}px sans-serif`;
    context.textBaseline = 'middle';
    context.fillStyle = `rgb(${color.map((part) => Math.round(part * 255)).join(',')})`;
    context.fillText(text, unit / 2, canvas.height / 2);
    const image = await pdf.embedPng(new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer()));
    const ratio = canvas.width / canvas.height;

    return {
        width: (size) => size * 1.6 * ratio,
        height: (size) => size * 1.6,
        draw: (page, { x, y, size, angle, opacity }) => page.drawImage(image, {
            x, y, width: size * 1.6 * ratio, height: size * 1.6, opacity, rotate: degrees(angle),
        }),
    };
}

/**
 * Stamps a text watermark on PDF pages.
 *
 * @param {File[]} files exactly one PDF
 * @param {{text: string, style?: string, color?: string, opacity?: string, size?: string, scope?: string, pages?: string}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const {
        style = 'diagonal', color = 'gray', opacity = 'medium', size = 'medium', scope = 'all', pages = '',
    } = options;
    const text = String(options.text ?? '').replace(/\s+/g, ' ').trim();

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to watermark.');
    }

    // eslint-disable-next-line no-control-regex
    if (text === '' || /[\u0000-\u001f\u007f]/.test(text)) {
        throw new ToolError('Enter the watermark text.');
    }

    if ([...text].length > MAX_TEXT) {
        throw new ToolError(`Keep the watermark under ${MAX_TEXT} characters.`);
    }

    if (!(style in STYLES) || !(color in COLORS) || !(opacity in OPACITY) || !(size in SIZE) || !['all', 'selected'].includes(scope)) {
        throw new ToolError('Choose valid watermark options.');
    }

    const file = files[0];
    const pdf = await loadPdf(file);
    const targets = scope === 'all' ? pdf.getPageIndices() : parsePageRanges(pages, pdf.getPageCount());
    const content = await prepareContent(pdf, text, COLORS[color]);
    const { angle: visualAngle, position } = STYLES[style];

    for (const [step, index] of targets.entries()) {
        onProgress(step / targets.length, `Page ${index + 1}`);

        const page = pdf.getPage(index);
        const box = page.getMediaBox();
        const rotation = ((page.getRotation().angle % 360) + 360) % 360;
        const sideways = rotation === 90 || rotation === 270;
        const visualWidth = sideways ? box.height : box.width;
        const visualHeight = sideways ? box.width : box.height;

        const reach = visualAngle === 0 ? visualWidth * 0.9 : Math.hypot(visualWidth, visualHeight) * 0.75;
        const probe = 100;
        const fontSize = Math.min(220, Math.max(6, (probe * reach * SIZE[size]) / content.width(probe)));
        const textWidth = content.width(fontSize);
        const textHeight = content.height(fontSize);

        const centerY = { center: visualHeight / 2, top: visualHeight * 0.92, bottom: visualHeight * 0.08 }[position];
        const [px, py] = visualToPage(visualWidth / 2, centerY, rotation, box.width, box.height);
        const angle = visualAngle + rotation;
        const [offsetX, offsetY] = rotateVector(textWidth / 2, textHeight / 2, angle);

        content.draw(page, {
            x: box.x + px - offsetX,
            y: box.y + py - offsetY,
            size: fontSize,
            angle,
            opacity: OPACITY[opacity],
        });
    }

    return [{ name: `${baseName(file.name)}-watermarked.pdf`, blob: await savePdf(pdf) }];
}
