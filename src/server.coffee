util = require('util')

debug = require('debug')

ObjectRegistry = require('./object_registry')
{encodeHelper, privatePrefix, excludeMethods} = require('./common')
Encoder = require('./encoding')
Decoder = require('./decoding')

logger = debug('nodermi:server')

emptyObj = {}

class Server
    constructor: (options, callback) ->
        {@host, @port} = options
        @objectRegistry = new ObjectRegistry()
        @privatePrefix = privatePrefix
        @excludeMethods = excludeMethods
        @serverObj = {}
        
        FileLogger = require('./file_logger')
        @fileLogger = new FileLogger(options)

        HttpTransport = require('./http_transport')
        @transport = new HttpTransport(@)

        @transport.on('message', @requestHandler.bind(@))
        @transport.once('initialized', (err)=>
            callback err, @
        )

    requestHandler: (message, response)->
        destination = {
            host : encodeHelper.getRhost(message)
            port : encodeHelper.getRport(message)
        }
        logger("got request #{JSON.stringify(message)}")
        switch encodeHelper.getFullMessageType(message)
            when 'retrive'
                objName = encodeHelper.getObjectName(message)
                @_handleRetriveObj(objName, destination, response)
            when 'invoke'
                objId = encodeHelper.getObjectId(message)
                funcName = encodeHelper.getFunctionName(message)
                args = encodeHelper.getArgs(message)
                @_handleInvokeFunction(objId, funcName, args, destination, response)

    _handleRetriveObj: (objName, destination, response)->
        obj = if objName? then @serverObj[objName] else @serverObj
        encoder = new Encoder(@, destination)
        encoded = encoder.encode(obj)
        response.write(encoded)


    _handleInvokeFunction : (objId, funcName, args, source, response)->
        obj = @objectRegistry.getObject(objId)
        if not obj?
            logger("cannot find obj #{objId}")
            response.write(@_erroMessage("cannot find obj #{objId}"))            
            return
        decodedArgs = []
        if args? and args.length>0
            decoder = new Decoder(@, source)
            decodedArgs = decoder.decode(args)
        if funcName?
            obj[funcName].apply(obj, decodedArgs)
        else
            # obj itself is a function
            obj.apply(emptyObj, decodedArgs)

        response.write(@_successMessage())

    _createMessage : (type)->
        message = {}
        encodeHelper.setMessageType(message, type, true)
        encodeHelper.setRhost(message, @host)
        encodeHelper.setRport(message, @port)
        return message
        # in the future, set server version and protocal version

    _successMessage : ()->
        message = @_createMessage('success')
        return message
        
    _erroMessage : (msg)->
        message = @_createMessage('error')
        encodeHelper.setProperties(message, msg)
        return message


    _invokeRemoteMethod : (destination, objId, funcName, args) ->
        message = @_createMessage('invoke')
        encodeHelper.setObjectId(message, objId)
        encodeHelper.setFunctionName(message, funcName)
        encodedArgs = @_encodeArguments(destination, args)
        encodeHelper.setArgs(message, encodedArgs)

        @transport.send(destination, message, (err, returnMessage)=>
            @_invokeResponseHandler(args, err, returnMessage)
        )

    _encodeArguments : (destination, args)->
        result = null
        if args? and args.length>0
            encoder = new Encoder(@, destination)
            result = []
            for i in args
                result.push(encoder.encode(i))
        return result
            
    _invokeRemoteFunc : (destination, funcId, args)->
        message = @_createMessage('invoke')
        encodeHelper.setObjectId(message, funcId)
        encodedArgs = @_encodeArguments(destination, args)
        encodeHelper.setArgs(message, encodedArgs)

        @transport.send(destination, message, (err, returnMessage)=>
            @_invokeResponseHandler(args, err, returnMessage)
        )

    _invokeResponseHandler : (args, err, returnMessage)->
        error = err
        if not error? and encodeHelper.getFullMessageType(returnMessage) is 'error'
            error = encodeHelper.getProperties(returnMessage)
        # by convention, the last arg is a callback
        if error?
            if args?.length>0 and typeof args[args.length-1] is 'function'
                callback = args[args.length-1]
                callback(error)
            else
                logger("invoke remote method error #{error}")


    retriveObj : (options, callback)->
        destination = {
            host : options.host
            port : options.port
        }
        message = @_createMessage('retrive')
        encodeHelper.setObjectName(message, options.objName)
        @transport.send(destination, message, (err, returnMessage)=>
            return callback(err) if err?
            decoder = new Decoder(@, destination)
            callback(null, decoder.decode(returnMessage))
        )

    createSkeleton: (endPoint, obj)->
        @serverObj[endPoint] = obj

module.exports = Server
        


    
