// Tempo per song, so that a song played again has its beat right away. Kept in this
// browser's storage, the last 500 songs.
const KEY = 'vibsync.tempos.v1';
const MAX = 500;

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
let tempos = read();

// The song as the now-playing card knows it, or '' when no song is known.
export const songKey = (m) => (m && m.title ? `${m.artist || ''}|${m.title}`.toLowerCase() : '');

export function rememberedTempo(key) {
  const v = key ? Number(tempos[key]) : 0;
  return Number.isFinite(v) && v >= 50 && v <= 220 ? v : 0;
}

export function rememberTempo(key, bpm) {
  if (!key || !(bpm >= 50 && bpm <= 220)) return;
  delete tempos[key];
  tempos[key] = Math.round(bpm * 10) / 10;
  const keys = Object.keys(tempos);
  if (keys.length > MAX) keys.slice(0, keys.length - MAX).forEach((k) => delete tempos[k]);
  try {
    localStorage.setItem(KEY, JSON.stringify(tempos));
  } catch {
    // Storage full or blocked: the tempo is found again by listening.
  }
}

export function forgetTempo(key) {
  if (!key || !(key in tempos)) return;
  delete tempos[key];
  try { localStorage.setItem(KEY, JSON.stringify(tempos)); } catch { /* see above */ }
}
