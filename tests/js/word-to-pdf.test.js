import { createRequire } from 'node:module';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDocx } from '../../resources/js/core/docxWriter.js';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { process } from '../../resources/js/tools/word-to-pdf.js';
import { useDiskFonts, useNodeCanvas } from './helpers.js';

beforeAll(async () => {
    useNodeCanvas();
    setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`);
    await useDiskFonts();
});

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const PNG_1X1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const run = (text, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (inner, style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${inner}</w:p>`;
const bullet = (text) => `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`;
const cell = (text) => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${para(run(text))}</w:tc>`;
const table = (rows) => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows.map((row) => `<w:tr>${row.map(cell).join('')}</w:tr>`).join('')}</w:tbl>`;
const picture = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1905000" cy="952500"/><wp:docPr id="1" name="p" descr="tiny"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="p.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId9"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

/** A hand-made .docx with real styles, a bullet list, a table and a picture. */
function richDocx(body) {
    const base = buildDocx([{ type: 'paragraph', text: 'x' }]);
    const files = {
        '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>'),
        '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
        'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/p.png"/></Relationships>'),
        'word/media/p.png': PNG_1X1,
        'word/numbering.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`),
        'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`),
    };
    const { unzipSync } = createRequire(import.meta.url)('fflate');
    files['word/styles.xml'] = unzipSync(base)['word/styles.xml'];

    return new File([zipSync(files)], 'letter.docx');
}

async function texts(blob) {
    const doc = await openPdf(blob);
    const pages = [];

    for (let number = 1; number <= doc.numPages; number += 1) {
        const page = await doc.getPage(number);
        pages.push((await page.getTextContent()).items.map((item) => item.str).join(' ').replace(/\s+/g, ' '));
    }

    return pages;
}

describe('word-to-pdf', () => {
    it('keeps headings, paragraphs and styled text', async () => {
        const docx = richDocx(para(run('Project plan'), 'Heading1') + para(run('Plain and ') + run('bold', '<w:b/>') + run(' and ') + run('italic', '<w:i/>') + run(' text.')));
        const [result] = await process([docx]);
        const [page] = await texts(result.blob);

        expect(result.name).toBe('letter.pdf');
        expect(page).toContain('Project plan');
        expect(page).toMatch(/Plain and\s*bold\s*and\s*italic\s*text\./);
    });

    it('renders bullet lists and tables', async () => {
        const docx = richDocx(bullet('First point') + bullet('Second point') + table([['Name', 'Score'], ['Asha', '91'], ['Ravi', '84']]));
        const [page] = await texts((await process([docx]))[0].blob);

        expect(page).toContain('•');
        expect(page).toContain('First point');
        expect(page).toContain('Second point');
        expect(page).toMatch(/Name\s+Score/);
        expect(page).toContain('Asha');
        expect(page).toContain('84');
    });

    it('embeds pictures', async () => {
        const [result] = await process([richDocx(para(run('Before')) + picture + para(run('After')))]);
        const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
        const images = [...pdf.context.enumerateIndirectObjects()].filter(([, object]) => object.dict?.get?.(pdf.context.obj('Subtype'))?.toString?.() === '/Image');

        expect(images.length).toBeGreaterThan(0);
        expect((await texts(result.blob))[0]).toMatch(/Before.*After/);
    });

    it('wraps long text across lines and pages', async () => {
        const words = Array.from({ length: 1600 }, (_, index) => `word${index}`).join(' ');
        const [result] = await process([richDocx(para(run(words)))]);
        const pages = await texts(result.blob);

        expect(pages.length).toBeGreaterThan(1);
        expect(pages.join(' ')).toContain('word0 ');
        expect(pages.join(' ')).toContain('word1599');
    });

    it('breaks a word that is wider than the page', async () => {
        const [result] = await process([richDocx(para(run('x'.repeat(300))))]);

        expect((await texts(result.blob)).join('').replace(/\s/g, '')).toContain('x'.repeat(300));
    });

    it('draws Hindi text', async () => {
        const [result] = await process([richDocx(para(run('नमस्ते दुनिया')))]);

        expect((await texts(result.blob))[0]).toMatch(/[ऀ-ॿ]/);
    });

    it('escapes nothing dangerous into the PDF: markup in text stays text', async () => {
        const [result] = await process([richDocx(para(run('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more')))]);

        expect((await texts(result.blob))[0]).toContain('<script>alert(1)</script> & more');
    });

    it('rejects empty documents, damaged files and bad input', async () => {
        await expect(process([richDocx('')])).rejects.toThrow('no content');
        await expect(process([new File(['PK\u0003\u0004 broken'], 'bad.docx')])).rejects.toThrow('could not be read');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
    });
});
