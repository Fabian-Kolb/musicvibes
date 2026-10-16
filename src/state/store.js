import { useSyncExternalStore } from 'react';
import { DEFAULTS, sanitize } from './settings';

// Tiny external store. The render loop calls get() each frame without React being
// involved; components subscribe with the hooks below.
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    replace(next) {
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const SETTINGS_KEY = 'vibsync.settings.v2';
const SCENES_KEY = 'vibsync.scenes.v2';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: settings simply are not remembered.
  }
}

export const settingsStore = createStore(sanitize(readJson(SETTINGS_KEY, null)));
let saveTimer = 0;
settingsStore.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeJson(SETTINGS_KEY, settingsStore.get()), 300);
});
export const resetSettings = () => settingsStore.replace({ ...DEFAULTS });

const storedScenes = readJson(SCENES_KEY, []);
export const scenesStore = createStore({ list: Array.isArray(storedScenes) ? storedScenes : [] });
scenesStore.subscribe(() => writeJson(SCENES_KEY, scenesStore.get().list));

// Live values from the render loop (levels, mood, drop, fps), published ~10x per second.
export const liveStore = createStore({
  bass: 0, mid: 0, high: 0, drive: 0, mood: 'Ruhig', drop: false, silent: true, fps: 0, section: '',
});

// Audio source status, written by the audio controller.
export const audioStore = createStore({
  state: 'idle', // idle | starting | live | needs-gesture | error
  label: '',
  message: '',
  devices: [],
});

// Govee lights: last scan and connection problems, written by the panel and the render loop.
export const lightStore = createStore({ scanning: false, scanned: false, error: '', testing: '' });

export const useStore = (store) => useSyncExternalStore(store.subscribe, store.get);
export const useSettings = () => useStore(settingsStore);
export const setSetting = (key, value) => settingsStore.set({ [key]: value });
