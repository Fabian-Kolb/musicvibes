import React, { useState, useRef, useEffect, useCallback } from 'react';
import Visualizer from '../components/vibesync/Visualizer';
import GhostUI from '../components/vibesync/GhostUI';
import '../components/vibesync/vibesync.css';

const VibeSync = () => {
    const [showUI, setShowUI] = useState(false);
    const [audioStream, setAudioStream] = useState(null);
    const [mode, setMode] = useState('liquid'); // liquid, quake, neon
    const [settings, setSettings] = useState({
        symmetry: false,
        speed: 1.0,
        trails: 0.1, // 0 to 1
        sensitivity: 1.5, // 0.5 to 2.5
    });

    // Custom Color State - Initialize with a preset (Cyberpunk)
    const [colors, setColors] = useState([
        '#ff00ff', '#00ffff', '#0000ff', '#ff0000', '#800080'
    ]);

    const uiTimeoutRef = useRef(null);

    // Ghost UI Handler
    const handleMouseMove = useCallback(() => {
        setShowUI(true);
        if (uiTimeoutRef.current) {
            clearTimeout(uiTimeoutRef.current);
        }
        uiTimeoutRef.current = setTimeout(() => {
            setShowUI(false);
        }, 3000);
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
                mode={mode}
                settings={settings}
                colors={colors}
            />
            <GhostUI
                show={showUI}
                audioStream={audioStream}
                setAudioStream={setAudioStream}
                mode={mode}
                setMode={setMode}
                settings={settings}
                setSettings={setSettings}
                colors={colors}
                setColors={setColors}
            />
        </div>
    );
};

export default VibeSync;
