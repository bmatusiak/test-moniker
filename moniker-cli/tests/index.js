const rectify = require('./rectify.js');

const cliPlugin = require('./cli.js');
const commandsPlugin = require('./commands.js');
const configPlugin = require('./config.js');
const crashPlugin = require('./crash.js');
const devicePlugin = require('./device_manager.js');
const doctorPlugin = require('./doctor.js');
const globalsPlugin = require('./globals.js');
const logPlugin = require('./log.js');
const nodejsPlugin = require('./nodejs.js');
const processPlugin = require('./process_manager.js');
const workspacePlugin = require('./workspace.js');

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

    var app = rectify.build(config);

    var main = await app.start();

    function testLib() {

        let failures = 0;
        let passes = 0;

        function assert(cond, msg) {
            if (!cond) {
                console.error('FAIL:', msg);
                failures++;
            } else {
                console.log('OK:  ', msg);
                passes++;
            }
        }

        return { assert, passes, failures };
    }

    // build tests here


})();