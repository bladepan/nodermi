var assert = require("assert");

var should = require('chai').should();
var lodash = require('lodash');
var debug = require('debug');

var ObjectRegistry = require('../lib/object_registry');
var stubHelper = require('../lib/common').stubHelper;
var ServerIdentifier = require('../lib/common').ServerIdentifier;

var logger = debug("rmi:test");

var registry = new ObjectRegistry();

var obj = {};

var client = new ServerIdentifier("host",888);

var objId = registry.registerObject(obj , 'session1', client);

assert.equal(registry.getObject(objId) , obj, "should keep the object registed.");

registry.registerObject(obj , 'session2', client);

registry.dereference(client, "session1", objId);

assert.equal(registry.getObject(objId) , obj, "should keep the object if someone still reference to it.");

registry.dereference(client, "session2", objId);

assert.equal(registry.getObject(objId) , null, "should not keep the object if none references to it.");


var stubHolder = {};
var stubServer = new ServerIdentifier('a', 1);

stubHolder.stub = {};
stubHelper.setRemoteId(stubHolder.stub, 'kk');
stubHelper.setHostInStub(stubHolder.stub, stubServer);
stubHelper.setRemoteSessionId(stubHolder.stub, "session1");
registry.registerStub(stubHolder.stub);

var executed = false;
var timeOutId = null;
registry.on("dereference", function(serverIdentifier, sessionId, stubObjId){
    executed = true;
    assert(serverIdentifier.equals(stubServer), "the deferenced stub server is wrong " + serverIdentifier);
    assert.equal(stubObjId, 'kk');
    assert.equal(sessionId, 'session1');
    assert.equal(lodash.keys(registry.stubs).length, 0);
    logger("done");
    if (timeOutId != null) {
        clearTimeout(timeOutId);
    }
});
// wait for gc taking effect
timeOutId = setTimeout(function(){
    assert(executed);
}, 3000)

// the test depends on gc
if (gc == null) {
    console.log("****************** gc not detected ***************");
    assert(false);
}

delete stubHolder.stub;
gc();

describe("ObjectRegistry",function(){
    it("batch remove reference", function(){
        var obj = {};
        var client = new ServerIdentifier("host",888);
        var objId = registry.registerObject(obj , 'session1', client);
        should.exist(registry.getObject(objId));
        registry.removeReferenceFrom([client]);
        should.not.exist(registry.getObject(objId));
    });
});




