import { zipSync } from 'fflate';
import { safeFilename } from './files.js';

/**
 * Packs results into a ZIP. Names are sanitised (no paths, so no zip-slip) and
 * made unique so nothing is overwritten.
 *
 * @param {{name: string, blob: Blob}[]} entries
 * @returns {Promise<Blob>}
 */
export async function zipResults(entries) {
    const files = {};

    for (const entry of entries) {
        const name = uniqueName(safeFilename(entry.name, 'file'), files);
        files[name] = [new Uint8Array(await entry.blob.arrayBuffer()), { level: 0 }];
    }

    return new Blob([zipSync(files)], { type: 'application/zip' });
}

function uniqueName(name, taken) {
    if (!(name in taken)) {
        return name;
    }

    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let counter = 2;

    while (`${stem} (${counter})${ext}` in taken) {
        counter += 1;
    }

    return `${stem} (${counter})${ext}`;
}
