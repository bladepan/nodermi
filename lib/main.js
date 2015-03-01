/*
remote Object Stub
{
  __r_id
  __r_host
  __r_port
  __r_type : 'object'
},
__r_id will also be writen to local objects when they are
transmitted.
*/

(function() {
  var Server;

  Server = require('./server');

  exports.createRmiService = function(options, callback) {
    return new Server(options, callback);
  };

}).call(this);
