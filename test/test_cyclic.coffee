rminode = require('../src/main')
lodash = require('lodash')

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
        console.log "get arg1 #{arg1.cs}"
        callback arg1
}

serverObj2 = {
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
                console.log "get from server #{JSON.stringify(val)}"
            )
            #stub.funcWithCallBack(client, (val)->
            #    console.log "get from server #{val}"
            #)
        )
        #this time retrive all
        client.retriveObj(serverConf,(err, stub)->
            console.log stub.serverObj2.prop2.serverObj2.prop1
        )
    )

)
