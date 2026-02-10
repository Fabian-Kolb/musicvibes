import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Radio, X, Monitor, Music, Zap, Activity, Waves } from 'lucide-react';

const PRESETS = {
    cyberpunk: ['#ff00ff', '#00ffff', '#1a0b2e', '#ff0055', '#7000ff'],
    deep_ocean: ['#001133', '#0044ff', '#00aaff', '#00ffff', '#002244'],
    sunset: ['#ff4400', '#ff8800', '#ff0055', '#440022', '#ffcc00'],
    matrix: ['#00ff00', '#003300', '#001100', '#33ff33', '#008800'],
};

const GhostUI = ({ show, audioStream, setAudioStream, mode, setMode, modeSettings, setModeSettings, colors, setColors, onPanelEnter, onPanelLeave }) => {
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

    const updateSetting = (key, value) => {
        setModeSettings(prev => ({
            ...prev,
            [mode]: {
                ...prev[mode],
                [key]: value
            }
        }));
    };

    const currentSettings = modeSettings[mode];

    return (
        <div className={`ghost-ui-overlay ${show ? 'visible' : ''}`}>
            {/* Exit Button - Stop propagation to prevent triggering mousemove logic on container? No, click is fine. */}
            <button className="exit-btn" onClick={(e) => { e.stopPropagation(); navigate('/'); }}>
                <X size={32} />
            </button>

            <div
                className="settings-panel"
                onMouseEnter={onPanelEnter}
                onMouseLeave={onPanelLeave}
            >
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

                {/* Mode Specific Settings */}
                <div className="section-title">
                    {mode === 'liquid' ? 'Liquid Morph Settings' : mode === 'quake' ? 'Bass Quake Settings' : 'Neon Storm Settings'}
                </div>

                {/* Common Settings */}
                {/* Common Settings (remapped for Liquid, kept standard for others for now or handled in visualizer?) 
                   Actually, user said "Änder so das man alle Variablen von -10 bis 10 verändern kann". 
                   This likely applies specifically to the current focus (Liquid). 
                   But let's apply the UI changes for Liquid mode mainly or check if other modes break.
                   Other modes (Quake, Neon) use speed/sensitivity too. I should probably keep the sliders generic but map them differently?
                   Or just update the sliders and fix the mapping for ALL modes?
                   User context was "Liquid Morph UI". I will update the sliders only when Liquid is active or update global sliders and fix mapping for others?
                   Let's stick to Liquid specific section for the specific requests, but Speed/Sensitivity are shared.
                   I will update Speed/Sensitivity to be -10 to 10 globally and fix mapping for other modes to keep them working.
                */}

                <div className="section-half">
                    <label>Beat Impact (Sensitivity): {currentSettings.sensitivity}</label>
                    <input type="range" min="-10" max="10" step="1" value={currentSettings.sensitivity} onChange={(e) => updateSetting('sensitivity', parseFloat(e.target.value))} />
                </div>
                <div className="section-half">
                    <label>Motion Speed: {currentSettings.speed}</label>
                    <input type="range" min="-10" max="10" step="1" value={currentSettings.speed} onChange={(e) => updateSetting('speed', parseFloat(e.target.value))} />
                </div>

                {/* Liquid Specific */}
                {mode === 'liquid' && (
                    <>
                        <div className="section-half">
                            <label>Particle Size: {currentSettings.baseRadius}</label>
                            <input type="range" min="-10" max="10" step="1" value={currentSettings.baseRadius} onChange={(e) => updateSetting('baseRadius', parseFloat(e.target.value))} />
                        </div>
                        <div className="section-half">
                            <label>Decay Speed (Snappiness): {currentSettings.shrinkSpeed}</label>
                            <input type="range" min="-10" max="10" step="1" value={currentSettings.shrinkSpeed} onChange={(e) => updateSetting('shrinkSpeed', parseFloat(e.target.value))} />
                        </div>
                        <div className="section-half">
                            <label>Particle Amount: {currentSettings.particleCount}</label>
                            <input type="range" min="-10" max="10" step="1" value={currentSettings.particleCount} onChange={(e) => updateSetting('particleCount', parseInt(e.target.value))} />
                        </div>
                        <div className="section-half">
                            <label>Background Tint</label>
                            <input type="color" value={currentSettings.bgColor} onChange={(e) => updateSetting('bgColor', e.target.value)} style={{ width: '100%', height: '36px' }} />
                        </div>
                        <div className="section-half">
                            <label>Strobe Trigger: {currentSettings.strobeThreshold}</label>
                            <input type="range" min="-10" max="10" step="1" value={currentSettings.strobeThreshold || 0} onChange={(e) => updateSetting('strobeThreshold', parseInt(e.target.value))} />
                        </div>
                        <div className="section-half">
                            <label>Strobe Speed: {currentSettings.strobeSpeed}</label>
                            <input type="range" min="-10" max="10" step="1" value={currentSettings.strobeSpeed || 0} onChange={(e) => updateSetting('strobeSpeed', parseInt(e.target.value))} />
                        </div>
                    </>
                )}

                {/* Neon Specific */}
                {mode === 'neon' && (
                    <div className="section-half">
                        <label>Trails: {currentSettings.trails}</label>
                        <input type="range" min="0" max="0.95" step="0.05" value={currentSettings.trails} onChange={(e) => updateSetting('trails', parseFloat(e.target.value))} />
                    </div>
                )}

                {/* Symmetry (Common but optional) */}
                <div className="section-half">
                    <label>Symmetry Mode</label>
                    <button className={`vs-btn ${currentSettings.symmetry ? 'active' : ''}`} onClick={() => updateSetting('symmetry', !currentSettings.symmetry)}>
                        {currentSettings.symmetry ? 'ON' : 'OFF'}
                    </button>
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
