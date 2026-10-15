// Getting the computer's own sound (what plays on the speakers) as a MediaStream.
//
// Desktop app (Electron): the main process answers getDisplayMedia with loopback audio,
// so no share dialog appears. Windows uses WASAPI loopback; Linux uses the
// PulseAudio/PipeWire loopback. If that yields no audio on Linux, the "Monitor of …"
// input device is the fallback.
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

export async function captureDesktop() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new CaptureError('unsupported', 'Dieser Browser kann den Desktop-Ton nicht aufnehmen. Nimm die Desktop-App oder Chrome bzw. Edge.');
  }
  let stream = null;
  try {
    stream = await loopbackViaDisplayMedia();
  } catch (err) {
    if (!isDesktopApp && err?.name === 'NotAllowedError') {
      throw new CaptureError('denied', 'Freigabe abgebrochen. Wähle im Dialog „Gesamter Bildschirm“ und setze das Häkchen bei „Systemaudio teilen“.');
    }
    if (!isLinux) throw new CaptureError('failed', `Desktop-Ton ließ sich nicht starten (${err?.message || err}).`);
  }
  if (stream) return { stream, label: 'Desktop-Audio' };
  if (isLinux) {
    const mon = await monitorDevice();
    if (mon) return { stream: mon.stream, label: 'Desktop-Audio (Monitor)' };
  }
  throw new CaptureError('no-audio', isDesktopApp
    ? 'Kein Desktop-Ton gefunden. Unter Einstellungen → Audio kannst du ein anderes Gerät wählen.'
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
