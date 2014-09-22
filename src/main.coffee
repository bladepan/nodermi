###
remote Object
{
  __r_id
  __r_host
  __r_port
  __r_type : 'object'
}

remote Object descriptor
{
  __r_id
  __r_host
  __r_port
  __r_type : 'objDes' or 'arrDes' or 'dateDes'
  __r_arr : [ elements for array]
  __r_date : date.getTime()
  __r_props : {
      key/value mapping of primitive types and other remote object descriptor
  },
  __r_funcs : [string array of function names]
}

remote Function
{
  __r_id
  __r_host
  __r_port
  __r_type : 'function'
}

remote Function descriptor
{
  __r_id
  __r_host
  __r_port
  __r_type : 'funcDes'
}

 a object is a remote object if it has attribute __r_type.
  
  __r_host __r_port are optional
  
  request
  {
      type : 'retrive' or 'invoke'
      objName : for 'retrive'
      objId : for 'invoke'
      args : argument list, array
  }
  
  response
  {
      error : if error      
      
  }
 descriptors only live in transmission layer
 __r_host and __r_port are leave out if it is the local object from the server

###
Server = require('./server')

exports.createRmiService = (options, callback)->
    new Server(options, callback)