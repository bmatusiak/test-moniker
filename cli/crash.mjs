

plugin.consumes = ['Log', 'cli',];
plugin.provides = ['crash'];

function plugin(imports, register) {
    var { Log, cli } = imports;

    const crash = {};

    crash._enabled = false;
    Object.defineProperty(crash, 'enabled', {
        get: function () {
            return crash._enabled;
        },
        set: function (val) {
            crash._enabled = !!val;
        }
    });
    cli('--capture-bugreport-on-crash')
        .info('Automatically capture adb bugreport when a crash is detected')
        .flags({ pre: true })
        .do(() => {
            crash.enabled = true;
            Log.enabled = true;
        });


    register(null, { crash });
}


export default plugin;