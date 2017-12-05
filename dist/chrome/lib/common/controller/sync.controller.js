'use strict';

define(function(require, exports, module) {

  var sub = require('./sub.controller');
  var keyringMod = require('../keyring');
  var pwdCache = require('../pwdCache');
  var porto = require('../../porto-lib').porto;

  function SyncController(port) {
    sub.SubController.call(this, port);
    this.keyringId = null;
    this.keyring = null;
    this.syncDoneHandler = {};
    this.pwdControl = null;
    this.syncRunning = false;
    this.repeatSync = null;
    this.TIMEOUT = 8; // sync timeout in seconds
    this.modified = false;
  }

  SyncController.prototype = Object.create(sub.SubController.prototype);

  SyncController.prototype.init = function(keyringId) {
    this.keyringId = keyringId;
    this.keyring = keyringMod.getById(this.keyringId);
  };

  /**
   * @param {Object} options - either undefined, force set or key and password provided
   * @param {Boolean} [options.force] - if newer version on server available force sync
   * @param {openpgp.key.Key} [options.key] - key to decrypt and sign sync message
   * @param {String} [options.password] - password for options.key
   */
  SyncController.prototype.triggerSync = function(options) {
    var that = this;
    options = options || {};
    if (this.syncRunning) {
      this.repeatSync = options;
      return;
    }
    this.modified = this.keyring.sync.data.modified;
    var primKey = this.keyring.getPrimaryKey();
    if (!options.key) {
      // if no key provided we take the primary key
      if (primKey) {
        options.key = primKey.key;
      } else {
        return; // no private key for sync
      }
    } else {
      // check if provided key is primary key, otherwise no sync
      if (!options.key.primaryKey.getKeyId().equals(primKey.key.primaryKey.getKeyId())) {
        return;
      }
    }
    if (!(this.canUnlockKey('decrypt', options) || options.force)) {
      return;
    }
    this.syncRunning = true;
    // reset modified to detect further modification
    this.keyring.sync.data.modified = false;
    this.downloadSyncMessage(options)
      .then(function() {
        if (!that.modified) {
          return;
        }
        if (that.canUnlockKey('sign', options)) {
          return that.uploadSyncMessage(options);
        }
        // upload didn't happen, reset modified flag
        that.keyring.sync.data.modified = true;
      })
      .then(function() {
        that.keyring.sync.save();
        that.checkRepeat();
      })
      .catch(function(err) {
        console.log('Sync error', err);
        if (that.modified || that.keyring.sync.data.modified) {
          that.keyring.sync.data.modified = true;
        }
        that.checkRepeat();
      });
  };

  SyncController.prototype.checkRepeat = function() {
    this.syncRunning = false;
    if (this.repeatSync) {
      var repeat = this.repeatSync;
      this.repeatSync = null;
      this.triggerSync(repeat);
    }
  };

  /**
   * @param {Object} options
   * @param  {Boolean} [options.force] - if newer version on server available force download
   * @param  {openpgp.key.Key} options.key - key to decrypt sync message
   * @param {String} [options.password] - password for options.key
   * @return {Promise<undefined, Error}
   */
  SyncController.prototype.downloadSyncMessage = function(options) {
    var that = this;
    return this.download({eTag: this.keyring.sync.data.eTag})
      .then(function(download) {
        if (!download.eTag) {
          if (that.keyring.sync.data.eTag) {
            // initialize eTag
            that.keyring.sync.data.eTag = '';
            // set modified flag to trigger upload
            that.modified = true;
          }
          return;
        }
        if (!download.keyringMsg) {
          return;
        }
        // new version available on server
        return that.model.readMessage(download.keyringMsg, that.keyringId)
          .then(function(message) {
            message.keyringId = that.keyringId;
            message.reason = 'PWD_DIALOG_REASON_EDITOR';
            if (!message.key.primaryKey.getKeyId().equals(options.key.primaryKey.getKeyId())) {
              console.log('Key used for sync packet from server is not primary key on client');
              if (!this.canUnlockKey('decrypt', {key: message.key}) && !options.force) {
                throw new Error('Key used for sync packet is locked');
              }
            } else {
              message.key = options.key;
              message.password = options.password;
            }
            // unlock key if still locked
            that.pwdControl = sub.factory.get('pwdDialog');
            return that.pwdControl.unlockKey(message);
          })
          .then(function(message) {
            return that.model.decryptSyncMessage(message.key, message.message);
          })
          .then(function(syncPacket) {
            // merge keys
            that.keyring.sync.mute(true);
            that.keyring.importKeys(syncPacket.keys);
            that.keyring.sync.merge(syncPacket.changeLog);
            // remove keys with change log delete entry
            that.keyring.sync.getDeleteEntries().forEach(function(fingerprint) {
              that.keyring.removeKey(fingerprint, 'public');
            });
            that.keyring.sync.mute(false);
            // set eTag
            that.keyring.sync.data.eTag = download.eTag;
          });
      });
  };

  SyncController.prototype.uploadSyncMessage = function(options) {
    var that = this;
    // if key is in cache, specific unlock of sign key packet might be required
    var keyOptions = {
      key: options.key,
      password: options.password,
      keyid: options.key.getSigningKeyPacket().getKeyId().toHex(),
      userid: keyringMod.getUserId(options.key),
      reason: 'PWD_DIALOG_REASON_EDITOR',
      keyringId: this.keyringId
    };
    this.pwdControl = this.pwdControl || sub.factory.get('pwdDialog');
    return this.pwdControl.unlockKey(keyOptions)
      .then(function(message) {
        // encrypt keyring sync message
        return that.model.encryptSyncMessage(message.key, that.keyring.sync.data.changeLog, that.keyringId);
      })
      // upload
      .then(function(armored) {
        return that.upload({eTag: that.keyring.sync.data.eTag, keyringMsg: armored});
      })
      .then(function(result) {
        that.keyring.sync.data.eTag = result.eTag;
      });
  };

  /**
   * Check if key can be unlocked without requesting the password from the user
   * @param  {String} operation - 'decrypt' or 'sign', the operation for which the key is required
   * @param  {Object} options - mandatory
   * @param {openpgp.key.Key} options.key
   * @param {String} [options.password]
   * @return {Boolean} - true if key can be unlocked
   */
  SyncController.prototype.canUnlockKey = function(operation, options) {
    if (options.password) {
      // key can always be unlocked with password
      return true;
    }
    var cacheEntry = pwdCache.get(options.key.primaryKey.getKeyId().toHex());
    if (cacheEntry) {
      return true;
    }
    if (operation === 'sign') {
      var keyPacket = options.key.getSigningKeyPacket();
      return keyPacket && keyPacket.isDecrypted;
    } else if (operation === 'decrypt') {
      var keyPacket = options.key.getEncryptionKeyPacket();
      return keyPacket && keyPacket.isDecrypted;
    }
  };

  SyncController.prototype.sync = function(type, data) {
    var that = this;
    return new Promise(function(resolve, reject) {
      var id = that.porto.util.getHash();
      that.ports.syncHandler.postMessage({
        event: 'sync-event',
        type: type,
        data: data,
        id: id
      });
      that.syncDoneHandler[id] = function(err, data) {
        if (timeout) {
          that.porto.util.clearTimeout(timeout);
        }
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      };
      var timeout = that.porto.util.setTimeout(function() {
        delete that.syncDoneHandler[id];
        reject(new Error('Sync timeout'));
      }, that.TIMEOUT * 1000);
    });
  };

  SyncController.prototype.syncDone = function(data) {
    if (this.syncDoneHandler[data.id]) {
      this.syncDoneHandler[data.id](data.error, data.syncData);
      delete this.syncDoneHandler[data.id];
    }
  };

  SyncController.prototype.upload = function(uploadObj) {
    return this.sync('upload', uploadObj);
  };

  SyncController.prototype.download = function(downloadObj) {
    return this.sync('download', downloadObj);
  };

  SyncController.prototype.backup = function(backupObj) {
    return this.sync('backup', backupObj);
  };

  SyncController.prototype.restore = function() {
    return this.sync('restore');
  };

  SyncController.prototype.handlePortMessage = function(msg) {
    //console.log('sync.controller::' + msg.event);
    //console.log(msg);
    //console.trace();
    //console.log('sync.controller handlePortMessage msg', msg);
    switch (msg.event) {
      case 'init':
        this.init(msg.keyringId);
        break;
      case 'sync-done':
        this.syncDone(msg.data);
        break;
      default:
        console.log('unknown event', msg);
    }
  };

  function getByKeyring(keyringId) {
    return sub.getByMainType('syncHandler').filter(function(obj) {
      return obj.keyringId === keyringId;
    })[0];
  }

  /**
   * @param {Object} options
   * @param {String} options.keyringId identifies the keyring to sync
   * @param {boolean} [options.force] - if newer version on server available force sync
   * @param {Key} [options.key] - unlocked private key used for sync
   * @param {String} [options.password] - password for options.key
   */
  function triggerSync(options) {
    var syncCtrl = getByKeyring(options.keyringId);
    if (syncCtrl) {
      porto.util.setTimeout(function() {
        syncCtrl.triggerSync(options);
      }, 20);
    }
  }

  exports.SyncController = SyncController;
  exports.getByKeyring = getByKeyring;
  exports.triggerSync = triggerSync;

});
