import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../resources/js/core/errors.js';
import { openPdf, setPdfjsAssetBase } from '../../resources/js/core/pdfjs.js';
import { describeFields, process, readOptions, resetForms } from '../../resources/js/tools/pdf-forms.js';
import { makePdf } from './helpers.js';

beforeAll(() => setPdfjsAssetBase(`${path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/`));

/** A form with a text box, a checkbox, a dropdown and radio buttons. */
async function formPdf() {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([400, 400]);
    const form = pdf.getForm();
    form.createTextField('Full name').addToPage(page, { x: 20, y: 340, width: 200, height: 22 });
    form.createCheckBox('Agree').addToPage(page, { x: 20, y: 300, width: 18, height: 18 });
    const country = form.createDropdown('Country');
    country.addOptions(['India', 'France', 'Japan']);
    country.addToPage(page, { x: 20, y: 250, width: 150, height: 22 });
    const plan = form.createRadioGroup('Plan');
    plan.addOptionToPage('Free', page, { x: 20, y: 200, width: 16, height: 16 });
    plan.addOptionToPage('Pro', page, { x: 80, y: 200, width: 16, height: 16 });

    return new File([await pdf.save()], 'form.pdf', { type: 'application/pdf' });
}

const reload = async (blob) => PDFDocument.load(await blob.arrayBuffer());

describe('pdf-forms', () => {
    it('lists the fields of a form', async () => {
        const pdf = await reload(new Blob([await (await formPdf()).arrayBuffer()]));

        expect(describeFields(pdf)).toEqual([
            { name: 'Full name', kind: 'text', value: '', multiline: false },
            { name: 'Agree', kind: 'checkbox', value: false },
            { name: 'Country', kind: 'choice', options: ['India', 'France', 'Japan'], value: '' },
            { name: 'Plan', kind: 'radio', options: ['Free', 'Pro'], value: '' },
        ]);
        expect(describeFields(await PDFDocument.load(await (await makePdf(1)).arrayBuffer()))).toEqual([]);
    });

    it('fills text, checkbox, dropdown and radio fields', async () => {
        const [result] = await process([await formPdf()], { values: { 'Full name': 'Asha Verma', Agree: true, Country: 'France', Plan: 'Pro' } });
        const form = (await reload(result.blob)).getForm();

        expect(result.name).toBe('form-form.pdf');
        expect(result.note).toBe('4 changes');
        expect(form.getTextField('Full name').getText()).toBe('Asha Verma');
        expect(form.getCheckBox('Agree').isChecked()).toBe(true);
        expect(form.getDropdown('Country').getSelected()).toEqual(['France']);
        expect(form.getRadioGroup('Plan').getSelected()).toBe('Pro');
    });

    it('can clear a choice again', async () => {
        const [filled] = await process([await formPdf()], { values: { Country: 'Japan' } });
        const [cleared] = await process([new File([await filled.blob.arrayBuffer()], 'f.pdf')], { values: { Country: '' } });

        expect((await reload(cleared.blob)).getForm().getDropdown('Country').getSelected()).toEqual([]);
    });

    it('flattens the form so the values become page content', async () => {
        const [result] = await process([await formPdf()], { values: { 'Full name': 'Asha Verma' }, flatten: true });
        const doc = await openPdf(result.blob);
        const texts = (await (await doc.getPage(1)).getTextContent()).items.map((item) => item.str).join(' ');

        expect((await reload(result.blob)).getForm().getFields()).toHaveLength(0);
        expect(texts).toContain('Asha Verma');
        expect(result.note).toContain('flattened');
    });

    it('adds new text boxes and checkboxes to a plain PDF', async () => {
        const [result] = await process([await makePdf(1, { width: 300, height: 400 })], { newFields: [
            { type: 'field', kind: 'text', page: 0, x: 40, y: 60, w: 160, h: 24 },
            { type: 'field', kind: 'checkbox', page: 0, x: 40, y: 120, w: 18, h: 18 },
            { type: 'field', kind: 'text', page: 0, x: 40, y: 180, w: 160, h: 24 },
        ] });
        const form = (await reload(result.blob)).getForm();

        expect(form.getFields().map((field) => field.getName())).toEqual(['Text 1', 'Checkbox 1', 'Text 2']);
        const widget = form.getTextField('Text 1').acroField.getWidgets()[0].getRectangle();
        // The 1pt border widens the widget by half a point on every side.
        expect(Math.abs(widget.x - 40)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(widget.y - 316)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(widget.width - 160)).toBeLessThanOrEqual(1);
        expect(Math.abs(widget.height - 24)).toBeLessThanOrEqual(1);
    });

    it('collects the form state through readOptions', () => {
        resetForms();

        expect(readOptions({ querySelector: () => null })).toEqual({ values: {}, newFields: [], flatten: false });
    });

    it('rejects bad values, bad fields and nothing to do', async () => {
        const form = await formPdf();

        await expect(process([form], { values: { Missing: 'x' } })).rejects.toThrow('no field called "Missing"');
        await expect(process([form], { values: { Country: 'Narnia' } })).rejects.toThrow('could not be entered');
        await expect(process([form], { values: {} })).rejects.toThrow('Fill in a field');
        await expect(process([form], { newFields: [{ type: 'field', kind: 'radio', page: 0, x: 1, y: 1, w: 10, h: 10 }] })).rejects.toThrow('not valid');
        await expect(process([form], { newFields: [{ type: 'field', kind: 'text', page: 9, x: 1, y: 1, w: 10, h: 10 }] })).rejects.toThrow('not valid');
        await expect(process([form], { newFields: Array.from({ length: 201 }, () => ({})) })).rejects.toThrow('at most 200');
        await expect(process([], {})).rejects.toBeInstanceOf(ToolError);
    });
});
