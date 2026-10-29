import { degrees, rgb } from 'pdf-lib';
import { ToolError } from './errors.js';
import { createFontSet } from './fonts.js';
import { visualToPage } from './geometry.js';

const TYPES = ['text', 'rect', 'ellipse', 'line', 'ink', 'image', 'signature'];
const MAX_TEXT = 2000;
const MAX_POINTS = 8000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ITEMS = 2000;

export function parseColor(value, fallback = '#dd3333') {
    const hex = /^#[0-9a-f]{6}$/i.test(String(value)) ? value : fallback;

    return rgb(...[1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255));
}

/** Where a page really is: its box, its /Rotate and its size as displayed. */
export function pageInfo(page) {
    const box = page.getMediaBox();
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const sideways = rotation === 90 || rotation === 270;

    return { box, rotation, width: sideways ? box.height : box.width, height: sideways ? box.width : box.height };
}

/** A point of the displayed page (top-left origin, points) in PDF page coordinates. */
export function pointToPage(info, x, y) {
    const [px, py] = visualToPage(x, info.height - y, info.rotation, info.box.width, info.box.height);

    return [info.box.x + px, info.box.y + py];
}

/** A displayed rectangle (top-left origin) as the matching axis-aligned rectangle in page space. */
export function rectToPage(info, x, y, w, h) {
    const [ax, ay] = pointToPage(info, x, y);
    const [bx, by] = pointToPage(info, x + w, y + h);

    return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

const finite = (value) => Number.isFinite(Number(value));

/** Checks one annotation coming from the page; throws for anything malformed. */
export function validateItem(item, pageCount) {
    if (!item || !TYPES.includes(item.type)) {
        throw new ToolError('One of the additions is not valid.');
    }

    if (!Number.isInteger(item.page) || item.page < 0 || item.page >= pageCount) {
        throw new ToolError('One of the additions is on a page that does not exist.');
    }

    const numbers = item.type === 'line' ? [item.x1, item.y1, item.x2, item.y2] : item.type === 'ink' ? [] : [item.x, item.y, ...(item.type === 'text' ? [item.size] : [item.w, item.h])];

    if (!numbers.every(finite)) {
        throw new ToolError('One of the additions has an invalid position.');
    }

    if (item.type === 'text' && (typeof item.text !== 'string' || item.text.length > MAX_TEXT)) {
        throw new ToolError(`Text can have at most ${MAX_TEXT} characters.`);
    }

    if (item.type === 'ink' && (!Array.isArray(item.points) || item.points.length > MAX_POINTS || !item.points.every((point) => Array.isArray(point) && finite(point[0]) && finite(point[1])))) {
        throw new ToolError('One of the drawings is not valid.');
    }

    if ((item.type === 'image' || item.type === 'signature') && (!(item.bytes instanceof Uint8Array) || item.bytes.length === 0 || item.bytes.length > MAX_IMAGE_BYTES)) {
        throw new ToolError('One of the pictures is not valid or is too large.');
    }
}

/**
 * Burns annotations into the pages of a PDF document.
 *
 * @param {import('pdf-lib').PDFDocument} pdf
 * @param {object[]} items annotations in displayed-page coordinates (points, top-left origin)
 */
export async function applyItems(pdf, items) {
    if (items.length > MAX_ITEMS) {
        throw new ToolError('There are too many additions on this document.');
    }

    const pages = pdf.getPages();
    items.forEach((item) => validateItem(item, pages.length));

    const fonts = createFontSet(pdf);

    for (const item of items.filter((entry) => entry.type === 'text')) {
        await fonts.prepare(item.text);
    }

    for (const item of items) {
        const page = pages[item.page];
        const info = pageInfo(page);
        const color = parseColor(item.color);
        const stroke = Math.min(20, Math.max(0.5, Number(item.stroke ?? 2)));

        switch (item.type) {
            case 'rect': {
                const rect = rectToPage(info, item.x, item.y, item.w, item.h);
                page.drawRectangle({ ...rect, borderColor: item.fill && !item.stroke ? undefined : color, borderWidth: item.stroke === 0 ? 0 : stroke, color: item.fill ? parseColor(item.fill) : undefined });
                break;
            }

            case 'ellipse': {
                const rect = rectToPage(info, item.x, item.y, item.w, item.h);
                page.drawEllipse({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, xScale: rect.width / 2, yScale: rect.height / 2, borderColor: color, borderWidth: stroke });
                break;
            }

            case 'line': {
                const [x1, y1] = pointToPage(info, item.x1, item.y1);
                const [x2, y2] = pointToPage(info, item.x2, item.y2);
                page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: stroke, color, lineCap: 1 });
                break;
            }

            case 'ink': {
                for (let index = 1; index < item.points.length; index += 1) {
                    const [x1, y1] = pointToPage(info, ...item.points[index - 1]);
                    const [x2, y2] = pointToPage(info, ...item.points[index]);
                    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: stroke, color, lineCap: 1 });
                }

                break;
            }

            case 'text': {
                const size = Math.min(200, Math.max(4, Number(item.size)));

                item.text.split('\n').forEach((line, index) => {
                    if (line === '') {
                        return;
                    }

                    const [x, y] = pointToPage(info, item.x, item.y + size * 0.85 + index * size * 1.2);
                    fonts.draw(page, line, { x, y, size, color, rotate: degrees(info.rotation) });
                });
                break;
            }

            default: {
                const isPng = item.bytes[0] === 0x89 && item.bytes[1] === 0x50;
                const isJpeg = item.bytes[0] === 0xff && item.bytes[1] === 0xd8;

                if (!isPng && !isJpeg) {
                    throw new ToolError('Pictures must be PNG or JPG.');
                }

                const image = isPng ? await pdf.embedPng(item.bytes) : await pdf.embedJpg(item.bytes);
                const [x, y] = pointToPage(info, item.x, item.y + item.h);
                page.drawImage(image, { x, y, width: item.w, height: item.h, rotate: degrees(info.rotation) });
            }
        }
    }
}
