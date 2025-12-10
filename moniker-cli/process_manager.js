

plugin.consumes = ['Log', 'cli', 'nodejs'];
plugin.provides = ['process_manager'];

function plugin(imports, register) {
    const { Log, cli, nodejs } = imports;
    const fs = nodejs.fs;
    const path = nodejs.path;
    const child_process = nodejs.child_process;
    const EventEmitter = nodejs.EventEmitter;
    const { spawn, spawnSync } = child_process;

    const loadedProcesses = {};

    function process_manager(processName) {
        if (loadedProcesses[processName]) {
            return loadedProcesses[processName];
        }

        /*
        var prog = process_manager('myProcess');//named process ( can be setup once and reused )
        prog.setup('node', ['myScript.js'], {cwd: '/path/to/dir'});//setup command, args and options ( required to once before start )
        prog.on('exit', (code, signal) => {
            Log.out(`Process exited with code ${code} and signal ${signal}`);
        });
        prog.on('error', (err) => {
            Log.err('Process error:', err);
        });
        prog.on('start', () => {
            Log.out('Process started');
        });
        prog.on('stdout', (data) => {
            Log.out('STDOUT:', data);
        });
        prog.on('stderr', (data) => {
            Log.err('STDERR:', data);
        });
        prog.start();
        setTimeout(() => {
            prog.stop();
        }, 10000);
        setTimeout(() => {
            prog.restart();
        }, 15000);
        setTimeout(() => {
            process_manager.stop('myProcess');//stop by name
            prog.once('exit', () => {
                Log.out('Process fully stopped');
                prog.start();
            });
        }, 20000);
        setTimeout(() => {
            process_manager.stop();//stop all
        }, 30000);
    */

        var proc = new EventEmitter();
        loadedProcesses[processName] = proc;

        let $child = null;
        Object.defineProperty(proc, 'status', {//proc.status
            get() {
                return $child && $child.isRunning($child.pid) ? 'running' : 'stopped';
            },
            enumerable: true
        });
        proc.cmd = null;
        proc.args = [];
        proc.opts = {};
        proc.stopping = false;
        proc.restarting = false;

        function setupProcess(cmd = null, args = [], opts = {}) {
            proc.cmd = cmd;
            proc.args = args;
            proc.opts = opts;
            if (!proc.cmd) {
                throw new Error('Process command not set. Provide cmd argument.');
            }
        }
        proc.setup = setupProcess;

        function runProcess(cmd = null, args = null, opts = null) {
            if (proc.status === 'running') return true;//already running
            if (cmd !== null) {
                proc.cmd = cmd;
            }
            if (args !== null) {
                proc.args = args;
            }
            if (opts !== null) {
                proc.opts = opts;
            }
            if (!proc.cmd) {
                throw new Error('Process command not set. Use setup() or provide cmd argument to start().');
            }
            $child = longRun(proc.cmd, proc.args, proc.opts);
            hookEvents();
            proc.restarting = false;
            proc.emit('start');
        }
        proc.start = runProcess;

        function stopProcess() {
            proc.stopping = true;
            $child?.stop();
        }
        proc.stop = stopProcess;

        function restartProcess() {
            proc.restarting = true;
            if ($child) {
                stopProcess();
            }
        }
        proc.restart = restartProcess;

        function hookEvents() {
            if (!$child) {
                return;
            }
            $child.on('exit', (code, signal) => {
                proc.stopping = false;
                proc.emit('close', code == null ? 0 : code, signal);
                if (proc.restarting) {
                    runProcess();
                }
            });
            $child.on('error', (err) => {
                if (proc.stopping) return;
                proc.emit('error', err);
            });
            $child.stdout.on('data', data => {
                if (proc.stopping) return;
                proc.emit('stdout', data);
            });
            $child.stderr.on('data', data => {
                if (proc.stopping) return;
                proc.emit('stderr', data);
            });
        }
        proc.hookEvents = hookEvents;

        proc.isRunning = () => {
            return $child && $child.isRunning($child.pid);
        };


        return proc;
    };

    function stopByName(name) {
        if (!name) {
            for (const n in loadedProcesses) {
                loadedProcesses[n].stop();
            }
        } else if (loadedProcesses[name]) {
            loadedProcesses[name].stop();
        }
    }
    process_manager.stop = stopByName;

    function longRun(cmd, args = [], opts = {}) {
        const env = Object.assign({}, process.env, opts.env || {});
        const cwd = opts.cwd || process.cwd();
        // console.log(`\n$ ${[cmd, ...args].join(" ")}`);
        const child = spawn(cmd, args, { env, cwd, stdio: opts.stdio || 'inherit', detached: true, shell: 'bash' });
        if (child.error) throw child.error;
        child.isRunning = (pid) => {
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

            // const CTRL_C = '\x03';
            // if (child.stdin && !child.killed) {
            //     // if (verbose) Log.out('Sending Ctrl+C to child stdin...');
            //     try { child.stdin.write(CTRL_C); } catch (_) { }
            // }

            try { child.kill('SIGINT'); } catch (_) { }

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
                if (!child.isRunning(child.pid)) return;
                if (tryGroupKill('SIGTERM')) return;
                try { child.kill('SIGTERM'); } catch (_) { }

                setTimeout(() => {
                    if (!child.isRunning(child.pid)) return;
                    if (!tryGroupKill('SIGKILL')) {
                        try { child.kill('SIGKILL'); } catch (_) { }
                    }
                }, forceAfterMs);
            }, 500);
        };
        return child;
    }

    function run(cmd, args = [], opts = {}) {
        const input = opts.input || null;
        const env = Object.assign({}, process.env, opts.env || {});
        const cwd = opts.cwd || process.cwd();
        const stdio = input ? ['pipe', 'inherit', 'inherit'] : 'inherit';
        const res = spawnSync(cmd, args, { env, stdio, input, cwd });
        if (res.error) throw res.error;
        if (res.status !== 0) {
            const err = new Error(`Command failed: ${cmd} ${args.join(' ')}`);
            err.status = res.status;
            throw err;
        }
    }
    process_manager.run = run;

    function tryRun(cmd, args = [], opts = {}) {
        try {
            run(cmd, args, opts);
            return true;
        } catch (_e) {
            return false;
        }
    }
    process_manager.tryRun = tryRun;

    //graceful shutdown on exit signals
    process.on('SIGINT', () => {
        Log.out('\nReceived SIGINT — stopping child processes...');
        try { process_manager.stop(); } catch (_) { }
        setTimeout(() => {
            process.exit(130);
        }, 1000);
    });
    process.on('SIGTERM', () => {
        Log.out('\nReceived SIGTERM — stopping child processes...');
        try { process_manager.stop(); } catch (_) { }
        setTimeout(() => {
            process.exit(143);
        }, 1000);
    });


    register(null, { process_manager });
}

module.exports = plugin;