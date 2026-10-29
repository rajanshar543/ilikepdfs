import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { buildXlsx } from '../../resources/js/core/xlsxWriter.js';
import { cellText, process } from '../../resources/js/tools/excel-to-pdf.js';
import { useDiskFonts } from './helpers.js';

beforeAll(async () => {
    setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`);
    await useDiskFonts();
});

const xlsx = (sheets, name = 'book.xlsx') => new File([buildXlsx(sheets)], name);

async function pageTexts(blob) {
    const doc = await openPdf(blob);
    const pages = [];

    for (let number = 1; number <= doc.numPages; number += 1) {
        const content = await (await doc.getPage(number)).getTextContent();
        pages.push(content.items.map((item) => item.str).join(' '));
    }

    return pages;
}

describe('excel-to-pdf', () => {
    it('draws every sheet as a table with its name', async () => {
        const [result] = await process([xlsx([
            { name: 'Sales', rows: [['Item', 'Qty'], ['Apples', 12], ['Pears', 7.5]] },
            { name: 'Notes', rows: [['Remember to call']] },
        ])]);
        const texts = await pageTexts(result.blob);

        expect(result.name).toBe('book.pdf');
        expect(texts).toHaveLength(2);
        expect(texts[0]).toContain('Sales');
        expect(texts[0]).toMatch(/Item\s+Qty/);
        expect(texts[0]).toContain('Apples');
        expect(texts[0]).toContain('7.5');
        expect(texts[1]).toContain('Notes');
        expect(texts[1]).toContain('Remember to call');
    });

    it('paginates long sheets and keeps all rows', async () => {
        const rows = Array.from({ length: 120 }, (_, index) => [`Row ${index + 1}`, index + 1]);
        const [result] = await process([xlsx([{ name: 'Long', rows }])]);
        const texts = await pageTexts(result.blob);

        expect(texts.length).toBeGreaterThan(2);
        expect(texts.join(' ')).toContain('Row 1 ');
        expect(texts.join(' ')).toContain('Row 120');
    });

    it('uses landscape pages and carries wide tables onto more pages', async () => {
        const wide = [Array.from({ length: 14 }, (_, index) => `Column number ${index + 1} header`)];
        const [result] = await process([xlsx([{ name: 'Wide', rows: wide }])]);
        const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
        const texts = await pageTexts(result.blob);

        expect(pdf.getPage(0).getSize().width).toBeGreaterThan(pdf.getPage(0).getSize().height);
        expect(pdf.getPageCount()).toBeGreaterThan(1);
        expect(texts.join(' ')).toContain('Column number 14');
    });

    it('can force portrait, and truncates a very long cell instead of overflowing', async () => {
        const [result] = await process([xlsx([{ name: 'S', rows: [['x'.repeat(400)]] }])], { orientation: 'portrait' });
        const pdf = await PDFDocument.load(await result.blob.arrayBuffer());

        expect(pdf.getPage(0).getSize().width).toBeLessThan(pdf.getPage(0).getSize().height);
        expect((await pageTexts(result.blob))[0]).toContain('…');
    });

    it('draws Hindi text', async () => {
        const [result] = await process([xlsx([{ name: 'हिंदी', rows: [['नमस्ते', 'दुनिया']] }])]);

        expect((await pageTexts(result.blob))[0]).toMatch(/[ऀ-ॿ]/);
    });

    it('formats cells', () => {
        expect(cellText(new Date('2024-03-05T10:00:00Z'))).toBe('2024-03-05');
        expect(cellText(true)).toBe('TRUE');
        expect(cellText(null)).toBe('');
        expect(cellText(12.5)).toBe('12.5');
    });

    it('rejects empty workbooks, damaged files and bad options', async () => {
        await expect(process([xlsx([{ name: 'Empty', rows: [] }])])).rejects.toThrow('no data');
        await expect(process([new File(['PK\u0003\u0004 not a workbook'], 'bad.xlsx')])).rejects.toThrow('could not be read');
        await expect(process([xlsx([{ name: 'S', rows: [['a']] }])], { orientation: 'diagonal' })).rejects.toThrow('orientation');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
    });
});
