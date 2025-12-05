

plugin.consumes = [];
plugin.provides = ['nodejs'];

function plugin( imports, register) {
    var {  } = imports;

    const fs = require('fs');
    const path = require('path');
    const dir = require('dir');
    const child_process = require('child_process');
    const events = require('events');
    const os = require('os');

    register(null, { nodejs: { 
        fs, 
        path,
        dir,
        child_process, 
        events,
        os
    } });
}


module.exports = plugin;
