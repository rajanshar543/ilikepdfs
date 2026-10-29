import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import { isSupportedLanguage, LANGUAGE_CODES, setOcrConfig } from '../../resources/js/core/ocr.js';
import { process } from '../../resources/js/tools/image-to-text.js';
import { useNodeCanvas } from './helpers.js';

const require = createRequire(import.meta.url);
const dataFor = (code) => path.join(path.dirname(require.resolve(`@tesseract.js-data/${code}/package.json`)), '4.0.0_best_int');

beforeAll(useNodeCanvas);

describe('OCR languages', () => {
    it('supports English plus eleven Indian languages and English together with each', () => {
        expect(LANGUAGE_CODES).toEqual(['eng', 'hin', 'tam', 'tel', 'ben', 'mar', 'guj', 'urd', 'kan', 'mal', 'pan']);

        for (const code of LANGUAGE_CODES) {
            expect(isSupportedLanguage(code)).toBe(true);
            expect(require('node:fs').existsSync(path.join(dataFor(code), `${code}.traineddata.gz`))).toBe(true);
        }

        expect(isSupportedLanguage('eng+hin')).toBe(true);
        expect(isSupportedLanguage('eng+tam')).toBe(true);
        expect(isSupportedLanguage('hin+tam')).toBe(false);
        expect(isSupportedLanguage('xx')).toBe(false);
        expect(isSupportedLanguage('../../etc')).toBe(false);
    });

    it('reads real Hindi text with the Hindi model', async () => {
        const font = path.join(path.dirname(require.resolve('@fontsource/noto-sans-devanagari/package.json')), 'files/noto-sans-devanagari-devanagari-400-normal.woff');
        const registered = GlobalFonts.registerFromPath(font, 'NotoDeva');
        expect(registered).toBeTruthy();

        const canvas = createCanvas(900, 220);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 900, 220);
        context.fillStyle = '#000000';
        context.font = '90px NotoDeva';
        context.fillText('नमस्ते भारत', 40, 140);
        setOcrConfig({ langPath: dataFor('hin'), gzip: true, cachePath: path.join(os.tmpdir(), 'ilikepdfs-ocr') });

        const [result] = await process([new File([canvas.toBuffer('image/png')], 'hindi.png', { type: 'image/png' })], { language: 'hin' });

        expect(result.text).toMatch(/[ऀ-ॿ]/);
        expect(result.text.replace(/\s/g, '')).toContain('भारत');
    }, 180000);
});
