

plugin.consumes = ['Log', 'cli',];
plugin.provides = ['crash'];

function plugin(imports, register) {
    var { Log, cli } = imports;

    const crash = {};

    crash._enabled_capture = false;
    Object.defineProperty(crash, 'capture_enabled', {
        get: function () {
            return crash._enabled_capture;
        },
        set: function (val) {
            crash._enabled_capture = !!val;
        }
    });

    cli('--capture-bugreport-on-crash')
        .info('Automatically capture adb bugreport when a crash is detected')
        .flags({ pre: true })
        .do(() => {
            crash.capture_enabled = true;
        });


    register(null, { crash });
}


module.exports = plugin;