import { useEffect, useRef } from 'react';
import { DEFAULTS } from '../state/settings';
import { PALETTES, paletteColors } from '../state/palettes';

const FRAME_MS = 1000 / 30;
const IDLE_BPM = 120;
const IDLE_PERIOD = 60 / IDLE_BPM;
const LED_COUNT = 24;
const LED_INDICES = Array.from({ length: LED_COUNT }, (_, i) => i);
const AUTO_EFFECTS = ['flow', 'wave', 'meter', 'chase', 'sparks'];
const OFF_LED = '#181722';
const BASE_BG = '#08070f';

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Color helpers ----------

function parseHex(hex) {
  if (typeof hex !== 'string') return [255, 43, 214];
  let s = hex.trim().replace(/^#/, '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return [255, 43, 214];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(rgb, a) {
  return `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${clamp(a, 0, 1).toFixed(3)})`;
}

function hueRotateRgb(rgb, deg) {
  if (!deg) return rgb;
  const a = (deg * Math.PI) / 180;
  const k = 0.5773503;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const d = k * (r + g + b) * (1 - ca);
  return [
    clamp(r * ca + k * (b - g) * sa + k * d) * 255,
    clamp(g * ca + k * (r - b) * sa + k * d) * 255,
    clamp(b * ca + k * (g - r) * sa + k * d) * 255,
  ];
}

function adjustSaturation(rgb, sat) {
  const s = clamp(Number.isFinite(sat) ? sat : 1, 0, 2.2);
  const l = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return [
    clamp(l + (rgb[0] - l) * s, 0, 255),
    clamp(l + (rgb[1] - l) * s, 0, 255),
    clamp(l + (rgb[2] - l) * s, 0, 255),
  ];
}

function getPaletteRgbs(settings, { applySat = true, applyHue = true } = {}) {
  const merged = settings ? { ...DEFAULTS, ...settings } : DEFAULTS;
  const raw = paletteColors(merged);
  const list = Array.isArray(raw) && raw.length >= 3 ? raw : PALETTES[0].cols;
  const hue = applyHue ? (Number(merged.hueShift) || 0) : 0;
  const sat = applySat ? (Number.isFinite(merged.saturation) ? merged.saturation : 1) : 1;
  return list.map((hex) => {
    let rgb = parseHex(hex);
    if (hue) rgb = hueRotateRgb(rgb, hue);
    if (sat !== 1) rgb = adjustSaturation(rgb, sat);
    return rgb;
  });
}

function ledNormalize(rgb) {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const m = Math.max(r, g, b);
  return m > 0.001 ? [r / m, g / m, b / m] : [0, 0, 0];
}

function paletteAt01(cols01, x) {
  const n = cols01.length;
  const w = ((x % n) + n) % n;
  const i = Math.floor(w);
  const f = w - i;
  const t = f * f * (3 - 2 * f);
  const a = cols01[i];
  const b = cols01[(i + 1) % n];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hash01(seed, i) {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function stringSeed(str) {
  if (!str) return 0;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h * 31) + str.charCodeAt(i)) % 997;
  return (h % 37) * 0.73;
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// ---------- Shared 30 fps RAF scheduler + audio sampler ----------

const subscribers = new Set();
let rafId = 0;
let lastTick = 0;
let simTime = 2.4;
let liveMix = 0;
let prevIdlePhase = 0;
let prevHatPhase = 0;
let prevPulseT = -10;
let prevKickT = -10;
let prevSnap = 0;
let prevSparkle = 0;
let motionQuery = null;
let motionListenerAttached = false;

const STATIC_AUDIO = {
  bass: 0.56,
  mid: 0.52,
  high: 0.44,
  pulse: 0.68,
  kick: 0.68,
  drive: 0.5,
  beatPeriod: IDLE_PERIOD,
  beatPhase: 0.22,
  kickHit: false,
  snareHit: false,
  hatHit: false,
  dropping: false,
  live: false,
  reduced: true,
  t: 2.4,
};

let lastAudio = STATIC_AUDIO;

function getMotionQuery() {
  if (!motionQuery && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  }
  return motionQuery;
}

function isReducedMotion() {
  const mq = getMotionQuery();
  return Boolean(mq && mq.matches);
}

function sampleAudio(dt, t) {
  const idlePhase = (t % IDLE_PERIOD) / IDLE_PERIOD;
  const hatPhase = ((t + IDLE_PERIOD * 0.5) % IDLE_PERIOD) / IDLE_PERIOD;
  const beatIndex = Math.floor(t / IDLE_PERIOD);
  const idleKickHit = dt > 0 && idlePhase < prevIdlePhase;
  const idleSnareHit = idleKickHit && (beatIndex % 2 === 1);
  const idleHatHit = dt > 0 && hatPhase < prevHatPhase;
  prevIdlePhase = idlePhase;
  prevHatPhase = hatPhase;

  const idleKick = Math.exp(-idlePhase * 8.5);
  const idlePulse = Math.exp(-idlePhase * 6.5);
  const idleBass = 0.34 + 0.4 * Math.exp(-idlePhase * 4.2);
  const idleMid = 0.4 + 0.22 * Math.sin(t * 1.1) * Math.sin(t * 0.43) + 0.1 * Math.sin(t * 4.1);
  const idleHigh = 0.2 + 0.46 * Math.exp(-hatPhase * 12);
  const idleDrive = 0.46;

  const E = typeof window !== 'undefined' ? window.__vibsync?.E : null;
  const hasLive = Boolean(E && !E.silent);
  const blendStep = dt > 0 ? 1 - Math.exp(-dt / 0.25) : 1;
  liveMix += ((hasLive ? 1 : 0) - liveMix) * blendStep;

  let liveBass = 0;
  let liveMid = 0;
  let liveHigh = 0;
  let livePulse = 0;
  let liveKick = 0;
  let liveDrive = 0.4;
  let livePeriod = IDLE_PERIOD;
  let livePhase = idlePhase;
  let liveKickHit = false;
  let liveSnareHit = false;
  let liveHatHit = false;
  let dropping = false;

  if (hasLive) {
    liveBass = clamp(E.meter ? E.meter[0] : E.bass || 0);
    liveMid = clamp(E.meter ? E.meter[1] : E.mid || 0);
    liveHigh = clamp(E.meter ? E.meter[2] : E.high || 0);
    livePulse = clamp(E.pulse || 0);
    liveKick = clamp(Math.max(E.pulse || 0, E.punch || 0));
    liveDrive = clamp(E.drive || 0.3);

    const bpm = E.beat && E.beat.bpm > 40 ? E.beat.bpm : IDLE_BPM;
    livePeriod = 60 / bpm;
    if (E.beat && E.beat.state !== 'search' && E.beat.period > 0 && E.beat.lastEvent >= 0 && E.beat.now >= E.beat.lastEvent) {
      livePhase = clamp(((E.beat.now - E.beat.lastEvent) % E.beat.period) / E.beat.period);
    } else if (E.pulseT >= 0 && E.now >= E.pulseT) {
      livePhase = clamp((E.now - E.pulseT) / livePeriod);
    }

    const pT = E.pulseT ?? -10;
    const kT = E.kickT ?? -10;
    liveKickHit = dt > 0 && ((pT > 0 && pT !== prevPulseT) || (kT > 0 && kT !== prevKickT));
    prevPulseT = pT;
    prevKickT = kT;

    const snap = E.snap || 0;
    const sparkle = E.sparkle || 0;
    liveSnareHit = dt > 0 && snap > 0.5 && prevSnap <= 0.5;
    liveHatHit = dt > 0 && sparkle > 0.42 && prevSparkle <= 0.42;
    prevSnap = snap;
    prevSparkle = sparkle;
    dropping = Boolean(E.dropHold > 0);
  } else {
    prevSnap = 0;
    prevSparkle = 0;
  }

  const useLive = liveMix > 0.5;
  return {
    bass: lerp(idleBass, liveBass, liveMix),
    mid: lerp(idleMid, liveMid, liveMix),
    high: lerp(idleHigh, liveHigh, liveMix),
    pulse: lerp(idlePulse, livePulse, liveMix),
    kick: lerp(idleKick, liveKick, liveMix),
    drive: lerp(idleDrive, liveDrive, liveMix),
    beatPeriod: useLive ? livePeriod : IDLE_PERIOD,
    beatPhase: useLive ? livePhase : idlePhase,
    kickHit: useLive ? liveKickHit : idleKickHit,
    snareHit: useLive ? liveSnareHit : idleSnareHit,
    hatHit: useLive ? liveHatHit : idleHatHit,
    dropping: useLive && dropping,
    live: useLive,
    reduced: false,
    t,
  };
}

function currentSnapshot() {
  if (isReducedMotion()) return STATIC_AUDIO;
  return lastAudio;
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  lastTick = 0;
}

function tick(now) {
  rafId = 0;
  if (subscribers.size === 0 || isReducedMotion()) return;
  rafId = requestAnimationFrame(tick);
  if (lastTick && now - lastTick < FRAME_MS - 1.5) return;
  const dt = lastTick ? Math.min(0.1, Math.max(0.001, (now - lastTick) / 1000)) : FRAME_MS / 1000;
  lastTick = now;
  simTime += dt;
  lastAudio = sampleAudio(dt, simTime);
  subscribers.forEach((fn) => fn(lastAudio, dt));
}

function startLoopIfNeeded() {
  if (subscribers.size > 0 && !isReducedMotion() && !rafId) {
    lastTick = 0;
    rafId = requestAnimationFrame(tick);
  }
}

function onMotionChange() {
  if (isReducedMotion()) {
    stopLoop();
    subscribers.forEach((fn) => fn(STATIC_AUDIO, 0));
  } else {
    startLoopIfNeeded();
  }
}

function subscribePreview(fn) {
  subscribers.add(fn);
  const mq = getMotionQuery();
  if (mq && !motionListenerAttached) {
    mq.addEventListener('change', onMotionChange);
    motionListenerAttached = true;
  }
  startLoopIfNeeded();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      stopLoop();
      if (mq && motionListenerAttached) {
        mq.removeEventListener('change', onMotionChange);
        motionListenerAttached = false;
      }
    }
  };
}

// ---------- Offscreen scratch canvas for radial kaleidoscope ----------

let scratchCanvas = null;

function getScratchCanvas(w, h) {
  if (!scratchCanvas && typeof document !== 'undefined') {
    scratchCanvas = document.createElement('canvas');
  }
  if (!scratchCanvas) return null;
  if (scratchCanvas.width !== w) scratchCanvas.width = w;
  if (scratchCanvas.height !== h) scratchCanvas.height = h;
  return scratchCanvas;
}

// ---------- Miniature fluid renderer (SceneThumb / StyleThumb / SymmetryThumb) ----------

function drawFluidCore(ctx, w, h, t, audio, cfg) {
  const { style, cols, bgRgb, size, form, count, glass, offsetX = 0, offsetY = 0 } = cfg;
  const minDim = Math.min(w, h);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  if (style === 'flat') {
    // Bold full-bleed vivid color field backdrop
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, rgba(cols[2 % cols.length].map((c) => c * 0.55), 1));
    bgGrad.addColorStop(0.55, rgba(cols[0].map((c) => c * 0.42), 1));
    bgGrad.addColorStop(1, rgba(cols[1 % cols.length].map((c) => c * 0.5), 1));
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
  } else if (style === 'glass') {
    // Deep luminous glass backdrop tinted by active palette
    const gGrad = ctx.createLinearGradient(0, 0, w, h);
    gGrad.addColorStop(0, rgba(cols[2 % cols.length].map((c, i) => lerp(bgRgb[i], c, 0.22)), 1));
    gGrad.addColorStop(1, rgba(cols[0].map((c, i) => lerp(bgRgb[i], c, 0.14)), 1));
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, 0, w, h);
  } else {
    // Minimal: clean bgColor softly lifted on kicks
    const lift = 1 + audio.pulse * 0.32;
    ctx.fillStyle = rgba(bgRgb.map((c) => clamp(c * lift, 0, 255)), 1);
    ctx.fillRect(0, 0, w, h);
  }

  const n = clamp(Math.round(count || 5), 3, 7);
  const pulse = 1 + audio.bass * 0.24 + audio.pulse * 0.22;
  const baseR = minDim * (style === 'flat' ? 0.46 : style === 'glass' ? 0.42 : 0.36) * clamp(size, 0.5, 1.85);

  ctx.globalCompositeOperation = style === 'flat' ? 'source-over' : style === 'glass' ? 'screen' : 'lighter';

  for (let i = 0; i < n; i++) {
    const a = i * 2.399 + t * (0.28 + i * 0.045);
    const x = w * (0.5 + offsetX + 0.32 * Math.sin(a + Math.sin(t * 0.42 + i) * 0.72 * form));
    const y = h * (0.5 + offsetY + 0.29 * Math.cos(a * 1.27 + Math.cos(t * 0.36 + i * 1.7) * 0.72 * form));
    const stretch = style === 'glass' ? 1.48 : style === 'flat' ? 1.32 : 1.15;
    const rx = baseR * pulse * stretch * (1 + 0.22 * form * Math.sin(t * 0.8 + i));
    const ry = baseR * pulse * (1 / Math.sqrt(stretch)) * (1 - 0.18 * form * Math.cos(t * 0.65 + i * 1.4));
    const col = cols[i % cols.length];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.22 * (0.6 + form * 0.5) + i * 0.9);
    ctx.scale(1, Math.max(0.35, ry / Math.max(1, rx)));

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    if (style === 'flat') {
      grad.addColorStop(0, rgba(col, 0.94));
      grad.addColorStop(0.56, rgba(col, 0.76));
      grad.addColorStop(0.84, rgba(col, 0.26));
      grad.addColorStop(1, rgba(col, 0));
    } else if (style === 'glass') {
      grad.addColorStop(0, rgba(col, 0.88));
      grad.addColorStop(0.42, rgba(col, 0.52));
      grad.addColorStop(0.78, rgba(col, 0.14));
      grad.addColorStop(1, rgba(col, 0));
    } else {
      grad.addColorStop(0, rgba(col, 0.82));
      grad.addColorStop(0.45, rgba(col, 0.36));
      grad.addColorStop(1, rgba(col, 0));
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Style-specific luminous accents
  if (style === 'glass') {
    const gAmt = clamp(Number.isFinite(glass) ? glass : 0.65, 0.2, 1.5);
    ctx.globalCompositeOperation = 'lighter';

    // Flowing curved liquid-glass specular sheen ribbons
    for (let i = 0; i < 3; i++) {
      const shift = Math.sin(t * 0.55 + i * 2.1) * 14;
      const y0 = h * (0.16 + i * 0.3) + shift * 0.5;
      const y1 = h * (0.34 + i * 0.22) - shift * 0.6;
      const cy = h * (0.04 + i * 0.32) + Math.cos(t * 0.7 + i) * 12;

      const streak = ctx.createLinearGradient(0, y0, w, y1);
      streak.addColorStop(0, 'rgba(255,255,255,0)');
      streak.addColorStop(0.32, `rgba(255,255,255,${(0.32 * gAmt * (0.75 + audio.high * 0.4)).toFixed(3)})`);
      streak.addColorStop(0.55, `rgba(255,255,255,${(0.56 * gAmt * (0.75 + audio.high * 0.4)).toFixed(3)})`);
      streak.addColorStop(0.8, `rgba(255,255,255,${(0.18 * gAmt).toFixed(3)})`);
      streak.addColorStop(1, 'rgba(255,255,255,0)');

      // Soft bloom behind specular edge
      ctx.strokeStyle = streak;
      ctx.lineCap = 'round';
      ctx.lineWidth = 6.5;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.moveTo(-6, y0);
      ctx.quadraticCurveTo(w * 0.5 + shift, cy, w + 6, y1);
      ctx.stroke();

      // Crisp specular liquid-glass highlight line
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(-6, y0);
      ctx.quadraticCurveTo(w * 0.5 + shift, cy, w + 6, y1);
      ctx.stroke();
    }

    // Soft glass caustic orb glint
    ctx.globalAlpha = 1;
    const gx = w * (0.32 + 0.14 * Math.sin(t * 0.48));
    const gy = h * (0.3 + 0.12 * Math.cos(t * 0.52));
    const caustic = ctx.createRadialGradient(gx, gy, 0, gx, gy, minDim * 0.34);
    caustic.addColorStop(0, `rgba(255,255,255,${clamp((0.36 + audio.high * 0.25) * gAmt, 0, 0.72).toFixed(3)})`);
    caustic.addColorStop(0.45, `rgba(255,255,255,${clamp(0.1 * gAmt, 0, 0.25).toFixed(3)})`);
    caustic.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = caustic;
    ctx.fillRect(0, 0, w, h);
  } else if (audio.high > 0.22) {
    // Subtle hi-hat glints for Minimal & Flat
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    const step = Math.floor(t * 5);
    const glints = Math.min(6, Math.floor(audio.high * 7));
    for (let i = 0; i < glints; i++) {
      const fx = hash01(step * 17 + 3, i * 2);
      const fy = hash01(step * 29 + 11, i * 2 + 1);
      ctx.fillStyle = `rgba(255,255,255,${(0.28 * audio.high).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(fx * w, fy * h, 1.1 + audio.high * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawSymmetryGuides(ctx, w, h, mode, segments, spinRot) {
  if (mode === 'off') return;
  const cx = w / 2;
  const cy = h / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 1.25;

  if (mode === 'mirror' || mode === 'quad') {
    const vg = ctx.createLinearGradient(cx, 0, cx, h);
    vg.addColorStop(0, 'rgba(255,255,255,0.06)');
    vg.addColorStop(0.5, 'rgba(255,255,255,0.48)');
    vg.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.strokeStyle = vg;
    ctx.beginPath();
    ctx.moveTo(cx, 3);
    ctx.lineTo(cx, h - 3);
    ctx.stroke();
  }

  if (mode === 'quad') {
    const hg = ctx.createLinearGradient(0, cy, w, cy);
    hg.addColorStop(0, 'rgba(255,255,255,0.06)');
    hg.addColorStop(0.5, 'rgba(255,255,255,0.48)');
    hg.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.strokeStyle = hg;
    ctx.beginPath();
    ctx.moveTo(3, cy);
    ctx.lineTo(w - 3, cy);
    ctx.stroke();
  }

  if (mode === 'kaleido') {
    const spokes = Math.max(6, Math.min(12, Math.round((segments || 6) / 2) * 2));
    const maxR = Math.hypot(cx, cy);
    for (let k = 0; k < spokes; k++) {
      const ang = spinRot + (k * Math.PI * 2) / spokes;
      const ex = cx + Math.cos(ang) * maxR;
      const ey = cy + Math.sin(ang) * maxR;
      const rg = ctx.createLinearGradient(cx, cy, ex, ey);
      rg.addColorStop(0, 'rgba(255,255,255,0.42)');
      rg.addColorStop(0.7, 'rgba(255,255,255,0.14)');
      rg.addColorStop(1, 'rgba(255,255,255,0.02)');
      ctx.strokeStyle = rg;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }

  if (mode === 'quad' || mode === 'kaleido') {
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFluidThumb(ctx, w, h, t, audio, cfg, showGuides = false) {
  const mode = cfg.symmetry || 'off';
  const segs = clamp(Math.round(cfg.symmetrySegments || 6), 4, 12);
  const spinRot = t * (Number.isFinite(cfg.symmetrySpin) ? cfg.symmetrySpin : 0.2) * 0.55;

  if (mode === 'kaleido') {
    const scratch = getScratchCanvas(w, h);
    const sctx = scratch ? scratch.getContext('2d') : null;
    if (sctx) {
      drawFluidCore(sctx, w, h, t, audio, { ...cfg, offsetX: -0.1, offsetY: -0.06 });
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgba(cfg.bgRgb, 1);
      ctx.fillRect(0, 0, w, h);

      const wedges = Math.max(6, Math.min(12, Math.round(segs / 2) * 2));
      const step = (Math.PI * 2) / wedges;
      const cx = w / 2;
      const cy = h / 2;
      const rad = Math.hypot(w, h) * 0.65;

      for (let k = 0; k < wedges; k++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(spinRot + k * step);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(rad, -1);
        ctx.lineTo(Math.cos(step + 0.025) * rad, Math.sin(step + 0.025) * rad);
        ctx.closePath();
        ctx.clip();
        if (k % 2 === 1) {
          ctx.rotate(step);
          ctx.scale(1, -1);
        }
        ctx.drawImage(scratch, -w * 0.32, -h * 0.42);
        ctx.restore();
      }
    } else {
      drawFluidCore(ctx, w, h, t, audio, cfg);
    }
  } else {
    const shift = showGuides && mode !== 'off' ? { offsetX: -0.14, offsetY: mode === 'quad' ? -0.12 : 0 } : {};
    drawFluidCore(ctx, w, h, t, audio, { ...cfg, ...shift });

    if (mode === 'mirror' || mode === 'quad') {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(ctx.canvas, 0, 0, w / 2, h, 0, 0, w / 2, h);
      ctx.restore();
    }
    if (mode === 'quad') {
      ctx.save();
      ctx.translate(0, h);
      ctx.scale(1, -1);
      ctx.drawImage(ctx.canvas, 0, 0, w, h / 2, 0, 0, w, h / 2);
      ctx.restore();
    }
  }

  if (showGuides) {
    drawSymmetryGuides(ctx, w, h, mode, segs, spinRot);
  }
}

// ---------- Mini setting previews (88x88) ----------

function clearMini(ctx, w, h) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = BASE_BG;
  ctx.fillRect(0, 0, w, h);
}

function drawSettingFrame(ctx, kind, settings, audio, dt, state) {
  const w = 88;
  const h = 88;
  const cx = 44;
  const cy = 44;
  const s = settings ? { ...DEFAULTS, ...settings } : DEFAULTS;
  const cols = getPaletteRgbs(s, { applySat: kind !== 'saturation', applyHue: true });
  const t = audio.t;

  switch (kind) {
    case 'size': {
      clearMini(ctx, w, h);
      const norm = clamp((s.size - 0.5) / 1.5, 0, 1);
      const r = clamp(10 + norm * 24 + audio.bass * 3.5 + audio.pulse * 3, 7, 40);

      // Subtle reference ring at default (100%) scale
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.stroke();

      // Outer glowing aura
      ctx.globalCompositeOperation = 'lighter';
      const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g1.addColorStop(0, rgba(cols[2 % cols.length], 0.95));
      g1.addColorStop(0.5, rgba(cols[0], 0.45));
      g1.addColorStop(1, rgba(cols[0], 0));
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Soft luminous center
      const coreR = r * 0.45;
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      g2.addColorStop(0, 'rgba(255,255,255,0.75)');
      g2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }

    case 'form': {
      clearMini(ctx, w, h);
      const f = clamp(s.form, 0, 2);
      const grad = ctx.createLinearGradient(16, 16, 72, 72);
      grad.addColorStop(0, rgba(cols[3 % cols.length], 0.92));
      grad.addColorStop(1, rgba(cols[1 % cols.length], 0.85));

      ctx.beginPath();
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const r = clamp(
          21 + f * 5.2 * Math.sin(a * 3 + t * 2.1)
             + f * 3.0 * Math.sin(a * 5 - t * 3.1)
             + f * 1.8 * Math.cos(a * 2 + t * 1.3),
          8,
          38,
        );
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      break;
    }

    case 'trails': {
      const trailVal = clamp(s.trails, 0, 1.5);
      const keep = clamp(trailVal * 0.78, 0, 0.94);
      const col = cols[1 % cols.length];
      const col2 = cols[0];

      // Static reduced-motion snapshot OR initial seed frame: draw multi-step orbit tail
      if (audio.reduced || !state.trailsReady) {
        clearMini(ctx, w, h);
        const samples = 18;
        const baseT = audio.reduced ? 2.6 : t;
        ctx.globalCompositeOperation = 'lighter';
        for (let k = samples; k >= 0; k--) {
          const tt = baseT - k * 0.045;
          const px = cx + Math.sin(tt * 3.1) * 25;
          const py = cy + Math.cos(tt * 2.1) * 19;
          const alpha = k === 0 ? 1 : Math.pow(keep, k * 1.5) * 0.85;
          if (alpha < 0.015) continue;
          const orbR = 11.5 - k * 0.25;
          const g = ctx.createRadialGradient(px, py, 0, px, py, Math.max(3, orbR));
          g.addColorStop(0, rgba(k === 0 ? [255, 255, 255] : col, alpha * 0.9));
          g.addColorStop(0.45, rgba(col, alpha * 0.65));
          g.addColorStop(1, rgba(col2, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(3, orbR), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        state.trailsReady = !audio.reduced;
        break;
      }

      // On immediate prop-sync redraw (dt === 0) while animated, skip fading to avoid speedups
      if (dt <= 0) break;

      const fadeAlpha = trailVal <= 0.01 ? 1 : 1 - Math.pow(keep, dt * 46);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(8,7,15,${clamp(fadeAlpha, 0.04, 1).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);

      const px = cx + Math.sin(t * 3.1) * 25;
      const py = cy + Math.cos(t * 2.1) * 19;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(px, py, 0, px, py, 12.5);
      g.addColorStop(0, 'rgba(255,255,255,0.92)');
      g.addColorStop(0.35, rgba(col, 0.88));
      g.addColorStop(1, rgba(col2, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 12.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }

    case 'saturation': {
      clearMini(ctx, w, h);
      const sat = clamp(s.saturation, 0, 2);
      const rawCols = getPaletteRgbs(s, { applySat: false, applyHue: true });
      const boostGlow = clamp((sat - 1) / 0.8, 0, 1);

      for (let i = 0; i < 5; i++) {
        const rgb = adjustSaturation(rawCols[i % rawCols.length], sat);
        const bx = 9 + i * 14.5;
        const bw = 11.5;
        const by = 16;
        const bh = 56;

        if (boostGlow > 0.02) {
          ctx.globalCompositeOperation = 'lighter';
          const halo = ctx.createRadialGradient(bx + bw / 2, cy, 2, bx + bw / 2, cy, 22);
          halo.addColorStop(0, rgba(rgb, 0.24 * boostGlow));
          halo.addColorStop(1, rgba(rgb, 0));
          ctx.fillStyle = halo;
          ctx.fillRect(bx - 8, by - 8, bw + 16, bh + 16);
          ctx.globalCompositeOperation = 'source-over';
        }

        const barGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
        barGrad.addColorStop(0, rgba(rgb.map((c) => lerp(c, 255, 0.14)), 1));
        barGrad.addColorStop(0.5, rgba(rgb, 1));
        barGrad.addColorStop(1, rgba(rgb.map((c) => c * 0.78), 1));
        ctx.fillStyle = barGrad;
        roundedRectPath(ctx, bx, by, bw, bh, 5);
        ctx.fill();
      }
      break;
    }

    case 'beatPulse': {
      clearMini(ctx, w, h);
      const bp = clamp(s.beatPulse, 0, 2.5);
      const col0 = cols[0];
      const col1 = cols[1 % cols.length];

      // Expanding beat shockwave ring
      const ringR = 13 + audio.beatPhase * 27;
      const ringA = (1 - audio.beatPhase) * clamp(bp * 0.38, 0, 0.65);
      if (ringA > 0.01) {
        ctx.strokeStyle = rgba(col1, ringA);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Pulsing core orb
      const r = clamp(12 + audio.pulse * 12.5 * bp, 10, 39);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.32, rgba(col0, 0.92));
      g.addColorStop(0.72, rgba(col1, 0.35));
      g.addColorStop(1, rgba(col0, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }

    case 'smoothing': {
      clearMini(ctx, w, h);
      const sm = clamp(s.smoothing, 0.4, 2.5);
      const tau = 0.08 * sm * sm + 0.02;
      const col = cols[1 % cols.length];
      const baseY = 72;
      const peakY = 16;
      const spanY = baseY - peakY;
      const startX = 16;
      const spanX = 60;
      const windowSec = 0.48;

      // Baseline axis
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(8, baseY);
      ctx.lineTo(80, baseY);
      ctx.stroke();

      // Soft area fill under decay curve
      const areaGrad = ctx.createLinearGradient(0, peakY, 0, baseY);
      areaGrad.addColorStop(0, rgba(col, 0.34));
      areaGrad.addColorStop(1, rgba(col, 0.02));
      ctx.beginPath();
      ctx.moveTo(10, baseY);
      ctx.lineTo(startX, peakY);
      for (let i = 0; i <= 60; i++) {
        const px = startX + (i / 60) * spanX;
        const tt = (i / 60) * windowSec;
        ctx.lineTo(px, baseY - spanY * Math.exp(-tt / tau));
      }
      ctx.lineTo(startX + spanX, baseY);
      ctx.closePath();
      ctx.fillStyle = areaGrad;
      ctx.fill();

      // Crisp attack + exponential decay curve
      ctx.strokeStyle = rgba(col, 0.98);
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(10, baseY);
      ctx.lineTo(startX, peakY);
      for (let i = 0; i <= 60; i++) {
        const px = startX + (i / 60) * spanX;
        const tt = (i / 60) * windowSec;
        ctx.lineTo(px, baseY - spanY * Math.exp(-tt / tau));
      }
      ctx.stroke();

      // Live smoothed follower dot
      let dotX;
      let dotY;
      if (audio.reduced) {
        const tt = 0.28 * windowSec;
        dotX = startX + 0.28 * spanX;
        dotY = baseY - spanY * Math.exp(-tt / tau);
      } else {
        if (dt > 0) {
          const decay = Math.exp(-dt / tau);
          state.smoothEnv = Math.max(audio.kick, state.smoothEnv * decay);
        }
        const elapsed = audio.beatPhase * audio.beatPeriod;
        const frac = clamp(elapsed / windowSec, 0, 1);
        dotX = startX + frac * spanX;
        dotY = baseY - spanY * clamp(state.smoothEnv, 0, 1);
      }

      ctx.fillStyle = rgba(col, 0.45);
      ctx.beginPath();
      ctx.arc(dotX, dotY, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'speed': {
      clearMini(ctx, w, h);
      const sp = clamp(s.speed, 0.1, 3);
      if (!audio.reduced && dt > 0) {
        state.wavePhase = (state.wavePhase + dt * 4.4 * sp) % (Math.PI * 200);
      }
      const ph = audio.reduced ? 1.2 : state.wavePhase;
      const col0 = cols[0];
      const col1 = cols[1 % cols.length];

      // Subtle center guide
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(6, cy);
      ctx.lineTo(82, cy);
      ctx.stroke();

      // Secondary harmonic wave
      ctx.strokeStyle = rgba(col1, 0.42);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 76; i += 2) {
        const px = 6 + i;
        const py = cy + Math.sin(i * 0.115 + ph * 0.8 + 1.4) * 14;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Primary glowing wave
      ctx.beginPath();
      for (let i = 0; i <= 76; i += 2) {
        const px = 6 + i;
        const py = cy + Math.sin(i * 0.125 + ph) * 19;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = rgba(col0, 0.28);
      ctx.lineWidth = 7.5;
      ctx.stroke();
      ctx.strokeStyle = rgba(col0, 0.96);
      ctx.lineWidth = 3.2;
      ctx.stroke();
      break;
    }

    case 'glass': {
      clearMini(ctx, w, h);
      const gAmt = clamp(s.glass, 0, 1.5);
      const col0 = cols[0];
      const col1 = cols[1 % cols.length];
      const col2 = cols[2 % cols.length];

      // Soft colorful liquid refraction background
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const c = i === 0 ? col0 : i === 1 ? col1 : col2;
        const bx = cx + Math.sin(t * 0.7 + i * 2.1) * 18;
        const by = cy + Math.cos(t * 0.6 + i * 1.9) * 16;
        const rg = ctx.createRadialGradient(bx, by, 2, bx, by, 32);
        rg.addColorStop(0, rgba(c, 0.75));
        rg.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(bx, by, 32, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      if (gAmt > 0.01) {
        const vis = clamp(gAmt / 1.2, 0, 1.2);
        const hiBoost = 0.78 + audio.high * 0.32;

        // Translucent liquid-glass droplet lens
        const dome = ctx.createRadialGradient(cx - 10, cy - 10, 2, cx, cy, 30);
        dome.addColorStop(0, `rgba(255,255,255,${clamp(0.24 * vis, 0, 0.34).toFixed(3)})`);
        dome.addColorStop(0.6, `rgba(255,255,255,${clamp(0.06 * vis, 0, 0.12).toFixed(3)})`);
        dome.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = dome;
        ctx.beginPath();
        ctx.arc(cx, cy, 29, 0, Math.PI * 2);
        ctx.fill();

        // Sweeping diagonal glass sheen streaks
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 28, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        const sweep = Math.sin(t * 0.9) * 14;
        for (let k = 0; k < 2; k++) {
          const off = (k === 0 ? -9 : 11) + sweep;
          const sg = ctx.createLinearGradient(14 + off, 14, 70 + off, 74);
          sg.addColorStop(0, 'rgba(255,255,255,0)');
          sg.addColorStop(0.45, `rgba(255,255,255,${clamp(0.44 * vis * hiBoost, 0, 0.72).toFixed(3)})`);
          sg.addColorStop(0.55, `rgba(255,255,255,${clamp(0.62 * vis * hiBoost, 0, 0.85).toFixed(3)})`);
          sg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = sg;
          ctx.lineWidth = k === 0 ? 5.5 : 2.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(10 + off, 68);
          ctx.quadraticCurveTo(cx + off * 0.5, cy - 6, 74 + off, 18);
          ctx.stroke();
        }
        ctx.restore();

        // Top-left luminous specular rim + softer bottom-right counter-rim
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(255,255,255,${clamp(0.75 * vis * hiBoost, 0, 0.92).toFixed(3)})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 27, Math.PI * 1.06, Math.PI * 1.62);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255,255,255,${clamp(0.36 * vis, 0, 0.5).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 27, Math.PI * 0.08, Math.PI * 0.48);
        ctx.stroke();
      }
      break;
    }

    default:
      clearMini(ctx, w, h);
  }
}

// ---------- LED strip preview renderer (24 imperative DOM nodes) ----------

function createLedState() {
  return {
    flow: 0,
    pulse: 0.4,
    level: 0.55,
    peak: 0.4,
    waves: [],
    waveColor: 0,
    chase: 0,
    chaseTarget: 0,
    chaseDir: 1,
    sparks: new Float32Array(LED_COUNT),
    hatHits: new Float32Array(LED_COUNT),
    snareHits: new Float32Array(LED_COUNT),
    effect: 'flow',
    prevEffect: null,
    blend: 1,
    autoTimer: 0,
    autoIndex: 0,
    strobeT: 0,
    strobeSeed: 1,
    strobePhase: 0,
    lastColors: new Array(LED_COUNT).fill(''),
  };
}

function ledEffectColor(effect, L, cols01, i, x, lvl, spread) {
  const mid = Math.abs(x - 0.5) * 2;
  const along = spread * 3 * x;
  const base = L.flow * 0.65;
  switch (effect) {
    case 'wave': {
      const bg = paletteAt01(cols01, base + along);
      let r = bg[0] * 0.3;
      let g = bg[1] * 0.3;
      let b = bg[2] * 0.3;
      for (let w = 0; w < L.waves.length; w++) {
        const wave = L.waves[w];
        const dist = Math.abs(mid - wave.r);
        const a = Math.min(1, Math.exp(-(dist * dist) / 0.015) * wave.a);
        if (a > 0.01) {
          const wc = cols01[wave.c % cols01.length];
          r = lerp(r, wc[0], a);
          g = lerp(g, wc[1], a);
          b = lerp(b, wc[2], a);
        }
      }
      return [r, g, b];
    }
    case 'meter': {
      const len = clamp(0.16 + 0.84 * lvl);
      const c = paletteAt01(cols01, base + mid * spread * 2.1);
      if (mid <= len) {
        const k = 0.62 + 0.38 * (1 - mid / Math.max(0.05, len));
        return [c[0] * k, c[1] * k, c[2] * k];
      }
      if (Math.abs(mid - L.peak) < 1.4 / LED_COUNT) return [0.82, 0.82, 0.82];
      return [c[0] * 0.07, c[1] * 0.07, c[2] * 0.07];
    }
    case 'chase': {
      const block = Math.max(1, Math.round(LED_COUNT / 6));
      const pos = i / block + L.chase;
      const k = Math.floor(((pos % cols01.length) + cols01.length) % cols01.length);
      const edge = 1 - Math.abs((((pos % 1) + 1) % 1) - 0.5) * 0.55;
      const c = cols01[k];
      return [c[0] * edge, c[1] * edge, c[2] * edge];
    }
    case 'sparks': {
      const baseC = paletteAt01(cols01, base + along);
      const k = 0.14 + 0.86 * L.pulse;
      let r = baseC[0] * k;
      let g = baseC[1] * k;
      let b = baseC[2] * k;
      const hh = L.hatHits[i];
      if (hh > 0.01) {
        const hc = cols01[(i + 2) % cols01.length];
        const a = Math.min(1, hh);
        r = lerp(r, hc[0], a);
        g = lerp(g, hc[1], a);
        b = lerp(b, hc[2], a);
      }
      const sn = L.snareHits[i];
      if (sn > 0.01) {
        const a = Math.min(1, sn);
        r = lerp(r, 1, a);
        g = lerp(g, 1, a);
        b = lerp(b, 1, a);
      }
      return [r, g, b];
    }
    default: // flow
      return paletteAt01(cols01, base + along);
  }
}

function updateLedNodes(nodes, settings, audio, dt, L) {
  if (!nodes || nodes.length === 0) return;
  const s = settings ? { ...DEFAULTS, ...settings } : DEFAULTS;

  if (!s.lights) {
    for (let i = 0; i < nodes.length; i++) {
      if (L.lastColors[i] !== OFF_LED) {
        L.lastColors[i] = OFF_LED;
        nodes[i].style.setProperty('--c', OFF_LED);
      }
    }
    return;
  }

  const cols01 = getPaletteRgbs(s, { applySat: true, applyHue: true }).map(ledNormalize);
  const spread = clamp(Number.isFinite(s.lightSpread) ? s.lightSpread : 0.6, 0, 1);
  const bright = clamp(Number.isFinite(s.lightBrightness) ? s.lightBrightness : 0.8, 0, 1);
  const amp = clamp(Number.isFinite(s.lightPulse) ? s.lightPulse : 1, 0, 2);

  // Resolve target effect
  if (s.lightEffect === 'auto') {
    if (!audio.reduced && dt > 0) {
      L.autoTimer += dt;
      if (L.autoTimer > 5.5) {
        L.autoTimer = 0;
        L.autoIndex = (L.autoIndex + 1) % AUTO_EFFECTS.length;
        const next = AUTO_EFFECTS[L.autoIndex];
        if (next !== L.effect) {
          L.prevEffect = L.effect;
          L.effect = next;
          L.blend = 0;
        }
      }
    }
  } else if (AUTO_EFFECTS.includes(s.lightEffect) && s.lightEffect !== L.effect) {
    L.prevEffect = L.effect;
    L.effect = s.lightEffect;
    L.blend = 0;
    if (s.lightEffect === 'wave' && L.waves.length === 0) {
      L.waves.push({ r: 0.15, a: 0.95, c: L.waveColor });
      L.waveColor = (L.waveColor + 1) % cols01.length;
    }
  }

  if (audio.reduced) {
    L.pulse = 0.65;
    L.level = 0.82;
    L.peak = 0.88;
    L.blend = 1;
    if (L.waves.length === 0) L.waves.push({ r: 0.42, a: 0.85, c: 1 });
  } else if (dt > 0) {
    L.flow += dt * clamp(s.speed || 1, 0.2, 2.5) * (0.45 + 0.55 * audio.drive);
    if (audio.kickHit) {
      L.pulse = Math.max(L.pulse, 0.65 + 0.35 * audio.kick);
      L.waves.push({ r: 0, a: 1, c: L.waveColor });
      if (L.waves.length > 6) L.waves.shift();
      L.waveColor = (L.waveColor + 1) % cols01.length;
      L.chaseTarget += L.chaseDir;
    } else {
      L.pulse = Math.max(L.pulse * Math.exp(-dt * 8.5), audio.pulse * 0.72);
    }
    if (audio.snareHit) L.chaseDir = -L.chaseDir;

    for (let w = 0; w < L.waves.length; w++) {
      L.waves[w].r += dt * 2.2;
      L.waves[w].a *= Math.exp(-dt * 1.55);
    }
    L.waves = L.waves.filter((w) => w.r < 1.25 && w.a > 0.03);
    L.chase += (L.chaseTarget - L.chase) * (1 - Math.exp(-dt / 0.065));

    const base = clamp(0.54 + 0.26 * audio.bass + 0.14 * audio.mid + 0.08 * audio.drive);
    const depth = clamp(0.62 * amp, 0, 0.88);
    const target = base * (1 - depth + depth * L.pulse);
    L.level += (target - L.level) * (1 - Math.exp(-dt / (target > L.level ? 0.02 : 0.07)));
    L.peak = Math.max(clamp(0.16 + 0.84 * L.level), L.peak - dt * 0.55);
    L.blend = Math.min(1, L.blend + dt / 0.65);

    if (audio.hatHit) {
      const idx = Math.floor(hash01(Math.floor(audio.t * 1000) + 7, 1) * LED_COUNT);
      if (s.lightSparkle) L.sparks[idx] = clamp(0.45 + audio.high);
      L.hatHits[idx] = 1;
    }
    if (audio.snareHit) {
      const at = Math.floor(hash01(Math.floor(audio.t * 1000) + 19, 2) * LED_COUNT);
      for (let k = Math.max(0, at - 1); k <= Math.min(LED_COUNT - 1, at + 1); k++) {
        L.snareHits[k] = 1;
      }
    }
    const spDecay = Math.exp(-dt * 10);
    const hhDecay = Math.exp(-dt * 7);
    const snDecay = Math.exp(-dt * 9);
    for (let i = 0; i < LED_COUNT; i++) {
      L.sparks[i] *= spDecay;
      L.hatHits[i] *= hhDecay;
      L.snareHits[i] *= snDecay;
    }
  }

  // Safe strobe preview: ALWAYS capped <= 3 Hz and never active in reduced-motion mode
  const strobing = !audio.reduced
    && Boolean(s.lightStrobe)
    && (s.lightStrobeMode === 'always' || audio.dropping);
  if (strobing && dt > 0) {
    const safeRate = Math.min(3, Math.max(0.5, Number(s.lightStrobeRate) || 3));
    L.strobeT += dt;
    if (L.strobeT >= 1 / safeRate) {
      L.strobeT = 0;
      L.strobeSeed = (L.strobeSeed * 1664525 + 1013904223) >>> 0;
      L.strobePhase = 1 - L.strobePhase;
    }
  }

  // Perceptual sRGB scaling for UI preview (hardware LEDs use linear PWM, UI uses sRGB).
  const lvlVis = clamp(0.45 + 0.55 * L.level);
  const bVis = bright > 0 ? clamp(0.35 + 0.65 * bright) : 0;
  const flashPalette = s.strobeColor === 'palette';
  const strobeInt = clamp(Number.isFinite(s.strobeIntensity) ? s.strobeIntensity : 0.85, 0, 1);

  for (let i = 0; i < nodes.length; i++) {
    const x = nodes.length > 1 ? i / (nodes.length - 1) : 0.5;
    let c = ledEffectColor(L.effect, L, cols01, i, x, L.level, spread);
    if (L.blend < 1 && L.prevEffect) {
      const prevC = ledEffectColor(L.prevEffect, L, cols01, i, x, L.level, spread);
      c = [
        lerp(prevC[0], c[0], L.blend),
        lerp(prevC[1], c[1], L.blend),
        lerp(prevC[2], c[2], L.blend),
      ];
    }

    let r = c[0] * lvlVis;
    let g = c[1] * lvlVis;
    let b = c[2] * lvlVis;

    if (s.lightSparkle && L.sparks[i] > 0.01) {
      const sp = Math.min(1, L.sparks[i] * 0.55);
      r = lerp(r, 1, sp);
      g = lerp(g, 1, sp);
      b = lerp(b, 1, sp);
    }

    r *= bVis;
    g *= bVis;
    b *= bVis;

    if (strobing) {
      const on = s.lightStrobeStyle === 'full'
        ? L.strobePhase === 1
        : hash01(L.strobeSeed, i) < 0.42;
      if (on) {
        const fc = flashPalette ? cols01[i % cols01.length] : [1, 1, 1];
        r = fc[0] * strobeInt * bVis;
        g = fc[1] * strobeInt * bVis;
        b = fc[2] * strobeInt * bVis;
      } else {
        r = 0.06;
        g = 0.055;
        b = 0.09;
      }
    }

    const colorStr = `rgb(${Math.round(clamp(r) * 255)},${Math.round(clamp(g) * 255)},${Math.round(clamp(b) * 255)})`;
    if (L.lastColors[i] !== colorStr) {
      L.lastColors[i] = colorStr;
      nodes[i].style.setProperty('--c', colorStr);
    }
  }
}

function resolveThumbCfg(cfg) {
  if (!cfg.isCover) return cfg;
  return { ...cfg, cols: getPaletteRgbs(cfg.sourceSettings) };
}

// ---------- Exported React Components (ONLY components exported) ----------

export function SceneThumb({ scene, active = true }) {
  const canvasRef = useRef(null);
  const propsRef = useRef(null);

  useEffect(() => {
    const merged = { ...DEFAULTS, ...(scene?.values || {}) };
    const phase = stringSeed(scene?.id || scene?.name || '');
    propsRef.current = {
      style: merged.style || 'minimal',
      cols: getPaletteRgbs(merged),
      isCover: merged.palette === 'cover',
      sourceSettings: merged,
      bgRgb: parseHex(merged.bgColor),
      size: merged.size,
      form: merged.form,
      count: merged.count,
      glass: merged.glass,
      speed: merged.speed,
      symmetry: merged.symmetry || 'off',
      symmetrySegments: merged.symmetrySegments,
      symmetrySpin: merged.symmetrySpin,
      phase,
    };
    if (active && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const snap = currentSnapshot();
        const cfg = resolveThumbCfg(propsRef.current);
        const speed = clamp(cfg.speed || 1, 0.35, 2.2);
        drawFluidThumb(ctx, 120, 90, snap.t * speed + cfg.phase, snap, cfg, false);
      }
    }
  }, [scene, active]);

  useEffect(() => {
    if (!active) return undefined;
    return subscribePreview((audio) => {
      const canvas = canvasRef.current;
      const raw = propsRef.current;
      if (!canvas || !raw) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cfg = resolveThumbCfg(raw);
      const speed = clamp(cfg.speed || 1, 0.35, 2.2);
      drawFluidThumb(ctx, 120, 90, audio.t * speed + cfg.phase, audio, cfg, false);
    });
  }, [active]);

  return <canvas ref={canvasRef} width={120} height={90} className="pv-canvas" aria-hidden="true" />;
}

export function StyleThumb({ styleId, settings, active = true }) {
  const canvasRef = useRef(null);
  const propsRef = useRef(null);

  useEffect(() => {
    const merged = settings ? { ...DEFAULTS, ...settings } : DEFAULTS;
    const phase = stringSeed(styleId || 'minimal');
    propsRef.current = {
      style: styleId || 'minimal',
      cols: getPaletteRgbs(merged),
      isCover: merged.palette === 'cover',
      sourceSettings: merged,
      bgRgb: parseHex(merged.bgColor),
      size: 1.0,
      form: 1.0,
      count: 5,
      glass: merged.glass,
      speed: 0.9,
      symmetry: 'off',
      symmetrySegments: 6,
      symmetrySpin: 0,
      phase,
    };
    if (active && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const snap = currentSnapshot();
        const cfg = resolveThumbCfg(propsRef.current);
        drawFluidThumb(ctx, 120, 90, snap.t * cfg.speed + cfg.phase, snap, cfg, false);
      }
    }
  }, [styleId, settings, active]);

  useEffect(() => {
    if (!active) return undefined;
    return subscribePreview((audio) => {
      const canvas = canvasRef.current;
      const raw = propsRef.current;
      if (!canvas || !raw) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cfg = resolveThumbCfg(raw);
      drawFluidThumb(ctx, 120, 90, audio.t * cfg.speed + cfg.phase, audio, cfg, false);
    });
  }, [active]);

  return <canvas ref={canvasRef} width={120} height={90} className="pv-canvas" aria-hidden="true" />;
}

export function SymmetryThumb({ mode, settings, active = true }) {
  const canvasRef = useRef(null);
  const propsRef = useRef(null);

  useEffect(() => {
    const merged = settings ? { ...DEFAULTS, ...settings } : DEFAULTS;
    const phase = stringSeed(`sym-${mode || 'off'}`);
    propsRef.current = {
      style: merged.style || 'minimal',
      cols: getPaletteRgbs(merged),
      isCover: merged.palette === 'cover',
      sourceSettings: merged,
      bgRgb: parseHex(merged.bgColor),
      size: 0.95,
      form: 1.05,
      count: 4,
      glass: merged.glass,
      speed: 0.85,
      symmetry: mode || 'off',
      symmetrySegments: merged.symmetrySegments,
      symmetrySpin: merged.symmetrySpin,
      phase,
    };
    if (active && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const snap = currentSnapshot();
        const cfg = resolveThumbCfg(propsRef.current);
        drawFluidThumb(ctx, 120, 90, snap.t * cfg.speed + cfg.phase, snap, cfg, true);
      }
    }
  }, [mode, settings, active]);

  useEffect(() => {
    if (!active) return undefined;
    return subscribePreview((audio) => {
      const canvas = canvasRef.current;
      const raw = propsRef.current;
      if (!canvas || !raw) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cfg = resolveThumbCfg(raw);
      drawFluidThumb(ctx, 120, 90, audio.t * cfg.speed + cfg.phase, audio, cfg, true);
    });
  }, [active]);

  return <canvas ref={canvasRef} width={120} height={90} className="pv-canvas" aria-hidden="true" />;
}

export function SettingPreview({ kind, settings, active = true }) {
  const canvasRef = useRef(null);
  const propsRef = useRef(null);
  const stateRef = useRef(null);

  useEffect(() => {
    if (!stateRef.current) {
      stateRef.current = { trailsReady: false, smoothEnv: 0.5, wavePhase: 0, lastKind: kind };
    } else if (stateRef.current.lastKind !== kind) {
      stateRef.current.trailsReady = false;
      stateRef.current.lastKind = kind;
    }
    if (!active) {
      stateRef.current.trailsReady = false;
    }
    propsRef.current = { kind, settings };
    if (active && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        drawSettingFrame(ctx, kind, settings, currentSnapshot(), 0, stateRef.current);
      }
    }
  }, [kind, settings, active]);

  useEffect(() => {
    if (!active) return undefined;
    return subscribePreview((audio, dt) => {
      const canvas = canvasRef.current;
      const cur = propsRef.current;
      if (!canvas || !cur || !stateRef.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawSettingFrame(ctx, cur.kind, cur.settings, audio, dt, stateRef.current);
    });
  }, [active]);

  return <canvas ref={canvasRef} width={88} height={88} className="pv-canvas" aria-hidden="true" />;
}

export function LedStripPreview({ settings, active = true }) {
  const containerRef = useRef(null);
  const settingsRef = useRef(null);
  const stateRef = useRef(null);

  useEffect(() => {
    if (!stateRef.current) stateRef.current = createLedState();
    settingsRef.current = settings;
    if (active && containerRef.current) {
      updateLedNodes(containerRef.current.children, settings, currentSnapshot(), 0, stateRef.current);
    }
  }, [settings, active]);

  useEffect(() => {
    if (!active) return undefined;
    return subscribePreview((audio, dt) => {
      if (!containerRef.current || !stateRef.current) return;
      updateLedNodes(containerRef.current.children, settingsRef.current, audio, dt, stateRef.current);
    });
  }, [active]);

  return (
    <div ref={containerRef} className="leds" aria-hidden="true">
      {LED_INDICES.map((i) => (
        <i key={i} />
      ))}
    </div>
  );
}
