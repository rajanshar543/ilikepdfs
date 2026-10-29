<div class="options" data-options>
    <div class="palette">
        <button type="button" class="btn btn--soft" data-tool-button="text">Text</button>
        <button type="button" class="btn btn--soft" data-tool-button="rect">Rectangle</button>
        <button type="button" class="btn btn--soft" data-tool-button="ellipse">Ellipse</button>
        <button type="button" class="btn btn--soft" data-tool-button="line">Line</button>
        <button type="button" class="btn btn--soft" data-tool-button="ink">Pen</button>
        <label class="btn btn--soft" for="edit-image">Picture
            <input type="file" id="edit-image" accept="image/png,image/jpeg" hidden data-image-input>
        </label>
        <input type="color" name="color" value="#dd3333" aria-label="Colour">
        <select name="size" aria-label="Text size">
            <option value="12">Text 12</option>
            <option value="16" selected>Text 16</option>
            <option value="24">Text 24</option>
            <option value="36">Text 36</option>
        </select>
        <select name="stroke" aria-label="Line width">
            <option value="1">Thin</option>
            <option value="2" selected>Medium</option>
            <option value="5">Thick</option>
        </select>
        <button type="button" class="btn btn--ghost" data-undo>Undo</button>
    </div>
    <p class="hint">Pick a tool, then click or drag on a page. Click an item to move, resize or delete it. Double-click text to change it.</p>
    <div class="viewer" data-viewer data-stage></div>
</div>
