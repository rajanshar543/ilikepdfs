const STOPWORDS = new Set((
    'a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves '
    + 'however therefore thus also may might must shall one two three per via etc using used use like new said says say'
).split(' '));

/**
 * Splits text into sentences. Handles the Devanagari danda, keeps common
 * abbreviations and decimals together, and drops fragments that are too short.
 */
export function splitSentences(text) {
    const cleaned = text.replace(/\r/g, '').replace(/-\n(?=[a-z])/g, '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const masked = cleaned
        .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|No|Fig|Inc|Ltd|Co)\./g, '$1\u0000')
        .replace(/(\d)\.(\d)/g, '$1\u0001$2');
    const pieces = masked.split(/(?<=[.!?।॥])\s+(?=[\p{Lu}\p{Lo}"'(\[\d])/u);

    return pieces
        .map((piece) => piece.replace(/\u0000/g, '.').replace(/\u0001/g, '.').trim())
        .filter((piece) => piece.split(/\s+/).length >= 4 && /\p{L}/u.test(piece));
}

export function wordsOf(sentence) {
    return (sentence.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).filter((word) => word.length > 1);
}

/** How much a word says about the topic: frequent, and not a stop word. */
function frequencies(sentences) {
    const counts = new Map();

    for (const sentence of sentences) {
        for (const word of wordsOf(sentence)) {
            if (!STOPWORDS.has(word) && !/^\d+$/.test(word)) {
                counts.set(word, (counts.get(word) ?? 0) + 1);
            }
        }
    }

    const top = Math.max(1, ...counts.values());

    return new Map([...counts].map(([word, count]) => [word, count / top]));
}

/**
 * Picks the most representative sentences (extractive summary) and returns
 * them in their original order, together with the main keywords.
 *
 * @param {string} text
 * @param {number} count how many sentences to keep at most
 */
export function summarize(text, count) {
    const sentences = splitSentences(text);

    if (sentences.length === 0) {
        return { sentences: [], keywords: [], total: 0 };
    }

    const weights = frequencies(sentences);
    const scored = sentences.map((sentence, index) => {
        const words = wordsOf(sentence).filter((word) => weights.has(word));
        const score = words.reduce((sum, word) => sum + weights.get(word), 0) / Math.sqrt(Math.max(words.length, 6));
        // The opening sentences of a document usually carry its subject.
        const position = index < 3 ? 1.25 - index * 0.08 : 1;
        const length = sentence.length > 400 ? 0.7 : 1;

        return { index, sentence, score: score * position * length };
    });

    const chosen = [...scored].sort((a, b) => b.score - a.score).slice(0, Math.min(count, sentences.length));
    chosen.sort((a, b) => a.index - b.index);

    const keywords = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word]) => word);

    return { sentences: chosen.map((entry) => entry.sentence), keywords, total: sentences.length };
}
