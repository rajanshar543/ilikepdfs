import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, renderPage, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { head, makePdf, useNodeCanvas } from './helpers.js';

beforeAll(() => {
    useNodeCanvas();
    const root = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
    setPdfjsAssetBase(`${root}/`);
});

describe('pdf.js wrapper', () => {
    it('opens a PDF and renders a page to a canvas with text drawn on it', async () => {
        const doc = await openPdf(await makePdf(2, { width: 300, height: 400 }));
        expect(doc.numPages).toBe(2);

        const page = await doc.getPage(1);
        const { canvas, width, height } = await renderPage(page, 2);

        expect(width).toBe(300);
        expect(height).toBe(400);
        expect(canvas.width).toBe(600);

        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const hasInk = pixels.some((value, index) => index % 4 === 0 && value < 100);
        expect(hasInk).toBe(true);
        expect(Array.from(await head(new Blob([canvas.toBuffer('image/png')]), 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });

    it('reports a damaged PDF as a ToolError', async () => {
        await expect(openPdf(new File(['%PDF-1.4 garbage'], 'bad.pdf'))).rejects.toBeInstanceOf(ToolError);
    });

    it('shrinks the scale instead of exhausting memory on huge pages', async () => {
        const doc = await openPdf(await makePdf(1, { width: 14400, height: 14400 }));
        const { canvas } = await renderPage(await doc.getPage(1), 4);

        expect(canvas.width * canvas.height).toBeLessThanOrEqual(40_000_000 + 20_000);
    });
});
