// VibSync desktop app (Windows, Linux).
//
// The main job besides the window: answer getDisplayMedia with the system audio
// loopback, so the visualizer hears what plays on the speakers without a share dialog
// and without capturing the screen picture.

const { app, BrowserWindow, session, desktopCapturer, ipcMain, screen, shell, Menu } = require('electron');
const path = require('node:path');

// Chromium switches system-audio loopback on per platform: PulseAudio/PipeWire on Linux,
// ScreenCaptureKit on macOS. Windows (WASAPI loopback) needs no flag.
const LOOPBACK_FEATURES = ['PulseaudioLoopbackForScreenShare', 'MacLoopbackAudioForScreenShare', 'MacSckSystemAudioLoopbackOverride'];
const existing = app.commandLine.getSwitchValue('enable-features');
if (existing) app.commandLine.removeSwitch('enable-features');
app.commandLine.appendSwitch('enable-features', [existing, ...LOOPBACK_FEATURES].filter(Boolean).join(','));

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function displayFor(id) {
  const all = screen.getAllDisplays();
  return all.find((d) => String(d.id) === String(id)) || null;
}

function setFullscreen(on, displayId) {
  if (!win) return;
  if (on && displayId) {
    const d = displayFor(displayId);
    if (d) {
      if (win.isFullScreen()) win.setFullScreen(false);
      win.setBounds({ x: d.bounds.x + 40, y: d.bounds.y + 40, width: Math.min(1280, d.bounds.width - 80), height: Math.min(800, d.bounds.height - 80) });
    }
  }
  win.setFullScreen(on);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 480,
    minHeight: 320,
    backgroundColor: '#05040a',
    title: 'VibSync',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep animating when another window has the focus (second monitor, beamer).
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  Menu.setApplicationMenu(null);

  const devUrl = process.env.VIBSYNC_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Links never open inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !(devUrl && url.startsWith(devUrl))) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  const ses = session.defaultSession;

  // Only microphone/device access and the loopback capture are allowed.
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture');
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media' || permission === 'display-capture');

  // getDisplayMedia → whole screen as (discarded) video plus the system audio loopback.
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!sources.length) { callback({}); return; }
      callback({ video: sources[0], audio: 'loopback' });
    } catch {
      callback({});
    }
  }, { useSystemPicker: false });

  ipcMain.handle('vibsync:set-fullscreen', (_e, on, displayId) => setFullscreen(!!on, displayId));
  ipcMain.handle('vibsync:toggle-fullscreen', (_e, displayId) => setFullscreen(!(win && win.isFullScreen()), displayId));
  ipcMain.handle('vibsync:set-always-on-top', (_e, on) => { if (win) win.setAlwaysOnTop(!!on, 'screen-saver'); });
  ipcMain.handle('vibsync:list-displays', () => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `${d.label || `Bildschirm ${i + 1}`} (${d.size.width}×${d.size.height})${d.id === primary ? ', Hauptbildschirm' : ''}`,
    }));
  });

  createWindow();
});

app.on('window-all-closed', () => app.quit());
