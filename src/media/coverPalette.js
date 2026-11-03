// Five palette colours from an album cover. Pure, so the Node tests can check it.
//
// The cover's pixels are sorted into hue buckets, weighted by how vivid they are, so a
// small bright logo counts more than a large dull area. The strongest hues at least
// 30° apart become the palette, lifted to the brightness the visualizer needs on its
// dark background.
//
// Covers with few colours get colours made up to go with them, so the picture never
// turns into five shades of one colour:
// - one hue: two neighbours on the colour wheel (±30°) and a complementary accent
// - two hues: a neighbour for each and a light version of the main one
// - no colour at all (black, white, grey): the faint tint of the cover if there is
//   one, otherwise a hue from the song's name. The same song always gets the same
//   colours.

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
export function extractPalette(rgba, { count = 5, seed = '' } = {}) {
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

  const picks = [];
  if (vivid >= pixels * 0.01) {
    // Peaks: each bin with its neighbours, so a hue split over two bins still wins.
    const score = bins.map((_, i) => bins[i].w + 0.5 * (bins[(i + 1) % BINS].w + bins[(i + BINS - 1) % BINS].w));
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
      picks.push([h, clamp(s * 1.15, 0.55, 1), clamp(Math.max(v, 0.85), 0, 1)]);
      for (let d = -MIN_GAP; d <= MIN_GAP; d++) taken[(best + d + BINS) % BINS] = true;
    }
  }

  const turn = (h, d) => (h + d + 1) % 1;
  let out;
  if (picks.length >= 3) {
    // Enough colours of its own: fill up with a light and a deep version of the main one.
    const [h, s, v] = picks[0];
    out = [...picks, [turn(h, 0.03), s * 0.55, 1], [turn(h, -0.03), Math.min(1, s * 1.1), v * 0.75]];
  } else if (picks.length === 2) {
    const [a, b] = picks;
    out = [a, b, [turn(a[0], 0.083), a[1], 0.95], [turn(b[0], -0.083), b[1], 0.95], [a[0], a[1] * 0.55, 1]];
  } else {
    let h, s;
    if (picks.length === 1) {
      [h, s] = picks[0];
    } else {
      const [th, ts] = rgbToHsv(ar / pixels, ag / pixels, ab / pixels);
      h = ts >= 0.06 ? th : hueFromText(seed);
      s = 0.7;
    }
    out = [[h, s, 1], [turn(h, 0.083), s, 0.95], [turn(h, 0.5), s * 0.9, 1], [turn(h, -0.083), s, 0.9], [h, s * 0.5, 1]];
  }
  return out.slice(0, count).map(([h, s, v]) => hsvToHex(h, s, v));
}

// A stable hue (0..1) from a text such as "title|artist".
export function hueFromText(text) {
  let x = 2166136261;
  for (const ch of String(text || '')) x = Math.imul(x ^ ch.codePointAt(0), 16777619) >>> 0;
  return (x % 3600) / 3600;
}
