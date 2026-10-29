const CELL = 12;

/**
 * Finds the areas where two same-sized RGBA images differ.
 *
 * @param {Uint8ClampedArray} a
 * @param {Uint8ClampedArray} b
 * @returns {{x: number, y: number, w: number, h: number}[]} boxes in pixels
 */
export function diffBoxes(a, b, width, height) {
    const columns = Math.ceil(width / CELL);
    const rows = Math.ceil(height / CELL);
    const marked = new Uint8Array(columns * rows);

    for (let cellY = 0; cellY < rows; cellY += 1) {
        for (let cellX = 0; cellX < columns; cellX += 1) {
            let different = 0;
            let total = 0;

            for (let y = cellY * CELL; y < Math.min(height, (cellY + 1) * CELL); y += 1) {
                for (let x = cellX * CELL; x < Math.min(width, (cellX + 1) * CELL); x += 1) {
                    const at = (y * width + x) * 4;
                    const difference = Math.abs(a[at] - b[at]) + Math.abs(a[at + 1] - b[at + 1]) + Math.abs(a[at + 2] - b[at + 2]);
                    total += 1;

                    if (difference > 150) {
                        different += 1;
                    }
                }
            }

            if (different / total > 0.03) {
                marked[cellY * columns + cellX] = 1;
            }
        }
    }

    // Join marked cells that touch (including diagonally) into one box each.
    const seen = new Uint8Array(marked.length);
    const boxes = [];

    for (let start = 0; start < marked.length; start += 1) {
        if (!marked[start] || seen[start]) {
            continue;
        }

        const stack = [start];
        seen[start] = 1;
        let minX = columns;
        let minY = rows;
        let maxX = 0;
        let maxY = 0;

        while (stack.length > 0) {
            const cell = stack.pop();
            const x = cell % columns;
            const y = Math.floor(cell / columns);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);

            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    const nx = x + dx;
                    const ny = y + dy;

                    if (nx >= 0 && ny >= 0 && nx < columns && ny < rows && marked[ny * columns + nx] && !seen[ny * columns + nx]) {
                        seen[ny * columns + nx] = 1;
                        stack.push(ny * columns + nx);
                    }
                }
            }
        }

        boxes.push({ x: minX * CELL, y: minY * CELL, w: (maxX - minX + 1) * CELL, h: (maxY - minY + 1) * CELL });
    }

    return boxes;
}
