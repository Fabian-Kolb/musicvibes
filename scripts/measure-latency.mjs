// How long from a kick in the sound to the reaction on screen. Not part of npm test:
// it prints numbers. Run: node scripts/measure-latency.mjs [fftSize]
import { createAnalyser } from './lib/webaudio.mjs';
import { SR, render, kick, bass, pad, hats, voice } from './lib/synth.mjs';
import { createAnalysis, analyse } from '../src/audio/analysis.js';
import { createEngine, updateEngine, DEFAULT_ENGINE_OPTIONS } from '../src/engine/audioEngine.js';
import { createVisualState, computeFrame, trailBlend } from '../src/render/frame.js';
import { DEFAULTS } from '../src/state/settings.js';

const fft = Number(process.argv[2]) || 4096;
const useFast = process.argv[3] !== 'single';
const DT = 1 / 60, HOP = Math.round(SR * DT);
const bpm = 120, beat = 60 / bpm;
const { pcm } = render([{ name: 'groove', secs: 20, parts: [kick({ bpm }), bass({ bpm }), pad(), hats({ bpm }), voice()] }]);
const an = createAnalyser({ sampleRate: SR, fftSize: fft });
const spec = new Float32Array(an.frequencyBinCount).fill(-Infinity);
const A = createAnalysis(SR, fft);
const fan = createAnalyser({ sampleRate: SR, fftSize: 2048, smoothing: 0 });
const fspec = new Float32Array(fan.frequencyBinCount).fill(-Infinity);
const fast = useFast ? { A: createAnalysis(SR, 2048), spectrum: fspec } : null;
// The analysis runs once; engine and picture then run once per setting below.
const frames = [];
for (let end = HOP; end <= pcm.length; end += HOP) {
  an.getFloatFrequencyData(spec, pcm, end);
  if (fast) fan.getFloatFrequencyData(fspec, pcm, end);
  frames.push({ t: end / SR, raw: analyse(A, spec, DT, fast) });
}

// A pixel that gets brighter with the bass, followed through the trails as the shader
// blends them (trailBlend). oldTrails: the plain blend from before, for comparison.
function run(settings, oldTrails = false) {
  const S = { ...DEFAULTS, ...settings };
  const E = createEngine();
  const V = createVisualState();
  const opts = { ...DEFAULT_ENGINE_OPTIONS, smoothing: S.smoothing };
  let px = null, bgPx = null;
  return frames.map(({ t, raw }) => {
    updateEngine(E, raw, DT, opts);
    const P = computeFrame(E, V, S, DT);
    const Pt = oldTrails ? { trail: P.trail, trailUp: P.trail } : P;
    // Glas shows the bass mainly as zoom, Minimal and Flächen as the size of the clouds.
    const bright = S.style === 'glass' ? -P.zoom : P.size;
    px = px === null ? bright : trailBlend(bright, px, Pt);
    bgPx = bgPx === null ? P.bg[0] : trailBlend(P.bg[0], bgPx, Pt);
    return { t, kick: E.kickEvent, punch: E.punch, size: P.size, zoom: P.zoom, px, bgPx, bass: E.meter[0], mid: E.meter[1], high: E.meter[2] };
  });
}

// Time until a value has made half its move toward this kick's peak, averaged over kicks.
function delays(rows) {
  const out = { kick: [], punch: [], size: [], zoom: [], px: [], bgPx: [], bass: [] };
  for (let k = 8; k < 36; k++) {
    const t0 = k * beat;
    const win = rows.filter((r) => r.t >= t0 && r.t < t0 + beat * 0.9);
    const hit = win.find((r) => r.kick);
    if (hit) out.kick.push(hit.t - t0);
    const half = (key, sign = 1) => {
      const v = win.map((r) => sign * r[key]);
      const lo = v[0], hi = Math.max(...v);
      const i = v.findIndex((x) => x >= lo + (hi - lo) / 2);
      return win[Math.max(0, i)].t - t0;
    };
    out.punch.push(half('punch'));
    out.size.push(half('size'));
    out.zoom.push(half('zoom', -1));
    out.px.push(half('px'));
    out.bgPx.push(half('bgPx'));
    out.bass.push(half('bass'));
  }
  return out;
}
const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 1000) : NaN);
const ms = (a) => (a.length ? `${avg(a)} ms` : '-');

const base = delays(run({}));
console.log(`fftSize ${fft}${fast ? ' + 2048 for onsets' : ''}: kick detected ${ms(base.kick)} (${base.kick.length}/28), punch half-rise ${ms(base.punch)}, size half-rise ${ms(base.size)}, zoom half-rise ${ms(base.zoom)}`);

// How much the meters move in a steady groove: 10th and 90th percentile.
const rows = run({});
const steady = rows.filter((r) => r.t > 4 * beat * 2);
const pct = (k, q) => { const v = steady.map((r) => r[k]).sort((a, b) => a - b); return v[Math.floor(q * (v.length - 1))]; };
for (const k of ['bass', 'mid', 'high']) console.log(`  meter ${k}: ${Math.round(pct(k, 0.1) * 100)} .. ${Math.round(pct(k, 0.9) * 100)} (10th..90th percentile)`);
console.log(`  bass meter half-rise after a kick: ${ms(base.bass)}`);

// On screen, per style and setting: when a pixel that brightens with the bass is half
// way there, through the trails (Schlieren), with the old plain blend and now.
const SETUPS = [
  ['Glas, Standard', { style: 'glass' }],
  ['Minimal, Standard', { style: 'minimal' }],
  ['Flächen, Standard', { style: 'flat' }],
  ['Chill Lounge', { style: 'flat', speed: 0.7, reactivity: 0.8, trails: 1.1, form: 0.8 }],
  ['Glas, Schlieren 1.2, Glättung 2.5', { style: 'glass', trails: 1.2, smoothing: 2.5 }],
  ['Glas, Schlieren 0, Glättung 0.4', { style: 'glass', trails: 0, smoothing: 0.4, reactivity: 1.8, beatPulse: 2, bassImpact: 1.8 }],
];
console.log('\nOn screen after a kick (half-rise of a pixel that brightens with the bass / with the ground pulse), before -> now:');
for (const [name, s] of SETUPS) {
  const was = delays(run(s, true)), now = delays(run(s));
  console.log(`  ${name.padEnd(36)} bass picture ${avg(was.px)} -> ${avg(now.px)} ms, ground pulse ${avg(was.bgPx)} -> ${avg(now.bgPx)} ms`);
}
