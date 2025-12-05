
plugin.consumes = ['cli', 'workspace', 'app', 'nodejs'];
plugin.provides = ['globals'];
function plugin(imports, register) {
    const { cli, workspace, app, nodejs } = imports;
    const fs = nodejs.fs;
    const path = nodejs.path;
    const globals = {};

    // Define default global variables or settings here
    // globals.workspace = process.env.TEST_MONIKER_WORKSPACE || process.cwd();
    Object.defineProperty(globals, 'workspace', {
        get() {
            return workspace.path;
        }
    });


    globals.CI_MODE = false;
    cli('--ci')
        .info('Run in CI mode (quiet, write logs, fail-fast)')
        .flags({ pre: true })
        .do(() => { globals.CI_MODE = true; });

    globals.FORCE = false;
    cli('--force', '-f')
        .info('Force actions even if workspace validation fails')
        .flags({ pre: true })
        .do(() => { globals.FORCE = true; });

    cli('--dry-run', '-n')
        .info('Show actions without executing')
        .do(() => { globals.DRY_RUN = true; });

    // verbosity and dry-run
    cli('--verbose', '-V')
        .info('Enable verbose output')
        .flags({ pre: true })
        .do(() => { globals.VERBOSE = true; });


    app.on('pre-run', () => {
        if (!globals.FORCE) {
            const okWorkspace = fs.existsSync(path.join(globals.workspace, 'app.json')) || fs.existsSync(path.join(globals.workspace, 'package.json'));
            if (!okWorkspace) {
                err('ERROR: workspace does not contain app.json or package.json:', globals.workspace);
                err('Use --force to override.');
                process.exit(1);
            }
        }
    });

    register(null, { globals });
}

export default plugin;
