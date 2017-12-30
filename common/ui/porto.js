/* jshint strict: false */

var porto = porto || {};

if (!porto.typeLoaded) {
  // web extension
  porto.webex = typeof browser !== 'undefined';
  // safari extension
  porto.sfx = typeof safari !== 'undefined';
  // chrome extension
  porto.crx = !porto.webex && typeof chrome !== 'undefined';
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

porto.extension = porto.extension || chrome.runtime;

porto.l10n = porto.l10n || {
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

porto.util.csGetHash = function() {
  return new Promise(function(resolve, reject) {
    porto.extension.sendMessage({event: "gen-hash"}, function(hash) {
      resolve(hash);
    });
  });
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
