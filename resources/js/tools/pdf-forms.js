import {
    PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField,
} from 'pdf-lib';
import { ToolError } from '../core/errors.js';
import { baseName } from '../core/files.js';
import { createAnnotator, mountViewer } from '../core/pageViewer.js';
import { pageInfo, rectToPage } from '../core/pdfAnnotate.js';
import { loadPdf, savePdf } from '../core/pdf.js';

export const kinds = ['pdf'];
export const thumbs = false;

const NAME = /^[\p{L}\p{N} _.-]{1,60}$/u;
const MAX_NEW_FIELDS = 200;

let viewer = null;
let annotator = null;
let current = [];
let values = {};

export function readOptions(root) {
    return {
        values,
        newFields: current,
        flatten: root.querySelector('input[name="flatten"]')?.checked ?? false,
    };
}

export function resetForms() {
    viewer = null;
    annotator = null;
    current = [];
    values = {};
}

/** Describes the fields of a loaded PDF so the page can show a control for each. */
export function describeFields(pdf) {
    return pdf.getForm().getFields().map((field) => {
        const name = field.getName();

        if (field instanceof PDFTextField) {
            return { name, kind: 'text', value: field.getText() ?? '', multiline: field.isMultiline() };
        }

        if (field instanceof PDFCheckBox) {
            return { name, kind: 'checkbox', value: field.isChecked() };
        }

        if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
            return { name, kind: 'choice', options: field.getOptions(), value: field.getSelected()[0] ?? '' };
        }

        if (field instanceof PDFRadioGroup) {
            return { name, kind: 'radio', options: field.getOptions(), value: field.getSelected() ?? '' };
        }

        return { name, kind: 'other' };
    });
}

function control(field, onChange) {
    const wrapper = globalThis.document.createElement('div');
    wrapper.className = 'field';
    const label = globalThis.document.createElement('label');
    label.textContent = field.name;
    let input;

    if (field.kind === 'checkbox') {
        input = globalThis.document.createElement('input');
        input.type = 'checkbox';
        input.checked = field.value;
        input.addEventListener('change', () => onChange(input.checked));
        label.className = 'check';
        label.prepend(input);
        wrapper.append(label);

        return wrapper;
    }

    if (field.kind === 'choice' || field.kind === 'radio') {
        input = globalThis.document.createElement('select');
        [['', '(none)'], ...field.options.map((option) => [option, option])].forEach(([value, text]) => {
            const option = globalThis.document.createElement('option');
            option.value = value;
            option.textContent = text;
            input.append(option);
        });
        input.value = field.value;
        input.addEventListener('change', () => onChange(input.value));
    } else if (field.kind === 'text') {
        input = globalThis.document.createElement(field.multiline ? 'textarea' : 'input');
        input.value = field.value;
        input.maxLength = 2000;
        input.addEventListener('input', () => onChange(input.value));
    } else {
        return null;
    }

    wrapper.append(label, input);

    return wrapper;
}

export async function onFilesChanged(root, files) {
    const holder = root.querySelector('[data-viewer]');
    const list = root.querySelector('[data-fields]');
    const empty = root.querySelector('[data-no-fields]');

    annotator?.destroy();
    viewer?.destroy();
    viewer = null;
    annotator = null;
    current = [];
    values = {};
    list?.replaceChildren();

    if (!holder || files.length === 0) {
        return;
    }

    try {
        const pdf = await loadPdf(files[0]);
        const fields = describeFields(pdf);
        empty.hidden = fields.length > 0;

        for (const field of fields) {
            const element = control(field, (value) => { values[field.name] = value; });

            if (element) {
                list.append(element);
            }
        }

        viewer = await mountViewer(holder, files[0]);
    } catch (error) {
        holder.textContent = error instanceof ToolError ? error.message : 'This PDF could not be shown.';

        return;
    }

    annotator = createAnnotator(viewer, {
        onChange: (items) => { current = items; },
        render: {
            field: (item, page) => {
                const element = globalThis.document.createElement('div');
                element.className = 'pv-item pv-item--field';
                element.style.left = `${item.x * page.scale}px`;
                element.style.top = `${item.y * page.scale}px`;
                element.style.width = `${item.w * page.scale}px`;
                element.style.height = `${item.h * page.scale}px`;
                element.textContent = item.kind === 'checkbox' ? '✓' : 'Text field';

                return element;
            },
        },
    });

    const buttons = [...root.querySelectorAll('[data-tool-button]')];
    buttons.forEach((button) => button.addEventListener('click', () => {
        const active = button.classList.contains('is-active');
        buttons.forEach((other) => other.classList.remove('is-active'));

        if (active) {
            annotator.setTool(null);

            return;
        }

        button.classList.add('is-active');
        const kind = button.dataset.toolButton;
        annotator.setTool({
            kind: 'drag',
            create: (page, { x, y, w, h }) => ({
                type: 'field', kind, x, y, w: kind === 'checkbox' ? Math.min(w, h, 24) : w, h: kind === 'checkbox' ? Math.min(w, h, 24) : h,
            }),
        });
    }));
    root.querySelector('[data-undo]')?.addEventListener('click', () => annotator.undo());
}

function uniqueName(form, base) {
    const taken = new Set(form.getFields().map((field) => field.getName()));
    let counter = 1;

    while (taken.has(`${base} ${counter}`)) {
        counter += 1;
    }

    return `${base} ${counter}`;
}

/**
 * Fills the form fields a PDF already has, adds new text boxes and checkboxes,
 * and can flatten the form so it can no longer be edited.
 *
 * @param {File[]} files exactly one PDF
 * @param {{values?: Record<string, string|boolean>, newFields?: object[], flatten?: boolean}} options
 */
export async function process(files, options = {}, onProgress = () => {}) {
    const { values: filled = {}, newFields = [], flatten = false } = options;

    if (files.length !== 1) {
        throw new ToolError('Add one PDF file to fill.');
    }

    if (newFields.length > MAX_NEW_FIELDS) {
        throw new ToolError(`Add at most ${MAX_NEW_FIELDS} new fields.`);
    }

    const file = files[0];
    const pdf = await loadPdf(file);
    const form = pdf.getForm();
    const pages = pdf.getPages();
    let changes = 0;

    onProgress(0.3, 'Filling the fields');

    try {
        for (const [name, value] of Object.entries(filled)) {
            const field = form.getFieldMaybe(name);

            if (!field) {
                throw new ToolError(`There is no field called "${name}".`);
            }

            if (field instanceof PDFTextField) {
                field.setText(String(value).slice(0, 2000));
            } else if (field instanceof PDFCheckBox) {
                value ? field.check() : field.uncheck();
            } else if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
                // Only the listed choices are allowed; pdf-lib would accept anything for an editable dropdown.
                if (value !== '' && !field.getOptions().includes(String(value))) {
                    throw new Error('not a choice');
                }

                value === '' ? field.clear() : field.select(String(value));
            } else {
                continue;
            }

            changes += 1;
        }
    } catch (error) {
        if (error instanceof ToolError) {
            throw error;
        }

        throw new ToolError('A value could not be entered. It may contain characters this form cannot show, or not be one of the choices.');
    }

    for (const item of newFields) {
        if (item?.type !== 'field' || !['text', 'checkbox'].includes(item.kind) || !Number.isInteger(item.page) || item.page < 0 || item.page >= pages.length
            || ![item.x, item.y, item.w, item.h].every(Number.isFinite) || item.w < 4 || item.h < 4) {
            throw new ToolError('One of the new fields is not valid.');
        }

        const info = pageInfo(pages[item.page]);
        const rect = rectToPage(info, item.x, item.y, item.w, item.h);

        if (item.kind === 'text') {
            const field = form.createTextField(uniqueName(form, 'Text'));
            field.addToPage(pages[item.page], { ...rect, borderWidth: 1 });
        } else {
            const field = form.createCheckBox(uniqueName(form, 'Checkbox'));
            field.addToPage(pages[item.page], { ...rect, borderWidth: 1 });
        }

        changes += 1;
    }

    if (changes === 0 && !flatten) {
        throw new ToolError('Fill in a field or add a new one first.');
    }

    if (flatten) {
        form.flatten();
    }

    return [{
        name: `${baseName(file.name)}-form.pdf`,
        blob: await savePdf(pdf),
        note: `${changes} change${changes === 1 ? '' : 's'}${flatten ? ', form flattened' : ''}`,
    }];
}

export { NAME as FIELD_NAME_PATTERN };
