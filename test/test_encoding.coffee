Encoder = require('../lib/encoding')
Decoder = require('../lib/decoding')
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

bufferedObj = {
    prop1 : 33
    buffer : new Buffer([11,22,124,0,34,0,0,56])
}
console.log(bufferedObj)

encoded=serializer.encode(bufferedObj)

decoder = new Decoder(destination, server)
decoded=decoder.decode(encoded)
console.log(decoded)
euqalsResult = (decoded.buffer is bufferedObj.buffer)
console.log("buffer should not equal after encoding [false] #{euqalsResult}")
if Buffer.compare?
    console.log("buffer should have same content [0] #{decoded.buffer.compare(bufferedObj.buffer)}")


