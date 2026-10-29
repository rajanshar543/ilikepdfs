/**
 * Reads the EXIF orientation (1-8) of a JPEG. Returns 1 when absent or when the
 * data is malformed, so callers can treat "1" as "draw as is".
 *
 * @param {Uint8Array} bytes
 */
export function jpegOrientation(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        return 1;
    }

    let offset = 2;

    while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== 0xff) {
            return 1;
        }

        const marker = bytes[offset + 1];

        if (marker === 0xda || marker === 0xd9) {
            return 1;
        }

        const length = (bytes[offset + 2] << 8) | bytes[offset + 3];

        if (length < 2) {
            return 1;
        }

        if (marker === 0xe1 && isExif(bytes, offset + 4)) {
            return readOrientation(bytes, offset + 10, Math.min(bytes.length, offset + 2 + length));
        }

        offset += 2 + length;
    }

    return 1;
}

function isExif(bytes, start) {
    return bytes[start] === 0x45 && bytes[start + 1] === 0x78 && bytes[start + 2] === 0x69
        && bytes[start + 3] === 0x66 && bytes[start + 4] === 0 && bytes[start + 5] === 0;
}

function readOrientation(bytes, tiff, end) {
    if (tiff + 8 > end) {
        return 1;
    }

    const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
    const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;

    if (!little && !big) {
        return 1;
    }

    const u16 = (at) => (at + 2 > end ? 0 : little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
    const u32 = (at) => (at + 4 > end ? 0 : little
        ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
        : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0);

    const ifd = tiff + u32(tiff + 4);
    const entries = u16(ifd);

    for (let index = 0; index < Math.min(entries, 64); index += 1) {
        const entry = ifd + 2 + index * 12;

        if (u16(entry) === 0x0112) {
            const value = u16(entry + 8);

            return value >= 1 && value <= 8 ? value : 1;
        }
    }

    return 1;
}
