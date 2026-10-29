import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, renderPage, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { process as crop } from '../../resources/js/tools/crop-pdf.js';
import { boxesForTerms, parseTerms, process as redact } from '../../resources/js/tools/redact-pdf.js';
import { useNodeCanvas } from './helpers.js';

beforeAll(() => {
    useNodeCanvas();
    setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`);
});

async function pdfWith(texts, size = [400, 300]) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    for (const lines of texts) {
        const page = pdf.addPage(size);
        lines.forEach(([text, x, y]) => page.drawText(text, { x, y, size: 16, font }));
    }

    return new File([await pdf.save()], 'doc.pdf', { type: 'application/pdf' });
}

async function pageTexts(blob, pageNumber = 1) {
    const doc = await openPdf(blob);
    const content = await (await doc.getPage(pageNumber)).getTextContent();

    return content.items.map((item) => item.str).join(' ').trim();
}

async function pixel(blob, x, y, pageNumber = 1) {
    const doc = await openPdf(blob);
    const { canvas } = await renderPage(await doc.getPage(pageNumber), 1);

    return Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data);
}

describe('crop-pdf', () => {
    it('crops a page to the drawn area', async () => {
        const [result] = await crop([await pdfWith([[['Hello', 50, 200]]])], { items: [{ type: 'crop', page: 0, x: 40, y: 20, w: 200, h: 100 }] });
        const pdf = await PDFDocument.load(await result.blob.arrayBuffer());

        expect(result.name).toBe('doc-cropped.pdf');
        expect(pdf.getPage(0).getSize()).toEqual({ width: 200, height: 100 });
        expect(pdf.getPage(0).getCropBox()).toEqual({ x: 40, y: 180, width: 200, height: 100 });
    });

    it('keeps what is inside the area and drops what is outside from view', async () => {
        const file = await pdfWith([[['Inside', 60, 250], ['Outside', 60, 40]]]);
        const [result] = await crop([file], { items: [{ type: 'crop', page: 0, x: 40, y: 20, w: 200, h: 100 }] });
        const doc = await openPdf(result.blob);
        const view = (await doc.getPage(1)).getViewport({ scale: 1 });
        const items = (await (await doc.getPage(1)).getTextContent()).items.filter((item) => item.str.trim());
        const visible = items.filter((item) => {
            const [x, y] = view.convertToViewportPoint(item.transform[4], item.transform[5]);

            return x >= 0 && x <= view.width && y >= 0 && y <= view.height;
        });

        expect(view.width).toBe(200);
        expect(visible.map((item) => item.str)).toEqual(['Inside']);
    });

    it('can crop every page the same way, also pages of another size', async () => {
        const pdf = await PDFDocument.create();
        pdf.addPage([400, 300]);
        pdf.addPage([800, 600]);
        const file = new File([await pdf.save()], 'two.pdf');
        const [result] = await crop([file], { items: [{ type: 'crop', page: 0, x: 100, y: 75, w: 200, h: 150 }], scope: 'all' });
        const sizes = (await PDFDocument.load(await result.blob.arrayBuffer())).getPages().map((page) => page.getSize());

        expect(sizes).toEqual([{ width: 200, height: 150 }, { width: 400, height: 300 }]);
    });

    it('crops only the drawn pages by default', async () => {
        const pdf = await PDFDocument.create();
        pdf.addPage([400, 300]);
        pdf.addPage([400, 300]);
        const [result] = await crop([new File([await pdf.save()], 'two.pdf')], { items: [{ type: 'crop', page: 1, x: 0, y: 0, w: 100, h: 100 }] });
        const pages = (await PDFDocument.load(await result.blob.arrayBuffer())).getPages();

        expect(pages[0].getSize()).toEqual({ width: 400, height: 300 });
        expect(pages[1].getSize()).toEqual({ width: 100, height: 100 });
    });

    it('works on rotated pages', async () => {
        const source = await PDFDocument.create();
        source.addPage([400, 300]).setRotation(degrees(90));
        const [result] = await crop([new File([await source.save()], 'r.pdf')], { items: [{ type: 'crop', page: 0, x: 0, y: 0, w: 100, h: 200 }] });
        const page = (await PDFDocument.load(await result.blob.arrayBuffer())).getPage(0);
        const doc = await openPdf(result.blob);
        const view = (await doc.getPage(1)).getViewport({ scale: 1 });

        expect(page.getRotation().angle).toBe(90);
        expect([view.width, view.height]).toEqual([100, 200]);
    });

    it('rejects invalid areas and input', async () => {
        const pdf = await pdfWith([[['x', 10, 10]]]);

        await expect(crop([pdf], { items: [] })).rejects.toThrow('Draw the area');
        await expect(crop([pdf], { items: [{ type: 'crop', page: 3, x: 0, y: 0, w: 50, h: 50 }] })).rejects.toThrow('not valid');
        await expect(crop([pdf], { items: [{ type: 'crop', page: 0, x: 0, y: 0, w: 2, h: 50 }] })).rejects.toThrow('not valid');
        await expect(crop([pdf], { items: [{ type: 'crop', page: 0, x: -5, y: 0, w: 50, h: 50 }] })).rejects.toThrow('not valid');
        await expect(crop([pdf], { items: [{ type: 'crop', page: 0, x: 0, y: 0, w: 50, h: 50 }], scope: 'some' })).rejects.toThrow('which pages');
        await expect(crop([], {})).rejects.toBeInstanceOf(ToolError);
    });
});

describe('redact-pdf', () => {
    it('really removes the covered text: the page no longer contains it', async () => {
        const file = await pdfWith([[['Account 12345678', 50, 200], ['Public text', 50, 100]], [['Untouched page two', 50, 200]]]);
        const [result] = await redact([file], { items: [{ type: 'redact', page: 0, x: 40, y: 80, w: 200, h: 30 }] });

        expect(result.name).toBe('doc-redacted.pdf');
        expect(result.note).toContain('1 page redacted');
        expect(await pageTexts(result.blob, 1)).toBe('');
        expect(await pageTexts(result.blob, 2)).toContain('Untouched page two');

        const raw = new TextDecoder('latin1').decode(new Uint8Array(await result.blob.arrayBuffer()));
        expect(raw).not.toContain('12345678');
        expect(await pixel(result.blob, 100, 95)).toEqual([0, 0, 0, 255]);
        expect((await pixel(result.blob, 300, 250))[0]).toBeGreaterThan(240);
    });

    it('finds words and covers every match', async () => {
        const file = await pdfWith([[['Call John Smith today', 50, 200], ['Then email john@example.com', 50, 150]]]);
        const [result] = await redact([file], { items: [], terms: 'john smith\njohn@example.com\nnot-there' });

        expect(result.note).toContain('2 matches found by search');
        expect(result.note).toContain('not found: "not-there"');
        expect(await pageTexts(result.blob)).toBe('');
        expect(new TextDecoder('latin1').decode(new Uint8Array(await result.blob.arrayBuffer()))).not.toContain('john@example');
    });

    it('computes match boxes inside the text item', () => {
        const pages = [{ number: 1, items: [{ str: 'secret code', x: 100, y: 50, w: 110, size: 10 }] }];
        const { boxes, hits } = boxesForTerms(pages, ['CODE', 'zzz']);

        expect(boxes).toHaveLength(1);
        expect(boxes[0].x).toBeCloseTo(100 + 10 * 7 - 1, 5);
        expect(boxes[0].w).toBeCloseTo(40 + 2, 5);
        expect(hits.get('CODE')).toBe(1);
        expect(hits.get('zzz')).toBe(0);
    });

    it('parses search words', () => {
        expect(parseTerms('a, b\n a ;c')).toEqual(['a', 'b', 'c']);
        expect(() => parseTerms(Array.from({ length: 51 }, (_, index) => `w${index}`).join('\n'))).toThrow('at most 50');
        expect(() => parseTerms('x'.repeat(101))).toThrow('at most 100');
    });

    it('rejects nothing-to-do, invalid areas and bad files', async () => {
        const file = await pdfWith([[['x', 10, 10]]]);

        await expect(redact([file], { items: [] })).rejects.toThrow('Draw over the content');
        await expect(redact([file], { items: [], terms: 'absent' })).rejects.toThrow('None of your search words');
        await expect(redact([file], { items: [{ type: 'redact', page: 5, x: 0, y: 0, w: 10, h: 10 }] })).rejects.toThrow('not valid');
        await expect(redact([file], { items: [{ type: 'redact', page: 0, x: 0, y: 0, w: 0, h: 10 }] })).rejects.toThrow('not valid');
        await expect(redact([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(redact([new File(['%PDF-1.4 junk'], 'x.pdf')], { items: [] })).rejects.toThrow('could not be read');
    });
});
