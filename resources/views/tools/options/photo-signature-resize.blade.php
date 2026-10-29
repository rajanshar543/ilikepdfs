<fieldset class="options" data-options>
    <legend>Size</legend>
    <div class="field">
        <label for="preset">Resize to</label>
        <select id="preset" name="preset">
            <option value="passport" selected>Passport photo 35 x 45 mm</option>
            <option value="small-photo">Form photo 3.5 x 4.5 cm (small)</option>
            <option value="square">Square photo 2 x 2 in</option>
            <option value="signature">Signature 140 x 60 px</option>
            <option value="signature-wide">Signature 4 x 2 cm</option>
            <option value="custom">My own size...</option>
        </select>
    </div>
    <div data-custom hidden class="options options--inner">
        <div class="row">
            <div class="field"><label for="width">Width</label><input type="number" id="width" name="width" min="1" step="any" placeholder="3.5"></div>
            <div class="field"><label for="height">Height</label><input type="number" id="height" name="height" min="1" step="any" placeholder="4.5"></div>
        </div>
        <div class="row">
            <div class="field">
                <label for="unit">Unit</label>
                <select id="unit" name="unit"><option value="px">pixels</option><option value="mm">mm</option><option value="cm" selected>cm</option><option value="in">inches</option></select>
            </div>
            <div class="field">
                <label for="dpi">Resolution (for mm, cm, inches)</label>
                <select id="dpi" name="dpi"><option value="72">72 dpi</option><option value="150">150 dpi</option><option value="300" selected>300 dpi</option><option value="600">600 dpi</option></select>
            </div>
        </div>
    </div>
    <div class="field">
        <label for="maxKb">Keep the file under (KB, optional)</label>
        <input type="number" id="maxKb" name="maxKb" min="2" max="20000" step="1" placeholder="Leave empty for no limit, e.g. 50">
    </div>
    <div class="row">
        <div class="field">
            <label for="fit">If the shape is different</label>
            <select id="fit" name="fit"><option value="cover" selected>Fill the size (crop the edges)</option><option value="contain">Fit inside (add margins)</option></select>
        </div>
        <div class="field">
            <label for="focus">Crop from</label>
            <select id="focus" name="focus"><option value="center" selected>The middle</option><option value="top">The top (for faces)</option></select>
        </div>
    </div>
    <div class="field">
        <label for="background">Margins are</label>
        <select id="background" name="background"><option value="white" selected>White</option><option value="gray">Light grey</option><option value="black">Black</option></select>
    </div>
    <small>Form and exam rules differ. Check the exact size and file size your form asks for.</small>
</fieldset>
