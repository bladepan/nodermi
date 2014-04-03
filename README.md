nodermi
=======

A simple rmi service for node

It is designed to handle complex communication patterns, a group of servers can talk to each other and pass around remote objects.

**This project is just getting started**

##API
###Initialize
option : host, port; callback error, rmiService 

the reference of a initialized rmi service object is passed by callback
```coffeescript
createRmiService(option, callback)
```
###rmi service object : register object
```coffeescript
createSkeleton(endpoint, object)

```

###rmi service object : lookup object
option : host, port, [objName]
```coffeescript
retriveObj(option, callback)
```

##Sample

```coffeescript
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

# a cyclic object
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
            stub.kk()
            stub.funcWithCallBack({cs:33}, (val)->
                # the remote function pass back the local object
                console.log "get from server #{JSON.stringify(val)}"
            )
        )
        
        #this time retrive all objects
        client.retriveObj(serverConf,(err, stub)->
            console.log stub.serverObj2.prop2.serverObj2.prop1
        )
    )

)
```
