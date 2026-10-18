// The only bridge between the page and the desktop app: window controls and Govee lights.
const { contextBridge, ipcRenderer } = require('electron');

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
});
