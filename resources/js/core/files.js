import { strFromU8, unzipSync } from 'fflate';
import { ToolError } from './errors.js';

export const MAX_PIXELS = 80_000_000;
export const MAX_SVG_BYTES = 5 * 1024 * 1024;
export const HEAD_BYTES = 4096;

export const KIND_LABELS = {
    pdf: 'PDF',
    jpeg: 'JPG',
    png: 'PNG',
    webp: 'WebP',
    tiff: 'TIFF',
    heic: 'HEIC',
    svg: 'SVG',
    gif: 'GIF',
    docx: 'Word',
    pptx: 'PowerPoint',
    xlsx: 'Excel',
    html: 'HTML',
    text: 'text',
    zip: 'ZIP',
};

/** Office files are ZIP archives; these are the entries that tell them apart. */
const OFFICE_MARKERS = [
    ['docx', 'wordprocessingml.document'],
    ['pptx', 'presentationml.presentation'],
    ['xlsx', 'spreadsheetml.sheet'],
];

const MAX_OFFICE_MARKER_BYTES = 1024 * 1024;

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'heif']);

const ascii = (bytes, start, end) => String.fromCharCode(...bytes.subarray(start, end));

const startsWith = (bytes, signature) => signature.every((value, index) => bytes[index] === value);

/**
 * Identifies a file by its content, never by its name or declared type.
 *
 * @param {Uint8Array} bytes first bytes of the file
 * @returns {string|null} one of the KIND_LABELS keys, or null when unknown
 */
export function detectKind(bytes) {
    if (!bytes || bytes.length < 4) {
        return null;
    }

    if (ascii(bytes, 0, Math.min(bytes.length, 1024)).includes('%PDF-')) {
        return 'pdf';
    }

    if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
        return 'jpeg';
    }

    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return 'png';
    }

    if (ascii(bytes, 0, 4) === 'GIF8') {
        return 'gif';
    }

    if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
        return 'webp';
    }

    if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
        return 'tiff';
    }

    if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii(bytes, 8, 12))) {
        return 'heic';
    }

    if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
        return 'zip';
    }

    if (looksLikeSvg(bytes)) {
        return 'svg';
    }

    if (looksLikeHtml(bytes)) {
        return 'html';
    }

    return looksLikeText(bytes) ? 'text' : null;
}

function decodeHead(bytes) {
    return new TextDecoder('utf-8').decode(bytes.subarray(0, HEAD_BYTES));
}

function looksLikeHtml(bytes) {
    if (bytes.includes(0)) {
        return false;
    }

    return /^\uFEFF?\s*(<!--[\s\S]*?-->\s*)*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<(h[1-6]|p|div|table|ul|ol|section|article|span|a|img|style|meta|title)[\s>])/i.test(decodeHead(bytes));
}

/** Plain text: no NUL bytes and valid UTF-8 (a cut multi-byte character at the end is tolerated). */
function looksLikeText(bytes) {
    if (bytes.includes(0)) {
        return false;
    }

    let end = Math.min(bytes.length, HEAD_BYTES);

    // Step back over a multi-byte sequence the slice may have cut in half.
    while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
        end -= 1;
    }

    try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end));

        return true;
    } catch {
        return false;
    }
}

/**
 * Tells a docx / pptx / xlsx apart inside a ZIP by reading only the small
 * [Content_Types].xml entry, so a zip bomb is never expanded.
 *
 * @param {Uint8Array} bytes the whole file
 * @returns {string|null}
 */
export function officeKindOf(bytes) {
    try {
        const entries = unzipSync(bytes, {
            filter: (entry) => entry.name === '[Content_Types].xml' && entry.originalSize <= MAX_OFFICE_MARKER_BYTES,
        });
        const types = entries['[Content_Types].xml'];

        if (!types) {
            return null;
        }

        const text = strFromU8(types);

        return OFFICE_MARKERS.find(([, marker]) => text.includes(marker))?.[0] ?? null;
    } catch {
        return null;
    }
}

function looksLikeSvg(bytes) {
    if (bytes.includes(0)) {
        return false;
    }

    const text = new TextDecoder('utf-8').decode(bytes.subarray(0, HEAD_BYTES));

    return /^﻿?\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text);
}

/**
 * Reads the head of a File and checks that its real type is one we accept.
 *
 * @param {File|Blob} file
 * @param {string[]} allowedKinds
 * @returns {Promise<string>} the detected kind
 */
export async function checkFileKind(file, allowedKinds) {
    const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
    let kind = detectKind(head);

    if (kind === 'zip' && allowedKinds.some((item) => OFFICE_MARKERS.some(([office]) => office === item))) {
        kind = officeKindOf(new Uint8Array(await file.arrayBuffer()));
    }

    // Anything readable as text is also acceptable where HTML or plain text is allowed.
    if (kind === 'html' && allowedKinds.includes('text') && !allowedKinds.includes('html')) {
        kind = 'text';
    }

    if (kind === null || !allowedKinds.includes(kind)) {
        const wanted = allowedKinds.map((item) => KIND_LABELS[item]).join(' / ');

        throw new ToolError(`"${file.name}" is not a valid ${wanted} file.`);
    }

    return kind;
}

/**
 * Throws when a decoded image would need an unreasonable amount of memory.
 * Guards against decompression bombs (tiny files that expand to huge bitmaps).
 */
export function assertPixelBudget(width, height) {
    if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
        throw new ToolError('This image has invalid dimensions.');
    }

    if (width * height > MAX_PIXELS) {
        throw new ToolError('This image is too large to process in the browser.');
    }
}

export function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }

    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/**
 * Makes a name safe to offer as a download: no paths, no control characters,
 * no reserved characters, bounded length.
 */
export function safeFilename(name, fallback = 'file') {
    const base = String(name ?? '')
        .split(/[\\/]/)
        .pop()
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
        .replace(/^\.+/, '')
        .trim();

    const cleaned = base.length > 120 ? base.slice(0, 120) : base;

    return cleaned === '' ? fallback : cleaned;
}

export function baseName(name) {
    const safe = safeFilename(name, 'file');
    const dot = safe.lastIndexOf('.');

    return dot > 0 ? safe.slice(0, dot) : safe;
}
