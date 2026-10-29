<fieldset class="options" data-options>
    <legend>Target size</legend>
    <div class="field">
        <label for="preset">Make the PDF smaller than</label>
        <select id="preset" name="preset">
            <option value="50">50 KB</option>
            <option value="100">100 KB</option>
            <option value="200" selected>200 KB</option>
            <option value="300">300 KB</option>
            <option value="500">500 KB</option>
            <option value="1024">1 MB</option>
            <option value="2048">2 MB</option>
            <option value="custom">Other size...</option>
        </select>
    </div>
    <div class="row" data-custom hidden>
        <div class="field">
            <label for="customKb">Size</label>
            <input type="number" id="customKb" name="customKb" min="5" max="50000" step="1" placeholder="150">
        </div>
        <div class="field">
            <label for="unit">Unit</label>
            <select id="unit" name="unit">
                <option value="kb" selected>KB</option>
                <option value="mb">MB</option>
            </select>
        </div>
    </div>
    <small>We use the gentlest compression that is enough. If the only way to reach the size is to turn pages into pictures, we tell you.</small>
</fieldset>
