import { audioStore } from '../state/store';
import { captureDesktop, captureDevice, isDesktopApp, listInputDevices } from './capture';
import { simulate, genreById } from '../engine/simulator';

// Owns the current audio source and the analyser. The render loop calls read() once
// per frame; nothing here touches React.

let ctx = null, analyser = null, srcNode = null, stream = null, freq = null;
let current = null;
let token = 0;
let simT = 0;
let version = 0;
let restartTimer = 0;
const SILENT = { bass: 0, mid: 0, high: 0, section: '' };

export const sourceVersion = () => version;
export const currentSource = () => current;

function release() {
  if (srcNode) { srcNode.disconnect(); srcNode = null; }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
}

export async function refreshDevices() {
  audioStore.set({ devices: await listInputDevices() });
}

function scheduleRestart(delay) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => { if (current) startSource(current, { userGesture: true }); }, delay);
}

export async function startSource(source, { userGesture = false } = {}) {
  const my = ++token;
  clearTimeout(restartTimer);
  release();
  current = source;
  version += 1;
  if (source === 'demo') {
    simT = 0;
    audioStore.set({ state: 'live', label: 'Testsignal', message: '' });
    return;
  }
  // In the browser the share dialog may only open from a click.
  if (source === 'desktop' && !isDesktopApp && !userGesture) {
    audioStore.set({ state: 'needs-gesture', label: 'Desktop-Audio', message: '' });
    return;
  }
  audioStore.set({ state: 'starting', label: source === 'desktop' ? 'Desktop-Audio' : 'Audiogerät', message: '' });
  try {
    const res = source === 'desktop' ? await captureDesktop() : await captureDevice(source);
    if (my !== token) { res.stream.getTracks().forEach((t) => t.stop()); return; }
    ctx = ctx || new AudioContext({ latencyHint: 'interactive' });
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 4096; // ~12 Hz per bin at 48 kHz: tight enough to separate kick from voice
      analyser.smoothingTimeConstant = 0.25;
      // -Infinity dB = silence; a zero-filled array would read as full scale before the first block.
      freq = new Float32Array(analyser.frequencyBinCount).fill(-Infinity);
    }
    stream = res.stream;
    srcNode = ctx.createMediaStreamSource(stream);
    // Analysis only: the analyser is not connected to the speakers, so nothing plays twice.
    srcNode.connect(analyser);
    stream.getAudioTracks().forEach((t) => t.addEventListener('ended', () => {
      if (my !== token) return;
      if (isDesktopApp) {
        // Usually the output device changed (headphones plugged in): reconnect.
        audioStore.set({ state: 'starting', message: '' });
        scheduleRestart(800);
      } else {
        release();
        audioStore.set({ state: 'error', message: 'Die Freigabe wurde beendet.' });
      }
    }));
    version += 1;
    audioStore.set({ state: 'live', label: res.label, message: '' });
    refreshDevices();
  } catch (err) {
    if (my !== token) return;
    release();
    audioStore.set({ state: 'error', message: err?.message || String(err) });
  }
}

export function stopSource() {
  token += 1;
  clearTimeout(restartTimer);
  release();
  current = null;
  audioStore.set({ state: 'idle', label: '', message: '' });
}

// In the desktop app a new default output (headphones, HDMI) needs a fresh loopback.
if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    refreshDevices();
    if (isDesktopApp && current === 'desktop') scheduleRestart(1000);
  });
}

function bandAvg(lo, hi) {
  const hz = ctx.sampleRate / analyser.fftSize;
  const a = Math.max(1, Math.floor(lo / hz));
  const z = Math.min(freq.length - 1, Math.ceil(hi / hz));
  let s = 0;
  for (let i = a; i <= z; i++) s += Math.pow(10, freq[i] / 20);
  return s / (z - a + 1);
}

// Raw linear band levels for this frame.
export function read(dt, demoGenre) {
  if (current === 'demo') {
    simT += dt;
    return simulate(genreById(demoGenre), simT);
  }
  if (!analyser || !stream || ctx.state !== 'running') return SILENT;
  analyser.getFloatFrequencyData(freq);
  // Bass stops at 110 Hz: kick and sub-bass, not the body of a voice (100 to 250 Hz is left out on purpose).
  return { bass: bandAvg(30, 110), mid: bandAvg(250, 2500), high: bandAvg(4000, 12000), section: '' };
}
