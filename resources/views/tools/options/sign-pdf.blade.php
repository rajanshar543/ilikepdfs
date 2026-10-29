<div class="options" data-options>
    <div class="field">
        <span class="label">1. Create your signature</span>
        <div class="palette">
            <label for="ink">Colour</label>
            <select id="ink" name="inkColor">
                <option value="#111827" selected>Black</option>
                <option value="#1d4ed8">Blue</option>
            </select>
        </div>
    </div>
    <div class="field">
        <label>Draw it</label>
        <canvas class="sigpad" width="840" height="300" data-sigpad aria-label="Signature pad"></canvas>
        <div class="palette">
            <button type="button" class="btn btn--soft" data-sig-use-draw>Use drawn signature</button>
            <button type="button" class="btn btn--ghost" data-sig-clear>Clear</button>
        </div>
    </div>
    <div class="field">
        <label for="typed">Or type it</label>
        <div class="palette">
            <input type="text" id="typed" name="typed" maxlength="60" placeholder="Your name" autocomplete="off">
            <select name="typedStyle" aria-label="Style">
                <option value="script" selected>Handwriting</option>
                <option value="serif">Classic</option>
                <option value="plain">Plain</option>
            </select>
            <button type="button" class="btn btn--soft" data-sig-use-type>Use typed signature</button>
        </div>
    </div>
    <p class="hint" data-sign-status>2. After you create a signature, click on the page to place it.</p>
    <div class="palette"><button type="button" class="btn btn--ghost" data-undo>Undo last</button></div>
    <div class="viewer" data-viewer data-stage></div>
</div>
