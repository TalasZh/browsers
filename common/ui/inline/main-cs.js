'use strict';

var porto = porto || {};

porto.main = {};

porto.main.interval = 2500; // ms
porto.main.intervalID = 0;
porto.main.regex = /END\sPGP/;
porto.main.minEditHeight = 84;
porto.main.contextTarget = null;
porto.main.prefs = null;
porto.util.csGetHash().then(function(hash) {
  porto.main.name = 'mainCS-' + hash;
});
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
    new porto.EncryptFrame(porto.main.prefs).then(function(frame) {
      var eFrame = frame;
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
