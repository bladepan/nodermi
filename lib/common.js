
var debug = require('debug');
var ProtoBuf = require("protobufjs");

var lodash = require('lodash');
var async  = require('async');

logger = debug('nodermi:common');

var protoBuilder = ProtoBuf.loadProtoFile(__dirname+"/message.proto");
var Models = protoBuilder.build("nodermi");

function addHiddenField(obj, key, val) {
  Object.defineProperty(obj, key, {
    value: val,
    writable: false,
    enumerable: false,
    configurable: false
  });
};

/*
use these fields to remember object's id, stub's source.
these fields are hidden, non enumerable. Use '__r*' to avoid conflict with
user defined fields
*/
var hiddenFields = {
  remoteId : '__r_id',
  remoteHost : '__r_host',
  remotePort : '__r_port',
  remoteSessionId : '__r_sid',
  className : '__r_class'
};

var modelHelper = {
  getHostFromDescriptor : function(desc){
    var host = desc.getHost();
    if (host == null) {
      return null;
    }
    var port = desc.getPort();
    return new ServerIdentifier(host, port);
  },
  getHostFromMessage : function(msg){
    return new ServerIdentifier(msg.getHost(), msg.getPort());
  },
  setHostInMessage : function(msg, host){
    msg.setHost(host.host);
    msg.setPort(host.port);
  },
  toServerIdentifier : function(host){
    return new ServerIdentifier(host.getHost(), host.getPort());
  },
  toModelServerIdentifier : function(host){
    var result = new Models.ServerIdentifier();
    result.setHost(host.host);
    result.setPort(host.port);
    return result;
  }
};

/*
  helper objects to get/set nodermi hidden fields
*/
var stubHelper = {
  getHostFromStub: function(stub){
    if (stub == null) {
      return null;
    }
    var host = stubHelper.getRemoteHost(stub);
    if (host==null) {
      return null;
    }
    var port = stubHelper.getRemotePort(stub);
    return new ServerIdentifier(host, port);
  },
  setHostInStub: function(stub, host){
    this.setRemoteHost(stub, host.host);
    this.setRemotePort(stub, host.port);
  }
};

lodash.forEach(hiddenFields, function(propName, key){
  var normalized = key.charAt(0).toUpperCase() + key.slice(1);
  var setter = "set" + normalized;

  var getter = (function(propName) {
      return function(obj) {
        return obj[propName];
      };
  })(propName);
  stubHelper["get" + normalized] = getter;

  var setter = (function(propName) {
      return function(obj, val) {
        addHiddenField(obj, propName, val);
      };
  })(propName);

  stubHelper["set" + normalized] = setter;
});


// should not mutate the properties of this class
function ServerIdentifier(host, port){
  this.host = host;
  this.port = port;
  if (typeof port != "number") {
    this.port = parseInt(this.port);
  }
}
lodash.assign(ServerIdentifier.prototype, {
  equals : function(another){
    if (another==null) {
      return false;
    }
    if (another == this) {
      return true;
    }
    return this.host == another.host && this.port == another.port;
  },
  // we use this as key in lookup maps
  toString : function(){
    if (this.__string == null) {
      this.__string = this.host+":"+this.port;
    }
    return this.__string;
  },
  clone : function(){
    return new ServerIdentifier(this.host, this.port);
  }
});

exports.ServerIdentifier = ServerIdentifier;
exports.Models = Models;


exports.modelHelper = modelHelper;
exports.stubHelper = stubHelper;

exports.privatePrefix = '_';

/*
__defineGetter__  __defineSetter__   __lookupGetter__  __lookupSetter__
constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString
toString valueOf toJSON
 */
exports.excludeMethods = ['constructor', 'hasOwnProperty', 'isPrototypeOf',
'propertyIsEnumerable', 'toLocaleString', 'toString', 'valueOf', 'toJSON'];

