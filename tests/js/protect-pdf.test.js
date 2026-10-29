import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { runQpdf, setQpdfLocator } from '../../resources/js/core/qpdf.js';
import { process as protectPdf } from '../../resources/js/tools/protect-pdf.js';
import { makePdf } from './helpers.js';

beforeAll(() => {
    setQpdfLocator(() => createRequire(import.meta.url).resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
});

/**
 * qpdf-wasm writes straight to the process output under node, so ask it in a
 * child process and read what it prints.
 */
async function showEncryption(input, password) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qpdf-'));
    const file = path.join(dir, 'e.pdf');
    fs.writeFileSync(file, input);

    const script = `
        const create = require('@neslinesli93/qpdf-wasm');
        const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
        create({ locateFile: () => wasm, noInitialRun: true }).then((q) => {
            q.FS.writeFile('/e.pdf', require('fs').readFileSync(process.argv[1]));
            q.callMain(['--password=' + process.argv[2], '--show-encryption', '/e.pdf']);
        });`;

    try {
        return execFileSync(process.execPath, ['-e', script, file, password], { cwd: process.cwd(), encoding: 'utf8' });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const protect = async (options = {}, pages = 2) => (await protectPdf([await makePdf(pages)], { password: 'secret1', confirm: 'secret1', ...options }))[0];

describe('protect-pdf', () => {
    it('produces an encrypted PDF that needs the password', async () => {
        const result = await protect();

        expect(result.name).toBe('sample-protected.pdf');
        expect(result.note).toBe('AES-256 encrypted');
        expect(new TextDecoder('latin1').decode(await bytes(result.blob))).toContain('/Encrypt');
        await expect(PDFDocument.load(await bytes(result.blob))).rejects.toThrow(/encrypted/i);
    });

    it('opens with the right password and keeps every page', async () => {
        const result = await protect({}, 3);
        const opened = await runQpdf(await bytes(result.blob), ['--decrypt'], { before: ['--password=secret1'] });

        expect((await PDFDocument.load(opened)).getPageCount()).toBe(3);
    });

    it('does not open with a wrong password', async () => {
        const result = await protect();

        await expect(runQpdf(await bytes(result.blob), ['--decrypt'], { before: ['--password=wrong'] })).rejects.toBeInstanceOf(ToolError);
        await expect(runQpdf(await bytes(result.blob), ['--decrypt'])).rejects.toBeInstanceOf(ToolError);
    });

    it('uses AES-256 and applies the chosen permissions', async () => {
        const open = await showEncryption(await bytes((await protect()).blob), 'secret1');
        expect(open).toMatch(/R = 6/);
        expect(open).toMatch(/file encryption method: AESv3/);
        expect(open).toMatch(/extract for accessibility: allowed/i);
        expect(open).toMatch(/print low resolution: allowed/i);
        expect(open).toMatch(/modify anything: not allowed/i);

        const locked = await showEncryption(await bytes((await protect({ allowPrint: false, allowCopy: false, allowEdit: true })).blob), 'secret1');
        expect(locked).toMatch(/print low resolution: not allowed/i);
        expect(locked).toMatch(/extract for any purpose: not allowed/i);
        expect(locked).toMatch(/modify anything: allowed/i);
    });

    it('supports unicode passwords', async () => {
        const result = await protect({ password: 'पासवर्ड-123', confirm: 'पासवर्ड-123' }, 1);
        const opened = await runQpdf(await bytes(result.blob), ['--decrypt'], { before: ['--password=पासवर्ड-123'] });

        expect((await PDFDocument.load(opened)).getPageCount()).toBe(1);
    });

    it('uses a different random owner password every time', async () => {
        const a = await showEncryption(await bytes((await protect()).blob), 'secret1');
        const first = await bytes((await protect()).blob);
        const second = await bytes((await protect()).blob);

        expect(a).toMatch(/R = 6/);
        expect(first).not.toEqual(second);
    });

    it('validates passwords', async () => {
        const pdf = await makePdf(1);

        await expect(protectPdf([pdf], { password: 'abc', confirm: 'abc' })).rejects.toThrow('at least 4');
        await expect(protectPdf([pdf], { password: 'x'.repeat(129), confirm: 'x'.repeat(129) })).rejects.toThrow('at most 128');
        await expect(protectPdf([pdf], { password: 'secret1', confirm: 'secret2' })).rejects.toThrow('do not match');
        await expect(protectPdf([pdf], { password: 'bad\u0000pw1', confirm: 'bad\u0000pw1' })).rejects.toThrow('not allowed');
        await expect(protectPdf([pdf], {})).rejects.toBeInstanceOf(ToolError);
        await expect(protectPdf([], { password: 'secret1', confirm: 'secret1' })).rejects.toBeInstanceOf(ToolError);
    });

    it('explains damaged and already-protected files', async () => {
        const options = { password: 'secret1', confirm: 'secret1' };
        const already = await protect();

        await expect(protectPdf([new File(['not a pdf'], 'x.pdf')], options)).rejects.toBeInstanceOf(ToolError);
        await expect(protectPdf([new File([await already.blob.arrayBuffer()], 'locked.pdf')], options)).rejects.toThrow('password protected');
    });
});
