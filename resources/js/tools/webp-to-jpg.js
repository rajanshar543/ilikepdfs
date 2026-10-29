import { convertImages, readConvertOptions } from '../core/imageConvert.js';

export const kinds = ['webp'];
export const thumbs = true;
export const readOptions = readConvertOptions;

export function process(files, options = {}, onProgress = () => {}) {
    return convertImages(files, { from: kinds, to: 'jpeg' }, options, onProgress);
}
