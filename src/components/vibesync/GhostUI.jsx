import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Radio, X, Monitor, Music, Zap, Activity, Waves } from 'lucide-react';

const PRESETS = {
    cyberpunk: ['#ff00ff', '#00ffff', '#1a0b2e', '#ff0055', '#7000ff'],
    deep_ocean: ['#001133', '#0044ff', '#00aaff', '#00ffff', '#002244'],
    sunset: ['#ff4400', '#ff8800', '#ff0055', '#440022', '#ffcc00'],
    matrix: ['#00ff00', '#003300', '#001100', '#33ff33', '#008800'],
};

const GhostUI = ({ show, audioStream, setAudioStream, mode, setMode, settings, setSettings, colors, setColors }) => {
    const navigate = useNavigate();

    const handleAudioInput = async (type) => {
        try {
            let stream;
            if (type === 'mic') {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            } else if (type === 'system') {
                alert("System Audio: Wähle im nächsten Fenster den Tab oder Bildschirm und aktiviere 'Audio teilen'.");
                stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
            }
            if (stream) {
                setAudioStream(stream);
            }
        } catch (err) {
            console.error("Error accessing audio:", err);
        }
    };

    const handlePreset = (presetKey) => {
        setColors([...PRESETS[presetKey]]);
    };

    const handleColorChange = (index, value) => {
        const newColors = [...colors];
        newColors[index] = value;
        setColors(newColors);
    };

    return (
        <div className={`ghost-ui-overlay ${show ? 'visible' : ''}`}>
            <button className="exit-btn" onClick={() => navigate('/')}>
                <X size={32} />
            </button>

            <div className="settings-panel">
                {/* Audio Input */}
                <div className="section-title">Audio Source</div>
                <div className="section-full">
                    <button className={`vs-btn ${audioStream?.getVideoTracks().length === 0 ? 'active' : ''}`} onClick={() => handleAudioInput('mic')}><Mic size={16} style={{ marginRight: 8 }} /> Microphone</button>
                    <button className={`vs-btn ${audioStream?.getVideoTracks().length > 0 ? 'active' : ''}`} onClick={() => handleAudioInput('system')}><Monitor size={16} style={{ marginRight: 8 }} /> System Audio</button>
                </div>

                {/* Visual Modes */}
                <div className="section-title">Visual Mode</div>
                <div className="section-full">
                    <button className={`vs-btn ${mode === 'liquid' ? 'active' : ''}`} onClick={() => setMode('liquid')}><Waves size={16} style={{ marginRight: 8 }} /> Liquid Morph</button>
                    <button className={`vs-btn ${mode === 'quake' ? 'active' : ''}`} onClick={() => setMode('quake')}><Activity size={16} style={{ marginRight: 8 }} /> Bass Quake</button>
                    <button className={`vs-btn ${mode === 'neon' ? 'active' : ''}`} onClick={() => setMode('neon')}><Zap size={16} style={{ marginRight: 8 }} /> Neon Storm</button>
                </div>

                {/* Global Modifiers */}
                <div className="section-title">Modifiers</div>
                <div className="section-half">
                    <label>Symmetry Mode</label>
                    <button className={`vs-btn ${settings.symmetry ? 'active' : ''}`} onClick={() => setSettings(prev => ({ ...prev, symmetry: !prev.symmetry }))}>
                        {settings.symmetry ? 'ON' : 'OFF'}
                    </button>
                </div>
                <div className="section-half">
                    <label>Speed: {settings.speed}x</label>
                    <input type="range" min="0.1" max="3.0" step="0.1" value={settings.speed} onChange={(e) => setSettings(prev => ({ ...prev, speed: parseFloat(e.target.value) }))} />
                </div>
                <div className="section-half">
                    <label>Trails: {settings.trails}</label>
                    <input type="range" min="0" max="0.95" step="0.05" value={settings.trails} onChange={(e) => setSettings(prev => ({ ...prev, trails: parseFloat(e.target.value) }))} />
                </div>
                <div className="section-half">
                    <label>Sensitivity: {settings.sensitivity}x</label>
                    <input type="range" min="0.5" max="2.5" step="0.1" value={settings.sensitivity} onChange={(e) => setSettings(prev => ({ ...prev, sensitivity: parseFloat(e.target.value) }))} />
                </div>

                {/* Colors */}
                <div className="section-title">Color Palette</div>
                <div className="section-full">
                    <div style={{ marginBottom: 10 }}>
                        <button className="vs-btn" onClick={() => handlePreset('cyberpunk')}>Cyberpunk</button>
                        <button className="vs-btn" onClick={() => handlePreset('deep_ocean')}>Deep Ocean</button>
                        <button className="vs-btn" onClick={() => handlePreset('sunset')}>Sunset</button>
                        <button className="vs-btn" onClick={() => handlePreset('matrix')}>Matrix</button>
                    </div>
                    <div className="color-swatches">
                        {colors.map((c, i) => (
                            <input key={i} type="color" value={c} onChange={(e) => handleColorChange(i, e.target.value)} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GhostUI;
