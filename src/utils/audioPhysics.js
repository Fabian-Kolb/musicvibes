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

        return {
            energy,
            rms,
            peak,
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
    const prevBass = (safePrevState && Number.isFinite(safePrevState.avgBass)) ? safePrevState.avgBass : bass.peak;
    const prevMid = (safePrevState && Number.isFinite(safePrevState.avgMid)) ? safePrevState.avgMid : mid.peak;
    const prevTreble = (safePrevState && Number.isFinite(safePrevState.avgTreble)) ? safePrevState.avgTreble : treble.peak;

    const avgBass = prevBass * 0.9 + bass.peak * 0.1;
    const avgMid = prevMid * 0.9 + mid.peak * 0.1;
    const avgTreble = prevTreble * 0.9 + treble.peak * 0.1;

    // Dual-Window Energy Ratio for Drops
    const prevBassShort = (safePrevState && Number.isFinite(safePrevState.avgBassShort)) ? safePrevState.avgBassShort : bass.rms;
    const prevBassLong = (safePrevState && Number.isFinite(safePrevState.avgBassLong)) ? safePrevState.avgBassLong : Math.max(0.05, bass.rms);
    const prevRMSLong = (safePrevState && Number.isFinite(safePrevState.avgRMSLong)) ? safePrevState.avgRMSLong : Math.max(0.05, totalRMS);

    const avgBassShort = prevBassShort * 0.65 + bass.rms * 0.35;
    const avgBassLong = prevBassLong * 0.985 + bass.rms * 0.015;
    const avgRMSLong = prevRMSLong * 0.99 + totalRMS * 0.01;

    const dropRatio = avgBassShort / (avgBassLong + 1e-4);
    const energyRatio = totalRMS / (avgRMSLong + 1e-4);
    const bassDelta = Math.max(0, bass.peak - avgBassLong);

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

    // Dynamic Attack / Decay Smoothing for discrete beat impulses
    const prevBeatPunch = (safePrevState && Number.isFinite(safePrevState.beatPunchDecay)) ? safePrevState.beatPunchDecay : 0.0;
    const prevSnareHit = (safePrevState && Number.isFinite(safePrevState.snareHitDecay)) ? safePrevState.snareHitDecay : 0.0;

    const targetKickPunch = Math.min(1.0, (rawKickFlux * 1.5 + bassTransient * 1.2) * bassImpMult);
    const beatPunch = targetKickPunch > prevBeatPunch ? targetKickPunch : prevBeatPunch * 0.80;

    const targetSnareHit = Math.min(1.0, (rawSnareFlux * 1.4 + midTransient * 0.8) * midImpMult);
    const snareHit = targetSnareHit > prevSnareHit ? targetSnareHit : prevSnareHit * 0.82;

    const hihatTick = Math.min(1.0, (rawHihatFlux * 1.2 + trebleTransient * 0.6) * trebleImpMult);

    // --- REAL-TIME BPM & TEMPO ESTIMATION ---
    const lastTimestamp = (safePrevState && Number.isFinite(safePrevState.lastTimestamp)) ? safePrevState.lastTimestamp : timestamp;
    const dt = Math.max(0.001, Math.min(0.2, (timestamp - lastTimestamp) / 1000.0));

    let kickOnsets = (safePrevState && Array.isArray(safePrevState.kickOnsets)) ? [...safePrevState.kickOnsets] : [];
    let lastKickTime = (safePrevState && Number.isFinite(safePrevState.lastKickTime)) ? safePrevState.lastKickTime : 0;
    let estimatedBPM = (safePrevState && Number.isFinite(safePrevState.estimatedBPM)) ? safePrevState.estimatedBPM : 120;
    let tempoConfidence = (safePrevState && Number.isFinite(safePrevState.tempoConfidence)) ? safePrevState.tempoConfidence : 0.5;

    // Detect discrete Kick onset (true rising attack edge with minimum debounce time of 220ms)
    const isKickOnset = targetKickPunch > 0.35 && targetKickPunch >= prevBeatPunch && (timestamp - lastKickTime) > 220;
    if (isKickOnset) {
        lastKickTime = timestamp;
        kickOnsets.push(timestamp);
        // Keep only onsets within the last 4 seconds
        kickOnsets = kickOnsets.filter(t => (timestamp - t) <= 4000);

        if (kickOnsets.length >= 3) {
            // Compute Inter-Onset Intervals (IOI)
            const intervals = [];
            for (let i = 1; i < kickOnsets.length; i++) {
                const intervalMs = kickOnsets[i] - kickOnsets[i - 1];
                if (intervalMs >= 240 && intervalMs <= 1100) { // 55 BPM to 250 BPM range
                    intervals.push(intervalMs);
                }
            }

            if (intervals.length >= 2) {
                // Calculate median interval
                intervals.sort((a, b) => a - b);
                const medianIntervalMs = intervals[Math.floor(intervals.length / 2)];
                let instantBPM = 60000.0 / medianIntervalMs;

                // Fold BPM into standard music range [70, 180]
                while (instantBPM < 70) instantBPM *= 2;
                while (instantBPM > 180) instantBPM /= 2;

                // Smooth BPM update via EMA
                estimatedBPM = estimatedBPM * 0.70 + instantBPM * 0.30;
                tempoConfidence = Math.min(1.0, tempoConfidence + 0.15);
            }
        }
    } else {
        // Slow confidence decay when no onsets occur
        tempoConfidence = Math.max(0.2, tempoConfidence - (dt * 0.05));
    }

    const tempoBPM = Math.round(estimatedBPM);

    // --- BEAT PHASE & HARMONIC OSCILLATION ---
    let beatPhase = (safePrevState && Number.isFinite(safePrevState.beatPhase)) ? safePrevState.beatPhase : 0.0;
    const phaseDelta = (tempoBPM / 60.0) * dt;
    beatPhase = (beatPhase + phaseDelta) % 1.0;

    // Harmonic beat breathing pulse (0.0 to 1.0)
    const beatPulse = 0.5 + 0.5 * Math.sin(beatPhase * 2.0 * Math.PI - (Math.PI / 2));

    // Musical Song Tension (rising spectral centroid + rising energy before drops)
    const songTension = Math.min(1.0, (spectralCentroid * 0.5 + energyRatio * 0.3 + bands7.presence.energy * 0.2));

    // --- STROBE & DROP TRIGGER LOGIC ---
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

    const userThreshold = (typeof safeSettings.strobeThreshold === 'number' && Number.isFinite(safeSettings.strobeThreshold) && safeSettings.strobeThreshold > 0)
        ? safeSettings.strobeThreshold
        : Math.max(0.18, 0.45 / Math.max(0.1, strobeSensitivity));

    const currentMusicEnergy = bass.rms * 0.60 + totalRMS * 0.40;
    const dropThresholdRatio = Math.max(1.15, 1.30 / Math.max(0.1, strobeSensitivity));

    let isDropTriggered = false;
    if (strobeEnabled) {
        if (dropMode === 'Continuous' || dropMode === 'Kontinuierlich') {
            isDropTriggered = totalRMS > 0.05;
        } else {
            const energyAboveThreshold = currentMusicEnergy >= userThreshold;
            const dynamicEnergyJump = energyRatio > 1.25 || dropRatio > dropThresholdRatio;
            const suddenBassJump = bassDelta > 0.15 || (bassTransient > 0.20 && bass.rms > 0.20) || beatPunch > 0.70;
            isDropTriggered = energyAboveThreshold && (dynamicEnergyJump || suddenBassJump);
        }
    }

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

    // 4. Oscillation Speed & Flow Velocity (Tempo scaled)
    const tempoSpeedFactor = Math.min(2.0, Math.max(0.5, tempoBPM / 120.0));
    const baseOscSpeed = 0.2 * baseSpeedMult * tempoSpeedFactor;
    const energySpeed = (totalRMS * 1.5 + treble.rms * 1.8 * trebleImpMult + mid.rms * 1.0 * midImpMult + beatPunch * 1.2) * beatSensMult * peakSpeedMult;
    const speed = baseOscSpeed + energySpeed;
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
        tempoBPM,
        tempoConfidence,
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
        dropRatio,
        currentMusicEnergy,
        strobeThreshold: userThreshold,
        strobeSpeed: strobeSpeedSetting,
        strobeTarget,
        strobeIntensity: strobeIntensitySetting,
        strobeActiveIntensity: isDropTriggered ? strobeIntensitySetting : 0.0,

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
            avgBass,
            avgMid,
            avgTreble,
            avgBassShort,
            avgBassLong,
            avgRMSLong,
            prevSpectrum: currentSpectrumCopy,
            kickOnsets,
            lastKickTime,
            estimatedBPM,
            tempoConfidence,
            beatPhase,
            beatPunchDecay: beatPunch,
            snareHitDecay: snareHit,
            lastTimestamp: timestamp
        }
    };
}
