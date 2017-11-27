'use strict';

define(function(require, exports, module) {

  var sub = require('./sub.controller');

  function MainCsController(port) {
    sub.SubController.call(this, port);
  }

  MainCsController.prototype = Object.create(sub.SubController.prototype);

  MainCsController.prototype.handlePortMessage = function(msg) {
    //console.log('mainCs.controller::' + msg.event);
    //console.log(msg);
    //console.trace();
    switch (msg.event) {
      case 'get-prefs':
        this.ports.mainCS.postMessage({
          event: 'set-prefs',
          prefs: this.prefs.data(),
          watchList: this.model.getWatchList()
        });
        break;
      default:
        console.log('unknown event', msg);
    }
  };

  exports.MainCsController = MainCsController;

});
