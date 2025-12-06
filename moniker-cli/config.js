

plugin.consumes = ['cli', 'workspace', 'nodejs'];
plugin.provides = ['config'];

function plugin(imports, register) {
    const { cli, workspace, nodejs } = imports;
    const fs = nodejs.fs;
    const path = nodejs.path;

    let _CONFIG_PATH = null;
    let _CONFIG = null;
    const config = {};

    Object.defineProperty(workspace, 'config', {
        get: function () {
            return _CONFIG;
        }
    });

    // Load config file (if provided or available in workspace)
    // Prefer a JS config file `moniker.config.js` so users can export functions/values.
    const tryConfigs = [];
    if (_CONFIG_PATH) tryConfigs.push(path.resolve(process.cwd(), _CONFIG_PATH));
    tryConfigs.push(path.join(workspace.path, 'moniker.config.js'));
    tryConfigs.push(path.join(workspace.path, 'moniker.config.json'));
    tryConfigs.push(path.join(workspace.path, '.monikerrc'));
    for (const p of tryConfigs) {
        try {
            if (!p) continue;
            if (!fs.existsSync(p)) continue;
            if (p.match(/\.js$/i)) {
                try {
                    // require the JS module (it should export an object)
                    _CONFIG = require(p);
                } catch (_) { _CONFIG = null; }
            } else {
                const raw = fs.readFileSync(p, 'utf8');
                try { _CONFIG = JSON.parse(raw); } catch (_) { _CONFIG = null; }
            }
            if (_CONFIG) break;
        } catch (_) { }
    }


    cli('--config')
        .info('Path to moniker config file (relative to workspace)')
        .flags({ pre: true })
        .do((values) => {
            try {
                const v = values && (values.config || values['--config']);
                if (v) _CONFIG_PATH = String(v);
            } catch (_) { }
        });

    // Add a helper to create a default `moniker.config.js` in the current working directory.
    cli('--init-config')
        .info('Create a default moniker.config.js in the current working directory')
        .flags({ pre: true })
        .do(() => {
            try {
                const dest = path.resolve(process.cwd(), 'moniker.config.js');
                if (fs.existsSync(dest)) {
                    console.log('moniker.config.js already exists at ' + dest);
                    return;
                }
                const template = `// moniker configuration\nmodule.exports = {\n  // Example: enable capturing bugreports on crash by default\n  // captureOnCrash: false,\n  // noisyTags: ['hwcomposer', 'SurfaceFlinger']\n};\n`;
                fs.writeFileSync(dest, template, 'utf8');
                console.log('Wrote default moniker.config.js to', dest);
            } catch (e) {
                console.error('Failed to create moniker.config.js:', e && e.message ? e.message : e);
            }
        });


    register(null, { config: { get: () => _CONFIG } });
}



module.exports = plugin;