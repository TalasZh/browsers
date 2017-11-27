'use strict';

define(function(require, exports, module) {

  var sub = require('./sub.controller');
  var keyringMod = require('../keyring');
  var keyringSync = require('../keyringSync');
  var openpgp = require('openpgp');
  var uiLog = require('../uiLog');

  function ImportController(port) {
    sub.SubController.call(this, port);
    if (!port) {
      this.mainType = 'importKeyDialog';
      this.id = this.porto.util.getHash();
    }
    this.armored = '';
    this.done = null;
    this.importPopup = null;
    this.keyringId = '';
    this.keyring = null;
    this.key = null;
    this.keyDetails = null;
    this.importError = false;
    this.invalidated = false;
  }

  ImportController.prototype = Object.create(sub.SubController.prototype);

  ImportController.prototype.handlePortMessage = function(msg) {
    var that = this;
    //console.log('import.controller::' + msg.event);
    //console.log(msg);
    //console.trace();
    switch (msg.event) {
      case 'sign-armored-public-key':
        var keyring = keyringMod.getById(sub.getActiveKeyringId());
        var keys = keyring.getArmoredKeys([], {pub: true, priv: true, all: true});

        var keyPair = keys[0].armoredPublic + '\n' + keys[0].armoredPrivate;
        var targetKey = openpgp.key.readArmored (msg.data).keys[0];
        var privateKey = openpgp.key.readArmored (keys[0].armoredPrivate).keys[0];

        var signedKey = that.signPublicKey(targetKey, privateKey);
        //console.log(signedKey);
        console.log(signedKey.toPublic().armor());
        break;
      case 'imframe-armored-key':
        this.porto.tabs.loadOptionsTab('#importKey', function(old, tab) {
          that.porto.tabs.sendMessage(tab, {
            event: 'import-key',
            armored: msg.data,
            id: that.id
          }, function(msg) {
            var resultType = {};
            for (var i = 0; i < msg.result.length; i++) {
              resultType[msg.result[i].type] = true;
            }
            that.ports.imFrame.postMessage({event: 'import-result', resultType: resultType});
          });
        });
        break;
      case 'key-import-dialog-init':
        this.ports.importKeyDialog.postMessage({event: 'key-details', key: this.keyDetails, invalidated: this.invalidated});
        break;
      case 'key-import-dialog-ok':
        var importResult = this.keyring.importKeys([{type: 'public', armored: this.armored}])[0];
        if (importResult.type === 'error') {
          this.ports.importKeyDialog.postMessage({event: 'import-error', message: importResult.message});
          this.importError = true;
        } else {
          this.closePopup();
          this.done(null, 'IMPORTED');
        }
        break;
      case 'key-import-dialog-cancel':
        this.closePopup();
        if (this.invalidated) {
          this.done(null, 'INVALIDATED');
        } else if (this.importError) {
          this.done({message: 'An error occured during key import', code: 'IMPORT_ERROR'});
        } else {
          this.done(null, 'REJECTED');
        }
        break;
      case 'key-import-user-input':
        uiLog.push(msg.source, msg.type);
        break;
      default:
        console.log('unknown event', msg);
    }
  };

  ImportController.prototype.closePopup = function() {
    if (this.importPopup) {
      try {
        this.importPopup.close();
      } catch (e) {}
      this.importPopup = null;
    }
  };

  ImportController.prototype.importKey = function(keyringId, armored, callback) {
    var that = this;
    try {
      this.keyringId = keyringId;
      // check keyringId
      this.keyring = keyringMod.getById(keyringId);
      this.armored = armored;
      this.done = callback;

      this.keys = openpgp.key.readArmored(this.armored);
      if (this.keys.err) {
        throw new Error(this.keys.err[0].message);
      }
      this.key = this.keys.keys[0];
      this.keyDetails = keyringMod.mapKeys(this.keys.keys)[0];
      if (this.keyDetails.type === 'private') {
        throw new Error('Import of private keys not allowed.');
      }
      if (this.keys.keys.length > 1) {
        console.log('Multiple keys detected during key import, only first key is imported.');
        // only import first key in armored block
        this.armored = this.key.armor();
      }
      if (this.key.verifyPrimaryKey() === openpgp.enums.keyStatus.invalid) {
        throw new Error('Key is invalid.');
      }
      // check if key already in keyring
      var fingerprint = this.key.primaryKey.getFingerprint();
      var stockKey = this.keyring.keyring.getKeysForId(fingerprint);
      if (stockKey) {
        stockKey = stockKey[0];
        this.updateKey(fingerprint, stockKey, this.key, callback);
      } else {
        this.openPopup();
      }
    } catch (err) {
      callback({message: err.message, code: 'IMPORT_ERROR'});
    }
  };

  ImportController.prototype.updateKey = function(fingerprint, stockKey, newKey, callback) {
    var that = this;
    var statusBefore = stockKey.verifyPrimaryKey();
    var beforeLastModified = this.model.getLastModifiedDate(stockKey);
    var stockKeyClone = keyringMod.cloneKey(stockKey);
    stockKeyClone.update(newKey);
    var statusAfter = stockKeyClone.verifyPrimaryKey();
    var afterLastModified = this.model.getLastModifiedDate(stockKeyClone);
    if (beforeLastModified.valueOf() === afterLastModified.valueOf()) {
      // key does not change, we still reply with status UPDATED
      // -> User will no be notified
      callback(null, 'UPDATED');
      return;
    }
    if (statusBefore !== openpgp.enums.keyStatus.valid &&
        statusAfter === openpgp.enums.keyStatus.valid) {
      // an invalid key gets status valid due to this key import
      // -> User confirmation required
      this.openPopup();
      return;
    }
    stockKey.update(newKey);
    this.keyring.sync.add(fingerprint, keyringSync.UPDATE);
    this.keyring.keyring.store();
    this.keyring.sync.commit();
    if (statusBefore === openpgp.enums.keyStatus.valid &&
        statusAfter !== openpgp.enums.keyStatus.valid) {
      // the key import changes the status of the key to not valid
      // -> User will be notified
      this.invalidated = true;
      this.openPopup();
    } else {
      // update is non-critical, no user confirmation required
      callback(null, 'UPDATED');
    }
  };

  ImportController.prototype.openPopup = function() {
    var that = this;
    this.porto.windows.openPopup('common/ui/modal/importKeyDialog.html?id=' + this.id, {width: 535, height: 458, modal: false}, function(window) {
      that.importPopup = window;
    });
  };

  ImportController.prototype.signPublicKey = function(public_key, private_key) {
    // Returns a new public key which is public_key + signature(public_key)
    var dataToSign = {};
    dataToSign.userid = public_key.users[0].userId;
    dataToSign.key = public_key.primaryKey;

    var signaturePacket = new openpgp.packet.Signature();
    signaturePacket.signatureType = openpgp.enums.signature.cert_generic;
    signaturePacket.publicKeyAlgorithm = 1;
    signaturePacket.hashAlgorithm = 2;
    signaturePacket.keyFlags =
      [openpgp.enums.keyFlags.certify_keys | openpgp.enums.keyFlags.sign_data];
    signaturePacket.preferredSymmetricAlgorithms = [];
    signaturePacket.preferredSymmetricAlgorithms.push(openpgp.enums.symmetric.aes256);
    signaturePacket.preferredSymmetricAlgorithms.push(openpgp.enums.symmetric.aes192);
    signaturePacket.preferredSymmetricAlgorithms.push(openpgp.enums.symmetric.aes128);
    signaturePacket.preferredSymmetricAlgorithms.push(openpgp.enums.symmetric.cast5);
    signaturePacket.preferredSymmetricAlgorithms.push(openpgp.enums.symmetric.tripledes);
    signaturePacket.preferredHashAlgorithms = [];
    signaturePacket.preferredHashAlgorithms.push(openpgp.enums.hash.sha256);
    signaturePacket.preferredHashAlgorithms.push(openpgp.enums.hash.sha1);
    signaturePacket.preferredHashAlgorithms.push(openpgp.enums.hash.sha512);
    signaturePacket.preferredCompressionAlgorithms = [];
    signaturePacket.preferredCompressionAlgorithms.push(openpgp.enums.compression.zlib);
    signaturePacket.preferredCompressionAlgorithms.push(openpgp.enums.compression.zip);

    var keyPacket = private_key.getSigningKeyPacket();
    keyPacket.mpi.unshift(public_key.primaryKey.mpi[1]);
    keyPacket.mpi.unshift(public_key.primaryKey.mpi[0]);

    signaturePacket.sign(keyPacket, dataToSign, private_key.primaryKey.mpi);

    var originalPackets = public_key.toPacketlist();
    var packetlist = new openpgp.packet.List();
    for (var i = 0; i < originalPackets.length; i++) {
      packetlist.push(originalPackets[i]);
    }
    packetlist.push(public_key.users[0].userId);
    packetlist.push(signaturePacket);
    return new openpgp.key.Key(packetlist);
  };

  exports.ImportController = ImportController;

});
