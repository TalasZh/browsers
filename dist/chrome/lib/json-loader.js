'use strict';

define({
  load: function(name, req, load, config) {
    req(['jquery'], function($) {
      $.get(chrome.extension.getURL(name), function(data) {
        load(data);
      }, 'json');
    });
  }
});
