<fieldset class="options" data-options>
    <legend>Page numbers</legend>
    <div class="row">
        <div class="field">
            <label for="position">Position</label>
            <select id="position" name="position">
                <option value="bottom-center" selected>Bottom centre</option>
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-center">Top centre</option>
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
            </select>
        </div>
        <div class="field">
            <label for="format">Format</label>
            <select id="format" name="format">
                <option value="number" selected>1, 2, 3</option>
                <option value="page">Page 1, Page 2</option>
                <option value="number-of">1 / 10, 2 / 10</option>
                <option value="page-of">Page 1 of 10</option>
            </select>
        </div>
    </div>
    <div class="row">
        <div class="field">
            <label for="size">Size</label>
            <select id="size" name="size">
                <option value="small">Small</option>
                <option value="medium" selected>Medium</option>
                <option value="large">Large</option>
            </select>
        </div>
        <div class="field">
            <label for="color">Colour</label>
            <select id="color" name="color">
                <option value="black" selected>Black</option>
                <option value="gray">Grey</option>
            </select>
        </div>
    </div>
    <div class="field">
        <label for="start">First number</label>
        <input type="number" id="start" name="start" value="1" min="0" max="100000" step="1">
    </div>
    <div class="choices">
        <label><input type="radio" name="scope" value="all" checked> All pages</label>
        <label><input type="radio" name="scope" value="selected"> Only some pages</label>
    </div>
    <div class="field" data-pages hidden>
        <label for="numpages">Pages</label>
        <input type="text" id="numpages" name="pages" placeholder="2-10" autocomplete="off" maxlength="200">
    </div>
</fieldset>
