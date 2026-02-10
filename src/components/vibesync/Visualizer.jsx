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
    const avgVolumeRef = useRef(0); // Track average volume for particle count

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

                const bassEnd = Math.floor(frequencyData.length * 0.1);
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
            }

            // Timing
            const speed = settings.speed;
            const isKick = bass > 210; // Slightly higher threshold

            timeRef.current += 0.002 * speed + (volume / 255) * 0.005;

            // --- VISUALIZATION LOGIC ---

            if (mode === 'liquid') {
                // 1. Layering Fix: Clear / Fade
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
                ctx.fillRect(0, 0, width, height);

                // 2. Background Atmosphere ("The Room")
                // Reactive to Volume + Mids + Highs.
                // Formula: Power curve to keep it dark at low volumes, bright at drops.

                // Calculate "Energy" of the room (0-1)
                const energy = ((mid / 255) * 0.5 + (treble / 255) * 0.5);
                // Apply curve: energy^1.5 or energy^2 to make it steeper
                // Also factor in overall volume to ensure silence = black
                const volumeFactor = (volume / 255);

                const atmosOpacity = Math.pow(energy * volumeFactor, 1.5) * 0.8; // Max 0.8 transparency

                if (atmosOpacity > 0.01) {
                    ctx.fillStyle = settings.bgColor || colors[0];
                    ctx.globalAlpha = atmosOpacity;
                    ctx.fillRect(0, 0, width, height);
                    ctx.globalAlpha = 1.0;
                }

                // 3. Dynamic Population & Blobs (Foreground)
                // Set composite to screen for glowing blobs
                ctx.globalCompositeOperation = 'screen';
                ctx.filter = 'blur(80px)'; // Deep blur for blobs

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

                // --- TUNED MAPPINGS (More Influence) ---

                // 1. Speed: 0->1x. 10->20x (Was 10x). -10->0.05x (Almost frozen).
                const mappedSpeedMultiplier = mapSetting(valSpeed, 1.0, 0.05, 20.0);

                // 2. Count: 0->1x. 10->5x (Was 3x). -10->0.1x (Very sparse).
                const mappedCountMultiplier = mapSetting(valCount, 1.0, 0.1, 5.0);

                // 3. Sensitivity: 0->1.5. 10->5.0 (Was 3.0). -10->0.1 (No reaction).
                const mappedSens = mapSetting(valSens, 1.5, 0.1, 5.0);

                // 4. Shrink/Decay: 0->0.1. 10->2.0 (Instant). -10->0.001 (No decay).
                const mappedShrink = mapSetting(valShrink, 0.1, 0.001, 2.0);

                // 5. Radius: 0->1.0. 10->5.0 (Huge). -10->0.1 (Tiny).
                const mappedRadius = mapSetting(valRadius, 1.0, 0.1, 5.0);

                // 6. Strobe Mappings
                // Threshold: Volume (0-1) to trigger. 
                // 0 -> 0.7 (Loudish).
                // 10 -> 0.3 (Triggers constantly).
                // -10 -> 0.95 (Only max peaks).
                // Note: Logic inverted for UI feel? "More Strobe" (10) should trigger easier? Yes.
                // 10 -> Lower threshold. -10 -> Higher threshold.
                const mappedStrobeThresh = 0.7 - (valStrobeThresh * 0.035);

                // Speed: Filter frequency.
                // 0 -> 30hz? 
                // 10 -> 80hz.
                // -10 -> 5hz.
                const mappedStrobeSpeed = 30 + (valStrobeSpeed * 2.5);

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

                    // Current Instant Impact (Aggressive Bass Focus)
                    const targetImpact = (bass * 0.95) + (mid * 0.05); // 0-255 scaling
                    let targetVolFactor = targetImpact / 255; // 0-1

                    // Noise Gate: Ignore small fluctuations to prevent "fluttering"
                    if (targetVolFactor < 0.15) targetVolFactor = 0;

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
                // Trail effect for Neon
                ctx.filter = 'blur(2px)';
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = `rgba(0, 0, 0, ${1 - settings.trails})`;
                ctx.fillRect(0, 0, width, height);

                ctx.globalCompositeOperation = 'screen';
                const barWidth = width / frequencyData.length;

                ctx.beginPath();
                for (let i = 0; i < frequencyData.length; i++) {
                    const v = frequencyData[i];
                    const h = (v / 255) * height * settings.sensitivity;
                    const x = i * barWidth;

                    if (i % 8 === 0) {
                        ctx.beginPath();
                        ctx.moveTo(x, height / 2);
                        ctx.lineTo(x + (Math.random() - 0.5) * 20, height / 2 - (h / 2));
                        ctx.lineTo(x, height / 2 - h);

                        ctx.strokeStyle = colors[i % colors.length];
                        ctx.lineWidth = 3;
                        ctx.stroke();
                    }
                }
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
