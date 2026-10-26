import { clamp, ema } from '../engine/audioEngine.js';
import { paletteColors, hexToRgb } from '../state/palettes.js';

// Maps the audio engine state and the settings to shader parameters, one call per
// frame. Pure apart from the visual state V, so the Node tests can check it.

const STYLE_CODE = { glass: 0, minimal: 1, flat: 2 };
const SYM_CODE = { off: 0, mirror: 1, quad: 2, kaleido: 3 };
const WHITE = new Float32Array([1, 1, 1]);
const TAU = Math.PI * 2;

export function createVisualState() {
  return {
    flow: 0, zoom: 1.4, warp: 0.7, sharp: 4, size: 0.2,
    hue: 0, huePhase: 0, hueCycle: 0, hueKick: 0,
    flash: 0, lastFlash: -10, flashIdx: 0, symRot: 0,
    glintId: 0, glintT: -10, glintPrevId: 0, glintPrevT: -10,
    style: null, styleBlend: 0,
    paletteKey: '', target: new Float32Array(15), colors: new Float32Array(15), colorsReady: false,
    P: {
      flow: 0, zoom: 1, warp: 0.5, sharp: 4, glass: 0, shimmer: 0, depth: 0.3, hue: 0, ripAge: 10, ripAmp: 0,
      sat: 1, style: 1, size: 0.2, count: 6, bg: new Float32Array(3), sym: 0, symN: 6, symRot: 0,
      colors: null, trail: 0, fbZoom: 1, fbRot: 0, bright: 1, flash: 0, vignette: 0.35, flashCol: WHITE,
      glintId: 0, glintAge: 10, glintPrevId: 0, glintPrevAge: 10, glintAmt: 0, twinkle: 0,
    },
  };
}

// Strobe rate cap: with the safety limit switched on, never more than 3 flashes per
// second (the WCAG threshold for photosensitive seizures). Off by default; the app
// warns about flashing light at start instead.
export const strobeMaxRate = (S) => (S.strobeLimit ? Math.min(3, S.strobeRate) : S.strobeRate);

export function computeFrame(E, V, S, dt, env = {}) {
  const P = V.P;
  const r = S.reactivity;
  const d = E.drive;
  const glassy = S.style === 'glass';
  const dropping = S.dropDetection && E.dropHold > 0;
  const motion = env.reduceMotion ? 0.5 : 1;
  const bi = S.bassImpact, mi = S.midImpact, hi = S.highImpact, bp = S.beatPulse;
  const per60 = dt * 60;

  // Palette: fade toward the chosen colours instead of jumping.
  const cols = paletteColors(S);
  const key = S.palette + cols.join('');
  if (key !== V.paletteKey) {
    V.paletteKey = key;
    cols.forEach((c, i) => V.target.set(hexToRgb(c), i * 3));
    if (!V.colorsReady) { V.colors.set(V.target); V.colorsReady = true; }
  }
  const k = 1 - Math.exp(-dt / Math.max(0.05, S.transition / 3));
  for (let i = 0; i < 15; i++) V.colors[i] += (V.target[i] - V.colors[i]) * k;

  // Style switch: hold the old picture in the feedback buffer and let it melt away.
  if (V.style !== S.style) {
    if (V.style !== null) V.styleBlend = 1;
    V.style = S.style;
  }
  V.styleBlend = Math.max(0, V.styleBlend - dt / Math.max(0.3, S.transition));

  if (E.dropEvent && S.dropColorJump) V.hueKick = glassy ? 1.1 : 0.7;

  // Each band has its own job, so bass, voice and hi-hats are told apart on screen:
  // - Bass (level and kicks): size and zoom of the colours, the pulse of the ground.
  // - Mids (voice, melody, snare): the shapes bend and the colours flow faster.
  // - Highs (hi-hats, cymbals): a fine twinkle inside the colours, plus the gloss in Glas.
  const flowSpeed = (0.05 + 0.3 * d + (0.15 * E.eFast * r + 0.55 * E.punch * d * r) * S.peakSpeed
    + 0.3 * E.mid * r * mi * S.peakSpeed
    + (dropping && S.dropBoost ? 0.2 : 0)) * S.speed * motion;
  V.flow += flowSpeed * dt;

  const zoomBase = (1.05 + 0.75 * d) / S.size;
  const zoomTarget = zoomBase * Math.max(0.3, 1 - 0.3 * E.bass * r * bi) * Math.max(0.3, 1 - 0.12 * E.punch * r * bp);
  V.zoom = ema(V.zoom, zoomTarget, dt, 0.12);
  V.warp = ema(V.warp, (0.35 + 0.6 * E.mid * r * mi + 0.35 * E.snap * r * mi + 0.4 * d) * S.form, dt, E.snap > 0.3 ? 0.08 : 0.4);
  V.sharp = ema(V.sharp, 3.2 + 3.0 * d, dt, 1.5);
  // Minimal: bass makes the colour clouds swell, each kick gives a short push.
  V.size = ema(V.size, (0.17 + 0.09 * E.bass * r * bi + 0.05 * E.punch * r * bp) * S.size, dt, 0.06);

  // Hue: up to 0.3 the palette only sways around itself; above that it slowly
  // travels round the colour wheel. A drop swings it for a few seconds.
  V.hueKick *= Math.exp(-dt / 6);
  V.huePhase += dt * (0.05 + 0.1 * d);
  const swayAmp = (glassy ? 0.35 : 0.2) * Math.min(1, S.hueDrift / 0.3);
  V.hueCycle = (V.hueCycle + dt * (Math.max(0, S.hueDrift - 0.3) / 0.7) * 0.25 * (0.6 + 0.8 * d)) % TAU;
  V.hue = ema(V.hue, swayAmp * Math.sin(V.huePhase) + V.hueKick, dt, 0.6);

  // Strobe: only when switched on, either during drops or all the time, either on
  // kicks or at a fixed rate, never faster than the cap.
  // The small margin keeps a 3 Hz cap at three flashes in any one-second window.
  const minGap = 1 / Math.max(0.5, strobeMaxRate(S)) + 0.005;
  const allowed = S.strobe && (S.strobeMode === 'always' ? !E.silent : dropping);
  if (allowed && E.now - V.lastFlash >= minGap && (S.strobeSync === 'rate' || E.kickEvent)) {
    V.flash = 1;
    V.lastFlash = E.now;
    V.flashIdx = (V.flashIdx + 1) % 5;
  }
  V.flash *= Math.exp(-dt * (S.strobeLength === 'long' ? 8 : 16));

  V.symRot = (V.symRot + dt * S.symmetrySpin * 0.5 * (0.6 + 0.8 * d)) % TAU;

  // Trails, corrected for frame rate so 144 Hz and 60 Hz look alike.
  let trail = clamp((glassy ? 0.72 - 0.4 * d : 0.55 - 0.3 * d) * S.trails, 0, 0.9);
  trail = Math.pow(trail, per60);
  if (V.styleBlend > 0) trail = Math.max(trail, Math.exp(-dt / Math.max(0.02, 0.5 * S.transition * V.styleBlend)));

  P.flow = V.flow;
  P.zoom = V.zoom;
  P.warp = V.warp;
  P.sharp = V.sharp;
  P.glass = S.glass * (0.75 + 0.5 * E.high * hi);
  P.shimmer = clamp((0.6 * E.high * E.high + 0.6 * E.sparkle) * (0.5 + 0.5 * d) * r * hi, 0, 1.5);
  // Glints (Minimal, Flächen): each hi-hat lights a new set of points.
  if (E.hatEvent) {
    V.glintPrevId = V.glintId; V.glintPrevT = V.glintT;
    V.glintId = (V.glintId + 1) % 997; V.glintT = E.now;
  }
  P.glintId = V.glintId;
  P.glintAge = E.now - V.glintT;
  P.glintPrevId = V.glintPrevId;
  P.glintPrevAge = E.now - V.glintPrevT;
  P.glintAmt = clamp((0.7 + 0.5 * E.high) * (0.6 + 0.4 * d) * r * hi, 0, 1.6);
  P.twinkle = clamp(0.9 * E.high * E.high * r * hi, 0, 1.2);
  P.depth = 0.3 - 0.2 * d;
  P.hue = V.hue + V.hueCycle + (S.hueShift * Math.PI) / 180;
  P.ripAge = E.now - E.kickT;
  P.ripAmp = glassy && E.kickT > 0 ? clamp(0.4 + d) * r * bp : 0;
  P.sat = (glassy ? 1.35 + 0.2 * d : 1.1 + 0.15 * d) * S.saturation;
  P.style = STYLE_CODE[S.style] ?? 1;
  P.size = V.size;
  P.count = clamp(Math.round(S.count), 1, 8);
  const bg = hexToRgb(S.bgColor);
  const pulse = 1 + 1.5 * E.punch * r * bp;
  P.bg[0] = bg[0] * pulse; P.bg[1] = bg[1] * pulse; P.bg[2] = bg[2] * pulse;
  P.sym = SYM_CODE[S.symmetry] ?? 0;
  P.symN = clamp(Math.round(S.symmetrySegments), 2, 16);
  P.symRot = V.symRot;
  P.colors = V.colors;
  P.trail = trail;
  P.fbZoom = glassy ? Math.pow(1.003 + 0.035 * E.punch * r * bp + (dropping ? 0.01 : 0), per60) : 1;
  P.fbRot = glassy ? (0.004 * Math.sin(V.flow * 0.35) + (dropping ? 0.012 : 0)) * per60 : 0;
  P.bright = (0.88 + 0.3 * E.punch * r * bp + (dropping ? 0.08 : 0)) * S.brightness;
  P.flash = V.flash * S.strobeIntensity;
  P.vignette = S.vignette;
  P.flashCol = S.strobeColor === 'palette' ? V.colors.subarray(V.flashIdx * 3, V.flashIdx * 3 + 3) : WHITE;
  return P;
}
