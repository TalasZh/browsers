'use strict';

define(function(require, exports, module) {

  var porto = require('../porto-lib').porto;
  var model = require('./pgpModel');
  var openpgp = require('openpgp');

  var defaults = null;

  function getRandomAngle() {
    var angle = openpgp.crypto.random.getSecureRandom(0, 120) - 60;
    if (angle < 0) {
      angle += 360;
    }
    return angle;
  }

  function initSecurityBgnd(pref) {
    pref.security.secureBgndScaling     = pref.security.secureBgndScaling    || (openpgp.crypto.random.getSecureRandom(9, 20) / 10);
    pref.security.secureBgndWidth       = pref.security.secureBgndWidth      || 45;
    pref.security.secureBgndHeight      = pref.security.secureBgndHeight     || 45;
    pref.security.secureBgndColor       = pref.security.secureBgndColor      || defaults.preferences.security.secureBgndColor;
    pref.security.secureBgndIconColor   = pref.security.secureBgndIconColor  || defaults.preferences.security.secureBgndIconColor;

    if (typeof pref.security.secureBgndAngle === 'undefined') {
      pref.security.secureBgndAngle = getRandomAngle();
    }

    if (typeof pref.security.secureBgndColorId === 'undefined') {
      pref.security.secureBgndColorId = defaults.preferences.security.secureBgndColorId;
    }
  }

  function init() {
    defaults = porto.data.loadDefaults();
    var prefs = model.getPreferences();
    if (!prefs) {
      prefs = defaults.preferences;
      prefs.version = defaults.version;
      initSecurityBgnd(prefs);
      model.setWatchList(defaults.watch_list);
    } else {
      if (prefs.version !== defaults.version) {
        prefs.version = defaults.version;
        prefs.general.editor_type = porto.PLAIN_TEXT;

        initSecurityBgnd(prefs);

        if (typeof prefs.main_active == 'undefined') {
          prefs.main_active = defaults.preferences.main_active;
        }

        // merge watchlist on version change
        mergeWatchlist(defaults);
      }
    }
    model.setPreferences(prefs);
  }

  function mergeWatchlist(defaults) {
    var mod = false;
    var localList = model.getWatchList() || [];
    defaults.watch_list.forEach(function(defaultSite) {
      var localSite = localList.find(function(localSite) {
        return localSite.site === defaultSite.site;
      });
      if (localSite) {
        defaultSite.frames.forEach(function(defaultFrame) {
          localSite.frames = localSite.frames || [];
          var localFrame = localSite.frames.find(function(localFrame) {
            return localFrame.frame === defaultFrame.frame;
          });
          if (!localFrame) {
            localSite.frames.push(defaultFrame);
            mod = true;
          } else {
            if (typeof localFrame.api === 'undefined') {
              localFrame.api = false;
              mod = true;
            }
          }
        });
      } else {
        localList.push(defaultSite);
        mod = true;
      }
    });
    if (mod) {
      model.setWatchList(localList);
    }
  }

  // polyfill https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
  if (!Array.prototype.find) {
    Array.prototype.find = function(predicate) {
      if (this === null) {
        throw new TypeError('Array.prototype.find called on null or undefined');
      }
      if (typeof predicate !== 'function') {
        throw new TypeError('predicate must be a function');
      }
      var list = Object(this);
      var length = list.length >>> 0;
      var thisArg = arguments[1];
      var value;

      for (var i = 0; i < length; i++) {
        value = list[i];
        if (predicate.call(thisArg, value, i, list)) {
          return value;
        }
      }
      return undefined;
    };
  }

  function getVersion() {
    return defaults.version;
  }

  exports.init = init;
  exports.getVersion = getVersion;

});
