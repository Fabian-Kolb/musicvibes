import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Radio, X, Monitor, Music, Zap, Activity, Waves, Sliders, Palette, Zap as LightningIcon, Droplets } from 'lucide-react';

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
            <button className="exit-btn" onClick={(e) => { e.stopPropagation(); navigate('/'); }}>
                <X size={32} />
            </button>

            <div
                className="settings-panel"
                onMouseEnter={onPanelEnter}
                onMouseLeave={onPanelLeave}
            >
                {/* Header Area: Audio and Mode Selection */}
                <div className="settings-header">
                    <div className="header-group">
                        <div className="section-title"><Mic size={14} /> Audio Source</div>
                        <div className="button-group">
                            <button className={`vs-btn ${audioStream?.getVideoTracks().length === 0 ? 'active' : ''}`} onClick={() => handleAudioInput('mic')}>Mic</button>
                            <button className={`vs-btn ${audioStream?.getVideoTracks().length > 0 ? 'active' : ''}`} onClick={() => handleAudioInput('system')}>System</button>
                        </div>
                    </div>

                    <div className="header-group" style={{ flex: 1 }}>
                        <div className="section-title"><Monitor size={14} /> Visual Mode</div>
                        <div className="button-group flex-fill">
                            <button className={`vs-btn flex-fill ${mode === 'liquid' ? 'active' : ''}`} onClick={() => setMode('liquid')}><Waves size={16} /> Liquid</button>
                            <button className={`vs-btn flex-fill ${mode === 'quake' ? 'active' : ''}`} onClick={() => setMode('quake')}><Activity size={16} /> Quake</button>
                            <button className={`vs-btn flex-fill ${mode === 'neon' ? 'active' : ''}`} onClick={() => setMode('neon')}><Zap size={16} /> Neon</button>
                        </div>
                    </div>
                </div>

                <div className="settings-content-area">
                    {/* LIQUID MODE SETTINGS */}
                    {mode === 'liquid' && (
                        <div className="mode-settings-grid fade-in">
                            <div className="setting-card">
                                <div className="card-header"><Sliders size={14} /> Core Motion</div>
                                <div className="setting-item">
                                    <label>Motion Speed <span className="value-badge">{currentSettings.speed}</span></label>
                                    <input type="range" min="-10" max="10" step="1" value={currentSettings.speed} onChange={(e) => updateSetting('speed', parseFloat(e.target.value))} />
                                </div>
                                <div className="setting-item">
                                    <label>Beat Impact <span className="value-badge">{currentSettings.sensitivity}</span></label>
                                    <input type="range" min="-10" max="10" step="1" value={currentSettings.sensitivity} onChange={(e) => updateSetting('sensitivity', parseFloat(e.target.value))} />
                                </div>
                                <div className="setting-item">
                                    <label>Base Size <span className="value-badge">{currentSettings.baseRadius}</span></label>
                                    <input type="range" min="-10" max="10" step="1" value={currentSettings.baseRadius} onChange={(e) => updateSetting('baseRadius', parseFloat(e.target.value))} />
                                </div>
                                <div className="setting-item">
                                    <label>Decay Rate <span className="value-badge">{currentSettings.shrinkSpeed}</span></label>
                                    <input type="range" min="-10" max="10" step="1" value={currentSettings.shrinkSpeed} onChange={(e) => updateSetting('shrinkSpeed', parseFloat(e.target.value))} />
                                </div>
                            </div>

                            <div className="setting-card">
                                <div className="card-header"><Activity size={14} /> Frequencies</div>
                                <div className="freq-bars-container">
                                    <div className="freq-bar">
                                        <div className="freq-label">Low</div>
                                        <input type="range" className="vertical-slider" min="-10" max="10" step="1" value={currentSettings.bassImpact || 0} onChange={(e) => updateSetting('bassImpact', parseInt(e.target.value))} />
                                        <div className="freq-val">{currentSettings.bassImpact || 0}</div>
                                    </div>
                                    <div className="freq-bar">
                                        <div className="freq-label">Mid</div>
                                        <input type="range" className="vertical-slider" min="-10" max="10" step="1" value={currentSettings.midImpact || 0} onChange={(e) => updateSetting('midImpact', parseInt(e.target.value))} />
                                        <div className="freq-val">{currentSettings.midImpact || 0}</div>
                                    </div>
                                    <div className="freq-bar">
                                        <div className="freq-label">High</div>
                                        <input type="range" className="vertical-slider" min="-10" max="10" step="1" value={currentSettings.trebleImpact || 0} onChange={(e) => updateSetting('trebleImpact', parseInt(e.target.value))} />
                                        <div className="freq-val">{currentSettings.trebleImpact || 0}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="setting-card">
                                <div className="card-header"><LightningIcon size={14} /> Advanced</div>
                                <div className="setting-item">
                                    <label>Particle Count <span className="value-badge">{currentSettings.particleCount}</span></label>
                                    <input type="range" min="-10" max="10" step="1" value={currentSettings.particleCount} onChange={(e) => updateSetting('particleCount', parseInt(e.target.value))} />
                                </div>
                                <div className="setting-item">
                                    <label>Strobe Limit <span className="value-badge">{currentSettings.strobeThreshold}</span></label>
                                    <input type="range" min="-10" max="10" step="1" value={currentSettings.strobeThreshold || 0} onChange={(e) => updateSetting('strobeThreshold', parseInt(e.target.value))} />
                                </div>
                                <div className="setting-item">
                                    <label>Strobe Spd <span className="value-badge">{currentSettings.strobeSpeed}</span></label>
                                    <input type="range" min="-10" max="10" step="1" value={currentSettings.strobeSpeed || 0} onChange={(e) => updateSetting('strobeSpeed', parseInt(e.target.value))} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* QUAKE MODE SETTINGS */}
                    {mode === 'quake' && (
                        <div className="mode-settings-grid fade-in" style={{ gridTemplateColumns: '1fr' }}>
                            <div className="setting-card">
                                <div className="card-header"><Sliders size={14} /> Quake Physics</div>
                                <div className="setting-item" style={{ maxWidth: '50%' }}>
                                    <label>Motion Speed <span className="value-badge">{currentSettings.speed}</span></label>
                                    <input type="range" min="-10" max="10" step="1" value={currentSettings.speed} onChange={(e) => updateSetting('speed', parseFloat(e.target.value))} />
                                </div>
                                <div className="setting-item" style={{ maxWidth: '50%' }}>
                                    <label>Beat Impact <span className="value-badge">{currentSettings.sensitivity}</span></label>
                                    <input type="range" min="0" max="5" step="0.1" value={currentSettings.sensitivity} onChange={(e) => updateSetting('sensitivity', parseFloat(e.target.value))} />
                                </div>
                                <div className="setting-item" style={{ maxWidth: '50%', marginTop: '1rem' }}>
                                    <label>Symmetry Mode</label>
                                    <button className={`vs-toggle-btn ${currentSettings.symmetry ? 'on' : 'off'}`} onClick={() => updateSetting('symmetry', !currentSettings.symmetry)}>
                                        {currentSettings.symmetry ? 'ENABLED' : 'DISABLED'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* NEON MODE SETTINGS */}
                    {mode === 'neon' && (
                        <div className="mode-settings-grid fade-in">
                            <div className="setting-card col-span-2">
                                <div className="card-header"><Activity size={14} /> Layer B: Physics</div>
                                <div className="grid-2-cols">
                                    <div className="setting-item">
                                        <label>Shake Force <span className="value-badge">{currentSettings.shakeScale}%</span></label>
                                        <input type="range" min="0" max="100" step="1" value={currentSettings.shakeScale} onChange={(e) => updateSetting('shakeScale', parseInt(e.target.value))} />
                                    </div>
                                    <div className="setting-item">
                                        <label>Wind Reactivity <span className="value-badge">{currentSettings.windReactivity}%</span></label>
                                        <input type="range" min="0" max="100" step="1" value={currentSettings.windReactivity} onChange={(e) => updateSetting('windReactivity', parseInt(e.target.value))} />
                                    </div>
                                    <div className="setting-item col-span-2">
                                        <label>Smoothness (Decay) <span className="value-badge">{currentSettings.smoothness}%</span></label>
                                        <input type="range" min="0" max="100" step="1" value={currentSettings.smoothness} onChange={(e) => updateSetting('smoothness', parseInt(e.target.value))} />
                                        <div className="slider-labels">
                                            <span>Snappy</span>
                                            <span>Heavy</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="setting-card">
                                <div className="card-header"><Droplets size={14} /> Layer A: Atmosphere</div>
                                <div className="setting-item">
                                    <label>Base Rain <span className="value-badge">{currentSettings.rainAmount}%</span></label>
                                    <input type="range" min="0" max="100" step="1" value={currentSettings.rainAmount} onChange={(e) => updateSetting('rainAmount', parseInt(e.target.value))} />
                                </div>
                                <div className="setting-item">
                                    <label>Base Wind <span className="value-badge">{currentSettings.baseWind}%</span></label>
                                    <input type="range" min="0" max="100" step="1" value={currentSettings.baseWind} onChange={(e) => updateSetting('baseWind', parseInt(e.target.value))} />
                                </div>
                                <div className="setting-item">
                                    <label>Cloud Density <span className="value-badge">{currentSettings.cloudDensity}%</span></label>
                                    <input type="range" min="0" max="100" step="1" value={currentSettings.cloudDensity} onChange={(e) => updateSetting('cloudDensity', parseInt(e.target.value))} />
                                </div>
                                <div className="setting-item">
                                    <label>Lightning Focus <span className="value-badge">{currentSettings.sensitivity}%</span></label>
                                    <input type="range" min="0" max="100" step="1" value={currentSettings.sensitivity} onChange={(e) => updateSetting('sensitivity', parseInt(e.target.value))} />
                                </div>
                            </div>

                            <div className="setting-card toggle-grid">
                                <button className={`vs-toggle-btn ${currentSettings.lensDroplets ? 'on' : ''}`} onClick={() => updateSetting('lensDroplets', !currentSettings.lensDroplets)}>Wet Lens</button>
                                <button className={`vs-toggle-btn ${currentSettings.lightningFlash ? 'on' : ''}`} onClick={() => updateSetting('lightningFlash', !currentSettings.lightningFlash)}>Flash Sync</button>
                                <button className={`vs-toggle-btn ${currentSettings.floorFog ? 'on' : ''}`} onClick={() => updateSetting('floorFog', !currentSettings.floorFog)}>Floor Fog</button>
                                <button className={`vs-toggle-btn ${currentSettings.retinalBurn ? 'on' : ''}`} onClick={() => updateSetting('retinalBurn', !currentSettings.retinalBurn)}>Retina Burn</button>
                                <button className={`vs-toggle-btn ${currentSettings.autoCycle ? 'on' : ''}`} onClick={() => updateSetting('autoCycle', !currentSettings.autoCycle)}>Auto Theme</button>
                            </div>

                            <div className="setting-card">
                                <div className="card-header"><Palette size={14} /> Color Shift</div>
                                {!currentSettings.autoCycle ? (
                                    <div className="setting-item">
                                        <label>Manual Hue</label>
                                        <div className="hue-slider-wrapper">
                                            <input type="range" className="hue-slider" min="0" max="360" step="1" value={currentSettings.manualHue} onChange={(e) => updateSetting('manualHue', parseInt(e.target.value))} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="setting-item">
                                        <label>Auto Shift Speed <span className="value-badge">{currentSettings.colorShiftSpeed}%</span></label>
                                        <input type="range" min="0" max="100" step="1" value={currentSettings.colorShiftSpeed} onChange={(e) => updateSetting('colorShiftSpeed', parseInt(e.target.value))} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Area: Global Colors */}
                <div className="settings-footer">
                    <div className="section-title"><Palette size={14} /> Palette</div>
                    <div className="footer-content">
                        <div className="presets-group">
                            <button className="vs-btn" onClick={() => handlePreset('cyberpunk')}>Cyberpunk</button>
                            <button className="vs-btn" onClick={() => handlePreset('deep_ocean')}>Ocean</button>
                            <button className="vs-btn" onClick={() => handlePreset('sunset')}>Sunset</button>
                            <button className="vs-btn" onClick={() => handlePreset('matrix')}>Matrix</button>
                        </div>
                        <div className="color-swatches">
                            {colors.map((c, i) => (
                                <input key={i} type="color" value={c} onChange={(e) => handleColorChange(i, e.target.value)} />
                            ))}
                            <div className="setting-item bg-color-item" style={{ marginLeft: 'auto' }}>
                                <label style={{ fontSize: '0.7rem', marginBottom: 0, marginRight: '10px' }}>BG Tint (Liq)</label>
                                <input type="color" value={modeSettings.liquid.bgColor} onChange={(e) => {
                                    setModeSettings(prev => ({ ...prev, liquid: { ...prev.liquid, bgColor: e.target.value } }))
                                }} />
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default GhostUI;
