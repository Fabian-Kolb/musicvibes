/**
 * Audio Physics Engine for Liquid Mode Visualizer
 *
 * Implements 7-band frequency decomposition (Sub-Bass, Kick, Low-Mid, Mid, Presence, Brilliance, Air)
 * alongside backwards-compatible 3-band metrics (Bass, Mid, Treble).
 * Features Spectral Flux Onset Detection for crisp Kick & Snare hits,
 * Real-Time BPM & Tempo Tracking (60–190 BPM), Beat-Phase harmonic oscillation,
 * Spectral Centroid timbral brightness analysis, and dynamic tempo-adaptive physics.
 */

/**
 * Maps a setting UI value (-10 to +10 range) to a target numeric multiplier/range.
 * @param {number} val - UI knob setting (-10 to +10, 0 is default)
 * @param {number} base - Baseline value when val === 0
 * @param {number} min - Minimum value when val === -10
 * @param {number} max - Maximum value when val === +10
 * @returns {number}
 */
export function mapSetting(val = 0, base = 1.0, min = 0.1, max = 5.0) {
    const numVal = Number(val);
    if (Number.isNaN(numVal) || val === null || val === undefined) return base;
    if (numVal === 0) return base;
    if (numVal > 0) {
        return base + (max - base) * (Math.min(numVal, 10) / 10);
    }
    return base - (base - min) * (Math.min(Math.abs(numVal), 10) / 10);
}

/**
 * Calculates start and end bin indices for a given Hz range.
 * @param {number} lowHz 
 * @param {number} highHz 
 * @param {number} sampleRate 
 * @param {number} fftSize 
 * @param {number} dataLength 
 * @returns {{ startBin: number, endBin: number }}
 */
export function getBinRange(lowHz, highHz, sampleRate = 44100, fftSize = 1024, dataLength = 512) {
    const safeSampleRate = (typeof sampleRate === 'number' && Number.isFinite(sampleRate) && sampleRate > 0) ? sampleRate : 44100;
    const safeFftSize = (typeof fftSize === 'number' && Number.isFinite(fftSize) && fftSize > 0) ? fftSize : 1024;
    const safeDataLength = (typeof dataLength === 'number' && Number.isFinite(dataLength) && dataLength > 0) ? dataLength : 512;
    const hzPerBin = safeSampleRate / safeFftSize;
    let startBin = Math.max(0, Math.floor(lowHz / hzPerBin));
    let endBin = Math.min(safeDataLength - 1, Math.ceil(highHz / hzPerBin));
    if (endBin < startBin) endBin = startBin;
    startBin = Math.min(safeDataLength - 1, startBin);
    return { startBin, endBin };
}

/**
 * Process raw FFT frequency data into frequency band metrics (3-band legacy + 7-band detailed).
 * @param {Uint8Array|number[]} frequencyData - Array of byte frequency data (0-255)
 * @param {Object} options
 * @param {number} [options.sampleRate=44100]
 * @param {number} [options.fftSize=1024]
 * @returns {Object} Band energy, RMS, and peak statistics
 */
export function processFrequencyBands(frequencyData, options = {}) {
    const safeOptions = (options && typeof options === 'object') ? options : {};
    const sampleRate = (typeof safeOptions.sampleRate === 'number' && Number.isFinite(safeOptions.sampleRate) && safeOptions.sampleRate > 0) ? safeOptions.sampleRate : 44100;
    const fftSize = (typeof safeOptions.fftSize === 'number' && Number.isFinite(safeOptions.fftSize) && safeOptions.fftSize > 0) ? safeOptions.fftSize : 1024;
    const dataLength = frequencyData ? frequencyData.length : 0;

    const emptyBand = { energy: 0, rms: 0, peak: 0, rawMax: 0, count: 0 };

    if (!frequencyData || typeof dataLength !== 'number' || dataLength <= 0) {
        return {
            bass: emptyBand,
            mid: emptyBand,
            treble: emptyBand,
            totalEnergy: 0,
            totalRMS: 0,
            bassDominance: 0,
            midDominance: 0,
            trebleDominance: 0,
            bands7: {
                subBass: emptyBand,
                kick: emptyBand,
                lowMid: emptyBand,
                mid: emptyBand,
                presence: emptyBand,
                brilliance: emptyBand,
                air: emptyBand
            }
        };
    }

    // 1. Legacy 3-band boundaries (Bass: 20-250 Hz, Mid: 250-4000 Hz, Treble: 4000-16000 Hz)
    const bassRange = getBinRange(20, 250, sampleRate, fftSize, dataLength);
    const midRange = getBinRange(250, 4000, sampleRate, fftSize, dataLength);
    const trebleRange = getBinRange(4000, 16000, sampleRate, fftSize, dataLength);

    // 2. Detailed 7-band boundaries
    const subBassRange = getBinRange(20, 60, sampleRate, fftSize, dataLength);
    const kickRange = getBinRange(60, 180, sampleRate, fftSize, dataLength);
    const lowMidRange = getBinRange(180, 500, sampleRate, fftSize, dataLength);
    const mid7Range = getBinRange(500, 2000, sampleRate, fftSize, dataLength);
    const presenceRange = getBinRange(2000, 6000, sampleRate, fftSize, dataLength);
    const brillianceRange = getBinRange(6000, 12000, sampleRate, fftSize, dataLength);
    const airRange = getBinRange(12000, 20000, sampleRate, fftSize, dataLength);

    const computeBandStats = (startBin, endBin) => {
        let sum = 0;
        let sumSq = 0;
        let maxVal = 0;
        const count = Math.max(1, endBin - startBin + 1);

        for (let i = startBin; i <= endBin && i < dataLength; i++) {
            let val = frequencyData[i];
            if (typeof val !== 'number' || !Number.isFinite(val)) {
                val = 0;
            } else if (val < 0) {
                val = 0;
            }
            const normVal = val / 255.0;
            sum += normVal;
            sumSq += normVal * normVal;
            if (val > maxVal) maxVal = val;
        }

        const energy = sum / count;
        const rms = Math.sqrt(sumSq / count);
        const peak = maxVal / 255.0;
        const dbFS = rms > 0.0001 ? Math.max(-90, Math.min(0, 20 * Math.log10(rms))) : -90;
        const peakDbFS = peak > 0.0001 ? Math.max(-90, Math.min(0, 20 * Math.log10(peak))) : -90;

        return {
            energy,
            rms,
            peak,
            dbFS,
            peakDbFS,
            rawMax: maxVal,
            count
        };
    };

    const bass = computeBandStats(bassRange.startBin, bassRange.endBin);
    const mid = computeBandStats(midRange.startBin, midRange.endBin);
    const treble = computeBandStats(trebleRange.startBin, trebleRange.endBin);

    // 7-Band metrics
    const subBass = computeBandStats(subBassRange.startBin, subBassRange.endBin);
    const kick = computeBandStats(kickRange.startBin, kickRange.endBin);
    const lowMid = computeBandStats(lowMidRange.startBin, lowMidRange.endBin);
    const mid7 = computeBandStats(mid7Range.startBin, mid7Range.endBin);
    const presence = computeBandStats(presenceRange.startBin, presenceRange.endBin);
    const brilliance = computeBandStats(brillianceRange.startBin, brillianceRange.endBin);
    const air = computeBandStats(airRange.startBin, airRange.endBin);

    // Compute total metrics across the active audible range (20 Hz - 16000 Hz)
    const activeStart = bassRange.startBin;
    const activeEnd = Math.min(dataLength - 1, trebleRange.endBin);
    const totalStats = computeBandStats(activeStart, activeEnd);

    const totalEnergySum = bass.energy + mid.energy + treble.energy + 1e-6;
    const bassDominance = bass.energy / totalEnergySum;
    const midDominance = mid.energy / totalEnergySum;
    const trebleDominance = treble.energy / totalEnergySum;

    return {
        bass,
        mid,
        treble,
        totalEnergy: totalStats.energy,
        totalRMS: totalStats.rms,
        bassDominance,
        midDominance,
        trebleDominance,
        bands7: {
            subBass,
            kick,
            lowMid,
            mid: mid7,
            presence,
            brilliance,
            air
        }
    };
}

/**
 * Computes Spectral Centroid (timbral brightness center).
 * @param {Uint8Array|number[]} frequencyData 
 * @param {number} sampleRate 
 * @param {number} fftSize 
 * @returns {number} Normalized centroid value [0.0, 1.0]
 */
export function computeSpectralCentroid(frequencyData, sampleRate = 44100, fftSize = 1024) {
    if (!frequencyData || frequencyData.length === 0) return 0.0;
    const hzPerBin = sampleRate / fftSize;
    let weightedSum = 0;
    let totalMagnitude = 0;

    for (let i = 0; i < frequencyData.length; i++) {
        const mag = Math.max(0, frequencyData[i] || 0) / 255.0;
        const freq = i * hzPerBin;
        weightedSum += freq * mag;
        totalMagnitude += mag;
    }

    if (totalMagnitude < 1e-5) return 0.0;
    const centroidHz = weightedSum / totalMagnitude;
    // Normalize centroid between 0 Hz and 8000 Hz
    return Math.min(1.0, Math.max(0.0, centroidHz / 8000.0));
}

/**
 * Computes positive Spectral Flux across a specific bin range for transient attack detection.
 * @param {Uint8Array|number[]} currentData 
 * @param {Uint8Array|number[]} prevData 
 * @param {number} startBin 
 * @param {number} endBin 
 * @returns {number} Normalized positive flux value [0.0, 1.0]
 */
export function computeSpectralFlux(currentData, prevData, startBin, endBin) {
    if (!currentData || !prevData || currentData.length === 0 || prevData.length === 0) return 0.0;
    let flux = 0;
    const count = Math.max(1, endBin - startBin + 1);

    for (let i = startBin; i <= endBin && i < currentData.length && i < prevData.length; i++) {
        const cur = (currentData[i] || 0) / 255.0;
        const prev = (prevData[i] || 0) / 255.0;
        const diff = cur - prev;
        if (diff > 0) {
            flux += diff * diff; // Square weighting for crisp attack sensitivity
        }
    }

    return Math.min(1.0, Math.sqrt(flux / count) * 4.0);
}

/**
 * Computes raw normalized autocorrelation at discrete lag k.
 * @param {Float32Array|number[]} signal - Zero-mean novelty signal
 * @param {number} N - Signal length
 * @param {number} lag - Discrete frame lag (>= 0)
 * @returns {number} Normalized autocorrelation [-1.0, 1.0]
 */
export function rawACF(signal, N, lag) {
    if (lag <= 0 || lag >= N || !signal) return 0;
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

/**
 * Linearly interpolates normalized autocorrelation at fractional lag.
 * @param {Float32Array|number[]} signal 
 * @param {number} N 
 * @param {number} lagFloat 
 * @returns {number}
 */
export function interpolateACF(signal, N, lagFloat) {
    if (lagFloat < 1 || lagFloat >= N - 5 || !signal) return 0;
    const lagInt = Math.floor(lagFloat);
    const frac = lagFloat - lagInt;
    const val1 = rawACF(signal, N, lagInt);
    const val2 = rawACF(signal, N, lagInt + 1);
    return val1 * (1 - frac) + val2 * frac;
}

/**
 * Robust Time-Quantized Multi-Harmonic Autocorrelation & Comb-Filter BPM Estimator.
 * Computes primary tempo across BPM [70..200] with octave disambiguation.
 * @param {Float32Array|number[]} signal - Zero-mean novelty curve history (10ms slices)
 * @param {number} N - History length in 10ms slices
 * @param {number} [sliceDurationMs=10] - Slice duration in ms
 * @returns {{ bpm: number, confidence: number }}
 */
export function computeAutocorrelationBPM(signal, N, sliceDurationMs = 10) {
    if (!signal || N < 120) return { bpm: 120, confidence: 0.2 };

    // 1. Mean centering & variance check
    let sum = 0;
    for (let i = 0; i < N; i++) sum += signal[i];
    const mean = sum / N;

    let varSum = 0;
    const zeroMeanSignal = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        const centered = signal[i] - mean;
        zeroMeanSignal[i] = centered;
        varSum += centered * centered;
    }
    if (varSum < 0.0001) {
        return { bpm: 120, confidence: 0.1 };
    }

    // 2. Harmonic Comb Filter Evaluation for BPM in [70..200] with 0.5 BPM steps
    const minBpm = 70;
    const maxBpm = 200;
    let bestBpm = 120;
    let bestScore = -Infinity;
    const scoreMap = {};

    for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
        const beatPeriodMs = 60000.0 / bpm;
        const tauSlices = beatPeriodMs / sliceDurationMs;

        const r1 = interpolateACF(zeroMeanSignal, N, tauSlices);
        const r2 = interpolateACF(zeroMeanSignal, N, tauSlices * 2);
        const r3 = interpolateACF(zeroMeanSignal, N, tauSlices * 3);
        const r4 = interpolateACF(zeroMeanSignal, N, tauSlices * 4);

        // Harmonic Comb Resonance Score
        const score = (r1 * 1.0) + (r2 * 0.75) + (r3 * 0.50) + (r4 * 0.30);
        scoreMap[bpm] = score;

        if (score > bestScore) {
            bestScore = score;
            bestBpm = bpm;
        }
    }

    // 3. Octave & Syncopation Disambiguation (Direct ACF Lag Peak Check)
    // A: Double Tempo Promotion (e.g. 77.5 -> 155, 87 -> 174)
    if (bestBpm <= 98 && (bestBpm * 2) <= maxBpm) {
        const doubleBpm = bestBpm * 2;
        const tauFund = (60000.0 / bestBpm) / sliceDurationMs;
        const tauDouble = (60000.0 / doubleBpm) / sliceDurationMs;
        
        let rFund = -Infinity;
        for (let d = -1.5; d <= 1.5; d += 0.5) {
            const v = interpolateACF(zeroMeanSignal, N, tauFund + d);
            if (v > rFund) rFund = v;
        }

        let rDouble = -Infinity;
        for (let d = -1.5; d <= 1.5; d += 0.5) {
            const v = interpolateACF(zeroMeanSignal, N, tauDouble + d);
            if (v > rDouble) rDouble = v;
        }

        if (rDouble >= 0.15 && rDouble >= rFund * 0.40) {
            bestBpm = doubleBpm;
        }
    }

    // B: 1.5x Syncopation Promotion (e.g. 103.3 -> 155, 116 -> 174)
    if (bestBpm >= 90 && bestBpm <= 130) {
        const targetBpm = Math.round(bestBpm * 1.5 * 2) / 2;
        if (targetBpm <= maxBpm) {
            const tauFund = (60000.0 / bestBpm) / sliceDurationMs;
            const tauTarget = (60000.0 / targetBpm) / sliceDurationMs;
            
            let rFund = -Infinity;
            for (let d = -1.5; d <= 1.5; d += 0.5) {
                const v = interpolateACF(zeroMeanSignal, N, tauFund + d);
                if (v > rFund) rFund = v;
            }

            let rTarget = -Infinity;
            for (let d = -1.5; d <= 1.5; d += 0.5) {
                const v = interpolateACF(zeroMeanSignal, N, tauTarget + d);
                if (v > rTarget) rTarget = v;
            }

            if (rTarget >= 0.15 && rTarget >= rFund * 0.40) {
                bestBpm = targetBpm;
            }
        }
    }

    // 4. Parabolic Sub-Bin Refinement
    let refinedBpm = bestBpm;
    if (bestBpm > minBpm + 1 && bestBpm < maxBpm - 1 && scoreMap[bestBpm - 0.5] !== undefined && scoreMap[bestBpm + 0.5] !== undefined) {
        const alpha = scoreMap[bestBpm - 0.5];
        const beta = scoreMap[bestBpm];
        const gamma = scoreMap[bestBpm + 0.5];
        const delta = 0.25 * (alpha - gamma) / (alpha - 2 * beta + gamma + 1e-6);
        if (Math.abs(delta) < 0.5) {
            refinedBpm = bestBpm + delta;
        }
    }

    // 5. Confidence Calculation
    const confidence = Math.min(1.0, Math.max(0.2, (bestScore + 1.0) / 3.0));

    return { bpm: refinedBpm, confidence };
}

/**
 * Calculate dynamic audio physics parameters based on frequency analysis and UI settings.
 *
 * @param {Object} params
 * @param {Uint8Array|number[]} params.frequencyData - Byte frequency data array
 * @param {Uint8Array|number[]} [params.prevFrequencyData] - Optional previous frame frequency data
 * @param {number} [params.timestamp] - Current timestamp in milliseconds (performance.now())
 * @param {number} [params.sampleRate=44100]
 * @param {number} [params.fftSize=1024]
 * @param {Object} [params.settings={}] - UI control settings
 * @param {Object} [params.prevState=null] - Optional previous state for smoothing/EMA/BPM tracking
 * @returns {Object} Calculated physics properties
 */
export function calculateAudioPhysics(params = {}) {
    const safeParams = (params && typeof params === 'object') ? params : {};
    const {
        frequencyData,
        prevFrequencyData,
        timestamp = (typeof performance !== 'undefined' ? performance.now() : Date.now()),
        sampleRate = 44100,
        fftSize = 1024,
        settings,
        prevState
    } = safeParams;

    const safeSettings = (settings && typeof settings === 'object') ? settings : {};

    // Process frequency spectrum (both 3-band and 7-band)
    const bandMetrics = processFrequencyBands(frequencyData, { sampleRate, fftSize });
    const { bass, mid, treble, totalEnergy, totalRMS, bassDominance, midDominance, trebleDominance, bands7 } = bandMetrics;

    // Spectral Centroid (Timbral Brightness Center)
    const spectralCentroid = computeSpectralCentroid(frequencyData, sampleRate, fftSize);

    // Extract & Map UI Modifiers (-10 to +10 range)
    const baseSpeedSetting = safeSettings.baseSpeed !== undefined ? safeSettings.baseSpeed : (safeSettings.speed !== undefined ? safeSettings.speed : 0);
    const peakSpeedSetting = safeSettings.peakSpeed !== undefined ? safeSettings.peakSpeed : 0;
    const beatSensSetting = safeSettings.beatSensitivity !== undefined ? safeSettings.beatSensitivity : (safeSettings.sensitivity !== undefined ? safeSettings.sensitivity : 0);
    const radiusSetting = safeSettings.baseRadius !== undefined ? safeSettings.baseRadius : 0;
    const bassImpSetting = safeSettings.bassImpact !== undefined ? safeSettings.bassImpact : 0;
    const midImpSetting = safeSettings.midImpact !== undefined ? safeSettings.midImpact : 0;
    const trebleImpSetting = safeSettings.trebleImpact !== undefined ? safeSettings.trebleImpact : 0;

    const baseSpeedMult = mapSetting(baseSpeedSetting, 1.0, 0.1, 5.0);
    const peakSpeedMult = mapSetting(peakSpeedSetting, 1.0, 0.0, 5.0);
    const beatSensMult = mapSetting(beatSensSetting, 1.0, 0.1, 5.0);
    const radiusMult = mapSetting(radiusSetting, 1.0, 0.1, 5.0);

    // Fallback aliases for legacy callers
    const speedMult = baseSpeedMult;
    const sensMult = beatSensMult;

    // Rebalanced Frequency Sensitivity Modifiers (0.0x to 4.0x impact)
    const bassImpMult = mapSetting(bassImpSetting, 1.0, 0.0, 4.0);
    const midImpMult = mapSetting(midImpSetting, 1.0, 0.0, 4.0);
    const trebleImpMult = mapSetting(trebleImpSetting, 1.0, 0.0, 4.0);

    // Running Averages / EMA State Update
    const safePrevState = (prevState && typeof prevState === 'object') ? prevState : null;
    const lastTimestamp = (safePrevState && Number.isFinite(safePrevState.lastTimestamp)) ? safePrevState.lastTimestamp : timestamp;
    const dt = Math.max(0.001, Math.min(0.2, (timestamp - lastTimestamp) / 1000.0));
    const elapsedMs = Math.max(0, Math.min(200, timestamp - lastTimestamp));

    const prevBass = (safePrevState && Number.isFinite(safePrevState.avgBass)) ? safePrevState.avgBass : bass.peak;
    const prevMid = (safePrevState && Number.isFinite(safePrevState.avgMid)) ? safePrevState.avgMid : mid.peak;
    const prevTreble = (safePrevState && Number.isFinite(safePrevState.avgTreble)) ? safePrevState.avgTreble : treble.peak;

    const avgBass = prevBass * 0.9 + bass.peak * 0.1;
    const avgMid = prevMid * 0.9 + mid.peak * 0.1;
    const avgTreble = prevTreble * 0.9 + treble.peak * 0.1;

    // --- MULTI-TIMEFRAME ADAPTIVE ENERGY TRACKING ---
    // Composite heavy energy (Sub-Bass, Kick & RMS)
    const currentHeavyEnergy = (bands7.subBass.rms * 0.45 + bands7.kick.rms * 0.35 + totalRMS * 0.20);

    const prevWarmupTimer = (safePrevState && Number.isFinite(safePrevState.warmupTimer)) ? safePrevState.warmupTimer : 0.0;
    const warmupTimer = prevWarmupTimer + dt;

    const prevEnergyFast = (safePrevState && Number.isFinite(safePrevState.avgEnergyFast)) ? safePrevState.avgEnergyFast : currentHeavyEnergy;
    const prevEnergyMed = (safePrevState && Number.isFinite(safePrevState.avgEnergyMed)) ? safePrevState.avgEnergyMed : currentHeavyEnergy;
    const prevEnergyLong = (safePrevState && Number.isFinite(safePrevState.avgEnergyLong)) ? safePrevState.avgEnergyLong : Math.max(0.12, currentHeavyEnergy);
    const prevTensionEMA = (safePrevState && Number.isFinite(safePrevState.tensionEMA)) ? safePrevState.tensionEMA : 0.3;
    const prevBuildUpScore = (safePrevState && Number.isFinite(safePrevState.buildUpScore)) ? safePrevState.buildUpScore : 0.0;
    const prevBassCutoutTimer = (safePrevState && Number.isFinite(safePrevState.bassCutoutTimer)) ? safePrevState.bassCutoutTimer : 0.0;
    const prevDropActiveTimer = (safePrevState && Number.isFinite(safePrevState.dropActiveTimer)) ? safePrevState.dropActiveTimer : 0.0;
    const prevCooldownTimer = (safePrevState && Number.isFinite(safePrevState.cooldownTimer)) ? safePrevState.cooldownTimer : (safePrevState ? 0.0 : 1.5);

    // Frame-rate independent time constants
    const alphaFast = Math.min(1.0, dt * 7.0);   // ~140ms attack window
    const alphaMed = Math.min(1.0, dt * 0.6);    // ~1.6s medium context window
    const alphaLong = Math.min(1.0, dt * 0.10);  // ~10.0s slow background baseline floor

    const avgEnergyFast = prevEnergyFast * (1 - alphaFast) + currentHeavyEnergy * alphaFast;
    const avgEnergyMed = prevEnergyMed * (1 - alphaMed) + currentHeavyEnergy * alphaMed;
    const avgEnergyLong = prevEnergyLong * (1 - alphaLong) + currentHeavyEnergy * alphaLong;

    // Stable Drop Ratio: current energy surge relative to genuine long-term baseline floor
    const baselineEnergyFloor = Math.max(0.10, avgEnergyLong);
    const dropRatio = Math.max(0.1, avgEnergyFast / baselineEnergyFloor);
    const energyRatio = totalRMS / Math.max(0.08, avgEnergyMed);

    // Transients
    const bassTransient = Math.max(0, bass.peak - avgBass * 0.8);
    const midTransient = Math.max(0, mid.peak - avgMid * 0.8);
    const trebleTransient = Math.max(0, treble.peak - avgTreble * 0.8);

    // --- SPECTRAL FLUX & DISCRETE BEAT ONSET DETECTION ---
    const priorSpectrum = prevFrequencyData || (safePrevState ? safePrevState.prevSpectrum : null);
    const dataLen = frequencyData ? frequencyData.length : 0;

    let rawKickFlux = 0;
    let rawSnareFlux = 0;
    let rawHihatFlux = 0;

    if (priorSpectrum && frequencyData && dataLen > 0) {
        const kickBins = getBinRange(60, 180, sampleRate, fftSize, dataLen);
        const snareBins = getBinRange(2000, 6000, sampleRate, fftSize, dataLen);
        const hihatBins = getBinRange(6000, 14000, sampleRate, fftSize, dataLen);

        rawKickFlux = computeSpectralFlux(frequencyData, priorSpectrum, kickBins.startBin, kickBins.endBin);
        rawSnareFlux = computeSpectralFlux(frequencyData, priorSpectrum, snareBins.startBin, snareBins.endBin);
        rawHihatFlux = computeSpectralFlux(frequencyData, priorSpectrum, hihatBins.startBin, hihatBins.endBin);
    } else {
        // Fallback transient estimation if no prior spectrum
        rawKickFlux = Math.min(1.0, (bands7.kick.peak * 0.7 + bassTransient * 0.8) * bassImpMult);
        rawSnareFlux = Math.min(1.0, (bands7.presence.peak * 0.7 + midTransient * 0.8) * midImpMult);
        rawHihatFlux = Math.min(1.0, (bands7.brilliance.peak * 0.7 + trebleTransient * 0.8) * trebleImpMult);
    }

    // Dynamic Attack / Decay Smoothing for discrete beat impulses with high activation gating threshold
    const prevBeatPunch = (safePrevState && Number.isFinite(safePrevState.beatPunchDecay)) ? safePrevState.beatPunchDecay : 0.0;
    const prevSnareHit = (safePrevState && Number.isFinite(safePrevState.snareHitDecay)) ? safePrevState.snareHitDecay : 0.0;

    // Transient Onset Extraction above dynamic baseline
    const kickTransientSpike = Math.max(0, rawKickFlux - 0.20);
    const bassRise = Math.max(0, bass.peak - avgEnergyFast * 1.25);
    const rawKickImpulse = (kickTransientSpike * 1.8 + bassRise * 1.5) * bassImpMult;

    // High Activation Threshold Gating: strictly ignores continuous volume/rumble and fires ONLY on true beat attacks
    const PUNCH_GATE = 0.28;
    const gatedKickPunch = rawKickImpulse > PUNCH_GATE ? Math.min(1.0, (rawKickImpulse - PUNCH_GATE) * 1.6) : 0.0;
    
    // Fast single-frame attack & snappy exponential decay (clears in ~60ms)
    const beatPunch = gatedKickPunch > prevBeatPunch 
        ? gatedKickPunch 
        : (prevBeatPunch * 0.72 < 0.02 ? 0.0 : prevBeatPunch * 0.72);

    const snareTransientSpike = Math.max(0, rawSnareFlux - 0.18);
    const rawSnareImpulse = (snareTransientSpike * 1.6 + Math.max(0, mid.peak - avgMid * 1.25) * 1.2) * midImpMult;
    const gatedSnareHit = rawSnareImpulse > 0.25 ? Math.min(1.0, (rawSnareImpulse - 0.25) * 1.5) : 0.0;
    const snareHit = gatedSnareHit > prevSnareHit 
        ? gatedSnareHit 
        : (prevSnareHit * 0.75 < 0.02 ? 0.0 : prevSnareHit * 0.75);

    const hihatTick = Math.min(1.0, Math.max(0, rawHihatFlux - 0.15) * 1.5 * trebleImpMult);

    // --- TIME-INVARIANT 10ms RESAMPLED NOVELTY BUFFER (4.0s = 400 Slices) ---
    const SLICE_DURATION_MS = 10;
    const NOVELTY_BUFFER_SIZE = 400; // 400 slices * 10ms = 4000ms history

    let noveltyBuffer = (safePrevState && safePrevState.noveltyBuffer instanceof Float32Array && safePrevState.noveltyBuffer.length === NOVELTY_BUFFER_SIZE)
        ? safePrevState.noveltyBuffer
        : (safePrevState && Array.isArray(safePrevState.noveltyBuffer) && safePrevState.noveltyBuffer.length === NOVELTY_BUFFER_SIZE)
            ? new Float32Array(safePrevState.noveltyBuffer)
            : new Float32Array(NOVELTY_BUFFER_SIZE);

    let noveltyIndex = (safePrevState && Number.isFinite(safePrevState.noveltyIndex)) ? safePrevState.noveltyIndex : 0;
    let noveltyCount = (safePrevState && Number.isFinite(safePrevState.noveltyCount)) ? safePrevState.noveltyCount : 0;
    let timeAccumulatorMs = (safePrevState && Number.isFinite(safePrevState.timeAccumulatorMs)) ? safePrevState.timeAccumulatorMs : 0;

    let estimatedBPM = (safePrevState && Number.isFinite(safePrevState.estimatedBPM)) ? safePrevState.estimatedBPM : 120;
    let tempoConfidence = (safePrevState && Number.isFinite(safePrevState.tempoConfidence)) ? safePrevState.tempoConfidence : 0.4;
    let lastPeakBPM = (safePrevState && Number.isFinite(safePrevState.lastPeakBPM)) ? safePrevState.lastPeakBPM : 120;
    let stableStreak = (safePrevState && Number.isFinite(safePrevState.stableStreak)) ? safePrevState.stableStreak : 0;

    // Instantaneous multi-band novelty (Kick + Snare + Hi-Hat flux)
    const currentNovelty = (rawKickFlux * 0.60 + rawSnareFlux * 0.30 + rawHihatFlux * 0.10);

    // Resample incoming audio frame into exact 10ms time slices (immune to monitor refresh rate)
    timeAccumulatorMs += elapsedMs;
    while (timeAccumulatorMs >= SLICE_DURATION_MS) {
        timeAccumulatorMs -= SLICE_DURATION_MS;
        noveltyBuffer[noveltyIndex] = currentNovelty;
        noveltyIndex = (noveltyIndex + 1) % NOVELTY_BUFFER_SIZE;
        if (noveltyCount < NOVELTY_BUFFER_SIZE) noveltyCount++;
    }

    // Compute ACF BPM periodically every ~50ms (every 5 slices) when >= 1.2s (120 slices) of history is available
    if (noveltyCount >= 120 && noveltyIndex % 5 === 0) {
        const signal = new Float32Array(noveltyCount);
        const start = (noveltyIndex - noveltyCount + NOVELTY_BUFFER_SIZE) % NOVELTY_BUFFER_SIZE;
        for (let i = 0; i < noveltyCount; i++) {
            signal[i] = noveltyBuffer[(start + i) % NOVELTY_BUFFER_SIZE];
        }

        const acfResult = computeAutocorrelationBPM(signal, noveltyCount, SLICE_DURATION_MS);
        if (acfResult && Number.isFinite(acfResult.bpm)) {
            const bpmDiff = Math.abs(acfResult.bpm - lastPeakBPM);
            if (bpmDiff < 2.5) {
                stableStreak = Math.min(20, stableStreak + 1);
            } else {
                stableStreak = 0;
            }
            lastPeakBPM = acfResult.bpm;

            // Fast lock on new tempo (0.85), smooth lock when stable (0.30)
            const smoothFactor = stableStreak >= 4 ? 0.30 : 0.85;
            estimatedBPM = estimatedBPM * (1 - smoothFactor) + acfResult.bpm * smoothFactor;
            tempoConfidence = Math.min(1.0, 0.4 + Math.min(0.6, stableStreak * 0.15));
        }
    } else if (noveltyCount < 120) {
        tempoConfidence = Math.min(0.4, (noveltyCount / 120) * 0.4);
    }

    const tempoBPM = Math.round(estimatedBPM);

    // --- 4/4 MEASURE BEAT TRACKER & METRONOME OSCILLATION ---
    let totalBeatAccumulator = (safePrevState && Number.isFinite(safePrevState.totalBeatAccumulator)) ? safePrevState.totalBeatAccumulator : 0.0;
    const phaseDelta = (tempoBPM / 60.0) * dt;
    totalBeatAccumulator += phaseDelta;

    // Fractional progress inside the current beat (0.0 to 1.0)
    const beatPhase = totalBeatAccumulator % 1.0;
    // Current beat in 4/4 measure (1, 2, 3, 4)
    const currentMeasureBeat = (Math.floor(totalBeatAccumulator) % 4) + 1;

    // Sharp metronome beat pulse (1.0 on beat attack, smooth exponential decay to 0.0)
    const beatPulse = Math.max(0.0, Math.pow(1.0 - beatPhase, 3.0));

    // --- MUSICAL SONG TENSION & PRE-DROP BUILD-UP ENGINE ---
    // Tension increases with high-frequency brightness, riser sweeps and rising energy
    const presenceEnergy = (bands7.presence.rms + bands7.brilliance.rms);
    const songTension = Math.min(1.0, Math.max(0.0, (spectralCentroid * 0.45 + presenceEnergy * 0.35 + Math.min(1.0, dropRatio * 0.5) * 0.20)));

    const alphaTension = Math.min(1.0, dt * 1.5);
    const tensionEMA = prevTensionEMA * (1 - alphaTension) + songTension * alphaTension;
    const isTensionSurging = (songTension > 0.35 && songTension > tensionEMA * 1.12) || (spectralCentroid > 0.40 && presenceEnergy > 0.22);

    // Build-up accumulator (charges up during risers/sweeps/tension, slowly decays)
    let buildUpScore = isTensionSurging
        ? Math.min(1.0, prevBuildUpScore + dt * 0.6)
        : Math.max(0.0, prevBuildUpScore - dt * 0.25);

    // Pre-Drop Bass Cutout / Vacuum Detection (Sub-bass drops out right before the drop)
    const isBassCutout = (bands7.subBass.rms < 0.08 && totalRMS > 0.08);
    let bassCutoutTimer = isBassCutout
        ? Math.min(2.0, prevBassCutoutTimer + dt)
        : Math.max(0.0, prevBassCutoutTimer - dt * 1.2);
    const hadRecentBassCutout = bassCutoutTimer > 0.25;

    // --- DIRECT DYNAMIC & HIGH-VOLUME REACTIVE STROBE TRIGGER LOGIC ---
    const strobeEnabled = safeSettings.strobeEnabled !== undefined ? Boolean(safeSettings.strobeEnabled) : true;
    const dropMode = safeSettings.dropMode || 'Drop-Reaktiv';
    const strobeSensitivity = (typeof safeSettings.strobeSensitivity === 'number' && Number.isFinite(safeSettings.strobeSensitivity))
        ? safeSettings.strobeSensitivity
        : 1.0;
    const strobeIntensitySetting = (typeof safeSettings.strobeIntensity === 'number' && Number.isFinite(safeSettings.strobeIntensity))
        ? safeSettings.strobeIntensity
        : 0.8;
    const strobeSpeedSetting = (typeof safeSettings.strobeSpeed === 'number' && Number.isFinite(safeSettings.strobeSpeed))
        ? safeSettings.strobeSpeed
        : 10;
    const strobeTarget = safeSettings.strobeTarget || 'background';

    const sensFactor = Math.max(0.2, strobeSensitivity);
    // Dynamic energy calculation
    const currentMusicEnergy = (bands7.kick.rms * 0.40 + bands7.subBass.rms * 0.35 + totalRMS * 0.25);
    // User threshold: higher sensitivity (e.g. 1.5 - 2.0) -> lower threshold needed; lower sensitivity -> requires massive volume
    const userThreshold = Math.max(0.15, 0.38 / Math.sqrt(sensFactor));
    const dropThresholdRatio = Math.max(1.18, 1.35 / Math.sqrt(sensFactor));

    let isStrobeActive = false;
    if (strobeEnabled) {
        if (dropMode === 'Continuous' || dropMode === 'Kontinuierlich') {
            isStrobeActive = totalRMS > 0.05;
        } else {
            // 1. War gerade leise und wird plötzlich richtig laut (Dynamischer Energiesprung / Drop-Attacke)
            const isDynamicLoudnessJump = (dropRatio >= dropThresholdRatio || energyRatio >= 1.30) && currentMusicEnergy >= (userThreshold * 0.55);
            // 2. Richtig viel Lautstärke / extremer Pegel gerade da
            const isHighVolumePeak = currentMusicEnergy >= userThreshold;
            // 3. Plötzlicher Kick-Punch / perkussiver Wumms bei solider Lautstärke
            const isHeavyPunchImpact = (beatPunch > 0.60 || kickTransientSpike > 0.16 || bassTransient > 0.20) && currentMusicEnergy >= (userThreshold * 0.60);

            isStrobeActive = isDynamicLoudnessJump || isHighVolumePeak || isHeavyPunchImpact;
        }
    }

    const isDropTriggered = isStrobeActive;
    const isBuildUp = buildUpScore > 0.40 && !isDropTriggered;
    const dropActiveTimer = isStrobeActive ? Math.min(2.0, prevDropActiveTimer + dt) : Math.max(0.0, prevDropActiveTimer - dt * 2.0);
    const cooldownTimer = isStrobeActive ? 1.0 : Math.max(0.0, prevCooldownTimer - dt);

    // --- TEMPO-ADAPTIVE PHYSICS CALCULATIONS ---

    // 1. Volumetric Scale Expansion (Kick-Punch prioritized over static sub-bass)
    const kickPunchBonus = (beatPunch * 2.8 + bands7.kick.rms * 1.5) * bassImpMult;
    const subBassBonus = (bands7.subBass.rms * 1.2) * bassImpMult;
    const midScaleBonus = (mid.rms * 1.0 + midTransient * 0.5) * midImpMult;
    const trebleScaleBonus = (treble.rms * 0.4 + trebleTransient * 0.3) * trebleImpMult;

    // Harmonic Beat Breathing component: subtle sinusoidal pulse in rhythm
    const breathingBonus = beatPulse * 0.15 * (tempoConfidence > 0.4 ? 1.0 : 0.2);

    const baseScaleMultiplier = 1.0 + (kickPunchBonus + subBassBonus + midScaleBonus + trebleScaleBonus + breathingBonus) * beatSensMult;
    const scaleMultiplier = baseScaleMultiplier * radiusMult;

    // 2. Viscosity (Tempo-Adaptive Fluid Resistance)
    // Slower songs (<95 BPM) get higher fluid viscosity (majestic flow), fast songs (130+ BPM) get low viscosity (snappy liquid)
    const tempoViscosityFactor = Math.min(2.0, Math.max(0.5, 1.0 + (110 - tempoBPM) / 80.0));
    const baseViscosity = 1.0 * tempoViscosityFactor;

    const viscosityReduction = (bass.rms * 0.4 + bassDominance * 0.2 + beatPunch * 0.3) * bassImpMult;
    const viscosityIncrease = (treble.rms * 0.8 + mid.rms * 0.4 + trebleDominance * 0.4) * (0.5 * trebleImpMult + 0.5 * midImpMult);
    const rawViscosity = baseViscosity - viscosityReduction + viscosityIncrease;
    const viscosity = Math.max(0.15, Math.min(3.0, rawViscosity));

    // 3. Surface Turbulence & Distortion Ripples
    const baseTurbulence = 0.005;
    const trebleTurbulence = (treble.rms * 0.12 + trebleTransient * 0.08 + hihatTick * 0.08) * trebleImpMult;
    const midTurbulence = (mid.rms * 0.08 + midTransient * 0.05 + snareHit * 0.06) * midImpMult;
    const bassTurbulence = (bass.rms * 0.03 + beatPunch * 0.04) * bassImpMult;

    const turbulence = (baseTurbulence + (trebleTurbulence + midTurbulence + bassTurbulence) * beatSensMult);

    // --- SUSTAINED ENERGY & MOMENTUM ENVELOPE ---
    // Tracks whether the song is in an active/driving/fast part vs a calm/slow part
    const prevSustainedEnergy = (safePrevState && Number.isFinite(safePrevState.sustainedEnergy)) ? safePrevState.sustainedEnergy : 0.0;
    
    // Instantaneous music drive level (volume, bass & transient rhythm density scaled by BPM tempo)
    const tempoDriveFactor = Math.min(2.0, Math.max(0.6, tempoBPM / 120.0));
    const currentActivityLevel = (totalRMS * 2.0 + bass.rms * 1.5 + (rawKickFlux + rawSnareFlux) * 0.9) * tempoDriveFactor;

    // Threshold: below 0.18 is quiet/ambient; above 0.18 activates driving momentum
    const ENERGY_DRIVE_THRESHOLD = 0.18;
    let targetSustained = 0.0;
    if (currentActivityLevel > ENERGY_DRIVE_THRESHOLD) {
        targetSustained = Math.min(1.0, (currentActivityLevel - ENERGY_DRIVE_THRESHOLD) * 1.6);
    }

    // Smooth musical envelope:
    // Fast attack (~150ms) to ramp up when energy starts
    // Smooth release (~1.5s) to stay fast throughout active phases and gently glide down in calm parts
    let sustainedEnergy = prevSustainedEnergy;
    if (targetSustained > prevSustainedEnergy) {
        sustainedEnergy = prevSustainedEnergy + (targetSustained - prevSustainedEnergy) * Math.min(1.0, dt * 6.5);
    } else {
        sustainedEnergy = prevSustainedEnergy - (prevSustainedEnergy - targetSustained) * Math.min(1.0, dt * 0.7);
    }
    sustainedEnergy = Math.max(0.0, Math.min(1.0, sustainedEnergy));

    // 4. Dynamic Continuous Flow Velocity & Energy Acceleration (Non-linear wide-dynamic scaling)
    const tempoSpeedFactor = Math.min(2.0, Math.max(0.5, tempoBPM / 120.0));
    const subBassEnergy = (bands7?.subBass?.rms || bass?.rms || 0);
    const kickEnergy = (bands7?.kick?.rms || bass?.rms || 0);
    const compositeLoudness = (subBassEnergy * 1.5 + kickEnergy * 1.3 + totalRMS * 1.2 + mid.rms * 0.6);
    const dropBoostFactor = isDropTriggered ? 1.5 : 1.0;
    const dynamicCurve = (compositeLoudness + compositeLoudness * compositeLoudness * 0.9) * dropBoostFactor;
    const speed = baseSpeedMult * (1.0 + dynamicCurve * peakSpeedMult * 2.2) * tempoSpeedFactor;
    const flowSpeed = speed / Math.max(0.2, viscosity);

    // 5. Reactive Background Pulse
    const backgroundPulse = Math.min(1.0, (beatPunch * 0.6 + bass.rms * 0.5 + bassTransient * 0.4) * bassImpMult);

    // 6. Impact Metrics
    const lowFreqImpact = (bands7.kick.rms * 1.8 + beatPunch * 1.5) * bassImpMult;
    const midFreqImpact = (mid.rms * 1.5 + snareHit * 1.2) * midImpMult;
    const highFreqJitter = (treble.rms * 1.5 + hihatTick * 1.2) * trebleImpMult;

    // Clone current frequency data for next-frame spectral flux
    const currentSpectrumCopy = frequencyData ? new Uint8Array(frequencyData) : null;

    return {
        // Legacy 3-band metrics (100% backward compatible)
        bass,
        mid,
        treble,
        totalEnergy,
        totalRMS,
        bassDominance,
        midDominance,
        trebleDominance,

        // Detailed 7-band metrics
        bands7,

        // Next-Gen Audio Intelligence Features
        beatPunch,
        snareHit,
        hihatTick,
        sustainedEnergy,
        motionDrive: sustainedEnergy,
        tempoBPM,
        tempoConfidence,
        currentMeasureBeat,
        beatPhase,
        beatPulse,
        spectralCentroid,
        songTension,

        // UI Modifier Outputs
        baseSpeedMult,
        peakSpeedMult,
        beatSensMult,
        speedMult,
        sensMult,

        // Drop & Strobe outputs
        isDropTriggered,
        isStrobeActive: isDropTriggered,
        isBuildUp,
        dropRatio: Number(dropRatio.toFixed(2)),
        energyRatio: Number(energyRatio.toFixed(2)),
        currentMusicEnergy,
        strobeThreshold: userThreshold,
        strobeSpeed: strobeSpeedSetting,
        strobeTarget,
        strobeIntensity: strobeIntensitySetting,
        strobeActiveIntensity: isDropTriggered ? strobeIntensitySetting : 0.0,
        buildUpScore,

        // Reactive background pulse output
        backgroundPulse,

        // Primary physics output parameters
        scaleMultiplier,
        blobSizeMultiplier: scaleMultiplier,
        particleScale: scaleMultiplier,

        viscosity,

        turbulence,
        turbulenceAmplitude: turbulence,

        speed,
        oscillationSpeed: speed,
        flowSpeed,

        lowFreqImpact,
        midFreqImpact,
        highFreqJitter,

        // Updated State for next frame
        state: {
            warmupTimer,
            avgBass,
            avgMid,
            avgTreble,
            avgEnergyFast,
            avgEnergyMed,
            avgEnergyLong,
            tensionEMA,
            buildUpScore,
            bassCutoutTimer,
            dropActiveTimer,
            cooldownTimer,
            prevSpectrum: currentSpectrumCopy,
            noveltyBuffer,
            noveltyIndex,
            noveltyCount,
            timeAccumulatorMs,
            lastPeakBPM,
            stableStreak,
            estimatedBPM,
            tempoConfidence,
            totalBeatAccumulator,
            beatPhase,
            beatPunchDecay: beatPunch,
            snareHitDecay: snareHit,
            sustainedEnergy,
            lastTimestamp: timestamp
        }
    };
}
