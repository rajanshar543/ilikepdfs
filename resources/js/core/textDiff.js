const MAX_WORDS = 4000;

/**
 * Word-level difference between two texts (longest common subsequence).
 * Returns runs of removed / added words in reading order.
 *
 * @returns {{type: 'removed'|'added', text: string}[]}
 */
export function diffWords(before, after) {
    const a = before.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
    const b = after.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);

    // Trim the shared start and end so the table only covers what changed.
    let start = 0;

    while (start < a.length && start < b.length && a[start] === b[start]) {
        start += 1;
    }

    let endA = a.length;
    let endB = b.length;

    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA -= 1;
        endB -= 1;
    }

    const left = a.slice(start, endA);
    const right = b.slice(start, endB);
    const rows = left.length + 1;
    const columns = right.length + 1;
    const table = new Uint16Array(rows * columns);

    for (let i = left.length - 1; i >= 0; i -= 1) {
        for (let j = right.length - 1; j >= 0; j -= 1) {
            table[i * columns + j] = left[i] === right[j]
                ? table[(i + 1) * columns + j + 1] + 1
                : Math.max(table[(i + 1) * columns + j], table[i * columns + j + 1]);
        }
    }

    const operations = [];
    let i = 0;
    let j = 0;

    while (i < left.length || j < right.length) {
        if (i < left.length && j < right.length && left[i] === right[j]) {
            operations.push({ type: 'same' });
            i += 1;
            j += 1;
        } else if (j >= right.length || (i < left.length && table[(i + 1) * columns + j] >= table[i * columns + j + 1])) {
            operations.push({ type: 'removed', word: left[i] });
            i += 1;
        } else {
            operations.push({ type: 'added', word: right[j] });
            j += 1;
        }
    }

    // Neighbouring words of the same kind form one run; unchanged words separate runs.
    let previousSame = true;
    const result = [];
    let current = null;

    for (const operation of operations) {
        if (operation.type === 'same') {
            previousSame = true;
            current = null;
            continue;
        }

        if (!current || current.type !== operation.type || previousSame) {
            current = { type: operation.type, words: [] };
            result.push(current);
        }

        current.words.push(operation.word);
        previousSame = false;
    }

    return result.map((run) => ({ type: run.type, text: run.words.join(' ') }));
}
