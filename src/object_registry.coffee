weak = require('weak')

{addHiddenField} = require('./common')


class ObjectRegistry
    constructor: () ->
        @objects = {}
        @sequence = 0

    registObject : (obj)->
        if not obj.__r_id?
            # we certainly do not want to contaminate the original object 
            addHiddenField(obj, '__r_id', @getSequence())
            @objects[obj.__r_id] = weak(obj)

    getSequence : ()->
        id = @sequence.toString(35)
        @sequence++
        return id

    getObject: (id)->
        val = @objects[id]
        if not val?
            delete @objects[id]
        return weak.get(val)
        
    


module.exports = ObjectRegistry