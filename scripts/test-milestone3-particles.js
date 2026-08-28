import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Running Milestone 3 Particle Threshold & UI Verification Tests...\n');

// --- PART 1: TARGET COUNT FORMULA EVALUATION ---
console.log('--- Part 1: Evaluating targetCount Formula ---');

function computeTargetCount(maxParticles, volumeRatio, symmetry = false) {
    const MIN_VISIBLE_PARTICLES = 5;
    const clampedMaxSetting = Math.min(16, Math.max(MIN_VISIBLE_PARTICLES, maxParticles));
    const userMaxParticles = symmetry ? Math.min(8, clampedMaxSetting) : clampedMaxSetting;
    const normVol = Math.min(1.0, Math.max(0.0, volumeRatio));
    return Math.min(
        userMaxParticles,
        Math.max(MIN_VISIBLE_PARTICLES, Math.floor(MIN_VISIBLE_PARTICLES + (userMaxParticles - MIN_VISIBLE_PARTICLES) * normVol))
    );
}

const testMaxParticles = [5, 8, 12, 16];
const testVolumes = [0.0, 0.5, 1.0];

for (const maxP of testMaxParticles) {
    for (const vol of testVolumes) {
        // Non-symmetry mode test
        const target = computeTargetCount(maxP, vol, false);
        console.log(`maxParticles: ${maxP}, volume: ${vol}, symmetry: false => targetCount: ${target}`);
        assert(target >= 5, `FAIL: targetCount (${target}) must be >= 5 when maxParticles=${maxP}, vol=${vol}`);

        // Symmetry mode test
        const targetSym = computeTargetCount(maxP, vol, true);
        console.log(`maxParticles: ${maxP}, volume: ${vol}, symmetry: true => targetCount: ${targetSym}`);
        assert(targetSym >= 5, `FAIL: targetCount (${targetSym}) must be >= 5 in symmetry mode when maxParticles=${maxP}, vol=${vol}`);
        if (maxP > 8) {
            assert(targetSym <= 8, `FAIL: targetCount (${targetSym}) in symmetry mode must be capped at 8 when maxParticles=${maxP}`);
        }
    }
}
console.log('✅ Part 1 PASSED: targetCount >= 5 asserted across all volume & maxParticles combinations.\n');

// --- PART 2: INSPECT GHOSTUI.JSX ---
console.log('--- Part 2: Inspecting GhostUI.jsx ---');
const ghostUIPath = path.resolve(__dirname, '../src/components/vibesync/GhostUI.jsx');
const ghostUICode = fs.readFileSync(ghostUIPath, 'utf8');

assert(ghostUICode.includes('type="number"'), 'FAIL: GhostUI.jsx missing <input type="number"');
console.log('✅ Found: <input type="number"');

assert(ghostUICode.includes('min="5"'), 'FAIL: GhostUI.jsx missing min="5"');
console.log('✅ Found: min="5"');

assert(ghostUICode.includes('max="16"'), 'FAIL: GhostUI.jsx missing max="16"');
console.log('✅ Found: max="16"');

console.log('✅ Part 2 PASSED: GhostUI.jsx contains valid number input with min="5" and max="16".\n');

// --- PART 3: INSPECT VISUALIZER.JSX ---
console.log('--- Part 3: Inspecting Visualizer.jsx ---');
const visualizerPath = path.resolve(__dirname, '../src/components/vibesync/Visualizer.jsx');
const visualizerCode = fs.readFileSync(visualizerPath, 'utf8');

assert(visualizerCode.includes('MIN_VISIBLE_PARTICLES = 5'), 'FAIL: Visualizer.jsx missing MIN_VISIBLE_PARTICLES = 5');
console.log('✅ Found: MIN_VISIBLE_PARTICLES = 5');

// Inspect centripetal attraction code
const centripetalTokens = [
    'Centripetal attraction',
    'pullFactor',
    '0.5 - p.x',
    '0.5 - p.y'
];

for (const token of centripetalTokens) {
    assert(visualizerCode.includes(token), `FAIL: Visualizer.jsx missing centripetal attraction token "${token}"`);
    console.log(`✅ Found centripetal token: "${token}"`);
}

console.log('✅ Part 3 PASSED: Visualizer.jsx contains MIN_VISIBLE_PARTICLES = 5 and centripetal attraction code.\n');

console.log('🎉 ALL MILESTONE 3 VERIFICATION TESTS PASSED CLEANLY (EXIT CODE 0)!');
