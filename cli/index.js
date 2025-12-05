import rectify from 'rectify';

import cliPlugin from './cli.js';
import commandsPlugin from './commands.js';
import configPlugin from './config.js';
import deviePlugin from './device.js';
import doctorPlugin from './doctor.js';
import logPlugin from './log.js';
import processPlugin from './process.js';

(async function(){
        
    var config = [
        cliPlugin,
        commandsPlugin,
        configPlugin,
        deviePlugin,
        doctorPlugin,
        logPlugin,
        processPlugin
    ].concat([
        (()=>{
            // globals plugin to satisfy app to contain 'globals' service to hold global state
            /*
                // in another plugin
                plugin.consumes = ['globals'];
                plugin.provides = ['someService'];
                function plugin( imports, register) {
                    const { globals } = imports;
                    globals.someValue = 42;
                    register(null, { someService: { /* ... * / } });
                }
                // if you need gloabls variable set beforehand, consume the plugins that initializes/sets it first, so this is loaded after
            */
            plugin.consumes = [];
            plugin.provides = ['globals'];
            function plugin( imports, register) {
                register(null, { globals: {} });//leave plugin empty to hold state
            }
            return plugin;
        })()
    ]);  


    var app = rectify.build(config);

    var main = await app.start();

    //main.app.services.cli.run(); --- IGNORE ---
    const cli = main.app.services.cli;
    const {err, out} = main.app.services.log;

    // Only auto-run when executed directly
    if (typeof require !== 'undefined' && require.main === module) {
    // Pre-run hook: run after pre-flag handlers executed but before normal actions
        cli._preRunHook = function() {
            try {
                const fs = require('fs');
                const path = require('path');

                // Load config file (if provided or available in workspace)
                const tryConfigs = [];
                if (_CONFIG_PATH) tryConfigs.push(path.resolve(process.cwd(), _CONFIG_PATH));
                tryConfigs.push(path.join(workspace, 'moniker.config.json'));
                tryConfigs.push(path.join(workspace, '.monikerrc'));
                for (const p of tryConfigs) {
                    try {
                        if (p && fs.existsSync(p)) {
                            const raw = fs.readFileSync(p, 'utf8');
                            _CONFIG = JSON.parse(raw);
                            break;
                        }
                    } catch (_) {}
                }

                // workspace validation: require app.json or package.json unless forced
                if (!FORCE) {
                    const okWorkspace = fs.existsSync(path.join(workspace, 'app.json')) || fs.existsSync(path.join(workspace, 'package.json'));
                    if (!okWorkspace) {
                        err('ERROR: workspace does not contain app.json or package.json:', workspace);
                        err('Use --force to override.');
                        process.exit(1);
                    }
                }

                // instantiate logger (plain or JSON mode) after workspace is known
                try {
                    Log = _makeLogManager(workspace)('moniker-log', _LOG_JSON);
                    if (_LOG_PATH_OVERRIDE) Log.path = _LOG_PATH_OVERRIDE;
                    if (_SILENT) Log.silent = true;
                    if (_LOG_ENABLED) Log.enabled = true;
                    if (CI_MODE) {
                        Log.enabled = true;
                        Log.silent = true;
                    }
                    try { global.MonikerLog = Log; } catch (_) {}
                } catch (_) { Log = null; }

                // inject the resolved workspace into the values object for any registered action
                if (cli._actions && Array.isArray(cli._actions)) {
                    for (const actionDesc of cli._actions) {
                        try {
                            if (!actionDesc.values) actionDesc.values = {};
                            actionDesc.values.workspace = workspace;
                        } catch (_) {}
                    }
                }
            } catch (e) {
                try { err('Pre-run hook error:', e); } catch (_) {}
            }
        };

        const ok = cli.run();
        if(!ok) {
            out('No actions run.');
        }
    }
})();