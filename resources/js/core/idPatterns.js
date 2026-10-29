/**
 * Patterns for personal numbers that people often need to hide before sharing
 * a document: Aadhaar, PAN, mobile and card numbers. Each pattern says which
 * part to cover (the rest stays visible, as is usual when masking).
 */
export const ID_KINDS = {
    aadhaar: {
        label: 'Aadhaar number',
        // 12 digits starting with 2-9, optionally in groups of four.
        pattern: /(?<![\d])[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?![\d])/g,
        hide: 8,
    },
    pan: {
        label: 'PAN',
        pattern: /(?<![A-Za-z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Za-z0-9])/g,
        hide: 6,
    },
    mobile: {
        label: 'Mobile number',
        pattern: /(?<![\d])(?:\+?91[\s-]?)?[6-9]\d{9}(?![\d])/g,
        hide: 6,
    },
    card: {
        label: 'Card number',
        pattern: /(?<![\d])(?:\d{4}[\s-]?){3}\d{4}(?![\d])/g,
        hide: 12,
    },
};

/** Index just after the (count)th digit or letter counted from `start`, skipping spaces and dashes. */
function endOfSignificant(text, start, count) {
    let seen = 0;

    for (let index = start; index < text.length; index += 1) {
        if (/[A-Za-z0-9]/.test(text[index])) {
            seen += 1;

            if (seen === count) {
                return index + 1;
            }
        }
    }

    return text.length;
}

/**
 * Finds numbers in text and returns the character ranges to cover.
 *
 * @param {string} text
 * @param {string[]} kinds keys of ID_KINDS
 * @returns {{start: number, end: number, kind: string}[]} ranges (end exclusive), sorted, without overlaps
 */
export function maskRanges(text, kinds) {
    const ranges = [];

    for (const kind of kinds) {
        const definition = ID_KINDS[kind];

        if (!definition) {
            continue;
        }

        for (const match of text.matchAll(definition.pattern)) {
            let from = match.index;
            let value = match[0];

            // A country code in front of a mobile number is not part of the hidden digits.
            if (kind === 'mobile') {
                const code = /^\+?91[\s-]?/.exec(value);

                if (code && value.replace(/\D/g, '').length > 10) {
                    from += code[0].length;
                    value = value.slice(code[0].length);
                }
            }

            const end = endOfSignificant(text, from, definition.hide);

            if (end > from) {
                ranges.push({ start: from, end: Math.min(end, from + value.length), kind });
            }
        }
    }

    ranges.sort((a, b) => a.start - b.start);

    // Drop a range that overlaps an earlier one (for example a card number that also looks like an Aadhaar).
    const kept = [];

    for (const range of ranges) {
        if (kept.length === 0 || range.start >= kept[kept.length - 1].end) {
            kept.push(range);
        }
    }

    return kept;
}
