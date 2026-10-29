import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { process } from '../../resources/js/tools/merge-pdf.js';
import { makePdf, pageCountOf } from './helpers.js';

const textOfPage = async (blob, index) => {
    const pdf = await PDFDocument.load(await blob.arrayBuffer());

    return pdf.getPage(index).getSize();
};

describe('merge-pdf', () => {
    it('merges PDFs into one with all pages in the given order', async () => {
        const a = await makePdf(2, { width: 200, height: 300 });
        const b = await makePdf(3, { width: 400, height: 500 });

        const [result] = await process([a, b]);

        expect(result.name).toBe('merged.pdf');
        expect(result.blob.type).toBe('application/pdf');
        expect(await pageCountOf(result.blob)).toBe(5);
        expect(await textOfPage(result.blob, 0)).toEqual({ width: 200, height: 300 });
        expect(await textOfPage(result.blob, 4)).toEqual({ width: 400, height: 500 });
    });

    it('respects the order of the files', async () => {
        const small = await makePdf(1, { width: 100, height: 100 });
        const big = await makePdf(1, { width: 500, height: 500 });

        const [result] = await process([big, small]);

        expect(await textOfPage(result.blob, 0)).toEqual({ width: 500, height: 500 });
        expect(await textOfPage(result.blob, 1)).toEqual({ width: 100, height: 100 });
    });

    it('can merge the same file twice', async () => {
        const a = await makePdf(2);
        const [result] = await process([a, a]);

        expect(await pageCountOf(result.blob)).toBe(4);
    });

    it('reports progress', async () => {
        const seen = [];
        await process([await makePdf(1), await makePdf(1)], {}, (fraction) => seen.push(fraction));

        expect(seen.length).toBeGreaterThanOrEqual(3);
        expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    });

    it('needs at least two files', async () => {
        await expect(process([await makePdf(1)])).rejects.toThrow('at least two');
        await expect(process([])).rejects.toBeInstanceOf(ToolError);
    });

    it('gives a clear error for a damaged PDF', async () => {
        const broken = new File(['%PDF-1.4 not really a pdf'], 'broken.pdf');

        await expect(process([await makePdf(1), broken])).rejects.toThrow('"broken.pdf" could not be read');
    });

    it('gives a clear error for a password protected PDF', async () => {
        const encrypted = new File([await encryptedPdfBytes()], 'locked.pdf');

        await expect(process([await makePdf(1), encrypted])).rejects.toThrow('"locked.pdf" is password protected');
    });
});

/** Smallest hand-made PDF that carries an /Encrypt entry. */
async function encryptedPdfBytes() {
    const body = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
        + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n'
        + '4 0 obj<</Filter/Standard/V 1/R 2/O(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)/U(bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)/P -4>>endobj\n'
        + 'trailer<</Size 5/Root 1 0 R/Encrypt 4 0 R/ID[<00><00>]>>\n%%EOF';

    return new TextEncoder().encode(body);
}
