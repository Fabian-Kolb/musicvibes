// Audio engine: turns the band analysis of each frame into what the visuals need.
// Pure JavaScript without browser APIs, so the Node tests can drive it directly.
//
// Per band (bass, mid, high), three things, the way VJ tools such as Synesthesia
// split them up:
// - Level (E.bass, E.mid, E.high): how strong the band is right now, 0..1.
// - Hits (E.kickEvent, E.snareEvent, E.hatEvent): short transients in that band.
// - Rate (E.kickRate, E.snareRate, E.hatRate): how many hits per second.
// On top of that:
// - Drive: the character of the music from calm (0) to peak (1), read from rhythmic
//   density and kick hardness rather than loudness.
// - Drops: bass and kick slamming back in after a breakdown of a few seconds, with
//   hold and cooldown. A loud bar in the middle of a song never counts as a drop.
//
// Level scale: each band has a ceiling that follows its loud moments (fast up, slow
// down over `agcTime`), so Windows volume and mastering do not matter. The meter
// shows how far the band sits below that ceiling, `range` dB being empty. The
// ceiling never sinks below the band's typical share of the overall level: a band
// that is nearly empty in this song (the bass during an a cappella intro) stays low
// instead of being amplified to full scale. Each band is measured on its own, so
// the bass coming in does not lift the mids and highs.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ema = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
const follow = (cur, target, dt, up, down) => ema(cur, target, dt, target > cur ? up : down);

export const DEFAULT_ENGINE_OPTIONS = {
  autoGain: true, // false: the ceilings only rise, never fall back
  agcTime: 25, // seconds for the auto gain to forget a loud passage
  gain: 1, // >1 fills the meters sooner
  floor: -70, // dB: overall level below which the input counts as silence
  range: 24, // dB between a band's ceiling and an empty meter
  smoothing: 1, // >1 slower, <1 snappier band followers
  kickSensitivity: 1, // >1 detects softer kicks
  dropSensitivity: 1, // >1 detects smaller drops
  dropDetection: true,
};

export const BANDS = ['bass', 'mid', 'high'];
// Where each band typically sits against the overall level in mixed music, in dB
// (band level = mean power per bin, overall = summed power). Measured on a pop song,
// a hip-hop beat, an electronic track and a rock mix, and set a little below the
// lowest of them, so only a band that is really thin in a song is held down.
export const TYPICAL_SHARE = [-13, -40, -52];
// Within this many dB above the silence floor the meters fade out, so faint hum or
// hiss just above the floor is not blown up to full scale.
const FLOOR_MARGIN = 15;
const ATTACK = 0.15; // seconds for a ceiling to rise to a louder level

function onsetDetector() {
  return { avg: 0, armed: true, last: -10, times: [], ref: null };
}

export function createEngine() {
  return {
    now: 0,
    ceil: [null, null, null], gCeil: null,
    level: [0, 0, 0],
    bass: 0, mid: 0, high: 0,
    kick: onsetDetector(), snare: onsetDetector(), hat: onsetDetector(),
    kickRate: 0, snareRate: 0, hatRate: 0,
    kickEvent: false, snareEvent: false, hatEvent: false,
    punch: 0, snap: 0, sparkle: 0, crest: 0.5, kickT: -10,
    eFast: 0, eMed: 0, eLong: 0, warm: 0, bassSlow: 0, thinFor: 0, lastThin: 0, sinceThin: 10,
    armed: true, cooldown: 0, dropHold: 0, dropStart: -10, dropEvent: false, drops: 0,
    drive: 0.3,
    silentFor: 0, silent: true,
  };
}

// Call when the audio source changes: the gain starts over and the drop logic warms up again.
export function resetEngine(E) {
  E.ceil = [null, null, null];
  E.gCeil = null;
  E.warm = 0;
  E.dropHold = 0;
  E.cooldown = 0;
  E.armed = true;
}

function ceiling(c, v, dt, fall) {
  if (c === null) return v;
  if (v > c) return c + (v - c) * (1 - Math.exp(-dt / ATTACK));
  return Math.max(v, c - fall * dt);
}

// Hit detection on spectral flux: a hit when the flux clearly beats its own recent
// average, then the detector waits until the flux has fallen again (one hit per
// transient, not one per frame of it).
function onset(E, det, flux, dt, { minGap, minFlux, ratio }) {
  const thr = Math.max(minFlux, det.avg * ratio);
  let strength = 0;
  if (det.armed && flux > thr && E.now - det.last > minGap) {
    strength = clamp(flux / (thr * 2.5));
    det.armed = false;
    det.last = E.now;
    det.times.push(E.now);
  } else if (!det.armed && flux < thr * 0.7) {
    det.armed = true;
  }
  det.avg = ema(det.avg, flux, dt, 1.2);
  while (det.times.length && E.now - det.times[0] > 4) det.times.shift();
  return strength;
}

// raw: { total, bass, mid, high } in dB plus flux { bass, mid, high } (dB per bin)
// from analysis.js, or flux null for the test signal (then derived from the levels).
export function updateEngine(E, raw, dt, options = DEFAULT_ENGINE_OPTIONS) {
  const o = options;
  E.now += dt;
  E.dropEvent = false;

  const quiet = !(raw.total > o.floor);
  E.silentFor = quiet ? E.silentFor + dt : 0;
  E.silent = E.silentFor > 1.5;

  const vals = [raw.bass, raw.mid, raw.high];
  const fall = o.autoGain ? 8.686 / Math.max(1, o.agcTime) : 0; // dB per second
  const gainDb = 20 * Math.log10(Math.max(0.05, o.gain));
  if (!quiet) E.gCeil = ceiling(E.gCeil, raw.total, dt, fall);
  const fade = quiet ? 0 : clamp((E.gCeil - o.floor) / FLOOR_MARGIN);
  for (let i = 0; i < 3; i++) {
    if (quiet) { E.level[i] = 0; continue; }
    E.ceil[i] = ceiling(E.ceil[i], vals[i], dt, fall);
    const top = Math.max(E.ceil[i], E.gCeil + TYPICAL_SHARE[i]) - gainDb;
    E.level[i] = clamp(1 - (top - vals[i]) / o.range) * fade;
  }
  const sm = o.smoothing;
  E.bass = follow(E.bass, E.level[0], dt, 0.03 * sm, 0.2 * sm);
  E.mid = follow(E.mid, E.level[1], dt, 0.06 * sm, 0.35 * sm);
  E.high = follow(E.high, E.level[2], dt, 0.02 * sm, 0.18 * sm);

  // Hits per band. Measured spectra bring spectral flux; for the test signal the
  // rise of each band level over its recent past stands in for it.
  let flux = raw.flux;
  if (!flux) {
    flux = {};
    BANDS.forEach((b, i) => {
      const det = E[['kick', 'snare', 'hat'][i]];
      const v = quiet ? -120 : vals[i];
      if (det.ref === null) det.ref = v;
      flux[b] = Math.max(0, v - det.ref);
      det.ref = ema(det.ref, v, dt, 0.03);
    });
  }
  // A hit only counts where the band is actually present: a voice's faint low end
  // rising out of nothing is not a kick.
  const ks = Math.max(0.2, o.kickSensitivity);
  const present = (i) => (quiet ? 0 : clamp((E.level[i] - 0.4) / 0.25));
  const kick = onset(E, E.kick, flux.bass * present(0), dt, { minGap: 0.2, minFlux: 1.5 / ks, ratio: 2.2 / ks });
  const snare = onset(E, E.snare, flux.mid * present(1), dt, { minGap: 0.12, minFlux: 1.2, ratio: 2.2 });
  const hat = onset(E, E.hat, flux.high * present(2), dt, { minGap: 0.06, minFlux: 0.8, ratio: 1.9 });
  E.kickEvent = kick > 0;
  E.snareEvent = snare > 0;
  E.hatEvent = hat > 0;
  if (E.kickEvent) {
    E.punch = Math.max(E.punch, 0.35 + 0.65 * kick);
    E.crest = E.crest * 0.85 + (0.35 + 0.65 * kick) * 0.15;
    E.kickT = E.now;
  }
  if (E.snareEvent) E.snap = Math.max(E.snap, 0.4 + 0.6 * snare);
  if (E.hatEvent) E.sparkle = Math.max(E.sparkle, 0.4 + 0.6 * hat);
  E.punch *= Math.exp(-dt * 6.5);
  E.snap *= Math.exp(-dt * 8);
  E.sparkle *= Math.exp(-dt * 12);
  E.kickRate = E.kick.times.length / 4;
  E.snareRate = E.snare.times.length / 4;
  E.hatRate = E.hat.times.length / 4;

  // Energy on three time scales. Weighted toward bass: a drop is the low end slamming
  // back in, a riser in the highs must not count.
  const energy = E.level[0] * 0.7 + E.level[1] * 0.2 + E.level[2] * 0.1;
  E.warm = E.silent ? 0 : E.warm + dt;
  E.eFast = ema(E.eFast, energy, dt, 0.25);
  E.eMed = ema(E.eMed, energy, dt, 2.0);
  E.eLong = ema(E.eLong, energy, dt, E.warm < 4 ? 0.8 : 12);
  E.cooldown -= dt;
  E.dropHold -= dt;
  const ds = Math.max(0.25, o.dropSensitivity);
  // A drop needs a breakdown first: the low end gone (or nearly) for a few seconds.
  // A loud bar in the middle of a song is not a drop.
  // The length of the last thin stretch stays readable for two seconds after the bass
  // is back, so the drop check sees it.
  E.bassSlow = ema(E.bassSlow, E.level[0], dt, 0.8);
  if (E.bassSlow < 0.35) {
    E.thinFor += dt;
    E.sinceThin = 0;
  } else if (E.bassSlow > 0.5) {
    if (E.thinFor > 0) { E.lastThin = E.thinFor; E.thinFor = 0; }
    E.sinceThin += dt;
  }
  const breakdown = Math.max(E.thinFor, E.sinceThin < 2 ? E.lastThin : 0);
  const base = Math.max(0.08, E.eLong);
  if (!E.armed && E.cooldown <= 0 && E.thinFor > 2) E.armed = true;
  if (o.dropDetection && E.armed && E.cooldown <= 0 && E.warm > 4 && breakdown > 4 / ds
      && E.eFast / base > 1 + 0.35 / ds && E.level[0] > 0.6 && E.bass > 0.45) {
    E.dropHold = 7;
    E.cooldown = 12;
    E.armed = false;
    E.dropStart = E.now;
    E.dropEvent = true;
    E.drops += 1;
  }

  // Drive: calm (0) to peak (1).
  const activity = 0.5 * clamp(E.kickRate / 2.2) + 0.3 * clamp(E.hatRate / 6) + 0.2 * E.crest;
  const target = E.silent ? 0.15
    : clamp((0.08 + 0.92 * activity) * (0.6 + 0.4 * E.eMed) + (E.dropHold > 0 ? 0.25 : 0));
  E.drive = ema(E.drive, target, dt, 2.5);
  return E;
}

export const MOODS = [[0.38, 'Ruhig'], [0.55, 'Groove'], [0.78, 'Energie'], [2, 'Peak']];
export const moodOf = (drive) => MOODS.find((m) => drive < m[0])[1];
