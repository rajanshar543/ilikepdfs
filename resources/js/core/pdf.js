import { EncryptedPDFError, PDFDocument } from 'pdf-lib';
import { ToolError } from './errors.js';

export const MAX_PDF_PAGES = 2000;

/**
 * Loads a PDF with pdf-lib and turns library failures into messages a visitor
 * can act on.
 */
export async function loadPdf(file) {
    try {
        const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });

        if (pdf.getPageCount() > MAX_PDF_PAGES) {
            throw new ToolError(`"${file.name}" has more than ${MAX_PDF_PAGES} pages.`);
        }

        return pdf;
    } catch (error) {
        if (error instanceof ToolError) {
            throw error;
        }

        if (error instanceof EncryptedPDFError || /encrypted/i.test(String(error?.message))) {
            throw new ToolError(`"${file.name}" is password protected. Unlock it first.`);
        }

        throw new ToolError(`"${file.name}" could not be read. The file may be damaged.`);
    }
}

export async function savePdf(pdf) {
    return new Blob([await pdf.save()], { type: 'application/pdf' });
}

/**
 * Parses a page selection like "1-3, 5, 8-" into sorted unique zero-based
 * indexes. Throws a ToolError for anything out of range or malformed.
 */
export function parsePageRanges(text, pageCount) {
    const cleaned = String(text ?? '').replace(/\s+/g, '');

    if (cleaned === '') {
        throw new ToolError('Enter the pages you want, for example 1-3,5.');
    }

    const pages = new Set();

    for (const part of cleaned.split(',')) {
        const match = /^(\d+)?(-)?(\d+)?$/.exec(part);

        if (part === '' || !match || (match[1] === undefined && match[3] === undefined)) {
            throw new ToolError(`"${part}" is not a valid page range.`);
        }

        let start;
        let end;

        if (match[2] === undefined) {
            start = end = Number(match[1]);
        } else {
            start = match[1] === undefined ? 1 : Number(match[1]);
            end = match[3] === undefined ? pageCount : Number(match[3]);
        }

        if (start < 1 || end < 1 || start > pageCount || end > pageCount) {
            throw new ToolError(`Page numbers must be between 1 and ${pageCount}.`);
        }

        if (start > end) {
            throw new ToolError(`"${part}" is backwards. Write it as ${end}-${start}.`);
        }

        for (let page = start; page <= end; page += 1) {
            pages.add(page - 1);
        }
    }

    return [...pages].sort((a, b) => a - b);
}

/**
 * Cheap check for an encrypted PDF: the /Encrypt entry lives in the trailer (or
 * the xref stream dictionary) near the end of the file.
 *
 * @param {Uint8Array} bytes
 */
export function looksEncrypted(bytes) {
    const tail = bytes.subarray(Math.max(0, bytes.length - 8192));

    return new TextDecoder('latin1').decode(tail).includes('/Encrypt');
}
