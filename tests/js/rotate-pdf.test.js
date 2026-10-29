import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { process } from '../../resources/js/tools/rotate-pdf.js';
import { makePdf } from './helpers.js';

const rotations = async (blob) => (await PDFDocument.load(await blob.arrayBuffer())).getPages().map((page) => page.getRotation().angle);

describe('rotate-pdf', () => {
    it('rotates every page by default', async () => {
        const [result] = await process([await makePdf(3)], { angle: 90 });

        expect(result.name).toBe('sample-rotated.pdf');
        expect(await rotations(result.blob)).toEqual([90, 90, 90]);
    });

    it.each([90, 180, 270])('supports %i degrees', async (angle) => {
        const [result] = await process([await makePdf(1)], { angle });

        expect(await rotations(result.blob)).toEqual([angle]);
    });

    it('rotates only the selected pages', async () => {
        const [result] = await process([await makePdf(5)], { angle: 180, scope: 'selected', pages: '2, 4-5' });

        expect(await rotations(result.blob)).toEqual([0, 180, 0, 180, 180]);
    });

    it('adds to a rotation the page already has and wraps around', async () => {
        const [first] = await process([await makePdf(1)], { angle: 270 });
        const [second] = await process([new File([await first.blob.arrayBuffer()], 'again.pdf')], { angle: 180 });

        expect(await rotations(second.blob)).toEqual([90]);
    });

    it('does not change the page count or size', async () => {
        const [result] = await process([await makePdf(2, { width: 210, height: 297 })], { angle: 90 });
        const pdf = await PDFDocument.load(await result.blob.arrayBuffer());

        expect(pdf.getPageCount()).toBe(2);
        expect(pdf.getPage(0).getSize()).toEqual({ width: 210, height: 297 });
    });

    it('validates input', async () => {
        const pdf = await makePdf(2);

        await expect(process([pdf], { angle: 45 })).rejects.toThrow('90, 180 or 270');
        await expect(process([pdf], { scope: 'some' })).rejects.toThrow('which pages');
        await expect(process([pdf], { scope: 'selected', pages: '' })).rejects.toThrow('Enter the pages');
        await expect(process([pdf], { scope: 'selected', pages: '7' })).rejects.toThrow('between 1 and 2');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([new File(['%PDF-1.4 junk'], 'x.pdf')], {})).rejects.toThrow('could not be read');
    });
});
