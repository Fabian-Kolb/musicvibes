import { calculateAudioPhysics, processFrequencyBands, mapSetting } from '../src/utils/audioPhysics.js';

console.log('🧪 Running Challenger Edge-Case Empirical Stress Tests...\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASSED: ${message}`);
        passedTests++;
    } else {
        console.error(`  ❌ FAILED: ${message}`);
        failedTests++;
    }
}

// -------------------------------------------------------------
// TEST 1: Particle Floor Enforcement when maxParticles is 0 or 1
// -------------------------------------------------------------
console.log('--- Test Group 1: maxParticles Floor Enforcement (0 or 1) ---');
const MIN_VISIBLE_PARTICLES = 5;

function computeTargetCount(maxParticlesSetting, symmetry, volumeRatio) {
    const safeSettings = { maxParticles: maxParticlesSetting, symmetry };
    const userSettingVal = safeSettings.maxParticles !== undefined ? safeSettings.maxParticles : 12;
    const clampedMaxSetting = Math.min(16, Math.max(MIN_VISIBLE_PARTICLES, userSettingVal));
    const userMaxParticles = safeSettings.symmetry ? Math.min(8, clampedMaxSetting) : clampedMaxSetting;
    const volRatio = Math.min(1.0, Math.max(0.0, volumeRatio));

    return Math.min(
        userMaxParticles,
        Math.max(MIN_VISIBLE_PARTICLES, Math.floor(MIN_VISIBLE_PARTICLES + (userMaxParticles - MIN_VISIBLE_PARTICLES) * volRatio))
    );
}

// Test with maxParticles = 0
const targetCount0_lowVol = computeTargetCount(0, false, 0.0);
const targetCount0_highVol = computeTargetCount(0, false, 1.0);
assert(targetCount0_lowVol >= 5, `maxParticles=0 at 0% volume gives targetCount = ${targetCount0_lowVol} (>= 5)`);
assert(targetCount0_highVol >= 5, `maxParticles=0 at 100% volume gives targetCount = ${targetCount0_highVol} (>= 5)`);

// Test with maxParticles = 1
const targetCount1_lowVol = computeTargetCount(1, false, 0.0);
const targetCount1_highVol = computeTargetCount(1, false, 1.0);
assert(targetCount1_lowVol >= 5, `maxParticles=1 at 0% volume gives targetCount = ${targetCount1_lowVol} (>= 5)`);
assert(targetCount1_highVol >= 5, `maxParticles=1 at 100% volume gives targetCount = ${targetCount1_highVol} (>= 5)`);

// Test with maxParticles = -10
const targetCountNeg_lowVol = computeTargetCount(-10, false, 0.0);
assert(targetCountNeg_lowVol >= 5, `maxParticles=-10 gives targetCount = ${targetCountNeg_lowVol} (>= 5)`);

// -------------------------------------------------------------
// TEST 2: Extreme FFT Values (all 0s, all 255s)
// -------------------------------------------------------------
console.log('\n--- Test Group 2: Extreme FFT Values (all 0s, all 255s) ---');

const zeroFft = new Uint8Array(512).fill(0);
const maxFft = new Uint8Array(512).fill(255);

// All 0s
const physicsZero = calculateAudioPhysics({ frequencyData: zeroFft });
const zeroValuesValid = Object.values(physicsZero).every(v => {
    if (typeof v === 'number') return Number.isFinite(v) && !Number.isNaN(v);
    return true;
});
assert(zeroValuesValid, 'All 0s FFT produces valid non-NaN finite numbers for all physics parameters');
assert(physicsZero.totalRMS === 0, `All 0s FFT gives totalRMS = ${physicsZero.totalRMS}`);
assert(physicsZero.viscosity >= 0.15 && physicsZero.viscosity <= 3.0, `All 0s FFT viscosity = ${physicsZero.viscosity} (clamped within [0.15, 3.0])`);
assert(physicsZero.isStrobeActive === false, 'All 0s FFT results in isStrobeActive = false');

// All 255s (Quiet-to-Drop transition)
const quietState = { avgBass: 0.05, avgMid: 0.05, avgTreble: 0.05, avgBassShort: 0.05, avgBassLong: 0.05, avgRMSLong: 0.05 };
const physicsMax = calculateAudioPhysics({ frequencyData: maxFft, prevState: quietState });
const maxValuesValid = Object.values(physicsMax).every(v => {
    if (typeof v === 'number') return Number.isFinite(v) && !Number.isNaN(v);
    return true;
});
assert(maxValuesValid, 'All 255s FFT produces valid non-NaN finite numbers for all physics parameters');
assert(physicsMax.totalRMS === 1.0, `All 255s FFT gives totalRMS = ${physicsMax.totalRMS}`);
assert(physicsMax.viscosity >= 0.15 && physicsMax.viscosity <= 3.0, `All 255s FFT viscosity = ${physicsMax.viscosity} (clamped within [0.15, 3.0])`);
assert(physicsMax.isStrobeActive === true, 'All 255s FFT results in isStrobeActive = true');

// -------------------------------------------------------------
// TEST 3: Strobe Threshold Boundary Values (0.0, 1.0)
// -------------------------------------------------------------
console.log('\n--- Test Group 3: Strobe Threshold Boundary Values (0.0, 1.0) ---');

// Moderate energy test data (RMS = 0.5)
const midFft = new Uint8Array(512).fill(128);

// Threshold = 0.0
// Note: In audioPhysics.js: safeSettings.strobeThreshold > 0.
// When set to 0.0, 0.0 > 0 is false, so it uses fallback Math.max(0.12, 0.40 / Math.max(0.1, sensitivity))
const physicsStrobe0 = calculateAudioPhysics({
    frequencyData: midFft,
    settings: { strobeThreshold: 0.0 }
});
assert(Number.isFinite(physicsStrobe0.strobeThreshold) && physicsStrobe0.strobeThreshold > 0,
    `strobeThreshold = 0.0 falls back safely to default minimum threshold (${physicsStrobe0.strobeThreshold.toFixed(4)})`);

// Threshold = 1.0
// Requires currentMusicEnergy >= 1.0 to trigger strobe via energy threshold
const physicsStrobe1_mid = calculateAudioPhysics({
    frequencyData: midFft,
    settings: { strobeThreshold: 1.0, dropMode: 'Drop-Reaktiv' }
});
assert(physicsStrobe1_mid.strobeThreshold === 1.0, `strobeThreshold = 1.0 is preserved exactly`);
assert(physicsStrobe1_mid.isStrobeActive === false, `strobeThreshold = 1.0 with mid energy (0.50) yields isStrobeActive = false`);

const physicsStrobe1_max = calculateAudioPhysics({
    frequencyData: maxFft,
    settings: { strobeThreshold: 1.0, dropMode: 'Drop-Reaktiv' },
    prevState: quietState
});
assert(physicsStrobe1_max.isStrobeActive === true, `strobeThreshold = 1.0 with max energy (1.00) yields isStrobeActive = true`);

// -------------------------------------------------------------
// TEST 4: Smooth Color Blending Equations & Zero Divide Prevention
// -------------------------------------------------------------
console.log('\n--- Test Group 4: Smooth Color Blending & Division by Zero Checks ---');

// 1. Fragment shader weight sum division guard check
// Equation in shader: vec3 blobColor = (weightSum > eps) ? (weightedColorSum / weightSum) : finalBg;
// Verify eps = 0.0001 prevents div-by-zero when weightSum is 0 or extremely small.
function simulateShaderColorBlend(weightedColorSum, weightSum, finalBg = [0.1, 0.1, 0.15]) {
    const eps = 0.0001;
    if (weightSum > eps) {
        return [
            weightedColorSum[0] / weightSum,
            weightedColorSum[1] / weightSum,
            weightedColorSum[2] / weightSum
        ];
    }
    return finalBg;
}

const blendOutsideMetaballs = simulateShaderColorBlend([0, 0, 0], 0.0);
assert(!blendOutsideMetaballs.some(Number.isNaN), 'Zero weightSum outside metaballs returns finalBg safely without NaN');

const blendNearZeroWeight = simulateShaderColorBlend([0.00001, 0.00001, 0.00001], 0.00005);
assert(!blendNearZeroWeight.some(Number.isNaN), 'weightSum below eps (0.00005) returns finalBg safely without NaN');

const blendValidMetaball = simulateShaderColorBlend([0.8, 0.4, 0.2], 1.0);
assert(blendValidMetaball[0] === 0.8 && blendValidMetaball[1] === 0.4 && blendValidMetaball[2] === 0.2, 'Valid weightSum produces correct weighted color');

// 2. Viscosity density factor guard check
// Shader: float densityFactor = 1.2 / max(u_viscosity, 0.2);
function simulateDensityFactor(viscosity) {
    return 1.2 / Math.max(viscosity, 0.2);
}
assert(Number.isFinite(simulateDensityFactor(0.0)), 'viscosity = 0.0 produces finite densityFactor (6.0) without div-by-zero');
assert(Number.isFinite(simulateDensityFactor(-5.0)), 'viscosity = -5.0 produces finite densityFactor (6.0) without div-by-zero');

// 3. Blob distance normalization guard check
// Shader: float normDist = dist / (radius * sqrt(intensity));
// where radius = max(blob.z, 1.0), intensity = max(blob.w, 0.1)
function simulateNormDist(dist, rawRadius, rawIntensity) {
    const radius = Math.max(rawRadius, 1.0);
    const intensity = Math.max(rawIntensity, 0.1);
    return dist / (radius * Math.sqrt(intensity));
}
assert(Number.isFinite(simulateNormDist(10, 0, 0)), 'radius=0, intensity=0 produces finite normDist without div-by-zero');

// Summary
console.log('\n=========================================================');
console.log(`📊 STRESS TEST SUMMARY: Total: ${passedTests + failedTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('=========================================================\n');

if (failedTests > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
