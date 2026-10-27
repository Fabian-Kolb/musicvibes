// VibSync desktop app (Windows, Linux).
//
// The main job besides the window: answer getDisplayMedia with the system audio
// loopback, so the visualizer hears what plays on the speakers without a share dialog
// and without capturing the screen picture.

const { app, BrowserWindow, session, desktopCapturer, ipcMain, screen, shell, Menu } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGovee } = require('./govee.cjs');

// Name and icon for the taskbar. On Linux (Wayland especially) the window icon is ignored,
// and the shell reads the icon from a .desktop file. The AppImage build installs one; a
// plain `npm run app` does not, so write it once for the dev run.
app.setName('VibSync');
app.setDesktopName('vibsync.desktop');

function ensureDesktopEntry() {
  if (process.platform !== 'linux' || app.isPackaged) return;
  const dir = path.join(os.homedir(), '.local', 'share', 'applications');
  const file = path.join(dir, 'vibsync.desktop');
  if (fs.existsSync(file)) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, [
      '[Desktop Entry]',
      'Name=VibSync',
      'Comment=Musik-Visualizer',
      `Exec=${process.execPath} ${path.join(__dirname, '..')}`,
      `Icon=${path.join(__dirname, '..', 'build', 'icon.png')}`,
      'Type=Application',
      'Categories=AudioVideo;',
      'StartupWMClass=VibSync',
      '',
    ].join('\n'));
  } catch (err) {
    console.warn('Desktop-Eintrag konnte nicht angelegt werden:', err.message);
  }
}

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
const govee = createGovee();

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
  win.on('closed', () => { win = null; govee.end().catch(() => {}); });
  // A reload starts the page over: the lights get their own state back until it asks again.
  win.webContents.on('did-start-navigation', (e) => { if (e.isMainFrame && !e.isSameDocument) govee.end().catch(() => {}); });
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  ensureDesktopEntry();
  // Without hardware acceleration the shader runs on the CPU and the frame rate drops.
  // The log shows which path Chromium took, so a 30-FPS report can be checked.
  app.getGPUFeatureStatus && console.info('GPU:', JSON.stringify(app.getGPUFeatureStatus()));

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

  // Govee lights in the local network.
  const devices = (list) => (Array.isArray(list) ? list : []).slice(0, 16)
    .map((d) => ({ ip: String(d && d.ip), mode: d && d.mode === 'single' ? 'single' : 'segments', segments: Number(d && d.segments) || 20 }));
  const why = (err) => (err && err.code === 'EADDRINUSE'
    ? 'Port 4002 ist belegt. Läuft OpenRGB, Govee Desktop oder ein anderes Licht-Programm? Schließe es und versuche es noch einmal.'
    : String((err && err.message) || err));
  ipcMain.handle('vibsync:lights-scan', () => govee.scan(2000).then((list) => ({ list }), (err) => ({ error: why(err) })));
  ipcMain.handle('vibsync:lights-test', (_e, d) => govee.test(devices([d])[0]).catch((err) => ({ error: why(err) })));
  ipcMain.handle('vibsync:lights-begin', (_e, list, opts) => govee.begin(devices(list), { rate: Number(opts && opts.rate) }).then((ips) => ({ ips }), (err) => ({ error: why(err) })));
  ipcMain.handle('vibsync:lights-end', () => govee.end());
  ipcMain.on('vibsync:lights-frame', (_e, frames) => govee.frame(frames));

  createWindow();
});

// Give the lights their state back before the app goes.
let quitting = false;
app.on('before-quit', (e) => {
  if (quitting || !govee.busy()) return;
  e.preventDefault();
  quitting = true;
  const settled = async () => { await govee.end(); while (govee.busy()) await new Promise((r) => setTimeout(r, 50)); };
  Promise.race([settled(), new Promise((r) => setTimeout(r, 1500))]).finally(() => app.quit());
});

app.on('window-all-closed', () => app.quit());
