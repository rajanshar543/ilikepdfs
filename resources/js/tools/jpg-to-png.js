import { convertImages } from '../core/imageConvert.js';

export const kinds = ['jpeg'];
export const thumbs = true;

export function process(files, options = {}, onProgress = () => {}) {
    return convertImages(files, { from: kinds, to: 'png' }, options, onProgress);
}
