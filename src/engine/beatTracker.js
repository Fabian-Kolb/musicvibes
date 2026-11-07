// Beat tracker: the tempo (BPM), where the beats fall, and which beat of the bar is
// the 1. It keeps a beat clock running between the kicks, the way DJ software and
// beat-synced visuals do, so the picture can pulse on every beat even when a kick is
// buried in the mix, and a bass note between the kicks does not count as a beat.
// Pure JavaScript without browser APIs, fed once per frame by the audio engine.
//
// - Onset strength: how much the sound rose just now, per band against its own
//   recent average, bass (kicks) weighted most; mids and highs (snare, hi-hats)
//   help to find the tempo.
// - Tempo: autocorrelation of the last 8 seconds of onset strength, read at each
//   candidate beat length and its multiples (a comb), weighted toward 125 BPM so
//   that half and double tempo are told apart. Between 70 and 180 BPM. A new tempo
//   has to win a few times in a row before it replaces the old one.
// - Phase: where the onsets of the last beats line up best for that tempo. The beat
//   clock follows it gently (a phase-locked loop): one missed or extra hit barely
//   moves it.
// - Confidence: how clearly the onsets repeat at that tempo. Low for ambient music, a
//   voice alone or a breakdown without beat; the engine then falls back to reacting
//   to single hits.
// - Bar: the beat that most often has a kick and no snare counts as the 1, and the
//   first beat after a breakdown starts a bar.

const RATE = 100; // onset strength samples per second
const N = RATE * 8; // history
const MIN_BPM = 70, MAX_BPM = 180;
const MAX_LAG = Math.ceil((4 * 60 * RATE) / MIN_BPM) + 2;
const PRIOR_BPM = 125, PRIOR_OCT = 0.6; // tempo preference: centre and width in octaves
const COMB_BEATS = 8; // past beats the phase search lines up: two bars, so every beat of the bar counts alike
const PLL_GAIN = 1.5; // per second: how fast the clock moves toward the measured phase
const STABLE_FOR = 2; // seconds the same tempo must come out before the clock starts
const CHALLENGE_FOR = 4; // seconds a different tempo must win before it replaces the held one
const HIT_MIN = Number(globalThis.process?.env?.HMIN || 1.5), HIT_SPAN = 2; // dB per bin: bass flux that counts as a beat still playing
const HOLD_MAX = 30; // seconds without any beat before the held tempo is given up
// The onsets arrive about 20 ms after the sound (analysis window), and the picture
// shows a frame later: the beat clock fires this much early, so pulses land on the beat.
export const BEAT_LEAD = 0.03;

export function createBeatTracker() {
  return {
    odf: new Float32Array(N), bassOdf: new Float32Array(N), midOdf: new Float32Array(N), rawBass: new Float32Array(N),
    head: 0, filled: 0, slotT: 0, acc: 0, accBass: 0, accMid: 0, accRaw: 0, bassHits: [],
    avg: [0.5, 0.5, 0.5],
    ac: new Float64Array(MAX_LAG + 2), lin: new Float64Array(N),
    nextEstimate: 0, est: 0, stable: 0, seed: 0, challenger: 0, challengeFor: 0,
    state: 'search', since: 0, quality: 0, snap: false, offFor: 0, misfit: 0, heldSince: 0, fits: [], fitChecks: [],
    bpm: 0, period: 0.5, phase: 0, conf: 0, periodicity: 0, strength: 0,
    event: false, downbeat: false, index: 0, barBeat: 0, lastEvent: -10, now: 0,
    slots: [0, 0, 0, 0], one: 0, oneFixed: false, pending: [], quietFor: 0,
    hold: 0, bassEvidence: 0, lastBeatNo: null,
  };
}

const wrap = (x) => x - Math.round(x); // into [-0.5, 0.5)

// Value of a history buffer `back` samples before the newest one, interpolated.
function past(T, buf, back) {
  if (back < 0 || back > T.filled - 2) return 0;
  const i = Math.floor(back), f = back - i;
  const a = buf[(T.head - 1 - i + N) % N], b = buf[(T.head - 2 - i + N) % N];
  return a + (b - a) * f;
}

function estimateTempo(T) {
  const n = T.filled;
  if (n < RATE * 3) return;
  // Oldest first.
  // High-passed: each sample against the average of the 0.3 s around it, so slow
  // swells (a pad, a voice) do not look periodic; only peaks count.
  const H = 15;
  let win = 0, cnt = 0;
  const v = (i) => T.odf[(T.head - n + i + N) % N];
  for (let i = 0; i < Math.min(n, H); i++) { win += v(i); cnt++; }
  for (let i = 0; i < n; i++) {
    if (i + H < n) { win += v(i + H); cnt++; }
    if (i - H - 1 >= 0) { win -= v(i - H - 1); cnt--; }
    T.lin[i] = Math.max(0, v(i) - win / cnt);
  }
  let m2 = 0;
  for (let i = 0; i < n; i++) m2 += T.lin[i];
  m2 /= n;
  for (let i = 0; i < n; i++) T.lin[i] -= m2;
  const maxLag = Math.min(MAX_LAG, n - RATE);
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += T.lin[i] * T.lin[i - lag];
    T.ac[lag] = s / (n - lag);
  }
  // Slightly widened peaks, so a tempo between two grid points is not missed.
  const at = (l) => {
    if (l > maxLag) return 0;
    const i = Math.floor(l), f = l - i;
    const v = (j) => 0.25 * T.ac[Math.max(0, j - 1)] + 0.5 * T.ac[j] + 0.25 * T.ac[Math.min(maxLag + 1, j + 1)];
    return v(i) + (v(i + 1) - v(i)) * f;
  };
  const score = (bpm) => {
    const P = (60 * RATE) / bpm;
    let s = 0;
    for (let k = 1; k <= 4; k++) s += at(k * P);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / PRIOR_BPM) / PRIOR_OCT) ** 2);
    return Math.max(0, s) * prior;
  };
  let best = 0, bestS = 0;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
    const s = score(bpm);
    if (s > bestS) { bestS = s; best = bpm; }
  }
  if (!best) { T.periodicity = 0; return; }
  // Finer: parabola through the neighbours.
  const l = score(best - 0.5), r = score(best + 0.5), d = l - 2 * bestS + r;
  if (d < 0) best += clampN(0.5 * 0.5 * (l - r) / d, -0.25, 0.25);
  // How periodic the last 4 seconds are at that tempo (0 none, 1 perfectly), so a new
  // song locks soon after its tempo is found, without waiting for the whole history.
  const P = (60 * RATE) / best, m = Math.min(n, RATE * 4);
  let e = 0, c1 = 0, c2 = 0;
  const lv = (i) => {
    if (i < 0) return 0;
    const j = Math.floor(i), f = i - j;
    return T.lin[j] + ((T.lin[j + 1] ?? T.lin[j]) - T.lin[j]) * f;
  };
  for (let i = n - m; i < n; i++) {
    e += T.lin[i] * T.lin[i];
    c1 += T.lin[i] * Math.max(lv(i - P - 1), lv(i - P), lv(i - P + 1));
    c2 += T.lin[i] * Math.max(lv(i - 2 * P - 1), lv(i - 2 * P), lv(i - 2 * P + 1));
  }
  T.periodicity = Math.max(0, Math.min(c1, c2)) / (e || 1e-9);

  T.est = best;
  chooseTempo(T, best);
}

const near = (a, b, tol) => Math.abs(Math.log2(a / b)) < tol;
// Half, double, two thirds or one and a half of a tempo: the same song felt differently
// (a halftime section, triplets), never a reason to change the tempo.
const related = (a, b) => [0.5, 2 / 3, 1, 1.5, 2].some((r) => near(a * r, b, 0.02));

// Called four times a second with the newest estimate.
function chooseTempo(T, best) {
  if (T.state === 'search') {
    // The same value again and again: that is the song's tempo.
    if (T.bpm && near(best, T.bpm, 0.015)) {
      T.stable += 0.25;
      T.bpm += (best - T.bpm) * 0.3;
    } else if (T.seed && near(best, T.seed, 0.02)) {
      T.bpm = T.seed;
      T.stable = Math.max(T.stable, STABLE_FOR);
    } else {
      T.bpm = best;
      T.stable = 0;
    }
    return;
  }
  if (near(best, T.bpm, 0.02)) {
    T.bpm += (best - T.bpm) * 0.1; // small drifts
    T.challenger = 0;
  } else if (!related(best, T.bpm) && T.periodicity > 0.35) {
    // A clearly different tempo, the same for several seconds: a new song.
    if (T.challenger && near(best, T.challenger, 0.015)) T.challengeFor += 0.25;
    else { T.challenger = best; T.challengeFor = 0; }
    if (T.challengeFor >= CHALLENGE_FOR) {
      T.bpm = best;
      T.challenger = 0;
      T.state = 'locked';
      T.since = T.now;
      T.snap = true;
    }
  }
}

const clampN = (x, a, b) => Math.min(b, Math.max(a, x));

// Where the last beat was, in samples back from the newest onset strength.
function measurePhase(T) {
  const P = (60 * RATE) / T.bpm;
  let best = 0, bestS = -1, sum = 0, cnt = 0;
  const comb = (ph) => {
    let s = 0, w = 1;
    for (let k = 0; k < COMB_BEATS; k++) { s += w * past(T, T.odf, ph + k * P); w *= 0.95; }
    return s;
  };
  for (let ph = 0; ph < P; ph += 1) {
    const s = comb(ph);
    sum += s; cnt++;
    if (s > bestS) { bestS = s; best = ph; }
  }
  const l = comb(best - 1), r = comb(best + 1), d = l - 2 * bestS + r;
  const ph = d < 0 ? best + clampN((0.5 * (l - r)) / d, -0.5, 0.5) : best;
  const mean = sum / cnt;
  // How far the beats stand above the average onset strength (1: not at all).
  let wsum = 0, w = 1;
  for (let k = 0; k < COMB_BEATS; k++) { wsum += w; w *= 0.95; }
  T.strength = bestS / wsum / Math.max(0.05, mean / wsum);
  return ph / P;
}

// flux: { bass, mid, high } spectral flux of this frame per band (analysis.js);
// quiet: the input is below the silence floor.
export function updateBeat(T, flux, dt, quiet) {
  T.now += dt;
  T.event = false;
  T.downbeat = false;

  // Onset strength: each band against its own recent average, bass first.
  const raw = [flux.bass, flux.mid, flux.high];
  const rel = raw.map((v, i) => {
    T.avg[i] += (v - T.avg[i]) * (1 - Math.exp(-dt / 3));
    return v / Math.max(0.05, T.avg[i]);
  });
  const o = quiet ? 0 : rel[0] + rel[1] + 0.5 * rel[2];
  T.acc = Math.max(T.acc, o);
  T.accBass = Math.max(T.accBass, quiet ? 0 : rel[0]);
  T.accMid = Math.max(T.accMid, quiet ? 0 : rel[1]);
  T.accRaw = Math.max(T.accRaw, quiet ? 0 : raw[0]);
  T.slotT += dt * RATE;
  while (T.slotT >= 1) {
    T.odf[T.head] = T.acc; T.bassOdf[T.head] = T.accBass; T.midOdf[T.head] = T.accMid; T.rawBass[T.head] = T.accRaw;
    T.head = (T.head + 1) % N;
    T.filled = Math.min(N, T.filled + 1);
    T.slotT -= 1;
    if (T.slotT < 1) { T.acc = 0; T.accBass = 0; T.accMid = 0; T.accRaw = 0; }
  }

  T.quietFor = quiet ? T.quietFor + dt : 0;
  T.nextEstimate -= dt;
  if (T.nextEstimate <= 0) { estimateTempo(T); T.nextEstimate = 0.25; }
  if (!T.bpm) return T;
  T.period = 60 / T.bpm;

  // How much this looks like a beat right now: the tempo repeats clearly and the
  // beats stand out. And whether the last beats themselves still had onsets (median
  // of four, so one loud word on a beat does not count): low in a breakdown.
  const measured = measurePhase(T);
  T.quality = clampN((T.periodicity - 0.1) / 0.25, 0, 1) * clampN((T.strength - 1.8) / 1.2, 0, 1);
  // Beat still there: at least two of the last four beats had kicks or bass. So the
  // picture goes quiet three beats after the bass stops.
  const h = [...T.bassHits].sort((x, y) => y - x);
  T.bassEvidence = h.length < 4 ? 0 : h[1];
  T.hold = clampN((T.bassEvidence - HIT_MIN) / HIT_SPAN, 0, 1);
  const q = T.quality * (T.state === 'search' ? 1 : Math.max(0.3, T.hold));
  T.conf += (q - T.conf) * (1 - Math.exp(-dt / (q > T.conf ? 0.6 : 1.5)));

  const misfit = T.state !== 'search' && T.est && !related(T.est, T.bpm) && T.periodicity > 0.5 && T.strength < 2.4;
  T.misfit = misfit ? T.misfit + dt : 0;

  // States. Search: no beat shown yet. Locked: the clock runs and the picture pulses.
  // Held: no beat to hear for now (a breakdown, a fill); the clock keeps running
  // quietly and is ready when the beat comes back. Only a pause between songs, a new
  // song, a clearly different tempo or half a minute without beat end it.
  if (T.quietFor > 2) {
    if (T.state !== 'search') resetBeat(T);
  } else if (T.state === 'search') {
    // A tempo remembered for this song needs less proof: beats on its grid are enough.
    const seeded = T.seed && near(T.bpm, T.seed, 0.02) && T.strength > 3;
    if (T.hold > 0.6 && (seeded || (T.stable >= STABLE_FOR && T.conf > 0.4) || (T.stable >= 1 && T.conf > 0.7))) {
      T.state = 'locked';
      T.since = T.now;
      T.snap = true;
    }
  } else if (T.misfit > 1.5) {
    // The held tempo no longer fits: the beats are strong but fall elsewhere, and a
    // different tempo repeats clearly. Better no pulse than a wrong one: search again.
    resetBeat(T, 0, true);
  } else if (T.state === 'locked' && T.hold < 0.25) {
    T.state = 'held';
    T.heldSince = T.now;
  } else if (T.state === 'held') {
    // Back from a breakdown: bass in each of the last three beats, each with its
    // strongest hit right on the held clock (another tempo drifts off it).
    const steady = T.bassHits.length === 4 && Math.min(...T.bassHits.slice(1)) > HIT_MIN;
    const fits = T.fits.length === 4 && T.fits[1] + T.fits[2] + T.fits[3] === 3;
    if (steady && fits) T.state = 'locked';
    else if (T.now - T.heldSince > HOLD_MAX) resetBeat(T);
  }

  // Phase-locked clock: runs at the tempo and is pulled toward the measured phase,
  // the harder the clearer the beats are. Held, it runs on alone.
  let err = wrap(measured - T.phase);
  if (T.state !== 'search' && Math.abs(err) > 0.2 && T.hold > 0.6) T.offFor += dt; else T.offFor = 0;
  if (T.offFor > 2) { T.snap = true; T.offFor = 0; } // clearly off for two seconds: jump
  let pull;
  if (T.snap || T.state === 'search') { pull = 1; T.snap = false; } else if (T.state === 'held') pull = 0;
  else pull = (1 - Math.exp(-dt * PLL_GAIN)) * T.hold;
  if (T.state !== 'search' && T.hold < 0.25) err = 0;
  T.phase += dt / T.period + err * pull;

  // A beat whenever the clock, run BEAT_LEAD ahead, passes a whole beat.
  const out = T.phase + BEAT_LEAD / T.period;
  const beatNo = Math.floor(out);
  if (T.lastBeatNo === null) T.lastBeatNo = beatNo;
  if (beatNo > T.lastBeatNo) {
    T.lastBeatNo = beatNo;
    if (T.now - T.lastEvent > 0.5 * T.period) {
      T.event = true;
      T.lastEvent = T.now;
      T.index += 1;
      T.barBeat = (((T.index - T.one) % 4) + 4) % 4;
      T.downbeat = T.barBeat === 0;
      // Look at this beat's kick and snare once their onsets are in.
      T.pending.push({ at: T.now + 0.08, slot: T.index % 4 });
      T.fitChecks.push({ at: T.now + 0.5 * T.period, beat: T.now + BEAT_LEAD });
    }
  } else if (beatNo < T.lastBeatNo) {
    T.lastBeatNo = beatNo;
  }
  // Keep the phase small.
  if (T.phase > 64) { T.phase -= 64; T.lastBeatNo -= 64; }

  // Bar: per beat of the bar, how much kick and how little snare it had.
  // Does the strongest hit around each beat sit on it? Another tempo drifts off.
  while (T.fitChecks.length && T.fitChecks[0].at <= T.now) {
    const { beat } = T.fitChecks.shift();
    const span = (T.period * RATE) | 0;
    // Either all bands or the bass alone: right after a breakdown the band averages
    // are low and a hi-hat or clap can top the returning kick for a few seconds.
    const onBeat = (buf) => {
      let best = 0, at = 0;
      for (let b = 0; b <= span; b++) { const v = past(T, buf, b); if (v > best) { best = v; at = b; } }
      return best > 0 && Math.abs((T.now - at / RATE - beat) / T.period) < 0.12;
    };
    T.fits.push(onBeat(T.odf) || onBeat(T.bassOdf) ? 1 : 0);
    if (T.fits.length > 4) T.fits.shift();
  }

  while (T.pending.length && T.pending[0].at <= T.now) {
    const { slot } = T.pending.shift();
    let kick = 0, snare = 0;
    for (let b = 0; b < 12; b++) {
      kick = Math.max(kick, past(T, T.bassOdf, b));
      snare = Math.max(snare, past(T, T.midOdf, b));
    }
    // Was there a kick or a bass note anywhere in this beat? In dB per bin, so it does
    // not depend on the volume, and only where the bass band is present at all.
    let bassHit = 0;
    for (let b = 0; b < (60 * RATE) / T.bpm; b++) bassHit = Math.max(bassHit, past(T, T.rawBass, b));
    T.bassHits.push(bassHit);
    if (T.bassHits.length > 4) T.bassHits.shift();
    for (let s = 0; s < 4; s++) T.slots[s] *= s === slot ? 0.8 : 1;
    T.slots[slot] += 0.2 * (kick - 0.6 * snare);
    const bestSlot = T.slots.indexOf(Math.max(...T.slots));
    if (!T.oneFixed && T.slots[bestSlot] > T.slots[T.one % 4] * 1.25 + 0.05) T.one = bestSlot;
  }
  return T;
}

// After a breakdown the first beat with the bass back starts a bar.
// manual: the user said so; then the app does not move the 1 on its own any more.
export function startBar(T, manual = false) {
  if (!T.bpm) return;
  if (manual) T.oneFixed = true;
  // The beat that just passed, unless the next one is closer.
  T.one = (T.now - T.lastEvent < 0.6 * T.period ? T.index : T.index + 1) % 4;
  T.barBeat = (((T.index - T.one) % 4) + 4) % 4;
  T.slots[T.one] = Math.max(...T.slots) * 1.3 + 0.1;
}

// Start over: a new song, or the user asked for it.
// keepHistory: the sound of the last seconds still counts (same song, wrong tempo).
export function resetBeat(T, seed = 0, keepHistory = false) {
  Object.assign(T, {
    state: 'search', bpm: 0, est: 0, stable: 0, challenger: 0, challengeFor: 0, conf: 0, quality: 0,
    bassHits: [], fits: [], fitChecks: [], hold: 0, offFor: 0, misfit: 0, seed, since: T.now,
    slots: [0, 0, 0, 0], one: 0, oneFixed: false, pending: [], nextEstimate: 0,
  });
  if (!keepHistory) Object.assign(T, { filled: 0, slotT: 0, acc: 0, accBass: 0, accMid: 0, accRaw: 0 });
  // A remembered tempo: run the clock at it right away, the phase follows the kicks.
  if (seed) { T.bpm = seed; T.stable = STABLE_FOR; }
}

// Half or double tempo, when the app hears 70 where the music feels like 140.
export function scaleTempo(T, factor) {
  if (!T.bpm) return;
  T.bpm = clampN(T.bpm * factor, 50, 220);
  T.phase = Math.floor(T.phase) + (T.phase % 1) * (factor > 1 ? 2 : 0.5);
  T.state = 'locked';
  T.since = T.now;
  T.stable = STABLE_FOR;
}
