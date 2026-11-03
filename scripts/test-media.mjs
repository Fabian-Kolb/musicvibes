// Tests for "now playing": the palette from album covers, the messages from the Windows
// media controls, and the Linux route through playerctl (with a fake playerctl), plus
// the Windows route with a fake PowerShell that speaks the same lines as nowplaying.ps1.
// Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { extractPalette } from '../src/media/coverPalette.js';
import { paletteColors, setCoverColors, PALETTES, COVER_PALETTE } from '../src/state/palettes.js';
import { DEFAULTS, sanitize } from '../src/state/settings.js';

const require = createRequire(import.meta.url);
const { createMedia, applyWinMessage, parsePlayerctl, appName, EMPTY } = require('../electron/media.cjs');

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.stack}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(20); }
  throw new Error('timed out');
}

// A 48×48 test cover: rectangles of colour [r, g, b, share of the area].
function cover(parts) {
  const n = 48 * 48;
  const px = new Uint8ClampedArray(n * 4);
  let i = 0;
  parts.forEach(([r, g, b, share], k) => {
    const count = k === parts.length - 1 ? n - i : Math.round(n * share);
    for (let j = 0; j < count; j++, i++) px.set([r, g, b, 255], i * 4);
  });
  return px;
}
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
function hueOf(c) {
  const [r, g, b] = hex(c);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (!d) return -1;
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}
const satOf = (c) => { const [r, g, b] = hex(c); const m = Math.max(r, g, b); return m ? (m - Math.min(r, g, b)) / m : 0; };
const valOf = (c) => Math.max(...hex(c));
const near = (h, target, tol = 25) => h >= 0 && Math.min(Math.abs(h - target), 360 - Math.abs(h - target)) <= tol;

await check('Cover palette: five valid colours, the cover\'s main hues first', () => {
  const p = extractPalette(cover([[220, 30, 40, 0.5], [20, 60, 200, 0.5]]));
  assert.equal(p.length, 5);
  p.forEach((c) => assert.match(c, /^#[0-9a-f]{6}$/));
  const hues = p.slice(0, 2).map(hueOf);
  assert.ok(hues.some((h) => near(h, 357)), `red missing in ${p}`);
  assert.ok(hues.some((h) => near(h, 226)), `blue missing in ${p}`);
});

await check('Cover palette: dark, dull colours are lifted so they glow on the dark background', () => {
  const p = extractPalette(cover([[70, 20, 25, 0.7], [10, 10, 12, 0.3]]));
  assert.ok(near(hueOf(p[0]), 355), `${p}`);
  assert.ok(valOf(p[0]) >= 0.84, `first colour too dark: ${p[0]}`);
  assert.ok(satOf(p[0]) >= 0.55, `first colour too pale: ${p[0]}`);
});

await check('Cover palette: a small vivid spot beats a large grey area', () => {
  const p = extractPalette(cover([[255, 200, 0, 0.06], [128, 128, 128, 0.94]]));
  assert.ok(near(hueOf(p[0]), 47), `${p}`);
});

await check('Cover palette: black and white cover gets made-up colours, the same for the same song', () => {
  const bw = cover([[255, 255, 255, 0.4], [0, 0, 0, 0.3], [120, 120, 120, 0.3]]);
  const a = extractPalette(bw, { seed: 'Song A|Band' });
  assert.equal(a.length, 5);
  assert.ok(a.filter((c) => satOf(c) >= 0.5).length >= 3, `too pale: ${a}`);
  assert.deepEqual(extractPalette(bw, { seed: 'Song A|Band' }), a, 'same song, other colours');
  assert.notDeepEqual(extractPalette(bw, { seed: 'Song B|Band' }), a, 'every song the same colours');
});

await check('Cover palette: a black cover with a faint tint keeps that tint', () => {
  const p = extractPalette(cover([[20, 10, 40, 0.9], [0, 0, 0, 0.1]]), { seed: 'x' });
  assert.ok(near(hueOf(p[0]), 265, 30), `${p}`);
});

await check('Cover palette: one hue gets neighbours and a complementary accent', () => {
  const p = extractPalette(cover([[0, 180, 120, 1]]));
  assert.equal(new Set(p).size, 5, `${p}`);
  assert.ok(near(hueOf(p[0]), 160), `${p}`);
  assert.ok(p.some((c) => near(hueOf(c), 340, 30)), `no accent opposite green: ${p}`);
  assert.ok(p.some((c) => near(hueOf(c), 190, 20)) && p.some((c) => near(hueOf(c), 130, 20)), `no neighbours: ${p}`);
});

await check('Cover palette: two hues get a neighbour each, the cover hues stay first', () => {
  const p = extractPalette(cover([[230, 40, 40, 0.5], [40, 40, 230, 0.5]]));
  assert.ok(near(hueOf(p[0]), 0) || near(hueOf(p[0]), 240), `${p}`);
  assert.ok(near(hueOf(p[1]), 0) || near(hueOf(p[1]), 240), `${p}`);
  assert.equal(new Set(p).size, 5);
});

await check('Cover palette: empty or transparent image gives nothing', () => {
  assert.equal(extractPalette(new Uint8ClampedArray(0)), null);
  assert.equal(extractPalette(new Uint8ClampedArray(16)), null);
});

await check('Palette "Cover": first palette until a cover is read, then the cover colours', () => {
  const S = { ...DEFAULTS, palette: COVER_PALETTE };
  setCoverColors(null);
  assert.deepEqual(paletteColors(S), PALETTES[0].cols);
  const cols = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff'];
  setCoverColors(cols);
  assert.deepEqual(paletteColors(S), cols);
  setCoverColors(['#ff0000']); // malformed: ignored
  assert.deepEqual(paletteColors(S), PALETTES[0].cols);
  setCoverColors(null);
});

await check('Setting nowPlaying: default "auto", stored value kept', () => {
  assert.equal(DEFAULTS.nowPlaying, 'auto');
  assert.equal(sanitize({ nowPlaying: 'always' }).nowPlaying, 'always');
  assert.equal(sanitize({ nowPlaying: 3 }).nowPlaying, 'auto');
});

await check('Player names are readable', () => {
  assert.equal(appName('Spotify.exe'), 'Spotify');
  assert.equal(appName('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'), 'Spotify');
  assert.equal(appName('MSEdge'), 'Edge');
  assert.equal(appName('Chrome'), 'Chrome');
  assert.equal(appName('foobar2000.exe'), 'Foobar2000');
  assert.equal(appName('C:\\Programme\\Winamp\\winamp.exe'), 'Winamp');
});

await check('Windows messages: state, cover kept until a new one comes, errors', () => {
  let s = { ...EMPTY };
  s = applyWinMessage(s, { t: 'state', status: 'Playing', app: 'Spotify.exe', title: 'Song', artist: 'Band', album: 'LP', canPlayPause: true, canNext: true, canPrev: false, cover: 'data:image/jpeg;base64,AAAA' });
  assert.equal(s.available, true);
  assert.equal(s.status, 'playing');
  assert.equal(s.app, 'Spotify');
  assert.equal(s.cover, 'data:image/jpeg;base64,AAAA');
  assert.equal(s.canPrev, false);
  s = applyWinMessage(s, { t: 'state', status: 'Paused', app: 'Spotify.exe', title: 'Song', artist: 'Band', album: 'LP', canPlayPause: true });
  assert.equal(s.status, 'paused');
  assert.equal(s.cover, 'data:image/jpeg;base64,AAAA', 'cover dropped without a new one');
  s = applyWinMessage(s, { t: 'state', status: 'Playing', title: 'X', cover: 'javascript:alert(1)' });
  assert.equal(s.cover, '', 'only image data URLs pass');
  s = applyWinMessage(s, { t: 'state', status: 'none' });
  assert.equal(s.status, 'none');
  assert.equal(s.app, '');
  s = applyWinMessage(s, { t: 'error', message: 'Class not registered' });
  assert.equal(s.available, false);
  assert.match(s.reason, /Class not registered/);
});

await check('playerctl output: playing beats paused, Spotify beats others', () => {
  const line = (name, status, title) => [name, status, 'A', title, 'B', 'https://i.scdn.co/image/x'].join('\t');
  const out = [line('firefox', 'Paused', 'Video'), line('spotify', 'Paused', 'Song'), line('vlc', 'Playing', 'Film')].join('\n');
  assert.equal(parsePlayerctl(out).name, 'vlc');
  assert.equal(parsePlayerctl([line('firefox', 'Paused', 'Video'), line('spotify', 'Paused', 'Song')].join('\n')).name, 'spotify');
  assert.equal(parsePlayerctl([line('firefox', 'Paused', 'V'), line('vlc', 'Paused', 'F')].join('\n'), 'vlc').name, 'vlc');
  assert.equal(parsePlayerctl(''), null);
  assert.equal(parsePlayerctl('No players found'), null);
});

// Fake programs live in a temp folder; they log what they were asked to a file.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibsync-media-'));
const log = path.join(dir, 'log.txt');
const png = path.join(dir, 'cover.png');
fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));

await check('Linux: song, cover from a local file, buttons go to the right player', async () => {
  const fake = path.join(dir, 'playerctl');
  fs.writeFileSync(fake, `#!/bin/sh
echo "$@" >> "${log}"
if [ "$1" = "-a" ]; then
  printf 'firefox\\tPaused\\tSomeone\\tVideo\\t\\t\\nspotify\\tPlaying\\tDaft Punk\\tOne More Time\\tDiscovery\\tfile://${png}\\n'
fi
`, { mode: 0o755 });
  const states = [];
  const media = createMedia({ platform: 'linux', playerctl: fake, interval: 100, onState: (s) => states.push(s) });
  media.start();
  const s = await until(() => states.find((x) => x.cover));
  assert.equal(s.available, true);
  assert.equal(s.status, 'playing');
  assert.equal(s.app, 'Spotify');
  assert.equal(s.title, 'One More Time');
  assert.equal(s.artist, 'Daft Punk');
  assert.match(s.cover, /^data:image\/png;base64,/);
  media.command('next');
  media.command('rm -rf'); // not a command: ignored
  await until(() => fs.readFileSync(log, 'utf8').includes('-p spotify next'));
  assert.ok(!fs.readFileSync(log, 'utf8').includes('rm -rf'));
  media.stop();
});

await check('Linux: without playerctl the app says what to install', async () => {
  const states = [];
  const media = createMedia({ platform: 'linux', playerctl: path.join(dir, 'missing'), onState: (s) => states.push(s) });
  media.start();
  const s = await until(() => states.find((x) => x.available === false));
  assert.match(s.reason, /playerctl/);
  media.stop();
});

await check('Linux: no player running means nothing to show', async () => {
  const fake = path.join(dir, 'playerctl-none');
  fs.writeFileSync(fake, '#!/bin/sh\necho "No players found" >&2\nexit 1\n', { mode: 0o755 });
  const states = [];
  const media = createMedia({ platform: 'linux', playerctl: fake, interval: 100, onState: (s) => states.push(s) });
  media.start();
  const s = await until(() => states.find((x) => x.available === true));
  assert.equal(s.status, 'none');
  media.stop();
});

await check('Windows route: lines from the script reach the state, commands reach the script', async () => {
  // Stands in for powershell.exe: prints what nowplaying.ps1 prints and logs stdin.
  const fake = path.join(dir, 'powershell');
  const cmdLog = path.join(dir, 'ps-commands.txt');
  fs.writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs');
const say = (o) => process.stdout.write(JSON.stringify(o) + '\\r\\n');
say({ t: 'state', status: 'Playing', app: 'Spotify.exe', title: 'Strobe', artist: 'deadmau5', album: 'For Lack', canPlayPause: true, canNext: true, canPrev: true, cover: 'data:image/png;base64,iVBORw0KGgo=' });
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  const lines = buf.split('\\n'); buf = lines.pop();
  lines.forEach((l) => {
    fs.appendFileSync(${JSON.stringify(cmdLog)}, l + '\\n');
    if (l === 'play-pause') say({ t: 'state', status: 'Paused', app: 'Spotify.exe', title: 'Strobe', artist: 'deadmau5', album: 'For Lack', canPlayPause: true, canNext: true, canPrev: true });
    if (l === 'quit') process.exit(0);
  });
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
  const states = [];
  const media = createMedia({ platform: 'win32', powershell: fake, onState: (s) => states.push(s) });
  media.start();
  const s = await until(() => states.find((x) => x.status === 'playing'));
  assert.equal(s.title, 'Strobe');
  assert.equal(s.app, 'Spotify');
  assert.match(s.cover, /^data:image\/png;base64,/);
  media.command('play-pause');
  const p = await until(() => states.find((x) => x.status === 'paused'));
  assert.match(p.cover, /^data:image\/png/, 'cover kept on pause');
  media.stop();
  await until(() => fs.existsSync(cmdLog) && fs.readFileSync(cmdLog, 'utf8').includes('quit'));
});

await check('Windows route: missing WinRT is reported, no endless restarts', async () => {
  const fake = path.join(dir, 'powershell-old');
  fs.writeFileSync(fake, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ t: 'error', message: 'Unable to find type [Windows.Media.Control]' }) + '\\n');
process.exit(2);
`, { mode: 0o755 });
  const states = [];
  const media = createMedia({ platform: 'win32', powershell: fake, onState: (s) => states.push(s) });
  media.start();
  const s = await until(() => states.find((x) => x.available === false));
  assert.match(s.reason, /Windows-Mediensteuerung/);
  await sleep(300);
  assert.equal(states.length, 1, 'restarted after a clean error');
  media.stop();
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} media test(s) failed` : '\nall media tests passed');
process.exit(failed ? 1 : 0);
