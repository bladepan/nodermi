rminode = require('../src/main')

serverConf ={
    host:'localhost'
    port : 7000
}

rminode.createRmiService(serverConf,(err, server)->
    if not err?
        console.log "sucess start on service"
    else
        console.log "catch error!"
        console.log err
    rminode.createRmiService(serverConf,(err, server)->
        console.log "definetly catch an error"
        console.log err
    )
)
    