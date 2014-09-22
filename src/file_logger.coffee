fs = require('fs')

class FileLogger
    constructor: (@server) ->
        {host, port, @debug} = @server
        @fileName = "nodermi_#{host}_#{port}.log"
        if not @debug
            @enabled = false
            @log = ()->

        else
            @enabled = true

    
    log: (message)->
        str = (new Date()).toString() + " : "+ message + "\n"
        fs.appendFile(@fileName, str, (err)->            
            if err
                console.log "nodermi logging error"
                console.log err
                console.log err.stack
        )

module.exports = FileLogger
