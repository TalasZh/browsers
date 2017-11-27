/**
 * Created by talas on 1/22/16.
 */
/**
 * Listens for events from options UI in sandbox, forwards requests to pgpModel.js
 */

'use strict';

var porto = porto || null;
var options = {};

(function(exports, $) {
  // event controller
  var event = $('<div/>');
  var l10n = {};
  var keyringId = null;

  function init() {
    if (document.body.dataset.porto) {
      return;
    }

    //console.log(porto.l10n);
    document.body.dataset.porto = true;
    initMessageListener();

    event.triggerHandler('ready');

    porto.extension.sendMessage({
      event: 'get-version'
    }, function(version) {
      $('#version').text('v' + version);
    });
  }

  function initMessageListener() {
    porto.extension.onMessage.addListener(function(request, sender, sendResponse) {
      return handleRequests(request, sender, sendResponse);
    });
  }

  function handleRequests(request, sender, sendResponse) {
    switch (request.event) {
      case 'add-watchlist-item':
        $('#settingsButton').trigger('click');
        $('#watchListButton').trigger('click');
        options.addToWatchList(request.site);
        break;
      case 'reload-options':
        if (request.hash === '#showlog') {
          $('#settingsButton').trigger('click');
          $('#securityLogButton').trigger('click');
        }
        else {
          options.reloadOptions();
        }
        break;
      case 'import-key':
        $('#keyringButton').trigger('click');
        $('#importKeyButton').trigger('click');
        options.importKey(request.armored, function(result) {
          sendResponse({
            result: result, id: request.id
          });
        });
        return true;
      default:
        // TODO analyse message events
        //console.log('unknown event:', request);
    }
  }

  function getAllKeyringAttr() {
    return new Promise(function(resolve, reject) {
      porto.extension.sendMessage({
        event: 'get-all-keyring-attr'
      }, function(data) {
        if (data.error) {
          reject(data.error);
        }
        else {
          resolve(data.result);
        }
      });
    });
  }

  function pgpModel(method, args, callback) {
    if (typeof args === 'function') {
      callback = args;
      args = undefined;
    }
    porto.extension.sendMessage({
      event: 'pgpmodel', method: method, args: args
    }, function(data) {
      callback(data.error, data.result);
    });
  }

  function keyring(method, args) {
    return new Promise(function(resolve, reject) {
      porto.extension.sendMessage({
        event: 'keyring', method: method, args: args, keyringId: options.keyringId
      }, function(data) {
        if (!data) {
          reject("Error");
        }
        else if (data.error) {
          reject(data.error);
        }
        else {
          resolve(data.result);
        }
      });
    });
  }

  function copyToClipboard(text) {
    var copyFrom = $('<textarea />');
    $('body').append(copyFrom);
    copyFrom.hide();
    copyFrom.text(text);
    copyFrom.select();
    document.execCommand('copy');
    copyFrom.remove();
  }

  function getL10nMessages(ids, callback) {
    porto.l10n.getMessages(ids, callback);
  }

  function registerL10nMessages(ids) {
    ids.forEach(function(id) {
      exports.l10n[id] = true;
    });
  }

  function reloadOptions() {
    document.location.reload();
  }

  exports.reloadOptions = reloadOptions;
  exports.getAllKeyringAttr = getAllKeyringAttr;

  exports.pgpModel = pgpModel;
  exports.keyring = keyring;
  exports.copyToClipboard = copyToClipboard;
  exports.getL10nMessages = getL10nMessages;
  exports.registerL10nMessages = registerL10nMessages;
  exports.keyringId = keyringId;

  exports.event = event;
  exports.l10n = l10n;

  // Update visibility of setup alert box
  options.event.on('keygrid-reload', function() {
    options.keyring('getPrivateKeys')
           .then(function(result) {
             if (!result.length) {
               $('.keyring_setup_message').addClass('active');
             }
             else {
               $('.keyring_setup_message').removeClass('active');
             }
           });
  });

  $(document).ready(init);

}(options, jQuery));
