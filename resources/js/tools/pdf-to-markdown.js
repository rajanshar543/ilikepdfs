import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { structureDocument } from '../core/pdfStructure.js';
import { extractPages } from '../core/pdfText.js';

export const kinds = ['pdf'];

const asMarkdown = (block) => {
    switch (block.type) {
        case 'heading': return `${'#'.repeat(block.level)} ${block.text}`;
        case 'bullet': return `- ${block.text}`;
        case 'number': return `${block.number}. ${block.text}`;
        default: return block.text;
    }
};

/**
 * Converts a PDF to Markdown using font sizes for headings, bullets for lists
 * and link annotations for links. Tables and images are not reproduced.
 *
 * @param {File[]} files exactly one PDF
 */
export async function process(files, _options = {}, onProgress = () => {}) {
    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to convert.');
    }

    const file = files[0];
    const blocks = structureDocument(await extractPages(file, onProgress));

    // Consecutive list items belong together without blank lines between them.
    const markdown = blocks
        .reduce((output, block, index) => {
            const isItem = block.type === 'bullet' || block.type === 'number';
            const previousIsItem = index > 0 && ['bullet', 'number'].includes(blocks[index - 1].type);

            return output + (index === 0 ? '' : isItem && previousIsItem ? '\n' : '\n\n') + asMarkdown(block);
        }, '')
        .trim();

    if (markdown === '') {
        throw new ToolError('No text was found in this PDF. If it is a scan, run it through OCR PDF first.');
    }

    return [{ name: `${baseName(file.name)}.md`, text: `${markdown}\n` }];
}
