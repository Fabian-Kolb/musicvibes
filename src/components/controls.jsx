import { useId } from 'react';

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

export function Meter({ label, value }) {
  return (
    <>
      <span>{label}</span>
      <i style={{ '--v': Math.max(0, Math.min(1, value)).toFixed(3) }} />
      <em>{Math.round(value * 100)}</em>
    </>
  );
}
