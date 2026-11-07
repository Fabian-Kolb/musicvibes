// Meters on screen are written straight into the page every frame, without React:
// the render loop calls pushMeters() 60 times per second, so the bars move with the
// sound instead of in 10 steps per second.
const meters = new Set();

export function registerMeter(m) {
  meters.add(m);
  return () => meters.delete(m);
}

export function pushMeters(values) {
  meters.forEach((m) => {
    const v = Math.max(0, Math.min(1, values[m.band] || 0));
    m.bar.style.setProperty('--v', v.toFixed(3));
    const text = String(Math.round(v * 100));
    if (m.num.textContent !== text) m.num.textContent = text;
  });
}

// Tempo and beat: the BPM badge in the HUD and the beat view (Takt-Ansicht), written
// every frame like the meters. Dimmed while the app hears no clear beat.
const beatViews = new Set();

export function registerBeatView(v) {
  beatViews.add(v);
  return () => beatViews.delete(v);
}

const STATE_TEXT = {
  search: 'Sucht den Takt …',
  locked: 'Takt gefunden',
  held: 'Takt gehalten, gerade kein Beat zu hören',
};

const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };

// beat: { bpm, est, state, locked, conf, hold, barBeat, event, song, remembered }
export function pushBeat(beat) {
  beatViews.forEach((v) => {
    setText(v.bpm, beat.locked ? String(Math.round(beat.bpm)) : '–');
    v.root.classList.toggle('locked', beat.locked);
    v.root.classList.toggle('held', beat.state === 'held');
    v.dots.forEach((d, i) => {
      d.classList.toggle('on', beat.locked && i === beat.barBeat);
      if (beat.event && beat.locked && i === beat.barBeat) {
        d.classList.remove('hit');
        void d.offsetWidth; // restart the flash
        d.classList.add('hit');
      }
    });
    if (!v.state) return;
    setText(v.state, STATE_TEXT[beat.state] || '');
    setText(v.est, beat.est ? `${beat.est.toFixed(1)} BPM` : '–');
    v.conf.style.setProperty('--v', Math.max(0, Math.min(1, beat.conf)).toFixed(3));
    v.hold.style.setProperty('--v', Math.max(0, Math.min(1, beat.hold)).toFixed(3));
    setText(v.song, beat.song ? `${beat.song}${beat.remembered ? ` · gemerkt: ${Math.round(beat.remembered)} BPM` : ''}` : 'Kein Lied erkannt (neues Lied = Pause oder Titelwechsel)');
  });
}

// Buttons in the beat view reach the engine in the render loop through this.
let beatHandler = null;
export function onBeatCommand(fn) {
  beatHandler = fn;
  return () => { if (beatHandler === fn) beatHandler = null; };
}
export const sendBeatCommand = (action) => { if (beatHandler) beatHandler(action); };
