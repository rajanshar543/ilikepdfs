// @vitest-environment jsdom
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { cleanHtml, process, readOptions } from '../../resources/js/tools/html-to-pdf.js';

globalThis.File = NodeFile;
globalThis.Blob = NodeBlob;

const pdfResponse = () => new Response(new NodeBlob(['%PDF-1.4 fake'], { type: 'application/pdf' }), { status: 200 });
const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let fetchMock;

beforeEach(() => {
    document.head.innerHTML = '<meta name="csrf-token" content="token-123">';
    fetchMock = vi.fn(async () => pdfResponse());
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe('html-to-pdf', () => {
    it('sends pasted HTML with the CSRF token and returns the PDF', async () => {
        const [result] = await process([], { html: '<h1>Hi</h1>', pageSize: 'letter', orientation: 'landscape', margin: 'none' });
        const [url, init] = fetchMock.mock.calls[0];

        expect(url).toBe('/html-to-pdf');
        expect(init.method).toBe('POST');
        expect(init.credentials).toBe('same-origin');
        expect(init.headers['X-CSRF-TOKEN']).toBe('token-123');
        expect(sent()).toEqual({ pageSize: 'letter', orientation: 'landscape', margin: 'none', html: '<h1>Hi</h1>' });
        expect(result.name).toBe('page.pdf');
        expect(result.blob.type).toBe('application/pdf');
    });

    it('prefers a chosen file over pasted HTML, and pasted HTML over an address', async () => {
        const file = new File(['<p>from file</p>'], 'report.html');
        const [fromFile] = await process([file], { html: '<p>pasted</p>', url: 'https://example.com' });

        expect(sent().html).toBe('<p>from file</p>');
        expect(sent().url).toBeUndefined();
        expect(fromFile.name).toBe('report.pdf');

        fetchMock.mockClear();
        await process([], { html: '<p>pasted</p>', url: 'https://example.com' });
        expect(sent().url).toBeUndefined();
    });

    it('sends a web address when that is all there is', async () => {
        const [result] = await process([], { url: '  https://example.com/a  ' });

        expect(sent().url).toBe('https://example.com/a');
        expect(sent().html).toBeUndefined();
        expect(result.name).toBe('webpage.pdf');
    });

    it('turns server errors into readable messages', async () => {
        fetchMock.mockResolvedValueOnce(json({ message: 'That address is not allowed.' }, 422));
        await expect(process([], { url: 'http://127.0.0.1' })).rejects.toThrow('That address is not allowed.');

        fetchMock.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 500 }));
        await expect(process([], { html: 'x' })).rejects.toThrow('could not be converted');

        fetchMock.mockResolvedValueOnce(json({}, 429));
        await expect(process([], { html: 'x' })).rejects.toThrow('Too many conversions');

        fetchMock.mockRejectedValueOnce(new TypeError('network'));
        await expect(process([], { html: 'x' })).rejects.toThrow('could not be reached');
    });

    it('needs some input and limits its size', async () => {
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
        await expect(process([], { html: '  ', url: '  ' })).rejects.toThrow('Paste some HTML');
        await expect(process([], { html: `<p>${'word '.repeat(700_000)}</p>` })).rejects.toThrow(/still 3\.5 MB after removing scripts/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('cleans a big saved page so that it fits, and sends the cleaned HTML', async () => {
        const saved = `<html><head><script>${'var a=1;'.repeat(500_000)}</script></head><body><h1>Short</h1><!-- note --><svg><path d="M0 0"/></svg></body></html>`;
        expect(saved.length).toBeGreaterThan(3_000_000);

        await process([], { html: saved });

        expect(sent().html).toBe('<html><head></head><body><h1>Short</h1></body></html>');
    });

    it('cleanHtml keeps real content, conditional comments and small pictures', () => {
        const html = '<!--[if IE]><p>ie</p><![endif]--><p>Keep</p><img src="data:image/png;base64,AAAA"><script>bad()</script><link rel="x"><meta charset="utf-8">';

        expect(cleanHtml(html)).toBe('<!--[if IE]><p>ie</p><![endif]--><p>Keep</p><img src="data:image/png;base64,AAAA">');
        expect(cleanHtml(`<img src="data:image/png;base64,${'A'.repeat(400_000)}"><p>x</p>`)).toBe('<img src=""><p>x</p>');
    });

    it('reads its options from the page', () => {
        document.body.innerHTML = '<textarea name="html">&lt;p&gt;x&lt;/p&gt;</textarea><input name="url" value="https://a.b"><select name="pageSize"><option value="letter" selected>L</option></select>';

        expect(readOptions(document.body)).toEqual({ html: '<p>x</p>', url: 'https://a.b', pageSize: 'letter', orientation: 'portrait', margin: 'normal' });
    });
});
