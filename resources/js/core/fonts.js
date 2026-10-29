import 'regenerator-runtime/runtime';
import fontkit from '@pdf-lib/fontkit';
import devanagariBold from '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff?url';
import devanagariRegular from '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff?url';
import latinBold from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url';
import latinBoldItalic from '@fontsource/noto-sans/files/noto-sans-latin-700-italic.woff?url';
import latinItalic from '@fontsource/noto-sans/files/noto-sans-latin-400-italic.woff?url';
import latinRegular from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';

const URLS = {
    latin: { regular: latinRegular, bold: latinBold, italic: latinItalic, boldItalic: latinBoldItalic },
    devanagari: { regular: devanagariRegular, bold: devanagariBold, italic: devanagariRegular, boldItalic: devanagariBold },
};

const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/;

let load = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const downloads = new Map();

/** Tests read the font files from disk instead of fetching them. */
export function setFontLoader(loader) {
    load = loader;
    downloads.clear();
}

const fetchOnce = (url) => {
    if (!downloads.has(url)) {
        downloads.set(url, load(url));
    }

    return downloads.get(url);
};

/** Which script a character needs: Devanagari for Hindi/Marathi/Sanskrit, otherwise Latin. */
const scriptOf = (char) => (DEVANAGARI.test(char) ? 'devanagari' : 'latin');

/**
 * Splits text into runs that each need one font. Characters that both scripts
 * can draw (spaces, digits, punctuation) stay with the run they are inside.
 */
export function scriptRuns(text) {
    const runs = [];

    for (const char of text) {
        const neutral = /[\s\d.,;:!?()[\]{}'"\-–—•/\\|%&*+=<>@#$^_~`।॥]/.test(char);
        const script = neutral && runs.length > 0 ? runs[runs.length - 1].script : scriptOf(char);

        if (runs.length > 0 && runs[runs.length - 1].script === script) {
            runs[runs.length - 1].text += char;
        } else {
            runs.push({ script, text: char });
        }
    }

    return runs;
}

/**
 * Noto Sans for Latin and Devanagari text, embedded into one PDF document.
 * Fonts are only fetched and embedded when some text actually needs them.
 */
export function createFontSet(pdf) {
    pdf.registerFontkit(fontkit);
    const pending = new Map();
    const embedded = new Map();

    const style = (bold, italic) => (bold ? (italic ? 'boldItalic' : 'bold') : italic ? 'italic' : 'regular');

    async function font(script, weight) {
        const key = `${script}:${weight}`;

        if (!pending.has(key)) {
            pending.set(key, fetchOnce(URLS[script][weight])
                .then((bytes) => pdf.embedFont(bytes, { subset: true }))
                .then((embeddedFont) => {
                    embedded.set(key, embeddedFont);

                    return embeddedFont;
                }));
        }

        return pending.get(key);
    }

    return {
        /** Loads every font the text needs, so that `runs`, `width` and `draw` can then be used synchronously. */
        async prepare(text, { bold = false, italic = false } = {}) {
            // Spaces and digits measured on their own always use the Latin font.
            await font('latin', style(bold, italic));

            for (const run of scriptRuns(text)) {
                await font(run.script, style(bold, italic));
            }
        },

        runs(text, { bold = false, italic = false } = {}) {
            return scriptRuns(text).map((run) => ({ text: run.text, font: embedded.get(`${run.script}:${style(bold, italic)}`) }));
        },

        width(text, size, options = {}) {
            return this.runs(text, options).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);
        },

        /** Draws text starting at (x, y); returns the width drawn. */
        draw(page, text, { x, y, size, color, bold = false, italic = false, rotate, opacity }) {
            let cursor = x;

            for (const run of this.runs(text, { bold, italic })) {
                page.drawText(run.text, { x: cursor, y, size, font: run.font, color, rotate, opacity });
                cursor += run.font.widthOfTextAtSize(run.text, size);
            }

            return cursor - x;
        },
    };
}
