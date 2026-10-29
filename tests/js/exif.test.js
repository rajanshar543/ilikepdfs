import { describe, expect, it } from 'vitest';
import { jpegOrientation } from '../../resources/js/core/exif.js';

/** Builds a minimal JPEG header with an EXIF orientation tag. */
function jpegWithOrientation(value, { little = true } = {}) {
    const u16 = (n) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
    const u32 = (n) => (little ? [n & 255, (n >> 8) & 255, 0, 0] : [0, 0, (n >> 8) & 255, n & 255]);
    const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(value), 0, 0, ...u32(0)];
    const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const length = exif.length + 2;

    return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 255, ...exif, 0xff, 0xda, 0, 2]);
}

describe('jpegOrientation', () => {
    it.each([1, 3, 6, 8])('reads orientation %i in both byte orders', (value) => {
        expect(jpegOrientation(jpegWithOrientation(value, { little: true }))).toBe(value);
        expect(jpegOrientation(jpegWithOrientation(value, { little: false }))).toBe(value);
    });

    it('returns 1 for anything missing, invalid or malformed', () => {
        expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
        expect(jpegOrientation(new Uint8Array([1, 2, 3]))).toBe(1);
        expect(jpegOrientation(jpegWithOrientation(99))).toBe(1);
        expect(jpegOrientation(jpegWithOrientation(6).subarray(0, 14))).toBe(1);
        expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0]))).toBe(1);
    });
});
