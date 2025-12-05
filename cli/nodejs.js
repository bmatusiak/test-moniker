
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const events = require('events');
const os = require('os');

plugin.consumes = [];
plugin.provides = ['nodejs'];

function plugin(imports, register) {
    var { } = imports;

    if (events.EventEmitter)
        events.EventEmitter.EventEmitter = events.EventEmitter;

    register(null, {
        nodejs: {
            fs,
            path,
            child_process,
            events: events.EventEmitter || events,
            os
        }
    });
}


module.exports = plugin;

