// Tests for the frequency analysis on realistic spectra: synthesized voices, bass,
// kick, snare and hi-hats run through the same analyser the browser uses
// (scripts/lib/webaudio.mjs), then through analysis.js and the audio engine.
// Run: npm test
import assert from 'node:assert/strict';
import { createAnalyser } from './lib/webaudio.mjs';
import { SR, render, voice, pad, bass, kick, hats, snare, noise } from './lib/synth.mjs';
import { createAnalysis, analyse } from '../src/audio/analysis.js';
import { createEngine, updateEngine, DEFAULT_ENGINE_OPTIONS } from '../src/engine/audioEngine.js';

const HOP = 800; // one analyser read per frame at 60 fps
const DT = HOP / SR;
let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.message}`); }
}

// Plays sections through analyser, analysis and engine. Returns per-section means of
// the meters and hit rates, plus drop times.
function play(sections, opts = {}) {
  const { pcm, marks } = render(sections);
  const an = createAnalyser({ sampleRate: SR });
  const spec = new Float32Array(an.frequencyBinCount).fill(-Infinity);
  const A = createAnalysis(SR, an.fftSize);
  const E = createEngine();
  const o = { ...DEFAULT_ENGINE_OPTIONS, ...opts };
  const rows = [];
  for (let end = HOP; end <= pcm.length; end += HOP) {
    an.getFloatFrequencyData(spec, pcm, end);
    updateEngine(E, analyse(A, spec, DT), DT, o);
    rows.push({ t: end / SR, bass: E.bass, mid: E.mid, high: E.high, kick: E.kickEvent, hat: E.hatEvent, drop: E.dropEvent, silent: E.silent });
  }
  const sec = marks.map((m) => {
    // Skip the first second of each section: the meters need a moment to follow.
    const r = rows.filter((x) => x.t > m.start + 1 && x.t <= m.end);
    const mean = (k) => r.reduce((a, x) => a + x[k], 0) / r.length;
    const rate = (k) => r.filter((x) => x[k]).length / (r.length * DT);
    return { name: m.name, start: m.start, bass: mean('bass'), mid: mean('mid'), high: mean('high'),
      kicks: rate('kick'), hats: rate('hat'), silent: r.filter((x) => x.silent).length > r.length * 0.8 };
  });
  return { sec, drops: rows.filter((r) => r.drop).map((r) => r.t), E };
}
const fmt = (s) => `${s.name}: bass ${s.bass.toFixed(2)} mid ${s.mid.toFixed(2)} high ${s.high.toFixed(2)} kicks ${s.kicks.toFixed(1)}/s hats ${s.hats.toFixed(1)}/s`;
const show = (r) => r.sec.map(fmt).join('\n     ');

// A typical song start: voice and keys, then bass and kick come in, then hi-hats.
let introRun = null;
const intro = () => {
  introRun = introRun || play([
    { name: 'voice + keys', secs: 10, parts: [voice({ f0: 220 }), pad()] },
    { name: '+ bass + kick', secs: 10, parts: [voice({ f0: 220 }), pad(), bass(), kick()] },
    { name: '+ hats', secs: 10, parts: [voice({ f0: 220 }), pad(), bass(), kick(), hats()] },
  ]);
  return introRun;
};

check('A voice alone moves the mids, not the bass, and is not mistaken for silence', () => {
  const r = play([{ name: 'voice', secs: 12, parts: [voice({ f0: 220 })] }]);
  const s = r.sec[0];
  assert.ok(!s.silent && s.mid > 0.45, show(r));
  assert.ok(s.bass < 0.1 && s.kicks === 0, show(r));
});

check('A male voice does not read as bass', () => {
  // 98 Hz is a deep G2: its fundamental is real bass-range energy, so only the meter
  // is checked there; at usual male pitches there must be no bass hits either.
  for (const f0 of [98, 110, 130, 165]) {
    const r = play([{ name: `voice ${f0} Hz`, secs: 12, parts: [voice({ f0 })] }]);
    assert.ok(r.sec[0].bass < 0.2 && r.sec[0].mid > 0.4, show(r));
    if (f0 > 100) assert.ok(r.sec[0].kicks < 0.2, show(r));
  }
});

check('A quiet voice (25 dB down) looks the same as a loud one', () => {
  const loud = play([{ name: 'voice', secs: 12, parts: [voice()] }]).sec[0];
  const quiet = play([{ name: 'voice -25 dB', secs: 12, gainDb: -25, parts: [voice()] }]).sec[0];
  for (const k of ['bass', 'mid', 'high']) assert.ok(Math.abs(loud[k] - quiet[k]) < 0.06, `${fmt(loud)}\n     ${fmt(quiet)}`);
});

check('Bass and kick coming in lift the bass meter, not the mids or highs', () => {
  const r = intro();
  const [a, b] = r.sec;
  assert.ok(a.bass < 0.1 && b.bass > 0.5, show(r));
  assert.ok(Math.abs(b.mid - a.mid) < 0.12, `mids moved ${(b.mid - a.mid).toFixed(2)}\n     ${show(r)}`);
  assert.ok(Math.abs(b.high - a.high) < 0.12, `highs moved ${(b.high - a.high).toFixed(2)}\n     ${show(r)}`);
});

check('Hi-hats coming in lift the highs, not the bass or mids', () => {
  const r = intro();
  const [, b, c] = r.sec;
  assert.ok(c.high - b.high > 0.2, show(r));
  assert.ok(Math.abs(c.bass - b.bass) < 0.1 && Math.abs(c.mid - b.mid) < 0.12, show(r));
});

check('Kicks and hi-hats are counted at the tempo they play (120 BPM)', () => {
  const r = intro();
  const [a, b, c] = r.sec;
  assert.equal(a.kicks, 0, show(r));
  assert.ok(Math.abs(b.kicks - 2) < 0.35, `kicks ${b.kicks.toFixed(2)}/s, expected 2\n     ${show(r)}`);
  assert.ok(Math.abs(c.hats - 4) < 0.8, `hats ${c.hats.toFixed(2)}/s, expected 4\n     ${show(r)}`);
});

check('Drop: one event when bass and kick return after a breakdown, none in steady music', () => {
  const full = () => [voice(), pad(), bass(), kick(), hats(), snare()];
  const r = play([
    { name: 'groove', secs: 16, parts: full() },
    { name: 'breakdown', secs: 10, parts: [voice(), pad()] },
    { name: 'drop', secs: 12, parts: full() },
  ]);
  assert.equal(r.drops.length, 1, `drops at ${r.drops.map((t) => t.toFixed(1))}`);
  assert.ok(r.drops[0] > 26 && r.drops[0] < 27.5, `drop at ${r.drops[0].toFixed(1)} s, bass back at 26 s`);
  const steady = play([{ name: 'steady', secs: 40, parts: full() }]);
  assert.deepEqual(steady.drops, []);
});

check('Faint hum just above the silence floor is not blown up to full meters', () => {
  const r = play([{ name: 'hum', secs: 10, gainDb: -40, parts: [pad(), noise({ rmsDb: -20 })] }]);
  const s = r.sec[0];
  assert.ok(!s.silent && s.bass < 0.4 && s.mid < 0.4 && s.high < 0.4, show(r));
});

check('Hiss far below music counts as silence; quiet music does not', () => {
  const hiss = play([{ name: 'hiss', secs: 6, parts: [noise({ rmsDb: -75 })] }]);
  assert.ok(hiss.sec[0].silent, show(hiss));
  const quiet = play([{ name: 'quiet song', secs: 6, gainDb: -30, parts: [voice(), pad(), bass(), kick()] }]);
  assert.ok(!quiet.sec[0].silent, show(quiet));
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall analysis tests passed');
