util = require('util')

debug = require('debug')
weak  = require('weak')
lodash = require('lodash')

{encodeHelper} = require('./common')

logger = debug("nodermi:encoding")

# the globalObj
globalObj = global


# encoder is per message
class Encoder
    constructor: (@server, @destination) ->
        {@host, @port, @privatePrefix, @excludeMethods, @objectRegistry, 
        @encodeErrorStack} = @server
        @encoded = {}

    # omit host and port for local objects
    encode : (obj)->
        result = @_encodeObject(obj)
        return result

    # mark the object as serialized, return if it is serialized before
    _markEncoded : (obj)->
        host = if obj.__r_host? then obj.__r_host else @host
        if not @encoded[host]?
            @encoded[host] = {}
        port = if obj.__r_port? then obj.__r_port else @port
        if not @encoded[host][port]?
            @encoded[host][port] = {}
        id = obj.__r_id
        if @encoded[host][port][id]
            return true
        else
            @encoded[host][port][id] = true
            return false


    #map is used to check cyclic reference
    _encodeObject : (obj)->
        if obj is null or (typeof obj isnt 'object' and typeof obj isnt 'function')
            return obj

        if weak.isWeakRef(obj)
            obj = weak.get(obj)
            # dead reference
            if not obj?
                return null

        if obj is globalObj
            throw new Error("nodermi Error : trying to serialize global object")

        # date is like a primitive type to us
        if util.isDate(obj)
            return @__newRemoteDateDesc(obj)
        # we need special handling for Error because all interesting attributes
        # of error are not emumerable
        if obj instanceof Error
            return @__newRemoteErrorDesc(obj)

        if @_isPojo(obj)
            # if it is pojo, no need to assign rid and remmeber it
            return @_newPojoDescriptor(obj)

        @objectRegistry.registObject(obj)

        # to see if it is a cyclic reference
        cached = @_markEncoded(obj)
        # there is no point to create reference for functions
        if cached and typeof obj isnt 'function'
            # new ref type
            return @__createRemoteDesc(obj, 'ref')
        else
            # serialize function
            if typeof obj is 'function'
                funcDesc = @__newRemoteFunctionDesc(obj)
                return funcDesc
            objDesc = @__createRemoteDesc(obj)
            # the object is from destination, the id alone would be enough
            if encodeHelper.isOriginEquals(objDesc, 1)
                return objDesc

            # serialize object
            if lodash.isArray(obj)
                encodeHelper.setRemoteType(objDesc, 'arrDes', true)
                #we only care elements in array
                #if the array has member function
                for element in obj
                    @__addArrayElement(objDesc, @_encodeObject(element))
                return objDesc

            for k, v of obj
                if @_isPrivate(k, obj.__r_skip, obj.__r_include)
                    continue
                if typeof v is 'function' and not v.__r_type?
                    # since methods are found by name, name alone would be enough
                    @__addFuncDesc(objDesc, k)
                else
                    @__addPropToRemoteObjDesc(objDesc, k, @_encodeObject(v))

            return objDesc

    _isPojo : (obj)->
        return @_isPojo2(obj, 3)

    _isPojo2 : (obj, depth)->
        if depth <= 0
            return false
        if typeof obj is 'function'
            return false
        if obj?
            if util.isArray(obj)
                for i in obj
                    return false if not @_isPojo2(i, depth-1)
                return true            
            if util.isDate(obj) or util.isRegExp(obj) or util.isError(obj)
                return false
            if typeof obj is 'object'
                for k, v of obj
                    return false if not @_isPojo2(v, depth-1)
        return true    
                    
                
    _newPojoDescriptor : (obj)->
        result = {}
        encodeHelper.setRemoteType(result, 'pojo', true)
        encodeHelper.setProperties(result, obj)
        return result
        
    #append remote markers to existing object or create a new object with remote markers
    __createRemoteDesc : (obj, type)->
        result = {}
        encodeHelper.setRid(result, encodeHelper.getHiddenRid(obj))
        
        remoteHost = encodeHelper.getHiddenRhost(obj)
        remotePort = encodeHelper.getHiddenRport(obj)
        if remoteHost? and remoteHost is @destination.host  and remotePort is @destination.port
            encodeHelper.setOrigin(result, 1)
        else
            encodeHelper.setRhost(result, remoteHost)
            encodeHelper.setRport(result, remotePort)
            encodeHelper.setRemoteType(result, type, true) if type?
        return result

    __newRemoteFunctionDesc : (obj) ->
        return @__createRemoteDesc(obj, 'funcDes')

    __newRemoteDateDesc : (obj) ->
        result = {}
        encodeHelper.setRemoteType(result, 'dateDes', true)
        encodeHelper.setDateValue(result, obj.getTime())
        return result

    __newRemoteErrorDesc : (obj) ->
        result = {}
        encodeHelper.setRemoteType(result, 'objDes', true)
        encodeHelper.setProperties(result, {
            message : obj.message
            name : obj.name
        })
        encodeHelper.getProperties(result).stack = obj.stack if @encodeErrorStack
        return result
        

    __newRemoteArrayDesc : (obj) ->
        return @__createRemoteDesc(obj , 'arrDes')

    __addPropToRemoteObjDesc : (desc, key, v) ->
        if not encodeHelper.getProperties(desc)?
            encodeHelper.setProperties(desc, {})
        encodeHelper.getProperties(desc)[key] = v

    __addArrayElement : (desc, v)->
        if not encodeHelper.getArrayElements(desc)?
            encodeHelper.setArrayElements(desc, [])
        encodeHelper.getArrayElements(desc).push(v)

    __addFuncDesc : (desc, v)->
        if not encodeHelper.getFunctions(desc)?
            encodeHelper.setFunctions(desc, [])
        encodeHelper.getFunctions(desc).push(v)



    # skipList specifies properties the user want to skip in serialize, i.e. a private property
    # includeList specifies properties the user want to include in serialize, i.e. not private.
    _isPrivate : (name, skipList, includeList)->
        if includeList?
            # always serierilize this property
            if name is '__r_include'
                return false

            if typeof includeList is 'string' and name is includeList
                return false

            for include in includeList
                if name is include
                    return false

        if @privatePrefix? and name.indexOf(@privatePrefix) is 0
            return true

        if skipList?
            if typeof skipList is 'string' and name is skipList
                return true

            for exclude in skipList
                if name is exclude
                    return true

        if @excludeMethods?
            for exclude in @excludeMethods
                if name is exclude
                    return true
        return false

module.exports = Encoder
