// Drop-Reaktiv regression test: steady (even loud) music must NOT count as a drop;
// a real drop after a breakdown must trigger exactly one strobe burst.
import assert from 'node:assert';
import { calculateAudioPhysics } from '../src/utils/audioPhysics.js';

// Synthetic 120 BPM track: kick every 500ms, constant mids/highs. `bass=false` = breakdown without bass.
function frame(t, loud, bass = true) {
    const d = new Uint8Array(512);
    const beat = (t % 500) < 80;
    for (let i = 0; i < 512; i++) {
        const v = i < 8 ? (bass ? (beat ? 235 : 150) : 20) : i < 40 ? 170 : i < 150 ? 140 : 90;
        d[i] = Math.round(v * loud);
    }
    return d;
}

// segments: [seconds, loudness (0 = silence), bass]
function run(segments, sensitivity = 1.0) {
    let state = null, prev = null, t = 0, wasActive = false;
    const onsets = [];
    for (const [dur, loud, bass] of segments) {
        for (let f = 0; f < dur * 60; f++) {
            t += 16.67;
            const d = loud === 0 ? new Uint8Array(512) : frame(t, loud, bass);
            const r = calculateAudioPhysics({
                frequencyData: d, prevFrequencyData: prev, timestamp: t, sampleRate: 48000, fftSize: 1024,
                settings: { strobeEnabled: true, dropMode: 'Drop-Reaktiv', strobeSensitivity: sensitivity },
                prevState: state
            });
            state = r.state; prev = d;
            if (r.isStrobeActive && !wasActive) onsets.push(t / 1000);
            wasActive = r.isStrobeActive;
        }
    }
    return onsets;
}

for (const sens of [0.5, 1.0, 2.0]) {
    assert.deepStrictEqual(run([[40, 1.0, true]], sens), [], `steady loud music is not a drop (sens ${sens})`);
    assert.deepStrictEqual(run([[40, 0.75, true]], sens), [], `steady medium music is not a drop (sens ${sens})`);
    assert.deepStrictEqual(run([[5, 0, true], [30, 1.0, true]], sens), [], `song start after silence is not a drop (sens ${sens})`);
    const drop = run([[20, 0.8, true], [10, 0.6, false], [20, 1.0, true]], sens);
    assert.strictEqual(drop.length, 1, `breakdown -> drop triggers exactly one burst (sens ${sens}), got ${drop}`);
    assert.ok(drop[0] >= 30 && drop[0] < 31, `burst starts at the drop (sens ${sens}), got ${drop[0]}`);
}
console.log('✅ ALL DROP DETECTION TESTS PASSED');
