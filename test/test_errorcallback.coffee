lodash = require('lodash')
debug = require('debug')

rminode = require('../src/main')

serverConf ={
    host:'localhost'
    port : 7000
}
clientConf ={
    host:'localhost'
    port : 8000   
}

serverObj = {}
serverObj.func1 = ()->
    console.log("func1")
    throw new Error("error in func1")


rminode.createRmiService(serverConf,(err, server)->
    server.createSkeleton('serverObj', serverObj)
    rminode.createRmiService(clientConf, (err, client)->
        retriveRequest = lodash.merge({},serverConf)
        retriveRequest.objName = 'serverObj'
        client.retriveObj(retriveRequest, (err, stub)->
            stub.func1((err)->
                console.log "get error in client #{err}"
            )


        )
    )
)

