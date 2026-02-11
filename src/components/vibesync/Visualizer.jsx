import React, { useRef, useEffect } from 'react';
import { createNoise3D } from 'simplex-noise';

const Visualizer = ({ audioStream, mode, settings, colors }) => {
    const canvasRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const requestRef = useRef(null);
    const noise3D = useRef(createNoise3D()).current;

    // State for visualizer physics
    const timeRef = useRef(0);

    const particlesRef = useRef([]);
    const itemsRef = useRef([]); // Unused?
    const rainRef = useRef([]); // Rain particles
    const lightningRef = useRef([]); // Active lightning bolts
    const lensDropletsRef = useRef([]); // Screen-space water
    const zoomRef = useRef(1.0); // Camera FOV
    const glitchRef = useRef(0); // Glitch frames remaining
    const avgVolumeRef = useRef(0);
    const avgBassRef = useRef(0);
    const avgMidRef = useRef(0);
    const avgTrebleRef = useRef(0);

    // Helper to spawn a new particle off-screen
    const spawnParticle = (width, height, isOffScreen = false) => {
        // If isOffScreen is true, we spawn strictly outside the visible area.
        // Otherwise (initial setup), we spawn randomly inside.

        let x, y;
        const margin = 0.2; // 20% margin outside screen

        if (isOffScreen) {
            // Spawn on one of the 4 sides randomly
            const side = Math.floor(Math.random() * 4);
            if (side === 0) { // Top
                x = Math.random();
                y = -margin;
            } else if (side === 1) { // Right
                x = 1 + margin;
                y = Math.random();
            } else if (side === 2) { // Bottom
                x = Math.random();
                y = 1 + margin;
            } else { // Left
                x = -margin;
                y = Math.random();
            }
        } else {
            x = Math.random();
            y = Math.random();
        }

        // Velocity towards center (roughly)
        // Vector from (x,y) to (0.5, 0.5)
        const dx = 0.5 - x;
        const dy = 0.5 - y;
        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5); // Add randomness
        const velocity = 0.001 + Math.random() * 0.002;

        return {
            x,
            y,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity,
            baseRadius: (0.3 + Math.random() * 0.2), // Fixed base size, scaled by settings in render loop
            colorIndex: Math.floor(Math.random() * colors.length),
            noiseOffsetX: Math.random() * 1000,
            noiseOffsetY: Math.random() * 1000,
            toRemove: false,
            life: 0
        };
    };

    useEffect(() => {
        // Initial Population - Start with few
        particlesRef.current = Array.from({ length: 5 }).map(() => spawnParticle(1, 1, false));
    }, []);

    useEffect(() => {
        if (analyserRef.current && settings.shrinkSpeed !== undefined) {
            // Dynamic Smoothing: 
            // -10 (Slow) -> 0.99 (Very smooth)
            // 0 (Normal) -> 0.9 (Standard)
            // 10 (Fast) -> 0.3 (Raw)

            const val = settings.shrinkSpeed || 0;
            let target = 0.9;
            if (val > 0) target = 0.9 - ((0.9 - 0.3) * (val / 10)); // 0->10 maps to 0.9->0.3
            else target = 0.9 + ((0.99 - 0.9) * (Math.abs(val) / 10)); // 0->-10 maps to 0.9->0.99

            analyserRef.current.smoothingTimeConstant = target;
        }
    }, [settings.shrinkSpeed]);

    // Audio Setup
    useEffect(() => {
        if (!audioStream) return;

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.9; // Default start

        const source = audioCtx.createMediaStreamSource(audioStream);
        source.connect(analyser);

        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;
        sourceRef.current = source;

        return () => {
            source.disconnect();
            analyser.disconnect();
            audioCtx.close();
        };
    }, [audioStream]);

    // Animation Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });

        const render = () => {
            const { width, height } = canvas;
            const minDim = Math.min(width, height);

            // Audio Data
            let frequencyData = new Uint8Array(0);
            let bass = 0, mid = 0, treble = 0; // 0-255
            let volume = 0; // 0-255

            // Need current colors for spawn logic reference, passing via closure might be stale if not careful?
            // Actually colors prop update triggers re-effect, so render loop restarts with new colors. Correct.

            if (analyserRef.current) {
                frequencyData = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(frequencyData);

                const bassEnd = Math.floor(frequencyData.length * 0.15); // Widen bass range (was 0.1)
                const midEnd = Math.floor(frequencyData.length * 0.5);

                let bassSum = 0, midSum = 0, trebleSum = 0;
                for (let i = 0; i < frequencyData.length; i++) {
                    if (i < bassEnd) bassSum += frequencyData[i];
                    else if (i < midEnd) midSum += frequencyData[i];
                    else trebleSum += frequencyData[i];
                }

                bass = (bassSum / bassEnd) || 0;
                mid = (midSum / (midEnd - bassEnd)) || 0;
                treble = (trebleSum / (frequencyData.length - midEnd)) || 0;
                volume = (bass + mid + treble) / 3;

                // Update Running Averages for Transient Detection
                avgBassRef.current = (avgBassRef.current * 0.9) + (bass * 0.1);
                avgMidRef.current = (avgMidRef.current * 0.9) + (mid * 0.1);
                avgTrebleRef.current = (avgTrebleRef.current * 0.9) + (treble * 0.1);
            }

            // Timing
            const speed = settings.speed;

            timeRef.current += 0.002 * speed + (volume / 255) * 0.005;

            // --- VISUALIZATION LOGIC ---

            if (mode === 'liquid') {
                // 1. Layering Fix: Clear / Fade
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
                ctx.fillRect(0, 0, width, height);

                // 2. Background Atmosphere ("The Room")
                // Reactive to Volume + Mids + Highs.
                const energy = ((mid / 255) * 0.5 + (treble / 255) * 0.5);
                const volumeFactor = (volume / 255);
                const atmosOpacity = Math.pow(energy * volumeFactor, 1.5) * 0.8;

                if (atmosOpacity > 0.01) {
                    ctx.fillStyle = settings.bgColor || colors[0];
                    ctx.globalAlpha = atmosOpacity;
                    ctx.fillRect(0, 0, width, height);
                    ctx.globalAlpha = 1.0;
                }

                // 3. Dynamic Population & Blobs (Foreground)
                ctx.globalCompositeOperation = 'screen';
                ctx.filter = 'blur(80px)';

                // Mapping Helper
                const mapSetting = (val, base, min, max) => {
                    if (val === 0) return base;
                    if (val > 0) return base + ((max - base) * (val / 10));
                    return base - ((base - min) * (Math.abs(val) / 10));
                };

                const valSpeed = settings.speed || 0;
                const valCount = settings.particleCount || 0;
                const valSens = settings.sensitivity || 0;
                const valShrink = settings.shrinkSpeed || 0;
                const valRadius = settings.baseRadius || 0;
                const valStrobeThresh = settings.strobeThreshold || 0;
                const valStrobeSpeed = settings.strobeSpeed || 0;

                // Frequency Weights (New)
                const valBassImp = settings.bassImpact || 0;
                const valMidImp = settings.midImpact || 0;
                const valTrebleImp = settings.trebleImpact || 0;

                // --- TUNED MAPPINGS (More Influence) ---
                const mappedSpeedMultiplier = mapSetting(valSpeed, 1.0, 0.05, 20.0);
                const mappedCountMultiplier = mapSetting(valCount, 1.0, 0.1, 5.0);
                const mappedSens = mapSetting(valSens, 1.5, 0.1, 5.0);
                const mappedShrink = mapSetting(valShrink, 0.1, 0.001, 2.0);
                const mappedRadius = mapSetting(valRadius, 1.0, 0.1, 5.0);
                const mappedStrobeThresh = 0.7 - (valStrobeThresh * 0.035);
                const mappedStrobeSpeed = 30 + (valStrobeSpeed * 2.5);

                // 7. Frequency Impact Mappings (User Request: Distinct controls)
                // -10 -> 0x (Off), 0 -> 1x (Standard), 10 -> 6x (High Gain on Transients)
                const mappedBassImp = mapSetting(valBassImp, 1.0, 0.0, 6.0);
                const mappedMidImp = mapSetting(valMidImp, 0.5, 0.0, 6.0);
                const mappedTrebleImp = mapSetting(valTrebleImp, 0.2, 0.0, 6.0);

                // Map smoothness: Update average volume slowly (e.g. 5% per frame)
                // This ensures particle count reflects "Loudness" rather than "Transients"
                avgVolumeRef.current = (avgVolumeRef.current * 0.95) + (volume * 0.05);

                // Map average volume 0-255 to 5-20 blobs
                const targetCount = (5 + Math.floor((avgVolumeRef.current / 255) * 15)) * mappedCountMultiplier;
                const activeParticles = particlesRef.current.filter(p => !p.toRemove);



                // Spawn
                if (activeParticles.length < targetCount) {
                    // 5% chance to spawn per frame to avoid instant flooding
                    if (Math.random() < 0.05) {
                        particlesRef.current.push(spawnParticle(width, height, true));
                    }
                }
                // Despawn
                else if (activeParticles.length > targetCount) {
                    // Mark random excess for removal
                    if (Math.random() < 0.05) {
                        // Find a particle not yet marked
                        const candidates = particlesRef.current.filter(p => !p.toRemove);
                        if (candidates.length > 0) {
                            candidates[0].toRemove = true;
                        }
                    }
                }

                // Cleanup loop
                for (let i = particlesRef.current.length - 1; i >= 0; i--) {
                    const p = particlesRef.current[i];

                    // Movement dynamic logic
                    // User Request: Loud = Fast, Quiet = Slow. Slider = Strength.

                    // Base movement (always moving a little) + Volume influence
                    // settings.speed acts as the "Strength" multiplier
                    const volRatio = volume / 255;

                    // Power curve for speed setting already handled by huge max range (10x)
                    // We just use linear mapping for the multiplier now as 10x is plenty fast.

                    const dynamicSpeed = (0.2 + (volRatio * 5.0)) * mappedSpeedMultiplier;

                    const noiseX = noise3D(p.noiseOffsetX, timeRef.current, 0);
                    const noiseY = noise3D(p.noiseOffsetY, timeRef.current, 100);

                    // Apply dynamic speed to both velocity vector and noise drift
                    p.x += (p.vx + noiseX * 0.002) * dynamicSpeed;
                    p.y += (p.vy + noiseY * 0.002) * dynamicSpeed;

                    // Removal Check
                    if (p.toRemove) {
                        // If off screen (with margin for radius), remove
                        // Radius max is ~0.5 (relative).
                        if (p.x < -0.6 || p.x > 1.6 || p.y < -0.6 || p.y > 1.6) {
                            particlesRef.current.splice(i, 1);
                            continue;
                        }
                    } else {
                        // Keep inside bounds if not removing? 
                        // Or wrap? "Spawn outside" implies they cross the screen.
                        // If they cross and go out the other side, we can just remove them and spawn new ones.
                        // This creates flow.
                        if (p.x < -0.6 || p.x > 1.6 || p.y < -0.6 || p.y > 1.6) {
                            particlesRef.current.splice(i, 1);
                            continue;
                        }
                    }

                    // -- Draw with Pulse Decay --

                    // -- Draw with Pulse Decay --

                    // -- Draw with Pulse Decay --

                    // Current Instant Impact (Custom Frequency Focus)
                    // Logic: Transient Detection (Beat) rather than raw Volume
                    // This prevents "Static Huge" size when sliders are maxed.
                    // We look for parts of the signal that stand out above the running average.

                    // Normalized Transients (0-1 range roughly)
                    const bassT = Math.max(0, (bass - avgBassRef.current * 0.8) / 255);
                    const midT = Math.max(0, (mid - avgMidRef.current * 0.8) / 255);
                    const trebleT = Math.max(0, (treble - avgTrebleRef.current * 0.8) / 255);

                    // Weighted Sum
                    let weightedSum = (bassT * mappedBassImp) + (midT * mappedMidImp) + (trebleT * mappedTrebleImp);

                    // Clamp to 0-1 range (or slightly higher for overdrive)
                    // If everything is maxed, we want it to be huge, but only on beats.
                    // Transients are usually small (0.1 - 0.3), so multiplying by 6.0 gives 0.6 - 1.8. 
                    const targetVolFactor = Math.min(1.2, weightedSum);

                    // Noise Gate: Ignore small fluctuations to prevent "fluttering"
                    // If factor is tiny, kill it.
                    if (targetVolFactor < 0.05) { /* Do nothing or treat as 0? No, let decay handle it. */ }

                    // Smooth Decay Logic with "Snappiness"
                    if (typeof p.currentImpact === 'undefined') p.currentImpact = 0;

                    // Slider controls the "Speed" of change (0.01 to 0.3)
                    // Attack (Growth) Speed: Faster than decay to feel responsive (e.g., 3x)
                    // But capped to prevent instant snapping "glitch" look
                    const attackSpeed = mappedShrink * 3.0;
                    const decaySpeed = mappedShrink;

                    if (targetVolFactor > p.currentImpact) {
                        // Grow towards target
                        p.currentImpact += attackSpeed;
                        if (p.currentImpact > targetVolFactor) p.currentImpact = targetVolFactor;
                    } else {
                        // Shrink towards target (Decay)
                        p.currentImpact -= decaySpeed;
                        if (p.currentImpact < targetVolFactor) p.currentImpact = targetVolFactor;
                    }

                    // Apply Power Curve for internal contrast (Small stay small, Big get HUGE)
                    // Raising to power of 3 makes the difference between 0.5 and 1.0 much larger.
                    const dynamicFactor = Math.pow(p.currentImpact, 3);

                    // Size Scaling
                    // Base size + (dynamic boost * sensitivity)
                    // We increase the multiplier to compensate for the power curve reducing values < 1
                    const sizeFactor = 1 + (dynamicFactor * mappedSens * 2.0);

                    const finalR = p.baseRadius * mappedRadius * minDim * sizeFactor;
                    const x = p.x * width;
                    const y = p.y * height;

                    // Gradient for blob
                    let color = colors[p.colorIndex % colors.length];

                    // --- Strobe Effect ---
                    // Toggle black if volume > threshold AND flicker time
                    // Math.sin uses radians. timeRef increments by ~0.01 per frame.
                    // speed ~30-50.


                    if (volRatio > mappedStrobeThresh) {
                        // Flashing interval
                        if (Math.sin(timeRef.current * mappedStrobeSpeed) > 0) {
                            color = '#000000'; // Black
                        }
                    }

                    const gradient = ctx.createRadialGradient(x, y, 0, x, y, finalR);

                    gradient.addColorStop(0, color);
                    gradient.addColorStop(0.6, color);
                    gradient.addColorStop(1, 'rgba(0,0,0,0)');

                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(x, y, finalR, 0, Math.PI * 2);
                    ctx.fill();

                    // Symmetry (Manual Mirror)
                    if (settings.symmetry) {
                        const mx = width - x;
                        const mGradient = ctx.createRadialGradient(mx, y, 0, mx, y, finalR);
                        mGradient.addColorStop(0, color);
                        mGradient.addColorStop(0.6, color);
                        mGradient.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.fillStyle = mGradient;
                        ctx.beginPath();
                        ctx.arc(mx, y, finalR, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // Reset filter for next frame/other operations if necessary. 
                // Though typical for canvas to reset.
                ctx.filter = 'none';

            } else if (mode === 'quake') {
                ctx.clearRect(0, 0, width, height); // Simple clear
                ctx.filter = 'none';
                ctx.globalCompositeOperation = 'source-over';

                const cx = width / 2;
                const cy = height / 2;

                // Bass Circle
                ctx.beginPath();
                const r = 50 + (bass * 2 * settings.sensitivity);
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = colors[0];
                ctx.fill();

                // Shockwaves
                const waveCount = 5;
                for (let i = 0; i < waveCount; i++) {
                    ctx.beginPath();
                    const waveR = r + (i * 50) + (mid * 0.5);
                    ctx.arc(cx, cy, waveR, 0, Math.PI * 2);
                    ctx.strokeStyle = colors[i % colors.length];
                    ctx.lineWidth = 5 * (treble / 255);
                    ctx.stroke();
                }

            } else if (mode === 'neon') {
                // --- CINEMATIC STORM (LAYERED ARCHITECTURE) ---

                // 1. Precise Audio Extraction & Reaction (Layer B Smoothing)
                // Smoothness: 0 (Hard/Snappy) -> 100 (Soft/Fat)
                const smoothing = 0.4 + (settings.smoothness / 100) * 0.58;
                if (analyserRef.current.smoothingTimeConstant !== smoothing) {
                    analyserRef.current.smoothingTimeConstant = smoothing;
                }

                let subBass = 0, kickBass = 0, lowMid = 0, highTreble = 0;
                if (analyserRef.current) {
                    const binCount = frequencyData.length;
                    const subEnd = Math.floor(binCount * 0.05);
                    const kickEnd = Math.floor(binCount * 0.15);
                    const midEnd = Math.floor(binCount * 0.5);

                    let subSum = 0, kickSum = 0, midSum = 0, trebleSum = 0;
                    for (let i = 0; i < binCount; i++) {
                        if (i < subEnd) subSum += frequencyData[i];
                        else if (i < kickEnd) kickSum += frequencyData[i];
                        else if (i < midEnd) midSum += frequencyData[i];
                        else trebleSum += frequencyData[i];
                    }

                    subBass = Math.pow((subSum / subEnd) / 255, 4);
                    kickBass = Math.pow((kickSum / (kickEnd - subEnd)) / 255, 4);
                    lowMid = Math.pow((midSum / (midEnd - kickEnd)) / 255, 3);
                    highTreble = Math.pow((trebleSum / (binCount - midEnd)) / 255, 3);
                }

                if (!itemsRef.current.lastTreble) itemsRef.current.lastTreble = 0;
                const trebleDelta = highTreble - itemsRef.current.lastTreble;
                itemsRef.current.lastTreble = highTreble;

                // --- LAYER A: AUTONOMOUS NATURE ---
                if (typeof zoomRef.current === 'undefined') zoomRef.current = 1.0;
                const targetZoom = 1.0 + (lowMid * 0.1) - (kickBass * 0.05);
                zoomRef.current += (targetZoom - zoomRef.current) * 0.1;

                // Handheld Drift (Autonomous Camera)
                const driftX = noise3D(0, timeRef.current * 0.1, 100) * 12;
                const driftY = noise3D(100, timeRef.current * 0.1, 200) * 8;
                const driftRot = noise3D(200, timeRef.current * 0.05, 300) * 0.008;

                ctx.save();
                ctx.translate(width / 2 + driftX, height / 2 + driftY);
                ctx.rotate(driftRot);
                ctx.scale(zoomRef.current, zoomRef.current);
                ctx.translate(-width / 2, -height / 2);

                // --- LAYER B: AUDIO MODULATION (SCALABLE IMPACT) ---
                if (kickBass > 0.05) {
                    const s = kickBass * (settings.shakeScale / 5);
                    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
                }

                // 3. Environment: Clouds & Retinal Burn
                if (typeof itemsRef.current.cloudGlow === 'undefined') itemsRef.current.cloudGlow = 0;
                if (settings.retinalBurn) itemsRef.current.cloudGlow *= 0.93;
                else itemsRef.current.cloudGlow = 0;

                // Atmospheric Breathing (Autonomous)
                const breathing = Math.sin(timeRef.current * 0.4) * 4;

                // Color Management (Autonomous Cycle + Audio Modulation)
                if (typeof itemsRef.current.hueCycle === 'undefined') itemsRef.current.hueCycle = 0;
                if (settings.autoCycle) {
                    itemsRef.current.hueCycle += (settings.colorShiftSpeed / 50); // Autonomous shift
                }

                let activeHue = settings.autoCycle ?
                    (itemsRef.current.hueCycle + (kickBass * 30)) % 360 :
                    settings.manualHue;

                const skyR = 5 + (itemsRef.current.cloudGlow * 15) + breathing;
                const skyG = 5 + (itemsRef.current.cloudGlow * 35) + breathing + (activeHue * 0.1);
                const skyB = 15 + (itemsRef.current.cloudGlow * 50) + breathing + (activeHue * 0.2);

                const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
                bgGrad.addColorStop(0, `rgb(${skyR}, ${skyG}, ${skyB})`);
                bgGrad.addColorStop(1, '#000');
                ctx.fillStyle = bgGrad;
                ctx.fillRect(-500, -500, width + 1000, height + 1000);

                const bloomPumping = 1.0 + (kickBass * 0.5);

                // Clouds (Autonomous Motion Layer A)
                const cloudTime = timeRef.current * 0.2;
                const cloudCount = Math.floor(8 + (settings.cloudDensity / 12));
                for (let i = 0; i < cloudCount; i++) {
                    const nVal = noise3D(i * 0.8, cloudTime * 0.1, 0);
                    const x = (i / cloudCount) * width + (nVal * 200);
                    const y = height * 0.15 + noise3D(i * 0.8, cloudTime * 0.2, 10) * 120;
                    const innerGlow = itemsRef.current.cloudGlow * 150;
                    const size = (300 + nVal * 150) * bloomPumping;
                    const cx = x % (width + 600) - 300;

                    const grad = ctx.createRadialGradient(cx, y, 0, cx, y, size);
                    // Sample color from activeHue
                    grad.addColorStop(0, `hsla(${activeHue}, 80%, ${30 + itemsRef.current.cloudGlow * 40}%, 0.6)`);
                    grad.addColorStop(0.5, `hsla(${activeHue}, 60%, 15%, 0.3)`);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');

                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(cx, y, size, 0, Math.PI * 2);
                    ctx.fill();
                }

                // 4. Fog (Layer A/B Hybrid)
                if (settings.floorFog) {
                    const fogDensity = (0.1 + lowMid * 0.4) * bloomPumping;
                    const fogGrad = ctx.createLinearGradient(0, height * 0.6, 0, height);
                    fogGrad.addColorStop(0, 'rgba(0,0,0,0)');
                    fogGrad.addColorStop(1, `hsla(${activeHue}, 50%, 20%, ${fogDensity})`);
                    ctx.fillStyle = fogGrad;
                    ctx.fillRect(-200, height * 0.6, width + 400, height * 0.4);
                }

                // 5. Rain & Turbulence (Layer A Base + Layer B Modulation)
                if (!rainRef.current) rainRef.current = [];
                if (!itemsRef.current.splashes) itemsRef.current.splashes = [];

                // Wind: Base Slant (A) + Reactive Peitschen (B)
                const windX = -(settings.baseWind / 4) - (subBass * (settings.windReactivity / 1.5));

                // Intensity: Base Rain (A) + Audio Growth (B)
                const rainBase = settings.rainAmount / 5;
                const rainIntensity = rainBase + (lowMid * 40 * (settings.rainAmount / 50));

                if (rainRef.current.length < (settings.rainAmount * 25)) {
                    for (let k = 0; k < Math.floor(rainIntensity); k++) {
                        rainRef.current.push({
                            x: Math.random() * (width + 1200) - 600,
                            y: -100,
                            l: Math.random() * 20 + 30,
                            v: Math.random() * 10 + 20 + (kickBass * 40),
                            seed: Math.random() * 1000
                        });
                    }
                }

                ctx.strokeStyle = `hsla(${activeHue}, 60%, 80%, ${0.2 + kickBass * 0.5})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let i = rainRef.current.length - 1; i >= 0; i--) {
                    const r = rainRef.current[i];
                    r.y += r.v;
                    const turbulence = Math.sin(r.y * 0.01 + r.seed) * 3;
                    r.x += windX + turbulence;

                    ctx.moveTo(r.x, r.y);
                    ctx.lineTo(r.x + (windX + turbulence) * 0.6, r.y + r.l);

                    if (r.y > height - 10) {
                        if (Math.random() < 0.25) {
                            itemsRef.current.splashes.push({
                                x: r.x, y: height - 5,
                                vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 6 - 2, life: 1.0
                            });
                        }
                        rainRef.current.splice(i, 1);
                    }
                }
                ctx.stroke();

                // Splashes
                ctx.fillStyle = `hsla(${activeHue}, 50%, 90%, 0.6)`;
                for (let i = itemsRef.current.splashes.length - 1; i >= 0; i--) {
                    const s = itemsRef.current.splashes[i];
                    s.x += s.vx; s.y += s.vy; s.vy += 0.8; s.life -= 0.12;
                    if (s.life <= 0) { itemsRef.current.splashes.splice(i, 1); continue; }
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, 1.5 * s.life, 0, Math.PI * 2);
                    ctx.fill();
                }

                // 6. Lightning (Sensitivty Layer B)
                if (!lightningRef.current) lightningRef.current = [];
                const lSensitivity = 1.1 - (settings.sensitivity / 100);

                if (lightningRef.current.length === 0 && trebleDelta > (0.02 * lSensitivity) && Math.random() < 0.3) {
                    const startX = Math.random() * width;
                    const bolt = { life: 1.0, segments: [], x: startX };
                    let curX = startX, curY = 0;
                    while (curY < height) {
                        const nextX = curX + (Math.random() - 0.5) * 350;
                        const nextY = curY + Math.random() * 150 + 50;
                        bolt.segments.push({ x: curX, y: curY, nx: nextX, ny: nextY });
                        curX = nextX; curY = nextY;
                    }
                    lightningRef.current.push(bolt);
                    itemsRef.current.cloudGlow = 1.2;
                    if (trebleDelta > 0.08) glitchRef.current = 4;

                    // Respect Lightning Flash toggle
                    if (settings.lightningFlash) {
                        ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + highTreble * 0.5})`;
                        ctx.fillRect(-500, -500, width + 1000, height + 1000);
                    }
                }

                // Render Bolts
                for (let i = lightningRef.current.length - 1; i >= 0; i--) {
                    const bolt = lightningRef.current[i];
                    ctx.shadowBlur = 50 * bolt.life * bloomPumping;
                    ctx.shadowColor = `hsla(${activeHue}, 100%, 80%, 1)`;
                    ctx.strokeStyle = `hsla(${activeHue}, 50%, 95%, ${bolt.life})`;
                    ctx.lineWidth = 4 + bolt.life * 8;
                    ctx.beginPath();
                    bolt.segments.forEach(seg => { ctx.moveTo(seg.x, seg.y); ctx.lineTo(seg.nx, seg.ny); });
                    ctx.stroke();
                    bolt.life -= 0.1;
                    if (bolt.life <= 0) lightningRef.current.splice(i, 1);
                }
                ctx.shadowBlur = 0;

                // 7. WET LENS (Modular layer)
                if (settings.lensDroplets) {
                    if (!lensDropletsRef.current) lensDropletsRef.current = [];
                    if ((subBass > 0.2 || highTreble > 0.2) && Math.random() < 0.1) {
                        lensDropletsRef.current.push({
                            x: Math.random() * width, y: Math.random() * height,
                            r: Math.random() * 5 + 3, opacity: 0.8,
                            vx: (Math.random() - 0.5) * 0.5, vy: Math.random() * 2 + 1
                        });
                    }

                    ctx.restore(); ctx.save(); // Screen space
                    for (let i = lensDropletsRef.current.length - 1; i >= 0; i--) {
                        const d = lensDropletsRef.current[i];
                        d.y += d.vy; d.x += d.vx + (kickBass * (Math.random() - 0.5) * 5); d.opacity -= 0.005;
                        if (d.y > height + 20 || d.opacity <= 0) { lensDropletsRef.current.splice(i, 1); continue; }

                        ctx.beginPath();
                        const dropGrad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
                        dropGrad.addColorStop(0, `rgba(255, 255, 255, ${d.opacity * 0.4})`);
                        dropGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.fillStyle = dropGrad;
                        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
                    }
                }

                // 8. GLITCH Artifacts
                if (glitchRef.current > 0) {
                    glitchRef.current--;
                    for (let g = 0; g < 3; g++) {
                        const sy = Math.random() * height;
                        const sh = Math.random() * 100 + 20;
                        const offset = (Math.random() - 0.5) * 100;
                        ctx.drawImage(canvas, 0, sy, width, sh, offset, sy, width, sh);
                    }
                }

                ctx.restore();
            }

            requestRef.current = requestAnimationFrame(render);
        };

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);
        handleResize();

        requestRef.current = requestAnimationFrame(render);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [mode, settings, colors]);

    return <canvas ref={canvasRef} />;
};

export default Visualizer;
