const rectify = require('../rectify.js');

const cliPlugin = require('../cli.js');
// const commandsPlugin = require('../commands.js');
// const configPlugin = require('../config.js');
// const crashPlugin = require('../crash.js');
const devicePlugin = require('../device_manager.js');
// const doctorPlugin = require('../doctor.js');
// const globalsPlugin = require('../globals.js');
// const logPlugin = require('../log.js');
const nodejsPlugin = require('../nodejs.js');
// const processPlugin = require('../process_manager.js');
// const workspacePlugin = require('../workspace.js');

const app = { on: () => { }, emit: () => { } };//mock app

(async function () {
    var nodejs = loadPlugin(nodejsPlugin, 'nodejs');

    function testLib() {
        let failures = 0;
        let passes = 0;
        const o = {
            assert,
            get failures() { return failures; },
            get passes() { return passes; }
        };

        function assert(cond, msg) {
            if (!cond) {
                console.error('FAIL:', msg);
                failures++;
            } else {
                console.log('OK:  ', msg);
                passes++;
            }
        }
        return o;
    }

    function loadPlugin(plugin, name) {
        let pluginResult = null;
        plugin({/* imports */ app, nodejs }, (error, plugins) => {
            pluginResult = plugins[name];
        });
        return pluginResult;
    }

    function startTest(name, plugin, cb) {
        var tl = testLib();
        console.log('Starting test for plugin:', name)
        console.log('---------');
        plugin.test(tl.assert, (name) => loadPlugin(plugin, name));
        console.log('---');
        console.log('Passes:', tl.passes, 'Failures:', tl.failures);
        console.log('Finished test for plugin:', name);
        console.log('-------------------------');
    }

    startTest('cli', cliPlugin);
    startTest('device_manager', devicePlugin);

})();