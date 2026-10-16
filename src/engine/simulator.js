// Test signal: simulated songs with drum patterns, band levels and sections
// (groove, breakdown, drop). Lets you tune the look without music playing, and the
// Node tests use it to check the engine.

const P = (s) => s.split('').map(Number);

export const GENRES = [
  { id: 'techno', name: 'Techno', bpm: 130, kick: P('1000100010001000'), snare: P('0000000000000000'), hat: P('0010001000100010'),
    kickAmt: 1, snareAmt: 0, bass: 0.75, pump: 0.65, mid: 0.35, high: 0.55,
    sections: [['Groove', 16, 'normal', 1], ['Breakdown', 8, 'break', 1], ['Drop', 16, 'normal', 1.15]] },
  { id: 'house', name: 'House', bpm: 124, kick: P('1000100010001000'), snare: P('0000100000001000'), hat: P('0010001000100010'),
    kickAmt: 0.85, snareAmt: 0.5, bass: 0.65, pump: 0.5, mid: 0.6, high: 0.55,
    sections: [['Groove', 16, 'normal', 1], ['Breakdown', 8, 'break', 1], ['Drop', 16, 'normal', 1.12]] },
  { id: 'dnb', name: 'Drum & Bass', bpm: 174, kick: P('1000000000100000'), snare: P('0000100000001000'), hat: P('1111111111111111'),
    kickAmt: 0.85, snareAmt: 0.9, bass: 0.9, pump: 0.3, mid: 0.55, high: 0.7,
    sections: [['Groove', 16, 'normal', 1], ['Breakdown', 8, 'break', 1], ['Drop', 16, 'normal', 1.15]] },
  { id: 'hiphop', name: 'Hip-Hop', bpm: 90, kick: P('1000000100100000'), snare: P('0000100000001000'), hat: P('1010101010101010'),
    kickAmt: 0.95, snareAmt: 0.8, bass: 0.8, pump: 0.2, mid: 0.5, high: 0.35,
    sections: [['Strophe', 16, 'normal', 1], ['Hook', 8, 'normal', 1.08]] },
  { id: 'pop', name: 'Pop', bpm: 112, kick: P('1000100010001000'), snare: P('0000100000001000'), hat: P('1010101010101010'),
    kickAmt: 0.6, snareAmt: 0.6, bass: 0.5, pump: 0.2, mid: 0.75, high: 0.5,
    sections: [['Strophe', 8, 'normal', 0.82], ['Pre-Chorus', 4, 'normal', 0.9], ['Refrain', 8, 'normal', 1.15]] },
  { id: 'rock', name: 'Rock', bpm: 124, kick: P('1000000010100000'), snare: P('0000100000001000'), hat: P('1010101010101010'),
    kickAmt: 0.75, snareAmt: 1, bass: 0.6, pump: 0.1, mid: 0.9, high: 0.6,
    sections: [['Strophe', 8, 'normal', 0.85], ['Refrain', 8, 'normal', 1.12]] },
  { id: 'chill', name: 'Chill', bpm: 76, kick: P('1000000000100000'), snare: P('0000100000001000'), hat: P('1000100010001000'),
    kickAmt: 0.45, snareAmt: 0.35, bass: 0.4, pump: 0.1, mid: 0.6, high: 0.25,
    sections: [['Flow', 32, 'normal', 1]] },
];

export const genreById = (id) => GENRES.find((g) => g.id === id) || GENRES[0];

function stepEnv(pattern, step, stepLen, decay) {
  const si = Math.floor(step);
  for (let k = 0; k < 16; k++) {
    const s = si - k;
    if (pattern[((s % 16) + 16) % 16]) return Math.exp(-(step - s) * stepLen * decay);
  }
  return 0;
}

// Seconds from song start until the given section begins (first cycle).
export function sectionStart(g, name) {
  const bar = (60 / g.bpm) * 4;
  let t = 0;
  for (const s of g.sections) {
    if (s[0] === name) return t;
    t += s[1] * bar;
  }
  return -1;
}

export function simulate(g, t, rand = Math.random) {
  const spb = 60 / g.bpm;
  const beat = t / spb;
  const step = beat * 4;
  const stepLen = spb / 4;
  const total = g.sections.reduce((a, s) => a + s[1], 0);
  let bar = (beat / 4) % total;
  let sec = g.sections[0], prog = 0;
  for (const s of g.sections) { if (bar < s[1]) { sec = s; prog = bar / s[1]; break; } bar -= s[1]; }
  const kickE = stepEnv(g.kick, step, stepLen, 9);
  const snareE = stepEnv(g.snare, step, stepLen, 7);
  const hatE = stepEnv(g.hat, step, stepLen, 26);
  const kick = g.kickAmt * kickE;
  let bass = g.bass * (1 - g.pump * kickE * 0.8) + kick * 0.8;
  let mid = g.mid * (0.72 + 0.28 * Math.sin(beat * Math.PI / 8) ** 2) + snareE * 0.45 * g.snareAmt;
  let high = g.high * (0.35 + 0.65 * hatE) + snareE * 0.18 * g.snareAmt;
  if (sec[2] === 'break') {
    bass = g.bass * 0.05; // the low end is gone, as in real breakdowns
    mid *= 0.85;
    high = g.high * (0.25 + 0.85 * prog) + hatE * 0.1 * prog;
  }
  const gain = sec[3];
  const j = () => 0.95 + rand() * 0.1;
  return { bass: bass * gain * j(), mid: mid * gain * j(), high: high * gain * j(), section: sec[0] };
}
