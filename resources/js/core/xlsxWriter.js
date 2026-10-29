import { strToU8, zipSync } from 'fflate';
import { xmlEscape } from './xml.js';

const MAX_ROWS = 1_048_576;
const MAX_COLUMNS = 16_384;
const NUMBER = /^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,10})?$/;
const GROUPED_NUMBER = /^-?[1-9]\d{0,2}(?:,\d{3})+(?:\.\d{1,10})?$/;

export function columnName(index) {
    let name = '';
    let rest = index;

    do {
        name = String.fromCharCode(65 + (rest % 26)) + name;
        rest = Math.floor(rest / 26) - 1;
    } while (rest >= 0);

    return name;
}

/** Numbers that are clearly numbers become numeric cells; anything else, including "007", stays text. */
export function parseCellNumber(text) {
    const value = String(text).trim();

    if (NUMBER.test(value)) {
        return Number(value);
    }

    return GROUPED_NUMBER.test(value) ? Number(value.replace(/,/g, '')) : null;
}

/** Sheet names: at most 31 characters, none of []:*?/\ , unique ignoring case. */
export function sheetNames(names) {
    const used = new Set();

    return names.map((raw, index) => {
        const base = String(raw).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Sheet${index + 1}`;
        let name = base;
        let counter = 2;

        while (used.has(name.toLowerCase())) {
            const suffix = ` (${counter})`;
            name = base.slice(0, 31 - suffix.length) + suffix;
            counter += 1;
        }

        used.add(name.toLowerCase());

        return name;
    });
}

function sheetXml(rows) {
    const widths = [];
    const body = rows.slice(0, MAX_ROWS).map((row, rowIndex) => {
        const cells = row.slice(0, MAX_COLUMNS).map((value, columnIndex) => {
            if (value === null || value === undefined || value === '') {
                return '';
            }

            const text = String(value);
            widths[columnIndex] = Math.min(60, Math.max(widths[columnIndex] ?? 8, text.length + 2));
            const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
            const number = typeof value === 'number' ? value : parseCellNumber(text);

            return number !== null && Number.isFinite(number)
                ? `<c r="${reference}"><v>${number}</v></c>`
                : `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
        }).join('');

        return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');

    const columns = widths.length === 0 ? '' : `<cols>${widths.map((width, index) => (width ? `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>` : '')).join('')}</cols>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${columns}<sheetData>${body}</sheetData></worksheet>`;
}

/**
 * Builds an .xlsx workbook.
 *
 * @param {{name: string, rows: (string|number|null)[][]}[]} sheets
 * @returns {Uint8Array}
 */
export function buildXlsx(sheets) {
    const names = sheetNames(sheets.map((sheet) => sheet.name));
    const files = {
        '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
        '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
        'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`),
        'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
        'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`),
    };

    sheets.forEach((sheet, index) => {
        files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet.rows));
    });

    return zipSync(files);
}
