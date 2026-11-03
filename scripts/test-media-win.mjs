// Runs the real nowplaying.ps1 in Windows PowerShell (CI on windows-latest). A build
// server plays no music, so this checks that the script parses, loads WinRT and
// answers with a state line (or a clean error line), takes commands and ends when
// stdin closes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

if (process.platform !== 'win32') { console.log('skipped: Windows only'); process.exit(0); }

const script = fs.readFileSync(path.join(import.meta.dirname, '..', 'electron', 'nowplaying.ps1'), 'utf8');
assert.ok([...script].every((c) => c.charCodeAt(0) < 128), 'nowplaying.ps1 must be ASCII');
const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const p = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
  '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
let out = '', err = '';
p.stdout.on('data', (d) => { out += d; });
p.stderr.on('data', (d) => { err += d; });
const exited = new Promise((r) => p.on('exit', r));

const first = await Promise.race([
  new Promise((r) => { const t = setInterval(() => { if (out.includes('\n')) { clearInterval(t); r(true); } }, 50); }),
  exited.then(() => out.includes('\n')),
  new Promise((r) => setTimeout(() => r(false), 30000)),
]);
assert.ok(first, `no output. stderr:\n${err}`);
const msg = JSON.parse(out.split('\n')[0]);
console.log('first line:', JSON.stringify(msg));
assert.ok(msg.t === 'state' || msg.t === 'error', 'unknown message');
if (msg.t === 'state') {
  p.stdin.write('play-pause\nnext\n');
  await new Promise((r) => setTimeout(r, 1500));
  p.stdin.end();
  const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('hung'), 10000))]);
  assert.notEqual(code, 'hung', 'script did not end when stdin closed');
  console.log('ok   state line, commands taken, ends with stdin');
} else {
  console.log(`ok   WinRT not available on this machine, reported cleanly: ${msg.message}`);
}
assert.ok(!/ParserError|ParseException/.test(err), `PowerShell parse error:\n${err}`);
process.exit(0);
