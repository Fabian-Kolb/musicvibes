// Five palette colours from an album cover. Pure, so the Node tests can check it.
//
// The cover's pixels are sorted into hue buckets, weighted by how vivid they are, so a
// small bright logo counts more than a large dull area. The strongest hues at least
// 30° apart become the palette, lifted to the brightness the visualizer needs on its
// dark background. A cover with hardly any colour (black and white photo) gets a
// silver palette tinted with its average colour.

const BINS = 36; // 10° each
const MIN_GAP = 3; // bins between picked hues (30°)

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min;
  let h = 0;
  if (c > 0) {
    if (max === r) h = ((g - b) / c + 6) % 6;
    else if (max === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
  }
  return [h / 6, max > 0 ? c / max : 0, max];
}

function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// rgba: pixel data as from getImageData (r, g, b, a per pixel, 0..255).
export function extractPalette(rgba, count = 5) {
  const bins = Array.from({ length: BINS }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let pixels = 0, vivid = 0, ar = 0, ag = 0, ab = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
    pixels += 1;
    ar += r; ag += g; ab += b;
    const [h, s, v] = rgbToHsv(r, g, b);
    if (s < 0.2 || v < 0.15) continue; // grey, white, black
    const w = s * s * v;
    const bin = bins[Math.floor(h * BINS) % BINS];
    bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
    vivid += w;
  }
  if (!pixels) return null;

  // Hardly any colour: silver tones with a hint of the cover's tint.
  const silver = () => {
    const [h, s] = rgbToHsv(ar / pixels, ag / pixels, ab / pixels);
    const tint = clamp(s * 0.6, 0.06, 0.25);
    return [[1, 0.95], [0.6, 0.75], [1.4, 0.55], [0.3, 1], [0.9, 0.65]].slice(0, count)
      .map(([ts, v]) => hsvToHex(h, clamp(tint * ts, 0, 0.35), v));
  };
  if (vivid < pixels * 0.01) return silver();

  // Peaks: each bin together with its neighbours, so a hue split over two bins still wins.
  const score = bins.map((_, i) => bins[i].w + 0.5 * (bins[(i + 1) % BINS].w + bins[(i + BINS - 1) % BINS].w));
  const picks = [];
  const taken = new Array(BINS).fill(false);
  while (picks.length < count) {
    let best = -1;
    score.forEach((sc, i) => { if (!taken[i] && sc > 0 && (best < 0 || sc > score[best])) best = i; });
    if (best < 0 || score[best] < vivid * 0.03) break;
    let w = 0, r = 0, g = 0, b = 0;
    for (let d = -1; d <= 1; d++) {
      const x = bins[(best + d + BINS) % BINS];
      w += x.w; r += x.r; g += x.g; b += x.b;
    }
    const [h, s, v] = rgbToHsv(r / w, g / w, b / w);
    picks.push({ h, s: clamp(s * 1.15, 0.55, 1), v: clamp(Math.max(v, 0.85), 0, 1) });
    for (let d = -MIN_GAP; d <= MIN_GAP; d++) taken[(best + d + BINS) % BINS] = true;
  }

  if (!picks.length) return silver();

  // Fewer hues than colours: lighter and deeper shades of the ones found, a little
  // turned on the colour wheel, like the Mono palette.
  const out = picks.map((p) => [p.h, p.s, p.v]);
  for (let k = 0; out.length < count; k++) {
    const p = picks[k % picks.length];
    const round = Math.floor(k / picks.length);
    const turn = (round % 2 ? -1 : 1) * 0.02 * Math.ceil((round + 1) / 2);
    const deeper = (k + round) % 2 === 0;
    out.push([(p.h + turn + 1) % 1, deeper ? Math.min(1, p.s * 1.1) : p.s * 0.65, deeper ? p.v * 0.72 : 1]);
  }
  return out.map(([h, s, v]) => hsvToHex(h, s, v));
}
