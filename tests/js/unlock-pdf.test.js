import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { encrypt, setQpdfLocator } from '../../resources/js/core/qpdf.js';
import { process as protectPdf } from '../../resources/js/tools/protect-pdf.js';
import { process as unlock } from '../../resources/js/tools/unlock-pdf.js';
import { makePdf } from './helpers.js';

beforeAll(() => {
    setQpdfLocator(() => createRequire(import.meta.url).resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
});

const locked = async (password = 'secret1', pages = 2) => {
    const [result] = await protectPdf([await makePdf(pages)], { password, confirm: password });

    return new File([await result.blob.arrayBuffer()], 'locked.pdf', { type: 'application/pdf' });
};

describe('unlock-pdf', () => {
    it('removes the password so the PDF opens normally', async () => {
        const [result] = await unlock([await locked()], { password: 'secret1' });

        expect(result.name).toBe('locked-unlocked.pdf');
        const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
        expect(pdf.getPageCount()).toBe(2);
        expect(pdf.isEncrypted).toBe(false);
    });

    it('works with a unicode password', async () => {
        const [result] = await unlock([await locked('पासवर्ड-9')], { password: 'पासवर्ड-9' });

        expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(2);
    });

    it('rejects a wrong or missing password with a clear message', async () => {
        const file = await locked();

        await expect(unlock([file], { password: 'nope' })).rejects.toThrow('password is not correct');
        await expect(unlock([file], { password: '' })).rejects.toThrow('needs a password');
    });

    it('removes restrictions from a file that opens without a password', async () => {
        const bytes = await encrypt(new Uint8Array(await (await makePdf(3)).arrayBuffer()), '', 'owner-secret', ['--print=none', '--modify=none']);
        const [result] = await unlock([new File([bytes], 'restricted.pdf')], { password: '' });

        expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(3);
    });

    it('says when the PDF is not protected, and validates input', async () => {
        await expect(unlock([await makePdf(1)], {})).rejects.toThrow('is not password protected');
        await expect(unlock([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(unlock([await locked()], { password: 'x'.repeat(200) })).rejects.toThrow('too long');
    });
});
