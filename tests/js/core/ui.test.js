// @vitest-environment jsdom
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolError } from '../../../resources/js/core/errors.js';
import { mountTool } from '../../../resources/js/core/ui.js';
import * as mergePdf from '../../../resources/js/tools/merge-pdf.js';
import * as splitPdf from '../../../resources/js/tools/split-pdf.js';
import { makePdf } from '../helpers.js';

globalThis.File = NodeFile;
globalThis.Blob = NodeBlob;

/** Mirrors the markup in resources/views/tools/show.blade.php. */
function pageMarkup({ multiple = true, maxFiles = 5, maxMb = 1 } = {}) {
    document.body.innerHTML = `
      <section data-tool="x" data-multiple="${multiple ? 1 : 0}" data-max-files="${maxFiles}" data-max-mb="${maxMb}">
        <div data-panel="select"><label data-drop tabindex="0"><input type="file" data-input hidden></label></div>
        <div data-panel="work" hidden>
          <ul data-files></ul><button type="button" data-add hidden></button>
          <fieldset data-options>
            <input type="radio" name="mode" value="each" checked><input type="radio" name="mode" value="ranges"><input type="radio" name="mode" value="extract">
            <div data-ranges hidden><input type="text" name="ranges" value="2-3"></div>
          </fieldset>
          <div data-error hidden></div>
          <div data-progress hidden><div><i data-progress-bar></i></div><span data-progress-text></span></div>
          <button type="button" data-run></button><button type="button" data-reset></button>
        </div>
        <div data-panel="done" hidden><p data-meter></p><div data-results></div><button type="button" data-reset></button></div>
      </section>`;

    return document.querySelector('[data-tool]');
}

const names = () => [...document.querySelectorAll('.file__name')].map((node) => node.textContent);
const visible = (panel) => !document.querySelector(`[data-panel="${panel}"]`).hidden;

beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
});

describe('mountTool', () => {
    it('lists valid files, hides the picker and shows the work panel', async () => {
        const ui = mountTool(pageMarkup(), mergePdf);
        await ui.addFiles([await makePdf(1), await makePdf(2)]);

        expect(names()).toEqual(['sample.pdf', 'sample.pdf']);
        expect(visible('work')).toBe(true);
        expect(visible('select')).toBe(false);
    });

    it('rejects files by content, not by name or declared type', async () => {
        const ui = mountTool(pageMarkup(), mergePdf);
        const fake = new File(['<?php system($_GET[1]);'], 'invoice.pdf', { type: 'application/pdf' });
        await ui.addFiles([fake]);

        expect(ui.getItems()).toHaveLength(0);
        expect(visible('select')).toBe(true);
        expect(document.querySelector('[data-error]').textContent).toContain('"invoice.pdf" is not a valid PDF file.');
    });

    it('rejects empty and oversized files and keeps the good ones', async () => {
        const ui = mountTool(pageMarkup({ maxMb: 1 }), mergePdf);
        const big = new File([new Uint8Array(1024 * 1024 + 1)], 'big.pdf');
        await ui.addFiles([new File([], 'empty.pdf'), big, await makePdf(1)]);

        expect(names()).toEqual(['sample.pdf']);
        const message = document.querySelector('[data-error]').textContent;
        expect(message).toContain('"empty.pdf" is empty.');
        expect(message).toContain('"big.pdf" is larger than 1 MB.');
    });

    it('enforces the maximum number of files', async () => {
        const ui = mountTool(pageMarkup({ maxFiles: 2 }), mergePdf);
        await ui.addFiles([await makePdf(1), await makePdf(1), await makePdf(1)]);

        expect(ui.getItems()).toHaveLength(2);
        expect(document.querySelector('[data-error]').textContent).toContain('up to 2 files');
    });

    it('lets files be reordered and removed', async () => {
        const ui = mountTool(pageMarkup(), mergePdf);
        const a = await makePdf(1, { label: 'A' });
        const b = await makePdf(1, { label: 'B' });
        Object.defineProperty(a, 'name', { value: 'a.pdf' });
        Object.defineProperty(b, 'name', { value: 'b.pdf' });
        await ui.addFiles([a, b]);

        document.querySelectorAll('.file')[0].querySelector('[aria-label="Move down"]').click();
        expect(names()).toEqual(['b.pdf', 'a.pdf']);

        document.querySelectorAll('.file')[0].querySelector('[aria-label^="Remove"]').click();
        expect(names()).toEqual(['a.pdf']);
    });

    it('shows file names as text, never as HTML', async () => {
        const ui = mountTool(pageMarkup(), mergePdf);
        const file = await makePdf(1);
        Object.defineProperty(file, 'name', { value: '<img src=x onerror=alert(1)>.pdf' });
        await ui.addFiles([file]);

        expect(document.querySelector('img')).toBeNull();
        expect(names()[0]).toBe('<img src=x onerror=alert(1)>.pdf');
    });

    it('runs the tool and offers a download of the result', async () => {
        const root = pageMarkup();
        const result = new NodeBlob(['%PDF-fake'], { type: 'application/pdf' });
        const tool = { kinds: ['pdf'], process: vi.fn(async () => [{ name: '../merged.pdf', blob: result }]) };
        const ui = mountTool(root, tool);
        await ui.addFiles([await makePdf(1), await makePdf(2)]);
        root.querySelector('[data-run]').click();
        await vi.waitFor(() => expect(visible('done')).toBe(true));

        const link = root.querySelector('.result a');
        expect(tool.process).toHaveBeenCalledWith(expect.any(Array), {}, expect.any(Function));
        expect(tool.process.mock.calls[0][0]).toHaveLength(2);
        expect(link.getAttribute('download')).toBe('merged.pdf');
        expect(link.getAttribute('href')).toBe('blob:fake');
        expect(URL.createObjectURL).toHaveBeenCalledWith(result);
    });

    it('shows a ToolError message but hides unexpected error details', async () => {
        const root = pageMarkup();
        const failing = { kinds: ['pdf'], process: vi.fn().mockRejectedValueOnce(new ToolError('Friendly problem')).mockRejectedValueOnce(new Error('secret stack detail')) };
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const ui = mountTool(root, failing);
        await ui.addFiles([await makePdf(1)]);
        const error = root.querySelector('[data-error]');

        root.querySelector('[data-run]').click();
        await vi.waitFor(() => expect(error.textContent).toBe('Friendly problem'));

        root.querySelector('[data-run]').click();
        await vi.waitFor(() => expect(error.textContent).toContain('Something went wrong'));
        expect(error.textContent).not.toContain('secret');
        expect(root.querySelector('[data-run]').disabled).toBe(false);
    });

    it('does not start a second run while one is busy', async () => {
        const root = pageMarkup();
        let release;
        const slow = { kinds: ['pdf'], process: vi.fn(() => new Promise((resolve) => { release = resolve; })) };
        const ui = mountTool(root, slow);
        await ui.addFiles([await makePdf(1)]);

        root.querySelector('[data-run]').click();
        root.querySelector('[data-run]').click();
        expect(slow.process).toHaveBeenCalledTimes(1);
        release([{ name: 'a.txt', text: 'hi' }]);
        await vi.waitFor(() => expect(visible('done')).toBe(true));
    });

    it('renders text results and resets to the start', async () => {
        const root = pageMarkup();
        const tool = { kinds: ['pdf'], process: async () => [{ name: 'out.txt', text: '<b>hello</b>' }] };
        const ui = mountTool(root, tool);
        await ui.addFiles([await makePdf(1)]);
        root.querySelector('[data-run]').click();
        await vi.waitFor(() => expect(visible('done')).toBe(true));

        expect(root.querySelector('textarea').value).toBe('<b>hello</b>');
        expect(root.querySelector('.result b')).toBeNull();

        root.querySelector('[data-panel="done"] [data-reset]').click();
        expect(visible('select')).toBe(true);
        expect(ui.getItems()).toHaveLength(0);
    });

    it('replaces the file in single-file tools', async () => {
        const ui = mountTool(pageMarkup({ multiple: false, maxFiles: 1 }), splitPdf);
        await ui.addFiles([await makePdf(2)]);
        await ui.addFiles([await makePdf(3)]);

        expect(ui.getItems()).toHaveLength(1);
    });
});

describe('split-pdf options', () => {
    it('shows the range field only when needed and reads the options', () => {
        const root = pageMarkup();
        splitPdf.init(root);
        const ranges = root.querySelector('[data-ranges]');

        expect(ranges.hidden).toBe(true);
        root.querySelector('input[value="extract"]').click();
        expect(ranges.hidden).toBe(false);
        expect(splitPdf.readOptions(root)).toEqual({ mode: 'extract', ranges: '2-3' });
    });
});

describe('privacy meter, paste, shortcut and remembered settings', () => {
    const entry = (name, initiatorType) => ({ name, initiatorType });
    let entries;

    beforeEach(() => {
        entries = [];
        vi.spyOn(globalThis.performance, 'getEntriesByType').mockImplementation(() => entries);
        globalThis.localStorage.clear();
    });

    const runWith = async (during) => {
        const root = pageMarkup();
        const tool = { kinds: ['pdf'], process: vi.fn(async () => { entries.push(...during); return [{ name: 'a.txt', text: 'x' }]; }) };
        const ui = mountTool(root, tool);
        await ui.addFiles([await makePdf(1)]);
        root.querySelector('[data-run]').click();
        await vi.waitFor(() => expect(visible('done')).toBe(true));

        return root;
    };

    it('says that nothing left the device when only this site\'s own files were loaded', async () => {
        const root = await runWith([entry('http://x/build/assets/qpdf.wasm', 'fetch'), entry('http://x/vendor/tesseract/lang/eng.gz', 'fetch'), entry('http://x/build/a.js', 'script'), entry('blob:abc', 'fetch')]);
        const meter = root.querySelector('[data-meter]');

        expect(meter.textContent).toBe('Done on your device. 0 files were sent over the network.');
        expect(meter.classList.contains('is-zero')).toBe(true);
    });

    it('counts real requests, so a server tool is not described as private', async () => {
        const root = await runWith([entry('http://x/html-to-pdf', 'fetch')]);
        const meter = root.querySelector('[data-meter]');

        expect(meter.textContent).toBe('This tool needs our server: 1 request sent to make the result.');
        expect(meter.classList.contains('is-zero')).toBe(false);
    });

    it('adds files pasted from the clipboard, but not when typing in a field', async () => {
        const root = pageMarkup();
        const ui = mountTool(root, mergePdf);
        const pasted = (target, files) => {
            const event = new Event('paste', { bubbles: true, cancelable: true });
            event.clipboardData = { files };
            target.dispatchEvent(event);
        };

        pasted(root.querySelector('[name="ranges"]'), [await makePdf(1)]);
        await Promise.resolve();
        expect(ui.getItems()).toHaveLength(0);

        pasted(document.body, [await makePdf(1)]);
        await vi.waitFor(() => expect(ui.getItems()).toHaveLength(1));
    });

    it('runs with Ctrl+Enter only while files are loaded', async () => {
        const root = pageMarkup();
        const tool = { kinds: ['pdf'], process: vi.fn(async () => [{ name: 'a.txt', text: 'x' }]) };
        const ui = mountTool(root, tool);
        const press = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));

        press();
        expect(tool.process).not.toHaveBeenCalled();

        await ui.addFiles([await makePdf(1)]);
        press();
        await vi.waitFor(() => expect(tool.process).toHaveBeenCalledTimes(1));
    });

    it('remembers option choices on this device, but never typed text', async () => {
        const first = pageMarkup();
        mountTool(first, { kinds: ['pdf'], process: async () => [] });
        first.querySelector('input[value="extract"]').click();
        first.querySelector('[name="ranges"]').value = '1-3';
        first.querySelector('input[value="extract"]').dispatchEvent(new Event('change', { bubbles: true }));

        const stored = JSON.parse(localStorage.getItem('ilikepdfs:options:x'));
        expect(stored['mode=extract']).toBe(true);
        expect(JSON.stringify(stored)).not.toContain('1-3');

        const second = pageMarkup();
        mountTool(second, { kinds: ['pdf'], process: async () => [] });

        expect(second.querySelector('input[value="extract"]').checked).toBe(true);
        expect(second.querySelector('input[value="each"]').checked).toBe(false);
    });
});
