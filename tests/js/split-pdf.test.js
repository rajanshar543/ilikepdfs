import { describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { parsePageRanges } from '../../resources/js/core/pdf.js';
import { process } from '../../resources/js/tools/split-pdf.js';
import { makePdf, pageCountOf } from './helpers.js';

describe('parsePageRanges', () => {
    it('parses singles, ranges and open ranges', () => {
        expect(parsePageRanges('1-3, 5, 8-', 10)).toEqual([0, 1, 2, 4, 7, 8, 9]);
        expect(parsePageRanges('-3', 10)).toEqual([0, 1, 2]);
        expect(parsePageRanges('3,1,3', 10)).toEqual([0, 2]);
        expect(parsePageRanges(' 2 - 4 ', 10)).toEqual([1, 2, 3]);
    });

    it.each(['', '   ', 'a', '1-x', '0', '11', '5-3', '1,,2', '--', '1-2-3', '-', '1.5', '１'])('rejects %j', (value) => {
        expect(() => parsePageRanges(value, 10)).toThrow(ToolError);
    });
});

describe('split-pdf', () => {
    it('splits every page into its own PDF', async () => {
        const result = await process([await makePdf(3)], { mode: 'each' });

        expect(result.map((entry) => entry.name)).toEqual(['sample-page-1.pdf', 'sample-page-2.pdf', 'sample-page-3.pdf']);

        for (const entry of result) {
            expect(await pageCountOf(entry.blob)).toBe(1);
        }
    });

    it('splits by ranges into separate files', async () => {
        const result = await process([await makePdf(6)], { mode: 'ranges', ranges: '1-2, 4, 5-' });

        expect(result.map((entry) => entry.name)).toEqual(['sample-pages-1-2.pdf', 'sample-pages-4.pdf', 'sample-pages-5-.pdf']);
        expect(await Promise.all(result.map((entry) => pageCountOf(entry.blob)))).toEqual([2, 1, 2]);
    });

    it('extracts pages into one PDF', async () => {
        const [result] = await process([await makePdf(6)], { mode: 'extract', ranges: '2-3,6' });

        expect(result.name).toBe('sample-extracted.pdf');
        expect(await pageCountOf(result.blob)).toBe(3);
    });

    it('refuses to split a one-page PDF in "each" mode', async () => {
        await expect(process([await makePdf(1)], { mode: 'each' })).rejects.toThrow('only one page');
    });

    it('validates ranges against the real page count', async () => {
        const pdf = await makePdf(3);

        await expect(process([pdf], { mode: 'extract', ranges: '2-9' })).rejects.toThrow('between 1 and 3');
        await expect(process([pdf], { mode: 'ranges', ranges: '' })).rejects.toThrow('Enter the pages');
        await expect(process([pdf], { mode: 'ranges', ranges: '1,x' })).rejects.toThrow('not a valid page range');
    });

    it('rejects unknown modes and wrong file counts', async () => {
        const pdf = await makePdf(3);

        await expect(process([pdf], { mode: 'bogus' })).rejects.toThrow('Choose how');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([pdf, pdf], {})).rejects.toBeInstanceOf(ToolError);
    });

    it('uses a safe output name even for a hostile file name', async () => {
        const pdf = await makePdf(2);
        const hostile = new File([await pdf.arrayBuffer()], '../../x<y>.pdf');
        const result = await process([hostile], { mode: 'each' });

        expect(result[0].name).toBe('xy-page-1.pdf');
    });
});
