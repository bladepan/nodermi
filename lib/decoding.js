(function() {
  var util = require('util');

  var debug = require('debug');
  var lodash = require('lodash');

  var commonModule = require('./common');
  var Models = commonModule.Models;
  var modelHelper = commonModule.modelHelper;
  var stubHelper = commonModule.stubHelper;
  var ServerIdentifier = commonModule.ServerIdentifier;

  var logger = debug('nodermi:decode');
  var errorLogger = debug('nodermi:error:decode');

  var Decoder = (function() {
    function Decoder(server, source, sessionId) {
      if (sessionId == null) {
        throw new Error("sessionId is mandatory");
      };
      var _ref;
      this.server = server;
      this.source = source;
      _ref = this.server, this.serverIdentifier = _ref.serverIdentifier,
      this.objectRegistry = _ref.objectRegistry;
      this.decoded = {};
      this.sessionId = sessionId;
    }

    Decoder.prototype.decode = function(obj) {
      return this._decode(obj);
    };

    Decoder.prototype._decode = function(obj) {
      if ((obj == null) || (typeof obj !== 'object' && typeof obj !== 'function')) {
        return obj;
      }
      if (util.isArray(obj)) {
        var result = [];
        lodash.forEach(obj, function(item){
          result.push(this._decode(item))
        }, this);
        return result;
      }
      var remoteType = obj.getType();
      switch (remoteType) {
        case Models.ObjectType.OBJ:
          return this._decodeObj(obj);
        case Models.ObjectType.NULL:
          return null;

        case Models.ObjectType.ARRAY:
          return this._decodeArray(obj);   
        case Models.ObjectType.FUNCTION:
          return this._decodeFunction(obj);

        case Models.ObjectType.DATE:
          return this._decodeDate(obj);
        case Models.ObjectType.ERROR:
          return Decoder._decodeError(obj);
        case Models.ObjectType.BUFFER :
          return this._decodeBuffer(obj);
        case Models.ObjectType.REF:
          return this._decodeRef(obj);
        case Models.ObjectType.ORIGIN:
          return this._decodeOrigin(obj);
        case Models.ObjectType.STRING:
          return obj.getStringVal();
        case Models.ObjectType.INT:
          var intVal = obj.getIntVal();
          return intVal.toNumber();
        case Models.ObjectType.FLOAT:
          return obj.getFloatVal();
        case Models.ObjectType.BOOL:
          return obj.getBoolVal();

        case Models.ObjectType.SIMPLE:
          return this._decodeSimple(obj);
        case Models.ObjectType.SIMPLEARRAY:
          return this._decodeSimpleArray(obj);
        case Models.ObjectType.CLASSED:
          return this._decodeClassed(obj);
        default:
          var errorMsg = "unknown type "+ remoteType;
          errorLogger(errorMsg);
          throw new Error(errorMsg);
      }
    };

    // the object is from here
    Decoder.prototype._decodeOrigin = function(objDesc) {
      var id = objDesc.getId();
      var result = this.objectRegistry.getObject(id);
      if (result == null) {
        logger("cannot find object " + id);
      }
      this._markDecoded(objDesc, result);
      return result;
    };


    // remember what has been decoded so far, to resolve cyclic reference.
    // objDesc is remote object descriptor, result is the object stub created
    Decoder.prototype._markDecoded = function(objDesc, result) {
      var remoteHost = this._getSource(objDesc);
      var id = objDesc.getId();
      if (this.decoded[remoteHost] == null) {
        this.decoded[remoteHost] = {};
      }
      this.decoded[remoteHost][id] = result;
    };

    Decoder.prototype._decodeFunction = function(obj) {
      var source = this._getSource(obj);
      var server = this.server;
      var funcId = obj.getId();
      var func = (function(source, funcId, server) {
        return function() {
          var thisObjId = null;
          var thisServer = stubHelper.getHostFromStub(this);
          // pass this if it is from source
          if (source.equals(thisServer)) {
            thisObjId = stubHelper.getRemoteId(this);
          }
          return server._invokeRemoteFunc(source, funcId, thisObjId, arguments);
        };
      })(source, funcId, server);
      this._setRmiFields(func, obj);
      this._markDecoded(obj, func);
      this.objectRegistry.registerStub(func);
      return func;
    };

    Decoder.prototype._getSource = function(obj) {
      // it is from myself
      if (obj.getType() == Models.ObjectType.ORIGIN) {
        return this.serverIdentifier;
      }
      var remoteHost = modelHelper.getHostFromDescriptor(obj);
      if (remoteHost == null) {
        remoteHost = this.source;
      } 
      return remoteHost;
    };

    Decoder.prototype._decodeArray = function(obj) {
      var result = [];
      this._setRmiFields(result, obj);
      this._markDecoded(obj, result);
      var arrayElements = obj.getArrayElements();
      lodash.forEach(arrayElements, function(element){
        result.push(this._decode(element));
      }, this);

      this.objectRegistry.registerStub(result);
      return result;
    };

    // fill rmi id, host, etc to the stub object
    Decoder.prototype._setRmiFields = function(stubObj, objDesc) {
      var objId = objDesc.getId();
      stubHelper.setRemoteId(stubObj, objId);
      var remoteHost = this._getSource(objDesc);

      var sessionId = null;
      // the object is from source
      if (this.source.equals(remoteHost)) {
        sessionId = this.sessionId;
      }else{
        sessionId = objDesc.getSessionId();
        if (sessionId == null) {
          var errorMsg = "Obect " + remoteHost + 
            + " " + objId + " do not have sessionId.";
          errorLogger(errorMsg);
          throw new Error(errorMsg);
        }
      }
      stubHelper.setRemoteHost(stubObj, remoteHost.host);
      stubHelper.setRemotePort(stubObj, remoteHost.port);
      stubHelper.setRemoteSessionId(stubObj, sessionId);
    };

    Decoder.prototype._decodeSimple = function(obj) {
      var result = {};
      var properties = obj.getProperties();
      if (properties != null) {
        lodash.forEach(properties, function(prop){
          result[prop.getName()] = this._decode(prop.getObjectValue());
        }, this);
      }
      return result;
    };

    Decoder.prototype._decodeSimpleArray = function(obj) {
      var result = [];
      var arrayElements = obj.getArrayElements();
      lodash.forEach(arrayElements, function(element){
        result.push(this._decode(element));
      }, this);
      return result;
    };

    Decoder.prototype._decodeClassed = function(obj) {
      var className = obj.getClassName();
      var registeredClass = this.server._getRegisteredClass(className);
      if (registeredClass != null) {
        var decodedArgs = this._decode(obj.getConstructorArgs());
        return new registeredClass(decodedArgs);
      }else{
        var errorMsg = "class "+ className + " is not registered";
        errorLogger(errorMsg);
        return new Error("class "+ className + " is not registered");
      }

    };

    Decoder.prototype._decodeDate = function(obj) {
      var time = obj.getDateValue(obj);
      //64 bit int is wrapped
      var result = new Date(time.toNumber());
      return result;
    };

    Decoder._decodeError = function(obj) {
      var errorMsg = obj.getErrorMsg();
      var errorStack = obj.getErrorStack();
      var name = obj.getName();
      var result = new Error(errorMsg);
      if (name != null) {
        result.name = name;
      }
      if (errorStack != null) {
        result.stack = errorStack;
      }
      return result;
    };
    

    Decoder.prototype._decodeBuffer = function(obj) {
      // buffer is wrapped when serialized using protobuf.js 
      var buffer = obj.getBuffer();
      return buffer.toBuffer();
    };

    Decoder.prototype._decodeObj = function(obj) {
      var result = {};
      this._setRmiFields(result, obj);
      this._markDecoded(obj, result);
      var properties = obj.getProperties();
      if (properties != null) {
        lodash.forEach(properties, function(prop){
          result[prop.getName()] = this._decode(prop.getObjectValue());
        }, this);
      }
      // every stub created should be registered exactly once !
      this.objectRegistry.registerStub(result);
      return result;
    };

    Decoder.prototype._decodeRef = function(objDesc) {
      var id = objDesc.getId();
      var remoteHost = this._getSource(objDesc);
      return this.decoded[remoteHost][id];
    };

    return Decoder;

  })();

  module.exports = Decoder;

}).call(this);
