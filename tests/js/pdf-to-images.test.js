import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import * as pdfToJpg from '../../resources/js/tools/pdf-to-jpg.js';
import * as pdfToPng from '../../resources/js/tools/pdf-to-png.js';
import { head, imageSizeOf, makePdf, useNodeCanvas } from './helpers.js';

beforeAll(() => {
    useNodeCanvas();
    setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`);
});

describe('pdf-to-jpg', () => {
    it('makes one real JPG per page, named after the PDF', async () => {
        const result = await pdfToJpg.process([await makePdf(3, { width: 200, height: 100 })], { dpi: 72 });

        expect(result.map((entry) => entry.name)).toEqual(['sample-page-1.jpg', 'sample-page-2.jpg', 'sample-page-3.jpg']);

        for (const entry of result) {
            expect(Array.from(await head(entry.blob, 3))).toEqual([0xff, 0xd8, 0xff]);
            expect(await imageSizeOf(entry.blob)).toEqual({ width: 200, height: 100 });
        }
    });

    it('scales with the chosen resolution', async () => {
        const [result] = await pdfToJpg.process([await makePdf(1, { width: 144, height: 72 })], { dpi: 150, pages: '1' });
        const size = await imageSizeOf(result.blob);

        expect(size.width).toBeCloseTo(300, -1);
        expect(size.height).toBeCloseTo(150, -1);
    });

    it('lower quality gives a smaller file', async () => {
        const pdf = await makePdf(1, { width: 400, height: 400 });
        const [small] = await pdfToJpg.process([pdf], { dpi: 150, quality: 0.2 });
        const [best] = await pdfToJpg.process([pdf], { dpi: 150, quality: 1 });

        expect(small.blob.size).toBeLessThan(best.blob.size);
    });

    it('converts only the pages asked for', async () => {
        const result = await pdfToJpg.process([await makePdf(5)], { dpi: 72, pages: '2, 4-5' });

        expect(result.map((entry) => entry.name)).toEqual(['sample-page-2.jpg', 'sample-page-4.jpg', 'sample-page-5.jpg']);
    });

    it('validates options and input', async () => {
        const pdf = await makePdf(2);

        await expect(pdfToJpg.process([pdf], { dpi: 999 })).rejects.toThrow('image quality');
        await expect(pdfToJpg.process([pdf], { quality: 5 })).rejects.toThrow('JPG quality');
        await expect(pdfToJpg.process([pdf], { pages: '9' })).rejects.toThrow('between 1 and 2');
        await expect(pdfToJpg.process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(pdfToJpg.process([new File(['%PDF-1.4 x'], 'b.pdf')], {})).rejects.toThrow('could not be read');
    });

    it('reports progress', async () => {
        const seen = [];
        await pdfToJpg.process([await makePdf(2)], { dpi: 72 }, (fraction) => seen.push(fraction));

        expect(seen).toHaveLength(2);
    });
});

describe('pdf-to-png', () => {
    it('makes lossless PNG files', async () => {
        const result = await pdfToPng.process([await makePdf(2, { width: 120, height: 60 })], { dpi: 72 });

        expect(result.map((entry) => entry.name)).toEqual(['sample-page-1.png', 'sample-page-2.png']);
        expect(Array.from(await head(result[0].blob, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
        expect(await imageSizeOf(result[0].blob)).toEqual({ width: 120, height: 60 });
    });
});
