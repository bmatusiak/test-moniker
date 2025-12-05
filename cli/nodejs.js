
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import events from 'events';
import os from 'os';

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


export default plugin;

