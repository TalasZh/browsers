'use strict';

define(function(require, exports, module) {

  var porto = require('porto');

  porto.crx = false;
  porto.webex = false;
  porto.sfx = false;
  porto.edge = true;

  var dompurify = require('dompurify');

  porto.data = {};

  porto.data.url = function(path) {
    return chrome.runtime.getURL(path);
  };

  porto.data.load = function(path) {
    return new Promise(function(resolve, reject) {
      var req = new XMLHttpRequest();
      req.open('GET', chrome.runtime.getURL(path));
      req.responseType = 'text';
      req.onload = function() {
        if (req.status == 200) {
          resolve(req.response);
        }
        else {
          reject(new Error(req.statusText));
        }
      };
      req.onerror = function() {
        reject(new Error('Network Error'));
      };
      req.send();
    });
  };

  porto.request = {};
  porto.request.send = function(params) {
    return new Promise(function(resolve, reject) {
      $.ajax({
         // The URL for the request
         url: params.url,

         // The data to send (will be converted to a query string)
         data: params.data,

         // Whether this is a POST or GET request
         type: params.method,

         // The type of data we expect back
         dataType: params.dataType
       })
       // Code to run if the request succeeds (is done);
       // The response is passed to the function
       .done(function(data, status, xhr) {
         if (porto.storage.get('debug')) {
           console.log(data);
         }
         resolve({data: data, status: xhr.status, statusText: xhr.statusText});
       })
       // Code to run if the request fails; the raw request and
       // status codes are passed to the function
       .fail(function(xhr, status, errorThrown) {
         reject({responseText: xhr.responseText, status: xhr.status, statusText: xhr.statusText});
       })
       // Code to run regardless of success or failure;
       .always(function(xhr, status) {
         console.log("The request is complete!");
       });
    });
  };

  var that = this;
  that.ws = null;
  var connected = false;

  var serverUrl = null;
  var protocol = null;
  var connectionStatus = '';

  var openWs = function() {

    if (that.ws) {
      return;
    }

    if (!serverUrl) {
      throw new Error("cannot connect to null url");
    }
    if (protocol) {
      that.ws = new WebSocket(serverUrl, protocol);
    }
    else {
      that.ws = new WebSocket(serverUrl);
    }
    that.ws.onopen = onOpen;
    that.ws.onclose = onClose;
    that.ws.onmessage = onMessage;
    that.ws.onerror = onError;

    connectionStatus = 'OPENING ...';
  };

  var sendWs = function(msg, callback) {
    try {
      console.log('sending message: ' + serverUrl);
      console.log(msg);
      if (!that.ws) {
        openWs();
      }
      that.ws.onmessage = function(event) {
        callback({data: event.data});
      };
      that.ws.send(msg.cmd);
    }
    catch (err) {
      callback({error: 'Couldn\'t send command to SubutaiTray'});
    }
  };

  var closeWs = function() {
    if (that.ws) {
      that.ws.close();
    }
    connected = false;
    connectionStatus = 'CLOSED';
  };

  var onOpen = function() {
    console.log('OPENED: ' + serverUrl + ':' + protocol);
    connected = true;
    connectionStatus = 'OPENED';
  };

  var onClose = function() {
    console.log('CLOSED: ' + serverUrl + ':' + protocol);
    that.ws = null;
  };

  var onMessage = function(event) {
    var data = event.data;
    console.log('message received: ' + data);
  };

  var onError = function(event) {
    console.error(event.data);
  };

  porto.request.ws = {
    init: function(url, options) {
      serverUrl = url;
      protocol = options;
    },
    connect: function() {
      openWs();
    },
    disconnect: function() {
      closeWs();
    },
    send: function(msg, callback) {
      console.log(msg);
      sendWs(msg, callback);
    }
  };

  porto.data.loadDefaults = function() {
    return require('../lib/json-loader!common/res/defaults.json');
  };

  porto.tabs = {};

  porto.tabs.getActive = function(callback) {
    // get selected tab, "*://*/*" filters out non-http(s)
    chrome.tabs.query({active: true, currentWindow: true, url: "*://*/*"}, function(tabs) {
      callback(tabs[0]);
    });
  };

  porto.tabs.attach = function(tab, options, callback) {
    function executeScript(file, callback) {
      if (file) {
        chrome.tabs.executeScript(tab.id, {file: file, allFrames: true}, function() {
          executeScript(options.contentScriptFile.shift(), callback);
        });
      }
      else {
        callback(tab);
      }
    }

    executeScript(options.contentScriptFile.shift(), function() {
      if (options.contentScript) {
        chrome.tabs.executeScript(tab.id, {code: options.contentScript, allFrames: true},
          callback.bind(this, tab));
      }
      else {
        callback(tab);
      }
    });
  };

  porto.tabs.query = function(url, callback) {
    if (!/\*$/.test(url)) {
      url += '*';
    }
    chrome.tabs.query({url: url, currentWindow: true}, callback);
  };

  porto.tabs.create = function(url, complete, callback) {
    var newTab;
    if (complete) {
      // wait for tab to be loaded
      chrome.tabs.onUpdated.addListener(function updateListener(tabid, info) {
        if (tabid === newTab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(updateListener);
          if (callback) {
            callback(newTab);
          }
        }
      });
    }
    chrome.tabs.create({url: url}, function(tab) {
      if (complete) {
        newTab = tab;
      }
      else {
        if (callback) {
          callback(tab);
        }
      }
    });
  };

  porto.tabs.activate = function(tab, options, callback) {
    options = $.extend(options, {active: true});
    chrome.tabs.update(tab.id, options, callback);
  };

  porto.tabs.sendMessage = function(tab, msg, callback) {
    chrome.tabs.sendMessage(tab.id, msg, null, callback);
  };

  porto.tabs.loadOptionsTab = function(hash, callback) {
    // check if options tab already exists
    var url = chrome.runtime.getURL('common/ui/keys.html');
    this.query(url, function(tabs) {
      if (tabs.length === 0) {
        // if not existent, create tab
        if (hash === undefined) {
          hash = '';
        }
        porto.tabs.create(url + hash, callback !== undefined, callback.bind(this, false));
      }
      else {
        // if existent, set as active tab
        porto.tabs.activate(tabs[0], {url: url + hash}, callback.bind(this, true));
      }
    });
  };

  porto.storage = {};

  porto.storage.get = function(id) {
    return JSON.parse(window.localStorage.getItem(id));
  };

  porto.storage.set = function(id, obj) {
    window.localStorage.setItem(id, JSON.stringify(obj));
  };

  porto.windows = {};

  porto.windows.modalActive = false;

  porto.windows.openPopup = function(url, options, callback) {
    chrome.windows.getCurrent(null, function(current) {
      if (window.navigator.platform.indexOf('Win') >= 0 && options.height) {
        options.height += 36;
      }
      chrome.windows.create({
        url: url,
        width: options && options.width,
        height: options && options.height,
        top: options && parseInt(current.top + (current.height - options.height) / 2),
        left: options && parseInt(current.left + (current.width - options.width) / 2),
        focused: true,
        type: 'popup'
      }, function(popup) {
        //console.log('popup created', popup);
        if (options && options.modal) {
          porto.windows.modalActive = true;
          var focusChangeHandler = function(newFocus) {
            //console.log('focus changed', newFocus);
            if (newFocus !== popup.id && newFocus !== chrome.windows.WINDOW_ID_NONE) {
              chrome.windows.update(popup.id, {focused: true});
            }
          };
          chrome.windows.onFocusChanged.addListener(focusChangeHandler);
          var removedHandler = function(removed) {
            //console.log('removed', removed);
            if (removed === popup.id) {
              //console.log('remove handler');
              porto.windows.modalActive = false;
              chrome.windows.onFocusChanged.removeListener(focusChangeHandler);
              chrome.windows.onRemoved.removeListener(removedHandler);
            }
          };
          chrome.windows.onRemoved.addListener(removedHandler);
        }
        if (callback) {
          callback(new porto.windows.BrowserWindow(popup.id));
        }
      });
    });
  };

  porto.windows.BrowserWindow = function(id) {
    this._id = id;
  };

  porto.windows.BrowserWindow.prototype.activate = function() {
    chrome.windows.update(this._id, {focused: true});
  };

  porto.windows.BrowserWindow.prototype.close = function() {
    chrome.windows.remove(this._id);
  };

  porto.util = porto.util || {};

  // Add a hook to make all links open a new window
  // attribution: https://github.com/cure53/DOMPurify/blob/master/demos/hooks-target-blank-demo.html
  dompurify.addHook('afterSanitizeAttributes', function(node) {
    // set all elements owning target to target=_blank
    if ('target' in node) {
      node.setAttribute('target', '_blank');
    }
    // set MathML links to xlink:show=new
    if (!node.hasAttribute('target') &&
        (node.hasAttribute('xlink:href') ||
         node.hasAttribute('href'))) {
      node.setAttribute('xlink:show', 'new');
    }
  });

  porto.util.parseHTML = function(html, callback) {
    callback(dompurify.sanitize(html, {SAFE_FOR_JQUERY: true}));
  };

  // must be bound to window, otherwise illegal invocation
  porto.util.setTimeout = window.setTimeout.bind(window);
  porto.util.clearTimeout = window.clearTimeout.bind(window);

  porto.util.getHostname = function(url) {
    var a = document.createElement('a');
    a.href = url;
    return a.hostname;
  };

  porto.util.getHost = function(url) {
    var a = document.createElement('a');
    a.href = url;
    return a.host;
  };

  porto.util.getDOMWindow = function() {
    return window;
  };

  porto.l10n.get = chrome.i18n.getMessage;

  porto.browserAction = {};

  porto.browserAction.state = function(options) {
    if (typeof options.badge !== 'undefined') {
      chrome.browserAction.setBadgeText({text: options.badge});
    }
    if (typeof options.badgeColor !== 'undefined') {
      chrome.browserAction.setBadgeBackgroundColor({color: options.badgeColor});
    }
  };

  exports.porto = porto;

});
