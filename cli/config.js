

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
    const tryConfigs = [];
    if (_CONFIG_PATH) tryConfigs.push(path.resolve(process.cwd(), _CONFIG_PATH));
    tryConfigs.push(path.join(workspace.path, 'moniker.config.json'));
    tryConfigs.push(path.join(workspace.path, '.monikerrc'));
    for (const p of tryConfigs) {
        try {
            if (p && fs.existsSync(p)) {
                const raw = fs.readFileSync(p, 'utf8');
                _CONFIG = JSON.parse(raw);
                break;
            }
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


    register(null, { config: { get: () => _CONFIG } });
}


export default plugin;