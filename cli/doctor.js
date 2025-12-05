

plugin.consumes = ['cli', 'workspace', 'device_manager', 'Log', 'nodejs'];
plugin.provides = ['doctor'];

function plugin(imports, register) {
    var { cli, workspace, device_manager, Log, nodejs } = imports;
    const os = nodejs.os;
    const fs = nodejs.fs;
    const path = nodejs.path;

    // doctor: environment and health checks
    function runDoctor(outputObject = false) {
        const out = Log.out || console.log;
        const err = Log.err || console.error;
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
                        perDev.push({ serial, model: (model.stdout || model.stderr || '').trim(), manufacturer: (manufacturer.stdout || manufacturer.stderr || '').trim(), sdk: (sdk.stdout || sdk.stderr || '').trim(), abi: (abi.stdout || abi.stderr || '').trim(), status: d.status });
                    } catch (_) { }
                }
                push('adb_device_props', perDev);
                // check whether the app is installed on each device (if we know the package)
                try {
                    // compute app package id (try app.json then AndroidManifest)
                    let appPkg = null;
                    try {


                        const appJsonPath = path.join(workspace.path, 'app.json');
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


                            const manifest = path.join(workspace.path, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
                            if (fs.existsSync(manifest)) {
                                const raw = fs.readFileSync(manifest, 'utf8');
                                const m = raw.match(/package=\"([^\"]+)\"/);
                                if (m) appPkg = m[1];
                            }
                        } catch (_) { }
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
                } catch (_) { }
            } catch (_) { }

            // emulator process check (pgrep may not exist, tolerate failures)
            try {
                const pgrep = se('pgrep', ['-f', 'emulator']);
                const pids = pgrep.ok ? (pgrep.stdout || '').trim().split(/\r?\n/).filter(Boolean) : [];
                push('emulator_pids', pids);
            } catch (_) { }

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
                const gradlew = fs.existsSync(path.join(workspace.path, 'android', 'gradlew'));
                push('workspace_gradlew', !!gradlew);
            } catch (_) { push('workspace_gradlew', false); }

            // extra machine-readable checks
            try {
                push('node_version', process.version);
                push('platform', os.platform());
                push('arch', os.arch());
                push('cpus', os.cpus() && os.cpus().length);
                push('total_mem', os.totalmem());
                push('free_mem', os.freemem());
            } catch (_) { }

            try {
                const pkgExists = fs.existsSync(path.join(workspace.path, 'package.json'));
                const appJsonExists = fs.existsSync(path.join(workspace.path, 'app.json'));
                push('workspace_has_package_json', !!pkgExists);
                push('workspace_has_app_json', !!appJsonExists);
            } catch (_) { }

            // app package id (try app.json then AndroidManifest)
            try {
                let appPkg = null;
                try {


                    const appJsonPath = path.join(workspace.path, 'app.json');
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


                        const manifest = path.join(workspace.path, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
                        if (fs.existsSync(manifest)) {
                            const raw = fs.readFileSync(manifest, 'utf8');
                            const m = raw.match(/package=\"([^\"]+)\"/);
                            if (m) appPkg = m[1];
                        }
                    } catch (_) { }
                }
                push('app_package', appPkg || null);
            } catch (_) { push('app_package', null); }

            if (outputObject) {
                return results;
            }

            Log.enabled = true;
            const asJson = Log.json || false;
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
            } catch (_) { }

            if (Log && Log.append) {
                try { Log.append('[DOCTOR] ' + JSON.stringify(results)); } catch (_) { }
            }
        } catch (e) {
            err('Doctor failed:', e);
        }
    }

    cli('doctor')
        .info('Run environment and health diagnostics')
        .flags('--json', '-j')
        .do((values) => {
            runDoctor();
        });


    register(null, { doctor: { run: runDoctor, get: () => runDoctor(true) } });
}


module.exports = plugin;
