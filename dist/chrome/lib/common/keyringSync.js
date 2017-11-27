'use strict';

define(function(require, exports, module) {

  var keyringMod = require('./keyring');
  var syncCtrl = require('./controller/sync.controller');

  var INSERT = 'INSERT';
  var DELETE = 'DELETE';
  var UPDATE = 'UPDATE';

  function KeyringSync(keyringId) {
    this.keyringId = keyringId;
    this.SYNC_DATA = 'sync_data';
    this.data = keyringMod.getKeyringAttr(this.keyringId, this.SYNC_DATA);
    this.muted = false;
  }

  KeyringSync.prototype.activate = function() {
    if (!this.data) {
      this.data = {
        eTag: '',
        changeLog: {},
        modified: false
      };
    }
    this.save();
  };

  KeyringSync.prototype.add = function(keyid, type) {
    if (!this.data || this.muted) {
      return;
    }
    if (!(type === INSERT || type === DELETE || type === UPDATE)) {
      throw new Error('Unknown log entry type');
    }
    this.data.modified = true;
    if (type === UPDATE) {
      return;
    }
    keyid = keyid.toLowerCase();
    this.data.changeLog[keyid] = {
      type: type,
      time: Math.floor(Date.now() / 1000)
    };
  };

  KeyringSync.prototype.save = function() {
    if (!this.data) {
      return;
    }
    var data = {};
    data[this.SYNC_DATA] = this.data;
    keyringMod.setKeyringAttr(this.keyringId, data);
  };

  KeyringSync.prototype.commit = function() {
    if (!this.data || this.muted) {
      return;
    }
    this.save();
    syncCtrl.triggerSync({keyringId: this.keyringId});
  };

  KeyringSync.prototype.merge = function(update) {
    if (!this.data) {
      return;
    }
    for (var fingerprint in update) {
      if (!this.data.changeLog[fingerprint] || (this.data.changeLog[fingerprint].time < update[fingerprint].time)) {
        this.data.changeLog[fingerprint] = update[fingerprint];
      }
    }
  };

  KeyringSync.prototype.getDeleteEntries = function() {
    var result = [];
    for (var fingerprint in this.data.changeLog) {
      if (this.data.changeLog[fingerprint].type === DELETE) {
        result.push(fingerprint);
      }
    }
    return result;
  };

  KeyringSync.prototype.mute = function(muted) {
    this.muted = muted;
  };

  exports.KeyringSync = KeyringSync;
  exports.INSERT = INSERT;
  exports.DELETE = DELETE;
  exports.UPDATE = UPDATE;

});
