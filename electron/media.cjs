// "Now playing": title, artist and cover of the song that plays, plus play/pause and skip.
//
// No Spotify login: the app asks the operating system, which already knows what plays.
// - Windows: the system media controls (what Windows shows next to the volume flyout).
//   A small PowerShell process (nowplaying.ps1) reads them through WinRT. Spotify,
//   browsers and most players report there, and the buttons work without Premium.
// - Linux: MPRIS through `playerctl`.

const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const COMMANDS = ['play-pause', 'next', 'previous'];
const MAX_COVER = 4 * 1024 * 1024;
const EMPTY = {
  available: null, reason: '', status: 'none', app: '', player: '',
  title: '', artist: '', album: '', cover: '', coverError: '', canPlayPause: false, canNext: false, canPrev: false,
};

// A readable player name from a Windows app id or an MPRIS name.
function appName(id) {
  const s = String(id || '');
  const known = [[/spotify/i, 'Spotify'], [/msedge|edge/i, 'Edge'], [/chrome/i, 'Chrome'], [/firefox/i, 'Firefox'],
    [/opera/i, 'Opera'], [/brave/i, 'Brave'], [/vlc/i, 'VLC'], [/zunemusic|groove|media\.player/i, 'Medienwiedergabe'],
    [/tidal/i, 'TIDAL'], [/deezer/i, 'Deezer'], [/applemusic|itunes/i, 'Apple Music'], [/youtube/i, 'YouTube Music']];
  for (const [re, name] of known) if (re.test(s)) return name;
  const tail = s.split('!').pop().split(/[\\/]/).pop().replace(/\.exe$/i, '');
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

function normStatus(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'playing') return 'playing';
  if (v === 'paused') return 'paused';
  if (v === 'none' || v === '' || v === 'closed') return 'none';
  return 'stopped';
}

// Why the cover is missing, in words for the settings panel.
function coverReason(code) {
  const c = String(code || '');
  if (!c) return '';
  if (c === 'no-thumbnail') return 'Der Player gibt Windows kein Cover.';
  if (c === 'empty') return 'Windows liefert ein leeres Cover.';
  if (c === 'too-big') return 'Das Cover ist größer als 4 MB.';
  return `Cover nicht lesbar: ${c.slice(0, 300)}`;
}

// One message from nowplaying.ps1 applied to the state. Pure, for the tests.
function applyWinMessage(state, msg) {
  if (!msg || typeof msg !== 'object') return state;
  if (msg.t === 'error') return { ...EMPTY, available: false, reason: `Windows-Mediensteuerung nicht erreichbar: ${String(msg.message || '').slice(0, 200)}` };
  if (msg.t !== 'state') return state;
  const status = normStatus(msg.status);
  const next = {
    ...state,
    available: true, reason: '', status,
    app: status === 'none' ? '' : appName(msg.app), player: String(msg.app || ''),
    title: String(msg.title || ''), artist: String(msg.artist || ''), album: String(msg.album || ''),
    canPlayPause: !!msg.canPlayPause, canNext: !!msg.canNext, canPrev: !!msg.canPrev,
  };
  next.coverError = coverReason(msg.coverError);
  // PowerShell turns a function result into an array when a stray value slips into its
  // output; take the cover string out of it instead of dropping it.
  if (Array.isArray(msg.cover)) msg = { ...msg, cover: msg.cover.find((c) => typeof c === 'string') || '' };
  if (typeof msg.cover === 'string') next.cover = /^data:image\/[\w.+-]+;base64,/.test(msg.cover) ? msg.cover : '';
  if (status === 'none') next.cover = '';
  return next;
}

// `playerctl -a metadata --format …` output: one line per player. Pure, for the tests.
const PLAYERCTL_FORMAT = ['{{playerName}}', '{{status}}', '{{artist}}', '{{title}}', '{{album}}', '{{mpris:artUrl}}'].join('\t');
function parsePlayerctl(stdout, preferred = '') {
  const players = String(stdout || '').split('\n').filter((l) => l.includes('\t')).map((l) => {
    const [name, status, artist, title, album, artUrl] = l.split('\t');
    return { name, status: normStatus(status), artist, title, album, artUrl: (artUrl || '').trim() };
  });
  let best = null, bestScore = -1;
  players.forEach((p) => {
    const score = (p.status === 'playing' ? 4 : 0) + (/spotify/i.test(p.name) ? 2 : 0) + (p.name === preferred ? 1 : 0);
    if (score > bestScore) { best = p; bestScore = score; }
  });
  return best;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

// Cover for Linux players: an https address (Spotify) or a local file (most others).
async function loadCover(url) {
  if (/^https:\/\//i.test(url)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!res.ok || !/^image\//.test(type)) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length && buf.length <= MAX_COVER ? `data:${type};base64,${buf.toString('base64')}` : '';
  }
  if (/^file:\/\//i.test(url)) {
    const file = decodeURIComponent(new URL(url).pathname);
    const type = MIME[path.extname(file).toLowerCase()];
    if (!type) return '';
    const st = await fs.promises.stat(file);
    if (!st.isFile() || st.size > MAX_COVER) return '';
    return `data:${type};base64,${(await fs.promises.readFile(file)).toString('base64')}`;
  }
  return '';
}

function windowsProvider(update, opts) {
  const script = fs.readFileSync(path.join(__dirname, 'nowplaying.ps1'), 'utf8');
  const exe = opts.powershell || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  let child = null, stopped = false, restarts = 0, timer = 0;

  const launch = () => {
    let buf = '', gotMessage = false;
    const p = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child = p;
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        try {
          const msg = JSON.parse(line);
          gotMessage = true;
          if (msg.t === 'state') restarts = 0;
          update((s) => applyWinMessage(s, msg));
        } catch { /* half a line or noise: ignore */ }
      }
    });
    p.stderr.on('data', () => {});
    p.stdin.on('error', () => {});
    p.on('error', (err) => update(() => ({ ...EMPTY, available: false, reason: `PowerShell ließ sich nicht starten: ${err.message}` })));
    p.on('exit', (code) => {
      if (child === p) child = null;
      if (stopped || code === 2) return; // 2: WinRT missing, already reported
      // Crashed: try again a few times, then give up and say so.
      restarts += 1;
      if (restarts > 3) {
        if (!gotMessage) update(() => ({ ...EMPTY, available: false, reason: 'Die Windows-Mediensteuerung antwortet nicht.' }));
        return;
      }
      timer = setTimeout(launch, 1500 * restarts);
    });
  };
  launch();

  return {
    command(cmd) { if (child && child.stdin.writable) child.stdin.write(`${cmd}\n`); },
    stop() {
      stopped = true;
      clearTimeout(timer);
      if (child) { try { child.stdin.end('quit\n'); } catch { /* gone */ } const c = child; setTimeout(() => { try { c.kill(); } catch { /* gone */ } }, 1500); }
      child = null;
    },
  };
}

function linuxProvider(update, opts) {
  const bin = opts.playerctl || 'playerctl';
  let timer = 0, stopped = false, player = '', coverUrl = '', busy = false;

  const poll = () => {
    if (stopped || busy) return;
    busy = true;
    execFile(bin, ['-a', 'metadata', '--format', PLAYERCTL_FORMAT], { timeout: 2500 }, (err, stdout) => {
      busy = false;
      if (stopped) return;
      if (err && err.code === 'ENOENT') {
        update(() => ({ ...EMPTY, available: false, reason: 'Dafür braucht es das Programm playerctl (z. B. sudo apt install playerctl).' }));
        stopped = true;
        return;
      }
      const p = err ? null : parsePlayerctl(stdout, player);
      if (!p) {
        player = '';
        coverUrl = '';
        update((s) => ({ ...s, ...EMPTY, available: true }));
      } else {
        player = p.name;
        const coverChanged = p.artUrl !== coverUrl;
        update((s) => ({
          ...s, available: true, reason: '', status: p.status, app: appName(p.name), player: p.name,
          title: p.title, artist: p.artist, album: p.album, canPlayPause: true, canNext: true, canPrev: true,
          cover: coverChanged ? '' : s.cover,
        }));
        if (coverChanged) {
          coverUrl = p.artUrl;
          const want = p.artUrl;
          loadCover(want).then((cover) => ({ cover, coverError: cover ? '' : (want ? 'Cover nicht lesbar.' : 'Der Player gibt kein Cover.') }),
            (err) => ({ cover: '', coverError: `Cover nicht lesbar: ${err.message}` })).then((r) => {
            if (!stopped && coverUrl === want) update((s) => ({ ...s, ...r }));
          });
        }
      }
      timer = setTimeout(poll, opts.interval || 1000);
    });
  };
  poll();

  return {
    command(cmd) {
      if (!player) return;
      execFile(bin, ['-p', player, cmd], { timeout: 2500 }, () => { clearTimeout(timer); timer = setTimeout(poll, 150); });
    },
    stop() { stopped = true; clearTimeout(timer); },
  };
}

// onState gets the whole state after every change.
function createMedia({ onState = () => {}, platform = process.platform, ...opts } = {}) {
  let state = { ...EMPTY };
  let provider = null;
  const update = (fn) => {
    const next = fn(state);
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    onState(state);
  };
  return {
    start() {
      if (provider) return state;
      if (platform === 'win32') provider = windowsProvider(update, opts);
      else if (platform === 'linux') provider = linuxProvider(update, opts);
      else update(() => ({ ...EMPTY, available: false, reason: 'Gibt es nur unter Windows und Linux.' }));
      return state;
    },
    stop() {
      if (provider) provider.stop();
      provider = null;
      state = { ...EMPTY };
    },
    command(cmd) { if (provider && COMMANDS.includes(cmd)) provider.command(cmd); },
    state: () => state,
  };
}

module.exports = { createMedia, applyWinMessage, parsePlayerctl, appName, PLAYERCTL_FORMAT, EMPTY };
