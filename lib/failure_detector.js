var lodash = require("lodash");
var debug = require("debug");
var async = require("async");


var ServerIdentifier = require("./common").ServerIdentifier;


var logger = debug("nodermi:fd");
var errorLogger = debug("nodermi:error:fd");

function HostEntry(host, timeStamp){
    if (! host instanceof ServerIdentifier) {
        throw new Error("Illegal type of host.");
    }
    this.host = host;
    if (timeStamp == null) {
        this.timeStamp = Date.now();
    }else{
        this.timeStamp = timeStamp;    
    }
}

lodash.assign(HostEntry.prototype, {
    setTimeStamp : function(ts){
        this.timeStamp = ts;
    }
});

function FailureDetector(server){
    this.server = server;
    this.hostMap = {};
    // ping every 1 minute
    this.pingInterval = 60*1000;

    this.intervalObj = setInterval(this.ping.bind(this), this.pingInterval);
}

lodash.assign(FailureDetector.prototype, {
    close : function(){
        clearInterval(this.intervalObj);
    },
    update : function(host){
        if (! host instanceof ServerIdentifier) {
            throw new Error("Illegal type of host.");
        }
        var entry = this.hostMap[host];
        if (!entry) {
            this.hostMap[host] = new HostEntry(host);
        }else{
            entry.setTimeStamp(Date.now());
        }
    },
    ping : function(){
        logger("start to ping...");
        var now = Date.now();
        var pingList = lodash.reduce(this.hostMap, function(result, entry){
            if (now - entry.timeStamp > this.pingInterval) {
                logger("Ping "+ entry.host + ",last active time is "+entry.timeStamp);
                result.push(entry.host);
            }
            return result;
        }, [], this);
        if (pingList.length > 0) {
            var self = this;
            var server = this.server;
            var failedServers = [];
            async.each(pingList, function(host, next){
                logger("ping "+ host);
                server._sendPing(host, function(err){
                    if(err!=null){
                        errorLogger("Ping "+ host + " failed, "+ err);
                        failedServers.push(host);
                    }
                    next();
                });
            }, function(err){
                if (err!=null) {
                    logger(err);
                }
                if (failedServers.length > 0) {
                    self.removeFailedServers(failedServers);
                }
            });
        }
    },
    removeFailedServers : function(failedServers){
        var now = Date.now();
        var finalList = lodash.reduce(failedServers, function(result, server){
            var entry = this.hostMap[server];
            // in case the server get active during the ping, we need this check
            if (entry != null && now - entry.timeStamp > this.pingInterval) {
                result.push(server);
                logger("remove "+server+ " from active list.");
                delete this.hostMap[server];
            }
            return result;
        }, [], this);
        if (finalList.length>0) {
            // must complete synchronously 
            this.server._removeReferenceFrom(finalList);
        }
    }
});

module.exports = FailureDetector;