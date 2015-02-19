nodermi
=======

A rmi(Remote Method Invocation) service for node

It is designed to handle complex communication patterns, a group of servers can talk to each other and pass around remote objects.

No messages, just method invocation.

##API
###Initialize
option{host, port}; callback(error, rmiService)

```coffeescript
createRmiService(option, callback)
```
###rmi service object : register object
name : name for this object, client use this name to lookup remote object
```coffeescript
createSkeleton(name, object)

```

###rmi service object : lookup object
option : {host, port, [objName]}
```coffeescript
retriveObj(option, callback)
```

##Sample
In Coffeescript

```coffeescript
rminode = require('nodermi')
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
    print : (str)->
        console.log "print #{str}"
    echo : (obj, callback)->
        console.log "get object: #{obj.name}"
        callback(null, obj)
    invoke : (obj, callback)->
        # this obj could be a remote object!
        console.log("calling doSomething of another object.")
        obj.doSomething(callback)
}

serverObj2 = {
    name : "obj2"
}

# a cyclic object
serverObj2.ref = serverObj2

retriveRequest=null
client=null
# create a rmi instance
rminode.createRmiService(serverConf,(err, server)->
    # register objects with names for clients to lookup
    server.createSkeleton('serverObj', serverObj)
    server.createSkeleton('serverObj2', serverObj2)
    # create another rmi instance
    rminode.createRmiService(clientConf, (err, client)->
        # create parameters to lookup server's object
        retriveRequest = lodash.merge({},serverConf)
        # specify the name of the server object
        retriveRequest.objName = 'serverObj'
        client.retriveObj(retriveRequest, (err, stub)->
            # calling remote method
            stub.print("something on client")
            localObj = {
                name:'a local object'
                doSomething : (callback)->
                    console.log("i am doing something")
                    callback(null)
            }
            stub.echo(localObj, (err, returned)->
                # the remote function pass back the local object
                console.log "get from server #{JSON.stringify(returned)}"
                # localObj === returned evaluates as true
                console.log "returned is identical to localObj #{localObj is returned}"
            )
            # the local is passed over to the server, and being remotely invoked from server
            stub.invoke(localObj, (err)->
                console.log("invoke ends")
            )
        )
        
        #this time retrive all objects
        client.retriveObj(serverConf,(err, stub)->
            # prints out "obj2", cyclic reference is handled nicely
            console.log stub.serverObj2.ref.name
        )
    )
)
```
