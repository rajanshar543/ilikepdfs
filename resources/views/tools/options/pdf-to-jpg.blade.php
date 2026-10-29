<fieldset class="options" data-options>
    <legend>Image options</legend>
    <div class="row">
        <div class="field">
            <label for="dpi">Resolution</label>
            <select id="dpi" name="dpi">
                <option value="72">Screen (72 dpi)</option>
                <option value="150" selected>Standard (150 dpi)</option>
                <option value="220">High (220 dpi)</option>
            </select>
        </div>
        <div class="field">
            <label for="quality">JPG quality</label>
            <select id="quality" name="quality">
                <option value="0.6">Small file</option>
                <option value="0.9" selected>Balanced</option>
                <option value="1">Best quality</option>
            </select>
        </div>
    </div>
    <div class="field">
        <label for="pages">Pages (optional)</label>
        <input type="text" id="pages" name="pages" placeholder="All pages, or for example 1-3, 5" autocomplete="off" maxlength="200">
    </div>
</fieldset>
