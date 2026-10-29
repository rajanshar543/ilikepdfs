import { ToolError } from '../core/errors.js';
import { baseName, checkFileKind } from '../core/files.js';
import { extractPages, groupLines } from '../core/pdfText.js';
import { summarize } from '../core/summarize.js';

export const kinds = ['pdf', 'text'];

const LENGTHS = { short: 5, medium: 10, long: 20 };
const MAX_TEXT_CHARS = 5_000_000;

export function readOptions(root) {
    return { length: root.querySelector('select[name="length"]')?.value ?? 'medium' };
}

async function textOf(file, kind, onProgress) {
    if (kind === 'text') {
        if (file.size > MAX_TEXT_CHARS) {
            throw new ToolError(`"${file.name}" is too long for the summarizer.`);
        }

        return file.text();
    }

    const pages = await extractPages(file, onProgress);

    return pages.map((page) => groupLines(page.items).map((line) => line.text).join('\n')).join('\n\n');
}

/**
 * Key-sentence summary that runs entirely on the device. It selects existing
 * sentences; it does not write new ones.
 *
 * @param {File[]} files exactly one PDF or text file
 * @param {{length?: 'short'|'medium'|'long'}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { length = 'medium' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF or text file to summarize.');
    }

    if (!(length in LENGTHS)) {
        throw new ToolError('Choose a summary length.');
    }

    const file = files[0];
    const kind = await checkFileKind(file, kinds);
    const text = await textOf(file, kind, onProgress);
    const result = summarize(text, LENGTHS[length]);

    if (result.total < 3) {
        throw new ToolError(kind === 'pdf' && text.trim() === ''
            ? 'No text was found in this PDF. If it is a scan, run it through OCR PDF first.'
            : 'There is too little text to summarize.');
    }

    const summary = [
        `Summary (${result.sentences.length} of ${result.total} sentences)`,
        '',
        ...result.sentences.map((sentence) => `- ${sentence}`),
        '',
        `Key topics: ${result.keywords.join(', ')}`,
    ].join('\n');

    return [{ name: `${baseName(file.name)}-summary.txt`, text: summary }];
}
