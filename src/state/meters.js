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
