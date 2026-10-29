import { imagesToPdf, readImagePdfOptions } from '../core/imagesToPdf.js';

export const kinds = ['jpeg'];
export const thumbs = true;
export const readOptions = readImagePdfOptions;

export function process(files, options = {}, onProgress = () => {}) {
    return imagesToPdf(files, 'jpeg', options, onProgress);
}
