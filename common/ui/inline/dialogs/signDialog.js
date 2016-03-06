'use strict';

var porto = porto || null;

(function() {
  var id, name, port, l10n;

  function init() {
    if (document.body.dataset.porto) {
      return;
    }
    document.body.dataset.porto = true;
    // open port to background page
    var qs = jQuery.parseQuerystring();
    id = qs.id;
    name = 'sDialog-' + id;
    port = porto.extension.connect({name: name});
    port.onMessage.addListener(messageListener);
    porto.l10n.getMessages([
      'sign_dialog_header',
      'form_cancel',
      'form_ok',
      'form_busy'
    ], function(result) {
      port.postMessage({event: 'sign-dialog-init', sender: name});
      l10n = result;
    });
  }

  function load(content) {
    $('body').html(content);
    porto.l10n.localizeHTML(l10n);
    $('#okBtn')
      .attr({
        'data-loading-text': l10n.form_busy
      })
      .click(onOk);
    $('#cancelBtn').click(onCancel);
    $('#keyDialog').fadeIn('fast');
    // align width
    $.setEqualWidth($('#okBtn'), $('#cancelBtn'));
    $.setEqualWidth($('#addBtn'), $('#deleteBtn'));
  }

  function onOk() {
    $('body').addClass('busy');
    $('#okBtn').button('loading');
    logUserInput('security_log_dialog_ok');

    port.postMessage({
      event: 'send-armored-pub',
      sender: name,
      keyIds: [$('#keySelect').val()],
      type: 'text'
    });

    //port.postMessage({
    //  event: 'sign-dialog-ok',
    //  sender: name,
    //  signKeyId: $('#keySelect').val(),
    //  type: 'text'
    //});

    //port.postMessage({
    //  event: 'keyring',
    //  method: 'getArmoredKeys',
    //  args: [[], {pub: true, priv: true, all: true}],
    //  sender: name,
    //  signKeyId: porto.LOCAL_KEYRING_ID,
    //  type: 'text'
    //}, function(result) {
    //  console.log(result);
    //  var hasPrivate = false;
    //  var allKeys = result.reduce(function(prev, curr) {
    //    if (curr.armoredPublic) {
    //      prev += '\n' + curr.armoredPublic;
    //    }
    //    if (curr.armoredPrivate) {
    //      hasPrivate = true;
    //      prev += '\n' + curr.armoredPrivate;
    //    }
    //    return prev;
    //  }, '');
    //});
    return false;
  }

  function onCancel() {
    logUserInput('security_log_dialog_cancel');
    port.postMessage({event: 'sign-dialog-cancel', sender: name});
    return false;
  }

  /**
   * send log entry for the extension
   * @param {string} type
   */
  function logUserInput(type) {
    port.postMessage({
      event: 'editor-user-input',
      sender: name,
      source: 'security_log_sign_dialog',
      type: type
    });
  }

  function messageListener(msg) {
    switch (msg.event) {
      case 'sign-dialog-content':
        load(msg.data);
        break;
      case 'signing-key-userids':
        var keySelect = $('#keySelect');
        keySelect.append(
          msg.keys.map(function(key) {
            var option = $('<option/>').val(key.id.toLowerCase()).text(key.name + ' <' + key.email + '>');
            if (key.id === msg.primary) {
              option.prop('selected', true);
            }
            return option;
          })
        );
        if (msg.keys.length === 1) {
          onOk();
        }
        else if (msg.keys.length > 1) {
          port.postMessage({
            event:'bp-show-keys-popup-alice',
            sender: name
          });
        }
        break;
      default:
        console.log('unknown event', msg.event);
    }
  }

  $(document).ready(init);

}());
