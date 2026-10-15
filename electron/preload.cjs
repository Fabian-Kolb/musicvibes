// The only bridge between the page and the desktop app: window controls.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vibsync', {
  isDesktop: true,
  platform: process.platform,
  setFullscreen: (on, displayId) => ipcRenderer.invoke('vibsync:set-fullscreen', on, displayId),
  toggleFullscreen: (displayId) => ipcRenderer.invoke('vibsync:toggle-fullscreen', displayId),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('vibsync:set-always-on-top', on),
  listDisplays: () => ipcRenderer.invoke('vibsync:list-displays'),
});
