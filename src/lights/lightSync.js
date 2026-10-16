import { clamp, ema } from '../engine/audioEngine.js';

// Colours for Govee lights, computed from the same engine and visual state as the
// picture, so the room and the screen move together:
// - Colours: the palette as it is on screen (hue drift, drop colour jump, saturation),
//   flowing along the strip at the picture's flow speed.
// - Brightness: bass level and kicks. A pulse at most three times a second, so the
//   lights never flicker faster than the strobe safety limit allows.
// - Highs: single segments light up briefly on hi-hats (only with segments).
// - Strobe: only if switched on here and the picture's strobe fires, capped at 3/s.
// Pure apart from the light state L, so the Node tests can check it.

const MAX_PULSE_RATE = 3;
const WHITE = [1, 1, 1];

export function createLightState() {
  return { level: 0.4, pulse: 0, lastPulse: -10, flash: 0, lastFlash: -10, seenFlash: -10, sparks: new Map(), cols: [] };
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

// devices: [{ ip, mode: 'segments' | 'single', segments }]. Returns one frame per light:
// { ip, colors: [[r, g, b], ...] } with 0..255 values.
export function computeLights(L, E, V, P, S, dt, devices) {
  const dropping = S.dropDetection && E.dropHold > 0;

  // Kick pulse, at most three a second.
  if (E.kickEvent && E.now - L.lastPulse >= 1 / MAX_PULSE_RATE) {
    L.pulse = Math.max(L.pulse, clamp(E.punch));
    L.lastPulse = E.now;
  }
  L.pulse *= Math.exp(-dt * 5);

  // Brightness: calm passages glow, bass and kicks push up to full.
  const amp = S.lightPulse;
  const target = E.silent ? 0.3
    : clamp(0.6 + 0.1 * E.drive + amp * (0.15 * E.bass + 0.25 * L.pulse - 0.05) + (dropping ? 0.1 : 0), 0.15, 1);
  L.level = ema(L.level, target, dt, target > L.level ? 0.04 : 0.3);
  // LEDs look brighter than their drive at the low end: square for an even feel.
  const bright = L.level * L.level * S.lightBrightness;

  // Strobe on the lights: follows the picture's flashes, never more than 3 per second.
  if (V.lastFlash !== L.seenFlash) {
    L.seenFlash = V.lastFlash;
    if (S.lightStrobe && S.strobe && E.now - L.lastFlash >= 1 / MAX_PULSE_RATE) {
      L.flash = 1;
      L.lastFlash = E.now;
    }
  }
  L.flash *= Math.exp(-dt * 14);
  const flashCol = S.strobeColor === 'palette' ? null : WHITE;

  for (let i = 0; i < 5; i++) {
    L.cols[i] = ledColor([V.colors[i * 3], V.colors[i * 3 + 1], V.colors[i * 3 + 2]], P.hue, P.sat);
  }
  const phase = V.flow * 0.6;
  const spread = S.lightSpread * 3;

  return devices.map((d, di) => {
    const n = d.mode === 'single' ? 1 : clamp(Math.round(d.segments || 20), 1, 100);
    let sparks = L.sparks.get(d.ip);
    if (!sparks || sparks.length !== n) { sparks = new Float32Array(n); L.sparks.set(d.ip, sparks); }
    if (n > 2 && S.lightSparkle && E.hatEvent) sparks[Math.floor(Math.random() * n)] = clamp(0.4 + E.high);
    const colors = new Array(n);
    for (let i = 0; i < n; i++) {
      sparks[i] *= Math.exp(-dt * 10);
      const x = phase + di * 0.8 * S.lightSpread + (n > 1 ? spread * (i / (n - 1)) : 0);
      let c = paletteAt(L.cols, x).map((v) => v * bright);
      const sp = sparks[i] * 0.5 * S.highImpact;
      if (sp > 0) c = c.map((v) => v + (S.lightBrightness - v) * Math.min(1, sp));
      if (L.flash > 0.01) {
        const f = flashCol || L.cols[i % 5];
        const fi = S.strobeIntensity * S.lightBrightness;
        c = c.map((v, k) => v + (f[k] * fi - v) * L.flash);
      }
      colors[i] = c.map((v) => Math.round(clamp(v) * 255));
    }
    return { ip: d.ip, colors };
  });
}
