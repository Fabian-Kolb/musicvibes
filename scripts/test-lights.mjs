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

await check('Stream: switches to segments, at most 20 updates a second, newest colours, then restores', async () => {
  const dev = await fakeLight();
  const g = newGovee();
  try {
    await g.begin([{ ip: '127.0.0.1', mode: 'segments' }]);
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
function run(seconds, setup, opts = {}) {
  const E = createEngine();
  const V = createVisualState();
  V.colors.set([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1]);
  const P = { hue: 0, sat: 1 };
  const S = { ...DEFAULTS, lights: true, ...opts };
  const L = createLightState();
  const dt = 1 / 60;
  const out = [];
  for (let f = 0; f < seconds * 60; f++) {
    E.now += dt;
    setup(E, V, f * dt);
    const frames = computeLights(L, E, V, P, S, dt, [{ ip: '192.168.0.9', mode: 'segments', segments: 10 }]);
    out.push({ t: E.now, L: { ...L }, colors: frames[0].colors });
  }
  return out;
}
const lum = (c) => c.reduce((a, x) => a + x[0] + x[1] + x[2], 0) / (c.length * 765);

await check('Lights show the palette colours at full colour, one per segment', () => {
  const rows = run(1, (E) => { E.silent = false; E.bass = 0.5; }, { lightSpread: 0 });
  const c = rows.at(-1).colors;
  assert.equal(c.length, 10);
  c.forEach((x) => { assert.ok(x[0] > 0 && x[1] === 0 && x[2] === 0, JSON.stringify(x)); });
  const spread = run(1, (E) => { E.silent = false; }, { lightSpread: 1 }).at(-1).colors;
  assert.ok(spread[0][0] > 0 && spread[0][1] === 0 && spread[9][1] > 0 && spread[9][1] === spread[9][0], `colours change along the strip: ${JSON.stringify(spread)}`);
});

await check('Bass makes the lights brighter, silence dims them', () => {
  const quiet = lum(run(3, (E) => { E.silent = false; E.bass = 0; }).at(-1).colors);
  const loud = lum(run(3, (E) => { E.silent = false; E.bass = 1; }).at(-1).colors);
  const silent = lum(run(3, (E) => { E.silent = true; }).at(-1).colors);
  assert.ok(loud > quiet * 1.4 && silent < quiet, `quiet ${quiet.toFixed(3)} loud ${loud.toFixed(3)} silent ${silent.toFixed(3)}`);
});

await check('Kick pulses and light strobe never exceed 3 per second', () => {
  // Kicks and picture flashes on every sixth frame: 10 per second.
  const rows = run(4, (E, V) => {
    E.silent = false;
    E.kickEvent = Math.round(E.now * 60) % 6 === 0;
    E.punch = 1;
    if (E.kickEvent) V.lastFlash = E.now;
  }, { strobe: true, lightStrobe: true });
  const pulses = new Set(rows.map((r) => r.L.lastPulse).filter((t) => t > 0)).size;
  const flashes = new Set(rows.map((r) => r.L.lastFlash).filter((t) => t > 0)).size;
  assert.ok(pulses <= 12 && pulses >= 10, `${pulses} pulses in 4 s`);
  assert.ok(flashes <= 12 && flashes >= 10, `${flashes} flashes in 4 s`);
  const off = run(2, (E, V) => { E.silent = false; V.lastFlash = E.now; }, { strobe: true, lightStrobe: false });
  assert.ok(off.every((r) => r.L.flash === 0), 'no light strobe unless switched on');
});

await check('Stored light list is cleaned up', () => {
  const s = sanitize({ lightDevices: [{ ip: '192.168.1.5', sku: 'H619E', segments: 500 }, { ip: 'evil' }, null] });
  assert.deepEqual(s.lightDevices, [{ ip: '192.168.1.5', sku: 'H619E', on: true, mode: 'segments', segments: 100 }]);
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall light tests passed');
