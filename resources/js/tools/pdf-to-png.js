import { pdfToImages, readPdfImageOptions } from '../core/pdfToImages.js';

export const kinds = ['pdf'];
export const readOptions = readPdfImageOptions;

export function process(files, options = {}, onProgress = () => {}) {
    return pdfToImages(files, 'png', options, onProgress);
}
