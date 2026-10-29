import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { process as compress } from './compress-pdf.js';
import { process as merge } from './merge-pdf.js';
import { process as pageNumbers } from './page-numbers.js';
import { process as protect } from './protect-pdf.js';
import { process as rotate } from './rotate-pdf.js';
import { process as unlock } from './unlock-pdf.js';
import { process as watermark } from './watermark-pdf.js';

export const kinds = ['pdf'];

const MAX_STEPS = 8;

/** Every step takes the PDF(s) from the step before and hands one PDF to the next. */
export const STEPS = {
    merge: {
        label: 'Merge into one PDF',
        fields: [],
        run: (files, options, progress) => merge(files, {}, progress),
    },
    compress: {
        label: 'Compress',
        fields: [{ name: 'level', type: 'select', label: 'Level', options: [['low', 'Less'], ['recommended', 'Recommended'], ['extreme', 'Extreme']], value: 'recommended' }],
        run: (files, options, progress) => compress(files, { level: options.level }, progress),
    },
    rotate: {
        label: 'Rotate all pages',
        fields: [{ name: 'angle', type: 'select', label: 'Turn clockwise', options: [['90', '90°'], ['180', '180°'], ['270', '270°']], value: '90' }],
        run: (files, options, progress) => rotate(files, { angle: Number(options.angle), scope: 'all' }, progress),
    },
    'page-numbers': {
        label: 'Add page numbers',
        fields: [
            { name: 'position', type: 'select', label: 'Position', options: [['bottom-center', 'Bottom centre'], ['bottom-right', 'Bottom right'], ['top-right', 'Top right']], value: 'bottom-center' },
            { name: 'format', type: 'select', label: 'Format', options: [['number', '1, 2, 3'], ['page-of', 'Page 1 of 10']], value: 'number' },
        ],
        run: (files, options, progress) => pageNumbers(files, { position: options.position, format: options.format }, progress),
    },
    watermark: {
        label: 'Add a watermark',
        fields: [{ name: 'text', type: 'text', label: 'Text', value: 'CONFIDENTIAL' }],
        run: (files, options, progress) => watermark(files, { text: options.text }, progress),
    },
    protect: {
        label: 'Protect with a password',
        fields: [{ name: 'password', type: 'password', label: 'Password', value: '' }],
        run: (files, options, progress) => protect(files, { password: options.password, confirm: options.password }, progress),
    },
    unlock: {
        label: 'Remove a password',
        fields: [{ name: 'password', type: 'password', label: 'Current password', value: '' }],
        run: (files, options, progress) => unlock(files, { password: options.password }, progress),
    },
};

export const PRESETS = {
    email: { label: 'Email-ready', steps: ['compress', 'page-numbers'] },
    secure: { label: 'Secure copy', steps: ['compress', 'watermark', 'protect'] },
    pack: { label: 'Report pack', steps: ['merge', 'page-numbers', 'compress'] },
};

let steps = [];
let nextId = 1;

export function readOptions() {
    return { steps: steps.map((step) => ({ type: step.type, options: { ...step.options } })) };
}

export function resetWorkflow() {
    steps = [];
}

const defaultsFor = (type) => Object.fromEntries(STEPS[type].fields.map((field) => [field.name, field.value]));

export function init(root) {
    const list = root.querySelector('[data-steps]');
    const picker = root.querySelector('[data-step-type]');

    for (const [type, definition] of Object.entries(STEPS)) {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = definition.label;
        picker.append(option);
    }

    const add = (type) => {
        if (steps.length >= MAX_STEPS) {
            return;
        }

        steps.push({ id: nextId, type, options: defaultsFor(type) });
        nextId += 1;
        render();
    };

    function render() {
        list.replaceChildren();

        if (steps.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'hint';
            empty.textContent = 'No steps yet. Pick a ready-made workflow or add steps below.';
            list.append(empty);
        }

        steps.forEach((step, index) => {
            const row = document.createElement('li');
            row.className = 'step';
            row.dataset.type = step.type;

            const title = document.createElement('div');
            title.className = 'step__title';
            title.textContent = `${index + 1}. ${STEPS[step.type].label}`;
            row.append(title);

            STEPS[step.type].fields.forEach((field) => {
                const label = document.createElement('label');
                label.className = 'step__field';
                label.append(document.createTextNode(field.label));
                let input;

                if (field.type === 'select') {
                    input = document.createElement('select');
                    field.options.forEach(([value, text]) => {
                        const option = document.createElement('option');
                        option.value = value;
                        option.textContent = text;
                        input.append(option);
                    });
                } else {
                    input = document.createElement('input');
                    input.type = field.type;
                    input.maxLength = 128;
                    input.autocomplete = 'off';
                }

                input.name = `step-${field.name}`;
                input.value = step.options[field.name];
                input.addEventListener('input', () => { step.options[field.name] = input.value; });
                label.append(input);
                row.append(label);
            });

            const bar = document.createElement('div');
            bar.className = 'step__bar';
            const button = (text, title_, handler, disabled = false) => {
                const element = document.createElement('button');
                element.type = 'button';
                element.textContent = text;
                element.setAttribute('aria-label', title_);
                element.disabled = disabled;
                element.addEventListener('click', handler);
                bar.append(element);
            };
            button('↑', 'Move step up', () => { [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]; render(); }, index === 0);
            button('↓', 'Move step down', () => { [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]]; render(); }, index === steps.length - 1);
            button('Remove', 'Remove step', () => { steps.splice(index, 1); render(); });
            row.append(bar);
            list.append(row);
        });
    }

    root.querySelector('[data-step-add]').addEventListener('click', () => add(picker.value));
    root.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
        steps = [];
        PRESETS[button.dataset.preset].steps.forEach((type) => add(type));
    }));

    render();
}

/**
 * Runs a chain of PDF steps one after another, each on the result of the
 * step before, so several jobs happen in one go.
 *
 * @param {File[]} files one PDF, or several when the chain starts with a merge
 * @param {{steps: {type: string, options?: object}[]}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { steps: chain = [] } = options;

    if (files.length === 0) {
        throw new ToolError('Add at least one PDF file.');
    }

    if (!Array.isArray(chain) || chain.length === 0) {
        throw new ToolError('Add at least one step to the workflow.');
    }

    if (chain.length > MAX_STEPS) {
        throw new ToolError(`A workflow can have at most ${MAX_STEPS} steps.`);
    }

    if (chain.some((step) => !(step?.type in STEPS))) {
        throw new ToolError('One of the steps is not valid.');
    }

    let current = files;

    for (const [index, step] of chain.entries()) {
        const definition = STEPS[step.type];

        if (step.type !== 'merge' && current.length !== 1) {
            throw new ToolError('You added several PDFs, so start the workflow with "Merge into one PDF".');
        }

        const result = await definition.run(current, { ...defaultsFor(step.type), ...(step.options ?? {}) }, (fraction, text) => onProgress((index + fraction) / chain.length, `Step ${index + 1} of ${chain.length}: ${definition.label}${text ? ` (${text})` : ''}`));
        current = [new File([result[0].blob], result[0].name, { type: 'application/pdf' })];
    }

    return [{
        name: `${baseName(files[0].name)}-processed.pdf`,
        blob: new Blob([await current[0].arrayBuffer()], { type: 'application/pdf' }),
        note: chain.map((step) => STEPS[step.type].label).join(' → '),
    }];
}
