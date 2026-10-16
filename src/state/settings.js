// All settings live in one plain object. The render loop reads it every frame and the
// panel edits it, so a later phone remote only needs to sync this object.

export const DEFAULT_CUSTOM_COLORS = ['#ff00ff', '#00ffff', '#7000ff', '#ff0055', '#00ffcc'];

export const DEFAULTS = {
  // Bild
  style: 'minimal', // minimal | flat | glass
  palette: 'neon',
  customColors: DEFAULT_CUSTOM_COLORS,
  bgColor: '#07060d',
  brightness: 1,
  saturation: 1,
  hueShift: 0,
  hueDrift: 0.3,
  size: 1,
  count: 6,
  form: 1,
  trails: 1,
  glass: 0.65,
  vignette: 0.35,
  symmetry: 'off', // off | mirror | quad | kaleido
  symmetrySegments: 6,
  symmetrySpin: 0.2,

  // Bewegung
  speed: 1,
  peakSpeed: 1,
  reactivity: 1,
  beatPulse: 1,
  bassImpact: 1,
  midImpact: 1,
  highImpact: 1,
  smoothing: 1,

  // Drops & Strobe
  dropDetection: true,
  dropSensitivity: 1,
  dropColorJump: true,
  dropBoost: true,
  strobe: false,
  strobeMode: 'drop', // drop | always
  strobeSync: 'kick', // kick | rate
  strobeRate: 3,
  strobeSafe: true,
  strobeIntensity: 0.85,
  strobeColor: 'white', // white | palette
  strobeLength: 'short', // short | long

  // Automatik
  autoSwitch: 'off', // off | palette | style | both
  autoTrigger: 'drop', // drop | timer | both
  autoInterval: 4,
  transition: 2,
  shuffle: true,

  // Audio
  source: 'desktop', // desktop | demo | <deviceId>
  demoGenre: 'techno',
  autoGain: true,
  agcTime: 25,
  gain: 1,
  bandRange: 24,
  kickSensitivity: 1,
  silenceLevel: -70,
  latency: 0,

  // Anzeige
  quality: 'auto', // auto | high | medium | low
  fpsLimit: 0, // 0 = so schnell wie der Bildschirm
  showHud: true,
  showFps: false,
  autoHide: 3.5,
  alwaysOnTop: false,
  fullscreenOnStart: false,
  display: '', // Bildschirm für Vollbild (Desktop-App), leer = aktueller
};

export const STYLES = [
  { id: 'minimal', name: 'Minimal' },
  { id: 'flat', name: 'Flächen' },
  { id: 'glass', name: 'Glas' },
];

// Keys a scene ("Szene") stores. Strobe, audio, display and the master brightness stay
// as the user set them: loading a scene must never switch flashing on or dim the room.
export const SCENE_KEYS = [
  'style', 'palette', 'customColors', 'bgColor', 'saturation', 'hueShift', 'hueDrift',
  'size', 'count', 'form', 'trails', 'glass', 'vignette', 'symmetry', 'symmetrySegments', 'symmetrySpin',
  'speed', 'peakSpeed', 'reactivity', 'beatPulse', 'bassImpact', 'midImpact', 'highImpact', 'smoothing',
  'dropColorJump', 'dropBoost', 'autoSwitch', 'autoTrigger', 'autoInterval', 'transition', 'shuffle',
];

export const BUILTIN_SCENES = [
  { id: 'club', name: 'Club', values: {} },
  { id: 'chill', name: 'Chill Lounge', values: { style: 'flat', palette: 'ocean', speed: 0.7, reactivity: 0.8, trails: 1.1, hueDrift: 0.2, form: 0.8 } },
  { id: 'rave', name: 'Rave', values: { style: 'glass', palette: 'neon', speed: 1.3, reactivity: 1.3, peakSpeed: 1.4, beatPulse: 1.4, saturation: 1.15 } },
  { id: 'kaleido', name: 'Kaleidoskop', values: { style: 'flat', palette: 'aurora', symmetry: 'kaleido', symmetrySegments: 8, symmetrySpin: 0.3 } },
  { id: 'ambient', name: 'Sunset Ambient', values: { style: 'minimal', palette: 'sunset', speed: 0.6, count: 4, size: 1.3, reactivity: 0.7 } },
];

export function sceneValues(values) {
  const out = {};
  SCENE_KEYS.forEach((k) => { out[k] = k in values ? values[k] : DEFAULTS[k]; });
  return out;
}

// Merge stored values over the defaults, dropping anything with the wrong type
// (an old or hand-edited entry must not break the app).
export function sanitize(stored) {
  const out = { ...DEFAULTS };
  if (!stored || typeof stored !== 'object') return out;
  Object.keys(DEFAULTS).forEach((k) => {
    const v = stored[k];
    const d = DEFAULTS[k];
    if (v === undefined || v === null) return;
    if (Array.isArray(d)) {
      if (Array.isArray(v) && v.length === d.length && v.every((c) => typeof c === 'string')) out[k] = v;
    } else if (typeof v === typeof d && (typeof v !== 'number' || Number.isFinite(v))) {
      out[k] = v;
    }
  });
  return out;
}
