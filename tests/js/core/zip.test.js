import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { zipResults } from '../../../resources/js/core/zip.js';

const blob = (value) => new Blob([value]);

describe('zipResults', () => {
    it('packs files and keeps their content', async () => {
        const zip = await zipResults([{ name: 'a.txt', blob: blob('one') }, { name: 'b.txt', blob: blob('two') }]);
        const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));

        expect(Object.keys(files)).toEqual(['a.txt', 'b.txt']);
        expect(new TextDecoder().decode(files['a.txt'])).toBe('one');
    });

    it('never writes paths outside the archive (zip-slip) and de-duplicates names', async () => {
        const zip = await zipResults([
            { name: '../../evil.txt', blob: blob('1') },
            { name: 'evil.txt', blob: blob('2') },
            { name: 'evil.txt', blob: blob('3') },
        ]);
        const names = Object.keys(unzipSync(new Uint8Array(await zip.arrayBuffer())));

        expect(names).toEqual(['evil.txt', 'evil (2).txt', 'evil (3).txt']);
        expect(names.every((name) => !name.includes('/') && !name.includes('..'))).toBe(true);
    });
});
