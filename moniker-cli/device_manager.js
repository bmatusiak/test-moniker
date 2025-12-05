

plugin.consumes = ['nodejs'];
plugin.provides = ['device_manager'];

function plugin(imports, register) {
    const { nodejs } = imports;
    const { spawnSync, spawn } = nodejs.child_process;
    const { fs, path } = nodejs;

    function safeExec(cmd, args, opts) {
        try {
            const r = spawnSync(cmd, args || [], Object.assign({ encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, opts || {}));
            return { ok: r.status === 0, stdout: String(r.stdout || ''), stderr: String(r.stderr || ''), status: r.status };
        } catch (e) {
            return { ok: false, stdout: '', stderr: String(e), status: 1 };
        }
    }

    function listDevices() {
        const r = safeExec('adb', ['devices']);
        const out = [];
        try {
            const lines = (r.stdout || '').split(/\r?\n/).slice(1);
            for (const l of lines) {
                if (!l.trim()) continue;
                const parts = l.split(/\s+/);
                if (parts[0]) out.push({ serial: parts[0], status: parts[1] || 'unknown' });
            }
        } catch (_) { }
        return out;
    }

    function startEmulator(avdName, options) {
        options = options || [];
        if (!avdName) return { ok: false, error: 'no avd specified' };
        // spawn detached emulator process
        try {
            const cmd = process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'emulator', 'emulator') : 'emulator';
            const child = spawn(cmd, ['-avd', avdName].concat(options), { detached: true, stdio: 'ignore' });
            child.unref();
            return { ok: true, pid: child.pid };
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    }

    function captureBugreportSync(outDir, serial) {
        try {
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

            const fullCmd = (serial ? `adb -s ${serial} bugreport` : 'adb bugreport') + ` ${outDir}`; // save dumpstate zip to outDir
            const r = spawnSync(fullCmd, { shell: true, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
            if (r.status === 0) {
                return { ok: true, output: r.stdout };
            } else {
                return { ok: false, output: r.stderr || '~BUGREPORT FAILED' };
            }
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    }

    // Async version that accepts a callback `cb(result)` and streams output to disk.
    function captureBugreport(outDir, serial, cb) {
        try {
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        } catch (e) {
            if (typeof cb === 'function') return cb({ ok: false, output: String(e) });
            return { ok: false, output: String(e) };
        }

        const args = serial ? ['-s', serial, 'bugreport', outDir] : ['bugreport', outDir];
        try {
            const child = spawn('adb', args);
            let stderr = '';
            let outPut = '';
            child.stdout.on('data', (d) => { try { outPut += String(d); } catch (_) { } });
            child.stderr.on('data', (d) => { try { stderr += String(d); } catch (_) { } });
            child.on('error', (err) => {
                if (typeof cb === 'function') return cb({ ok: false, output: String(err) });
            });
            child.on('close', (code) => {
                if (code === 0) {
                    if (typeof cb === 'function') return cb({ ok: true, output: outPut });
                } else {
                    if (typeof cb === 'function') return cb({ ok: false, output: stderr || '~BUGREPORT FAILED' });
                }
            });
            return { ok: true, async: true, pid: child.pid };
        } catch (e) {
            if (typeof cb === 'function') return cb({ ok: false, output: String(e) });
            return { ok: false, output: String(e) };
        }
    }

    function captureLogcat(outFile, serial, filter) {
        try {
            const dir = path.dirname(outFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const cmd = serial ? [`-s`, serial, `logcat`, `-d`] : ['logcat', '-d'];
            if (filter) cmd.push('--regex', filter);
            const r = spawnSync('adb', cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
            if (r.status === 0) {
                fs.writeFileSync(outFile, r.stdout);
                return { ok: true, path: outFile };
            }
            fs.writeFileSync(outFile + '.err.txt', String(r.stderr || ''));
            return { ok: false, path: outFile + '.err.txt', stderr: String(r.stderr || '') };
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    }

    register(null, {
        device_manager: {
            safeExec,
            listDevices,
            startEmulator,
            captureBugreport,
            captureBugreportSync,
            captureLogcat
        }
    });
}

module.exports = plugin;
