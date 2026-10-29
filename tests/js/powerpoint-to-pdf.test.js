import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import PptxGenJS from 'pptxgenjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { process } from '../../resources/js/tools/powerpoint-to-pdf.js';
import { useDiskFonts, useNodeCanvas } from './helpers.js';

beforeAll(async () => {
    useNodeCanvas();
    setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`);
    await useDiskFonts();
});

const PNG = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function deck(build, name = 'talk.pptx') {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    build(pptx);

    return new File([await pptx.write({ outputType: 'uint8array' })], name);
}

async function pages(blob) {
    const doc = await openPdf(blob);
    const result = [];

    for (let number = 1; number <= doc.numPages; number += 1) {
        const page = await doc.getPage(number);
        const view = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        result.push({
            width: view.width,
            height: view.height,
            items: content.items.filter((item) => item.str.trim() !== '').map((item) => {
                const [x, y] = view.convertToViewportPoint(item.transform[4], item.transform[5]);

                return { text: item.str, x, y };
            }),
        });
    }

    return result;
}

describe('powerpoint-to-pdf', () => {
    it('makes one page per slide in the slide size, with the text', async () => {
        const file = await deck((pptx) => {
            pptx.addSlide().addText('Welcome to the talk', { x: 1, y: 1, w: 8, h: 1, fontSize: 32, bold: true });
            pptx.addSlide().addText([{ text: 'Second slide', options: { breakLine: true } }, { text: 'with two lines' }], { x: 1, y: 1, w: 8, h: 2, fontSize: 20 });
        });
        const [result] = await process([file]);
        const slides = await pages(result.blob);

        expect(result.name).toBe('talk.pdf');
        expect(slides).toHaveLength(2);
        expect(slides[0].width).toBeCloseTo(720, 0);
        expect(slides[0].height).toBeCloseTo(405, 0);
        expect(slides[0].items.map((item) => item.text).join(' ')).toContain('Welcome to the talk');
        expect(slides[1].items.map((item) => item.text).join(' ')).toMatch(/Second slide\s+with two lines/);
    });

    it('puts text where the box is on the slide', async () => {
        const file = await deck((pptx) => {
            pptx.addSlide().addText('Top left', { x: 0.5, y: 0.5, w: 3, h: 0.6, fontSize: 18, valign: 'top' });
            pptx.addSlide().addText('Lower right', { x: 6, y: 4, w: 3.5, h: 1, fontSize: 18, valign: 'top' });
        });
        const slides = await pages((await process([file]))[0].blob);

        expect(slides[0].items[0].x).toBeLessThan(120);
        expect(slides[0].items[0].y).toBeLessThan(120);
        expect(slides[1].items[0].x).toBeGreaterThan(400);
        expect(slides[1].items[0].y).toBeGreaterThan(300);
    });

    it('wraps long text inside the box and shrinks it when it does not fit', async () => {
        const long = Array.from({ length: 120 }, (_, index) => `word${index}`).join(' ');
        const file = await deck((pptx) => pptx.addSlide().addText(long, { x: 0.5, y: 0.5, w: 4, h: 2, fontSize: 24 }));
        const slide = (await pages((await process([file]))[0].blob))[0];
        const xs = slide.items.map((item) => item.x);

        expect(slide.items.map((item) => item.text).join(' ')).toContain('word119');
        expect(Math.max(...xs)).toBeLessThan(0.5 * 72 + 4 * 72 + 5);
    });

    it('draws background colours, shapes and pictures', async () => {
        const file = await deck((pptx) => {
            const slide = pptx.addSlide();
            slide.background = { color: '112233' };
            slide.addShape(pptx.ShapeType.rect, { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' } });
            slide.addImage({ data: PNG, x: 4, y: 1, w: 2, h: 1 });
        });
        const [result] = await process([file]);
        const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
        const content = [...pdf.context.enumerateIndirectObjects()].map(([, object]) => object);
        const images = content.filter((object) => object.dict?.get?.(pdf.context.obj('Subtype'))?.toString?.() === '/Image');

        expect(images.length).toBeGreaterThan(0);
        expect(pdf.getPageCount()).toBe(1);
    });

    it('draws simple tables', async () => {
        const file = await deck((pptx) => pptx.addSlide().addTable([[{ text: 'Name' }, { text: 'Score' }], [{ text: 'Asha' }, { text: '91' }]], { x: 1, y: 1, w: 6, colW: [3, 3] }));
        const slide = (await pages((await process([file]))[0].blob))[0];
        const text = slide.items.map((item) => item.text).join(' ');

        expect(text).toContain('Name');
        expect(text).toContain('91');
    });

    it('keeps Hindi text', async () => {
        const file = await deck((pptx) => pptx.addSlide().addText('नमस्ते दुनिया', { x: 1, y: 1, w: 6, h: 1, fontSize: 28 }));
        const slide = (await pages((await process([file]))[0].blob))[0];

        expect(slide.items.map((item) => item.text).join('')).toMatch(/[ऀ-ॿ]/);
    });

    it('rejects broken files, empty decks and bad input', async () => {
        await expect(process([new File(['PK\u0003\u0004 not a deck'], 'bad.pptx')])).rejects.toBeInstanceOf(ToolError);
        await expect(process([await deck(() => {})])).rejects.toThrow('no slides');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
    });
});
