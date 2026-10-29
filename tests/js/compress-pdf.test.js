import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { setQpdfLocator } from '../../resources/js/core/qpdf.js';
import { process } from '../../resources/js/tools/compress-pdf.js';
import { makePdf, pageCountOf, useNodeCanvas } from './helpers.js';
import { createCanvas } from '@napi-rs/canvas';

beforeAll(() => {
    useNodeCanvas();
    const require = createRequire(import.meta.url);
    const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
    setQpdfLocator(() => wasm);
    setPdfjsAssetBase(`${path.dirname(require.resolve('pdfjs-dist/package.json'))}/`);
});

/** A PDF with selectable text and a large, noisy (hard to compress) JPEG photo. */
async function photoPdf() {
    const canvas = createCanvas(1600, 1200);
    const context = canvas.getContext('2d');

    for (let y = 0; y < 1200; y += 4) {
        for (let x = 0; x < 1600; x += 4) {
            context.fillStyle = `rgb(${(x * 7 + y * 3) % 256},${(x * 5 + y * 11) % 256},${(x * y) % 256})`;
            context.fillRect(x, y, 4, 4);
        }
    }

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const photo = await pdf.embedJpg(canvas.toBuffer('image/jpeg', 98));
    const page = pdf.addPage([400, 300]);
    page.drawImage(photo, { x: 0, y: 0, width: 400, height: 300 });
    page.drawText('Quarterly report', { x: 20, y: 270, size: 22, font });

    return new File([await pdf.save()], 'photo.pdf', { type: 'application/pdf' });
}

const textOf = async (blob) => {
    const doc = await openPdf(blob);
    const content = await (await doc.getPage(1)).getTextContent();

    return content.items.map((item) => item.str).join(' ');
};

describe('compress-pdf', () => {
    it('recommended: shrinks a photo PDF but keeps the text selectable', async () => {
        const file = await photoPdf();
        const [result] = await process([file], { level: 'recommended' });

        expect(result.blob.size).toBeLessThan(file.size * 0.6);
        expect(result.name).toBe('photo-compressed.pdf');
        expect(result.note).toMatch(/\d+% smaller/);
        expect(await pageCountOf(result.blob)).toBe(1);
        expect(await textOf(result.blob)).toContain('Quarterly report');
    });

    it('extreme: gives the smallest file and turns the page into an image', async () => {
        const file = await photoPdf();
        const [recommended] = await process([file], { level: 'recommended' });
        const [extreme] = await process([file], { level: 'extreme' });

        expect(extreme.blob.size).toBeLessThan(file.size);
        expect(await pageCountOf(extreme.blob)).toBe(1);
        expect(await textOf(extreme.blob)).not.toContain('Quarterly');
        expect(extreme.blob.size).toBeLessThanOrEqual(recommended.blob.size * 1.5);
    });

    it('extreme: keeps the page size', async () => {
        const [result] = await process([await photoPdf()], { level: 'extreme' });
        const pdf = await PDFDocument.load(await result.blob.arrayBuffer());

        expect(pdf.getPage(0).getSize()).toEqual({ width: 400, height: 300 });
    });

    it('low: is lossless and never makes a file bigger', async () => {
        const file = await photoPdf();
        const [result] = await process([file], { level: 'low' });

        expect(result.blob.size).toBeLessThanOrEqual(file.size);
        expect(await textOf(result.blob)).toContain('Quarterly report');
    });

    it('returns the original untouched when it cannot be improved', async () => {
        const file = await makePdf(1);
        const [result] = await process([file], { level: 'low' });

        if (result.note?.startsWith('Already')) {
            expect(result.name).toBe('sample.pdf');
            expect(result.blob.size).toBe(file.size);
        } else {
            expect(result.blob.size).toBeLessThan(file.size);
        }
    });

    it('rejects bad input', async () => {
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([await makePdf(1)], { level: 'ultra' })).rejects.toThrow('Choose a compression level');
        await expect(process([new File(['%PDF-1.4 junk'], 'x.pdf')], {})).rejects.toThrow('could not be read');
    });
});
