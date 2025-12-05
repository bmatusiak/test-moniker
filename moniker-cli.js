#!/usr/bin/env node
const cli = require('./cli_lib.js');
const { tryRun } = require('./scripts/util.js');
cli.description = 'Moniker CLI - A tool for running moniker';


let workspace = (function findWorkspace() {
    const path = require('path');
    const fs = require('fs');

    // quick argv-based override: --workspace=/full/path or --workspace relative/path or -w path
    const raw = process.argv.slice(2);
    for (let i = 0; i < raw.length; i++) {
        const a = raw[i];
        if (!a) continue;
        if (a.startsWith('--workspace=')) {
            const val = a.split('=')[1];
            return path.resolve(process.cwd(), val);
        }
        if (a === '--workspace' || a === '-w') {
            const val = raw[i + 1];
            if (val) return path.resolve(process.cwd(), val);
        }
    }

    let dir = process.cwd();
    // Walk up until we find an app.json or package.json, otherwise fall back to cwd
    while (true) {
        if (fs.existsSync(path.join(dir, 'app.json')) || fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) return process.cwd();
        dir = parent;
    }
})();

// Friendly notice when not using silent mode
if (!process.argv.includes('--silent') && !process.argv.includes('-s')) {
    try {
        console.log('Using workspace:', workspace);
    } catch (_) {}
}

// make the resolved workspace available to other parts of the process
try {
    process.env.TEST_MONIKER_WORKSPACE = workspace;
} catch (_) {}

// logging manager (instantiated after workspace/config is determined)
const _makeLogManager = require('./libs/log_manager');
let Log = null;
let _LOG_JSON = false;

// intermediate values set by pre-run flag handlers
let _CONFIG_PATH = null;
let _SILENT = false;
let _LOG_PATH_OVERRIDE = null;

// Global runtime flags
let _VERBOSE = false;
let _DRY_RUN = false;
// CI, force, json-log, config flags
let CI_MODE = false;
let FORCE = false;
let _CONFIG = null;

const process_manager = require('./libs/process_manager');

function stopAllChildren() {
    try { process_manager.stop(); } catch (_) {}
}

process.on('SIGINT', () => {
    console.log('\nReceived SIGINT — stopping child processes...');
    stopAllChildren();
    process.exit(130);
});
process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM — stopping child processes...');
    stopAllChildren();
    process.exit(143);
});

cli('--log')
    .info('Log Output to moniker-log-' + Date.now() + '.txt')
    .flags({ pre: true })
    .do((values) => {
        _LOG_PATH_OVERRIDE = typeof values.log === 'string' ? values.log : _LOG_PATH_OVERRIDE;
    });

cli('--ci')
    .info('Run in CI mode (quiet, write logs, fail-fast)')
    .flags({ pre: true })
    .do(() => { CI_MODE = true; });

cli('--force','-f')
    .info('Force actions even if workspace validation fails')
    .flags({ pre: true })
    .do(() => { FORCE = true; });

cli('--json-log','-j')
    .info('Write machine-readable JSON log (use JSON log format)')
    .flags({ pre: true })
    .do(() => { _LOG_JSON = true; });

cli('--config')
    .info('Path to moniker config file (relative to workspace)')
    .flags({ pre: true })
    .do((values) => {
        try {
            const v = values && (values.config || values['--config']);
            if (v) _CONFIG_PATH = String(v);
        } catch (_) {}
    });

cli('--silent')
    .info('Log Output to moniker-logs.txt')
    .flags({ pre: true })
    .do(() => {
        _SILENT = true;
    });

// verbosity and dry-run
cli('--verbose','-V')
    .info('Enable verbose output')
    .do(() => { VERBOSE = true; Log.enabled = true; });

cli('--dry-run','-n')
    .info('Show actions without executing')
    .do(() => { _DRY_RUN = true; });

// register workspace flag so cli doesn't warn about unknown flags
cli('--workspace','-w')
    .info('Override workspace path')
    .flags({ pre: true })
    .do((values) => {
        try {
            const path = require('path');
            const v = (values && (values.workspace || values['--workspace'] || values['-w'])) || null;
            if (v && typeof v === 'string') {
                workspace = path.resolve(process.cwd(), String(v));
                try { process.env.TEST_MONIKER_WORKSPACE = workspace; } catch (_) {}
            }
        } catch (_) {}
    });

// demo flag to show the workspace value available inside handlers
cli('--print-workspace','-p')
    .info('Print the resolved workspace available to handlers')
    .do((values) => {
        console.log('workspace (from handler values):', values && values.workspace ? values.workspace : process.env.TEST_MONIKER_WORKSPACE);
    });

cli('--start-dev-server','-s')
    .info('Start the metro development server')
    .do(() => {
        let metro, _builder, logcat;
        tryRun('fuser', ['-k', '8081/tcp']);//kill any process using metro port
        metro = startMeroServer(//ready, close, done, error
            () => {//ready
                _builder = buildAndInstall(//ready, close, intalled, open, failed
                    false, // ready
                    false,// close
                    () => {// installed
                        logcat = adbLogCat(//done
                            () => {//done
                                metro.stop();
                            });
                    },
                    false,// opening
                    ()=> {// failed
                        metro.stop();
                    });
            }, () => { //close
                if(Log.enabled) console.log('Logs saved to ' + Log.path);
                process.exit(0);//exit when metro stops
            }, () => {// done
                logcat.stop();
            }, (error) => {// error
                console.log('Metro server error:', error);
                logcat.stop();
                metro.stop();
            });


    });


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
                    console.error('ERROR: workspace does not contain app.json or package.json:', workspace);
                    console.error('Use --force to override.');
                    process.exit(1);
                }
            }

            // instantiate logger (plain or JSON mode) after workspace is known
            try {
                Log = _makeLogManager(workspace)('moniker-log', _LOG_JSON);
                if (_LOG_PATH_OVERRIDE) Log.path = _LOG_PATH_OVERRIDE;
                if (_SILENT) Log.silent = true;
                if (CI_MODE) {
                    Log.enabled = true;
                    Log.silent = true;
                }
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
            try { console.error('Pre-run hook error:', e); } catch (_) {}
        }
    };

    const ok = cli.run();
    if(!ok) {
        console.log('No actions run.');
    }
}

function startMeroServer(ready, close, done, error) {
    const metro = process_manager('metro');
    metro.setup('npx', ['expo','start','--dev-client'], { cwd: workspace, stdio: 'pipe' });

    let metroBuf = '';

    function logger(chunk){
        try {
            const data = chunk.toString();
            if (data.includes('Waiting on http')) {
                if (ready) ready();
            }
            if (data.includes('TEST COMPLETE')) {
                if (done) done();
            }
            if (data.includes('ERROR  SyntaxError')) {
                if (error) error(data);
            }
            metroBuf += data;
            const lines = metroBuf.split(/\r?\n/);
            metroBuf = lines.pop();
            for (let i = 0; i < lines.length; i++) {
                const line = '[METRO] ' + lines[i];
                if (!Log.silent) process.stdout.write(line + '\n');
                Log.append(line);
            }
        } catch (_) {}
    }

    metro.on('stdout', (chunk) =>  logger(chunk));

    metro.on('close', (code) => {
        console.log(`Metro server exited with code ${code}`);
        if (close) close(code);
    });

    metro.start();
    return metro;
}

function buildAndInstall(ready, close, intalled, open, failed) {
    const builder = process_manager('builder');
    builder.setup('npx', ['expo','run:android','--no-bundler'], { cwd: workspace, stdio: 'pipe' });
    let installed = false;
    let opening = false;

    let builderBuf = '';
    function logger(data){
        const chunk = data.toString();
        builderBuf += chunk;
        const lines = builderBuf.split(/\r?\n/);
        builderBuf = lines.pop();
        for (let i = 0; i < lines.length; i++) {
            const line = '[BUILD] ' + lines[i];
            if(!Log.silent)
                process.stdout.write(line + '\n');
            Log.append(line);
        }
    }

    builder.on('stdout', (data) => {
        try {
            const s = String(data);
            if (s.includes('Installing')) {
                installed = true;
                if (intalled) intalled();
            }
            if (s.includes('Opening')) {
                opening = true;
                if (open) open();
            }
            if (s.includes('BUILD FAILED')) {
                console.log('Build failed');
                if (failed) failed();
            }
            logger(data);
        } catch (_) { console.log(_);}
    });
    builder.on('stderr', (data) => { try { logger(data); } catch (_) { console.log(_); } });


    builder.on('close', (code) => {
        console.log(`Builder exited with code ${code}`);
        if (close) close(code);
        if (ready) ready(installed && opening);
    });

    builder.start();
    return builder;
}

function adbLogCat(done) {
    var worksapceAppJSON = require(workspace + '/app.json');
    var appPckage = worksapceAppJSON.expo.android.package;
    // Listen for the app package, common React Native tags, and crash/runtime keywords
    let regexTags = [].concat(
        [appPckage],// app package name
        [ 'ReactNativeJS', 'ReactNative', 'RCTLog', 'Hermes'],// React Native common tags
        ['AndroidRuntime', 'FATAL EXCEPTION', 'SIGSEGV', 'SIGABRT', 'ANR', 'Fatal signal', 'native crash', 'crash'],// crash/runtime keywords
        [ 'moniker' ], // moniker tags
    );
    regexTags = regexTags.join('|');
    const logcat = process_manager('logcat');
    logcat.setup('adb', ['logcat', '--regex', regexTags], { stdio: 'pipe' });
    logcat.start();
    
    let builderBuf = '';
    function logger(data){
        const chunk = data.toString();
        builderBuf += chunk;
        const lines = builderBuf.split(/\r?\n/);
        builderBuf = lines.pop();
        for (let i = 0; i < lines.length; i++) {
            const line = '[ADB] ' + lines[i];
            // if (line.includes('ReactNativeJS') || line.includes('ReactNative') || line.includes('RCTLog') || line.includes('Hermes')) 
            process.stdout.write(line + '\n');
            Log.append(line);
        }
    }

    logcat.on('stdout', (data) => {
        const skipArray = [
            'SurfaceFlinger:',
            'BufferQueueProducer:',
            'BufferQueueConsumer:',
            'Choreographer:',
            'OpenGLRenderer:',
            'DisplayEventReceiver:',
            'ActivityManager:',
            'PowerManagerService:',
            'WindowManager:',
            'InputMethodManagerService:',
            'AudioFlinger:',
            'Gralloc4:',
            'Adreno-EGL:',
            'Adreno-ES20:',
            'Adreno-ES30:',
            'EGL_emulation:',
            'libEGL:',
            'libGLESv2:',
            'GLES2Decoder:',
            'OpenGLRenderer:',
            'SGM:GameManager'
        ];
        let skip = false;
        for(let i=0; i<skipArray.length; i++) {
            if(data.toString().includes(skipArray[i])) {
                skip = true;
                break;
            }
        }
        if (!skip) {
            try {
                logger(data);
            } catch (_) {console.log(_);}
        }
    });

    logcat.on('close', (code) => {
        console.log(`adb logcat exited with code ${code}`);
        if(done) done(code);
    });

    return logcat;
}

// export the cli function for requiring
module.exports = cli;
