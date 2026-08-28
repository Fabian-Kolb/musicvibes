import assert from 'node:assert';
import { calculateAudioPhysics, processFrequencyBands, computeSpectralCentroid, computeSpectralFlux, getBinRange } from '../src/utils/audioPhysics.js';

console.log('🧪 Running Phase 1: 7-Band, Spectral Flux & BPM-Tracking Verification Tests...\n');

const sampleRate = 44100;
const fftSize = 1024;
const binCount = fftSize / 2; // 512 bins

// ------------------------------------------------------------------
// TEST 1: 7-Band Frequency Decomposition
// ------------------------------------------------------------------
console.log('--- Test 1: 7-Band Frequency Decomposition ---');

const subBassRange = getBinRange(20, 60, sampleRate, fftSize, binCount);
const kickRange = getBinRange(60, 180, sampleRate, fftSize, binCount);
const presenceRange = getBinRange(2000, 6000, sampleRate, fftSize, binCount);
const brillianceRange = getBinRange(6000, 12000, sampleRate, fftSize, binCount);

// Generate synthetic Kick Drum (80 Hz tone)
const kickOnlyData = new Uint8Array(binCount).fill(0);
for (let i = kickRange.startBin; i <= kickRange.endBin; i++) {
    kickOnlyData[i] = 230;
}

const kickBands = processFrequencyBands(kickOnlyData, { sampleRate, fftSize });
assert(kickBands.bands7, 'bands7 object must exist in processFrequencyBands return');
assert(kickBands.bands7.kick.rms > 0.8, `Kick band RMS should be high (> 0.8), got: ${kickBands.bands7.kick.rms.toFixed(3)}`);
assert(kickBands.bands7.presence.rms < 0.05, `Presence band RMS should be near zero, got: ${kickBands.bands7.presence.rms.toFixed(3)}`);
console.log('  ✅ PASSED: 7-Band frequency decomposition isolates kick-drum cleanly.\n');

// ------------------------------------------------------------------
// TEST 2: Spectral Flux Onset Detection (Kick & Snare Hits)
// ------------------------------------------------------------------
console.log('--- Test 2: Spectral Flux Onset Detection ---');

const quietFrame = new Uint8Array(binCount).fill(10);
const kickHitFrame = new Uint8Array(binCount).fill(10);
for (let i = kickRange.startBin; i <= kickRange.endBin; i++) {
    kickHitFrame[i] = 240;
}

// 1. Initial quiet frame
const p0 = calculateAudioPhysics({
    frequencyData: quietFrame,
    timestamp: 1000,
    sampleRate,
    fftSize
});
assert(p0.beatPunch < 0.2, `Quiet frame beatPunch should be low, got: ${p0.beatPunch.toFixed(3)}`);

// 2. Sudden kick onset frame
const p1 = calculateAudioPhysics({
    frequencyData: kickHitFrame,
    prevFrequencyData: quietFrame,
    timestamp: 1050,
    sampleRate,
    fftSize,
    prevState: p0.state
});
assert(p1.beatPunch > 0.5, `Kick onset frame must trigger high beatPunch (> 0.5), got: ${p1.beatPunch.toFixed(3)}`);

// 3. Sustained kick frame (no positive onset change)
const p2 = calculateAudioPhysics({
    frequencyData: kickHitFrame,
    prevFrequencyData: kickHitFrame,
    timestamp: 1100,
    sampleRate,
    fftSize,
    prevState: p1.state
});
assert(p2.beatPunch < p1.beatPunch, `Sustained kick frame must decay beatPunch, got: ${p2.beatPunch.toFixed(3)} < ${p1.beatPunch.toFixed(3)}`);
console.log('  ✅ PASSED: Spectral Flux cleanly detects sharp attack and decays on sustained tones.\n');

// ------------------------------------------------------------------
// TEST 3: Spectral Centroid (Timbral Brightness Center)
// ------------------------------------------------------------------
console.log('--- Test 3: Spectral Centroid & Timbral Brightness ---');

const darkBassSound = new Uint8Array(binCount).fill(0);
for (let i = subBassRange.startBin; i <= kickRange.endBin; i++) darkBassSound[i] = 200;

const brightTrebleSound = new Uint8Array(binCount).fill(0);
for (let i = brillianceRange.startBin; i <= brillianceRange.endBin; i++) brightTrebleSound[i] = 200;

const bassCentroid = computeSpectralCentroid(darkBassSound, sampleRate, fftSize);
const trebleCentroid = computeSpectralCentroid(brightTrebleSound, sampleRate, fftSize);

assert(bassCentroid < 0.15, `Dark bass centroid should be < 0.15, got: ${bassCentroid.toFixed(3)}`);
assert(trebleCentroid > 0.50, `Bright treble centroid should be > 0.50, got: ${trebleCentroid.toFixed(3)}`);
assert(trebleCentroid > bassCentroid * 3.0, 'Treble centroid should be significantly higher than bass centroid');
console.log(`  ✅ PASSED: Spectral Centroid accurately captures timbral brightness (Bass: ${bassCentroid.toFixed(3)} vs Treble: ${trebleCentroid.toFixed(3)}).\n`);

// ------------------------------------------------------------------
// TEST 4: Real-time BPM Estimator (120 BPM & 80 BPM synthetic streams)
// ------------------------------------------------------------------
console.log('--- Test 4: Real-time BPM Estimator ---');

// Test A: 120 BPM (500ms intervals)
let state = null;
let curTime = 2000;
const bpm120Interval = 500; // ms

for (let beat = 0; beat < 8; beat++) {
    // 1. Kick Hit Frame
    const physHit = calculateAudioPhysics({
        frequencyData: kickHitFrame,
        prevFrequencyData: quietFrame,
        timestamp: curTime,
        sampleRate,
        fftSize,
        prevState: state
    });
    state = physHit.state;
    curTime += 40;

    // 2. Trailing quiet frames between beats
    for (let sub = 0; sub < 5; sub++) {
        const physQuiet = calculateAudioPhysics({
            frequencyData: quietFrame,
            prevFrequencyData: quietFrame,
            timestamp: curTime,
            sampleRate,
            fftSize,
            prevState: state
        });
        state = physQuiet.state;
        curTime += (bpm120Interval - 40) / 5;
    }
}

console.log(`  Estimated BPM for 120 BPM pulse stream: ${state.estimatedBPM.toFixed(1)} BPM (Confidence: ${state.tempoConfidence.toFixed(2)})`);
assert(
    state.estimatedBPM >= 115 && state.estimatedBPM <= 125,
    `FAIL: Estimated BPM for 120 BPM stream should be between 115 and 125, got: ${state.estimatedBPM.toFixed(1)}`
);
assert(state.tempoConfidence > 0.6, `Tempo confidence should be > 0.6, got: ${state.tempoConfidence.toFixed(2)}`);
console.log('  ✅ PASSED: 120 BPM stream detected with high accuracy and confidence.\n');

// ------------------------------------------------------------------
// TEST 5: Tempo-Adaptive Viscosity (Fast vs Slow Songs)
// ------------------------------------------------------------------
console.log('--- Test 5: Tempo-Adaptive Viscosity ---');

// Calculate physics for 80 BPM track vs 160 BPM track
const slowSongPhysics = calculateAudioPhysics({
    frequencyData: kickHitFrame,
    timestamp: 5000,
    prevState: { estimatedBPM: 75, avgBass: 0.5, avgMid: 0.2, avgTreble: 0.2 }
});

const fastSongPhysics = calculateAudioPhysics({
    frequencyData: kickHitFrame,
    timestamp: 5000,
    prevState: { estimatedBPM: 160, avgBass: 0.5, avgMid: 0.2, avgTreble: 0.2 }
});

console.log(`  Slow Song Viscosity (75 BPM): ${slowSongPhysics.viscosity.toFixed(3)}`);
console.log(`  Fast Song Viscosity (160 BPM): ${fastSongPhysics.viscosity.toFixed(3)}`);

assert(
    slowSongPhysics.viscosity > fastSongPhysics.viscosity,
    `FAIL: Slow song viscosity (${slowSongPhysics.viscosity}) should be higher than fast song viscosity (${fastSongPhysics.viscosity})`
);
console.log('  ✅ PASSED: Tempo-adaptive viscosity makes slow songs flow majestically and fast songs agile.\n');

console.log('🎉 ALL PHASE 1 AUDIO-DSP & BPM TESTS PASSED CLEANLY (EXIT CODE 0)!');
