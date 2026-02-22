import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Sparkles, Music, Headphones } from 'lucide-react';
import './Home.css';

const Home = () => {
    const navigate = useNavigate();

    return (
        <div className="home-container">
            {/* Animated background elements */}
            <div className="orb orb-1"></div>
            <div className="orb orb-2"></div>
            <div className="orb orb-3"></div>
            <div className="glow-grid"></div>

            <div className="content-wrapper">
                {/* Main Glass Panel */}
                <div className="glass-panel main-hero-panel">
                    <div className="badge">
                        <Sparkles className="badge-icon" size={14} />
                        <span>Next Generation Platform</span>
                    </div>

                    <h1 className="hero-title">
                        Elevate Your <span className="text-gradient">Vibe</span>
                    </h1>

                    <p className="hero-subtitle">
                        Experience the ultimate synchronization of your music library.
                        Immersive, intelligent, and beautifully crafted for audiophiles.
                    </p>

                    <button
                        className="cta-button primary-cta"
                        onClick={() => navigate('/vibesync')}
                    >
                        <span className="cta-content">
                            Go to VibeSync
                            <Play className="play-icon" size={18} fill="currentColor" />
                        </span>
                        <div className="cta-glow"></div>
                    </button>

                    <div className="features-row">
                        <div className="feature-item">
                            <div className="feature-icon-wrapper">
                                <Music size={20} />
                            </div>
                            <span className="feature-text">High Fidelity</span>
                        </div>
                        <div className="feature-divider"></div>
                        <div className="feature-item">
                            <div className="feature-icon-wrapper">
                                <Headphones size={20} />
                            </div>
                            <span className="feature-text">Seamless Sync</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;
