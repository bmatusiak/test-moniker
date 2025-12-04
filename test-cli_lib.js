#!/usr/bin/env node

function reloadCli(argv) {
    process.argv = ['node', 'script', ...argv];
    delete require.cache[require.resolve('./cli_lib.js')];
    return require('./cli_lib.js');
}

function reset(cli) {
    try { delete cli._registeredFlags; } catch (_) {}
    try { delete cli._aliases; } catch (_) {}
    try { delete cli._actions; } catch (_) {}
    try { delete cli._lastParsed; } catch (_) {}
}

let failures = 0;
let passes = 0;

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failures++;
    } else {
        console.log('OK:  ', msg);
        passes++;
    }
}

function testParseArgs() {
    const cli = reloadCli(['--num','1.23','--bool','true','--no-flag','-abc','--','posA','posB']);
    const parsed = cli.parseArgs();

    assert(parsed.flags.num === 1.23, 'coerces --num to Number');
    assert(parsed.flags.bool === true, 'coerces --bool to true');
    assert(parsed.flags.flag === false, 'handles --no-flag as false');
    assert(parsed.flags.a === true && parsed.flags.b === true && parsed.flags.c === true, 'grouped short flags -abc parsed');
    assert(Array.isArray(parsed.pos) && parsed.pos.length === 2 && parsed.pos[0] === 'posA', 'positional args after -- collected');
}

function testCliRunWithLong() {
    const cli = reloadCli(['--version','3']);
    reset(cli);
    let called = false;
    let got;
    cli('version').do((values) => { called = true; got = values; });
    cli.run();
    assert(called === true, 'cli action called for canonical "version"');
    assert(got && got.version === 3, 'action received coerced numeric value for version');
}

function testCliRunWithAlias() {
    const cli = reloadCli(['-v','4']);
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
    console[method] = function(...args) { out.push(args.map(a => String(a)).join(' ')); };
    return {
        restore() { console[method] = orig; },
        output: out
    };
}

function testNegativeNumbersAndDecimals() {
    const cli = reloadCli(['--val','-0.5','--dot','.5','-n','-2']);
    const parsed = cli.parseArgs();
    assert(parsed.flags.val === -0.5, 'parses -0.5 as negative decimal');
    assert(parsed.flags.dot === 0.5, 'parses .5 as decimal');
    assert(parsed.flags.n === -2, 'parses -2 as negative integer');
}

function testShortAttachedAndEquals() {
    const cli = reloadCli(['-n123','-o=value','-k=42']);
    const parsed = cli.parseArgs();
    assert(parsed.flags.n === 123, 'parses -n123 as number 123');
    assert(parsed.flags.o === 'value', 'parses -o=value as string "value"');
    assert(parsed.flags.k === 42, 'parses -k=42 as number 42');
}

function testRepeatedFlagsToArray() {
    const cli = reloadCli(['--tag','one','--tag','two','-x','1','-x','2']);
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
    const cli = reloadCli(['--unknown','x']);
    reset(cli);
    const warn = captureConsole('warn');
    try {
        cli.run();
    }catch(e){
        console.error(e);
    } finally {
        warn.restore();
    }
    assert(warn.output.some(s => s.includes('Unknown flags')), 'warns about unknown flags');
}

function testErrorRunningAction() {
    const cli = reloadCli(['--boom','1']);
    reset(cli);
    const err = captureConsole('error');
    const log = captureConsole('log');
    let ok;
    try {
        cli('boom').do(() => { throw new Error('boom!'); });
        ok = cli.run();
    } catch(e){
        console.error(e);
    }finally {
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
    }catch(e){
        console.error(e);
    } finally {
        log.restore();
    }
    assert(ok === false, 'cli.run returns false when no actions executed');
    assert(cli.used === false, 'cli.used is false when no actions ran');
}

function testLeadingZerosAndNonStandardNumbers() {
    const cli = reloadCli(['--n','01','--exp','1e3','--hex','0x10']);
    const parsed = cli.parseArgs();
    assert(parsed.flags.n === 1, 'coerces "01" to number 1');
    assert(parsed.flags.exp === '1e3', 'does not coerce scientific notation (keeps string)');
    assert(parsed.flags.hex === '0x10', 'does not coerce hex-prefixed string');
}

function testEmptyValueAfterEquals() {
    const cli = reloadCli(['--empty=','-a=']);
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
    const cli = reloadCli(['--flag','False','--flag2','TRUE']);
    const parsed = cli.parseArgs();
    assert(parsed.flags.flag === false, 'coerces "False" to false (case-insensitive)');
    assert(parsed.flags.flag2 === true, 'coerces "TRUE" to true (case-insensitive)');
}

function test_short_flag_followed_by_negative_number() {
    const cli = reloadCli(['-n','-0.5']);
    const parsed = cli.parseArgs();
    assert(parsed.flags.n === -0.5, 'short flag accepts negative decimal as next token');
}

function test_long_flag_with_negative_next_token() {
    const cli = reloadCli(['--val','-2']);
    const parsed = cli.parseArgs();
    assert(parsed.flags.val === -2, '--val -2 parsed as negative integer');
}

function test_multiple_alias_keys_for_same_canonical() {
    const cli = reloadCli(['-b','5']);
    reset(cli);
    let called = false;
    let got;
    cli({ alias: { a: 'x', b: 'x' } }, '-b', 'x').do((values) => { called = true; got = values; });
    cli.run();
    assert(called === true, 'action called when alias maps to canonical with multiple alias keys');
    assert(got && got.x === 5, 'value mapped to canonical x');
}

function test_plain_positional_and_flag_duplicate() {
    const cli = reloadCli(['cmd','--cmd','true']);
    reset(cli);
    let called = false;
    let got;
    cli('cmd').do((values) => { called = true; got = values; });
    cli.run();
    assert(called === true, 'positional canonical triggers action');
    assert(got && got.cmd === true, 'flag value wins when both pos and flag exist');
}

function test_internal_registered_flags_tracking() {
    const cli = reloadCli(['--track','1']);
    reset(cli);
    cli('track').do(() => {});
    cli.run();
    assert(cli._registeredFlags && cli._registeredFlags.has('track'), '_registeredFlags contains canonical name after run');
}

function test_non_numeric_but_digit_like_strings() {
    const cli = reloadCli(['--id','007','--code','A1']);
    const parsed = cli.parseArgs();
    assert(parsed.flags.id === 7, '"007" coerced to 7');
    assert(parsed.flags.code === 'A1', 'alphanumeric string left as string');
}

function test_flag_name_starting_with_number() {
    const cli = reloadCli(['--1flag','yes']);
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
    } catch(e){
        console.error(e);
    }finally {
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
    console.log('Running moniker/cli.js tests...');
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
    test_non_numeric_but_digit_like_strings();
    test_flag_name_starting_with_number();
    test_help();

    console.log('---');
    console.log('Passes:', passes, 'Failures:', failures);
    process.exit(failures > 0 ? 1 : 0);
}

if (require.main === module) runAll();
