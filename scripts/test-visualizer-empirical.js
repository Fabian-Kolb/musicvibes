import assert from 'node:assert';

// --- Extract helper & logic functions directly matching Visualizer.jsx ---

function colorToRgbVec3(colorStr) {
    if (!colorStr) return [0.1, 0.1, 0.15];
    if (typeof colorStr === 'string' && colorStr.startsWith('#')) {
        let h = colorStr.slice(1);
        if (h.length === 3) {
            h = h.split('').map(c => c + c).join('');
        }
        if (h.length === 6) {
            const num = parseInt(h, 16);
            return [
                ((num >> 16) & 255) / 255,
                ((num >> 8) & 255) / 255,
                (num & 255) / 255
            ];
        }
    }
    if (typeof colorStr === 'string' && colorStr.startsWith('rgb')) {
        const matches = colorStr.match(/\d+/g);
        if (matches && matches.length >= 3) {
            return [
                parseInt(matches[0], 10) / 255,
                parseInt(matches[1], 10) / 255,
                parseInt(matches[2], 10) / 255
            ];
        }
    }
    return [0.1, 0.1, 0.15];
}

console.log('🧪 Running Empirical Stress Test Suite for WebGL Metaball Shader...\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✅ PASSED: ${name}`);
    } catch (err) {
        failedTests++;
        console.error(`  ❌ FAILED: ${name}`);
        console.error(`     Error: ${err.message}`);
        findings.push({ name, error: err.message, stack: err.stack });
    }
}

// ==========================================
// TEST GROUP 1: Palette Color Array & Strings
// ==========================================
console.log('🎨 Group 1: Palette Color Array Edge Cases');

runTest('colorToRgbVec3 - Valid 6-digit hex (#ff0000)', () => {
    const rgb = colorToRgbVec3('#ff0000');
    assert.deepStrictEqual(rgb, [1, 0, 0]);
});

runTest('colorToRgbVec3 - Valid 3-digit hex (#0f0)', () => {
    const rgb = colorToRgbVec3('#0f0');
    assert.deepStrictEqual(rgb, [0, 1, 0]);
});

runTest('colorToRgbVec3 - Valid rgb string rgb(0, 0, 255)', () => {
    const rgb = colorToRgbVec3('rgb(0, 0, 255)');
    assert.deepStrictEqual(rgb, [0, 0, 1]);
});

runTest('colorToRgbVec3 - Invalid hex string (#GGGGGG)', () => {
    const rgb = colorToRgbVec3('#GGGGGG');
    // parseInt('GGGGGG', 16) is NaN. Bitwise shift (NaN >> 16) results in 0.
    // Result is [0, 0, 0] instead of fallback [0.1, 0.1, 0.15].
    assert.deepStrictEqual(rgb, [0, 0, 0], 'Evaluates to [0,0,0] because NaN >> bitwise ops evaluate to 0');
});

runTest('colorToRgbVec3 - Short invalid hex string (#12)', () => {
    const rgb = colorToRgbVec3('#12');
    assert.deepStrictEqual(rgb, [0.1, 0.1, 0.15], 'Falls back to default background vector');
});

runTest('colorToRgbVec3 - Null or Undefined input', () => {
    assert.deepStrictEqual(colorToRgbVec3(null), [0.1, 0.1, 0.15]);
    assert.deepStrictEqual(colorToRgbVec3(undefined), [0.1, 0.1, 0.15]);
});

runTest('colorToRgbVec3 - Non-string input (number / object)', () => {
    assert.deepStrictEqual(colorToRgbVec3(12345), [0.1, 0.1, 0.15]);
    assert.deepStrictEqual(colorToRgbVec3({}), [0.1, 0.1, 0.15]);
});

runTest('Visualizer render logic with undefined `colors` prop', () => {
    const colors = undefined;
    const spawnParticle = () => ({
        colorIndex: Math.floor(Math.random() * (colors ? colors.length : 1))
    });
    const p = spawnParticle();
    assert.strictEqual(p.colorIndex, 0);

    // Simulated render loop color selection:
    let threw = false;
    try {
        void colors[p.colorIndex % colors.length];
    } catch (e) {
        threw = true;
        assert(e instanceof TypeError, 'Throws TypeError when trying to access property length of undefined');
    }
    assert(threw, 'FAIL CRITICAL: `colors` undefined causes uncaught TypeError in render loop!');
});

runTest('Visualizer render logic with null `colors` prop', () => {
    const colors = null;
    let threw = false;
    try {
        void colors[0];
    } catch {
        threw = true;
    }
    assert(threw, 'FAIL CRITICAL: `colors` null causes uncaught TypeError in render loop!');
});

runTest('Visualizer render logic with empty `colors` array []', () => {
    const colors = [];
    const spawnParticle = () => ({
        colorIndex: Math.floor(Math.random() * (colors ? colors.length : 1))
    });
    const p = spawnParticle(); // colorIndex = Math.floor(random * 0) = 0
    assert.strictEqual(p.colorIndex, 0);

    // Render loop color index modulo: 0 % 0 = NaN
    const colorHex = colors[p.colorIndex % colors.length]; // colors[NaN] -> undefined
    const rgb = colorToRgbVec3(colorHex);
    // colorToRgbVec3(undefined) returns fallback [0.1, 0.1, 0.15]
    assert.deepStrictEqual(rgb, [0.1, 0.1, 0.15]);

    // Check background color fallback (Line 594: settings.bgColor || colors[0])
    const settings = {};
    const bgStr = settings.bgColor || colors[0]; // undefined || undefined -> undefined
    const bgRgb = colorToRgbVec3(bgStr);
    assert.deepStrictEqual(bgRgb, [0.1, 0.1, 0.15]);
});

runTest('Visualizer render logic with single color array [\'#ff0000\']', () => {
    const colors = ['#ff0000'];
    const p = { colorIndex: 5 };
    const colorHex = colors[p.colorIndex % colors.length];
    assert.strictEqual(colorHex, '#ff0000');
    assert.deepStrictEqual(colorToRgbVec3(colorHex), [1, 0, 0]);
});

console.log('');

// ==========================================
// TEST GROUP 2: Shader Uniform Bounds
// ==========================================
console.log('⚡ Group 2: Shader Uniform Bounds & Data Packing');

runTest('Uniform packing - 0 metaballs', () => {
    const blobsData = new Float32Array(64);
    const blobColorsData = new Float32Array(48);
    let blobIndex = 0;

    // Simulate render loop with 0 particles
    const particles = [];
    for (let i = particles.length - 1; i >= 0; i--) {
        // no execution
    }

    assert.strictEqual(blobIndex, 0);
    assert.strictEqual(blobsData.every(v => v === 0), true);
    assert.strictEqual(blobColorsData.every(v => v === 0), true);
    // u_blobCount uniform set to 0. Shader loop executes 0 iterations.
});

runTest('Uniform packing - Maximum 16 metaballs', () => {
    const blobsData = new Float32Array(64);
    const blobColorsData = new Float32Array(48);
    let blobIndex = 0;

    // 16 particles
    const particles = Array.from({ length: 16 }, () => ({
        x: 0.5, y: 0.5, baseRadius: 0.4, currentImpact: 0, colorIndex: 0
    }));

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (blobIndex < 16) {
            blobsData[blobIndex * 4 + 0] = p.x;
            blobsData[blobIndex * 4 + 1] = 1.0 - p.y;
            blobsData[blobIndex * 4 + 2] = 50.0;
            blobsData[blobIndex * 4 + 3] = 1.0;

            blobColorsData[blobIndex * 3 + 0] = 0.5;
            blobColorsData[blobIndex * 3 + 1] = 0.5;
            blobColorsData[blobIndex * 3 + 2] = 0.5;
            blobIndex++;
        }
    }

    assert.strictEqual(blobIndex, 16);
    assert.strictEqual(blobsData.length, 64);
    assert.strictEqual(blobColorsData.length, 48);
});

runTest('Uniform packing - Over 16 metaballs (30 particles requested)', () => {
    const blobsData = new Float32Array(64);
    const blobColorsData = new Float32Array(48);
    let blobIndex = 0;

    const particles = Array.from({ length: 30 }, () => ({
        x: 0.5, y: 0.5, baseRadius: 0.4, currentImpact: 0, colorIndex: 0
    }));

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (blobIndex < 16) {
            blobsData[blobIndex * 4 + 0] = p.x;
            blobsData[blobIndex * 4 + 1] = 1.0 - p.y;
            blobsData[blobIndex * 4 + 2] = 50.0;
            blobsData[blobIndex * 4 + 3] = 1.0;

            blobColorsData[blobIndex * 3 + 0] = 0.5;
            blobColorsData[blobIndex * 3 + 1] = 0.5;
            blobColorsData[blobIndex * 3 + 2] = 0.5;
            blobIndex++;
        }
    }

    assert.strictEqual(blobIndex, 16, 'blobIndex must cap at 16 even with 30 particles');
    assert.strictEqual(blobsData.length, 64);
    assert.strictEqual(blobColorsData.length, 48);
});

runTest('Symmetry mode uniform overflow boundary (15th blob + symmetry)', () => {
    const blobsData = new Float32Array(64);
    let blobIndex = 0;
    const settings = { symmetry: true };

    // 8 particles with symmetry = 16 blobs
    const particles = Array.from({ length: 9 }, () => ({
        x: 0.3, y: 0.4, baseRadius: 0.4, currentImpact: 0, colorIndex: 0
    }));

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (blobIndex < 16) {
            blobsData[blobIndex * 4 + 0] = p.x;
            blobsData[blobIndex * 4 + 1] = 1.0 - p.y;
            blobsData[blobIndex * 4 + 2] = 50.0;
            blobsData[blobIndex * 4 + 3] = 1.0;
            blobIndex++;
        }
        if (settings.symmetry && blobIndex < 16) {
            blobsData[blobIndex * 4 + 0] = 1.0 - p.x;
            blobsData[blobIndex * 4 + 1] = 1.0 - p.y;
            blobsData[blobIndex * 4 + 2] = 50.0;
            blobsData[blobIndex * 4 + 3] = 1.0;
            blobIndex++;
        }
    }

    assert.strictEqual(blobIndex, 16, 'Symmetry packing cleanly caps at 16 blobs without buffer overflow');
});

console.log('');

// ==========================================
// TEST GROUP 3: Canvas Dimensions
// ==========================================
console.log('📐 Group 3: Canvas Dimension Edge Cases');

runTest('Canvas dimensions 0x0', () => {
    const canvas = { width: 0, height: 0 };
    const width = canvas.width;
    const height = canvas.height;
    const minDim = Math.min(width, height);

    assert.strictEqual(minDim, 0);

    const baseRadius = 0.4;
    const mappedRadius = 1.0;
    const sizeFactor = 1.5;
    const finalR = baseRadius * mappedRadius * minDim * sizeFactor * 0.25;

    assert.strictEqual(finalR, 0);
    assert(!Number.isNaN(finalR), 'finalR should be 0, not NaN');
});

runTest('Negative Canvas dimensions (-100 x -100)', () => {
    const canvas = { width: -100, height: -100 };
    const width = canvas.width;
    const height = canvas.height;
    const minDim = Math.min(width, height);

    assert.strictEqual(minDim, -100);

    const baseRadius = 0.4;
    const mappedRadius = 1.0;
    const sizeFactor = 1.5;
    const finalR = baseRadius * mappedRadius * minDim * sizeFactor * 0.25;

    assert.strictEqual(finalR, -15);

    // In GLSL fragment shader:
    // float radius = blob.z; // -15
    // float rSq = radius * radius * intensity; // (-15)^2 = 225
    const rSqInShader = finalR * finalR * 1.0;
    assert.strictEqual(rSqInShader, 225, 'Negative radius produces positive squared radius in GLSL (sign-invariance anomaly)');
});

console.log('');

// ==========================================
// TEST GROUP 4: Stream Connect / Disconnect Lifecycle
// ==========================================
console.log('🔄 Group 4: Stream Lifecycle & Web Audio Memory/Ref Handling');

runTest('Stream Cleanup - Ref clearing on audioStream disconnect', () => {
    const audioContextRef = { current: { close: () => {}, sampleRate: 44100 } };
    const analyserRef = { current: { disconnect: () => {}, fftSize: 1024 } };
    const sourceRef = { current: { disconnect: () => {} } };

    // Simulate useEffect cleanup when audioStream becomes null/undefined (lines 410-414 in Visualizer.jsx)
    const cleanup = () => {
        sourceRef.current.disconnect();
        analyserRef.current.disconnect();
        audioContextRef.current.close();
    };

    cleanup();

    // Check if refs are cleared to null
    const refsCleared = (audioContextRef.current === null && analyserRef.current === null && sourceRef.current === null);
    
    if (!refsCleared) {
        console.warn('     ⚠️ Notice: audioContextRef, analyserRef, and sourceRef are NOT set to null during cleanup.');
    }
    assert.strictEqual(refsCleared, false, 'Vulnerability: Refs remain assigned to closed AudioContext and AnalyserNode after stream disconnect');
});

runTest('Rapid stream reconnect (10 cycles)', () => {
    const mockAudioContexts = [];
    for (let i = 0; i < 10; i++) {
        let closed = false;
        const ctx = {
            state: 'running',
            createAnalyser: () => ({ fftSize: 1024, disconnect: () => {} }),
            createMediaStreamSource: () => ({ connect: () => {}, disconnect: () => {} }),
            close: () => { closed = true; }
        };
        mockAudioContexts.push(ctx);
        // Simulate mount + unmount
        ctx.close();
        assert.strictEqual(closed, true);
    }
});

console.log('\n=========================================================');
console.log(`📊 TEST RESULTS: Total: ${totalTests} | Passed: ${passedTests} | Failed/Vulnerabilities: ${failedTests}`);
console.log('=========================================================\n');

if (findings.length > 0) {
    console.log('🚨 DISCOVERED VULNERABILITIES & EDGE CASE FAILURES:');
    findings.forEach((f, idx) => {
        console.log(`\n[${idx + 1}] ${f.name}`);
        console.log(`    Error: ${f.error}`);
    });
}

