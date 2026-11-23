import { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Trash2, Search, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import LiquidGlass from './LiquidGlass';
import { Range, Toggle, Segmented, Select, ColorField, Meter } from './controls';
import { SceneThumb, StyleThumb, SymmetryThumb, SettingPreview, LedStripPreview } from './LivePreviews';
import { DEFAULTS, STYLES, BUILTIN_SCENES, SCENE_KEYS, sceneValues, cleanLight } from '../state/settings';
import { PALETTES, CUSTOM_PALETTE, COVER_PALETTE } from '../state/palettes';
import { GENRES } from '../engine/simulator';
import { settingsStore, scenesStore, audioStore, liveStore, lightStore, mediaStore, useSettings, useStore, setSetting, resetSettings } from '../state/store';
import { CoverSwatch } from './NowPlaying';
import { desktopBridge, isDesktopApp } from '../audio/capture';
import { refreshDevices } from '../audio/controller';
import { strobeMaxRate } from '../render/frame';

const pct = (v) => `${Math.round(v * 100)} %`;
const times = (v) => `${v.toFixed(2).replace('.', ',')}×`;
const sec = (v) => `${String(v).replace('.', ',')} s`;
const signed = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`;
const deg = (v) => `${v}°`;
const db = (v) => `${v} dB`;
const ms = (v) => `${v} ms`;
const mins = (v) => `${v} min`;
const hzRate = (v) => `${v} pro s`;

const TABS = [
  { id: 'look', name: 'Bild' },
  { id: 'react', name: 'Reaktion' },
  { id: 'fx', name: 'Effekte' },
  { id: 'light', name: 'Licht' },
  { id: 'sys', name: 'System' },
];

const SYMMETRY_OPTIONS = [
  { id: 'off', name: 'Aus', full: 'Spiegelung aus' },
  { id: 'mirror', name: 'Spiegel', full: 'Links und rechts gespiegelt' },
  { id: 'quad', name: 'Vierfach', full: 'Vierfach gespiegelt' },
  { id: 'kaleido', name: 'Kaleido', full: 'Kaleidoskop' },
];

const LIGHT_EFFECTS = [
  { id: 'auto', name: 'Automatisch wechseln' },
  { id: 'flow', name: 'Farbfluss' },
  { id: 'wave', name: 'Wellen auf Kicks' },
  { id: 'meter', name: 'Pegel aus der Mitte' },
  { id: 'chase', name: 'Lauflicht im Takt' },
  { id: 'sparks', name: 'Funken' },
];

const QUALITY_OPTIONS = [
  { id: 'auto', name: 'Automatisch (hält die Bildrate)' },
  { id: 'high', name: 'Hoch' },
  { id: 'medium', name: 'Mittel' },
  { id: 'low', name: 'Niedrig (schont Grafikkarte)' },
];

const FPS_OPTIONS = [
  { id: 0, name: 'Wie der Bildschirm' },
  { id: 30, name: '30 FPS' },
  { id: 60, name: '60 FPS' },
  { id: 90, name: '90 FPS' },
  { id: 120, name: '120 FPS' },
  { id: 144, name: '144 FPS' },
];

const SHORTCUTS = [
  ['F', 'Vollbild'],
  ['H', 'Menü ein- oder ausblenden'],
  ['E', 'Einstellungen'],
  ['G', 'Nächster Stil'],
  ['P', 'Nächste Palette'],
  ['S', 'Strobe an oder aus'],
  ['Esc', 'Einstellungen schließen'],
];

const RESET_STYLE = ['style', 'palette', 'customColors', 'bgColor'];
const RESET_FORM = ['count', 'size', 'form', 'trails', 'glass'];
const RESET_COLOR = ['brightness', 'saturation', 'hueShift', 'hueDrift', 'vignette'];
const RESET_BANDS = ['bassImpact', 'midImpact', 'highImpact'];
const RESET_MOTION = ['beatPulse', 'smoothing', 'speed', 'peakSpeed', 'reactivity'];
const RESET_SYMMETRY = ['symmetry', 'symmetrySegments', 'symmetrySpin'];
const RESET_DROPS = [
  'dropDetection', 'dropSensitivity', 'dropColorJump', 'dropBoost',
  'strobe', 'strobeMode', 'strobeSync', 'strobeRate', 'strobeLimit',
  'strobeIntensity', 'strobeColor', 'strobeLength',
];
const RESET_AUTO = ['autoSwitch', 'autoTrigger', 'autoInterval', 'shuffle', 'transition'];
const RESET_LIGHTS = [
  'lights', 'lightEffect', 'lightBrightness', 'lightPulse', 'lightSpread',
  'lightSparkle', 'lightStrobe', 'lightStrobeMode', 'lightStrobeStyle',
  'lightStrobeRate', 'lightRate',
];
const RESET_AUDIO = [
  'source', 'demoGenre', 'autoGain', 'agcTime', 'gain',
  'bandRange', 'kickSensitivity', 'silenceLevel', 'latency',
];
const RESET_MUSIC = ['nowPlaying'];
const RESET_DISPLAY = [
  'quality', 'fpsLimit', 'showHud', 'beatPanel', 'showFps',
  'autoHide', 'display', 'fullscreenOnStart', 'alwaysOnTop', 'startWarning',
];

function resetKeys(keys) {
  const patch = {};
  keys.forEach((k) => {
    const def = DEFAULTS[k];
    patch[k] = Array.isArray(def) ? [...def] : def;
  });
  settingsStore.set(patch);
}

function isSceneMatch(s, values) {
  const target = sceneValues(values);
  return SCENE_KEYS.every((k) => {
    const a = s[k];
    const b = target[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b) < 1e-4;
    }
    return a === b;
  });
}

function Group({ title, reset, action, children }) {
  return (
    <section className="group" aria-label={title}>
      <div className="g-title">
        <span>{title}</span>
        {action}
        {reset && (
          <button
            type="button"
            className="text-btn"
            onClick={() => resetKeys(reset)}
            aria-label={`${title} zurücksetzen`}
          >
            <RotateCcw size={12} aria-hidden="true" /> Zurücksetzen
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function ScenesGroup({ s, open }) {
  const { list } = useStore(scenesStore);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const apply = (values) => settingsStore.set(sceneValues(values));
  const save = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const cur = settingsStore.get();
    const values = {};
    SCENE_KEYS.forEach((k) => {
      values[k] = Array.isArray(cur[k]) ? [...cur[k]] : cur[k];
    });
    scenesStore.set({
      list: [...list.filter((x) => x.name !== n), { id: `u${Date.now()}`, name: n, values }],
    });
    setName('');
    setSaving(false);
  };

  return (
    <Group
      title="Szenen"
      action={(
        <button
          type="button"
          className="text-btn"
          aria-expanded={saving}
          onClick={() => setSaving((v) => !v)}
        >
          <Plus size={12} aria-hidden="true" /> Speichern
        </button>
      )}
    >
      <div className="scenes-row" role="group" aria-label="Szenen">
        {BUILTIN_SCENES.map((sc) => (
          <button
            key={sc.id}
            type="button"
            className="card"
            aria-pressed={isSceneMatch(s, sc.values)}
            onClick={() => apply(sc.values)}
          >
            <span className="card-thumb">
              <SceneThumb scene={sc} active={open} />
            </span>
            <span className="card-label">{sc.name}</span>
          </button>
        ))}
        {list.map((sc) => (
          <div key={sc.id} className="card-wrap">
            <button
              type="button"
              className="card"
              aria-pressed={isSceneMatch(s, sc.values)}
              onClick={() => apply(sc.values)}
            >
              <span className="card-thumb">
                <SceneThumb scene={sc} active={open} />
              </span>
              <span className="card-label">{sc.name}</span>
            </button>
            <button
              type="button"
              className="card-del"
              aria-label={`Szene ${sc.name} löschen`}
              title={`Szene ${sc.name} löschen`}
              onClick={() => scenesStore.set({ list: list.filter((x) => x.id !== sc.id) })}
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      {saving && (
        <>
          <form className="scene-save" onSubmit={save}>
            <input
              type="text"
              value={name}
              maxLength={40}
              autoFocus
              placeholder="Name für aktuelle Einstellungen"
              aria-label="Name der neuen Szene"
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="lg-btn sm" disabled={!name.trim()}>Speichern</button>
          </form>
          <p className="hint">Eine Szene merkt sich Bild, Bewegung und Automatik. Strobe, Audio und Helligkeit bleiben, wie du sie eingestellt hast.</p>
        </>
      )}
    </Group>
  );
}

function PaletteControl({ s }) {
  const custom = s.palette === CUSTOM_PALETTE;
  return (
    <div className="field">
      <div className="field-head"><span className="label">Farben</span></div>
      <div className="swatches" role="group" aria-label="Farbpalette">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            className="swatch"
            title={p.name}
            aria-label={`Palette ${p.name}`}
            aria-pressed={s.palette === p.id}
            style={{ background: `linear-gradient(90deg, ${p.cols.slice(0, 4).join(', ')})` }}
            onClick={() => setSetting('palette', p.id)}
          />
        ))}
        <button
          type="button"
          className="swatch custom"
          aria-pressed={custom}
          title="Eigene Farben"
          style={{ background: `linear-gradient(90deg, ${s.customColors.slice(0, 4).join(', ')})` }}
          onClick={() => setSetting('palette', CUSTOM_PALETTE)}
        >
          Eigene
        </button>
        <CoverSwatch s={s} />
      </div>
      {s.palette === COVER_PALETTE && (
        <p className="hint">Die Farben kommen vom Album-Cover des Songs, der gerade läuft, und wechseln mit jedem Song. Die Lichter übernehmen sie auch.</p>
      )}
      {custom && (
        <div className="custom-colors">
          {s.customColors.map((c, i) => (
            <input
              key={i}
              type="color"
              className="lg-color"
              value={c}
              aria-label={`Farbe ${i + 1}`}
              onChange={(e) => {
                const next = [...s.customColors];
                next[i] = e.target.value;
                setSetting('customColors', next);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LookTab({ s, open, onPeekChange }) {
  const [moreColor, setMoreColor] = useState(false);
  return (
    <>
      <Group title="Stil und Farben" reset={RESET_STYLE}>
        <div className="cards" role="group" aria-label="Stil">
          {STYLES.map((st) => (
            <button
              key={st.id}
              type="button"
              className="card"
              aria-pressed={s.style === st.id}
              onClick={() => setSetting('style', st.id)}
            >
              <span className="card-thumb">
                <StyleThumb styleId={st.id} settings={s} active={open} />
              </span>
              <span className="card-label">{st.name}</span>
            </button>
          ))}
        </div>
        <PaletteControl s={s} />
        {s.style === 'minimal' && (
          <ColorField label="Hintergrund" value={s.bgColor} onChange={(v) => setSetting('bgColor', v)} />
        )}
      </Group>

      <Group title="Form" reset={RESET_FORM}>
        {s.style === 'minimal' && (
          <Range
            label="Anzahl Farbwolken"
            value={s.count}
            min={2}
            max={8}
            step={1}
            format={String}
            peek
            onPeekChange={onPeekChange}
            onChange={(v) => setSetting('count', v)}
          />
        )}
        <Range
          label="Größe"
          value={s.size}
          min={0.5}
          max={2}
          format={pct}
          preview={<SettingPreview kind="size" settings={s} active={open} />}
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('size', v)}
        />
        <Range
          label="Verformung"
          value={s.form}
          min={0}
          max={2}
          format={pct}
          hint="Wie stark sich die Formen verbiegen und verwirbeln"
          preview={<SettingPreview kind="form" settings={s} active={open} />}
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('form', v)}
        />
        <Range
          label="Nachleuchten"
          value={s.trails}
          min={0}
          max={1.2}
          format={pct}
          hint="Wie lange Farben nachleuchten. Neues erscheint trotzdem sofort"
          preview={<SettingPreview kind="trails" settings={s} active={open} />}
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('trails', v)}
        />
        {s.style === 'glass' && (
          <Range
            label="Glanz"
            value={s.glass}
            min={0}
            max={1}
            format={pct}
            preview={<SettingPreview kind="glass" settings={s} active={open} />}
            peek
            onPeekChange={onPeekChange}
            onChange={(v) => setSetting('glass', v)}
          />
        )}
      </Group>

      <Group title="Farbe" reset={RESET_COLOR}>
        <Range
          label="Helligkeit"
          value={s.brightness}
          min={0.4}
          max={1.6}
          format={pct}
          hint="Gilt für alle Szenen"
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('brightness', v)}
        />
        <Range
          label="Sättigung"
          value={s.saturation}
          min={0}
          max={1.8}
          format={pct}
          preview={<SettingPreview kind="saturation" settings={s} active={open} />}
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('saturation', v)}
        />
        <button
          type="button"
          className="more"
          aria-expanded={moreColor}
          onClick={() => setMoreColor((v) => !v)}
        >
          {moreColor ? (
            <>
              <ChevronUp size={14} aria-hidden="true" /> Weniger anzeigen
            </>
          ) : (
            <>
              <ChevronDown size={14} aria-hidden="true" /> Mehr: Farbton, Farbwanderung, Randabdunklung
            </>
          )}
        </button>
        {moreColor && (
          <div className="more-body">
            <Range
              label="Farbton verschieben"
              value={s.hueShift}
              min={0}
              max={360}
              step={5}
              format={deg}
              peek
              onPeekChange={onPeekChange}
              onChange={(v) => setSetting('hueShift', v)}
            />
            <Range
              label="Farbwanderung"
              value={s.hueDrift}
              min={0}
              max={1}
              format={pct}
              hint="Aus: Palette bleibt fest. Hoch: Farben wandern langsam durch den Farbkreis"
              peek
              onPeekChange={onPeekChange}
              onChange={(v) => setSetting('hueDrift', v)}
            />
            <Range
              label="Randabdunklung"
              value={s.vignette}
              min={0}
              max={1}
              format={pct}
              peek
              onPeekChange={onPeekChange}
              onChange={(v) => setSetting('vignette', v)}
            />
          </div>
        )}
      </Group>
    </>
  );
}

function ReactTab({ s, open, onPeekChange }) {
  return (
    <>
      <Group title="Was die Musik bewirkt" reset={RESET_BANDS}>
        <p className="hint">Links siehst du, wie laut das Band gerade ist. Rechts stellst du ein, wie stark es das Bild bewegt.</p>
        <Range
          band="bass"
          bandLabel="Bass"
          label="→ Größe & Puls"
          value={s.bassImpact}
          min={0}
          max={2}
          format={pct}
          hint="Kick und Bassline lassen die Farben anschwellen"
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('bassImpact', v)}
        />
        <Range
          band="mid"
          bandLabel="Mitten"
          label="→ Form & Fluss"
          value={s.midImpact}
          min={0}
          max={2}
          format={pct}
          hint="Gesang und Melodie verformen die Flächen und lassen sie schneller fließen"
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('midImpact', v)}
        />
        <Range
          band="high"
          bandLabel="Höhen"
          label="→ Funkeln"
          value={s.highImpact}
          min={0}
          max={2}
          format={pct}
          hint="Hi-Hats und Becken lassen die Farben funkeln"
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('highImpact', v)}
        />
      </Group>

      <Group title="Schlag und Tempo" reset={RESET_MOTION}>
        <Range
          label="Kick-Puls"
          value={s.beatPulse}
          min={0}
          max={2.5}
          format={pct}
          hint="Wie stark das Bild bei jedem Kick pulsiert"
          preview={<SettingPreview kind="beatPulse" settings={s} active={open} />}
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('beatPulse', v)}
        />
        <Range
          label="Glättung"
          value={s.smoothing}
          min={0.4}
          max={2.5}
          format={times}
          hint="Rechts klingt das Bild nach jedem Schlag weicher aus, der Schlag selbst kommt immer sofort"
          preview={<SettingPreview kind="smoothing" settings={s} active={open} />}
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('smoothing', v)}
        />
        <Range
          label="Grundtempo"
          value={s.speed}
          min={0.2}
          max={2.5}
          format={times}
          preview={<SettingPreview kind="speed" settings={s} active={open} />}
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('speed', v)}
        />
        <Range
          label="Tempo-Schub bei lauten Stellen"
          value={s.peakSpeed}
          min={0}
          max={2}
          format={times}
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('peakSpeed', v)}
        />
        <Range
          label="Reaktion gesamt"
          value={s.reactivity}
          min={0}
          max={2}
          format={pct}
          hint="0 macht das Bild unabhängig von der Musik"
          peek
          onPeekChange={onPeekChange}
          onChange={(v) => setSetting('reactivity', v)}
        />
      </Group>
    </>
  );
}

function FxTab({ s, open, onPeekChange }) {
  const rate = strobeMaxRate(s);
  return (
    <>
      <Group title="Symmetrie" reset={RESET_SYMMETRY}>
        <div className="cards four" role="group" aria-label="Spiegelung">
          {SYMMETRY_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className="card"
              title={o.full}
              aria-pressed={s.symmetry === o.id}
              onClick={() => setSetting('symmetry', o.id)}
            >
              <span className="card-thumb">
                <SymmetryThumb mode={o.id} settings={s} active={open} />
              </span>
              <span className="card-label">{o.name}</span>
            </button>
          ))}
        </div>
        {s.symmetry === 'kaleido' && (
          <Range
            label="Segmente"
            value={s.symmetrySegments}
            min={3}
            max={12}
            step={1}
            format={String}
            peek
            onPeekChange={onPeekChange}
            onChange={(v) => setSetting('symmetrySegments', v)}
          />
        )}
        {s.symmetry !== 'off' && (
          <Range
            label="Drehung"
            value={s.symmetrySpin}
            min={-1}
            max={1}
            format={signed}
            peek
            onPeekChange={onPeekChange}
            onChange={(v) => setSetting('symmetrySpin', v)}
          />
        )}
      </Group>

      <Group title="Drops und Strobe" reset={RESET_DROPS}>
        <Toggle
          label="Drops erkennen"
          value={s.dropDetection}
          hint="Ein Drop ist der Moment, in dem nach einem Breakdown der Bass zurückkommt"
          onChange={(v) => setSetting('dropDetection', v)}
        />
        {s.dropDetection && (
          <>
            <Range
              label="Drop-Empfindlichkeit"
              value={s.dropSensitivity}
              min={0.4}
              max={2}
              format={pct}
              peek
              onPeekChange={onPeekChange}
              onChange={(v) => setSetting('dropSensitivity', v)}
            />
            <Toggle
              label="Farbsprung beim Drop"
              value={s.dropColorJump}
              onChange={(v) => setSetting('dropColorJump', v)}
            />
            <Toggle
              label="Tempo-Schub im Drop"
              value={s.dropBoost}
              onChange={(v) => setSetting('dropBoost', v)}
            />
          </>
        )}
        <Toggle
          label="Strobe"
          warn
          value={s.strobe}
          onChange={(v) => setSetting('strobe', v)}
        />
        <div className="warnbox" role="note">
          Schnelle Lichtblitze. Nicht geeignet bei Lichtempfindlichkeit oder Epilepsie. Die Sicherheitsgrenze von 3 Blitzen pro Sekunde gilt für Bild und Lichter.
        </div>
        {s.strobe && (
          <>
            <Segmented
              full
              label="Wann"
              value={s.strobeMode}
              options={[
                { id: 'drop', name: 'Nur bei Drops' },
                { id: 'always', name: 'Durchgehend' },
              ]}
              onChange={(v) => setSetting('strobeMode', v)}
            />
            <Segmented
              full
              label="Takt"
              value={s.strobeSync}
              options={[
                { id: 'kick', name: 'Auf die Kicks' },
                { id: 'rate', name: 'Feste Frequenz' },
              ]}
              onChange={(v) => setSetting('strobeSync', v)}
            />
            <Range
              label={s.strobeSync === 'kick' ? 'Höchstens Blitze pro Sekunde' : 'Blitze pro Sekunde'}
              value={s.strobeRate}
              min={0.5}
              max={10}
              step={0.5}
              format={(v) => `${String(v).replace('.', ',')} Hz${s.strobeLimit && v > 3 ? ' → 3 Hz' : ''}`}
              onChange={(v) => setSetting('strobeRate', v)}
            />
            <Toggle
              label="Sicherheitsgrenze: max. 3 Blitze/s"
              value={s.strobeLimit}
              hint="Gilt für Bild und Lichter. Einschalten, wenn lichtempfindliche Menschen im Raum sind"
              onChange={(v) => setSetting('strobeLimit', v)}
            />
            <Range
              label="Blitz-Stärke"
              value={s.strobeIntensity}
              min={0.1}
              max={1}
              format={pct}
              peek
              onPeekChange={onPeekChange}
              onChange={(v) => setSetting('strobeIntensity', v)}
            />
            <Segmented
              full
              label="Blitzfarbe"
              value={s.strobeColor}
              options={[
                { id: 'white', name: 'Weiß' },
                { id: 'palette', name: 'Palettenfarben' },
              ]}
              onChange={(v) => setSetting('strobeColor', v)}
            />
            <Segmented
              full
              label="Blitzdauer"
              value={s.strobeLength}
              options={[
                { id: 'short', name: 'Kurz' },
                { id: 'long', name: 'Lang' },
              ]}
              onChange={(v) => setSetting('strobeLength', v)}
            />
            <p className="hint">Aktuell höchstens {String(rate).replace('.', ',')} Blitze pro Sekunde.</p>
          </>
        )}
      </Group>

      <Group title="Automatik" reset={RESET_AUTO}>
        <Segmented
          full
          label="Automatisch wechseln"
          value={s.autoSwitch}
          options={[
            { id: 'off', name: 'Aus' },
            { id: 'palette', name: 'Palette' },
            { id: 'style', name: 'Stil' },
            { id: 'both', name: 'Beides' },
          ]}
          onChange={(v) => setSetting('autoSwitch', v)}
        />
        {s.autoSwitch !== 'off' && (
          <>
            <Segmented
              full
              label="Auslöser"
              value={s.autoTrigger}
              options={[
                { id: 'drop', name: 'Bei Drops' },
                { id: 'timer', name: 'Nach Zeit' },
                { id: 'both', name: 'Beides' },
              ]}
              onChange={(v) => setSetting('autoTrigger', v)}
            />
            {s.autoTrigger !== 'drop' && (
              <Range
                label="Intervall"
                value={s.autoInterval}
                min={1}
                max={15}
                step={1}
                format={mins}
                onChange={(v) => setSetting('autoInterval', v)}
              />
            )}
            <Toggle
              label="Zufällige Reihenfolge"
              value={s.shuffle}
              onChange={(v) => setSetting('shuffle', v)}
            />
          </>
        )}
        <Range
          label="Übergangszeit"
          value={s.transition}
          min={0.5}
          max={6}
          step={0.5}
          format={sec}
          hint="Gilt auch, wenn du Palette oder Stil von Hand wechselst"
          onChange={(v) => setSetting('transition', v)}
        />
      </Group>
    </>
  );
}

const lightName = (d) => `${d.sku || 'Govee-Licht'} · ${d.ip}`;
const updateLight = (s, ip, patch) => setSetting('lightDevices', s.lightDevices.map((d) => (d.ip === ip ? { ...d, ...patch } : d)));

function LightRow({ d, s }) {
  const st = useStore(lightStore);
  const test = async () => {
    if (!desktopBridge?.lights?.test) return;
    lightStore.set({ testing: d.ip, error: '' });
    const r = await desktopBridge.lights.test(d).catch((err) => ({ error: String(err) }));
    lightStore.set({
      testing: '',
      error: r && r.error ? r.error
        : r && !r.answered ? `${lightName(d)} hat nicht geantwortet. Ist „LAN Control“ in der Govee Home App an?` : '',
    });
  };
  return (
    <li className="light">
      <div className="light-head">
        <label>
          <input
            type="checkbox"
            checked={d.on}
            onChange={(e) => updateLight(s, d.ip, { on: e.target.checked })}
          />{' '}
          {lightName(d)}
        </label>
        <button
          type="button"
          className="lg-btn sm"
          disabled={!isDesktopApp || !!st.testing}
          onClick={test}
        >
          {st.testing === d.ip ? 'Test läuft …' : 'Test'}
        </button>
        <button
          type="button"
          className="lg-btn round sm"
          aria-label={`${lightName(d)} entfernen`}
          onClick={() => setSetting('lightDevices', s.lightDevices.filter((x) => x.ip !== d.ip))}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <Segmented
        compact
        label={`Ansteuerung ${lightName(d)}`}
        value={d.mode}
        onChange={(v) => updateLight(s, d.ip, { mode: v })}
        options={[
          { id: 'segments', name: 'Segmente' },
          { id: 'single', name: 'Eine Farbe' },
        ]}
      />
      {d.mode === 'segments' && (
        <Range
          label="Anzahl Segmente"
          value={d.segments}
          min={1}
          max={60}
          step={1}
          format={String}
          onChange={(v) => updateLight(s, d.ip, { segments: v })}
        />
      )}
    </li>
  );
}

function LightDevicesGroup({ s }) {
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
    if (!desktopBridge?.lights?.scan) return;
    lightStore.set({ scanning: true, error: '' });
    const r = await desktopBridge.lights.scan().catch((err) => ({ error: String(err) }));
    if (r && r.list) add(r.list);
    lightStore.set({
      scanning: false,
      scanned: true,
      error: r && r.error ? r.error
        : r && r.list && !r.list.length ? 'Keine Lichter gefunden. Ist „LAN Control“ an und der PC im selben WLAN? Sonst die IP-Adresse unten eintragen.' : '',
    });
  };

  const addManual = (e) => {
    e.preventDefault();
    const ip = manual.trim();
    if (!cleanLight({ ip })) {
      lightStore.set({ error: 'Das ist keine IP-Adresse (Beispiel: 192.168.178.45).' });
      return;
    }
    lightStore.set({ error: '' });
    add([{ ip, sku: '' }]);
    setManual('');
  };

  return (
    <Group title="Geräte">
      {!isDesktopApp && (
        <p className="hint">Govee-Lichter im lokalen WLAN werden in der Desktop-App gesucht und direkt per LAN angesteuert.</p>
      )}
      <button
        type="button"
        className="lg-btn sm"
        disabled={!isDesktopApp || st.scanning}
        onClick={scan}
      >
        <Search size={14} aria-hidden="true" /> {st.scanning ? 'Suche läuft …' : 'Lichter suchen'}
      </button>
      {st.error && <p className="hint warn-text" role="alert">{st.error}</p>}
      {s.lightDevices.length > 0 && (
        <ul className="light-list">
          {s.lightDevices.map((d) => <LightRow key={d.ip} d={d} s={s} />)}
        </ul>
      )}
      <form className="scene-save" onSubmit={addManual}>
        <input
          type="text"
          inputMode="decimal"
          value={manual}
          maxLength={15}
          disabled={!isDesktopApp}
          placeholder="IP-Adresse von Hand"
          aria-label="IP-Adresse eines Lichts"
          onChange={(e) => setManual(e.target.value)}
        />
        <button type="submit" className="lg-btn sm" disabled={!isDesktopApp || !manual.trim()}>
          <Plus size={14} aria-hidden="true" /> Hinzufügen
        </button>
      </form>
      <p className="hint">Einmalig nötig: in der Govee Home App beim Gerät unter Einstellungen „LAN Control“ einschalten. Fragt Windows beim ersten Suchen nach dem Netzwerkzugriff, „Private Netzwerke“ zulassen.</p>
      <p className="hint">Segmente: jedes Stück des Streifens bekommt eine eigene Farbe. Leuchtet beim Test nur ein Teil oder gar nichts, nimm „Eine Farbe“.</p>
    </Group>
  );
}

function LightTab({ s, open }) {
  return (
    <>
      <Group title="Govee-Lichter" reset={RESET_LIGHTS}>
        <Toggle
          label="Lichter steuern"
          value={s.lights}
          hint="Govee-Lichter im WLAN leuchten mit der Musik und den Farben des Bildes. Beim Beenden bekommen sie ihre alte Farbe zurück."
          onChange={(v) => setSetting('lights', v)}
        />
        <LedStripPreview settings={s} active={open} />
        <p className="hint">
          {isDesktopApp
            ? 'Live-Vorschau des Streifens. Bewegt sich direkt mit den Farben und Reglern unten.'
            : 'Live-Vorschau des Streifens. Die echte LAN-Steuerung für Govee-Lichter läuft in der Desktop-App.'}
        </p>
        {s.lights && (
          <>
            <Select
              label="Effekt"
              value={s.lightEffect}
              options={LIGHT_EFFECTS}
              hint="Automatisch: wechselt bei Drops und alle 32 Kicks, ruhige Effekte in ruhiger Musik"
              onChange={(v) => setSetting('lightEffect', v)}
            />
            <Range
              label="Helligkeit der Lichter"
              value={s.lightBrightness}
              min={0.1}
              max={1}
              format={pct}
              onChange={(v) => setSetting('lightBrightness', v)}
            />
            <Range
              label="Reaktion auf die Musik"
              value={s.lightPulse}
              min={0}
              max={2}
              format={pct}
              hint="Wie stark die Lichter mit Bass, Stimme und Kicks heller und dunkler werden"
              onChange={(v) => setSetting('lightPulse', v)}
            />
            <Range
              label="Farbverlauf"
              value={s.lightSpread}
              min={0}
              max={1}
              format={pct}
              hint="Links: der ganze Streifen in einer Farbe. Rechts: mehrere Palettenfarben nebeneinander"
              onChange={(v) => setSetting('lightSpread', v)}
            />
            <Toggle
              label="Funkeln bei Hi-Hats"
              value={s.lightSparkle}
              hint="Einzelne Segmente leuchten kurz heller auf"
              onChange={(v) => setSetting('lightSparkle', v)}
            />
            <Toggle
              label="Licht-Strobe"
              warn
              value={s.lightStrobe}
              hint="Segmente gehen sehr schnell an und aus. Unabhängig vom Strobe auf dem Bildschirm"
              onChange={(v) => setSetting('lightStrobe', v)}
            />
            {s.lightStrobe && (
              <>
                <Segmented
                  full
                  label="Wann"
                  value={s.lightStrobeMode}
                  options={[
                    { id: 'drop', name: 'Nur bei Drops' },
                    { id: 'always', name: 'Durchgehend' },
                  ]}
                  onChange={(v) => setSetting('lightStrobeMode', v)}
                />
                <Segmented
                  full
                  label="Art"
                  value={s.lightStrobeStyle}
                  options={[
                    { id: 'segments', name: 'Einzelne Segmente' },
                    { id: 'full', name: 'Ganzer Streifen' },
                  ]}
                  onChange={(v) => setSetting('lightStrobeStyle', v)}
                />
                <Range
                  label="Wechsel pro Sekunde"
                  value={s.lightStrobeRate}
                  min={2}
                  max={25}
                  step={1}
                  format={(v) => `${v}${s.strobeLimit && v > 3 ? ' → 3' : ''}`}
                  hint="Mehr als die Hälfte der Licht-Bildrate unten schafft der Streifen nicht"
                  onChange={(v) => setSetting('lightStrobeRate', v)}
                />
              </>
            )}
            <Range
              label="Bildrate der Lichter"
              value={s.lightRate}
              min={10}
              max={40}
              step={1}
              format={hzRate}
              hint="Wie oft die App neue Farben schickt. Wenn die Lichter hängen oder hinterherlaufen: kleiner"
              onChange={(v) => setSetting('lightRate', v)}
            />
          </>
        )}
      </Group>

      <LightDevicesGroup s={s} />
    </>
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
  if (!options.some((o) => o.id === s.source)) {
    options.push({ id: s.source, name: 'Gespeichertes Gerät (nicht verbunden)' });
  }
  return (
    <Select
      label="Quelle"
      value={s.source}
      options={options}
      onChange={(v) => setSetting('source', v)}
      hint={isDesktopApp
        ? 'Desktop-Audio nimmt alles auf, was über deine Lautsprecher läuft. Andere Geräte sind z. B. Mikrofon oder „Stereomix“.'
        : 'Im Browser fragt Chrome bei jedem Start nach der Freigabe. Die Desktop-App braucht das nicht.'}
    />
  );
}

function LevelControl() {
  const live = useStore(liveStore);
  const audio = useStore(audioStore);
  let state = 'ok';
  let text = 'Signal ist da';
  if (audio.state !== 'live') {
    state = 'off';
    text = 'Keine Quelle aktiv';
  } else if (live.silent) {
    state = 'off';
    text = 'Kein Signal: spiel Musik ab oder senke die Stille-Schwelle';
  }
  return (
    <div className="field">
      <div className={`level level-${state}`}>
        <span className="dot" aria-hidden="true" />
        {text}
      </div>
      <div className="meters small">
        <Meter label="Bass" band="bass" />
        <Meter label="Mitte" band="mid" />
        <Meter label="Höhen" band="high" />
      </div>
    </div>
  );
}

function MediaControl({ s }) {
  const m = useStore(mediaStore);
  const linux = desktopBridge?.platform === 'linux';
  let state = 'ok';
  let text;
  if (m.available === false) {
    state = 'off';
    text = m.reason;
  } else if (m.available === null) {
    state = 'off';
    text = s.nowPlaying === 'off' && s.palette !== COVER_PALETTE ? 'Aus' : 'Verbinde …';
  } else if (m.status === 'none' || !m.title) {
    state = 'off';
    text = 'Gerade läuft nichts. Starte Spotify oder einen anderen Player.';
  } else {
    text = `${m.app}: ${m.title}${m.artist ? ` · ${m.artist}` : ''}`;
  }
  return (
    <div className="field">
      <div className={`level level-${state}`}>
        <span className="dot" aria-hidden="true" />
        {text}
      </div>
      {state === 'ok' && m.coverError && (
        <p className="hint warn-text">{m.coverError} Die Cover-Palette erfindet solange Farben passend zum Song.</p>
      )}
      <p className="hint">
        {linux
          ? 'Titel und Cover kommen über MPRIS (playerctl) vom Player. Das klappt mit Spotify, Browsern und den meisten Playern, ohne Anmeldung.'
          : 'Titel und Cover kommen von Windows, wie in der Anzeige neben der Lautstärke. Das klappt mit Spotify, Browsern und den meisten Playern, ohne Anmeldung und ohne Premium.'}
      </p>
    </div>
  );
}

function DisplayControl({ s }) {
  const [displays, setDisplays] = useState([]);
  useEffect(() => {
    let alive = true;
    desktopBridge?.listDisplays?.()
      .then((list) => { if (alive && Array.isArray(list)) setDisplays(list); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (displays.length < 2) return null;
  return (
    <Select
      label="Bildschirm für Vollbild"
      value={s.display}
      options={[
        { id: '', name: 'Der Bildschirm mit dem Fenster' },
        ...displays.map((d) => ({ id: String(d.id), name: d.label })),
      ]}
      onChange={(v) => setSetting('display', v)}
    />
  );
}

function SysTab({ s }) {
  const [moreAudio, setMoreAudio] = useState(false);
  return (
    <>
      <Group title="Audio" reset={RESET_AUDIO}>
        <SourceControl s={s} />
        {s.source === 'demo' && (
          <Select
            label="Genre des Testsignals"
            value={s.demoGenre}
            options={GENRES}
            onChange={(v) => setSetting('demoGenre', v)}
          />
        )}
        <LevelControl />
        <Toggle
          label="Auto-Pegel"
          value={s.autoGain}
          hint="Gleicht leise und laute Songs aus, unabhängig von der Windows-Lautstärke"
          onChange={(v) => setSetting('autoGain', v)}
        />
        <Range
          label="Bild verzögern"
          value={s.latency}
          min={0}
          max={500}
          step={10}
          format={ms}
          hint="Für Bluetooth-Lautsprecher: Das Bild wartet auf den Ton"
          onChange={(v) => setSetting('latency', v)}
        />
        <button
          type="button"
          className="more"
          aria-expanded={moreAudio}
          onClick={() => setMoreAudio((v) => !v)}
        >
          {moreAudio ? (
            <>
              <ChevronUp size={14} aria-hidden="true" /> Weniger anzeigen
            </>
          ) : (
            <>
              <ChevronDown size={14} aria-hidden="true" /> Fachregler: Anpassungszeit, Verstärkung, Dynamik, Kick, Stille
            </>
          )}
        </button>
        {moreAudio && (
          <div className="more-body">
            {s.autoGain && (
              <Range
                label="Anpassungszeit"
                value={s.agcTime}
                min={5}
                max={60}
                step={1}
                format={sec}
                onChange={(v) => setSetting('agcTime', v)}
              />
            )}
            <Range
              label="Verstärkung"
              value={s.gain}
              min={0.5}
              max={3}
              format={times}
              onChange={(v) => setSetting('gain', v)}
            />
            <Range
              label="Dynamik-Bereich"
              value={s.bandRange}
              min={12}
              max={40}
              step={1}
              format={db}
              hint="Wie viele Dezibel unter dem lautesten Moment ein Band als leer gilt. Kleiner: Balken springen stärker. Größer: ruhigeres Bild"
              onChange={(v) => setSetting('bandRange', v)}
            />
            <Range
              label="Kick-Empfindlichkeit"
              value={s.kickSensitivity}
              min={0.5}
              max={2}
              format={pct}
              onChange={(v) => setSetting('kickSensitivity', v)}
            />
            <Range
              label="Stille-Schwelle"
              value={s.silenceLevel}
              min={-95}
              max={-40}
              step={1}
              format={db}
              hint="Gesamtpegel, unter dem das Signal als Stille gilt. Musik liegt meist zwischen -45 und -15 dB"
              onChange={(v) => setSetting('silenceLevel', v)}
            />
          </div>
        )}
      </Group>

      {isDesktopApp && (
        <Group title="Musik" reset={RESET_MUSIC}>
          <MediaControl s={s} />
          <Segmented
            full
            label="Song anzeigen"
            value={s.nowPlaying}
            options={[
              { id: 'off', name: 'Aus' },
              { id: 'auto', name: 'Automatisch' },
              { id: 'always', name: 'Immer' },
            ]}
            hint="Oben rechts mit Cover, Titel und Tasten für Zurück, Pause und Weiter. Automatisch: solange das Menü zu sehen ist und ein paar Sekunden nach jedem Songwechsel"
            onChange={(v) => setSetting('nowPlaying', v)}
          />
        </Group>
      )}

      <Group title="Anzeige" reset={RESET_DISPLAY}>
        <Select
          label="Qualität"
          value={s.quality}
          options={QUALITY_OPTIONS}
          onChange={(v) => setSetting('quality', v)}
        />
        <Select
          label="Bildrate begrenzen"
          value={s.fpsLimit}
          options={FPS_OPTIONS}
          onChange={(v) => setSetting('fpsLimit', v)}
        />
        <Toggle
          label="Pegel-Anzeige oben links"
          value={s.showHud}
          onChange={(v) => setSetting('showHud', v)}
        />
        <Toggle
          label="Takt-Ansicht anzeigen"
          value={s.beatPanel}
          onChange={(v) => setSetting('beatPanel', v)}
        />
        <Toggle
          label="FPS anzeigen"
          value={s.showFps}
          onChange={(v) => setSetting('showFps', v)}
        />
        <Range
          label="Menü ausblenden nach"
          value={s.autoHide}
          min={1.5}
          max={10}
          step={0.5}
          format={sec}
          onChange={(v) => setSetting('autoHide', v)}
        />
        {isDesktopApp && <DisplayControl s={s} />}
        {isDesktopApp && (
          <Toggle
            label="Im Vollbild starten"
            value={s.fullscreenOnStart}
            onChange={(v) => setSetting('fullscreenOnStart', v)}
          />
        )}
        {isDesktopApp && (
          <Toggle
            label="Immer im Vordergrund"
            value={s.alwaysOnTop}
            onChange={(v) => setSetting('alwaysOnTop', v)}
          />
        )}
        <Toggle
          label="Hinweis zu Lichtblitzen beim Start"
          value={s.startWarning}
          onChange={(v) => setSetting('startWarning', v)}
        />
      </Group>

      <Group title="Tastenkürzel">
        <dl className="keys">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <dt><kbd>{k}</kbd></dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Group>

      <button
        type="button"
        className="lg-btn danger"
        onClick={() => {
          if (window.confirm('Alle Einstellungen auf Standard zurücksetzen? Gespeicherte Szenen bleiben erhalten.')) {
            resetSettings();
          }
        }}
      >
        Alle Einstellungen zurücksetzen
      </button>
    </>
  );
}

export default function SettingsPanel({ open, onClose }) {
  const s = useSettings();
  const [tab, setTab] = useState('look');
  const [peeking, setPeeking] = useState(false);
  const panelBodyRef = useRef(null);

  useEffect(() => {
    if (!peeking) return undefined;
    const clear = () => setPeeking(false);
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
      window.removeEventListener('blur', clear);
    };
  }, [peeking]);

  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setPeeking(false);
    if (panelBodyRef.current) panelBodyRef.current.scrollTop = 0;
  };

  const handleClose = () => {
    setPeeking(false);
    onClose();
  };

  const isPeeking = open && peeking;

  return (
    <LiquidGlass
      as="aside"
      className={`panel${open ? ' open' : ''}${isPeeking ? ' peek' : ''}`}
      surface="dense"
      radius={28}
      refract={open}
      aria-label="Einstellungen"
      aria-hidden={!open}
      inert={!open}
    >
      <header className="panel-head">
        <h2>Einstellungen</h2>
        <button
          type="button"
          className="lg-btn round"
          onClick={handleClose}
          aria-label="Einstellungen schließen"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>
      <div className="panel-tabs">
        <Segmented
          full
          asTabs
          idPrefix="settings"
          label="Einstellungsbereiche"
          value={tab}
          onChange={handleTabChange}
          options={TABS}
        />
      </div>
      <div
        ref={panelBodyRef}
        className="panel-body"
        role="tabpanel"
        aria-labelledby={`settings-tab-${tab}`}
      >
        <ScenesGroup s={s} open={open} />
        {tab === 'look' && <LookTab s={s} open={open} onPeekChange={setPeeking} />}
        {tab === 'react' && <ReactTab s={s} open={open} onPeekChange={setPeeking} />}
        {tab === 'fx' && <FxTab s={s} open={open} onPeekChange={setPeeking} />}
        {tab === 'light' && <LightTab s={s} open={open} />}
        {tab === 'sys' && <SysTab s={s} />}
      </div>
    </LiquidGlass>
  );
}
