import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { process } from '../../resources/js/tools/pdf-to-markdown.js';
import { makePdf } from './helpers.js';

beforeAll(() => setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`));

/** Builds a document from [text, size, y] lines on page one, plus optional extra pages. */
async function document(pages, { link } = {}) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    for (const lines of pages) {
        const page = pdf.addPage([500, 700]);
        lines.forEach(([text, size, y, x = 50]) => page.drawText(text, { x, y, size, font }));

        if (link) {
            const annotation = pdf.context.obj({
                Type: 'Annot', Subtype: 'Link', Rect: link.rect, Border: [0, 0, 0],
                A: { Type: 'Action', S: 'URI', URI: PDFString.of(link.url) },
            });
            page.node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(annotation)]));
        }
    }

    return new File([await pdf.save()], 'doc.pdf', { type: 'application/pdf' });
}

const run = async (file) => (await process([file]))[0];

describe('pdf-to-markdown', () => {
    it('turns large text into headings and keeps paragraphs together', async () => {
        const result = await run(await document([[
            ['Annual Report', 30, 640],
            ['Overview', 20, 590],
            ['This is the first line of a paragraph', 11, 560],
            ['that continues on the next line.', 11, 546],
            ['A new paragraph starts here after a gap.', 11, 500],
        ]]));

        expect(result.name).toBe('doc.md');
        expect(result.text).toBe('# Annual Report\n\n## Overview\n\nThis is the first line of a paragraph that continues on the next line.\n\nA new paragraph starts here after a gap.\n');
    });

    it('detects bullet and numbered lists', async () => {
        const result = await run(await document([[
            ['Shopping', 22, 640],
            ['- Apples', 11, 600],
            ['- Bread', 11, 585],
            ['1. First step', 11, 540],
            ['2. Second step', 11, 525],
            ['Closing words for the document body here.', 11, 470],
        ]]));

        expect(result.text).toContain('# Shopping');
        expect(result.text).toContain('- Apples\n- Bread');
        expect(result.text).toContain('1. First step\n2. Second step');
    });

    it('re-joins words hyphenated across a line break', async () => {
        const result = await run(await document([[
            ['A long informa-', 11, 600],
            ['tion sentence ends.', 11, 586],
        ]]));

        expect(result.text).toContain('A long information sentence ends.');
    });

    it('turns link annotations into Markdown links', async () => {
        const result = await run(await document([[['Visit our website today', 11, 600]]], { link: { url: 'https://example.com/docs', rect: [95, 595, 135, 612] } }));

        expect(result.text).toMatch(/\[[^\]]+\]\(https:\/\/example\.com\/docs\)/);
        expect(result.text).toContain('Visit');
    });

    it('does not turn javascript: links into Markdown links', async () => {
        const result = await run(await document([[['Click here please', 11, 600]]], { link: { url: 'javascript:alert(1)', rect: [50, 595, 200, 612] } }));

        expect(result.text).not.toContain('javascript:');
    });

    it('reads every page in order', async () => {
        const result = await run(await document([[['First page text', 11, 600]], [['Second page text', 11, 600]]]));

        expect(result.text.indexOf('First page')).toBeLessThan(result.text.indexOf('Second page'));
    });

    it('explains when there is no text, and validates input', async () => {
        const blank = new File([await (await PDFDocument.create().then(async (pdf) => { pdf.addPage(); return pdf.save(); }))], 'blank.pdf');

        await expect(process([blank])).rejects.toThrow('No text was found');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([new File(['%PDF-1.4 junk'], 'x.pdf')])).rejects.toThrow('could not be read');
        expect((await run(await makePdf(1))).text).toContain('Page 1');
    });
});
