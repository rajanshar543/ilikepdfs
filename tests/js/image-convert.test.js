import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { convertImages } from '../../resources/js/core/imageConvert.js';
import * as convertToWebp from '../../resources/js/tools/convert-to-webp.js';
import * as heicToJpg from '../../resources/js/tools/heic-to-jpg.js';
import * as jpgToPng from '../../resources/js/tools/jpg-to-png.js';
import * as pngToJpg from '../../resources/js/tools/png-to-jpg.js';
import * as svgToPng from '../../resources/js/tools/svg-to-png.js';
import * as tiffToJpg from '../../resources/js/tools/tiff-to-jpg.js';
import * as webpToJpg from '../../resources/js/tools/webp-to-jpg.js';
import { head, imageSizeOf, makeCanvas, makeImageFile, useNodeCanvas } from './helpers.js';

beforeAll(useNodeCanvas);

const fixture = (name, type) => new File([fs.readFileSync(path.join(__dirname, 'fixtures', name))], name, { type });
const signature = async (blob, length) => Array.from(await head(blob, length));
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];

async function pixelAt(blob, x, y) {
    const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
    const canvas = makeCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, image.width, image.height);
    context.drawImage(image, 0, 0);

    return Array.from(context.getImageData(x, y, 1, 1).data);
}

function webpFile(name = 'a.webp') {
    return new File([makeCanvas(90, 60).toBuffer('image/webp', 90)], name, { type: 'image/webp' });
}

describe('png-to-jpg', () => {
    it('produces a real JPG with the same size and name', async () => {
        const [result] = await pngToJpg.process([makeImageFile('image/png', 'photo.png', { width: 150, height: 90 })]);

        expect(result.name).toBe('photo.jpg');
        expect(result.blob.type).toBe('image/jpeg');
        expect(await signature(result.blob, 3)).toEqual(JPEG);
        expect(await imageSizeOf(result.blob)).toEqual({ width: 150, height: 90 });
    });

    it('fills transparency with the chosen background', async () => {
        const transparent = new File([createCanvas(60, 60).toBuffer('image/png')], 't.png', { type: 'image/png' });
        const [white] = await pngToJpg.process([transparent], { background: 'white', quality: 1 });
        const [black] = await pngToJpg.process([transparent], { background: 'black', quality: 1 });
        const [gray] = await pngToJpg.process([transparent], { background: 'gray', quality: 1 });

        const [wr, wg, wb] = await pixelAt(white.blob, 1, 1);
        const [br, bg, bb] = await pixelAt(black.blob, 1, 1);
        const [gr] = await pixelAt(gray.blob, 1, 1);

        expect([wr, wg, wb].every((v) => v > 240)).toBe(true);
        expect([br, bg, bb].every((v) => v < 15)).toBe(true);
        expect(gr).toBeGreaterThan(200);
        expect(gr).toBeLessThan(240);
    });

    it('lower quality makes a smaller file', async () => {
        const file = makeImageFile('image/png', 'q.png', { width: 400, height: 300 });
        const [small] = await pngToJpg.process([file], { quality: 0.2 });
        const [best] = await pngToJpg.process([file], { quality: 1 });

        expect(small.blob.size).toBeLessThan(best.blob.size);
    });

    it('converts several files, keeping names unique', async () => {
        const result = await pngToJpg.process([makeImageFile('image/png', 'same.png'), makeImageFile('image/png', 'same.png')]);

        expect(result.map((entry) => entry.name)).toEqual(['same.jpg', 'same-2.jpg']);
    });

    it('rejects a file that is not really a PNG, whatever its name says', async () => {
        const jpgPretendingToBePng = makeImageFile('image/jpeg', 'sneaky.png');

        await expect(pngToJpg.process([jpgPretendingToBePng])).rejects.toThrow('"sneaky.png" is not a valid PNG file.');
    });

    it('validates options', async () => {
        const file = makeImageFile('image/png', 'a.png');

        await expect(pngToJpg.process([file], { quality: 0 })).rejects.toThrow('valid quality');
        await expect(pngToJpg.process([file], { quality: 2 })).rejects.toThrow('valid quality');
        await expect(pngToJpg.process([file], { background: 'red' })).rejects.toThrow('background');
        await expect(pngToJpg.process([file], { scale: 10 })).rejects.toThrow('valid size');
        await expect(pngToJpg.process([])).rejects.toThrow('at least one image');
    });
});

describe('jpg-to-png', () => {
    it('produces a lossless PNG', async () => {
        const [result] = await jpgToPng.process([makeImageFile('image/jpeg', 'shot.jpg', { width: 100, height: 70 })]);

        expect(result.name).toBe('shot.png');
        expect(await signature(result.blob, 4)).toEqual(PNG);
        expect(await imageSizeOf(result.blob)).toEqual({ width: 100, height: 70 });
    });

    it('rejects a PNG', async () => {
        await expect(jpgToPng.process([makeImageFile('image/png', 'a.png')])).rejects.toBeInstanceOf(ToolError);
    });
});

describe('webp-to-jpg', () => {
    it('converts WebP to JPG', async () => {
        const [result] = await webpToJpg.process([webpFile('pic.webp')]);

        expect(result.name).toBe('pic.jpg');
        expect(await signature(result.blob, 3)).toEqual(JPEG);
        expect(await imageSizeOf(result.blob)).toEqual({ width: 90, height: 60 });
    });
});

describe('tiff-to-jpg', () => {
    it('converts a real TIFF and keeps the colours', async () => {
        const [result] = await tiffToJpg.process([fixture('sample.tiff', 'image/tiff')], { quality: 1 });

        expect(result.name).toBe('sample.jpg');
        expect(await imageSizeOf(result.blob)).toEqual({ width: 200, height: 120 });
        const [r, g, b] = await pixelAt(result.blob, 100, 60);
        expect(b).toBeGreaterThan(200);
        expect(r).toBeLessThan(90);
        expect(g).toBeGreaterThan(110);
    });

    it('reports a damaged TIFF', async () => {
        const broken = new File([new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 9, 9, 9, 9])], 'bad.tiff');

        await expect(tiffToJpg.process([broken])).rejects.toBeInstanceOf(ToolError);
    });
});

describe('heic-to-jpg', () => {
    it('converts an iPhone-style HEIC photo', async () => {
        const [result] = await heicToJpg.process([fixture('sample.heic', 'image/heic')], { quality: 1 });

        expect(result.name).toBe('sample.jpg');
        expect(await signature(result.blob, 3)).toEqual(JPEG);
        expect(await imageSizeOf(result.blob)).toEqual({ width: 200, height: 120 });
        const [r, g, b] = await pixelAt(result.blob, 100, 60);
        expect(b).toBeGreaterThan(200);
        expect(r).toBeLessThan(100);
        expect(g).toBeGreaterThan(110);
    });

    it('reports a damaged HEIC', async () => {
        const broken = new File([new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic'), 0, 0, 0, 0, 0, 0, 0, 0])], 'bad.heic');

        await expect(heicToJpg.process([broken])).rejects.toBeInstanceOf(ToolError);
    });
});

describe('convert-to-webp', () => {
    it('converts JPG and PNG to WebP', async () => {
        const result = await convertToWebp.process([makeImageFile('image/jpeg', 'a.jpg'), makeImageFile('image/png', 'b.png')]);

        expect(result.map((entry) => entry.name)).toEqual(['a.webp', 'b.webp']);

        for (const entry of result) {
            expect(entry.blob.type).toBe('image/webp');
            expect(new TextDecoder().decode((await head(entry.blob, 12)).slice(8, 12))).toBe('WEBP');
        }
    });

    it('falls back to a WebP encoder when the browser canvas cannot make WebP', async () => {
        const { setCanvasBackend } = await import('../../resources/js/core/canvas.js');
        const { createCanvas } = await import('@napi-rs/canvas');
        setCanvasBackend({
            createCanvas: (w, h) => createCanvas(w, h),
            decode: async (blob) => loadImage(Buffer.from(await blob.arrayBuffer())),
            // Behaves like old Safari: asked for WebP, hands back a PNG.
            toBlob: async (canvas) => new Blob([canvas.toBuffer('image/png')], { type: 'image/png' }),
        });

        try {
            const { setWebpWasmForTests } = await import('./webp-wasm.js');
            await setWebpWasmForTests();
            const [result] = await convertToWebp.process([makeImageFile('image/png', 'a.png')]);

            expect(result.blob.type).toBe('image/webp');
            expect(new TextDecoder().decode((await head(result.blob, 12)).slice(8, 12))).toBe('WEBP');
        } finally {
            useNodeCanvas();
        }
    });
});

describe('svg-to-png', () => {
    const svg = (body = '', attrs = 'width="100" height="50"') => new File(
        [`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="100%" height="100%" fill="#09f"/>${body}</svg>`],
        'logo.svg',
        { type: 'image/svg+xml' },
    );

    it('renders an SVG as a PNG at the chosen scale', async () => {
        const [one] = await svgToPng.process([svg()], { scale: 1 });
        const [three] = await svgToPng.process([svg()], { scale: 3 });

        expect(one.name).toBe('logo.png');
        expect(await signature(one.blob, 4)).toEqual(PNG);
        expect(await imageSizeOf(one.blob)).toEqual({ width: 100, height: 50 });
        expect(await imageSizeOf(three.blob)).toEqual({ width: 300, height: 150 });
    });

    it('keeps the background transparent', async () => {
        const circle = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="5" fill="red"/></svg>'], 't.svg');
        const [result] = await svgToPng.process([circle]);
        const [, , , alpha] = await pixelAt(result.blob, 0, 0);

        expect(alpha).toBe(0);
    });

    it('does not run scripts or load external files from an SVG', async () => {
        const hostile = svg('<script>globalThis.__pwned = true</script><image href="http://127.0.0.1:9/x.png" width="10" height="10"/>');
        const [result] = await svgToPng.process([hostile]);

        expect(globalThis.__pwned).toBeUndefined();
        expect(result.blob.size).toBeGreaterThan(0);
    });

    it('rejects oversized SVG files and non-SVG content', async () => {
        const huge = new File([`<svg xmlns="http://www.w3.org/2000/svg">${' '.repeat(6 * 1024 * 1024)}</svg>`], 'huge.svg');

        await expect(svgToPng.process([huge])).rejects.toThrow('larger than 5 MB');
        await expect(svgToPng.process([makeImageFile('image/png', 'x.svg')])).rejects.toThrow('not a valid SVG');
    });

    it('refuses a scale that would exceed the memory budget', async () => {
        const big = svg('', 'width="10000" height="10000"');

        await expect(svgToPng.process([big], { scale: 4 })).rejects.toThrow('too large');
    });
});

describe('convertImages guards', () => {
    it('refuses an image that would decompress to an enormous bitmap', async () => {
        const huge = makeImageFile('image/png', 'bomb.png', { width: 10, height: 10 });
        const view = new DataView(await huge.arrayBuffer());
        const bytes = new Uint8Array(await huge.arrayBuffer());
        // Rewrite the PNG header so it declares 60000 x 60000 pixels.
        new DataView(bytes.buffer).setUint32(16, 60000);
        new DataView(bytes.buffer).setUint32(20, 60000);
        expect(view.getUint32(16)).toBe(10);

        await expect(convertImages([new File([bytes], 'bomb.png')], { from: ['png'], to: 'jpeg' })).rejects.toBeInstanceOf(ToolError);
    });
});
