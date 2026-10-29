import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { looksEncrypted } from '../core/pdf.js';
import { runQpdf } from '../core/qpdf.js';

export const kinds = ['pdf'];

export function readOptions(root) {
    return { password: root.querySelector('input[name="password"]')?.value ?? '' };
}

/**
 * Removes the password from a PDF. The password has to be known: this opens
 * the file with it and saves a copy without encryption.
 *
 * @param {File[]} files exactly one PDF
 * @param {{password?: string}} options leave empty for files that only restrict printing or editing
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { password = '' } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to unlock.');
    }

    if (String(password).length > 128) {
        throw new ToolError('That password is too long.');
    }

    const file = files[0];
    const input = new Uint8Array(await file.arrayBuffer());

    if (!looksEncrypted(input)) {
        throw new ToolError(`"${file.name}" is not password protected.`);
    }

    onProgress(0.4, 'Unlocking');

    let output;

    try {
        output = await runQpdf(input, ['--decrypt'], { before: [`--password=${password}`] });
    } catch {
        throw new ToolError(password === ''
            ? 'This PDF needs a password to open. Enter it and try again.'
            : 'The password is not correct.');
    }

    return [{
        name: `${baseName(file.name)}-unlocked.pdf`,
        blob: new Blob([output], { type: 'application/pdf' }),
        note: 'Password removed',
    }];
}
