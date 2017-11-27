/* jshint strict: false */

var porto = porto || {};
porto.crx = false;
porto.ffa = false;
porto.sfx = false;

// chrome extension
porto.crx = typeof chrome === 'undefined' ? false : (chrome !== null);
if (porto.crx) {
  porto.ffa = false;
  porto.sfx = false;
}
else {
  porto.sfx = !porto.ffa && !porto.crx && typeof safari !== 'undefined';
  if (porto.sfx) {
    porto.ffa = false;
  }
  else {
    // firefox addon
    porto.ffa = true;
    //porto.ffa || typeof self !== 'undefined' && typeof self.port !== 'undefined';
    // for firefox, porto.extension is exposed from a content script
  }
}

/* constants */

// min height for large frame
porto.LARGE_FRAME = 600;
// frame constants
porto.FRAME_STATUS = 'stat';
// frame status
porto.FRAME_ATTACHED = 'att';
porto.FRAME_DETACHED = 'det';
// key for reference to frame object
porto.FRAME_OBJ = 'fra';
// marker for dynamically created iframes
porto.DYN_IFRAME = 'dyn';
porto.IFRAME_OBJ = 'obj';
// armor header type
porto.PGP_MESSAGE = 'msg';
porto.PGP_SIGNATURE = 'sig';
porto.PGP_PUBLIC_KEY = 'pub';
porto.PGP_PRIVATE_KEY = 'priv';
// editor mode
porto.EDITOR_WEBMAIL = 'webmail';
porto.EDITOR_EXTERNAL = 'external';
porto.EDITOR_BOTH = 'both';
// display decrypted message
porto.DISPLAY_INLINE = 'inline';
porto.DISPLAY_POPUP = 'popup';
// editor type
porto.PLAIN_TEXT = 'plain';
porto.RICH_TEXT = 'rich';
// keyring
porto.KEYRING_DELIMITER = '|#|';
porto.LOCAL_KEYRING_ID = 'localhost' + porto.KEYRING_DELIMITER + 'subutai';
// colors for secure background
porto.SECURE_COLORS = [
  '#e9e9e9', '#c0c0c0', '#808080', '#ffce1e', '#ff0000', '#85154a', '#6f2b8b', '#b3d1e3', '#315bab',
  '#1c449b', '#4c759c', '#1e8e9f', '#93b536'
];

porto.appendTpl = function($element, path) {
  if (porto.ffa && !/^resource/.test(document.location.protocol)) {
    return new Promise(function(resolve, reject) {
      porto.data.load(path, function(result) {
        $element.append($.parseHTML(result));
        resolve($element);
      });
    });
  }
  else {
    return new Promise(function(resolve, reject) {
      var req = new XMLHttpRequest();
      req.open('GET', path);
      req.responseType = 'text';
      req.onload = function() {
        if (req.status === 200 || req.status === 0) {
          $element.append($.parseHTML(req.response));
          resolve($element);
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
  }
};

if (porto.sfx) {
  var isOnGlobalPage = !!safari.extension.bars;
  // Return the object on which you can add/remove event listeners.
  // If there isn't one, don't explode.
  var listeningContext = function() {
    if (safari.self && safari.self.addEventListener) {
      return safari.self;
    }
    if (safari.application && safari.application.addEventListener) {
      return safari.application;
    }
    console.log("No add/remove event listener possible at this location!");
    console.trace();
    return {
      addEventListener: function() {
      }, removeEventListener: function() {
      }
    };
  };
  var listenFor = function(messageName, handler) {
    var listener = function(messageEvent) {
      if (messageEvent.name == messageName) {
        handler(messageEvent);
      }
    };
    listeningContext().addEventListener("message", listener, false);
    return listener;
  };
  var removeListener = function(listener) {
    listeningContext().removeEventListener("message", listener, false);
  };

  // Return the object on which you can dispatch messages -- globally, or on the
  // messageEvent if specified.  If there isn't one, don't explode.
  var dispatchContext = function(messageEvent) {
    // Can we dispatch on the messageEvent target?
    var m = messageEvent;
    if (m && m.target && m.target.page && m.target.page.dispatchMessage) {
      return m.target.page;
    }
    // Are we in some context where safari.self works, whatever that is?
    var s = safari.self;
    if (s && s.tab && s.tab.dispatchMessage) {
      return s.tab;
    }
    // Are we in the global page sending to the active tab?
    var b = (safari.application && safari.application.activeBrowserWindow);
    var p = (b && b.activeTab && b.activeTab.page);
    if (p && p.dispatchMessage) {
      return p;
    }
    console.log("No dispatchMessage possible at this location!");
    console.trace();
    return {
      dispatchMessage: function() {
      }
    };
  };

  // Track tabs that make requests to the global page, assigning them
  // IDs so we can recognize them later.
  var getTabId = (function() {
    // Tab objects are destroyed when no one has a reference to them,
    // so we keep a list of them, lest our IDs get lost.
    var tabs = [];
    var lastAssignedTabId = 0;
    var theFunction = function(tab) {
      // Clean up closed tabs, to avoid memory bloat.
      tabs = tabs.filter(function(t) {
        return t.browserWindow !== null;
      });

      if (tab.id === undefined) {
        // New tab
        tab.id = lastAssignedTabId + 1;
        lastAssignedTabId = tab.id;
        tabs.push(tab); // save so it isn't garbage collected, losing our ID.
      }
      return tab.id;
    };
    return theFunction;
  })();

  var extension = {
    getBackgroundPage: function() {
      return safari.extension.globalPage.contentWindow;
    },

    getURL: function(path) {
      return safari.extension.baseURI + path;
    },

    // The identifier must be "tab", "infobar", "notification", or "popup".
    getViews: function(fetchProperties) {
      var views = safari.extension.bars.concat(safari.extension.menus, safari.extension.popovers,
        safari.extension.toolbarItems);
      var viewCount = views.length;

      for (var i = 0; i < viewCount; i++) {
        var view = views[i];
        if (view.identifier == fetchProperties.type) {
          return [view.contentWindow];
        }
      }
    },

    sendMessage: (function() {
      // Where to call .dispatchMessage() when sendRequest is called.
      var dispatchTargets = [];
      if (!isOnGlobalPage) {
        // In a non-global context, the dispatch target is just the local
        // object that lets you call .dispatchMessage().
        dispatchTargets.push(dispatchContext());
      }
      else {
        // In the global context, we must call .dispatchMessage() wherever
        // someone has called .onRequest().  There's no good way to get at
        // them directly, though, so .onRequest calls *us*, so we get access
        // to a messageEvent object that points to their page that we can
        // call .dispatchMessage() upon.
        listenFor("onRequest registration", function(messageEvent) {
          var context = dispatchContext(messageEvent);
          if (dispatchTargets.indexOf(context) == -1) {
            dispatchTargets.push(context);
          }
        });
      }

      // Dispatches a request to a list of recipients.  Calls the callback
      // only once, using the first response received from any recipient.
      function theFunction(data, callback) {
        var callbackToken = "callback" + Math.random();

        // Dispatch to each recipient.
        dispatchTargets.forEach(function(target) {
          var message = {data: data, callbackToken: callbackToken};
          target.dispatchMessage("request", message);
        });

        // Listen for a response.  When we get it, call the callback and stop
        // listening.
        var listener = listenFor("response", function(messageEvent) {
          if (messageEvent.message.callbackToken != callbackToken) {
            return;
          }
          // Must wrap this call in a timeout to avoid crash, per Safari team
          window.setTimeout(function() {
            removeListener(listener);
          }, 0);
          if (callback) {
            callback(messageEvent.message.data);
          }
        });
      }

      return theFunction;
    })(),

    onRequest: {
      addListener: function(handler) {
        // If listening for requests from the global page, we must call the
        // global page so it can get a messageEvent through which to send
        // requests to us.
        if (!isOnGlobalPage) {
          dispatchContext().dispatchMessage("onRequest registration", {});
        }

        listenFor("request", function(messageEvent) {
          var request = messageEvent.message.data;

          var sender = {}; // Empty in onRequest in non-global contexts.
          if (isOnGlobalPage) { // But filled with sender data otherwise.
            var id = getTabId(messageEvent.target);
            sender.tab = {id: id, url: messageEvent.target.url};
          }

          var sendResponse = function(dataToSend) {
            var responseMessage = {
              callbackToken: messageEvent.message.callbackToken, data: dataToSend
            };
            dispatchContext(messageEvent).dispatchMessage("response", responseMessage);
          };
          handler(request, sender, sendResponse);
        });
      }
    },

    onMessage: {
      addListener: function(handler) {
        // If listening for requests from the global page, we must call the
        // global page so it can get a messageEvent through which to send
        // requests to us.
        if (!isOnGlobalPage) {
          dispatchContext().dispatchMessage("onRequest registration", {});
        }

        listenFor("request", function(messageEvent) {
          var request = messageEvent.message.data;

          var sender = {}; // Empty in onRequest in non-global contexts.
          if (isOnGlobalPage) { // But filled with sender data otherwise.
            var id = getTabId(messageEvent.target);
            sender.tab = {id: id, url: messageEvent.target.url};
          }

          var sendResponse = function(dataToSend) {
            var responseMessage = {
              callbackToken: messageEvent.message.callbackToken, data: dataToSend
            };
            dispatchContext(messageEvent).dispatchMessage("response", responseMessage);
          };
          handler(request, sender, sendResponse);
        });
      }
    },

    // TODO: axe this, it's only used in Safari-specific code
    connect: function(port_data) {
      var portUuid = "portUuid" + Math.random();
      var message = {name: port_data.name, uuid: portUuid};
      dispatchContext().dispatchMessage("port-create", message);

      var newPort = {
        name: port_data.name,
        postMessage: function(data) {
          dispatchContext().dispatchMessage("port-postMessage",
            {portUuid: portUuid, data: data});
        },
        onDisconnect: {
          addListener: function() {
            // CHROME PORT LIBRARY: chrome.extension.onConnect.addListener: port.onDisconnect is
            // not implemented, so I'm doing nothing.
          }
        },
        onMessage: {
          addListener: function(listener) {
            listenFor("port-postMessage", function(messageEvent) {
              // If the message was a port.postMessage to our port, notify our listener.
              if (messageEvent.message.portUuid != portUuid) {
                return;
              }
              listener(messageEvent.message.data);
            });
          }
        }
      };
      return newPort;
    },

    // TODO: axe this, it's only used in Safari-specific code
    onConnect: {
      addListener: function(handler) {
        // Listen for port creations
        listenFor("port-create", function(messageEvent) {
          var portName = messageEvent.message.name;
          var portUuid = messageEvent.message.uuid;

          var id = getTabId(messageEvent.target);

          var newPort = {
            name: portName, sender: {tab: {id: id, url: messageEvent.target.url}}, onDisconnect: {
              addListener: function() {
                // CHROME PORT LIBRARY: chrome.extension.onConnect.addListener: port.onDisconnect
                // is not implemented, so I'm doing nothing.
              }
            }, postMessage: function(data) {
              dispatchContext(messageEvent).dispatchMessage("port-postMessage",
                {portUuid: portUuid, data: data});
            }, onMessage: {
              addListener: function(listener) {
                listenFor("port-postMessage", function(messageEvent) {
                  // If the message was a port.postMessage to our port, notify our listener.
                  if (messageEvent.message.portUuid != portUuid) {
                    return;
                  }
                  listener(messageEvent.message.data);
                });
              }
            }
          };

          // Inform the onNewPort caller about the new port
          handler(newPort);
        });
      }
    },

    onRequestExternal: {
      addListener: function() {
        // CHROME PORT LIBRARY: onRequestExternal not supported.
      }
    }
  };
  porto.extension = extension;

  var i18n = (function() {

    function syncFetch(file, fn) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", porto.extension.getURL(file), false);
      xhr.onreadystatechange = function() {
        if (this.readyState === 4 && this.responseText !== "") {
          fn(this.responseText);
        }
      };
      try {
        xhr.send();
      }
      catch (e) {
        // File not found, perhaps
      }
    }

    // Insert substitution args into a localized string.
    function parseString(msgData, args) {
      // If no substitution, just turn $$ into $ and short-circuit.
      if (msgData.placeholders === undefined && args === undefined) {
        return msgData.message.replace(/\$\$/g, '$');
      }

      // Substitute a regex while understanding that $$ should be untouched
      function safesub(txt, re, replacement) {
        var dollaRegex = /\$\$/g, dollaSub = "~~~I18N~~:";
        txt = txt.replace(dollaRegex, dollaSub);
        txt = txt.replace(re, replacement);
        // Put back in "$$" ("$$$$" somehow escapes down to "$$")
        var undollaRegex = /~~~I18N~~:/g, undollaSub = "$$$$";
        txt = txt.replace(undollaRegex, undollaSub);
        return txt;
      }

      var $n_re = /\$([1-9])/g;
      var $n_subber = function(_, num) {
        return args[num - 1];
      };

      var placeholders = {};
      // Fill in $N in placeholders
      for (var name in msgData.placeholders) {
        var content = msgData.placeholders[name].content;
        placeholders[name.toLowerCase()] = safesub(content, $n_re, $n_subber);
      }
      // Fill in $N in message
      var message = safesub(msgData.message, $n_re, $n_subber);
      // Fill in $Place_Holder1$ in message
      message = safesub(message, /\$(\w+?)\$/g, function(full, name) {
        var lowered = name.toLowerCase();
        if (lowered in placeholders) {
          return placeholders[lowered];
        }
        return full; // e.g. '$FoO$' instead of 'foo'
      });
      // Replace $$ with $
      message = message.replace(/\$\$/g, '$');

      return message;
    }

    var l10nData;

    var theI18nObject = {
      // chrome.i18n.getMessage() may be used in any extension resource page
      // without any preparation.  But if you want to use it from a content
      // script in Safari, the content script must first run code like this:
      //
      //   get_localization_data_from_global_page_async(function(data) {
      //     chrome.i18n._setL10nData(data);
      //     // now I can call chrome.i18n.getMessage()
      //   });
      //   // I cannot call getMessage() here because the above call
      //   // is asynchronous.
      //
      // The global page will need to receive your request message, call
      // chrome.i18n._getL10nData(), and return its result.
      //
      // We can't avoid this, because the content script can't load
      // l10n data for itself, because it's not allowed to make the xhr
      // call to load the message files from disk.  Sorry :(
      _getL10nData: function() {
        var result = {locales: []};

        // == Find all locales we might need to pull messages from, in order
        // 1: The user's current locale, converted to match the format of
        //    the _locales directories (e.g. "en-US" becomes "en_US"
        result.locales.push(navigator.language.replace('-', '_'));
        // 2: Perhaps a region-agnostic version of the current locale
        if (navigator.language.length > 2) {
          result.locales.push(navigator.language.substring(0, 2));
        }
        // 3: Set English 'en' as default locale
        if (result.locales.indexOf("en") === -1) {
          result.locales.push("en");
        }

        // Load all locale files that exist in that list
        result.messages = {};
        for (var i = 0; i < result.locales.length; i++) {
          var locale = result.locales[i];
          var file = "_locales/" + locale + "/messages.json";
          // Doesn't call the callback if file doesn't exist
          syncFetch(file, function(text) {
            result.messages[locale] = JSON.parse(text);
          });
        }

        return result;
      },

      // Manually set the localization data.  You only need to call this
      // if using chrome.i18n.getMessage() from a content script, before
      // the first call.  You must pass the value of _getL10nData(),
      // which can only be called by the global page.
      _setL10nData: function(data) {
        l10nData = data;
      },

      getMessage: function(messageID, args) {
        if (l10nData === undefined) {
          // Assume that we're not in a content script, because content
          // scripts are supposed to have set l10nData already
          i18n._setL10nData(i18n._getL10nData());
        }
        if (typeof args == "string") {
          args = [args];
        }
        for (var i = 0; i < l10nData.locales.length; i++) {
          var map = l10nData.messages[l10nData.locales[i]];
          // We must have the locale, and the locale must have the message
          if (map && messageID in map) {
            return parseString(map[messageID], args);
          }
        }
        return "";
      }
    };

    return theI18nObject;
  })();

  porto.l10n = {};
  porto.l10n.get = i18n.getMessage;
  porto.l10n.getMessages = function(ids, callback) {
    var result = {};
    ids.forEach(function(id) {
      result[id] = i18n.getMessage(id);
    });
    callback(result);
  };
  porto.l10n.localizeHTML = function(l10n) {
    $('[data-l10n-id]').each(function() {
      var jqElement = $(this);
      var id = jqElement.data('l10n-id');
      var text = l10n ? l10n[id] : i18n.getMessage(id) || id;
      jqElement.text(text);
    });
    $('[data-l10n-title-id]').each(function() {
      var jqElement = $(this);
      var id = jqElement.data('l10n-title-id');
      var text = l10n ? l10n[id] : i18n.getMessage(id) || id;
      jqElement.attr('title', text);
    });
  };
}

try {
  if (porto.ffa) {
    // expose porto.extension to page script
    if (typeof self !== 'undefined' && self.options && self.options.expose_messaging) {
      porto = createObjectIn(unsafeWindow, {defineAs: "porto"});
    }

    (function() {

      var eventIndex = 1;

      porto.ffa = true;

      if (typeof self === 'undefined' || !self.options) {
        return;
      }

      var extension = {
        _dataPath: self.options.data_path,
        onMessage: {},
        port: {}
      };

      function sendMessage(message, response) {
        //console.log('message adapter: sendMessage', message.event);
        if (response !== undefined) {
          message.response = 'resp' + eventIndex++;
          self.port.once(message.response, response);
        }
        self.port.emit('message-event', message);
      }

      function addListener(listener) {
        self.port.on('message-event', function(msg) {
          listener(msg, null, msg.response && function(respMsg) {
              self.port.emit(msg.response, respMsg);
            });
        });
      }

      function _connect(obj) {
        self.port.emit('connect', obj.name);
      }

      function getURL(path) {
        return extension._dataPath + path;
      }

      function postMessage(message) {
        self.port.emit('port-message', message);
      }

      function disconnect(obj) {
        // remove events
        for (var ev in obj.events) {
          if (obj.events.hasOwnProperty(ev)) {
            self.port.removeListener(ev, obj.events[ev]);
          }
        }
        self.port.emit('disconnect', obj.name);
      }

      function addPortListener(obj, listener) {
        var eventName = 'port-message' + '.' + obj.name;
        self.port.on(eventName, listener);
        obj.events[eventName] = listener;
      }

      function addPortDisconnectListener(listener) {
        // currently deactivated, detach event is fired too late: Porto components are already
        // detached from the DOM self.port.on('detach', listener);
      }

      var l10n = {};

      function getMessages(ids, callback) {
        porto.extension.sendMessage({
          event: 'get-l10n-messages',
          ids: ids
        }, callback);
      }

      function localizeHTML(l10n) {
        if (l10n) {
          [].forEach.call(document.querySelectorAll('[data-l10n-id]'), function(element) {
            element.textContent = l10n[element.dataset.l10nId];
          });
          [].forEach.call(document.querySelectorAll('[data-l10n-title-id]'), function(element) {
            element.setAttribute("title", l10n[element.dataset.l10nTitleId]);
          });
        }
        else {
          l10n = [].map.call(document.querySelectorAll('[data-l10n-id]'), function(element) {
            return element.dataset.l10nId;
          });
          [].map.call(document.querySelectorAll('[data-l10n-title-id]'), function(element) {
            l10n.push(element.dataset.l10nTitleId);
          });
          getMessages(l10n, localizeHTML);
        }
      }

      var data = {};

      function load(path, callback) {
        porto.extension.sendMessage({
          event: 'data-load',
          path: path
        }, callback);
      }

      if (self.options.expose_messaging) {
        porto.extension = cloneInto(extension, porto);
        exportFunction(sendMessage, porto.extension,
          {defineAs: "sendMessage", allowCallbacks: true});
        exportFunction(addListener, porto.extension.onMessage,
          {defineAs: "addListener", allowCallbacks: true});
        exportFunction(_connect, porto.extension, {defineAs: "_connect"});
        exportFunction(getURL, porto.extension, {defineAs: "getURL"});
        exportFunction(postMessage, porto.extension.port, {defineAs: "postMessage"});
        exportFunction(disconnect, porto.extension.port, {defineAs: "disconnect"});
        exportFunction(addPortListener, porto.extension.port,
          {defineAs: "addListener", allowCallbacks: true});
        exportFunction(addPortDisconnectListener, porto.extension.port,
          {defineAs: "addDisconnectListener", allowCallbacks: true});
        porto.l10n = cloneInto(l10n, porto);
        exportFunction(getMessages, porto.l10n, {defineAs: "getMessages", allowCallbacks: true});
        exportFunction(localizeHTML, porto.l10n, {defineAs: "localizeHTML"});
        porto.data = cloneInto(data, porto);
        exportFunction(load, porto.data, {defineAs: "load", allowCallbacks: true});
      }
      else {
        porto.extension = extension;
        porto.extension.sendMessage = sendMessage;
        porto.extension.onMessage.addListener = addListener;
        porto.extension._connect = _connect;
        porto.extension.getURL = getURL;
        porto.extension.port.postMessage = postMessage;
        porto.extension.port.disconnect = disconnect;
        porto.extension.port.addListener = addPortListener;
        porto.extension.port.addDisconnectListener = addPortDisconnectListener;
        porto.l10n = l10n;
        porto.l10n.getMessages = getMessages;
        porto.l10n.localizeHTML = localizeHTML;
        porto.data = data;
        porto.data.load = load;
      }

    }());
  }
}
catch (ex) {
  console.error(ex);
}

porto.extension = porto.extension || porto.crx && chrome.runtime;
// extension.connect shim for Firefox
if (porto.ffa && porto.extension) {
  porto.extension.connect = function(obj) {
    porto.extension._connect(obj);
    obj.events = {};
    var port = {
      postMessage: porto.extension.port.postMessage,
      disconnect: porto.extension.port.disconnect.bind(null, obj),
      onMessage: {
        addListener: porto.extension.port.addListener.bind(null, obj)
      },
      onDisconnect: {
        addListener: porto.extension.port.addDisconnectListener.bind(null)
      }
    };
    // page unload triggers port disconnect
    window.addEventListener('unload', port.disconnect);
    return port;
  };
}

// for fixfox, porto.l10n is exposed from a content script
porto.l10n = porto.l10n || porto.crx && {
    getMessages: function(ids, callback) {
      var result = {};
      ids.forEach(function(id) {
        result[id] = chrome.i18n.getMessage(id);
      });
      callback(result);
    },
    localizeHTML: function(l10n) {
      $('[data-l10n-id]').each(function() {
        var jqElement = $(this);
        var id = jqElement.data('l10n-id');
        var text = l10n ? l10n[id] : chrome.i18n.getMessage(id) || id;
        jqElement.text(text);
      });
      $('[data-l10n-title-id]').each(function() {
        var jqElement = $(this);
        var id = jqElement.data('l10n-title-id');
        var text = l10n ? l10n[id] : chrome.i18n.getMessage(id) || id;
        jqElement.attr('title', text);
      });
    }
  };

porto.util = {};

porto.util.sortAndDeDup = function(unordered, compFn) {
  var result = [];
  var prev = -1;
  unordered.sort(compFn).forEach(function(item) {
    var equal = (compFn !== undefined && prev !== undefined) ? compFn(prev, item) === 0 : prev ===
                                                                                          item;
    if (!equal) {
      result.push(item);
      prev = item;
    }
  });
  return result;
};

// random hash generator
porto.util.getHash = function() {
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
};

porto.util.encodeHTML = function(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\//g, "&#x2F;");
};

porto.util.decodeHTML = function(html) {
  return String(html)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "\'")
    .replace(/&#x2F;/g, "\/");
};

porto.util.decodeQuotedPrint = function(armored) {
  return armored
    .replace(/=3D=3D\s*$/m, "==")
    .replace(/=3D\s*$/m, "=")
    .replace(/=3D(\S{4})\s*$/m, "=$1");
};

porto.util.text2html = function(text) {
  return this.encodeHTML(text).replace(/\n/g, '<br>');
};

porto.util.html2text = function(html) {
  html = html.replace(/\n/g, ' '); // replace new line with space
  html = html.replace(/(<br>)/g, '\n'); // replace <br> with new line
  html = html.replace(
    /<\/(blockquote|div|dl|dt|dd|form|h1|h2|h3|h4|h5|h6|hr|ol|p|pre|table|tr|td|ul|li|section|header|footer)>/g,
    '\n'); // replace block closing tags </..> with new line
  html = html.replace(/<(.+?)>/g, ''); // remove tags
  html = html.replace(/&nbsp;/g, ' '); // replace non-breaking space with whitespace
  html = html.replace(/\n{3,}/g, '\n\n'); // compress new line
  return porto.util.decodeHTML(html);
};

/**
 * This function will return the byte size of any UTF-8 string you pass to it.
 * @param {string} str
 * @returns {number}
 */
porto.util.byteCount = function(str) {
  return encodeURI(str).split(/%..|./).length - 1;
};

porto.util.ab2str = function(buf) {
  var str = '';
  var ab = new Uint8Array(buf);
  var CHUNK_SIZE = Math.pow(2, 16);
  var offset, len, subab;
  for (offset = 0; offset < ab.length; offset += CHUNK_SIZE) {
    len = Math.min(CHUNK_SIZE, ab.length - offset);
    subab = ab.subarray(offset, offset + len);
    str += String.fromCharCode.apply(null, subab);
  }
  return str;
};

porto.util.str2ab = function(str) {
  var bufView = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return bufView.buffer;
};

porto.util.getExtensionClass = function(fileExt) {
  var extClass = '';
  if (fileExt !== undefined) {
    extClass = 'ext-color-' + fileExt;
  }
  return extClass;
};

porto.util.extractFileNameWithoutExt = function(fileName) {
  var indexOfDot = fileName.lastIndexOf('.');
  if (indexOfDot > 0) { // case: regular
    return fileName.substring(0, indexOfDot);
  }
  else if (indexOfDot === 0) { // case '.txt'
    return '';
  }
  else {
    return fileName;
  }
};

porto.util.extractFileExtension = function(fileName) {
  var lastindexDot = fileName.lastIndexOf('.');
  if (lastindexDot < 0) { // no extension
    return '';
  }
  else {
    return fileName.substring(lastindexDot + 1, fileName.length).toLowerCase().trim();
  }
};

// Attribution: http://www.2ality.com/2012/08/underscore-extend.html
porto.util.extend = function(target) {
  var sources = [].slice.call(arguments, 1);
  sources.forEach(function(source) {
    Object.getOwnPropertyNames(source).forEach(function(propName) {
      Object.defineProperty(target, propName,
        Object.getOwnPropertyDescriptor(source, propName));
    });
  });
  return target;
};

porto.util.showLoadingAnimation = function() {
  $('.m-spinner').show();
};

porto.util.hideLoadingAnimation = function() {
  $('.m-spinner').hide();
};

porto.util.generateSecurityBackground = function(angle, scaling, coloring) {
  var security = porto.util.secBgnd,
    iconWidth = security.width * security.scaling,
    iconHeight = security.height * security.scaling,
    iconAngle = security.angle,
    iconColor = porto.SECURE_COLORS[security.colorId];

  if (angle || angle === 0) {
    iconAngle = angle;
  }
  if (scaling) {
    iconWidth = security.width * scaling;
    iconHeight = security.height * scaling;
  }
  if (coloring) {
    iconColor = porto.SECURE_COLORS[coloring];
  }

  return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' +
         '<svg xmlns="http://www.w3.org/2000/svg" ' +
         'id="secBgnd" version="1.1" width="' + iconWidth + 'px" ' +
         'height="' + iconHeight + 'px" ' +
         'viewBox="0 0 27 27">' +
         '<path transform="rotate(' + iconAngle + ' 14 14)" ' +
         'style="fill: ' + iconColor + ';" ' +
         'd="M20.1,11.6L20.1,11.6L20.1,11.6c-0.8,0-1.2,0-1.9,0l0,0H8.8V8.8c0-2.6,2.1-4.7,4.7-4.7c2.6,0,4.7,2.1,4.7,4.7 v2.8C18.9,11.6,19.3,11.6,20.1,11.6l0-2.8c0-4.6-3.3-6.6-6.6-6.6c-3.6,0-6.6,2.9-6.6,6.6v2.8h0c-1,0-1.9,0.8-1.9,1.9v5.6V21v1.9 c0,1,0.8,1.9,1.9,1.9h13.2c1,0,1.9-0.8,1.9-1.9v-9.4C22,12.5,21.1,11.6,20.1,11.6z M20.1,22c0,0.5-0.4,0.9-0.9,0.9H7.9 c-0.5,0-0.9-0.4-0.9-0.9v-7.5c0-0.5,0.4-0.9,0.9-0.9h11.3c0.5,0,0.9,0.4,0.9,0.9V22z" />' +
         '</svg>';
};

porto.util.showSecurityBackground = function(isEmbedded) {
  if (isEmbedded) {
    $('.secureBgndSettingsBtn').on('mouseenter', function() {
      $('.secureBgndSettingsBtn').removeClass('btn-link').addClass('btn-default');
    });

    $('.secureBgndSettingsBtn').on('mouseleave', function() {
      $('.secureBgndSettingsBtn').removeClass('btn-default').addClass('btn-link');
    });
  }

  porto.extension.sendMessage({event: "get-security-background"}, function(background) {
    porto.util.secBgnd = background;

    var secBgndIcon = porto.util.generateSecurityBackground(),
      secureStyle =                                                                               '.secureBackground {'                                                         +
                    'background-color: '                                                          +                                                        porto.util.secBgnd.color +                             ';'                         +
                    'background-position: -20px -20px;'                                           +
                    'background-image: url(data:image/svg+xml;base64,' + btoa(secBgndIcon) + ');' +
                    '}';

    var color = porto.util.secBgnd.color,
      lockIcon = porto.util.generateSecurityBackground(0, null, 2),
      lockButton =                                                                            '.lockBtnIcon, .lockBtnIcon:active {'                                      +
                   'margin: 0px;'                                                             +
                   'width: 28px; height: 28px;'                                               +
                   'background-size: 100% 100%;'                                              +
                   'background-repeat: no-repeat;'                                            +
                   'background-image: url(data:image/svg+xml;base64,' + btoa(lockIcon) + ');' +
                   '}';

    var secBgndStyle = document.getElementById('secBgndCss');
    if (secBgndStyle) {
      secBgndStyle.parentNode.removeChild(secBgndStyle);
    }
    $('head').append($('<style>').attr('id', 'secBgndCss').text(secureStyle + lockButton));
  });
};

porto.util.matchPattern2RegEx = function(matchPattern) {
  console.log('Some place for logs');
  console.log(matchPattern);

  var pattern = '^' + matchPattern.replace(/\./g, '\\.').replace(/\*\\\./, '(\\w+(-\\w+)*\\.)*') +
                '$';
  console.log(pattern);

  return new RegExp(
    matchPattern
  );
};

if (typeof exports !== 'undefined') {
  exports.porto = porto;
}

'use strict';

var porto = porto || {};

porto.main = {};

porto.main.interval = 2500; // ms
porto.main.intervalID = 0;
porto.main.regex = /END\sPGP/;
porto.main.minEditHeight = 84;
porto.main.contextTarget = null;
porto.main.prefs = null;
porto.main.name = 'mainCS-' + porto.util.getHash();
porto.main.port = null;

porto.main.connect = function() {
  if (document.portoControl) {
    return;
  }
  porto.main.port = porto.extension.connect({name: porto.main.name});
  porto.main.addMessageListener();
  porto.main.port.postMessage({event: 'get-prefs', sender: porto.main.name});
  //porto.main.initContextMenu();
  document.portoControl = true;
};

$(document).ready(porto.main.connect);

porto.main.init = function(prefs, watchList) {
  porto.main.prefs = prefs;
  porto.main.watchList = watchList;
  if (porto.main.prefs.main_active) {
    porto.main.on();
  } else {
    porto.main.off();
  }
};

porto.main.on = function() {
  //console.log('inside cs: ', document.location.host);
  if (porto.main.intervalID === 0) {
    porto.main.scanLoop();
    porto.main.intervalID = window.setInterval(function() {
      porto.main.scanLoop();
    }, porto.main.interval);
  }
};

porto.main.off = function() {
  if (porto.main.intervalID !== 0) {
    window.clearInterval(porto.main.intervalID);
    porto.main.intervalID = 0;
  }
};

porto.main.scanLoop = function() {
  // find armored PGP text
  var pgpTag = porto.main.findPGPTag(porto.main.regex);
  if (pgpTag.length !== 0) {
    porto.main.attachExtractFrame(pgpTag);
  }
  // find editable content
  var editable = porto.main.findEditable();
  if (editable.length !== 0) {
    porto.main.attachEncryptFrame(editable);
  }
};

/**
 * find text nodes in DOM that match certain pattern
 * @param {Regex} regex
 * @return $([nodes])
 */
porto.main.findPGPTag = function(regex) {
  var treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: function(node) {
      if (node.parentNode.tagName !== 'SCRIPT' && porto.main.regex.test(node.textContent)) {
        return NodeFilter.FILTER_ACCEPT;
      } else {
        return NodeFilter.FILTER_REJECT;
      }
    }
  }, false);

  var nodeList = [];

  while (treeWalker.nextNode()) {
    nodeList.push(treeWalker.currentNode);
  }

  // filter out hidden elements
  nodeList = $(nodeList).filter(function() {
    var element = $(this);
    // visibility check does not work on text nodes
    return element.parent().is(':visible') &&
        // no elements within editable elements
      element.parents('[contenteditable], textarea').length === 0 &&
      this.ownerDocument.designMode !== 'on';
  });

  return nodeList;
};

porto.main.findEditable = function() {
  // find textareas and elements with contenteditable attribute, filter out <body>
  var editable = $('[contenteditable], textarea').not('body');
  var iframes = $('iframe').filter(':visible');
  // find dynamically created iframes where src is not set
  var dynFrames = iframes.filter(function() {
    var src = $(this).attr('src');
    return src === undefined ||
      src === '' ||
      /^javascript.*/.test(src) ||
      /^about.*/.test(src);
  });
  // find editable elements inside dynamic iframe (content script is not injected here)
  dynFrames.each(function() {
    var content = $(this).contents();
    // set event handler for contextmenu
    content.find('body')//.off("contextmenu").on("contextmenu", porto.main.onContextMenu)
      // mark body as 'inside iframe'
      .data(porto.DYN_IFRAME, true)
      // add iframe element
      .data(porto.IFRAME_OBJ, $(this));
    // document of iframe in design mode or contenteditable set on the body
    if (content.attr('designMode') === 'on' || content.find('body[contenteditable]').length !== 0) {
      // add iframe to editable elements
      editable = editable.add($(this));
    } else {
      // editable elements inside iframe
      var editblElem = content.find('[contenteditable], textarea').filter(':visible');
      editable = editable.add(editblElem);
    }
  });
  // find iframes from same origin with a contenteditable body (content script is injected, but encrypt frame needs to
  // be attached to outer iframe)
  var anchor = $('<a/>');
  var editableBody = iframes.not(dynFrames).filter(function() {
    var frame = $(this);
    // only for iframes from same host
    if (anchor.attr('href', frame.attr('src')).prop('hostname') === document.location.hostname) {
      try {
        var content = frame.contents();
        if (content.attr('designMode') === 'on' || content.find('body[contenteditable]').length !== 0) {
          // set event handler for contextmenu
          //content.find('body').off("contextmenu").on("contextmenu", porto.main.onContextMenu);
          // mark body as 'inside iframe'
          content.find('body').data(porto.IFRAME_OBJ, frame);
          return true;
        } else {
          return false;
        }
      } catch (e) {
        return false;
      }
    }
  });
  editable = editable.add(editableBody);
  // filter out elements below a certain height limit
  editable = editable.filter(function() {
    return ($(this).hasClass('bp-sign-target') || $(this).hasClass('bp-set-pub-key') || $(this).hasClass('e2e-sign-message'));
  });
  //console.log(editable);
  return editable;
};

porto.main.getMessageType = function(armored) {
  if (/END\sPGP\sMESSAGE/.test(armored)) {
    return porto.PGP_MESSAGE;
  } else if (/END\sPGP\sSIGNATURE/.test(armored)) {
    return porto.PGP_SIGNATURE;
  } else if (/END\sPGP\sPUBLIC\sKEY\sBLOCK/.test(armored)) {
    return porto.PGP_PUBLIC_KEY;
  } else if (/END\sPGP\sPRIVATE\sKEY\sBLOCK/.test(armored)) {
    return porto.PGP_PRIVATE_KEY;
  }
};

porto.main.attachExtractFrame = function(element) {
  // check status of PGP tags
  var newObj = element.filter(function() {
    return !porto.ExtractFrame.isAttached($(this).parent());
  });
  // create new decrypt frames for new discovered PGP tags
  newObj.each(function(index, element) {
    try {
      // parent element of text node
      var pgpEnd = $(element).parent();
      switch (porto.main.getMessageType(pgpEnd.text())) {
        case porto.PGP_MESSAGE:
          var dFrame = new porto.DecryptFrame(porto.main.prefs);
          dFrame.attachTo(pgpEnd);
          break;
        case porto.PGP_SIGNATURE:
          var vFrame = new porto.VerifyFrame(porto.main.prefs);
          vFrame.attachTo(pgpEnd);
          break;
        case porto.PGP_PUBLIC_KEY:
          var imFrame = new porto.ImportFrame(porto.main.prefs);
          imFrame.attachTo(pgpEnd);
          break;
      }
    } catch (e) {
    }
  });
};

/**
 * attach encrypt frame to element
 * @param  {$} element
 * @param  {boolean} expanded state of frame
 */
porto.main.attachEncryptFrame = function(element, expanded) {
  // check status of elements
  var newObj = element.filter(function() {
    if (expanded) {
      // filter out only attached frames
      if (element.data(porto.FRAME_STATUS) === porto.FRAME_ATTACHED) {
        // trigger expand state of attached frames
        element.data(porto.FRAME_OBJ).showEncryptDialog();
        return false;
      } else {
        return true;
      }
    } else {
      // filter out attached and detached frames
      return !porto.EncryptFrame.isAttached($(this));
    }
  });
  // create new encrypt frames for new discovered editable fields
  newObj.each(function(index, element) {
    var eFrame = new porto.EncryptFrame(porto.main.prefs);
    if ($(element).hasClass('bp-sign-target')) {
      eFrame.attachTo($(element), {
          expanded: expanded,
          su_fingerprint: getCookie('su_fingerprint'),
          context: "bp-sign-target"
        }
      );
    }
    else if ($(element).hasClass('bp-set-pub-key')) {
      eFrame.attachTo($(element), {
          expanded: expanded,
          su_fingerprint: getCookie('su_fingerprint'),
          context: "bp-set-pub-key"
        }
      );
    }
    else if ($(element).hasClass('e2e-sign-message')) {
      eFrame.attachTo($(element), {
          expanded: expanded,
          su_fingerprint: getCookie('su_fingerprint'),
          context: "e2e-sign-message"
        }
      );
    }
  });
};

function getCookie(cname) {
  var name = cname + "=";
  var ca = document.cookie.split(';');
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) === ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

porto.main.addMessageListener = function() {
  porto.main.port.onMessage.addListener(
    function(request) {
      //console.log('contentscript: %s onRequest: %o', document.location.toString(), request);
      if (request.event === undefined) {
        return;
      }
      switch (request.event) {
        case 'on':
          porto.main.on();
          break;
        case 'off':
          porto.main.off();
          break;
        case 'destroy':
          porto.main.off();
          porto.main.port.disconnect();
          break;
        case 'context-encrypt':
          if (porto.main.contextTarget !== null) {
            porto.main.attachEncryptFrame(porto.main.contextTarget, true);
            porto.main.contextTarget = null;
          }
          break;
        case 'set-prefs':
          porto.main.init(request.prefs, request.watchList);
          break;
        default:
          console.log('unknown event');
      }
    }
  );
  porto.main.port.onDisconnect.addListener(function() {
    porto.main.off();
  });
};

porto.main.initContextMenu = function() {
  // set handler
  $("body").on("contextmenu", porto.main.onContextMenu);
};

porto.main.onContextMenu = function(e) {
  //console.log(e.target);
  var target = $(e.target);
  // find editable descendants or ascendants
  var element = target.find('[contenteditable], textarea');
  if (element.length === 0) {
    element = target.closest('[contenteditable], textarea');
  }
  if (element.length !== 0 && !element.is('body')) {
    if (element.height() > porto.main.minEditHeight) {
      porto.main.contextTarget = element;
    } else {
      porto.main.contextTarget = null;
    }
    return;
  }
  // inside dynamic iframe or iframes from same origin with a contenteditable body
  element = target.closest('body');
  // get outer iframe
  var iframeObj = element.data(porto.IFRAME_OBJ);
  if (iframeObj !== undefined) {
    // target set to outer iframe
    porto.main.contextTarget = iframeObj;
    return;
  }
  // no suitable element found
  porto.main.contextTarget = null;
};

'use strict';

var porto = porto || {};

porto.EncryptFrame = function(prefs) {
  this.id = porto.util.getHash();
  this._editElement = null;
  this._eFrame = null;
  this._eDialog = null;
  this._port = null;
  this._isToolbar = false;
  this._refreshPosIntervalID = 0;
  this._emailTextElement = null;
  this._emailUndoText = null;
  this._editorMode = prefs.security.editor_mode;
  // type of external editor
  this._editorType = porto.PLAIN_TEXT; //prefs.general.editor_type;
  this._options = {expanded: false, closeBtn: true};
  this._keyCounter = 0;
};

porto.EncryptFrame.prototype.attachTo = function(element, options) {
  $.extend(this._options, options);
  this._init(element);
  this._establishConnection();
  this._renderFrame(this._options.expanded);
  this._registerEventListener();
  // set status to attached
  this._editElement.data(porto.FRAME_STATUS, porto.FRAME_ATTACHED);
  // store frame obj in element tag
  this._editElement.data(porto.FRAME_OBJ, this);
};

porto.EncryptFrame.prototype.getID = function() {
  return this.id;
};

porto.EncryptFrame.prototype._init = function(element) {
  this._editElement = element;
  this._emailTextElement =
    this._editElement.is('iframe') ? this._editElement.contents().find('body') : this._editElement;
  // inject style if we have a non-body editable element inside a dynamic iframe
  if (!this._editElement.is('body') && this._editElement.closest('body').data(porto.DYN_IFRAME)) {
    var html = this._editElement.closest('html');
    if (!html.data('M-STYLE')) {
      var style = $('<link/>', {
        rel: 'stylesheet', href: porto.extension.getURL('common/ui/inline/framestyles.css')
      });
      // add style
      html.find('head').append(style);
      // set marker
      html.data('M-STYLE', true);
    }
  }
};

porto.EncryptFrame.prototype._renderFrame = function(expanded) {
  var that = this;
  // create frame
  var toolbar = '';
  if (this._options.closeBtn) {
    toolbar = toolbar + '<a class="m-frame-close">×</a>';
  }
  else {
    toolbar = toolbar + '<span class="m-frame-fill-right"></span>';
  }
  /* jshint multistr: true */
  toolbar = toolbar + '\
            <button id="signBtn" class="m-btn m-encrypt-button" type="button"><i class="m-icon m-icon-sign"></i></button> \
            <button id="encryptBtn" class="m-btn m-encrypt-button" type="button"><i class="m-icon m-icon-encrypt"></i></button> \
            <button id="undoBtn" class="m-btn m-encrypt-button" type="button"><i class="m-icon m-icon-undo"></i></button> \
            <button id="editorBtn" class="m-btn m-encrypt-button" type="button"><i class="m-icon m-icon-editor"></i></button> \
            ';
  this._eFrame = $('<div/>', {
    id: 'eFrame-' + that.id, 'class': 'm-encrypt-frame', html: toolbar
  });

  this._eFrame.insertAfter(this._editElement);
  $(window).on('resize', this._setFrameDim.bind(this));
  // to react on position changes of edit element, e.g. click on CC or BCC in GMail
  this._refreshPosIntervalID = window.setInterval(function() {
    that._setFrameDim();
  }, 1000);
  this._eFrame.find('.m-frame-close').on('click', this._closeFrame.bind(this));
  this._eFrame.find('#signBtn').on('click', this._onSignButton.bind(this));
  this._eFrame.find('#encryptBtn').on('click', this._onSignButton.bind(this));
  this._eFrame.find('#undoBtn').on('click', this._onUndoButton.bind(this));
  this._eFrame.find('#editorBtn').on('click', this._onEditorButton.bind(this));
  if (!expanded) {
    this._isToolbar = true;
    this._normalizeButtons();
    this._eFrame.fadeIn('slow');
  }
  else {
    this.showEncryptDialog();
  }
  if (this._editorMode === porto.EDITOR_EXTERNAL) {
    this._emailTextElement.on('keypress', function() {
      if (++that._keyCounter >= 13) {
        that._emailTextElement.off('keypress');
        that._eFrame.fadeOut('slow', function() {
          that._closeFrame();
        });
      }
    });
  }
};

porto.EncryptFrame.prototype._normalizeButtons = function() {
  //console.log('editor mode', this._editorMode);
  this._eFrame.find('.m-encrypt-button').hide();
  //switch (this._editorMode) {
  //  case porto.EDITOR_WEBMAIL:
  //    this._eFrame.find('#encryptBtn').show();
  //    this._eFrame.find('#signBtn').show();
  //    break;
  //  case porto.EDITOR_EXTERNAL:
  //    this._eFrame.find('#editorBtn').show();
  //    break;
  //  case porto.EDITOR_BOTH:
  //    this._eFrame.find('#encryptBtn').show();
  //    this._eFrame.find('#editorBtn').show();
  //    break;
  //  default:
  //    throw 'Unknown editor mode';
  //}
  switch (this._options.context) {
    case 'bp-sign-target':
      //this._eFrame.find('#encryptBtn').show();
      //this._eFrame.find('#signBtn').show();
      this._eFrame.find('#signBtn').click();
      break;
    case 'bp-set-pub-key':
      if (this._emailTextElement.hasClass('bp-set-pub-key')) {
        //this._eFrame.find('#encryptBtn').show();
        this._eFrame.find('#encryptBtn').click();
        this._emailTextElement.addClass('bp-signing-in-progress');
      }
      //this._eFrame.find('#editorBtn').show();
      break;
    case 'e2e-sign-message':
      if (!this._emailUndoText) {
        this._eFrame.find('#signBtn').show();
      }
      break;
    default:
      throw 'Unknown editor mode';
  }
  if (this._emailUndoText) {
    this._eFrame.find('#undoBtn').show();
  }
  this._setFrameDim();
};

porto.EncryptFrame.prototype._onSignButton = function() {
  if (this._options.context === 'bp-sign-target') {
    this._port.postMessage({
      event: 'get-signing-keys', sender: 'eFrame-' + this.id
    });
  }
  else if (this._options.context === 'e2e-sign-message') {
    this.showSignDialog();
  }
  else if (this._options.context === 'bp-set-pub-key') {
    this.showPubkeyDialog();
  }
  return false;
};

porto.EncryptFrame.prototype._onEncryptButton = function() {
  this.showEncryptDialog();
  return false;
};

porto.EncryptFrame.prototype._onUndoButton = function() {
  this._resetEmailText();
  this._normalizeButtons();
  return false;
};

porto.EncryptFrame.prototype._onEditorButton = function() {
  this._emailTextElement.off('keypress');
  this._showMailEditor();
  return false;
};

porto.EncryptFrame.prototype.showSignDialog = function() {
  this._expandFrame(this._showDialog.bind(this, 'sign'));
};

porto.EncryptFrame.prototype.showPubkeyDialog = function() {
  this._expandFrame(this._showDialog.bind(this, 'pubkey'));
};

porto.EncryptFrame.prototype.showEncryptDialog = function() {
  this._expandFrame(this._showDialog.bind(this, 'encrypt'));
};

porto.EncryptFrame.prototype._expandFrame = function(callback) {
  this._eFrame.hide();
  this._eFrame.find('.m-encrypt-button').hide();
  this._eFrame.addClass('m-encrypt-frame-expanded');
  this._eFrame.css('margin', this._editElement.css('margin'));
  this._isToolbar = false;
  this._setFrameDim();
  this._eFrame.fadeIn('slow', callback);
};

porto.EncryptFrame.prototype._closeFrame = function(finalClose) {
  this._eFrame.fadeOut(function() {
    window.clearInterval(this._refreshPosIntervalID);
    $(window).off('resize');
    this._eFrame.remove();
    if (finalClose === true) {
      this._port.disconnect();
      this._editElement.data(porto.FRAME_STATUS, null);
    }
    else {
      this._editElement.data(porto.FRAME_STATUS, porto.FRAME_DETACHED);
    }
    this._editElement.data(porto.FRAME_OBJ, null);
  }.bind(this));
  return false;
};

porto.EncryptFrame.prototype._setFrameDim = function() {
  var editElementPos = this._editElement.position();
  var editElementWidth = this._editElement.width();
  if (this._isToolbar) {
    var toolbarWidth = this._eFrame.width();
    this._eFrame.css('top', editElementPos.top + 3);
    this._eFrame.css('left', editElementPos.left + editElementWidth - toolbarWidth - 6);
  }
  else {
    this._eFrame.css('top', editElementPos.top + 2);
    this._eFrame.css('left', editElementPos.left + 2);
    this._eFrame.width(editElementWidth);
    this._eFrame.height(this._editElement.height() - 4);
  }
};

porto.EncryptFrame.prototype._showDialog = function(type) {
  this._eDialog = $('<iframe/>', {
    id: 'eDialog-' + this.id,
    'class': 'm-frame-dialog',
    frameBorder: 0,
    scrolling: 'no',
    style: 'display: block'
  });
  var url, dialog;
  if (type === 'encrypt') {
    dialog = 'encryptDialog';
  }
  else if (type === 'sign') {
    dialog = 'signDialog';
  }
  else if (type === 'pubkey') {
    dialog = 'pubkeyDialog';
  }
  //console.error(dialog);
  if (porto.crx || porto.sfx) {
    url = porto.extension.getURL('common/ui/inline/dialogs/' + dialog + '.html?id=' + this.id);
  }
  else if (porto.ffa) {
    url = 'about:blank?porto=' + dialog + '&id=' + this.id;
  }
  this._eDialog.attr('src', url);
  this._eFrame.append(this._eDialog);
  this._setFrameDim();
  this._eDialog.fadeIn();
};

// TODO pass user fingerprint to automatically sign message
porto.EncryptFrame.prototype._showMailEditor = function() {
  this._port.postMessage({
    event: 'eframe-display-editor',
    sender: 'eFrame-' + this.id,
    text: this._getEmailText(this._editorType == porto.PLAIN_TEXT ? 'text' : 'html')
  });
};

porto.EncryptFrame.prototype._establishConnection = function() {
  this._port = porto.extension.connect({name: 'eFrame-' + this.id});
};

porto.EncryptFrame.prototype._removeDialog = function() {
  if (!this._eDialog) {
    return;
  }
  this._eDialog.fadeOut();
  // removal triggers disconnect event
  this._eDialog.remove();
  this._eDialog = null;
  this._showToolbar();
};

porto.EncryptFrame.prototype._showToolbar = function() {
  this._eFrame.fadeOut(function() {
    this._eFrame.removeClass('m-encrypt-frame-expanded');
    this._eFrame.removeAttr('style');
    this._isToolbar = true;
    this._normalizeButtons();
    this._eFrame.fadeIn('slow');
  }.bind(this));
  return false;
};

porto.EncryptFrame.prototype._html2text = function(html) {
  html = $('<div/>').html(html);
  // replace anchors
  html = html.find('a').replaceWith(function() {
               return $(this).text() + ' (' + $(this).attr('href') + ')';
             })
             .end()
             .html();
  html = html.replace(/(<(br|ul|ol)>)/g, '\n'); // replace <br>,<ol>,<ul> with new line
  html = html.replace(/<\/(div|p|li)>/g, '\n'); // replace </div>, </p> or </li> tags with new line
  html = html.replace(/<li>/g, '- ');
  html = html.replace(/<(.+?)>/g, ''); // remove tags
  html = html.replace(/\n{3,}/g, '\n\n'); // compress new line
  return $('<div/>').html(html).text(); // decode
};

porto.EncryptFrame.prototype._getEmailText = function(type) {
  var text, html;
  if (this._emailTextElement.is('textarea')) {
    text = this._emailTextElement.val();
  }
  else { // html element
    if (type === 'text') {
      this._emailTextElement.focus();
      var element = this._emailTextElement.get(0);
      var sel = element.ownerDocument.defaultView.getSelection();
      sel.selectAllChildren(element);
      text = sel.toString();
      sel.removeAllRanges();
    }
    else {
      html = this._emailTextElement.html();
      html = html.replace(/\n/g, ''); // remove new lines
      text = html;
    }
  }
  return text;
};

/**
 * Save editor content for later undo
 */
porto.EncryptFrame.prototype._saveEmailText = function() {
  if (this._emailTextElement.is('textarea')) {
    this._emailUndoText = this._emailTextElement.val();
  }
  else {
    this._emailUndoText = this._emailTextElement.html();
  }
};

porto.EncryptFrame.prototype._getEmailRecipient = function() {
  var emails = [];
  var emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}/g;
  $('span').filter(':visible').each(function() {
    var valid = $(this).text().match(emailRegex);
    if (valid !== null) {
      // second filtering: only direct text nodes of span elements
      var spanClone = $(this).clone();
      spanClone.children().remove();
      valid = spanClone.text().match(emailRegex);
      if (valid !== null) {
        emails = emails.concat(valid);
      }
    }
  });
  $('input, textarea').filter(':visible').each(function() {
    var valid = $(this).val().match(emailRegex);
    if (valid !== null) {
      emails = emails.concat(valid);
    }
  });
  //console.log('found emails', emails);
  return emails;
};

/**
 * Replace content of editor element (_emailTextElement)
 * @param {string} msg txt or html content
 */
porto.EncryptFrame.prototype._setMessage = function(msg, type, fingerprint) {
  if (this._emailTextElement.is('textarea')) {
    // decode HTML entities for type text due to previous HTML parsing
    msg = porto.util.decodeHTML(msg);
    this._emailTextElement.val(msg);
    $(this._emailTextElement).text(msg);
    //console.log(msg);
    //this._emailTextElement.removeClass('bp-set-pub-key');

    var signTargets = document.getElementsByClassName('bp-sign-target');
    if (signTargets.length > 0) {
      try {
        var changeEvent = new Event('change');
        signTargets[0].dispatchEvent(changeEvent);
      }
      catch (err) {
        //console.error(err);
      }
    }
    $(this._emailTextElement).removeClass('bp-sign-target');

    var loadingScreenDelegateScreen = document.getElementsByClassName('js-loading-screen');
    if (loadingScreenDelegateScreen.length > 0) {
      loadingScreenDelegateScreen[0].style.display = 'none';
    }
  }
  else {
    // element is contenteditable or RTE
    if (type === 'text') {
      msg = '<pre>' + msg + '<pre/>';
    }
    this._emailTextElement.html(msg);
  }
  // trigger input event
  var inputEvent = document.createEvent('HTMLEvents');
  inputEvent.initEvent('input', true, true);
  this._emailTextElement.get(0).dispatchEvent(inputEvent);

  var selectedPubKey = document.getElementsByClassName('bp-set-pub-key');
  if (selectedPubKey.length > 0 && fingerprint) {
    this._emailTextElement.data('fingerprint', fingerprint);
    var newCookie = "su_fingerprint=" + fingerprint;
    //console.log(newCookie);
    document.cookie = newCookie;
    porto.extension.sendMessage({
      event: "associate-peer-key", su_fingerprint: fingerprint, url: document.location.origin
    });
    this._closeFrame();
  }
};

porto.EncryptFrame.prototype._resetEmailText = function() {
  if (this._emailTextElement.is('textarea')) {
    this._emailTextElement.val(this._emailUndoText);
  }
  else {
    this._emailTextElement.html(this._emailUndoText);
  }
  this._emailUndoText = null;
};

porto.EncryptFrame.prototype._registerEventListener = function() {
  var that = this;
  this._port.onMessage.addListener(function(msg) {
    //console.log('eFrame-%s event %s received', that.id, msg.event);
    switch (msg.event) {
      case 'encrypt-dialog-cancel':
      case 'sign-dialog-cancel':
        that._removeDialog();
        break;
      case 'email-text':
        //console.error('js-popup-loading-screen');
        try {
          var loadingScreen = document.getElementsByClassName('js-popup-loading-screen');
          if (loadingScreen.length > 0) {
            loadingScreen[0].style.display = 'block';
          }
          var loadingScreenDelegateScreen = document.getElementsByClassName('js-loading-screen');
          if (loadingScreenDelegateScreen.length > 0) {
            loadingScreenDelegateScreen[0].style.display = 'block';
          }
        }
        catch (err) {
          console.error(err);
        }
        that._port.postMessage({
          event: 'eframe-email-text',
          data: that._getEmailText(msg.type),
          action: msg.action,
          fingerprint: msg.fingerprint,
          sender: 'eFrame-' + that.id
        });
        break;
      case 'destroy':
        that._closeFrame(true);
        break;
      case 'recipient-proposal':
        that._port.postMessage({
          event: 'eframe-recipient-proposal',
          data: that._getEmailRecipient(),
          sender: 'eFrame-' + that.id
        });
        that._port.postMessage({
          event: 'eframe-textarea-element',
          isTextElement: that._emailTextElement.is('textarea'),
          sender: 'eFrame-' + that.id
        });
        break;
      case 'encrypted-message':
      case 'signed-message':
        that._saveEmailText();
        that._removeDialog();
        that._setMessage(msg.message, 'text');
        if (that._options.context === 'e2e-sign-message') {
          var fprintInput = $('#subt-input__login');
          if (fprintInput.length > 0) {
            fprintInput.val(msg.fingerprint);
            fprintInput.text(msg.fingerprint);
          }
        }
        break;
      case 'set-editor-output':
        that._saveEmailText();
        that._normalizeButtons();
        that._setMessage(msg.text, 'text');
        break;
      case 'filter-relevant-key':
        for (var inx = 0; inx < msg.keys.length; inx++) {
          var key = msg.keys[inx];
          if (key.fingerprint === that._options.su_fingerprint) {
            that._port.postMessage({
              event: 'sign-dialog-ok',
              sender: 'eFrame-' + that.id,
              signKeyId: key.id.toLowerCase(),
              type: 'text'
            });
            break;
          }
        }
        break;
      case 'get-armored-pub':
        that._saveEmailText();
        that._removeDialog();
        //console.log(msg.fingerprint);
        //console.error("encryptFrame:event:get-armored-pub");
        that._setMessage(msg.armor[0].armoredPublic, 'text', msg.fingerprint[0]);
        that._emailTextElement.data('key-name', msg.keyName);
        break;
      case 'bp-show-keys-popup-bob':
        //that._emailTextElement.style.display = 'block';
        var $keyManager = $("#js-public-key-manager");
        if ($keyManager) {
          var $emailMessage = $keyManager.find('.bp-signing-in-progress');
          if ($emailMessage.length > 0) {
            $keyManager.addClass('js-public-key-manager_show');
          }
        }
        break;
      default:
        console.log('unknown event', msg);
    }
  });
  this._port.onDisconnect.addListener(function(msg) {
    that._closeFrame(false);
  });
};

porto.EncryptFrame.isAttached = function(element) {
  var status = element.data(porto.FRAME_STATUS);
  switch (status) {
    case porto.FRAME_ATTACHED:
    case porto.FRAME_DETACHED:
      return true;
    default:
      return false;
  }
};

/**
 * Created by TalasZh on 3/27/16.
 */
'use strict';
var porto = porto || {};

(function(window, document, undefined) {
  var parser = document.createElement('a');
  parser.href = "document.location";
  var isKurjun = $('head > title').text();
  var $content = $('body > div.b-workspace__content > div');
  var $addUserBtn = $('#add_user_btn');

  if (isKurjun === 'Kurjun' && $addUserBtn.length !== 0) {
    console.log('This is kurjun');
    $('body').on('click', '.bp-close-modal', function() {
      swal2.closeModal();
    });

    injectButton();
  }

  function registerPublicKey() {
    var $publicKey = $('#keyContent');
    var stage = $publicKey.data('stage');
    if (stage === 'set-key') {
      $.ajax({
         url: parser.origin + '/kurjun/rest/identity/user/add',
         data: {username: $publicKey.data('key-name'), key: $publicKey.text()},
         type: 'POST'
       })
       .done(function(data, status, xhr) {
         $publicKey.removeData(porto.FRAME_STATUS);
         $publicKey.text(data);
         $publicKey.val(data);
         $publicKey.removeClass('bp-set-pub-key');
         $publicKey.addClass('bp-sign-target');
         $publicKey.data('stage', 'sign-authid');
         $publicKey.on('change', function() {
           swal2.enableButtons();
         });
       })
       .fail(function(xhr, status, errorThrown) {
         swal2.enableButtons();
         swal2({
           title: "Oops,",
           text: errorThrown,
           type: "error",
           customClass: "b-warning"
         });
       })
       .always(function(xhr, status) {
         console.log("The request is complete!");
       });
    }
  }

  function setCookie(cname, cvalue, hours) {
    var d = new Date();
    d.setTime(d.getTime() + (hours * 60 * 60 * 1000));
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
  }

  function signAuthId() {
    var $publicKey = $('#keyContent');
    $.ajax({
       url: parser.origin + '/kurjun/rest/identity/user/auth',
       data: {fingerprint: $publicKey.data('fingerprint'), message: $publicKey.val()},
       type: 'POST'
     })
     .done(function(data, status, xhr) {
       swal2.enableButtons();
       swal2({
         title: "Logged in",
         showConfirmButton: true,
         text: "Your identity was successfully verified by Kurjun!",
         type: "success"
       }, function() {
         setTimeout(function() {
           location.reload();
         }, 1500);
       });
     })
     .fail(function(xhr, status, errorThrown) {
       swal2.enableButtons();
       swal2({
         title: "Oops,",
         text: errorThrown,
         type: "error",
         customClass: "b-warning"
       });
     })
     .always(function(xhr, status) {
     });
  }

  function registerClickListener($element) {
    $element.on('click', function(e) {
      porto.extension.sendMessage({
        event: 'load-local-content',
        path: 'common/ui/_popup-key-selector.html'
      }, function(content) {
        swal2({
          html: content,
          showCancelButton: true,
          confirmButtonText: 'Submit',
          allowOutsideClick: false,
          width: 540,
          //buttonsStyling: false,
          closeOnConfirm: false
        }, function() {
          swal2.disableButtons();

          var $publicKey = $('#keyContent');
          var stage = $publicKey.data('stage');
          if (stage === 'set-key') {
            registerPublicKey();
          }
          else if (stage === 'sign-authid') {
            signAuthId();
          }
        });
      });
    });
  }

  function injectButton() {
    porto.extension.sendMessage({
      event: 'load-local-content',
      path: 'common/ui/inline/_e2e-button-template.html'
    }, function(content) {
      $content.before(content);
      var $e2eBtn = $('.e2e-plugin-btn');
      $e2eBtn.find('.ssh-key-button_title').text('Register');
      registerClickListener($e2eBtn);
    });
  }
})(window, document);

/**
 * Created by ape-craft on 3/30/16.
 */
/**
 * Created by talas on 11/19/15.
 */
/* jshint strict: false */
var porto = porto || {};

porto.trayPort = {};

porto.trayPort.interval = 2500; // ms
porto.trayPort.intervalHubID = 0;
porto.trayPort.intervalSSID = 0;

(function(window, document, undefined) {

  var parser = document.createElement('a');
  parser.href = "document.location";
  //parser.protocol; // => "http:"
  //parser.hostname; // => "example.com"
  //parser.port;     // => "3000"
  //parser.pathname; // => "/pathname/"
  //parser.search;   // => "?search=test"
  //parser.hash;     // => "#hash"
  //parser.host;     // => "example.com:3000"

  porto.extension.sendMessage({event: "get-version"}, function(version) {
    var input = $('#bp-plugin-version');
    if (input.length > 0) {
      input.val(version);
    }
  });

  console.log("ORIGIN: "+parser.origin);
  if (parser.origin === "https://hub.subut.ai" || parser.origin === "https://dev.subut.ai" || parser.origin === "https://stage.subut.ai") {
    porto.extension.sendMessage(
      {
        event: 'porto-socket-init',
        url: 'ws://localhost:9998'
      }
    );
    porto.trayPort.intervalHubID = window.setInterval(function() {
      porto.trayPort.scanLoop();
    }, porto.trayPort.interval);
  }

  porto.trayPort.scanLoop = function() {
    var containers = $('.bp-env-cntr-ssh tbody tr');

    for (var i = 0; i < containers.length; i++) {
      var $container = $(containers[i]);
      if ($container.attr('data-dirty') !== 'true') {
        // 1: name, 2: template, 3: size, 4: status, 5: ip
        var $btn = $container.find('td .e2e-plugin-btn');
        $btn.attr('disabled', false);
        $btn.on('click', function() {
          var that = this;
          porto.extension.sendMessage({
            event: "porto-socket-send",
            msg: {
              cmd: 'cmd:current_user'
            }
          }, function(response) {
            performCheck(that, response);
          });
        });
        $container.attr('data-dirty', 'true');
      }
    }

  };

  function performCheck(that, response) {
    console.log(response);
    var pathParams = parser.pathname;
    var userId = pathParams.split('/');
    // var email = $(
    //   'body > div.b-content.b-content_minus-header.g-full-height > div.b-sidebar.b-sidebar_border-right.g-left.g-full-height > div > div > div.b-sidebar-profile__header.g-padding > div > div.b-sidebar-profile-header__info.g-margin-bottom > div > div.b-sidebar-profile-header-info__location > ul > li > a');
    var email = $('#e2e-plugin-email-hub-field');
    email = $(email).attr('data-email');
    console.log('hub email: ' + email);
    if (email && !response.error) {
      var trayEmail = response.data;
      email = email.toLowerCase();
      trayEmail = trayEmail.toLowerCase();
      console.log('tray email: ' + trayEmail);
      if (email === trayEmail) {
        var row = $(that.closest('tr'));
        var envName = $('.b-sidebar-profile-header-name').text().trim();
        var environmentId = $('#e2e-plugin-hub-environment-name');

        if (environmentId.length > 0) {
          envName = environmentId.val();
        } else if (userId[3] === 'environments') {
          envName = userId[4];
        }
        console.log('environment: ' + envName);

        var cmd = 'cmd:ssh%%%' + envName + '%%%' + row.attr('data-container-id');
        openSshTunnel(cmd);
      }
      else {
        swal2({
          title: "Authentication error ",
          text: "SubutaiTray and Hub user didn't match!?!?",
          type: "error",
          customClass: "b-warning"
        });
      }
    }
    else {
      if (!email) {
        swal2({
          title: "User is not authenticated",
          html: "<div style='font-size: 16px'>Couldn't retrieve your profile details. <br/> Re-login or try to refresh page</div>",
          type: "error",
          customClass: "b-warning"
        });
      }
      else {
        swal2({
          title: "Is SubutaiTray running?",
          text: response.error,
          type: "error",
          customClass: "b-warning"
        });
      }
    }
  }

  function openSshTunnel(cmd) {
    porto.extension.sendMessage({
      event: "porto-socket-send",
      msg: {
        cmd: cmd
      }
    }, function(response) {
      if (response.error) {
        swal2({
          title: "Is SubutaiTray running?",
          text: response.error,
          type: "error",
          customClass: "b-warning"
        });
      }
      else {
        // code:code%%%error==error_message%%%success==success_message
        var parseStep1 = response.data.split('%%%');
        if (parseStep1.length === 3) {
          var parseError = parseStep1[1].split('==');
          if (parseError[1]) {
            swal2({
              title: "Oops, error " + parseStep1[0],
              text: parseError[1],
              type: "error",
              customClass: "b-warning"
            });
          }
          else {
            swal2({
              title: "Success",
              text: parseStep1[2].split('==')[1],
              type: "success",
              customClass: "b-success"
            });
          }
        }
      }
      console.log(response);
    });
  }

})(window, document);

/**
 * Created by talas on 11/19/15.
 */
/* jshint strict: false */
var porto = porto || {};

porto.subutai = {};

porto.subutai.interval = 2500; // ms
porto.subutai.intervalHubID = 0;
porto.subutai.intervalSSID = 0;

(function(window, document, undefined) {

  var parser = document.createElement('a');
  parser.href = "document.location";
  //parser.protocol; // => "http:"
  //parser.hostname; // => "example.com"
  //parser.port;     // => "3000"
  //parser.pathname; // => "/pathname/"
  //parser.search;   // => "?search=test"
  //parser.hash;     // => "#hash"
  //parser.host;     // => "example.com:3000"

  var cookie = getCookie('su_fingerprint');
  var isSubutaiSocial = $('head > title').text();

  porto.extension.onMessage.addListener(function(request, sender, sendResponse) {
    return handleRequests(request, sender, sendResponse);
  });

  function handleRequests(request, sender, sendResponse) {
    console.log(request);
    switch (request.event) {
      case 'are-you-ss':
        sendResponse({msg: checkIfSubutai()});
        break;
      default:
      //console.log('unknown event:', request);
    }
  }

  function checkIfSubutai() {
    return !!(cookie);
  }

  if (checkIfSubutai()) {

    porto.extension.sendMessage(
      {
        event: 'porto-socket-init',
        url: 'ws://localhost:9998'
      }
    );

    porto.extension.sendMessage({
      event: "associate-peer-key", su_fingerprint: cookie, url: document.location.origin
    });

    $('body').on('click', '.bp-close-modal', function() {
      swal2.closeModal();
    });

    porto.subutai.subutaiSocial = {};

    porto.subutai.subutaiSocial.scanAgent = function() {
      injectSetPublicKeyButton();
      ezSshScanner();
    };

    porto.subutai.subutaiSocial.scanAgent();

    porto.subutai.subutaiSocial.intervalSSID = window.setInterval(function() {
      porto.subutai.subutaiSocial.scanAgent();
    }, porto.subutai.interval);

  }

  porto.extension.sendMessage({event: "get-version"}, function(version) {
    var input = $('#bp-plugin-version');
    if (input.length > 0) {
      input.val(version);
    }
  });

  function registerPublicKey() {
    console.log('register public key');
    var $publicKey = $('#keyContent');
    var stage = $publicKey.data('stage');
    if (stage === 'set-key') {
      $.ajax({
        url: parser.origin + '/rest/ui/identity/set-public-key',
        type: 'POST',
        data: {publicKey: $publicKey.text()}
      })
        .done(function(data, status, xhr) {
          $publicKey.removeData(porto.FRAME_STATUS);
          $publicKey.removeClass('bp-set-pub-key');
          issueDelegateDocument();
        })
        .fail(function(xhr, status, errorThrown) {
          swal2.enableButtons();
          swal2({
            title: "Oops,",
            text: errorThrown,
            type: "error",
            customClass: "b-warning"
          });
        })
        .always(function(xhr, status) {
        });
    }
  }

  function issueDelegateDocument() {
    console.log('create delegate document');
    $.ajax({
      url: parser.origin + '/rest/ui/identity/delegate-identity',
      type: 'POST'
    })
      .done(function(data, status, xhr) {
        getDelegateDocument();
      })
      .fail(function(xhr, status, errorThrown) {
        swal2.enableButtons();
        swal2({
          title: "Oops,",
          text: errorThrown,
          type: "error",
          customClass: "b-warning"
        });
      })
      .always(function(xhr, status) {
      });
  }

  function getDelegateDocument() {
    console.log('get delegate document');
    var $publicKey = $('#keyContent');
    $.ajax({
      url: parser.origin + '/rest/ui/identity/delegate-identity',
      type: 'GET'
    })
      .done(function(data, status, xhr) {
        $publicKey.text(data);
        $publicKey.val(data);
        $publicKey.addClass('bp-sign-target');
        $publicKey.data('stage', 'sign-authid');
        $publicKey.on('change', function() {
          delegateUserPermissions();
        });
      })
      .fail(function(xhr, status, errorThrown) {
        swal2.enableButtons();
        swal2({
          title: "Oops,",
          text: errorThrown,
          type: "error",
          customClass: "b-warning"
        });
      })
      .always(function(xhr, status) {
      });
  }

  function delegateUserPermissions() {
    console.log('delegate permissions');
    var $publicKey = $('#keyContent');
    $.ajax({
      url: parser.origin + '/rest/ui/identity/approve-delegate', type: 'POST',
      data: {signedDocument: $publicKey.val()}
    })
      .done(function(data, status, xhr) {
        swal2.enableButtons();
        swal2({
          title: "Success!",
          showConfirmButton: true,
          text: "System permissions were successfully delegated!",
          type: "success",
          customClass: "b-success"
        }, function() {
        });
      })
      .fail(function(xhr, status, errorThrown) {
        swal2.enableButtons();
        swal2({
          title: "Oops,",
          text: errorThrown,
          type: "error",
          customClass: "b-warning"
        });
      })
      .always(function(xhr, status) {
      });
  }

  function registerClickListener($element) {
    console.log('register click listener');
    $element.on('click', function(e) {
      porto.extension.sendMessage({
        event: 'load-local-content',
        path: 'common/ui/_popup-key-selector.html'
      }, function(content) {
        swal2({
          html: content,
          width: 540,
          showCancelButton: true,
          //buttonsStyling: false,
          closeOnConfirm: false
        }, function() {
          swal2.disableButtons();

          var $publicKey = $('#keyContent');
          var stage = $publicKey.data('stage');
          if (stage === 'set-key') {
            registerPublicKey();
          }
        });
      });
    });
  }

  function injectSetPublicKeyButton() {
    var e2eButtons = $('.e2e-plugin-btn');

    if (e2eButtons.length === 0) {
      var $content = $('.e2e-plugin_action_set-pub-key');
      if ($content.length === 1) {
        console.log('inject set public key button');
        porto.extension.sendMessage({
          event: 'load-local-content',
          path: 'common/ui/inline/_e2e-button-template.html'
        }, function(content) {
          $content.append(content);
          var $e2eBtn = $('.e2e-plugin-btn');
          $e2eBtn.find('.ssh-key-button_title').text('Set Public Key');
          registerClickListener($e2eBtn);
        });
      }
    }
  }

  function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) === ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) === 0) {
        return c.substring(name.length, c.length);
      }
    }
    return "";
  }

  function ezSshScanner() {
    var email = $('[data-hub-email]');
    email = $(email).attr('data-hub-email');
    if (!email) {
      return;
    }

    var $ezSshTable = $('.ez-ssh-table tbody tr');

    for (var i = 0; i < $ezSshTable.length; i++) {
      var $container = $($ezSshTable[i]);
      if ($container.attr('data-dirty') !== 'true') {

        var $btn = $container.find('td .ez-ssh-btn');

        if ($btn.length !== 0) {
          $btn.attr('disabled', false);
          $btn.on('click', function() {
            var that = this;
            porto.extension.sendMessage({
              event: "porto-socket-send",
              msg: {
                cmd: 'cmd:current_user'
              }
            }, function(response) {
              performCheck(that, response);
            });
          });
          $container.attr('data-dirty', 'true');
        }

      }
    }
  }

  function performCheck(that, response) {
    console.log(response);
    var pathParams = parser.pathname;
    var userId = pathParams.split('/');
    var email = $('[data-hub-email]');
    email = $(email).attr('data-hub-email');
    if (email && !response.error) {
      var clientEmail = response.data;
      email = email.toLowerCase();
      clientEmail = clientEmail.toLowerCase();

      console.log('email: ' + email);
      console.log('client email: ' + clientEmail);
      if (email === clientEmail) {
        var $row = $(that.closest('tr'));
        var envId = $row.find('[env-id]').attr('env-id');
        var contId = $row.find('[container-id]').attr('container-id');
        var cmd = 'cmd:ssh%%%' + envId + '%%%' + contId;
        openSshTunnel(cmd);
      }
      else {
        swal2({
          title: "Oops, error ",
          text: "SubutaiTray and Hub user didn't match!?!?",
          type: "error",
          customClass: "b-warning"
        });
      }
    }
    else {
      swal2({
        title: "Is SubutaiTray running?",
        text: response.error,
        type: "error",
        customClass: "b-warning"
      });
    }
  }

  function openSshTunnel(cmd) {
    porto.extension.sendMessage({
      event: "porto-socket-send",
      msg: {
        cmd: cmd
      }
    }, function(response) {
      if (response.error) {
        swal2({
          title: "Is SubutaiTray running?",
          text: response.error,
          type: "error",
          customClass: "b-warning"
        });
      }
      else {
        // code:code%%%error==error_message%%%success==success_message
        var parseStep1 = response.data.split('%%%');
        if (parseStep1.length === 3) {
          var parseError = parseStep1[1].split('==');
          if (parseError[1]) {
            swal2({
              title: "Oops, error " + parseStep1[0],
              text: parseError[1],
              type: "error",
              customClass: "b-warning"
            });
          }
          else {
            swal2({
              title: "Success",
              text: parseStep1[2].split('==')[1],
              type: "success",
              customClass: "b-success"
            });
          }
        }
      }
      console.log(response);
    });
  }

})(window, document);
//# sourceURL=porto-cs.js
