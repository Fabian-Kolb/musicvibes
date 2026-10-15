// Turns one analyser spectrum (dB per FFT bin) into what the audio engine needs:
// a level per band and an onset strength ("flux") per band.
// Pure JavaScript without browser APIs, so the Node tests can feed it real spectra.
//
// How the bands are built, following how music analysis tools do it:
// - Power, not amplitude: each band's level is the mean power of its bins in dB, like a
//   band-pass meter. Narrow, peaky sounds such as a voice's harmonics count fully.
// - The bands follow what people hear as bass, voice and highs:
//   bass  35 to 100 Hz: kick drum and bass line. Stops below the fundamental of most
//         sung male voices, so a voice does not read as bass.
//   mid   500 Hz to 4 kHz: vocal formants, lead melody, snare crack. Left out is
//         100 to 500 Hz, where bass overtones, voice fundamentals and drum bodies mix.
//   high  5 to 16 kHz: hi-hats, cymbals, the "s" of a voice, air.
// - In the mids each octave counts equally (the band is the average of its octaves in
//   dB). Otherwise 500 Hz to 1 kHz decides alone, and there a bass guitar's overtones
//   are as loud as the voice.
// - Onsets are spectral flux: how much each bin rose against its very recent past,
//   averaged over the band. A new hit shows up even when the band was already busy.

export const BAND_EDGES = {
  bass: [[35, 100]],
  mid: [[500, 1000], [1000, 2000], [2000, 4000]],
  high: [[5000, 16000]],
};
// Bins whose rise counts as an onset in each band.
export const FLUX_EDGES = {
  bass: [40, 110],
  mid: [1000, 4000],
  high: [6000, 16000],
};
const TOP_HZ = 16000;
const LOW_HZ = 30;
const FLUX_TAU = 0.03; // seconds of past the flux compares against
const FLUX_RANGE = 60; // dB below the loudest bin that still count toward flux

const bins = (lo, hi, hz, n) => [Math.max(1, Math.ceil(lo / hz)), Math.min(n - 1, Math.ceil(hi / hz) - 1)];

export function createAnalysis(sampleRate, fftSize) {
  const n = fftSize / 2;
  const hz = sampleRate / fftSize;
  const range = (lo, hi) => bins(lo, hi, hz, n);
  const top = range(LOW_HZ, TOP_HZ);
  return {
    sampleRate, fftSize,
    top,
    bands: Object.fromEntries(Object.entries(BAND_EDGES).map(([k, parts]) => [k, parts.map(([lo, hi]) => range(lo, hi))])),
    flux: Object.fromEntries(Object.entries(FLUX_EDGES).map(([k, [lo, hi]]) => [k, range(lo, hi)])),
    power: new Float32Array(top[1] + 1),
    ref: new Float32Array(top[1] + 1).fill(-200),
    clipped: new Float32Array(top[1] + 1),
    primed: false,
  };
}

const DB_FLOOR = -160;

// spectrum: Float32Array of dB values per bin (AnalyserNode.getFloatFrequencyData).
export function analyse(A, spectrum, dt) {
  const [lo, hi] = A.top;
  let total = 0;
  let peak = DB_FLOOR;
  for (let i = lo; i <= hi; i++) {
    const db = spectrum[i] > DB_FLOOR ? spectrum[i] : DB_FLOOR;
    const p = Math.pow(10, db / 10);
    A.power[i] = p;
    total += p;
    if (db > peak) peak = db;
  }

  const out = { total: 10 * Math.log10(total + 1e-30), bass: 0, mid: 0, high: 0, flux: { bass: 0, mid: 0, high: 0 } };
  for (const k of ['bass', 'mid', 'high']) {
    let sum = 0;
    for (const [a, z] of A.bands[k]) {
      let s = 0;
      for (let i = a; i <= z; i++) s += A.power[i];
      sum += 10 * Math.log10(s / (z - a + 1) + 1e-30);
    }
    out[k] = sum / A.bands[k].length;
  }

  // Spectral flux: rise of each bin over an exponentially smoothed recent past.
  // Bins far below the loudest one are clamped so noise cannot produce onsets.
  const floor = peak - FLUX_RANGE;
  const k = 1 - Math.exp(-dt / FLUX_TAU);
  for (let i = lo; i <= hi; i++) {
    const v = spectrum[i] > floor ? spectrum[i] : floor;
    A.clipped[i] = v;
  }
  if (!A.primed) { A.ref.set(A.clipped); A.primed = true; }
  for (const b of ['bass', 'mid', 'high']) {
    const [a, z] = A.flux[b];
    let s = 0;
    for (let i = a; i <= z; i++) {
      const d = A.clipped[i] - A.ref[i];
      if (d > 0) s += d;
    }
    out.flux[b] = s / (z - a + 1);
  }
  for (let i = lo; i <= hi; i++) A.ref[i] += (A.clipped[i] - A.ref[i]) * k;
  return out;
}

export const SILENT_FRAME = Object.freeze({ total: -200, bass: -200, mid: -200, high: -200, flux: null, section: '' });

// The test signal produces linear band levels. This turns them into the same shape
// as a measured spectrum (flux is then derived from the levels by the engine).
export function fromLinear(raw) {
  const db = (v) => 20 * Math.log10(Math.max(v, 1e-8));
  return {
    total: 10 * Math.log10(raw.bass * raw.bass + raw.mid * raw.mid + raw.high * raw.high + 1e-16),
    bass: db(raw.bass), mid: db(raw.mid), high: db(raw.high),
    flux: null,
    section: raw.section || '',
  };
}
