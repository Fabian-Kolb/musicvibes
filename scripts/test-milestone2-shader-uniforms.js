import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const visualizerPath = path.resolve(__dirname, '../src/components/vibesync/Visualizer.jsx');
const code = fs.readFileSync(visualizerPath, 'utf8');

console.log('🧪 Testing Visualizer.jsx shader definitions and 2D soft-edge metaball compliance...\n');

// Requirement checks
const requiredTokens = ['u_audioRMS', 'u_bassPeak', 'w = falloff * falloff'];
const forbiddenTokens = ['dFdx', 'dFdy', 'spec', 'rim'];

for (const token of requiredTokens) {
    const included = code.includes(token);
    console.log(`Checking required token "${token}": ${included ? '✅ FOUND' : '❌ MISSING'}`);
    assert(included, `Shader source must include required token: ${token}`);
}

for (const token of forbiddenTokens) {
    const regex = new RegExp(`\\b${token}\\b`, 'i');
    const hasForbidden = regex.test(code);
    console.log(`Checking forbidden token "${token}": ${hasForbidden ? '❌ FOUND (Forbidden)' : '✅ ABSENT'}`);
    assert(!hasForbidden, `Shader source must contain ZERO references to forbidden token: ${token}`);
}

console.log('\n🎉 ALL SHADER UNIFORM AND 2D METABALL COMPLIANCE TESTS PASSED CLEANLY (EXIT CODE 0)!');
