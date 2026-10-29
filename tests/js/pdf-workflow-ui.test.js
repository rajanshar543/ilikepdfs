// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { init, PRESETS, readOptions, resetWorkflow, STEPS } from '../../resources/js/tools/pdf-workflow.js';

describe('pdf-workflow page controls', () => {
    const markup = () => {
        document.body.innerHTML = `<div id="root"><button data-preset="email"></button><button data-preset="secure"></button><button data-preset="pack"></button>
            <ol data-steps></ol><select data-step-type></select><button data-step-add></button></div>`;

        return document.getElementById('root');
    };

    beforeEach(resetWorkflow);

    it('offers every step and builds the list from a ready-made workflow', () => {
        const root = markup();
        init(root);

        expect([...root.querySelectorAll('[data-step-type] option')].map((option) => option.value)).toEqual(Object.keys(STEPS));

        root.querySelector('[data-preset="secure"]').click();
        expect(readOptions().steps.map((step) => step.type)).toEqual(PRESETS.secure.steps);
        expect(root.querySelectorAll('.step')).toHaveLength(3);
    });

    it('adds, edits, reorders and removes steps', () => {
        const root = markup();
        init(root);
        root.querySelector('[data-step-type]').value = 'watermark';
        root.querySelector('[data-step-add]').click();
        root.querySelector('[data-step-type]').value = 'rotate';
        root.querySelector('[data-step-add]').click();

        const text = root.querySelector('input[name="step-text"]');
        text.value = 'SECRET';
        text.dispatchEvent(new Event('input'));
        expect(readOptions().steps[0]).toEqual({ type: 'watermark', options: { text: 'SECRET' } });

        root.querySelectorAll('.step')[1].querySelector('[aria-label="Move step up"]').click();
        expect(readOptions().steps.map((step) => step.type)).toEqual(['rotate', 'watermark']);

        root.querySelectorAll('.step')[0].querySelector('[aria-label="Remove step"]').click();
        expect(readOptions().steps.map((step) => step.type)).toEqual(['watermark']);
    });

    it('limits a workflow to eight steps', () => {
        const root = markup();
        init(root);

        for (let index = 0; index < 12; index += 1) {
            root.querySelector('[data-step-add]').click();
        }

        expect(readOptions().steps).toHaveLength(8);
    });
});
