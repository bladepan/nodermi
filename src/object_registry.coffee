weak = require('weak')
debug = require('debug')
lodash = require('lodash')

{encodeHelper} = require('./common')

logger = debug('nodermi:objRegistry')

class ObjectRegistry
    constructor: (options) ->
        @objects = {}
        @functions = {}
        @weakFunctions = {}
        @sequence = 0
        @size = 0
        options = {} if not options?
        lodash.defaults(options, {
            expiration : 30*1000
            })
        @options = options
        setInterval(@_clearFunctions.bind(this), @options.expiration)

    registObject : (obj)->
        id = encodeHelper.getHiddenRid(obj)
        if not id?
            id = @getSequence()
            encodeHelper.setHiddenRid(obj, id)
            if typeof obj is 'function'
                # TODO user strong reference here or the callback functions
                # would be gabage collected
                @_putFunction(id, obj)
            else
                @_putObject(id, obj)
            @size++
            logger("ObjectRegistry Holds reference to #{@size} objects") if @sequence%100 is 0
        return id

    _putObject : (id, obj)->
        # use weak reference
        @objects[id] = weak(obj, ()=>
            delete @objects[id]
            logger("reclaim #{id}")
            @size--
        )

    getSequence : ()->
        id = @sequence.toString(35)
        @sequence++
        return id

    _putFunction : (id, func)->
        # when should the func be put to weak reference pool,
        # we cannot put function into weak reference right away or 
        # the call back functions would be gabage collected very quickly
        expirationTime = Date.now()
        if func.__r_expire?
            expirationTime += func.__r_expire
        else
            expirationTime += @options.expiration
        
        @functions[id] = {
            val : func
            expiration : expirationTime
        }
        @size++

    _clearFunctions : ()->
        toDelete = []
        now = Date.now()
        for k, v of @functions
            if v.expiration < now
                toDelete.push({
                    id : k
                    val : v.val
                    })

        for i in toDelete
            id = i.id
            delete @functions[id]
            logger("move func #{id} to weak map")
            @_putObject(id, i.val)

    _getFunction : (id)->
        fromPermanent = @functions[id]
        if fromPermanent?
            fromPermanent.expiration += @options.expiration
            logger("increment expiration to #{fromPermanent.expiration}")
            return fromPermanent.val
        return null
               

    getObject: (id)->
        func = @_getFunction(id)
        return func if func?
        val = @objects[id]
        if val isnt undefined and weak.isDead(val)
            delete @objects[id]
            @size--
            logger("found dead object #{id}")
            return null
        
        return val
        
module.exports = ObjectRegistry