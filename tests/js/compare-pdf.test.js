import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { diffBoxes } from '../../resources/js/core/pixelDiff.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { diffWords } from '../../resources/js/core/textDiff.js';
import { process } from '../../resources/js/tools/compare-pdf.js';
import { useNodeCanvas } from './helpers.js';

beforeAll(() => {
    useNodeCanvas();
    setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`);
});

async function pdfOf(pages, name, size = [400, 300]) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    for (const lines of pages) {
        const page = pdf.addPage(size);
        lines.forEach((text, index) => page.drawText(text, { x: 30, y: size[1] - 60 - index * 30, size: 16, font }));
    }

    return new File([await pdf.save()], name, { type: 'application/pdf' });
}

describe('diffWords', () => {
    it('finds replaced, removed and added words in order', () => {
        expect(diffWords('the quick brown fox', 'the slow brown fox')).toEqual([{ type: 'removed', text: 'quick' }, { type: 'added', text: 'slow' }]);
        expect(diffWords('a b c d e', 'a b e')).toEqual([{ type: 'removed', text: 'c d' }]);
        expect(diffWords('a b', 'a b c d')).toEqual([{ type: 'added', text: 'c d' }]);
        expect(diffWords('same text', 'same text')).toEqual([]);
        expect(diffWords('', 'new words here')).toEqual([{ type: 'added', text: 'new words here' }]);
        expect(diffWords('x y z', 'x q z w')).toEqual([{ type: 'removed', text: 'y' }, { type: 'added', text: 'q' }, { type: 'added', text: 'w' }]);
    });

    it('copes with long texts', () => {
        const long = Array.from({ length: 3000 }, (_, index) => `w${index}`).join(' ');
        const changed = long.replace('w1500', 'CHANGED');

        expect(diffWords(long, changed)).toEqual([{ type: 'removed', text: 'w1500' }, { type: 'added', text: 'CHANGED' }]);
    });
});

describe('diffBoxes', () => {
    const image = (width, height, fill) => new Uint8ClampedArray(width * height * 4).fill(fill);

    it('finds nothing in identical images and one box around a changed block', () => {
        const a = image(100, 100, 255);
        const b = image(100, 100, 255);

        expect(diffBoxes(a, b, 100, 100)).toEqual([]);

        for (let y = 30; y < 50; y += 1) {
            for (let x = 40; x < 70; x += 1) {
                b.set([0, 0, 0, 255], (y * 100 + x) * 4);
            }
        }

        const [box, ...rest] = diffBoxes(a, b, 100, 100);
        expect(rest).toHaveLength(0);
        expect(box.x).toBeLessThanOrEqual(40);
        expect(box.x + box.w).toBeGreaterThanOrEqual(70);
        expect(box.y).toBeLessThanOrEqual(30);
        expect(box.y + box.h).toBeGreaterThanOrEqual(50);
    });

    it('ignores tiny noise', () => {
        const a = image(100, 100, 255);
        const b = image(100, 100, 255);
        b.set([0, 0, 0, 255], (50 * 100 + 50) * 4);

        expect(diffBoxes(a, b, 100, 100)).toEqual([]);
    });
});

describe('compare-pdf', () => {
    it('reports identical files as identical', async () => {
        const [result, ...rest] = await process([await pdfOf([['Same page text here']], 'a.pdf'), await pdfOf([['Same page text here']], 'b.pdf')]);

        expect(rest).toHaveLength(0);
        expect(result.name).toBe('comparison.txt');
        expect(result.text).toContain('No differences were found');
    });

    it('lists changed words and marks changed pages in a report PDF', async () => {
        const original = await pdfOf([['Invoice total 100 dollars'], ['Unchanged second page']], 'old.pdf');
        const revised = await pdfOf([['Invoice total 250 dollars'], ['Unchanged second page']], 'new.pdf');
        const [report, changes] = await process([original, revised]);

        expect(report.name).toBe('comparison.pdf');
        expect(report.note).toContain('1 page with differences');
        expect((await PDFDocument.load(await report.blob.arrayBuffer())).getPageCount()).toBe(1);
        expect(changes.name).toBe('changes.txt');
        expect(changes.text).toContain('Page 1');
        expect(changes.text).toContain('- 100');
        expect(changes.text).toContain('+ 250');
        expect(changes.text).not.toContain('Page 2');

        const doc = await openPdf(report.blob);
        expect((await (await doc.getPage(1)).getTextContent()).items.map((item) => item.str).join(' ')).toContain('2 text changes');
    });

    it('notices pages that only exist in one file', async () => {
        const [report, changes] = await process([await pdfOf([['One page']], 'a.pdf'), await pdfOf([['One page'], ['A brand new second page']], 'b.pdf')]);

        expect(changes.text).toContain('Page 2 - This page only exists in the new version.');
        expect((await PDFDocument.load(await report.blob.arrayBuffer())).getPageCount()).toBe(1);
    });

    it('notices a changed page size', async () => {
        const [, changes] = await process([await pdfOf([['Text here']], 'a.pdf', [400, 300]), await pdfOf([['Text here']], 'b.pdf', [500, 300])]);

        expect(changes.text).toContain('The page size changed.');
    });

    it('requires exactly two PDFs', async () => {
        const one = await pdfOf([['x']], 'a.pdf');

        await expect(process([one])).rejects.toThrow('two PDF files');
        await expect(process([one, one, one])).rejects.toBeInstanceOf(ToolError);
        await expect(process([one, new File(['%PDF-1.4 junk'], 'b.pdf')])).rejects.toThrow('could not be read');
    });
});
