import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';

export const kinds = ['html', 'text'];
export const allowsEmpty = true;
export const thumbs = false;

const MAX_HTML_CHARS = 3_000_000;
const MAX_DATA_URI = 300_000;
const ENDPOINT = '/html-to-pdf';

export function readOptions(root) {
    const value = (selector, fallback = '') => root.querySelector(selector)?.value ?? fallback;

    return {
        html: value('textarea[name="html"]'),
        url: value('input[name="url"]'),
        pageSize: value('select[name="pageSize"]', 'a4'),
        orientation: value('select[name="orientation"]', 'portrait'),
        margin: value('select[name="margin"]', 'normal'),
    };
}

/**
 * Drops what a PDF never needs but real pages are full of (scripts, comments,
 * icons, frames, huge inline pictures), so saved pages fit the size limit.
 */
export function cleanHtml(html) {
    return html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, '')
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, '')
        .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
        .replace(/<(?:link|meta)\b[^>]*>/gi, '')
        .replace(new RegExp(`\\bsrc\\s*=\\s*(["'])data:[^"']{${MAX_DATA_URI},}\\1`, 'gi'), 'src=""');
}

const megabytes = (characters) => `${(characters / 1_000_000).toFixed(1)} MB`;

function csrfToken() {
    return globalThis.document?.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

/**
 * Sends HTML (from a file, pasted text, or a web address) to the server, which
 * returns the PDF. This is the one tool that needs the server.
 *
 * @param {File[]} files zero or one HTML file; a file wins over pasted HTML, which wins over an address
 * @param {object} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { html = '', url = '', pageSize = 'a4', orientation = 'portrait', margin = 'normal' } = options;
    const body = { pageSize, orientation, margin };
    let name = 'page';

    if (files.length > 0) {
        body.html = await files[0].text();
        name = baseName(files[0].name);
    } else if (html.trim() !== '') {
        body.html = html;
    } else if (url.trim() !== '') {
        body.url = url.trim();
        name = 'webpage';
    } else {
        throw new ToolError('Paste some HTML, choose an HTML file or enter a web address.');
    }

    if (body.html !== undefined) {
        body.html = cleanHtml(body.html);

        if (body.html.length > MAX_HTML_CHARS) {
            throw new ToolError(`This page is still ${megabytes(body.html.length)} after removing scripts and icons. The limit is ${megabytes(MAX_HTML_CHARS)}. Paste only the part you need.`);
        }
    }

    onProgress(0.3, body.url ? 'Loading the page and making the PDF' : 'Making the PDF');

    let response;

    try {
        response = await fetch(ENDPOINT, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/pdf, application/json', 'X-CSRF-TOKEN': csrfToken() },
            body: JSON.stringify(body),
        });
    } catch {
        throw new ToolError('The server could not be reached. Check your connection and try again.');
    }

    if (response.status === 429) {
        throw new ToolError('Too many conversions in a short time. Please wait a minute and try again.');
    }

    if (!response.ok) {
        let message = 'The page could not be converted.';

        try {
            message = (await response.json()).message || message;
        } catch {
            // The server did not send JSON; keep the generic message.
        }

        throw new ToolError(message);
    }

    const pdf = await response.blob();

    if (pdf.type !== 'application/pdf' && pdf.size === 0) {
        throw new ToolError('The server did not return a PDF.');
    }

    return [{ name: `${name}.pdf`, blob: new Blob([pdf], { type: 'application/pdf' }) }];
}
