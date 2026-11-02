// Linux desktop sound (electron/systemAudio.cjs) with stand-in recorders: falls back
// through the tools, reports why each failed, passes whole float32 samples on even when
// the recorder splits them, and tells the page when the stream ends.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { createSystemAudio } = require('../electron/systemAudio.cjs');

const node = (code) => ({ cmd: process.execPath, args: () => ['-e', code] });
const missing = { cmd: 'vibsync-no-such-recorder', label: 'Fehlt', args: () => [] };
const broken = { ...node("process.stderr.write('Verbindung abgelehnt'); process.exit(1)"), label: 'Kaputt' };

// Writes 1..8 as float32, cut into chunks of 3 bytes, then keeps running.
const SPLIT = `
const b = Buffer.alloc(32); for (let i = 0; i < 8; i++) b.writeFloatLE(i + 1, i * 4);
let o = 0; const t = setInterval(() => { process.stdout.write(b.subarray(o, o + 3)); o += 3; if (o >= 32) clearInterval(t); }, 5);
setInterval(() => {}, 1000);`;

function fakeWebContents() {
  const got = { data: [], ended: 0 };
  return {
    got,
    isDestroyed: () => false,
    send(channel, data) {
      if (channel === 'vibsync:sysaudio-data') got.data.push(Buffer.from(data));
      if (channel === 'vibsync:sysaudio-ended') got.ended += 1;
    },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failures += 1; console.log(`FAIL ${name}\n     ${err.message}`); }
}

await test('falls back to the next recorder and passes whole samples on', async () => {
  const sys = createSystemAudio({ tools: [missing, broken, { ...node(SPLIT), label: 'Ersatz' }], settleMs: 300 });
  const wc = fakeWebContents();
  const res = await sys.start(wc, 48000);
  assert.deepEqual(res, { ok: true, label: 'Ersatz' });
  await wait(200);
  const all = Buffer.concat(wc.got.data);
  assert.ok(wc.got.data.every((d) => d.length % 4 === 0), 'every chunk holds whole samples');
  assert.equal(all.length, 32);
  assert.deepEqual([...new Float32Array(all.buffer, all.byteOffset, 8)], [1, 2, 3, 4, 5, 6, 7, 8]);
  sys.stop();
  await wait(100);
  assert.equal(wc.got.ended, 0, 'stop() is not an unexpected end');
  assert.equal(sys.running(), false);
});

await test('names every reason when no recorder works', async () => {
  const sys = createSystemAudio({ tools: [missing, broken], settleMs: 300 });
  const res = await sys.start(fakeWebContents(), 48000);
  assert.match(res.error, /vibsync-no-such-recorder: nicht installiert/);
  assert.match(res.error, /Verbindung abgelehnt/);
});

await test('tells the page when the recorder stops by itself', async () => {
  const sys = createSystemAudio({ tools: [{ ...node('setTimeout(() => process.exit(0), 400)'), label: 'Kurz' }], settleMs: 200 });
  const wc = fakeWebContents();
  assert.equal((await sys.start(wc, 48000)).ok, true);
  await wait(500);
  assert.equal(wc.got.ended, 1);
});

await test('a new default output ends the stream so the page reconnects', async () => {
  const watcher = [process.execPath, ['-e', "setTimeout(() => console.log(\"Event 'change' on server #0\"), 300); setInterval(() => {}, 1000)"]];
  const sys = createSystemAudio({ tools: [{ ...node('setInterval(() => {}, 1000)'), label: 'Lang', watch: watcher }], settleMs: 200 });
  const wc = fakeWebContents();
  assert.equal((await sys.start(wc, 48000)).ok, true);
  await wait(900);
  assert.equal(wc.got.ended, 1);
  assert.equal(sys.running(), false);
});

await test('passes the sample rate to the recorder', async () => {
  let seen = 0;
  const sys = createSystemAudio({ tools: [{ cmd: process.execPath, label: 'Rate', args: (rate) => { seen = rate; return ['-e', 'setInterval(() => {}, 1000)']; } }], settleMs: 100 });
  await sys.start(fakeWebContents(), 44100);
  sys.stop();
  assert.equal(seen, 44100);
});

// The page side: the worklet that plays the samples into the audio graph.
const { PCM_WORKLET } = await import('../src/audio/capture.js');
function loadWorklet(rate) {
  let Proc = null;
  const scope = {
    sampleRate: rate,
    AudioWorkletProcessor: class { constructor() { this.port = { onmessage: null }; } },
    registerProcessor: (_name, cls) => { Proc = cls; },
  };
  new Function(...Object.keys(scope), PCM_WORKLET)(...Object.values(scope));
  const p = new Proc();
  return {
    push: (arr) => p.port.onmessage({ data: Float32Array.from(arr) }),
    pull: (n) => { const out = new Float32Array(n); p.process([], [[out]]); return [...out]; },
  };
}

await test('worklet plays samples in order across blocks and is silent when empty', async () => {
  const w = loadWorklet(1000);
  w.push([1, 2, 3]); w.push([4, 5]);
  assert.deepEqual(w.pull(4), [1, 2, 3, 4]);
  assert.deepEqual(w.pull(4), [5, 0, 0, 0]);
});

await test('worklet drops the oldest samples beyond ~80 ms', async () => {
  const w = loadWorklet(1000); // 80 samples at 1 kHz
  for (let i = 0; i < 5; i++) w.push(new Array(30).fill(i + 1));
  // Whole blocks go while more than 80 are queued: blocks 4 and 5 stay (60 samples).
  assert.deepEqual(w.pull(1), [4]);
  assert.deepEqual(w.pull(60).slice(-2), [5, 0]);
});

if (failures) { console.log(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nsystem audio: all tests passed');
