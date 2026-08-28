import React, { useRef, useEffect, useCallback } from 'react';
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
uniform vec4 u_blobs[64];
uniform vec3 u_blobColors[64];
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

    // R4: Atmospheric Audio-Reactive Ambient Background
    // Smoothly blends an organic ambient aura driven by palette colors and u_bgColor
    vec3 primaryGlow = mix(u_blobColors[0], u_blobColors[1], clamp(uv.x + uv.y * 0.5, 0.0, 1.0));
    vec3 deepBase = mix(u_bgColor, primaryGlow * 0.22, 0.40);

    float distFromCenter = length(uv - vec2(0.5, 0.5));
    float radialGlow = smoothstep(0.95, 0.05, distFromCenter);
    float bottomRise = smoothstep(1.0, 0.0, uv.y) * 0.25;

    // Music pulsation radiates outward with vibrant palette hues
    float audioIntensity = u_bgPulse * 0.90 + u_audioRMS * 0.45;
    vec3 ambientGlow = primaryGlow * (0.09 + audioIntensity * 0.32) * (radialGlow + bottomRise);

    vec3 reactiveBg = deepBase + ambientGlow;

    // Subtle atmospheric vignette preserving depth
    float vignette = smoothstep(1.15, 0.30, distFromCenter);
    reactiveBg = reactiveBg * (0.65 + 0.35 * vignette);

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

    for (int i = 0; i < 64; i++) {
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
uniform vec4 u_blobs[64];
uniform vec3 u_blobColors[64];
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

    // R4: Atmospheric Audio-Reactive Ambient Background
    // Smoothly blends an organic ambient aura driven by palette colors and u_bgColor
    vec3 primaryGlow = mix(u_blobColors[0], u_blobColors[1], clamp(uv.x + uv.y * 0.5, 0.0, 1.0));
    vec3 deepBase = mix(u_bgColor, primaryGlow * 0.22, 0.40);

    float distFromCenter = length(uv - vec2(0.5, 0.5));
    float radialGlow = smoothstep(0.95, 0.05, distFromCenter);
    float bottomRise = smoothstep(1.0, 0.0, uv.y) * 0.25;

    // Music pulsation radiates outward with vibrant palette hues
    float audioIntensity = u_bgPulse * 0.90 + u_audioRMS * 0.45;
    vec3 ambientGlow = primaryGlow * (0.09 + audioIntensity * 0.32) * (radialGlow + bottomRise);

    vec3 reactiveBg = deepBase + ambientGlow;

    // Subtle atmospheric vignette preserving depth
    float vignette = smoothstep(1.15, 0.30, distFromCenter);
    reactiveBg = reactiveBg * (0.65 + 0.35 * vignette);

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

    for (int i = 0; i < 64; i++) {
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

function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    if (s === 0) return [l, l, l];
    const hue2rgb = (p, q, t) => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1/6) return p + (q - p) * 6 * tt;
        if (tt < 1/2) return q;
        if (tt < 2/3) return p + (q - p) * (2/3 - tt) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
        hue2rgb(p, q, h + 1/3),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1/3)
    ];
}

function shiftRgbHue(rgb, hueDeg) {
    if (!hueDeg || hueDeg === 0) return rgb;
    const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    let newH = (h + (hueDeg / 360)) % 1.0;
    if (newH < 0) newH += 1.0;
    return hslToRgb(newH, s, l);
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

const SPECIAL_EFFECTS = {
    center_nova: {
        id: 'center_nova',
        name: 'Zentraler Supernova-Ausbruch',
        desc: 'Alle Tropfen explodieren schlagartig radial aus der Mitte und federn zurück.'
    },
    top_down_cascade: {
        id: 'top_down_cascade',
        name: 'Vertikaler Kaskaden-Regen',
        desc: 'Tropfen stürzen in einer vertikalen Kaskade von oben nach unten durchs Bild.'
    },
    bottom_up_geyser: {
        id: 'bottom_up_geyser',
        name: 'Geysir / Vulkan-Eruption',
        desc: 'Partikel schießen von unten wie eine Fontäne nach oben und zerstäuben.'
    },
    vortex_whirlwind: {
        id: 'vortex_whirlwind',
        name: 'Kosmischer Strudel & Wirbelsturm',
        desc: 'Starker Rotationsstrudel saugt Blobs in eine wirbelnde Spirale.'
    },
    black_hole_implosion: {
        id: 'black_hole_implosion',
        name: 'Schwarzes Loch & Big Bang',
        desc: 'Totale Implosion in die Mitte mit anschließender Urknall-Schockwelle.'
    },
    mandala_orbit_ring: {
        id: 'mandala_orbit_ring',
        name: 'Quanten-Orbit / Ring-Formation',
        desc: 'Tropfen formieren sich zu einem rotierenden Kreisring um die Mitte.'
    },
    horizontal_collide: {
        id: 'horizontal_collide',
        name: 'Horizontaler Zusammenprall',
        desc: 'Partikel rasen von links und rechts aufeinander zu und prallen in der Mitte ab.'
    },
    helix_wave: {
        id: 'helix_wave',
        name: 'Doppel-Helix Schwingung',
        desc: 'Flüssigkeitsträger bewegen sich in einer gekreuzten Sinus-Helixwelle.'
    },
    hyper_jitter_glitch: {
        id: 'hyper_jitter_glitch',
        name: 'Hyperraum-Zittern & Glitch',
        desc: 'Stroboskopische Hochfrequenz-Quantensprünge mit Farb-Flackern.'
    },
    radial_pulse_shockwave: {
        id: 'radial_pulse_shockwave',
        name: 'Schockwellen-Tsunami',
        desc: 'Massive ringförmige Druckwelle expandiert aus der Mitte und verdrängt alles.'
    }
};

const DEFAULT_COLORS = ['#ff007f', '#00f0ff', '#7000ff', '#ff003c', '#00ffcc'];

const Visualizer = ({ audioStream, settings, colors, manualTriggerFX, onAudioMetrics }) => {
    const canvasRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const requestRef = useRef(null);

    const timeRef = useRef(0);
    const frameCountRef = useRef(0);
    const particlesRef = useRef([]);
    const physicsStateRef = useRef(null);
    const prevSpectrumRef = useRef(null);
    const avgVolumeRef = useRef(0);
    const strobeEnvelopeRef = useRef(0);
    const loudnessEnvelopeRef = useRef(0);
    const soundPresenceRef = useRef(0.5);

    // Special FX and Symmetry Live State Refs
    const activeFXRef = useRef(null);
    const lastAutoFXTimeRef = useRef(0);
    const lastMeasureBeatRef = useRef(1);
    const measureBarCountRef = useRef(0);
    const autoRotatingAngleRef = useRef(0);

    const safeColors = (Array.isArray(colors) && colors.length > 0) ? colors : DEFAULT_COLORS;
    const safeSettings = (settings && typeof settings === 'object') ? settings : {};

    const settingsRef = useRef(safeSettings);
    settingsRef.current = safeSettings;

    const colorsRef = useRef(safeColors);
    colorsRef.current = safeColors;

    const onAudioMetricsRef = useRef(onAudioMetrics);
    onAudioMetricsRef.current = onAudioMetrics;

    const startEffect = useCallback((fxId) => {
        if (!fxId || !SPECIAL_EFFECTS[fxId]) return;
        const currentSettings = settingsRef.current || {};
        const fxInfo = SPECIAL_EFFECTS[fxId];
        const dur = typeof currentSettings.fxDuration === 'number' ? currentSettings.fxDuration : 1.6;
        const intens = typeof currentSettings.fxIntensity === 'number' ? currentSettings.fxIntensity : 1.0;
        const partMode = currentSettings.fxParticipationMode || 'dynamic';
        const partRate = typeof currentSettings.fxParticipationRate === 'number' ? currentSettings.fxParticipationRate : 70;

        const totalParticles = particlesRef.current.length;
        let targetCount = totalParticles;

        if (partMode === 'all') {
            targetCount = totalParticles;
        } else if (partMode === 'dynamic') {
            // Dynamic organic selection: 50% to 80% of blobs participate
            const ratio = 0.50 + Math.random() * 0.35;
            targetCount = Math.max(2, Math.min(totalParticles, Math.round(totalParticles * ratio)));
        } else {
            // Custom fixed percentage
            const ratio = Math.max(0.20, Math.min(1.0, partRate / 100));
            targetCount = Math.max(2, Math.min(totalParticles, Math.round(totalParticles * ratio)));
        }

        // Shuffle particle indices to randomly pick participating blobs
        const indices = Array.from({ length: totalParticles }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        const participatingSet = new Set(indices.slice(0, targetCount));

        // Assign participation weight to each particle
        particlesRef.current.forEach((p, idx) => {
            p.fxParticipation = participatingSet.has(idx) ? (0.85 + Math.random() * 0.15) : 0.0;
        });

        const snapshots = particlesRef.current.map(p => ({
            startX: p.x,
            startY: p.y,
            baseRadius: p.baseRadius,
            dirX: p.dirX,
            dirY: p.dirY
        }));

        activeFXRef.current = {
            id: fxId,
            name: fxInfo.name,
            startTime: performance.now(),
            duration: dur,
            intensity: intens,
            snapshots
        };
    }, []);

    // Listen for manual trigger events from GhostUI
    useEffect(() => {
        if (manualTriggerFX && manualTriggerFX.id) {
            startEffect(manualTriggerFX.id);
        }
    }, [manualTriggerFX, startEffect]);

    const spawnParticle = useCallback((fromEdge = false) => {
        let x = 0;
        let y = 0;
        const margin = 0.15;
        let mainAngle = Math.random() * Math.PI * 2;

        if (fromEdge) {
            const side = Math.floor(Math.random() * 4);
            if (side === 0) { // Top
                x = Math.random();
                y = -margin;
                mainAngle = Math.PI * 0.5 + (Math.random() - 0.5) * 0.8; // Moving down
            } else if (side === 1) { // Right
                x = 1 + margin;
                y = Math.random();
                mainAngle = Math.PI + (Math.random() - 0.5) * 0.8; // Moving left
            } else if (side === 2) { // Bottom
                x = Math.random();
                y = 1 + margin;
                mainAngle = -Math.PI * 0.5 + (Math.random() - 0.5) * 0.8; // Moving up
            } else { // Left
                x = -margin;
                y = Math.random();
                mainAngle = 0.0 + (Math.random() - 0.5) * 0.8; // Moving right
            }
        } else {
            x = 0.15 + Math.random() * 0.7;
            y = 0.15 + Math.random() * 0.7;
            mainAngle = Math.random() * Math.PI * 2;
        }

        const colorsLen = Math.max(1, (colorsRef.current || []).length);
        return {
            x,
            y,
            baseDirX: Math.cos(mainAngle),
            baseDirY: Math.sin(mainAngle),
            dirX: Math.cos(mainAngle),
            dirY: Math.sin(mainAngle),
            speedVariance: 0.85 + Math.random() * 0.3,
            phaseOffset: Math.random() * Math.PI * 2,
            waveFrequency: 0.5 + Math.random() * 0.5,
            waveAmplitude: 0.0018 + Math.random() * 0.0012,
            baseRadius: (0.3 + Math.random() * 0.2),
            colorIndex: Math.floor(Math.random() * colorsLen),
            toRemove: false,
            currentImpact: 0,
            fxParticipation: 0.0
        };
    }, []);

    // R3: Hardcoded minimum visible particle threshold = 5
    const MIN_VISIBLE_PARTICLES = 5;

    useEffect(() => {
        if (!particlesRef.current || particlesRef.current.length === 0) {
            particlesRef.current = Array.from({ length: MIN_VISIBLE_PARTICLES }).map(() => spawnParticle(false));
        }
    }, [spawnParticle]);

    useEffect(() => {
        if (analyserRef.current && safeSettings.shrinkSpeed !== undefined) {
            const val = safeSettings.shrinkSpeed || 0;
            let target = 0.55;
            if (val > 0) target = 0.55 - ((0.55 - 0.20) * (val / 10));
            else target = 0.55 + ((0.80 - 0.55) * (Math.abs(val) / 10));

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

        const audioTracks = audioStream.getAudioTracks();
        if (!audioTracks || audioTracks.length === 0) {
            console.warn("MediaStream has no audio tracks.");
            return;
        }

        let audioCtx;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error("Could not create AudioContext:", e);
            return;
        }

        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.20;

        let source;
        try {
            source = audioCtx.createMediaStreamSource(audioStream);
            source.connect(analyser);
        } catch (err) {
            console.error("Failed to connect audio stream:", err);
            return;
        }

        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;
        sourceRef.current = source;

        // Auto-unlock suspended audio on user gesture
        const unlockAudio = () => {
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().catch(() => {});
            }
        };
        window.addEventListener('pointerdown', unlockAudio);
        window.addEventListener('keydown', unlockAudio);

        return () => {
            window.removeEventListener('pointerdown', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
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
        const blobsData = new Float32Array(256); // 64 Blobs * 4
        const blobColorsData = new Float32Array(192); // 64 Blobs * 3

        const render = () => {
            const width = canvas.width;
            const height = canvas.height;
            const minDim = Math.min(width, height);

            const safeSettings = settingsRef.current || {};
            const safeColors = colorsRef.current || DEFAULT_COLORS;

            gl.viewport(0, 0, width, height);

            if (analyserRef.current && safeSettings.shrinkSpeed !== undefined) {
                const val = safeSettings.shrinkSpeed || 0;
                let target = 0.55;
                if (val > 0) target = 0.55 - ((0.55 - 0.20) * (val / 10));
                else target = 0.55 + ((0.80 - 0.55) * (Math.abs(val) / 10));
                analyserRef.current.smoothingTimeConstant = target;
            }

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

            // -------------------------------------------------------------
            // SPECIAL FX CHOREOGRAPHY TIMING & AUTO TRIGGER
            // -------------------------------------------------------------
            const isAutoFX = safeSettings.fxAutoTrigger !== false;
            const enabledPool = Object.keys(safeSettings.fxEnabledList || {}).filter(k => safeSettings.fxEnabledList[k]);

            // Measure beat tracking for bar drops
            if (audioPhysics.currentMeasureBeat === 1 && lastMeasureBeatRef.current !== 1) {
                measureBarCountRef.current++;
            }
            lastMeasureBeatRef.current = audioPhysics.currentMeasureBeat;

            if (isAutoFX && enabledPool.length > 0 && !activeFXRef.current) {
                const timeSinceLastAuto = (nowMs - lastAutoFXTimeRef.current) / 1000.0;
                const triggerMode = safeSettings.fxTriggerMode || 'drop_and_bars';
                let shouldTrigger = false;

                if (timeSinceLastAuto > 3.0) {
                    if (triggerMode === 'drop_only') {
                        shouldTrigger = Boolean(audioPhysics.isDropTriggered);
                    } else if (triggerMode === 'bars_4') {
                        shouldTrigger = measureBarCountRef.current >= 4 && audioPhysics.currentMeasureBeat === 1;
                    } else if (triggerMode === 'bars_8') {
                        shouldTrigger = measureBarCountRef.current >= 8 && audioPhysics.currentMeasureBeat === 1;
                    } else if (triggerMode === 'random') {
                        shouldTrigger = (audioPhysics.totalRMS > 0.15 && Math.random() < 0.015) || Boolean(audioPhysics.isDropTriggered);
                    } else { // 'drop_and_bars'
                        shouldTrigger = Boolean(audioPhysics.isDropTriggered) || (measureBarCountRef.current >= 8 && audioPhysics.currentMeasureBeat === 1);
                    }
                }

                if (shouldTrigger) {
                    lastAutoFXTimeRef.current = nowMs;
                    measureBarCountRef.current = 0;
                    const randomFxId = enabledPool[Math.floor(Math.random() * enabledPool.length)];
                    startEffect(randomFxId);
                }
            }

            // Active FX Progress Calculation
            let currentFxProgress = 0;
            let activeFXData = null;
            if (activeFXRef.current) {
                const elapsedSec = (nowMs - activeFXRef.current.startTime) / 1000.0;
                currentFxProgress = Math.min(1.0, elapsedSec / Math.max(0.2, activeFXRef.current.duration));
                activeFXData = {
                    id: activeFXRef.current.id,
                    name: activeFXRef.current.name,
                    progress: currentFxProgress
                };

                if (currentFxProgress >= 1.0) {
                    activeFXRef.current = null;
                }
            }

            frameCountRef.current++;
            if (onAudioMetricsRef.current && frameCountRef.current % 2 === 0) {
                onAudioMetricsRef.current({
                    tempoBPM: audioPhysics.tempoBPM,
                    tempoConfidence: audioPhysics.tempoConfidence,
                    currentMeasureBeat: audioPhysics.currentMeasureBeat,
                    beatPunch: audioPhysics.beatPunch,
                    snareHit: audioPhysics.snareHit,
                    hihatTick: audioPhysics.hihatTick,
                    beatPhase: audioPhysics.beatPhase,
                    beatPulse: audioPhysics.beatPulse,
                    bands7: audioPhysics.bands7,
                    bass: audioPhysics.bass,
                    mid: audioPhysics.mid,
                    treble: audioPhysics.treble,
                    bassDominance: audioPhysics.bassDominance,
                    midDominance: audioPhysics.midDominance,
                    trebleDominance: audioPhysics.trebleDominance,
                    spectralCentroid: audioPhysics.spectralCentroid,
                    songTension: audioPhysics.songTension,
                    dropRatio: audioPhysics.dropRatio,
                    currentMusicEnergy: audioPhysics.currentMusicEnergy,
                    isDropTriggered: audioPhysics.isDropTriggered,
                    isBuildUp: audioPhysics.isBuildUp,
                    buildUpScore: audioPhysics.buildUpScore,
                    viscosity: audioPhysics.viscosity,
                    turbulence: audioPhysics.turbulence,
                    speed: audioPhysics.speed,
                    scaleMultiplier: audioPhysics.scaleMultiplier,
                    backgroundPulse: audioPhysics.backgroundPulse,
                    activeFX: activeFXData,
                    frequencyData: frequencyData ? new Uint8Array(frequencyData) : null
                });
            }

            // UI Control Modifiers
            const valBaseSpeed = safeSettings.baseSpeed !== undefined ? safeSettings.baseSpeed : (safeSettings.speed || 0);
            const valPeakSpeed = safeSettings.peakSpeed !== undefined ? safeSettings.peakSpeed : 0;
            const valBeatSens = safeSettings.beatSensitivity !== undefined ? safeSettings.beatSensitivity : (safeSettings.sensitivity || 0);
            const valShrink = safeSettings.shrinkSpeed || 0;
            const valRadius = safeSettings.baseRadius || 0;
            const valBassImp = safeSettings.bassImpact || 0;

            const mappedBaseSpeed = mapSetting(valBaseSpeed, 1.0, 0.1, 5.0);
            const mappedPeakSpeed = mapSetting(valPeakSpeed, 1.0, 0.0, 4.0);
            const mappedBeatSens = mapSetting(valBeatSens, 1.0, 0.0, 3.5);
            const mappedDecay = mapSetting(valShrink, 1.0, 0.20, 3.0);
            const mappedRadius = mapSetting(valRadius, 1.0, 0.35, 2.8);
            const mappedBassImp = mapSetting(valBassImp, 1.0, 0.0, 3.0);

            // Strobe Flash Pulse Calculation
            const strobeEnabled = safeSettings.strobeEnabled !== undefined ? Boolean(safeSettings.strobeEnabled) : true;
            const strobeIntensitySetting = typeof safeSettings.strobeIntensity === 'number' ? safeSettings.strobeIntensity : 0.8;
            const strobeSpeedSetting = typeof safeSettings.strobeSpeed === 'number' ? safeSettings.strobeSpeed : (audioPhysics.strobeSpeed || 10);
            const strobeTarget = safeSettings.strobeTarget || 'background';

            const flashFreq = 5.0 + (strobeSpeedSetting * 1.0);
            const currentTimeSec = performance.now() / 1000.0;

            if (strobeEnabled && (audioPhysics.isStrobeActive || audioPhysics.isDropTriggered)) {
                strobeEnvelopeRef.current = Math.min(1.0, strobeEnvelopeRef.current + 0.35);
            } else {
                strobeEnvelopeRef.current *= 0.78;
                if (strobeEnvelopeRef.current < 0.005) strobeEnvelopeRef.current = 0;
            }

            let currentStrobePulse = 0.0;
            if (strobeEnabled && strobeEnvelopeRef.current > 0.001) {
                const flashOsc = Math.abs(Math.sin(currentTimeSec * flashFreq * Math.PI));
                currentStrobePulse = flashOsc * strobeEnvelopeRef.current * strobeIntensitySetting;
            }

            // Continuous Flow Velocity & Dynamic Music Presence / Standstill Logic
            const subBassEnergy = (audioPhysics.bands7?.subBass?.rms || audioPhysics.bass?.rms || 0);
            const kickEnergy = (audioPhysics.bands7?.kick?.rms || audioPhysics.bass?.rms || 0);
            const midEnergy = (audioPhysics.mid?.rms || 0);
            const currentRMS = (audioPhysics.totalRMS || 0);

            // Wide-range uncompressed dynamic composite loudness [0.0 to ~2.5+]
            const compositeLoudness = (subBassEnergy * 1.5 + kickEnergy * 1.3 + currentRMS * 1.2 + midEnergy * 0.6);
            const rawEnergy = Math.min(1.0, Math.max(0.0, currentRMS * 4.0 + (audioPhysics.bass?.rms || 0) * 2.5));

            // Dynamic Sound Presence Gate: smooth full standstill (v=0) when music is silent or paused
            const isAudioSilent = !audioStream || rawEnergy < 0.012;
            const targetSoundPresence = isAudioSilent ? 0.0 : Math.min(1.0, (rawEnergy - 0.012) / 0.09);

            if (targetSoundPresence > soundPresenceRef.current) {
                // Smooth attack when music starts or gets loud
                soundPresenceRef.current += (targetSoundPresence - soundPresenceRef.current) * 0.18;
            } else {
                // Gentle deceleration to peaceful standstill when quiet/silent
                soundPresenceRef.current += (targetSoundPresence - soundPresenceRef.current) * 0.035;
            }
            const soundPresence = Math.max(0.0, Math.min(1.0, soundPresenceRef.current));
            // silenceFactor: 1.0 in absolute silence, 0.0 during active music
            const silenceFactor = Math.pow(Math.max(0, 1.0 - soundPresence), 1.6);

            // Responsive envelope tracking continuous volume without harsh clipping ceiling
            if (compositeLoudness > loudnessEnvelopeRef.current) {
                loudnessEnvelopeRef.current += (compositeLoudness - loudnessEnvelopeRef.current) * 0.28;
            } else {
                loudnessEnvelopeRef.current += (compositeLoudness - loudnessEnvelopeRef.current) * 0.055;
            }

            // Real-Time Climax Crest & Drop State Infusion
            const crestEnergy = Math.max(0, compositeLoudness - loudnessEnvelopeRef.current * 0.8) * 0.8;
            const dropBoostFactor = audioPhysics.isDropTriggered ? 1.5 : 1.0;
            const effectiveEnergy = (loudnessEnvelopeRef.current + crestEnergy) * dropBoostFactor;

            // Non-linear power dynamic curve:
            // Moderate music is moderately boosted, loud music is fast, and extreme peak energy/drops zoom super-fast!
            const dynamicCurve = (effectiveEnergy + effectiveEnergy * effectiveEnergy * 0.9) * soundPresence;

            // Flow speed with true wide dynamic scaling (scaled by mappedPeakSpeed)
            const baseFlowSpeed = 0.0015 * mappedBaseSpeed;
            const loudnessBoost = dynamicCurve * mappedPeakSpeed * 2.2;
            const currentFlowSpeed = baseFlowSpeed * (1.0 + loudnessBoost);

            timeRef.current += 0.003 * mappedBaseSpeed * (1.0 + loudnessBoost * 0.7);

            // Particle threshold and layout
            avgVolumeRef.current = (avgVolumeRef.current * 0.95) + ((audioPhysics.totalRMS * 255) * 0.05);
            
            const userSettingVal = safeSettings.maxParticles !== undefined ? safeSettings.maxParticles : 12;
            const clampedMaxSetting = Math.min(16, Math.max(MIN_VISIBLE_PARTICLES, userSettingVal));

            // Dynamic Sizing with Symmetry factor
            const symmetryCountSetting = Math.max(2, Math.min(16, safeSettings.symmetryCount || 4));
            const symmetryDivisor = safeSettings.symmetryMode === 'radial' 
                ? Math.min(8, symmetryCountSetting) 
                : (safeSettings.symmetryMode === 'mirror_quad' ? 4 : 2);

            const userMaxParticles = safeSettings.symmetry 
                ? Math.max(3, Math.min(10, Math.floor(48 / symmetryDivisor))) 
                : clampedMaxSetting;

            const volumeRatio = Math.min(1.0, Math.max(0.0, avgVolumeRef.current / 255.0));
            const targetCount = Math.min(
                userMaxParticles,
                Math.max(MIN_VISIBLE_PARTICLES, Math.floor(MIN_VISIBLE_PARTICLES + (userMaxParticles - MIN_VISIBLE_PARTICLES) * volumeRatio))
            );

            while (particlesRef.current.filter(p => !p.toRemove).length < MIN_VISIBLE_PARTICLES) {
                particlesRef.current.push(spawnParticle(false));
            }

            const activeParticles = particlesRef.current.filter(p => !p.toRemove);

            if (activeParticles.length < targetCount) {
                particlesRef.current.push(spawnParticle(true));
            } else if (activeParticles.length > targetCount) {
                const candidates = particlesRef.current.filter(p => !p.toRemove);
                if (candidates.length > MIN_VISIBLE_PARTICLES) {
                    candidates[0].toRemove = true;
                }
            }

            // -------------------------------------------------------------
            // PARTICLE MOTION & 10 DYNAMIC SPECIAL FX CHOREOGRAPHIES
            // -------------------------------------------------------------
            const currentFX = activeFXRef.current;
            const fxProgress = currentFxProgress;
            const fxIntensity = currentFX ? currentFX.intensity : 1.0;
            const centerFX_X = safeSettings.symmetryCenterX !== undefined ? safeSettings.symmetryCenterX : 0.5;
            const centerFX_Y = safeSettings.symmetryCenterY !== undefined ? safeSettings.symmetryCenterY : 0.5;

            // Ultra-smooth sine/quintic envelope for seamless ease-in & ease-out transition (0 at start, 1 in center, 0 at end)
            const tClamped = Math.max(0.0, Math.min(1.0, fxProgress));
            const baseBlendWeight = currentFX ? Math.pow(Math.sin(Math.PI * tClamped), 0.75) : 0.0;

            const particleCount = particlesRef.current.length;

            for (let i = particlesRef.current.length - 1; i >= 0; i--) {
                const p = particlesRef.current[i];

                // 1. Normal Geschwungener S-Kurven Flow (Music-Driven, Flowing Waves, Non-Circling)
                const baseDx = p.baseDirX !== undefined ? p.baseDirX : (p.dirX || 1.0);
                const baseDy = p.baseDirY !== undefined ? p.baseDirY : (p.dirY || 0.0);
                const perpX = -baseDy;
                const perpY = baseDx;

                // Organic sinusoidal S-curves and wave meandering across the screen
                const waveFreq = (p.waveFrequency || 0.5) * 1.3;
                const wavePhase = (timeRef.current * waveFreq) + (p.phaseOffset || 0);
                const primarySway = Math.sin(wavePhase);
                const secondarySway = Math.sin(wavePhase * 2.2 + 1.2) * 0.35;
                const totalSway = (primarySway + secondarySway) * (p.waveAmplitude || 0.0022) * (1.0 + (audioPhysics.turbulence || 0) * 1.2);
                const pSpeed = currentFlowSpeed * (p.speedVariance || 1.0);

                const normalVx = (baseDx * pSpeed) + (perpX * totalSway);
                const normalVy = (baseDy * pSpeed) + (perpY * totalSway);

                // Per-particle participation weight (allows non-participating blobs to calmly float in background)
                const pParticipation = typeof p.fxParticipation === 'number' ? p.fxParticipation : (currentFX ? 0.75 : 0.0);
                const particleBlendWeight = baseBlendWeight * pParticipation;

                // 2. Special FX Dynamic Steering Velocity
                let fxVelX = normalVx;
                let fxVelY = normalVy;

                if (currentFX && particleBlendWeight > 0.0001) {
                    const id = currentFX.id;
                    const t = tClamped;

                    // Relative vector from effect center
                    const dx = p.x - centerFX_X;
                    const dy = p.y - centerFX_Y;
                    const dist = Math.hypot(dx, dy) || 0.001;
                    const radX = dx / dist;
                    const radY = dy / dist;
                    const tanX = -radY;
                    const tanY = radX;

                    if (id === 'center_nova') {
                        // 1. Central Supernova: Music-driven explosive radial jet
                        if (t < 0.20) {
                            const pullSpeed = pSpeed * 1.8;
                            fxVelX = -radX * pullSpeed;
                            fxVelY = -radY * pullSpeed;
                        } else {
                            const blastSpeed = pSpeed * (4.5 * (1.0 - (t - 0.20) / 0.80) + 1.2) * fxIntensity;
                            const swirl = Math.sin(t * Math.PI) * 0.5;
                            fxVelX = (radX + tanX * swirl) * blastSpeed;
                            fxVelY = (radY + tanY * swirl) * blastSpeed;
                        }
                    } else if (id === 'top_down_cascade') {
                        // 2. Vertical Meteor Shower: Guided downward rush at music speed
                        const targetX = 0.12 + (i / Math.max(1, particleCount - 1)) * 0.76;
                        const steerX = (targetX - p.x) * 0.08 + Math.sin(timeRef.current * 3.5 + i) * pSpeed * 0.8;
                        const rushY = pSpeed * 3.8 * fxIntensity;
                        fxVelX = steerX;
                        fxVelY = rushY;
                    } else if (id === 'bottom_up_geyser') {
                        // 3. Volcanic Geyser: Upward plume fountain
                        const targetSpread = ((i % 2 === 0) ? 1 : -1) * (0.06 + 0.38 * Math.pow(Math.max(0, 1.0 - p.y), 1.4)) * fxIntensity;
                        const targetX = 0.50 + targetSpread;
                        const steerX = (targetX - p.x) * 0.08 + Math.sin(p.y * 8.0 + timeRef.current * 2.5) * pSpeed * 0.8;
                        const rushY = -pSpeed * 4.2 * fxIntensity * (0.7 + 0.6 * p.y);
                        fxVelX = steerX;
                        fxVelY = rushY;
                    } else if (id === 'vortex_whirlwind') {
                        // 4. Cosmic Vortex: Rotational swirl + inward attraction
                        const swirlSpeed = pSpeed * (3.5 + 0.6 / Math.max(0.12, dist)) * fxIntensity;
                        const suctionSpeed = pSpeed * (1.0 * (1.0 - Math.min(1.0, dist))) * fxIntensity;
                        fxVelX = tanX * swirlSpeed - radX * suctionSpeed;
                        fxVelY = tanY * swirlSpeed - radY * suctionSpeed;
                    } else if (id === 'black_hole_implosion') {
                        // 5. Black Hole & Big Bang: Suction then cosmic blast
                        if (t < 0.48) {
                            const prog = t / 0.48;
                            const suckSpeed = pSpeed * (3.0 + 4.0 * prog) * fxIntensity;
                            const spinSpeed = pSpeed * (3.5 + 4.0 * prog);
                            fxVelX = -radX * suckSpeed + tanX * spinSpeed;
                            fxVelY = -radY * suckSpeed + tanY * spinSpeed;
                        } else {
                            const progExp = (t - 0.48) / 0.52;
                            const blastSpeed = pSpeed * (6.0 * (1.0 - progExp) + 1.5) * fxIntensity;
                            fxVelX = radX * blastSpeed;
                            fxVelY = radY * blastSpeed;
                        }
                    } else if (id === 'mandala_orbit_ring') {
                        // 6. Quantum Orbit Ring: Smooth radial attraction into ring + tangential orbit
                        const targetR = 0.28 + 0.03 * Math.sin(timeRef.current * 2.0);
                        const attractSpeed = (targetR - dist) * 0.12;
                        const orbitSpeed = pSpeed * (3.4 + 1.2 * (audioPhysics.beatPulse || 0)) * fxIntensity;
                        fxVelX = radX * attractSpeed + tanX * orbitSpeed;
                        fxVelY = radY * attractSpeed + tanY * orbitSpeed;
                    } else if (id === 'horizontal_collide') {
                        // 7. Horizontal Collider: Inward rush then vertical collision splash
                        if (t < 0.48) {
                            const dirX = (i % 2 === 0) ? 1.0 : -1.0;
                            fxVelX = dirX * pSpeed * 3.8 * fxIntensity;
                            fxVelY = (0.50 - p.y) * 0.08;
                        } else {
                            const splashProg = (t - 0.48) / 0.52;
                            const splashDirY = (i % 4 < 2) ? -1.0 : 1.0;
                            fxVelY = splashDirY * pSpeed * 4.5 * (1.0 - splashProg) * fxIntensity;
                            fxVelX = (p.x - 0.50) * 0.05 + Math.sin(timeRef.current * 4.0 + i) * pSpeed * 0.6;
                        }
                    } else if (id === 'helix_wave') {
                        // 8. Sinusoidal DNA Double-Helix: Forward glide with transverse wave steering
                        const phase = (i % 2 === 0) ? 0 : Math.PI;
                        const targetY = centerFX_Y + Math.sin(p.x * 6.5 + timeRef.current * 3.0 + phase) * 0.22 * fxIntensity;
                        fxVelX = pSpeed * 2.8 * fxIntensity;
                        fxVelY = (targetY - p.y) * 0.15 + Math.cos(p.x * 6.5 + timeRef.current * 3.0 + phase) * pSpeed * 2.0;
                    } else if (id === 'hyper_jitter_glitch') {
                        // 9. Hyper-Space Quantum Jitter: Harmonic jitter offsets at dynamic music speed
                        const punch = audioPhysics.beatPunch || 0;
                        fxVelX = normalVx + (Math.sin(timeRef.current * 25.0 + i * 3.7) * pSpeed * 4.5 + (Math.random() - 0.5) * 0.015 * punch) * fxIntensity;
                        fxVelY = normalVy + (Math.cos(timeRef.current * 25.0 + i * 2.3) * pSpeed * 4.5 + (Math.random() - 0.5) * 0.015 * punch) * fxIntensity;
                    } else if (id === 'radial_pulse_shockwave') {
                        // 10. Shockwave Tsunami: Dynamic expanding pressure wave impulse
                        const waveR = t * 0.75 * fxIntensity;
                        const prox = Math.max(0, 1.0 - Math.abs(dist - waveR) * 4.5);
                        fxVelX = radX * (pSpeed * 4.5 * prox * fxIntensity) + normalVx * 0.6;
                        fxVelY = radY * (pSpeed * 4.5 * prox * fxIntensity) + normalVy * 0.6;
                    }
                }

                // 3. Smooth Dynamic Vector Blending
                const finalVx = (normalVx * (1.0 - particleBlendWeight)) + (fxVelX * particleBlendWeight);
                const finalVy = (normalVy * (1.0 - particleBlendWeight)) + (fxVelY * particleBlendWeight);

                p.x += finalVx;
                p.y += finalVy;

                // Smooth screen margin boundary wrapping
                const margin = 0.25;
                const isOutOfBounds = (p.x < -margin || p.x > 1 + margin || p.y < -margin || p.y > 1 + margin);
                if (isOutOfBounds) {
                    if (p.toRemove) {
                        particlesRef.current.splice(i, 1);
                        continue;
                    } else {
                        const newP = spawnParticle(true);
                        p.x = newP.x;
                        p.y = newP.y;
                        p.baseDirX = newP.baseDirX;
                        p.baseDirY = newP.baseDirY;
                        p.dirX = newP.dirX;
                        p.dirY = newP.dirY;
                        p.speedVariance = newP.speedVariance;
                        p.phaseOffset = newP.phaseOffset;
                        p.waveFrequency = newP.waveFrequency;
                        p.waveAmplitude = newP.waveAmplitude;
                    }
                }

                // Volumetric sizing & pulse (Gates beat bounce in silence so blobs remain resting and calm)
                const volumeScale = 0.55 + ((audioPhysics.totalRMS || 0) * 0.90) + ((audioPhysics.bass?.rms || 0) * 0.60);
                const isDownbeat = audioPhysics.currentMeasureBeat === 1;
                const measureEmphasis = isDownbeat ? 1.35 : 1.0;
                const beatRhythmPulse = (audioPhysics.beatPulse || 0) * (audioPhysics.tempoConfidence > 0.4 ? 0.65 : 0.25) * measureEmphasis;
                const kickImpulse = (audioPhysics.beatPunch || 0) * 1.8 * mappedBassImp;
                const bassPeakImpulse = (audioPhysics.bass?.peak || 0) * 0.75 * mappedBassImp;

                const beatSensMultiplier = mappedBeatSens * soundPresence;
                const targetBeatBounce = (kickImpulse + bassPeakImpulse + beatRhythmPulse) * beatSensMultiplier;

                if (typeof p.currentImpact === 'undefined') p.currentImpact = 0;

                if (targetBeatBounce > p.currentImpact) {
                    p.currentImpact += (targetBeatBounce - p.currentImpact) * 0.70;
                } else {
                    p.currentImpact -= (p.currentImpact - targetBeatBounce) * Math.min(0.8, 0.08 * mappedDecay);
                }

                let fxRadiusMultiplier = 1.0;
                if (currentFX) {
                    const t = fxProgress;
                    if (currentFX.id === 'center_nova') {
                        fxRadiusMultiplier = 1.0 + Math.sin(t * Math.PI) * 1.2 * fxIntensity;
                    } else if (currentFX.id === 'black_hole_implosion') {
                        fxRadiusMultiplier = t < 0.45 ? (0.25 + 0.75 * (1.0 - t / 0.45)) : (1.0 + Math.sin((t - 0.45) / 0.55 * Math.PI) * 2.0);
                    } else if (currentFX.id === 'radial_pulse_shockwave') {
                        fxRadiusMultiplier = 1.0 + Math.sin(t * Math.PI) * 0.8 * fxIntensity;
                    }
                }

                const effectiveFxRadiusMultiplier = 1.0 + (fxRadiusMultiplier - 1.0) * pParticipation;
                const baseR = (p.baseRadius * 0.22 * minDim) * mappedRadius;
                const bounceFactor = 1.0 + (p.currentImpact * 1.5);
                p.clampedRadius = Math.max(0.02 * minDim, baseR * volumeScale * bounceFactor * effectiveFxRadiusMultiplier);
            }

            // -------------------------------------------------------------
            // MULTI-SYMMETRY CLONING ENGINE (64 SHADER BLOBS)
            // -------------------------------------------------------------
            const symmetryEnabled = Boolean(safeSettings.symmetry);
            const symmetryMode = safeSettings.symmetryMode || 'radial';
            const symmetryCount = Math.max(2, Math.min(16, safeSettings.symmetryCount || 4));
            const centerX = safeSettings.symmetryCenterX !== undefined ? safeSettings.symmetryCenterX : 0.5;
            const centerY = safeSettings.symmetryCenterY !== undefined ? safeSettings.symmetryCenterY : 0.5;
            const colorShiftDeg = safeSettings.symmetryColorShift || 0;

            if (safeSettings.symmetryAutoRotate) {
                const rotSpeed = safeSettings.symmetryRotateSpeed !== undefined ? safeSettings.symmetryRotateSpeed : 2;
                const tempoBonus = (audioPhysics.tempoBPM || 120) / 120.0;
                autoRotatingAngleRef.current += (rotSpeed * 0.0035 * tempoBonus);
            }
            const manualAngleRad = ((safeSettings.symmetryRotation || 0) * Math.PI) / 180.0;
            const totalSymmetryAngle = autoRotatingAngleRef.current + manualAngleRad;

            const currentActive = particlesRef.current.filter(p => !p.toRemove);
            let blobIndex = 0;
            blobsData.fill(0);
            blobColorsData.fill(0);

            const addBlob = (bx, by, br, rgb) => {
                if (blobIndex >= 64) return;
                blobsData[blobIndex * 4 + 0] = bx;
                blobsData[blobIndex * 4 + 1] = 1.0 - by; // Invert Y for WebGL screen coord
                blobsData[blobIndex * 4 + 2] = br;
                blobsData[blobIndex * 4 + 3] = 1.0;

                blobColorsData[blobIndex * 3 + 0] = rgb[0];
                blobColorsData[blobIndex * 3 + 1] = rgb[1];
                blobColorsData[blobIndex * 3 + 2] = rgb[2];

                blobIndex++;
            };

            for (let i = 0; i < currentActive.length; i++) {
                const p = currentActive[i];
                const finalR = p.clampedRadius;
                const baseColorHex = safeColors[p.colorIndex % safeColors.length];
                const baseRgb = colorToRgbVec3(baseColorHex);

                if (!symmetryEnabled) {
                    addBlob(p.x, p.y, finalR, baseRgb);
                } else {
                    if (symmetryMode === 'radial') {
                        // Rotational Kaleidoscope Symmetry
                        const dx = p.x - centerX;
                        const dy = p.y - centerY;
                        const dist = Math.hypot(dx, dy);
                        const baseTheta = Math.atan2(dy, dx) + totalSymmetryAngle;

                        for (let k = 0; k < symmetryCount; k++) {
                            const theta = baseTheta + (k * (2.0 * Math.PI / symmetryCount));
                            const cloneX = centerX + Math.cos(theta) * dist;
                            const cloneY = centerY + Math.sin(theta) * dist;
                            const shiftedRgb = colorShiftDeg > 0 
                                ? shiftRgbHue(baseRgb, (k * (colorShiftDeg / symmetryCount * 4))) 
                                : baseRgb;
                            addBlob(cloneX, cloneY, finalR, shiftedRgb);
                        }
                    } else if (symmetryMode === 'mirror_x') {
                        // Left - Right Mirror
                        addBlob(p.x, p.y, finalR, baseRgb);
                        const shiftedRgb = colorShiftDeg > 0 ? shiftRgbHue(baseRgb, colorShiftDeg) : baseRgb;
                        addBlob(2.0 * centerX - p.x, p.y, finalR, shiftedRgb);
                    } else if (symmetryMode === 'mirror_y') {
                        // Top - Bottom Mirror
                        addBlob(p.x, p.y, finalR, baseRgb);
                        const shiftedRgb = colorShiftDeg > 0 ? shiftRgbHue(baseRgb, colorShiftDeg) : baseRgb;
                        addBlob(p.x, 2.0 * centerY - p.y, finalR, shiftedRgb);
                    } else if (symmetryMode === 'mirror_quad') {
                        // 4 Quadrants Mirror
                        addBlob(p.x, p.y, finalR, baseRgb);
                        addBlob(2.0 * centerX - p.x, p.y, finalR, colorShiftDeg > 0 ? shiftRgbHue(baseRgb, colorShiftDeg * 0.5) : baseRgb);
                        addBlob(p.x, 2.0 * centerY - p.y, finalR, colorShiftDeg > 0 ? shiftRgbHue(baseRgb, colorShiftDeg * 1.0) : baseRgb);
                        addBlob(2.0 * centerX - p.x, 2.0 * centerY - p.y, finalR, colorShiftDeg > 0 ? shiftRgbHue(baseRgb, colorShiftDeg * 1.5) : baseRgb);
                    }
                }
            }

            const currentBgColor = safeSettings.bgColor || safeColors[0];
            const currentStrobeTarget = safeSettings.strobeTarget || 'background';
            const bgRgb = colorToRgbVec3(currentBgColor);

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
            gl.uniform1i(locs.u_strobeTarget, currentStrobeTarget === 'particles' ? 1 : 0);

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
    }, [spawnParticle]);

    return <canvas ref={canvasRef} />;
};

export default Visualizer;
