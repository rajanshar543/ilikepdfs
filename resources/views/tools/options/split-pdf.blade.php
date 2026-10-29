<fieldset class="options" data-options>
    <legend>Split mode</legend>
    <div class="choices">
        <label><input type="radio" name="mode" value="each" checked> Every page as its own PDF</label>
        <label><input type="radio" name="mode" value="ranges"> Separate file for each range</label>
        <label><input type="radio" name="mode" value="extract"> Extract pages into one PDF</label>
    </div>
    <div class="field" data-ranges hidden>
        <label for="split-ranges">Pages</label>
        <input type="text" id="split-ranges" name="ranges" placeholder="1-3, 5, 8-" autocomplete="off" maxlength="200">
        <small>Use commas between ranges. Example: 1-3, 5, 8- (from page 8 to the end).</small>
    </div>
</fieldset>
