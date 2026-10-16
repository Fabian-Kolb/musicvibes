// Govee lights over the local network (Govee "LAN API", UDP, no cloud, no API key).
//
// - Scan: a JSON request to 239.255.255.250:4001 (and the subnet broadcast, which some
//   routers pass where multicast is dropped). Lights answer on our port 4002.
// - Commands go to <light ip>:4003: on/off, brightness, one colour, status.
// - Per-segment colours use the "razer" command (the protocol Razer Chroma sync uses),
//   as implemented in OpenRGB's GoveeController: a small binary packet in base64.
//   The light leaves that mode by itself about a minute after the last packet.
//
// Lights need "LAN Control" switched on once in the Govee Home app (device settings).
//
// The stream to the lights is "latest wins": the page may send colours as often as it
// likes, each light gets at most `rate` packets per second, always the newest colours.
// When the stream ends (or the app quits), every light gets back the state it had before.

const dgram = require('node:dgram');
const os = require('node:os');

const MULTICAST = '239.255.255.250';
const DEFAULT_PORTS = { scan: 4001, listen: 4002, command: 4003 };

// Only lights in the local network: the page can never make the app send packets
// to the internet.
function isLocalIp(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip));
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((x) => x > 255)) return false;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

// Packet for the "razer" command: BB, length (2 bytes), B0, 01 (no gradient between
// segments), count, RGB per segment, XOR of all bytes before.
function razerData(colors) {
  const n = Math.min(255, colors.length);
  const len = 2 + 3 * n;
  const pkt = Buffer.alloc(4 + len + 1);
  pkt[0] = 0xbb; pkt[1] = (len >> 8) & 0xff; pkt[2] = len & 0xff; pkt[3] = 0xb0;
  pkt[4] = 1;
  pkt[5] = n;
  for (let i = 0; i < n; i++) {
    const c = colors[i];
    pkt[6 + i * 3] = c[0]; pkt[7 + i * 3] = c[1]; pkt[8 + i * 3] = c[2];
  }
  let x = 0;
  for (let i = 0; i < pkt.length - 1; i++) x ^= pkt[i];
  pkt[pkt.length - 1] = x;
  return pkt;
}
const RAZER_ON = Buffer.from([0xbb, 0x00, 0x01, 0xb1, 0x01, 0x0a]);
const RAZER_OFF = Buffer.from([0xbb, 0x00, 0x01, 0xb1, 0x00, 0x0b]);

const message = (cmd, data) => Buffer.from(JSON.stringify({ msg: { cmd, data } }));
// Sent exactly as OpenRGB does, including the closing zero byte.
const razer = (pkt) => Buffer.concat([message('razer', { pt: pkt.toString('base64') }), Buffer.from([0])]);

function parse(buf) {
  try {
    const text = buf.toString('utf8').replace(/\0+$/, '');
    const msg = JSON.parse(text).msg;
    return msg && typeof msg.cmd === 'string' ? msg : null;
  } catch {
    return null;
  }
}

const byte = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Where a scan goes: the multicast group on every network adapter plus each subnet's
// broadcast address.
function scanTargets() {
  const out = [];
  Object.values(os.networkInterfaces()).flat().forEach((nic) => {
    if (!nic || nic.internal || nic.family !== 'IPv4' || !nic.netmask) return;
    const ip = nic.address.split('.').map(Number);
    const mask = nic.netmask.split('.').map(Number);
    out.push({ iface: nic.address, address: MULTICAST });
    out.push({ iface: nic.address, address: ip.map((b, i) => (b | (~mask[i] & 255))).join('.') });
  });
  if (!out.length) out.push({ iface: null, address: MULTICAST });
  return out;
}

function createGovee(options = {}) {
  const ports = { ...DEFAULT_PORTS, ...options.ports };
  const rate = options.rate || 20; // packets per second and light while streaming
  const gap = options.commandGap ?? 80; // ms between single commands to one light
  const targets = options.scanTargets || scanTargets;
  let sock = null;
  let opening = null;
  const waiters = new Set();

  function open() {
    if (sock) return Promise.resolve(sock);
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      s.once('error', (err) => { opening = null; s.close(); reject(err); });
      s.on('message', (buf, rinfo) => {
        const msg = parse(buf);
        if (msg) waiters.forEach((w) => w(msg, rinfo));
      });
      s.bind(ports.listen, () => {
        s.removeAllListeners('error');
        s.on('error', () => {});
        try { s.setBroadcast(true); } catch { /* not on every platform */ }
        sock = s;
        opening = null;
        resolve(s);
      });
    });
    return opening;
  }

  function sendTo(ip, buf) {
    if (!sock || !isLocalIp(ip)) return;
    sock.send(buf, ports.command, ip, () => {});
  }

  // Collect replies matching `fn` for `ms` milliseconds.
  function listen(ms, fn) {
    return new Promise((resolve) => {
      const w = (msg, rinfo) => { if (fn(msg, rinfo) === 'done') finish(); };
      const finish = () => { waiters.delete(w); clearTimeout(t); resolve(); };
      const t = setTimeout(finish, ms);
      waiters.add(w);
    });
  }

  async function scan(ms = 2000) {
    const s = await open();
    const found = new Map();
    const done = listen(ms, (msg, rinfo) => {
      if (msg.cmd !== 'scan' || !msg.data) return;
      const ip = isLocalIp(msg.data.ip) ? msg.data.ip : rinfo.address;
      if (!isLocalIp(ip)) return;
      found.set(ip, { ip, sku: String(msg.data.sku || ''), id: String(msg.data.device || '') });
    });
    const req = message('scan', { account_topic: 'reserve' });
    for (const t of targets()) {
      try {
        if (t.iface && t.address === MULTICAST) s.setMulticastInterface(t.iface);
        s.send(req, ports.scan, t.address, () => {});
      } catch { /* adapter without multicast */ }
      await sleep(15);
    }
    await done;
    return [...found.values()].sort((a, b) => a.ip.localeCompare(b.ip, 'en', { numeric: true }));
  }

  async function status(ip, ms = 1000) {
    await open();
    let result = null;
    const done = listen(ms, (msg, rinfo) => {
      if (msg.cmd !== 'devStatus' || rinfo.address !== ip || !msg.data) return undefined;
      result = msg.data;
      return 'done';
    });
    sendTo(ip, message('devStatus', {}));
    await done;
    return result;
  }

  const power = (ip, on) => sendTo(ip, message('turn', { value: on ? 1 : 0 }));
  const brightness = (ip, v) => sendTo(ip, message('brightness', { value: Math.max(1, Math.min(100, Math.round(v))) }));
  const color = (ip, [r, g, b]) => sendTo(ip, message('colorwc', { color: { r: byte(r), g: byte(g), b: byte(b) }, colorTemInKelvin: 0 }));

  // ---- Streaming -------------------------------------------------------------------
  // lights: ip -> { mode, saved, latest, sentKey, lastSent, lastEnable, testUntil }
  const lights = new Map();
  let timer = null;

  async function restore(ip, light) {
    if (light.mode === 'segments') { sendTo(ip, razer(RAZER_OFF)); await sleep(gap); }
    const st = light.saved;
    if (!st) return;
    if (st.onOff === 0) { power(ip, false); return; }
    if (Number(st.colorTemInKelvin) > 0) {
      sendTo(ip, message('colorwc', { color: { r: 0, g: 0, b: 0 }, colorTemInKelvin: Number(st.colorTemInKelvin) }));
    } else if (st.color) {
      color(ip, [st.color.r, st.color.g, st.color.b]);
    }
    await sleep(gap);
    if (st.brightness) brightness(ip, st.brightness);
  }

  function tick() {
    const now = Date.now();
    lights.forEach((l, ip) => {
      if (l.testUntil > now || !l.latest) return;
      const key = l.latest.join(',');
      // Single colour: the light fades itself, fewer packets are enough.
      const minGap = l.mode === 'segments' ? 1000 / rate : 100;
      const changed = key !== l.sentKey;
      if (now - l.lastSent < minGap || (!changed && now - l.lastSent < 1000)) return;
      if (l.mode === 'segments') {
        // Re-assert the external-control mode now and then, so it never times out.
        if (now - l.lastEnable > 20000) { sendTo(ip, razer(RAZER_ON)); l.lastEnable = now; }
        sendTo(ip, razer(razerData(l.latest)));
      } else {
        color(ip, l.latest[0]);
      }
      l.sentKey = key;
      l.lastSent = now;
    });
  }

  // devices: [{ ip, mode: 'segments' | 'single' }]. Lights not in the list are restored.
  // Counts end() calls: a begin() that is overtaken by an end() stops where it is.
  let epoch = 0;
  async function begin(devices) {
    const my = epoch;
    await open();
    if (my !== epoch) return [];
    const want = new Map(devices.filter((d) => isLocalIp(d.ip)).map((d) => [d.ip, d.mode === 'single' ? 'single' : 'segments']));
    const gone = [...lights.entries()].filter(([ip, l]) => want.get(ip) !== l.mode);
    gone.forEach(([ip]) => lights.delete(ip));
    await Promise.all(gone.map(([ip, l]) => restore(ip, l)));
    await Promise.all([...want].filter(([ip]) => !lights.has(ip)).map(async ([ip, mode]) => {
      const l = { mode, saved: null, latest: null, sentKey: '', lastSent: 0, lastEnable: 0, testUntil: 0 };
      lights.set(ip, l);
      const current = () => epoch === my && lights.get(ip) === l;
      l.saved = await status(ip, 800);
      // Stopped while waiting for the light's answer: nothing was changed yet.
      if (!current()) return;
      power(ip, true);
      await sleep(gap);
      brightness(ip, 100); // the page sets the brightness through the colours
      await sleep(gap);
      if (!current()) { await restore(ip, { ...l, mode: 'single' }); return; }
      if (mode === 'segments') { sendTo(ip, razer(RAZER_ON)); l.lastEnable = Date.now(); }
    }));
    if (epoch !== my) return [];
    if (!timer && lights.size) timer = setInterval(tick, 1000 / rate / 2);
    return [...lights.keys()];
  }

  // frames: [{ ip, colors: [[r, g, b], ...] }] with 0..255 values.
  function frame(frames) {
    if (!Array.isArray(frames)) return;
    frames.forEach((f) => {
      const l = f && lights.get(f.ip);
      if (!l || !Array.isArray(f.colors) || !f.colors.length) return;
      l.latest = f.colors.slice(0, 255).map((c) => [byte(c[0]), byte(c[1]), byte(c[2])]);
    });
  }

  let restoring = 0;
  async function end() {
    epoch += 1;
    clearInterval(timer);
    timer = null;
    const all = [...lights.entries()];
    lights.clear();
    restoring += 1;
    try { await Promise.all(all.map(([ip, l]) => restore(ip, l))); } finally { restoring -= 1; }
  }

  // Test: a slow rainbow over the segments (or a slow colour change) for three seconds,
  // then the light goes back to what it showed before.
  async function test({ ip, mode, segments = 20 }) {
    if (!isLocalIp(ip)) throw new Error('Keine IP-Adresse im lokalen Netz');
    await open();
    const streaming = lights.get(ip);
    const n = Math.max(1, Math.min(100, Math.round(segments)));
    const saved = streaming ? null : await status(ip, 800);
    if (streaming) streaming.testUntil = Date.now() + 3200;
    else { power(ip, true); await sleep(gap); brightness(ip, 100); await sleep(gap); }
    if (mode !== 'single') sendTo(ip, razer(RAZER_ON));
    const hue = (h) => {
      const f = (k) => { const x = (k + h * 6) % 6; return 255 * Math.max(0, Math.min(1, Math.abs(x - 3) - 1)); };
      return [f(5), f(3), f(1)];
    };
    for (let step = 0; step < 30; step++) {
      if (mode === 'single') { if (step % 5 === 0) color(ip, hue(step / 30)); }
      else sendTo(ip, razer(razerData(Array.from({ length: n }, (_, i) => hue(i / n + step / 30)))));
      await sleep(100);
    }
    if (streaming) { streaming.sentKey = ''; streaming.lastEnable = 0; return { ok: true, answered: true }; }
    await restore(ip, { mode: mode === 'single' ? 'single' : 'segments', saved });
    return { ok: true, answered: !!saved };
  }

  async function close() {
    await end();
    if (sock) { sock.close(); sock = null; }
  }

  return { scan, status, power, brightness, color, begin, frame, end, test, close, busy: () => lights.size > 0 || restoring > 0 };
}

module.exports = { createGovee, razerData, isLocalIp, RAZER_ON, RAZER_OFF };
