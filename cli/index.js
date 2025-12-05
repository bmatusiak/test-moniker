import rectify from './rectify.js';

import cliPlugin from './cli.js';
import commandsPlugin from './commands.js';
import configPlugin from './config.js';
import crashPlugin from './crash.js';
import deviePlugin from './device_manager.js';
import doctorPlugin from './doctor.js';
import globalsPlugin from './globals.js';
import logPlugin from './log.js';
import nodejsPlugin from './nodejs.js';
import processPlugin from './process_manager.js';
import workspacePlugin from './workspace.js';

(async function () {

    var config = [
        cliPlugin,
        commandsPlugin,
        configPlugin,
        deviePlugin,
        doctorPlugin,
        globalsPlugin,
        logPlugin,
        nodejsPlugin,
        workspacePlugin,
        processPlugin
    ];

    var build = rectify.build(config);

    var app = await build.start();
})();