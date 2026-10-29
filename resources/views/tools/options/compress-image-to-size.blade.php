<fieldset class="options" data-options>
    <legend>Target size</legend>
    <div class="field">
        <label for="preset">Make each image smaller than</label>
        <select id="preset" name="preset">
            <option value="20">20 KB</option>
            <option value="50">50 KB</option>
            <option value="100" selected>100 KB</option>
            <option value="200">200 KB</option>
            <option value="500">500 KB</option>
            <option value="1000">1 MB</option>
            <option value="custom">Other size...</option>
        </select>
    </div>
    <div class="field" data-custom hidden>
        <label for="customKb">Size in KB</label>
        <input type="number" id="customKb" name="customKb" min="2" max="20000" step="1" placeholder="35">
    </div>
    <small>The result is a JPG. Quality is lowered first; if that is not enough, the picture is made a little smaller.</small>
</fieldset>
