nodermi
=======

A rmi(Remote Method Invocation) service for node

It is designed to handle complex communication patterns, a group of servers can talk to each other and pass around remote objects.

No messages, just method invocation.

## API
### Initialize
option{host, port}; callback(error, rmiService)

```javascript
var nodermi = require('nodermi');
nodermi.createRmiService(option, callback);
```

### rmi service object : register object
name : name for this object, client use this name to lookup remote object.
Register entry point to the service you want to expose.

```javascript
createSkeleton(name, object)
```

### rmi service object : lookup object
option : {host, port, [objName]}. callback(error, stubObject)

```javascript
retrieveObj(option, callback)
```

## Features
### Plain Javascript
You do not to inherit some special class to make your objects work remotely. However, if you want to return something to a remote site, *use callbacks*! Remember, modifications on properties will not be synchronized.

### Automatic Remote Objects
The objects you get from a remote method call are automatically remote objects.
The objects you pass as parameters for remote method calls are automatically remote objects seen from the server side. No explicitly registration is needed. You can start from a bootstrap object(created by createSkeleton, fetched by retrieveObj), and create remote objects by calling methods.

There is no distinction between client and server, there is no centralized point, a process could get remote objects from any other process, a process could pass around its local objects or remote references to any other process.

### Smart Reference
A remote method call will be directly forwarded to the original server where the remote object lives, even the remote object is obtained from some other server. When a "remote" reference is pointing to a local object, the local object is directly used. 

### Garbage Collection
The remote objects that has no remote or local reference will be garbage collected.

### Serialization Control
You can control what to send over network by nodermi by add '__r_include', '__r_skip' fields to your objects. By default, properties and methods with '_' prefixed name are omitted. Set '__r_mode' to 'methods' to serialize only methods in that object.


## Protocol
We use protobuf to encode our internal messages, the protocol definition is here [message.proto](lib/message.proto). We use [dcodeIO's protobuf implementationn](https://github.com/dcodeIO/ProtoBuf.js).


## Sample

```javascript
var nodermi = require('nodermi');

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
```
