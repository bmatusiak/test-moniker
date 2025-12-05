

plugin.consumes = [];
plugin.provides = ['log'];

function plugin( imports, register) {
    var {  } = imports;
    
    var fs = require('fs');
    var path = require('path');
    const EventEmitter = require('events');
    
    module.exports = function log_manager(workspace){
    
        return function(logTag = 'moniker-log', json = false) {
    
    
            const Log = new EventEmitter();
            Log.path = 'logs/' + logTag + '-' + Date.now() + '.txt';
            Log.data = [];
            Log.echo = function(line, json = false) {
                if(!json){
                    process.stdout.write(line + '\n');
                    return;
                }
                // write as JSON log entry
                const logEntry = { ts: new Date().toISOString(), msg: line };
                const jsonLine = JSON.stringify(logEntry);
                process.stdout.write(jsonLine + '\n');
            };
            Log.enabled = false;
            Log.append = function() {
                if (!Log.enabled) return;
                try {
                    // ensure directory exists
                    var outputPath = workspace + '/' + Log.path;
                    var dir = path.dirname(outputPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    // prefix with ISO timestamp for easier searching
                    const args = Array.from(arguments).map(a => (typeof a === 'string' ? a : JSON.stringify(a)));
                    const ts = new Date().toISOString();
                    // also write JSON log entry when requested
                    try {
                        if (json) {
                            const jsonLine = JSON.stringify({ ts: ts, msg: args.join('') });
                            fs.appendFileSync(outputPath, jsonLine + '\n', 'utf8');
                        }else{
                            fs.appendFileSync(outputPath, ts + ' ' + args.join('') + '\n', 'utf8');
                        }
                    } catch (_) {}
                } catch (_) {
                    // swallow logging errors to avoid crashing CLI
                }
            };
    
    
            return Log;
        };
    };
    register(null, { log: {} });
}


module.exports = plugin;
