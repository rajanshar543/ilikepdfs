import PptxGenJS from 'pptxgenjs';
import { canvasToBlob } from '../core/canvas.js';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { closePdf, openPdf, renderPage } from '../core/pdfjs.js';

export const kinds = ['pdf'];

const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MAX_SLIDES = 200;
const MAX_INCHES = 56;

function base64Of(bytes) {
    let binary = '';

    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }

    return btoa(binary);
}

/**
 * Converts each PDF page to a slide. The page is placed as a picture, so it
 * looks exactly like the PDF; the text on the slide is not editable.
 *
 * @param {File[]} files exactly one PDF
 */
export async function process(files, _options = {}, onProgress = () => {}) {
    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to convert.');
    }

    const file = files[0];
    const document = await openPdf(file);

    try {
        if (document.numPages > MAX_SLIDES) {
            throw new ToolError(`Choose a PDF with at most ${MAX_SLIDES} pages.`);
        }

        const pptx = new PptxGenJS();
        pptx.title = baseName(file.name);

        for (let number = 1; number <= document.numPages; number += 1) {
            onProgress((number - 1) / document.numPages, `Page ${number} of ${document.numPages}`);

            const page = await document.getPage(number);
            const { canvas, width, height } = await renderPage(page, 2);
            const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.9)).arrayBuffer());
            const shrink = Math.min(1, MAX_INCHES / (Math.max(width, height) / 72));
            const inches = [(width / 72) * shrink, (height / 72) * shrink];

            if (number === 1) {
                pptx.defineLayout({ name: 'PDFPAGE', width: inches[0], height: inches[1] });
                pptx.layout = 'PDFPAGE';
            }

            // Pages of another size are fitted inside the slide size set by the first page.
            const slide = pptx.addSlide();
            const [slideWidth, slideHeight] = pptx.presLayout ? [pptx.presLayout.width / 914400, pptx.presLayout.height / 914400] : [inches[0], inches[1]];
            const scale = Math.min(slideWidth / inches[0], slideHeight / inches[1]);
            const w = inches[0] * scale;
            const h = inches[1] * scale;
            slide.addImage({ data: `image/jpeg;base64,${base64Of(jpeg)}`, x: (slideWidth - w) / 2, y: (slideHeight - h) / 2, w, h });
            page.cleanup();
        }

        onProgress(0.97, 'Building the PowerPoint file');
        const bytes = await pptx.write({ outputType: 'uint8array' });

        return [{
            name: `${baseName(file.name)}.pptx`,
            blob: new Blob([bytes], { type: PPTX_TYPE }),
            note: `${document.numPages} slide${document.numPages === 1 ? '' : 's'}. Each page is a picture, so the text is not editable.`,
        }];
    } finally {
        await closePdf(document);
    }
}
