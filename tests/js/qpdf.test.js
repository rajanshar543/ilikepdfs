import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { encrypt, optimizeStructure, runQpdf, setQpdfLocator } from '../../resources/js/core/qpdf.js';
import { ToolError } from '../../resources/js/core/errors.js';
import { makePdf } from './helpers.js';

beforeAll(() => {
    const wasm = createRequire(import.meta.url).resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
    setQpdfLocator(() => wasm);
});

const bytesOf = async (file) => new Uint8Array(await file.arrayBuffer());

describe('qpdf wrapper', () => {
    it('re-writes a PDF without losing pages', async () => {
        const output = await optimizeStructure(await bytesOf(await makePdf(4)));
        const pdf = await PDFDocument.load(output);

        expect(pdf.getPageCount()).toBe(4);
    });

    it('encrypts with AES-256 so the PDF cannot be opened without the password', async () => {
        const output = await encrypt(await bytesOf(await makePdf(2)), 'open-sesame', 'owner-pass');

        expect(new TextDecoder('latin1').decode(output)).toContain('/Encrypt');
        await expect(PDFDocument.load(output)).rejects.toThrow(/encrypted/i);

        const decrypted = await runQpdf(output, ['--decrypt'], { before: ['--password=open-sesame'] });
        expect((await PDFDocument.load(decrypted)).getPageCount()).toBe(2);
    });

    it('turns a failure into a ToolError', async () => {
        await expect(runQpdf(new TextEncoder().encode('not a pdf at all'), [])).rejects.toBeInstanceOf(ToolError);
    });
});
