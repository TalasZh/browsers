'use strict';

var porto = porto || null;

(function() {
  var crx = typeof chrome !== 'undefined';
  var sfx = typeof safari !== 'undefined' && safari !== null;

  if (sfx) {
    crx = false;
  }

  var activeState;
  var sendMessage;
  var logEntryTmpl;
  var logEmptyTmpl;

  if (sfx) {
    sendMessage = function(msg) {
      safari.extension.globalPage.contentWindow.postMessage(msg, window.location.origin);
    };
    window.addEventListener("message", function(message) {
      messageListener(message.data);
    });
  }
  else if (!crx) {
    // Firefox
    sendMessage = function(msg) {
      addon.postMessage(msg);
    };
    addon.on('message', messageListener);
  }
  else {
    // Chrome
    sendMessage = function(msg) {
      chrome.runtime.sendMessage(msg, messageListener);
    };
  }

  function init() {
    $('#showlog').hide();
    $('.popup')
      .off()
      .on('click', 'a', function(event) {
        if (porto.crx) {
          hide();
        }
        else {
          sendMessage({event: 'close-popup'});
        }
      })
      .on('click', 'button', function(event) {
        // id of dropdown entry = action
        if (this.id === 'state' || this.id === '' || this.id === 'subutai-reload') {
          return;
        }
        var message = {
          event: 'browser-action',
          action: this.id
        };
        sendMessage(message);
        hide();
      });

    if (porto.crx || porto.sfx) {
      porto.l10n.localizeHTML();
    }

    if (logEntryTmpl === undefined) {
      logEntryTmpl = $('#activityLog .logEntry').parent().html();
    }

    if (logEmptyTmpl === undefined) {
      logEmptyTmpl = $('#emptySecurityLog').parent().html();
    }

    sendMessage({event: 'get-prefs'});
    sendMessage({event: 'get-ui-log'});

    $('#subutai-reload').on('click', function() {
      sendMessage({
        event: "popup-socket-send",
        msg: {
          cmd: 'cmd:ss_ip'
        }
      });
    });

    $('#state')
      .off()
      .on('click', function() {
        var msg;
        if (activeState) {
          msg = {event: 'deactivate'};
        }
        else {
          msg = {event: 'activate'};
        }
        activeState = !activeState;
        handleAppActivation();
        sendMessage(msg);
        hide();
      });

    $('[data-toggle="tooltip"]').tooltip();

    sendMessage({event: "get-version-popup"});
    sendMessage({event: 'porto-socket-init', url: 'ws://localhost:9998'});
  }

  function hide() {
    if (crx) {
      $(document.body).fadeOut(function() {
        window.close();
      });
    }
  }

  function handleAppActivation() {
    if (activeState) {
      $('#state .glyphicon').removeClass('glyphicon-unchecked').addClass('glyphicon-check');
      $('#add').removeClass('disabled').css('pointer-events', 'auto');
      $('#reload').removeClass('disabled').css('pointer-events', 'auto');
    }
    else {
      $('#state .glyphicon').removeClass('glyphicon-check').addClass('glyphicon-unchecked');
      $('#add').addClass('disabled').css('pointer-events', 'none');
      $('#reload').addClass('disabled').css('pointer-events', 'none');
    }
  }

  function messageListener(msg) {
    //console.log("popup::messageListener");
    console.log(msg);
    if (!msg || msg === undefined || !msg.event || msg.event === undefined) {
      return;
    }
    switch (msg.event) {
      case 'init':
        init();
        sendMessage({event: "popup-active-tab"});
        break;
      case 'get-prefs':
        activeState = msg.prefs.main_active;
        handleAppActivation();
        break;
      case 'get-ui-log':
        var logEntry;
        var cnt = 0;
        $('#activityLog').empty();
        if (!msg.secLog || msg.secLog.length === 0) {
          $('#activityLog').append(logEmptyTmpl);
        }
        msg.secLog.reverse().forEach(function(entry) {
          $('#showlog').show();
          if (cnt < 7) {
            logEntry = $.parseHTML(logEntryTmpl);
            $(logEntry).find('.timestamp').text((new Date(entry.timestamp)).toLocaleTimeString());
            $(logEntry).find('.logDescription').text(entry.typei18n);
            $('#activityLog').append(logEntry);
          }
          cnt++;
        });
        break;
      case 'get-version-popup':
        var input = $('#version');
        if (input) {
          input.text(msg.version);
        }
        console.log(msg);
        break;
      case 'popup-socket-send':
        openTab(msg);
        break;
      case "popup-active-tab":
        sendMessage({event: "popup-message-tab", tab: msg.activeTab, msg: {event: "are-you-ss"}});
        break;
      case "popup-message-tab":
        disableEnableBtn(msg.response);
        break;
      default:
        console.error("Unknown popup handle event: " + msg);
        break;
    }
  }

  function isURL(str) {
    var pattern = new RegExp('^(https?:\\/\\/)?' + // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.?)+[a-z]{2,}|' + // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
    '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator
    return pattern.test(str);
  }

  function disableEnableBtn(response) {
    if (response.msg) {
      console.log("button enabled");
      $('#subutai-reload').show();
    }
    else {
      console.log("button disabled");
      $('#subutai-reload').hide();
    }
  }

  function openTab(msg) {
    var response = msg.response;
    var baseUrl = window.location.origin + window.location.pathname;

    var parseStep1 = response.data.split('%%%');
    if (parseStep1.length === 3) {
      var parseError = parseStep1[1].split('==');
      if (parseError[1]) {
        console.error(parseStep1[0]);
      }
      else {
        var responseString = parseStep1[2].split('==')[1];
        console.log(responseString);
        if (isURL(responseString) && baseUrl !== responseString) {
          sendMessage({event: "open-tab", link: responseString});
        }
      }
    }
  }

  $(document).ready(init);

}());
