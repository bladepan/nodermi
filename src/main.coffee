# remote Object
# {
#   __r_id
#   __r_host
#   __r_port
#   __r_type : 'object'

# }
# 
# remote Object descriptor
# {
#   __r_id
#   __r_host
#   __r_port
#   __r_type : 'objDes' or 'arrDes' or 'dateDes'
#   __r_arr : [ elements for array]
#   __r_date : date.getTime()
#   __r_props : {
#       key/value mapping of primitive types and other remote object descriptor
#   }
# }
# 
# remote Function
# {
#   __r_id
#   __r_host
#   __r_port
#   __r_type : 'function'
# }
# 
# remote Function descriptor
# {
#   __r_id
#   __r_host
#   __r_port
#   __r_type : 'funcDes'
# }
# 
#  a object is a remote object if it has attribute __r_type.
#   
#   __r_host __r_port are optional
#   
#   request
#   {
#       type : 'retrive' or 'invoke'
#       objName : for 'retrive'
#       objId : for 'invoke'
#       args : argument list, array
#   }
#   
#   response
#   {
#       error : if error      
#       
#   }
#  descriptors only live in transmission layer
#  __r_host and __r_port are leave out if it is the local object from the server
#
fs             = require 'fs'
http           = require 'http'
util = require 'util'   
{EventEmitter} = require('events')

weak           = require 'weak'
express        = require 'express'
lodash         = require 'lodash'

# the globalObj
globalObj = global


class RmiService extends EventEmitter
    # The pact is private fields are started with _
    _privatePrefix : '_'
    ###
    __defineGetter__  __defineSetter__   __lookupGetter__  __lookupSetter__  
    constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString        
    toString valueOf toJSON
    ###
    _excludeMethods : ['constructor', 'hasOwnProperty','isPrototypeOf',
                        'propertyIsEnumerable', 'toLocaleString', 'toString',
                        'valueOf', 'toJSON']
    constructor: (@_option, callback) ->
        {@host, @port} = @_option
        @_logging = true
        @_fileName = "localhost-#{@port}.log"
        if @host?
            @_fileName = "#{@host}-#{@port}.log"
        @sequence = 42
        @serverObj = {}
        @methods = {}        
        @objects = {}
        @server = express()
        #parse the body
        bodyParser = require('body-parser') 
        @server.use(bodyParser.urlencoded({extended:true}))
        @server.use(bodyParser.json())
        @server.post('/',(req, res)=>
            @handleRemoteRequest(req, res)
        )
        callbackFired = false
        errorHandler = (err)->
            if callback
                callback err
                callbackFired = true

        httpServer = http.createServer(@server)

        httpServer.on('error',errorHandler)

        # apparently the callback is fired on 'listening' event, aka, it
        # is only triggered when listening is successful.
        # http://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback
        args = [@port]
        # host is optional
        args.push(@host) if @host?
        args.push(511)
        args.push((err)=>
            if callback? and not callbackFired
                callback err, this
                @server.removeListener('error', errorHandler)
            @_log "RmiService listening on #{@port}"
        )
        httpServer.listen.apply(httpServer, args)        
        
        
    # skipList specifies properties the user want to skip in serialize, i.e. a private property
    # includeList specifies properties the user want to include in serialize, i.e. not private.
    _isPrivate : (name, skipList, includeList)->
        if includeList?
            # make this property sticky
            if name is '__r_include'
                return false
            
            if typeof includeList is 'string' and name is includeList
                return false

            for include in includeList
                if name is include
                    return false
                
        if name.indexOf(@_privatePrefix) is 0
            return true

        if skipList?
            if typeof skipList is 'string' and name is skipList
                return true

            for exclude in skipList
                if name is exclude
                    return true
        
        for exclude in @_excludeMethods
            if name is exclude
                return true
        return false
        
    _log : (str) ->
        if @_logging
            fs.appendFile(@_fileName, str+'\n', (err)->
                if err
                    console.log "nodermi logging error"
                    console.log err
                    console.log err.stack
            )
            
        

    getSequence :()->
        @sequence++

    handleRemoteRequest : (req, res)->
        @_log "#{@host}:#{@port} receive request..."
        @_log JSON.stringify(req.body)
        if(req.body.type is 'retrive')
            obj = @serverObj
            if req.body.objName?
                obj = @serverObj[req.body.objName]
            serialized = @serializeObject(obj)
            objstr = JSON.stringify(serialized)
            res.write(objstr)
            res.end()
            return
        if req.body.type is 'invoke'
            if req.body.methodName?
                obj = @objects[req.body.objId]
                method = obj[req.body.methodName]
            else
                obj = {}
                method = @objects[req.body.objId]
            if not method?
                return @noSuchMethod(res)
            args = []
            for arg in req.body.args
                remoteObj = @parseRemoteObj(arg,{host:req.body.host, port:req.body.port}, {})
                args.push(remoteObj)               
            method.apply(obj, args)
            res.end()
            return

    createSkeleton: (endPoint, obj)->
        @serverObj[endPoint] = obj

    #TODO only keep id if the object is from the destination
    serializeObject : (obj)->
        @__serializeObject(obj, {})

    #append remote markers to existing object or create a new object with remote markers
    __createRemoteDesc : (id, host, port, type, source)->
        result = if source? then source else {}
        result.__r_id = id
        result.__r_type = type
        # only add fields if they are from elsewhere
        if host? and port? and (host isnt @host or port isnt @port)
            result.__r_host = host
            result.__r_port = port
        return result

    __newRemoteObjectDesc : (id, host, port) ->
        return @__createRemoteDesc(id, host, port , 'objDes')

    __newRemoteArrayDesc : (id, host, port) ->
        return @__createRemoteDesc(id, host, port , 'arrDes',{
            __r_arr : []
            })

    __addPropToRemoteObjDesc : (desc, key, v) ->
        if not desc.__r_props?
            desc.__r_props = {}
        desc.__r_props[key] = v
        

    __newRemoteFunctionDesc : (id, host, port) ->
        return @__createRemoteDesc(id, host, port , 'funcDes')

    __newRemoteDateDesc : (obj) ->
        return {
            __r_type : 'dateDes'
            __r_date : obj.getTime()
        }

    __newRemoteErrorDesc : (obj) ->
        return {
            __r_type : 'objDes',
            __r_props : {
                message : obj.message,
                stack : obj.stack
            }
        }


        
    #map is used to check cyclic reference
    __serializeObject : (obj, map)->
        if obj is null or (typeof obj isnt 'object' and typeof obj isnt 'function')
            return obj

        # assign id, this is definitely a local object
        if weak.isWeakRef(obj)
            obj = weak.get(obj)
            # dead reference
            if not obj?
                return null

        if obj is globalObj
            throw new Error("nodermi Error : trying to serialize global object")

        # date is like a primitive type to us
        if lodash.isDate(obj)
            return @__newRemoteDateDesc(obj)
        # we need special handling for Error because all interesting attributes
        # of error are not emumerable
        if obj instanceof Error
            return @__newRemoteErrorDesc(obj)


        if not obj.__r_id?
            # we certainly do not want to contaminate the original object 
            addHiddenField(obj, '__r_id', @getSequence())
            @objects[obj.__r_id] = obj
        host = if obj.__r_host? then obj.__r_host else @host
        port = if obj.__r_port? then obj.__r_port else @port
        if not map[host]?
            map[host]={}
        if not map[host][port]?
            map[host][port]={}
        id = obj.__r_id
        # to see if it is a cyclic reference
        cached = if map[host][port][id]? then map[host][port][id] else null
        # there is no point to create reference for functions
        if cached and typeof obj isnt 'function'
            # new ref type
            return @__createRemoteDesc(id, host, port, 'ref')
        else
            # put it to cyclic checking map
            map[host][port][id] = true
            if obj.__r_type?
                return @serializeForRemoteTypes(obj, map)
            # serialize function
            if typeof obj is 'function'
                funcDesc = @__newRemoteFunctionDesc(id, host, port)
                return funcDesc
            # serialize object
            if lodash.isArray(obj)
                objDesc = @__newRemoteArrayDesc(id, host, port)
                #we only care elements in array
                #if the array has member function
                for element in obj
                    objDesc.__r_arr.push(@__serializeObject(element,map))
                return objDesc
            
            objDesc = @__newRemoteObjectDesc(id, @host, @port)
            for k, v of obj
                if @_isPrivate(k, obj.__r_skip, obj.__r_include)
                    continue
                if typeof v is 'function' and not v.__r_type?
                    # since methods are found by name, a type would be enough
                    @__addPropToRemoteObjDesc(objDesc, k, {__r_type:'funcDes'})    
                else
                    @__addPropToRemoteObjDesc(objDesc, k, @__serializeObject(v, map))

            return objDesc        

    #convert remote objects to remote descriptors
    serializeForRemoteTypes : (obj, map)->
        if obj.__r_type is 'objDes' or obj.__r_type is 'funcDes'
            #this should not happen, unless in the future, descriptors are cached
            @_log "descriptors should only live in transmission layer"
            return obj
        if obj.__r_type is 'object'
            
            if lodash.isArray(obj)
                result = @__newRemoteArrayDesc(obj.__r_id, obj.__r_host, obj.__r_port)
                for v in obj
                    result.__r_arr.push(@__serializeObject(v, map))
                return result
                
            # ordinary object
            result = @__newRemoteObjectDesc(obj.__r_id, obj.__r_host, obj.__r_port)
            for k, v of obj
                if k.indexOf('__r_') is 0
                    continue
                @__addPropToRemoteObjDesc(result, k, @__serializeObject(v, map))
            return result
        if obj.__r_type is 'function'
            return @__newRemoteFunctionDesc(obj.__r_id, obj.__r_host, obj.__r_port)


    retriveObj : (option, callback)->
        reqOption = {
            hostname : option.host
            port : option.port
            requestBody : {
                type : 'retrive'
                objName : option.objName
            }
        }
        @httpRequest(reqOption, (err, body, resp)=>
            if err?
                callback err
                return
            @_log "#{@host}:#{@port} receive response..."
            @_log body
            respObj = JSON.parse(body)
            result = @parseRemoteObj(respObj, option, {})
            callback null, result
        )

    __appendRemoteMarker : (remoteObj, desc, context, type) ->
        id = if desc.__r_id? then desc.__r_id else desc
        host = if desc.__r_host? then desc.__r_host else context.host
        port = if desc.__r_port? then desc.__r_port else context.port
        addHiddenField(remoteObj, '__r_id', id)
        addHiddenField(remoteObj, '__r_host', host)
        addHiddenField(remoteObj, '__r_port', port)
        addHiddenField(remoteObj, '__r_type', type)


    __newRemoteArr : (desc, context) ->
        result = []
        @__appendRemoteMarker(result, desc, context, 'object')

    __newRemoteObj : (desc, context) ->
        result = {}
        @__appendRemoteMarker(result, desc, context, 'object')

    __newRemoteFunc : (desc, context) ->
        id = if desc.__r_id? then desc.__r_id else desc
        host = if desc.__r_host? then desc.__r_host else context.host
        port = if desc.__r_port? then desc.__r_port else context.port
        # it is local method
        if host is @host and port is @port
            return @objects[id]

        _this = @
        func = do (_this, host, port ,id)->
            ()->
                _this.invokeRemoteFunc(host, port, id, arguments)
        @__appendRemoteMarker(func, desc, context, 'function')
        return func

    __findInMap : (desc, context, map) ->
        id = desc.__r_id
        host = if desc.__r_host? then desc.__r_host else context.host
        port = if desc.__r_port? then desc.__r_port else context.port
        return map[host][port][id]

    __putInMap : (desc, context, map) ->
        id = desc.__r_id
        host = if desc.__r_host? then desc.__r_host else context.host
        port = if desc.__r_port? then desc.__r_port else context.port
        if not map[host]?
            map[host]={}
        if not map[host][port]?
            map[host][port] = {}
        map[host][port][id] = desc
        
    __newRemoteMethod : (desc, key, context) ->
        id = if desc.__r_id? then desc.__r_id else desc
        host = if desc.__r_host? then desc.__r_host else context.host
        port = if desc.__r_port? then desc.__r_port else context.port
        _this = @
        func = do (_this, host, port ,id)->
            ()->
                _this.invokeRemoteMethod(host, port, id, key, arguments)
        @__appendRemoteMarker(func, desc, context, 'function')
        return func


    #parse descriptors to remote stub
    #context is the server's host and port
    #map is for cyclic detection
    parseRemoteObj : (obj, context, map)->
        #return simple types
        if not obj? or not obj.__r_type?
            return obj
        # return local object if possible
        if obj.__r_host is @host and obj.__r_port is @port
            localObj = @objects[obj.__r_id]
            @__putInMap(localObj, context, map)
            return localObj

        if obj.__r_type is 'dateDes'
            return new Date(obj.__r_date)

        if obj.__r_type is 'objDes' or obj.__r_type is 'arrDes'    
            result = null
            if obj.__r_type is 'objDes'
                result = @__newRemoteObj(obj, context)
            if obj.__r_type is 'arrDes'
                result = @__newRemoteArr(obj, context)
            
            @__putInMap(result, context, map)
            for k, v of obj.__r_props
                if v? and v.__r_type is 'funcDes'
                    result[k] = @__newRemoteMethod(obj, k, context)
                else
                    result[k]= @parseRemoteObj(v, context, map, obj)
            if obj.__r_arr?
                for v in obj.__r_arr
                    result.push(@parseRemoteObj(v, context, map))
            return result
        
        if obj.__r_type is 'funcDes'
            remoteFunc = @__newRemoteFunc(obj, context)
            @__putInMap(remoteFunc, context, map)
            return remoteFunc
        if obj.__r_type is 'ref'
            # return local object if possible
            if obj.__r_host is @host and obj.__r_port is @port
                return @objects[obj.__r_id]
            return @__findInMap(obj, context, map)

        # no other types
        throw new Error('Unknown type')

    invokeRemoteFunc : (host, port, id, args)->
        serializedArgs = []
        callback = null
        if args?
            for arg in args
                serializedArgs.push(@serializeObject(arg))
            #conventionally the last arg is callback
            lastArg = args[args.length-1]
            if typeof lastArg is 'function'
                callback = lastArg
        
        reqOption = {
            hostname :host
            port : port
            requestBody : {
                type : 'invoke'
                objId : id
                host : @host
                port : @port
                args : serializedArgs
            }
        }
        @httpRequest(reqOption, (err, body, resp)=>
            if err?
                if callback?
                    callback err
                else
                    @emit 'error', err
                return
            # TODO parse error requests
        )
        return null

    invokeRemoteMethod : (host, port, id, methodName, args) ->
        serializedArgs = []
        callback = null
        if args?
            for arg in args
                serializedArgs.push(@serializeObject(arg))
            #conventionally the last arg is callback
            lastArg = args[args.length-1]
            if typeof lastArg is 'function'
                callback = lastArg
        
        reqOption = {
            hostname :host
            port : port
            requestBody : {
                type : 'invoke'
                objId : id
                methodName : methodName
                host : @host
                port : @port
                args : serializedArgs
            }
        }
        @httpRequest(reqOption, (err, body, resp)=>
            if err?
                if callback?
                    callback err
                else
                    @emit 'error', err
                return
            # TODO parse error requests
        )


    #options is identical to options in http.request function, with an optional requestBody
    # handler(err, body, response)
    httpRequest : (options, handler)->
        options.method = 'POST'
        options.headers = {"Content-type" :"application/json; charset=utf-8"}
        req = http.request(options, (res)->
            res.setEncoding('utf8')
            body=''
            res.on('data', (chunk)->
                body+=chunk
            )
            res.on('end',()->
                handler null, body, res
            )
        )
        req.on('error',(e)->
            handler e
        )
        if options.requestBody?
            @_log "post #{options.hostname}:#{options.port} #{JSON.stringify(options.requestBody)}"
            if typeof options is 'string'
                req.write(options.requestBody)
            else
                req.write(JSON.stringify(options.requestBody))
        req.end()
        return req


addHiddenField = (obj, key, val) ->
    Object.defineProperty(obj, key,{
        value : val
        writable : false
        enumerable : false
        configurable : false
    })
        




exports.createRmiService = (options, callback)->
    new RmiService(options, callback)