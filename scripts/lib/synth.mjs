// Small synthesizer for the analysis tests: voices with formants, a synth bass line,
// kick, snare, hi-hats and a pad, placed into a mono 48 kHz buffer section by section.
// The point is realistic spectra (harmonics, formants, broadband hits) and a mix
// balance like a pop song (voice, bass and kick around -18 dBFS RMS), not nice sound.

export const SR = 48000;

let seed = 12345;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647 - 0.5;
};

const db = (x) => Math.pow(10, x / 20);

// Vowel formants (Hz) a voice moves through, one per syllable.
const VOWELS = [[730, 1090, 2440], [270, 2290, 3010], [530, 1840, 2480], [570, 840, 2410], [300, 870, 2240]];

function formantGain(f, F) {
  const g = (c, bw) => Math.exp(-(((f - c) / bw) ** 2));
  return 0.06 + g(F[0], 130) + 0.6 * g(F[1], 180) + 0.35 * g(F[2], 260);
}

// A sung line: syllables of 0.35 s, phrases of 2.4 s with 0.5 s breath, vibrato,
// changing vowels and pitch, an "s" or "t" every few syllables.
export function voice({ f0 = 220, consonants = true } = {}) {
  const melody = [1, 9 / 8, 5 / 4, 9 / 8, 3 / 2, 4 / 3, 5 / 4, 1];
  let phase = 0;
  let noiseHp = 0, prev = 0;
  let amps = null, ampsIdx = -1;
  return (t) => {
    const phraseT = t % 2.9;
    if (phraseT > 2.4) return 0;
    const syl = Math.floor(phraseT / 0.35);
    const sylT = phraseT - syl * 0.35;
    const idx = Math.floor(t / 2.9) * 7 + syl;
    const base = f0 * melody[idx % melody.length];
    if (idx !== ampsIdx) {
      // Harmonic strengths for this syllable's vowel and pitch.
      const F = VOWELS[idx % VOWELS.length];
      amps = [];
      for (let k = 1; k * base < 6000; k++) amps.push(formantGain(k * base, F) / Math.pow(k, 0.7));
      ampsIdx = idx;
    }
    const f = base * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t));
    phase += (2 * Math.PI * f) / SR;
    const env = Math.min(1, sylT / 0.03, phraseT / 0.06, (2.4 - phraseT) / 0.08) * (0.75 + 0.25 * Math.sin(idx));
    let v = 0;
    for (let k = 0; k < amps.length; k++) v += amps[k] * Math.sin((k + 1) * phase);
    v *= 0.315 * env;
    // Sibilant: high-passed noise at the start of every third syllable.
    if (consonants && idx % 3 === 0 && sylT < 0.07) {
      const n = rnd();
      noiseHp = 0.6 * (noiseHp + n - prev);
      prev = n;
      v += noiseHp * 0.57 * (1 - sylT / 0.07);
    }
    return v;
  };
}

// Pad: a held chord with soft harmonics (keys, strings, guitar).
export function pad({ root = 220 } = {}) {
  const freqs = [root, root * 1.26, root * 1.5, root * 2];
  return (t) => {
    let v = 0;
    for (const f of freqs) for (let k = 1; k <= 6; k++) v += Math.sin(2 * Math.PI * f * k * t + k) / (k * k);
    return v * 0.03 * (0.8 + 0.2 * Math.sin(t * 0.7));
  };
}

// Bass line: a saw-like note per beat, upper harmonics rolled off like a filtered synth bass.
export function bass({ bpm = 120, notes = [55, 55, 65.4, 49] } = {}) {
  const beat = 60 / bpm;
  let phase = 0;
  return (t) => {
    const b = Math.floor(t / beat);
    const bt = t - b * beat;
    const f = notes[b % notes.length];
    phase += (2 * Math.PI * f) / SR;
    const env = Math.min(1, bt / 0.01) * (bt < beat * 0.85 ? 1 : Math.max(0, 1 - (bt - beat * 0.85) / 0.02));
    let v = 0;
    for (let k = 1; k * f < 2500; k++) v += (Math.sin(k * phase) / k) * Math.exp(-(k * f) / 500);
    return v * 0.155 * env;
  };
}

// Kick: pitch sweep from 150 Hz down to 50 Hz with a fast decay, plus a short click.
export function kick({ bpm = 120, every = 1 } = {}) {
  const beat = (60 / bpm) * every;
  return (t) => {
    const kt = t % beat;
    const f = 50 + 100 * Math.exp(-kt / 0.03);
    const ph = 2 * Math.PI * (50 * kt + 100 * 0.03 * (1 - Math.exp(-kt / 0.03)));
    return 0.42 * Math.sin(ph) * Math.exp(-kt / 0.18) * (f > 0 ? 1 : 0) + (kt < 0.004 ? rnd() * 0.18 : 0);
  };
}

// Hi-hats on every eighth note: bright noise with a 40 ms decay.
export function hats({ bpm = 120 } = {}) {
  const step = 60 / bpm / 2;
  let a = 0, b = 0, prev = 0;
  return (t) => {
    const ht = t % step;
    const n = rnd();
    a = 0.4 * (a + n - prev);
    prev = n;
    b = 0.4 * (b + a);
    return (a - b * 0.3) * 0.9 * Math.exp(-ht / 0.04);
  };
}

// Snare on beats 2 and 4: tone body plus a noisy crack.
export function snare({ bpm = 120 } = {}) {
  const bar = (60 / bpm) * 2;
  return (t) => {
    const st = (t + 60 / bpm) % bar;
    const env = Math.exp(-st / 0.09);
    return (0.38 * Math.sin(2 * Math.PI * 185 * st) + 0.7 * rnd()) * env;
  };
}

export function noise({ rmsDb = -80 } = {}) {
  const a = db(rmsDb) * Math.sqrt(12);
  return () => rnd() * a;
}

// sections: [{ secs, parts: [generator, ...], gainDb }]
export function render(sections) {
  const total = sections.reduce((a, s) => a + Math.round(s.secs * SR), 0);
  const out = new Float32Array(total);
  const marks = [];
  let pos = 0;
  for (const s of sections) {
    const n = Math.round(s.secs * SR);
    const g = db(s.gainDb || 0);
    for (const part of s.parts) {
      for (let i = 0; i < n; i++) out[pos + i] += part((pos + i) / SR) * g;
    }
    marks.push({ name: s.name, start: pos / SR, end: (pos + n) / SR });
    pos += n;
  }
  return { pcm: out, marks };
}
