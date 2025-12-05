

plugin.consumes = [];
plugin.provides = ['config'];

function plugin( imports, register) {
    var {  } = imports;

    register(null, { config: {} });
}


module.exports = plugin;
