/**
 * Listens for events from options UI in sandbox, forwards requests to pgpModel.js
 */

'use strict';

var porto = porto || null;
var options = options || null;

(function(options) {
  // event controller
  var managementTemplate = null;
  var $confirmationTemplate = $('<div></div>');
  var keyringId = null;
  var keysMetadata = [];
  var managementList = [];

  function init() {
    console.log("Keys js initialized...");

    managementTemplate = $('.b-main-table .b-main-table-body').html();

    initRebirthUI();
    $('body').on('click', '.js-advanced-btn', function() {
      $(".js-advanced-hide").toggleClass("js-advanced-show");
    });

    $('body').on('click', '.bp-close-modal-button', function() {
      swal2.closeModal();
    });
  }

  function initRebirthUI() {
    porto.extension.sendMessage({
      event: 'get-version'
    }, function(version) {
      $('#version').text('v' + version);
    });

    porto.appendTpl($confirmationTemplate,
      porto.extension.getURL('common/ui/_popup-confirmation.html'));

    options.registerL10nMessages(
      ['keygrid_key_not_expire', 'keygrid_delete_confirmation', 'keygrid_primary_label',
        'key_set_as_primary']);

    var qs = jQuery.parseQuerystring();

    porto.extension.sendMessage({
      event: 'get-active-keyring'
    }, function(data) {
      keyringId = data || porto.LOCAL_KEYRING_ID;
      if (qs.hasOwnProperty('krid')) {
        keyringId = decodeURIComponent(qs.krid);
      }
      options.keyringId = keyringId;
      options.keyring('getKeys').then(function(data) {
        if (qs.hasOwnProperty('fp')) {
          populateKeyList(data, qs.fp);
        }
        else {
          populateKeyList(data);
        }
      });
    });
  }

  function populateKeyList(keys, preselect) {
    keysMetadata = [];
    console.log(keys);

    var $keysContainer = $('#key-list');
    $keysContainer.children().remove();

    var allElem = $.parseHTML('<option></option>');
    $(allElem).text("All peers");
    $(allElem).attr('data-fingerprint', 'all');
    $keysContainer.append(allElem);

    if (keys) {
      keys.forEach(function(key) {
        var subkeyElem = $.parseHTML('<option></option>');
        $(subkeyElem).text(key.name + " | " + key.email);
        $(subkeyElem).attr('data-fingerprint', key.fingerprint);
        $(subkeyElem).attr('data-key', JSON.stringify(key));
        $keysContainer.append(subkeyElem);
        keysMetadata.push(key);
      });
    }
    $keysContainer.on('change', function() {
      var $element = $(this).find(':selected');
      console.log($element);
      var fingerprint = $element.attr('data-fingerprint');
      pullPeerList().then(function(list) {
        if (fingerprint === 'all') {
          fillPeersTable(list);
        }
        else {
          fillPeersTable(list, fingerprint);
        }
      });
    });
    if (preselect) {
      $keysContainer.find('option[data-fingerprint="' + preselect + '"]').prop('selected', true);
    }
    $keysContainer.change();
  }

  function pullPeerList() {
    return new Promise(function(resolve, reject) {
      options.pgpModel('getManagementList', function(err, data) {
        if (err) {
          reject(err);
        }
        else {
          managementList = data;
          resolve(data);
        }
      });
    });
  }

  function fillPeersTable(peers, filter) {

    console.log(peers);
    var $tableBody = $('.b-main-table .b-main-table-body');
    $tableBody.empty(
      $('.js-empty-table').css({'display': 'none'}),
      $('.b-main-table .b-main-table-body').css({'display': 'table-row-group'})
    );
    if (peers && peers.length <= 0) {
      $('.js-empty-table').css({'display': 'table-row'});
      $('.b-main-table .b-main-table-body').css({'display': 'none'});
      return;
    }
    peers.forEach(function(peer) {
      if (!peer) {
        return;
      }
      if (filter) {
        if (!peer.keys.includes(filter)) {
          return;
        }
      }
      var tableRow = $.parseHTML(managementTemplate);
      $(tableRow).attr('data-site', peer.site);
      $(tableRow).attr('data-keys', JSON.stringify(peer.keys));

      $(tableRow).find('td:nth-child(1) a').text(peer.site);
      $(tableRow).find('td:nth-child(1) a').attr('href', peer.site);

      var styleDefaultCursor = 'style="cursor: default;"';
      if (peer.keys) {
        var keys = null;
        var active = 0;
        keysMetadata.forEach(function(key) {
          peer.keys.forEach(function(associatedKey) {
            if (key.fingerprint === associatedKey) {
              active++;
            }
          });
        });
        var format;
        if (active === 0) {
          format = '<span class="b-tags b-tags_blue" ' +
            styleDefaultCursor +
            '>Active: ' +
            (active) +
            '</span>';
        }
        else {
          format = '<a href="keys.html?peer=' +
            encodeURI(encodeURIComponent(peer.site)) +
            '"><span class="b-tags b-tags_blue" ' +
            '>Active: ' +
            (active) +
            '</span></a>';
        }
        if (active !== peer.keys.length) {
          format += '<span class="b-tags b-tags_red" ' +
            styleDefaultCursor +
            '>Lost: ' +
            (peer.keys.length - active) +
            '</span>';
        }
        keys = $(format);
        $(tableRow).find('td:nth-child(2)').append(keys);
      }

      $(tableRow).find('td:nth-child(3)').on('click', function() {
        console.log($(this).parent());

        var $entryForRemove = $(this).parent();
        console.log($entryForRemove.attr('data-site'));
        var site = $entryForRemove.attr('data-site');

        swal2({
          html: $confirmationTemplate.html(),
          showCancelButton: false,
          showConfirmButton: false,
          closeOnConfirm: true,
          width: 250,
          animation: false,
          buttonsStyling: false
        }, function() {
          var removedArr = managementList.filter(function(management) {
            if (!management) {
              return false;
            }
            return management.site !== site;
          });
          porto.extension.sendMessage({
            event: 'set-management-list', data: removedArr
          });
          pullPeerList().then(function(list) {
            fillPeersTable(list);
          });
        });
      });

      $tableBody.append(tableRow);
    });
  }

  options.keyringId = keyringId;
  options.event.on('ready', init);

}(options));
