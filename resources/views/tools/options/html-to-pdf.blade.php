<div class="options" data-options>
    <div class="field" data-stage>
        <label for="html">Paste HTML</label>
        <textarea id="html" name="html" rows="8" maxlength="2000000" placeholder="&lt;h1&gt;Hello&lt;/h1&gt;&lt;p&gt;Your content here&lt;/p&gt;"></textarea>
    </div>
    <div class="field">
        <label for="url">Or enter a web address</label>
        <input type="text" id="url" name="url" maxlength="2048" placeholder="https://example.com/page" autocomplete="off">
        <small>Pictures and styles stored on other sites are not loaded. If you chose an HTML file above, it is used instead of this.</small>
    </div>
    <div class="row">
        <div class="field">
            <label for="pageSize">Page size</label>
            <select id="pageSize" name="pageSize">
                <option value="a4" selected>A4</option>
                <option value="letter">US Letter</option>
            </select>
        </div>
        <div class="field">
            <label for="orientation">Orientation</label>
            <select id="orientation" name="orientation">
                <option value="portrait" selected>Portrait</option>
                <option value="landscape">Landscape</option>
            </select>
        </div>
    </div>
    <div class="field">
        <label for="margin">Margin</label>
        <select id="margin" name="margin">
            <option value="none">None</option>
            <option value="small">Small</option>
            <option value="normal" selected>Normal</option>
        </select>
    </div>
</div>
