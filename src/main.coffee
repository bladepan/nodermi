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
#   __r_type : 'objDes'
#   __r_props : {
#       key/value mapping of primitive types and other remote object descriptor
#   }
#   __r_funcs :{
#       name/ method id mapping
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
#   
#
http           = require 'http'   
{EventEmitter} = require('events')
express        = require 'express'
lodash         = require 'lodash'


class RmiService extends EventEmitter
    constructor: (@option, callback) ->
        {@host, @port} = @option
        @sequence = 42
        @serverObj = {}
        @methods = {}        
        
        @server = express()
        #parse the body
        @server.use(express.urlencoded())
        @server.use(express.json())
        @server.post('/',(req, res)=>
            @handleRemoteRequest(req, res)
            )
        @server.listen(@port,@host,511, ()=>
            if callback?
                callback null, this
            console.log "RmiService listening on #{@port}"
        )
        

    getSequence :()->
        @sequence++

    handleRemoteRequest : (req, res)->
        console.log "#{@host}:#{@port} receive request..."
        console.log JSON.stringify(req.body)
        if(req.body.type is 'retrive')
            obj = @serverObj
            if req.body.objName?
                obj = @serverObj[req.body.objName]
            objstr = JSON.stringify(obj)
            res.write(objstr)
            res.end()
            return
        if req.body.type is 'invoke'
            method = @methods[req.body.objId]
            if not method?
                return @noSuchMethod(res)
            args = []
            for arg in req.body.args
                remoteObj = @parseRemoteObj(arg)
                args.push(remoteObj)               
            method.method.apply(method.obj, args)
            return

    createSkeleton: (endPoint, obj)->
        @serverObj[endPoint] = @serializeObject(obj)

    serializeObject : (obj)->
        if obj? and obj.__r_type?
            return @serializeForRemoteTypes(obj)
        if typeof obj isnt 'function' and typeof obj isnt 'object'
            return obj
        objDesc = {
            __r_id : @getSequence()
            __r_host : @host
            __r_port : @port
        }
        if typeof obj is 'function'
            objDesc.__r_type = 'funcDes'
            @methods[objDesc.__r_id] = {
                    method : obj
                    obj : {}
            }
            return objDesc
        objDesc.__r_type = 'objDes'
        objDesc.__r_props = {}
        objDesc.__r_funcs = {}
        for k, v of obj
            if typeof v is 'function' and not v.__r_type?
                methodId = @getSequence()
                objDesc.__r_funcs[k]=methodId
                @methods[methodId] = {
                    method : v
                    obj : obj
                }
                #console.log "#{methodId} : #{@methods[methodId]} #{@methods[methodId].method}"
            else
                objDesc.__r_props[k] = @serializeObject(v)

        return objDesc

    #convert remote objects to remote descriptors
    serializeForRemoteTypes : (obj)->
        if obj.__r_type is 'objDes' or obj.__r_type is 'funcDes'
            return obj
        if obj.__r_type is 'object'
            result = {
                __r_props : {}
                __r_funcs : {}
            }
            for k, v of obj
                if typeof v is 'function'
                    result.__r_funcs[k]=v.__r_id
                else
                    result.__r_props[k]=v
            result.__r_type = 'objDes'
            return result
        if obj.__r_type is 'function'
            return {
                __r_id : obj.__r_id
                __r_host : obj.__r_host
                __r_port : obj.__r_port
                __r_type : 'funcDes'
            }           

    retriveObj : (option, callback)->
        reqOption = {
            hostname : option.host
            port : option.port
            requestBody : {
                type : 'retrive'
                objName : option.objName
            }
        }
        httpRequest(reqOption, (err, body, req)=>
            if err?
                callback err
                return
            console.log "#{@host}:#{@port} receive response..."
            console.log body
            remoteObj = JSON.parse(body)
            callback null, @parseRemoteObj(remoteObj)
        )
    #copy host, port, etc
    mergeRemoteObj : (dest, src) ->
        dest.__r_id = src.__r_id
        dest.__r_host = src.__r_host
        dest.__r_port = src.__r_port
        return dest

    #parse descriptors to remote stub
    parseRemoteObj : (obj)->
        #return simple types
        if not obj? or not obj.__r_type?
            return obj
        host = obj.__r_host
        port = obj.__r_port
        if obj.__r_type is 'objDes'
            #TODO: if it is local object, convert to local object
            result = @mergeRemoteObj({}, obj)
            result.__r_type = 'object'
            for k, v of obj.__r_props
                result[k]=@parseRemoteObj(v)
            for k, v of obj.__r_funcs
                _this = @
                func = do (_this, v)->
                    ()->
                        _this.invokeRemoteMethod(host, port, v, arguments)
                @mergeRemoteObj(func, obj)
                func.__r_type = 'function'
                result[k] = func
            return result
            
        if obj.__r_type is 'funcDes'
            #TODO: if it is local method, convert to local method
            func = ()=>
                @invokeRemoteMethod(host,port,obj.__r_id,arguments)
            @mergeRemoteObj(func, obj)
            func.__r_type = 'function'
            return func
        # no other types
        throw new Error('Unknown type')

    invokeRemoteMethod : (host, port, id, args)->
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
                args : serializedArgs
            }
        }
        httpRequest(reqOption, (err, body, resp)=>
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
httpRequest = (options, handler)->
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
        console.log "post #{options.hostname}:#{options.port} #{JSON.stringify(options.requestBody)}"
        if typeof options is 'string'
            req.write(options.requestBody)
        else
            req.write(JSON.stringify(options.requestBody))
    req.end()
    return req





###   
serverConf ={
    host:'localhost'
    port : 7000
}
clientConf ={
    host:'localhost'
    port : 8000   
}

serverObj = {
    kk : ()->
        console.log "invoke kk"
    funcWithCallBack : (arg1, callback)->
        console.log "get arg1 #{JSON.stringify(arg1)}"
        callback 55
}
retriveRequest=null
client=null
new RmiService(serverConf,(err, server)->
    server.createSkeleton('serverObj', serverObj)
    new RmiService(clientConf, (err, client)->
        retriveRequest = lodash.merge({},serverConf)
        retriveRequest.objName = 'serverObj'
        client.retriveObj(retriveRequest, (err, stub)->
            #console.log JSON.stringify(stub)
            stub.kk()
            stub.funcWithCallBack({cs:33}, (val)->
                console.log "get from server #{val}"
            )
            stub.funcWithCallBack(client, (val)->
                console.log "get from server #{val}"
            )
        )
    )

)
###

exports.createRmiService = (options, callback)->
    new RmiService(options, callback)


    

