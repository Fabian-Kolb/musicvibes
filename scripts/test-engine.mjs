// Behaviour tests for the audio engine, driven by the simulated songs.
// Run: npm test
import assert from 'node:assert/strict';
import { createEngine, updateEngine, DEFAULT_ENGINE_OPTIONS } from '../src/engine/audioEngine.js';
import { GENRES, genreById, simulate, sectionStart } from '../src/engine/simulator.js';
import { fromLinear } from '../src/audio/analysis.js';

const DT = 1 / 60;
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function run(genreId, seconds, { scale = 1, opts = {} } = {}) {
  const g = genreById(genreId);
  const E = createEngine();
  const o = { ...DEFAULT_ENGINE_OPTIONS, ...opts };
  const drops = [];
  let kicks = 0, driveSum = 0, n = 0;
  for (let t = 0; t < seconds; t += DT) {
    const s = simulate(g, t, rand);
    updateEngine(E, fromLinear({ bass: s.bass * scale, mid: s.mid * scale, high: s.high * scale }), DT, o);
    if (E.dropEvent) drops.push(+t.toFixed(1));
    if (t > 20) { kicks += E.kickEvent ? 1 : 0; driveSum += E.drive; n += 1; }
  }
  return { E, drops, kickRate: kicks / (seconds - 20), drive: driveSum / n };
}

const results = {};
let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.message}`); }
}

for (const g of GENRES) results[g.id] = run(g.id, 75);

check('Techno, House, Drum & Bass: exactly one drop, right where the drop section starts', () => {
  for (const id of ['techno', 'house', 'dnb']) {
    const start = sectionStart(genreById(id), 'Drop');
    const { drops } = results[id];
    assert.equal(drops.length, 1, `${id}: drops at ${drops}`);
    assert.ok(Math.abs(drops[0] - start) < 1.5, `${id}: drop at ${drops[0]} s, section starts at ${start.toFixed(1)} s`);
  }
});

check('Songs without a breakdown never trigger a drop', () => {
  for (const id of ['hiphop', 'pop', 'rock', 'chill']) assert.deepEqual(results[id].drops, [], id);
});

check('Kicks are found at the tempo of the pattern', () => {
  const techno = results.techno.kickRate; // 4 per bar at 130 BPM = 2.17/s
  assert.ok(techno > 1.4 && techno < 2.3, `techno (breakdown has no kicks) ${techno.toFixed(2)}/s`);
  assert.ok(results.chill.kickRate > 0.4, `chill ${results.chill.kickRate.toFixed(2)}/s`);
});

check('Drive follows the character: Chill calmest, Techno and DnB highest', () => {
  const d = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.drive]));
  assert.ok(d.chill < d.hiphop && d.hiphop < d.techno, JSON.stringify(d));
  assert.ok(d.chill < 0.45 && d.dnb > 0.55, JSON.stringify(d));
});

check('Volume does not matter: 1/50 of the level gives the same drops and nearly the same drive', () => {
  const quiet = run('techno', 75, { scale: 0.02 });
  assert.equal(quiet.drops.length, 1, `drops at ${quiet.drops}`);
  assert.ok(Math.abs(quiet.drive - results.techno.drive) < 0.08, `${quiet.drive} vs ${results.techno.drive}`);
});

check('Drop detection off: no drop events', () => {
  assert.deepEqual(run('techno', 75, { opts: { dropDetection: false } }).drops, []);
});

check('Bands far apart in level all move over the full meter', () => {
  // Typical band levels of real music: bass far above the mids, the highs far below.
  const E = createEngine();
  const o = { ...DEFAULT_ENGINE_OPTIONS };
  const lo = [1, 1, 1], hi = [0, 0, 0];
  for (let t = 0; t < 60; t += DT) {
    const kick = Math.exp(-((t * 2) % 1) * 9), hat = Math.exp(-((t * 4) % 1) * 20), voc = 0.5 + 0.5 * Math.sin(t * 1.3);
    updateEngine(E, fromLinear({ bass: 0.012 + 0.05 * kick, mid: 0.001 + 0.006 * voc, high: 0.00005 + 0.0005 * hat }), DT, o);
    if (t > 15) [E.bass, E.mid, E.high].forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); });
  }
  ['bass', 'mid', 'high'].forEach((n, i) => assert.ok(hi[i] - lo[i] > 0.3 && hi[i] > 0.7, `${n}: ${lo[i].toFixed(2)} to ${hi[i].toFixed(2)}`));
  assert.ok(E.hatRate > 3, `hats ${E.hatRate}/s`);
});

check('Silence is silence: hiss below the floor after a pause stays at zero', () => {
  const E = createEngine();
  const o = { ...DEFAULT_ENGINE_OPTIONS, floor: -60 };
  for (let t = 0; t < 10; t += DT) updateEngine(E, fromLinear({ bass: 0.3, mid: 0.2, high: 0.1 }), DT, o);
  for (let t = 0; t < 60; t += DT) updateEngine(E, fromLinear({ bass: 0.0002 * (1 + rand()), mid: 0.0001, high: 0.0001 }), DT, o);
  assert.ok(E.silent, 'silent flag');
  assert.ok(E.bass < 0.01 && E.mid < 0.01, `bass ${E.bass}, mid ${E.mid}`);
  assert.equal(E.dropHold > 0, false);
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall engine tests passed');
