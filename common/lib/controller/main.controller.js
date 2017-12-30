'use strict';

define(function(require, exports, module) {

  var porto = require('../../porto-lib').porto;
  var model = require('../pgpModel');
  var keyring = require('../keyring');
  var defaults = require('../defaults');
  var prefs = require('../prefs');
  var sub = require('./sub.controller');
  var openpgp = require('openpgp');
  var uiLog = require('../uiLog');

  sub.factory.register('eFrame', require('./encrypt.controller').EncryptController);
  sub.factory.register('imFrame', require('./import.controller').ImportController);
  sub.factory.register('importKeyDialog', require('./import.controller').ImportController);
  sub.factory.register('mainCS', require('./mainCs.controller').MainCsController);
  sub.factory.register('pwdDialog', require('./pwd.controller').PwdController);
  sub.factory.register('syncHandler', require('./sync.controller').SyncController);
  sub.factory.register('keyGenCont', require('./privateKey.controller').PrivateKeyController);
  sub.factory.register('keyGenDialog', require('./privateKey.controller').PrivateKeyController);
  sub.factory.register('keyBackupCont', require('./privateKey.controller').PrivateKeyController);
  sub.factory.register('keyBackupDialog', require('./privateKey.controller').PrivateKeyController);
  sub.factory.register('restoreBackupCont',
    require('./privateKey.controller').PrivateKeyController);
  sub.factory.register('restoreBackupDialog',
    require('./privateKey.controller').PrivateKeyController);

  // recipients of encrypted mail
  var scannedHosts = [];
  var specific = {};

  function extend(obj) {
    specific.initScriptInjection = obj.initScriptInjection;
    specific.activate = obj.activate;
    specific.deactivate = obj.deactivate;
  }

  function handleMessageEvent(request, sender, sendResponse) {
    //console.log('controller: handleMessageEvent', request);
    if (request.api_event) {
      return;
    }
    //console.log('main.controller::handleMessageEvent');
    //console.log(request.event);
    //console.trace();
    switch (request.event) {
      case 'pgpmodel':
        return methodEvent(model, request, sendResponse);
      case 'keyring':
        return methodEvent(keyring.getById(request.keyringId), request, sendResponse);
      case 'browser-action':
        onBrowserAction(request.action);
        break;
      case 'iframe-scan-result':
        scannedHosts = scannedHosts.concat(request.result);
        break;
      case 'set-management-list':
        model.setManagementList(request.data);
        break;
      case 'set-watch-list':
        model.setWatchList(request.data);
        specific.initScriptInjection();
        break;
      case 'get-all-keyring-attr':
        try {
          sendResponse({result: keyring.getAllKeyringAttr()});
        }
        catch (e) {
          sendResponse({error: e});
        }
        break;
      case 'set-keyring-attr':
        keyring.setKeyringAttr(request.keyringId, request.keyringAttr);
        break;
      case 'get-active-keyring':
        sendResponse(sub.getActiveKeyringId());
        break;
      case 'delete-keyring':
        if (request.keyringId !== porto.LOCAL_KEYRING_ID) {
          keyring.deleteKeyring(request.keyringId);
          sub.setActiveKeyringId(porto.LOCAL_KEYRING_ID);
        }
        else {
          console.log('Keyring could not be deleted');
        }
        break;
      case 'send-by-mail':
        var link = encodeURI('mailto:?subject=Public OpenPGP key of ');
        link += encodeURIComponent(request.message.data.name);
        link += '&body=' + encodeURIComponent(request.message.data.armoredPublic);
        link += encodeURIComponent('\n*** exported with https://subutai.io ***');
        porto.tabs.create(link);
        break;
      case 'get-prefs':
        request.prefs = prefs.data();
        sendResponse(request);
        break;
      case 'set-prefs':
        prefs.update(request.data);
        sendResponse(true);
        break;
      case 'get-ui-log':
        request.secLog = uiLog.getAll();
        request.secLog = request.secLog.slice(request.securityLogLength);
        sendResponse(request);
        break;
      case 'get-security-background':
        sendResponse({
          color: prefs.data().security.secureBgndColor,
          iconColor: prefs.data().security.secureBgndIconColor,
          angle: prefs.data().security.secureBgndAngle,
          scaling: prefs.data().security.secureBgndScaling,
          width: prefs.data().security.secureBgndWidth,
          height: prefs.data().security.secureBgndHeight,
          colorId: prefs.data().security.secureBgndColorId
        });
        break;
      case 'get-version':
        sendResponse(defaults.getVersion());
        break;
      case 'get-version-popup':
        request.version = defaults.getVersion();
        sendResponse(request);
        break;
      case 'activate':
        postToNodes(sub.getByMainType('mainCS'), {event: 'on'});
        specific.activate();
        prefs.update({main_active: true});
        generateKeyIfAny();
        break;
      case 'deactivate':
        postToNodes(sub.getByMainType('mainCS'), {event: 'off'});
        specific.deactivate();
        reloadFrames();
        prefs.update({main_active: false});
        break;
      case 'open-popup':
        porto.windows.openPopup(request.url);
        break;
      case 'associate-peer-key':
        associatePeerWithKey(request);
        break;
      case 'porto-send-request':
        porto.request.send(request.params).then(function(response) {
          sendResponse(response);
        }).catch(function(err) {
          sendResponse({error: err});
        });
        return true;
      case 'porto-socket-init':
        porto.request.ws.init(request.url, request.protocol);
        porto.request.ws.connect();
        break;
      case 'porto-socket-disconnect':
        porto.request.ws.disconnect();
        break;
      case 'porto-socket-send':
        porto.request.ws.send(request.msg, function(response) {
          sendResponse(response);
        });
        return true;
      case 'popup-socket-send':
        porto.request.ws.send(request.msg, function(response) {
          request.response = response;
          sendResponse(request);
        });
        return true;
      case "popup-active-tab":
        porto.tabs.getActive(function(tab) {
          request.activeTab = {id: tab.id};
          sendResponse(request);
        });
        return true;
      case "popup-message-tab":
        porto.tabs.sendMessage(request.tab, request.msg, function(response) {
          request.response = response;
          sendResponse(request);
        });
        return true;
      case 'load-local-content':
        porto.data.load(request.path).then(function(content) {
          sendResponse(content);
        });
        return true;
      case "get-user-ids":
        var localKeyring = keyring.getById(porto.LOCAL_KEYRING_ID);
        var keys = localKeyring.getPrivateKeys();
        var usersArr = keys.map(function(key) {
          return {id: key.id, name: key.name, email: key.email, fingerprint: key.fingerprint};
        });
        sendResponse({users: usersArr});
        break;
      case "open-tab":
        porto.tabs.create(request.link);
        break;
      case 'gen-hash':
        sendResponse(genHash());
        break;
      default:
        console.log('unknown event:', request);
    }
  }

  function genHash() {
    var result = '';
    var buf = new Uint16Array(6);
    if (typeof window !== 'undefined') {
      window.crypto.getRandomValues(buf);
    }
    else {
      porto.util.getDOMWindow().crypto.getRandomValues(buf);
    }
    for (var i = 0; i < buf.length; i++) {
      result += buf[i].toString(16);
    }
    return result;
  }

  function methodEvent(thisArg, request, sendResponse) {
    //console.log('controller: methodEvent', request);
    var response = {};
    var callback = function(error, result) {
      sendResponse({error: error, result: result});
    };
    request.args = request.args || [];
    if (!Array.isArray(request.args)) {
      request.args = [request.args];
    }
    request.args.push(callback);
    try {
      response.result = thisArg[request.method].apply(thisArg, request.args);
    }
    catch (e) {
      console.log('error in method ' + request.method + ': ', e);
      response.error = e;
    }
    if (response.result !== undefined || response.error) {
      sendResponse({error: response.error, result: response.result});
    }
    else {
      // important to return true for async calls, otherwise Chrome does not handle sendResponse
      return true;
    }
  }

  function destroyNodes(subControllers) {
    postToNodes(subControllers, {event: 'destroy'});
  }

  function postToNodes(subControllers, msg) {
    subControllers.forEach(function(subContr) {
      subContr.ports[subContr.mainType].postMessage(msg);
    });
  }

  function reloadFrames(main) {
    if (main) {
      destroyNodes(sub.getByMainType('mainCS'));
    }
    // close frames
    destroyNodes(sub.getByMainType('dFrame'));
    destroyNodes(sub.getByMainType('vFrame'));
    destroyNodes(sub.getByMainType('eFrame'));
    destroyNodes(sub.getByMainType('imFrame'));
  }

  function onBrowserAction(action) {
    switch (action) {
      case 'reload':
        reloadFrames();
        break;
      case 'options':
        loadOptions('#keyring');
        break;
      case 'showlog':
        loadOptions('#securityLog');
        break;
      default:
        console.log('unknown browser action');
    }
  }

  function loadOptions(hash) {
    porto.tabs.loadOptionsTab(hash, function(old, tab) {
      if (old) {
        porto.tabs.sendMessage(tab, {
          event: 'reload-options',
          hash: hash
        });
      }
    });
  }

  function getWatchListFilterURLs() {
    var result = [];
    model.getWatchList().forEach(function(site) {
      site.active && site.frames && site.frames.forEach(function(frame) {
        frame.scan && result.push(frame.frame);
      });
    });
    if (result.length !== 0) {
      result = porto.util.sortAndDeDup(result);
    }
    return result;
  }

  function associatePeerWithKey(msg) {
    //console.log('cookie received');
    //console.log(msg);
    if (msg.su_fingerprint) {
      //TODO update watchlist. 1.Check for new management existence, 2. if any add else do nothing
      var localKeyring = keyring.getById(sub.getActiveKeyringId());
      var keys = localKeyring.getPrivateKeys();
      for (var inx = 0; inx < keys.length; inx++) {
        if (keys[inx].fingerprint === msg.su_fingerprint) {
          var website = {
            site: msg.url, keys: [msg.su_fingerprint]
          };
          console.log(website);
          var peers = model.getManagementList();
          var siteExist = false;
          if (peers) {
            peers.forEach(function(peer, index) {
              if (peer.site === website.site) {
                siteExist = true;
                var keyExist = false;
                if (peer.keys) {
                  peer.keys.forEach(function(keyEntry, index) {
                    if (keyEntry === msg.su_fingerprint) {
                      keyExist = true;
                    }
                  });
                }
                else {
                  peer.keys = [];
                }
                if (!keyExist) {
                  peer.keys.push(msg.su_fingerprint);
                }
              }
            });
          }
          else {
            peers = [];
          }
          if (!siteExist) {
            peers.push(website);
            //console.log('reinitializing content scripts...');
          }
          model.setManagementList(peers);
        }
      }
    }
  }

  function generateKeyIfAny() {
    //console.error("Generating default key pair.");
    var activeKeyring = keyring.getById(sub.getActiveKeyringId());
    var keys = activeKeyring.keyring.getAllKeys();
    if (keys && keys.length <= 0) {
      loadOptions();
    }
  }

  exports.handleMessageEvent = handleMessageEvent;
  exports.onBrowserAction = onBrowserAction;
  exports.extend = extend;
  exports.getWatchListFilterURLs = getWatchListFilterURLs;

});
