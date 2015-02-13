var Decoder, Encoder, ObjectRegistry, bufferedObj, decoded, decoder, 
destObj, destination, encoded, euqalsResult, localObj, pojo, remoteObj, 
serialized, serializer, server;

var assert = require("assert");

var lodash = require('lodash');

Encoder = require('../lib/encoding');
Decoder = require('../lib/decoding');
ObjectRegistry = require('../lib/object_registry');
var ServerIdentifier = require("../lib/common").ServerIdentifier;
var encodeHelper = require("../lib/common").encodeHelper;
var keywordStrings = require("../lib/common").keywordStrings;

// mock server object
server = new ServerIdentifier("somehost", 111);
lodash.assign(server, {
  privatePrefix: '_',
  objectRegistry: new ObjectRegistry()  
});

destination = new ServerIdentifier('otherhost', 222);
lodash.assign(destination, {
  objectRegistry: new ObjectRegistry()  
});

serializer = new Encoder(server, destination, "session1");
var deserializer = new Decoder(destination, server, "session1");


localObj = {
  prop1: "kkm",
  array1: [33, 44],
  func1: function() {},
  func2: function() {}
};

localObj.array1.push(function() {});

// create cyclic reference
localObj.array1.push(localObj.func2);
localObj.array1.push(localObj);

serialized = serializer.encode(localObj);

// it is okay if it could be serialized by JSON
var localObjSerialized = JSON.stringify(serialized);
console.log(localObjSerialized);

assert(encodeHelper.getRid(serialized) != null);
assert(encodeHelper.getRhost(serialized) == null, 
    "do not write host when serilizing local objects.");
assert(encodeHelper.getProperties(serialized).func1 != null);

// a remote stub object
remoteObj = {
  prop1: 'dmc'
};

encodeHelper.setHiddenRid(remoteObj, 44);
encodeHelper.setHiddenRhost(remoteObj, 'otherhost');
encodeHelper.setHiddenRport(remoteObj, 333);
encodeHelper.setHiddenSessionId(remoteObj, 'mysession');

serialized = serializer.encode(remoteObj);

console.log(JSON.stringify(serialized));

assert.equal(encodeHelper.getRid(serialized), 44);
assert.equal(encodeHelper.getRhost(serialized), 'otherhost', 
    "stub object from other host should be serialized with host");
assert.equal(encodeHelper.getSessionId(serialized), "mysession", 
  "should serialize the original session id");

assert(lodash.keys(serializer.stubReferences).length >0, "should create stub reference after sending stub to the client");


var deserialized = deserializer.decode(serialized);
assert.equal(encodeHelper.getHiddenRid(deserialized), 44);
assert.equal(encodeHelper.getHiddenRhost(deserialized), 'otherhost', 
    "host should be deserialized correctly.");
assert.equal(encodeHelper.getHiddenSessionId(deserialized), "mysession", 
  "should decode the session id.");

pojo = {
  prop1: 333
};

serialized = serializer.encode(pojo);

console.log(JSON.stringify(serialized));