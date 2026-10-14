import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SpectrumAnalyzer from './SpectrumAnalyzer';
import {
    Mic, Radio, X, Sliders, Activity, Zap, Palette, Layers, Plus, Trash2,
    Gauge, Music, Sparkles, BarChart2, Flame, Eye, Compass, Waves,
    RotateCw, Play, Check, Crosshair, Atom, Disc, ShieldAlert, Orbit,
    ArrowDown, ArrowUp, Shuffle, Maximize2
} from 'lucide-react';

const DEFAULT_PRESETS = {
    cyberpunk: {
        colors: ['#ff00ff', '#00ffff', '#7000ff', '#ff0055', '#00ffcc'],
        bgColor: '#160829'
    },
    deep_ocean: {
        colors: ['#00d4ff', '#0044ff', '#0099ff', '#00ffff', '#002266'],
        bgColor: '#04142c'
    },
    sunset: {
        colors: ['#ff4400', '#ff8800', '#ff0055', '#ffaa00', '#ff0077'],
        bgColor: '#260a18'
    },
    matrix: {
        colors: ['#00ff66', '#00cc44', '#33ff88', '#008833', '#11ff55'],
        bgColor: '#041c0c'
    },
};

const FX_DEFINITIONS = [
    {
        id: 'center_nova',
        name: 'Zentraler Supernova-Ausbruch',
        desc: 'Alle Tropfen explodieren schlagartig radial aus der Mitte und federn harmonisch zurück.',
        icon: Sparkles,
        color: '#f43f5e'
    },
    {
        id: 'top_down_cascade',
        name: 'Vertikaler Kaskaden-Regen',
        desc: 'Tropfen stürzen in einer vertikalen Kaskade von oben nach unten durchs Bild.',
        icon: ArrowDown,
        color: '#38bdf8'
    },
    {
        id: 'bottom_up_geyser',
        name: 'Geysir / Vulkan-Eruption',
        desc: 'Partikel schießen von unten wie eine Fontäne nach oben und zerstäuben oben.',
        icon: ArrowUp,
        color: '#f97316'
    },
    {
        id: 'vortex_whirlwind',
        name: 'Kosmischer Strudel & Wirbelsturm',
        desc: 'Starker Rotationsstrudel saugt Blobs in eine wirbelnde Spirale.',
        icon: RotateCw,
        color: '#a78bfa'
    },
    {
        id: 'black_hole_implosion',
        name: 'Schwarzes Loch & Big Bang',
        desc: 'Totale Implosion in die Mitte mit anschließender Urknall-Schockwelle.',
        icon: Atom,
        color: '#ec4899'
    },
    {
        id: 'mandala_orbit_ring',
        name: 'Quanten-Orbit / Ring-Formation',
        desc: 'Tropfen formieren sich zu einem rotierenden Kreisring um die Mitte.',
        icon: Orbit,
        color: '#10b981'
    },
    {
        id: 'horizontal_collide',
        name: 'Horizontaler Zusammenprall',
        desc: 'Partikel rasen von links und rechts aufeinander zu und prallen in der Mitte ab.',
        icon: Crosshair,
        color: '#eab308'
    },
    {
        id: 'helix_wave',
        name: 'Doppel-Helix Schwingung',
        desc: 'Flüssigkeitsträger bewegen sich in einer gekreuzten Sinus-Helixwelle.',
        icon: Waves,
        color: '#06b6d4'
    },
    {
        id: 'hyper_jitter_glitch',
        name: 'Hyperraum-Zittern & Glitch',
        desc: 'Stroboskopische Hochfrequenz-Quantensprünge mit Farb-Flackern.',
        icon: Zap,
        color: '#c084fc'
    },
    {
        id: 'radial_pulse_shockwave',
        name: 'Schockwellen-Tsunami',
        desc: 'Massive ringförmige Druckwelle expandiert aus der Mitte und verdrängt alles.',
        icon: Disc,
        color: '#ef4444'
    }
];

const GhostUI = ({
    show,
    audioStream,
    setAudioStream,
    settings,
    setSettings,
    colors,
    setColors,
    liveMetrics,
    onTriggerFX,
    onPanelEnter,
    onPanelLeave
}) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('controls'); // 'controls' | 'symmetry_fx' | 'dashboard'
    const [showAudioModal, setShowAudioModal] = useState(false);
    const [showAddPresetInput, setShowAddPresetInput] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');

    const [customPresets, setCustomPresets] = useState(() => {
        try {
            const saved = localStorage.getItem('musicvibes_custom_presets');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') return parsed;
            }
        } catch (e) {
            console.error("Error loading custom presets:", e);
        }
        return {};
    });

    useEffect(() => {
        try {
            localStorage.setItem('musicvibes_custom_presets', JSON.stringify(customPresets));
        } catch (e) {
            console.error("Error saving custom presets:", e);
        }
    }, [customPresets]);

    const requestSystemAudio = async () => {
        setShowAudioModal(false);
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                },
                video: true
            });
            if (stream) {
                const audioTracks = stream.getAudioTracks();
                if (!audioTracks || audioTracks.length === 0) {
                    stream.getTracks().forEach((t) => t.stop());
                    alert("Achtung: Im Dialog wurde kein Audio freigegeben. Unter Windows: 'Gesamter Bildschirm' wählen und das Häkchen 'Systemaudio teilen' aktivieren (bei einem Tab: 'Tab-Audio teilen'), damit VibSync den Sound analysieren kann.");
                    return;
                }
                setAudioStream(stream);
            }
        } catch (err) {
            console.error("Error accessing system audio:", err);
        }
    };

    const handleAudioInput = async (type) => {
        try {
            if (type === 'mic') {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    },
                    video: false
                });
                if (stream) setAudioStream(stream);
            } else if (type === 'system') {
                setShowAudioModal(true);
            }
        } catch (err) {
            console.error("Error accessing audio:", err);
        }
    };

    const handlePreset = (presetData) => {
        if (!presetData) return;
        if (Array.isArray(presetData) && presetData.length > 0) {
            setColors([...presetData]);
        } else if (presetData.colors) {
            setColors([...presetData.colors]);
            if (presetData.bgColor) {
                setSettings(prev => ({ ...prev, bgColor: presetData.bgColor }));
            }
        }
    };

    const handleSaveNewPreset = (e) => {
        e.preventDefault();
        const trimmed = newPresetName.trim();
        if (!trimmed) return;
        setCustomPresets(prev => ({
            ...prev,
            [trimmed]: {
                colors: [...colors],
                bgColor: settings.bgColor || '#160829'
            }
        }));
        setNewPresetName('');
        setShowAddPresetInput(false);
    };

    const handleDeleteCustomPreset = (presetName, e) => {
        e.stopPropagation();
        setCustomPresets(prev => {
            const next = { ...prev };
            delete next[presetName];
            return next;
        });
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

    const toggleFXEnabled = (fxId) => {
        setSettings(prev => {
            const currentList = prev.fxEnabledList || {};
            const isCurrentlyEnabled = currentList[fxId] !== false;
            return {
                ...prev,
                fxEnabledList: {
                    ...currentList,
                    [fxId]: !isCurrentlyEnabled
                }
            };
        });
    };

    const beatPunchVal = liveMetrics?.beatPunch || 0;
    const beatPunchPct = Math.min(100, Math.round(beatPunchVal * 100));
    const snareHitPct = Math.min(100, Math.round((liveMetrics?.snareHit || 0) * 100));
    const hihatTickPct = Math.min(100, Math.round((liveMetrics?.hihatTick || 0) * 100));

    const currentBPM = liveMetrics?.tempoBPM || 120;
    const confidencePct = Math.round((liveMetrics?.tempoConfidence || 0.5) * 100);
    const isPunchFlash = beatPunchVal > 0.35;
    const currentMeasureBeat = liveMetrics?.currentMeasureBeat || 1;


    const centroid = liveMetrics?.spectralCentroid || 0;
    const centroidKHz = (centroid * 8).toFixed(1);
    const tensionPct = Math.min(100, Math.round((liveMetrics?.songTension || 0) * 100));
    const dropRatio = Number(liveMetrics?.dropRatio || 1.0).toFixed(2);
    const isDrop = Boolean(liveMetrics?.isDropTriggered);
    const isBuildUp = Boolean(liveMetrics?.isBuildUp);

    const viscosityVal = Number(liveMetrics?.viscosity || 1.0).toFixed(2);
    const speedVal = Number(liveMetrics?.speed || 1.0).toFixed(2);
    const bgPulsePct = Math.min(100, Math.round((liveMetrics?.backgroundPulse || 0) * 100));
    const activeFXLive = liveMetrics?.activeFX;

    let tempoDescription = "Mid-Tempo Groove (95–130 BPM)";
    let viscosityDescription = "Ausgewogene Viskosität & Elastizität";
    if (currentBPM < 95) {
        tempoDescription = "Slow Chill / Ambient (< 95 BPM)";
        viscosityDescription = "Hohe Viskosität (Majestätisch & Dickflüssig)";
    } else if (currentBPM >= 130) {
        tempoDescription = "Fast High-Energy (≥ 130 BPM)";
        viscosityDescription = "Geringe Viskosität (Dünnflüssig & Spritzig)";
    }

    const fxEnabledList = settings.fxEnabledList || {};

    return (
        <div className={`ghost-ui-overlay ${show ? 'visible' : ''}`}>
            <button className="exit-btn" onClick={(e) => { e.stopPropagation(); navigate('/'); }} title="Zurück zur Startseite">
                <X size={18} />
            </button>

            {showAudioModal && (
                <div className="audio-modal-overlay">
                    <div className="audio-modal">
                        <h3>System Audio Setup</h3>
                        <p>Um System-Audio (z. B. Spotify, YouTube, Browser-Tabs) zu visualisieren, öffnet sich nun ein Freigabe-Dialog.</p>
                        <p>Wähle <strong>Tab</strong> oder <strong>Gesamter Bildschirm</strong> und aktiviere <strong>Audio teilen</strong>.</p>
                        <div className="modal-actions">
                            <button className="vs-btn" onClick={() => setShowAudioModal(false)}>Abbrechen</button>
                            <button className="vs-btn active" onClick={requestSystemAudio}>Verstanden, weiter</button>
                        </div>
                    </div>
                </div>
            )}

            <div 
                className="ghost-ui-workspace"
                onMouseEnter={onPanelEnter}
                onMouseLeave={onPanelLeave}
            >
                <div className="window-nav-dock">
                    <div className="nav-dock-brand">
                        <img src="/vibsync-logo.jpg" alt="VibSync Logo" className="inapp-logo-img" />
                        <span className="nav-dock-title">VibSync</span>
                    </div>

                    <div className="nav-dock-divider"></div>

                    <button
                        className={`nav-tab-btn ${activeTab === 'controls' ? 'active' : ''}`}
                        onClick={() => setActiveTab('controls')}
                    >
                        <Sliders size={14} />
                        <span>Physik & Sound</span>
                    </button>

                    <button
                        className={`nav-tab-btn studio-tab ${activeTab === 'symmetry_fx' ? 'active' : ''}`}
                        onClick={() => setActiveTab('symmetry_fx')}
                    >
                        <Sparkles size={14} />
                        <span>Symmetrie & FX Studio</span>
                        {settings.symmetry && <span className="tab-pill-badge">{settings.symmetryCount || 4}x</span>}
                        {activeFXLive && <span className="tab-pill-badge fx-glow">FX</span>}
                    </button>

                    <button
                        className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setActiveTab('dashboard')}
                    >
                        <BarChart2 size={14} />
                        <span>Audio-DSP Telemetrie</span>
                        {isDrop && <span className="tab-pill-badge drop-glow">Drop</span>}
                        {!isDrop && isBuildUp && <span className="tab-pill-badge buildup-glow">Build-Up</span>}
                    </button>
                </div>

                {activeTab === 'controls' && (
                    <div className="ghost-ui-single-layout fade-in">
                        <div className="settings-panel main-controls-panel full-width-controls">
                            <div className="settings-header">
                                <div className="header-group flex-fill">
                                    <div className="dashboard-title-row">
                                        <div className="section-title">
                                            <Sliders size={16} /> 
                                            <span>Wasser- & Liquid-Physik Kontrollzentrum</span>
                                        </div>
                                        <div className={`live-status-pill ${audioStream ? 'active' : ''}`}>
                                            <span className="live-dot"></span>
                                            <span>{audioStream ? 'AUDIO ENGINE AKTIV' : 'STANDBY'}</span>
                                        </div>
                                    </div>
                                    <div className="audio-source-header-row">
                                        <div className="audio-source-label"><Mic size={13} /> Audio-Quelle:</div>
                                        <div className="button-group audio-quick-select">
                                            <button className={`vs-btn ${audioStream?.getVideoTracks().length === 0 ? 'active' : ''}`} onClick={() => handleAudioInput('mic')}>
                                                <Mic size={13} /> Mikrofon
                                            </button>
                                            <button className={`vs-btn ${audioStream?.getVideoTracks().length > 0 ? 'active' : ''}`} onClick={() => handleAudioInput('system')}>
                                                <Radio size={13} /> System Audio
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="settings-content-area custom-scrollbar">
                                <div className="controls-2col-grid">
                                    {/* Spalte 1: Wasser- & Liquid-Physik + Frequenz-Kopplung */}
                                    <div className="controls-column">
                                        <div className="setting-card">
                                            <div className="card-header"><Waves size={14} /> Flüssigkeits- & Wasser-Physik (Fluid Dynamics)</div>
                                            <div className="setting-item">
                                                <label>Basis-Fließgeschwindigkeit <span className="value-badge">{(settings.baseSpeed ?? settings.speed ?? 0) > 0 ? `+${settings.baseSpeed ?? settings.speed ?? 0}` : (settings.baseSpeed ?? settings.speed ?? 0)}</span></label>
                                                <input type="range" min="-10" max="10" step="1" value={settings.baseSpeed ?? settings.speed ?? 0} onChange={(e) => updateSetting('baseSpeed', parseFloat(e.target.value))} />
                                                <span className="subtext">Kontinuierliche Schwebegeschwindigkeit & laminarer Fluss der Wassertropfen</span>
                                            </div>
                                            <div className="setting-item">
                                                <label>Beat-Beschleunigungsschub <span className="value-badge">{(settings.peakSpeed ?? 0) > 0 ? `+${settings.peakSpeed ?? 0}` : (settings.peakSpeed ?? 0)}</span></label>
                                                <input type="range" min="-10" max="10" step="1" value={settings.peakSpeed ?? 0} onChange={(e) => updateSetting('peakSpeed', parseFloat(e.target.value))} />
                                                <span className="subtext">Dynamische Beschleunigung proportional zur Lautstärke (extreme Energie = schnellerer Fluss)</span>
                                            </div>
                                            <div className="setting-item">
                                                <label>Beat-Puls-Stärke (Expansion) <span className="value-badge">{(settings.beatSensitivity ?? settings.sensitivity ?? 0) > 0 ? `+${settings.beatSensitivity ?? settings.beatSensitivity ?? 0}` : (settings.beatSensitivity ?? settings.sensitivity ?? 0)}</span></label>
                                                <input type="range" min="-10" max="10" step="1" value={settings.beatSensitivity ?? settings.sensitivity ?? 0} onChange={(e) => updateSetting('beatSensitivity', parseFloat(e.target.value))} />
                                                <span className="subtext">Volumetrische Aufblähung der Tropfen bei Bass-Schlägen & Kick-Drum Attacks</span>
                                            </div>
                                            <div className="setting-item">
                                                <label>Tropfen-Grundgröße (Ruhe-Radius) <span className="value-badge">{settings.baseRadius > 0 ? `+${settings.baseRadius}` : settings.baseRadius}</span></label>
                                                <input type="range" min="-10" max="10" step="1" value={settings.baseRadius} onChange={(e) => updateSetting('baseRadius', parseFloat(e.target.value))} />
                                                <span className="subtext">Ruhe-Radius der Flüssigkeitsträger (feine Wassertropfen bis riesige Fluid-Masse)</span>
                                            </div>
                                            <div className="setting-item">
                                                <label>Nachklingzeit / Elastizität & Dämpfung <span className="value-badge">{settings.shrinkSpeed > 0 ? `+${settings.shrinkSpeed}` : settings.shrinkSpeed}</span></label>
                                                <input type="range" min="-10" max="10" step="1" value={settings.shrinkSpeed} onChange={(e) => updateSetting('shrinkSpeed', parseFloat(e.target.value))} />
                                                <span className="subtext">Beat-Rückfederung (-10 = träge nachziehend, +10 = ultra-knackige Oberflächenspannung)</span>
                                            </div>
                                        </div>

                                        <div className="setting-card">
                                            <div className="card-header"><Activity size={14} /> Frequenz-Kopplung & Dynamik (Frequency Impact)</div>
                                            <div className="setting-item">
                                                <label>Low / Bass Impact <span className="value-badge">{settings.bassImpact > 0 ? `+${settings.bassImpact}` : settings.bassImpact}</span></label>
                                                <input type="range" min="-10" max="10" step="1" value={settings.bassImpact || 0} onChange={(e) => updateSetting('bassImpact', parseInt(e.target.value, 10))} />
                                                <span className="subtext">Koppelt volumetrische Expansion und tiefe Wasserturbulenzen an den Bassbereich</span>
                                            </div>
                                            <div className="setting-item">
                                                <label>Mid Frequency Impact <span className="value-badge">{settings.midImpact > 0 ? `+${settings.midImpact}` : settings.midImpact}</span></label>
                                                <input type="range" min="-10" max="10" step="1" value={settings.midImpact || 0} onChange={(e) => updateSetting('midImpact', parseInt(e.target.value, 10))} />
                                                <span className="subtext">Steuert Körper-Reaktion, Viskosität und harmonische Oberflächen-Wellen</span>
                                            </div>
                                            <div className="setting-item">
                                                <label>High / Treble Impact <span className="value-badge">{settings.trebleImpact > 0 ? `+${settings.trebleImpact}` : settings.trebleImpact}</span></label>
                                                <input type="range" min="-10" max="10" step="1" value={settings.trebleImpact || 0} onChange={(e) => updateSetting('trebleImpact', parseInt(e.target.value, 10))} />
                                                <span className="subtext">Steuert Mikro-Jitter, Zischen, Dispersions-Rippel und Oszillationen</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Spalte 2: Strobe & Drop FX + Particle Engine + Schnellnavigation */}
                                    <div className="controls-column">
                                        <div className="setting-card">
                                            <div className="card-header"><Zap size={14} /> Stroboskop-Effekt (Strobe FX)</div>
                                            <div className="setting-item">
                                                <label>
                                                    <span>Master Strobe Schalter</span>
                                                    <button 
                                                        type="button"
                                                        className={`vs-toggle-btn ${(settings.strobeEnabled ?? true) ? 'on' : ''}`}
                                                        onClick={() => updateSetting('strobeEnabled', !(settings.strobeEnabled ?? true))}
                                                    >
                                                        {(settings.strobeEnabled ?? true) ? 'AKTIV' : 'DEAKTIVIERT'}
                                                    </button>
                                                </label>
                                            </div>

                                            {(settings.strobeEnabled ?? true) && (
                                                <>
                                                    <div className="setting-item">
                                                        <label>Strobe Trigger-Modus</label>
                                                        <select
                                                            className="vs-select"
                                                            value={settings.dropMode || 'Drop-Reaktiv'}
                                                            onChange={(e) => updateSetting('dropMode', e.target.value)}
                                                        >
                                                            <option value="Drop-Reaktiv">Dynamisch & Pegel-Reaktiv (leise → laut & Pegelspitzen)</option>
                                                            <option value="Kontinuierlich">Kontinuierlich (Continuous Flash)</option>
                                                        </select>
                                                    </div>
                                                    <div className="setting-item">
                                                        <label>Strobe Target (Ziel-Ebene)</label>
                                                        <select
                                                            className="vs-select"
                                                            value={settings.strobeTarget || 'background'}
                                                            onChange={(e) => updateSetting('strobeTarget', e.target.value)}
                                                        >
                                                            <option value="background">Background (Hintergrund blitzt auf)</option>
                                                            <option value="particles">Particles (Partikel blitzen / glitchen)</option>
                                                        </select>
                                                    </div>
                                                    <div className="setting-item">
                                                        <label>
                                                            <span>Strobe-Geschwindigkeit</span>
                                                            <span className="value-badge">{settings.strobeSpeed ?? 10} Hz</span>
                                                        </label>
                                                        <input type="range" min="1" max="20" step="1" value={settings.strobeSpeed ?? 10} onChange={(e) => updateSetting('strobeSpeed', parseInt(e.target.value, 10))} />
                                                    </div>
                                                    <div className="setting-item">
                                                        <label>
                                                            <span>Strobe-Empfindlichkeit</span>
                                                            <span className="value-badge">{Number(settings.strobeSensitivity ?? 1.0).toFixed(1)}</span>
                                                        </label>
                                                        <input type="range" min="0.1" max="2.0" step="0.1" value={settings.strobeSensitivity ?? 1.0} onChange={(e) => updateSetting('strobeSensitivity', parseFloat(e.target.value))} />
                                                        <span className="subtext">Reagiert auf dynamische Lautstärkesprünge (leise → laut) sowie extreme Lautstärke-Pegelspitzen.</span>
                                                    </div>
                                                    <div className="setting-item">
                                                        <label>
                                                            <span>Blitz-Intensität (Flash Intensity)</span>
                                                            <span className="value-badge">{Number(settings.strobeIntensity ?? 0.8).toFixed(2)}</span>
                                                        </label>
                                                        <input type="range" min="0.1" max="1.0" step="0.05" value={settings.strobeIntensity ?? 0.8} onChange={(e) => updateSetting('strobeIntensity', parseFloat(e.target.value))} />
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="setting-card">
                                            <div className="card-header"><Layers size={14} /> Partikel & Blob Engine</div>
                                            <div className="setting-item">
                                                <label>Maximale Partikel-Anzahl (Min 5) <span className="value-badge">{settings.maxParticles ?? 12}</span></label>
                                                <input 
                                                    type="number" min="5" max="16" step="1" className="number-input" value={settings.maxParticles ?? 12} 
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value, 10);
                                                        if (!isNaN(val)) updateSetting('maxParticles', Math.min(16, Math.max(5, val)));
                                                    }} 
                                                />
                                                <span className="subtext">Die Engine garantiert stets mindestens 5 aktive Wasserträger.</span>
                                            </div>
                                        </div>

                                        <div className="setting-card quick-nav-card">
                                            <div className="card-header"><Sparkles size={14} /> Schnellzugriff Studio & Analyse</div>
                                            <div className="quick-nav-buttons-grid">
                                                <button 
                                                    type="button" 
                                                    className="vs-btn active studio-quick-btn"
                                                    onClick={() => setActiveTab('symmetry_fx')}
                                                >
                                                    <Sparkles size={14} />
                                                    <span>Symmetrie & FX Studio</span>
                                                </button>
                                                <button 
                                                    type="button" 
                                                    className="vs-btn active dash-quick-btn"
                                                    onClick={() => setActiveTab('dashboard')}
                                                >
                                                    <BarChart2 size={14} />
                                                    <span>Audio-DSP Telemetrie</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="settings-footer">
                                <div className="section-title"><Palette size={14} /> Farbpalette, Gespeicherte Presets & Hintergrund-Tönung</div>
                                <div className="footer-content">
                                    <div className="presets-wrapper">
                                        <div className="presets-group">
                                            <button className="vs-btn" onClick={() => handlePreset(DEFAULT_PRESETS.cyberpunk)}>Cyberpunk</button>
                                            <button className="vs-btn" onClick={() => handlePreset(DEFAULT_PRESETS.deep_ocean)}>Ocean</button>
                                            <button className="vs-btn" onClick={() => handlePreset(DEFAULT_PRESETS.sunset)}>Sunset</button>
                                            <button className="vs-btn" onClick={() => handlePreset(DEFAULT_PRESETS.matrix)}>Matrix</button>
                                        </div>

                                        {Object.keys(customPresets).length > 0 && (
                                            <div className="custom-presets-group">
                                                {Object.entries(customPresets).map(([name, presetColors]) => (
                                                    <div key={name} className="custom-preset-pill" onClick={() => handlePreset(presetColors)}>
                                                        <span className="preset-name">{name}</span>
                                                        <button className="preset-del-btn" onClick={(e) => handleDeleteCustomPreset(name, e)}><Trash2 size={11} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {!showAddPresetInput ? (
                                            <button className="vs-btn add-preset-btn" onClick={() => setShowAddPresetInput(true)}><Plus size={13} /> Preset speichern</button>
                                        ) : (
                                            <form className="save-preset-form" onSubmit={handleSaveNewPreset}>
                                                <input type="text" className="preset-name-input" placeholder="Preset Name..." value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} autoFocus />
                                                <button type="submit" className="vs-btn vs-btn-sm active">Speichern</button>
                                                <button type="button" className="vs-btn vs-btn-sm" onClick={() => setShowAddPresetInput(false)}>Abbrechen</button>
                                            </form>
                                        )}
                                    </div>

                                    <div className="color-swatches">
                                        {colors.map((c, i) => (
                                            <input key={i} type="color" value={c} onChange={(e) => handleColorChange(i, e.target.value)} />
                                        ))}
                                        <div className="setting-item bg-color-item" style={{ marginLeft: '12px' }}>
                                            <label style={{ fontSize: '0.75rem', marginBottom: 0, marginRight: '8px' }}>BG Tint</label>
                                            <input type="color" value={settings.bgColor} onChange={(e) => setSettings(prev => ({ ...prev, bgColor: e.target.value }))} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'symmetry_fx' && (
                    <div className="ghost-ui-twin-layout studio-twin-layout fade-in">
                        <div className="settings-panel symmetry-studio-panel">
                            <div className="settings-header">
                                <div className="header-group flex-fill">
                                    <div className="dashboard-title-row">
                                        <div className="section-title"><Sparkles size={15} /> Symmetrie & Spiegelungs-Labor</div>
                                        <button
                                            type="button"
                                            className={`master-symmetry-switch ${settings.symmetry ? 'active' : ''}`}
                                            onClick={() => updateSetting('symmetry', !settings.symmetry)}
                                        >
                                            <Disc size={13} />
                                            <span>{settings.symmetry ? 'SYMMETRIE: AKTIV' : 'SYMMETRIE: AUS'}</span>
                                        </button>
                                    </div>
                                    <span className="dashboard-subtitle">Erzeuge mehrdimensionale Kaleidoskope & kartesische Spiegelebenen</span>
                                </div>
                            </div>

                            <div className="settings-content-area custom-scrollbar">
                                <div className="symmetry-studio-grid">
                                    <div className="setting-card">
                                        <div className="card-header"><Compass size={14} /> Symmetrie-Geometrie / Modus</div>
                                        <div className="symmetry-mode-chips">
                                            <button type="button" className={`mode-chip ${(!settings.symmetryMode || settings.symmetryMode === 'radial') ? 'active' : ''}`} onClick={() => updateSetting('symmetryMode', 'radial')}><Orbit size={14} /> <span>Radiales Kaleidoskop</span></button>
                                            <button type="button" className={`mode-chip ${settings.symmetryMode === 'mirror_x' ? 'active' : ''}`} onClick={() => updateSetting('symmetryMode', 'mirror_x')}><Layers size={14} /> <span>Vertikal (Links / Rechts)</span></button>
                                            <button type="button" className={`mode-chip ${settings.symmetryMode === 'mirror_y' ? 'active' : ''}`} onClick={() => updateSetting('symmetryMode', 'mirror_y')}><Sliders size={14} /> <span>Horizontal (Oben / Unten)</span></button>
                                            <button type="button" className={`mode-chip ${settings.symmetryMode === 'mirror_quad' ? 'active' : ''}`} onClick={() => updateSetting('symmetryMode', 'mirror_quad')}><Crosshair size={14} /> <span>4-Quadranten Kreuzspiegel</span></button>
                                        </div>
                                    </div>

                                    <div className="setting-card">
                                        <div className="card-header"><Atom size={14} /> <span>Spiegelungs-Anzahl (Symmetrie-Ordnung)</span> <span className="value-badge">{settings.symmetryCount || 4}x Sektoren</span></div>
                                        <div className="quick-count-chips">
                                            {[2, 3, 4, 6, 8, 12, 16].map(num => (
                                                <button key={num} type="button" className={`count-chip ${(settings.symmetryCount || 4) === num ? 'active' : ''}`} onClick={() => updateSetting('symmetryCount', num)}>{num}x</button>
                                            ))}
                                        </div>
                                        <div className="setting-item" style={{ marginTop: '8px' }}>
                                            <input type="range" min="2" max="16" step="1" value={settings.symmetryCount || 4} onChange={(e) => updateSetting('symmetryCount', parseInt(e.target.value, 10))} />
                                        </div>
                                    </div>

                                    <div className="setting-card">
                                        <div className="card-header"><RotateCw size={14} /> Kaleidoskop-Drehung & Auto-Rotation</div>
                                        <div className="setting-item">
                                            <label>
                                                <span>BPM-Synchrone Auto-Rotation</span>
                                                <button type="button" className={`vs-toggle-btn ${(settings.symmetryAutoRotate ?? true) ? 'on' : ''}`} onClick={() => updateSetting('symmetryAutoRotate', !(settings.symmetryAutoRotate ?? true))}>
                                                    {(settings.symmetryAutoRotate ?? true) ? 'AKTIV (DREHT SICH)' : 'STATISCH'}
                                                </button>
                                            </label>
                                        </div>
                                        {(settings.symmetryAutoRotate ?? true) && (
                                            <div className="setting-item">
                                                <label>Rotationsgeschwindigkeit <span className="value-badge">{(settings.symmetryRotateSpeed ?? 2) > 0 ? `+${settings.symmetryRotateSpeed ?? 2}` : (settings.symmetryRotateSpeed ?? 2)}</span></label>
                                                <input type="range" min="-10" max="10" step="1" value={settings.symmetryRotateSpeed ?? 2} onChange={(e) => updateSetting('symmetryRotateSpeed', parseFloat(e.target.value))} />
                                            </div>
                                        )}
                                        <div className="setting-item">
                                            <label>Manueller Drehwinkel <span className="value-badge">{settings.symmetryRotation || 0}°</span></label>
                                            <input type="range" min="0" max="360" step="5" value={settings.symmetryRotation || 0} onChange={(e) => updateSetting('symmetryRotation', parseInt(e.target.value, 10))} />
                                        </div>
                                    </div>

                                    <div className="setting-card">
                                        <div className="card-header"><Palette size={14} /> Farb-Phasen & Fokuszentrum</div>
                                        <div className="setting-item">
                                            <label>Farb-Phasenverschiebung <span className="value-badge">{settings.symmetryColorShift ?? 30}° Hue</span></label>
                                            <input type="range" min="0" max="180" step="5" value={settings.symmetryColorShift ?? 30} onChange={(e) => updateSetting('symmetryColorShift', parseInt(e.target.value, 10))} />
                                        </div>
                                        <div className="setting-item" style={{ marginTop: '6px' }}>
                                            <div className="center-control-row">
                                                <label style={{ margin: 0 }}>Symmetrie-Fokuszentrum</label>
                                                <button type="button" className="vs-btn vs-btn-sm" onClick={() => { updateSetting('symmetryCenterX', 0.5); updateSetting('symmetryCenterY', 0.5); }}>Zentrieren (50/50)</button>
                                            </div>
                                            <div className="center-sliders-grid">
                                                <div className="center-sub-col">
                                                    <span className="sub-label">Zentrum X: {Math.round((settings.symmetryCenterX ?? 0.5) * 100)}%</span>
                                                    <input type="range" min="0.1" max="0.9" step="0.02" value={settings.symmetryCenterX ?? 0.5} onChange={(e) => updateSetting('symmetryCenterX', parseFloat(e.target.value))} />
                                                </div>
                                                <div className="center-sub-col">
                                                    <span className="sub-label">Zentrum Y: {Math.round((settings.symmetryCenterY ?? 0.5) * 100)}%</span>
                                                    <input type="range" min="0.1" max="0.9" step="0.02" value={settings.symmetryCenterY ?? 0.5} onChange={(e) => updateSetting('symmetryCenterY', parseFloat(e.target.value))} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="settings-panel special-fx-panel">
                            <div className="settings-header">
                                <div className="header-group flex-fill">
                                    <div className="dashboard-title-row">
                                        <div className="section-title"><Flame size={15} /> 10 Special-Effekte & Aktionen</div>
                                        <button
                                            type="button"
                                            className={`master-symmetry-switch ${settings.fxAutoTrigger !== false ? 'active' : ''}`}
                                            onClick={() => updateSetting('fxAutoTrigger', !(settings.fxAutoTrigger !== false))}
                                        >
                                            <Zap size={13} />
                                            <span>{settings.fxAutoTrigger !== false ? 'AUTO-TRIGGER: AN' : 'AUTO-TRIGGER: AUS'}</span>
                                        </button>
                                    </div>
                                    <span className="dashboard-subtitle">Kurze, dramatische Choreografien – manuell triggerbar oder bei Drops</span>
                                </div>
                            </div>

                            <div className="settings-content-area custom-scrollbar">
                                <div className="fx-global-controls-card">
                                    <div className="fx-global-grid">
                                        <div className="setting-item">
                                            <label>Musik-Trigger Bindung</label>
                                            <select className="vs-select" value={settings.fxTriggerMode || 'drop_and_bars'} onChange={(e) => updateSetting('fxTriggerMode', e.target.value)}>
                                                <option value="drop_and_bars">Drop & Alle 8 Takte (Empfohlen)</option>
                                                <option value="drop_only">Nur bei extremen Drops</option>
                                                <option value="bars_4">Alle 4 Takte (Downbeat)</option>
                                                <option value="bars_8">Alle 8 Takte</option>
                                                <option value="random">Zufällig & Dynamisch</option>
                                            </select>
                                        </div>
                                        <div className="setting-item">
                                            <label>FX-Dauer <span className="value-badge">{Number(settings.fxDuration || 1.6).toFixed(1)}s</span></label>
                                            <input type="range" min="0.5" max="3.5" step="0.1" value={settings.fxDuration || 1.6} onChange={(e) => updateSetting('fxDuration', parseFloat(e.target.value))} />
                                        </div>
                                        <div className="setting-item">
                                            <label>FX-Kraft / Intensität <span className="value-badge">{Number(settings.fxIntensity || 1.0).toFixed(1)}x</span></label>
                                            <input type="range" min="0.5" max="3.0" step="0.1" value={settings.fxIntensity || 1.0} onChange={(e) => updateSetting('fxIntensity', parseFloat(e.target.value))} />
                                        </div>
                                    </div>

                                    {/* Kugel-Beteiligung (Blob-Teilnahme) */}
                                    <div className="fx-participation-row">
                                        <div className="setting-item flex-fill">
                                            <label>Kugel-Beteiligung (Choreografie-Teilnahme)</label>
                                            <select
                                                className="vs-select"
                                                value={settings.fxParticipationMode || 'dynamic'}
                                                onChange={(e) => updateSetting('fxParticipationMode', e.target.value)}
                                            >
                                                <option value="dynamic">Organisch Dynamisch (50%–80% der Kugeln)</option>
                                                <option value="custom">Benutzerdefiniert ({settings.fxParticipationRate || 70}%)</option>
                                                <option value="all">Alle Kugeln (100%)</option>
                                            </select>
                                            <span className="subtext">Lässt unbeteiligte Kugeln ruhig im Hintergrund weiterschweben.</span>
                                        </div>
                                        {settings.fxParticipationMode === 'custom' && (
                                            <div className="setting-item participation-slider-col">
                                                <label>Anteil: <span className="value-badge">{settings.fxParticipationRate || 70}%</span></label>
                                                <input
                                                    type="range"
                                                    min="25"
                                                    max="100"
                                                    step="5"
                                                    value={settings.fxParticipationRate || 70}
                                                    onChange={(e) => updateSetting('fxParticipationRate', parseInt(e.target.value, 10))}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {activeFXLive && (
                                        <div className="live-fx-playing-banner">
                                            <div className="playing-label">
                                                <Flame size={14} className="flame-icon" />
                                                <span>AKTIV: <strong>{activeFXLive.name}</strong></span>
                                            </div>
                                            <div className="playing-progress-track">
                                                <div className="playing-progress-fill" style={{ width: `${Math.min(100, Math.round((activeFXLive.progress || 0) * 100))}%` }}></div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="special-fx-list-container">
                                    <div className="fx-list-header">
                                        <span>Alle 10 Effekte (Auswählen & Live Testen)</span>
                                        <span className="subtext">Klicke 'FEUERN', um einen Effekt sofort live zu sehen</span>
                                    </div>

                                    <div className="fx-items-grid">
                                        {FX_DEFINITIONS.map((fx, idx) => {
                                            const IconComp = fx.icon;
                                            const isEnabled = fxEnabledList[fx.id] !== false;
                                            const isCurrentlyPlaying = activeFXLive?.id === fx.id;

                                            return (
                                                <div key={fx.id} className={`fx-item-card ${isCurrentlyPlaying ? 'playing' : ''} ${isEnabled ? 'enabled' : 'disabled'}`}>
                                                    <div className="fx-item-left">
                                                        <button type="button" className={`fx-checkbox ${isEnabled ? 'checked' : ''}`} onClick={() => toggleFXEnabled(fx.id)}>{isEnabled && <Check size={12} />}</button>
                                                        <div className="fx-icon-box" style={{ backgroundColor: `${fx.color}20`, borderColor: `${fx.color}60`, color: fx.color }}>
                                                            <IconComp size={16} />
                                                        </div>
                                                        <div className="fx-text-info">
                                                            <div className="fx-title-row"><span className="fx-title">{idx + 1}. {fx.name}</span>{isCurrentlyPlaying && <span className="fx-live-badge">FEUERT</span>}</div>
                                                            <span className="fx-desc">{fx.desc}</span>
                                                        </div>
                                                    </div>
                                                    <button type="button" className="vs-btn fx-fire-btn" onClick={() => onTriggerFX && onTriggerFX(fx.id)}><Play size={12} /> <span>FEUERN</span></button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'dashboard' && (
                    <div className="ghost-ui-single-layout fade-in">
                        <div className="settings-panel dashboard-panel full-width-dash">
                            <div className="settings-header dashboard-header">
                                <div className="header-group flex-fill">
                                    <div className="dashboard-title-row">
                                        <div className="section-title"><BarChart2 size={16} /> Audio-DSP Telemetrie & Spektral-Labor</div>
                                        <div className="live-status-pill">
                                            <span className="live-dot"></span>
                                            <span>{audioStream ? 'LIVE ANALYZER (60 FPS)' : 'AUDIO STANDBY'}</span>
                                        </div>
                                    </div>
                                    <span className="dashboard-subtitle">Umfassende 20 Hz – 20 kHz Multiband-Analyse, Onset-Transienten, Beat-Quantisierung & Fluid-Physik</span>
                                </div>
                            </div>
                            <div className="settings-content-area dashboard-content custom-scrollbar">
                                {/* 1. Master Professional Spectrum Analyzer Module */}
                                <SpectrumAnalyzer liveMetrics={liveMetrics} audioStream={audioStream} />

                                {/* 2. Bottom 3-Column Telemetry Diagnostics Grid */}
                                <div className="dash-telemetry-bottom-grid">
                                    {/* Card 1: Rhythm, BPM & Transients */}
                                    <div className="dash-card">
                                        <div className="dash-card-header">
                                            <Gauge size={14} />
                                            <span>Rhythmus, Tempo & Onsets</span>
                                            <span className="dash-badge">{confidencePct}% Konfidenz</span>
                                        </div>
                                        <div className="dash-tempo-main">
                                            <div className={`big-bpm-box ${isPunchFlash ? 'beat-glow' : ''}`}>
                                                <div className="big-bpm-value">{currentBPM}</div>
                                                <div className="big-bpm-label">BPM</div>
                                            </div>
                                            <div className="tempo-meta-col">
                                                <div className="tempo-genre-tag">{tempoDescription}</div>
                                                <div className="measure-beats-wrapper">
                                                    <div className="measure-label-row">
                                                        <span>4/4 Metronom-Schlagfolge</span>
                                                        <span className="measure-beat-name">Schlag {currentMeasureBeat} von 4</span>
                                                    </div>
                                                    <div className="measure-beats-grid">
                                                        {[1, 2, 3, 4].map(b => (
                                                            <div key={b} className={`measure-beat-chip ${currentMeasureBeat === b ? 'active' : ''} ${b === 1 ? 'downbeat' : ''}`}>
                                                                <span className="beat-dot"></span><span className="beat-num">{b}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="onsets-grid">
                                            <div className="onset-item">
                                                <div className="onset-info"><span className="onset-name">Kick-Punch (Transient Attack)</span><span className="onset-val">{beatPunchPct}%</span></div>
                                                <div className="onset-track"><div className="onset-fill kick" style={{ width: `${beatPunchPct}%` }}></div></div>
                                            </div>
                                            <div className="onset-item">
                                                <div className="onset-info"><span className="onset-name">Snare / Clap Onset</span><span className="onset-val">{snareHitPct}%</span></div>
                                                <div className="onset-track"><div className="onset-fill snare" style={{ width: `${snareHitPct}%` }}></div></div>
                                            </div>
                                            <div className="onset-item">
                                                <div className="onset-info"><span className="onset-name">Hi-Hat High Tick</span><span className="onset-val">{hihatTickPct}%</span></div>
                                                <div className="onset-track"><div className="onset-fill hihat" style={{ width: `${hihatTickPct}%` }}></div></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card 2: Song Dynamics, Tension & Drop Ratio */}
                                    <div className="dash-card">
                                        <div className="dash-card-header">
                                            <Zap size={14} />
                                            <span>Song-Dynamik, Tension & Drop</span>
                                            <div className={`drop-status-tag ${isDrop ? 'active' : (isBuildUp ? 'buildup' : '')}`}>
                                                {isDrop ? '⚡ DROP AKTIV' : (isBuildUp ? '🔥 BUILD-UP' : 'STANDBY')}
                                            </div>
                                        </div>
                                        <div className="timbre-tension-grid">
                                            <div className="metric-box">
                                                <div className="metric-title"><Compass size={12} /> Spektral-Center</div>
                                                <div className="metric-num">{centroidKHz} kHz</div>
                                                <span className="metric-sub">Klangliche Helligkeit</span>
                                            </div>
                                            <div className="metric-box">
                                                <div className="metric-title"><Flame size={12} /> Song-Tension</div>
                                                <div className="metric-num">{tensionPct}%</div>
                                                <span className="metric-sub">Spannungsaufbau</span>
                                            </div>
                                            <div className="metric-box">
                                                <div className="metric-title"><Zap size={12} /> Drop Ratio</div>
                                                <div className="metric-num">{dropRatio}x</div>
                                                <span className="metric-sub">Dynamischer Schub</span>
                                            </div>
                                        </div>
                                        <div className="drop-indicator-footer">
                                            <div className="drop-scale-labels">
                                                <span>Energie-Schwelle: {Number(settings.strobeSensitivity ?? 1.0).toFixed(1)}x</span>
                                                <span className="drop-state-name">{isDrop ? 'Massiver Drop feuert!' : (isBuildUp ? 'Spannung steigt an...' : 'Gleichmäßiger Beat')}</span>
                                            </div>
                                            <div className="drop-meter-track">
                                                <div className={`drop-meter-fill ${isDrop ? 'active' : ''}`} style={{ width: `${Math.min(100, Math.max(5, Math.round(parseFloat(dropRatio) * 35)))}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card 3: GPU Visual Physics Model */}
                                    <div className="dash-card">
                                        <div className="dash-card-header">
                                            <Waves size={14} />
                                            <span>Berechnete Visual-Physik (GPU)</span>
                                            <span className="dash-badge">Fluid Engine</span>
                                        </div>
                                        <div className="physics-telemetry-grid">
                                            <div className="phys-row">
                                                <span className="phys-label">Dynamische Viskosität:</span>
                                                <span className="phys-val">{viscosityVal}</span>
                                                <span className="phys-note">{viscosityDescription}</span>
                                            </div>
                                            <div className="phys-row">
                                                <span className="phys-label">Partikel-Geschwindigkeit:</span>
                                                <span className="phys-val">{speedVal}x</span>
                                                <span className="phys-note">Laminarer Fluss & Peak-Schub</span>
                                            </div>
                                            <div className="phys-row">
                                                <span className="phys-label">Hintergrund-Pulsation:</span>
                                                <span className="phys-val">{bgPulsePct}%</span>
                                                <span className="phys-note">Bass-Sync Farbhelligkeit</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GhostUI;
