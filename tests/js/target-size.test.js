import { createRequire } from 'node:module';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { decodeImage } from '../../resources/js/core/canvas.js';
import { jpegUnder } from '../../resources/js/core/imageSize.js';
import { setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { setQpdfLocator } from '../../resources/js/core/qpdf.js';
import { process as imageToSize } from '../../resources/js/tools/compress-image-to-size.js';
import { process as pdfToSize } from '../../resources/js/tools/compress-pdf-to-size.js';
import { process as photoResize, targetPixels, PRESETS } from '../../resources/js/tools/photo-signature-resize.js';
import { head, imageSizeOf, makeImageFile, makePdf, pageCountOf, useNodeCanvas } from './helpers.js';

beforeAll(() => {
    useNodeCanvas();
    const require = createRequire(import.meta.url);
    setQpdfLocator(() => require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
    setPdfjsAssetBase(`${path.dirname(require.resolve('pdfjs-dist/package.json'))}/`);
});

function noisy(width, height, quality = 95) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    for (let y = 0; y < height; y += 3) {
        for (let x = 0; x < width; x += 3) {
            context.fillStyle = `rgb(${(x * 7 + y * 3) % 256},${(x * 5 + y * 11) % 256},${(x * y) % 256})`;
            context.fillRect(x, y, 3, 3);
        }
    }

    return { canvas, file: new File([canvas.toBuffer('image/jpeg', quality)], 'photo.jpg', { type: 'image/jpeg' }) };
}

async function photoPdf() {
    const { canvas } = noisy(1600, 1200, 98);
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([400, 300]);
    page.drawImage(await pdf.embedJpg(canvas.toBuffer('image/jpeg', 98)), { x: 0, y: 0, width: 400, height: 300 });
    page.drawText('Application form', { x: 20, y: 270, size: 20, font });

    return new File([await pdf.save()], 'form.pdf', { type: 'application/pdf' });
}

describe('jpegUnder', () => {
    it('keeps the most quality that fits under the limit', async () => {
        const { canvas } = noisy(600, 400);
        const loose = await jpegUnder(canvas, { maxBytes: 200_000 });
        const tight = await jpegUnder(canvas, { maxBytes: 20_000 });

        expect(loose.blob.size).toBeLessThanOrEqual(200_000);
        expect(tight.blob.size).toBeLessThanOrEqual(20_000);
        expect(tight.quality).toBeLessThan(loose.quality);
        expect(tight.reached).toBe(true);
    });

    it('shrinks the picture only when quality alone is not enough', async () => {
        const { canvas } = noisy(1200, 900);
        const result = await jpegUnder(canvas, { maxBytes: 4_000 });

        expect(result.blob.size).toBeLessThanOrEqual(4_000);
        expect(result.width).toBeLessThan(1200);
    });

    it('keeps the size and reports failure when shrinking is not allowed', async () => {
        const { canvas } = noisy(600, 400);
        const result = await jpegUnder(canvas, { maxBytes: 300, allowShrink: false });

        expect(result.reached).toBe(false);
        expect(result.width).toBe(600);
    });
});

describe('compress-image-to-size', () => {
    it.each([20, 50, 100])('gets a photo under %i KB and keeps it a real JPG', async (kb) => {
        const [result] = await imageToSize([noisy(900, 700).file], { targetKb: kb });

        expect(result.blob.size).toBeLessThanOrEqual(kb * 1024);
        expect(result.blob.size).toBeGreaterThan(kb * 1024 * 0.4);
        expect(Array.from(await head(result.blob, 3))).toEqual([0xff, 0xd8, 0xff]);
        expect(result.name).toBe(`photo-${kb}kb.jpg`);
        expect(result.note).toContain('KB');
    });

    it('accepts PNG input and several files', async () => {
        const result = await imageToSize([makeImageFile('image/png', 'a.png', { width: 300, height: 200 }), makeImageFile('image/jpeg', 'b.jpg')], { targetKb: 50 });

        expect(result.map((entry) => entry.name)).toEqual(['a-50kb.jpg', 'b-50kb.jpg']);
    });

    it('validates input', async () => {
        const file = noisy(100, 100).file;

        await expect(imageToSize([], { targetKb: 50 })).rejects.toThrow('at least one image');
        await expect(imageToSize([file], { targetKb: 0 })).rejects.toThrow('between 2 KB');
        await expect(imageToSize([file], { targetKb: NaN })).rejects.toBeInstanceOf(ToolError);
        await expect(imageToSize([new File(['hello world'], 'x.jpg')], { targetKb: 50 })).rejects.toBeInstanceOf(ToolError);
    });
});

describe('photo-signature-resize', () => {
    it('resizes to the exact preset size', async () => {
        const [result] = await photoResize([noisy(800, 600).file], { preset: 'passport' });

        expect(await imageSizeOf(result.blob)).toEqual({ width: 413, height: 531 });
        expect(result.name).toBe('photo-413x531.jpg');
    });

    it.each(Object.entries(PRESETS))('supports the %s preset', async (key, preset) => {
        const [result] = await photoResize([noisy(500, 500).file], { preset: key });

        expect(await imageSizeOf(result.blob)).toEqual({ width: preset.width, height: preset.height });
    });

    it('keeps the file under a size limit while keeping the exact size', async () => {
        const [result] = await photoResize([noisy(1000, 1000).file], { preset: 'passport', maxKb: 20 });
        const size = await imageSizeOf(result.blob);

        expect(result.blob.size).toBeLessThanOrEqual(20 * 1024);
        expect(size).toEqual({ width: 413, height: 531 });
    });

    it('reports when the limit cannot be met at that size', async () => {
        const [result] = await photoResize([noisy(1000, 1000).file], { preset: 'passport', maxKb: 2 });

        expect(result.note).toContain('Could not get under 2 KB');
    });

    it('converts custom units using the resolution', () => {
        expect(targetPixels({ preset: 'custom', width: 3.5, height: 4.5, unit: 'cm', dpi: 300 })).toEqual([413, 531]);
        expect(targetPixels({ preset: 'custom', width: 2, height: 2, unit: 'in', dpi: 150 })).toEqual([300, 300]);
        expect(targetPixels({ preset: 'custom', width: 35, height: 45, unit: 'mm', dpi: 300 })).toEqual([413, 531]);
        expect(targetPixels({ preset: 'custom', width: 120, height: 80, unit: 'px' })).toEqual([120, 80]);
    });

    it('fills (crops) or fits (pads) and can crop from the top', async () => {
        const wide = new File([(() => { const c = createCanvas(400, 100); const x = c.getContext('2d'); x.fillStyle = '#ff0000'; x.fillRect(0, 0, 400, 100); return c.toBuffer('image/png'); })()], 'w.png', { type: 'image/png' });
        const [cover] = await photoResize([wide], { preset: 'square', fit: 'cover' });
        const [contain] = await photoResize([wide], { preset: 'square', fit: 'contain', background: 'black' });
        const pixel = async (blob, x, y) => {
            const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
            const c = createCanvas(image.width, image.height);
            c.getContext('2d').drawImage(image, 0, 0);

            return Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
        };

        expect((await pixel(cover.blob, 300, 5))[0]).toBeGreaterThan(200);
        expect((await pixel(contain.blob, 300, 5))[0]).toBeLessThan(30);
        expect((await pixel(contain.blob, 300, 300))[0]).toBeGreaterThan(200);
    });

    it('validates options', async () => {
        const file = noisy(100, 100).file;

        await expect(photoResize([], {})).rejects.toThrow('at least one picture');
        await expect(photoResize([file], { preset: 'nope' })).rejects.toThrow('Choose a size');
        await expect(photoResize([file], { preset: 'custom', width: 0, height: 5, unit: 'px' })).rejects.toThrow('16 to 8000');
        await expect(photoResize([file], { preset: 'custom', width: 5, height: 5, unit: 'furlong' })).rejects.toThrow('unit');
        await expect(photoResize([file], { preset: 'passport', maxKb: 1 })).rejects.toThrow('between 2 KB');
        await expect(photoResize([file], { preset: 'passport', fit: 'stretch' })).rejects.toThrow('valid options');
    });
});

describe('compress-pdf-to-size', () => {
    it('gets a photo PDF under the target and keeps its page', async () => {
        const file = await photoPdf();
        const [result] = await pdfToSize([file], { targetKb: 100 });

        expect(file.size).toBeGreaterThan(100 * 1024);
        expect(result.blob.size).toBeLessThanOrEqual(100 * 1024);
        expect(await pageCountOf(result.blob)).toBe(1);
        expect(result.name).toBe('form-under-100KB.pdf');
        expect(result.note).toContain('was');
    });

    it('uses a gentler step for a looser target, so the result is bigger', async () => {
        const file = await photoPdf();
        const [loose] = await pdfToSize([file], { targetKb: 400 });
        const [tight] = await pdfToSize([file], { targetKb: 60 });

        expect(loose.blob.size).toBeLessThanOrEqual(400 * 1024);
        expect(tight.blob.size).toBeLessThanOrEqual(60 * 1024);
        expect(tight.blob.size).toBeLessThan(loose.blob.size);
    });

    it('returns the file unchanged when it is already small enough', async () => {
        const file = await makePdf(1);
        const [result] = await pdfToSize([file], { targetKb: 500 });

        expect(result.name).toBe('sample.pdf');
        expect(result.blob.size).toBe(file.size);
        expect(result.note).toContain('under 500 KB');
    });

    it('says so when the size cannot be reached', async () => {
        const [result] = await pdfToSize([await photoPdf()], { targetKb: 5 });

        expect(result.note).toMatch(/^Could not reach 5 KB\./);
        expect(result.name).toBe('form-smallest.pdf');
        expect(await pageCountOf(result.blob)).toBe(1);
    });

    it('validates input', async () => {
        const pdf = await makePdf(1);

        await expect(pdfToSize([pdf], { targetKb: 2 })).rejects.toThrow('between 5 KB');
        await expect(pdfToSize([pdf], { targetKb: 99999 })).rejects.toThrow('between 5 KB');
        await expect(pdfToSize([pdf], {})).rejects.toBeInstanceOf(ToolError);
        await expect(pdfToSize([], { targetKb: 100 })).rejects.toBeInstanceOf(ToolError);
        void decodeImage;
    });
});
