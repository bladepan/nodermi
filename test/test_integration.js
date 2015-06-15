var assert = require('assert');

var async = require('async');

var RmiNode = require("../lib/server");
var ServerIdentifier = require("../lib/common").ServerIdentifier;
var stubHelper = require("../lib/common").stubHelper;

var serverA = new ServerIdentifier("localhost", 7000);

var serverB = new ServerIdentifier("localhost", 8000);

var serverC = new ServerIdentifier("localhost", 9000);

var objA = {
    property1 : 'a',
    echo : function(param, callback){
        callback(null, param);
    },
    setProperty : function(prop, obj, callback){
        this[prop] = obj;
        callback();
    },
    getProperty : function(prop, callback){
        callback(null, this[prop]);
    }

};

var objB = {
    inner : {
        //prevent nodermi treating this obj as a pojo
        func1 : function(){

        }
    }
};

var objC = {};
// holder to store all the rmi nodes
var rmiNodes = null;

function testSuit(){
    rmiNodes.serverA.registerObject("obj", objA);

    var retrieveObjOption = serverA.clone();
    retrieveObjOption.objName = "obj";

    async.auto({
        stubA_B : function(next){
            rmiNodes.serverB.retrieveObj(retrieveObjOption, next);
        },
        stubA_C : function(next){
            rmiNodes.serverC.retrieveObj(retrieveObjOption, next);
        },
        testBasic : ['stubA_B', function(next, results){
            testBasic(results.stubA_B, next);
        }],
        testDeference : ['testBasic', 'stubA_C', function(next, results){
            testDeference(results.stubA_B, results.stubA_C, next);
        }]
        },
        function(err){
            if (err) {
                console.log(err);
            }
            assert(err==null, "should not have error");
            closeNodes(rmiNodes);
        }
    );
}

function testBasic(stubA_B, callback){
    assert.equal(stubA_B.property1, 'a', "should properly serialize property1");
    stubA_B.echo("1", function(err, param){
        if (err != null) {
            console.log(err);
            callback(err);
            return;
        };
        assert.equal(param, "1", "callback should work");
        callback();
    });
}

// reference to the original object should only be deleted if no one holds reference.
// we make objb.inner to be hold by serverA, and serverC by some RMI calls,
// then we delete reference from both serverA and serverC, and check
// if the reference is removed from serverB
function testDeference(stubA_B, stubA_C, callback){
    var objId = null;
    console.log("testing dereference");
    async.waterfall([
        function(next){
            // objA.stubProp is set as a stub referencing to objB.inner
            stubA_B.setProperty("stubProp", objB.inner, next);
            objId = stubHelper.getRemoteId(objB.inner);
            console.log("objB.inner id is " + objId)
        },
        function(next){
            assert(objA.stubProp != null, "should called setProperty on objA");
            assert(typeof objA.stubProp.func1 === "function");
            // get objA.stubProp via rmi on serverC
            stubA_C.getProperty("stubProp", next);
        },
        function(objb_inner_stub, next){
            // objb_inner_stub is a stub referencing to objB.inner
            objC.stubProp = objb_inner_stub;
            assert(typeof objC.stubProp.func1 === "function");
            assert.equal(stubHelper.getRemoteSessionId(objC.stubProp),
                stubHelper.getRemoteSessionId(objA.stubProp), "the session Id should equal");
            assert(rmiNodes.serverB.objectRegistry.getObject(objId) != null,
                "should keep reference to object still referenced.");

            next();
        },
        function(next){
            console.log("delete reference from objA " + stubHelper.getRemoteId(objA.stubProp) + "@" +
                stubHelper.getHostFromStub(objA.stubProp));
            delete objA.stubProp;
            console.log("after delete objA.stubProp " + objA.stubProp)
            //trigger dereference message
            forceGc(next);
        },
        function(next){
            assert(rmiNodes.serverB.objectRegistry.getObject(objId) != null,
                "should keep reference to object still referenced.");
            console.log("delete reference from objC");
            delete objC.stubProp;
            //trigger dereference message
            forceGc(next);
        },
        function(next){
            // hope it is already dereferenced on serverB. This rarely works, see issue
            // https://github.com/bladepan/nodermi/issues/17
            assert(rmiNodes.serverB.objectRegistry.getObject(objId) == null,
                "should not keep reference if no one references it.");
            next();
        }
    ], callback);

}

function forceGc(callback){
    gc(); gc(); gc();
    var func = function(next){
        gc(); gc(); gc();
        setTimeout(next, 1500);
    };
    async.series([
        func, func, func, func, func
    ],function(){
        callback();
    });
}

function closeNodes(rmiNodes){
    for (var i in rmiNodes) {
        rmiNodes[i].close();
    }
}

async.auto({
    serverA : function(next){
        new RmiNode(serverA, next);
    },
    serverB : function(next){
        new RmiNode(serverB, next);
    },
    serverC : function(next){
        new RmiNode(serverC, next);
    }
}, function(err, results){
    if (err!=null) {
        console.log(err);
    }
    assert(err==null, "should successfully initiated.");
    rmiNodes = results;
    testSuit();
});