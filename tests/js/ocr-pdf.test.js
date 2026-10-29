import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { setOcrConfig } from '../../resources/js/core/ocr.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { process } from '../../resources/js/tools/ocr-pdf.js';
import { makePdf, pageCountOf, useDiskFonts, useNodeCanvas } from './helpers.js';

beforeAll(async () => {
    useNodeCanvas();
    const require = createRequire(import.meta.url);
    setPdfjsAssetBase(`${path.dirname(require.resolve('pdfjs-dist/package.json'))}/`);
    setOcrConfig({ langPath: path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int'), gzip: true, cachePath: path.join(os.tmpdir(), 'ilikepdfs-ocr') });
    await useDiskFonts();
});

/** A "scanned" PDF: every page is only a picture of text. */
async function scannedPdf(lines, { rotate = 0 } = {}) {
    const pdf = await PDFDocument.create();

    for (const text of lines) {
        // With a /Rotate of 90 the picture is stored sideways, so that it reads upright when shown.
        const [pixelsWide, pixelsHigh] = rotate ? [400, 1200] : [1200, 400];
        const canvas = createCanvas(pixelsWide, pixelsHigh);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pixelsWide, pixelsHigh);
        context.fillStyle = '#000000';
        context.font = 'bold 90px sans-serif';

        if (rotate) {
            context.translate(180, 1140);
            context.rotate(-Math.PI / 2);
            context.fillText(text, 0, 0);
        } else {
            context.fillText(text, 60, 220);
        }

        const image = await pdf.embedPng(canvas.toBuffer('image/png'));
        const page = pdf.addPage(rotate ? [200, 600] : [600, 200]);
        page.drawImage(image, { x: 0, y: 0, width: rotate ? 200 : 600, height: rotate ? 600 : 200 });

        if (rotate) {
            page.setRotation(degrees(rotate));
        }
    }

    return new File([await pdf.save()], 'scan.pdf', { type: 'application/pdf' });
}

async function textItems(blob, pageNumber = 1) {
    const doc = await openPdf(blob);
    const page = await doc.getPage(pageNumber);
    const view = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    return {
        width: view.width,
        height: view.height,
        items: content.items.filter((item) => item.str.trim() !== '').map((item) => {
            const [x, y] = view.convertToViewportPoint(item.transform[4], item.transform[5]);

            return { text: item.str, x, y, w: item.width };
        }),
    };
}

describe('ocr-pdf', () => {
    it('makes a scanned PDF searchable without changing how it looks', async () => {
        const scan = await scannedPdf(['Hello World', 'Invoice 2024']);
        const before = await textItems(scan, 1);
        expect(before.items).toHaveLength(0);

        const [result] = await process([scan]);

        expect(result.name).toBe('scan-ocr.pdf');
        expect(await pageCountOf(result.blob)).toBe(2);
        expect(result.note).toMatch(/2 pages made searchable/);
        expect((await textItems(result.blob, 1)).items.map((item) => item.text).join(' ')).toMatch(/Hello\s+World/);
        expect((await textItems(result.blob, 2)).items.map((item) => item.text).join(' ')).toContain('2024');
    }, 120000);

    it('puts each word where it is on the page', async () => {
        const [result] = await process([await scannedPdf(['Hello World'])]);
        const { items, width, height } = await textItems(result.blob);
        const hello = items.find((item) => item.text === 'Hello');
        const world = items.find((item) => item.text === 'World');

        expect(hello.x).toBeLessThan(world.x);
        expect(hello.x).toBeGreaterThan(10);
        expect(hello.x).toBeLessThan(width / 2);
        expect(hello.y).toBeGreaterThan(height * 0.3);
        expect(hello.y).toBeLessThan(height * 0.9);
    }, 120000);

    it('keeps the page picture and adds the text invisibly', async () => {
        const [result] = await process([await scannedPdf(['Hello World'])]);
        const raw = new TextDecoder('latin1').decode(new Uint8Array(await result.blob.arrayBuffer()));

        expect(await pageCountOf(result.blob)).toBe(1);
        expect(raw).toMatch(/\/Subtype\s*\/Image/);
    }, 120000);

    it('works on rotated pages', async () => {
        const [result] = await process([await scannedPdf(['Hello World'], { rotate: 90 })]);
        const { items, width } = await textItems(result.blob);

        expect(width).toBe(600);
        expect(items.map((item) => item.text).join(' ')).toMatch(/Hello/);
    }, 120000);

    it('skips pages that already have text, and says so when nothing is left', async () => {
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        pdf.addPage([600, 200]).drawText('This page already carries a full line of real selectable text here', { x: 10, y: 100, size: 11, font });

        await expect(process([new File([await pdf.save()], 'text.pdf')])).rejects.toThrow('already has selectable text');
    }, 120000);

    it('reports unreadable scans, bad options and bad files', async () => {
        const empty = await PDFDocument.create();
        const canvas = createCanvas(600, 200);
        const image = await empty.embedPng(canvas.toBuffer('image/png'));
        empty.addPage([600, 200]).drawImage(image, { x: 0, y: 0, width: 600, height: 200 });

        await expect(process([new File([await empty.save()], 'empty.pdf')])).rejects.toThrow('No text could be recognised');
        await expect(process([await makePdf(1)], { language: 'xx' })).rejects.toThrow('valid language');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([new File(['%PDF-1.4 junk'], 'x.pdf')])).rejects.toThrow('could not be read');
    }, 120000);
});
