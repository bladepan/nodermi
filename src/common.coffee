debug = require('debug')

logger = debug('nodermi:common')

# we certainly do not want to contaminate the original object 
# when we add rmi properties like __r_id, __r_host ...
addHiddenField = (obj, key, val) ->
    Object.defineProperty(obj, key,{
        value : val
        writable : false
        enumerable : false
        configurable : false
})

#origin 1 means from receiver, if the object is from sender, skip this field as well.
# user should never change a remote object's properties, so when the object is from
# receiver, id and origin would be enough
keyWords = ['__r_id','__r_host','__r_port',
'origin','remoteType','arrayElements','dateValue', 'properties','functions',
'serverVersion','messageType','objectName','objectId', 'functionName','args', 'objDes', 'funcDes',
'arrDes','dateDes','ref','retrive','invoke', 'pojo', 'protocolVersion', 'messageId', 'success', 'error']

createCompressMap = (arr)->
    counter = 0
    map = {}
    for item in arr
        if not map[item]?
            compressed = counter.toString(35)
            map[item] = compressed
            counter++
        else
            throw new Error("duplicate item #{item}")
    return map

keyWordsMap = createCompressMap(keyWords)
logger("keyWordsMap #{JSON.stringify(keyWordsMap)}")
###
nodermi:common keyWordsMap {"__r_id":"0","__r_host":"1","__r_port":"2","origin":"3","remoteType":"4","arrayElements":"5",
"dateValue":"6","properties":"7","functions":"8","serverVersion":"9","messageType":"a","objectName":"b",
"objectId":"c","functionName":"d","args":"e","objDes":"f","funcDes":"g","arrDes":"h","dateDes":"i",
"ref":"j","retrive":"k","invoke":"l","pojo":"m","protocolVersion":"n","messageId":"o","success":"p","error":"q"}
###

keyWordsReverseMap = {}
for k, v of keyWordsMap
    keyWordsReverseMap[v] = k


encodeHelper = {}

# create functions to manipulate keywords and their codes
for keyWord in keyWords
    normalized = keyWord.replace(/_/g,'')
    encodeHelper[normalized] = keyWord

    keyWordCode = keyWordsMap[keyWord]
    encodeHelper["#{normalized}Code"] = keyWordCode

    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1)
    
    encodeHelper["get#{normalized}"] = do(keyWordCode)->
        return (obj)->
            return obj[keyWordCode]
    encodeHelper["getHidden#{normalized}"] = do(keyWord)->
        return (obj)->
            return obj[keyWord]

    encodeHelper["setHidden#{normalized}"] = do(keyWord)->
        return (obj, val)->
            addHiddenField(obj, keyWord, val) if val?


    encodeHelper["getFull#{normalized}"] = do(keyWordCode)->
        return (obj)->
            val = obj[keyWordCode]
            fullVal = val
            if val?
                fullVal = keyWordsReverseMap[val]
                if not fullVal?
                    throw new Error("cannot find keyWord code #{val}, return null")
            return fullVal
            
    encodeHelper["set#{normalized}"] = do(keyWordCode) ->
        return (obj, val, valueIsKeyWord)->
            cval = val
            if valueIsKeyWord and val?
                cval = keyWordsMap[val]
                if not cval?
                    throw new Error("cannot find keyword #{val}")
            obj[keyWordCode] = cval if cval?
    encodeHelper["set#{normalized}From"] = do(keyWordCode)->
        return (obj, source) ->
            obj[keyWordCode] = source[keyWordCode] if source[keyWordCode]?
    encodeHelper["is#{normalized}Equals"] = do(keyWordCode)->
        return (obj, val)->
            if val? and obj[keyWordCode]?
                return val is obj[keyWordCode]
            return (not val?) and (not obj[keyWordCode]?)

exports.encodeHelper = encodeHelper


# The pact is private fields are started with _
exports.privatePrefix = '_'
###
__defineGetter__  __defineSetter__   __lookupGetter__  __lookupSetter__  
constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString        
toString valueOf toJSON
###
exports.excludeMethods = ['constructor', 'hasOwnProperty','isPrototypeOf',
                        'propertyIsEnumerable', 'toLocaleString', 'toString',
                        'valueOf', 'toJSON']

exports.addHiddenField = addHiddenField
