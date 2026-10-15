import { useEffect, useRef } from 'react';
import { createEngine, resetEngine, updateEngine, moodOf } from '../engine/audioEngine';
import { createRenderer } from '../render/renderer';
import { computeFrame, createVisualState } from '../render/frame';
import { read, sourceVersion, currentSource } from '../audio/controller';
import { settingsStore, liveStore } from '../state/store';
import { PALETTES } from '../state/palettes';
import { STYLES } from '../state/settings';

const QUALITY_SCALE = { high: 1, medium: 0.6, low: 0.4 };

function nextOf(list, cur, shuffle) {
  const i = list.indexOf(cur);
  if (!shuffle || list.length < 2) return list[(i + 1) % list.length];
  let j = i;
  while (j === i) j = Math.floor(Math.random() * list.length);
  return list[j];
}

// Automatic palette or style change on drops and/or on a timer (like preset
// auto-switching in MilkDrop).
function autoSwitch(S) {
  const patch = {};
  if (S.autoSwitch === 'palette' || S.autoSwitch === 'both') {
    patch.palette = nextOf(PALETTES.map((p) => p.id), S.palette, S.shuffle);
  }
  if (S.autoSwitch === 'style' || S.autoSwitch === 'both') {
    patch.style = nextOf(STYLES.map((s) => s.id), S.style, S.shuffle);
  }
  settingsStore.set(patch);
}

export default function Visualizer() {
  const canvasRef = useRef(null);
  const noGlRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let renderer;
    try {
      renderer = createRenderer(canvas);
    } catch (err) {
      console.error(err);
    }
    if (!renderer) { noGlRef.current.hidden = false; return undefined; }

    const E = createEngine();
    const V = createVisualState();
    const opts = { weights: [1, 1, 1] };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delayed = [];
    let seenVersion = -1;
    let raf = 0;
    let last = performance.now();
    let scale = 0.6, frameEma = 1 / 60, lastQCheck = 0;
    let lastSwitch = last / 1000;
    let hudT = 0, frames = 0, fpsT = 0, fps = 0;
    let section = '';

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const S = settingsStore.get();
      if (S.fpsLimit > 0 && now - last < 1000 / S.fpsLimit - 2) return;
      const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
      last = now;

      if (sourceVersion() !== seenVersion) {
        seenVersion = sourceVersion();
        resetEngine(E, currentSource() === 'demo' ? 0.05 : 0.002);
      }

      // Bluetooth speakers play late; holding the analysis back keeps picture and sound together.
      let raw = read(dt, S.demoGenre);
      if (S.latency > 0) {
        delayed.push({ t: now, raw });
        raw = null;
        while (delayed.length && delayed[0].t <= now - S.latency) raw = delayed.shift().raw;
        if (!raw) raw = { bass: 0, mid: 0, high: 0, section };
      } else if (delayed.length) {
        delayed.length = 0;
      }
      section = raw.section || '';
      window.__vibsync.raw = raw;

      opts.autoGain = S.autoGain;
      opts.agcTime = S.agcTime;
      opts.gain = S.gain;
      opts.floor = Math.pow(10, S.noiseFloor / 20);
      opts.smoothing = S.smoothing;
      opts.kickSensitivity = S.kickSensitivity;
      opts.dropSensitivity = S.dropSensitivity;
      opts.dropDetection = S.dropDetection;
      updateEngine(E, raw, dt, opts);

      if (S.autoSwitch !== 'off') {
        const t = now / 1000;
        const byDrop = S.autoTrigger !== 'timer' && E.dropEvent;
        const byTimer = S.autoTrigger !== 'drop' && t - lastSwitch > S.autoInterval * 60;
        if (byDrop || byTimer) { autoSwitch(S); lastSwitch = t; }
      }

      const P = computeFrame(E, V, settingsStore.get(), dt, { reduceMotion });

      // Resolution: fixed by the setting, or adjusted to hold the frame rate.
      frameEma = frameEma * 0.95 + dt * 0.05;
      if (S.quality === 'auto') {
        if (now - lastQCheck > 1500) {
          lastQCheck = now;
          const budget = S.fpsLimit > 0 ? 1 / S.fpsLimit : 1 / 60;
          // Glass has fine highlights that turn blocky below half resolution.
          const minScale = S.style === 'glass' ? 0.5 : 0.35;
          if (frameEma > budget * 1.33 && scale > minScale) scale -= 0.05;
          else if (scale < minScale) scale = minScale;
          else if (frameEma < budget * 1.05 && scale < 0.75) scale += 0.05;
        }
      } else {
        scale = QUALITY_SCALE[S.quality] || 0.6;
      }
      renderer.resize(scale);
      renderer.render(P);

      frames += 1;
      fpsT += dt;
      if (fpsT >= 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
      hudT += dt;
      if (hudT > 0.1) {
        hudT = 0;
        liveStore.set({
          bass: E.bass, mid: E.mid, high: E.high, drive: E.drive, mood: moodOf(E.drive),
          drop: S.dropDetection && E.dropHold > 0, silent: E.silent, fps, section, scale,
        });
      }
    }
    raf = requestAnimationFrame(frame);
    // For diagnosis from the developer tools (Ctrl+Shift+I): engine and visual state.
    window.__vibsync = { E, V, raw: null };
    return () => {
      cancelAnimationFrame(raf);
      renderer.destroy();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="stage" aria-label="Fließende Farben, die auf die Musik reagieren" />
      <div ref={noGlRef} className="nogl" hidden>
        Deine Grafikkarte oder dein Browser stellt kein WebGL2 bereit. Aktualisiere den Grafiktreiber oder nimm Chrome bzw. Edge.
      </div>
    </>
  );
}
