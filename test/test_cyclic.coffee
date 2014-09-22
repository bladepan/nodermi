lodash = require('lodash')
debug = require('debug')

rminode = require('../src/main')

serverConf ={
    host:'localhost'
    port : 7000
    debug : true
}
clientConf ={
    host:'localhost'
    port : 8000   
}

serverObj = {
    kk : ()->
        console.log "invoke kk"
    funcWithCallBack : (arg1, callback)->
        console.log "get arg1 #{arg1.cs}"
        #callback arg1
        callback {cs:33}
    funcWithCallBack2 : (arg1, callback) ->
        callback arg1
    funcWithError : (arg1, callback) ->
        if arg1 is 'ok'
            return callback(null, 'return for ok')
        callback(new Error('Error processing '+ arg1))
}

timeStamp = 42

serverObj2 = {
    __r_include : '_exposeFiled'
    _exposeFiled : 42
    _hiddenField : 55
    dateProp : new Date(timeStamp)
    prop1 : 335
    prop2 :{
        kk : serverObj
    }
}

serverObj2.prop2.serverObj2 = serverObj2

retriveRequest=null
client=null
rminode.createRmiService(serverConf,(err, server)->
    server.createSkeleton('serverObj', serverObj)
    server.createSkeleton('serverObj2', serverObj2)
    rminode.createRmiService(clientConf, (err, client)->
        retriveRequest = lodash.merge({},serverConf)
        retriveRequest.objName = 'serverObj'
        client.retriveObj(retriveRequest, (err, stub)->
            #console.log JSON.stringify(stub)
            stub.kk()
            stub.funcWithCallBack({cs:33}, (val)->
                # the remote properties are hidden from enumeration
                console.log "get from server #{JSON.stringify(val)}, host: #{val.__r_host} port: #{val.__r_port}"

            )
            obj = {
                func1 : ()->

            }
            stub.funcWithCallBack2(obj, (val)->
                console.log "should get back local object: #{obj is val}"
            )

            stub.funcWithError('ok', (err, response)->
                console.log 'funcWithError : ' + response
            )
            stub.funcWithError('notOk', (err)->
                console.log('funcWithError ' + JSON.stringify(err))
                )
            #stub.funcWithCallBack(client, (val)->
            #    console.log "get from server #{val}"
            #)
        )
        #this time retrive all
        client.retriveObj(serverConf,(err, stub)->
            console.log stub.serverObj2.prop2.serverObj2.prop1
            console.log "The cyclic reference equals to each other: #{stub.serverObj2.prop2.serverObj2 is stub.serverObj2}"
            console.log "_hiddenField : #{stub.serverObj2._hiddenField}"
            console.log "_exposeFiled : #{stub.serverObj2._exposeFiled}"
            console.log "__r_include : #{stub.serverObj2.__r_include}"
            console.log "idDate stub.serverObj2.dateProp is #{lodash.isDate(stub.serverObj2.dateProp)}"
            console.log "timeof stub.serverObj2.dateProp is #{stub.serverObj2.dateProp}"
        )
    )

)
