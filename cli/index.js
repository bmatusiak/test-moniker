const rectify = require('./rectify.mjs');

const cliPlugin = require('./cli.mjs');
const commandsPlugin = require('./commands.mjs');
const configPlugin = require('./config.mjs');
const crashPlugin = require('./crash.mjs');
const devicePlugin = require('./device_manager.mjs');
const doctorPlugin = require('./doctor.mjs');
const globalsPlugin = require('./globals.mjs');
const logPlugin = require('./log.mjs');
const nodejsPlugin = require('./nodejs.mjs');
const processPlugin = require('./process_manager.mjs');
const workspacePlugin = require('./workspace.mjs');

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