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

// Tempo and beat counter: BPM and four dots, the current beat of the bar lit, written
// every frame like the meters. Dimmed while the app hears no clear beat.
const beatViews = new Set();

export function registerBeatView(v) {
  beatViews.add(v);
  return () => beatViews.delete(v);
}

// beat: { bpm, locked, barBeat, event }
export function pushBeat(beat) {
  beatViews.forEach((v) => {
    const text = beat.locked ? String(Math.round(beat.bpm)) : '–';
    if (v.bpm.textContent !== text) v.bpm.textContent = text;
    v.root.classList.toggle('locked', beat.locked);
    v.dots.forEach((d, i) => {
      d.classList.toggle('on', beat.locked && i === beat.barBeat);
      if (beat.event && beat.locked && i === beat.barBeat) {
        d.classList.remove('hit');
        void d.offsetWidth; // restart the flash
        d.classList.add('hit');
      }
    });
  });
}
