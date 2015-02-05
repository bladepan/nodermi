Encoder = require('../lib/encoding')
ObjectRegistry = require('../lib/object_registry')

server = {
    host : 'somehost'
    port : 111
    privatePrefix : '_'
    objectRegistry : new ObjectRegistry()
}

destination = {
    host : 'otherhost'
    port : 222
}

serializer = new Encoder(server, destination)

localObj = {
    prop1  : "kkm"
    array1 : [33, 44]
    func1 : ()->

    func2 : ()->
}

localObj.array1.push(()->
    )
localObj.array1.push(localObj.func2)

localObj.array1.push(localObj)


serialized = serializer.encode(localObj)
console.log JSON.stringify(serialized)


remoteObj = {
    __r_id : 44
    __r_type : 'object'
    __r_host : 'otherhost'
    __r_port : 333
    prop1 : 'dmc'
    func1 : ()->

}


serialized = serializer.encode(remoteObj)
console.log JSON.stringify(serialized)

destObj = {
    __r_id : 44
    __r_type : 'object'
    __r_host : 'otherhost'
    __r_port : 222
    prop1 : 'dmcd'
    func1 : ()->


}

serialized = serializer.encode(destObj)
console.log JSON.stringify(serialized)

pojo = { prop1 : 333}

serialized = serializer.encode(pojo)
console.log JSON.stringify(serialized)
