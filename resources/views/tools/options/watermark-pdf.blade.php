<fieldset class="options" data-options>
    <legend>Watermark</legend>
    <div class="field">
        <label for="wm-text">Text</label>
        <input type="text" id="wm-text" name="text" value="CONFIDENTIAL" maxlength="80" autocomplete="off">
    </div>
    <div class="row">
        <div class="field">
            <label for="wm-style">Placement</label>
            <select id="wm-style" name="style">
                <option value="diagonal" selected>Diagonal across the page</option>
                <option value="center">Straight, in the middle</option>
                <option value="top">Straight, at the top</option>
                <option value="bottom">Straight, at the bottom</option>
            </select>
        </div>
        <div class="field">
            <label for="wm-color">Colour</label>
            <select id="wm-color" name="color">
                <option value="gray" selected>Grey</option>
                <option value="red">Red</option>
                <option value="blue">Blue</option>
                <option value="black">Black</option>
            </select>
        </div>
    </div>
    <div class="row">
        <div class="field">
            <label for="wm-opacity">Strength</label>
            <select id="wm-opacity" name="opacity">
                <option value="light">Light</option>
                <option value="medium" selected>Medium</option>
                <option value="strong">Strong</option>
            </select>
        </div>
        <div class="field">
            <label for="wm-size">Size</label>
            <select id="wm-size" name="size">
                <option value="small">Small</option>
                <option value="medium" selected>Medium</option>
                <option value="large">Large</option>
            </select>
        </div>
    </div>
    <div class="choices">
        <label><input type="radio" name="scope" value="all" checked> All pages</label>
        <label><input type="radio" name="scope" value="selected"> Only some pages</label>
    </div>
    <div class="field" data-pages hidden>
        <label for="wm-pages">Pages</label>
        <input type="text" id="wm-pages" name="pages" placeholder="1-3, 5" autocomplete="off" maxlength="200">
    </div>
</fieldset>
