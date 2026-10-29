import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument, degrees } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { process } from '../../resources/js/tools/page-numbers.js';
import { makePdf, pageCountOf } from './helpers.js';

beforeAll(() => setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`));

/** Text of a page with its position as the viewer shows it (origin top-left). */
async function viewItems(blob, pageNumber = 1) {
    const doc = await openPdf(blob);
    const page = await doc.getPage(pageNumber);
    const view = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    return {
        width: view.width,
        height: view.height,
        items: content.items.filter((item) => item.str.trim() !== '').map((item) => {
            const [x, y] = view.convertToViewportPoint(item.transform[4], item.transform[5]);

            return { text: item.str, x, y, w: item.width };
        }),
    };
}

const numberOf = (items, wanted) => items.find((item) => item.text === wanted);

describe('page-numbers', () => {
    it('numbers every page 1..n at the bottom centre', async () => {
        const [result] = await process([await makePdf(3, { width: 300, height: 400 })], {});

        expect(result.name).toBe('sample-numbered.pdf');
        expect(await pageCountOf(result.blob)).toBe(3);

        for (const n of [1, 2, 3]) {
            const { items, width, height } = await viewItems(result.blob, n);
            const label = items.find((item) => item.text === String(n));

            expect(label).toBeDefined();
            expect(label.y).toBeGreaterThan(height - 60);
            expect(Math.abs(label.x + label.w / 2 - width / 2)).toBeLessThan(2);
        }
    });

    it.each([
        ['top-left', (x, y, w, h) => x < 60 && y < 60],
        ['top-right', (x, y, w, h) => x > w - 70 && y < 60],
        ['bottom-right', (x, y, w, h) => x > w - 70 && y > h - 60],
        ['bottom-left', (x, y, w, h) => x < 60 && y > h - 60],
        ['top-center', (x, y, w, h) => Math.abs(x - w / 2) < 20 && y < 60],
    ])('places numbers at %s', async (position, check) => {
        const [result] = await process([await makePdf(1, { width: 300, height: 400 })], { position });
        const { items, width, height } = await viewItems(result.blob);
        const label = items.find((item) => item.text === '1');

        expect(check(label.x, label.y, width, height)).toBe(true);
    });

    it('supports formats and a custom first number', async () => {
        const [result] = await process([await makePdf(3)], { format: 'page-of', start: 5 });

        expect(numberOf((await viewItems(result.blob, 1)).items, 'Page 5 of 7')).toBeDefined();
        expect(numberOf((await viewItems(result.blob, 3)).items, 'Page 7 of 7')).toBeDefined();

        const [slash] = await process([await makePdf(2)], { format: 'number-of' });
        expect(numberOf((await viewItems(slash.blob, 2)).items, '2 / 2')).toBeDefined();
    });

    it('numbers only the selected pages and starts counting there', async () => {
        const [result] = await process([await makePdf(4)], { scope: 'selected', pages: '2-3' });

        expect((await viewItems(result.blob, 1)).items.some((item) => item.text === '1')).toBe(false);
        expect(numberOf((await viewItems(result.blob, 2)).items, '1')).toBeDefined();
        expect(numberOf((await viewItems(result.blob, 3)).items, '2')).toBeDefined();
        expect((await viewItems(result.blob, 4)).items.some((item) => /^\d$/.test(item.text) && item.text !== '4')).toBe(false);
    });

    it('stays at the visual bottom on rotated pages', async () => {
        const source = await PDFDocument.load(await (await makePdf(1, { width: 300, height: 400 })).arrayBuffer());
        source.getPage(0).setRotation(degrees(90));
        const [result] = await process([new File([await source.save()], 'r.pdf')], {});
        const { items, width, height } = await viewItems(result.blob);
        const label = items.find((item) => item.text === '1');

        expect(width).toBe(400);
        expect(label.y).toBeGreaterThan(height - 60);
        expect(Math.abs(label.x - width / 2)).toBeLessThan(25);
    });

    it('validates input', async () => {
        const pdf = await makePdf(2);

        await expect(process([pdf], { position: 'middle' })).rejects.toThrow('valid page number options');
        await expect(process([pdf], { start: -1 })).rejects.toThrow('first number');
        await expect(process([pdf], { start: 1.5 })).rejects.toThrow('first number');
        await expect(process([pdf], { scope: 'selected', pages: '9' })).rejects.toThrow('between 1 and 2');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
    });
});
