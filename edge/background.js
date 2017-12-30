'use strict';

var porto = porto || null;

requirejs.config({
  baseUrl: 'lib', paths: {
    jquery: '../common/dep/jquery.min',
    openpgp: '../dep/openpgp',
    porto: '../common/ui/porto',
    parser_rules: '../common/dep/wysihtml5/js/advanced_parser_rules',
    dompurify: '../common/dep/purify'
  }, shim: {
    'porto': {
      exports: 'porto'
    }, 'parser_rules': {
      exports: 'wysihtml5ParserRules'
    }
  }
});

define([
    "common/controller/main.controller", "common/controller/sub.controller", "common/pgpModel",
    "common/keyring", "openpgp", "jquery"
  ],
  function(controller, subController, model, keyring, openpgp, $) {

    // inject content script only once per time slot
    var injectTimeSlot = 600;
    // injection time slot currently open
    var injectOpen = true;
    // optimized cs injection variant, bootstrap code injected that loads cs
    var injectOptimized = true;
    // keep reloaded iframes
    var frameHosts = [];
    // content script coding as string
    var csCode = '';

    // framestyles as string
    var framestyles = '';

    function init() {
      controller.extend({
        initScriptInjection: initScriptInjection, activate: function() {
        }, deactivate: function() {
        }
      });
      model.init();
      migrate();
      initConnectionManager();
      //initContextMenu();
      initScriptInjection();
      initMessageListener();
      controller.handleMessageEvent({event: 'activate'});
    }

    function initConnectionManager() {
      // store incoming connections by name and id
      chrome.runtime.onConnect.addListener(function(port, sender, sendResponse) {
        console.log('ConnectionManager: onConnect:', port);
        console.log(sender);
        subController.addPort(port);
        port.onMessage.addListener(subController.handlePortMessage);
        // update active ports on disconnect
        port.onDisconnect.addListener(subController.removePort);
      });
    }

    function initMessageListener() {
      chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        switch (request.event) {
          // for content scripts requesting code
          case 'get-cs':
            sendResponse({code: csCode});
            break;
          default:
            return controller.handleMessageEvent(request, sender, sendResponse);
        }
      });
    }

    function initContextMenu() {
      chrome.contextMenus.create({
        "title": "Encrypt", "contexts": ["editable"], "onclick": onContextMenuEncrypt
      });
    }

    function onContextMenuEncrypt(info) {
      //console.log(info);
      chrome.tabs.getSelected(null, function(tab) {
        chrome.tabs.sendMessage(tab.id, {event: "context-encrypt"});
      });
    }

    function loadContentCode() {
      if (injectOptimized && csCode === '') {
        return porto.data.load('common/ui/inline/porto-cs.js').then(function(csmSrc) {
          return porto.data.load('common/dep/jquery.min.js').then(function(jquerySrc) {
            return porto.data.load('common/scripts/libs/swal2.js').then(
              function(sweetalertSrc) {
                csCode = jquerySrc + '\n' + sweetalertSrc + '\n' + csmSrc;
              });
          });
        });
      }
      return Promise.resolve();
    }

    function loadFramestyles() {
      // load framestyles and replace path
      if (framestyles === '') {
        return porto.data.load('common/ui/inline/framestyles.css').then(function(data) {
          return porto.data.load('common/css/libs/swal2.css').then(function(data2) {
            framestyles = data2 + '\n' + data;
            var token = /\.\.\/\.\./g;
            framestyles = framestyles.replace(token, chrome.runtime.getURL('common'));
          });
        });
      }
      return Promise.resolve();
    }

    function initScriptInjection() {
      loadContentCode()
        .then(loadFramestyles)
        .then(function() {
          var filterURL = controller.getWatchListFilterURLs();

          filterURL = filterURL.map(function(host) {
            return '*://' + host + '/*';
          });

          injectOpenTabs(filterURL)
            .then(function() {
              var filterType = ["main_frame", "sub_frame"];
              var requestFilter = {
                urls: filterURL, types: filterType
              };
              chrome.webRequest.onCompleted.removeListener(watchListRequestHandler);
              if (filterURL.length !== 0) {
                chrome.webRequest.onCompleted.addListener(watchListRequestHandler, requestFilter);
              }
            });
        });
    }

    function injectOpenTabs(filterURL) {
      return new Promise(function(resolve, reject) {
        // query open tabs
        porto.tabs.query(filterURL, function(tabs) {
          tabs.forEach(function(tab) {
            //console.log('tab', tab);
            chrome.tabs.executeScript(tab.id, {code: csBootstrap(), allFrames: true}, function() {
              chrome.tabs.insertCSS(tab.id, {code: framestyles, allFrames: true});
            });
          });
          resolve();
        });
      });
    }

    function watchListRequestHandler(details) {
      if (details.tabId === -1) {
        return;
      }
      // store frame URL
      frameHosts.push(model.getHost(details.url));
      if (injectOpen || details.type === "main_frame") {
        setTimeout(function() {
          if (frameHosts.length === 0) {
            // no requests since last inject
            return;
          }
          if (injectOptimized) {
            chrome.tabs.executeScript(details.tabId, {code: csBootstrap(), allFrames: true},
              function() {
                chrome.tabs.insertCSS(details.tabId, {code: framestyles, allFrames: true});
              });
          }
          else {
            chrome.tabs.executeScript(details.tabId,
              {file: "common/dep/jquery.min.js", allFrames: true}, function() {
                chrome.tabs.executeScript(details.tabId, {
                  file: "common/ui/inline/porto-cs.js", allFrames: true
                }, function() {
                  chrome.tabs.insertCSS(details.tabId, {code: framestyles, allFrames: true});
                });
              });
          }
          // open injection time slot
          injectOpen = true;
          // reset buffer after injection
          frameHosts.length = 0;
        }, injectTimeSlot);
        // close injection time slot
        injectOpen = false;
      }
    }

    function csBootstrap() {
      var bootstrapSrc = " \
        if (!window.portoBootstrap) { \
          chrome.runtime.sendMessage({event: 'get-cs'}, function(response) { \
            window.eval(response.code); \
          }); \
          window.portoBootstrap = true; \
      } \
    ";
      return bootstrapSrc;
    }

    function migrate() {
      model.migrate08();
    }

    init();

  });
