/**
 * Image clean-up for photographed documents, working on RGBA pixels in place.
 * Each filter returns nothing and changes `data` (a Uint8ClampedArray).
 */

/** Stretches the brightness range so that paper turns white and ink turns dark. */
export function autoLevels(data, lowPercent = 0.02, highPercent = 0.98) {
    const histogram = new Uint32Array(256);

    for (let index = 0; index < data.length; index += 4) {
        histogram[Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2])] += 1;
    }

    const total = data.length / 4;
    const find = (target) => {
        let sum = 0;

        for (let value = 0; value < 256; value += 1) {
            sum += histogram[value];

            if (sum >= total * target) {
                return value;
            }
        }

        return 255;
    };

    const low = find(lowPercent);
    const high = Math.max(find(highPercent), low + 1);
    const scale = 255 / (high - low);

    for (let index = 0; index < data.length; index += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
            data[index + channel] = (data[index + channel] - low) * scale;
        }
    }
}

export function toGray(data) {
    for (let index = 0; index < data.length; index += 4) {
        const gray = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
        data[index] = data[index + 1] = data[index + 2] = gray;
    }
}

/**
 * Black and white with a threshold that follows the local brightness, so a
 * shadow across the page does not turn the paper black. Uses an integral image.
 */
export function adaptiveBlackWhite(data, width, height, sensitivity = 0.9) {
    const gray = new Float32Array(width * height);

    for (let index = 0; index < gray.length; index += 1) {
        gray[index] = 0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2];
    }

    const stride = width + 1;
    const integral = new Float64Array(stride * (height + 1));

    for (let y = 0; y < height; y += 1) {
        let row = 0;

        for (let x = 0; x < width; x += 1) {
            row += gray[y * width + x];
            integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
        }
    }

    const radius = Math.max(8, Math.round(Math.min(width, height) / 24));

    for (let y = 0; y < height; y += 1) {
        const top = Math.max(0, y - radius);
        const bottom = Math.min(height, y + radius + 1);

        for (let x = 0; x < width; x += 1) {
            const left = Math.max(0, x - radius);
            const right = Math.min(width, x + radius + 1);
            const sum = integral[bottom * stride + right] - integral[top * stride + right] - integral[bottom * stride + left] + integral[top * stride + left];
            const mean = sum / ((right - left) * (bottom - top));
            const value = gray[y * width + x] < mean * sensitivity ? 0 : 255;
            const at = (y * width + x) * 4;
            data[at] = data[at + 1] = data[at + 2] = value;
        }
    }
}
