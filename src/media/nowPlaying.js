// The song that plays, from the desktop app (Windows media controls or MPRIS on Linux):
// keeps mediaStore up to date and turns each new cover into the "Cover" palette.
import { desktopBridge } from '../audio/capture';
import { mediaStore } from '../state/store';
import { setCoverColors } from '../state/palettes';
import { extractPalette } from './coverPalette';

const bridge = desktopBridge?.media;
export const mediaSupported = !!bridge;

let unsubscribe = null;
let coverSeen = '';

// Colours for a song whose player gives no cover: made up from title and artist.
const NO_COVER_DELAY = 3000;
const songPalette = (seed) => extractPalette(new Uint8ClampedArray([0, 0, 0, 255]), { seed });
let songKey = '';
let noCoverTimer = 0;

async function paletteOf(url, seed) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  return extractPalette(ctx.getImageData(0, 0, size, size).data, { seed });
}

function useColors(colors) {
  setCoverColors(colors);
  mediaStore.set({ colors });
}

function apply(state) {
  if (!state || typeof state !== 'object') return;
  mediaStore.set({ ...state });
  const key = state.title && state.status !== 'none' ? `${state.title}|${state.artist || ''}` : '';
  const cover = typeof state.cover === 'string' ? state.cover : '';
  if (key !== songKey) {
    songKey = key;
    clearTimeout(noCoverTimer);
    // No cover a few seconds into the song: its own made-up colours instead of the last song's.
    if (key) noCoverTimer = setTimeout(() => { if (songKey === key && !coverSeen) useColors(songPalette(key)); }, NO_COVER_DELAY);
  }
  if (cover === coverSeen) return;
  coverSeen = cover;
  if (!cover) return;
  paletteOf(cover, key).then((colors) => {
    if (coverSeen !== cover || !colors) return; // a newer cover came in meanwhile
    useColors(colors);
  }, () => {});
}

export function startNowPlaying() {
  if (!bridge || unsubscribe) return;
  unsubscribe = bridge.onState(apply);
  bridge.start().then(apply, () => {});
}

export function stopNowPlaying() {
  if (!bridge || !unsubscribe) return;
  unsubscribe();
  unsubscribe = null;
  coverSeen = '';
  songKey = '';
  clearTimeout(noCoverTimer);
  bridge.stop().catch(() => {});
  mediaStore.set({ available: null, reason: '', status: 'none', title: '', artist: '', album: '', cover: '' });
}

export const mediaCommand = (cmd) => { bridge?.command(cmd).catch(() => {}); };
