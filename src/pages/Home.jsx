import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Sparkles, Activity, Layers, Sliders, Zap, Sun } from 'lucide-react';
import './Home.css';

const Home = () => {
    const navigate = useNavigate();

    return (
        <div className="home-container">
            {/* Animated background elements & liquid ambient glow */}
            <div className="orb orb-1"></div>
            <div className="orb orb-2"></div>
            <div className="orb orb-3"></div>
            <div className="glow-grid"></div>

            <div className="content-wrapper">
                {/* Main Dark Glassmorphism Hero Panel */}
                <div className="glass-panel main-hero-panel">
                    <div className="badge">
                        <Sparkles className="badge-icon" size={14} />
                        <span>Pure 2D Liquid Mode & UI Overhaul</span>
                    </div>

                    <h1 className="hero-title">
                        Elevate Your <span className="text-gradient">Music Vibes</span>
                    </h1>

                    <p className="hero-subtitle">
                        Next-generation 2D soft-edge metaball audio visualizer with dynamic audio physics, 
                        drop-reactive energy strobe, reactive background pulse, and consolidated glassmorphism UI.
                    </p>

                    <button
                        className="cta-button primary-cta"
                        onClick={() => navigate('/vibesync')}
                    >
                        <span className="cta-content">
                            Launch VibeSync
                            <Play className="play-icon" size={18} fill="currentColor" />
                        </span>
                        <div className="cta-glow"></div>
                    </button>

                    {/* Showcase Feature Cards Grid */}
                    <div className="feature-cards-grid">
                        <div className="feature-card">
                            <div className="feature-icon-wrapper">
                                <Layers size={20} />
                            </div>
                            <div className="feature-card-content">
                                <h3>2D Soft-Edge Metaballs</h3>
                                <p>Smooth metaball blending with normalized color math, no 3D lighting, no white clipping.</p>
                            </div>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon-wrapper">
                                <Zap size={20} />
                            </div>
                            <div className="feature-card-content">
                                <h3>Drop Strobe Overhaul</h3>
                                <p>Continuous energy threshold trigger during drops with customizable Background or Particle targets.</p>
                            </div>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon-wrapper">
                                <Sliders size={20} />
                            </div>
                            <div className="feature-card-content">
                                <h3>Consolidated Controls</h3>
                                <p>Fixed-height glass panel with integrated audio source, swatches, modern sliders & min 5 particles floor.</p>
                            </div>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon-wrapper">
                                <Activity size={20} />
                            </div>
                            <div className="feature-card-content">
                                <h3>Reactive Background</h3>
                                <p>Palette background gently pulses in brightness and saturation in sync with bass hits.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;
