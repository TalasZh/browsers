'use strict';

define(function(require, exports, module) {

  var porto = require('../porto-lib').porto;

  function randomString(length) {
    var result = '';
    var base = 32;
    var buf = new Uint8Array(length);
    porto.util.getDOMWindow().crypto.getRandomValues(buf);
    for (var i = 0; i < buf.length; i++) {
      result += (buf[i] % base).toString(base);
    }
    return result;
  }

  exports.randomString = randomString;

});
