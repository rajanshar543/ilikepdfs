import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { runQpdf, setQpdfLocator } from '../../resources/js/core/qpdf.js';
import { process } from '../../resources/js/tools/pdf-workflow.js';
import { makePdf, useDiskFonts, useNodeCanvas } from './helpers.js';

beforeAll(async () => {
    useNodeCanvas();
    const require = createRequire(import.meta.url);
    setQpdfLocator(() => require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
    setPdfjsAssetBase(`${path.dirname(require.resolve('pdfjs-dist/package.json'))}/`);
    await useDiskFonts();
});

const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

async function pagesText(blob) {
    const doc = await openPdf(blob);
    const texts = [];

    for (let number = 1; number <= doc.numPages; number += 1) {
        texts.push((await (await doc.getPage(number)).getTextContent()).items.map((item) => item.str).join(' '));
    }

    return texts;
}

describe('pdf-workflow process', () => {
    it('runs merge, page numbers, compress and protect in one go', async () => {
        const [result] = await process([await makePdf(2, { label: 'A' }), await makePdf(1, { label: 'B' })], { steps: [
            { type: 'merge' },
            { type: 'page-numbers', options: { format: 'page-of' } },
            { type: 'compress', options: { level: 'recommended' } },
            { type: 'protect', options: { password: 'secret1' } },
        ] });

        expect(result.name).toBe('sample-processed.pdf');
        expect(result.note).toBe('Merge into one PDF → Add page numbers → Compress → Protect with a password');
        await expect(PDFDocument.load(await bytes(result.blob))).rejects.toThrow(/encrypted/i);

        const opened = await runQpdf(await bytes(result.blob), ['--decrypt'], { before: ['--password=secret1'] });
        const texts = await pagesText(new Blob([opened]));

        expect(texts).toHaveLength(3);
        expect(texts[0]).toContain('A 1');
        expect(texts[0]).toContain('Page 1 of 3');
        expect(texts[2]).toContain('B 1');
        expect(texts[2]).toContain('Page 3 of 3');
    });

    it('can protect and then unlock again', async () => {
        const [result] = await process([await makePdf(2)], { steps: [{ type: 'protect', options: { password: 'secret1' } }, { type: 'unlock', options: { password: 'secret1' } }] });

        expect((await PDFDocument.load(await bytes(result.blob))).getPageCount()).toBe(2);
    });

    it('rotates and watermarks', async () => {
        const [result] = await process([await makePdf(1)], { steps: [{ type: 'rotate', options: { angle: '90' } }, { type: 'watermark', options: { text: 'DRAFT' } }] });
        const pdf = await PDFDocument.load(await bytes(result.blob));

        expect(pdf.getPage(0).getRotation().angle).toBe(90);
        expect((await pagesText(result.blob))[0]).toContain('DRAFT');
    });

    it('reports progress for every step', async () => {
        const seen = [];
        await process([await makePdf(1)], { steps: [{ type: 'rotate' }, { type: 'page-numbers' }] }, (fraction, text) => seen.push(text));

        expect(seen.some((text) => text.startsWith('Step 1 of 2'))).toBe(true);
        expect(seen.some((text) => text.startsWith('Step 2 of 2'))).toBe(true);
    });

    it('explains the order rules and rejects bad workflows', async () => {
        const pdf = await makePdf(1);

        await expect(process([pdf, pdf], { steps: [{ type: 'rotate' }] })).rejects.toThrow('start the workflow with "Merge');
        await expect(process([pdf], { steps: [{ type: 'merge' }] })).rejects.toThrow('at least two');
        await expect(process([pdf], { steps: [] })).rejects.toThrow('at least one step');
        await expect(process([pdf], { steps: [{ type: 'format-disk' }] })).rejects.toThrow('not valid');
        await expect(process([pdf], { steps: [null] })).rejects.toThrow('not valid');
        await expect(process([pdf], { steps: Array.from({ length: 9 }, () => ({ type: 'rotate' })) })).rejects.toThrow('at most 8');
        await expect(process([], { steps: [{ type: 'rotate' }] })).rejects.toBeInstanceOf(ToolError);
        await expect(process([pdf], { steps: [{ type: 'protect', options: { password: 'ab' } }] })).rejects.toThrow('at least 4');
    });
});

