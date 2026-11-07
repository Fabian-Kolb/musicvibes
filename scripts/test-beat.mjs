// Tests for the beat clock: tempo, beats on time, nothing between the beats, no clock
// without a beat, letting go in a breakdown and finding a new tempo.
// Beats where kick and bass are hard to tell apart come from lib/beats.mjs.
// Run: npm test
import assert from 'node:assert/strict';
import { check, finish } from './lib/check.mjs';
import { createAnalyser } from './lib/webaudio.mjs';
import { SR, render, voice, pad, bass, hats, snare } from './lib/synth.mjs';
import { BEATS, kickAt, freeVoice } from './lib/beats.mjs';
import { createAnalysis, analyse } from '../src/audio/analysis.js';
import { createEngine, updateEngine, DEFAULT_ENGINE_OPTIONS } from '../src/engine/audioEngine.js';

// Plays sections through both analysers and the engine, like the app does.
function play(sections, dt = 1 / 60) {
  const { pcm } = render(sections);
  const hop = Math.round(SR * dt);
  const an = createAnalyser({ sampleRate: SR });
  const spec = new Float32Array(an.frequencyBinCount).fill(-Infinity);
  const fan = createAnalyser({ sampleRate: SR, fftSize: 2048, smoothing: 0 });
  const A = createAnalysis(SR, an.fftSize);
  const fast = { A: createAnalysis(SR, 2048), spectrum: new Float32Array(fan.frequencyBinCount).fill(-Infinity) };
  const E = createEngine();
  const rows = [];
  for (let end = hop; end <= pcm.length; end += hop) {
    an.getFloatFrequencyData(spec, pcm, end);
    fan.getFloatFrequencyData(fast.spectrum, pcm, end);
    updateEngine(E, analyse(A, spec, dt, fast), dt, DEFAULT_ENGINE_OPTIONS);
    rows.push({ t: end / SR, locked: E.locked, pulse: E.pulse, event: E.pulseEvent, bpm: E.beat.bpm, conf: E.beat.conf });
  }
  return { rows, E };
}

const withKicks = (b, secs) => [{ name: b.name, secs, parts: [kickAt(b.bpm, b.kicks), ...b.parts()] }];
const POP = { name: 'Pop 120', bpm: 120, kicks: [0, 1, 2, 3], parts: () => [bass({ bpm: 120 }), pad(), hats({ bpm: 120 }), voice(), snare({ bpm: 120 })] };
const HIPHOP = { name: 'Hip-Hop 90', bpm: 90, kicks: [0, 1.75, 2.5], parts: () => [bass({ bpm: 90 }), hats({ bpm: 90 }), snare({ bpm: 90 }), voice({ f0: 130 })] };

// Pulses against the true beats from `from` seconds on: hits, misses, extras, offset.
function onBeat(rows, bpm, from, to) {
  const beat = 60 / bpm;
  const truth = [];
  for (let k = Math.ceil(from / beat); k * beat < to; k++) truth.push(k * beat);
  const events = rows.filter((r) => r.event && r.t >= truth[0] - beat / 2 && r.t < truth[truth.length - 1] + beat / 2).map((r) => r.t);
  const offs = [];
  const hit = truth.filter((t) => { const e = events.find((x) => Math.abs(x - t) < 0.04); if (e !== undefined) offs.push(e - t); return e !== undefined; });
  const extra = events.filter((e) => !truth.some((t) => Math.abs(e - t) < 0.04));
  const mean = offs.reduce((a, b) => a + b, 0) / Math.max(1, offs.length);
  return { hit: hit.length, of: truth.length, extra: extra.length, offset: mean };
}

check('Tempo and beat: every beat gets its pulse, on time, none between, also in fast techno, offbeat bass, breaks and halftime', () => {
  for (const b of [POP, HIPHOP, ...BEATS]) {
    const { rows, E } = play(withKicks(b, 20));
    assert.ok(Math.abs(E.beat.bpm / b.bpm - 1) < 0.01, `${b.name}: ${E.beat.bpm.toFixed(1)} BPM`);
    const r = onBeat(rows, b.bpm, 8, 20);
    assert.ok(r.hit >= r.of - 1, `${b.name}: only ${r.hit} of ${r.of} beats pulsed`);
    assert.equal(r.extra, 0, `${b.name}: ${r.extra} pulses between the beats`);
    // A frame or so early, so that it shows on the beat (BEAT_LEAD).
    assert.ok(r.offset > -0.03 && r.offset <= 0, `${b.name}: pulse ${Math.round(r.offset * 1000)} ms from the beat`);
  }
});

check('A bass note or an offbeat between the beats only gives a small push', () => {
  for (const b of [BEATS[0], BEATS[1], BEATS[4]]) {
    const { rows } = play(withKicks(b, 16));
    const beat = 60 / b.bpm;
    let worst = 0;
    for (let k = Math.ceil(8 / beat); (k + 1) * beat < 15.5; k++) {
      const w = rows.filter((x) => x.t > (k + 0.25) * beat && x.t < (k + 0.8) * beat);
      worst = Math.max(worst, Math.max(...w.map((x) => x.pulse)) - w[0].pulse);
    }
    assert.ok(worst < 0.25, `${b.name}: the pulse rises by ${worst.toFixed(2)} between the beats`);
  }
});

check('No beat, no clock: a freely sung voice or a pad alone never locks', () => {
  for (const parts of [[freeVoice(voice()), pad()], [pad()]]) {
    const { rows } = play([{ name: 'free', secs: 16, parts }]);
    assert.ok(rows.every((r) => !r.locked), 'locked without a beat');
  }
});

check('Breakdown: the clock lets go within 3 s; the next song\'s tempo is found within 6 s', () => {
  const [house, techno] = BEATS;
  const { rows } = play([...withKicks(house, 12), { name: 'break', secs: 8, parts: [pad(), freeVoice(voice())] }, ...withKicks(techno, 14)]);
  assert.ok(rows.filter((r) => r.t > 8 && r.t < 12).every((r) => r.locked), 'not locked in the first song');
  const free = rows.find((r) => r.t > 12 && !r.locked);
  assert.ok(free && free.t < 15, `still locked at ${free ? free.t.toFixed(1) : 'the end'} s`);
  const back = rows.find((r) => r.t > 20 && r.locked && Math.abs(r.bpm / 145 - 1) < 0.01);
  assert.ok(back && back.t < 26, `145 BPM found at ${back ? back.t.toFixed(1) : 'never'} s`);
  const r = onBeat(rows, 145, 28, 34);
  assert.ok(r.hit >= r.of - 1 && r.extra === 0, `after the switch ${r.hit}/${r.of} beats, ${r.extra} extra`);
});

check('Same tempo and beats at 144 and 30 frames per second', () => {
  const b = BEATS[1];
  for (const dt of [1 / 144, 1 / 30]) {
    const { rows, E } = play(withKicks(b, 16), dt);
    assert.ok(Math.abs(E.beat.bpm / b.bpm - 1) < 0.01, `${Math.round(1 / dt)} fps: ${E.beat.bpm.toFixed(1)} BPM`);
    const r = onBeat(rows, b.bpm, 8, 16);
    assert.ok(r.hit >= r.of - 1 && r.extra === 0, `${Math.round(1 / dt)} fps: ${r.hit}/${r.of} beats, ${r.extra} extra`);
  }
});

finish('beat');
