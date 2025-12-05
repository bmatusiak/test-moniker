
const EventEmitter = require('events');
const { spawn } = require('child_process');

const loadedProcesses = {};

function process_manager(processName) {
    if(loadedProcesses[processName]){
        return loadedProcesses[processName];
    }

    /*
        var prog = process_manager('myProcess');//named process ( can be setup once and reused )
        prog.setup('node', ['myScript.js'], {cwd: '/path/to/dir'});//setup command, args and options ( required to once before start )
        prog.on('exit', (code, signal) => {
            pmOut(`Process exited with code ${code} and signal ${signal}`);
        });
        prog.on('error', (err) => {
            pmErr('Process error:', err);
        });
        prog.on('start', () => {
            pmOut('Process started');
        });
        prog.on('stdout', (data) => {
            pmOut('STDOUT:', data);
        });
        prog.on('stderr', (data) => {
            pmErr('STDERR:', data);
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
                pmOut('Process fully stopped');
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
            return  $child && $child.isRunning($child.pid) ? 'running' : 'stopped';
        },
        enumerable: true
    });
    proc.cmd = null;
    proc.args = [];
    proc.opts = {};

    function setupProcess(cmd = null, args = [], opts = {}){
        proc.cmd = cmd;
        proc.args = args;
        proc.opts = opts;
        if(!proc.cmd){
            throw new Error('Process command not set. Provide cmd argument.');
        }
    }
    proc.setup = setupProcess;
    
    function runProcess(cmd = null, args = null, opts = null){
        if(proc.status === 'running') return true;//already running
        if(cmd !== null){
            proc.cmd = cmd;
        }
        if(args !== null){
            proc.args = args;
        }
        if(opts !== null){
            proc.opts = opts;
        }
        if(!proc.cmd){
            throw new Error('Process command not set. Use setup() or provide cmd argument to start().');
        }
        $child = longRun(proc.cmd, proc.args, proc.opts);
        hookEvents();
        proc.emit('start');
    }
    proc.start = runProcess;

    function stopProcess(){
        $child?.stop();
    }
    proc.stop = stopProcess;

    function restartProcess(){
        if($child){
            stopProcess();
        }
        runProcess();
    }
    proc.restart = restartProcess;

    function hookEvents(){
        if(!$child){
            return;
        }
        $child.on('exit', (code, signal) => {
            proc.emit('close', code, signal);
        });
        $child.on('error', (err) => {
            proc.emit('error', err);
        });
        $child.stdout.on('data', data => {
            proc.emit('stdout', data);
        });
        $child.stderr.on('data', data => {
            proc.emit('stderr', data);
        });
    }
    proc.hookEvents = hookEvents;

    proc.isRunning = () => {
        return $child && $child.isRunning($child.pid);
    };
    

    return proc;
};

// small logger helpers that prefer the global MonikerLog when available
function pmOut() {
    const args = Array.prototype.slice.call(arguments).map(a => (typeof a === 'string' ? a : JSON.stringify(a)));
    const msg = args.join(' ');
    try {
        if (global && global.MonikerLog && global.MonikerLog.echo) {
            try { global.MonikerLog.echo(msg); return; } catch (_) {}
        }
    } catch (_) {}
    console.log(msg);
}
function pmErr() {
    const args = Array.prototype.slice.call(arguments).map(a => (typeof a === 'string' ? a : JSON.stringify(a)));
    const msg = args.join(' ');
    try {
        if (global && global.MonikerLog && global.MonikerLog.echo) {
            try { global.MonikerLog.echo('[ERROR] ' + msg); return; } catch (_) {}
        }
    } catch (_) {}
    console.error(msg);
}

function stopByName(name){
    if(!name) {
        process_manager.stopAll();
    } else if(loadedProcesses[name]){
        loadedProcesses[name].stop();
    }
}
process_manager.stop = stopByName;

function longRun(cmd, args = [], opts = {}) {
    const env = Object.assign({}, process.env, opts.env || {});
    const cwd = opts.cwd || process.cwd();
    // console.log(`\n$ ${[cmd, ...args].join(" ")}`);
    const child = spawn(cmd, args, { env, cwd, stdio: opts.stdio || 'inherit', detached: true });
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

        const CTRL_C = '\x03';
        if (child.stdin && !child.killed) {
            if (verbose) pmOut('Sending Ctrl+C to child stdin...');
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
            if (!child.isRunning(child.pid)) return;
            if (tryGroupKill('SIGTERM')) return;
            try { child.kill('SIGTERM'); } catch (_) {}

            setTimeout(() => {
                if (!child.isRunning(child.pid)) return;
                if (!tryGroupKill('SIGKILL')) {
                    try { child.kill('SIGKILL'); } catch (_) {}
                }
            }, forceAfterMs);
        }, 500);
    };
    return child;
}

module.exports = process_manager;