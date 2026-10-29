import { createRequire } from 'node:module';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { XMLValidator } from 'fast-xml-parser';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { officeKindOf } from '../../resources/js/core/files.js';
import { setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { process } from '../../resources/js/tools/pdf-to-powerpoint.js';
import { makePdf, useNodeCanvas } from './helpers.js';

beforeAll(() => {
    useNodeCanvas();
    setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`);
});

describe('pdf-to-powerpoint', () => {
    it('makes one slide per page with a real picture on each', async () => {
        const [result] = await process([await makePdf(3, { width: 400, height: 300 })]);
        const bytes = new Uint8Array(await result.blob.arrayBuffer());
        const parts = unzipSync(bytes);
        const slides = Object.keys(parts).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
        const media = Object.keys(parts).filter((name) => /^ppt\/media\/.+\.jpe?g$/.test(name));

        expect(result.name).toBe('sample.pptx');
        expect(officeKindOf(bytes)).toBe('pptx');
        expect(slides).toHaveLength(3);
        expect(media.length).toBeGreaterThanOrEqual(3);
        expect(parts[media[0]].slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
        expect(result.note).toContain('3 slides');
    });

    it('sizes the slides like the PDF page', async () => {
        const [result] = await process([await makePdf(1, { width: 720, height: 405 })]);
        const parts = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
        const presentation = strFromU8(parts['ppt/presentation.xml']);

        expect(presentation).toMatch(/<p:sldSz[^>]*cx="9144000"[^>]*cy="5143500"/);
    });

    it('writes well-formed XML', async () => {
        const [result] = await process([await makePdf(2)]);
        const parts = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));

        for (const [name, data] of Object.entries(parts)) {
            if (/\.(xml|rels)$/.test(name)) {
                expect(XMLValidator.validate(strFromU8(data)), name).toBe(true);
            }
        }
    });

    it('rejects bad input', async () => {
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([new File(['%PDF-1.4 junk'], 'x.pdf')])).rejects.toThrow('could not be read');
        expect(PDFDocument).toBeDefined();
    });
});
