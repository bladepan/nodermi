//transport layer built on socket, right now create new socket for every message

var net = require("net");
var EventEmitter = require("events").EventEmitter;

var lodash = require("lodash");
var debug = require("debug");

var ServerIdentifier = require("./common").ServerIdentifier;

var errorLogger = debug("nodermi:error:socket");
var logger = debug("nodermi:socket");

function SocketTransport(server){
    this.host = new ServerIdentifier(server.host, server.port);
    var socketServer = net.createServer();
    socketServer.listen(this.host.port, this.host.host);
    socketServer.on("connection", this.handleConnection.bind(this));
    var callbackFired = false;
    var self = this;
    socketServer.once("listening", function(){
        logger("listening");
        self.emit("initialized");
        callbackFired = true;
    });
    socketServer.once("error", function(err){
        errorLogger(err);
        if (!callbackFired) {
            this.emit("initialized", err);
        }
    });
    this.socketServer = socketServer;
}

SocketTransport.prototype = lodash.create(EventEmitter.prototype, {
  'constructor': SocketTransport
});

lodash.assign(SocketTransport.prototype, {
    handleConnection : function(socket){
        var socketWrapper = new SocketWrapper(socket);
        var self = this;
        socketWrapper.on("ready", function(data){
            var msg = data.toString('utf8');
            var msgObj = JSON.parse(msg);
            self.emit("message",msgObj, socketWrapper);
        });
    },
    close : function(){
        this.socketServer.close();
    },
    send : function(destination, msg, callback){
        var socket = new net.Socket();
        socket.connect(destination.port, destination.host);
        var socketWrapper = new SocketWrapper(socket, false);
        socketWrapper.on("connect", function(){
            socketWrapper.write(msg);
        });
        var self = this;
        socketWrapper.on("ready", function(data){
            if (callback != null) {
                var msg = data.toString('utf8');
                var msgObj = JSON.parse(msg);
                callback(null, msgObj);
            }
            this.emit("sendSuccess", destination);
        });
        if (callback!= null) {
            socketWrapper.on("error", function(err){
                callback(err);
            });
        }
    }
});

//todo: handle time out
function SocketWrapper(socket, closeOnSend){
    this.closeOnSend = closeOnSend;
    this.socket = socket;
    this.reading = false;
    this.buffer = new Buffer(4*1024);
    this.socket.on("data", this.receiveData.bind(this));
    this.socket.on("end", this.endData.bind(this));
    this.socket.on("error", this.errorHandler.bind(this));
    this.socket.on("connect", lodash.bind(this.emit, this, "connect"));
}

SocketWrapper.prototype = lodash.create(EventEmitter.prototype, {
  'constructor': SocketWrapper
});

lodash.assign(SocketWrapper.prototype, {
    receiveData : function(data){
        if (!this.reading) {
            this.msgSize = data.readUInt32LE(0, 4);
            logger("get msg of size "+this.msgSize);
            this.buffer = new Buffer(this.msgSize);
            data.copy(this.buffer, 0, 4);
            this.dataRead = data.length - 4;
            this.reading = true;
        }else{
            data.copy(this.buffer, this.dataRead, 0);
            this.dataRead += data.length;
        }
        logger("dataRead "+this.dataRead);
        if (this.dataRead == this.msgSize) {
            this.emit("ready", this.buffer);
            this.reading = false;
            if (!this.closeOnSend) {
                this.socket.destroy();
            }
        }else if (this.dataRead>this.msgSize){
            this.socket.destroy();
            this.emit("error", 
                new Error("data format error, expect "+this.msgSize+" bytes, actual "+this.dataRead));
        }
    },
    endData : function(){
        this.socket.destroy();
        if (this.reading) {
            this.emit("error", new Error("EOF"));
        }
    },
    errorHandler : function(err){
        this.emit("error", err);
    },
    write : function(msgObj){
        var str = JSON.stringify(msgObj);
        var strLen = Buffer.byteLength(str, 'utf8');
        var buffer = new Buffer(4 + strLen);
        buffer.writeUInt32LE(strLen, 0, 4);
        buffer.write(str, 4, strLen, 'utf8');
        this.socket.write(buffer);
        if (this.closeOnSend) {
            this.socket.end();
        }
    }
});

module.exports = SocketTransport;