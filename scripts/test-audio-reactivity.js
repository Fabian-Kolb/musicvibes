import assert from 'node:assert';
import { calculateAudioPhysics, getBinRange } from '../src/utils/audioPhysics.js';

// --- CONFIGURATION & MOCK DATA SETUP ---
const sampleRate = 44100;
const fftSize = 1024;
const binCount = fftSize / 2; // 512 bins

// Calculate exact bin boundaries for 44.1kHz / 1024 FFT
const bassRange = getBinRange(20, 250, sampleRate, fftSize, binCount);
const midRange = getBinRange(250, 4000, sampleRate, fftSize, binCount);
const trebleRange = getBinRange(4000, 16000, sampleRate, fftSize, binCount);

console.log(' Frequency Bin Ranges Setup:');
console.log(`  Bass (20-250 Hz): Bins ${bassRange.startBin} to ${bassRange.endBin}`);
console.log(`  Mid (250-4000 Hz): Bins ${midRange.startBin} to ${midRange.endBin}`);
console.log(`  Treble (4000-16000 Hz): Bins ${trebleRange.startBin} to ${trebleRange.endBin}\n`);

// Profile 1: Heavy Bass track
const heavyBassData = new Uint8Array(binCount).fill(5);
for (let i = bassRange.startBin; i <= bassRange.endBin; i++) {
    heavyBassData[i] = 240;
}

// Profile 2: Heavy Treble track
const heavyTrebleData = new Uint8Array(binCount).fill(5);
for (let i = trebleRange.startBin; i <= trebleRange.endBin; i++) {
    heavyTrebleData[i] = 240;
}

// Profile 3: Quiet / Low Energy track
const quietData = new Uint8Array(binCount).fill(10);

// Standard baseline UI settings
const defaultSettings = {
    baseSpeed: 0,
    peakSpeed: 0,
    beatSensitivity: 0,
    speed: 0,
    sensitivity: 0,
    baseRadius: 0,
    shrinkSpeed: 0,
    bassImpact: 0,
    midImpact: 0,
    trebleImpact: 0,
    strobeEnabled: true,
    dropMode: 'Drop-Reaktiv',
    strobeTarget: 'background',
    strobeSensitivity: 1.0,
    strobeSpeed: 10
};

// Initial state for EMA calculations
const initialState = {
    avgBass: 0.1,
    avgMid: 0.1,
    avgTreble: 0.1
};

console.log('🧪 Running Smart Audio Reactivity Verification Tests...\n');

// 1. Calculate physics for Heavy Bass
const bassPhysics = calculateAudioPhysics({
    frequencyData: heavyBassData,
    sampleRate,
    fftSize,
    settings: defaultSettings,
    prevState: initialState
});

// 2. Calculate physics for Heavy Treble
const treblePhysics = calculateAudioPhysics({
    frequencyData: heavyTrebleData,
    sampleRate,
    fftSize,
    settings: defaultSettings,
    prevState: initialState
});

// 3. Calculate physics for Quiet Audio
const quietPhysics = calculateAudioPhysics({
    frequencyData: quietData,
    sampleRate,
    fftSize,
    settings: defaultSettings,
    prevState: initialState
});

// --- DETAILED METRICS LOGGING ---
console.log('📊 Physics Outputs Comparison:');
console.log('---------------------------------------------------------');
console.log(` Metric                   | Heavy Bass      | Heavy Treble`);
console.log('---------------------------------------------------------');
console.log(` Bass RMS                 | ${bassPhysics.bass.rms.toFixed(4)}         | ${treblePhysics.bass.rms.toFixed(4)}`);
console.log(` Treble RMS               | ${bassPhysics.treble.rms.toFixed(4)}         | ${treblePhysics.treble.rms.toFixed(4)}`);
console.log(` Scale Multiplier         | ${bassPhysics.scaleMultiplier.toFixed(4)}         | ${treblePhysics.scaleMultiplier.toFixed(4)}`);
console.log(` Blob Size Multiplier     | ${bassPhysics.blobSizeMultiplier.toFixed(4)}         | ${treblePhysics.blobSizeMultiplier.toFixed(4)}`);
console.log(` Viscosity                | ${bassPhysics.viscosity.toFixed(4)}         | ${treblePhysics.viscosity.toFixed(4)}`);
console.log(` Turbulence               | ${bassPhysics.turbulence.toFixed(4)}         | ${treblePhysics.turbulence.toFixed(4)}`);
console.log(` Turbulence Amplitude     | ${bassPhysics.turbulenceAmplitude.toFixed(4)}         | ${treblePhysics.turbulenceAmplitude.toFixed(4)}`);
console.log(` Speed                    | ${bassPhysics.speed.toFixed(4)}         | ${treblePhysics.speed.toFixed(4)}`);
console.log(` Background Pulse         | ${bassPhysics.backgroundPulse.toFixed(4)}         | ${treblePhysics.backgroundPulse.toFixed(4)}`);
console.log(` Strobe Active            | ${bassPhysics.isStrobeActive}            | ${treblePhysics.isStrobeActive}`);
console.log('---------------------------------------------------------\n');

// --- ASSERTIONS ---

// Test 1: Bass Scale / Particle Expansion > Treble Scale Expansion
console.log(`[Test 1] Volumetric Scale Expansion: Bass (${bassPhysics.scaleMultiplier.toFixed(3)}) vs Treble (${treblePhysics.scaleMultiplier.toFixed(3)})`);
assert(
    bassPhysics.scaleMultiplier > treblePhysics.scaleMultiplier * 1.5,
    `FAIL: Heavy Bass scaleMultiplier (${bassPhysics.scaleMultiplier}) should be at least 1.5x Heavy Treble scaleMultiplier (${treblePhysics.scaleMultiplier})`
);
assert(
    bassPhysics.blobSizeMultiplier > treblePhysics.blobSizeMultiplier * 1.5,
    `FAIL: Heavy Bass blobSizeMultiplier (${bassPhysics.blobSizeMultiplier}) should be at least 1.5x Heavy Treble blobSizeMultiplier (${treblePhysics.blobSizeMultiplier})`
);
console.log('  ✅ PASSED: Heavy Bass drives strong scale / volumetric particle expansion.\n');

// Test 2: Bass Viscosity < Treble Viscosity
console.log(`[Test 2] Fluid Viscosity: Bass (${bassPhysics.viscosity.toFixed(3)}) vs Treble (${treblePhysics.viscosity.toFixed(3)})`);
assert(
    bassPhysics.viscosity < treblePhysics.viscosity,
    `FAIL: Heavy Bass viscosity (${bassPhysics.viscosity}) should be less than Heavy Treble viscosity (${treblePhysics.viscosity})`
);
console.log('  ✅ PASSED: Heavy Bass produces lower viscosity (faster fluid flow) than Heavy Treble.\n');

// Test 3: Treble Turbulence > Bass Turbulence
console.log(`[Test 3] Surface Turbulence: Treble (${treblePhysics.turbulence.toFixed(4)}) vs Bass (${bassPhysics.turbulence.toFixed(4)})`);
assert(
    treblePhysics.turbulence > bassPhysics.turbulence,
    `FAIL: Heavy Treble turbulence (${treblePhysics.turbulence}) should be greater than Heavy Bass turbulence (${bassPhysics.turbulence})`
);
console.log('  ✅ PASSED: Heavy Treble drives significantly higher surface turbulence / distortion ripples.\n');

// Test 4: R2 Drop Reactive Energy Threshold Strobe Test
console.log(`[Test 4] Strobe Energy Threshold: Heavy Bass Strobe Active (${bassPhysics.isStrobeActive}) vs Quiet Strobe Active (${quietPhysics.isStrobeActive})`);
assert(
    bassPhysics.isStrobeActive === true,
    `FAIL: High energy heavy bass should activate strobe continuously during drop/chorus`
);
assert(
    quietPhysics.isStrobeActive === false,
    `FAIL: Quiet audio below threshold should NOT activate strobe`
);
console.log('  ✅ PASSED: Drop Reactive strobe mode functions correctly as an Energy Threshold (continuous during drops).\n');

// Test 5: R2 Strobe Target Configuration & Strobe Speed Propagation
console.log(`[Test 5] Strobe Target setting ('background' vs 'particles'): ${bassPhysics.strobeTarget}, Strobe Speed: ${bassPhysics.strobeSpeed}`);
assert(
    bassPhysics.strobeTarget === 'background',
    `FAIL: Default strobeTarget should be 'background'`
);
assert(
    bassPhysics.strobeSpeed === 10,
    `FAIL: Default strobeSpeed should be 10`
);
const particleTargetPhysics = calculateAudioPhysics({
    frequencyData: heavyBassData,
    sampleRate,
    fftSize,
    settings: { ...defaultSettings, strobeTarget: 'particles' },
    prevState: initialState
});
assert(
    particleTargetPhysics.strobeTarget === 'particles',
    `FAIL: Strobe target setting 'particles' should be preserved in physics calculations`
);
console.log('  ✅ PASSED: Strobe Target & Strobe Speed parameters are accurately preserved.\n');

// Test 6: R3 Frequency Sensitivity Rebalancing
console.log(`[Test 6] Frequency Impact Sensitivity Rebalancing`);
const boostedBassPhysics = calculateAudioPhysics({
    frequencyData: heavyBassData,
    sampleRate,
    fftSize,
    settings: { ...defaultSettings, bassImpact: 10 },
    prevState: initialState
});
const boostedMidPhysics = calculateAudioPhysics({
    frequencyData: heavyBassData,
    sampleRate,
    fftSize,
    settings: { ...defaultSettings, midImpact: 10 },
    prevState: initialState
});
const boostedTreblePhysics = calculateAudioPhysics({
    frequencyData: heavyTrebleData,
    sampleRate,
    fftSize,
    settings: { ...defaultSettings, trebleImpact: 10 },
    prevState: initialState
});

assert(
    boostedBassPhysics.lowFreqImpact > bassPhysics.lowFreqImpact,
    `FAIL: bassImpact knob should noticeably boost lowFreqImpact`
);
assert(
    boostedMidPhysics.midFreqImpact > bassPhysics.midFreqImpact,
    `FAIL: midImpact knob should noticeably boost midFreqImpact`
);
assert(
    boostedTreblePhysics.highFreqJitter > treblePhysics.highFreqJitter,
    `FAIL: trebleImpact knob should noticeably boost highFreqJitter`
);
console.log('  ✅ PASSED: bassImpact, midImpact, and trebleImpact knobs all produce strong, noticeable impacts.\n');

// Test 7: R4 Reactive Background Pulse
console.log(`[Test 7] Reactive Background Pulse: Bass (${bassPhysics.backgroundPulse.toFixed(3)}) vs Quiet (${quietPhysics.backgroundPulse.toFixed(3)})`);
assert(
    bassPhysics.backgroundPulse > quietPhysics.backgroundPulse,
    `FAIL: Heavy Bass backgroundPulse (${bassPhysics.backgroundPulse}) should be higher than Quiet backgroundPulse (${quietPhysics.backgroundPulse})`
);
console.log('  ✅ PASSED: Bass hits drive reactive background pulse in brightness and saturation.\n');

// Test 8: Particle Motion Speed Split (baseSpeed vs peakSpeed)
console.log(`[Test 8] Particle Motion Speed Split (baseSpeed vs peakSpeed)`);
const baseSpeedOnlyPhysics = calculateAudioPhysics({
    frequencyData: heavyBassData,
    sampleRate,
    fftSize,
    settings: { ...defaultSettings, baseSpeed: 5, peakSpeed: 0 },
    prevState: initialState
});
const peakSpeedOnlyPhysics = calculateAudioPhysics({
    frequencyData: heavyBassData,
    sampleRate,
    fftSize,
    settings: { ...defaultSettings, baseSpeed: 0, peakSpeed: 5 },
    prevState: initialState
});
assert(
    baseSpeedOnlyPhysics.baseSpeedMult > 1.0,
    `FAIL: baseSpeed knob should increase baseSpeedMult`
);
assert(
    peakSpeedOnlyPhysics.peakSpeedMult > 1.0,
    `FAIL: peakSpeed knob should increase peakSpeedMult`
);
assert(
    peakSpeedOnlyPhysics.speed > baseSpeedOnlyPhysics.speed,
    `FAIL: High energy audio with peakSpeed=5 should produce higher speed than baseSpeed=5 with peakSpeed=0`
);
console.log('  ✅ PASSED: Dual motion speed controls (baseSpeed & peakSpeed) function independently and correctly.\n');

// Test 9: Beat-Größenempfindlichkeit (beatSensitivity) Scaling
console.log(`[Test 9] Beat-Größenempfindlichkeit (beatSensitivity) Scaling`);
const lowBeatSensPhysics = calculateAudioPhysics({
    frequencyData: heavyBassData,
    sampleRate,
    fftSize,
    settings: { ...defaultSettings, beatSensitivity: -5 },
    prevState: initialState
});
const highBeatSensPhysics = calculateAudioPhysics({
    frequencyData: heavyBassData,
    sampleRate,
    fftSize,
    settings: { ...defaultSettings, beatSensitivity: 5 },
    prevState: initialState
});
assert(
    highBeatSensPhysics.beatSensMult > lowBeatSensPhysics.beatSensMult,
    `FAIL: beatSensitivity knob (+5) should produce higher beatSensMult than (-5)`
);
assert(
    highBeatSensPhysics.scaleMultiplier > lowBeatSensPhysics.scaleMultiplier * 1.5,
    `FAIL: high beatSensitivity should produce significantly larger scaleMultiplier on bass hits`
);
console.log('  ✅ PASSED: Beat-Größenempfindlichkeit controls volumetric scale expansion cleanly.\n');

console.log('🎉 ALL AUDIO REACTIVITY VERIFICATION TESTS PASSED CLEANLY (EXIT CODE 0)!');
