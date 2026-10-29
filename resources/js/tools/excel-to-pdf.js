import { PDFDocument, rgb } from 'pdf-lib';
import readXlsx from 'read-excel-file/universal';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { createFontSet } from '../core/fonts.js';
import { MAX_PDF_PAGES } from '../core/pdf.js';

export const kinds = ['xlsx'];

const PORTRAIT = [595.28, 841.89];
const MARGIN = 36;
const FONT_SIZE = 9;
const ROW_HEIGHT = 15;
const PADDING = 4;
const MAX_COLUMN_WIDTH = 220;
const MAX_SHEET_CELLS = 2_000_000;
const MAX_SHEET_ROWS = 20_000;

export function readOptions(root) {
    return { orientation: root.querySelector('select[name="orientation"]')?.value ?? 'auto' };
}

/** What a cell shows: dates as YYYY-MM-DD, booleans as TRUE/FALSE, numbers as they are. */
export function cellText(value) {
    if (value === null || value === undefined) {
        return '';
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
    }

    if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
    }

    return String(value);
}

function truncate(fonts, text, width) {
    if (fonts.width(text, FONT_SIZE) <= width) {
        return text;
    }

    let cut = text;

    while (cut.length > 1 && fonts.width(`${cut}…`, FONT_SIZE) > width) {
        cut = cut.slice(0, -1);
    }

    return `${cut}…`;
}

/** Splits column widths into groups that each fit on one page width. */
function columnGroups(widths, usable) {
    const groups = [];
    let current = [];
    let sum = 0;

    widths.forEach((width, index) => {
        if (current.length > 0 && sum + width > usable) {
            groups.push(current);
            current = [];
            sum = 0;
        }

        current.push(index);
        sum += width;
    });

    if (current.length > 0) {
        groups.push(current);
    }

    return groups;
}

/**
 * Converts every sheet of a workbook into paginated tables. Columns that do
 * not fit across the page continue on the following pages.
 *
 * @param {File[]} files exactly one XLSX file
 * @param {{orientation?: 'auto'|'portrait'|'landscape'}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { orientation = 'auto' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one Excel file to convert.');
    }

    if (!['auto', 'portrait', 'landscape'].includes(orientation)) {
        throw new ToolError('Choose a page orientation.');
    }

    const file = files[0];
    let sheets;

    try {
        sheets = await readXlsx(new Blob([await file.arrayBuffer()]));
    } catch {
        throw new ToolError(`"${file.name}" could not be read. The file may be damaged.`);
    }

    sheets = sheets
        .map((sheet) => ({ name: sheet.sheet, rows: sheet.data.filter((row) => row.some((cell) => cellText(cell) !== '')) }))
        .filter((sheet) => sheet.rows.length > 0);

    if (sheets.length === 0) {
        throw new ToolError('This workbook has no data to convert.');
    }

    const pdf = await PDFDocument.create();
    const fonts = createFontSet(pdf);

    await fonts.prepare('Aa0');

    for (const sheet of sheets) {
        if (sheet.rows.length > MAX_SHEET_ROWS || sheet.rows.length * Math.max(...sheet.rows.map((row) => row.length)) > MAX_SHEET_CELLS) {
            throw new ToolError(`The sheet "${sheet.name}" is too large to convert in the browser.`);
        }

        for (const row of sheet.rows) {
            await fonts.prepare(row.map(cellText).join(' '), {});
        }

        await fonts.prepare(sheet.name, { bold: true });
    }

    for (const [sheetIndex, sheet] of sheets.entries()) {
        onProgress(sheetIndex / sheets.length, `Sheet ${sheet.name}`);

        const columns = Math.max(...sheet.rows.map((row) => row.length));
        const widths = Array.from({ length: columns }, (_, column) => Math.min(
            MAX_COLUMN_WIDTH,
            Math.max(28, ...sheet.rows.slice(0, 500).map((row) => fonts.width(cellText(row[column]), FONT_SIZE) + PADDING * 2)),
        ));

        const total = widths.reduce((sum, width) => sum + width, 0);
        const landscape = orientation === 'landscape' || (orientation === 'auto' && total > PORTRAIT[0] - MARGIN * 2);
        const [pageWidth, pageHeight] = landscape ? [PORTRAIT[1], PORTRAIT[0]] : PORTRAIT;
        const usable = pageWidth - MARGIN * 2;
        const rowsPerPage = Math.floor((pageHeight - MARGIN * 2 - 24) / ROW_HEIGHT);

        for (const group of columnGroups(widths, usable)) {
            for (let start = 0; start < sheet.rows.length; start += rowsPerPage) {
                if (pdf.getPageCount() >= MAX_PDF_PAGES) {
                    throw new ToolError('The result would have too many pages.');
                }

                const page = pdf.addPage([pageWidth, pageHeight]);
                let y = pageHeight - MARGIN - 10;
                fonts.draw(page, sheet.name, { x: MARGIN, y, size: 11, bold: true, color: rgb(0.1, 0.1, 0.2) });
                y -= 20;

                sheet.rows.slice(start, start + rowsPerPage).forEach((row) => {
                    let x = MARGIN;

                    for (const column of group) {
                        const value = row[column];
                        const text = truncate(fonts, cellText(value), widths[column] - PADDING * 2);
                        const numeric = typeof value === 'number';

                        page.drawRectangle({ x, y: y - 4, width: widths[column], height: ROW_HEIGHT, borderColor: rgb(0.8, 0.8, 0.85), borderWidth: 0.5 });

                        if (text !== '') {
                            const textWidth = fonts.width(text, FONT_SIZE);
                            fonts.draw(page, text, {
                                x: numeric ? x + widths[column] - PADDING - textWidth : x + PADDING,
                                y,
                                size: FONT_SIZE,
                                color: rgb(0.1, 0.1, 0.1),
                            });
                        }

                        x += widths[column];
                    }

                    y -= ROW_HEIGHT;
                });
            }
        }
    }

    onProgress(0.95, 'Saving');

    return [{ name: `${baseName(file.name)}.pdf`, blob: new Blob([await pdf.save()], { type: 'application/pdf' }) }];
}
