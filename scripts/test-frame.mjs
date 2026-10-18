// Tests for the mapping from engine + settings to the picture: strobe safety,
// style differences, palette fades and stored settings.
// Run: npm test
import assert from 'node:assert/strict';
import { createEngine, updateEngine, DEFAULT_ENGINE_OPTIONS } from '../src/engine/audioEngine.js';
import { genreById, simulate } from '../src/engine/simulator.js';
import { fromLinear } from '../src/audio/analysis.js';
import { computeFrame, createVisualState } from '../src/render/frame.js';
import { DEFAULTS, SCENE_KEYS, BUILTIN_SCENES, sceneValues, sanitize } from '../src/state/settings.js';

const DT = 1 / 60;
let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.message}`); }
}

// Runs a simulated song through engine and mapping; returns flash times and stats.
function play(settings, genreId = 'techno', seconds = 75) {
  const S = { ...DEFAULTS, ...settings };
  const E = createEngine();
  const V = createVisualState();
  const g = genreById(genreId);
  const flashes = [];
  const dropWindows = [];
  let maxRip = 0, minZoomFb = 9, maxZoomFb = 0;
  for (let t = 0; t < seconds; t += DT) {
    const s = simulate(g, t, () => 0.5);
    updateEngine(E, fromLinear(s), DT, { ...DEFAULT_ENGINE_OPTIONS, dropDetection: S.dropDetection });
    const before = V.lastFlash;
    const P = computeFrame(E, V, S, DT);
    if (V.lastFlash !== before) flashes.push({ t: E.now, inDrop: E.dropHold > 0 });
    if (E.dropEvent) dropWindows.push(E.now);
    maxRip = Math.max(maxRip, P.ripAmp);
    minZoomFb = Math.min(minZoomFb, P.fbZoom);
    maxZoomFb = Math.max(maxZoomFb, P.fbZoom);
  }
  const maxPerSecond = flashes.reduce((m, f) => Math.max(m, flashes.filter((x) => x.t >= f.t && x.t < f.t + 1).length), 0);
  return { flashes, maxPerSecond, dropWindows, maxRip, minZoomFb, maxZoomFb };
}

check('Strobe off (the default): no flash at all, even through a drop', () => {
  const r = play({});
  assert.equal(DEFAULTS.strobe, false);
  assert.equal(r.dropWindows.length, 1);
  assert.equal(r.flashes.length, 0);
});

check('Strobe "Nur bei Drops" with the safety limit: flashes only inside the drop, at most 3 per second', () => {
  const r = play({ strobe: true, strobeMode: 'drop', strobeRate: 10, strobeLimit: true });
  assert.ok(r.flashes.length > 5, `${r.flashes.length} flashes`);
  assert.ok(r.flashes.every((f) => f.inDrop));
  assert.ok(r.maxPerSecond <= 3, `${r.maxPerSecond}/s`);
});

check('Safety limit holds 3 Hz even at a fixed rate of 10 Hz; switched off (the default), 10 Hz is allowed', () => {
  const safe = play({ strobe: true, strobeMode: 'always', strobeSync: 'rate', strobeRate: 10, strobeLimit: true }, 'techno', 20);
  assert.ok(safe.maxPerSecond <= 3, `safe ${safe.maxPerSecond}/s`);
  assert.equal(DEFAULTS.strobeLimit, false);
  const unsafe = play({ strobe: true, strobeMode: 'always', strobeSync: 'rate', strobeRate: 10 }, 'techno', 20);
  assert.ok(unsafe.maxPerSecond >= 8 && unsafe.maxPerSecond <= 10, `unsafe ${unsafe.maxPerSecond}/s`);
});

check('Strobe on kicks with drop detection off never fires in "Nur bei Drops"', () => {
  assert.equal(play({ strobe: true, dropDetection: false }).flashes.length, 0);
});

check('Minimal and Flächen stay flat: no shockwave ring, no feedback zoom; Glas has both', () => {
  for (const style of ['minimal', 'flat']) {
    const r = play({ style }, 'techno', 20);
    assert.equal(r.maxRip, 0, style);
    assert.equal(r.minZoomFb, 1, style);
    assert.equal(r.maxZoomFb, 1, style);
  }
  const g = play({ style: 'glass' }, 'techno', 20);
  assert.ok(g.maxRip > 0 && g.maxZoomFb > 1.003);
});

check('Palette change fades over the transition time instead of jumping', () => {
  const E = createEngine();
  const V = createVisualState();
  const S = { ...DEFAULTS, palette: 'neon', transition: 2 };
  computeFrame(E, V, S, DT);
  const start = Array.from(V.colors);
  const S2 = { ...S, palette: 'lava' };
  computeFrame(E, V, S2, DT);
  const afterOne = Array.from(V.colors);
  const moved = afterOne.reduce((a, v, i) => a + Math.abs(v - start[i]), 0);
  for (let t = 0; t < 3; t += DT) computeFrame(E, V, S2, DT);
  const target = Array.from(V.target);
  const total = start.reduce((a, v, i) => a + Math.abs(v - target[i]), 0);
  const rest = Array.from(V.colors).reduce((a, v, i) => a + Math.abs(v - target[i]), 0);
  assert.ok(moved > 0 && moved < total * 0.05, `first frame moved ${moved} of ${total}`);
  assert.ok(rest < total * 0.02, `left after 3 s: ${rest} of ${total}`);
});

check('Scenes never touch strobe, audio or brightness', () => {
  for (const k of ['strobe', 'strobeLimit', 'strobeRate', 'source', 'gain', 'brightness', 'latency']) {
    assert.ok(!SCENE_KEYS.includes(k), k);
  }
  for (const sc of BUILTIN_SCENES) {
    const v = sceneValues(sc.values);
    assert.deepEqual(Object.keys(v).sort(), [...SCENE_KEYS].sort(), sc.name);
  }
});

check('Stored settings with wrong types fall back to the defaults', () => {
  const s = sanitize({ speed: 'fast', strobe: 'yes', palette: 'ocean', customColors: ['#fff'], count: NaN, gain: 2 });
  assert.equal(s.speed, DEFAULTS.speed);
  assert.equal(s.strobe, false);
  assert.equal(s.palette, 'ocean');
  assert.deepEqual(s.customColors, DEFAULTS.customColors);
  assert.equal(s.count, DEFAULTS.count);
  assert.equal(s.gain, 2);
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall frame tests passed');
