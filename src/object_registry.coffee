weak = require('weak')

{encodeHelper} = require('./common')


class ObjectRegistry
    constructor: () ->
        @objects = {}
        @functions = {}
        @sequence = 0

    registObject : (obj)->
        if not encodeHelper.getHiddenRid(obj)?
            id = @getSequence()
            encodeHelper.setHiddenRid(obj, id)
            if typeof obj is 'function'
                # TODO user strong reference here or the callback functions
                # would be gabage collected
                @functions[id] = obj
            else
                @objects[id] = weak(obj, ()=>
                    delete @objects[id]
                    )
        return null

    getSequence : ()->
        id = @sequence.toString(35)
        @sequence++
        return id

    getObject: (id)->
        func = @functions[id]
        return func if func?
        val = @objects[id]
        if not val? or weak.isDead(val)
            delete @objects[id]
            return null
        return val
        
    


module.exports = ObjectRegistry