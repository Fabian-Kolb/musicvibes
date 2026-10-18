import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings, Maximize2, EyeOff, Zap, Play, RotateCw } from 'lucide-react';
import Visualizer from './components/Visualizer';
import SettingsPanel from './components/SettingsPanel';
import { Segmented, Meter } from './components/controls';
import { STYLES } from './state/settings';
import { PALETTES, CUSTOM_PALETTE } from './state/palettes';
import { settingsStore, audioStore, liveStore, useSettings, useStore, setSetting } from './state/store';
import { startSource } from './audio/controller';
import { desktopBridge } from './audio/capture';

const cycle = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];

function toggleFullscreen() {
  if (desktopBridge?.toggleFullscreen) {
    desktopBridge.toggleFullscreen(settingsStore.get().display);
    return;
  }
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function SourceStatus() {
  const audio = useStore(audioStore);
  const live = useStore(liveStore);
  if (audio.state === 'needs-gesture') {
    return <button type="button" className="status-btn" onClick={() => startSource(settingsStore.get().source, { userGesture: true })}><Play size={14} /> Desktop-Audio starten</button>;
  }
  if (audio.state === 'error') {
    return <button type="button" className="status-btn error" title={audio.message} onClick={() => startSource(settingsStore.get().source, { userGesture: true })}><RotateCw size={14} /> Erneut verbinden</button>;
  }
  let cls = 'live', text = audio.label || 'Audio';
  if (audio.state === 'starting') { cls = 'wait'; text = 'Verbinde …'; }
  else if (audio.state === 'live' && live.silent) { cls = 'silent'; text = `${audio.label} · keine Musik`; }
  return <span className={`status ${cls}`} role="status"><span className="dot" />{text}</span>;
}

function Hud({ s }) {
  const live = useStore(liveStore);
  return (
    <div className="hud ui">
      <div className="brand"><b>VibSync</b></div>
      <div className="mood-row">
        <span className="mood">{live.mood}</span>
        {live.drop && <span className="drop">Drop</span>}
        {s.source === 'demo' && live.section && <span className="section">Testsignal · {live.section}</span>}
      </div>
      {s.showHud && (
        <div className="meters">
          <Meter label="Bass" value={live.bass} />
          <Meter label="Mitte" value={live.mid} />
          <Meter label="Höhen" value={live.high} />
          <Meter label="Drive" value={live.drive} />
        </div>
      )}
    </div>
  );
}

function Notice() {
  const audio = useStore(audioStore);
  if (audio.state === 'needs-gesture') {
    return (
      <div className="notice">
        <h1>Desktop-Ton verbinden</h1>
        <p>Im Browser muss Chrome einmal fragen. Wähle im Dialog <b>Gesamter Bildschirm</b> und setze das Häkchen bei <b>Systemaudio teilen</b>. Das Bild selbst wird nicht aufgenommen.</p>
        <button type="button" className="primary" onClick={() => startSource(settingsStore.get().source, { userGesture: true })}>Desktop-Audio starten</button>
        <button type="button" className="text-btn" onClick={() => setSetting('source', 'demo')}>Erst mal mit Testsignal ansehen</button>
      </div>
    );
  }
  if (audio.state === 'error') {
    return (
      <div className="notice">
        <h1>Kein Ton verbunden</h1>
        <p>{audio.message}</p>
        <button type="button" className="primary" onClick={() => startSource(settingsStore.get().source, { userGesture: true })}>Erneut versuchen</button>
        <button type="button" className="text-btn" onClick={() => setSetting('source', 'demo')}>Testsignal nutzen</button>
      </div>
    );
  }
  return null;
}

// Shown at every start until switched off: the app can flash fast on screen and on
// connected lights, and there is no fixed flash limit unless the user sets one.
function StartWarning() {
  const [open, setOpen] = useState(() => settingsStore.get().startWarning);
  const [hide, setHide] = useState(false);
  if (!open) return null;
  const close = () => { if (hide) setSetting('startWarning', false); setOpen(false); };
  return (
    <div className="warning-backdrop">
      <div className="notice warning" role="alertdialog" aria-modal="true" aria-labelledby="warn-title" aria-describedby="warn-text">
        <h1 id="warn-title">Achtung: Lichtblitze</h1>
        <p id="warn-text">VibSync kann schnelle Lichtblitze und flackerndes Licht erzeugen, auf dem Bildschirm und auf angeschlossenen Lichtern. Bei Menschen mit lichtempfindlicher Epilepsie können solche Blitze Anfälle auslösen. Ist jemand im Raum betroffen, lass den Strobe aus oder schalte unter Einstellungen → Drops &amp; Strobe die Sicherheitsgrenze ein.</p>
        <label className="check"><input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> Beim Start nicht mehr anzeigen</label>
        <button type="button" className="primary" autoFocus onClick={close}>Verstanden</button>
      </div>
    </div>
  );
}

export default function App() {
  const s = useSettings();
  const live = useStore(liveStore);
  const [panel, setPanel] = useState(false);
  const [idle, setIdle] = useState(false);
  const timer = useRef(0);
  const overUi = useRef(false);
  const panelRef = useRef(panel);
  useEffect(() => { panelRef.current = panel; }, [panel]);

  // Start (or switch) the audio source whenever the setting changes.
  useEffect(() => { startSource(s.source); }, [s.source]);

  // Desktop app window options.
  useEffect(() => { desktopBridge?.setAlwaysOnTop?.(s.alwaysOnTop); }, [s.alwaysOnTop]);
  useEffect(() => {
    if (settingsStore.get().fullscreenOnStart) desktopBridge?.setFullscreen?.(true, settingsStore.get().display);
  }, []);

  // Menus fade out when the pointer rests and come back on any movement.
  const armTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!overUi.current && !panelRef.current) setIdle(true);
    }, settingsStore.get().autoHide * 1000);
  }, []);
  const wake = useCallback(() => {
    setIdle(false);
    armTimer();
  }, [armTimer]);
  useEffect(() => {
    armTimer();
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      clearTimeout(timer.current);
    };
  }, [wake, armTimer]);
  useEffect(() => { if (!panel) armTimer(); }, [panel, armTimer]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if ((tag === 'INPUT' && e.target.type !== 'range') || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const S = settingsStore.get();
      if (k === 'f') toggleFullscreen();
      else if (k === 'h') { if (idle) wake(); else setIdle(true); return; }
      else if (k === 'e') setPanel((p) => !p);
      else if (k === 'escape') setPanel(false);
      else if (k === 'g') setSetting('style', cycle(STYLES.map((x) => x.id), S.style));
      else if (k === 'p') setSetting('palette', cycle(PALETTES.map((x) => x.id), S.palette === CUSTOM_PALETTE ? PALETTES[0].id : S.palette));
      else if (k === 's') setSetting('strobe', !S.strobe);
      else return;
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idle, wake]);

  const uiHandlers = {
    onPointerEnter: () => { overUi.current = true; },
    onPointerLeave: () => { overUi.current = false; wake(); },
  };

  return (
    <div className={`app${idle ? ' idle' : ''}${panel ? ' panel-open' : ''}`}>
      <Visualizer />
      <Hud s={s} />
      {s.showFps && <div className="fps">{live.fps} FPS</div>}
      <Notice />
      <StartWarning />
      <div className="dock ui" {...uiHandlers}>
        <SourceStatus />
        <span className="sep" aria-hidden="true" />
        <Segmented compact label="Stil" value={s.style} options={STYLES} onChange={(v) => setSetting('style', v)} />
        <div className="swatches" role="group" aria-label="Farbpalette">
          {PALETTES.map((p) => (
            <button key={p.id} type="button" className="swatch" title={p.name} aria-label={`Palette ${p.name}`}
              aria-pressed={s.palette === p.id} style={{ background: `linear-gradient(90deg, ${p.cols.slice(0, 4).join(', ')})` }}
              onClick={() => setSetting('palette', p.id)} />
          ))}
        </div>
        <span className="spacer" />
        <button type="button" className={`strobe${s.strobe ? ' on' : ''}`} aria-pressed={s.strobe} onClick={() => setSetting('strobe', !s.strobe)}
          title="Lichtblitze, standardmäßig nur während eines Drops">
          <Zap size={15} /> Strobe
        </button>
        <button type="button" aria-pressed={panel} onClick={() => setPanel((p) => !p)}><Settings size={15} /> Einstellungen</button>
        <button type="button" className="icon-btn" onClick={toggleFullscreen} aria-label="Vollbild" title="Vollbild (F)"><Maximize2 size={16} /></button>
        <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); setPanel(false); setIdle(true); }} aria-label="Menü ausblenden" title="Menü ausblenden (H)"><EyeOff size={16} /></button>
      </div>
      <div {...uiHandlers}>
        <SettingsPanel open={panel} onClose={() => setPanel(false)} />
      </div>
    </div>
  );
}
