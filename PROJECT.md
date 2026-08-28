# Project: musicvibes Liquid Mode & UI Overhaul

## Architecture
- **Framework**: React 19, Vite, React Router DOM v7, Tailwind CSS / Lucide React.
- **Audio Processing**: Web Audio API (`AudioContext`, `AnalyserNode`, 1024 FFT size). Hz-band calculation (Bass: 20-250Hz, Mid: 250-4000Hz, Treble: 4000-16000Hz) and dynamic transient/peak processing in `src/utils/audioPhysics.js`.
- **Visualizer Engine**: WebGL / Canvas 2D metaball visualizer in `src/components/vibesync/Visualizer.jsx` with soft-edge 2D radial blending, dynamic bass scaling, drop-reactive strobe energy thresholding, background pulsation, and minimum visible particle threshold enforcement.
- **Control Panel UI**: Fixed-size structured control panel in `src/components/vibesync/GhostUI.jsx` / `vibesync.css` with integrated Audio Source & Palette selectors, modern styled sliders, number input for Max Particles, and rebalanced frequency sensitivities.
- **Welcome Page**: Modern overhaul of `src/pages/Home.jsx` matching the premium dark glassmorphism aesthetic.
- **Documentation**: Skills documentation suite in `skills/` directory (`skills/website-behavior.md`, `skills/audio-reactivity.md`, `skills/component-architecture.md`).

## Code Layout
- `src/pages/VibeSync.jsx`: Main visualizer page container and settings state.
- `src/pages/Home.jsx`: Welcome landing page.
- `src/components/vibesync/Visualizer.jsx`: Core visualizer component rendering soft 2D metaballs, background pulse, and strobe effects.
- `src/components/vibesync/GhostUI.jsx`: UI overlay and control panel (sliders, drop-downs, inputs, audio source, palette selection).
- `src/utils/audioPhysics.js`: Shared audio reactivity logic and calculations.
- `skills/`: Comprehensive documentation skill files (`website-behavior.md`, `audio-reactivity.md`, `component-architecture.md`).
- `scripts/`: Test verification scripts (`test-audio-reactivity.js`, `verify-skills-docs.js`, `test-challenger-edgecases.js`, etc.).

## Interface Contracts
### `audioPhysics.js` ↔ `Visualizer.jsx`
- Input: `frequencyData` (`Uint8Array`), `sampleRate`, `fftSize`, `settings`, `prevState`.
- Output: `bassEnergy`, `midEnergy`, `trebleEnergy`, `totalEnergy`, `bassTransient`, `blobScale`, `backgroundPulse`, `isStrobeActive`.

### Settings Schema (`VibeSync.jsx` ↔ `GhostUI.jsx` ↔ `Visualizer.jsx`)
- `maxParticles`: number (min enforced: hardcoded threshold min 5 floor in visualizer engine)
- `strobeMode`: 'off' | 'drop_reactive' | 'continuous' | 'beat_pulse'
- `strobeTarget`: 'background' | 'particles'
- `strobeThreshold`: number (0..1)
- `bassImpact`, `midImpact`, `trebleImpact`: rebalanced multipliers
- `speed`, `sensitivity`, `baseRadius`, `bgColor`, `palette`: theme & motion knobs

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Pure 2D Soft-Edge Rendering & Bass Scaling (R1) | Soft 2D circle metaball rendering, bass physical scale sync, color blending without white clipping/3D lighting | none | DONE |
| M2 | Strobe Effect Overhaul (R2) | Energy threshold drop-reactive mode & Strobe Target dropdown (Background vs Particles) | M1 | DONE |
| M3 | Consolidated UI & Control Panel (R3) | Fixed height panel, integrated Audio Source & Palette, modern sliders, rebalanced freq sensitivity, Max Particles number input with hardcoded min threshold, Welcome Page overhaul | M1, M2 | DONE |
| M4 | Reactive Background (R4) | Palette background pulse in brightness and saturation in sync with bass hit | M1 | DONE |
| M5 | Documentation (R5) | Skills markdown files in `skills/` directory documenting behavior, audio reactivity, components | M1-M4 | DONE |
| M6 | Particle Speed & Beat Size Scaling Refactoring | Split motion speed into base & peak controls, boost beat/bass blob size expansion, rename to Beat-Größenempfindlichkeit | M1-M5 | DONE |
| M7 | Strobe Mechanics & Drop Detection | Retain Continuous & Drop-Reactive modes only (remove Beat Pulse), add fixed strobe speed slider, implement true song drop detection | M6 | DONE |
| M8 | Blue UI Theme & German Localization | Overhaul UI design from purple to modern Blue glassmorphism, localize all settings/labels/tooltips/text to German | M6, M7 | PLANNED |
| M9 | Documentation & E2E Verification | Update skills docs and test scripts for new physics, strobe, theme & German labels; verify build and test suite | M6-M8 | PLANNED |

## E2E Testing & Verification
- `npx vite build`: Production build succeeded cleanly.
- `node scripts/test-audio-reactivity.js`: PASSED.
- `node scripts/verify-skills-docs.js`: PASSED (42/42).
- `node scripts/test-challenger-edgecases.js`: PASSED (23/23 edge cases including min 5 particle floor, extreme FFTs, zero divisions).
- Reviewer Verdict: APPROVE.
- Forensic Auditor Verdict: CLEAN.
