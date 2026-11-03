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

async function paletteOf(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  return extractPalette(ctx.getImageData(0, 0, size, size).data);
}

function apply(state) {
  if (!state || typeof state !== 'object') return;
  mediaStore.set({ ...state });
  const cover = typeof state.cover === 'string' ? state.cover : '';
  if (cover === coverSeen) return;
  coverSeen = cover;
  // No cover (yet): keep the last colours instead of dropping back to a fixed palette.
  if (!cover) return;
  paletteOf(cover).then((colors) => {
    if (coverSeen !== cover || !colors) return; // a newer cover came in meanwhile
    setCoverColors(colors);
    mediaStore.set({ colors });
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
  bridge.stop().catch(() => {});
  mediaStore.set({ available: null, reason: '', status: 'none', title: '', artist: '', album: '', cover: '' });
}

export const mediaCommand = (cmd) => { bridge?.command(cmd).catch(() => {}); };
