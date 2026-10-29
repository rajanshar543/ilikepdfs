import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { adaptiveBlackWhite, autoLevels, toGray } from '../../resources/js/core/scanFilters.js';
import { process } from '../../resources/js/tools/scan-to-pdf.js';
import { makeImageFile, pageCountOf, useNodeCanvas } from './helpers.js';

beforeAll(useNodeCanvas);

/** A grey, shadowed "photo of a page": dark text on dull paper, with a shadow on the right. */
function photo(name = 'page.jpg', width = 400, height = 300) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(170,170,170)';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgb(100,100,100)';
    context.fillRect(width * 0.6, 0, width * 0.4, height);
    context.fillStyle = 'rgb(40,40,40)';
    context.fillRect(40, 100, 120, 10);
    context.fillRect(width * 0.7, 100, 80, 10);

    return new File([canvas.toBuffer('image/jpeg', 92)], name, { type: 'image/jpeg' });
}

async function firstPageImage(blob) {
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    const stream = [...pdf.context.enumerateIndirectObjects()].map(([, object]) => object).find((object) => object.dict?.get?.(pdf.context.obj('Subtype'))?.toString?.() === '/Image');
    const canvas = createCanvas(400, 300);
    const image = await loadImage(Buffer.from(stream.contents));
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);

    return canvas.getContext('2d');
}

describe('scan filters', () => {
    it('autoLevels turns dull paper white and keeps ink dark', () => {
        const data = new Uint8ClampedArray(400);

        for (let pixel = 0; pixel < 100; pixel += 1) {
            const value = pixel < 90 ? 170 : 40;
            data.set([value, value, value, 255], pixel * 4);
        }

        autoLevels(data);

        expect(data[0]).toBeGreaterThan(240);
        expect(data[99 * 4]).toBeLessThan(15);
    });

    it('toGray removes colour', () => {
        const data = new Uint8ClampedArray([200, 50, 50, 255]);
        toGray(data);

        expect(data[0]).toBe(data[1]);
        expect(data[1]).toBe(data[2]);
    });

    it('adaptive black and white handles a shadow: paper stays white on both sides', () => {
        const width = 120;
        const height = 40;
        const data = new Uint8ClampedArray(width * height * 4);

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const paper = x < 60 ? 200 : 90;
                const ink = y === 20 && ((x > 10 && x < 30) || (x > 80 && x < 100));
                const value = ink ? paper * 0.35 : paper;
                data.set([value, value, value, 255], (y * width + x) * 4);
            }
        }

        adaptiveBlackWhite(data, width, height);
        const at = (x, y) => data[(y * width + x) * 4];

        expect(at(40, 5)).toBe(255);
        expect(at(110, 5)).toBe(255);
        expect(at(20, 20)).toBe(0);
        expect(at(90, 20)).toBe(0);
    });
});

describe('scan-to-pdf', () => {
    it('makes one A4 page per photo and brightens the paper', async () => {
        const [result] = await process([photo('a.jpg'), photo('b.jpg')], { mode: 'color' });
        const pdf = await PDFDocument.load(await result.blob.arrayBuffer());

        expect(result.name).toBe('scan.pdf');
        expect(pdf.getPageCount()).toBe(2);
        expect(pdf.getPage(0).getSize().width).toBeCloseTo(841.89, 1);

        const context = await firstPageImage(result.blob);
        const [r] = context.getImageData(5, 5, 1, 1).data;
        expect(r).toBeGreaterThan(220);
    });

    it('black and white mode only has black and white pixels', async () => {
        const [result] = await process([photo()], { mode: 'bw' });
        const context = await firstPageImage(result.blob);
        const { data, width, height } = { ...context.getImageData(0, 0, 400, 300), width: 400, height: 300 };
        let extremes = 0;

        for (let index = 0; index < data.length; index += 4) {
            if (data[index] < 60 || data[index] > 195) {
                extremes += 1;
            }
        }

        expect(extremes / (width * height)).toBeGreaterThan(0.97);
    });

    it('supports page sizes and leaves the photo as it is on request', async () => {
        const [fit] = await process([photo('c.jpg', 400, 200)], { pageSize: 'fit', mode: 'original' });
        const pdf = await PDFDocument.load(await fit.blob.arrayBuffer());

        expect(pdf.getPage(0).getSize()).toEqual({ width: 300, height: 150 });
        expect(await pageCountOf((await process([photo()], { pageSize: 'letter' }))[0].blob)).toBe(1);
    });

    it('accepts PNG photos too, and rejects bad input', async () => {
        const [result] = await process([makeImageFile('image/png', 'p.png')], {});

        expect(await pageCountOf(result.blob)).toBe(1);
        await expect(process([], {})).rejects.toThrow('at least one photo');
        await expect(process([photo()], { mode: 'sepia' })).rejects.toThrow('valid scan options');
        await expect(process([new File(['hello world'], 'x.jpg')], {})).rejects.toBeInstanceOf(ToolError);
    });
});
