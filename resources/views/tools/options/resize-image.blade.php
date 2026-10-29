<fieldset class="options" data-options>
    <legend>Resize</legend>
    <div class="field">
        <label for="mode">Resize by</label>
        <select id="mode" name="mode">
            <option value="percent" selected>Percentage</option>
            <option value="width">Width (height follows)</option>
            <option value="height">Height (width follows)</option>
            <option value="exact">Width and height</option>
        </select>
    </div>
    <div class="field" data-field="percent">
        <label for="percent">Percent of original size</label>
        <input type="number" id="percent" name="percent" value="50" min="1" max="400" step="1">
    </div>
    <div class="row">
        <div class="field" data-field="width" hidden>
            <label for="width">Width (pixels)</label>
            <input type="number" id="width" name="width" min="1" max="16000" step="1" placeholder="1200">
        </div>
        <div class="field" data-field="height" hidden>
            <label for="height">Height (pixels)</label>
            <input type="number" id="height" name="height" min="1" max="16000" step="1" placeholder="800">
        </div>
    </div>
    <div class="field" data-field="keep" hidden>
        <label class="check"><input type="checkbox" name="keepAspect" checked> Keep proportions (fit inside this size)</label>
    </div>
</fieldset>
