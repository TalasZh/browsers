'use strict';

define(function(require, exports, module) {

  var porto = require('../porto-lib').porto;
  var defaults = require('./defaults');
  var model = require('./pgpModel');
  var prefs = null;
  var updateHandlers = [];

  function init() {
    prefs = model.getPreferences();
  }

  /**
   * Update preferences
   * @param  {Object} obj preferences object or properties of it
   */
  function update(obj) {
    prefs = model.getPreferences();
    if (obj.security) {
      prefs.security = porto.util.extend(prefs.security, obj.security);
    }
    if (obj.general) {
      prefs.general = porto.util.extend(prefs.general, obj.general);
    }
    if (typeof obj.main_active !== 'undefined') {
      prefs.main_active = obj.main_active;
    }
    model.setPreferences(prefs);
    // notifiy update handlers
    updateHandlers.forEach(function(fn) {
      fn();
    });
  }

  /**
   * Register for preferences updates
   * @param {Function} fn handler
   */
  function addUpdateHandler(fn) {
    updateHandlers.push(fn);
  }

  function data() {
    return prefs;
  }

  exports.init = init;
  exports.update = update;
  exports.addUpdateHandler = addUpdateHandler;
  exports.data = data;

});
