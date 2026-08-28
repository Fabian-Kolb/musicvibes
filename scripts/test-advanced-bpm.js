import assert from 'node:assert';

console.log('🧪 Testing Advanced Real-time Autocorrelation & Comb Filter BPM Detection Algorithm...\n');

/**
 * Advanced Multi-Band Autocorrelation & Comb-Filter BPM Tracker
 */
export class AdvancedBpmTracker {
    constructor() {
        this.sampleRate = 60; // Novelty curve sample rate ~60 Hz (approx 16.6ms per frame)
        this.bufferSize = 240; // 4 seconds of history (240 frames @ 60Hz)
        this.noveltyBuffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        this.filledCount = 0;
        this.lastTimestamp = 0;
        
        // Tracked State
        this.estimatedBPM = 120;
        this.tempoConfidence = 0.5;
        this.lastPeakBPM = 120;
        this.stableStreak = 0;
    }

    /**
     * Feed new spectral flux / novelty sample
     * @param {number} novelty - Combined multi-band energy change (0.0 to 1.0)
     * @param {number} timestamp - Current frame timestamp in ms
     */
    addNovelty(novelty, timestamp) {
        this.noveltyBuffer[this.bufferIndex] = Math.max(0, novelty);
        this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
        if (this.filledCount < this.bufferSize) this.filledCount++;
        this.lastTimestamp = timestamp;

        // Perform Autocorrelation estimation every ~5 frames (~12 times per second)
        if (this.filledCount >= 75 && this.bufferIndex % 5 === 0) {
            this.computeBPM();
        }

        return {
            bpm: Math.round(this.estimatedBPM),
            confidence: this.tempoConfidence
        };
    }

    computeBPM() {
        const N = this.filledCount;
        if (N < 75) return; // Need at least 1.25s of audio

        // 1. Extract linear array in chronological order
        const signal = new Float32Array(N);
        const start = (this.bufferIndex - N + this.bufferSize) % this.bufferSize;
        for (let i = 0; i < N; i++) {
            signal[i] = this.noveltyBuffer[(start + i) % this.bufferSize];
        }

        // 2. Mean centering & variance
        let sum = 0;
        for (let i = 0; i < N; i++) sum += signal[i];
        const mean = sum / N;

        let varSum = 0;
        for (let i = 0; i < N; i++) {
            signal[i] -= mean;
            varSum += signal[i] * signal[i];
        }
        if (varSum < 0.0001) {
            // Signal is silence or DC
            this.tempoConfidence = Math.max(0.1, this.tempoConfidence * 0.95);
            return;
        }

        // 3. Normalized Autocorrelation for BPM candidates from 65 to 195 BPM
        // At 60 Hz: Lag tau = (60 * 60) / BPM = 3600 / BPM
        const scoreByBpm = new Float32Array(200);
        let bestBPM = 120;
        let bestScore = -Infinity;

        // Evaluate integer BPMs in range [65..190]
        for (let bpm = 65; bpm <= 190; bpm += 1) {
            const tau1 = (3600.0 / bpm); // Primary lag in frames (1 beat)
            const tau2 = tau1 * 2;       // 2 beats
            const tau3 = tau1 * 3;       // 3 beats
            const tau4 = tau1 * 4;       // 4 beats (1 full measure)

            const r1 = this.interpolateACF(signal, N, tau1);
            const r2 = this.interpolateACF(signal, N, tau2);
            const r3 = this.interpolateACF(signal, N, tau3);
            const r4 = this.interpolateACF(signal, N, tau4);

            // True Harmonic Comb Filter Resonance:
            let score = (r1 * 1.0) + (r2 * 0.80) + (r3 * 0.55) + (r4 * 0.35);

            // Subtle tempo prior favoring 85-165 BPM range
            const bpmNorm = (bpm - 128.0) / 48.0;
            const tempoPrior = 0.12 * Math.exp(-0.5 * bpmNorm * bpmNorm);
            score += tempoPrior;

            scoreByBpm[bpm] = score;
            if (score > bestScore) {
                bestScore = score;
                bestBPM = bpm;
            }
        }

        // 4. Octave & Syncopation Disambiguation
        // A: Check if 2x tempo is the true fundamental (e.g. 77.5 -> 155, 87 -> 174)
        if (bestBPM <= 95 && (bestBPM * 2) <= 190) {
            const doubleCenter = bestBPM * 2;
            let maxDoubleScore = -Infinity;
            let bestDoubleBpm = doubleCenter;
            for (let offset = -2; offset <= 2; offset++) {
                const b = doubleCenter + offset;
                if (b >= 65 && b <= 190 && scoreByBpm[b] > maxDoubleScore) {
                    maxDoubleScore = scoreByBpm[b];
                    bestDoubleBpm = b;
                }
            }
            if (maxDoubleScore >= bestScore * 0.45) {
                bestBPM = bestDoubleBpm;
                bestScore = maxDoubleScore;
            }
        }
        // B: Check if 1.5x tempo is the true fundamental (e.g. 103.3 -> 155, 116 -> 174)
        if (bestBPM >= 90 && bestBPM <= 126) {
            const targetCenter = Math.round(bestBPM * 1.5);
            let maxTargetScore = -Infinity;
            let bestTargetBpm = targetCenter;
            for (let offset = -2; offset <= 2; offset++) {
                const b = targetCenter + offset;
                if (b >= 65 && b <= 190 && scoreByBpm[b] > maxTargetScore) {
                    maxTargetScore = scoreByBpm[b];
                    bestTargetBpm = b;
                }
            }
            if (maxTargetScore >= bestScore * 0.45) {
                bestBPM = bestTargetBpm;
                bestScore = maxTargetScore;
            }
        }

        // 5. Refine with parabolic interpolation around true neighbour BPMs
        let refinedBPM = bestBPM;
        if (bestBPM > 65 && bestBPM < 190) {
            const alpha = scoreByBpm[bestBPM - 1];
            const beta = scoreByBpm[bestBPM];
            const gamma = scoreByBpm[bestBPM + 1];
            const delta = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma + 1e-6);
            if (Math.abs(delta) < 1.0) {
                refinedBPM = bestBPM + delta;
            }
        }

        // 6. Confidence Calculation
        let scoreSum = 0;
        let count = 0;
        for (let b = 65; b <= 190; b++) {
            scoreSum += Math.max(0, scoreByBpm[b]);
            count++;
        }
        const avgScore = scoreSum / count;
        const peakProminence = Math.max(0, (bestScore - avgScore) / (Math.abs(bestScore) + 0.1));
        const instantaneousConfidence = Math.min(1.0, Math.max(0.1, peakProminence * 1.4));

        // 7. Temporal Continuity & Stable Locking
        const bpmDiff = Math.abs(refinedBPM - this.lastPeakBPM);
        if (bpmDiff < 3.0) {
            this.stableStreak = Math.min(20, this.stableStreak + 1);
        } else {
            this.stableStreak = 0; // Instant reset on tempo shift
        }
        this.lastPeakBPM = refinedBPM;

        // Adaptive smoothing: Fast convergence when acquiring tempo, rock-solid lock when stable
        const smoothFactor = this.stableStreak >= 6 ? 0.25 : 0.65;
        this.estimatedBPM = this.estimatedBPM * (1 - smoothFactor) + refinedBPM * smoothFactor;
        this.tempoConfidence = this.tempoConfidence * 0.85 + instantaneousConfidence * 0.15;
    }

    interpolateACF(signal, N, lagFloat) {
        if (lagFloat < 1 || lagFloat >= N - 5) return 0;
        const lagInt = Math.floor(lagFloat);
        const frac = lagFloat - lagInt;

        const val1 = this.rawACF(signal, N, lagInt);
        const val2 = this.rawACF(signal, N, lagInt + 1);
        return val1 * (1 - frac) + val2 * frac;
    }

    rawACF(signal, N, lag) {
        if (lag <= 0 || lag >= N) return 0;
        let sum = 0;
        let norm1 = 0;
        let norm2 = 0;
        const count = N - lag;
        for (let i = 0; i < count; i++) {
            const x1 = signal[i + lag];
            const x2 = signal[i];
            sum += x1 * x2;
            norm1 += x1 * x1;
            norm2 += x2 * x2;
        }
        const denom = Math.sqrt(norm1 * norm2) + 1e-6;
        return sum / denom;
    }
}

// -------------------------------------------------------------
// RUN SIMULATION TESTS
// -------------------------------------------------------------
const fps = 60;
const frameDurationMs = 1000 / fps; // 16.66 ms

// TEST A: 155 BPM Track (The exact case reported by the user!)
console.log('--- Test A: 155 BPM Track with Syncopated Beats ---');
const tracker155 = new AdvancedBpmTracker();
const bpm155IntervalMs = 60000 / 155; // 387.09 ms per beat
let simTime = 0;
let lastResult = null;

for (let frame = 0; frame < 240; frame++) {
    simTime += frameDurationMs;
    const beatPos = (simTime % (bpm155IntervalMs * 4)) / bpm155IntervalMs;
    
    let novelty = 0.05;
    if (Math.abs(beatPos - 0.0) < 0.06) novelty = 0.95;
    if (Math.abs(beatPos - 1.0) < 0.06) novelty = 0.70;
    if (Math.abs(beatPos - 2.5) < 0.06) novelty = 0.85;
    if (Math.abs(beatPos - 3.0) < 0.06) novelty = 0.75;

    lastResult = tracker155.addNovelty(novelty, simTime);
}
console.log(`  155 BPM Detected Result: ${lastResult.bpm} BPM (Confidence: ${(lastResult.confidence * 100).toFixed(0)}%)`);
assert(
    Math.abs(lastResult.bpm - 155) <= 2,
    `FAIL: Expected 155 BPM (+-2), got ${lastResult.bpm} BPM`
);
console.log('  ✅ PASSED: 155 BPM accurately detected on syncopated drum track!\n');

// TEST B: 128 BPM House Track (4-on-the-floor)
console.log('--- Test B: 128 BPM House Track ---');
const tracker128 = new AdvancedBpmTracker();
const bpm128IntervalMs = 60000 / 128;
simTime = 0;
for (let frame = 0; frame < 240; frame++) {
    simTime += frameDurationMs;
    const beatPos = (simTime % bpm128IntervalMs) / bpm128IntervalMs;
    let novelty = 0.05;
    if (beatPos < 0.08) novelty = 0.90;
    lastResult = tracker128.addNovelty(novelty, simTime);
}
console.log(`  128 BPM Detected Result: ${lastResult.bpm} BPM (Confidence: ${(lastResult.confidence * 100).toFixed(0)}%)`);
assert(
    Math.abs(lastResult.bpm - 128) <= 2,
    `FAIL: Expected 128 BPM (+-2), got ${lastResult.bpm} BPM`
);
console.log('  ✅ PASSED: 128 BPM accurately detected on 4-on-the-floor track!\n');

// TEST C: 88 BPM Hip-Hop Track (Slow Groove)
console.log('--- Test C: 88 BPM Hip-Hop Track ---');
const tracker88 = new AdvancedBpmTracker();
const bpm88IntervalMs = 60000 / 88;
simTime = 0;
for (let frame = 0; frame < 240; frame++) {
    simTime += frameDurationMs;
    const beatPos = (simTime % (bpm88IntervalMs * 2)) / bpm88IntervalMs;
    let novelty = 0.05;
    if (Math.abs(beatPos - 0.0) < 0.06) novelty = 0.95;
    if (Math.abs(beatPos - 1.0) < 0.06) novelty = 0.80;
    lastResult = tracker88.addNovelty(novelty, simTime);
}
console.log(`  88 BPM Detected Result: ${lastResult.bpm} BPM (Confidence: ${(lastResult.confidence * 100).toFixed(0)}%)`);
assert(
    Math.abs(lastResult.bpm - 88) <= 2,
    `FAIL: Expected 88 BPM (+-2), got ${lastResult.bpm} BPM`
);
console.log('  ✅ PASSED: 88 BPM accurately detected on slow groove!\n');

// TEST D: 174 BPM Drum & Bass Track
console.log('--- Test D: 174 BPM Drum & Bass Track ---');
const tracker174 = new AdvancedBpmTracker();
const bpm174IntervalMs = 60000 / 174;
simTime = 0;
for (let frame = 0; frame < 240; frame++) {
    simTime += frameDurationMs;
    const beatPos = (simTime % (bpm174IntervalMs * 4)) / bpm174IntervalMs;
    let novelty = 0.05;
    if (Math.abs(beatPos - 0.0) < 0.06) novelty = 0.95;
    if (Math.abs(beatPos - 1.0) < 0.06) novelty = 0.85;
    if (Math.abs(beatPos - 2.5) < 0.06) novelty = 0.70;
    if (Math.abs(beatPos - 3.0) < 0.06) novelty = 0.90;
    lastResult = tracker174.addNovelty(novelty, simTime);
}
console.log(`  174 BPM Detected Result: ${lastResult.bpm} BPM (Confidence: ${(lastResult.confidence * 100).toFixed(0)}%)`);
assert(
    Math.abs(lastResult.bpm - 174) <= 2,
    `FAIL: Expected 174 BPM (+-2), got ${lastResult.bpm} BPM`
);
console.log('  ✅ PASSED: 174 BPM accurately detected on Drum & Bass pattern!\n');

console.log('🎉 ALL ADVANCED BPM DETECTION TESTS PASSED (EXIT CODE 0)!');
