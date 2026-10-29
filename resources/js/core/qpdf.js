import createModule from '@neslinesli93/qpdf-wasm';
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import { ToolError } from './errors.js';

/** qpdf exit codes: 0 = ok, 3 = finished with warnings. Both produce a file. */
const OK_STATUSES = new Set([0, 3]);

let locateWasm = () => wasmUrl;

/** Lets tests point the module at a file path instead of a browser URL. */
export function setQpdfLocator(locator) {
    locateWasm = locator ?? (() => wasmUrl);
}

/**
 * Runs qpdf on in-memory bytes inside WebAssembly. A fresh module is created
 * per call so no document data lingers between runs.
 *
 * @param {Uint8Array} input
 * @param {string[]} args options placed between the input and output paths
 * @param {{ before?: string[] }} [extra] options placed before the input path
 * @returns {Promise<Uint8Array>}
 */
export async function runQpdf(input, args, { before = [] } = {}) {
    const messages = [];
    const qpdf = await createModule({
        locateFile: () => locateWasm(),
        noInitialRun: true,
        print: () => {},
        printErr: (line) => messages.push(String(line)),
    });

    qpdf.FS.writeFile('/input.pdf', input);

    let status = 0;

    try {
        status = qpdf.callMain([...before, '/input.pdf', ...args, '/output.pdf']);
    } catch (error) {
        status = typeof error?.status === 'number' ? error.status : 2;
    }

    if (!OK_STATUSES.has(status)) {
        throw new ToolError(explain(messages));
    }

    try {
        return qpdf.FS.readFile('/output.pdf');
    } catch {
        throw new ToolError('The PDF could not be processed.');
    }
}

function explain(messages) {
    const text = messages.join(' ').toLowerCase();

    if (text.includes('password')) {
        return 'This PDF is password protected. Unlock it first.';
    }

    return 'The PDF could not be processed. The file may be damaged.';
}

/** Lossless clean-up: smaller object structure and maximum Flate compression. */
export function optimizeStructure(input) {
    return runQpdf(input, ['--object-streams=generate', '--recompress-flate', '--compression-level=9']);
}

/** AES-256 encryption with separate user (open) and owner (permissions) passwords. */
export function encrypt(input, userPassword, ownerPassword, restrictions = []) {
    return runQpdf(input, [], {
        before: ['--encrypt', userPassword, ownerPassword, '256', ...restrictions, '--'],
    });
}
