<fieldset class="options" data-options>
    <legend>Password</legend>
    <div class="row">
        <div class="field">
            <label for="pw">Password</label>
            <input type="password" id="pw" name="password" autocomplete="new-password" maxlength="128">
        </div>
        <div class="field">
            <label for="pw2">Repeat password</label>
            <input type="password" id="pw2" name="confirm" autocomplete="new-password" maxlength="128">
        </div>
    </div>
    <small>At least 4 characters. If you forget it, nobody can recover the file, not even us.</small>
    <div class="field">
        <span class="label">People who open it may</span>
        <div class="choices">
            <label class="check"><input type="checkbox" name="allowPrint" checked> Print</label>
            <label class="check"><input type="checkbox" name="allowCopy" checked> Copy text</label>
            <label class="check"><input type="checkbox" name="allowEdit"> Edit</label>
        </div>
    </div>
</fieldset>
