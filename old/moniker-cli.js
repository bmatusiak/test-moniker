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
        // use Log.echo when available, otherwise fallback to console
        try {
            if (typeof Log !== 'undefined' && Log && Log.echo) {
                Log.echo('Using workspace: ' + workspace);
            } else {
                console.log('Using workspace:', workspace);
            }
        } catch (_) { console.log('Using workspace:', workspace); }
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

// output helpers use Log.echo when available (JSON mode), otherwise fallback
function out() {
    const args = Array.prototype.slice.call(arguments).map(a => (typeof a === 'string' ? a : JSON.stringify(a)));
    const msg = args.join(' ');
    try {
        if (Log && Log.echo) {
            try { Log.echo(msg); return; } catch (_) {}
        }
    } catch (_) {}
    console.log(msg);
}
function err() {
    const args = Array.prototype.slice.call(arguments).map(a => (typeof a === 'string' ? a : JSON.stringify(a)));
    const msg = args.join(' ');
    try {
        if (Log && Log.echo) {
            try { Log.echo('[ERROR] ' + msg); return; } catch (_) {}
        }
    } catch (_) {}
    console.error(msg);
}

// intermediate values set by pre-run flag handlers
let _CONFIG_PATH = null;
let _SILENT = false;
let _LOG_PATH_OVERRIDE = null;

// Global runtime flags
let _VERBOSE = false;
let _DRY_RUN = false;
let _LOG_ENABLED = false;
// CI, force, json-log, config flags
let CI_MODE = false;
let FORCE = false;
let _CONFIG = null;
const device_manager = require('./libs/device_manager');
let _CAPTURE_ON_CRASH = false;
let _PROCESS_EXIT_CODE = 0; 

const process_manager = require('./libs/process_manager');

function stopAllChildren() {
    try { process_manager.stop(); } catch (_) {}
}

process.on('SIGINT', () => {
    out('\nReceived SIGINT — stopping child processes...');
    stopAllChildren();
    process.exit(130);
});
process.on('SIGTERM', () => {
    out('\nReceived SIGTERM — stopping child processes...');
    stopAllChildren();
    process.exit(143);
});

cli('--log')
    .info('Log Output to moniker-log-' + Date.now() + '.txt')
    .flags({ pre: true })
    .do((values) => {
        _LOG_PATH_OVERRIDE = typeof values.log === 'string' ? values.log : _LOG_PATH_OVERRIDE;
        _LOG_ENABLED = true;
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

// register a generic json flag for commands that support JSON output
cli('--json','-j')
    .info('Output JSON from commands')
    .do(() => {});

cli('--capture-bugreport-on-crash')
    .info('Automatically capture adb bugreport when a crash is detected')
    .flags({ pre: true })
    .do(() => { 
        _CAPTURE_ON_CRASH = true; 
        _LOG_ENABLED = true;
    });

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
    .flags({ pre: true })
    .do(() => { _VERBOSE = true; _LOG_ENABLED = true; });

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
        out('workspace (from handler values):', values && values.workspace ? values.workspace : process.env.TEST_MONIKER_WORKSPACE);
    });

// doctor: environment and health checks
cli('doctor')
    .info('Run environment and health diagnostics')
    .flags('--json','-j')
    .do((values) => {
        try {
            const results = [];
            const se = device_manager.safeExec;
            const push = (k, v) => results.push({ key: k, value: v });

            const adb = se('adb', ['version']);
            push('adb', adb.ok ? 'ok' : ('missing: ' + (adb.stderr || adb.stdout)));

            const java = se('java', ['-version']);
            push('java', java.ok ? 'ok' : ('missing: ' + (java.stderr || java.stdout)));

            const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || null;
            push('android_sdk', sdk ? sdk : 'NOT SET');

            const avds = se('emulator', ['-list-avds']);
            push('avds', avds.ok ? (avds.stdout || '').trim().split(/\r?\n/).filter(Boolean) : []);

            const portCheck = se('node', ['-e', 'const net=require(\'net\'); const s=net.createConnection(8081,\'127.0.0.1\'); s.on(\'connect\',()=>{console.log(\'open\'); s.destroy(); process.exit(0)}); s.on(\'error\',()=>{console.log(\'closed\'); process.exit(1)}); setTimeout(()=>{console.log(\'closed\'); process.exit(1)},1500);']);
            push('metro_port_8081', portCheck.status === 0 ? 'in-use' : 'free');

            const portCheck19000 = se('node', ['-e', 'const net=require(\'net\'); const s=net.createConnection(19000,\'127.0.0.1\'); s.on(\'connect\',()=>{console.log(\'open\'); s.destroy(); process.exit(0)}); s.on(\'error\',()=>{console.log(\'closed\'); process.exit(1)}); setTimeout(()=>{console.log(\'closed\'); process.exit(1)},1500);']);
            push('expo_port_19000', portCheck19000.status === 0 ? 'in-use' : 'free');

            const devices = device_manager.listDevices();
            push('adb_devices', devices);

            // per-device properties
            try {
                const perDev = [];
                for (const d of devices) {
                    try {
                        const serial = d && d.serial;
                        if (!serial) continue;
                        const model = se('adb', ['-s', serial, 'shell', 'getprop', 'ro.product.model']);
                        const manufacturer = se('adb', ['-s', serial, 'shell', 'getprop', 'ro.product.manufacturer']);
                        const sdk = se('adb', ['-s', serial, 'shell', 'getprop', 'ro.build.version.sdk']);
                        const abi = se('adb', ['-s', serial, 'shell', 'getprop', 'ro.product.cpu.abi']);
                        perDev.push({ serial, model: (model.stdout||model.stderr||'').trim(), manufacturer: (manufacturer.stdout||manufacturer.stderr||'').trim(), sdk: (sdk.stdout||sdk.stderr||'').trim(), abi: (abi.stdout||abi.stderr||'').trim(), status: d.status });
                    } catch (_) {}
                }
                push('adb_device_props', perDev);
                // check whether the app is installed on each device (if we know the package)
                try {
                    // compute app package id (try app.json then AndroidManifest)
                    let appPkg = null;
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        const appJsonPath = path.join(workspace, 'app.json');
                        if (fs.existsSync(appJsonPath)) {
                            const raw = fs.readFileSync(appJsonPath, 'utf8');
                            try {
                                const obj = JSON.parse(raw);
                                if (obj && obj.expo && obj.expo.android && obj.expo.android.package) appPkg = obj.expo.android.package;
                                else if (obj && obj.expo && obj.expo.package) appPkg = obj.expo.package;
                            } catch (_) {}
                        }
                    } catch (_) {}
                    if (!appPkg) {
                        try {
                            const fs = require('fs');
                            const path = require('path');
                            const manifest = path.join(workspace, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
                            if (fs.existsSync(manifest)) {
                                const raw = fs.readFileSync(manifest, 'utf8');
                                const m = raw.match(/package=\"([^\"]+)\"/);
                                if (m) appPkg = m[1];
                            }
                        } catch (_) {}
                    }

                    const installedResults = [];
                    for (const d of devices) {
                        const serial = d && d.serial;
                        if (!serial) continue;
                        if (!appPkg) {
                            installedResults.push({ serial, installed: null });
                            continue;
                        }
                        try {
                            const r = se('adb', ['-s', serial, 'shell', 'pm', 'list', 'packages', appPkg]);
                            const ok = r.ok && ((r.stdout || r.stderr || '').indexOf('package:' + appPkg) !== -1);
                            installedResults.push({ serial, installed: !!ok });
                        } catch (_) {
                            installedResults.push({ serial, installed: null });
                        }
                    }
                    push('adb_app_installed', installedResults);
                } catch (_) {}
            } catch (_) {}

            // emulator process check (pgrep may not exist, tolerate failures)
            try {
                const pgrep = se('pgrep', ['-f', 'emulator']);
                const pids = pgrep.ok ? (pgrep.stdout || '').trim().split(/\r?\n/).filter(Boolean) : [];
                push('emulator_pids', pids);
            } catch (_) {}

            // expo + gradle + workspace checks
            try {
                const expo = se('npx', ['expo', '--version']);
                push('expo_cli', expo.ok ? (expo.stdout || expo.stderr || '').trim() : null);
            } catch (_) { push('expo_cli', null); }
            // installed package versions (expo, react-native, react) if available
            try {
                let v = null;
                try { v = require('expo/package.json').version; } catch (_) { v = null; }
                if (!v) {
                    try {
                        const pj = require(workspace + '/package.json');
                        v = (pj && pj.dependencies && pj.dependencies.expo) || (pj && pj.devDependencies && pj.devDependencies.expo) || null;
                    } catch (_) { v = null; }
                }
                push('installed_expo_version', v || null);
            } catch (_) { push('installed_expo_version', null); }

            try {
                let v = null;
                try { v = require('react-native/package.json').version; } catch (_) { v = null; }
                if (!v) {
                    try {
                        const pj = require(workspace + '/package.json');
                        v = (pj && pj.dependencies && pj.dependencies['react-native']) || (pj && pj.devDependencies && pj.devDependencies['react-native']) || null;
                    } catch (_) { v = null; }
                }
                push('installed_react_native_version', v || null);
            } catch (_) { push('installed_react_native_version', null); }

            try {
                let v = null;
                try { v = require('react/package.json').version; } catch (_) { v = null; }
                if (!v) {
                    try {
                        const pj = require(workspace + '/package.json');
                        v = (pj && pj.dependencies && pj.dependencies.react) || (pj && pj.devDependencies && pj.devDependencies.react) || null;
                    } catch (_) { v = null; }
                }
                push('installed_react_version', v || null);
            } catch (_) { push('installed_react_version', null); }

            try {
                const gradlew = require('fs').existsSync(require('path').join(workspace, 'android', 'gradlew'));
                push('workspace_gradlew', !!gradlew);
            } catch (_) { push('workspace_gradlew', false); }

            // extra machine-readable checks
            try {
                const os = require('os');
                push('node_version', process.version);
                push('platform', os.platform());
                push('arch', os.arch());
                push('cpus', os.cpus() && os.cpus().length);
                push('total_mem', os.totalmem());
                push('free_mem', os.freemem());
            } catch (_) {}

            try {
                const pkgExists = require('fs').existsSync(require('path').join(workspace, 'package.json'));
                const appJsonExists = require('fs').existsSync(require('path').join(workspace, 'app.json'));
                push('workspace_has_package_json', !!pkgExists);
                push('workspace_has_app_json', !!appJsonExists);
            } catch (_) {}

            // app package id (try app.json then AndroidManifest)
            try {
                let appPkg = null;
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const appJsonPath = path.join(workspace, 'app.json');
                    if (fs.existsSync(appJsonPath)) {
                        const raw = fs.readFileSync(appJsonPath, 'utf8');
                        try {
                            const obj = JSON.parse(raw);
                            if (obj && obj.expo && obj.expo.android && obj.expo.android.package) appPkg = obj.expo.android.package;
                            else if (obj && obj.expo && obj.expo.package) appPkg = obj.expo.package;
                        } catch (_) {}
                    }
                } catch (_) {}
                if (!appPkg) {
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        const manifest = path.join(workspace, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
                        if (fs.existsSync(manifest)) {
                            const raw = fs.readFileSync(manifest, 'utf8');
                            const m = raw.match(/package=\"([^\"]+)\"/);
                            if (m) appPkg = m[1];
                        }
                    } catch (_) {}
                }
                push('app_package', appPkg || null);
            } catch (_) { push('app_package', null); }

            const parsed = cli.parseArgs && cli.parseArgs();
            const asJson = (values && (values.json || values['--json'] || values['-j'])) || (parsed && (parsed.flags && (parsed.flags.json || parsed.flags.j)));
            if (asJson) {
                out(JSON.stringify(results));
            } else {
                out('\nMoniker Doctor Results:');
                for (const r of results) {
                    out('- ' + r.key + ':', Array.isArray(r.value) ? JSON.stringify(r.value) : r.value);
                }
            }

            // remediation hints for failed checks
            try {
                const hints = [];
                const find = (k) => results.find(x => x.key === k);
                const adbRes = find('adb');
                if (!adbRes || adbRes.value !== 'ok') hints.push('ADB not found or not functional: install Android platform-tools and ensure `adb` is on PATH.');
                const javaRes = find('java');
                if (!javaRes || javaRes.value !== 'ok') hints.push('Java not found: install JDK 11+ and set JAVA_HOME.');
                const sdkRes = find('android_sdk');
                if (!sdkRes || sdkRes.value === 'NOT SET') hints.push('Android SDK not configured: set ANDROID_SDK_ROOT or ANDROID_HOME to your SDK path.');
                const expoRes = find('expo_cli');
                if (!expoRes || !expoRes.value) hints.push('Expo CLI not available: use `npm i -g expo-cli` or run via `npx expo`.');
                const p8081 = find('metro_port_8081');
                if (p8081 && p8081.value === 'free') hints.push('Metro server not running on 8081: start it with `npx expo start` or ensure port forwarding.');
                const pkgRes = find('app_package');
                if (!pkgRes || !pkgRes.value) hints.push('App package id not found: ensure app.json or AndroidManifest.xml declares the package.');
                const installedList = find('adb_app_installed');
                if (installedList && Array.isArray(installedList.value)) {
                    for (const d of installedList.value) {
                        if (d.installed === false) {
                            hints.push(`App not installed on device ${d.serial}: install via 'adb -s ${d.serial} install <apk>' or use 'npx expo run:android'.`);
                        }
                    }
                }
                if (hints.length) push('hints', hints);
            } catch (_) {}

            if (Log && Log.append) {
                try { Log.append('[DOCTOR] ' + JSON.stringify(results)); } catch (_) {}
            }
        } catch (e) {
            err('Doctor failed:', e);
        }
    });

cli('--start-dev-server','-s')
    .info('Start the metro development server')
    .do(() => {
        let metro, _builder, logcat, crashDetected = false;
        tryRun('fuser', ['-k', '8081/tcp']);//kill any process using metro port
        metro = startMeroServer(//ready, close, done, error
            () => {//ready
                _builder = buildAndInstall(//ready, close, intalled, open, failed
                    false, // ready
                    false,// close
                    () => {// installed
                        // logcat = adbLogCat(//done
                        //     () => {//done
                        //         metro.stop();
                        //     });
                    },
                    () => {// opening
                        logcat = adbLogCat(//done, crashDetect
                            () => {//done
                                if(crashDetected) process.exit(_PROCESS_EXIT_CODE);//exit when crashDetected detected
                                else metro.stop();
                            },
                            (serial, line) => {//crashDetect
                                if(crashDetected) return;
                                crashDetected = true;
                                try { _PROCESS_EXIT_CODE = 1; } catch (_) {}
                                metro.stop();

                                
                                // capture bugreport on crash keywords
                                try {
                                    if (_CAPTURE_ON_CRASH) {
                                        try {
                                            err('[CRASH HANDLER] on device '+ serial + ': ' + line);
                                            //kill app package id before running bugreport
                                            try {
                                                // compute app package id based on the same logic used in `doctor`
                                                let appPkg = null;
                                                try {
                                                    const fs = require('fs');
                                                    const path = require('path');
                                                    const appJsonPath = path.join(workspace, 'app.json');
                                                    if (fs.existsSync(appJsonPath)) {
                                                        const raw = fs.readFileSync(appJsonPath, 'utf8');
                                                        try {
                                                            const obj = JSON.parse(raw);
                                                            if (obj && obj.expo && obj.expo.android && obj.expo.android.package) appPkg = obj.expo.android.package;
                                                            else if (obj && obj.expo && obj.expo.package) appPkg = obj.expo.package;
                                                        } catch (_) {}
                                                    }
                                                } catch (_) {}
                                                if (!appPkg) {
                                                    try {
                                                        const fs = require('fs');
                                                        const path = require('path');
                                                        const manifest = path.join(workspace, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
                                                        if (fs.existsSync(manifest)) {
                                                            const raw = fs.readFileSync(manifest, 'utf8');
                                                            const m = raw.match(/package=\"([^\"]+)\"/);
                                                            if (m) appPkg = m[1];
                                                        }
                                                    } catch (_) {}
                                                }
                                                if (appPkg) {
                                                    err('[CRASH HANDLER] Stopping app '+ appPkg + ' on device ' + serial + '...');
                                                    const stopRes = device_manager.safeExec('adb', ['-s', serial, 'shell', 'am', 'force-stop', appPkg]);
                                                    err('[CRASH HANDLER] Stopped app result: ' + (stopRes && stopRes.ok ? 'ok' : ('failed: ' + (stopRes.stderr || stopRes.stdout || '~UNKNOWN'))));
                                                }
                                            } catch (_) {}

                                            err('[CRASH HANDLER] Capturing bugreport for device '+ serial + '... This could take a while.');
                                            // const ts = Date.now();
                                            // const fs = require('fs');
                                            const path = require('path');
                                            const logDir = (Log && Log.path) ? path.join(workspace, path.dirname(Log.path)) : path.join(workspace, 'logs');
                                            // try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); } catch (_) {}
                                            // const outPath = path.join(logDir, 'bugreport-' + ts );
                                            err('[CRASH HANDLER] Saving bugreport to folder '+ logDir);
                                            device_manager.captureBugreport(logDir, serial, (crasRes) => {
                                                let ol = '[CRASH HANDLER] Captured bugreport: ' + (crasRes && crasRes.output ? crasRes.output : outPath);
                                                try { err(ol); } catch (_) { console.log(ol); }
                                                try { if (Log && Log.append) Log.append(ol); } catch (_) {}
                                                try { logcat.stop(); } catch (_) {}
                                            });
                                        } catch (_) {}
                                    } else {
                                        // stopping log cat will stop metro
                                        logcat.stop();
                                    }
                                } catch (_) {}
                            });
                    },
                    ()=> {// failed
                        _PROCESS_EXIT_CODE = 1;
                        err('Build server error: (see logs for details)');
                        metro.stop();
                    });
            }, () => { //close
                if(Log.enabled) console.log('Logs saved to ' + Log.path);
                if(!crashDetected)
                    process.exit(_PROCESS_EXIT_CODE);//exit when metro stops
            }, () => {// done
                logcat.stop();
            }, (error) => {// error
                err('Metro server error:', error);
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
                if (!Log.silent) out(line);
                Log.append(line);
            }
        } catch (_) {}
    }

    metro.on('stdout', (chunk) =>  logger(chunk));

    metro.on('close', (code) => {
        out(`Metro server exited with code ${code}`);
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
            if(!Log.silent) out(line);
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
                err('Build failed');
                if (failed) failed();
            }
            logger(data);
        } catch (_) { err(_);}
    });
    builder.on('stderr', (data) => { try { logger(data); } catch (_) { err(_); } });


    builder.on('close', (code) => {
        out(`Builder exited with code ${code}`);
        if (close) close(code);
        if (ready) ready(installed && opening);
    });

    builder.start();
    return builder;
}

function adbLogCat(done, crashDetect) {
    // New, simpler adb log collector per-device.
    const fs = require('fs');
    const path = require('path');

    // resolve app package id (app.json or AndroidManifest)
    let appPackage = null;
    try {
        const appJsonPath = path.join(workspace, 'app.json');
        if (fs.existsSync(appJsonPath)) {
            const raw = fs.readFileSync(appJsonPath, 'utf8');
            try {
                const obj = JSON.parse(raw);
                if (obj && obj.expo && obj.expo.android && obj.expo.android.package) appPackage = obj.expo.android.package;
                else if (obj && obj.expo && obj.expo.package) appPackage = obj.expo.package;
            } catch (_) {}
        }
        if (!appPackage) {
            const manifest = path.join(workspace, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
            if (fs.existsSync(manifest)) {
                const raw = fs.readFileSync(manifest, 'utf8');
                const m = raw.match(/package=\"([^\"]+)\"/);
                if (m) appPackage = m[1];
            }
        }
    } catch (_) { appPackage = null; }

    const devices = Array.isArray(device_manager.listDevices && device_manager.listDevices()) ? device_manager.listDevices() : (device_manager.listDevices() || []);
    const collectors = [];
    let closed = 0;
    
    function logLine(serial, rawLine) {
        // Emit raw logcat output exactly as produced by adb (no reformatting)
        // try { out('[ADB-' + serial + '] ' + rawLine); } catch (_) { console.log(rawLine); }
        try { if (Log && Log.append) Log.append(rawLine); } catch (_) {}
    }

    function makeCollector(serial) {
        // clear logcat buffer first
        try { device_manager.safeExec('adb', ['-s', serial, 'logcat', '-c']); } catch (_) {}

        // try pidof, but tolerate failures
        let pid = null;
        if (appPackage) {
            try {
                const r = device_manager.safeExec('adb', ['-s', serial, 'shell', 'pidof', appPackage]);
                if (r && r.ok && r.stdout) pid = (r.stdout || '').trim().split(/\s+/)[0] || null;
            } catch (_) { pid = null; }
        }

        const name = 'logcat-' + serial;
        const proc = process_manager(name);
        // Start unfiltered logcat (with timestamps) so we don't miss native crash signals.
        // If pid is available prefer pid filtering to reduce noise; otherwise capture all tags.
        const args = ['-s', serial, 'logcat', '-v', 'time'];
        if (pid) {
            args.push('--pid', pid);
        }

        // Silence very noisy system tags observed during short captures.
        // These were determined by sampling raw `adb logcat -v time` and
        // represent frequent system noise we generally don't need in device logs.
        const NOISY_TAGS = [
            'hwcomposer',
            'AudioALSAStreamManager',
            'AudioALSACaptureDataProviderNormal',
            'WifiHAL',
            'WifiVendorHal',
            'SemNscXgbMsL1',
            'SemNscXgbL2Rt',
            'SemNscXgbL2Nrt',
            'data_transfer',
            'WifiProfileShare',
            'SurfaceFlinger',
            'io_stats',
            'EPDG',
            'AudioALSAStreamManager'
        ];
        for (const t of NOISY_TAGS) {
            try { args.push(t + ':S'); } catch (_) {}
        }

        proc.setup('adb', args, { stdio: 'pipe' });

        let buffer = '';
        const onData = (data) => {
            buffer += data.toString();
            const parts = buffer.split(/\r?\n/);
            buffer = parts.pop();
            for (const line of parts) {
                if (!line) continue;
                logLine(serial, line);
                // capture bugreport on crash keywords
                try {
                    if (line.includes('FATAL EXCEPTION') || line.includes('SIGSEGV') || line.includes('ANR') || line.includes('Fatal signal')) {
                        //stop log cat, no longer needed
                        crashDetect && crashDetect(serial, line);
                    }
                } catch (_) {}
            }
        };

        proc.on('stdout', onData);
        proc.on('stderr', onData);
        proc.on('close', (code) => {
            out(`adb logcat(${serial}) exited with code ${code}`);
            closed++;
            if (closed === collectors.length && done) done(code);
        });

        proc.start();
        return proc;
    }

    // start collectors for each device
    for (const d of devices) {
        const serial = d && d.serial;
        if (!serial) continue;
        const c = makeCollector(serial);
        collectors.push(c);
    }

    return {
        stop() {
            for (const p of collectors) {
                try { p.stop(); } catch (_) {}
            }
        }
    };
}

// export the cli function for requiring
module.exports = cli;
