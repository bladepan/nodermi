var assert = require('assert');

var async = require('async');

var RmiNode = require("../lib/server");
var ServerIdentifier = require("../lib/common").ServerIdentifier;
var encodeHelper = require("../lib/common").encodeHelper;

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
    rmiNodes.serverA.createSkeleton("obj", objA);

    var retriveObjOption = serverA.clone();
    retriveObjOption.objName = "obj";

    async.auto({
        stubA_B : function(next){
            rmiNodes.serverB.retriveObj(retriveObjOption, next);            
        },
        stubA_C : function(next){
          rmiNodes.serverC.retriveObj(retriveObjOption, next);              
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
// we make objb.inner to be hold by serverA, and serverC get hold reference to it
// through serverA, then we delete reference from both serverA and serverC, and check
// if the reference is removed from serverB
function testDeference(stubA_B, stubA_C, callback){
    var objId = null;
    async.waterfall([
        function(next){
            stubA_B.setProperty("stubProp", objB.inner, next);        
        },
        function(next){
            assert(objA.stubProp != null, "should called setProperty on objA");
            assert(typeof objA.stubProp.func1 === "function");
            objId = encodeHelper.getHiddenRid(objB.inner);
            stubA_C.getProperty("stubProp", next);
            
        },
        function(objb_inner_stub, next){
            objC.stubProp = objb_inner_stub;
            assert(typeof objC.stubProp.func1 === "function");
            assert.equal(encodeHelper.getHiddenSessionId(objC.stubProp),
                encodeHelper.getHiddenSessionId(objA.stubProp), "the session Id should equal");
            assert(rmiNodes.serverB.objectRegistry.getObject(objId) != null, 
                "should keep reference to object still referenced.");

            next();
        },
        function(next){
            console.log("delete reference from objA");
            delete objA.stubProp;
            //trigger dereference message
            gc(); gc(); gc();
            setTimeout(next, 1000);
        },
        function(next){
            assert(rmiNodes.serverB.objectRegistry.getObject(objId) != null, 
                "should keep reference to object still referenced.");
            console.log("delete reference from objC");
            delete objC.stubProp;
            //trigger dereference message
            gc(); gc(); gc();
            setTimeout(next, 1000);
        },
        function(next){
            // we hope it is already dereferenced on objB
            assert(rmiNodes.serverB.objectRegistry.getObject(objId) == null, 
                "should not keep reference if no one reference it.");
            next();
        }
    ], callback);
    


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