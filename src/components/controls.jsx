import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import LiquidGlass from './LiquidGlass';
import { registerMeter, registerBeatView, sendBeatCommand } from '../state/meters';

// Small form controls shared by the dock, HUD, and settings panel.

export function Range({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.05,
  format,
  hint,
  preview,
  band,
  bandLabel,
  peek = false,
  onPeekChange,
}) {
  const id = useId();
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const onPeekRef = useRef(onPeekChange);

  useEffect(() => {
    onPeekRef.current = onPeekChange;
  }, [onPeekChange]);

  const startPeek = useCallback(() => {
    if (!peek || draggingRef.current) return;
    draggingRef.current = true;
    setDragging(true);
    onPeekRef.current?.(true);
  }, [peek]);

  const endPeek = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    onPeekRef.current?.(false);
  }, []);

  useEffect(() => {
    if (!dragging) return undefined;
    window.addEventListener('pointerup', endPeek);
    window.addEventListener('pointercancel', endPeek);
    return () => {
      window.removeEventListener('pointerup', endPeek);
      window.removeEventListener('pointercancel', endPeek);
    };
  }, [dragging, endPeek]);

  useEffect(
    () => () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        onPeekRef.current?.(false);
      }
    },
    [],
  );

  const span = max - min;
  const pct = span > 0 ? Math.max(0, Math.min(100, ((value - min) / span) * 100)) : 0;
  const formatted = format ? String(format(value)) : String(value);

  const head = (
    <div className="field-head">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{formatted}</output>
    </div>
  );

  const rangeEl = (
    <div className="lg-range" style={{ '--p': `${pct}%` }}>
      <div className="lg-range-track" aria-hidden="true">
        <div className="lg-range-fill" />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={formatted}
        aria-describedby={hint ? hintId : undefined}
        onPointerDown={peek ? startPeek : undefined}
        onPointerUp={peek ? endPeek : undefined}
        onPointerCancel={peek ? endPeek : undefined}
        onBlur={peek ? endPeek : undefined}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );

  const hintEl = hint ? <p id={hintId} className="hint">{hint}</p> : null;

  if (band) {
    return (
      <div className={`route${dragging ? ' peek-active' : ''}`}>
        <div className="route-band">
          <span>{bandLabel || band}</span>
          <Meter band={band} compact />
        </div>
        <div className="field route-tgt">
          {head}
          {rangeEl}
          {hintEl}
        </div>
      </div>
    );
  }

  if (preview) {
    return (
      <div className={`f-row${dragging ? ' peek-active' : ''}`}>
        <div className="pv" aria-hidden="true">{preview}</div>
        <div className="field">
          {head}
          {rangeEl}
          {hintEl}
        </div>
      </div>
    );
  }

  return (
    <div className={`field${dragging ? ' peek-active' : ''}`}>
      {head}
      {rangeEl}
      {hintEl}
    </div>
  );
}

export function Toggle({ label, value, onChange, hint, warn = false }) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={value}
          aria-describedby={hint ? hintId : undefined}
          className={`switch${warn ? ' warn' : ''}`}
          onClick={() => onChange(!value)}
        >
          <span aria-hidden="true" />
        </button>
      </div>
      {hint && <p id={hintId} className="hint">{hint}</p>}
    </div>
  );
}

export function Segmented({
  label,
  value,
  onChange,
  options,
  hint,
  compact = false,
  full = false,
  asTabs = false,
  idPrefix,
}) {
  const hintId = useId();
  const trackRef = useRef(null);
  const dropRef = useRef(null);
  const btnRefs = useRef([]);
  const readyRef = useRef(false);
  const prevValueRef = useRef(value);
  const valueRef = useRef(value);
  const optionsRef = useRef(options);
  const rafRef = useRef(0);
  const squishTimer = useRef(0);

  const positionDrop = useCallback((shouldSquish) => {
    const drop = dropRef.current;
    if (!drop) return;
    const opts = optionsRef.current;
    const idx = opts.findIndex((o) => o.id === valueRef.current);
    const btn = idx >= 0 ? btnRefs.current[idx] : null;
    if (!btn || btn.offsetWidth === 0) {
      drop.style.opacity = '0';
      return;
    }
    drop.style.opacity = '';
    drop.style.setProperty('--drop-x', `${btn.offsetLeft}px`);
    drop.style.setProperty('--drop-w', `${btn.offsetWidth}px`);

    if (!readyRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        readyRef.current = true;
        dropRef.current?.classList.add('ready');
      });
    } else if (shouldSquish) {
      drop.classList.remove('squish');
      void drop.offsetWidth;
      drop.classList.add('squish');
      clearTimeout(squishTimer.current);
      squishTimer.current = setTimeout(() => {
        dropRef.current?.classList.remove('squish');
      }, 180);
    }
  }, []);

  useEffect(() => {
    valueRef.current = value;
    optionsRef.current = options;
    const changed = prevValueRef.current !== value;
    prevValueRef.current = value;
    positionDrop(changed);
  }, [value, options, positionDrop]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const ro = new ResizeObserver(() => positionDrop(false));
    ro.observe(track);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      clearTimeout(squishTimer.current);
    };
  }, [positionDrop]);

  const activeIdx = options.findIndex((o) => o.id === value);

  const handleKeyDown = (e) => {
    if (!options.length) return;
    const cur = activeIdx >= 0 ? activeIdx : 0;
    let next = -1;
    if (e.key === 'ArrowRight') next = (cur + 1) % options.length;
    else if (e.key === 'ArrowLeft') next = (cur - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].id);
    btnRefs.current[next]?.focus();
  };

  return (
    <div className={compact ? 'segmented-wrap compact' : 'field'}>
      {label && !compact && !asTabs && (
        <div className="field-head"><span className="label">{label}</span></div>
      )}
      <div
        ref={trackRef}
        className={`seg${full ? ' full' : ''}${compact ? ' compact' : ''}`}
        role={asTabs ? 'tablist' : 'group'}
        aria-label={label || undefined}
        aria-describedby={hint ? hintId : undefined}
        onKeyDown={asTabs ? handleKeyDown : undefined}
      >
        <span ref={dropRef} className="seg-drop" aria-hidden="true" />
        {options.map((o, i) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              ref={(el) => { btnRefs.current[i] = el; }}
              type="button"
              id={asTabs && idPrefix ? `${idPrefix}-tab-${o.id}` : undefined}
              role={asTabs ? 'tab' : undefined}
              aria-selected={asTabs ? active : undefined}
              aria-pressed={asTabs ? undefined : active}
              tabIndex={asTabs ? (active || (activeIdx < 0 && i === 0) ? 0 : -1) : undefined}
              onClick={() => onChange(o.id)}
            >
              {o.name}
            </button>
          );
        })}
      </div>
      {hint && <p id={hintId} className="hint">{hint}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options, hint, inline = false }) {
  const id = useId();
  const hintId = useId();
  return (
    <div className={`field${inline ? ' field-inline' : ''}`}>
      <div className="field-head"><label htmlFor={id}>{label}</label></div>
      <select
        id={id}
        name={id}
        className="lg-select"
        value={value}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => {
          const o = options.find((x) => String(x.id) === e.target.value);
          onChange(o ? o.id : e.target.value);
        }}
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {hint && <p id={hintId} className="hint">{hint}</p>}
    </div>
  );
}

export function ColorField({ label, value, onChange }) {
  const id = useId();
  return (
    <div className="field field-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="color"
        className="lg-color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// band set: the bar is driven every frame by the render loop (see state/meters.js).
export function Meter({ label, value = 0, band, compact = false }) {
  const bar = useRef(null);
  const num = useRef(null);
  useEffect(() => {
    if (!band || !bar.current) return undefined;
    return registerMeter({
      band,
      bar: bar.current,
      num: compact ? { textContent: '' } : (num.current || { textContent: '' }),
    });
  }, [band, compact]);

  const clamped = Math.max(0, Math.min(1, value)).toFixed(3);
  if (compact) {
    return <i className="meter-bar" ref={bar} style={band ? undefined : { '--v': clamped }} />;
  }
  return (
    <>
      <span>{label}</span>
      <i className="meter-bar" ref={bar} style={band ? undefined : { '--v': clamped }} />
      <em ref={num}>{band ? '0' : Math.round(value * 100)}</em>
    </>
  );
}

// Tempo and beat of the bar, 1 to 4, filled in by the render loop (pushBeat).
// A click opens the beat view.
export function BeatView({ onClick, open, uiHandlers }) {
  const root = useRef(null);
  const bpm = useRef(null);
  const dots = useRef([]);
  useEffect(() => {
    if (!root.current) return undefined;
    return registerBeatView({
      root: root.current,
      bpm: bpm.current,
      dots: dots.current.slice(0, 4),
    });
  }, []);
  return (
    <LiquidGlass
      as="button"
      ref={root}
      className="beat-view"
      surface="clear"
      radius="pill"
      refract
      interactive
      pressed={open}
      onClick={onClick}
      aria-expanded={open}
      title="Tempo und Schlag im Takt, wie die App sie hört. Klicken für die Takt-Ansicht"
      {...uiHandlers}
    >
      <b ref={bpm}>–</b>
      <span className="beat-unit">BPM</span>
      <span className="beat-dots" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} ref={(el) => { dots.current[i] = el; }} className={i === 0 ? 'one' : undefined} />
        ))}
      </span>
    </LiquidGlass>
  );
}

// What the beat detection is doing right now, and buttons to correct it.
export function BeatPanel({ onClose, uiHandlers }) {
  const root = useRef(null);
  const bpm = useRef(null);
  const state = useRef(null);
  const est = useRef(null);
  const conf = useRef(null);
  const hold = useRef(null);
  const song = useRef(null);
  const dots = useRef([]);

  useEffect(() => {
    if (!root.current) return undefined;
    return registerBeatView({
      root: root.current,
      bpm: bpm.current,
      dots: dots.current.slice(0, 4),
      state: state.current,
      est: est.current,
      conf: conf.current,
      hold: hold.current,
      song: song.current,
    });
  }, []);

  return (
    <LiquidGlass
      as="section"
      ref={root}
      className="beat-panel"
      surface="clear"
      radius={24}
      refract
      aria-label="Takt-Ansicht"
      {...uiHandlers}
    >
      <header>
        <strong>Takt</strong>
        <button
          type="button"
          className="lg-btn round sm"
          onClick={onClose}
          aria-label="Takt-Ansicht schließen"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      <p className="beat-state" ref={state} role="status" />
      <div className="beat-big">
        <b ref={bpm}>–</b>
        <span className="beat-unit">BPM</span>
        <span className="beat-dots big" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} ref={(el) => { dots.current[i] = el; }} className={i === 0 ? 'one' : undefined} />
          ))}
        </span>
      </div>
      <dl className="beat-facts">
        <dt>Gerade gemessen</dt><dd ref={est}>–</dd>
        <dt>Sicherheit</dt><dd><i className="meter-bar" ref={conf} /></dd>
        <dt>Bass im Takt</dt><dd><i className="meter-bar" ref={hold} /></dd>
      </dl>
      <p className="beat-song" ref={song} />
      <div className="beat-actions">
        <button type="button" className="lg-btn sm" onClick={() => sendBeatCommand('reset')} title="Vergisst das Tempo und hört neu hin">Neu suchen</button>
        <button type="button" className="lg-btn sm" onClick={() => sendBeatCommand('half')} title="Wenn der Puls doppelt so schnell ist wie die Musik">Halbes Tempo</button>
        <button type="button" className="lg-btn sm" onClick={() => sendBeatCommand('double')} title="Wenn der Puls nur jeden zweiten Schlag kommt">Doppeltes Tempo</button>
        <button type="button" className="lg-btn sm" onClick={() => sendBeatCommand('one')} title="Im Moment des ersten Schlags im Takt drücken">Hier ist die 1</button>
      </div>
    </LiquidGlass>
  );
}
