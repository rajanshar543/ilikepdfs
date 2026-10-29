import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import * as jpgToPdf from '../../resources/js/tools/jpg-to-pdf.js';
import * as pngToPdf from '../../resources/js/tools/png-to-pdf.js';
import { makeImageFile, pageCountOf, useNodeCanvas } from './helpers.js';

beforeAll(useNodeCanvas);

const sizes = async (blob) => {
    const pdf = await PDFDocument.load(await blob.arrayBuffer());

    return pdf.getPages().map((page) => page.getSize());
};

describe.each([
    ['jpg-to-pdf', jpgToPdf, 'image/jpeg', 'a.jpg', 'jpeg'],
    ['png-to-pdf', pngToPdf, 'image/png', 'a.png', 'png'],
])('%s', (_name, tool, type, filename, kind) => {
    it('accepts only its own image kind', () => {
        expect(tool.kinds).toEqual([kind]);
    });

    it('makes one page per image, in order, sized like the image by default', async () => {
        const files = [
            makeImageFile(type, filename, { width: 200, height: 100 }),
            makeImageFile(type, filename, { width: 80, height: 160 }),
        ];
        const [result] = await tool.process(files);

        expect(result.name).toBe('images.pdf');
        expect(result.blob.type).toBe('application/pdf');
        expect(await sizes(result.blob)).toEqual([{ width: 150, height: 75 }, { width: 60, height: 120 }]);
    });

    it('fits onto A4, switching to landscape for wide images', async () => {
        const [result] = await tool.process(
            [makeImageFile(type, filename, { width: 300, height: 100 }), makeImageFile(type, filename, { width: 100, height: 300 })],
            { pageSize: 'a4' },
        );
        const [wide, tall] = await sizes(result.blob);

        expect(wide.width).toBeCloseTo(841.89);
        expect(tall.width).toBeCloseTo(595.28);
    });

    it('can force an orientation and a US Letter page', async () => {
        const [result] = await tool.process([makeImageFile(type, filename, { width: 100, height: 300 })], { pageSize: 'letter', orientation: 'landscape' });

        expect(await sizes(result.blob)).toEqual([{ width: 792, height: 612 }]);
    });

    it('adds the margin to a "same as image" page', async () => {
        const [result] = await tool.process([makeImageFile(type, filename, { width: 100, height: 100 })], { margin: 'big' });

        expect(await sizes(result.blob)).toEqual([{ width: 155, height: 155 }]);
    });

    it('reports progress and handles many images', async () => {
        const seen = [];
        const files = Array.from({ length: 12 }, () => makeImageFile(type, filename, { width: 40, height: 40 }));
        const [result] = await tool.process(files, {}, (fraction) => seen.push(fraction));

        expect(await pageCountOf(result.blob)).toBe(12);
        expect(seen.at(-1)).toBeLessThanOrEqual(1);
    });

    it('rejects empty input and invalid options', async () => {
        const file = makeImageFile(type, filename);

        await expect(tool.process([])).rejects.toThrow('at least one image');
        await expect(tool.process([file], { pageSize: 'a0' })).rejects.toThrow('page size');
        await expect(tool.process([file], { orientation: 'sideways' })).rejects.toBeInstanceOf(ToolError);
        await expect(tool.process([file], { margin: 'huge' })).rejects.toBeInstanceOf(ToolError);
    });

    it('reports an unreadable image by name', async () => {
        const broken = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'broken.img', { type });

        await expect(tool.process([broken])).rejects.toThrow('"broken.img" could not be read');
    });
});

describe('png-to-pdf', () => {
    it('keeps transparent PNGs working', async () => {
        const [result] = await pngToPdf.process([makeImageFile('image/png', 't.png', { transparent: true })]);

        expect(await pageCountOf(result.blob)).toBe(1);
    });
});
