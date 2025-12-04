


function cli(...callArgs) {
    callArgs = Array.from(callArgs);
    let options = {};
    if (callArgs[0] && typeof callArgs[0] === 'object' && !Array.isArray(callArgs[0])) {
        options = callArgs.shift();
    }

    const parsedArgs = parseArgs();
    // keep last parsed for unknown-flag warnings
    cli._lastParsed = parsedArgs;

    if (!cli._registeredFlags) cli._registeredFlags = new Set();
    if (!cli._aliases) cli._aliases = {};

    // normalize and merge any explicit alias mappings into cli._aliases (global)
    function normalizeAliasMap(map) {
        const out = {};
        for (const k of Object.keys(map || {})) {
            const rawKey = String(k).replace(/^--?/, '');
            const rawVal = String(map[k]).replace(/^--?/, '');
            out[rawKey] = rawVal;
        }
        return out;
    }
    if (options.alias) {
        const norm = normalizeAliasMap(options.alias);
        for (const k of Object.keys(norm)) {
            cli._aliases[k] = norm[k];
        }
    }

    const values = { _raw: {} };
    let thisCli = false;

    const args = callArgs;

    // determine canonical name for this group of args
    const strs = args.filter(a => typeof a === 'string');
    const plain = strs.find(s => !s.startsWith('-'));
    const long = strs.find(s => s.startsWith('--'));
    const short = strs.find(s => s.startsWith('-') && !s.startsWith('--'));

    // canonical resolution: prefer plain, then long, then short mapped via aliases, else short raw
    let canonical = null;
    if (plain) canonical = plain;
    else if (long) canonical = long.slice(2);
    else if (short) {
        const shortKey = short.slice(1);
        canonical = cli._aliases[shortKey] || shortKey;
    }

    // if we've determined a canonical name for this handler, register the
    // provided short/long forms in the global alias map so unknown-flag
    // detection recognizes them (e.g. '-h' -> 'help').
    if (canonical) {
        if (short) {
            cli._aliases[short.slice(1)] = canonical;
        }
        if (long) {
            cli._aliases[long.slice(2)] = canonical;
        }
    }

    // helper to record a found flag under canonical name and raw names
    function recordFound(rawName, val) {
        if (canonical) {
            values[canonical] = val;
            values._raw[rawName] = val;
            // also map raw forms for convenience
            if (rawName.length === 1) values['-' + rawName] = val;
            else values['--' + rawName] = val;
            cli._registeredFlags.add(canonical);
        } else {
            // fallback: record under the raw name
            values[rawName] = val;
            values._raw[rawName] = val;
            cli._registeredFlags.add(rawName);
        }
    }

    // helper: find alias key(s) that map to a given canonical value
    function aliasKeysForCanonical(canon) {
        return Object.keys(cli._aliases).filter(k => cli._aliases[k] === canon);
    }

    // check long flag
    if (long) {
        const key = long.slice(2);
        if (key in parsedArgs.flags) {
            thisCli = true;
            recordFound(key, parsedArgs.flags[key]);
        } else {
            const aliasToKeys = aliasKeysForCanonical(key);
            const foundAlias = aliasToKeys.find(a => a in parsedArgs.flags);
            if (foundAlias) {
                thisCli = true;
                recordFound(foundAlias, parsedArgs.flags[foundAlias]);
            }
        }
    }

    // check short flag(s)
    if (short) {
        const key = short.slice(1);
        if (key in parsedArgs.flags) {
            thisCli = true;
            recordFound(key, parsedArgs.flags[key]);
        } else {
            const mapped = cli._aliases[key];
            if (mapped && mapped in parsedArgs.flags) {
                thisCli = true;
                recordFound(mapped, parsedArgs.flags[mapped]);
            }
        }
    }

    // if a plain positional canonical was provided, check parsed pos
    if (plain) {
        for (const p of parsedArgs.pos) {
            if (p === plain) {
                thisCli = true;
                values[plain] = true;
                values._raw[plain] = true;
                cli._registeredFlags.add(plain);
            }
        }
    }

    // also support passing canonical only (e.g., cli('version'))
    if (!long && !short && plain && (plain in parsedArgs.flags)) {
        thisCli = true;
        recordFound(plain, parsedArgs.flags[plain]);
    }

    const handler = {
        info: (text) => {
            let cmd = callArgs.join(',');
            if(cmd.length < 20) {//padd to 20 chars
                cmd = cmd.padEnd(20);
            }
            cli._info.push(cmd + '\t\t' + text);
            return handler;
        },
        do: (action) => {
            if (!cli._actions) cli._actions = [];
            if (thisCli) {
                // deep-clone values to decouple future modifications
                let cloned;
                try {
                    cloned = JSON.parse(JSON.stringify(values));
                } catch (_e) {
                    // fallback to shallow clone
                    cloned = Object.assign({}, values);
                    cloned._raw = Object.assign({}, values._raw || {});
                }
                cli._actions.push({ fn: action, values: cloned });
            }
            return handler;
        }
    };

    return handler;
}

function parseArgs() {
    const raw = process.argv.slice(2);
    const parsed = { flags: {}, pos: [] };
    // allow negative decimals like -0.5
    const isNegativeNumber = (s) => /^-(?:\d+|\d*\.\d+)$/.test(String(s));

    function coerceVal(v) {
        if (v === true || v === false) return v;
        if (typeof v !== 'string') return v;
        if (/^(?:true|false)$/i.test(v)) return v.toLowerCase() === 'true';
        // accept -0.5, .5, 1.23, -2 etc.
        if (/^-?(?:\d+|\d*\.\d+)$/.test(v)) return Number(v);
        return v;
    }

    function setFlag(key, val) {
        if (key in parsed.flags) {
            const cur = parsed.flags[key];
            if (Array.isArray(cur)) cur.push(val);
            else parsed.flags[key] = [cur, val];
        } else {
            parsed.flags[key] = val;
        }
    }

    for (let i = 0; i < raw.length; i++) {
        const a = raw[i];
        if (!a) continue;

        if (a === '--') {
            parsed.pos.push(...raw.slice(i + 1));
            break;
        }

        if (a.startsWith('--')) {
            if (a.startsWith('--no-')) {
                const key = a.slice(5);
                setFlag(key, false);
                continue;
            }
            const eq = a.indexOf('=');
            if (eq !== -1) {
                const key = a.slice(2, eq);
                const val = a.slice(eq + 1);
                setFlag(key, coerceVal(val));
            } else {
                const key = a.slice(2);
                const next = raw[i + 1];
                if (next !== undefined && (!String(next).startsWith('-') || isNegativeNumber(next))) {
                    setFlag(key, coerceVal(next));
                    i++;
                } else {
                    setFlag(key, true);
                }
            }
        } else if (a.startsWith('-') && a.length > 1) {
            // handle -k=val
            const eq = a.indexOf('=');
            if (eq !== -1 && a.length >= 3) {
                const key = a[1];
                const val = a.slice(eq + 1);
                setFlag(key, coerceVal(val));
                continue;
            }

            // single short flag with possible separate value: "-o value"
            if (a.length === 2) {
                const ch = a[1];
                const next = raw[i + 1];
                if (next !== undefined && (!String(next).startsWith('-') || isNegativeNumber(next))) {
                    setFlag(ch, coerceVal(next));
                    i++;
                } else {
                    setFlag(ch, true);
                }
            } else {
                // either grouped short flags: -abc -> a=true,b=true,c=true
                // or attached short value: -ovalue -> o='value'
                const rest = a.slice(2);
                if (/^[A-Za-z]+$/.test(rest)) {
                    for (let j = 1; j < a.length; j++) {
                        const ch = a[j];
                        setFlag(ch, true);
                    }
                } else {
                    const ch = a[1];
                    setFlag(ch, coerceVal(rest));
                }
            }
        } else {
            parsed.pos.push(a);
        }
    }

    return parsed;
}

// expose parseArgs for tests
cli.parseArgs = parseArgs;

if (!cli._info) cli._info = [];

// run actions (exposed as cli.run), but before that warn about unknown flags
cli.run = function runActions() {
    if(!cli._helpAdded) {
        cli('--help','-h','help')
            .info('Show help information')
            .do(() => {
                var helpText = '\t'+(cli._info || []).join('\n\t');
                console.log(`${cli.description ? cli.description + '\n' : ''}Usage: moniker [options]\n\nOptions:\n${helpText}`);
            });
        cli._helpAdded = true;
    }
    
    let actionsRun = false;
    const lastParsed = cli._lastParsed || parseArgs();
    const registered = cli._registeredFlags || new Set();

    const aliasKeys = new Set(Object.keys(cli._aliases || {}));
    const aliasVals = new Set(Object.values(cli._aliases || {}));
    const aliasSet = new Set([...aliasKeys, ...aliasVals]);

    const unknown = Object.keys(lastParsed.flags).filter(k => !registered.has(k) && !aliasSet.has(k));
    if (unknown.length > 0) {
        console.warn('Unknown flags:', unknown.join(', '));
    }

    if (cli._actions) {
        for (const actionDesc of cli._actions) {
            const act = actionDesc && actionDesc.fn;
            const values = actionDesc && actionDesc.values;
            if (act && typeof act === 'function') {
                try {
                    act(values);
                    actionsRun = true;
                } catch (e) {
                    console.error('Error running action:', e);
                }
            }
        }
    }

    // mark whether any action actually ran
    cli.used = !!actionsRun;
    return actionsRun;
};

cli('--version','-v','version')
    .info('Show the version number')
    .do(() => {
        var packageJson = require('./package.json');
        console.log(`v${packageJson.version}`);
    });

// export the cli function for requiring
module.exports = cli;