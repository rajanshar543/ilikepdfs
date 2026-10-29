import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { maskRanges } from '../../resources/js/core/idPatterns.js';
import { setOcrConfig } from '../../resources/js/core/ocr.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { boxesFromItems, boxesFromWords, process } from '../../resources/js/tools/mask-id.js';
import { head, useNodeCanvas } from './helpers.js';

beforeAll(() => {
    useNodeCanvas();
    const require = createRequire(import.meta.url);
    setPdfjsAssetBase(`${path.dirname(require.resolve('pdfjs-dist/package.json'))}/`);
    setOcrConfig({ langPath: path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int'), gzip: true, cachePath: path.join(os.tmpdir(), 'ilikepdfs-ocr') });
});

const covered = (text, kinds) => maskRanges(text, kinds).map((range) => text.slice(range.start, range.end));

describe('maskRanges', () => {
    it('hides the first 8 digits of an Aadhaar number in every common format', () => {
        expect(covered('2345 6789 0123', ['aadhaar'])).toEqual(['2345 6789']);
        expect(covered('234567890123', ['aadhaar'])).toEqual(['23456789']);
        expect(covered('2345-6789-0123', ['aadhaar'])).toEqual(['2345-6789']);
        expect(covered('Aadhaar No: 9876 5432 1098 issued', ['aadhaar'])).toEqual(['9876 5432']);
    });

    it('does not mistake other numbers for an Aadhaar number', () => {
        expect(covered('1234 5678 9012', ['aadhaar'])).toEqual([]);
        expect(covered('2345 6789 01234', ['aadhaar'])).toEqual([]);
        expect(covered('12 2345 6789 0123', ['aadhaar'])).toEqual(['2345 6789']);
        expect(covered('2345 6789', ['aadhaar'])).toEqual([]);
    });

    it('hides most of a PAN, a mobile number and a card number', () => {
        expect(covered('PAN ABCDE1234F here', ['pan'])).toEqual(['ABCDE1']);
        expect(covered('abcde1234f', ['pan'])).toEqual([]);
        expect(covered('Call 98765 43210 now', ['mobile'])).toEqual([]);
        expect(covered('Call 9876543210 now', ['mobile'])).toEqual(['987654']);
        expect(covered('+91 9876543210', ['mobile'])).toEqual(['987654']);
        expect(covered('5500 0000 0000 0004', ['card'])).toEqual(['5500 0000 0000']);
    });

    it('only looks for the kinds that were chosen and never overlaps', () => {
        const text = 'ABCDE1234F 2345 6789 0123';

        expect(covered(text, ['aadhaar'])).toEqual(['2345 6789']);
        expect(covered(text, ['pan'])).toEqual(['ABCDE1']);
        expect(maskRanges(text, ['pan', 'aadhaar']).map((range) => range.kind)).toEqual(['pan', 'aadhaar']);
        expect(maskRanges('x', ['nothing'])).toEqual([]);
        expect(maskRanges('2345 6789 0123 4567', ['card', 'aadhaar']).length).toBe(1);
    });
});

describe('boxes', () => {
    it('puts boxes over the first digits of a text item in a PDF', () => {
        const pages = [{ number: 1, items: [{ str: '2345 6789 0123', x: 100, y: 50, w: 140, size: 10 }] }];
        const [box] = boxesFromItems(pages, ['aadhaar']);

        expect(box.page).toBe(0);
        expect(box.x).toBeCloseTo(99, 5);
        expect(box.w).toBeCloseTo((140 / 14) * 9 + 2, 5);
        expect(box.x + box.w).toBeLessThan(100 + 140 * (10 / 14));
    });

    it('joins OCR words on a line and covers part of the number across words', () => {
        const word = (text, x0, x1, line = 0) => ({ text, x0, x1, y0: 10, y1: 30, line });
        const boxes = boxesFromWords([word('No:', 0, 40), word('2345', 50, 130), word('6789', 140, 220), word('0123', 230, 310), word('2345', 50, 130, 1)], ['aadhaar']);

        expect(boxes).toHaveLength(2);
        expect(boxes[0].x).toBeLessThan(50);
        expect(boxes[0].x + boxes[0].w).toBeGreaterThan(130);
        expect(boxes[1].x + boxes[1].w).toBeGreaterThan(220);
        expect(boxes[1].x + boxes[1].w).toBeLessThan(230);
    });
});

async function textPdf(lines) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([400, 300]);
    lines.forEach((text, index) => page.drawText(text, { x: 30, y: 250 - index * 40, size: 18, font }));

    return new File([await pdf.save()], 'card.pdf', { type: 'application/pdf' });
}

describe('mask-id on a PDF', () => {
    it('hides the numbers for good: the page becomes a picture without the text', async () => {
        const [result] = await process([await textPdf(['Name: Asha Verma', 'Aadhaar 2345 6789 0123', 'PAN ABCDE1234F'])], { kinds: ['aadhaar', 'pan'] });
        const doc = await openPdf(result.blob);
        const content = await (await doc.getPage(1)).getTextContent();
        const raw = new TextDecoder('latin1').decode(new Uint8Array(await result.blob.arrayBuffer()));

        expect(result.name).toBe('card-masked.pdf');
        expect(result.note).toContain('2 numbers partly hidden');
        expect(content.items).toHaveLength(0);
        expect(raw).not.toContain('2345');
        expect(raw).not.toContain('ABCDE');
        expect(Array.from(await head(result.blob, 4))).toEqual([0x25, 0x50, 0x44, 0x46]);
    });

    it('says when nothing was found, and validates input', async () => {
        await expect(process([await textPdf(['Nothing secret here'])], { kinds: ['aadhaar'] })).rejects.toThrow('No numbers of that kind');
        await expect(process([await textPdf(['x'])], { kinds: [] })).rejects.toThrow('at least one kind');
        await expect(process([await textPdf(['x'])], { kinds: ['bogus'] })).rejects.toBeInstanceOf(ToolError);
        await expect(process([], { kinds: ['aadhaar'] })).rejects.toBeInstanceOf(ToolError);
        await expect(process([new File(['hello world'], 'x.pdf')], { kinds: ['aadhaar'] })).rejects.toBeInstanceOf(ToolError);
    });
});

describe('mask-id on a photo', () => {
    it('reads the number with OCR and covers its first digits only', async () => {
        const canvas = createCanvas(1100, 220);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 1100, 220);
        context.fillStyle = '#000000';
        context.font = 'bold 80px sans-serif';
        context.fillText('2345 6789 0123', 40, 140);
        const file = new File([canvas.toBuffer('image/png')], 'aadhaar.png', { type: 'image/png' });

        const [result] = await process([file], { kinds: ['aadhaar'] });
        const image = await loadImage(Buffer.from(await result.blob.arrayBuffer()));
        const output = createCanvas(image.width, image.height).getContext('2d');
        output.drawImage(image, 0, 0);
        const dark = (x0, x1) => {
            const pixels = output.getImageData(x0, 92, x1 - x0, 40).data;
            let black = 0;

            for (let i = 0; i < pixels.length; i += 4) {
                black += pixels[i] < 40 ? 1 : 0;
            }

            return black / (pixels.length / 4);
        };

        expect(result.name).toBe('aadhaar-masked.png');
        expect(result.note).toMatch(/covered/);
        expect(dark(60, 400)).toBeGreaterThan(0.9);
        expect(dark(760, 1000)).toBeLessThan(0.6);
    }, 120000);
});
