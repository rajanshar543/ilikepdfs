<fieldset class="options" data-options>
    <legend>Rotation</legend>
    <div class="field">
        <label for="angle">Rotate clockwise by</label>
        <select id="angle" name="angle">
            <option value="90" selected>90&deg; (quarter turn right)</option>
            <option value="180">180&deg; (upside down)</option>
            <option value="270">270&deg; (quarter turn left)</option>
        </select>
    </div>
    <div class="choices">
        <label><input type="radio" name="scope" value="all" checked> All pages</label>
        <label><input type="radio" name="scope" value="selected"> Only some pages</label>
    </div>
    <div class="field" data-pages hidden>
        <label for="rotate-pages">Pages</label>
        <input type="text" id="rotate-pages" name="pages" placeholder="1-3, 5" autocomplete="off" maxlength="200">
    </div>
</fieldset>
