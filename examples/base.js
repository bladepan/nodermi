// in real life it should be
// var nodermi = require('nodermi');
var nodermi = require('../lib/main');


var serverConf = {
  host: 'localhost',
  port: 7000
};

var clientConf = {
  host: 'localhost',
  port: 8000
};

var serverObj = {
  print: function(str) {
    console.log("print " + str);
  },
  // return the obj in the arguments by callback
  echo: function(obj, callback) {
    console.log("get object: " + obj.name);
    callback(null, obj);
  },
  // this obj could be a remote object!
  invoke: function(obj, callback) {
    console.log("calling doSomething of another object.");
    obj.doSomething(callback);
  }
};

// a cyclic object
var serverObj2 = {
  name: "obj2"
};
serverObj2.ref = serverObj2;


nodermi.createRmiService(serverConf, function(err, server) {
  // register objects with names for clients to lookup
  server.createSkeleton('serverObj', serverObj);
  server.createSkeleton('serverObj2', serverObj2);

  // create client rmi instance after the server rmi service is created
  nodermi.createRmiService(clientConf, function(err, client) {
    // create a request to retive remote object
    var retrieveRequest = serverConf;
    retrieveRequest.objName = 'serverObj';
      
    client.retrieveObj(retrieveRequest, function(err, stub) {
      // call serverObj.print
      stub.print("something on client");
      var localObj = {
        name: 'a local object',
        doSomething: function(callback) {
          console.log("i am doing something");
          callback(null);
        }
      };
      stub.echo(localObj, function(err, returned) {
        // the remote function pass back the local object
        console.log("get from server " + (JSON.stringify(returned)));
        // localObj === returned evaluates as true
        console.log("returned is identical to localObj " + (localObj === returned));
      });
      // the local is passed over to the server, and the server will call its doSomething
      stub.invoke(localObj, function(err) {
        console.log("invoke ends");
      });
    });

    var retrieveAllRequest = serverConf;
    retrieveAllRequest.objName = null;
    // this time retrieve all objects
    client.retrieveObj(retrieveAllRequest, function(err, stub) {
       // prints out "obj2", cyclic reference is handled nicely
       console.log(stub.serverObj2.ref.name);
    });
  });
});