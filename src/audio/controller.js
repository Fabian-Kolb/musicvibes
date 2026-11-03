import { audioStore } from '../state/store';
import { captureDesktop, captureDevice, isDesktopApp, listInputDevices } from './capture';
import { simulate, genreById } from '../engine/simulator';
import { analyse, createAnalysis, fromLinear, SILENT_FRAME } from './analysis';

// Owns the current audio source and the analyser. The render loop calls read() once
// per frame; nothing here touches React.

let ctx = null, analyser = null, srcNode = null, stream = null, detach = null, freq = null, bands = null;
// Short analyser for the onsets (kicks, snares, hats): half the window, half the delay.
let fastAnalyser = null, fastFreq = null, fast = null;
let current = null;
let token = 0;
let simT = 0;
let version = 0;
let restartTimer = 0;

export const sourceVersion = () => version;
export const currentSource = () => current;

function release() {
  if (srcNode) { srcNode.disconnect(); srcNode = null; }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  if (detach) { detach(); detach = null; }
}

function discard(res) {
  res.stop?.();
  res.stream?.getTracks().forEach((t) => t.stop());
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
    ctx = ctx || new AudioContext({ latencyHint: 'interactive' });
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const res = source === 'desktop' ? await captureDesktop(ctx) : await captureDevice(source);
    if (my !== token) { discard(res); return; }
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 4096; // ~12 Hz per bin at 48 kHz: tight enough to separate kick from voice
      analyser.smoothingTimeConstant = 0.25;
      // -Infinity dB = silence; a zero-filled array would read as full scale before the first block.
      freq = new Float32Array(analyser.frequencyBinCount).fill(-Infinity);
      bands = createAnalysis(ctx.sampleRate, analyser.fftSize);
      fastAnalyser = ctx.createAnalyser();
      fastAnalyser.fftSize = 2048;
      fastAnalyser.smoothingTimeConstant = 0;
      fastFreq = new Float32Array(fastAnalyser.frequencyBinCount).fill(-Infinity);
      fast = { A: createAnalysis(ctx.sampleRate, fastAnalyser.fftSize), spectrum: fastFreq };
    }
    const onEnded = () => {
      if (my !== token) return;
      if (isDesktopApp) {
        // Usually the output device changed (headphones plugged in): reconnect.
        audioStore.set({ state: 'starting', message: '' });
        scheduleRestart(800);
      } else {
        release();
        audioStore.set({ state: 'error', message: 'Die Freigabe wurde beendet.' });
      }
    };
    if (res.node) {
      srcNode = res.node;
      detach = res.stop;
      res.onEnded(onEnded);
    } else {
      stream = res.stream;
      srcNode = ctx.createMediaStreamSource(stream);
      stream.getAudioTracks().forEach((t) => t.addEventListener('ended', onEnded));
    }
    // Analysis only: the analyser is not connected to the speakers, so nothing plays twice.
    srcNode.connect(analyser);
    srcNode.connect(fastAnalyser);
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

// Band levels and onsets for this frame (see analysis.js).
export function read(dt, demoGenre) {
  if (current === 'demo') {
    simT += dt;
    return fromLinear(simulate(genreById(demoGenre), simT));
  }
  if (!analyser || !srcNode || ctx.state !== 'running') return SILENT_FRAME;
  analyser.getFloatFrequencyData(freq);
  fastAnalyser.getFloatFrequencyData(fastFreq);
  return analyse(bands, freq, dt, fast);
}
