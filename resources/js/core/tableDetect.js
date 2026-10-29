import { groupLines } from './pdfText.js';

/** Splits a line into cells: pieces separated by a clearly wider gap than a space. */
function cellsOf(line) {
    const gap = Math.max(9, line.size * 1.1);
    const cells = [];

    for (const part of line.parts) {
        const last = cells[cells.length - 1];

        if (last && part.x - last.end <= gap) {
            const spaced = part.x - last.end > 0.15 * line.size && !last.text.endsWith(' ') && !part.str.startsWith(' ');
            last.text += (spaced ? ' ' : '') + part.str;
            last.end = part.x + part.w;
        } else {
            cells.push({ text: part.str, x: part.x, end: part.x + part.w });
        }
    }

    return cells.map((cell) => ({ ...cell, text: cell.text.trim() })).filter((cell) => cell.text !== '');
}

/** Columns are the stretches of the page width that some cell covers; blank stretches separate columns. */
function columnsOf(cells) {
    const sorted = [...cells].sort((a, b) => a.x - b.x);
    const columns = [];

    for (const cell of sorted) {
        const last = columns[columns.length - 1];

        if (last && cell.x <= last.end) {
            last.end = Math.max(last.end, cell.end);
        } else {
            columns.push({ start: cell.x, end: cell.end });
        }
    }

    return columns;
}

/**
 * Turns the text of one page into spreadsheet rows. Lines with two or more
 * cells next to each other form a table; other lines become single cells.
 *
 * @returns {string[][]}
 */
export function pageToRows(page) {
    const lines = groupLines(page.items).map((line) => ({ line, cells: cellsOf(line) })).filter((entry) => entry.cells.length > 0);
    const rows = [];
    let block = [];

    const flush = () => {
        if (block.length === 0) {
            return;
        }

        const columns = columnsOf(block.flatMap((entry) => entry.cells));

        for (const entry of block) {
            const row = Array(columns.length).fill('');

            for (const cell of entry.cells) {
                const index = columns.findIndex((column) => cell.x >= column.start - 0.5 && cell.x <= column.end + 0.5);
                row[index] = row[index] === '' ? cell.text : `${row[index]} ${cell.text}`;
            }

            rows.push(row);
        }

        block = [];
    };

    for (const entry of lines) {
        if (entry.cells.length >= 2) {
            block.push(entry);
        } else {
            flush();
            rows.push([entry.cells[0].text]);
        }
    }

    flush();

    return rows;
}
