import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { splitSentences, summarize } from '../../resources/js/core/summarize.js';
import { process } from '../../resources/js/tools/pdf-summarizer.js';

beforeAll(() => setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`));

const ARTICLE = [
    'Solar energy is becoming the cheapest source of electricity in most countries.',
    'The price of solar panels has fallen by almost ninety percent over the last decade.',
    'My neighbour bought a new red bicycle last Tuesday afternoon.',
    'Governments now support solar energy with subsidies and simpler permits for homeowners.',
    'Batteries make solar energy useful at night, which solves the biggest problem of solar power.',
    'The weather was pleasant and the coffee at the corner shop tasted quite good.',
    'Engineers expect solar energy to supply a quarter of global electricity within fifteen years.',
    'Many families already save money every month after installing solar panels on their roofs.',
].join(' ');

describe('splitSentences', () => {
    it('splits on sentence ends but not on abbreviations or decimals', () => {
        const parts = splitSentences('Dr. Smith paid 3.5 dollars for the book. The shop closed early today! Did anyone notice the sign?');

        expect(parts).toEqual(['Dr. Smith paid 3.5 dollars for the book.', 'The shop closed early today!', 'Did anyone notice the sign?']);
    });

    it('handles the Devanagari danda and joins wrapped lines', () => {
        expect(splitSentences('यह पहला वाक्य है जो काफी लंबा है। यह दूसरा वाक्य भी काफी लंबा है।')).toHaveLength(2);
        expect(splitSentences('This sentence is wrapped\nacross two lines and ends here. Next one follows right after it.')).toHaveLength(2);
    });

    it('drops fragments that are too short', () => {
        expect(splitSentences('Yes. No. Maybe so. This one is long enough to count as a real sentence.')).toEqual(['This one is long enough to count as a real sentence.']);
    });
});

describe('summarize', () => {
    it('keeps the on-topic sentences, drops the off-topic ones and keeps the order', () => {
        const { sentences, keywords, total } = summarize(ARTICLE, 4);

        expect(total).toBe(8);
        expect(sentences).toHaveLength(4);
        expect(sentences.join(' ')).not.toContain('bicycle');
        expect(sentences.join(' ')).not.toContain('coffee');
        expect(keywords[0]).toBe('solar');

        const positions = sentences.map((sentence) => ARTICLE.indexOf(sentence));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it('never returns more sentences than exist and copes with empty text', () => {
        expect(summarize(ARTICLE, 100).sentences).toHaveLength(8);
        expect(summarize('', 5)).toEqual({ sentences: [], keywords: [], total: 0 });
    });
});

async function pdfWith(text) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const words = text.split(' ');
    let page = pdf.addPage([600, 800]);
    let y = 760;
    let line = '';

    for (const word of words) {
        if ((line + word).length > 80) {
            page.drawText(line, { x: 30, y, size: 11, font });
            y -= 16;
            line = '';

            if (y < 40) {
                page = pdf.addPage([600, 800]);
                y = 760;
            }
        }

        line += `${word} `;
    }

    page.drawText(line, { x: 30, y, size: 11, font });

    return new File([await pdf.save()], 'article.pdf', { type: 'application/pdf' });
}

describe('pdf-summarizer', () => {
    it('summarizes a PDF', async () => {
        const [result] = await process([await pdfWith(ARTICLE)], { length: 'short' });

        expect(result.name).toBe('article-summary.txt');
        expect(result.text).toMatch(/^Summary \(5 of 8 sentences\)/);
        expect(result.text).toContain('solar');
        expect(result.text).not.toContain('bicycle');
        expect(result.text).toContain('Key topics:');
    });

    it('summarizes a plain text file', async () => {
        const [result] = await process([new File([ARTICLE], 'notes.txt', { type: 'text/plain' })], { length: 'short' });

        expect(result.name).toBe('notes-summary.txt');
        expect(result.text).toContain('Summary');
    });

    it('rejects too little text, other file types and bad options', async () => {
        await expect(process([new File(['Just one short sentence here.'], 'a.txt')])).rejects.toThrow('too little text');
        await expect(process([new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])], 'a.png')])).rejects.toThrow('not a valid PDF / text file');
        await expect(process([new File([ARTICLE], 'a.txt')], { length: 'huge' })).rejects.toThrow('Choose a summary length');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);

        const blank = new File([await PDFDocument.create().then(async (pdf) => { pdf.addPage(); return pdf.save(); })], 'blank.pdf');
        await expect(process([blank])).rejects.toThrow('No text was found');
    });
});
