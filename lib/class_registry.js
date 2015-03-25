var lodash = require('lodash');


var stubHelper = require('./common').stubHelper;

function ClassRegistry(){
    this.registeredClasses = {};
}

lodash.assign(ClassRegistry.prototype, {
    registerClass : function(name, clazz) {
        if (typeof clazz != 'function') {
            throw new Error("Illegal argument, should specify a constructor function.");
        }
        if (this.registeredClasses[name] != null) {
            throw new Error(name + " has already registered.");
        }
        var className = stubHelper.getClassName(clazz);
        // the className could exists in unit tests that multiple nodermis are in one process
        if (className != null && className != name) {
            throw new Error("Class has already been registered with name " + className);
        }
        if (className == null) {
            stubHelper.setClassName(clazz, name);
        }
      
        this.registeredClasses[name] = clazz;
    },
    getRegisteredClass : function(name){
        return this.registeredClasses[name];
    }
});

module.exports = ClassRegistry;
