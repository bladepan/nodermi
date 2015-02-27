var sinon = require("sinon");
var assert = require('chai').assert;

var FailureDetector = require("../lib/failure_detector");
var Server = require("../lib/server");
var ServerIdentifier = require("../lib/common").ServerIdentifier;

describe("failureDetector",function(){

    it("ping", function(){
        var clock = sinon.useFakeTimers();
        var serverObj = {
            _sendPing : function(server, callback){
                callback();
            },
            _removeReferenceFrom : function(){}
        };
        var failureDetector = new FailureDetector({
            server : serverObj
        });
        var host = new ServerIdentifier("l",33);
        failureDetector.update(host);

        clock.tick(2*failureDetector.pingInterval);
        assert.equal(true, failureDetector._isServerActive(host));

        serverObj._sendPing = function(server, callback){
            callback(new Error("server is dead."));
        };

        clock.tick(2*failureDetector.pingInterval);
        assert.equal(false, failureDetector._isServerActive(host));
    });
});