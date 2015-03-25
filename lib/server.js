(function() {
  var Decoder, Encoder, ObjectRegistry, Server, debug, emptyObj, excludeMethods, logger, privatePrefix, util, _ref;

  util = require('util');

  debug = require('debug');
  var lodash = require('lodash');
  var async   = require('async');

  ObjectRegistry = require('./object_registry');
  var ClassRegistry = require('./class_registry');

  _ref = require('./common'), privatePrefix = _ref.privatePrefix,
  excludeMethods = _ref.excludeMethods;
  var modelHelper = _ref.modelHelper;
  var Models = _ref.Models;
  var ServerIdentifier = _ref.ServerIdentifier;
  var keywordStrings = _ref.keywordStrings;

  Encoder = require('./encoding');

  Decoder = require('./decoding');
  var FailureDetector = require("./failure_detector");

  logger = debug('nodermi:server');
  errorLogger = debug('nodermi:error:server');

  emptyObj = {};

  Server = (function() {
    /*
    options{
      host
      port
      debug
    }
    */
    function Server(options, callback) {
      this.serverIdentifier = new ServerIdentifier(options.host, options.port);
      this.objectRegistry = new ObjectRegistry();
      this.privatePrefix = privatePrefix;
      this.excludeMethods = excludeMethods;
      this.serverObj = {};
      this.classRegistry = new ClassRegistry();

      this.sequence = 0;

      var FileLogger = require('./file_logger');
      this.fileLogger = new FileLogger(options);

      // for injecting mock transport during testing
      if (options.transport != null) {
        this.transport = options.transport;
      }else{
        var Transport = require('./socket_transport');
        this.transport = new Transport(this);  
      }
      this.transport.on('message', this._requestHandler.bind(this));
      this.transport.once('initialized', (function(_this) {
        return function(err) {
          return callback(err, _this);
        };
      })(this));
      this.objectRegistry.on('dereference', this._sendDereference.bind(this));
      // for injecting mock fd during testing
      if (options.failureDetector != null) {
        this.failureDetector = options.failureDetector;
      }else{
        var failureDetector = new FailureDetector({
          server : this
        });
        this.failureDetector = failureDetector;  
      }

      this.transport.on('sendSuccess', function(destination){
        failureDetector.update(destination);
      });
    }

    Server.prototype._generateSessionId = function(){
      var id = this.sequence.toString(36);
      this.sequence++;
      return id;
    };

    Server.prototype._requestHandler = function(message, response) {
      var destination = modelHelper.getHostFromMessage(message);
      // receive a request from destination, it must be alive
      this.failureDetector.update(destination);
      if (logger.enabled) {
        logger(this.serverIdentifier + " got request " + (JSON.stringify(message)));
      }
      var messageType = message.getType();
      switch (messageType) {
        // get object
        case Models.MessageType.RETRIEVE:
          var objName = message.getObjName();
          return this._handleRetrieveObj(objName, destination, response);
        // handle method call
        case Models.MessageType.INVOKE:
          var functionId = message.getFunctionId();
          var thisId = message.getObjId();
          var args = message.getArgs();
          var sessionId = message.getSessionId();
          return this._handleInvokeFunction(sessionId, functionId, thisId, args, destination, response);
        case Models.MessageType.REFERENCE:
          // the reference message are not directly sent by the actual client
          var client = message.getReferenceClient();
          client = modelHelper.toServerIdentifier(client);
          var referenceMap = {}
          lodash.forEach(message.getReferenceEntries(), function(entry){
            referenceMap[entry.getSessionId()] = entry.getObjectIds();
          });
          return this._handleReference(client, referenceMap, response);
        case Models.MessageType.DEREFERENCE:
          // dereference messages are sent by the actual client
          var client = destination;
          var sessionId = message.getSessionId();
          var objId = message.getObjId();
          return this._handleDereference(client, sessionId, objId, response);
        case Models.MessageType.PING:
          return this._handlePing(response);
        default:
          errorLogger("unknown message type " + messageType);
      }
    };

    Server.prototype._handleReference = function(client, referenceMap, response){
      for (var sessionId in referenceMap) {
        var objIds = referenceMap[sessionId];
        for (var i = 0; i < objIds.length; i++) {
          var objId = objIds[i];
          var obj = this.objectRegistry.getObject(objId);
          if (obj == null) {
            var errorMsg = "Reference failed, cannot find " + objId;
            errorLogger(errorMsg);
            response.write(this._erroMessage(errorMsg));
            return;
          }else{
            this.objectRegistry.registerObject(obj, sessionId, client);
          }
        }
      }
      response.write(this._successMessage());
    };

    Server.prototype._handleDereference = function(client, sessionId, objId, response){
      this.objectRegistry.dereference(client, sessionId, objId);
      response.write(this._successMessage());
    };
    Server.prototype._handlePing = function(response){
      response.write(this._successMessage());
    };

    Server.prototype._sendDereference = function(host, sessionId, objId){
      var message = this._createMessage(Models.MessageType.DEREFERENCE);
      message.setSessionId(sessionId);
      message.setObjId(objId);
      this.transport.send(host, message);
    };

    Server.prototype._sendPing = function(host, callback){
      var message = this._createMessage(Models.MessageType.PING);
      this.transport.send(host, message, callback);
    };

    // remove reference from failed servers
    Server.prototype._removeReferenceFrom = function(serverList){
      this.objectRegistry.removeReferenceFrom(serverList);
    };

    Server.prototype._handleRetrieveObj = function(objName, destination, response) {
      var obj = objName != null ? this.serverObj[objName] : this.serverObj;
      var sessionId = this._generateSessionId();
      var encoder = new Encoder(this, destination, sessionId);
      var encoded = encoder.encode(obj);
      var responseMsg = this._successMessage();
      responseMsg.setSessionId(sessionId);
      responseMsg.setObject(encoded);
      // the client needs to reference stub from other server
      if (encoder.hasStubReference()) {
        self = this;
        this._sendReferenceMessages(destination, encoder.stubReferences, function(err){
          if (err != null) {
            errorLogger(err);
            response.write(self._erroMessage(err));
            return;
          }
          response.write(responseMsg)
        });
      }else{
        response.write(responseMsg);
      }
    };
    // send reference for client, client is the one that needs to hold new stubs
    Server.prototype._sendReferenceMessages = function(client, referencesMap, callback){
      var allReferences = lodash.values(referencesMap);
      var self = this;
      async.each(allReferences, function(references, next){
        // host is where the referece lives
        var host = references[0].host;
        var message = self._createMessage(Models.MessageType.REFERENCE);
        // organize the references as sessionId->array of objectIds
        var organized = {};
        for (var i = 0; i < references.length; i++) {
          var reference = references[i];
          if (organized[reference.sessionId] == null) {
            organized[reference.sessionId] = [reference.objId];
          }else{
            var found = lodash.indexOf(organized[reference.sessionId], reference.objId);
            if (found < 0) {
              organized[reference.sessionId].push(reference.objId);
            }
          }
        };
        message.setReferenceClient(modelHelper.toModelServerIdentifier(client));
        lodash.forEach(organized, function(objectIds, sessionId){
          var referenceEntry = new Models.ReferenceEntry();
          referenceEntry.setSessionId(sessionId);
          referenceEntry.setObjectIds(objectIds);
          message.add("referenceEntries", referenceEntry);
        });
        
        self.transport.send(host, message, function(err, returnMessage){
          self._handleResponse(err, returnMessage, next);
        });
      }, callback);
    }

    // trigger or return the error if it is presented.
    Server.prototype._handleResponse = function(err, returnMessage, callback){
      var error = err;
      if (error == null && returnMessage.getType() == Models.MessageType.ERROR) {
        error = Decoder._decodeError(returnMessage.getError());
      }
      if (error != null) {
        errorLogger(error);
      }
      if (callback != null) {
        callback(error);
      }else{
        return error;
      }
    };

    Server.prototype._handleInvokeFunction = function(sessionId, functionId, thisId, args, source, response) {
      var decodedArgs, decoder, e, obj;
      var thisObject = emptyObj;
      if(thisId != null){
        thisObject =  this.objectRegistry.getObject(thisId);
        if (thisObject == null) {
          var errorMsg = "cannot find 'this' object " + thisId + " for function "+functionId;
          errorLogger(errorMsg);
          response.write(this._erroMessage(errorMsg));
          return;
        }
      }
      var functionObj = this.objectRegistry.getObject(functionId);
      if (functionObj == null) {
        var errorMsg = "cannot find function with id "+ functionId;
        errorLogger(errorMsg);
        response.write(this._erroMessage(errorMsg));
        return;
      }
      try {
        decodedArgs = [];
        if ((args != null) && args.length > 0) {
          decoder = new Decoder(this, source, sessionId);
          decodedArgs = decoder.decode(args);
        }
        functionObj.apply(thisObject, decodedArgs);
        return response.write(this._successMessage());
      } catch (e) {
        errorLogger(e);
        response.write(this._erroMessage(e));
      }
    };
    // if it is a request message, we need to embed your identity in the message.
    // if it is a response message, we do not need to
    Server.prototype._createMessage = function(type) {
      var message = new Models.Message();
      message.setType(type);
      modelHelper.setHostInMessage(message, this.serverIdentifier);
      return message;
    };

    Server.prototype._successMessage = function() {
      var message = this._createMessage(Models.MessageType.ACK);
      return message;
    };

    Server.prototype._erroMessage = function(msg) {
      var message = this._createMessage(Models.MessageType.ERROR);
      var encodedError = Encoder.__newRemoteErrorDesc(msg);
      message.setError(encodedError);
      return message;
    };

    Server.prototype._invokeRemoteFunc = function(destination, funcId, thisId, args) {
      var message = this._createMessage(Models.MessageType.INVOKE);
      message.setFunctionId(funcId);
      message.setObjId(thisId);
      var sessionId = this._generateSessionId();
      message.setSessionId(sessionId);

      var encoder = null;
      var encodedArgs = null;
      if ((args != null) && args.length > 0) {
        encoder = new Encoder(this, destination, sessionId);
        encodedArgs = [];
        for (var _i = 0, _len = args.length; _i < _len; _i++) {
          var i = args[_i];
          encodedArgs.push(encoder.encode(i));
        }
        message.setArgs(encodedArgs);
      }
      
      var self = this;
      var sendInvoke = function(){
          self.transport.send(destination, message, 
            function(err, returnMessage) {
              return self._invokeResponseHandler(args, err, returnMessage);
            });
      };

      if (encoder != null && encoder.hasStubReference()) {
        this._sendReferenceMessages(destination, encoder.stubReferences, function(err){
          if (err != null) {
            //FIXME: better error handling here
            errorLogger(err);
            throw err;
          }
          sendInvoke();
        });
      }else{
        sendInvoke();
      }
    };

    Server.prototype._invokeResponseHandler = function(args, err, returnMessage) {
      // extract error
      var error = this._handleResponse(err, returnMessage);
      if (error != null) {
        // assume the last one is callback
        if ((args != null ? args.length : void 0) > 0 && typeof args[args.length - 1] === 'function') {
          callback = args[args.length - 1];
          return callback(error);
        } else {
          errorLogger("invoke remote method error :" + error);
          errorLogger("returnMessage :" + returnMessage);
        }
      }
    };

    Server.prototype.retrieveObj = function(options, callback) {
      var destination = new ServerIdentifier(options.host, options.port);
      var message = this._createMessage(Models.MessageType.RETRIEVE);
      // if we set null, protobuf will complain
      if(options.objName != null){
        message.setObjName(options.objName);  
      }
      
      return this.transport.send(destination, message, (function(_this) {
        return function(err, returnMessage) {
          var error = _this._handleResponse(err, returnMessage);
          if (error != null) {
            return callback(error);
          }
          if (logger.enabled) {
            logger("retrieveObj response :" + JSON.stringify(returnMessage));
          }
          // the other end's sessionId
          var sessionId = returnMessage.getSessionId();
          var objectPayload = returnMessage.getObject();
          var decoder = new Decoder(_this, destination, sessionId);
          return callback(null, decoder.decode(objectPayload));
        };
      })(this));
    };
    // expose object with name so other nodermi could find it using retrieveObj
    Server.prototype.registerObject = function(endPoint, obj) {
      return this.serverObj[endPoint] = obj;
    };

    Server.prototype.registerClass = function(name, clazz) {
      this.classRegistry.registerClass(name, clazz);
    };

    Server.prototype._getRegisteredClass = function(name){
      return this.classRegistry.getRegisteredClass(name);
    };

    Server.prototype.close = function(){
      this.transport.close();
      this.failureDetector.close();
    };

    return Server;

  })();

  module.exports = Server;

}).call(this);
