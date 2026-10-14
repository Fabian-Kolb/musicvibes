import React, { useRef, useEffect, useMemo } from 'react';
import { Activity, Zap, Compass, BarChart2, Radio, Layers, Flame } from 'lucide-react';

const BAND_CONFIGS = [
    {
        id: 'subBass',
        name: 'Sub-Bass',
        shortName: 'SUB',
        range: '20 - 60 Hz',
        role: '808 & Tiefbass',
        color: '#8b5cf6', // Violet
        gradient: 'linear-gradient(180deg, #a78bfa, #7c3aed, #4c1d95)',
        minHz: 20,
        maxHz: 60
    },
    {
        id: 'kick',
        name: 'Kick / Bass',
        shortName: 'KICK',
        range: '60 - 180 Hz',
        role: 'Punch & Bassline',
        color: '#f43f5e', // Rose
        gradient: 'linear-gradient(180deg, #fb7185, #f43f5e, #be123c)',
        minHz: 60,
        maxHz: 180
    },
    {
        id: 'lowMid',
        name: 'Low-Mid',
        shortName: 'LOMID',
        range: '180 - 500 Hz',
        role: 'Wärme & Snare-Body',
        color: '#f97316', // Orange
        gradient: 'linear-gradient(180deg, #fb923c, #f97316, #c2410c)',
        minHz: 180,
        maxHz: 500
    },
    {
        id: 'mid',
        name: 'Mid',
        shortName: 'MID',
        range: '500 - 2k Hz',
        role: 'Vocals & Synth-Leads',
        color: '#f59e0b', // Amber
        gradient: 'linear-gradient(180deg, #fbbf24, #f59e0b, #b45309)',
        minHz: 500,
        maxHz: 2000
    },
    {
        id: 'presence',
        name: 'Presence',
        shortName: 'PRES',
        range: '2k - 6k Hz',
        role: 'Attack & Snare-Crack',
        color: '#10b981', // Emerald
        gradient: 'linear-gradient(180deg, #34d399, #10b981, #047857)',
        minHz: 2000,
        maxHz: 6000
    },
    {
        id: 'brilliance',
        name: 'Brilliance',
        shortName: 'BRILL',
        range: '6k - 12k Hz',
        role: 'Hi-Hats & Cymbals',
        color: '#38bdf8', // Sky
        gradient: 'linear-gradient(180deg, #38bdf8, #0284c7, #0369a1)',
        minHz: 6000,
        maxHz: 12000
    },
    {
        id: 'air',
        name: 'Air',
        shortName: 'AIR',
        range: '12k - 20k Hz',
        role: 'Shimmer & Glanz',
        color: '#818cf8', // Indigo
        gradient: 'linear-gradient(180deg, #a5b4fc, #818cf8, #4338ca)',
        minHz: 12000,
        maxHz: 20000
    }
];

const FREQ_MARKERS = [
    { hz: 20, label: '20' },
    { hz: 50, label: '50' },
    { hz: 100, label: '100' },
    { hz: 250, label: '250' },
    { hz: 500, label: '500' },
    { hz: 1000, label: '1k' },
    { hz: 2000, label: '2k' },
    { hz: 5000, label: '5k' },
    { hz: 10000, label: '10k' },
    { hz: 20000, label: '20k' }
];

const DB_GRID = [
    { db: 0, label: '0 dB' },
    { db: -6, label: '-6' },
    { db: -12, label: '-12' },
    { db: -18, label: '-18' },
    { db: -24, label: '-24' },
    { db: -36, label: '-36' },
    { db: -48, label: '-48' },
    { db: -60, label: '-60 dB' }
];

const MIN_LOG_HZ = Math.log10(20);
const MAX_LOG_HZ = Math.log10(20000);

function hzToLogNormalized(hz) {
    const clampedHz = Math.max(20, Math.min(20000, hz));
    return (Math.log10(clampedHz) - MIN_LOG_HZ) / (MAX_LOG_HZ - MIN_LOG_HZ);
}

const SpectrumAnalyzer = ({ liveMetrics, audioStream }) => {
    const canvasRef = useRef(null);
    const peakEnvelopeRef = useRef(new Float32Array(512));
    const bandPeaksRef = useRef(new Float32Array(7));
    const bandPeakHoldTimerRef = useRef(new Float32Array(7));
    const animFrameRef = useRef(null);
    // The RTA loop reads the newest metrics from a ref, so it is not torn down and restarted
    // on every metrics update (~30x per second).
    const liveMetricsRef = useRef(liveMetrics);
    useEffect(() => {
        liveMetricsRef.current = liveMetrics;
    }, [liveMetrics]);

    // Track real-time peak holds and draw 60 FPS RTA Canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let lastTime = performance.now();

        const render = (now) => {
            const dt = Math.min(0.1, (now - lastTime) / 1000.0);
            lastTime = now;

            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            const dpr = window.devicePixelRatio || 1;

            if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
                canvas.width = Math.floor(width * dpr);
                canvas.height = Math.floor(height * dpr);
            }

            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, width, height);

            const padLeft = 36;
            const padRight = 16;
            const padTop = 14;
            const padBottom = 22;
            const plotW = width - padLeft - padRight;
            const plotH = height - padTop - padBottom;

            if (plotW <= 10 || plotH <= 10) {
                ctx.restore();
                animFrameRef.current = requestAnimationFrame(render);
                return;
            }

            // 1. Draw subtle background bands
            BAND_CONFIGS.forEach((b, idx) => {
                const xStart = padLeft + hzToLogNormalized(b.minHz) * plotW;
                const xEnd = padLeft + hzToLogNormalized(b.maxHz) * plotW;
                const bandWidth = xEnd - xStart;

                // Subtle alternating band background tint
                ctx.fillStyle = `${b.color}08`;
                ctx.fillRect(xStart, padTop, bandWidth, plotH);

                // Subtle separator lines
                if (idx > 0) {
                    ctx.strokeStyle = `${b.color}25`;
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath();
                    ctx.moveTo(xStart, padTop);
                    ctx.lineTo(xStart, padTop + plotH);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            });

            // 2. Draw horizontal dB grid lines
            DB_GRID.forEach((g) => {
                const normY = (0 - g.db) / 60.0; // 0 dB = top (0.0), -60 dB = bottom (1.0)
                const y = padTop + normY * plotH;

                ctx.strokeStyle = g.db === 0 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)';
                ctx.lineWidth = g.db === 0 ? 1.2 : 0.8;
                ctx.beginPath();
                ctx.moveTo(padLeft, y);
                ctx.lineTo(padLeft + plotW, y);
                ctx.stroke();

                // dB Label
                ctx.fillStyle = g.db === 0 ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.35)';
                ctx.font = '9px "JetBrains Mono", monospace, sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(g.label, padLeft - 6, y);
            });

            // 3. Draw vertical logarithmic frequency markers
            FREQ_MARKERS.forEach((m) => {
                const x = padLeft + hzToLogNormalized(m.hz) * plotW;

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(x, padTop);
                ctx.lineTo(x, padTop + plotH);
                ctx.stroke();

                // Freq Label
                ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
                ctx.font = '9px "JetBrains Mono", monospace, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(m.label, x, padTop + plotH + 5);
            });

            // 4. Draw continuous FFT spectrum curve (Instantaneous RTA)
            const rawFreq = liveMetricsRef.current?.frequencyData;
            const fftLen = rawFreq ? rawFreq.length : 512;
            const sampleRate = liveMetricsRef.current?.sampleRate || 44100;
            const nyquist = sampleRate / 2;
            const hzPerBin = nyquist / fftLen;

            // Generate points mapped logarithmically
            const numSamples = 160;
            const points = [];
            const peakEnvelopes = peakEnvelopeRef.current;

            for (let i = 0; i <= numSamples; i++) {
                const normLog = i / numSamples;
                const logHz = Math.pow(10, MIN_LOG_HZ + normLog * (MAX_LOG_HZ - MIN_LOG_HZ));
                const exactBin = logHz / hzPerBin;
                const binLow = Math.max(0, Math.min(fftLen - 2, Math.floor(exactBin)));
                const frac = exactBin - binLow;

                let mag = 0;
                if (rawFreq && rawFreq.length > 0) {
                    const v1 = rawFreq[binLow] / 255.0;
                    const v2 = rawFreq[binLow + 1] / 255.0;
                    mag = v1 * (1 - frac) + v2 * frac;
                }

                // dB mapping: 0 mag = -60 dB, 1.0 mag = 0 dB
                const valDB = mag > 0.001 ? Math.max(-60, 20 * Math.log10(mag)) : -60;
                const normHeight = Math.max(0, Math.min(1, (valDB + 60) / 60.0));

                const x = padLeft + normLog * plotW;
                const y = padTop + plotH - normHeight * plotH;
                points.push({ x, y, normHeight, mag });

                // Update peak envelope with gravity decay
                if (i < peakEnvelopes.length) {
                    if (normHeight > peakEnvelopes[i]) {
                        peakEnvelopes[i] = normHeight;
                    } else {
                        peakEnvelopes[i] = Math.max(0, peakEnvelopes[i] - dt * 0.45);
                    }
                }
            }

            if (points.length > 1) {
                // Gradient Fill underneath the spectrum
                const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
                gradient.addColorStop(0.0, 'rgba(56, 189, 248, 0.45)');
                gradient.addColorStop(0.3, 'rgba(167, 139, 250, 0.30)');
                gradient.addColorStop(0.7, 'rgba(244, 63, 94, 0.18)');
                gradient.addColorStop(1.0, 'rgba(20, 24, 40, 0.02)');

                ctx.beginPath();
                ctx.moveTo(points[0].x, padTop + plotH);
                ctx.lineTo(points[0].x, points[0].y);

                for (let i = 1; i < points.length; i++) {
                    const prev = points[i - 1];
                    const curr = points[i];
                    const midX = (prev.x + curr.x) / 2;
                    const midY = (prev.y + curr.y) / 2;
                    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
                }
                ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
                ctx.lineTo(points[points.length - 1].x, padTop + plotH);
                ctx.closePath();
                ctx.fillStyle = gradient;
                ctx.fill();

                // High-precision RTA Glow Outline Curve
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    const prev = points[i - 1];
                    const curr = points[i];
                    const midX = (prev.x + curr.x) / 2;
                    const midY = (prev.y + curr.y) / 2;
                    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
                }
                ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 2.0;
                ctx.shadowColor = '#38bdf8';
                ctx.shadowBlur = 8;
                ctx.stroke();
                ctx.shadowBlur = 0; // Reset shadow

                // Peak-Hold Outline (Floating White/Cyan trace)
                ctx.beginPath();
                for (let i = 0; i < points.length && i < peakEnvelopes.length; i++) {
                    const pX = points[i].x;
                    const pY = padTop + plotH - peakEnvelopes[i] * plotH;
                    if (i === 0) ctx.moveTo(pX, pY);
                    else ctx.lineTo(pX, pY);
                }
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
                ctx.lineWidth = 1.0;
                ctx.setLineDash([2, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();
            animFrameRef.current = requestAnimationFrame(render);
        };

        animFrameRef.current = requestAnimationFrame(render);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, []);

    // Compute live 7-Band metrics, dBFS & Peak Hold
    const bands7 = liveMetrics?.bands7 || {};
    const bandValues = useMemo(() => {
        return BAND_CONFIGS.map((b, idx) => {
            const rawBand = bands7[b.id] || {};
            const rms = rawBand.rms || 0;
            const peak = rawBand.peak || 0;
            const pct = Math.min(100, Math.round(rms * 100));
            const peakPct = Math.min(100, Math.round(peak * 100));

            // Instant dBFS calculation
            let dbFS = -90;
            if (rms > 0.0001) {
                dbFS = Math.max(-90, Math.min(0, 20 * Math.log10(rms)));
            }
            const dbFormatted = dbFS > -80 ? `${dbFS.toFixed(1)} dB` : '-inf dB';

            // Transient hit check (Kick/Snare/HiHat or sharp band peak)
            let isHit = false;
            if (b.id === 'kick' && (liveMetrics?.beatPunch || 0) > 0.25) isHit = true;
            if (b.id === 'presence' && (liveMetrics?.snareHit || 0) > 0.25) isHit = true;
            if (b.id === 'brilliance' && (liveMetrics?.hihatTick || 0) > 0.25) isHit = true;
            if (peak > 0.65) isHit = true;

            // Physical peak hold update
            let currentPeak = bandPeaksRef.current[idx] || 0;
            let timer = bandPeakHoldTimerRef.current[idx] || 0;

            if (peakPct >= currentPeak) {
                currentPeak = peakPct;
                timer = 1.0; // Hold for 1.0s
            } else if (timer > 0) {
                timer -= 0.033;
            } else {
                currentPeak = Math.max(0, currentPeak - 1.8); // Gravity decay
            }

            bandPeaksRef.current[idx] = currentPeak;
            bandPeakHoldTimerRef.current[idx] = Math.max(0, timer);

            return {
                ...b,
                rms,
                peak,
                pct,
                peakPct: Math.round(currentPeak),
                dbFormatted,
                dbFS,
                isHit
            };
        });
    }, [bands7, liveMetrics]);

    // Master balance & centroid metrics
    const bassDom = Math.round((liveMetrics?.bassDominance || 0.33) * 100);
    const midDom = Math.round((liveMetrics?.midDominance || 0.33) * 100);
    const trebDom = Math.round((liveMetrics?.trebleDominance || 0.33) * 100);

    const centroidVal = liveMetrics?.spectralCentroid || 0;
    const centroidKHz = (centroidVal * 8).toFixed(2);
    let timbreDescriptor = 'Ausgewogenes Klangbild';
    if (centroidVal < 0.25) timbreDescriptor = 'Tiefenbetont & Dunkel (Bass-Heavy)';
    else if (centroidVal > 0.55) timbreDescriptor = 'Brillant, Klar & Obertongeladen';

    return (
        <div className="spectrum-master-container">
            {/* Header with Title, Mode & Calibrated Master Indicator */}
            <div className="spectrum-header-row">
                <div className="spectrum-title-col">
                    <div className="spectrum-main-title">
                        <Activity size={17} className="title-icon" />
                        <span>7-Band Multiband-Echtzeit-Spektralanalyse (RTA)</span>
                    </div>
                    <span className="spectrum-desc">
                        Kalibrierte 20 Hz – 20 kHz Logarithmische FFT-Analyse, Peak-Hold-Tracking & Multiband-Kanalzüge
                    </span>
                </div>
                <div className="spectrum-status-tags">
                    <div className={`rta-badge ${audioStream ? 'active' : ''}`}>
                        <span className="rta-live-dot"></span>
                        <span>{audioStream ? '60 FPS LIVE RTA' : 'STANDBY (KEIN AUDIO)'}</span>
                    </div>
                    <div className="rta-badge mono-badge">
                        <span>FFT 1024 / 512 Bins</span>
                    </div>
                </div>
            </div>

            {/* 1. Large High-DPI Real-Time Spectrum Canvas */}
            <div className="spectrum-canvas-wrapper">
                <canvas ref={canvasRef} className="spectrum-rta-canvas" />
                <div className="canvas-overlay-grid-hint">
                    <div className="grid-legend-left">dBFS (0 bis -60 dB)</div>
                    <div className="grid-legend-bottom">Frequenz (Hz / kHz Log)</div>
                </div>
            </div>

            {/* 2. Seven Dedicated Mastering Multiband Channel Strips */}
            <div className="multiband-channels-grid">
                {bandValues.map((band) => (
                    <div key={band.id} className={`channel-strip-card ${band.isHit ? 'transient-spike' : ''}`}>
                        {/* Channel Header */}
                        <div className="channel-top">
                            <div className="channel-id-row">
                                <span className="channel-name" style={{ color: band.color }}>{band.shortName}</span>
                                <span className={`transient-led ${band.isHit ? 'active' : ''}`} style={{ backgroundColor: band.isHit ? band.color : 'rgba(255,255,255,0.1)' }}></span>
                            </div>
                            <span className="channel-hz">{band.range}</span>
                        </div>

                        {/* Precision VU/PPM Multi-Segment Meter Bar */}
                        <div className="channel-meter-box">
                            <div className="meter-scale-markers">
                                <span>0</span>
                                <span>-6</span>
                                <span>-18</span>
                                <span>-36</span>
                                <span>-60</span>
                            </div>
                            <div className="meter-track">
                                {/* RMS Fill Bar */}
                                <div
                                    className="meter-fill-bar"
                                    style={{
                                        height: `${band.pct}%`,
                                        background: band.gradient
                                    }}
                                />
                                {/* Floating Peak Hold Needle */}
                                <div
                                    className="meter-peak-needle"
                                    style={{
                                        bottom: `${band.peakPct}%`,
                                        backgroundColor: band.color,
                                        boxShadow: `0 0 6px ${band.color}`
                                    }}
                                />
                            </div>
                        </div>

                        {/* Digital Value & Role Details */}
                        <div className="channel-bottom">
                            <div className="channel-db-val">{band.dbFormatted}</div>
                            <div className="channel-pct-val">{band.pct}%</div>
                            <span className="channel-role-tag">{band.role}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* 3. Global Spectral Balance & Timbre Overview */}
            <div className="spectral-balance-bar-card">
                <div className="balance-info-left">
                    <span className="balance-title"><Compass size={13} /> Spektrale Energie-Balance:</span>
                    <div className="balance-badges">
                        <span className="bal-tag bass"><span className="bal-dot bass"></span> Bass: <strong>{bassDom}%</strong></span>
                        <span className="bal-tag mid"><span className="bal-dot mid"></span> Mitten: <strong>{midDom}%</strong></span>
                        <span className="bal-tag treb"><span className="bal-dot treb"></span> Höhen: <strong>{trebDom}%</strong></span>
                    </div>
                </div>

                {/* Visual Tri-Segment Balance Bar */}
                <div className="tri-balance-track">
                    <div className="tri-fill bass" style={{ width: `${bassDom}%` }}></div>
                    <div className="tri-fill mid" style={{ width: `${midDom}%` }}></div>
                    <div className="tri-fill treb" style={{ width: `${trebDom}%` }}></div>
                </div>

                <div className="balance-info-right">
                    <div className="centroid-metric">
                        <span className="centroid-label">Spektralschwerpunkt (Center):</span>
                        <span className="centroid-khz">{centroidKHz} kHz</span>
                        <span className="centroid-desc">({timbreDescriptor})</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SpectrumAnalyzer;
