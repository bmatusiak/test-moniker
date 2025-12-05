const { spawnSync, spawn } = require('child_process');
const { chai } = require('globals');

function run(cmd, args = [], opts = {}) {
    const input = opts.input || null;
    const env = Object.assign({}, process.env, opts.env || {});
    const cwd = opts.cwd || process.cwd();
    const stdio = input ? ['pipe', 'inherit', 'inherit'] : 'inherit';
    // console.log(`\n$ ${[cmd, ...args].join(" ")}`);
    const res = spawnSync(cmd, args, { env, stdio, input, cwd });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        const err = new Error(`Command failed: ${cmd} ${args.join(' ')}`);
        err.status = res.status;
        throw err;
    }
}

function tryRun(cmd, args = [], opts = {}) {
    try {
        run(cmd, args, opts);
        return true;
    } catch (_e) {
        return false;
    }
}

function longRun(cmd, args = [], opts = {}) {
    const env = Object.assign({}, process.env, opts.env || {});
    const cwd = opts.cwd || process.cwd();
    // console.log(`\n$ ${[cmd, ...args].join(" ")}`);
    const child = spawn(cmd, args, { env, cwd, stdio: opts.stdio || 'inherit', detached: true });
    if (child.error) throw child.error;
    const isRunning = (pid) => {
        try {
            process.kill(pid, 0);
            return true;
        } catch (_) {
            return false;
        }
    };

    child.stop = (opts = {}) => {
        const { forceAfterMs = 3000, verbose = false } = opts;
        if (!child || !child.pid) return;

        const CTRL_C = '\x03';
        if (child.stdin && !child.killed) {
            if (verbose) console.log('Sending Ctrl+C to child stdin...');
            try { child.stdin.write(CTRL_C); } catch (_) {}
        }

        try { child.kill('SIGINT'); } catch (_) {}

        const tryGroupKill = (sig) => {
            if (process.platform !== 'win32') {
                try {
                    process.kill(-child.pid, sig);
                    return true;
                } catch (_) {
                    return false;
                }
            }
            return false;
        };

        setTimeout(() => {
            if (!isRunning(child.pid)) return;
            if (tryGroupKill('SIGTERM')) return;
            try { child.kill('SIGTERM'); } catch (_) {}

            setTimeout(() => {
                if (!isRunning(child.pid)) return;
                if (!tryGroupKill('SIGKILL')) {
                    try { child.kill('SIGKILL'); } catch (_) {}
                }
            }, forceAfterMs);
        }, 500);
    };
    return child;
}

module.exports = {
    run,
    tryRun,
    longRun
};
