/**
 * Created by TalasZh on 3/27/16.
 */
'use strict';
var porto = porto || {};

(function(window, document, undefined) {
  var parser = document.createElement('a');
  parser.href = "document.location";
  var isKurjun = $('head > title').text();
  var $content = $('body > div.b-workspace__content > div');
  var $addUserBtn = $('#add_user_btn');

  if (isKurjun === 'Kurjun' && $addUserBtn.length !== 0) {
    console.log('This is kurjun');
    $('body').on('click', '.bp-close-modal', function() {
      swal2.closeModal();
    });

    injectButton();
  }

  function registerPublicKey() {
    var $publicKey = $('#keyContent');
    var stage = $publicKey.data('stage');
    if (stage === 'set-key') {
      $.ajax({
         url: parser.origin + '/kurjun/rest/identity/user/add',
         data: {username: $publicKey.data('key-name'), key: $publicKey.text()},
         type: 'POST'
       })
       .done(function(data, status, xhr) {
         $publicKey.removeData(porto.FRAME_STATUS);
         $publicKey.text(data);
         $publicKey.val(data);
         $publicKey.removeClass('bp-set-pub-key');
         $publicKey.addClass('bp-sign-target');
         $publicKey.data('stage', 'sign-authid');
         $publicKey.on('change', function() {
           swal2.enableButtons();
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
         console.log("The request is complete!");
       });
    }
  }

  function setCookie(cname, cvalue, hours) {
    var d = new Date();
    d.setTime(d.getTime() + (hours * 60 * 60 * 1000));
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
  }

  function signAuthId() {
    var $publicKey = $('#keyContent');
    $.ajax({
       url: parser.origin + '/kurjun/rest/identity/user/auth',
       data: {fingerprint: $publicKey.data('fingerprint'), message: $publicKey.val()},
       type: 'POST'
     })
     .done(function(data, status, xhr) {
       swal2.enableButtons();
       swal2({
         title: "Logged in",
         showConfirmButton: true,
         text: "Your identity was successfully verified by Kurjun!",
         type: "success"
       }, function() {
         setTimeout(function() {
           location.reload();
         }, 1500);
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
    $element.on('click', function(e) {
      porto.extension.sendMessage({
        event: 'load-local-content',
        path: 'common/ui/_popup-key-selector.html'
      }, function(content) {
        swal2({
          html: content,
          showCancelButton: true,
          confirmButtonText: 'Submit',
          allowOutsideClick: false,
          width: 540,
          //buttonsStyling: false,
          closeOnConfirm: false
        }, function() {
          swal2.disableButtons();

          var $publicKey = $('#keyContent');
          var stage = $publicKey.data('stage');
          if (stage === 'set-key') {
            registerPublicKey();
          }
          else if (stage === 'sign-authid') {
            signAuthId();
          }
        });
      });
    });
  }

  function injectButton() {
    porto.extension.sendMessage({
      event: 'load-local-content',
      path: 'common/ui/inline/_e2e-button-template.html'
    }, function(content) {
      $content.before(content);
      var $e2eBtn = $('.e2e-plugin-btn');
      $e2eBtn.find('.ssh-key-button_title').text('Register');
      registerClickListener($e2eBtn);
    });
  }
})(window, document);
