import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { looksEncrypted } from '../core/pdf.js';
import { encrypt } from '../core/qpdf.js';

export const kinds = ['pdf'];

export const MIN_PASSWORD = 4;
export const MAX_PASSWORD = 128;

export function readOptions(root) {
    const field = (name) => root.querySelector(`input[name="${name}"]`);

    return {
        password: field('password')?.value ?? '',
        confirm: field('confirm')?.value ?? '',
        allowPrint: field('allowPrint')?.checked ?? true,
        allowCopy: field('allowCopy')?.checked ?? true,
        allowEdit: field('allowEdit')?.checked ?? false,
    };
}

/** A strong random owner password, so permissions cannot be bypassed by guessing. */
function randomOwnerPassword() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertValidPassword(password, confirm) {
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(password)) {
        throw new ToolError('The password contains characters that are not allowed.');
    }

    const length = [...password].length;

    if (length < MIN_PASSWORD) {
        throw new ToolError(`Use a password of at least ${MIN_PASSWORD} characters.`);
    }

    if (length > MAX_PASSWORD) {
        throw new ToolError(`Use a password of at most ${MAX_PASSWORD} characters.`);
    }

    if (password !== confirm) {
        throw new ToolError('The two passwords do not match.');
    }
}

/**
 * Encrypts a PDF with AES-256. The password never leaves the browser.
 *
 * @param {File[]} files exactly one PDF
 * @param {{password: string, confirm: string, allowPrint?: boolean, allowCopy?: boolean, allowEdit?: boolean}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const {
        password = '', confirm = '', allowPrint = true, allowCopy = true, allowEdit = false,
    } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to protect.');
    }

    assertValidPassword(password, confirm);

    const file = files[0];
    const input = new Uint8Array(await file.arrayBuffer());

    if (looksEncrypted(input)) {
        throw new ToolError(`"${file.name}" is already password protected. Unlock it first.`);
    }

    onProgress(0.3, 'Encrypting');

    const restrictions = [
        `--print=${allowPrint ? 'full' : 'none'}`,
        `--extract=${allowCopy ? 'y' : 'n'}`,
        `--modify=${allowEdit ? 'all' : 'none'}`,
    ];
    const bytes = await encrypt(input, password, randomOwnerPassword(), restrictions);

    return [{
        name: `${baseName(file.name)}-protected.pdf`,
        blob: new Blob([bytes], { type: 'application/pdf' }),
        note: 'AES-256 encrypted',
    }];
}
