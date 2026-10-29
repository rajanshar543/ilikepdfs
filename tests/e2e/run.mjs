/**
 * End-to-end check in a real Chrome: opens every tool page, uploads a real file,
 * runs the tool and verifies the download. Also fails on console errors, CSP
 * violations and any request that leaves this site.
 *
 *   php artisan serve --port=8123   (in another terminal, after `npm run build`)
 *   node tests/e2e/run.mjs [slug ...]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import PptxGenJS from 'pptxgenjs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { chromium } from 'playwright-core';
import { buildDocx } from '../../resources/js/core/docxWriter.js';
import { buildXlsx } from '../../resources/js/core/xlsxWriter.js';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixtures = path.join(os.tmpdir(), `ilikepdfs-e2e-${process.pid}`);
fs.mkdirSync(fixtures, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const sample = (name) => path.join(here, '..', 'js', 'fixtures', name);

const write = (name, data) => {
    const file = path.join(fixtures, name);
    fs.writeFileSync(file, data);

    return file;
};

async function pdf(name, pages = 3) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    for (let index = 1; index <= pages; index += 1) {
        doc.addPage([300, 400]).drawText(`Page ${index}`, { x: 40, y: 320, size: 28, font });
    }

    return write(name, await doc.save());
}

function picture(width, height, type, name) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#3366cc';
    context.fillRect(0, 0, width, height);

    for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
            context.fillStyle = `rgb(${(x * 7 + y) % 256},${(y * 5 + x) % 256},${(x * y) % 256})`;
            context.fillRect(x, y, 4, 4);
        }
    }

    return write(name, type === 'image/png' ? canvas.toBuffer('image/png') : canvas.toBuffer(type, 92));
}

function textPicture(name) {
    const canvas = createCanvas(900, 160);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 900, 160);
    context.fillStyle = '#000';
    context.font = 'bold 64px sans-serif';
    context.fillText('Hello World 2024', 30, 100);

    return write(name, canvas.toBuffer('image/png'));
}


const require = createRequire(import.meta.url);

/** Encrypts a PDF with qpdf (WebAssembly) so the unlock tool has a real locked file. */
async function lockedPdf(name, password) {
    const create = require('@neslinesli93/qpdf-wasm');
    const qpdf = await create({ locateFile: () => require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'), noInitialRun: true, print: () => {}, printErr: () => {} });
    qpdf.FS.writeFile('/in.pdf', fs.readFileSync(await pdf('lock-src.pdf', 2)));
    qpdf.callMain(['--encrypt', password, 'owner-secret', '256', '--', '/in.pdf', '/out.pdf']);

    return write(name, qpdf.FS.readFile('/out.pdf'));
}

/** A one-page "scan": the page is only a picture of text, so OCR has work to do. */
async function scannedPdf(name) {
    const doc = await PDFDocument.create();
    const canvas = createCanvas(1200, 400);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 1200, 400);
    context.fillStyle = '#000';
    context.font = 'bold 90px sans-serif';
    context.fillText('Hello World', 60, 220);
    const image = await doc.embedPng(canvas.toBuffer('image/png'));
    doc.addPage([600, 200]).drawImage(image, { x: 0, y: 0, width: 600, height: 200 });

    return write(name, await doc.save());
}

async function textPdf(name, lines) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([500, 700]);
    lines.forEach(([text, size, y]) => page.drawText(text, { x: 50, y, size, font }));

    return write(name, await doc.save());
}

async function photoPdf(name) {
    const doc = await PDFDocument.create();
    const image = await doc.embedJpg(fs.readFileSync(picture(1600, 1200, 'image/jpeg', `${name}.jpg`)));
    doc.addPage([400, 300]).drawImage(image, { x: 0, y: 0, width: 400, height: 300 });

    return write(name, await doc.save());
}

async function formPdf(name) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    doc.getForm().createTextField('Full name').addToPage(page, { x: 20, y: 340, width: 200, height: 22 });

    return write(name, await doc.save());
}

async function deck(name) {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.addSlide().addText('Welcome to the talk', { x: 1, y: 1, w: 8, h: 1, fontSize: 32 });

    return write(name, await pptx.write({ outputType: 'uint8array' }));
}

/** Drags on the first visible page layer; fractions are of the page box. */
async function layerBox(page, index = 0) {
    const layer = (await page.$$('.pv-layer'))[index];
    await layer.scrollIntoViewIfNeeded();

    return layer.boundingBox();
}

async function dragOnPage(page, [fromX, fromY], [toX, toY], index = 0) {
    const box = await layerBox(page, index);
    await page.mouse.move(box.x + box.width * fromX, box.y + box.height * fromY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * ((fromX + toX) / 2), box.y + box.height * ((fromY + toY) / 2), { steps: 4 });
    await page.mouse.move(box.x + box.width * toX, box.y + box.height * toY, { steps: 4 });
    await page.mouse.up();
}

const downloaded = async (page) => Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(document.querySelector('.result a').href)).arrayBuffer()))));

/** Text of a PDF, read with pdf.js, so compressed content streams are checked too. */
async function pdfText(bytes) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
    let text = '';

    for (let number = 1; number <= doc.numPages; number += 1) {
        text += (await (await doc.getPage(number)).getTextContent()).items.map((item) => item.str).join(' ');
    }

    return text;
}

const waitForViewer = (page) => page.waitForSelector('.pv-canvas', { timeout: 30000 });
const PK = [0x50, 0x4b];

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const WEBP = [0x52, 0x49, 0x46, 0x46];
const ZIP = [0x50, 0x4b];

const cases = {
    'merge-pdf': async () => ({ files: [await pdf('a.pdf', 2), await pdf('b.pdf', 3)], magic: PDF_MAGIC, name: 'merged.pdf' }),
    'split-pdf': async () => ({ files: [await pdf('s.pdf', 3)], count: 3, magic: PDF_MAGIC, name: 's-page-1.pdf' }),
    'split-pdf:extract': async () => ({ files: [await pdf('e.pdf', 4)], magic: PDF_MAGIC, name: 'e-extracted.pdf', set: { mode: 'extract' }, fill: { ranges: '2-3' } }),
    'compress-pdf': async () => ({ files: [await pdf('c.pdf', 2)], magic: PDF_MAGIC, name: /^c(-compressed)?\.pdf$/, set: { level: 'extreme' } }),
    'jpg-to-pdf': async () => ({ files: [picture(300, 200, 'image/jpeg', 'p.jpg')], magic: PDF_MAGIC, name: 'images.pdf' }),
    'png-to-pdf': async () => ({ files: [picture(300, 200, 'image/png', 'p.png')], magic: PDF_MAGIC, name: 'images.pdf' }),
    'tiff-to-jpg': async () => ({ files: [sample('sample.tiff')], magic: JPEG, name: 'sample.jpg' }),
    'pdf-to-jpg': async () => ({ files: [await pdf('j.pdf', 2)], count: 2, magic: JPEG, name: 'j-page-1.jpg', set: { dpi: '72' } }),
    'pdf-to-png': async () => ({ files: [await pdf('n.pdf', 2)], count: 2, magic: PNG, name: 'n-page-1.png', set: { dpi: '72' } }),
    'png-to-jpg': async () => ({ files: [picture(200, 100, 'image/png', 'q.png')], magic: JPEG, name: 'q.jpg' }),
    'jpg-to-png': async () => ({ files: [picture(200, 100, 'image/jpeg', 'r.jpg')], magic: PNG, name: 'r.png' }),
    'webp-to-jpg': async () => {
        const canvas = createCanvas(120, 80);
        canvas.getContext('2d').fillRect(10, 10, 50, 50);

        return { files: [write('w.webp', canvas.toBuffer('image/webp', 90))], magic: JPEG, name: 'w.jpg' };
    },
    'heic-to-jpg': async () => ({ files: [sample('sample.heic')], magic: JPEG, name: 'sample.jpg' }),
    'convert-to-webp': async () => ({ files: [picture(200, 100, 'image/png', 'x.png')], magic: WEBP, name: 'x.webp' }),
    'svg-to-png': async () => ({
        files: [write('l.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#09f"/></svg>')],
        magic: PNG,
        name: 'l.png',
        set: { scale: '2' },
    }),
    'image-to-text': async () => ({ files: [textPicture('t.png')], text: /Hello\s+World/i, name: 't.txt' }),
    'compress-image': async () => ({ files: [picture(800, 600, 'image/jpeg', 'big.jpg')], magic: JPEG, name: 'big-compressed.jpg', set: { level: 'small' } }),
    'resize-image': async () => ({ files: [picture(200, 100, 'image/png', 'z.png')], magic: PNG, name: 'z-100x50.png' }),
    'rotate-pdf': async () => ({ files: [await pdf('o.pdf', 2)], magic: PDF_MAGIC, name: 'o-rotated.pdf' }),
    'watermark-pdf': async () => ({ files: [await pdf('m.pdf', 2)], magic: PDF_MAGIC, name: 'm-watermarked.pdf' }),

    'unlock-pdf': async () => ({ files: [await lockedPdf('locked.pdf', 'secret1')], magic: PDF_MAGIC, name: 'locked-unlocked.pdf', fill: { password: 'secret1' } }),
    'page-numbers': async () => ({ files: [await pdf('n.pdf', 3)], magic: PDF_MAGIC, name: 'n-numbered.pdf' }),
    'repair-pdf': async () => {
        const doc = await PDFDocument.create();
        doc.addPage([300, 300]);
        const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
        const text = bytes.toString('latin1');

        return { files: [write('broken.pdf', bytes.subarray(0, text.lastIndexOf('xref')))], magic: PDF_MAGIC, name: 'broken-repaired.pdf' };
    },
    'pdf-to-markdown': async () => ({ files: [await textPdf('md.pdf', [['Annual Report', 30, 640], ['Some body text goes here.', 11, 600]])], text: /# Annual Report/, name: 'md.md' }),
    'pdf-summarizer': async () => ({
        files: [write('article.txt', 'Solar energy is becoming cheap. Solar panels cost far less than before. Many homes now use solar energy every day. Batteries make solar energy work at night. Engineers expect solar energy to grow quickly.')],
        text: /Summary/,
        name: 'article-summary.txt',
    }),
    'pdf-to-word': async () => ({ files: [await textPdf('w.pdf', [['Quarterly Report', 28, 640], ['Revenue grew this quarter.', 11, 600]])], magic: PK, name: 'w.docx' }),
    'pdf-to-powerpoint': async () => ({ files: [await pdf('p.pdf', 2)], magic: PK, name: 'p.pptx' }),
    'pdf-to-excel': async () => ({ files: [await textPdf('x.pdf', [['Item', 12, 600], ['Apples', 12, 580]])], magic: PK, name: 'x.xlsx' }),
    'excel-to-pdf': async () => ({ files: [write('book.xlsx', buildXlsx([{ name: 'Sales', rows: [['Item', 'Qty'], ['Apples', 12]] }]))], magic: PDF_MAGIC, name: 'book.pdf' }),
    'word-to-pdf': async () => ({ files: [write('letter.docx', buildDocx([{ type: 'heading', level: 1, text: 'Project plan' }, { type: 'paragraph', text: 'Hello from Word.' }]))], magic: PDF_MAGIC, name: 'letter.pdf' }),
    'powerpoint-to-pdf': async () => ({ files: [await deck('talk.pptx')], magic: PDF_MAGIC, name: 'talk.pdf' }),
    'ocr-pdf': async () => ({ files: [await scannedPdf('scan.pdf')], magic: PDF_MAGIC, name: 'scan-ocr.pdf', note: /1 page made searchable/ }),
    'scan-to-pdf': async () => ({ files: [picture(400, 300, 'image/jpeg', 'photo.jpg')], magic: PDF_MAGIC, name: 'scan.pdf', set: { mode: 'bw' } }),
    'compare-pdf': async () => ({
        files: [await textPdf('old.pdf', [['Total 100 dollars', 14, 600]]), await textPdf('new.pdf', [['Total 250 dollars', 14, 600]])],
        count: 2,
        magic: PDF_MAGIC,
        name: 'comparison.pdf',
        noZip: true,
    }),
    'organize-pdf': async () => ({
        files: [await pdf('a.pdf', 2), await pdf('b.pdf', 1)],
        magic: PDF_MAGIC,
        name: 'organized.pdf',
        before: async (page) => {
            await page.waitForSelector('.org-card', { timeout: 30000 });
            const cards = await page.$$('.org-card');

            if (cards.length !== 3) {
                throw new Error(`expected 3 page cards, got ${cards.length}`);
            }

            await page.click('.org-card:first-child [aria-label="Rotate"]');
            await page.click('.org-card:nth-child(3) [aria-label="Remove this page"]');
            await page.click('.org-card:first-child [aria-label="Move later"]');
        },
        after: async (page) => {
            const pdf = await PDFDocument.load(await downloaded(page));
            const rotations = pdf.getPages().map((entry) => entry.getRotation().angle);

            if (pdf.getPageCount() !== 2 || !rotations.includes(90)) {
                throw new Error(`organized PDF has ${pdf.getPageCount()} pages, rotations ${rotations}`);
            }
        },
    }),
    'edit-pdf': async () => ({
        files: [await pdf('edit.pdf', 1)],
        magic: PDF_MAGIC,
        name: 'edit-edited.pdf',
        before: async (page) => {
            await waitForViewer(page);
            await page.click('[data-tool-button="rect"]');
            await dragOnPage(page, [0.2, 0.3], [0.6, 0.4]);
            await page.click('[data-tool-button="text"]');
            const box = await layerBox(page);
            await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.2);
            await page.keyboard.type('Approved');
            await page.click('[data-tool-button="ink"]');
            await dragOnPage(page, [0.1, 0.45], [0.5, 0.5]);

            const count = await page.$$eval('.pv-annotation', (nodes) => nodes.length);

            if (count !== 3) {
                throw new Error(`expected 3 annotations, got ${count}`);
            }
        },
        note: /3 additions/,
    }),
    'sign-pdf': async () => ({
        files: [await pdf('sign.pdf', 1)],
        magic: PDF_MAGIC,
        name: 'sign-signed.pdf',
        before: async (page) => {
            await waitForViewer(page);
            await page.fill('[name="typed"]', 'Asha Verma');
            await page.click('[data-sig-use-type]');
            await page.waitForFunction(() => document.querySelector('[data-sign-status]').textContent.includes('click on the page'));
            const box = await layerBox(page);
            await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);
            await page.waitForSelector('.pv-item--signature');
        },
    }),
    'crop-pdf': async () => ({
        files: [await pdf('crop.pdf', 1)],
        magic: PDF_MAGIC,
        name: 'crop-cropped.pdf',
        before: async (page) => {
            await waitForViewer(page);
            await dragOnPage(page, [0.1, 0.1], [0.7, 0.5]);
            await page.waitForSelector('.pv-item--crop');
        },
        after: async (page) => {
            const pdf = await PDFDocument.load(await downloaded(page));
            const { width, height } = pdf.getPage(0).getSize();

            if (!(width < 300 && height < 700)) {
                throw new Error(`page was not cropped: ${width}x${height}`);
            }
        },
    }),
    'redact-pdf': async () => ({
        files: [await textPdf('secret.pdf', [['Account 12345678 is secret', 14, 600], ['Public line', 14, 500]])],
        magic: PDF_MAGIC,
        name: 'secret-redacted.pdf',
        before: async (page) => {
            await waitForViewer(page);
            await page.fill('[name="terms"]', '12345678');
            await dragOnPage(page, [0.05, 0.1], [0.95, 0.2]);
            await page.waitForSelector('.pv-item--redact');
        },
        after: async (page) => {
            const bytes = await downloaded(page);
            const text = await pdfText(bytes);

            if (text.includes('12345678') || text.includes('Account') || bytes.toString('latin1').includes('12345678')) {
                throw new Error(`redacted text is still in the file: ${text}`);
            }
        },
    }),
    'pdf-forms': async () => ({
        files: [await formPdf('form.pdf')],
        magic: PDF_MAGIC,
        name: 'form-form.pdf',
        before: async (page) => {
            await waitForViewer(page);
            await page.fill('[data-fields] input[type="text"], [data-fields] input:not([type])', 'Asha Verma');
        },
    }),
    'html-to-pdf': async () => ({
        files: [],
        magic: PDF_MAGIC,
        name: 'page.pdf',
        before: async (page) => {
            await page.click('[data-skip]');
            await page.fill('[name="html"]', '<h1>Hello</h1><p>From the browser test.</p>');
        },
    }),
    'html-to-pdf:private': async () => ({
        files: [],
        expectError: /not allowed/,
        before: async (page) => {
            await page.click('[data-skip]');
            await page.fill('[name="url"]', 'http://169.254.169.254/latest/meta-data/');
        },
    }),

    'compress-pdf-to-size': async () => ({
        files: [await photoPdf('form.pdf')],
        magic: PDF_MAGIC,
        name: 'form-under-100KB.pdf',
        set: { preset: '100' },
        after: async (page) => {
            const size = (await downloaded(page)).length;

            if (size > 100 * 1024) {
                throw new Error(`result is ${size} bytes, over 100 KB`);
            }
        },
    }),
    'compress-image-to-size': async () => ({
        files: [picture(1000, 800, 'image/jpeg', 'big.jpg')],
        magic: JPEG,
        name: 'big-50kb.jpg',
        set: { preset: '50' },
        after: async (page) => {
            if ((await downloaded(page)).length > 50 * 1024) {
                throw new Error('image is over 50 KB');
            }

            if (!(await page.$('.result__thumb'))) {
                throw new Error('no preview of the result');
            }
        },
    }),
    'photo-signature-resize': async () => ({
        files: [picture(900, 700, 'image/jpeg', 'me.jpg')],
        magic: JPEG,
        name: 'me-413x531.jpg',
        fill: { maxKb: '40' },
        after: async (page) => {
            if ((await downloaded(page)).length > 40 * 1024) {
                throw new Error('photo is over 40 KB');
            }
        },
    }),
    'mask-id': async () => ({
        files: [await textPdf('card.pdf', [['Aadhaar 2345 6789 0123', 16, 600]])],
        magic: PDF_MAGIC,
        name: 'card-masked.pdf',
        after: async (page) => {
            const text = await pdfText(await downloaded(page));

            if (text.includes('2345') || text.includes('6789')) {
                throw new Error(`digits are still readable: ${text}`);
            }
        },
    }),
    'pdf-workflow': async () => ({
        files: [await pdf('w1.pdf', 2), await pdf('w2.pdf', 1)],
        magic: PDF_MAGIC,
        name: 'w1-processed.pdf',
        before: async (page) => {
            await page.click('[data-preset="pack"]');
            await page.waitForSelector('.step');
        },
        after: async (page) => {
            const pdfDoc = await PDFDocument.load(await downloaded(page));

            if (pdfDoc.getPageCount() !== 3) {
                throw new Error(`expected 3 pages, got ${pdfDoc.getPageCount()}`);
            }
        },
    }),
    'hi:merge-pdf': async () => ({
        files: [await pdf('h1.pdf', 1), await pdf('h2.pdf', 1)],
        path: 'hi/merge-pdf',
        magic: PDF_MAGIC,
        name: 'merged.pdf',
        before: async (page) => {
            if (!/[ऀ-ॿ]/.test(await page.textContent('.ws-side__head'))) {
                throw new Error('the Hindi page is not in Hindi');
            }
        },
    }),
    'protect-pdf': async () => ({
        files: [await pdf('k.pdf', 1)],
        magic: PDF_MAGIC,
        name: 'k-protected.pdf',
        fill: { password: 'secret1', confirm: 'secret1' },
        encrypted: true,
    }),
};

/** Saves the site for offline use, turns the network off, and checks that a tool still works. */
async function offlineFlow(browser) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    const problems = [];

    try {
        await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-offline-box]:not([hidden])', { timeout: 15000 });
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null || true);
        await page.click('[data-offline]');
        await page.waitForFunction(() => document.querySelector('[data-offline-status]').textContent.includes('Saved. Works without internet.'), null, { timeout: 180000 });

        const files = [await pdf('off-a.pdf', 1), await pdf('off-b.pdf', 2)];
        await context.setOffline(true);
        await page.goto(`${BASE}/merge-pdf`, { waitUntil: 'domcontentloaded' });
        await page.setInputFiles('[data-input]', files);
        await page.waitForSelector('[data-panel="work"]:not([hidden])', { timeout: 20000 });
        await page.click('[data-run]');
        await page.waitForSelector('[data-panel="done"]:not([hidden])', { timeout: 60000 });

        if (!(await page.textContent('[data-meter]')).includes('0 files were sent')) {
            problems.push('privacy meter missing offline');
        }

        // A page that was never opened is still there, because everything was saved in one go.
        await page.goto(`${BASE}/jpg-to-png`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-drop]', { timeout: 15000 });

        // The one tool that needs the server says so instead of failing silently.
        await page.goto(`${BASE}/html-to-pdf`, { waitUntil: 'domcontentloaded' });
        await page.click('[data-skip]');
        await page.fill('[name="html"]', '<p>x</p>');
        await page.click('[data-run]');
        await page.waitForSelector('[data-error]:not([hidden])', { timeout: 20000 });

        if (!(await page.textContent('[data-error]')).includes('could not be reached')) {
            problems.push('offline html-to-pdf did not explain itself');
        }
    } catch (error) {
        problems.push(error.message);
    }

    await context.close();

    return problems;
}

const only = process.argv.slice(2);
const slugs = only.length > 0 ? only : [...Object.keys(cases), 'offline'];
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const failures = [];
let passed = 0;

for (const slug of slugs) {
    const started = Date.now();
    const problems = [];

    if (slug === 'offline') {
        const found = await offlineFlow(browser);

        if (found.length > 0) {
            failures.push([slug, found]);
            console.log(`FAIL ${slug}\n  - ${found.join('\n  - ')}`);
        } else {
            passed += 1;
            console.log(`ok   ${slug} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
        }

        continue;
    }

    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    const origin = new URL(BASE).origin;

    page.on('console', (message) => {
        // A 422 is the expected answer to a blocked address; the page shows the message.
        // qpdf prints its diagnostics about a damaged file (the repair tool's input) to the console.
        if (message.type() === 'error' && !message.text().includes('status of 422') && !message.text().startsWith('this.program')) {
            problems.push(`console: ${message.text()}`);
        }
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('requestfailed', (request) => problems.push(`request failed: ${request.url()}`));
    page.on('request', (request) => {
        const url = request.url();

        if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:')) {
            problems.push(`LEAVES SITE: ${url}`);
        }
    });
    await page.addInitScript(() => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (event) => window.__csp.push(`${event.violatedDirective} ${event.blockedURI}`));
    });

    try {
        const spec = await cases[slug]();
        await page.goto(`${BASE}/${spec.path ?? slug.split(':')[0]}`, { waitUntil: 'networkidle' });

        if (spec.files.length > 0) {
            await page.setInputFiles('[data-input]', spec.files);
            await page.waitForSelector('[data-panel="work"]:not([hidden])', { timeout: 15000 });
        }

        await spec.before?.(page);

        for (const [name, value] of Object.entries(spec.set ?? {})) {
            const radio = await page.$(`input[type="radio"][name="${name}"]`);

            if (radio) {
                await page.check(`input[type="radio"][name="${name}"][value="${value}"]`);
            } else {
                await page.selectOption(`[name="${name}"]`, value);
            }
        }

        for (const [name, value] of Object.entries(spec.fill ?? {})) {
            await page.fill(`[name="${name}"]`, value);
        }

        if (slug.startsWith('split-pdf') && !spec.set) {
            // default mode: every page
        }

        if (slug === 'watermark-pdf') {
            await page.fill('[name="text"]', 'CONFIDENTIAL');
        }

        await page.click('[data-run]');

        if (spec.expectError) {
            await page.waitForSelector('[data-error]:not([hidden])', { timeout: 30000 });
            const message = await page.textContent('[data-error]');

            if (!spec.expectError.test(message)) {
                throw new Error(`unexpected error message: ${message}`);
            }

            await context.close();
            console.log(`ok   ${slug} (blocked: ${message})`);
            passed += 1;
            continue;
        }

        await Promise.race([
            page.waitForSelector('[data-panel="done"]:not([hidden])', { timeout: 120000 }),
            page.waitForSelector('[data-error]:not([hidden])', { timeout: 120000 }).then(async () => {
                throw new Error(`tool error: ${await page.textContent('[data-error]')}`);
            }),
        ]);

        const results = await page.$$eval('.result', (rows) => rows.map((row) => ({
            name: row.querySelector('.result__name').textContent,
            href: row.querySelector('a')?.getAttribute('href'),
            download: row.querySelector('a')?.getAttribute('download'),
            text: row.querySelector('textarea')?.value ?? null,
        })));

        if (results.length === 0) {
            throw new Error('no results shown');
        }

        if (spec.note && !spec.note.test(await page.textContent('.result__meta'))) {
            throw new Error(`unexpected note: ${await page.textContent('.result__meta')}`);
        }

        if (spec.count && results.length !== spec.count) {
            throw new Error(`expected ${spec.count} results, got ${results.length}`);
        }

        const first = results[0];
        const nameOk = spec.name instanceof RegExp ? spec.name.test(first.name) : first.name === spec.name;

        if (!nameOk) {
            throw new Error(`unexpected file name ${first.name}`);
        }

        if (spec.text) {
            if (!spec.text.test(first.text ?? '')) {
                throw new Error(`text not recognised: ${JSON.stringify(first.text)}`);
            }
        } else {
            const head = await page.evaluate(async (href) => {
                const buffer = await (await fetch(href)).arrayBuffer();

                return { size: buffer.byteLength, bytes: Array.from(new Uint8Array(buffer).slice(0, 4)) };
            }, first.href);

            if (head.size === 0 || !spec.magic.every((byte, index) => head.bytes[index] === byte)) {
                throw new Error(`bad download: ${JSON.stringify(head)}`);
            }
        }

        if (spec.count && spec.count > 1 && !spec.noZip) {
            const zipText = await page.textContent('[data-results]');

            if (!zipText.includes('Download all as ZIP')) {
                throw new Error('ZIP button missing');
            }

            const [download] = await Promise.all([
                page.waitForEvent('download'),
                page.click('text=Download all as ZIP'),
            ]);
            const target = path.join(fixtures, 'out.zip');
            await download.saveAs(target);
            const zipBytes = fs.readFileSync(target);

            if (!ZIP.every((byte, index) => zipBytes[index] === byte)) {
                throw new Error('ZIP download is not a zip');
            }
        }

        await spec.after?.(page);

        const csp = await page.evaluate(() => window.__csp);
        csp.forEach((entry) => problems.push(`CSP violation: ${entry}`));
    } catch (error) {
        problems.push(error.message);
    }

    await context.close();

    if (problems.length > 0) {
        failures.push([slug, problems]);
        console.log(`FAIL ${slug} (${((Date.now() - started) / 1000).toFixed(1)}s)\n  - ${problems.join('\n  - ')}`);
    } else {
        passed += 1;
        console.log(`ok   ${slug} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    }
}

await browser.close();
fs.rmSync(fixtures, { recursive: true, force: true });
console.log(`\n${passed}/${slugs.length} tools passed in a real browser`);
process.exit(failures.length > 0 ? 1 : 0);
