'use strict';

var porto = porto || {};

porto.EncryptFrame = function(prefs) {
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
  var that = this;
  return new Promise(function(resolve, reject) {
    porto.util.csGetHash().then(function(hash) {
      that.id = hash;
      resolve(that);
    });
  });
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
  if (porto.crx || porto.sfx || porto.webex) {
    url = porto.extension.getURL('common/ui/inline/dialogs/' + dialog + '.html?id=' + this.id);
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
