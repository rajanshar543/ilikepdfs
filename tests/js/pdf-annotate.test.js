import { createRequire } from 'node:module';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, degrees } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, renderPage, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { pageInfo, pointToPage, rectToPage, validateItem } from '../../resources/js/core/pdfAnnotate.js';
import { process, readOptions, resetEditor } from '../../resources/js/tools/edit-pdf.js';
import { makePdf, useDiskFonts, useNodeCanvas } from './helpers.js';

beforeAll(async () => {
    useNodeCanvas();
    setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`);
    await useDiskFonts();
});

const png = () => new Uint8Array(createCanvas(20, 10).toBuffer('image/png'));

/** Renders page 1 and returns the colour at a displayed point (top-left origin, points). */
async function colorAt(blob, x, y, scale = 1) {
    const doc = await openPdf(blob);
    const { canvas } = await renderPage(await doc.getPage(1), scale);

    return Array.from(canvas.getContext('2d').getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data);
}

async function textItems(blob) {
    const doc = await openPdf(blob);
    const page = await doc.getPage(1);
    const view = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    return content.items.filter((item) => item.str.trim() !== '').map((item) => ({ text: item.str, x: view.convertToViewportPoint(item.transform[4], item.transform[5])[0], y: view.convertToViewportPoint(item.transform[4], item.transform[5])[1] }));
}

describe('geometry helpers', () => {
    it('maps displayed points to page space for every rotation', async () => {
        const doc = await PDFDocument.create();
        const page = doc.addPage([200, 100]);

        expect(pointToPage(pageInfo(page), 10, 20)).toEqual([10, 80]);
        expect(rectToPage(pageInfo(page), 10, 20, 30, 40)).toEqual({ x: 10, y: 40, width: 30, height: 40 });

        page.setRotation(degrees(90));
        const info = pageInfo(page);
        expect([info.width, info.height]).toEqual([100, 200]);
        const [x, y] = pointToPage(info, 0, 0);
        expect([x, y]).toEqual([0, 0]);
    });
});

describe('edit-pdf', () => {
    it('draws a filled-border rectangle where it was placed', async () => {
        const [result] = await process([await makePdf(1, { width: 300, height: 200 })], { items: [{ type: 'rect', page: 0, x: 50, y: 100, w: 100, h: 50, color: '#ff0000', stroke: 4, fill: '#00ff00' }] });

        expect(result.name).toBe('sample-edited.pdf');
        expect((await colorAt(result.blob, 100, 125))).toEqual([0, 255, 0, 255]);
        expect((await colorAt(result.blob, 100, 100))[0]).toBeGreaterThan(200);
        expect((await colorAt(result.blob, 20, 180))).toEqual([255, 255, 255, 255]);
    });

    it('draws ellipses, lines and freehand drawings', async () => {
        const [result] = await process([await makePdf(1, { width: 300, height: 200 })], { items: [
            { type: 'line', page: 0, x1: 10, y1: 190, x2: 290, y2: 190, color: '#0000ff', stroke: 6 },
            { type: 'ink', page: 0, points: [[10, 150], [60, 150], [110, 150]], color: '#0000ff', stroke: 6 },
            { type: 'ellipse', page: 0, x: 200, y: 20, w: 80, h: 60, color: '#ff00ff', stroke: 4 },
        ] });

        expect((await colorAt(result.blob, 150, 190))[2]).toBeGreaterThan(200);
        expect((await colorAt(result.blob, 60, 150))[2]).toBeGreaterThan(200);
        expect((await colorAt(result.blob, 240, 20))[0]).toBeGreaterThan(200);
        expect((await colorAt(result.blob, 240, 50))).toEqual([255, 255, 255, 255]);
    });

    it('adds text at the chosen place, also in Hindi and over several lines', async () => {
        const [result] = await process([await makePdf(1, { width: 300, height: 400 })], { items: [
            { type: 'text', page: 0, x: 40, y: 200, size: 20, text: 'Approved', color: '#000000' },
            { type: 'text', page: 0, x: 40, y: 260, size: 16, text: 'नमस्ते\nline two', color: '#000000' },
        ] });
        const items = await textItems(result.blob);
        const approved = items.find((item) => item.text === 'Approved');

        expect(approved.x).toBeCloseTo(40, 0);
        expect(approved.y).toBeGreaterThan(200);
        expect(approved.y).toBeLessThan(225);
        expect(items.some((item) => /[ऀ-ॿ]/.test(item.text))).toBe(true);
        expect(items.find((item) => item.text === 'line two').y).toBeGreaterThan(approved.y + 40);
    });

    it('places pictures and keeps text upright on rotated pages', async () => {
        const source = await PDFDocument.load(await (await makePdf(1, { width: 300, height: 400 })).arrayBuffer());
        source.getPage(0).setRotation(degrees(90));
        const file = new File([await source.save()], 'r.pdf');
        const [result] = await process([file], { items: [
            { type: 'text', page: 0, x: 40, y: 60, size: 20, text: 'Upright', color: '#000000' },
            { type: 'image', page: 0, x: 200, y: 100, w: 60, h: 30, bytes: png() },
        ] });
        const items = await textItems(result.blob);
        const upright = items.find((item) => item.text === 'Upright');

        expect(upright.x).toBeCloseTo(40, 0);
        expect(upright.y).toBeGreaterThan(60);
        expect(upright.y).toBeLessThan(90);
    });

    it('collects the editor state through readOptions', () => {
        resetEditor();

        expect(readOptions()).toEqual({ items: [] });
    });

    it('rejects empty edits, bad items and bad files', async () => {
        const pdf = await makePdf(1);

        await expect(process([pdf], { items: [] })).rejects.toThrow('Add some text');
        await expect(process([pdf], { items: [{ type: 'script', page: 0 }] })).rejects.toThrow('not valid');
        await expect(process([pdf], { items: [{ type: 'rect', page: 4, x: 0, y: 0, w: 5, h: 5 }] })).rejects.toThrow('page that does not exist');
        await expect(process([pdf], { items: [{ type: 'rect', page: 0, x: 'a', y: 0, w: 5, h: 5 }] })).rejects.toThrow('invalid position');
        await expect(process([pdf], { items: [{ type: 'text', page: 0, x: 1, y: 1, size: 12, text: 'x'.repeat(2001) }] })).rejects.toThrow('at most 2000');
        await expect(process([pdf], { items: [{ type: 'ink', page: 0, points: [[1, 'x']] }] })).rejects.toThrow('drawings');
        await expect(process([pdf], { items: [{ type: 'image', page: 0, x: 0, y: 0, w: 5, h: 5, bytes: new Uint8Array([1, 2, 3]) }] })).rejects.toThrow('PNG or JPG');
        await expect(process([pdf], { items: [{ type: 'image', page: 0, x: 0, y: 0, w: 5, h: 5, bytes: 'data' }] })).rejects.toThrow('picture');
        await expect(process([], { items: [{}] })).rejects.toBeInstanceOf(ToolError);
        expect(() => validateItem({ type: 'rect', page: 0, x: 0, y: 0, w: 1, h: 1 }, 1)).not.toThrow();
    });

    it('ignores an invalid colour instead of failing', async () => {
        const [result] = await process([await makePdf(1)], { items: [{ type: 'rect', page: 0, x: 10, y: 10, w: 20, h: 20, color: 'javascript:alert(1)' }] });

        expect(result.blob.size).toBeGreaterThan(0);
    });
});
