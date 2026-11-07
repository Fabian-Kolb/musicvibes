// How long from a kick in the sound to the reaction on screen. Not part of npm test:
// it prints numbers. Run: node scripts/measure-latency.mjs [fftSize]
import { createAnalyser } from './lib/webaudio.mjs';
import { SR, render, kick, bass, pad, hats, voice } from './lib/synth.mjs';
import { createAnalysis, analyse } from '../src/audio/analysis.js';
import { createEngine, updateEngine, DEFAULT_ENGINE_OPTIONS } from '../src/engine/audioEngine.js';
import { createVisualState, computeFrame } from '../src/render/frame.js';
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
const E = createEngine();
const V = createVisualState();
const rows = [];
for (let end = HOP; end <= pcm.length; end += HOP) {
  an.getFloatFrequencyData(spec, pcm, end);
  if (fast) fan.getFloatFrequencyData(fspec, pcm, end);
  updateEngine(E, analyse(A, spec, DT, fast), DT, DEFAULT_ENGINE_OPTIONS);
  const P = computeFrame(E, V, DEFAULTS, DT);
  rows.push({ t: end / SR, kick: E.kickEvent, punch: E.punch, size: P.size, zoom: P.zoom, bass: E.meter[0], mid: E.meter[1], high: E.meter[2] });
}
const delays = { kick: [], punchPeak: [], sizePeak: [], zoomPeak: [], bassPeak: [] };
for (let k = 8; k < 36; k++) {
  const t0 = k * beat;
  const win = rows.filter((r) => r.t >= t0 && r.t < t0 + beat * 0.9);
  const hit = win.find((r) => r.kick);
  if (hit) delays.kick.push(hit.t - t0);
  // Time until the value has made half its move toward this kick's peak.
  const peak = (key, sign = 1) => {
    const v = win.map((r) => sign * r[key]);
    const lo = v[0], hi = Math.max(...v);
    const i = v.findIndex((x) => x >= lo + (hi - lo) / 2);
    return win[Math.max(0, i)].t - t0;
  };
  delays.punchPeak.push(peak('punch'));
  delays.sizePeak.push(peak('size'));
  delays.zoomPeak.push(peak('zoom', -1));
  delays.bassPeak.push(peak('bass'));
}
const ms = (a) => (a.length ? `${Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 1000)} ms` : '-');
console.log(`fftSize ${fft}${fast ? ' + 2048 for onsets' : ''}: kick detected ${ms(delays.kick)} (${delays.kick.length}/28), punch half-rise ${ms(delays.punchPeak)}, size half-rise ${ms(delays.sizePeak)}, zoom half-rise ${ms(delays.zoomPeak)}`);

// How much the meters move in a steady groove: 10th and 90th percentile.
const steady = rows.filter((r) => r.t > 4 * beat * 2);
const pct = (k, q) => { const v = steady.map((r) => r[k]).sort((a, b) => a - b); return v[Math.floor(q * (v.length - 1))]; };
for (const k of ['bass', 'mid', 'high']) console.log(`  meter ${k}: ${Math.round(pct(k, 0.1) * 100)} .. ${Math.round(pct(k, 0.9) * 100)} (10th..90th percentile)`);
console.log(`  bass meter half-rise after a kick: ${ms(delays.bassPeak)}`);
