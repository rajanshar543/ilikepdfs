import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { extractPages } from '../core/pdfText.js';
import { pageToRows } from '../core/tableDetect.js';
import { buildXlsx } from '../core/xlsxWriter.js';

export const kinds = ['pdf'];

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function readOptions(root) {
    return { sheets: root.querySelector('input[name="sheets"]:checked')?.value ?? 'per-page' };
}

/**
 * Converts the tables and text of a PDF to a spreadsheet. Columns are found
 * from how the text lines up, so it works for PDFs with real text, not scans.
 *
 * @param {File[]} files exactly one PDF
 * @param {{sheets?: 'per-page'|'single'}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { sheets = 'per-page' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to convert.');
    }

    if (!['per-page', 'single'].includes(sheets)) {
        throw new ToolError('Choose how to arrange the sheets.');
    }

    const file = files[0];
    const pages = await extractPages(file, onProgress);
    const pageRows = pages.map((page) => ({ name: `Page ${page.number}`, rows: pageToRows(page) })).filter((entry) => entry.rows.length > 0);

    if (pageRows.length === 0) {
        throw new ToolError('No text was found in this PDF. If it is a scan, run it through OCR PDF first.');
    }

    const workbook = sheets === 'single'
        ? [{ name: 'PDF', rows: pageRows.flatMap((entry) => entry.rows) }]
        : pageRows;

    return [{
        name: `${baseName(file.name)}.xlsx`,
        blob: new Blob([buildXlsx(workbook)], { type: XLSX_TYPE }),
        note: `${workbook.length} sheet${workbook.length === 1 ? '' : 's'}. Check that the columns line up with your table.`,
    }];
}
