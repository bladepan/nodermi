util = require('util')

debug = require('debug')

{encodeHelper} = require('./common')

logger = debug('nodermi:decode')

class Decoder
    constructor: (@server, @source) ->
        {@host, @port, @objectRegistry} = @server
        @decoded = {}

    decode: (obj)->
        return @_decode(obj)

    _decode: (obj) ->
        if not obj? or (typeof obj isnt 'object' and typeof obj isnt 'function')
            return obj
        if util.isArray(obj)
            result = []
            for i in obj
                result.push(@_decode(i))
            return result

        id = encodeHelper.getRid(obj)
        if encodeHelper.isOriginEquals(obj, 1)
            result = @objectRegistry.getObject(id)
            if not result?
                logger("cannot find object #{id}")
            @_markDecoded(obj, result)
            return result
        remoteType = encodeHelper.getFullRemoteType(obj)
        switch remoteType
            when 'funcDes'
                return @_decodeFunction(obj)
            when 'arrDes'
                return @_decodeArray(obj)
            when 'dateDes'
                return @_decodeDate(obj)
            when 'pojo'
                return @_decodePojo(obj)
            when 'ref'
                return @_decodeRef(obj)
            else
                return @_decodeObj(obj)

    _markDecoded : (objDesc, result)->
        if encodeHelper.isOriginEquals(objDesc, 1)
            @_markDecoded2(@host, @port, encodeHelper.getRid(objDesc), result)
            return
        remoteHost = encodeHelper.getHiddenRhost(result)
        remotePort = encodeHelper.getHiddenRport(result)
        @_markDecoded2(remoteHost, remotePort, encodeHelper.getRid(objDesc), result)

    _markDecoded2 : (host, port, id, result)->
        if not @decoded[host]?
            @decoded[host]={}
        if not @decoded[host][port]?
            @decoded[host][port]={}
        @decoded[host][port][id]=result


    _decodeFunction : (obj)->
        source = @_getSource(obj)
        {server} = @
        funcId = encodeHelper.getRid(obj)
        func = do(source, funcId, server)->
            return ()->
                server._invokeRemoteFunc(source, funcId, arguments)
        @_setRmiField(func, obj)
        @_markDecoded(obj, func)
        return func

    _getSource : (obj)->
        remoteHost = encodeHelper.getRhost(obj)
        remotePort = encodeHelper.getRport(obj)
        source = null
        if not remoteHost? and not remotePort?
            source = @source
        else
            source = {
                host : remoteHost
                port : remotePort
            }
        return source

    _decodeArray : (obj)->
        result = []
        @_setRmiField(result, obj)
        @_markDecoded(obj, result)
        arrayElements = encodeHelper.getArrayElements(obj)
        if arrayElements?
            for i in arrayElements
                result.push(@_decode(i))
        return result

    _setRmiField : (stubObj, objDesc)->
        encodeHelper.setHiddenRid(stubObj, encodeHelper.getRid(objDesc))
        remoteHost = encodeHelper.getRhost(objDesc)
        remotePort = encodeHelper.getRport(objDesc)
        if not remoteHost? and not remotePort?
            remoteHost = @source.host
            remotePort = @source.port
        encodeHelper.setHiddenRhost(stubObj, remoteHost)
        encodeHelper.setHiddenRport(stubObj, remotePort)

    _decodeDate : (obj)->
        time = encodeHelper.getDateValue(obj)
        result = new Date(time)
        return result

    _decodePojo : (obj)->
        return encodeHelper.getProperties(obj)

    _decodeObj : (obj)->
        result = {}
        @_setRmiField(result, obj)
        @_markDecoded(obj, result)
        properties = encodeHelper.getProperties(obj)
        if properties?
            for k, v of properties
                result[k] = @_decode(v)
        functions = encodeHelper.getFunctions(obj)
        if functions?
            source = @_getSource(obj)
            {server} = @
            objId = encodeHelper.getRid(obj)
            for funcName in functions
                func = do(source, objId, funcName, server)->
                    return ()->
                        server._invokeRemoteMethod(source, objId, funcName, arguments)
                result[funcName] = func
        return result

    _decodeRef : (objDesc)->
        id = encodeHelper.getRid(objDesc)
        remoteHost = encodeHelper.getRhost(objDesc)
        remotePort = encodeHelper.getRport(objDesc)
        if not remoteHost? and not remotePort?
            remoteHost = @source.host
            remotePort = @source.port
        return @decoded[remoteHost]?[remotePort]?[id]



module.exports = Decoder











