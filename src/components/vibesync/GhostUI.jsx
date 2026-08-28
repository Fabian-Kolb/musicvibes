import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Radio, X, Sliders, Activity, Zap, Palette, Layers, Sun } from 'lucide-react';

const PRESETS = {
    cyberpunk: ['#ff00ff', '#00ffff', '#7000ff', '#ff0055', '#00ffcc'],
    deep_ocean: ['#001133', '#0044ff', '#00aaff', '#00ffff', '#002244'],
    sunset: ['#ff4400', '#ff8800', '#ff0055', '#440022', '#ffcc00'],
    matrix: ['#00ff00', '#003300', '#001100', '#33ff33', '#008800'],
};

const GhostUI = ({ show, audioStream, setAudioStream, settings, setSettings, colors, setColors, onPanelEnter, onPanelLeave }) => {
    const navigate = useNavigate();
    const [showAudioModal, setShowAudioModal] = useState(false);

    const requestSystemAudio = async () => {
        setShowAudioModal(false);
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
            if (stream) {
                setAudioStream(stream);
            }
        } catch (err) {
            console.error("Error accessing system audio:", err);
        }
    };

    const handleAudioInput = async (type) => {
        try {
            if (type === 'mic') {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                if (stream) {
                    setAudioStream(stream);
                }
            } else if (type === 'system') {
                setShowAudioModal(true);
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
        setSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    return (
        <div className={`ghost-ui-overlay ${show ? 'visible' : ''}`}>
            <button className="exit-btn" onClick={(e) => { e.stopPropagation(); navigate('/'); }} title="Exit VibeSync">
                <X size={28} />
            </button>

            {showAudioModal && (
                <div className="audio-modal-overlay">
                    <div className="audio-modal">
                        <h3>System Audio Setup</h3>
                        <p>To visualize system audio, a browser audio sharing prompt will open.</p>
                        <p>Select <strong>Tab</strong> or <strong>Entire Screen</strong> and ensure <strong>Share audio</strong> is enabled.</p>
                        <div className="modal-actions">
                            <button className="vs-btn" onClick={() => setShowAudioModal(false)}>Cancel</button>
                            <button className="vs-btn active" onClick={requestSystemAudio}>Got it, continue</button>
                        </div>
                    </div>
                </div>
            )}

            <div
                className="settings-panel"
                onMouseEnter={onPanelEnter}
                onMouseLeave={onPanelLeave}
            >
                {/* Header Area: Integrated Audio Source Selection */}
                <div className="settings-header">
                    <div className="header-group flex-fill">
                        <div className="section-title"><Mic size={14} /> Audio Source Input</div>
                        <div className="button-group">
                            <button className={`vs-btn flex-fill ${audioStream?.getVideoTracks().length === 0 ? 'active' : ''}`} onClick={() => handleAudioInput('mic')}>
                                <Mic size={14} /> Microphone
                            </button>
                            <button className={`vs-btn flex-fill ${audioStream?.getVideoTracks().length > 0 ? 'active' : ''}`} onClick={() => handleAudioInput('system')}>
                                <Radio size={14} /> System Audio
                            </button>
                        </div>
                    </div>
                </div>

                {/* Fixed Height Content Area with Custom Scrollbar */}
                <div className="settings-content-area custom-scrollbar">
                    <div className="mode-settings-grid fade-in">
                        
                        {/* Core Motion Controls */}
                        <div className="setting-card">
                            <div className="card-header"><Sliders size={14} /> Core Motion</div>
                            <div className="setting-item">
                                <label>Basis-Geschwindigkeit <span className="value-badge">{(settings.baseSpeed ?? settings.speed ?? 0) > 0 ? `+${settings.baseSpeed ?? settings.speed ?? 0}` : (settings.baseSpeed ?? settings.speed ?? 0)}</span></label>
                                <input type="range" min="-10" max="10" step="1" value={settings.baseSpeed ?? settings.speed ?? 0} onChange={(e) => updateSetting('baseSpeed', parseFloat(e.target.value))} />
                                <span className="subtext">Kontinuierliche Ambient-Bewegung</span>
                            </div>
                            <div className="setting-item">
                                <label>Peak-Geschwindigkeit <span className="value-badge">{(settings.peakSpeed ?? 0) > 0 ? `+${settings.peakSpeed ?? 0}` : (settings.peakSpeed ?? 0)}</span></label>
                                <input type="range" min="-10" max="10" step="1" value={settings.peakSpeed ?? 0} onChange={(e) => updateSetting('peakSpeed', parseFloat(e.target.value))} />
                                <span className="subtext">Tempo-Schub bei High-Energy Peaks</span>
                            </div>
                            <div className="setting-item">
                                <label>Beat-Größenempfindlichkeit <span className="value-badge">{(settings.beatSensitivity ?? settings.sensitivity ?? 0) > 0 ? `+${settings.beatSensitivity ?? settings.sensitivity ?? 0}` : (settings.beatSensitivity ?? settings.sensitivity ?? 0)}</span></label>
                                <input type="range" min="-10" max="10" step="1" value={settings.beatSensitivity ?? settings.sensitivity ?? 0} onChange={(e) => updateSetting('beatSensitivity', parseFloat(e.target.value))} />
                                <span className="subtext">Dynamische Expansion der Blobs bei Beats</span>
                            </div>
                            <div className="setting-item">
                                <label>Base Size <span className="value-badge">{settings.baseRadius > 0 ? `+${settings.baseRadius}` : settings.baseRadius}</span></label>
                                <input type="range" min="-10" max="10" step="1" value={settings.baseRadius} onChange={(e) => updateSetting('baseRadius', parseFloat(e.target.value))} />
                            </div>
                            <div className="setting-item">
                                <label>Decay Rate <span className="value-badge">{settings.shrinkSpeed > 0 ? `+${settings.shrinkSpeed}` : settings.shrinkSpeed}</span></label>
                                <input type="range" min="-10" max="10" step="1" value={settings.shrinkSpeed} onChange={(e) => updateSetting('shrinkSpeed', parseFloat(e.target.value))} />
                            </div>
                        </div>

                        {/* Frequency Rebalanced Sensitivities */}
                        <div className="setting-card">
                            <div className="card-header"><Activity size={14} /> Frequency Impact</div>
                            <div className="setting-item">
                                <label>Low / Bass Impact <span className="value-badge">{settings.bassImpact > 0 ? `+${settings.bassImpact}` : settings.bassImpact}</span></label>
                                <input type="range" min="-10" max="10" step="1" value={settings.bassImpact || 0} onChange={(e) => updateSetting('bassImpact', parseInt(e.target.value, 10))} />
                                <span className="subtext">Drives volumetric expansion & low-end pulses</span>
                            </div>
                            <div className="setting-item">
                                <label>Mid Frequency Impact <span className="value-badge">{settings.midImpact > 0 ? `+${settings.midImpact}` : settings.midImpact}</span></label>
                                <input type="range" min="-10" max="10" step="1" value={settings.midImpact || 0} onChange={(e) => updateSetting('midImpact', parseInt(e.target.value, 10))} />
                                <span className="subtext">Drives body response & liquid surface ripples</span>
                            </div>
                            <div className="setting-item">
                                <label>High / Treble Impact <span className="value-badge">{settings.trebleImpact > 0 ? `+${settings.trebleImpact}` : settings.trebleImpact}</span></label>
                                <input type="range" min="-10" max="10" step="1" value={settings.trebleImpact || 0} onChange={(e) => updateSetting('trebleImpact', parseInt(e.target.value, 10))} />
                                <span className="subtext">Drives high-end jitter & oscillation speed</span>
                            </div>
                        </div>

                        {/* Strobe & Drop Effects Overhaul */}
                        <div className="setting-card">
                            <div className="card-header"><Zap size={14} /> Strobe & Drop FX</div>
                            
                            <div className="setting-item">
                                <label>
                                    <span>Master Strobe Switch</span>
                                    <button 
                                        type="button"
                                        className={`vs-toggle-btn ${(settings.strobeEnabled ?? true) ? 'on' : ''}`}
                                        onClick={() => updateSetting('strobeEnabled', !(settings.strobeEnabled ?? true))}
                                    >
                                        {(settings.strobeEnabled ?? true) ? 'ENABLED' : 'DISABLED'}
                                    </button>
                                </label>
                            </div>

                            {(settings.strobeEnabled ?? true) && (
                                <>
                                    <div className="setting-item">
                                        <label>Drop Trigger Mode</label>
                                        <select
                                            className="vs-select"
                                            value={settings.dropMode || 'Drop-Reaktiv'}
                                            onChange={(e) => updateSetting('dropMode', e.target.value)}
                                        >
                                            <option value="Drop-Reaktiv">Drop-Reaktiv (Energy Threshold)</option>
                                            <option value="Kontinuierlich">Kontinuierlich (Continuous)</option>
                                        </select>
                                        <span className="subtext">
                                            Drop-Reaktiv mode triggers strictly on high-energy song drops and fast music parts.
                                        </span>
                                    </div>

                                    <div className="setting-item">
                                        <label>Strobe Target</label>
                                        <select
                                            className="vs-select"
                                            value={settings.strobeTarget || 'background'}
                                            onChange={(e) => updateSetting('strobeTarget', e.target.value)}
                                        >
                                            <option value="background">Background (BG Flashes, Particles Solid)</option>
                                            <option value="particles">Particles (Particles Flash/Hide, BG Solid)</option>
                                        </select>
                                        <span className="subtext">
                                            Select which layer flashes during strobe drop activation.
                                        </span>
                                    </div>

                                    <div className="setting-item">
                                        <label>
                                            <span>Strobe-Geschwindigkeit</span>
                                            <span className="value-badge">{settings.strobeSpeed ?? 10}</span>
                                        </label>
                                        <input 
                                            type="range" 
                                            min="1" 
                                            max="20" 
                                            step="1" 
                                            value={settings.strobeSpeed ?? 10} 
                                            onChange={(e) => updateSetting('strobeSpeed', parseInt(e.target.value, 10))} 
                                        />
                                        <span className="subtext">
                                            Flash-Frequenz im Strobe-Modus (1 bis 20 Hz).
                                        </span>
                                    </div>

                                    <div className="setting-item">
                                        <label>
                                            <span>Drop Sensitivity</span>
                                            <span className="value-badge">{Number(settings.strobeSensitivity ?? 1.0).toFixed(1)}</span>
                                        </label>
                                        <input 
                                            type="range" 
                                            min="0.1" 
                                            max="2.0" 
                                            step="0.1" 
                                            value={settings.strobeSensitivity ?? 1.0} 
                                            onChange={(e) => updateSetting('strobeSensitivity', parseFloat(e.target.value))} 
                                        />
                                    </div>

                                    <div className="setting-item">
                                        <label>
                                            <span>Flash Intensity</span>
                                            <span className="value-badge">{Number(settings.strobeIntensity ?? 0.8).toFixed(2)}</span>
                                        </label>
                                        <input 
                                            type="range" 
                                            min="0.1" 
                                            max="1.0" 
                                            step="0.05" 
                                            value={settings.strobeIntensity ?? 0.8} 
                                            onChange={(e) => updateSetting('strobeIntensity', parseFloat(e.target.value))} 
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Particle Threshold & Layout Settings */}
                        <div className="setting-card">
                            <div className="card-header"><Layers size={14} /> Particle Engine</div>
                            <div className="setting-item">
                                <label>Max Particles (Min 5) <span className="value-badge">{settings.maxParticles ?? 12}</span></label>
                                <input 
                                    type="number" 
                                    min="5" 
                                    max="16" 
                                    step="1"
                                    className="number-input"
                                    value={settings.maxParticles ?? 12} 
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value, 10);
                                        if (!isNaN(val)) {
                                            updateSetting('maxParticles', Math.min(16, Math.max(5, val)));
                                        }
                                    }} 
                                />
                                <span className="subtext">Engine guarantees a minimum threshold of 5 visible particles.</span>
                            </div>

                            <div className="setting-item" style={{ marginTop: '8px' }}>
                                <label>
                                    <span>Symmetry Mode</span>
                                    <button 
                                        type="button"
                                        className={`vs-toggle-btn ${settings.symmetry ? 'on' : ''}`}
                                        onClick={() => updateSetting('symmetry', !settings.symmetry)}
                                    >
                                        {settings.symmetry ? 'ON' : 'OFF'}
                                    </button>
                                </label>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Integrated Footer Area: Palette Swatches & Custom Background Tint */}
                <div className="settings-footer">
                    <div className="section-title"><Palette size={14} /> Color Palette Swatches</div>
                    <div className="footer-content">
                        <div className="presets-group">
                            <button className="vs-btn" onClick={() => handlePreset('cyberpunk')}>Cyberpunk</button>
                            <button className="vs-btn" onClick={() => handlePreset('deep_ocean')}>Ocean</button>
                            <button className="vs-btn" onClick={() => handlePreset('sunset')}>Sunset</button>
                            <button className="vs-btn" onClick={() => handlePreset('matrix')}>Matrix</button>
                        </div>
                        <div className="color-swatches">
                            {colors.map((c, i) => (
                                <input key={i} type="color" value={c} onChange={(e) => handleColorChange(i, e.target.value)} title={`Color Swatch ${i + 1}`} />
                            ))}
                            <div className="setting-item bg-color-item" style={{ marginLeft: '12px' }}>
                                <label style={{ fontSize: '0.75rem', marginBottom: 0, marginRight: '8px' }}>BG Tint</label>
                                <input type="color" value={settings.bgColor} onChange={(e) => {
                                    setSettings(prev => ({ ...prev, bgColor: e.target.value }))
                                }} title="Background Base Color" />
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default GhostUI;
