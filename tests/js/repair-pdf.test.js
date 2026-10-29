import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { setQpdfLocator } from '../../resources/js/core/qpdf.js';
import { process as protectPdf } from '../../resources/js/tools/protect-pdf.js';
import { process as repair } from '../../resources/js/tools/repair-pdf.js';
import { makePdf, pageCountOf, useNodeCanvas } from './helpers.js';

beforeAll(() => {
    useNodeCanvas();
    const require = createRequire(import.meta.url);
    setQpdfLocator(() => require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
    setPdfjsAssetBase(`${path.dirname(require.resolve('pdfjs-dist/package.json'))}/`);
});

const bytesOf = async (file) => new Uint8Array(await file.arrayBuffer());

/** A classic PDF (plain objects, readable xref table) so that damage to the tail is recoverable. */
async function classicPdf(pages) {
    const pdf = await PDFDocument.load(await (await makePdf(pages)).arrayBuffer());

    return new Uint8Array(await pdf.save({ useObjectStreams: false }));
}
const asFile = (bytes, name = 'broken.pdf') => new File([bytes], name, { type: 'application/pdf' });
const textOf = async (blob, page = 1) => {
    const doc = await openPdf(blob);

    return (await (await doc.getPage(page)).getTextContent()).items.map((item) => item.str).join(' ');
};

describe('repair-pdf', () => {
    it('recovers a PDF whose end (xref table and trailer) was cut off', async () => {
        const bytes = await classicPdf(3);
        const text = new TextDecoder('latin1').decode(bytes);
        const cut = bytes.slice(0, text.lastIndexOf('xref'));
        const [result] = await repair([asFile(cut)]);

        expect(result.name).toBe('broken-repaired.pdf');
        expect(result.note).toMatch(/structure repaired|skipped/i);
        expect(await pageCountOf(result.blob)).toBe(3);
        expect(await textOf(result.blob, 2)).toContain('Page 2');
    });

    it('recovers a PDF with wrong cross-reference offsets', async () => {
        const text = new TextDecoder('latin1').decode(await classicPdf(2));
        const broken = text.replace(/startxref\s+\d+/, 'startxref\n99999');
        const [result] = await repair([asFile(Uint8Array.from(broken, (char) => char.charCodeAt(0)))]);

        expect(await pageCountOf(result.blob)).toBe(2);
    });

    it('recovers a PDF with junk in front of the header', async () => {
        const bytes = await classicPdf(2);
        const junk = new TextEncoder().encode('GARBAGE\n\n');
        const [result] = await repair([asFile(new Uint8Array([...junk, ...bytes]))]);

        expect(await pageCountOf(result.blob)).toBe(2);
    });

    it('rebuilds pages as images on request and says so', async () => {
        const [result] = await repair([await makePdf(2)], { rebuild: true });

        expect(result.note).toBe('2 of 2 pages rebuilt as images. Text can no longer be selected.');
        expect(await pageCountOf(result.blob)).toBe(2);
        expect(await textOf(result.blob)).not.toContain('Page 1');
    });

    it('leaves a healthy PDF intact', async () => {
        const [result] = await repair([await makePdf(2)]);

        expect(await textOf(result.blob)).toContain('Page 1');
    });

    it('gives up clearly on files that are not recoverable, and on locked ones', async () => {
        await expect(repair([asFile(new TextEncoder().encode('%PDF-1.4\nthis is not really a pdf at all'))])).rejects.toThrow('too damaged to recover');
        await expect(repair([], {})).rejects.toBeInstanceOf(ToolError);

        const [locked] = await protectPdf([await makePdf(1)], { password: 'secret1', confirm: 'secret1' });
        await expect(repair([asFile(new Uint8Array(await locked.blob.arrayBuffer()), 'l.pdf')])).rejects.toThrow('password protected');
    });
});
