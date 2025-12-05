#!/usr/bin/env node

const dm = require('./libs/device_manager');

let passes = 0;
let failures = 0;

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failures++;
    } else {
        console.log('OK:  ', msg);
        passes++;
    }
}

function testSafeExec() {
    const r = dm.safeExec('node', ['-v']);
    assert(r && typeof r === 'object' && typeof r.status === 'number', 'safeExec returns result object with status');
}

function testListDevices() {
    const d = dm.listDevices();
    assert(Array.isArray(d), 'listDevices returns an array');
}

function runAll() {
    testSafeExec();
    testListDevices();

    console.log('---');
    console.log('Passes:', passes, 'Failures:', failures);
    process.exit(failures > 0 ? 1 : 0);
}

if (require.main === module) runAll();
