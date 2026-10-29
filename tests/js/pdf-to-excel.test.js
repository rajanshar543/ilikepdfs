import { createRequire } from 'node:module';
import path from 'node:path';
import { XMLValidator } from 'fast-xml-parser';
import { strFromU8, unzipSync } from 'fflate';
import readXlsx from 'read-excel-file/universal';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { officeKindOf } from '../../resources/js/core/files.js';
import { setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { buildXlsx, columnName, parseCellNumber, sheetNames } from '../../resources/js/core/xlsxWriter.js';
import { process } from '../../resources/js/tools/pdf-to-excel.js';

beforeAll(() => setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`));

/** The reader pads every row to the sheet width with nulls; drop those. */
const trim = (rows) => rows.map((row) => {
    const copy = [...row];

    while (copy.length > 0 && copy.at(-1) === null) {
        copy.pop();
    }

    return copy;
});
const sheetsOf = async (blob) => (await readXlsx(blob)).map((sheet) => ({ ...sheet, data: trim(sheet.data) }));

async function tablePdf() {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([500, 700]);
    page.drawText('Sales report 2024', { x: 50, y: 650, size: 16, font });
    const rows = [['Item', 'Qty', 'Price'], ['Apples', '12', '3.50'], ['Bananas', '7', '1,200.25'], ['Cherries', '120', '9.00']];
    rows.forEach((row, index) => {
        const y = 600 - index * 18;
        page.drawText(row[0], { x: 50, y, size: 11, font });
        // Numbers are right-aligned, like in real tables.
        page.drawText(row[1], { x: 250 - font.widthOfTextAtSize(row[1], 11), y, size: 11, font });
        page.drawText(row[2], { x: 400 - font.widthOfTextAtSize(row[2], 11), y, size: 11, font });
    });
    page.drawText('Thank you for your business with us.', { x: 50, y: 480, size: 11, font });
    const second = pdf.addPage([500, 700]);
    second.drawText('Second page note', { x: 50, y: 600, size: 11, font });

    return new File([await pdf.save()], 'sales.pdf', { type: 'application/pdf' });
}

describe('xlsx writer', () => {
    it('writes a workbook that a spreadsheet reader opens, with numbers as numbers', async () => {
        const bytes = buildXlsx([{ name: 'Data', rows: [['Name', 'Amount', 'Code'], ['A & <B>', 1234.5, '007'], ['=SUM(A1)', '1,200.25', '']] }]);
        const sheets = await readXlsx(new Blob([bytes]));

        expect(officeKindOf(bytes)).toBe('xlsx');
        expect(sheets[0].sheet).toBe('Data');
        expect(sheets[0].data[0]).toEqual(['Name', 'Amount', 'Code']);
        expect(sheets[0].data[1]).toEqual(['A & <B>', 1234.5, '007']);
        expect(sheets[0].data[2][0]).toBe('=SUM(A1)');
        expect(sheets[0].data[2][1]).toBe(1200.25);

        for (const [name, data] of Object.entries(unzipSync(bytes))) {
            if (/\.(xml|rels)$/.test(name)) {
                expect(XMLValidator.validate(strFromU8(data)), name).toBe(true);
            }
        }
    });

    it('names columns, numbers and sheets safely', () => {
        expect(['A', 'Z', 'AA', 'AZ', 'BA'].every((name, index) => columnName([0, 25, 26, 51, 52][index]) === name)).toBe(true);
        expect(parseCellNumber('12')).toBe(12);
        expect(parseCellNumber('-3.5')).toBe(-3.5);
        expect(parseCellNumber('1,234.5')).toBe(1234.5);
        expect(parseCellNumber('007')).toBeNull();
        expect(parseCellNumber('12345678901234567890')).toBeNull();
        expect(parseCellNumber('1,23')).toBeNull();
        expect(parseCellNumber('abc')).toBeNull();
        expect(sheetNames(['a/b:c', 'A/B:C', '', 'x'.repeat(40)])).toEqual(['a b c', 'A B C (2)', 'Sheet3', 'x'.repeat(31)]);
    });
});

describe('pdf-to-excel', () => {
    it('detects a table with right-aligned numbers and keeps other text', async () => {
        const [result] = await process([await tablePdf()]);
        const sheets = await sheetsOf(result.blob);

        expect(result.name).toBe('sales.xlsx');
        expect(sheets.map((sheet) => sheet.sheet)).toEqual(['Page 1', 'Page 2']);
        expect(sheets[0].data).toEqual([
            ['Sales report 2024'],
            ['Item', 'Qty', 'Price'],
            ['Apples', 12, 3.5],
            ['Bananas', 7, 1200.25],
            ['Cherries', 120, 9],
            ['Thank you for your business with us.'],
        ]);
        expect(sheets[1].data).toEqual([['Second page note']]);
    });

    it('can put everything on one sheet', async () => {
        const [result] = await process([await tablePdf()], { sheets: 'single' });
        const sheets = await sheetsOf(result.blob);

        expect(sheets).toHaveLength(1);
        expect(sheets[0].data.at(-1)).toEqual(['Second page note']);
    });

    it('rejects PDFs without text and bad input', async () => {
        const blank = new File([await PDFDocument.create().then(async (pdf) => { pdf.addPage(); return pdf.save(); })], 'blank.pdf');

        await expect(process([blank])).rejects.toThrow('No text was found');
        await expect(process([await tablePdf()], { sheets: 'many' })).rejects.toThrow('arrange the sheets');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([new File(['%PDF-1.4 junk'], 'x.pdf')])).rejects.toThrow('could not be read');
    });
});
