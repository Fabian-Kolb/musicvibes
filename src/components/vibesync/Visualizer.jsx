import React, { useRef, useEffect, useCallback } from 'react';
import { createNoise3D } from 'simplex-noise';
import { calculateAudioPhysics, mapSetting } from '../../utils/audioPhysics.js';

// GLSL ES 3.0 (WebGL2) Vertex Shader
const vsSourceGL2 = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// GLSL ES 3.0 (WebGL2) Fragment Shader
const fsSourceGL2 = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform int u_blobCount;
uniform vec4 u_blobs[16];
uniform vec3 u_blobColors[16];
uniform float u_viscosity;
uniform float u_turbulence;
uniform vec3 u_bgColor;
uniform float u_audioRMS;
uniform float u_bassPeak;
uniform float u_bgPulse;
uniform float u_strobePulse;
uniform int u_strobeTarget;

void main() {
    vec2 st = gl_FragCoord.xy;
    vec2 uv = st / u_resolution;
    
    // Organic liquid ripple displacement driven by u_turbulence and u_time
    vec2 turbOffset = vec2(
        sin(st.y * 0.012 + u_time * 2.5),
        cos(st.x * 0.012 + u_time * 2.5)
    ) * (u_turbulence * 45.0);
    vec2 p = st + turbOffset;

    // R4: Reactive Background (Gently pulses in brightness and saturation in sync with bass hits)
    float bgLuminance = dot(u_bgColor, vec3(0.299, 0.587, 0.114));
    vec3 desaturatedBg = vec3(bgLuminance);
    vec3 satBg = mix(desaturatedBg, u_bgColor, 1.0 + u_bgPulse * 0.6);
    vec3 reactiveBg = satBg * (1.0 + u_bgPulse * 0.45);

    // Audio-reactive vignette
    float distFromCenter = length(uv - vec2(0.5));
    float vignette = smoothstep(0.85, 0.25, distFromCenter);
    reactiveBg = reactiveBg * (0.7 + 0.3 * vignette);

    // R2: Strobe Target Selection (0 = background, 1 = particles)
    vec3 finalBg = reactiveBg;
    vec3 flashColor = vec3(1.0, 1.0, 1.0);

    if (u_strobeTarget == 0) {
        // Background flashes while particles remain visible
        finalBg = mix(reactiveBg, flashColor, clamp(u_strobePulse * 0.65, 0.0, 0.75));
    }

    // R1: 2D Soft-edge metaball calculation (No 3D lighting, no hard edges)
    float S = 0.0;
    vec3 weightedColorSum = vec3(0.0);
    float weightSum = 0.0;
    float eps = 0.0001;

    for (int i = 0; i < 16; i++) {
        if (i >= u_blobCount) break;
        
        vec4 blob = u_blobs[i];
        vec2 blobPos = blob.xy * u_resolution;
        float radius = max(blob.z, 1.0);
        float intensity = max(blob.w, 0.1);
        
        vec2 diff = p - blobPos;
        float dist = length(diff);
        float normDist = dist / (radius * sqrt(intensity));
        
        if (normDist < 1.0) {
            float falloff = 1.0 - normDist * normDist;
            float w = falloff * falloff;
            
            S += w;
            weightedColorSum += w * u_blobColors[i];
            weightSum += w;
        }
    }

    // Normalized weighted color blending (prevents additive white clipping)
    vec3 blobColor = (weightSum > eps) ? (weightedColorSum / weightSum) : finalBg;

    // Feathered density alpha mapping using smoothstep for soft 2D circle perimeters
    float densityFactor = 1.2 / max(u_viscosity, 0.2);
    float softAlpha = smoothstep(0.0, 1.0, clamp(S * densityFactor, 0.0, 1.0));

    if (u_strobeTarget == 1) {
        // Particles flash/hide while background remains visible
        softAlpha *= (1.0 - u_strobePulse * 0.95);
        blobColor = mix(blobColor, flashColor, u_strobePulse * 0.4);
    }

    // Final 2D soft-edge composite
    vec3 finalColor = mix(finalBg, blobColor, softAlpha);

    fragColor = vec4(finalColor, 1.0);
}
`;

// GLSL ES 1.0 (WebGL1 Fallback) Vertex Shader
const vsSourceGL1 = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// GLSL ES 1.0 (WebGL1 Fallback) Fragment Shader
const fsSourceGL1 = `
precision highp float;

varying vec2 v_uv;

uniform vec2 u_resolution;
uniform float u_time;
uniform int u_blobCount;
uniform vec4 u_blobs[16];
uniform vec3 u_blobColors[16];
uniform float u_viscosity;
uniform float u_turbulence;
uniform vec3 u_bgColor;
uniform float u_audioRMS;
uniform float u_bassPeak;
uniform float u_bgPulse;
uniform float u_strobePulse;
uniform int u_strobeTarget;

void main() {
    vec2 st = gl_FragCoord.xy;
    vec2 uv = st / u_resolution;
    
    // Organic liquid ripple displacement driven by u_turbulence and u_time
    vec2 turbOffset = vec2(
        sin(st.y * 0.012 + u_time * 2.5),
        cos(st.x * 0.012 + u_time * 2.5)
    ) * (u_turbulence * 45.0);
    vec2 p = st + turbOffset;

    // R4: Reactive Background (Gently pulses in brightness and saturation in sync with bass hits)
    float bgLuminance = dot(u_bgColor, vec3(0.299, 0.587, 0.114));
    vec3 desaturatedBg = vec3(bgLuminance);
    vec3 satBg = mix(desaturatedBg, u_bgColor, 1.0 + u_bgPulse * 0.6);
    vec3 reactiveBg = satBg * (1.0 + u_bgPulse * 0.45);

    // Audio-reactive vignette
    float distFromCenter = length(uv - vec2(0.5));
    float vignette = smoothstep(0.85, 0.25, distFromCenter);
    reactiveBg = reactiveBg * (0.7 + 0.3 * vignette);

    // R2: Strobe Target Selection (0 = background, 1 = particles)
    vec3 finalBg = reactiveBg;
    vec3 flashColor = vec3(1.0, 1.0, 1.0);

    if (u_strobeTarget == 0) {
        // Background flashes while particles remain visible
        finalBg = mix(reactiveBg, flashColor, clamp(u_strobePulse * 0.65, 0.0, 0.75));
    }

    // R1: 2D Soft-edge metaball calculation (No 3D lighting, no hard edges)
    float S = 0.0;
    vec3 weightedColorSum = vec3(0.0);
    float weightSum = 0.0;
    float eps = 0.0001;

    for (int i = 0; i < 16; i++) {
        if (i >= u_blobCount) break;
        
        vec4 blob = u_blobs[i];
        vec2 blobPos = blob.xy * u_resolution;
        float radius = max(blob.z, 1.0);
        float intensity = max(blob.w, 0.1);
        
        vec2 diff = p - blobPos;
        float dist = length(diff);
        float normDist = dist / (radius * sqrt(intensity));
        
        if (normDist < 1.0) {
            float falloff = 1.0 - normDist * normDist;
            float w = falloff * falloff;
            
            S += w;
            weightedColorSum += w * u_blobColors[i];
            weightSum += w;
        }
    }

    // Normalized weighted color blending (prevents additive white clipping)
    vec3 blobColor = (weightSum > eps) ? (weightedColorSum / weightSum) : finalBg;

    // Feathered density alpha mapping using smoothstep for soft 2D circle perimeters
    float densityFactor = 1.2 / max(u_viscosity, 0.2);
    float softAlpha = smoothstep(0.0, 1.0, clamp(S * densityFactor, 0.0, 1.0));

    if (u_strobeTarget == 1) {
        // Particles flash/hide while background remains visible
        softAlpha *= (1.0 - u_strobePulse * 0.95);
        blobColor = mix(blobColor, flashColor, u_strobePulse * 0.4);
    }

    // Final 2D soft-edge composite
    vec3 finalColor = mix(finalBg, blobColor, softAlpha);

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

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

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

function initWebGL(canvas) {
    let gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
    let isWebGL2 = true;

    if (!gl) {
        gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false }) ||
             canvas.getContext('experimental-webgl');
        isWebGL2 = false;
    }

    if (!gl) {
        console.error('WebGL is not supported on this browser/device.');
        return null;
    }

    if (!isWebGL2) {
        gl.getExtension('OES_standard_derivatives');
    }

    const program = isWebGL2
        ? createProgram(gl, vsSourceGL2, fsSourceGL2)
        : createProgram(gl, vsSourceGL1, fsSourceGL1);

    if (!program) return null;

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const quadVertices = new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
         1.0,  1.0
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const locs = {
        u_resolution: gl.getUniformLocation(program, 'u_resolution'),
        u_time: gl.getUniformLocation(program, 'u_time'),
        u_blobCount: gl.getUniformLocation(program, 'u_blobCount'),
        u_blobs: gl.getUniformLocation(program, 'u_blobs[0]') || gl.getUniformLocation(program, 'u_blobs'),
        u_blobColors: gl.getUniformLocation(program, 'u_blobColors[0]') || gl.getUniformLocation(program, 'u_blobColors'),
        u_viscosity: gl.getUniformLocation(program, 'u_viscosity'),
        u_turbulence: gl.getUniformLocation(program, 'u_turbulence'),
        u_bgColor: gl.getUniformLocation(program, 'u_bgColor'),
        u_audioRMS: gl.getUniformLocation(program, 'u_audioRMS'),
        u_bassPeak: gl.getUniformLocation(program, 'u_bassPeak'),
        u_bgPulse: gl.getUniformLocation(program, 'u_bgPulse'),
        u_strobePulse: gl.getUniformLocation(program, 'u_strobePulse'),
        u_strobeTarget: gl.getUniformLocation(program, 'u_strobeTarget')
    };

    return { gl, program, positionBuffer, locs };
}

const noise3D = createNoise3D();

const DEFAULT_COLORS = ['#ff007f', '#00f0ff', '#7000ff', '#ff003c', '#00ffcc'];

const Visualizer = ({ audioStream, settings, colors }) => {
    const canvasRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const requestRef = useRef(null);

    const timeRef = useRef(0);
    const particlesRef = useRef([]);
    const physicsStateRef = useRef(null);
    const prevSpectrumRef = useRef(null);
    const avgVolumeRef = useRef(0);
    const avgBassRef = useRef(0);
    const strobeEnvelopeRef = useRef(0);

    const safeColors = (Array.isArray(colors) && colors.length > 0) ? colors : DEFAULT_COLORS;
    const safeSettings = (settings && typeof settings === 'object') ? settings : {};

    const spawnParticle = useCallback((isOffScreen = false) => {
        let x, y;
        const margin = 0.2;

        if (isOffScreen) {
            const side = Math.floor(Math.random() * 4);
            if (side === 0) {
                x = Math.random();
                y = -margin;
            } else if (side === 1) {
                x = 1 + margin;
                y = Math.random();
            } else if (side === 2) {
                x = Math.random();
                y = 1 + margin;
            } else {
                x = -margin;
                y = Math.random();
            }
        } else {
            x = Math.random();
            y = Math.random();
        }

        const dx = 0.5 - x;
        const dy = 0.5 - y;
        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5);
        const velocity = 0.001 + Math.random() * 0.002;

        return {
            x,
            y,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity,
            baseRadius: (0.3 + Math.random() * 0.2),
            colorIndex: Math.floor(Math.random() * safeColors.length),
            noiseOffsetX: Math.random() * 1000,
            noiseOffsetY: Math.random() * 1000,
            toRemove: false,
            currentImpact: 0
        };
    }, [safeColors]);

    // R3: Hardcoded minimum visible particle threshold = 5
    const MIN_VISIBLE_PARTICLES = 5;

    useEffect(() => {
        particlesRef.current = Array.from({ length: MIN_VISIBLE_PARTICLES }).map(() => spawnParticle(false));
    }, [spawnParticle]);

    useEffect(() => {
        if (analyserRef.current && safeSettings.shrinkSpeed !== undefined) {
            const val = safeSettings.shrinkSpeed || 0;
            let target = 0.9;
            if (val > 0) target = 0.9 - ((0.9 - 0.3) * (val / 10));
            else target = 0.9 + ((0.99 - 0.9) * (Math.abs(val) / 10));

            analyserRef.current.smoothingTimeConstant = target;
        }
    }, [safeSettings.shrinkSpeed]);

    useEffect(() => {
        if (!audioStream) {
            if (sourceRef.current) {
                try { sourceRef.current.disconnect(); } catch { /* ignore */ }
                sourceRef.current = null;
            }
            if (analyserRef.current) {
                try { analyserRef.current.disconnect(); } catch { /* ignore */ }
                analyserRef.current = null;
            }
            if (audioContextRef.current) {
                try { audioContextRef.current.close(); } catch { /* ignore */ }
                audioContextRef.current = null;
            }
            return;
        }

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.9;

        const source = audioCtx.createMediaStreamSource(audioStream);
        source.connect(analyser);

        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;
        sourceRef.current = source;

        return () => {
            if (sourceRef.current) {
                try { sourceRef.current.disconnect(); } catch { /* ignore */ }
                sourceRef.current = null;
            }
            if (analyserRef.current) {
                try { analyserRef.current.disconnect(); } catch { /* ignore */ }
                analyserRef.current = null;
            }
            if (audioContextRef.current) {
                try { audioContextRef.current.close(); } catch { /* ignore */ }
                audioContextRef.current = null;
            }
        };
    }, [audioStream]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const webglCtx = initWebGL(canvas);
        if (!webglCtx) {
            console.error("Failed to initialize WebGL context.");
            return;
        }

        const { gl, locs, positionBuffer } = webglCtx;
        const blobsData = new Float32Array(64);
        const blobColorsData = new Float32Array(48);

        const render = () => {
            const width = canvas.width;
            const height = canvas.height;
            const minDim = Math.min(width, height);

            gl.viewport(0, 0, width, height);

            // Audio Analysis & Audio Physics
            let frequencyData = new Uint8Array(0);
            if (analyserRef.current && audioContextRef.current) {
                if (analyserRef.current.fftSize !== 1024) {
                    analyserRef.current.fftSize = 1024;
                }
                frequencyData = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(frequencyData);
            }

            const sampleRate = audioContextRef.current ? audioContextRef.current.sampleRate : 44100;
            const fftSize = analyserRef.current ? analyserRef.current.fftSize : 1024;
            const nowMs = performance.now();

            const audioPhysics = calculateAudioPhysics({
                frequencyData,
                prevFrequencyData: prevSpectrumRef.current,
                timestamp: nowMs,
                sampleRate,
                fftSize,
                settings: safeSettings,
                prevState: physicsStateRef.current
            });
            physicsStateRef.current = audioPhysics.state;
            if (frequencyData && frequencyData.length > 0) {
                prevSpectrumRef.current = new Uint8Array(frequencyData);
            }

            // UI Control Modifiers
            const valBaseSpeed = safeSettings.baseSpeed !== undefined ? safeSettings.baseSpeed : (safeSettings.speed || 0);
            const valPeakSpeed = safeSettings.peakSpeed !== undefined ? safeSettings.peakSpeed : 0;
            const valBeatSens = safeSettings.beatSensitivity !== undefined ? safeSettings.beatSensitivity : (safeSettings.sensitivity || 0);
            const valShrink = safeSettings.shrinkSpeed || 0;
            const valRadius = safeSettings.baseRadius || 0;
            const valBassImp = safeSettings.bassImpact || 0;

            const mappedBaseSpeed = mapSetting(valBaseSpeed, 1.0, 0.05, 20.0);
            const mappedPeakSpeed = mapSetting(valPeakSpeed, 1.0, 0.0, 5.0);
            const mappedBeatSens = mapSetting(valBeatSens, 1.5, 0.1, 5.0);
            const mappedShrink = mapSetting(valShrink, 0.1, 0.001, 2.0);
            const mappedRadius = mapSetting(valRadius, 1.0, 0.1, 5.0);
            const mappedBassImp = mapSetting(valBassImp, 1.0, 0.0, 4.0);

            // Strobe Flash Pulse Calculation
            const strobeEnabled = safeSettings.strobeEnabled !== undefined ? Boolean(safeSettings.strobeEnabled) : true;
            const strobeIntensitySetting = typeof safeSettings.strobeIntensity === 'number' ? safeSettings.strobeIntensity : 0.8;
            const strobeSpeedSetting = typeof safeSettings.strobeSpeed === 'number' ? safeSettings.strobeSpeed : (audioPhysics.strobeSpeed || 10);
            const strobeTarget = safeSettings.strobeTarget || 'background';

            // Strobe pulse oscillation rate (5 Hz to 25 Hz based on strobeSpeed)
            const flashFreq = 5.0 + (strobeSpeedSetting * 1.0);
            const currentTimeSec = performance.now() / 1000.0;

            // R2: Strobe Envelope stays active while drop/chorus energy > threshold
            if (strobeEnabled && audioPhysics.isDropTriggered) {
                strobeEnvelopeRef.current = Math.min(1.0, strobeEnvelopeRef.current + 0.15);
            } else {
                strobeEnvelopeRef.current *= 0.88;
                if (strobeEnvelopeRef.current < 0.005) strobeEnvelopeRef.current = 0;
            }

            let currentStrobePulse = 0.0;
            if (strobeEnabled && strobeEnvelopeRef.current > 0.001) {
                const flashOsc = Math.abs(Math.sin(currentTimeSec * flashFreq * Math.PI));
                currentStrobePulse = flashOsc * strobeEnvelopeRef.current * strobeIntensitySetting;
            }

            // Update Time with tempo & speed scaling
            timeRef.current += 0.002 * mappedBaseSpeed * audioPhysics.speed;

            // R3: Hardcoded minimum visible particle threshold = 5
            avgVolumeRef.current = (avgVolumeRef.current * 0.95) + ((audioPhysics.totalRMS * 255) * 0.05);
            
            const userSettingVal = safeSettings.maxParticles !== undefined ? safeSettings.maxParticles : 12;
            const clampedMaxSetting = Math.min(16, Math.max(MIN_VISIBLE_PARTICLES, userSettingVal));
            const userMaxParticles = safeSettings.symmetry ? Math.min(8, clampedMaxSetting) : clampedMaxSetting;
            const volumeRatio = Math.min(1.0, Math.max(0.0, avgVolumeRef.current / 255.0));

            const targetCount = Math.min(
                userMaxParticles,
                Math.max(MIN_VISIBLE_PARTICLES, Math.floor(MIN_VISIBLE_PARTICLES + (userMaxParticles - MIN_VISIBLE_PARTICLES) * volumeRatio))
            );

            // Instant replenishment inside viewport if particle count drops below MIN_VISIBLE_PARTICLES (5)
            while (particlesRef.current.filter(p => !p.toRemove).length < MIN_VISIBLE_PARTICLES) {
                particlesRef.current.push(spawnParticle(false));
            }

            const activeParticles = particlesRef.current.filter(p => !p.toRemove);

            if (activeParticles.length < targetCount) {
                if (Math.random() < 0.05) {
                    particlesRef.current.push(spawnParticle(true));
                }
            } else if (activeParticles.length > targetCount) {
                if (Math.random() < 0.05) {
                    const candidates = particlesRef.current.filter(p => !p.toRemove);
                    if (candidates.length > MIN_VISIBLE_PARTICLES) {
                        candidates[0].toRemove = true;
                    }
                }
            }

            // Particle Motion & Uniform Packing
            for (let i = particlesRef.current.length - 1; i >= 0; i--) {
                const p = particlesRef.current[i];

                // Dynamic speed with kick-punch impulse boost and tempo adaptation
                const kickPunchBoost = (audioPhysics.beatPunch || 0) * 2.2 * mappedPeakSpeed;
                const dynamicSpeed = (0.2 * mappedBaseSpeed + (audioPhysics.totalRMS * 4.5 * mappedPeakSpeed) + kickPunchBoost) * (audioPhysics.speed / Math.max(0.2, audioPhysics.viscosity));
                const noiseAmplitude = 0.002 + (audioPhysics.turbulence * 0.4);

                const noiseX = noise3D(p.noiseOffsetX, timeRef.current, 0);
                const noiseY = noise3D(p.noiseOffsetY, timeRef.current, 100);

                // Centripetal attraction towards screen center (0.5, 0.5) during low audio volume / lulls
                if (volumeRatio < 0.25 || (audioPhysics.totalRMS || 0) < 0.15) {
                    const dx = 0.5 - p.x;
                    const dy = 0.5 - p.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 0.02) {
                        const lowVolRatio = Math.min(1.0, Math.max(volumeRatio, audioPhysics.totalRMS || 0));
                        const pullFactor = 0.001 * (1.0 - (lowVolRatio / 0.25));
                        p.vx += (dx / dist) * pullFactor;
                        p.vy += (dy / dist) * pullFactor;
                        p.vx *= 0.98;
                        p.vy *= 0.98;
                    }
                }

                p.x += (p.vx + noiseX * noiseAmplitude) * dynamicSpeed;
                p.y += (p.vy + noiseY * noiseAmplitude) * dynamicSpeed;

                if (p.toRemove || p.x < -0.6 || p.x > 1.6 || p.y < -0.6 || p.y > 1.6) {
                    particlesRef.current.splice(i, 1);
                    continue;
                }

                // R1: Bass- & Kick-driven volumetric expansion & pulse attack/decay
                const bassPeak = audioPhysics.bass.peak;
                const bassT = Math.max(0, (bassPeak * 255 - avgBassRef.current * 0.8) / 255);
                avgBassRef.current = (avgBassRef.current * 0.9) + (bassPeak * 255 * 0.1);

                // Kick-punch provides immediate discrete attack without muddy sub-bass bloating
                const beatPunchImpact = (audioPhysics.beatPunch || 0) * 3.5;
                const weightedSizeSum = (beatPunchImpact * mappedBassImp + bassT * mappedBassImp * 2.0 + audioPhysics.bass.rms * 1.5) * audioPhysics.scaleMultiplier;
                const targetVolFactor = Math.min(3.0, weightedSizeSum);

                if (typeof p.currentImpact === 'undefined') p.currentImpact = 0;
                const diff = targetVolFactor - p.currentImpact;
                let dynamicAttackMultiplier = 4.0;
                if (diff > 0.8 || (audioPhysics.beatPunch || 0) > 0.4) dynamicAttackMultiplier = 20.0;
                else if (diff > 0.3) dynamicAttackMultiplier = 10.0;

                const attackSpeed = mappedShrink * dynamicAttackMultiplier;
                const decaySpeed = mappedShrink * 0.8;

                if (targetVolFactor > p.currentImpact) {
                    p.currentImpact += attackSpeed;
                    if (p.currentImpact > targetVolFactor) p.currentImpact = targetVolFactor;
                } else {
                    p.currentImpact -= decaySpeed;
                    if (p.currentImpact < targetVolFactor) p.currentImpact = targetVolFactor;
                }

                const dynamicFactor = Math.pow(p.currentImpact, 3);
                const sizeFactor = 1.0 + (dynamicFactor * mappedBeatSens * 3.5);
                const rawR = p.baseRadius * mappedRadius * minDim * sizeFactor * 0.25;

                // Enforce particle radius clamping: R_min = 0.05 * minDim, R_max = 0.35 * minDim
                const R_min = 0.05 * minDim;
                const R_max = 0.35 * minDim;
                p.clampedRadius = Math.max(R_min, Math.min(R_max, rawR));
            }

            // Enforce total canvas area coverage cap (<= 60%)
            const totalCanvasArea = width * height;
            const maxAllowedArea = 0.60 * totalCanvasArea;

            const symmetryFactor = safeSettings.symmetry ? 2 : 1;
            const currentActive = particlesRef.current.filter(p => !p.toRemove);
            let totalParticleArea = 0;

            for (let j = 0; j < currentActive.length && (j * symmetryFactor) < 16; j++) {
                const r = currentActive[j].clampedRadius;
                totalParticleArea += Math.PI * r * r * symmetryFactor;
            }

            let areaScaleCap = 1.0;
            if (totalParticleArea > maxAllowedArea && totalParticleArea > 0) {
                areaScaleCap = Math.sqrt(maxAllowedArea / totalParticleArea);
            }

            // Populate WebGL Data Arrays
            let blobIndex = 0;
            blobsData.fill(0);
            blobColorsData.fill(0);

            for (let i = 0; i < currentActive.length; i++) {
                const p = currentActive[i];
                const finalR = p.clampedRadius * areaScaleCap;
                const colorHex = safeColors[p.colorIndex % safeColors.length];
                const rgb = colorToRgbVec3(colorHex);

                if (blobIndex < 16) {
                    blobsData[blobIndex * 4 + 0] = p.x;
                    blobsData[blobIndex * 4 + 1] = 1.0 - p.y;
                    blobsData[blobIndex * 4 + 2] = finalR;
                    blobsData[blobIndex * 4 + 3] = 1.0;

                    blobColorsData[blobIndex * 3 + 0] = rgb[0];
                    blobColorsData[blobIndex * 3 + 1] = rgb[1];
                    blobColorsData[blobIndex * 3 + 2] = rgb[2];

                    blobIndex++;
                }

                if (safeSettings.symmetry && blobIndex < 16) {
                    blobsData[blobIndex * 4 + 0] = 1.0 - p.x;
                    blobsData[blobIndex * 4 + 1] = 1.0 - p.y;
                    blobsData[blobIndex * 4 + 2] = finalR;
                    blobsData[blobIndex * 4 + 3] = 1.0;

                    blobColorsData[blobIndex * 3 + 0] = rgb[0];
                    blobColorsData[blobIndex * 3 + 1] = rgb[1];
                    blobColorsData[blobIndex * 3 + 2] = rgb[2];

                    blobIndex++;
                }
            }

            const bgRgb = colorToRgbVec3(safeSettings.bgColor || safeColors[0]);

            // WebGL Drawing
            gl.uniform2f(locs.u_resolution, width, height);
            gl.uniform1f(locs.u_time, timeRef.current);
            gl.uniform1i(locs.u_blobCount, blobIndex);
            gl.uniform4fv(locs.u_blobs, blobsData);
            gl.uniform3fv(locs.u_blobColors, blobColorsData);
            gl.uniform1f(locs.u_viscosity, audioPhysics.viscosity);
            gl.uniform1f(locs.u_turbulence, audioPhysics.turbulence);
            gl.uniform3f(locs.u_bgColor, bgRgb[0], bgRgb[1], bgRgb[2]);
            gl.uniform1f(locs.u_audioRMS, audioPhysics.totalRMS || 0);
            gl.uniform1f(locs.u_bassPeak, (audioPhysics.bass && audioPhysics.bass.peak !== undefined) ? audioPhysics.bass.peak : 0);
            gl.uniform1f(locs.u_bgPulse, audioPhysics.backgroundPulse || 0);
            gl.uniform1f(locs.u_strobePulse, currentStrobePulse);
            gl.uniform1i(locs.u_strobeTarget, strobeTarget === 'particles' ? 1 : 0);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

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
            if (gl && positionBuffer) {
                gl.deleteBuffer(positionBuffer);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings, safeColors, spawnParticle]);

    return <canvas ref={canvasRef} />;
};

export default Visualizer;
