import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument, PDFName, PDFRawStream, degrees } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { process, visualToPage } from '../../resources/js/tools/watermark-pdf.js';
import { makePdf, pageCountOf, useNodeCanvas } from './helpers.js';

beforeAll(() => {
    useNodeCanvas();
    setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`);
});

async function textItems(blob, pageNumber = 1) {
    const doc = await openPdf(blob);
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    return content.items.filter((item) => item.str.trim() !== '');
}

const stamp = (items, text) => items.find((item) => item.str === text);

describe('watermark-pdf', () => {
    it('stamps the text on every page without changing the page count', async () => {
        const [result] = await process([await makePdf(3)], { text: 'DRAFT' });

        expect(result.name).toBe('sample-watermarked.pdf');
        expect(await pageCountOf(result.blob)).toBe(3);

        for (const number of [1, 2, 3]) {
            expect(stamp(await textItems(result.blob, number), 'DRAFT')).toBeDefined();
        }
    });

    it('keeps the original page content', async () => {
        const [result] = await process([await makePdf(1)], { text: 'DRAFT' });
        const items = await textItems(result.blob);

        expect(items.map((item) => item.str).join(' ')).toContain('Page 1');
    });

    it('draws diagonal text around the middle of the page', async () => {
        const [result] = await process([await makePdf(1, { width: 600, height: 800 })], { text: 'DRAFT', style: 'diagonal' });
        const item = stamp(await textItems(result.blob), 'DRAFT');
        const [a, b, , , e, f] = item.transform;

        expect(Math.atan2(b, a) * (180 / Math.PI)).toBeCloseTo(45, 0);
        expect(e).toBeGreaterThan(50);
        expect(e).toBeLessThan(550);
        expect(f).toBeGreaterThan(100);
        expect(f).toBeLessThan(700);
    });

    it('places straight text at the top, middle and bottom', async () => {
        const make = async (style) => stamp(await textItems((await process([await makePdf(1, { width: 600, height: 800 })], { text: 'DRAFT', style }))[0].blob), 'DRAFT');
        const top = await make('top');
        const middle = await make('center');
        const bottom = await make('bottom');

        expect(top.transform[5]).toBeGreaterThan(middle.transform[5]);
        expect(middle.transform[5]).toBeGreaterThan(bottom.transform[5]);
        expect(Math.abs(top.transform[1])).toBeLessThan(0.001);
    });

    it('watermarks only the selected pages', async () => {
        const [result] = await process([await makePdf(3)], { text: 'DRAFT', scope: 'selected', pages: '2' });

        expect(stamp(await textItems(result.blob, 1), 'DRAFT')).toBeUndefined();
        expect(stamp(await textItems(result.blob, 2), 'DRAFT')).toBeDefined();
        expect(stamp(await textItems(result.blob, 3), 'DRAFT')).toBeUndefined();
    });

    it('stays upright on pages that are rotated', async () => {
        const source = await PDFDocument.load(await (await makePdf(1, { width: 600, height: 800 })).arrayBuffer());
        source.getPage(0).setRotation(degrees(90));
        const file = new File([await source.save()], 'rot.pdf');
        const [result] = await process([file], { text: 'DRAFT', style: 'center' });
        const item = stamp(await textItems(result.blob), 'DRAFT');
        const doc = await openPdf(result.blob);
        const view = (await doc.getPage(1)).getViewport({ scale: 1 });
        const [x, y] = view.convertToViewportPoint(item.transform[4], item.transform[5]);

        expect(view.width).toBe(800);
        expect(x).toBeGreaterThan(150);
        expect(x).toBeLessThan(650);
        expect(y).toBeGreaterThan(220);
        expect(y).toBeLessThan(420);
    });

    it('supports scripts a standard font cannot draw by using a picture', async () => {
        const [result] = await process([await makePdf(1)], { text: 'गोपनीय' });
        const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
        const images = [...pdf.context.enumerateIndirectObjects()].filter(([, object]) => object instanceof PDFRawStream
            && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image');

        expect(images.length).toBeGreaterThan(0);
        expect(await pageCountOf(result.blob)).toBe(1);
    });

    it('validates input', async () => {
        const pdf = await makePdf(2);

        await expect(process([pdf], { text: '' })).rejects.toThrow('Enter the watermark text');
        await expect(process([pdf], { text: '   ' })).rejects.toThrow('Enter the watermark text');
        await expect(process([pdf], { text: 'bad\u0000text' })).rejects.toThrow('Enter the watermark text');
        await expect(process([pdf], { text: 'x'.repeat(81) })).rejects.toThrow('under 80');
        await expect(process([pdf], { text: 'A', color: 'pink' })).rejects.toThrow('valid watermark options');
        await expect(process([pdf], { text: 'A', style: 'spiral' })).rejects.toBeInstanceOf(ToolError);
        await expect(process([pdf], { text: 'A', scope: 'selected', pages: '5' })).rejects.toThrow('between 1 and 2');
        await expect(process([], { text: 'A' })).rejects.toBeInstanceOf(ToolError);
        await expect(process([new File(['%PDF-1.4 junk'], 'x.pdf')], { text: 'A' })).rejects.toThrow('could not be read');
    });
});

describe('visualToPage', () => {
    it('is the inverse of PDF page rotation', () => {
        expect(visualToPage(10, 20, 0, 100, 200)).toEqual([10, 20]);
        expect(visualToPage(10, 20, 90, 100, 200)).toEqual([80, 10]);
        expect(visualToPage(10, 20, 180, 100, 200)).toEqual([90, 180]);
        expect(visualToPage(10, 20, 270, 100, 200)).toEqual([20, 190]);
    });
});
