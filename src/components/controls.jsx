import { useEffect, useId, useRef } from 'react';
import { registerMeter, registerBeatView } from '../state/meters';

// Small form controls shared by the dock and the settings panel.

export function Range({ label, value, onChange, min, max, step = 0.05, format, hint }) {
  const id = useId();
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format ? format(value) : value}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Toggle({ label, value, onChange, hint, warn }) {
  const id = useId();
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <button id={id} type="button" role="switch" aria-checked={value} className={`switch${warn ? ' warn' : ''}`}
          onClick={() => onChange(!value)}>
          <span />
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Segmented({ label, value, onChange, options, hint, compact }) {
  return (
    <div className={compact ? 'segmented-wrap compact' : 'field'}>
      {label && !compact && <div className="field-head"><span className="label">{label}</span></div>}
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.name}</button>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options, hint }) {
  const id = useId();
  return (
    <div className="field">
      <div className="field-head"><label htmlFor={id}>{label}</label></div>
      <select id={id} value={value} onChange={(e) => {
        const o = options.find((x) => String(x.id) === e.target.value);
        onChange(o ? o.id : e.target.value);
      }}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function ColorField({ label, value, onChange }) {
  const id = useId();
  return (
    <div className="field field-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// band set: the bar is driven every frame by the render loop (see state/meters.js).
export function Meter({ label, value = 0, band }) {
  const bar = useRef(null);
  const num = useRef(null);
  useEffect(() => (band ? registerMeter({ band, bar: bar.current, num: num.current }) : undefined), [band]);
  return (
    <>
      <span>{label}</span>
      <i ref={bar} style={band ? undefined : { '--v': Math.max(0, Math.min(1, value)).toFixed(3) }} />
      <em ref={num}>{band ? '0' : Math.round(value * 100)}</em>
    </>
  );
}

// Tempo and beat of the bar, 1 to 4, filled in by the render loop (pushBeat).
export function BeatView() {
  const root = useRef(null);
  const bpm = useRef(null);
  const dots = useRef([]);
  useEffect(() => registerBeatView({ root: root.current, bpm: bpm.current, dots: dots.current }), []);
  return (
    <span className="beat-view" ref={root} title="Tempo und Schlag im Takt, wie die App sie hört">
      <b ref={bpm}>–</b> BPM
      <span className="beat-dots" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <i key={i} ref={(el) => { dots.current[i] = el; }} className={i === 0 ? 'one' : undefined} />)}
      </span>
    </span>
  );
}
