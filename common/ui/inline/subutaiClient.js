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
