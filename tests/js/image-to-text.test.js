import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { setOcrConfig } from '../../resources/js/core/ocr.js';
import { process } from '../../resources/js/tools/image-to-text.js';
import { makeImageFile, useNodeCanvas } from './helpers.js';

beforeAll(() => {
    useNodeCanvas();
    const require = createRequire(import.meta.url);
    setOcrConfig({ langPath: path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int'), gzip: true, cachePath: path.join(os.tmpdir(), 'ilikepdfs-ocr') });
});

function textImage(lines, { type = 'image/png', background = '#ffffff', ink = '#000000' } = {}) {
    const canvas = createCanvas(900, 120 * lines.length + 40);
    const context = canvas.getContext('2d');
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = ink;
    context.font = 'bold 64px sans-serif';
    lines.forEach((line, index) => context.fillText(line, 30, 100 + index * 120));
    const name = type === 'image/png' ? 'scan.png' : 'scan.jpg';

    return new File([type === 'image/png' ? canvas.toBuffer('image/png') : canvas.toBuffer(type, 90)], name, { type });
}

describe('image-to-text', () => {
    it('reads English text from a PNG', async () => {
        const [result] = await process([textImage(['Hello World', 'Invoice 2024'])], { language: 'eng' });

        expect(result.name).toBe('scan.txt');
        expect(result.text).toMatch(/Hello\s+World/i);
        expect(result.text).toContain('2024');
    }, 120000);

    it('reads text from a JPG as well', async () => {
        const [result] = await process([textImage(['Quick brown fox'], { type: 'image/jpeg' })]);

        expect(result.text.toLowerCase()).toContain('quick');
        expect(result.name).toBe('scan.txt');
    }, 120000);

    it('reports progress', async () => {
        const seen = [];
        await process([textImage(['Progress check'])], {}, (fraction) => seen.push(fraction));

        expect(seen[0]).toBeLessThan(0.2);
        expect(seen.at(-1)).toBeLessThanOrEqual(1);
    }, 120000);

    it('says so when there is no text', async () => {
        const blank = makeImageFile('image/png', 'blank.png', { width: 200, height: 200 });
        const empty = new File([createCanvas(300, 300).toBuffer('image/png')], 'empty.png', { type: 'image/png' });

        await expect(process([empty])).rejects.toThrow('No text was found');
        expect(blank).toBeDefined();
    }, 120000);

    it('rejects bad input and unknown languages', async () => {
        const file = textImage(['x']);

        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([file], { language: 'xx' })).rejects.toThrow('valid language');
        await expect(process([new File([new Uint8Array([1, 2, 3, 4, 5])], 'bad.png', { type: 'image/png' })])).rejects.toBeInstanceOf(ToolError);
    }, 120000);
});
