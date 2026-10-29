import mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';
import { layoutDocument, parseHtml } from '../core/docLayout.js';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';

export const kinds = ['docx'];

/**
 * Converts a Word (.docx) file to PDF. The document is read with mammoth and
 * laid out again on A4 pages, so fonts, columns and exact positions can differ
 * from Word; text, headings, lists, tables and pictures are kept.
 *
 * @param {File[]} files exactly one DOCX file
 */
export async function process(files, _options = {}, onProgress = () => {}) {
    if (files.length !== 1) {
        throw new ToolError('Add one Word file to convert.');
    }

    const file = files[0];
    let html;

    onProgress(0.1, 'Reading the document');

    try {
        const bytes = await file.arrayBuffer();

        // mammoth's browser build reads an ArrayBuffer; its node build reads a Buffer.
        ({ value: html } = await mammoth.convertToHtml(typeof Buffer === 'undefined' ? { arrayBuffer: bytes } : { buffer: Buffer.from(bytes) }));
    } catch {
        throw new ToolError(`"${file.name}" could not be read. The file may be damaged.`);
    }

    const pdf = await PDFDocument.create();
    await layoutDocument(pdf, parseHtml(html), onProgress);
    pdf.setTitle(baseName(file.name));

    return [{
        name: `${baseName(file.name)}.pdf`,
        blob: new Blob([await pdf.save()], { type: 'application/pdf' }),
        note: 'Text, headings, lists, tables and pictures converted. Fonts and exact layout may differ from Word.',
    }];
}
