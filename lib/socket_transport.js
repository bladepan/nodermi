//transport layer built on socket, right now create new socket for every message

var net = require("net");
var EventEmitter = require("events").EventEmitter;

var lodash = require("lodash");
var debug = require("debug");

var ServerIdentifier = require("./common").ServerIdentifier;
var Models = require("./common").Models;

var errorLogger = debug("nodermi:error:socket");
var logger = debug("nodermi:socket");

function SocketTransport(server){
    this.host = server.serverIdentifier;
    var socketServer = net.createServer();
    socketServer.listen(this.host.port, this.host.host);
    socketServer.on("connection", this.handleConnection.bind(this));
    var callbackFired = false;
    var self = this;
    socketServer.once("listening", function(){
        logger("listening on "+ self.host);
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
    this.socketPool = {};
    this.transactionSeq = 0;
}

SocketTransport.prototype = lodash.create(EventEmitter.prototype, {
  'constructor': SocketTransport
});

lodash.assign(SocketTransport.prototype, {
    getTransactionId : function(){
        this.transactionSeq++;
        //to make it fit in 32 bit
        if (this.transactionSeq > 2147483647) {
            this.transactionSeq = 0;
        }
        return this.transactionSeq;
    },
    handleConnection : function(socket){
        var socketWrapper = new SocketWrapper(socket);
        var self = this;
        socketWrapper.on("ready", function(msgSeq, data){
            // logger("receive "+data.toString());
            var msgObj = Models.Message.decode(data);
            var response = new SocketResponse(msgSeq, socketWrapper);
            self.emit("message",msgObj, response);
        });
    },
    close : function(){
        lodash.forEach(this.socketPool, function(socket){
            socket.close();
        });
        this.socketServer.close();
    },
    send : function(destination, msg, callback){
        if (!destination instanceof ServerIdentifier) {
            throw new Error("destination should be of type ServerIdentifier.");
        }
        var socket = this.socketPool[destination];
        var seq = this.getTransactionId();
        if (socket == null) {
            socket = new SocketWrapper(destination);
            var self = this;
            if (callback != null) {
                socket.once("connectionError", callback);
            }
            socket.once("connect", function(){
                logger("connection established to "+destination);
                self.socketPool[destination] = socket;
                socket.send(seq, msg, callback);
                if (callback != null) {
                    socket.removeListener("connectionError", callback);
                }
            });

            socket.on("close", function(){
                logger("remove socket "+destination + " from socket pool.");
                if (self.socketPool[destination] == socket) {
                    delete self.socketPool[destination];
                }
            });

        }else{
            socket.send(seq, msg, callback);
        }
    }
});

function BufferWrapper(buffer){
    if (typeof buffer == "number") {
        this.buffer = new Buffer(buffer);
    }else{
        this.buffer = buffer;
    }
    this.offset = 0;
}

lodash.assign(BufferWrapper.prototype, {
    writeUInt32LE : function(val){
        if (this.left()<4) {
            throw new Error("Not enough space for writing 32bit.");
        }
        this.buffer.writeUInt32LE(val, this.offset);
        this.offset += 4;
    },
    readUInt32LE : function(){
        if (this.left()<4) {
            throw new Error("Not enough space for reading 32bit.");
        }
        var result = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return result;
    },
    position : function(){
        return this.offset;
    },
    left : function(){
        return this.buffer.length - this.offset;
    },
    reset : function(){
        this.offset = 0;
    },
    // copy from this to target until one of them is full
    copy : function(target){
        if (!target instanceof BufferWrapper) {
            throw new Error("cannot copy");
        }
        var targetRemaining = target.left();
        var selfRemaining = this.left();
        var toCopy = selfRemaining > targetRemaining? targetRemaining : selfRemaining;
        var end = this.offset + toCopy;
        this.buffer.copy(target.buffer, target.offset, this.offset, end);
        target.offset += toCopy;
        this.offset = end;
        return toCopy;
    },
    write : function(str){
        var strLen = Buffer.byteLength(str);
        if (strLen>this.left()) {
            throw new Error("not enough space");
        }
        this.buffer.write(str, this.offset, strLen, 'utf8');
        this.offset+=strLen;
        return strLen
    },
    getBuffer : function(){
        return this.buffer;
    }

});

//todo: handle time out
function SocketWrapper(socket){
    this.isClient = true;
    if (socket instanceof ServerIdentifier) {
        this.destination = socket;
        this.socket = new net.Socket();
        this.socket.connect(socket.port, socket.host);
        this.connected = false;
        var self = this;
        this.socket.once("connect", function(){
            self.connected = true;
            self.emit("connect");
        });
        this.socket.once("error", function(err){
            if (!self.connected) {
                logger("connection error to "+ self.destination);
                self.emit("connectionError", err);
            };
        });
    }else{
        this.isClient = false;
        this.socket = socket;
    }
    this.reading = false;
    this.socket.on("data", this.receiveData.bind(this));
    this.socket.on("end", this.endData.bind(this));
    this.socket.on("error", this.errorHandler.bind(this));
    this.callbacks = {};
    this.headerBuffer = new BufferWrapper(8);
    this.readingHead = true;
    this.bodyBuffer = null;
    this.bodyRead = 0;
}

SocketWrapper.prototype = lodash.create(EventEmitter.prototype, {
  'constructor': SocketWrapper
});

lodash.assign(SocketWrapper.prototype, {
    processData : function(buffer){
        if (this.readingHead) {
            buffer.copy(this.headerBuffer);
            if (this.headerBuffer.left()==0) {
                //reset to be read
                this.headerBuffer.reset();
                this.msgSeq = this.headerBuffer.readUInt32LE();
                this.msgSize = this.headerBuffer.readUInt32LE();
                this.readingHead = false;
                if (buffer.left()>0) {
                    this.processData(buffer);
                }
            }
        }else{
            if (this.bodyBuffer == null) {
                // throw exception on huge mssages
                if (this.msgSize > 1024*1024) {
                    this.errorHandler(new Error("Excessive message size "+this.msgSize));
                    return;
                }
                this.bodyBuffer = new BufferWrapper(this.msgSize);
            }
            buffer.copy(this.bodyBuffer);
            if (this.bodyBuffer.left()==0) {
                // got enough data, trigger handler
                if (this.isClient) {
                    this.triggerCallback();
                }else{
                    //i am server, trigger request handler
                    this.emit("ready", this.msgSeq, this.bodyBuffer.getBuffer());
                }
                // reset to read
                this.headerBuffer.reset();
                this.bodyBuffer = null;
                this.readingHead = true;
                if (buffer.left()>0) {
                    this.processData(buffer);
                }
            }

        }
    },
    triggerCallback: function(){
        var handler = this.callbacks[this.msgSeq];
        if (handler!=null) {
            if (handler.callback!=null) {
                var parsed = false;
                var msgObj = null;
                try{
                    msgObj = Models.Message.decode(this.bodyBuffer.getBuffer());
                    parsed = true;
                }catch(e){
                    errorLogger(e);
                    handler.callback(e);
                }
                if (parsed) {
                    //logger("trigger callback with "+JSON.stringify(msgObj));
                    handler.callback(null, msgObj);
                }
                // remove handler after triggered
                delete this.callbacks[this.msgSeq];
            }
            this.emit("sendSuccess", this.destination);
        }else{
            errorLogger("cannot find handler for msg "+this.msgSeq);
        }
    },

    receiveData : function(data){
        this.processData(new BufferWrapper(data));
    },
    endData : function(){
        this.triggerCallbacksError(new Error("EOF"));
        this.close();
    },
    close : function(){
        this.closed = true;
        this.socket.destroy();
        this.emit("close");
        //trigger close handlers before remove all listeners
        this.removeAllListeners();
        this.callbacks = null;
    },
    errorHandler : function(err){
        this.emit("error", err);
        this.triggerCallbacksError(err);
        this.close();
    },
    triggerCallbacksError : function(err){
        errorLogger(err);
        lodash.forEach(this.callbacks,function(callback){
            if (callback.callback != null) {
                callback.callback(err);
            }
        });
    },
    send: function(seq, msg, callback){
        // TODO handle timeouts
        this.callbacks[seq] = {
            callback : callback,
            timeStamp : Date.now()
        };
        this._send(seq, msg);
    },
    _send: function(seq, msgObj){
        // logger("send message "+ JSON.stringify(msgObj));
        var msgBuffer = msgObj.toBuffer();

        var msgLen = msgBuffer.length;
        var buffer = new BufferWrapper(8);
        buffer.writeUInt32LE(seq);
        buffer.writeUInt32LE(msgLen);
        
        this.socket.write(buffer.getBuffer());
        this.socket.write(msgBuffer);
        logger("send "+msgLen+" bytes");
    }
});

function SocketResponse(msgSeq, socket){
    this.msgSeq = msgSeq;
    if (!socket instanceof SocketWrapper) {
        throw new Error("Type mismatch.");
    }
    this.socket = socket;
}

lodash.assign(SocketResponse.prototype, {
    write : function(msgObj){
        this.socket._send(this.msgSeq, msgObj);
    }
});

module.exports = SocketTransport;