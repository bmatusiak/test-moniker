#!/usr/bin/env node
const { spawnSync } = require('child_process');

const SESSION = process.env.EXPO_TMUX_SESSION || 'expo-dev';
const CMD = process.env.EXPO_CMD || 'npx expo start --dev-client';

function usage() {
    const scriptName = require('path').basename(process.argv[1] || 'expo-dev.js');
    console.log(`Usage: ${scriptName} [--bg|-d] [--kill|-k] [--help|-h]

Env:
  EXPO_TMUX_SESSION  tmux session name (default: ${SESSION})
  EXPO_CMD           command to run (default: ${CMD})`);
}

function hasTmux() {
    const res = spawnSync('tmux', ['-V'], { stdio: 'ignore' });
    return res.status === 0;
}

function tmux(...args) {
    return spawnSync('tmux', args, { stdio: 'inherit' });
}

function hasSession(name) {
    const res = spawnSync('tmux', ['has-session', '-t', name], { stdio: 'ignore' });
    return res.status === 0;
}

function newSession(name, cmd, detached = false) {
    const args = ['new-session', detached ? '-d' : '', '-s', name, cmd].filter(Boolean);
    return tmux(...args).status === 0;
}

function attach(name) {
    return tmux('attach', '-t', name).status === 0;
}

function kill(name) {
    return tmux('kill-session', '-t', name).status === 0;
}

function main() {
    const arg = process.argv[2] || '';

    if (!hasTmux()) {
        console.error('tmux not found. Please install tmux to use this script.');
        process.exit(1);
    }

    switch (arg) {
    case '-h':
    case '--help':
        usage();
        process.exit(0);
        return;
    case '-d':
    case '--detached':
    case '--bg':
    case '--background':
        if (hasSession(SESSION)) {
            process.exit(0);
        } else {
            if (!newSession(SESSION, CMD, true)) process.exit(1);
            setTimeout(() => process.exit(0), 2000);
        }
        return;
    case '-k':
    case '--kill':
        if (hasSession(SESSION)) {
            if (!kill(SESSION)) process.exit(1);
            process.exit(0);
        } else {
            console.error(`tmux session '${SESSION}' not found.`);
            process.exit(1);
        }
        return;
    default:
        if (hasSession(SESSION)) {
            if (!attach(SESSION)) process.exit(1);
        } else {
            const ok = newSession(SESSION, CMD, false);
            if (!ok) process.exit(1);
        }
    }
}

main();