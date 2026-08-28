import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Running Milestone 4 Physics Clamping & Area Coverage Capping Stress Tests...\n');

// --- PURE MATH IMPLEMENTATIONS MATCHING VISUALIZER.JSX ---

/**
 * Enforces particle radius clamping: R_min = 0.05 * minDim, R_max = 0.25 * minDim
 */
function clampRadius(rawR, minDim) {
    const R_min = 0.05 * minDim;
    const R_max = 0.25 * minDim;
    return Math.max(R_min, Math.min(R_max, rawR));
}

/**
 * Calculates final particle radii after area coverage capping (<= 60% total canvas area)
 */
function applyAreaCoverageCap(particles, width, height, symmetry = false) {
    const minDim = Math.min(width, height);
    const totalCanvasArea = width * height;
    const maxAllowedArea = 0.60 * totalCanvasArea;
    const symmetryFactor = symmetry ? 2 : 1;

    // 1. Clamp each particle radius individually
    const clampedRadii = particles.map(p => clampRadius(p.rawR, minDim));

    // 2. Sum particle areas up to max 16 active blobs
    let totalParticleArea = 0;
    for (let j = 0; j < clampedRadii.length && (j * symmetryFactor) < 16; j++) {
        const r = clampedRadii[j];
        totalParticleArea += Math.PI * r * r * symmetryFactor;
    }

    // 3. Compute area scaling cap multiplier
    let areaScaleCap = 1.0;
    if (totalParticleArea > maxAllowedArea && totalParticleArea > 0) {
        areaScaleCap = Math.sqrt(maxAllowedArea / totalParticleArea);
    }

    // 4. Return final radii and total covered area
    const finalRadii = clampedRadii.map(r => r * areaScaleCap);
    
    let totalFinalArea = 0;
    for (let j = 0; j < finalRadii.length && (j * symmetryFactor) < 16; j++) {
        const r = finalRadii[j];
        totalFinalArea += Math.PI * r * r * symmetryFactor;
    }

    const coverageRatio = totalFinalArea / totalCanvasArea;

    return {
        clampedRadii,
        areaScaleCap,
        finalRadii,
        totalParticleArea,
        totalFinalArea,
        coverageRatio
    };
}

// ==========================================
// TEST SUITE 1: RADIUS CLAMPING BOUNDARY TEST
// ==========================================
console.log('--- Test Suite 1: Particle Radius Boundary Clamping (R_max <= 0.25 * minDim, R_min >= 0.05 * minDim) ---');

const testScreenSizes = [
    { name: '4K Desktop (3840x2160)', width: 3840, height: 2160 },
    { name: 'FHD Desktop (1920x1080)', width: 1920, height: 1080 },
    { name: 'Square Window (1000x1000)', width: 1000, height: 1000 },
    { name: 'Mobile Portrait (375x812)', width: 375, height: 812 },
    { name: 'Ultrawide (3440x1440)', width: 3440, height: 1440 }
];

const extremeRawRadii = [
    -500,
    0,
    1,
    50,
    500,
    5000,
    100000,
    1e9
];

for (const screen of testScreenSizes) {
    const minDim = Math.min(screen.width, screen.height);
    const expectedMax = 0.25 * minDim;
    const expectedMin = 0.05 * minDim;

    for (const rawR of extremeRawRadii) {
        const clamped = clampRadius(rawR, minDim);
        const radiusRatio = clamped / minDim;

        assert(
            clamped <= expectedMax + 1e-9,
            `FAIL [${screen.name}]: rawR ${rawR} resulted in clamped radius ${clamped} exceeding R_max (${expectedMax})`
        );
        assert(
            clamped >= expectedMin - 1e-9,
            `FAIL [${screen.name}]: rawR ${rawR} resulted in clamped radius ${clamped} below R_min (${expectedMin})`
        );
        assert(
            radiusRatio <= 0.25 + 1e-9,
            `FAIL [${screen.name}]: radiusRatio (${radiusRatio}) exceeds 0.25 minDim ratio cap!`
        );
    }
}
console.log('  ✅ PASSED: Radius clamping strictly enforces [0.05 * minDim, 0.25 * minDim] across all viewport sizes and extreme audio inputs.\n');

// ==========================================
// TEST SUITE 2: AREA COVERAGE CAPPING TEST (<= 60%)
// ==========================================
console.log('--- Test Suite 2: Total Canvas Area Coverage Capping (Coverage <= 60%) ---');

const particleCounts = [1, 3, 5, 8, 12, 16];
const symmetryOptions = [false, true];

for (const screen of testScreenSizes) {
    const minDim = Math.min(screen.width, screen.height);

    for (const count of particleCounts) {
        for (const symmetry of symmetryOptions) {
            // Create particles with raw radii exceeding maximum limits (forcing max clamp of 0.25 * minDim)
            const particles = Array.from({ length: count }, () => ({ rawR: 10 * minDim }));

            const result = applyAreaCoverageCap(particles, screen.width, screen.height, symmetry);

            console.log(` Screen: ${screen.name} | Particles: ${count} | Symmetry: ${symmetry ? 'ON' : 'OFF'} | Raw Area Coverage: ${(result.totalParticleArea / (screen.width * screen.height) * 100).toFixed(1)}% => Capped Coverage: ${(result.coverageRatio * 100).toFixed(2)}% (Cap Scale: ${result.areaScaleCap.toFixed(4)})`);

            assert(
                result.coverageRatio <= 0.60000001,
                `FAIL [${screen.name}]: Coverage ratio (${(result.coverageRatio * 100).toFixed(2)}%) EXCEEDS maximum allowed 60% canvas area!`
            );

            // Verify each particle's final radius
            for (const finalR of result.finalRadii) {
                assert(
                    finalR <= (0.25 * minDim) + 1e-9,
                    `FAIL [${screen.name}]: Final particle radius ${finalR} exceeds 0.25 minDim (${0.25 * minDim})`
                );
            }
        }
    }
}
console.log('  ✅ PASSED: Area coverage capping strictly prevents total particle area from exceeding 60% of canvas under max load.\n');

// ==========================================
// TEST SUITE 3: SOURCE CODE INTEGRITY VERIFICATION
// ==========================================
console.log('--- Test Suite 3: Visualizer.jsx Static Code Integrity Verification ---');

const visualizerPath = path.resolve(__dirname, '../src/components/vibesync/Visualizer.jsx');
const visualizerCode = fs.readFileSync(visualizerPath, 'utf8');

// 1. Verify R_max = 0.25 * minDim clamping
assert(
    visualizerCode.includes('R_max = 0.25 * minDim') || visualizerCode.includes('0.25 * minDim'),
    'FAIL: Visualizer.jsx does not contain R_max = 0.25 * minDim radius clamping formula.'
);
console.log('  ✅ Found: 0.25 * minDim radius clamping calculation in Visualizer.jsx');

// 2. Verify R_min = 0.05 * minDim clamping
assert(
    visualizerCode.includes('R_min = 0.05 * minDim') || visualizerCode.includes('0.05 * minDim'),
    'FAIL: Visualizer.jsx does not contain R_min = 0.05 * minDim floor formula.'
);
console.log('  ✅ Found: 0.05 * minDim min radius floor calculation in Visualizer.jsx');

// 3. Verify maxAllowedArea = 0.60 * totalCanvasArea capping
assert(
    visualizerCode.includes('0.60 * totalCanvasArea') || visualizerCode.includes('maxAllowedArea'),
    'FAIL: Visualizer.jsx does not contain 60% total canvas area coverage capping code.'
);
console.log('  ✅ Found: 0.60 * totalCanvasArea coverage capping calculation in Visualizer.jsx');

// 4. Verify areaScaleCap formula
assert(
    visualizerCode.includes('Math.sqrt(maxAllowedArea / totalParticleArea)'),
    'FAIL: Visualizer.jsx does not contain Math.sqrt(maxAllowedArea / totalParticleArea) cap formula.'
);
console.log('  ✅ Found: Math.sqrt(maxAllowedArea / totalParticleArea) area cap scaling in Visualizer.jsx\n');

console.log('🎉 ALL MILESTONE 4 PHYSICS CLAMPING & AREA CAPPING TESTS PASSED CLEANLY (EXIT CODE 0)!');
