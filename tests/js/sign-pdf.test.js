import { createRequire } from 'node:module';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, renderPage, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { signatureFromCanvas, signatureFromText, trimCanvas } from '../../resources/js/core/signature.js';
import { process } from '../../resources/js/tools/sign-pdf.js';
import { head, makePdf, useDiskFonts, useNodeCanvas } from './helpers.js';

beforeAll(async () => {
    useNodeCanvas();
    setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`);
    await useDiskFonts();
});

function inkCanvas() {
    const canvas = createCanvas(300, 120);
    const context = canvas.getContext('2d');
    context.strokeStyle = '#000000';
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(60, 40);
    context.lineTo(200, 80);
    context.stroke();

    return canvas;
}

describe('signature pictures', () => {
    it('trims a drawn signature to its ink and keeps it transparent', async () => {
        const { bytes, width, height } = await signatureFromCanvas(inkCanvas());

        expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
        expect(width).toBeLessThan(200);
        expect(width).toBeGreaterThan(140);
        expect(height).toBeLessThan(70);
    });

    it('rejects an empty pad', async () => {
        expect(trimCanvas(createCanvas(50, 50))).toBeNull();
        await expect(signatureFromCanvas(createCanvas(50, 50))).rejects.toThrow('Draw your signature first');
    });

    it('renders a typed name', async () => {
        const { bytes, width, height } = await signatureFromText('Asha Verma', 'plain', '#1d4ed8');

        expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
        expect(width).toBeGreaterThan(height);
    });

    it('validates typed names', async () => {
        await expect(signatureFromText('   ')).rejects.toThrow('Type your name');
        await expect(signatureFromText('x'.repeat(61))).rejects.toThrow('at most 60');
        await expect(signatureFromText('Asha', 'comic')).rejects.toThrow('valid style');
    });
});

describe('sign-pdf', () => {
    it('places the signature where it was put and keeps the page', async () => {
        const signature = await signatureFromCanvas(inkCanvas());
        const [result] = await process([await makePdf(2, { width: 400, height: 300 })], { items: [{ type: 'signature', page: 0, x: 200, y: 180, w: signature.width, h: signature.height, bytes: signature.bytes }] });
        const doc = await openPdf(result.blob);
        const { canvas } = await renderPage(await doc.getPage(1), 1);
        const dark = (x, y) => canvas.getContext('2d').getImageData(x, y, 1, 1).data[0] < 100;

        expect(result.name).toBe('sample-signed.pdf');
        expect(doc.numPages).toBe(2);
        expect(Array.from(await head(result.blob, 4))).toEqual([0x25, 0x50, 0x44, 0x46]);
        // The stroke runs from the top-left to the bottom-right of the signature box.
        expect(dark(200 + 12, 180 + 6) || dark(200 + 14, 180 + 8) || dark(200 + 20, 180 + 10)).toBe(true);
        expect(dark(10, 290)).toBe(false);
    });

    it('requires a placed signature and only accepts signatures', async () => {
        const pdf = await makePdf(1);

        await expect(process([pdf], { items: [] })).rejects.toThrow('Create your signature');
        await expect(process([pdf], { items: [{ type: 'rect', page: 0, x: 0, y: 0, w: 5, h: 5 }] })).rejects.toThrow('Only signatures');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
    });
});
