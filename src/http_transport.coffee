{EventEmitter} = require('events')
http           = require('http')

express        = require 'express'
lodash         = require 'lodash'
debug          = require 'debug'

class ResponseWrapper
    constructor: (@res)->

    write : (message)->
        @res.write(JSON.stringify(message))
        @res.end()

class HttpTransport extends EventEmitter
    constructor: (server) ->
        {@host, @port, @fileLogger} = server
        @server = express()
        #parse the body
        bodyParser = require('body-parser')
        @server.use(bodyParser.urlencoded({extended:true, limit:'10mb'}))
        @server.use(bodyParser.json({limit:'10mb'}))
        @server.post('/',(req, res)=>
            @handleRemoteRequest(req, res)
        )
        callbackFired = false
        errorHandler = (err)=>
            if not callbackFired
                @emit('initialized', err)
                callbackFired = true

        httpServer = http.createServer(@server)

        httpServer.once('error',errorHandler)

        # apparently the callback is fired on 'listening' event, aka, it
        # is only triggered when listening is successful.
        # http://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback
        args = [@port]
        # host is optional
        args.push(@host) if @host?
        args.push(2048)
        args.push((err)=>
            if not callbackFired
                @emit('initialized', err)
                callbackFired = true
        )
        httpServer.listen.apply(httpServer, args)

    handleRemoteRequest : (req, res)->
        @fileLogger.log("Receive message \n #{JSON.stringify(req.body)}") if @fileLogger.enabled
        @emit('message', req.body, new ResponseWrapper(res))

    send : (destination, message, callback)->
        @fileLogger.log("Send message \n #{JSON.stringify(message)}") if @fileLogger.enabled
        reqOption = {
            hostname :destination.host
            port : destination.port
            requestBody : message
        }
        @httpRequest(reqOption, (err, body, resp)=>
            if err?
                if callback?
                    callback err
                else
                    @emit 'error', err
                return
            if callback?
                respObj = JSON.parse(body)
                callback null, respObj
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
            #@_log "post #{options.hostname}:#{options.port} #{JSON.stringify(options.requestBody)}"
            if typeof options is 'string'
                req.write(options.requestBody)
            else
                req.write(JSON.stringify(options.requestBody))
        req.end()
        return req

module.exports = HttpTransport