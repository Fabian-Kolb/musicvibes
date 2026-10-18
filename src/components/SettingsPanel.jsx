import { useEffect, useState } from 'react';
import { X, RotateCcw, Trash2, Search, Plus } from 'lucide-react';
import { Range, Toggle, Segmented, Select, ColorField, Meter } from './controls';
import { DEFAULTS, STYLES, BUILTIN_SCENES, SCENE_KEYS, sceneValues, cleanLight } from '../state/settings';
import { PALETTES, CUSTOM_PALETTE } from '../state/palettes';
import { GENRES } from '../engine/simulator';
import { settingsStore, scenesStore, audioStore, liveStore, lightStore, useSettings, useStore, setSetting, resetSettings } from '../state/store';
import { desktopBridge, isDesktopApp } from '../audio/capture';
import { refreshDevices } from '../audio/controller';
import { strobeMaxRate } from '../render/frame';

const pct = (v) => `${Math.round(v * 100)} %`;
const times = (v) => `${v.toFixed(2).replace('.', ',')}×`;
const sec = (v) => `${String(v).replace('.', ',')} s`;
const signed = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`;

const is = (key, ...vals) => (s) => vals.includes(s[key]);
const not = (key, ...vals) => (s) => !vals.includes(s[key]);

// Declarative list of everything in the panel. Each section can be reset to its defaults.
const SECTIONS = [
  {
    id: 'look', title: 'Bild', open: true,
    controls: [
      { key: 'style', type: 'segmented', label: 'Stil', options: STYLES },
      { type: 'palette' },
      { key: 'bgColor', type: 'color', label: 'Hintergrund', show: is('style', 'minimal') },
      { key: 'count', label: 'Anzahl Farbwolken', min: 2, max: 8, step: 1, format: String, show: is('style', 'minimal') },
      { key: 'size', label: 'Größe', min: 0.5, max: 2, format: pct },
      { key: 'form', label: 'Verformung', min: 0, max: 2, format: pct, hint: 'Wie stark sich die Formen verbiegen und verwirbeln' },
      { key: 'trails', label: 'Schlieren', min: 0, max: 1.2, format: pct, hint: 'Wie lange Farben nachziehen' },
      { key: 'glass', label: 'Glanz', min: 0, max: 1, format: pct, show: is('style', 'glass') },
      { key: 'brightness', label: 'Helligkeit', min: 0.4, max: 1.6, format: pct, hint: 'Gilt für alle Szenen' },
      { key: 'saturation', label: 'Sättigung', min: 0, max: 1.8, format: pct },
      { key: 'hueShift', label: 'Farbton verschieben', min: 0, max: 360, step: 5, format: (v) => `${v}°` },
      { key: 'hueDrift', label: 'Farbwanderung', min: 0, max: 1, format: pct, hint: 'Aus: Palette bleibt fest. Hoch: Farben wandern langsam durch den Farbkreis' },
      { key: 'vignette', label: 'Randabdunklung', min: 0, max: 1, format: pct },
    ],
  },
  {
    id: 'symmetry', title: 'Symmetrie',
    controls: [
      { key: 'symmetry', type: 'select', label: 'Spiegelung', options: [
        { id: 'off', name: 'Aus' }, { id: 'mirror', name: 'Links und rechts gespiegelt' },
        { id: 'quad', name: 'Vierfach gespiegelt' }, { id: 'kaleido', name: 'Kaleidoskop' }] },
      { key: 'symmetrySegments', label: 'Segmente', min: 3, max: 12, step: 1, format: String, show: is('symmetry', 'kaleido') },
      { key: 'symmetrySpin', label: 'Drehung', min: -1, max: 1, format: signed, show: not('symmetry', 'off') },
    ],
  },
  {
    id: 'motion', title: 'Bewegung & Reaktion',
    controls: [
      { key: 'speed', label: 'Grundtempo', min: 0.2, max: 2.5, format: times },
      { key: 'peakSpeed', label: 'Tempo-Schub bei lauten Stellen', min: 0, max: 2, format: times },
      { key: 'reactivity', label: 'Reaktion gesamt', min: 0, max: 2, format: pct, hint: '0 macht das Bild unabhängig von der Musik' },
      { key: 'beatPulse', label: 'Kick-Puls', min: 0, max: 2.5, format: pct, hint: 'Wie stark das Bild bei jedem Kick pulsiert' },
      { key: 'bassImpact', label: 'Bass → Größe & Puls', min: 0, max: 2, format: pct, hint: 'Kick und Bassline lassen die Farben anschwellen' },
      { key: 'midImpact', label: 'Mitten → Form & Fluss', min: 0, max: 2, format: pct, hint: 'Gesang und Melodie verformen die Flächen und lassen sie schneller fließen' },
      { key: 'highImpact', label: 'Höhen → Funkeln', min: 0, max: 2, format: pct, hint: 'Hi-Hats und Becken lassen die Farben funkeln' },
      { key: 'smoothing', label: 'Glättung', min: 0.4, max: 2.5, format: times, hint: 'Links reagiert das Bild zackig, rechts weich' },
    ],
  },
  {
    id: 'drops', title: 'Drops & Strobe',
    controls: [
      { key: 'dropDetection', type: 'toggle', label: 'Drops erkennen', hint: 'Ein Drop ist der Moment, in dem nach einem Breakdown der Bass zurückkommt' },
      { key: 'dropSensitivity', label: 'Drop-Empfindlichkeit', min: 0.4, max: 2, format: pct, show: is('dropDetection', true) },
      { key: 'dropColorJump', type: 'toggle', label: 'Farbsprung beim Drop', show: is('dropDetection', true) },
      { key: 'dropBoost', type: 'toggle', label: 'Tempo-Schub im Drop', show: is('dropDetection', true) },
      { key: 'strobe', type: 'toggle', label: 'Strobe', warn: true, hint: 'Schnelle Lichtblitze. Nicht geeignet bei Lichtempfindlichkeit oder Epilepsie.' },
      { key: 'strobeMode', type: 'segmented', label: 'Wann', show: is('strobe', true),
        options: [{ id: 'drop', name: 'Nur bei Drops' }, { id: 'always', name: 'Durchgehend' }] },
      { key: 'strobeSync', type: 'segmented', label: 'Takt', show: is('strobe', true),
        options: [{ id: 'kick', name: 'Auf die Kicks' }, { id: 'rate', name: 'Feste Frequenz' }] },
      { key: 'strobeRate', min: 0.5, max: 10, step: 0.5, show: is('strobe', true),
        label: (s) => (s.strobeSync === 'kick' ? 'Höchstens Blitze pro Sekunde' : 'Blitze pro Sekunde'),
        format: (v, s) => `${String(v).replace('.', ',')} Hz${s.strobeLimit && v > 3 ? ' → 3 Hz' : ''}` },
      { key: 'strobeLimit', type: 'toggle', label: 'Sicherheitsgrenze: max. 3 Blitze/s', show: is('strobe', true),
        hint: 'Gilt für Bild und Lichter. Einschalten, wenn lichtempfindliche Menschen im Raum sind' },
      { key: 'strobeIntensity', label: 'Blitz-Stärke', min: 0.1, max: 1, format: pct, show: is('strobe', true) },
      { key: 'strobeColor', type: 'segmented', label: 'Blitzfarbe', show: is('strobe', true),
        options: [{ id: 'white', name: 'Weiß' }, { id: 'palette', name: 'Palettenfarben' }] },
      { key: 'strobeLength', type: 'segmented', label: 'Blitzdauer', show: is('strobe', true),
        options: [{ id: 'short', name: 'Kurz' }, { id: 'long', name: 'Lang' }] },
    ],
  },
  {
    id: 'auto', title: 'Automatik',
    controls: [
      { key: 'autoSwitch', type: 'select', label: 'Automatisch wechseln', options: [
        { id: 'off', name: 'Aus' }, { id: 'palette', name: 'Palette' }, { id: 'style', name: 'Stil' }, { id: 'both', name: 'Palette und Stil' }] },
      { key: 'autoTrigger', type: 'segmented', label: 'Auslöser', show: not('autoSwitch', 'off'),
        options: [{ id: 'drop', name: 'Bei Drops' }, { id: 'timer', name: 'Nach Zeit' }, { id: 'both', name: 'Beides' }] },
      { key: 'autoInterval', label: 'Intervall', min: 1, max: 15, step: 1, format: (v) => `${v} min`,
        show: (s) => s.autoSwitch !== 'off' && s.autoTrigger !== 'drop' },
      { key: 'shuffle', type: 'toggle', label: 'Zufällige Reihenfolge', show: not('autoSwitch', 'off') },
      { key: 'transition', label: 'Übergangszeit', min: 0.5, max: 6, step: 0.5, format: sec, hint: 'Gilt auch, wenn du Palette oder Stil von Hand wechselst' },
    ],
  },
  {
    id: 'audio', title: 'Audio',
    controls: [
      { type: 'source' },
      { key: 'demoGenre', type: 'select', label: 'Genre des Testsignals', options: GENRES, show: is('source', 'demo') },
      { type: 'level' },
      { key: 'autoGain', type: 'toggle', label: 'Auto-Pegel', hint: 'Gleicht leise und laute Songs aus, unabhängig von der Windows-Lautstärke' },
      { key: 'agcTime', label: 'Anpassungszeit', min: 5, max: 60, step: 1, format: sec, show: is('autoGain', true) },
      { key: 'gain', label: 'Verstärkung', min: 0.5, max: 3, format: times },
      { key: 'bandRange', label: 'Dynamik-Bereich', min: 12, max: 40, step: 1, format: (v) => `${v} dB`, hint: 'Wie viele Dezibel unter dem lautesten Moment ein Band als leer gilt. Kleiner: Balken springen stärker. Größer: ruhigeres Bild' },
      { key: 'kickSensitivity', label: 'Kick-Empfindlichkeit', min: 0.5, max: 2, format: pct },
      { key: 'silenceLevel', label: 'Stille-Schwelle', min: -95, max: -40, step: 1, format: (v) => `${v} dB`, hint: 'Gesamtpegel, unter dem das Signal als Stille gilt. Musik liegt meist zwischen -45 und -15 dB' },
      { key: 'latency', label: 'Bild verzögern', min: 0, max: 500, step: 10, format: (v) => `${v} ms`, hint: 'Für Bluetooth-Lautsprecher: Das Bild wartet auf den Ton' },
    ],
  },
  {
    id: 'lights', title: 'Licht', desktop: true,
    controls: [
      { type: 'lights' },
      { key: 'lightEffect', type: 'select', label: 'Effekt', show: is('lights', true), options: [
        { id: 'auto', name: 'Automatisch wechseln' }, { id: 'flow', name: 'Farbfluss' }, { id: 'wave', name: 'Wellen auf Kicks' },
        { id: 'meter', name: 'Pegel aus der Mitte' }, { id: 'chase', name: 'Lauflicht im Takt' }, { id: 'sparks', name: 'Funken' }],
        hint: 'Automatisch: wechselt bei Drops und alle 32 Kicks, ruhige Effekte in ruhiger Musik' },
      { key: 'lightBrightness', label: 'Helligkeit der Lichter', min: 0.1, max: 1, format: pct, show: is('lights', true) },
      { key: 'lightPulse', label: 'Reaktion auf die Musik', min: 0, max: 2, format: pct, show: is('lights', true),
        hint: 'Wie stark die Lichter mit Bass, Stimme und Kicks heller und dunkler werden' },
      { key: 'lightSpread', label: 'Farbverlauf', min: 0, max: 1, format: pct, show: is('lights', true),
        hint: 'Links: der ganze Streifen in einer Farbe. Rechts: mehrere Palettenfarben nebeneinander' },
      { key: 'lightSparkle', type: 'toggle', label: 'Funkeln bei Hi-Hats', show: is('lights', true),
        hint: 'Einzelne Segmente leuchten kurz heller auf' },
      { key: 'lightStrobe', type: 'toggle', label: 'Licht-Strobe', warn: true, show: is('lights', true),
        hint: 'Segmente gehen sehr schnell an und aus. Unabhängig vom Strobe auf dem Bildschirm' },
      { key: 'lightStrobeMode', type: 'segmented', label: 'Wann', show: (s) => s.lights && s.lightStrobe,
        options: [{ id: 'drop', name: 'Nur bei Drops' }, { id: 'always', name: 'Durchgehend' }] },
      { key: 'lightStrobeStyle', type: 'segmented', label: 'Art', show: (s) => s.lights && s.lightStrobe,
        options: [{ id: 'segments', name: 'Einzelne Segmente' }, { id: 'full', name: 'Ganzer Streifen' }] },
      { key: 'lightStrobeRate', label: 'Wechsel pro Sekunde', min: 2, max: 25, step: 1, show: (s) => s.lights && s.lightStrobe,
        format: (v, s) => `${v}${s.strobeLimit && v > 3 ? ' → 3' : ''}`,
        hint: 'Mehr als die Hälfte der Licht-Bildrate unten schafft der Streifen nicht' },
      { key: 'lightRate', label: 'Bildrate der Lichter', min: 10, max: 40, step: 1, format: (v) => `${v} pro s`, show: is('lights', true),
        hint: 'Wie oft die App neue Farben schickt. Wenn die Lichter hängen oder hinterherlaufen: kleiner' },
    ],
  },
  {
    id: 'display', title: 'Anzeige',
    controls: [
      { key: 'quality', type: 'select', label: 'Qualität', options: [
        { id: 'auto', name: 'Automatisch (hält die Bildrate)' }, { id: 'high', name: 'Hoch' },
        { id: 'medium', name: 'Mittel' }, { id: 'low', name: 'Niedrig (schont Grafikkarte)' }] },
      { key: 'fpsLimit', type: 'select', label: 'Bildrate begrenzen', options: [
        { id: 0, name: 'Wie der Bildschirm' }, { id: 30, name: '30 FPS' }, { id: 60, name: '60 FPS' },
        { id: 90, name: '90 FPS' }, { id: 120, name: '120 FPS' }, { id: 144, name: '144 FPS' }] },
      { key: 'showHud', type: 'toggle', label: 'Pegel-Anzeige oben links' },
      { key: 'showFps', type: 'toggle', label: 'FPS anzeigen' },
      { key: 'autoHide', label: 'Menü ausblenden nach', min: 1.5, max: 10, step: 0.5, format: sec },
      { type: 'display', desktop: true },
      { key: 'fullscreenOnStart', type: 'toggle', label: 'Im Vollbild starten', desktop: true },
      { key: 'alwaysOnTop', type: 'toggle', label: 'Immer im Vordergrund', desktop: true },
      { key: 'startWarning', type: 'toggle', label: 'Hinweis zu Lichtblitzen beim Start' },
    ],
  },
];

function PaletteControl({ s }) {
  const custom = s.palette === CUSTOM_PALETTE;
  return (
    <div className="field">
      <div className="field-head"><span className="label">Farben</span></div>
      <div className="swatches">
        {PALETTES.map((p) => (
          <button key={p.id} type="button" className="swatch" title={p.name} aria-label={`Palette ${p.name}`}
            aria-pressed={s.palette === p.id} style={{ background: `linear-gradient(90deg, ${p.cols.slice(0, 4).join(', ')})` }}
            onClick={() => setSetting('palette', p.id)} />
        ))}
        <button type="button" className="swatch custom" aria-pressed={custom} title="Eigene Farben"
          style={{ background: `linear-gradient(90deg, ${s.customColors.slice(0, 4).join(', ')})` }}
          onClick={() => setSetting('palette', CUSTOM_PALETTE)}>Eigene</button>
      </div>
      {custom && (
        <div className="custom-colors">
          {s.customColors.map((c, i) => (
            <input key={i} type="color" value={c} aria-label={`Farbe ${i + 1}`} onChange={(e) => {
              const next = [...s.customColors];
              next[i] = e.target.value;
              setSetting('customColors', next);
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceControl({ s }) {
  const audio = useStore(audioStore);
  useEffect(() => { refreshDevices(); }, []);
  const options = [
    { id: 'desktop', name: 'Desktop-Audio (was gerade läuft)' },
    { id: 'demo', name: 'Testsignal (simulierte Musik)' },
    ...audio.devices.map((d) => ({ id: d.id, name: d.label })),
  ];
  if (!options.some((o) => o.id === s.source)) options.push({ id: s.source, name: 'Gespeichertes Gerät (nicht verbunden)' });
  return (
    <Select label="Quelle" value={s.source} options={options} onChange={(v) => setSetting('source', v)}
      hint={isDesktopApp ? 'Desktop-Audio nimmt alles auf, was über deine Lautsprecher läuft. Andere Geräte sind z. B. Mikrofon oder „Stereomix“.' : 'Im Browser fragt Chrome bei jedem Start nach der Freigabe. Die Desktop-App braucht das nicht.'} />
  );
}

function LevelControl() {
  const live = useStore(liveStore);
  const audio = useStore(audioStore);
  let state = 'ok', text = 'Signal ist da';
  if (audio.state !== 'live') { state = 'off'; text = 'Keine Quelle aktiv'; }
  else if (live.silent) { state = 'off'; text = 'Kein Signal: spiel Musik ab oder senke die Stille-Schwelle'; }
  return (
    <div className="field">
      <div className={`level level-${state}`}><span className="dot" />{text}</div>
      <div className="meters small">
        <Meter label="Bass" value={live.bass} />
        <Meter label="Mitte" value={live.mid} />
        <Meter label="Höhen" value={live.high} />
      </div>
    </div>
  );
}

function DisplayControl({ s }) {
  const [displays, setDisplays] = useState([]);
  useEffect(() => { desktopBridge?.listDisplays?.().then(setDisplays).catch(() => {}); }, []);
  if (displays.length < 2) return null;
  return (
    <Select label="Bildschirm für Vollbild" value={s.display}
      options={[{ id: '', name: 'Der Bildschirm mit dem Fenster' }, ...displays.map((d) => ({ id: String(d.id), name: d.label }))]}
      onChange={(v) => setSetting('display', v)} />
  );
}

const lightName = (d) => `${d.sku || 'Govee-Licht'} · ${d.ip}`;
const updateLight = (s, ip, patch) => setSetting('lightDevices', s.lightDevices.map((d) => (d.ip === ip ? { ...d, ...patch } : d)));

function LightRow({ d, s }) {
  const st = useStore(lightStore);
  const test = async () => {
    lightStore.set({ testing: d.ip, error: '' });
    const r = await desktopBridge.lights.test(d).catch((err) => ({ error: String(err) }));
    lightStore.set({ testing: '', error: r && r.error ? r.error
      : r && !r.answered ? `${lightName(d)} hat nicht geantwortet. Ist „LAN Control“ in der Govee Home App an?` : '' });
  };
  return (
    <li className="light">
      <div className="light-head">
        <label><input type="checkbox" checked={d.on} onChange={(e) => updateLight(s, d.ip, { on: e.target.checked })} /> {lightName(d)}</label>
        <button type="button" className="text-btn" disabled={!!st.testing} onClick={test}>{st.testing === d.ip ? 'Test läuft …' : 'Test'}</button>
        <button type="button" className="icon-btn" aria-label={`${lightName(d)} entfernen`}
          onClick={() => setSetting('lightDevices', s.lightDevices.filter((x) => x.ip !== d.ip))}><Trash2 size={15} /></button>
      </div>
      <Segmented compact label={`Ansteuerung ${lightName(d)}`} value={d.mode} onChange={(v) => updateLight(s, d.ip, { mode: v })}
        options={[{ id: 'segments', name: 'Segmente' }, { id: 'single', name: 'Eine Farbe' }]} />
      {d.mode === 'segments' && (
        <Range label="Anzahl Segmente" value={d.segments} min={1} max={60} step={1} format={String}
          onChange={(v) => updateLight(s, d.ip, { segments: v })} />
      )}
    </li>
  );
}

function LightsControl({ s }) {
  const st = useStore(lightStore);
  const [manual, setManual] = useState('');
  const add = (found) => {
    const list = [...s.lightDevices];
    found.forEach((f) => {
      const d = cleanLight({ ...f, on: true });
      const i = list.findIndex((x) => x.ip === f.ip);
      if (!d) return;
      if (i < 0) list.push(d);
      else list[i] = { ...list[i], sku: list[i].sku || d.sku };
    });
    setSetting('lightDevices', list.slice(0, 16));
  };
  const scan = async () => {
    lightStore.set({ scanning: true, error: '' });
    const r = await desktopBridge.lights.scan().catch((err) => ({ error: String(err) }));
    if (r && r.list) add(r.list);
    lightStore.set({ scanning: false, scanned: true, error: r && r.error ? r.error
      : r && r.list && !r.list.length ? 'Keine Lichter gefunden. Ist „LAN Control“ an und der PC im selben WLAN? Sonst die IP-Adresse unten eintragen.' : '' });
  };
  const addManual = (e) => {
    e.preventDefault();
    const ip = manual.trim();
    if (!cleanLight({ ip })) { lightStore.set({ error: 'Das ist keine IP-Adresse (Beispiel: 192.168.178.45).' }); return; }
    add([{ ip, sku: '' }]);
    setManual('');
  };
  return (
    <div className="field lights">
      <Toggle label="Lichter steuern" value={s.lights} onChange={(v) => setSetting('lights', v)}
        hint="Govee-Lichter im WLAN leuchten mit der Musik und den Farben des Bildes. Beim Beenden bekommen sie ihre alte Farbe zurück." />
      <button type="button" className="text-btn" disabled={st.scanning} onClick={scan}>
        <Search size={13} /> {st.scanning ? 'Suche läuft …' : 'Lichter suchen'}
      </button>
      {st.error && <p className="hint warn-text" role="alert">{st.error}</p>}
      {s.lightDevices.length > 0 && (
        <ul className="light-list">{s.lightDevices.map((d) => <LightRow key={d.ip} d={d} s={s} />)}</ul>
      )}
      <form className="scene-save" onSubmit={addManual}>
        <input type="text" inputMode="decimal" value={manual} maxLength={15} placeholder="IP-Adresse von Hand" aria-label="IP-Adresse eines Lichts"
          onChange={(e) => setManual(e.target.value)} />
        <button type="submit" disabled={!manual.trim()}><Plus size={14} /> Hinzufügen</button>
      </form>
      <p className="hint">Einmalig nötig: in der Govee Home App beim Gerät unter Einstellungen „LAN Control“ einschalten. Fragt Windows beim ersten Suchen nach dem Netzwerkzugriff, „Private Netzwerke“ zulassen.</p>
      <p className="hint">Segmente: jedes Stück des Streifens bekommt eine eigene Farbe. Leuchtet beim Test nur ein Teil oder gar nichts, nimm „Eine Farbe“.</p>
    </div>
  );
}

function Control({ c, s }) {
  if (c.desktop && !isDesktopApp) return null;
  if (c.show && !c.show(s)) return null;
  if (c.type === 'palette') return <PaletteControl s={s} />;
  if (c.type === 'source') return <SourceControl s={s} />;
  if (c.type === 'level') return <LevelControl />;
  if (c.type === 'display') return <DisplayControl s={s} />;
  if (c.type === 'lights') return <LightsControl s={s} />;
  const label = typeof c.label === 'function' ? c.label(s) : c.label;
  const common = { label, value: s[c.key], onChange: (v) => setSetting(c.key, v), hint: c.hint };
  switch (c.type) {
    case 'toggle': return <Toggle {...common} warn={c.warn} />;
    case 'segmented': return <Segmented {...common} options={c.options} />;
    case 'select': return <Select {...common} options={c.options} />;
    case 'color': return <ColorField {...common} />;
    default: return <Range {...common} min={c.min} max={c.max} step={c.step} format={c.format && ((v) => c.format(v, s))} />;
  }
}

function resetSection(section) {
  const patch = {};
  section.controls.forEach((c) => { if (c.key) patch[c.key] = DEFAULTS[c.key]; });
  if (section.id === 'look') { patch.palette = DEFAULTS.palette; patch.customColors = DEFAULTS.customColors; }
  settingsStore.set(patch);
}

function Scenes() {
  const { list } = useStore(scenesStore);
  const [name, setName] = useState('');
  const apply = (values) => settingsStore.set(sceneValues(values));
  const save = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const S = settingsStore.get();
    const values = {};
    SCENE_KEYS.forEach((k) => { values[k] = S[k]; });
    scenesStore.set({ list: [...list.filter((x) => x.name !== n), { id: `u${Date.now()}`, name: n, values }] });
    setName('');
  };
  return (
    <div className="scenes">
      <p className="hint">Eine Szene merkt sich Bild, Bewegung und Automatik. Strobe, Audio und Helligkeit bleiben, wie du sie eingestellt hast.</p>
      <div className="chips">
        {BUILTIN_SCENES.map((sc) => <button key={sc.id} type="button" onClick={() => apply(sc.values)}>{sc.name}</button>)}
      </div>
      {list.length > 0 && (
        <ul className="user-scenes">
          {list.map((sc) => (
            <li key={sc.id}>
              <button type="button" className="scene-load" onClick={() => apply(sc.values)}>{sc.name}</button>
              <button type="button" className="icon-btn" aria-label={`Szene ${sc.name} löschen`}
                onClick={() => scenesStore.set({ list: list.filter((x) => x.id !== sc.id) })}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      <form className="scene-save" onSubmit={save}>
        <input type="text" value={name} maxLength={40} placeholder="Name für aktuelle Einstellungen" aria-label="Name der neuen Szene"
          onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={!name.trim()}>Speichern</button>
      </form>
    </div>
  );
}

const SHORTCUTS = [
  ['F', 'Vollbild'], ['H', 'Menü ein- oder ausblenden'], ['E', 'Einstellungen'], ['G', 'Nächster Stil'],
  ['P', 'Nächste Palette'], ['S', 'Strobe an oder aus'], ['Esc', 'Einstellungen schließen'],
];

export default function SettingsPanel({ open, onClose }) {
  const s = useSettings();
  const rate = strobeMaxRate(s);
  return (
    <aside className={`panel${open ? ' open' : ''}`} aria-label="Einstellungen" aria-hidden={!open} inert={!open}>
      <header className="panel-head">
        <h2>Einstellungen</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Einstellungen schließen"><X size={18} /></button>
      </header>
      <div className="panel-body">
        <details open>
          <summary>Szenen</summary>
          <Scenes />
        </details>
        {SECTIONS.filter((sec) => !sec.desktop || isDesktopApp).map((sec) => (
          <details key={sec.id} open={sec.open}>
            <summary>{sec.title}</summary>
            <div className="section-body">
              {sec.controls.map((c, i) => <Control key={c.key || c.type || i} c={c} s={s} />)}
              {sec.id === 'drops' && s.strobe && (
                <p className="hint">Aktuell höchstens {String(rate).replace('.', ',')} Blitze pro Sekunde.</p>
              )}
              <button type="button" className="text-btn" onClick={() => resetSection(sec)}>
                <RotateCcw size={13} /> {sec.title} zurücksetzen
              </button>
            </div>
          </details>
        ))}
        <details>
          <summary>Tastenkürzel</summary>
          <dl className="keys">
            {SHORTCUTS.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}
          </dl>
        </details>
        <button type="button" className="danger-btn" onClick={() => { if (window.confirm('Alle Einstellungen auf Standard zurücksetzen? Gespeicherte Szenen bleiben erhalten.')) resetSettings(); }}>
          Alle Einstellungen zurücksetzen
        </button>
      </div>
    </aside>
  );
}
