/**
 * Listens for events from options UI in sandbox, forwards requests to pgpModel.js
 */

'use strict';

var porto = porto || null;
var options = options || null;

(function(options) {
  // event controller
  var keyTemplate = null;
  var $generateKeyTemplate = $('<div></div>');
  var $keyInfoTemplate = $('<div></div>');
  var $keyImportTemplate = $('<div></div>');
  var $keyExportTemplate = $('<div></div>');
  var $keyConfirmationTemplate = $('<div></div>');
  var $keyErrorTemplate = $('<div></div>');
  var $keySuccessTemplate = $('<div></div>');
  var keyringId = null;
  var keyFile = null;
  var peersMetadata = [];
  var keyPeerMap = {};
  var demailSuffix = 'de-mail.de';

  function init() {
    console.log("Keys js initialized...");

    keyTemplate = $('.b-main-table .b-main-table-body').html();

    initRebirthUI();
    $('body').on('change', '#protectkey', function() {
      $(".js-passwd-hide").toggleClass("js-passwd-show");
      console.log('toggle passwd');
    });

    $('body').on('change', '#advanced', function() {
      $(".js-advanced-hide").toggleClass("js-advanced-show");
    });

    $('body').on('click', '.bp-close-modal-button', function() {
      swal2.closeModal();
    });

    swal2.setDefaults({allowEscapeKey: true, allowOutsideClick: false, width: 492});
  }

  function initRebirthUI() {
    porto.extension.sendMessage({
      event: 'get-version'
    }, function(version) {
      $('#version').text('v' + version);
    });

    var qs = jQuery.parseQuerystring();

    porto.appendTpl($generateKeyTemplate,
      porto.extension.getURL('common/ui/_popup-generate-key.html'));
    porto.appendTpl($keyInfoTemplate,
      porto.extension.getURL('common/ui/_popup-keys-information.html'));
    porto.appendTpl($keyImportTemplate, porto.extension.getURL('common/ui/_popup-import-key.html'));
    porto.appendTpl($keyExportTemplate, porto.extension.getURL('common/ui/_popup-export-key.html'));
    porto.appendTpl($keyConfirmationTemplate,
      porto.extension.getURL('common/ui/_popup-confirmation.html'));
    porto.appendTpl($keyErrorTemplate, porto.extension.getURL('common/ui/_popup-error.html'));
    porto.appendTpl($keySuccessTemplate, porto.extension.getURL('common/ui/_popup-success.html'));

    $('.bp-generate-key-modal').on('click', generateKeyModal);
    $('.bp-import-key-modal').on('click', showImportKeyModal);
    $('.bp-export-keys-modal').on('click', showExportKeysModal);

    options.registerL10nMessages(
      [
        'keygrid_key_not_expire', 'keygrid_delete_confirmation', 'keygrid_primary_label',
        'key_set_as_primary'
      ]);
    options.registerL10nMessages(
      [
        "key_import_error", "key_import_invalid_text", "key_import_exception",
        "alert_header_warning", "alert_header_success"
      ]);

    porto.extension.sendMessage({
      event: 'get-active-keyring'
    }, function(data) {
      keyringId = data || porto.LOCAL_KEYRING_ID;
      options.keyringId = keyringId;

      options.pgpModel('getManagementList', function(err, data) {
        if (qs.hasOwnProperty('peer')) {
          populatePeerList(data, decodeURIComponent(decodeURI(qs.peer)));
        }
        else {
          populatePeerList(data);
        }
      });
    });
  }

  function generateKeyModal() {
    console.log('generate key modal');
    swal2({
      html: $generateKeyTemplate.html(),
      showCancelButton: false,
      showConfirmButton: false,
      closeOnConfirm: false,
      width: 320,
      animation: false,
      buttonsStyling: false
    }, function(isConfirm) {
      if (isConfirm) {
        swal2.disableButtons();
        triggerGenerate();
      }
    });

    var triggerAction = function(e) {
      if (e.which == 13) {
        $('#email').unbind("keypress", triggerAction);
        swal2.disableButtons();
        triggerGenerate();
        return false;
      }
    };

    var $emailField = $('#email');
    $emailField.focus();
    $emailField.bind('keypress', triggerAction);
  }

  function triggerGenerate() {
    var parameters = {};
    parameters.algorithm = $('#algorythm').val();
    parameters.numBits = $('#keysize').val();
    var newUser = {fullName: $('#name').val(), email: $('#email').val()};
    parameters.userIds = [newUser];
    parameters.passphrase = $('#password').val();
    parameters.confirm = $('#password-confirm').val();

    porto.extension.sendMessage({event: 'get-user-ids'}, function(data) {
      console.log('User ids');
      console.log(data);
      var usersArr = data.users;
      var exists = false;
      for (var inx in usersArr) {
        if (usersArr.hasOwnProperty(inx) && usersArr[inx].email === newUser.email) {
          exists = true;
          break;
        }
      }
      var errorMsgEmail = $("#error-msg");
      if (exists) {
        errorMsgEmail.text("Email already exists.");
        errorMsgEmail.show();
        swal2.enableButtons();
        return;
      }
      errorMsgEmail.hide();
      try {
        validateFields(parameters);
      }
      catch (error) {
        swal2.enableButtons();
        return;
      }
      try {
        generateKey(parameters)
          .then(function(result) {
            //success
            swal2.enableButtons();
            options.event.triggerHandler('keygrid-reload');
            swal2({
              title: "Generate key-pair",
              text: "Key pair successfully generated!",
              type: "success",
              customClass: "b-success",
              timer: 1500

            }, function() {
              options.keyring('getKeys').then(fillKeysTable);
              $('#key-types').change();
              //populatePeerList(peersMetadata);
            });
          })
          .catch(function(error) {
            //failed
            console.error('generateKey() options.keyring(generateKey)', error);
            console.error(error);
            swal2({
              title: "Oops,",
              text: error.message,
              type: "error",
              customClass: "b-warning",
              timer: 1500
            });
          })
          .then(function() {
            console.log('Generation completed!');
          });
      }
      catch (error) {
        swal2({
          title: "Oops,", text: error.message, type: "error", customClass: "b-warning", timer: 1500
        });
      }
    });
  }

  function validateFields(parameters) {
    var errorMsgEmail = $("#error-msg");

    errorMsgEmail.hide();

    var passwordConfirm = parameters.confirm;
    if (passwordConfirm !== parameters.passphrase) {
      errorMsgEmail.text("Passwords do not match.");
      errorMsgEmail.show();
      throw Error("Passwords do not match.");
    }
    if (!validateEmail(parameters.userIds[0].email)) {
      errorMsgEmail.text("Invalid e-mail format");
      errorMsgEmail.show();
      throw Error("Invalid e-mail format");
    }
    if (!parameters.userIds[0].email) {
      errorMsgEmail.text("Email cannot be empty");
      errorMsgEmail.show();
      throw Error("Email cannot be empty");
    }
    if (!parameters.userIds[0].fullName) {
      parameters.userIds[0].fullName = parameters.userIds[0].email.split('@')[0];
      //throw Error("Username cannot be empty");
    }
    if (!passwordConfirm) {
      //throw Error("Password should not be empty");
    }
  }

  function generateKey(parameters) {
    return new Promise(function(resolve, reject) {
      resolve(options.keyring('generateKey', [parameters]));
    });
  }

  function validateEmail(email) {
    var re = /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
    return re.test(email);
  }

  function populatePeerList(peers, preselect) {
    peersMetadata = [];
    console.log('Management hosts');
    console.log(peers);

    var $peersContainer = $('#key-types');
    $peersContainer.children().remove();

    var allElem = $.parseHTML('<option></option>');
    $(allElem).text("All keys");
    $(allElem).attr('data-site', 'all');
    $peersContainer.append(allElem);

    if (peers) {
      peers.forEach(function(peer) {
        if (!peer || !peer.site || !peer.keys) {
          return;
        }

        var subkeyElem = $.parseHTML('<option></option>');
        $(subkeyElem).text(peer.site);
        $(subkeyElem).attr('data-site', peer.site);
        $(subkeyElem).attr('data-keys', JSON.stringify(peer.keys));
        $peersContainer.append(subkeyElem);

        peersMetadata.push(peer);
        if (peer.keys) {
          peer.keys.forEach(function(keyFingerprint) {
            if (keyPeerMap[keyFingerprint]) {
              keyPeerMap[keyFingerprint].push(peer);
            }
            else {
              keyPeerMap[keyFingerprint] = [peer];
            }
          });
        }
      });
    }
    console.log(keyPeerMap);

    $peersContainer.on('change', function() {
      var $element = $(this).find(':selected');
      var site = $element.attr('data-site');
      var keys = $element.attr('data-keys');
      if (typeof keys !== typeof undefined && keys !== false) {
        keys = JSON.parse(keys);
      }
      else {
        keys = null;
      }
      options.keyring('getKeys').then(function(data) {
        if (site === 'all') {
          fillKeysTable(data);
        }
        else {
          fillKeysTable(data, keys);
        }
      });
    });
    if (preselect) {
      $peersContainer.find('option[data-site="' + preselect + '"]').prop('selected', true);
    }
    $peersContainer.change();
  }

  function fillKeysTable(keys, filter) {
    var $tableBody = $('.b-main-table .b-main-table-body');
    $tableBody.empty(
      $('.js-empty-table').css({'display': 'none'}),
      $('.b-main-table .b-main-table-body').css({'display': 'table-row-group'})
    );
    if (keys && keys.length <= 0) {
      $('.js-empty-table').css({'display': 'table-row'});
      $('.b-main-table .b-main-table-body').css({'display': 'none'});
      generateKeyModal();
    }
    keys.forEach(function(key) {
      if (filter) {
        if (!filter.includes(key.fingerprint)) {
          return;
        }
      }
      var tableRow = $.parseHTML(keyTemplate);
      $(tableRow).attr('data-keytype', key.type);
      $(tableRow).attr('data-keyguid', key.guid);
      $(tableRow).attr('data-keyid', key.id);
      $(tableRow).attr('data-keyname', key.name);
      $(tableRow).attr('data-keyemail', key.email);
      $(tableRow).attr('data-keyalgorithm', key.algorithm);
      $(tableRow).attr('data-keylength', key.bitLength);
      $(tableRow).attr('data-keycreationdate', key.crDate);
      $(tableRow).attr('data-keyexpirationdate', key.exDate);
      $(tableRow).attr('data-keyfingerprint', key.fingerprint);
      $(tableRow).attr('data-keyvalid', key.validity);
      $(tableRow).attr('data-keyisprimary', false);

      var style = 'style="cursor: default;"';
      if (key.type === 'private') {
        $(tableRow).find('td:nth-child(1)').append(
          '<i class="b-icon b-icon_key-pair"' + style + '></i>');
      }
      else {
        $(tableRow).find('td:nth-child(1)').append(
          '<i class="b-icon b-icon_key"' + style + '></i>');
      }

      $(tableRow).find('td.key-name').text(key.name);
      //if (options.primaryKeyId === key.id) {
      //  $(tableRow).attr('data-keyisprimary', true);
      //  $(tableRow).find('td:nth-child(2)').append('&nbsp;&nbsp;<span class="label label-warning"
      // data-l10n-id="keygrid_primary_label"></span>'); }
      $(tableRow).find('td.key-email').text(key.email);
      $(tableRow).find('td.key-id').text(key.id);

      var mgmts = null;
      if (keyPeerMap[key.fingerprint]) {
        mgmts = $('<a href="managements.html?fp=' +
                  key.fingerprint +
                  '"><span class="b-tags b-tags_blue" ' +
                  '>Peers: ' +
                  keyPeerMap[key.fingerprint].length +
                  '</span></a>');
      }
      else {
        mgmts = $('<span class="b-tags b-tags_blue"' + style + '>Peers: 0</span>');
      }

      $(tableRow).find('td:nth-child(5)').append(mgmts);

      if (key.type === 'private') {
        $(tableRow).find('.publicKey').remove();
      }
      else {
        $(tableRow).find('.keyPair').remove();
      }

      $(tableRow).find('td.key-export').on('click', initExportTab);
      $(tableRow).find('td.key-info').on('click', showKeyInfo);
      $(tableRow).find('td.key-delete').on('click', function() {
        var $entryForRemove = $(this).parent();
        console.log($entryForRemove.attr('data-keyguid'));

        swal2({
          html: $keyConfirmationTemplate.html(),
          showCancelButton: false,
          showConfirmButton: false,
          closeOnConfirm: false,
          width: 250,
          animation: false,
          buttonsStyling: false
        }, function() {
          options.keyring('removeKey',
            [$entryForRemove.attr('data-keyguid'), $entryForRemove.attr('data-keytype')]);
          swal2({
            title: "Deleted.",
            text: "Key successfully deleted!",
            timer: 1500,
            type: "success",
            customClass: "b-success"
          }, function() {
            options.keyring('getKeys').then(fillKeysTable);
          });
        });
      });

      $tableBody.append(tableRow);
    });
  }

  function showKeyInfo() {
    var $keyData = $(this).parent();
    console.log('key info clicked');

    swal2({
      html: $keyInfoTemplate.html(),
      showCloseButton: false,
      showConfirmButton: false,
      animation: false,
      //width: 350
    });

    options.keyring('getKeyDetails', [$keyData.attr('data-keyguid')])
           .then(function(result) {
             console.log('key details');
             var details = result;
             initSubKeyTab(details);
             initUserIdsTab(details);
           });

    $('#keytype').val($keyData.attr('data-keytype'));
    $('#keyguid').val($keyData.attr('data-keyguid'));
    $('#keyid').val($keyData.attr('data-keyid'));
    $('#keyname').val($keyData.attr('data-keyname'));
    $('#keyemail').val($keyData.attr('data-keyemail'));
    $('#keyalgorithm').val($keyData.attr('data-keyalgorithm'));
    $('#keylength').val($keyData.attr('data-keylength'));
    $('#keycreationdate').val($keyData.attr('data-keycreationdate').substr(0, 10));

    if ($keyData.attr('data-keyexpirationdate') !== 'false') {
      $('#keyexpirationdate').val($keyData.attr('data-keyexpirationdate'));
    }
    else {
      $('#keyexpirationdate').val('The key does not expire');
    }
    $('#keyfingerprint').val($keyData.attr('data-keyfingerprint'));
    $('#keyvalid').val($keyData.attr('data-keyvalid'));
  }

  function initSubKeyTab(details) {
    var $subkeyContainer = $('#subkey_collection');
    $subkeyContainer.children().remove();
    for (var inx = 0; inx < details.subkeys.length; inx++) {
      var subkey = details.subkeys[inx];
      var subkeyElem = $.parseHTML('<option></option>');
      $(subkeyElem).attr('id', subkey.id);
      $(subkeyElem).text(subkey.id);
      $(subkeyElem).attr('data-algorithm', subkey.algorithm);
      $(subkeyElem).attr('data-length', subkey.bitLength);
      $(subkeyElem).attr('data-crdate', subkey.crDate.substr(0, 10));
      $(subkeyElem).attr('data-fingerprint', subkey.fingerprint);
      $(subkeyElem).attr('data-exdate', options.l10n.keygrid_key_not_expire);
      var expDate = subkey.exDate;
      if (expDate !== false) {
        $(subkeyElem).attr('data-exdate', expDate.substr(0, 10));
      }
      else {
        $(subkeyElem).attr('data-exdate', options.l10n.keygrid_key_not_expire);
      }
      $subkeyContainer.append(subkeyElem);
    }

    $subkeyContainer.on('change', function() {
      var $element = $(this).find(':selected');
      $('#subkey_algorithm').val($element.attr('data-algorithm'));
      $('#subkey_length').val($element.attr('data-length'));
      $('#subkey_creationdate').val($element.attr('data-crdate'));
      $('#subkey_expirationdate').val($element.attr('data-exdate'));
      $('#subkey_fingerprint').val($element.attr('data-fingerprint'));
    });
    $subkeyContainer.change();
  }

  function initUserIdsTab(details) {
    var $userContainer = $('#user_collection');
    details.users.forEach(function(userKey, index) {
      var userElem = $.parseHTML('<option></option>');
      $(userElem).attr('data-userid', userKey.userID);
      $(userElem).attr('value', userKey.userID);
      $(userElem).text(userKey.userID);
      $(userElem).attr('data-signatures', JSON.stringify(userKey.signatures));
      $userContainer.append(userElem);
    });

    $userContainer.on('change', function() {
      var $signaturesBody = $('#content3').find('.signature-list');
      $signaturesBody.empty();

      var $element = $(this).find(':selected');
      if (!$element || !$element.attr('data-signatures')) {
        return;
      }
      var signatures = JSON.parse($element.attr('data-signatures'));
      signatures.forEach(function(signature, index) {
        var dataRow = $.parseHTML("<tr>\
          <td></td>\
          <td></td>\
        <td></td>\
        </tr>");
        $(dataRow).find('td:nth-child(1)').text(signature.signer);
        $(dataRow).find('td:nth-child(2)').text(signature.id);
        $(dataRow).find('td:nth-child(3)').text(signature.crDate.substr(0, 10));
        $signaturesBody.append(dataRow);
      });
    });

    $userContainer.change();
  }

  function createFile(filename, content) {
    // release previous url
    if (typeof safari !== 'undefined') {
      $.fileDownload('data:application/pgp-keys;charset=utf-8,' + encodeURIComponent(content));
    }
    else {
      if (keyFile) {
        window.URL.revokeObjectURL(keyFile);
      }
      // create new
      var blob = new Blob([content], {type: 'application/pgp-keys'});
      //saveAs(blob, filename);
      keyFile = window.URL.createObjectURL(blob);
      var download = $('.bp-keypair-export');
      download.attr('download', filename)
              .attr('href', keyFile);
      download.get(0).click();
    }
  }

  function initExportTab() {
    var $keyData = $(this).parent();
    var keyguid = $keyData.attr('data-keyguid');

    options.keyring('getArmoredKeys', [[keyguid], {pub: true, priv: true, all: false}])
           .then(function(result) {
             var keyPair = result[0].armoredPublic + '\n' + result[0].armoredPrivate;
             var filename = $keyData.attr('data-keyname') + '_all.asc';
             swal2({
               html: $keyExportTemplate.html(),
               showCancelButton: false,
               animation: false,
               //width: 320,
               showConfirmButton: false,
               closeOnConfirm: false
             }, function() {
               createFile($('.bp-export-filename').val(), keyPair);
               swal2.closeModal();
             });
             $('.bp-export-clipboard').text(keyPair);
             var $filename = $('.bp-export-filename');
             $filename.val(filename);
             $filename.focus();
           });
  }

  function showExportKeysModal() {
    options
      .keyring('getArmoredKeys', [[], {pub: true, priv: true, all: true}])
      .then(function(result) {
        var hasPrivate = false;
        var allKeys = result.reduce(function(prev, curr) {
          if (curr.armoredPublic) {
            prev += '\n' + curr.armoredPublic;
          }
          if (curr.armoredPrivate) {
            hasPrivate = true;
            prev += '\n' + curr.armoredPrivate;
          }
          return prev;
        }, '');
        swal2({
          html: $keyExportTemplate.html(),
          showCancelButton: false,
          animation: false,
          //width: 320,
          showConfirmButton: false,
          closeOnConfirm: false
        }, function() {
          createFile($('.bp-export-filename').val(), allKeys);
          swal2.closeModal();
        });
        $('.bp-export-clipboard').text(allKeys);
        var $filename = $('.bp-export-filename');
        $filename.val('all.asc');
        $filename.focus();
      });
  }

  function onChangeFile(event) {
    var reader = new FileReader();
    var file = event.target.files[0];
    reader.onloadend = function(ev) {
      $('.bp-import-keys').val(ev.target.result);
    };
    reader.readAsText(file);
  }

  function showImportKeyModal() {
    console.log('key import dialog opened');
    swal2({
      html: $keyImportTemplate.html(),
      showCancelButton: false,
      showConfirmButton: false,
      animation: false,
      //width: 320,
      closeOnConfirm: false
    }, function() {
      swal2.disableButtons();
      onImportKey(function(result) {
        if (result.type === 'error') {
          swal2({
            html: $keyErrorTemplate,
            showCancelButton: false,
            showConfirmButton: false,
            width: 250,
            buttonsStyling: false,
            animation: false,
            closeOnConfirm: true
          });
        }
        else {
          swal2({
            title: "Success",
            text: "Successfully imported key!",
            timer: 1500,
            type: "success",
            customClass: "b-success"
          }, function() {
            options.keyring('getKeys').then(fillKeysTable);
          });
        }
      });
    });
    $('#uploadBtn').change(onChangeFile);
    $('#keyContent').focus();
  }

  function onImportKey(callback) {

    var publicKeyRegex = /-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]+?-----END PGP PUBLIC KEY BLOCK-----/g;
    var privateKeyRegex = /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]+?-----END PGP PRIVATE KEY BLOCK-----/g;

    var keyText = $('.bp-import-keys').val();

    // find all public and private keys in the textbox
    var publicKeys = keyText.match(publicKeyRegex);
    var privateKeys = keyText.match(privateKeyRegex);

    var keys = [];

    if (publicKeys) {
      publicKeys.forEach(function(pub) {
        pub = porto.util.decodeQuotedPrint(pub);
        keys.push({type: 'public', armored: pub});
      });
    }

    if (privateKeys) {
      privateKeys.forEach(function(priv) {
        priv = porto.util.decodeQuotedPrint(priv);
        keys.push({type: 'private', armored: priv});
      });
    }

    if (keys.length === 0) {
      callback({type: 'error'});
      return;
    }

    options
      .keyring('importKeys', [keys])
      .then(function(result) {
        var success = false;
        result.forEach(function(imported) {
          var heading;
          var type = imported.type;
          switch (imported.type) {
            case 'success':
              heading = options.l10n.alert_header_success;
              success = true;
              break;
            case 'warning':
              heading = options.l10n.alert_header_warning;
              break;
            case 'error':
              heading = options.l10n.key_import_error;
              type = 'danger';
              break;
          }
        });
        if (callback) {
          callback(result);
        }
      })
      .catch(function(error) {
        if (callback) {
          callback({type: 'error'});
        }
      });
  }

  options.keyringId = keyringId;
  options.event.on('ready', init);

}(options));
