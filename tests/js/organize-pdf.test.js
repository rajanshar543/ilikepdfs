import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { process, readOptions, resetArrangement } from '../../resources/js/tools/organize-pdf.js';
import { makePdf } from './helpers.js';

/** Pages of different sizes, so the order of the result can be checked from the sizes. */
async function sizedPdf(sizes, name = 'a.pdf') {
    const pdf = await PDFDocument.create();
    sizes.forEach(([width, height]) => pdf.addPage([width, height]));

    return new File([await pdf.save()], name, { type: 'application/pdf' });
}

const info = async (blob) => (await PDFDocument.load(await blob.arrayBuffer())).getPages().map((page) => ({ ...page.getSize(), rotation: page.getRotation().angle }));

describe('organize-pdf', () => {
    it('keeps every page in order when no arrangement is given', async () => {
        const [result] = await process([await sizedPdf([[100, 100], [200, 200], [300, 300]])]);

        expect((await info(result.blob)).map((page) => page.width)).toEqual([100, 200, 300]);
    });

    it('reorders, removes and rotates pages', async () => {
        const file = await sizedPdf([[100, 100], [200, 200], [300, 300]]);
        const [result] = await process([file], { pages: [{ file: 0, page: 2, rotate: 0 }, { file: 0, page: 0, rotate: 90 }] });
        const pages = await info(result.blob);

        expect(pages.map((page) => page.width)).toEqual([300, 100]);
        expect(pages.map((page) => page.rotation)).toEqual([0, 90]);
        expect(result.note).toBe('2 pages');
    });

    it('adds pages from other files and can repeat a page', async () => {
        const a = await sizedPdf([[100, 100], [110, 110]], 'a.pdf');
        const b = await sizedPdf([[500, 500]], 'b.pdf');
        const [result] = await process([a, b], { pages: [{ file: 1, page: 0, rotate: 0 }, { file: 0, page: 1, rotate: 0 }, { file: 0, page: 1, rotate: 180 }] });

        expect((await info(result.blob)).map((page) => page.width)).toEqual([500, 110, 110]);
    });

    it('adds to a rotation the page already has', async () => {
        const rotated = await PDFDocument.load(await (await sizedPdf([[100, 100]])).arrayBuffer());
        rotated.getPage(0).setRotation({ type: 'degrees', angle: 270 });
        const file = new File([await rotated.save()], 'r.pdf');
        const [result] = await process([file], { pages: [{ file: 0, page: 0, rotate: 180 }] });

        expect((await info(result.blob))[0].rotation).toBe(90);
    });

    it('collects the arrangement from the page grid state', () => {
        resetArrangement();

        expect(readOptions()).toEqual({ pages: [] });
    });

    it('rejects invalid arrangements and input', async () => {
        const file = await makePdf(2);

        await expect(process([file], { pages: [] })).rejects.toThrow('at least one page');
        await expect(process([file], { pages: [{ file: 0, page: 5, rotate: 0 }] })).rejects.toThrow('not valid');
        await expect(process([file], { pages: [{ file: 3, page: 0, rotate: 0 }] })).rejects.toThrow('not valid');
        await expect(process([file], { pages: [{ file: 0, page: 0, rotate: 45 }] })).rejects.toThrow('not valid');
        await expect(process([file], { pages: [{ file: 0, page: -1, rotate: 0 }] })).rejects.toThrow('not valid');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([new File(['%PDF-1.4 junk'], 'x.pdf')], {})).rejects.toThrow('could not be read');
    });
});
