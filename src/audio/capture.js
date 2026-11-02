// Getting the computer's own sound (what plays on the speakers) as a MediaStream.
//
// Desktop app (Electron): the main process answers getDisplayMedia with loopback audio,
// so no share dialog appears. Windows uses WASAPI loopback. On Linux the main process
// records the default output with parec / pw-record and streams the samples here
// (electron/systemAudio.cjs); Chromium's own loopback and the "Monitor of …" input
// device are the fallbacks.
// Browser: getDisplayMedia shows Chrome's share dialog; the user picks a screen and
// ticks "Systemaudio teilen". The video track is dropped right away.

const RAW_AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

export const desktopBridge = typeof window !== 'undefined' ? window.vibsync : undefined;
export const isDesktopApp = !!desktopBridge?.isDesktop;
const isLinux = (desktopBridge?.platform || navigator.userAgent).toLowerCase().includes('linux');

export class CaptureError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function audioOnly(stream) {
  stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
  return stream;
}

// Plays the samples from the main process into the audio graph. Up to ~80 ms are queued;
// older samples are dropped, so the picture never lags behind the sound.
export const PCM_WORKLET = `
class VibsyncPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.q = []; this.head = 0; this.avail = 0;
    this.port.onmessage = (e) => {
      this.q.push(e.data); this.avail += e.data.length;
      const max = sampleRate * 0.08;
      while (this.avail > max && this.q.length > 1) { this.avail -= this.q[0].length - this.head; this.q.shift(); this.head = 0; }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    let i = 0;
    while (i < out.length && this.q.length) {
      const a = this.q[0];
      const n = Math.min(out.length - i, a.length - this.head);
      out.set(a.subarray(this.head, this.head + n), i);
      i += n; this.head += n; this.avail -= n;
      if (this.head >= a.length) { this.q.shift(); this.head = 0; }
    }
    return true;
  }
}
registerProcessor('vibsync-pcm', VibsyncPcm);
`;
const workletReady = new WeakMap();

async function nativeSystemAudio(ctx) {
  const sys = desktopBridge.systemAudio;
  if (!workletReady.has(ctx)) {
    const url = URL.createObjectURL(new Blob([PCM_WORKLET], { type: 'text/javascript' }));
    workletReady.set(ctx, ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)));
  }
  await workletReady.get(ctx);
  const res = await sys.start(ctx.sampleRate);
  if (!res?.ok) throw new Error(res?.error || 'unbekannter Fehler');
  let node;
  try {
    node = new AudioWorkletNode(ctx, 'vibsync-pcm', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
  } catch (err) {
    sys.stop();
    throw err;
  }
  const offData = sys.onData((bytes) => {
    const samples = new Float32Array(bytes.byteLength / 4);
    new Uint8Array(samples.buffer).set(bytes);
    node.port.postMessage(samples, [samples.buffer]);
  });
  let onEnded = null;
  const offEnded = sys.onEnded(() => onEnded?.());
  return {
    node,
    label: `Desktop-Audio (${res.label})`,
    onEnded: (cb) => { onEnded = cb; },
    stop: () => { offData(); offEnded(); node.disconnect(); sys.stop(); },
  };
}

async function loopbackViaDisplayMedia() {
  // Plain `audio: true` (as electron-audio-loopback does): on Linux the loopback refused
  // to start when the processing flags were passed explicitly.
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
    // Chrome hints so the dialog offers whole screens with system audio.
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
    monitorTypeSurfaces: 'include',
    surfaceSwitching: 'exclude',
  });
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }
  return audioOnly(stream);
}

export async function listInputDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Eingang ${i + 1}` }));
  } catch {
    return [];
  }
}

async function monitorDevice() {
  // Device labels stay empty until audio permission was granted once.
  let devices = await listInputDevices();
  if (!devices.some((d) => /monitor/i.test(d.label))) {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch {
      return null;
    }
    devices = await listInputDevices();
  }
  const mon = devices.find((d) => /monitor/i.test(d.label));
  if (!mon) return null;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...RAW_AUDIO, deviceId: { exact: mon.id } } });
  return { stream, label: mon.label };
}

// Returns { stream, label } or, for the Linux recording, { node, label, onEnded, stop }.
export async function captureDesktop(ctx) {
  let nativeError = '';
  if (desktopBridge?.systemAudio) {
    try {
      return await nativeSystemAudio(ctx);
    } catch (err) {
      nativeError = err?.message || String(err);
      console.warn('Aufnahme über parec/pw-record fehlgeschlagen:', nativeError);
    }
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new CaptureError('unsupported', 'Dieser Browser kann den Desktop-Ton nicht aufnehmen. Nimm die Desktop-App oder Chrome bzw. Edge.');
  }
  let stream = null;
  let loopbackError = '';
  try {
    stream = await loopbackViaDisplayMedia();
  } catch (err) {
    if (!isDesktopApp && err?.name === 'NotAllowedError') {
      throw new CaptureError('denied', 'Freigabe abgebrochen. Wähle im Dialog „Gesamter Bildschirm“ und setze das Häkchen bei „Systemaudio teilen“.');
    }
    // On Linux the monitor fallback below takes over, but keep the reason for the message.
    loopbackError = err?.message || String(err);
    if (!isLinux) throw new CaptureError('failed', `Desktop-Ton ließ sich nicht starten (${loopbackError}).`);
    console.warn('Loopback fehlgeschlagen, versuche Monitor-Gerät:', loopbackError);
  }
  if (stream) return { stream, label: 'Desktop-Audio' };
  if (isLinux) {
    const mon = await monitorDevice();
    if (mon) return { stream: mon.stream, label: 'Desktop-Audio (Monitor)' };
  }
  const reasons = [nativeError, loopbackError && `Loopback: ${loopbackError}`].filter(Boolean).join('; ');
  const hint = reasons ? ` (${reasons})` : '';
  const linuxHint = isLinux ? ' Unter Linux braucht die App „parec“ (Paket pulseaudio-utils) oder „pw-record“ (Paket pipewire).' : '';
  throw new CaptureError('no-audio', isDesktopApp
    ? `Kein Desktop-Ton gefunden${hint}.${linuxHint} Unter Einstellungen → Audio kannst du ein anderes Gerät wählen.`
    : 'Im Dialog wurde kein Ton freigegeben. Wähle „Gesamter Bildschirm“ und setze das Häkchen bei „Systemaudio teilen“.');
}

export async function captureDevice(deviceId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...RAW_AUDIO, deviceId: { exact: deviceId } } });
    const label = stream.getAudioTracks()[0]?.label || 'Audiogerät';
    return { stream, label };
  } catch (err) {
    throw new CaptureError('device', `Das Audiogerät ließ sich nicht öffnen (${err?.message || err}).`);
  }
}
