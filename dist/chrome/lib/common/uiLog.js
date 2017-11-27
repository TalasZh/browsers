'use strict';

define(function(require, exports, module) {

  var porto = require('../porto-lib').porto;
  var l10n = porto.l10n.get;

  var log = [];
  var logTimer = 0;

  /**
   * @param {String} source = 'security_log_editor' <br>
   *                 source = 'security_log_key_generator' <br>
   *                 source = 'security_log_key_backup' <br>
   *                 source = 'security_log_email_viewer' <br>
   *                 source = 'security_log_password_dialog' <br>
   *                 source = 'security_log_import_dialog' <br>
   *                 source = 'security_log_verify_dialog' <br>
   *                 source = 'security_log_sign_dialog' <br>
   *                 source = 'security_log_encrypt_dialog' <br>
   * @param {String} type = 'security_log_textarea_input' <br>
   *                 type = 'security_log_textarea_select' <br>
   *                 type = 'security_log_textarea_click' <br>
   *                 type = 'security_log_text_input' <br>
   *                 type = 'security_log_password_input' <br>
   *                 type = 'security_log_password_show' <br>
   *                 type = 'security_log_remember_click' <br>
   *                 type = 'security_log_attachment_added' <br>
   *                 type = 'security_log_attachment_download' <br>
   *                 type = 'security_log_add_attachment' <br>
   *                 type = 'security_log_remove_attachment' <br>
   *                 type = 'security_log_backup_create' <br>
   *                 type = 'security_log_backup_restore' <br>
   *                 type = 'security_log_backup_code_input' <br>
   *                 type = 'security_log_dialog_ok' <br>
   *                 type = 'security_log_dialog_cancel' <br>
   *                 type = 'security_log_dialog_undo' <br>
   *                 type = 'security_log_dialog_transfer' <br>
   *                 type = 'security_log_dialog_sign' <br>
   *                 type = 'security_log_dialog_encrypt' <br>
   *                 type = 'security_log_content_copy' <br>
   *                 type = 'security_log_signature_modal_open' <br>
   *                 type = 'security_log_signature_modal_close' <br>
   */
  function push(source, type) {
    //console.log(source + ':' + type);
    //console.trace();
    var entry = {
      source: source,
      sourcei18n: l10n(source),
      type: type,
      typei18n: l10n(type),
      timestamp: (new Date()).toISOString()
    };
    var lastEntry = log[log.length - 1];
    if (lastEntry &&
        source === lastEntry.source &&
        type === lastEntry.type &&
        (type === 'security_log_textarea_input' || type === 'security_log_password_input')) {
      // aggregate text input events
      log[log.length - 1] = entry;
    } else {
      log.push(entry);
    }
    if (logTimer) {
      porto.util.clearTimeout(logTimer);
    } else {
      setBadge();
    }
    logTimer = porto.util.setTimeout(clearBadge, 2000);
  }

  function setBadge() {
    porto.browserAction.state({
      badge: 'Ok',
      badgeColor: '#29A000'
    });
  }

  function clearBadge() {
    logTimer = 0;
    porto.browserAction.state({
      badge: ''
    });
  }

  function getAll() {
    return log;
  }

  function getLatest(size) {
    log.slice(-size);
  }

  exports.push = push;
  exports.getAll = getAll;
  exports.getLatest = getLatest;

});
