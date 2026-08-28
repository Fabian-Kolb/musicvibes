import assert from 'node:assert';
import { calculateAudioPhysics, getBinRange } from '../src/utils/audioPhysics.js';

// --- CONFIGURATION & MOCK DATA SETUP ---
const sampleRate = 44100;
const fftSize = 1024;
const binCount = fftSize / 2; // 512 bins

const bassRange = getBinRange(20, 250, sampleRate, fftSize, binCount);

console.log('🧪 Running Strobe Drop Detection Tests (R2 Energy Threshold Mode)...\n');

// 1. Quiet Baseline State (Silence / Low Ambient Level)
const quietData = new Uint8Array(binCount).fill(4);

// 2. Heavy Bass Drop Attack (Bass bins set to 245)
const bassDropData = new Uint8Array(binCount).fill(4);
for (let i = bassRange.startBin; i <= bassRange.endBin; i++) {
    bassDropData[i] = 245;
}

// UI Settings
const testSettings = {
    strobeEnabled: true,
    dropMode: 'Drop-Reaktiv',
    strobeSensitivity: 1.0,
    strobeIntensity: 0.8,
    strobeSpeed: 10
};

// Phase 1: Establish Quiet Baseline over 20 frames
let state = null;
let quietPhysics = null;

for (let frame = 0; frame < 20; frame++) {
    quietPhysics = calculateAudioPhysics({
        frequencyData: quietData,
        sampleRate,
        fftSize,
        settings: testSettings,
        prevState: state
    });
    state = quietPhysics.state;
}

console.log(`[Phase 1] Quiet Baseline: Short Energy (${state.avgBassShort.toFixed(4)}), Long Energy (${state.avgBassLong.toFixed(4)}), Drop Ratio (${quietPhysics.dropRatio.toFixed(2)})`);
assert.strictEqual(quietPhysics.isDropTriggered, false, 'FAIL: Drop should NOT trigger during quiet baseline.');
console.log('  ✅ PASSED: Quiet baseline established without false positive drop trigger.\n');

// Phase 2: Transition to Sudden Bass Drop
console.log('⚡ Triggering Quiet-to-Bass-Drop Transition...');
const dropPhysics = calculateAudioPhysics({
    frequencyData: bassDropData,
    sampleRate,
    fftSize,
    settings: testSettings,
    prevState: state
});
state = dropPhysics.state;

console.log(`[Phase 2] Bass Drop Frame: Short Energy (${state.avgBassShort.toFixed(4)}), Long Energy (${state.avgBassLong.toFixed(4)}), Drop Ratio (${dropPhysics.dropRatio.toFixed(2)})`);

assert.strictEqual(dropPhysics.isDropTriggered, true, 'FAIL: Drop SHOULD trigger on quiet-to-bass-drop transition.');
assert.strictEqual(dropPhysics.strobeIntensity, 0.8, 'FAIL: strobeIntensity should equal setting value (0.8).');
assert.strictEqual(dropPhysics.strobeActiveIntensity, 0.8, 'FAIL: strobeActiveIntensity should equal setting value when drop is active.');
assert.strictEqual(dropPhysics.strobeSpeed, 10, 'FAIL: strobeSpeed output should equal setting value (10).');

console.log('  ✅ PASSED: Quiet-to-bass-drop transition correctly triggers isDropTriggered = true.\n');

// Phase 3: Verify Master Toggle Switch (strobeEnabled = false)
console.log('🛑 Testing Strobe Master Switch (strobeEnabled = false)...');
const disabledPhysics = calculateAudioPhysics({
    frequencyData: bassDropData,
    sampleRate,
    fftSize,
    settings: { ...testSettings, strobeEnabled: false },
    prevState: quietPhysics.state
});

assert.strictEqual(disabledPhysics.isDropTriggered, false, 'FAIL: isDropTriggered should be false when strobeEnabled = false.');
console.log('  ✅ PASSED: Strobe master switch correctly disables drop triggers.\n');

// Phase 4: True Drop Detection - Dynamic Bass Pulsing & Drop Stay-Active Test
console.log('🔄 Testing True Drop Detection: Drop triggers during dynamic drop hits & rhythmic bass peaks...');
let dropTriggerCount = 0;
for (let frame = 0; frame < 30; frame++) {
    // Simulate drop with periodic bass kick hits every 4 frames
    const frameData = (frame % 4 === 0) ? bassDropData : quietData;
    const contPhysics = calculateAudioPhysics({
        frequencyData: frameData,
        sampleRate,
        fftSize,
        settings: testSettings,
        prevState: state
    });
    state = contPhysics.state;
    if (contPhysics.isDropTriggered) dropTriggerCount++;
}

console.log(`[Phase 4] Dynamic Drop Phase: Drop Trigger Count (${dropTriggerCount}/30 frames)`);
assert(dropTriggerCount > 0, 'FAIL: Drop should trigger during dynamic bass hits during drop phase.');
console.log('  ✅ PASSED: True Drop Detection triggers reliably on dynamic high-energy drop hits.\n');

// Phase 5: Transition Back to Quiet Level (Energy Drops Below Threshold)
console.log('📉 Testing Transition back to Quiet Level (energy drops below threshold)...');
for (let frame = 0; frame < 20; frame++) {
    const quietTransPhysics = calculateAudioPhysics({
        frequencyData: quietData,
        sampleRate,
        fftSize,
        settings: testSettings,
        prevState: state
    });
    state = quietTransPhysics.state;
}

const postQuietPhysics = calculateAudioPhysics({
    frequencyData: quietData,
    sampleRate,
    fftSize,
    settings: testSettings,
    prevState: state
});

console.log(`[Phase 5] Post Drop Quiet Level: Energy Below Threshold, Strobe Active (${postQuietPhysics.isDropTriggered})`);
assert.strictEqual(postQuietPhysics.isDropTriggered, false, 'FAIL: Strobe should turn off when music energy falls below threshold.');
console.log('  ✅ PASSED: Strobe deactivates cleanly when music energy drops below threshold.\n');

console.log('🎉 ALL STROBE DROP DETECTION VERIFICATION TESTS PASSED CLEANLY (EXIT CODE 0)!');
