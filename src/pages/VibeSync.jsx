import React, { useState, useRef, useEffect, useCallback } from 'react';
import Visualizer from '../components/vibesync/Visualizer';
import GhostUI from '../components/vibesync/GhostUI';
import '../components/vibesync/vibesync.css';

const DEFAULT_SETTINGS = {
    baseSpeed: 0, // Base Motion Speed (-10 to +10)
    peakSpeed: 0, // Peak Speed Modifier (-10 to +10)
    beatSensitivity: 0, // Beat-Größenempfindlichkeit (-10 to +10)
    speed: 0, // Legacy fallback alias
    sensitivity: 0, // Legacy fallback alias
    baseRadius: 0, // Base Size (-10 to +10)
    bgColor: '#160829',
    shrinkSpeed: 0, // Decay Rate (-10 to +10)
    maxParticles: 12, // Max Particles number setting (min 5 enforced in engine)
    strobeEnabled: true, // Master Strobe Switch
    dropMode: 'Drop-Reaktiv', // Trigger Mode: Drop-Reaktiv | Kontinuierlich
    strobeTarget: 'background', // Strobe Target: 'background' | 'particles'
    strobeSensitivity: 1.0, // Energy Threshold Sensitivity (0.1 to 2.0)
    strobeIntensity: 0.8, // Flash Intensity (0.1 to 1.0)
    strobeSpeed: 10, // Flash Speed (1 to 20)
    bassImpact: 0, // Frequency impact (-10 to +10)
    midImpact: 0,
    trebleImpact: 0,
    
    // Symmetrie Studio
    symmetry: false,
    symmetryMode: 'radial', // 'radial' | 'mirror_x' | 'mirror_y' | 'mirror_quad'
    symmetryCount: 4, // 2, 3, 4, 6, 8, 12, 16
    symmetryRotation: 0, // 0 - 360
    symmetryAutoRotate: true,
    symmetryRotateSpeed: 2, // -10 to +10
    symmetryColorShift: 30, // 0 to 180 deg
    symmetryCenterX: 0.5,
    symmetryCenterY: 0.5,

    // Special FX Studio (10 Choreografien)
    fxAutoTrigger: true,
    fxTriggerMode: 'drop_and_bars', // 'drop_only' | 'drop_and_bars' | 'bars_4' | 'bars_8' | 'random'
    fxDuration: 1.6, // 0.5 - 3.5s
    fxIntensity: 1.0, // 0.5 - 3.0
    fxParticipationMode: 'dynamic', // 'dynamic' (organisch 50-80%) | 'custom' | 'all' (100%)
    fxParticipationRate: 70, // 25% - 100%
    fxEnabledList: {
        center_nova: true,
        top_down_cascade: true,
        bottom_up_geyser: true,
        vortex_whirlwind: true,
        black_hole_implosion: true,
        mandala_orbit_ring: true,
        horizontal_collide: true,
        helix_wave: true,
        hyper_jitter_glitch: true,
        radial_pulse_shockwave: true
    }
};

const DEFAULT_COLORS = ['#ff00ff', '#00ffff', '#7000ff', '#ff0055', '#00ffcc'];

const VibeSync = () => {
    const [showUI, setShowUI] = useState(false);
    const [audioStream, setAudioStream] = useState(null);

    // Consolidated Settings State with localStorage persistence
    const [settings, setSettings] = useState(() => {
        try {
            const saved = localStorage.getItem('musicvibes_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...DEFAULT_SETTINGS, ...parsed };
            }
        } catch (e) {
            console.error("Error loading saved settings:", e);
        }
        return DEFAULT_SETTINGS;
    });

    // Custom Color State with localStorage persistence
    const [colors, setColors] = useState(() => {
        try {
            const saved = localStorage.getItem('musicvibes_colors');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {
            console.error("Error loading saved colors:", e);
        }
        return DEFAULT_COLORS;
    });

    // Live Audio Telemetry for HUD (7-Band, BPM, 4/4 Beat, Beat-Punch, Current FX)
    const [liveMetrics, setLiveMetrics] = useState({
        tempoBPM: 120,
        tempoConfidence: 0.5,
        currentMeasureBeat: 1,
        beatPhase: 0,
        beatPulse: 0,
        beatPunch: 0,
        bands7: null,
        spectralCentroid: 0,
        isDropTriggered: false,
        activeFX: null
    });

    const [manualTriggerFX, setManualTriggerFX] = useState(null);

    const handleTriggerFX = useCallback((fxId) => {
        setManualTriggerFX({
            id: fxId,
            timestamp: performance.now()
        });
    }, []);

    // Persist settings to localStorage on change
    useEffect(() => {
        try {
            localStorage.setItem('musicvibes_settings', JSON.stringify(settings));
        } catch (e) {
            console.error("Error saving settings to localStorage:", e);
        }
    }, [settings]);

    // Persist colors to localStorage on change
    useEffect(() => {
        try {
            localStorage.setItem('musicvibes_colors', JSON.stringify(colors));
        } catch (e) {
            console.error("Error saving colors to localStorage:", e);
        }
    }, [colors]);

    const [isHoveringPanel, setIsHoveringPanel] = useState(false);
    const uiTimeoutRef = useRef(null);

    const resetTimeout = useCallback((delay = 1200) => {
        if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
        uiTimeoutRef.current = setTimeout(() => {
            setShowUI(false);
        }, delay);
    }, []);

    // Ghost UI Handler
    const handleMouseMove = useCallback(() => {
        setShowUI(true);
        if (!isHoveringPanel) {
            resetTimeout(1200); // 1.2s timeout if outside panel
        } else {
            if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current); // Stay open if inside panel
        }
    }, [isHoveringPanel, resetTimeout]);

    const handlePanelEnter = useCallback(() => {
        setIsHoveringPanel(true);
        if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    }, []);

    const handlePanelLeave = useCallback(() => {
        setIsHoveringPanel(false);
        resetTimeout(1200);
    }, [resetTimeout]);

    const handleAudioMetrics = useCallback((metrics) => {
        setLiveMetrics(metrics);
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
        };
    }, [handleMouseMove]);

    return (
        <div className={`vibesync-container ${showUI ? 'ui-active' : ''}`} onMouseMove={handleMouseMove} onClick={handleMouseMove}>
            <Visualizer
                audioStream={audioStream}
                settings={settings}
                colors={colors}
                manualTriggerFX={manualTriggerFX}
                onAudioMetrics={handleAudioMetrics}
            />
            <GhostUI
                show={showUI}
                audioStream={audioStream}
                setAudioStream={setAudioStream}
                settings={settings}
                setSettings={setSettings}
                colors={colors}
                setColors={setColors}
                liveMetrics={liveMetrics}
                onTriggerFX={handleTriggerFX}
                onPanelEnter={handlePanelEnter}
                onPanelLeave={handlePanelLeave}
            />
        </div>
    );
};

export default VibeSync;
