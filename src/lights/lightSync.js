import { clamp, ema } from '../engine/audioEngine.js';

// Colours for Govee lights, computed from the same engine and visual state as the
// picture, so the room and the screen move together. Pure apart from the light state
// L, so the Node tests can check it.
//
// Colours always come from the palette on screen (hue drift, drop colour jump,
// saturation). How they are laid out over the segments is the effect:
// - flow:   the palette flows along the strip at the picture's speed.
// - wave:   every kick sends a wave of the next colour from the middle outward.
// - meter:  a level meter from the middle: bass sets the length, kicks push it out.
// - chase:  blocks of colour move one step per kick; a snare turns the direction.
// - sparks: dark strip, kicks light it up, hi-hats and snares spark single segments.
// "auto" switches between them on drops and every 32 kicks, calm effects in calm
// music, busy ones when it gets loud.
//
// The segment strobe switches random segments (or the whole strip) on and off at a
// set rate. Without the safety limit there is no cap; the app warns at start.

export const LIGHT_EFFECTS = ['flow', 'wave', 'meter', 'chase', 'sparks'];
const CALM = ['flow', 'meter'];
const BUSY = ['wave', 'chase', 'sparks', 'meter'];
const LIMIT_RATE = 3; // pulses and flashes per second with the safety limit on
const BLEND_TIME = 0.8; // seconds to fade from one effect to the next
const WHITE = [1, 1, 1];

export function createLightState() {
  return {
    level: 0.4, pulse: 0, lastPulse: -10, snap: 0, burst: 0, kicks: 0,
    effect: 'flow', prev: null, blend: 1, sinceSwitch: 0, kicksAtSwitch: 0,
    waves: [], waveColor: 0, chase: 0, chaseTarget: 0, chaseDir: 1, peak: 0,
    sparks: new Map(), hits: new Map(),
    strobeOn: false, strobeT: 0, strobeSeed: 0, strobePhase: 0,
    cols: [],
  };
}

// The shader's hue rotation (rotation round the grey axis), so colours match the screen.
function hueRot(c, a) {
  const k = 0.5773503;
  const ca = Math.cos(a), sa = Math.sin(a);
  const d = k * (c[0] + c[1] + c[2]) * (1 - ca);
  return [
    c[0] * ca + k * (c[2] - c[1]) * sa + k * d,
    c[1] * ca + k * (c[0] - c[2]) * sa + k * d,
    c[2] * ca + k * (c[1] - c[0]) * sa + k * d,
  ];
}

// LEDs show colour best at full drive: saturate like the screen, then scale so the
// strongest channel is full. Brightness comes separately.
function ledColor(c, hue, sat) {
  const r = hueRot(c, hue);
  const l = 0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2];
  const s = r.map((v) => Math.max(0, l + (v - l) * sat));
  const m = Math.max(s[0], s[1], s[2]);
  return m > 0.001 ? s.map((v) => v / m) : [0, 0, 0];
}

// Palette position x (one unit per colour, wraps after five), smooth between colours.
function paletteAt(cols, x) {
  const n = cols.length;
  const w = ((x % n) + n) % n;
  const i = Math.floor(w);
  const f = w - i;
  const t = f * f * (3 - 2 * f);
  const a = cols[i], b = cols[(i + 1) % n];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Repeatable 0..1 value per (seed, segment): which segments the strobe switches on.
function hash01(seed, i) {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Next effect for "auto": calm music gets calm effects, never the same one twice.
function pickEffect(L, E, rnd) {
  const pool = (E.drive < 0.45 ? CALM : BUSY).filter((e) => e !== L.effect);
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

function switchEffect(L, next) {
  if (next === L.effect) return;
  L.prev = L.effect;
  L.effect = next;
  L.blend = 0;
  L.sinceSwitch = 0;
  L.kicksAtSwitch = L.kicks;
}

// One effect for one light: colour (0..1) per segment, before the music envelope and
// the master brightness. lvl is the envelope, for effects that use it for shape.
function effectColor(effect, L, d, i, n, x, lvl, S, V) {
  const spread = S.lightSpread * 3;
  const base = V.flow * 0.6 + d.offset;
  const along = n > 1 ? spread * x : 0;
  const mid = Math.abs(x - 0.5) * 2; // 0 in the middle, 1 at the ends
  switch (effect) {
    case 'wave': {
      let c = scale(paletteAt(L.cols, base + along), 0.3);
      for (const w of L.waves) {
        const dist = Math.abs(mid - w.r);
        const a = Math.exp(-(dist * dist) / 0.012) * w.a;
        if (a > 0.01) c = mix(c, L.cols[w.c % 5], Math.min(1, a));
      }
      return c;
    }
    case 'meter': {
      const len = clamp(0.15 + 0.85 * lvl);
      const on = mid <= len;
      const c = paletteAt(L.cols, base + mid * spread * 0.7);
      if (on) return scale(c, 0.6 + 0.4 * (1 - mid / Math.max(0.05, len)));
      if (n > 4 && Math.abs(mid - L.peak) < 1.5 / n) return scale(WHITE, 0.7);
      return scale(c, 0.05);
    }
    case 'chase': {
      const block = Math.max(1, Math.round(n / 6));
      const pos = (i / block) + L.chase;
      const k = Math.floor(((pos % 5) + 5) % 5);
      const edge = 1 - Math.abs((((pos % 1) + 1) % 1) - 0.5) * 0.6;
      return scale(L.cols[k], edge);
    }
    case 'sparks': {
      let c = scale(paletteAt(L.cols, base + along), 0.1 + 0.9 * L.pulse);
      const h = L.hits.get(d.ip);
      if (h && h.hat[i] > 0.01) c = mix(c, L.cols[(i + 2) % 5], Math.min(1, h.hat[i]));
      if (h && h.snare[i] > 0.01) c = mix(c, WHITE, Math.min(1, h.snare[i]));
      return c;
    }
    default: // flow
      return paletteAt(L.cols, base + along);
  }
}

// devices: [{ ip, mode: 'segments' | 'single', segments }]. Returns one frame per light:
// { ip, colors: [[r, g, b], ...] } with 0..255 values.
export function computeLights(L, E, V, P, S, dt, devices, rnd = Math.random) {
  const dropping = S.dropDetection && E.dropHold > 0;
  const limit = !!S.strobeLimit;
  const amp = S.lightPulse;

  // Hits from the music.
  if (E.kickEvent && (!limit || E.now - L.lastPulse >= 1 / LIMIT_RATE)) {
    L.pulse = Math.max(L.pulse, 0.5 + 0.5 * clamp(E.punch));
    L.lastPulse = E.now;
    L.kicks += 1;
    L.waves.push({ r: 0, a: 1, c: L.waveColor });
    L.waveColor = (L.waveColor + 1) % 5;
    L.chaseTarget += L.chaseDir;
  }
  if (E.snareEvent) { L.snap = 1; L.chaseDir = -L.chaseDir; }
  if (E.dropEvent && !limit) L.burst = 1;
  L.pulse *= Math.exp(-dt * 9);
  L.snap *= Math.exp(-dt * 10);
  L.burst *= Math.exp(-dt * 4);
  L.waves.forEach((w) => { w.r += dt * 2.4; w.a *= Math.exp(-dt * 1.5); });
  L.waves = L.waves.filter((w) => w.r < 1.3 && w.a > 0.03);
  L.chase = ema(L.chase, L.chaseTarget, dt, 0.06);

  // Music envelope. Bass, voice and drive set how bright the lights glow; with a
  // steady beat they dip between the kicks and flash up on each one, the deeper the
  // higher "Reaktion" is. Calm music without kicks just glows.
  const base = clamp(0.55 + 0.25 * E.bass + 0.15 * E.mid + 0.1 * E.drive + (dropping ? 0.1 : 0));
  const depth = clamp(0.65 * amp * clamp(E.kickRate / 1.5), 0, 0.9);
  const target = E.silent ? 0.25 : base * (1 - depth + depth * L.pulse);
  L.level = ema(L.level, target, dt, target > L.level ? 0.015 : 0.06);
  const lvl = L.level;
  L.peak = Math.max(clamp(0.15 + 0.85 * lvl), L.peak - dt * 0.6);

  // Effect choice.
  L.sinceSwitch += dt;
  if (S.lightEffect === 'auto') {
    if (E.dropEvent || L.kicks - L.kicksAtSwitch >= 32 || L.sinceSwitch > 45) switchEffect(L, E.dropEvent ? BUSY[Math.floor(rnd() * 3)] : pickEffect(L, E, rnd));
  } else if (LIGHT_EFFECTS.includes(S.lightEffect)) {
    switchEffect(L, S.lightEffect);
  }
  L.blend = Math.min(1, L.blend + dt / BLEND_TIME);

  // Segment strobe.
  const strobing = S.lightStrobe && !E.silent && (S.lightStrobeMode === 'always' || dropping);
  const rate = limit ? Math.min(LIMIT_RATE, S.lightStrobeRate) : S.lightStrobeRate;
  if (strobing) {
    L.strobeT += dt;
    if (L.strobeT >= 1 / Math.max(0.5, rate) || !L.strobeOn) {
      L.strobeT = 0;
      L.strobeSeed = Math.floor(rnd() * 1e9);
      L.strobePhase = 1 - L.strobePhase;
    }
  }
  L.strobeOn = strobing;
  const flashCol = S.strobeColor === 'palette' ? null : WHITE;

  const bright = S.lightBrightness;
  for (let i = 0; i < 5; i++) {
    L.cols[i] = ledColor([V.colors[i * 3], V.colors[i * 3 + 1], V.colors[i * 3 + 2]], P.hue, P.sat);
  }

  return devices.map((dev, di) => {
    const n = dev.mode === 'single' ? 1 : clamp(Math.round(dev.segments || 20), 1, 100);
    const d = { ip: dev.ip, offset: di * 0.8 * S.lightSpread };
    let sparks = L.sparks.get(dev.ip);
    if (!sparks || sparks.length !== n) { sparks = new Float32Array(n); L.sparks.set(dev.ip, sparks); }
    let hits = L.hits.get(dev.ip);
    if (!hits || hits.hat.length !== n) { hits = { hat: new Float32Array(n), snare: new Float32Array(n) }; L.hits.set(dev.ip, hits); }
    if (n > 2 && S.lightSparkle && E.hatEvent) sparks[Math.floor(rnd() * n)] = clamp(0.4 + E.high);
    if (n > 2 && E.hatEvent) hits.hat[Math.floor(rnd() * n)] = 1;
    if (n > 2 && E.snareEvent) {
      const at = Math.floor(rnd() * n);
      for (let k = Math.max(0, at - 1); k <= Math.min(n - 1, at + 1); k++) hits.snare[k] = 1;
    }

    const colors = new Array(n);
    for (let i = 0; i < n; i++) {
      sparks[i] *= Math.exp(-dt * 10);
      hits.hat[i] *= Math.exp(-dt * 7);
      hits.snare[i] *= Math.exp(-dt * 9);
      const x = n > 1 ? i / (n - 1) : 0.5;
      let c;
      if (n === 1) {
        // One colour: steps to the next palette colour on kicks in busy music.
        const step = E.drive > 0.55 && S.lightEffect !== 'flow' ? L.kicks : 0;
        c = paletteAt(L.cols, V.flow * 0.6 + d.offset + step);
      } else {
        c = effectColor(L.effect, L, d, i, n, x, lvl, S, V);
        if (L.blend < 1 && L.prev) c = mix(effectColor(L.prev, L, d, i, n, x, lvl, S, V), c, L.blend);
      }
      // The music envelope, squared: LEDs look brighter than their drive at the low
      // end, so this keeps the swing between calm and a kick clearly visible.
      c = scale(c, lvl * lvl);
      const sp = sparks[i] * 0.5 * S.highImpact;
      if (sp > 0.01) c = mix(c, WHITE, Math.min(1, sp));
      if (L.burst > 0.02) c = mix(c, WHITE, L.burst * 0.8);
      c = scale(c, bright);
      if (strobing) {
        // Whole strip: on and off in turn. Segments: each step a new random set is on.
        const on = S.lightStrobeStyle === 'full' || n === 1 ? L.strobePhase === 1 : hash01(L.strobeSeed, i) < 0.4;
        const f = flashCol || L.cols[i % 5];
        c = on ? scale(f, S.strobeIntensity * bright) : [0, 0, 0];
      }
      colors[i] = c.map((v) => Math.round(clamp(v) * 255));
    }
    return { ip: dev.ip, colors };
  });
}
