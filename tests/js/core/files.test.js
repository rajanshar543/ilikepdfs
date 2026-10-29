import { describe, expect, it } from 'vitest';
import {
    assertPixelBudget, baseName, checkFileKind, detectKind, formatBytes, safeFilename,
} from '../../../resources/js/core/files.js';
import { ToolError } from '../../../resources/js/core/errors.js';
import { makeImageFile, makePdf } from '../helpers.js';

const bytes = (...values) => new Uint8Array(values);
const text = (value) => new TextEncoder().encode(value);

describe('detectKind', () => {
    it('recognises formats by their signature', async () => {
        expect(detectKind(text('%PDF-1.7\n'))).toBe('pdf');
        expect(detectKind(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('jpeg');
        expect(detectKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
        expect(detectKind(text('GIF89a'))).toBe('gif');
        expect(detectKind(bytes(0x49, 0x49, 0x2a, 0x00, 8, 0))).toBe('tiff');
        expect(detectKind(bytes(0x4d, 0x4d, 0x00, 0x2a, 0, 8))).toBe('tiff');
        expect(detectKind(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
        expect(detectKind(new Uint8Array([0, 0, 0, 24, ...text('ftypheic'), 0, 0]))).toBe('heic');
        expect(detectKind(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg');
        expect(detectKind(text('<?xml version="1.0"?>\n<!-- c -->\n<svg width="1"/>'))).toBe('svg');
    });

    it('finds a PDF header preceded by junk, like real-world files', () => {
        expect(detectKind(text('\n\n  junk %PDF-1.4'))).toBe('pdf');
    });

    it('rejects unknown, tiny and mislabelled content', () => {
        expect(detectKind(bytes(1, 2))).toBeNull();
        expect(detectKind(null)).toBeNull();
        expect(detectKind(text('<html><body>not an svg</body></html>'))).toBe('html');
        expect(detectKind(text('hello world, this is text'))).toBe('text');
        expect(detectKind(new Uint8Array([0, 0, 0, 24, ...text('ftypavif'), 0, 0]))).toBeNull();
    });

    it('does not treat binary data containing "<svg" as an SVG', () => {
        expect(detectKind(new Uint8Array([0, ...text('<svg>')]))).toBeNull();
    });
});

describe('checkFileKind', () => {
    it('accepts a real file and returns its kind', async () => {
        expect(await checkFileKind(await makePdf(1), ['pdf'])).toBe('pdf');
        expect(await checkFileKind(makeImageFile('image/png', 'a.png'), ['png', 'jpeg'])).toBe('png');
    });

    it('rejects a file whose name lies about its content', async () => {
        const fake = new File([text('<?php echo 1;')], 'invoice.pdf', { type: 'application/pdf' });

        await expect(checkFileKind(fake, ['pdf'])).rejects.toBeInstanceOf(ToolError);
        await expect(checkFileKind(fake, ['pdf'])).rejects.toThrow('"invoice.pdf" is not a valid PDF file.');
    });

    it('rejects the wrong kind of real file', async () => {
        await expect(checkFileKind(makeImageFile('image/png', 'a.png'), ['pdf'])).rejects.toThrow('PDF');
    });
});

describe('assertPixelBudget', () => {
    it('allows normal sizes and blocks decompression bombs', () => {
        expect(() => assertPixelBudget(4000, 3000)).not.toThrow();
        expect(() => assertPixelBudget(20000, 20000)).toThrow(ToolError);
        expect(() => assertPixelBudget(0, 10)).toThrow(ToolError);
        expect(() => assertPixelBudget(NaN, 10)).toThrow(ToolError);
        expect(() => assertPixelBudget(Infinity, 10)).toThrow(ToolError);
    });
});

describe('safeFilename', () => {
    it('removes paths, control characters and reserved characters', () => {
        expect(safeFilename('../../etc/passwd')).toBe('passwd');
        expect(safeFilename('C:\\Users\\me\\evil.pdf')).toBe('evil.pdf');
        expect(safeFilename('a<b>:"|?*c.pdf')).toBe('abc.pdf');
        expect(safeFilename('bad\u0000name\n.pdf')).toBe('badname.pdf');
        expect(safeFilename('...hidden')).toBe('hidden');
    });

    it('falls back and truncates', () => {
        expect(safeFilename('')).toBe('file');
        expect(safeFilename(null, 'x')).toBe('x');
        expect(safeFilename('a'.repeat(500)).length).toBe(120);
    });

    it('baseName drops the extension', () => {
        expect(baseName('photo.final.jpg')).toBe('photo.final');
        expect(baseName('noext')).toBe('noext');
        expect(baseName('.hidden')).toBe('hidden');
    });
});

describe('formatBytes', () => {
    it('formats sizes', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
        expect(formatBytes(300 * 1024 * 1024)).toBe('300 MB');
    });
});

describe('office and text detection', () => {
    const zipOf = async (marker) => {
        const { zipSync, strToU8 } = await import('fflate');

        return zipSync({ '[Content_Types].xml': strToU8(`<Types><Override ContentType="application/vnd.${marker}"/></Types>`), 'a.txt': strToU8('x') });
    };

    it('tells docx, pptx and xlsx apart from a plain zip', async () => {
        const { officeKindOf } = await import('../../../resources/js/core/files.js');

        expect(officeKindOf(await zipOf('openxmlformats-officedocument.wordprocessingml.document.main+xml'))).toBe('docx');
        expect(officeKindOf(await zipOf('openxmlformats-officedocument.presentationml.presentation.main+xml'))).toBe('pptx');
        expect(officeKindOf(await zipOf('openxmlformats-officedocument.spreadsheetml.sheet.main+xml'))).toBe('xlsx');
        expect(officeKindOf(await zipOf('something.else'))).toBeNull();
        expect(officeKindOf(new Uint8Array([1, 2, 3]))).toBeNull();
    });

    it('checkFileKind resolves a zip to its office kind and rejects the wrong one', async () => {
        const docx = new File([await zipOf('openxmlformats-officedocument.wordprocessingml.document.main+xml')], 'a.docx');

        expect(await checkFileKind(docx, ['docx'])).toBe('docx');
        await expect(checkFileKind(docx, ['xlsx'])).rejects.toThrow('not a valid Excel file');
        await expect(checkFileKind(new File([await zipOf('x.y')], 'a.docx'), ['docx'])).rejects.toBeInstanceOf(ToolError);
    });

    it('recognises html and text but not binary', async () => {
        expect(detectKind(text('<!DOCTYPE html><html><body>x</body></html>'))).toBe('html');
        expect(detectKind(text('  <h1>Title</h1><p>hi</p>'))).toBe('html');
        expect(detectKind(text('Just some words.\nMore words.'))).toBe('text');
        expect(detectKind(text('नमस्ते दुनिया, this is text'))).toBe('text');
        expect(detectKind(new Uint8Array([0xc3, 0x28, 0xa0, 0xa1, 0x41, 0x42]))).toBeNull();
        expect(await checkFileKind(new File(['<p>hi</p>'], 'a.html'), ['text'])).toBe('text');
        expect(await checkFileKind(new File(['<p>hi</p>'], 'a.html'), ['html'])).toBe('html');
    });
});
