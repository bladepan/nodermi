lodash = require('lodash')
debug = require('debug')

ObjectRegistry = require('../lib/object_registry')


debugger

registry = new ObjectRegistry({
    expiration : 1000
    })

func1Id = registry.registObject(()->
    console.log("func1 executed")
    )
console.log("func1Id #{func1Id}")


func2Id = registry.registObject(()->
    console.log("func2 executed")
    )

console.log("func2Id #{func2Id}")

func1 = registry.getObject(func1Id)
func1()

gc()

setTimeout(()->
    func2 = registry.getObject(func2Id)
    console.log("func2 #{func2?}")
    # func1 should still be here
    func1 = registry.getObject(func1Id)
    console.log("func1 #{func1?}")
, 5000)

setInterval(()->
    console.log("alive")
    gc()
, 2000)