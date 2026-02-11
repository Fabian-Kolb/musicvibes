import React, { useState, useRef, useEffect, useCallback } from 'react';
import Visualizer from '../components/vibesync/Visualizer';
import GhostUI from '../components/vibesync/GhostUI';
import '../components/vibesync/vibesync.css';

const VibeSync = () => {
    const [showUI, setShowUI] = useState(false);
    const [audioStream, setAudioStream] = useState(null);
    const [mode, setMode] = useState('liquid'); // liquid, quake, neon

    // Per-Mode Settings
    const [modeSettings, setModeSettings] = useState({
        liquid: {
            speed: 0, // 0 = Normal (1x)
            sensitivity: 0, // 0 = Normal (1.5x)
            baseRadius: 0, // 0 = Normal (1.0x)
            bgColor: '#240024',
            shrinkSpeed: 0, // 0 = Normal (0.1)
            particleCount: 0, // 0 = Normal (1x)
            strobeThreshold: 0, // 0 = Normal
            strobeSpeed: 0, // 0 = Normal
            bassImpact: 0, // 0 = Normal (1x)
            midImpact: 0, // 0 = Normal (1x)
            trebleImpact: 0, // 0 = Normal (1x)
            symmetry: false
        },
        quake: {
            speed: 1.0,
            sensitivity: 1.5,
            symmetry: false
        },
        neon: {
            speed: 5.0,
            sensitivity: 40, // 0-100 range for sensitivity
            shakeScale: 50,
            baseWind: 20,
            windReactivity: 50,
            smoothness: 80, // 0-100 (Snappy to Fat)
            cloudDensity: 50,
            rainAmount: 30, // Current base rain
            lightningFlash: true,
            lensDroplets: false,
            floorFog: true,
            retinalBurn: true,
            autoCycle: true,
            manualHue: 200,
            colorShiftSpeed: 20
        }
    });

    // Custom Color State - Initialize with a preset (Cyberpunk)
    const [colors, setColors] = useState([
        '#ff00ff', '#00ffff', '#0000ff', '#ff0000', '#800080'
    ]);

    const [isHoveringPanel, setIsHoveringPanel] = useState(false);
    const uiTimeoutRef = useRef(null);

    const resetTimeout = useCallback((delay = 1000) => {
        if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
        uiTimeoutRef.current = setTimeout(() => {
            setShowUI(false);
        }, delay);
    }, []);

    // Ghost UI Handler
    const handleMouseMove = useCallback(() => {
        setShowUI(true);
        if (!isHoveringPanel) {
            resetTimeout(1000); // 1s timeout if outside panel
        } else {
            if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current); // Stay open if inside
        }
    }, [isHoveringPanel, resetTimeout]);

    const handlePanelEnter = useCallback(() => {
        setIsHoveringPanel(true);
        if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    }, []);

    const handlePanelLeave = useCallback(() => {
        setIsHoveringPanel(false);
        resetTimeout(1000); // 1s timeout on leave
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
                mode={mode}
                settings={modeSettings[mode]} // Pass only active mode settings
                colors={colors}
            />
            <GhostUI
                show={showUI}
                audioStream={audioStream}
                setAudioStream={setAudioStream}
                mode={mode}
                setMode={setMode}
                modeSettings={modeSettings}
                setModeSettings={setModeSettings}
                colors={colors}
                setColors={setColors}
                onPanelEnter={handlePanelEnter}
                onPanelLeave={handlePanelLeave}
            />
        </div>
    );
};

export default VibeSync;
