// Audio engine: turns three raw band levels per frame into what the visuals need.
// Pure JavaScript without browser APIs, so the Node tests can drive it directly.
//
// - Auto gain per band: levels are measured against their own recent peak, so the
//   result does not depend on how loud Windows is set.
// - Onsets: kicks from the bass band, hi-hats from the highs (positive flux over a
//   short running average).
// - Drive: the character of the music from calm (0) to peak (1), read from rhythmic
//   density and kick hardness rather than loudness.
// - Drops: a fast surge of bass-weighted energy over a long baseline, with hold,
//   cooldown and re-arm so steady loud music never counts as a drop.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ema = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
const follow = (cur, target, dt, up, down) => ema(cur, target, dt, target > cur ? up : down);

export const DEFAULT_ENGINE_OPTIONS = {
  autoGain: true, // false: the level reference only rises, never falls back
  agcTime: 25, // seconds for the auto gain to forget a loud passage
  gain: 1, // multiplier after normalisation
  floor: 0.0018, // summed band level below which the input counts as silence (-55 dB)
  range: 18, // dB of swing around the average that fill the 0..1 scale of the picture
  smoothing: 1, // >1 slower, <1 snappier band followers
  kickSensitivity: 1, // >1 detects softer kicks
  dropSensitivity: 1, // >1 detects smaller drops
  dropDetection: true,
  weights: [1, 1, 1], // bass, mid, high impact
};

function onsetDetector() {
  return { slow: 0, avg: 0.05, last: -10, times: [] };
}

export function createEngine() {
  return {
    now: 0,
    peak: [0.001, 0.001, 0.001],
    avgDb: [null, null, null],
    bass: 0, mid: 0, high: 0,
    kick: onsetDetector(), hat: onsetDetector(),
    kickRate: 0, hatRate: 0,
    punch: 0, crest: 0.5, kickT: -10, kickEvent: false,
    eFast: 0, eMed: 0, eLong: 0, warm: 0,
    armed: true, cooldown: 0, dropHold: 0, dropStart: -10, dropEvent: false, drops: 0,
    drive: 0.3,
    silentFor: 0, silent: true,
  };
}

// Call when the audio source changes: the gain starts over and the drop logic warms up again.
export function resetEngine(E, peak = 0.05) {
  E.peak = [peak, peak, peak];
  E.avgDb = [null, null, null];
  E.warm = 0;
  E.dropHold = 0;
  E.cooldown = 0;
  E.armed = true;
}

export function updateEngine(E, raw, dt, options = DEFAULT_ENGINE_OPTIONS) {
  const o = options;
  E.now += dt;
  E.dropEvent = false;

  const vals = [raw.bass, raw.mid, raw.high];
  // Silence is judged on the whole signal. Real music is far quieter per frequency in
  // the mids and highs than in the bass, so a per-band floor would cut them off.
  const level = vals[0] + vals[1] + vals[2];
  E.silentFor = level < o.floor ? E.silentFor + dt : 0;
  E.silent = E.silentFor > 1.5;

  // Two views of each band:
  // - `norm`: level against the band's own recent peak (0..1, linear). Drives the logic
  //   (kicks, drops, drive), where a loud return after a breakdown has to stand out.
  // - `vis`: level in decibels against the band's own running average. An average moment
  //   sits at the middle of the scale, `range` dB of swing fill it. Bass, mids and highs
  //   all move over the full range for the picture, however different their raw levels.
  // While the input is silent both references are left alone.
  const quiet = level < o.floor;
  const decay = o.autoGain ? Math.exp(-dt / o.agcTime) : 1;
  const norm = [0, 0, 0];
  const vis = [0, 0, 0];
  vals.forEach((v, i) => {
    if (quiet) return;
    E.peak[i] = Math.max(v, E.peak[i] * decay, 1e-7);
    norm[i] = clamp((v / E.peak[i]) * o.gain);
    const db = 20 * Math.log10(Math.max(v, 1e-9));
    E.avgDb[i] = E.avgDb[i] === null ? db : ema(E.avgDb[i], db, dt, 8);
    vis[i] = clamp(0.5 + ((db - E.avgDb[i]) / o.range) * o.gain);
  });
  const [b, m, h] = norm;
  const sm = o.smoothing;
  E.bass = follow(E.bass, vis[0], dt, 0.03 * sm, 0.22 * sm);
  E.mid = follow(E.mid, vis[1], dt, 0.06 * sm, 0.4 * sm);
  E.high = follow(E.high, vis[2], dt, 0.03 * sm, 0.25 * sm);

  // Onsets: a band jumping above its own very recent level.
  const ks = 1 / Math.max(0.2, o.kickSensitivity);
  const onset = (det, v, minGap, sens) => {
    det.slow = ema(det.slow, v, dt, 0.12);
    const flux = Math.max(0, v - det.slow);
    det.avg = ema(det.avg, flux, dt, 1.5);
    const hit = flux > Math.max(0.06 * sens, det.avg * 1.8 * sens) && E.now - det.last > minGap;
    if (hit) { det.last = E.now; det.times.push(E.now); }
    while (det.times.length && E.now - det.times[0] > 4) det.times.shift();
    return hit ? flux : 0;
  };
  const kickFlux = onset(E.kick, b, 0.2, ks);
  onset(E.hat, h, 0.06, 1);
  E.kickEvent = kickFlux > 0;
  if (E.kickEvent) {
    E.punch = Math.min(1, 0.3 + kickFlux * 1.4);
    E.crest = E.crest * 0.85 + E.punch * 0.15;
    E.kickT = E.now;
  }
  E.punch *= Math.exp(-dt * 6.5);
  E.kickRate = E.kick.times.length / 4;
  E.hatRate = E.hat.times.length / 4;

  // Energy on three time scales. Weighted toward bass: a drop is the low end slamming
  // back in, a riser in the highs must not count.
  const energy = b * 0.7 + m * 0.2 + h * 0.1;
  E.warm = E.silent ? 0 : E.warm + dt;
  E.eFast = ema(E.eFast, energy, dt, 0.25);
  E.eMed = ema(E.eMed, energy, dt, 2.0);
  E.eLong = ema(E.eLong, energy, dt, E.warm < 4 ? 0.8 : 12);
  E.cooldown -= dt;
  E.dropHold -= dt;
  const ds = Math.max(0.25, o.dropSensitivity);
  const base = Math.max(0.08, E.eLong);
  if (!E.armed && E.cooldown <= 0 && E.eMed / base < 1.08) E.armed = true;
  if (o.dropDetection && E.armed && E.cooldown <= 0 && E.warm > 4
      && E.eFast / base > 1 + 0.35 / ds && E.eFast > 0.4 / Math.sqrt(ds) && E.bass > 0.3) {
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
