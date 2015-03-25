var Decoder, Encoder, ObjectRegistry, bufferedObj, decoded, decoder,
destObj, destination, encoded, euqalsResult, localObj, pojo, remoteObj,
serialized, serializer, server;

var assert = require('chai').assert;
var should = require('chai').should();

var Buffer = require("buffer").Buffer;

var lodash = require('lodash');

Encoder = require('../lib/encoding');
Decoder = require('../lib/decoding');
ObjectRegistry = require('../lib/object_registry');
var ServerIdentifier = require("../lib/common").ServerIdentifier;
var stubHelper = require("../lib/common").stubHelper;
var Models = require("../lib/common").Models;

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

describe("encode", function(){

  var buffer = new Buffer(100);
  buffer.writeUInt32LE(5889,33);

  localObj = {
    prop1: "kkm",
    array1: [33, 44],
    func1: function() {},
    func2: function() {},
    buffer : buffer,
    date : new Date(),
    num : 44796,
    fnum : 44.889999
  };

  localObj.array1.push(function() {});

  // create cyclic reference
  localObj.array1.push(localObj.func2);
  localObj.array1.push(localObj);

  serialized = serializer.encode(localObj);

  // it is okay if it could be serialized by JSON
  var localObjSerialized = serialized.toBuffer();
  console.log("serialized length " + localObjSerialized.length);

  assert(serialized.getId() != null);
  assert(serialized.getHost() == null,
      "do not write host when serilizing local objects.");
  assert(serialized.getProperties() != null);


  // decode from buffer
  var deSerialized = deserializer.decode(Models.ObjectDescriptor.decode(localObjSerialized));

  it("type buffer should be properly deserialilzed", function(){
    assert.equal(buffer.toString("base64"), deSerialized.buffer.toString("base64"));
  });

  it("date should be properly deserialized", function(){
    assert.equal(localObj.date.getTime(), deSerialized.date.getTime());
  });

  it("int should be properly deserialized", function(){
    assert.equal(localObj.num, deSerialized.num);
  });

  it("float should be properly deserialized", function(){
    assert.equal(localObj.fnum, deSerialized.fnum);
  });

  // a remote stub object
  remoteObj = {
    prop1: 'dmc'
  };
  // remote stub has hidden ids and host information
  stubHelper.setRemoteId(remoteObj, "44");
  stubHelper.setHostInStub(remoteObj, new ServerIdentifier("otherhost", 333));
  stubHelper.setRemoteSessionId(remoteObj, 'mysession');


  serialized = serializer.encode(remoteObj);


  assert.equal(serialized.getId(), "44");
  assert.equal(serialized.getHost(), 'otherhost',
      "stub object from other host should be serialized with host");
  assert.equal(serialized.getSessionId(), "mysession",
    "should serialize the original session id");

  assert(lodash.keys(serializer.stubReferences).length >0, 
    "should create stub reference after sending stub to the client");


  var deserialized = deserializer.decode(serialized);
  assert.equal(stubHelper.getRemoteId(deserialized), "44");
  assert.equal(stubHelper.getRemoteHost(deserialized), 'otherhost',
      "host should be deserialized correctly.");
  assert.equal(stubHelper.getRemoteSessionId(deserialized), "mysession",
    "should decode the session id.");

  var simpleObj = {
     date : new Date(),
     error : new Error("bravo"),
     str : "someString",
     obj : {
      date : new Date(),
      num : 42
     }
  };

  var serializedSimpleObj = serializer.encode(simpleObj);
  var deSerializedSimpleObj = deserializer.decode(serializedSimpleObj);
  it("simple object serialization", function(){
    assert.isNull(serializedSimpleObj.getId(), 
      "should not assign id to simple object");
    assert.equal(simpleObj.date.getTime(), deSerializedSimpleObj.date.getTime(), 
      "date property in simple object.");
    assert.equal(simpleObj.str, deSerializedSimpleObj.str, 
      "date property in simple object.");
    assert.equal(simpleObj.obj.num, deSerializedSimpleObj.obj.num, 
      "nested property in simple object.");
  });

  var simpleArray = [
  {date : new Date(), str: "someString"},
  44, 33, new Date()];

  var serializedSimpleArray = serializer.encode(simpleArray);
  var deSerializedSimpleArray = deserializer.decode(serializedSimpleArray);
  it("simple array serialization", function(){
    assert.equal(simpleArray[0].str, deSerializedSimpleArray[0].str,
      "nested property in simple array.");
  });

});
