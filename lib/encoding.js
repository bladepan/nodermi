(function() {
  var util = require('util');
  var Socket = require('net').Socket;

  var debug = require('debug');
  var weak = require('weak');
  var lodash = require('lodash');

  var commonModule = require('./common');
  var stubHelper = commonModule.stubHelper;
  var Models = commonModule.Models;
  
  

  var logger = debug("nodermi:encoding");
  var errorLogger = debug("nodermi:error:encoding")

  var globalObj = global;

  function StubReference(host, sessionId, objId){
    this.host = host;
    this.sessionId = sessionId;
    this.objId = objId;
  }

  var Encoder = (function() {
    function Encoder(server, destination, sessionId) {
      if (sessionId == null) {
        throw new Error("sessionId is mandatory.");
      }
      this.server = server;
      this.destination = destination;
      var _ref = this.server;
      this.serverIdentifier = _ref.serverIdentifier, this.privatePrefix = _ref.privatePrefix,
      this.excludeMethods = _ref.excludeMethods, this.objectRegistry = _ref.objectRegistry,
      this.encodeErrorStack = _ref.encodeErrorStack;
      this.sessionId = sessionId;
      // for cyclic reference detection
      this.encoded = {};

      this.stubReferences = {};
    }

    Encoder.prototype.encode = function(obj) {
      var  result = this._encodeObject(obj);
      return result;
    };
    // put encoded object to a map for cyclic reference detection,
    // return true if the object is seen before
    Encoder.prototype._markEncoded = function(obj) {
      var remoteServer = stubHelper.getHostFromStub(obj);
      if (remoteServer == null) {
        remoteServer = this.serverIdentifier;
      }
      var id = stubHelper.getRemoteId(obj);
      if (this.encoded[remoteServer] == null) {
        this.encoded[remoteServer] = {
          id : true
        };
        return false;
      }
      if (this.encoded[remoteServer][id]) {
        return true;
      }
      this.encoded[remoteServer][id] = true;
      return false;
    };

    Encoder.prototype._encodeObject = function(obj) {
      var encodeClassed = this.__encodeClassed(obj);
      if (encodeClassed != null) {
        return encodeClassed;
      }
      // handle simple types
      if (this._isSimpleType(obj)) {
        return this.__encodeSimpleTypes(obj);
      }

      if (weak.isWeakRef(obj)) {
        obj = weak.get(obj);
        if (obj == null) {
          return this.__createSimpleRemoteDesc(Models.ObjectType.NULL);
        }
      }
      if (obj === globalObj) {
        var errorMsg = "nodermi Error : trying to serialize global object";
        errorLogger(errorMsg);
        throw new Error(errorMsg);
      }
      // it is a common mistake to pass socket around
      if (obj instanceof Socket) {
        errorLogger("Socket is not supported. Default to be encoded as null.");
        return this.__createSimpleRemoteDesc(Models.ObjectType.NULL);
      }
      if (!this._isRemoteStub(obj)) {

        if(this._isSimpleObject(obj)){
          return this.__newSimpleObjDesc(obj);
        }
        //local object, put it into local map
        this.objectRegistry.registerObject(obj, this.sessionId, this.destination);
      }
      // detect cyclic reference
      var cached = this._markEncoded(obj);
      if (cached && typeof obj !== 'function') {
        // already seen before
        return this.__createRemoteDesc(obj, Models.ObjectType.REF);
      } else {
        if (typeof obj === 'function') {
          return this.__newRemoteFunctionDesc(obj);
        }
        var objDesc = this.__createRemoteDesc(obj);
        // if this object comes from destination,
        // do not need to serialize its children
        if (objDesc.getType() == Models.ObjectType.ORIGIN) {
          return objDesc;
        }
        if (lodash.isArray(obj)) {
          objDesc.setType(Models.ObjectType.ARRAY);
          lodash.forEach(obj, lodash.bind(function(element){
            this.__addArrayElement(objDesc, this._encodeObject(element));
          }, this));
          return objDesc;
        }
        objDesc.setType(Models.ObjectType.OBJ);
        // this mode means only serialize methods
        var methodsOnly = (obj.__r_mode == 'methods');
        // lodash.forEach won't iterate prototype properties
        lodash.forIn(obj, lodash.bind(function(v,k){
          if (methodsOnly && typeof v != 'function') {
            return true;
          }
          // ignore private keys
          if (this._isPrivate(k, obj.__r_skip, obj.__r_include)) {
            return true;
          }
          this.__addPropToRemoteObjDesc(objDesc, k, this._encodeObject(v));
          return true;
        }, this));
        return objDesc;
      }
    };

    Encoder.prototype.__encodeClassed = function(obj){
      if (obj != null && typeof obj == 'object' && 
        obj.constructor != null &&
        stubHelper.getClassName(obj.constructor) != null) {
        var className = stubHelper.getClassName(obj.constructor);
        if (typeof obj.toConstructorArguments == 'function') {
          var constructorArgs = obj.toConstructorArguments();
          if (this._isSimpleType(constructorArgs) || 
            this._isSimpleObject(constructorArgs)) {
            var objDesc = this.__createSimpleRemoteDesc(Models.ObjectType.CLASSED);
            var encodedArgs = this._encodeObject(constructorArgs);
            objDesc.setClassName(className);
            objDesc.setConstructorArgs(encodedArgs);
            return objDesc;
          }else{
            throw new Error("should return simple type for toConstructorArguments in class "
              + className);
          }
        }else{
          throw new Error("cannot find function toConstructorArguments for class " 
            + className);
        }
      }
    };
    
    // simple objects are passed by value
    Encoder.prototype._isSimpleObject = function(obj, level){
      if (obj == null || typeof obj != 'object' ) {
        return false;
      }
      if (level == null) {
        level = 3;
      }
      if (level <=0) {
        return false;
      }
      var isSimple = true;
      // if obj is an array, this iteration also works fine
      lodash.forIn(obj, lodash.bind(function(v, k){
        if (this._isSimpleType(v)) {
          return true;
        }
        // ignore private keys
        if (this._isPrivate(k, obj.__r_skip, obj.__r_include)) {
          return true;
        }
        
        var vType = (typeof v);
        // if the object has methods, it is not simple
        if (vType == 'function') {
          isSimple = false;
          return false;
        }
        
        if (!this._isSimpleObject(v, level-1)) {
          isSimple = false;
          return false;
        }
      }, this));
      return isSimple;
    };



    Encoder.prototype.__newSimpleObjDesc = function(obj){
      var type = Models.ObjectType.SIMPLE;
      if (lodash.isArray(obj)) {
        type = Models.ObjectType.SIMPLEARRAY;
      }
      var objDesc = this.__createSimpleRemoteDesc(type);
      lodash.forIn(obj, lodash.bind(function(v,k){
        // ignore private keys
        if (this._isPrivate(k, obj.__r_skip, obj.__r_include)) {
          return true;
        }
        var propDesc = null;
        if(this._isSimpleType(v)) {
          propDesc = this.__encodeSimpleTypes(v);
        }else{
          propDesc = this.__newSimpleObjDesc(v);
        }
        if(type == Models.ObjectType.SIMPLE) {
          this.__addPropToRemoteObjDesc(objDesc, k, propDesc);
        }else{
          this.__addArrayElement(objDesc, propDesc);
        }
      }, this));
      return objDesc;
    };


    // simple types are passed by value
    Encoder.prototype._isSimpleType = function(obj){
      if (obj == null) {
        return true;
      }
      var objType = (typeof obj);
      if (objType != "object" && objType != "function") {
        return true;
      }
      if (util.isDate(obj) || (obj instanceof Buffer) || 
        lodash.isError(obj)) {
        return true;
      }
      return false;
    };

    Encoder.prototype.__encodeSimpleTypes = function(obj){
      if (obj == null) {
        return this.__createSimpleRemoteDesc(Models.ObjectType.NULL);
      }
      if (util.isDate(obj)) {
        return this.__newRemoteDateDesc(obj);
      }
      if (obj instanceof Buffer) {
        return this.__newRemoteBufferDesc(obj);
      }
      if (lodash.isError(obj)) {
        return Encoder.__newRemoteErrorDesc(obj, this.encodeErrorStack);
      }
      var objType = (typeof obj);
      switch(objType){
        case "string":
          var objDesc = this.__createSimpleRemoteDesc(Models.ObjectType.STRING);
          objDesc.setStringVal(obj);
          return objDesc;
        case "number":
          if (lodash.isNaN(obj)) {
            errorLogger("Skip serialize NAN value for "+key);
            var objDesc = this.__createSimpleRemoteDesc(Models.ObjectType.NULL);
            return objDesc;
          }else{
            if (obj % 1 == 0) {
              var objDesc = this.__createSimpleRemoteDesc(Models.ObjectType.INT);
              objDesc.setIntVal(obj);
              return objDesc;
            }
            var objDesc = this.__createSimpleRemoteDesc(Models.ObjectType.FLOAT);
            objDesc.setFloatVal(obj);
            return objDesc;
          }
        case "boolean":
          var objDesc = this.__createSimpleRemoteDesc(Models.ObjectType.BOOL);
          objDesc.setBoolVal(obj);
          return objDesc;
        default:
          errorLogger("unsupported type " + objType);
          return this.__createSimpleRemoteDesc(Models.ObjectType.NULL);
      }
    };

    Encoder.prototype._isRemoteStub = function(obj){
      return stubHelper.getRemoteHost(obj) != null;
    }

    Encoder.prototype.__createRemoteDesc = function(obj, type) {
      var result = new Models.ObjectDescriptor();
      var objId = stubHelper.getRemoteId(obj);
      result.setId(objId);

      if (type != null) {
        result.setType(type);
      }

      var remoteHost = stubHelper.getHostFromStub(obj);
      // this object is a stub!
      if (remoteHost != null) {
        if (remoteHost.equals(this.destination)) {
          // origin means the object is from destination
          result.setType(Models.ObjectType.ORIGIN);
        }else{
          var sessionId = stubHelper.getRemoteSessionId(obj);
          if (sessionId == null) {
            var errorMsg = "object " + remoteHost + " " + objId
              + " do not have sessionId";
            errorLogger(errorMsg);
            throw new Error(errorMsg);
          }
          // the destination references a stub from another host
          var stubReference = new StubReference(remoteHost, sessionId, objId);
          if(this.stubReferences[remoteHost] == null){
            this.stubReferences[remoteHost] = [stubReference];
          }else{
            this.stubReferences[remoteHost].push(stubReference);
          }
          this.stubReferenceExists = true;
          result.setHost(remoteHost.host);
          result.setPort(remoteHost.port);
          result.setSessionId(sessionId);
        }
      }
      // for local objects, we do not serialize host/port, because the client could
      // infer these information
      return result;
    };

    Encoder.prototype.hasStubReference = function(){
      return this.stubReferenceExists;
    };

    Encoder.prototype.__newRemoteFunctionDesc = function(obj) {
      return this.__createRemoteDesc(obj, Models.ObjectType.FUNCTION);
    };

    Encoder.prototype.__createSimpleRemoteDesc = function(type) {
      var result = new Models.ObjectDescriptor();
      result.setType(type);
      return result;
    };
    

    Encoder.prototype.__newRemoteDateDesc = function(obj) {
      var result = new Models.ObjectDescriptor();
      result.setType(Models.ObjectType.DATE);
      result.setDateValue(obj.getTime());
      return result;
    };

    // encode buffer
    Encoder.prototype.__newRemoteBufferDesc = function(obj) {
      var result = new Models.ObjectDescriptor();
      result.setType(Models.ObjectType.BUFFER);
      result.setBuffer(obj);
      return result;
    };

    Encoder.__newRemoteErrorDesc = function(obj, encodeErrorStack) {
      var result = new Models.ObjectDescriptor();
      result.setType(Models.ObjectType.ERROR);
      if (typeof obj == "string") {
        result.setErrorMsg(obj);
      }else{
        result.setErrorMsg(obj.message);
        result.setName(obj.name);
        if (encodeErrorStack) {
          result.setErrorStack(obj.stack);
        }
      }
      return result;
    };

    Encoder.prototype.__addPropToRemoteObjDesc = function(desc, key, v) {
      if (v == null) {
        return;
      }
      var property = new Models.Property();
      property.setObjectValue(v);
      property.setName(key);
      desc.add("properties", property);
    };

    Encoder.prototype.__addArrayElement = function(desc, v) {
      desc.add("arrayElements", v);
    };

    Encoder.prototype._isPrivate = function(name, skipList, includeList) {
      var exclude, include, _i, _j, _k, _len, _len1, _len2, _ref;
      if (includeList != null) {
        // includeList itself needs to be propagated
        if (name === '__r_include') {
          return false;
        }
        if (typeof includeList === 'string' && name === includeList) {
          return false;
        }
        if (lodash.includes(includeList, name)) {
          return false;
        }
      }
      if ((this.privatePrefix != null) && name.indexOf(this.privatePrefix) === 0) {
        return true;
      }
      if (skipList != null) {
        if (typeof skipList === 'string' && name === skipList) {
          return true;
        }
        if (lodash.includes(skipList, name)) {
          return true;
        }
      }
      if (this.excludeMethods != null) {
        if (lodash.includes(this.excludeMethods, name)) {
          return true;
        }
      }
      return false;
    };

    return Encoder;

  })();

  module.exports = Encoder;

}).call(this);
