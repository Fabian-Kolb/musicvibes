import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Play, 
    Sparkles, 
    Mic, 
    Sliders, 
    Waves, 
    Zap, 
    Music, 
    Activity, 
    Layers, 
    ArrowRight,
    Gauge,
    Palette
} from 'lucide-react';
import './Home.css';

const Home = () => {
    const navigate = useNavigate();

    const scrollToSection = (id) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <div className="home-container">
            {/* Subtile, dezente Hintergrund-Beleuchtung (kein harter Glow) */}
            <div className="ambient-glow glow-top"></div>
            <div className="ambient-glow glow-bottom"></div>

            {/* Top Navigation Bar */}
            <header className="home-navbar">
                <div className="nav-brand">
                    <img 
                        src="/vibsync-logo.jpg" 
                        alt="VibSync Logo" 
                        className="nav-logo-img"
                    />
                    <span className="nav-brand-text">VibSync</span>
                </div>
                <div className="nav-actions">
                    <button 
                        className="nav-secondary-btn"
                        onClick={() => scrollToSection('how-it-works')}
                    >
                        Funktionsweise
                    </button>
                    <button 
                        className="nav-primary-btn"
                        onClick={() => navigate('/vibesync')}
                    >
                        <Play size={14} fill="currentColor" />
                        <span>App Starten</span>
                    </button>
                </div>
            </header>

            <main className="home-main">
                {/* Hero Section */}
                <section className="hero-section">
                    <div className="hero-content">
                        <div className="hero-badge">
                            <Sparkles size={13} className="badge-sparkle" />
                            <span>Echtzeit 2D-Audio-Visualizer</span>
                        </div>

                        <h1 className="hero-headline">
                            Musik sichtbar machen. <br />
                            <span className="headline-highlight">Organisch & fließend.</span>
                        </h1>

                        <p className="hero-description">
                            VibSync analysiert Audiosignale in Echtzeit und übersetzt Frequenzen in lebendige, 
                            weich verschmelzende 2D-Metaballs mit dynamischer Physik und Lichtstroboskopen.
                        </p>

                        <div className="hero-cta-group">
                            <button 
                                className="btn-primary-large"
                                onClick={() => navigate('/vibesync')}
                            >
                                <Play size={18} fill="currentColor" />
                                <span>Visualizer starten</span>
                            </button>
                            <button 
                                className="btn-secondary-large"
                                onClick={() => scrollToSection('how-it-works')}
                            >
                                <span>So funktioniert's</span>
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </section>

                {/* 3-Schritte-Erklärung: Was ist VibSync? */}
                <section id="how-it-works" className="section-container">
                    <div className="section-header">
                        <span className="section-subtitle">Einfach & Direkt</span>
                        <h2 className="section-title">In 3 Schritten zu deiner Visualisierung</h2>
                        <p className="section-desc">
                            Keine komplizierte Einrichtung. VibSync läuft vollständig lokal in deinem Browser.
                        </p>
                    </div>

                    <div className="steps-grid">
                        <div className="step-card">
                            <div className="step-number">01</div>
                            <div className="step-icon-box">
                                <Mic size={22} />
                            </div>
                            <h3 className="step-title">Audioquelle wählen</h3>
                            <p className="step-text">
                                Verwende dein Mikrofon für externe Musik (z. B. Lautsprecher, Instrumente) 
                                oder lade lokale Audiodateien (MP3, WAV) direkt im Browser ab.
                            </p>
                        </div>

                        <div className="step-card">
                            <div className="step-number">02</div>
                            <div className="step-icon-box">
                                <Waves size={22} />
                            </div>
                            <h3 className="step-title">Frequenzen treiben Physik</h3>
                            <p className="step-text">
                                Bässe vergrößern die Tropfen, Mitten steuern die Strömungsgeschwindigkeit 
                                und Höhen erzeugen feine Oberflächenvibrationen.
                            </p>
                        </div>

                        <div className="step-card">
                            <div className="step-number">03</div>
                            <div className="step-icon-box">
                                <Sliders size={22} />
                            </div>
                            <h3 className="step-title">Individuell anpassen</h3>
                            <p className="step-text">
                                Verändere Partikelanzahl, Geschwindigkeit, Farbpaletten und Drop-Strobes 
                                mit dem aufgeräumten, einklappbaren Ghost-Bedienpanel.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Kernfunktionen & Highlights */}
                <section className="section-container">
                    <div className="section-header">
                        <span className="section-subtitle">Leistungsmerkmale</span>
                        <h2 className="section-title">Das macht VibSync besonders</h2>
                    </div>

                    <div className="features-grid">
                        <div className="feature-box">
                            <div className="feature-icon">
                                <Layers size={20} />
                            </div>
                            <div className="feature-info">
                                <h4>Pure 2D Soft-Edge Metaballs</h4>
                                <p>
                                    Flüssige, organisch verschmelzende Partikel mit nativer WebGL- und Canvas-Beschleunigung ohne störende 3D-Kanten oder Glanzeffekte.
                                </p>
                            </div>
                        </div>

                        <div className="feature-box">
                            <div className="feature-icon">
                                <Activity size={20} />
                            </div>
                            <div className="feature-info">
                                <h4>Echte 3-Band Frequenzanalyse</h4>
                                <p>
                                    Präzise Aufteilung in Sub-Bass (20–250 Hz), Mitten (250–4000 Hz) und Höhen (4–16 kHz) für natürliche Audio-Reaktivität.
                                </p>
                            </div>
                        </div>

                        <div className="feature-box">
                            <div className="feature-icon">
                                <Zap size={20} />
                            </div>
                            <div className="feature-info">
                                <h4>Drop-Strobe & Dynamischer Hintergrund</h4>
                                <p>
                                    Intelligente Erkennung von Song-Drops mit wählbaren Strobe-Zielen und einem Hintergrund, der sanft im Takt des Basses pulsiert.
                                </p>
                            </div>
                        </div>

                        <div className="feature-box">
                            <div className="feature-icon">
                                <Palette size={20} />
                            </div>
                            <div className="feature-info">
                                <h4>Elegante Farbpaletten & Ghost-UI</h4>
                                <p>
                                    Vordefinierte Themes (Cyberpunk, Deep Ocean, Sunset, Matrix) und ein UI-Panel, das bei Inaktivität dezent verschwindet.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Frequenz-Physik Übersicht */}
                <section className="section-container">
                    <div className="physics-panel">
                        <div className="physics-panel-header">
                            <Gauge size={22} className="physics-icon" />
                            <div>
                                <h3>Wie die Audio-Physik funktioniert</h3>
                                <p>Jeder Frequenzbereich hat eine direkte, physikalische Wirkung auf die Partikelwelt:</p>
                            </div>
                        </div>

                        <div className="physics-bands">
                            <div className="band-item band-bass">
                                <div className="band-badge">Bass (20 – 250 Hz)</div>
                                <h5>Volumen & Puls</h5>
                                <p>Erzeugt Druckwellen, vergrößert die Metaballs und lässt den Hintergrund synchron im Beat aufleuchten.</p>
                            </div>

                            <div className="band-item band-mid">
                                <div className="band-badge">Mitten (250 – 4000 Hz)</div>
                                <h5>Strömung & Fluss</h5>
                                <p>Bestimmt die Bewegungsgeschwindigkeit und sorgt für harmonische Strömungsdynamik der Partikel.</p>
                            </div>

                            <div className="band-item band-treble">
                                <div className="band-badge">Höhen (4 – 16 kHz)</div>
                                <h5>Details & Turbulenz</h5>
                                <p>Verleiht den Rändern feinste Schwingungen und erhöht die Oberflächenspannung bei Snares und Becken.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Bottom Call to Action */}
                <section className="section-container cta-section">
                    <div className="cta-card">
                        <h2>Bereit für deine Visuals?</h2>
                        <p>Starte den Visualizer direkt in deinem Browser – ohne Registrierung, ohne Installation.</p>
                        <button 
                            className="btn-primary-large"
                            onClick={() => navigate('/vibesync')}
                        >
                            <Play size={18} fill="currentColor" />
                            <span>VibSync starten</span>
                        </button>
                    </div>
                </section>
            </main>

            {/* Clean, Minimalist Footer */}
            <footer className="home-footer">
                <div className="footer-content">
                    <div className="footer-brand">
                        <img src="/vibsync-logo.jpg" alt="VibSync Logo" className="footer-logo" />
                        <span>VibSync Audio Visualizer</span>
                    </div>
                    <p className="footer-copy">Reaktive 2D-Audio-Metaballs & Physik-Engine.</p>
                </div>
            </footer>
        </div>
    );
};

export default Home;
