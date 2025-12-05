import rectify from './rectify.mjs';

import cliPlugin from './cli.mjs';
import commandsPlugin from './commands.mjs';
import configPlugin from './config.mjs';
import crashPlugin from './crash.mjs';
import devicePlugin from './device_manager.mjs';
import doctorPlugin from './doctor.mjs';
import globalsPlugin from './globals.mjs';
import logPlugin from './log.mjs';
import nodejsPlugin from './nodejs.mjs';
import processPlugin from './process_manager.mjs';
import workspacePlugin from './workspace.mjs';

(async function () {

    var config = [
        cliPlugin,
        commandsPlugin,
        configPlugin,
        crashPlugin,
        devicePlugin,
        doctorPlugin,
        globalsPlugin,
        logPlugin,
        nodejsPlugin,
        processPlugin,
        workspacePlugin
    ];

    var build = rectify.build(config);

    var app = await build.start();
})();