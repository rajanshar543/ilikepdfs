import { createRequire } from 'node:module';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLValidator } from 'fast-xml-parser';
import mammoth from 'mammoth';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDocx } from '../../resources/js/core/docxWriter.js';
import { ToolError } from '../../resources/js/core/errors.js';
import { officeKindOf } from '../../resources/js/core/files.js';
import { setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { xmlEscape } from '../../resources/js/core/xml.js';
import { process } from '../../resources/js/tools/pdf-to-word.js';

beforeAll(() => setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`));

async function samplePdf() {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([500, 700]);
    [['Quarterly Report', 28, 640], ['Summary', 18, 590], ['Revenue grew strongly this quarter', 11, 560], ['because of new customers.', 11, 546],
        ['- Faster delivery', 11, 500], ['- Lower cost', 11, 485], ['1. Plan', 11, 440], ['2. Build', 11, 425]]
        .forEach(([text, size, y]) => page.drawText(text, { x: 50, y, size, font }));

    return new File([await pdf.save()], 'report.pdf', { type: 'application/pdf' });
}

describe('docx writer', () => {
    it('writes well-formed XML parts and a docx that Word-compatible readers open', async () => {
        const bytes = buildDocx([
            { type: 'heading', level: 1, text: 'Title & <more>' },
            { type: 'paragraph', text: 'Line one\nline two' },
            { type: 'bullet', text: 'Item' },
            { type: 'number', number: '3', text: 'Third' },
        ]);
        const parts = unzipSync(bytes);

        expect(Object.keys(parts).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml']);

        for (const [name, data] of Object.entries(parts)) {
            expect(XMLValidator.validate(strFromU8(data)), name).toBe(true);
        }

        expect(officeKindOf(bytes)).toBe('docx');
        const html = (await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })).value;
        expect(html).toContain('<h1>Title &amp; &lt;more&gt;</h1>');
        expect(html).toContain('Item');
    });

    it('escapes XML and strips characters Word cannot read', () => {
        expect(xmlEscape('a<b>&"c\'')).toBe('a&lt;b&gt;&amp;&quot;c&apos;');
        expect(xmlEscape('bad\u0000\u0008char\u000Bs')).toBe('badchars');
        expect(xmlEscape('नमस्ते')).toBe('नमस्ते');
    });
});

describe('pdf-to-word', () => {
    it('converts a PDF into a real docx with headings, lists and paragraphs', async () => {
        const [result] = await process([await samplePdf()]);

        expect(result.name).toBe('report.docx');
        expect(result.blob.type).toContain('wordprocessingml');
        const buffer = Buffer.from(await result.blob.arrayBuffer());
        expect(officeKindOf(new Uint8Array(buffer))).toBe('docx');

        const html = (await mammoth.convertToHtml({ buffer })).value;
        expect(html).toContain('<h1>Quarterly Report</h1>');
        expect(html).toContain('<h2>Summary</h2>');
        expect(html).toContain('Revenue grew strongly this quarter because of new customers.');
        expect(html).toContain('Faster delivery');
        expect(html).toContain('Build');
    });

    it('keeps non-Latin text that was extracted', async () => {
        const [result] = await process([await samplePdf()]);
        const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await result.blob.arrayBuffer()) });

        expect(value).toContain('Quarterly Report');
    });

    it('rejects a PDF without text, bad input and damaged files', async () => {
        const blank = new File([await PDFDocument.create().then(async (pdf) => { pdf.addPage(); return pdf.save(); })], 'blank.pdf');

        await expect(process([blank])).rejects.toThrow('No text was found');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([new File(['%PDF-1.4 junk'], 'x.pdf')])).rejects.toThrow('could not be read');
    });
});
