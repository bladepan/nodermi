var ObjectRegistry, debug, func1, func1Id, func2Id, lodash, registry;

var assert = require("assert")

lodash = require('lodash');
debug = require('debug');

ObjectRegistry = require('../lib/object_registry');
var encodeHelper = require('../lib/common').encodeHelper;
var ServerIdentifier = require('../lib/common').ServerIdentifier;

var logger = debug("rmi:test");

registry = new ObjectRegistry();

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
encodeHelper.setHiddenRid(stubHolder.stub, 'kk');
encodeHelper.setHiddenRport(stubHolder.stub, stubServer.port);
encodeHelper.setHiddenRhost(stubHolder.stub, stubServer.host);
encodeHelper.setHiddenSessionId(stubHolder.stub, "session1");
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






