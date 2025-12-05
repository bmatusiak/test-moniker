

plugin.consumes = ['cli', 'app', 'nodejs'];
plugin.provides = ['workspace'];

function plugin(imports, register) {
    const { cli, app, nodejs } = imports;
    const { fs, path } = nodejs;
    const self = this;
    self._path = (function findWorkspace() {

        // quick argv-based override: --workspace=/full/path or --workspace relative/path or -w path
        const raw = process.argv.slice(2);
        for (let i = 0; i < raw.length; i++) {
            const a = raw[i];
            if (!a) continue;
            if (a.startsWith('--workspace=')) {
                const val = a.split('=')[1];
                return path.resolve(process.cwd(), val);
            }
            if (a === '--workspace' || a === '-w') {
                const val = raw[i + 1];
                if (val) return path.resolve(process.cwd(), val);
            }
        }

        let dir = process.cwd();
        // Walk up until we find an app.json or package.json, otherwise fall back to cwd
        while (true) {
            if (fs.existsSync(path.join(dir, 'app.json')) || fs.existsSync(path.join(dir, 'package.json'))) {
                return dir;
            }
            const parent = path.dirname(dir);
            if (parent === dir) return process.cwd();
            dir = parent;
        }
    })();
    Object.defineProperty(self, 'path', {
        get() {
            return self._path;
        },
        set(newPath) {
            self._path = newPath;
        }
    });

    cli('--workspace', '-w')
        .info('Override workspace path')
        .flags({ pre: true })
        .do((values) => {
            try {
                const path = require('path');
                const v = (values && (values.workspace || values['--workspace'] || values['-w'])) || null;
                if (v && typeof v === 'string') {
                    self.path = path.resolve(process.cwd(), String(v));
                }
            } catch (_) { }
        });

    // demo flag to show the workspace value available inside handlers
    cli('--print-workspace', '-p')
        .info('Print the resolved workspace available to handlers')
        .do((values) => {
            app.services.Log.out('workspace (from handler values):', self.path);
        });

    register(null, { workspace: this });
}


module.exports = plugin;