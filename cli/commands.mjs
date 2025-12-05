

plugin.consumes = ['cli', 'workspace', 'Log', 'device_manager', 'process_manager', 'crash', 'nodejs'];
plugin.provides = ['commands'];

function plugin(imports, register) {
    var { cli, workspace, Log, device_manager, process_manager, crash, nodejs } = imports;


    cli('--start-dev-server', '-s')
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
                                    if (crashDetected) process.exit(_PROCESS_EXIT_CODE);//exit when crashDetected detected
                                    else metro.stop();
                                },
                                (serial, line) => {//crashDetect
                                    if (crashDetected) return;
                                    crashDetected = true;
                                    try { _PROCESS_EXIT_CODE = 1; } catch (_) { }
                                    metro.stop();


                                    // capture bugreport on crash keywords
                                    try {
                                        if (_CAPTURE_ON_CRASH) {
                                            try {
                                                err('[CRASH HANDLER] on device ' + serial + ': ' + line);
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
                                                            } catch (_) { }
                                                        }
                                                    } catch (_) { }
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
                                                        } catch (_) { }
                                                    }
                                                    if (appPkg) {
                                                        err('[CRASH HANDLER] Stopping app ' + appPkg + ' on device ' + serial + '...');
                                                        const stopRes = device_manager.safeExec('adb', ['-s', serial, 'shell', 'am', 'force-stop', appPkg]);
                                                        err('[CRASH HANDLER] Stopped app result: ' + (stopRes && stopRes.ok ? 'ok' : ('failed: ' + (stopRes.stderr || stopRes.stdout || '~UNKNOWN'))));
                                                    }
                                                } catch (_) { }

                                                err('[CRASH HANDLER] Capturing bugreport for device ' + serial + '... This could take a while.');
                                                // const ts = Date.now();
                                                // const fs = require('fs');
                                                const path = require('path');
                                                const logDir = (Log && Log.path) ? path.join(workspace, path.dirname(Log.path)) : path.join(workspace, 'logs');
                                                // try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); } catch (_) {}
                                                // const outPath = path.join(logDir, 'bugreport-' + ts );
                                                err('[CRASH HANDLER] Saving bugreport to folder ' + logDir);
                                                device_manager.captureBugreport(logDir, serial, (crasRes) => {
                                                    let ol = '[CRASH HANDLER] Captured bugreport: ' + (crasRes && crasRes.output ? crasRes.output : outPath);
                                                    try { err(ol); } catch (_) { console.log(ol); }
                                                    try { if (Log && Log.append) Log.append(ol); } catch (_) { }
                                                    try { logcat.stop(); } catch (_) { }
                                                });
                                            } catch (_) { }
                                        } else {
                                            // stopping log cat will stop metro
                                            logcat.stop();
                                        }
                                    } catch (_) { }
                                });
                        },
                        () => {// failed
                            _PROCESS_EXIT_CODE = 1;
                            err('Build server error: (see logs for details)');
                            metro.stop();
                        });
                }, () => { //close
                    if (Log.enabled) console.log('Logs saved to ' + Log.path);
                    if (!crashDetected)
                        process.exit(_PROCESS_EXIT_CODE);//exit when metro stops
                }, () => {// done
                    logcat.stop();
                }, (error) => {// error
                    err('Metro server error:', error);
                    logcat.stop();
                    metro.stop();
                });
        });


    function startMeroServer(ready, close, done, error) {
        const metro = process_manager('metro');
        metro.setup('npx', ['expo', 'start', '--dev-client'], { cwd: workspace, stdio: 'pipe' });

        let metroBuf = '';

        function logger(chunk) {
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
            } catch (_) { }
        }

        metro.on('stdout', (chunk) => logger(chunk));

        metro.on('close', (code) => {
            out(`Metro server exited with code ${code}`);
            if (close) close(code);
        });

        metro.start();
        return metro;
    }

    function buildAndInstall(ready, close, intalled, open, failed) {
        const builder = process_manager('builder');
        builder.setup('npx', ['expo', 'run:android', '--no-bundler'], { cwd: workspace, stdio: 'pipe' });
        let installed = false;
        let opening = false;

        let builderBuf = '';
        function logger(data) {
            const chunk = data.toString();
            builderBuf += chunk;
            const lines = builderBuf.split(/\r?\n/);
            builderBuf = lines.pop();
            for (let i = 0; i < lines.length; i++) {
                const line = '[BUILD] ' + lines[i];
                if (!Log.silent) out(line);
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
            } catch (_) { err(_); }
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
                } catch (_) { }
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
            try { if (Log && Log.append) Log.append(rawLine); } catch (_) { }
        }

        function makeCollector(serial) {
            // clear logcat buffer first
            try { device_manager.safeExec('adb', ['-s', serial, 'logcat', '-c']); } catch (_) { }

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
                try { args.push(t + ':S'); } catch (_) { }
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
                    } catch (_) { }
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
                    try { p.stop(); } catch (_) { }
                }
            }
        };
    }

    register(null, {
        commands: {
            startMeroServer,
            buildAndInstall,
            adbLogCat
        }
    });
}

export default plugin;
