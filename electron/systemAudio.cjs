// Linux: the computer's own sound straight from PulseAudio or PipeWire.
//
// Chromium's loopback for screen sharing needs a screen capture first, which on Wayland
// goes through the desktop portal (a dialog, or nothing at all), and Chromium leaves the
// "Monitor of …" sources out of the audio inputs. So the app records the monitor of the
// default output itself, with parec (PulseAudio and pipewire-pulse) or pw-record (plain
// PipeWire), and streams the samples to the page: mono float32 at the page's sample rate.
//
// When the default output changes (headphones, HDMI) the page is told the stream ended
// and starts it again, the same way the Windows loopback reconnects.

const { spawn } = require('node:child_process');

const TOOLS = [
  {
    cmd: 'parec',
    label: 'PulseAudio',
    args: (rate) => ['--device=@DEFAULT_MONITOR@', '--format=float32le', `--rate=${rate}`, '--channels=1',
      '--latency-msec=20', '--client-name=VibSync', '--stream-name=Visualizer'],
    // parec stays on the monitor it opened, so watch for a new default output.
    watch: ['pactl', ['subscribe']],
  },
  {
    cmd: 'pw-record',
    label: 'PipeWire',
    // stream.capture.sink: record what the default output plays; PipeWire follows a new default.
    args: (rate) => ['-P', '{ stream.capture.sink = true node.name = VibSync }', '--format=f32', `--rate=${rate}`,
      '--channels=1', '--latency=20ms', '-'],
  },
];

// A tool that is still running after this long has found its device.
const SETTLE_MS = 700;

function createSystemAudio({ tools = TOOLS, settleMs = SETTLE_MS } = {}) {
  let proc = null, watcher = null, sink = null, rest = null;
  let gen = 0, watchTimer = 0;

  function send(channel, data) {
    if (sink && !sink.isDestroyed()) sink.send(channel, data);
  }

  function kill(p) {
    if (!p) return;
    p.removeAllListeners();
    p.stdout?.removeAllListeners();
    p.stderr?.removeAllListeners();
    p.on('error', () => {});
    p.kill();
  }

  function stop() {
    gen += 1;
    clearTimeout(watchTimer);
    kill(proc); proc = null;
    kill(watcher); watcher = null;
    rest = null;
  }

  // Float32 samples may be split across chunks: only whole samples go to the page.
  function forward(buf) {
    if (rest) { buf = Buffer.concat([rest, buf]); rest = null; }
    const whole = buf.length - (buf.length % 4);
    if (whole < buf.length) rest = Buffer.from(buf.subarray(whole));
    if (whole > 0) send('vibsync:sysaudio-data', buf.subarray(0, whole));
  }

  function tryTool(tool, rate, my) {
    return new Promise((resolve) => {
      let p, err = '';
      try {
        p = spawn(tool.cmd, tool.args(rate), { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        resolve({ error: `${tool.cmd}: ${e.message}` });
        return;
      }
      const fail = (msg) => { clearTimeout(timer); kill(p); resolve({ error: `${tool.cmd}: ${msg}` }); };
      const timer = setTimeout(() => {
        p.removeAllListeners('exit');
        p.removeAllListeners('error');
        resolve({ proc: p });
      }, settleMs);
      p.stderr.on('data', (d) => { err = (err + d).slice(-300); });
      p.stdout.on('data', (d) => { if (my === gen) forward(d); });
      p.on('error', (e) => fail(e.code === 'ENOENT' ? 'nicht installiert' : e.message));
      p.on('exit', (code) => fail(err.trim() || `beendet (${code})`));
    });
  }

  function ended(my) {
    if (my !== gen) return;
    stop();
    send('vibsync:sysaudio-ended');
  }

  function watch(tool, my) {
    if (!tool.watch) return;
    let w;
    try { w = spawn(tool.watch[0], tool.watch[1], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return; }
    w.on('error', () => {});
    w.stdout.on('data', (d) => {
      // "Event 'change' on server": the default output or input changed.
      if (my !== gen || !/'change' on server/.test(String(d))) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => ended(my), 300);
    });
    watcher = w;
  }

  async function start(webContents, rate) {
    stop();
    const my = gen;
    sink = webContents;
    const errors = [];
    for (const tool of tools) {
      const r = await tryTool(tool, rate, my);
      if (my !== gen) { kill(r.proc); return { error: 'abgebrochen' }; }
      if (r.error) { errors.push(r.error); continue; }
      proc = r.proc;
      proc.on('error', () => ended(my));
      proc.on('exit', () => ended(my));
      watch(tool, my);
      return { ok: true, label: tool.label };
    }
    return { error: errors.join('; ') };
  }

  return { start, stop, running: () => !!proc };
}

module.exports = { createSystemAudio };
