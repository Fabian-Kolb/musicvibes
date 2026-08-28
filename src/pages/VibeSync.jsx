import React, { useState, useRef, useEffect, useCallback } from 'react';
import Visualizer from '../components/vibesync/Visualizer';
import GhostUI from '../components/vibesync/GhostUI';
import '../components/vibesync/vibesync.css';

const VibeSync = () => {
    const [showUI, setShowUI] = useState(false);
    const [audioStream, setAudioStream] = useState(null);

    // Consolidated Settings State
    const [settings, setSettings] = useState({
        baseSpeed: 0, // Base Motion Speed (-10 to +10)
        peakSpeed: 0, // Peak Speed Modifier (-10 to +10)
        beatSensitivity: 0, // Beat-Größenempfindlichkeit (-10 to +10)
        speed: 0, // Legacy fallback alias
        sensitivity: 0, // Legacy fallback alias
        baseRadius: 0, // Base Size (-10 to +10)
        bgColor: '#14001a',
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
        symmetry: false
    });

    // Custom Color State - Initialize with Cyberpunk palette
    const [colors, setColors] = useState([
        '#ff00ff', '#00ffff', '#7000ff', '#ff0055', '#00ffcc'
    ]);

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
            />
            <GhostUI
                show={showUI}
                audioStream={audioStream}
                setAudioStream={setAudioStream}
                settings={settings}
                setSettings={setSettings}
                colors={colors}
                setColors={setColors}
                onPanelEnter={handlePanelEnter}
                onPanelLeave={handlePanelLeave}
            />
        </div>
    );
};

export default VibeSync;
