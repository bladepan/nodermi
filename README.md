nodermi
=======

A rmi(Remote Method Invocation) service for node.


No messages, just method invocation. Nodermi makes RPC easy: Remote objects have the same methods as the original objects; Parameters passed to a remote method are automatically converted to remote objects on the server side; You can pass (almost) anything to remote methods.

Remote method invocation is by its nature asynchronous. If you want do something after the remote invocation finishes, use a callback function.

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
registerObject(name, object)
```

### rmi service object : retrieve remote object by name
option : {host, port, [objName]}. callback(error, stubObject)

```javascript
retrieveObj(option, callback)
```

### rmi register class
name : a unique name for the class. class : the class constructor

You need register class in all the processes, and the objects of the class needs to implement *toConstructorArguments* method to dump the object as constructor arguments.
```javascript
registerClass(name, clazz)
```

## Features
### Plain Javascript
You do not to inherit from some special class to make your objects work remotely. No IDL is needed, everything is dynamically generated.


### Automatic Remote Objects
The objects(except for pass by value or pass by implementation objects) you pass as arguments for remote method calls are automatically remote objects seen from the server side. No explicitly registration is needed. 

There is no centralized point, a process could get remote objects from any other process, a process could pass around its local objects or remote references to any other process.

### Pass by value
Simple objects like date, error or none cyclic shallow objects that do not have methods are passed by value in remote method invocations.

### Pass by implementation
You can use *registerClass* API to register classes of objects that need to be passed by implementation. These objects also need to implement a *toConstructorArguments* method to dump their states as constructor arguments.

### Smart Reference
A remote method call will be directly forwarded to the original server where the remote object lives, even the remote object is obtained from some other server. When a "remote" reference is pointing to a local object, the local object is directly used. 

### Garbage Collection
The remote objects that has no remote or local reference will be garbage collected.

### Support Cyclic Objects

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
  server.registerObject('serverObj', serverObj);
  server.registerObject('serverObj2', serverObj2);

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
