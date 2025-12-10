plugin.consumes = ['nodejs', 'workspace', 'cli', 'app'];
plugin.provides = ['Log'];

function plugin(imports, register) {
    var { nodejs, workspace, cli, app } = imports;
    const { fs, path, events: EventEmitter } = nodejs;

    const Log = new EventEmitter();
    Log._logTag = 'moniker-log';
    Log._json = false;
    Log._write_enabled = true;
    Log._out_enabled = true;
    Log._err_enabled = true;
    Log._verbose = false;
    Log._log_level = 1;// 1=info 2=verbose 3=debug
    Log.path = 'logs/' + Log._logTag + '-' + Date.now() + '.txt';
    Log._echo = function (line, error = false, append = false) {
        if (append) Log._append(line);
        if (!Log._json) {
            if (error) {
                process.stderr.write(line + '\n');
            } else {
                process.stdout.write(line + '\n');
            }
            return;
        }
        // write as JSON log entry
        const logEntry = { ts: new Date().toISOString(), msg: line };
        const jsonLine = JSON.stringify(logEntry);
        if (error) {
            process.stderr.write(jsonLine + '\n');
        } else {
            process.stdout.write(jsonLine + '\n');
        }
    };
    Log._append = function (line) {
        if (!Log._write_enabled) return;
        try {
            // ensure directory exists
            var outputPath = workspace.path + '/' + Log.path;
            var dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // prefix with ISO timestamp for easier searching
            const ts = new Date().toISOString();
            // also write JSON log entry when requested
            try {
                if (Log._json) {
                    const jsonLine = JSON.stringify({ ts: ts, msg: line });
                    fs.appendFileSync(outputPath, jsonLine + '\n', 'utf8');
                } else {
                    fs.appendFileSync(outputPath, ts + ' ' + line + '\n', 'utf8');
                }
            } catch (_) { }
        } catch (_) {
            // swallow logging errors to avoid crashing CLI
        }
    };

    Log.out = function out() {
        if (!Log._out_enabled) return;
        const args = Array.prototype.slice.call(arguments).map(a => (typeof a === 'string' ? a : JSON.stringify(a)));
        const msg = args.join(' ');
        try {
            Log._echo(msg, false, true);
            return;
        } catch (_) { console.log(_) }
        console.log(msg);
    };
    Log.err = function err() {
        if (!Log._err_enabled) return;
        const args = Array.prototype.slice.call(arguments).map(a => (typeof a === 'string' ? a : JSON.stringify(a)));
        const msg = args.join(' ');
        try {
            Log._echo('[ERROR] ' + (msg.message || msg), true, true);
            return;
        } catch (_) { }
        console.error(msg);
    };
    Log.info = function (tag, msg) {
        if (!Log._write_enabled) return;
        const line = `[${tag}] ${msg}`;
        try {
            Log.out(line);
            return;
        } catch (_) { }
        console.log(line);
    };

    Object.defineProperty(Log, 'enabled', {
        get: function () {
            return Log._write_enabled;
        },
        set: function (val) {
            Log._write_enabled = !!val;
        }
    });
    Object.defineProperty(Log, 'silent', {
        get: function () {
            return !Log._out_enabled && !Log._err_enabled;
        },
        set: function (val) {
            const silent = !!val;
            Log._out_enabled = !silent;
            Log._err_enabled = !silent;
        }
    });
    Object.defineProperty(Log, 'verbose', {
        get: function () {
            return Log._verbose;
        },
        set: function (val) {
            Log._verbose = !!val;
        }
    });
    Object.defineProperty(Log, 'json', {
        get: function () {
            return Log._json;
        }
    });


    // register a generic json flag for commands that support JSON output
    cli('--json', '--json-log', '-j')
        .flags({ pre: true })
        .info('Output JSON from commands')
        .do(() => {
            Log._json = true;
        });

    cli('--no-log')
        .info('Disable Log Output')
        .flags({ pre: true })
        .do((values) => {
            Log.path = typeof values.log === 'string' ? values.log : Log.path;
            Log.enabled = false;
        });

    cli('--log')
        .info('Specify Log Output name')
        .flags({ pre: true })
        .do((values) => {
            Log.path = 'logs/' + (typeof values.log === 'string' ? values.log : Log.path);
        });

    cli('--silent')
        .info('Log Output to moniker-logs.txt')
        .flags({ pre: true })
        .do(() => {
            Log.silent = true;
        });

    // verbosity and dry-run
    cli('--verbose', '-V')
        .info('Enable verbose output')
        .flags({ pre: true })
        .do(() => { Log.verbose = true; Log.enabled = true; });

    app.on('pre-run', () => {
        try { global.MonikerLog = Log; } catch (_) { }
    });

    register(null, { Log });
}

module.exports = plugin;