var assert = require('assert');

var rminode = require('../lib/main');
var ServerIdentifier = require("../lib/common").ServerIdentifier;

var serverConf = new ServerIdentifier('localhost', 7000);

rminode.createRmiService(serverConf, function(err, server) {
  assert(err == null, "should success on the fist try");
  return rminode.createRmiService(serverConf, function(err) {
    assert(err!=null, "should fail if the port is occupied.");
    server.close();
  });
});
