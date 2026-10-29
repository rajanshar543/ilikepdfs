import { createCanvas } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import * as compressImage from '../../resources/js/tools/compress-image.js';
import * as resizeImage from '../../resources/js/tools/resize-image.js';
import { head, imageSizeOf, makeImageFile, useNodeCanvas } from './helpers.js';

beforeAll(useNodeCanvas);

/** A noisy, photo-like image that does compress. */
function photo(type, name, width = 800, height = 600, quality = 98) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
            context.fillStyle = `rgb(${(x * 3 + y) % 256},${(y * 5 + x * 2) % 256},${(x * y) % 256})`;
            context.fillRect(x, y, 2, 2);
        }
    }

    const buffer = type === 'image/png' ? canvas.toBuffer('image/png') : canvas.toBuffer(type, quality);

    return new File([buffer], name, { type });
}

describe('compress-image', () => {
    it.each([
        ['image/jpeg', 'a.jpg', 'a-compressed.jpg', [0xff, 0xd8, 0xff]],
        ['image/png', 'a.png', 'a-compressed.png', [0x89, 0x50, 0x4e, 0x47]],
        ['image/webp', 'a.webp', 'a-compressed.webp', [0x52, 0x49, 0x46, 0x46]],
    ])('makes %s smaller and keeps its format', async (type, name, expected, signature) => {
        const file = photo(type, name);
        const [result] = await compressImage.process([file], { level: 'small' });

        expect(result.name).toBe(expected);
        expect(result.blob.size).toBeLessThan(file.size);
        expect(Array.from(await head(result.blob, signature.length))).toEqual(signature);
        expect(await imageSizeOf(result.blob)).toEqual({ width: 800, height: 600 });
        expect(result.note).toMatch(/% smaller/);
    });

    it('smallest level gives a smaller file than best quality', async () => {
        const file = photo('image/jpeg', 'q.jpg');
        const [small] = await compressImage.process([file], { level: 'small' });
        const [best] = await compressImage.process([file], { level: 'best' });

        expect(small.blob.size).toBeLessThan(best.blob.size);
    });

    it('keeps the original when it cannot be made smaller', async () => {
        const tiny = makeImageFile('image/jpeg', 'tiny.jpg', { width: 8, height: 8 });
        const [result] = await compressImage.process([tiny], { level: 'best' });

        if (result.note?.startsWith('Already')) {
            expect(result.name).toBe('tiny.jpg');
            expect(result.blob.size).toBe(tiny.size);
        } else {
            expect(result.blob.size).toBeLessThan(tiny.size);
        }
    });

    it('rejects bad input', async () => {
        await expect(compressImage.process([])).rejects.toThrow('at least one image');
        await expect(compressImage.process([photo('image/jpeg', 'a.jpg')], { level: 'max' })).rejects.toThrow('compression level');
        await expect(compressImage.process([new File(['hello world'], 'a.jpg')])).rejects.toThrow('not a valid JPG / PNG / WebP file');
    });
});

describe('resize-image targetSize', () => {
    it('computes every mode', () => {
        expect(resizeImage.targetSize(400, 200, { mode: 'percent', percent: 50 })).toEqual([200, 100]);
        expect(resizeImage.targetSize(400, 200, { mode: 'percent', percent: 150 })).toEqual([600, 300]);
        expect(resizeImage.targetSize(400, 200, { mode: 'width', width: 100 })).toEqual([100, 50]);
        expect(resizeImage.targetSize(400, 200, { mode: 'height', height: 50 })).toEqual([100, 50]);
        expect(resizeImage.targetSize(400, 200, { mode: 'exact', width: 100, height: 100, keepAspect: false })).toEqual([100, 100]);
        expect(resizeImage.targetSize(400, 200, { mode: 'exact', width: 100, height: 100, keepAspect: true })).toEqual([100, 50]);
    });

    it('never produces a zero-sized image', () => {
        expect(resizeImage.targetSize(10, 1, { mode: 'percent', percent: 1 })).toEqual([1, 1]);
        expect(resizeImage.targetSize(1000, 1, { mode: 'width', width: 10 })).toEqual([10, 1]);
    });

    it.each([
        { mode: 'percent', percent: 0 },
        { mode: 'percent', percent: 401 },
        { mode: 'percent', percent: NaN },
        { mode: 'width', width: 0 },
        { mode: 'width', width: 1.5 },
        { mode: 'width', width: 99999 },
        { mode: 'height', height: -3 },
        { mode: 'exact', width: 10 },
    ])('rejects %j', (options) => {
        expect(() => resizeImage.targetSize(400, 200, options)).toThrow(ToolError);
    });
});

describe('resize-image', () => {
    it('resizes real images and names them with the new size', async () => {
        const result = await resizeImage.process(
            [makeImageFile('image/png', 'a.png', { width: 200, height: 100 }), makeImageFile('image/jpeg', 'b.jpg', { width: 200, height: 100 })],
            { mode: 'width', width: 50 },
        );

        expect(result.map((entry) => entry.name)).toEqual(['a-50x25.png', 'b-50x25.jpg']);
        expect(await imageSizeOf(result[0].blob)).toEqual({ width: 50, height: 25 });
        expect(await imageSizeOf(result[1].blob)).toEqual({ width: 50, height: 25 });
        expect(result[0].note).toBe('200×100 → 50×25');
    });

    it('defaults to 50 percent', async () => {
        const [result] = await resizeImage.process([makeImageFile('image/png', 'a.png', { width: 100, height: 60 })]);

        expect(await imageSizeOf(result.blob)).toEqual({ width: 50, height: 30 });
    });

    it('can enlarge, but not beyond the memory budget', async () => {
        const file = makeImageFile('image/png', 'a.png', { width: 50, height: 50 });
        const [big] = await resizeImage.process([file], { mode: 'percent', percent: 400 });

        expect(await imageSizeOf(big.blob)).toEqual({ width: 200, height: 50 * 4 });
        await expect(resizeImage.process([file], { mode: 'exact', width: 16000, height: 16000, keepAspect: false })).rejects.toThrow('too large');
    });

    it('rejects bad input', async () => {
        await expect(resizeImage.process([])).rejects.toThrow('at least one image');
        await expect(resizeImage.process([makeImageFile('image/png', 'a.png')], { mode: 'zoom' })).rejects.toThrow('Choose how');
        await expect(resizeImage.process([new File(['x'.repeat(50)], 'a.png')])).rejects.toBeInstanceOf(ToolError);
    });
});
