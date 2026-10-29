import { convertImages, readConvertOptions } from '../core/imageConvert.js';

export const kinds = ['tiff'];
export const thumbs = false;
export const readOptions = readConvertOptions;

export function process(files, options = {}, onProgress = () => {}) {
    return convertImages(files, { from: kinds, to: 'jpeg' }, options, onProgress);
}
