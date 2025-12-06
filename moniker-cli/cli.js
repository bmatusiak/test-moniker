plugin.consumes = ['nodejs', 'app'];
plugin.provides = ['cli'];

function plugin(imports, register) {
    const { nodejs, app } = imports;
    const { events: EventEmitter } = nodejs;
    var cliEmitter = new EventEmitter();

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
                if (cmd.length < 20) {//padd to 20 chars
                    cmd = cmd.padEnd(20);
                }
                cli._info.push(cmd + '\t\t' + text);
                return handler;
            },
            // mark this handler as a flag-style pre-run handler
            flags: (opts) => {
                handler._flags = opts || { pre: true };
                return handler;
            },
            do: (action) => {
                if (!cli._actions) cli._actions = [];
                if (!cli._flagActions) cli._flagActions = [];
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
                    // if marked as pre-run flag handler, add to _flagActions
                    if (handler._flags && handler._flags.pre) {
                        cli._flagActions.push({ fn: action, values: cloned });
                    } else {
                        cli._actions.push({ fn: action, values: cloned });
                    }
                }
                return handler;
            }
        };

        return handler;
    }
    cli.on = cliEmitter.on.bind(cliEmitter);
    cli.once = cliEmitter.once.bind(cliEmitter);
    cli.emit = cliEmitter.emit.bind(cliEmitter);
    cli.off = cliEmitter.off.bind(cliEmitter);

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
        if (!cli._helpAdded) {
            cli._helpAdded = true;
            // add help handler
            cli('--help', '-h', 'help')
                .info('Show help information')
                .do(() => {
                    var helpText = '\t' + (cli._info || []).join('\n\t');
                    console.log(`${cli.description ? cli.description + '\n' : ''}Usage: moniker [options]\n\nOptions:\n${helpText}\n`);
                });
            // add completion generator handler
            cli('completion', '--completion', '--generate-completion')
                .info('Generate shell completion script for bash/zsh/fish')
                .do((values) => {
                    try {
                        const path = nodejs.path;
                        // prefer the installed CLI name for completions; default to `test-moniker`
                        const detected = path.basename(process.argv[1]) || 'moniker';
                        const prog = 'test-moniker';
                        // build a list of known options/commands from cli._info
                        const tokens = [];
                        for (const entry of (cli._info || [])) {
                            const part = String(entry).split('\t')[0] || '';
                            for (const t of part.split(',')) {
                                const s = String(t || '').trim();
                                if (!s) continue;
                                // normalize positional names to --name for completion
                                if (!s.startsWith('-')) tokens.push('--' + s);
                                else tokens.push(s);
                            }
                        }
                        const uniq = Array.from(new Set(tokens)).join(' ');
                        const shell = values && (values.completion || values['--completion'] || values['generate-completion'] || values['--generate-completion']) || 'bash';
                        const installRequested = values && (values['install-completion'] || values['--install-completion'] || values.installCompletion || values.install);
                        if (shell === 'bash') {
                            // simpler, explicit assembly of the bash completion script
                            const lines = [];
                            lines.push('# bash completion for ' + prog);
                            lines.push('_' + prog + '_completions() {');
                            lines.push('  local cur');
                            lines.push('  cur="${COMP_WORDS[COMP_CWORD]}"');
                            lines.push('  COMPREPLY=( $(compgen -W "' + uniq + '" -- "$cur") )');
                            lines.push('}');
                            lines.push('complete -F _' + prog + '_completions ' + prog);
                            lines.push('');
                            lines.push('# npx wrapper support: if user runs "npx ' + prog + ' ..." provide completions when the second word is ' + prog);
                            lines.push('_npx_' + prog + '_completions() {');
                            lines.push('  if [ "${COMP_WORDS[1]}" = "' + prog + '" ]; then');
                            lines.push('    local cur="${COMP_WORDS[COMP_CWORD]}"');
                            lines.push('    COMPREPLY=( $(compgen -W "' + uniq + '" -- "$cur") )');
                            lines.push('  fi');
                            lines.push('}');
                            lines.push('complete -F _npx_' + prog + '_completions npx');
                            const out = lines.join('\n') + '\n';

                            // if installation requested, attempt to write into user bash-completion directory
                            try {
                                const fs = nodejs.fs;
                                const os = nodejs.os;
                                const path = nodejs.path;
                                if (installRequested) {
                                    const homedir = os.homedir();
                                    const xdg = process.env.XDG_DATA_HOME || path.join(homedir, '.local', 'share');
                                    const bashDir = path.join(xdg, 'bash-completion', 'completions');
                                    try { if (!fs.existsSync(bashDir)) fs.mkdirSync(bashDir, { recursive: true }); } catch (_) { }
                                    const dest = path.join(bashDir, prog);
                                    fs.writeFileSync(dest, out, 'utf8');
                                    console.log('Installed bash completion to', dest);
                                    return;
                                }
                            } catch (e) {
                                console.error('Failed to install completion:', e && e.message ? e.message : e);
                            }
                            console.log(out);
                        } else if (shell === 'zsh') {
                            console.log(`# zsh completion for ${prog}
_${prog}_completions() {
  reply=(${uniq})
}
compctl -K _${prog}_completions ${prog}`);
                        } else if (shell === 'fish') {
                            // fish uses a different completion mechanism; provide a simple list
                            for (const opt of uniq.split(' ')) {
                                if (!opt) continue;
                                console.log(`complete -c ${prog} -l ${opt.replace(/^--/, '')} -d "${opt}"`);
                            }
                        } else {
                            console.log('Supported shells: bash, zsh, fish');
                        }
                    } catch (e) {
                        console.error('Failed to generate completion:', e && e.message ? e.message : e);
                    }
                });
        }

        let actionsRun = false;
        const lastParsed = cli._lastParsed || parseArgs();
        const registered = cli._registeredFlags || new Set();

        const aliasKeys = new Set(Object.keys(cli._aliases || {}));
        const aliasVals = new Set(Object.values(cli._aliases || {}));
        const aliasSet = new Set([...aliasKeys, ...aliasVals]);

        // run pre-registered flag handlers first (if any)
        if (cli._flagActions && Array.isArray(cli._flagActions)) {
            for (const actionDesc of cli._flagActions) {
                const act = actionDesc && actionDesc.fn;
                const values = actionDesc && actionDesc.values;
                if (act && typeof act === 'function') {
                    try {
                        act(values);
                        actionsRun = true;
                    } catch (e) {
                        console.error('Error running flag action:', e);
                    }
                }
            }
        }

        // allow a pre-run hook (e.g., to inject mutated globals into remaining action values)
        try {
            // if (typeof cli._preRunHook === 'function') cli._preRunHook();
            app.emit('pre-run');
        } catch (e) {
            console.error('Error in pre-run hook:', e);
        }

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

    cli('--version', '-v', 'version')
        .info('Show the version number')
        .do(() => {
            var packageJson = require('../package.json');
            console.log(`v${packageJson.version}`);
        });

    app.on('ready', () => {
        // auto-run CLI on app ready
        cli._preRunHook = function () {
            this.emit('pre-run');
        };
        const ok = cli.run();
        if (!ok) {
            try {
                app.services.Log.out('No actions run.');
            } catch (_) { console.log('No actions run.'); }
        }
    });

    register(null, { cli });
}

module.exports = plugin;

plugin.test = function (assert, loadPlugin) {
    function reloadCli(argv) {
        process.argv = ['node', 'script', ...argv];
        return loadPlugin('cli')
    }

    function reset(cli) {
        try { delete cli._registeredFlags; } catch (_) { }
        try { delete cli._aliases; } catch (_) { }
        try { delete cli._actions; } catch (_) { }
        try { delete cli._lastParsed; } catch (_) { }
    }


    function testParseArgs() {
        const cli = reloadCli(['--num', '1.23', '--bool', 'true', '--no-flag', '-abc', '--', 'posA', 'posB']);
        const parsed = cli.parseArgs();

        assert(parsed.flags.num === 1.23, 'coerces --num to Number');
        assert(parsed.flags.bool === true, 'coerces --bool to true');
        assert(parsed.flags.flag === false, 'handles --no-flag as false');
        assert(parsed.flags.a === true && parsed.flags.b === true && parsed.flags.c === true, 'grouped short flags -abc parsed');
        assert(Array.isArray(parsed.pos) && parsed.pos.length === 2 && parsed.pos[0] === 'posA', 'positional args after -- collected');
    }

    function testCliRunWithLong() {
        const cli = reloadCli(['--version', '3']);
        reset(cli);
        let called = false;
        let got;
        cli('version').do((values) => { called = true; got = values; });
        cli.run();
        assert(called === true, 'cli action called for canonical "version"');
        assert(got && got.version === 3, 'action received coerced numeric value for version');
    }

    function testCliRunWithAlias() {
        const cli = reloadCli(['-v', '4']);
        reset(cli);
        let called = false;
        let got;
        cli({ alias: { v: 'version' } }, '-v', 'version').do((values) => { called = true; got = values; });
        cli.run();
        assert(called === true, 'cli action called for aliased -v');
        assert(got && got.version === 4, 'alias mapping provided numeric value');
    }

    function captureConsole(method) {
        const orig = console[method];
        const out = [];
        console[method] = function (...args) { out.push(args.map(a => String(a)).join(' ')); };
        return {
            restore() { console[method] = orig; },
            output: out
        };
    }

    function testNegativeNumbersAndDecimals() {
        const cli = reloadCli(['--val', '-0.5', '--dot', '.5', '-n', '-2']);
        const parsed = cli.parseArgs();
        assert(parsed.flags.val === -0.5, 'parses -0.5 as negative decimal');
        assert(parsed.flags.dot === 0.5, 'parses .5 as decimal');
        assert(parsed.flags.n === -2, 'parses -2 as negative integer');
    }

    function testShortAttachedAndEquals() {
        const cli = reloadCli(['-n123', '-o=value', '-k=42']);
        const parsed = cli.parseArgs();
        assert(parsed.flags.n === 123, 'parses -n123 as number 123');
        assert(parsed.flags.o === 'value', 'parses -o=value as string "value"');
        assert(parsed.flags.k === 42, 'parses -k=42 as number 42');
    }

    function testRepeatedFlagsToArray() {
        const cli = reloadCli(['--tag', 'one', '--tag', 'two', '-x', '1', '-x', '2']);
        const parsed = cli.parseArgs();
        assert(Array.isArray(parsed.flags.tag) && parsed.flags.tag.length === 2 && parsed.flags.tag[0] === 'one', 'repeated --tag becomes array');
        assert(Array.isArray(parsed.flags.x) && parsed.flags.x.length === 2 && parsed.flags.x[1] === 2, 'repeated -x becomes numeric array');
    }

    function testDoubleDashPositions() {
        const cli = reloadCli(['--', '-notAFlag', 'pos2']);
        const parsed = cli.parseArgs();
        assert(Array.isArray(parsed.pos) && parsed.pos.length === 2 && parsed.pos[0] === '-notAFlag', 'double-dash preserves following tokens as pos');
    }

    function testUnknownFlagsWarning() {
        const cli = reloadCli(['--unknown', 'x']);
        reset(cli);
        const warn = captureConsole('warn');
        try {
            cli.run();
        } catch (e) {
            console.error(e);
        } finally {
            warn.restore();
        }
        assert(warn.output.some(s => s.includes('Unknown flags')), 'warns about unknown flags');
    }

    function testErrorRunningAction() {
        const cli = reloadCli(['--boom', '1']);
        reset(cli);
        const err = captureConsole('error');
        const log = captureConsole('log');
        let ok;
        try {
            cli('boom').do(() => { throw new Error('boom!'); });
            ok = cli.run();
        } catch (e) {
            console.error(e);
        } finally {
            err.restore();
            log.restore();
        }
        assert(err.output.some(s => s.includes('Error running action')), 'logs error when action throws');
        assert(!log.output.some(s => s.includes('No actions run.')), 'does not print No actions run when actions existed but failed');
        assert(ok === false, 'cli.run returned false when action threw');
    }

    function testNoActionsRun() {
        const cli = reloadCli([]);
        reset(cli);
        const log = captureConsole('log');
        let ok;
        try {
            ok = cli.run();
        } catch (e) {
            console.error(e);
        } finally {
            log.restore();
        }
        assert(ok === false, 'cli.run returns false when no actions executed');
        assert(cli.used === false, 'cli.used is false when no actions ran');
    }

    function testLeadingZerosAndNonStandardNumbers() {
        const cli = reloadCli(['--n', '01', '--exp', '1e3', '--hex', '0x10']);
        const parsed = cli.parseArgs();
        assert(parsed.flags.n === 1, 'coerces "01" to number 1');
        assert(parsed.flags.exp === '1e3', 'does not coerce scientific notation (keeps string)');
        assert(parsed.flags.hex === '0x10', 'does not coerce hex-prefixed string');
    }

    function testEmptyValueAfterEquals() {
        const cli = reloadCli(['--empty=', '-a=']);
        const parsed = cli.parseArgs();
        assert(parsed.flags.empty === '', 'handles --key= with empty string');
        assert(parsed.flags.a === '', 'handles -a= with empty string');
    }

    function test_grouped_with_attached_nonalpha() {
        const cli = reloadCli(['-a1b']);
        const parsed = cli.parseArgs();
        assert(parsed.flags.a === '1b', 'attached non-alpha after short flag becomes value');
    }

    function test_flag_case_insensitive_boolean() {
        const cli = reloadCli(['--flag', 'False', '--flag2', 'TRUE']);
        const parsed = cli.parseArgs();
        assert(parsed.flags.flag === false, 'coerces "False" to false (case-insensitive)');
        assert(parsed.flags.flag2 === true, 'coerces "TRUE" to true (case-insensitive)');
    }

    function test_short_flag_followed_by_negative_number() {
        const cli = reloadCli(['-n', '-0.5']);
        const parsed = cli.parseArgs();
        assert(parsed.flags.n === -0.5, 'short flag accepts negative decimal as next token');
    }

    function test_long_flag_with_negative_next_token() {
        const cli = reloadCli(['--val', '-2']);
        const parsed = cli.parseArgs();
        assert(parsed.flags.val === -2, '--val -2 parsed as negative integer');
    }

    function test_multiple_alias_keys_for_same_canonical() {
        const cli = reloadCli(['-b', '5']);
        reset(cli);
        let called = false;
        let got;
        cli({ alias: { a: 'x', b: 'x' } }, '-b', 'x').do((values) => { called = true; got = values; });
        cli.run();
        assert(called === true, 'action called when alias maps to canonical with multiple alias keys');
        assert(got && got.x === 5, 'value mapped to canonical x');
    }

    function test_plain_positional_and_flag_duplicate() {
        const cli = reloadCli(['cmd', '--cmd', 'true']);
        reset(cli);
        let called = false;
        let got;
        cli('cmd').do((values) => { called = true; got = values; });
        cli.run();
        assert(called === true, 'positional canonical triggers action');
        assert(got && got.cmd === true, 'flag value wins when both pos and flag exist');
    }

    function test_internal_registered_flags_tracking() {
        const cli = reloadCli(['--track', '1']);
        reset(cli);
        cli('track').do(() => { });
        cli.run();
        assert(cli._registeredFlags && cli._registeredFlags.has('track'), '_registeredFlags contains canonical name after run');
    }

    function test_pre_run_flag_executes_before_actions() {
        const cli = reloadCli(['--preflag', '--after']);
        reset(cli);
        let preRan = false;
        let seenInAction = false;
        cli('--preflag').flags({ pre: true }).do(() => { preRan = true; });
        cli('after').do(() => { seenInAction = preRan; });
        cli.run();
        assert(preRan === true, 'pre-run flag handler executed');
        assert(seenInAction === true, 'normal action observed pre-run changes');
    }

    function test_non_numeric_but_digit_like_strings() {
        const cli = reloadCli(['--id', '007', '--code', 'A1']);
        const parsed = cli.parseArgs();
        assert(parsed.flags.id === 7, '"007" coerced to 7');
        assert(parsed.flags.code === 'A1', 'alphanumeric string left as string');
    }

    function test_flag_name_starting_with_number() {
        const cli = reloadCli(['--1flag', 'yes']);
        const parsed = cli.parseArgs();
        assert(parsed.flags['1flag'] === 'yes', 'flag names may start with digits');
    }


    function test_help() {
        const cli = reloadCli(['-h']);
        const warn = captureConsole('warn');
        const log = captureConsole('log');
        let ok;
        try {
            ok = cli.run();
        } catch (e) {
            console.error(e);
        } finally {
            warn.restore();
            log.restore();
        }
        assert(!warn.output.some(s => s.includes('Unknown flags')), 'does not warn about unknown flags for -h');
        assert(log.output.join('\n').length > 0, 'has console output for help');
        assert(cli.used === true, 'cli.used is true when help action runs');
        assert(ok === true, 'cli.run returns true when help action runs');
        console.log();
    }

    function runAll() {
        testParseArgs();
        testCliRunWithLong();
        testCliRunWithAlias();
        testNegativeNumbersAndDecimals();
        testShortAttachedAndEquals();
        testRepeatedFlagsToArray();
        testDoubleDashPositions();
        testUnknownFlagsWarning();
        testErrorRunningAction();
        testNoActionsRun();
        testLeadingZerosAndNonStandardNumbers();
        testEmptyValueAfterEquals();
        test_grouped_with_attached_nonalpha();
        test_flag_case_insensitive_boolean();
        test_short_flag_followed_by_negative_number();
        test_long_flag_with_negative_next_token();
        test_multiple_alias_keys_for_same_canonical();
        test_plain_positional_and_flag_duplicate();
        test_internal_registered_flags_tracking();
        test_pre_run_flag_executes_before_actions();
        test_non_numeric_but_digit_like_strings();
        test_flag_name_starting_with_number();
        test_help();
    }

    runAll();

}