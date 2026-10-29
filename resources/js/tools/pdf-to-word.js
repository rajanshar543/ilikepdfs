import { buildDocx } from '../core/docxWriter.js';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { structureDocument } from '../core/pdfStructure.js';
import { extractPages } from '../core/pdfText.js';

export const kinds = ['pdf'];

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Converts a PDF to an editable Word file. The text flow is rebuilt (headings,
 * lists, paragraphs); the page layout, tables and images are not reproduced.
 *
 * @param {File[]} files exactly one PDF
 */
export async function process(files, _options = {}, onProgress = () => {}) {
    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to convert.');
    }

    const file = files[0];
    const blocks = structureDocument(await extractPages(file, onProgress), { withLinks: false });

    if (blocks.length === 0) {
        throw new ToolError('No text was found in this PDF. If it is a scan, run it through OCR PDF first.');
    }

    onProgress(0.95, 'Building the Word file');

    return [{
        name: `${baseName(file.name)}.docx`,
        blob: new Blob([buildDocx(blocks)], { type: DOCX_TYPE }),
        note: 'Text, headings and lists converted. Layout, tables and images are not included.',
    }];
}
