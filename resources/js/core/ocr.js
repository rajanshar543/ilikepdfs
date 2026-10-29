import { createWorker } from 'tesseract.js';
import { ToolError } from './errors.js';

export const LANGUAGE_CODES = ['eng', 'hin', 'tam', 'tel', 'ben', 'mar', 'guj', 'urd', 'kan', 'mal', 'pan'];

/** One language, or English plus one other: "eng+hin". */
const LANGUAGES = [...LANGUAGE_CODES, ...LANGUAGE_CODES.filter((code) => code !== 'eng').map((code) => `eng+${code}`)];

let config = {
    workerPath: '/vendor/tesseract/worker.min.js',
    corePath: '/vendor/tesseract/core',
    langPath: '/vendor/tesseract/lang',
    workerBlobURL: false,
    gzip: true,
};

/** Tests use the copies in node_modules instead of the public web paths. */
export function setOcrConfig(custom) {
    config = custom;
}

export function isSupportedLanguage(language) {
    return LANGUAGES.includes(language);
}

/**
 * Starts an OCR worker that can read several images one after another. The
 * engine and language models come from this site, never from a third party.
 *
 * @param {string} language one of eng, hin, eng+hin
 * @param {(fraction: number) => void} onProgress progress of the image being read
 */
export async function openOcr(language, onProgress = () => {}) {
    if (!isSupportedLanguage(language)) {
        throw new ToolError('Choose a valid language.');
    }

    const worker = await createWorker(language.split('+'), 1, {
        ...config,
        logger: (message) => {
            if (message.status === 'recognizing text') {
                onProgress(message.progress);
            }
        },
    });

    return {
        /**
         * @param {Uint8Array} png
         * @returns {Promise<{text: string, words: {text: string, x0: number, y0: number, x1: number, y1: number, confidence: number}[]}>}
         */
        async read(png) {
            const { data } = await worker.recognize(png, {}, { blocks: true });
            const lines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines));
            const words = lines.flatMap((line, index) => line.words.map((word) => ({ text: word.text, ...word.bbox, confidence: word.confidence, line: index })));

            return { text: data.text, words };
        },

        close: () => worker.terminate(),
    };
}

/** Recognises the text in one PNG image. */
export async function recognize(png, language, onProgress = () => {}) {
    const session = await openOcr(language, onProgress);

    try {
        return (await session.read(png)).text;
    } finally {
        await session.close();
    }
}
