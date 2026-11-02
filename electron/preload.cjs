// The only bridge between the page and the desktop app: window controls, Govee lights,
// the GPU status and (Linux) the desktop sound.
const { contextBridge, ipcRenderer } = require('electron');

// Returns the function that removes the listener again.
function listen(channel, handler) {
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('vibsync', {
  isDesktop: true,
  platform: process.platform,
  setFullscreen: (on, displayId) => ipcRenderer.invoke('vibsync:set-fullscreen', on, displayId),
  toggleFullscreen: (displayId) => ipcRenderer.invoke('vibsync:toggle-fullscreen', displayId),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('vibsync:set-always-on-top', on),
  listDisplays: () => ipcRenderer.invoke('vibsync:list-displays'),
  lights: {
    scan: () => ipcRenderer.invoke('vibsync:lights-scan'),
    test: (device) => ipcRenderer.invoke('vibsync:lights-test', device),
    begin: (devices, opts) => ipcRenderer.invoke('vibsync:lights-begin', devices, opts),
    end: () => ipcRenderer.invoke('vibsync:lights-end'),
    frame: (frames) => ipcRenderer.send('vibsync:lights-frame', frames),
  },
  gpuInfo: () => ipcRenderer.invoke('vibsync:gpu-info'),
  ...(process.platform === 'linux' ? { systemAudio: {
    start: (rate) => ipcRenderer.invoke('vibsync:sysaudio-start', rate),
    stop: () => ipcRenderer.invoke('vibsync:sysaudio-stop'),
    onData: (cb) => listen('vibsync:sysaudio-data', (_e, bytes) => cb(bytes)),
    onEnded: (cb) => listen('vibsync:sysaudio-ended', () => cb()),
  } } : {}),
});
