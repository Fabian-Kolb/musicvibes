// Tests for the Govee lights: the packets, the stream to a fake light over real UDP on
// this computer, and the colours computed from the music.
// Run: npm test
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { createRequire } from 'node:module';
import { createLightState, computeLights } from '../src/lights/lightSync.js';
import { createEngine } from '../src/engine/audioEngine.js';
import { createVisualState } from '../src/render/frame.js';
import { DEFAULTS, sanitize } from '../src/state/settings.js';

const require = createRequire(import.meta.url);
const { createGovee, razerData, isLocalIp, RAZER_ON, RAZER_OFF } = require('../electron/govee.cjs');

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.stack}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const xor = (buf) => buf.subarray(0, -1).reduce((a, b) => a ^ b, 0);

// A Govee light in miniature: answers scan and devStatus, remembers what it was told.
// Ports are moved off the real ones so a light in this network never sees the tests.
const PORTS = { scan: 47101, listen: 47102, command: 47103 };
async function fakeLight(state = { onOff: 1, brightness: 40, color: { r: 10, g: 20, b: 30 }, colorTemInKelvin: 0 }) {
  const dev = { state: { ...state }, razer: false, log: [], frames: [] };
  const reply = (s, msg) => s.send(Buffer.from(JSON.stringify({ msg })), PORTS.listen, '127.0.0.1');
  const scan = dgram.createSocket('udp4');
  const cmd = dgram.createSocket('udp4');
  scan.on('message', (buf) => {
    const msg = JSON.parse(buf.toString()).msg;
    if (msg.cmd === 'scan') reply(scan, { cmd: 'scan', data: { ip: '127.0.0.1', device: 'AA:BB', sku: 'H619E' } });
  });
  cmd.on('message', (buf) => {
    const text = buf.toString().replace(/\0+$/, '');
    const { cmd: c, data } = JSON.parse(text).msg;
    dev.log.push(c);
    if (c === 'devStatus') reply(cmd, { cmd: 'devStatus', data: dev.state });
    if (c === 'turn') dev.state.onOff = data.value;
    if (c === 'brightness') dev.state.brightness = data.value;
    if (c === 'colorwc') { dev.state.color = data.color; dev.state.colorTemInKelvin = data.colorTemInKelvin; }
    if (c === 'razer') {
      const pt = Buffer.from(data.pt, 'base64');
      assert.equal(xor(pt), pt[pt.length - 1], 'checksum');
      if (pt[3] === 0xb1) dev.razer = pt[4] === 1;
      else dev.frames.push({ t: Date.now(), n: pt[5], first: [...pt.subarray(6, 9)] });
    }
  });
  await new Promise((r) => scan.bind(PORTS.scan, '127.0.0.1', r));
  await new Promise((r) => cmd.bind(PORTS.command, '127.0.0.1', r));
  dev.close = () => { scan.close(); cmd.close(); };
  return dev;
}
const newGovee = () => createGovee({ ports: PORTS, commandGap: 10, scanTargets: () => [{ iface: null, address: '127.0.0.1' }] });

await check('Segment packet: layout and checksum as in OpenRGB', () => {
  const p = razerData([[255, 0, 0], [0, 255, 0]]);
  assert.deepEqual([...p], [0xbb, 0x00, 0x08, 0xb0, 0x01, 0x02, 255, 0, 0, 0, 255, 0, p[12]]);
  assert.equal(p[12], xor(p));
  assert.equal(xor(RAZER_ON), RAZER_ON[5]);
  assert.equal(xor(RAZER_OFF), RAZER_OFF[5]);
});

await check('Only addresses in the local network are accepted', () => {
  for (const ip of ['192.168.178.45', '10.0.0.7', '172.20.1.2', '127.0.0.1']) assert.ok(isLocalIp(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '192.168.1', '300.1.1.1', 'localhost', '']) assert.ok(!isLocalIp(ip), ip);
});

await check('Scan finds the light', async () => {
  const dev = await fakeLight();
  const g = newGovee();
  try {
    const list = await g.scan(300);
    assert.deepEqual(list, [{ ip: '127.0.0.1', sku: 'H619E', id: 'AA:BB' }]);
  } finally { await g.close(); dev.close(); }
});

await check('Stream: switches to segments, at most the set updates per second, newest colours, then restores', async () => {
  const dev = await fakeLight();
  const g = newGovee();
  try {
    await g.begin([{ ip: '127.0.0.1', mode: 'segments' }], { rate: 20 });
    await sleep(30);
    assert.ok(dev.razer && dev.state.brightness === 100 && dev.state.onOff === 1, JSON.stringify(dev));
    // The page sends at 100 updates a second for one second.
    for (let i = 0; i < 100; i++) {
      g.frame([{ ip: '127.0.0.1', colors: Array.from({ length: 20 }, () => [i, 255 - i, 7]) }]);
      await sleep(10);
    }
    await sleep(120);
    assert.ok(dev.frames.length >= 12 && dev.frames.length <= 23, `${dev.frames.length} packets`);
    assert.equal(dev.frames.at(-1).n, 20);
    assert.deepEqual(dev.frames.at(-1).first, [99, 156, 7]);
    await g.end();
    await sleep(60);
    assert.ok(!dev.razer, 'segment mode left');
    assert.deepEqual(dev.state, { onOff: 1, brightness: 40, color: { r: 10, g: 20, b: 30 }, colorTemInKelvin: 0 });
  } finally { await g.close(); dev.close(); }
});

await check('Restore: white light comes back as white, a light that was off goes off again', async () => {
  for (const before of [{ onOff: 1, brightness: 70, color: { r: 0, g: 0, b: 0 }, colorTemInKelvin: 4000 },
    { onOff: 0, brightness: 70, color: { r: 1, g: 2, b: 3 }, colorTemInKelvin: 0 }]) {
    const dev = await fakeLight(before);
    const g = newGovee();
    try {
      await g.begin([{ ip: '127.0.0.1', mode: 'single' }]);
      g.frame([{ ip: '127.0.0.1', colors: [[255, 0, 128]] }]);
      await sleep(150);
      assert.deepEqual(dev.state.color, { r: 255, g: 0, b: 128 });
      await g.end();
      await sleep(60);
      assert.equal(dev.state.onOff, before.onOff);
      if (before.onOff) assert.equal(dev.state.colorTemInKelvin, 4000);
      assert.ok(!dev.log.includes('razer'), 'single colour never uses segment mode');
    } finally { await g.close(); dev.close(); }
  }
});

await check('Stopping while the light is still answering leaves it untouched', async () => {
  const dev = await fakeLight();
  const g = newGovee();
  try {
    const started = g.begin([{ ip: '127.0.0.1', mode: 'segments' }]);
    await g.end();
    await started;
    await sleep(80);
    assert.ok(!dev.razer && dev.state.brightness === 40, JSON.stringify(dev.state));
  } finally { await g.close(); dev.close(); }
});

await check('Test button: rainbow over the segments, then the old colour is back', async () => {
  const dev = await fakeLight();
  const g = newGovee();
  try {
    const r = await g.test({ ip: '127.0.0.1', mode: 'segments', segments: 12 });
    await sleep(60);
    assert.ok(r.ok && r.answered);
    assert.ok(dev.frames.length >= 25 && dev.frames.every((f) => f.n === 12), `${dev.frames.length} packets`);
    assert.ok(!dev.razer);
    assert.deepEqual(dev.state, { onOff: 1, brightness: 40, color: { r: 10, g: 20, b: 30 }, colorTemInKelvin: 0 });
  } finally { await g.close(); dev.close(); }
});

// ---- Colours from the music ------------------------------------------------------
function lcg(seed = 7) {
  let x = seed;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
// Runs the light logic for `seconds` with a 10-segment strip. setup(E, V, t) sets the
// music for each frame; events not set there stay off.
function run(seconds, setup, opts = {}, segments = 10) {
  const E = createEngine();
  const V = createVisualState();
  V.colors.set([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1]);
  const P = { hue: 0, sat: 1 };
  const S = { ...DEFAULTS, lights: true, lightEffect: 'flow', ...opts };
  const L = createLightState();
  const rnd = lcg();
  const dt = 1 / 60;
  const out = [];
  for (let f = 0; f < seconds * 60; f++) {
    E.now += dt;
    E.silent = false; E.kickEvent = false; E.snareEvent = false; E.hatEvent = false; E.dropEvent = false;
    setup(E, V, f * dt);
    const frames = computeLights(L, E, V, P, S, dt, [{ ip: '192.168.0.9', mode: 'segments', segments }], rnd);
    out.push({ t: E.now, effect: L.effect, pulse: L.lastPulse, colors: frames[0].colors });
  }
  return out;
}
const lum = (c) => c.reduce((a, x) => a + x[0] + x[1] + x[2], 0) / (c.length * 765);
const segLum = (x) => (x[0] + x[1] + x[2]) / 765;
// Kicks every half second (120 BPM).
const kicks = (E) => { E.bass = 0.8; E.drive = 0.7; E.kickRate = 2; E.kickEvent = Math.round(E.now * 60) % 30 === 0; E.punch = E.kickEvent ? 1 : E.punch; };

await check('Lights show the palette colours at full colour, flowing along the strip', () => {
  const c = run(1, (E) => { E.bass = 0.5; }, { lightSpread: 0 }).at(-1).colors;
  assert.equal(c.length, 10);
  c.forEach((x) => { assert.ok(x[0] > 0 && x[1] === 0 && x[2] === 0, JSON.stringify(x)); });
  const spread = run(1, () => {}, { lightSpread: 1 }).at(-1).colors;
  assert.ok(spread[0][0] > 0 && spread[0][1] === 0 && spread[9][1] > 0 && spread[9][1] === spread[9][0], `colours change along the strip: ${JSON.stringify(spread)}`);
});

await check('Bass makes the lights brighter, silence dims them', () => {
  const quiet = lum(run(3, (E) => { E.bass = 0; }).at(-1).colors);
  const loud = lum(run(3, (E) => { E.bass = 1; }).at(-1).colors);
  const silent = lum(run(3, (E) => { E.silent = true; }).at(-1).colors);
  assert.ok(loud > quiet * 1.4 && silent < quiet, `quiet ${quiet.toFixed(3)} loud ${loud.toFixed(3)} silent ${silent.toFixed(3)}`);
});

await check('Each kick is a clear flash of brightness that drops again before the next', () => {
  const rows = run(4, kicks);
  const last = rows.slice(-60);
  const hi = Math.max(...last.map((r) => lum(r.colors)));
  const lo = Math.min(...last.map((r) => lum(r.colors)));
  assert.ok(hi > lo * 2, `brightest ${hi.toFixed(3)}, darkest ${lo.toFixed(3)}`);
  // The peak comes within 60 ms of the kick.
  const k = rows.findIndex((r, i) => i > 120 && r.pulse === r.t);
  const peak = rows.slice(k, k + 20).reduce((m, r, i) => (lum(r.colors) > lum(rows[k + m].colors) ? i : m), 0);
  assert.ok(peak <= 4, `peak ${peak} frames after the kick`);
});

await check('Every effect gives its own picture; waves run from the middle outward', () => {
  const pics = {};
  for (const fx of ['flow', 'wave', 'meter', 'chase', 'sparks']) {
    const rows = run(3, (E) => { kicks(E); E.hatEvent = Math.round(E.now * 60) % 8 === 0; E.snareEvent = Math.round(E.now * 60) % 60 === 15; }, { lightEffect: fx });
    rows.forEach((r) => r.colors.forEach((x) => x.forEach((v) => assert.ok(Number.isInteger(v) && v >= 0 && v <= 255))));
    // Shortly after the last kick, scaled so the brightest segment is 1.
    const k = rows.findLastIndex((r, i) => i < rows.length - 10 && r.pulse === r.t);
    const pic = rows[k + 6].colors.map(segLum);
    const top = Math.max(...pic, 1e-6);
    pics[fx] = pic.map((v) => v / top);
  }
  const differ = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 0.1);
  const names = Object.keys(pics);
  names.forEach((a, i) => names.slice(i + 1).forEach((b) => assert.ok(differ(pics[a], pics[b]), `${a} and ${b} look the same`)));
  // Wave: a few frames after a kick the middle is lit, a bit later the ends.
  const rows = run(3, kicks, { lightEffect: 'wave', lightPulse: 0 });
  const k = rows.findIndex((r, i) => i > 60 && r.pulse === r.t);
  const midEnd = (r) => [(segLum(r.colors[4]) + segLum(r.colors[5])) / 2, (segLum(r.colors[0]) + segLum(r.colors[9])) / 2];
  const [m1, e1] = midEnd(rows[k + 2]);
  const [m2, e2] = midEnd(rows[k + 24]);
  assert.ok(m1 > e1 && e2 > m2, `just after the kick middle ${m1.toFixed(2)} ends ${e1.toFixed(2)}, later middle ${m2.toFixed(2)} ends ${e2.toFixed(2)}`);
});

await check('Meter: more bass lights more segments', () => {
  const lit = (bass) => run(3, (E) => { E.bass = bass; }, { lightEffect: 'meter', lightSparkle: false }).at(-1).colors
    .filter((x) => segLum(x) > 0.08).length;
  assert.ok(lit(1) > lit(0.1), `bass 1: ${lit(1)} segments, bass 0.1: ${lit(0.1)}`);
});

await check('Auto effect: changes after 32 kicks and on a drop, calm effects in calm music', () => {
  const rows = run(40, kicks, { lightEffect: 'auto' });
  const changes = rows.filter((r, i) => i && r.effect !== rows[i - 1].effect);
  assert.ok(changes.length >= 2, `${changes.length} changes in 40 s at 2 kicks/s`);
  const drop = run(3, (E) => { kicks(E); E.dropEvent = Math.abs(E.now - 2) < 0.009; }, { lightEffect: 'auto' });
  assert.notEqual(drop.at(-1).effect, drop[0].effect);
  const calm = run(60, (E) => { E.drive = 0.2; E.kickEvent = Math.round(E.now * 60) % 30 === 0; }, { lightEffect: 'auto' });
  assert.ok(calm.every((r) => ['flow', 'meter'].includes(r.effect)), [...new Set(calm.map((r) => r.effect))].join(','));
});

await check('Segment strobe: off unless switched on, then fast random segments on and off', () => {
  assert.equal(DEFAULTS.lightStrobe, false);
  const off = run(2, kicks, { strobe: true });
  assert.ok(off.every((r) => r.colors.some((x) => segLum(x) > 0.02)), 'without the light strobe no frame goes black');
  const rows = run(2, kicks, { lightStrobe: true, lightStrobeMode: 'always', lightStrobeRate: 15 }, 20);
  const patterns = rows.map((r) => r.colors.map((x) => (segLum(x) > 0.5 ? 1 : 0)).join(''));
  const changes = patterns.filter((p, i) => i && p !== patterns[i - 1]).length;
  assert.ok(changes >= 25 && changes <= 31, `${changes} changes in 2 s at 15 per second`);
  assert.ok(patterns.slice(10).every((p) => p.includes('1') && p.includes('0')), 'some segments on, others off');
  rows.forEach((r) => r.colors.forEach((x) => assert.ok(segLum(x) > 0.5 || segLum(x) === 0)));
  const drop = run(2, kicks, { lightStrobe: true, lightStrobeMode: 'drop' });
  assert.ok(drop.every((r) => r.colors.some((x) => segLum(x) > 0.02)), '"Nur bei Drops" stays dark outside a drop');
});

await check('With the safety limit: at most 3 pulses and 3 strobe changes per second', () => {
  const fast = (E) => { E.bass = 0.8; E.kickEvent = Math.round(E.now * 60) % 6 === 0; E.punch = 1; };
  const rows = run(4, fast, { strobeLimit: true });
  const pulses = new Set(rows.map((r) => r.pulse).filter((t) => t > 0)).size;
  assert.ok(pulses >= 10 && pulses <= 12, `${pulses} pulses in 4 s`);
  const free = new Set(run(4, fast).map((r) => r.pulse).filter((t) => t > 0)).size;
  assert.ok(free >= 38, `${free} pulses in 4 s without the limit`);
  const strobe = run(4, fast, { strobeLimit: true, lightStrobe: true, lightStrobeMode: 'always', lightStrobeRate: 20, lightStrobeStyle: 'full' });
  const p = strobe.map((r) => (lum(r.colors) > 0.3 ? 1 : 0));
  const ons = p.filter((v, i) => v && !p[i - 1]).length;
  assert.ok(ons <= 7, `${ons} flashes in 4 s`);
});

await check('Stored light list is cleaned up', () => {
  const s = sanitize({ lightDevices: [{ ip: '192.168.1.5', sku: 'H619E', segments: 500 }, { ip: 'evil' }, null] });
  assert.deepEqual(s.lightDevices, [{ ip: '192.168.1.5', sku: 'H619E', on: true, mode: 'segments', segments: 100 }]);
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall light tests passed');
