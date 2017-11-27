/**
 * Created by ape-craft on 3/30/16.
 */
/**
 * Created by talas on 11/19/15.
 */
/* jshint strict: false */
var porto = porto || {};

porto.trayPort = {};

porto.trayPort.interval = 2500; // ms
porto.trayPort.intervalHubID = 0;
porto.trayPort.intervalSSID = 0;

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

  porto.extension.sendMessage({event: "get-version"}, function(version) {
    var input = $('#bp-plugin-version');
    if (input.length > 0) {
      input.val(version);
    }
  });

  console.log("ORIGIN: " + parser.origin);
  if (parser.origin === "https://hub.subut.ai" || parser.origin === "https://dev.subut.ai" || parser.origin === "https://stage.subut.ai") {
    porto.extension.sendMessage(
      {
        event: 'porto-socket-init',
        url: 'ws://localhost:9998'
      }
    );
    porto.trayPort.intervalHubID = window.setInterval(function() {
      porto.trayPort.scanLoop();
    }, porto.trayPort.interval);
  }

  porto.trayPort.scanLoop = function() {
    var containers = $('.bp-env-cntr-ssh tbody tr');

    for (var i = 0; i < containers.length; i++) {
      var $container = $(containers[i]);
      if ($container.attr('data-dirty') !== 'true') {
        // 1: name, 2: template, 3: size, 4: status, 5: ip
        var $btn = $container.find('td .e2e-plugin-btn');
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

  };

  function performCheck(that, response) {
    console.log(response);
    var pathParams = parser.pathname;
    var userId = pathParams.split('/');
    // var email = $(
    //   'body > div.b-content.b-content_minus-header.g-full-height > div.b-sidebar.b-sidebar_border-right.g-left.g-full-height > div > div > div.b-sidebar-profile__header.g-padding > div > div.b-sidebar-profile-header__info.g-margin-bottom > div > div.b-sidebar-profile-header-info__location > ul > li > a');
    var email = $('#e2e-plugin-email-hub-field');
    email = $(email).attr('data-email');
    console.log('hub email: ' + email);
    if (email && !response.error) {
      var trayEmail = response.data;
      email = email.toLowerCase();
      trayEmail = trayEmail.toLowerCase();
      console.log('tray email: ' + trayEmail);
      if (email === trayEmail) {
        var row = $(that.closest('tr'));
        var envName = $('.b-sidebar-profile-header-name').text().trim();
        var environmentId = $('#e2e-plugin-hub-environment-name');

        if (environmentId.length > 0) {
          envName = environmentId.val();
        } else if (userId[3] === 'environments') {
          envName = userId[4];
        }
        console.log('environment: ' + envName);

        var cmd = 'cmd:ssh%%%' + envName + '%%%' + row.attr('data-container-id');
        openSshTunnel(cmd);
      }
      else {
        swal2({
          title: "Authentication error ",
          text: "SubutaiTray and Hub user didn't match!?!?",
          type: "error",
          customClass: "b-warning"
        });
      }
    }
    else {
      if (!email) {
        swal2({
          title: "User is not authenticated",
          html: "<div style='font-size: 16px'>Couldn't retrieve your profile details. <br/> Re-login or try to refresh page</div>",
          type: "error",
          customClass: "b-warning"
        });
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
