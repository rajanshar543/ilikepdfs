import { ToolError } from './errors.js';
import { checkFileKind, formatBytes, safeFilename } from './files.js';
import { zipResults } from './zip.js';

/**
 * Wires a tool page to its module. A module exports:
 *   kinds        allowed file kinds (see files.js)
 *   process()    (files, options, onProgress) => results [{name, blob} | {name, text}]
 *   readOptions  optional, (root) => options
 *   init         optional, (root) => void, for option widgets
 *   thumbs       optional, show image previews in the file list
 */
export function mountTool(root, tool) {
    const $ = (selector) => root.querySelector(selector);
    const panels = {
        select: $('[data-panel="select"]'),
        work: $('[data-panel="work"]'),
        done: $('[data-panel="done"]'),
    };
    const drop = $('[data-drop]');
    const input = $('[data-input]');
    const list = $('[data-files]');
    const addButton = $('[data-add]');
    const runButton = $('[data-run]');
    const errorBox = $('[data-error]');
    const progress = $('[data-progress]');
    const progressBar = $('[data-progress-bar]');
    const progressText = $('[data-progress-text]');
    const results = $('[data-results]');
    const meter = $('[data-meter]');

    const multiple = root.dataset.multiple === '1';
    const maxFiles = Number(root.dataset.maxFiles) || 1;
    const maxBytes = (Number(root.dataset.maxMb) || 100) * 1024 * 1024;

    let items = [];
    let busy = false;
    let objectUrls = [];
    let nextId = 1;

    const mainArea = $('[data-main]');
    const counter = $('[data-count]');

    // Big editing areas (page viewer, page grid) sit in the main area next to the sidebar.
    root.querySelectorAll('[data-stage]').forEach((stage) => {
        mainArea?.append(stage);
        mainArea?.classList.add('has-stage');
    });

    tool.init?.(root);

    const showPanel = (name) => {
        Object.entries(panels).forEach(([key, panel]) => {
            panel.hidden = key !== name;
        });
        root.classList.toggle('is-working', name === 'work');
        root.classList.toggle('is-done', name === 'done');
    };

    const showError = (message) => {
        errorBox.textContent = message;
        errorBox.hidden = message === '';
    };

    const setProgress = (fraction, text) => {
        progress.hidden = false;
        progressBar.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
        progressText.textContent = text ?? 'Working...';
    };

    const trackUrl = (blob) => {
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);

        return url;
    };

    const releaseUrls = () => {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls = [];
    };

    async function addFiles(fileList) {
        if (busy) {
            return;
        }

        showError('');
        const problems = [];
        let incoming = Array.from(fileList);

        if (!multiple) {
            incoming = incoming.slice(0, 1);
            items = [];
        }

        for (const file of incoming) {
            if (items.length >= maxFiles) {
                problems.push(`You can add up to ${maxFiles} file${maxFiles === 1 ? '' : 's'}.`);
                break;
            }

            try {
                if (file.size === 0) {
                    throw new ToolError(`"${file.name}" is empty.`);
                }

                if (file.size > maxBytes) {
                    throw new ToolError(`"${file.name}" is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
                }

                const kind = await checkFileKind(file, tool.kinds);
                items.push({ id: nextId++, file, kind });
            } catch (error) {
                problems.push(error instanceof ToolError ? error.message : `"${file.name}" could not be read.`);
            }
        }

        render();

        if (problems.length > 0) {
            showError(problems.join(' '));
        }
    }

    const KIND_LABELS = {
        pdf: 'PDF', jpeg: 'JPG', png: 'PNG', webp: 'WEBP', tiff: 'TIFF', heic: 'HEIC', svg: 'SVG', gif: 'GIF', docx: 'DOCX', pptx: 'PPTX', xlsx: 'XLSX', html: 'HTML', text: 'TXT',
    };
    const IMAGE_KINDS = ['jpeg', 'png', 'webp', 'gif', 'svg'];
    const canRender = typeof navigator === 'undefined' || !navigator.userAgent.includes('jsdom');
    let thumbQueue = Promise.resolve();

    /** First page of a PDF as a small picture, made one file at a time. */
    async function pdfPreview(file) {
        const { closePdf, openPdf, renderPage } = await import('./pdfjs.js');
        const document_ = await openPdf(file);

        try {
            const page = await document_.getPage(1);
            const { canvas } = await renderPage(page, 0.4);
            canvas.className = 'file__canvas';

            return canvas;
        } finally {
            await closePdf(document_);
        }
    }

    /** A picture for a file card: the real image or first page when possible, otherwise a type badge. */
    function previewFor(item) {
        if (item.preview) {
            return item.preview;
        }

        const box = document.createElement('div');
        box.className = 'file__preview';
        const badge = document.createElement('span');
        badge.className = 'file__badge';
        badge.textContent = KIND_LABELS[item.kind] ?? 'FILE';
        box.append(badge);
        item.preview = box;

        if (IMAGE_KINDS.includes(item.kind)) {
            const url = URL.createObjectURL(item.file);
            const image = new Image();
            image.className = 'file__thumb';
            image.alt = '';
            image.onload = () => {
                box.replaceChildren(image);
                URL.revokeObjectURL(url);
            };
            image.onerror = () => URL.revokeObjectURL(url);
            image.src = url;
        } else if (item.kind === 'pdf' && canRender) {
            thumbQueue = thumbQueue
                .then(() => pdfPreview(item.file))
                .then((canvas) => box.replaceChildren(canvas))
                .catch(() => {});
        }

        return box;
    }

    function render() {
        list.replaceChildren();
        releaseUrls();

        items.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'file';
            li.dataset.id = String(item.id);

            li.append(previewFor(item));

            const name = document.createElement('span');
            name.className = 'file__name';
            name.textContent = item.file.name;
            name.title = item.file.name;

            const size = document.createElement('span');
            size.className = 'file__size';
            size.textContent = formatBytes(item.file.size);

            li.append(name, size);

            if (multiple && items.length > 1) {
                const bar = document.createElement('div');
                bar.className = 'file__bar';
                bar.append(
                    moveButton('←', 'Move up', index > 0, () => move(index, index - 1)),
                    moveButton('→', 'Move down', index < items.length - 1, () => move(index, index + 1)),
                );
                li.draggable = true;
                li.append(bar);
                bindDrag(li, item.id);
            }

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'file__remove';
            remove.setAttribute('aria-label', `Remove ${item.file.name}`);
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                items = items.filter((entry) => entry.id !== item.id);
                render();
            });
            li.append(remove);

            list.append(li);
        });

        addButton.hidden = !(multiple && items.length < maxFiles);

        if (counter) {
            counter.textContent = String(items.length);
        }

        showPanel(items.length > 0 ? 'work' : 'select');
        tool.onFilesChanged?.(root, items.map((item) => item.file));
    }

    function moveButton(label, title, enabled, handler) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'file__remove';
        button.title = title;
        button.setAttribute('aria-label', title);
        button.textContent = label;
        button.disabled = !enabled;
        button.addEventListener('click', handler);

        return button;
    }

    function move(from, to) {
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        render();
    }

    let draggingId = null;

    function bindDrag(li, id) {
        li.addEventListener('dragstart', (event) => {
            draggingId = id;
            li.classList.add('is-dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(id));
        });
        li.addEventListener('dragend', () => li.classList.remove('is-dragging'));
        li.addEventListener('dragover', (event) => {
            if (draggingId !== null) {
                event.preventDefault();
            }
        });
        li.addEventListener('drop', (event) => {
            event.preventDefault();

            if (draggingId === null || draggingId === id) {
                return;
            }

            const from = items.findIndex((entry) => entry.id === draggingId);
            const to = items.findIndex((entry) => entry.id === id);
            draggingId = null;

            if (from !== -1 && to !== -1) {
                move(from, to);
            }
        });
    }

    function renderResults(output) {
        results.replaceChildren();

        output.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'result';

            const info = document.createElement('div');
            info.className = 'result__info';
            const name = document.createElement('div');
            name.className = 'result__name';
            name.textContent = entry.name;
            const meta = document.createElement('div');
            meta.className = 'result__meta';
            info.append(name, meta);

            if (entry.blob?.type.startsWith('image/') && entry.blob.size < 25 * 1024 * 1024) {
                const preview = document.createElement('img');
                preview.className = 'result__thumb';
                preview.alt = '';
                preview.src = trackUrl(entry.blob);
                row.append(preview);
            }

            if (typeof entry.text === 'string') {
                meta.textContent = `${entry.text.length.toLocaleString()} characters`;
                const area = document.createElement('textarea');
                area.readOnly = true;
                area.value = entry.text;
                info.append(area);
                row.append(info, downloadLink(new Blob([entry.text], { type: 'text/plain;charset=utf-8' }), entry.name));
            } else {
                meta.textContent = [formatBytes(entry.blob.size), entry.note].filter(Boolean).join(' · ');
                row.append(info, downloadLink(entry.blob, entry.name));
            }

            results.append(row);
        });

        const blobs = output.filter((entry) => entry.blob);

        if (blobs.length > 1) {
            const zipButton = document.createElement('button');
            zipButton.type = 'button';
            zipButton.className = 'btn btn--primary';
            zipButton.textContent = 'Download all as ZIP';
            zipButton.addEventListener('click', async () => {
                zipButton.disabled = true;
                const zip = await zipResults(blobs);
                const link = downloadLink(zip, 'ilikepdfs.zip');
                link.hidden = true;
                results.append(link);
                link.click();
                zipButton.disabled = false;
            });
            results.append(zipButton);
        }
    }

    function downloadLink(blob, filename) {
        const link = document.createElement('a');
        link.className = 'btn btn--primary';
        link.textContent = 'Download';
        link.href = trackUrl(blob);
        link.download = safeFilename(filename);

        return link;
    }

    /**
     * Shows how many network requests (other than this site's own scripts and
     * data files) happened while converting: 0 means nothing left the device.
     */
    function showMeter(before) {
        if (!meter) {
            return;
        }

        const sent = (globalThis.performance?.getEntriesByType?.('resource') ?? []).slice(before)
            .filter((entry) => ['fetch', 'xmlhttprequest', 'beacon'].includes(entry.initiatorType))
            .filter((entry) => !/\/(build|vendor)\//.test(entry.name) && !/^(blob|data):/.test(entry.name));

        meter.textContent = sent.length === 0
            ? 'Done on your device. 0 files were sent over the network.'
            : `This tool needs our server: ${sent.length} request${sent.length === 1 ? '' : 's'} sent to make the result.`;
        meter.classList.toggle('is-zero', sent.length === 0);
    }

    async function run() {
        if (busy || (items.length === 0 && !tool.allowsEmpty)) {
            return;
        }

        busy = true;
        runButton.disabled = true;
        showError('');
        setProgress(0, 'Starting...');
        const requestsBefore = globalThis.performance?.getEntriesByType?.('resource').length ?? 0;

        try {
            const options = tool.readOptions ? tool.readOptions(root) : {};
            const output = await tool.process(
                items.map((item) => item.file),
                options,
                setProgress,
            );

            renderResults(output);
            showMeter(requestsBefore);
            showPanel('done');
        } catch (error) {
            if (error instanceof ToolError) {
                showError(error.message);
            } else {
                console.error(error);
                showError('Something went wrong while processing your file. Please try again with a different file.');
            }
        } finally {
            busy = false;
            runButton.disabled = false;
            progress.hidden = true;
        }
    }

    function reset() {
        if (busy) {
            return;
        }

        items = [];
        results.replaceChildren();
        showError('');
        render();
        input.value = '';
    }

    input.addEventListener('change', () => {
        addFiles(input.files);
        input.value = '';
    });
    addButton.addEventListener('click', () => input.click());

    // Optional second file input, used to take a photo straight from a phone camera.
    // Tools that can work without a file (paste HTML, enter an address) skip the picker.
    root.querySelectorAll('[data-skip]').forEach((button) => button.addEventListener('click', () => showPanel('work')));

    root.querySelectorAll('[data-capture]').forEach((button) => {
        const extra = root.querySelector('[data-extra-input]');

        button.addEventListener('click', () => extra.click());
        extra.addEventListener('change', () => {
            addFiles(extra.files);
            extra.value = '';
        });
    });
    runButton.addEventListener('click', run);
    root.querySelectorAll('[data-reset]').forEach((button) => button.addEventListener('click', reset));

    ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', (event) => {
        event.preventDefault();
        addFiles(event.dataTransfer.files);
    });
    drop.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            input.click();
        }
    });

    // Paste files or screenshots straight from the clipboard.
    document.addEventListener('paste', (event) => {
        const target = event.target;

        if (!root.isConnected || target.closest?.('input, textarea, [contenteditable="true"]') || busy || !panels.done.hidden) {
            return;
        }

        if (event.clipboardData?.files?.length) {
            event.preventDefault();
            addFiles(event.clipboardData.files);
        }
    });

    // Ctrl/Cmd + Enter runs the tool.
    document.addEventListener('keydown', (event) => {
        if (root.isConnected && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !panels.work.hidden) {
            event.preventDefault();
            run();
        }
    });

    rememberSettings(root);

    return { addFiles, getItems: () => items };
}

const REMEMBERED = 'select, input[type="radio"], input[type="checkbox"], input[type="number"], input[type="color"]';

/**
 * Remembers the choices made in a tool's options (not typed text, names or
 * passwords) on this device, so the next visit starts where you left off.
 */
function rememberSettings(root) {
    const key = `ilikepdfs:options:${root.dataset.tool}`;
    const fields = [...root.querySelectorAll(`[data-options] ${REMEMBERED.split(', ').join(', [data-options] ')}`)];
    const id = (field) => `${field.name}${field.type === 'radio' ? `=${field.value}` : ''}`;
    let saved = {};

    try {
        saved = JSON.parse(globalThis.localStorage?.getItem(key) ?? '{}');
    } catch {
        saved = {};
    }

    const apply = (field) => {
        const value = saved[id(field)];

        if (value === undefined || field.name === '' || /password|confirm|text|html|url|terms|typed/i.test(field.name)) {
            return;
        }

        if (field.type === 'radio' || field.type === 'checkbox') {
            field.checked = value === true;
        } else if (field.tagName === 'SELECT' ? [...field.options].some((option) => option.value === value) : true) {
            field.value = value;
        }

        field.dispatchEvent(new Event('change', { bubbles: true }));
    };

    fields.forEach((field) => {
        apply(field);
        field.addEventListener('change', () => {
            if (field.name === '' || /password|confirm|text|html|url|terms|typed/i.test(field.name)) {
                return;
            }

            fields.filter((other) => other.type === 'radio' && other.name === field.name).forEach((radio) => {
                saved[id(radio)] = radio.checked;
            });

            if (field.type !== 'radio') {
                saved[id(field)] = field.type === 'checkbox' ? field.checked : field.value;
            }

            try {
                globalThis.localStorage?.setItem(key, JSON.stringify(saved));
            } catch {
                // Storage can be blocked; the page works the same without it.
            }
        });
    });
}
