// Beats where kick and bass are hard to tell apart: bass on the offbeat, a rolling
// bass between fast kicks, a held bass, broken kick patterns and a halftime wobble bass.
// Each case knows where its kicks are, so the tests can count hits and misses.
import { SR, kick, hats, pad } from './synth.mjs';

let seed = 4242;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647 - 0.5;
};

// The latest start at or before bt among positions (in seconds) of a repeating bar.
function since(bt, starts, bar) {
  let best = -Infinity;
  for (const s of starts) if (bt >= s && s > best) best = s;
  return best === -Infinity ? bt - (starts[starts.length - 1] - bar) : bt - best;
}

// Kicks at the given positions in each bar, in beats.
export function kickAt(bpm, pos, barBeats = 4) {
  const beat = 60 / bpm, bar = beat * barBeats;
  const starts = pos.map((p) => p * beat);
  const one = kick({ bpm: 1e-6 }); // one kick that never repeats, played at each start
  return (t) => one(since(t % bar, starts, bar));
}

// Bass notes at the given positions (beats), each `len` beats long. wobble (Hz) sweeps
// the filter like a dubstep bass.
export function bassAt(bpm, pos, len, { f = 55, gain = 0.155, wobble = 0, barBeats = 4 } = {}) {
  const beat = 60 / bpm, bar = beat * barBeats;
  let phase = 0;
  return (t) => {
    const bt = t % bar;
    let on = 0;
    for (const p of pos) {
      const s = p * beat, e = s + len * beat;
      if (bt >= s && bt < e) on = Math.min(1, (bt - s) / 0.005, (e - bt) / 0.01);
    }
    phase += (2 * Math.PI * f) / SR;
    const cut = wobble ? 150 + 1200 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t * wobble)) : 500;
    let v = 0;
    for (let k = 1; k * f < 2500; k++) v += (Math.sin(k * phase) / k) * Math.exp(-(k * f) / cut);
    return v * gain * on;
  };
}

// Claps at the given positions (beats): a burst of noise.
export function clapAt(bpm, pos, barBeats = 4) {
  const beat = 60 / bpm, bar = beat * barBeats;
  const starts = pos.map((p) => p * beat);
  return (t) => {
    const st = since(t % bar, starts, bar);
    return st < 0.25 ? rnd() * Math.exp(-st / 0.06) : 0;
  };
}

const SIXTEENTHS_BETWEEN = [0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2.25, 2.5, 2.75, 3.25, 3.5, 3.75];

// name, tempo, kick positions per 4/4 bar, the rest of the beat.
export const BEATS = [
  { name: 'House 124, Bass auf dem Offbeat', bpm: 124, kicks: [0, 1, 2, 3],
    parts: () => [bassAt(124, [0.5, 1.5, 2.5, 3.5], 0.4), hats({ bpm: 124 }), pad()] },
  { name: 'Techno 145, rollender Bass', bpm: 145, kicks: [0, 1, 2, 3],
    parts: () => [bassAt(145, SIXTEENTHS_BETWEEN, 0.2), hats({ bpm: 145 }), clapAt(145, [1, 3])] },
  { name: 'Hardtechno 155, Bass durchgehend', bpm: 155, kicks: [0, 1, 2, 3],
    parts: () => [bassAt(155, [0], 4, { f: 49, gain: 0.12 }), hats({ bpm: 155 })] },
  { name: 'Breakbeat 130, Kicks versetzt', bpm: 130, kicks: [0, 1.5, 2.5],
    parts: () => [bassAt(130, [0, 1.5, 2.5], 0.6), hats({ bpm: 130 }), clapAt(130, [1, 3])] },
  { name: 'Dubstep 140 halftime, Wobble-Bass', bpm: 140, kicks: [0, 2.75],
    parts: () => [bassAt(140, [0], 4, { f: 41.2, gain: 0.16, wobble: (140 / 60) * 2 }), clapAt(140, [2]), hats({ bpm: 140 })] },
];

// Kick times (s) of a beat within [from, to).
export function kickTimes(b, from, to) {
  const beat = 60 / b.bpm, bar = beat * 4;
  const out = [];
  for (let n = 0; n * bar < to; n++) for (const p of b.kicks) { const t = n * bar + p * beat; if (t >= from && t < to) out.push(t); }
  return out;
}

// Music without a beat: a voice sung freely (syllables drift in time) over a held pad.
export function freeVoice(v) {
  return (t) => v(t + 0.12 * Math.sin((2 * Math.PI * t) / 3.1) + 0.09 * Math.sin((2 * Math.PI * t) / 1.37));
}

// A kick track like in a real song: slightly off the grid (jitter in seconds), a
// fill every `fillEvery` bars where the kick stops for the last two beats, and ghost
// hits on random sixteenths. Quieter than the others by `gain`.
export function messyKick(bpm, { jitter = 0.008, fillEvery = 4, ghost = 0.12, gain = 0.7 } = {}) {
  const beat = 60 / bpm, step = beat / 4;
  const one = kick({ bpm: 1e-6 });
  let s = 777;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // Hit times, made once for 120 s.
  const hits = [];
  for (let i = 0; i * step < 120; i++) {
    const bar = Math.floor(i / 16), inBar = i % 16;
    const onBeat = inBar % 4 === 0;
    const fill = (bar % fillEvery) === fillEvery - 1 && inBar >= 8;
    if ((onBeat && !fill) || (!onBeat && r() < ghost)) hits.push(i * step + (r() - 0.5) * 2 * jitter);
  }
  let k = 0;
  return (t) => {
    while (k + 1 < hits.length && hits[k + 1] <= t) k++;
    if (hits[k] > t) return 0;
    return one(t - hits[k]) * gain;
  };
}
