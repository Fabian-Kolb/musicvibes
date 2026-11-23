# AGENTS.md – gemeinsamer Kontext für KI-Agenten (Claude, Gemini/Antigravity, …)

Diese Datei ist die eine Quelle für alle Agenten. `CLAUDE.md`, `GEMINI.md` und
`.agent/rules/` verweisen nur hierher. Was sich ändert, wird hier gepflegt; was
in einer Sitzung passiert ist, kommt in [`HANDOFF.md`](HANDOFF.md).
Dort steht der **neueste Eintrag ganz oben**, der älteste ganz unten.

## Arbeitsregeln (von Fabian, gelten immer)

1. **Antworte auf Deutsch.** Fabian schreibt Deutsch.
2. **Keine Pull Requests öffnen.** Fabian startet PRs selbst. Agenten pushen auf
   einen Branch und sagen ihm den Branch-Namen.
3. **CI minimal halten.** Vor jedem Push lokal `npm run check` (Lint + Tests +
   Build) auf dem fertigen Stand ausführen. Nur pushen, wenn alles grün ist, und
   Korrekturen in möglichst wenige Pushes bündeln. Die CI
   (`.github/workflows/build.yml`) läuft nur bei PRs, nach Merge auf `main` und
   von Hand; keine weiteren Workflows oder Trigger hinzufügen.
4. **Vor großen Umbauten fragen**, besonders an Oberfläche und Einstellungen.
5. **Geheimnisse nie ins Repo**: z. B. die Govee-API-GUID. Der LAN-Weg braucht sie nicht.
6. **Am Anfang jeder Sitzung** die obersten Einträge in [`HANDOFF.md`](HANDOFF.md) lesen,
   **am Ende** einen neuen Eintrag **ganz oben** einfügen: was geändert, was offen.

## Was VibSync ist

Musik-Visualizer als Desktop-App (Electron + React + WebGL). Er hört live den
Ton des PCs mit (Loopback, **kein Datei-Upload**, keine Bildschirmfreigabe) und
lässt Farben fließen, pulsieren und bei Drops aufblitzen. Fabians Vision:
immersiver „Liquid Glass / Morph“-Look wie in einer Disco, Farben fließen
ineinander, **keine sichtbaren Kugeln**; die Musik steuert Tempo, Größe,
Strobe; passt sich dem Genre an. Für Fabian ist **verzögerungsfreie
Reaktion** (er hört auf den Bass) das Fundament.

Starten, Tests, Installer und Ordnerübersicht: siehe [`README.md`](README.md)
(Abschnitte „Starten“, „Tests“, „Aufbau“). Kurz:

| Bereich | Wo |
| --- | --- |
| Desktop-App, Loopback, Linux-Ton (`systemAudio.cjs`), Govee (`govee.cjs`), Song-Anzeige (`nowplaying.ps1`) | `electron/` |
| Tonquelle und Frequenzbänder (`analysis.js`) | `src/audio/` |
| Audio-Engine (Auto-Pegel, Kicks, Drive, Drops), Takt (`beatTracker.js`), Testsignal | `src/engine/` |
| Shader, Renderer, Abbildung Musik → Bild (`frame.js`) | `src/render/` |
| Einstellungen, Szenen, Paletten, Tempo pro Song | `src/state/` |
| Oberfläche (`LiquidGlass.jsx`, `LivePreviews.jsx`, `SettingsPanel.jsx`, `controls.jsx`, `Visualizer.jsx`, `NowPlaying.jsx`) | `src/components/`, `src/styles.css` |
| Tests und Mess-Skripte, `scripts/lib/` emuliert den Browser-Analyser | `scripts/` |

**Achtung, veraltete Doku:** `docs/` und `.agents/skills/`
stammen von der früheren Web-Version „MusicVibes“ (GhostUI, Home-Seite,
SpectrumAnalyzer, 7-Band-DSP). Dieser Code ist entfernt; die Dateien sind per
`.gitignore` nicht im Repo. Nicht als Beschreibung des aktuellen Codes nehmen.
Maßgeblich sind `README.md`, der Code und diese Datei.

## Wichtige Entscheidungen

- **Audio-Analyse** (`src/audio/analysis.js`): Bandleistung Bass 35–100 Hz,
  Mitten 500–4k (Oktav-gemittelt), Höhen 5–16k, Spectral Flux pro Band;
  Auto-Pegel pro Band an `TYPICAL_SHARE` verankert; Drops erst nach einem
  Bass-Breakdown. Tests mit synthetischen Klängen, nicht mit echten Songs.
- **Stile**: Minimal (Standard, weiche Farbwolken), Flächen, Glas (3D-Glas mit
  Feedback-Schlieren).
- **Blitz-Sicherheit**: keine feste 3-Hz-Grenze, stattdessen Startwarnung
  (abschaltbar) und Opt-in `strobeLimit`. Strobe ist standardmäßig aus.
- **Spotify**: Audio-Analyse-API für neue Apps zu, Playback-Audio ist DRM. Die
  Reaktion kommt deshalb immer vom Loopback. Song, Cover-Palette und
  Play/Pause/Skip laufen ohne Login über Windows SMTC bzw. `playerctl`.
- **Linux**: Ton über `parec`/`pw-record` statt Chromium-Loopback (Wayland).
  `pw-record` und echte Electron-Läufe unter Linux sind ungetestet.
- **Govee-Lichter**: LAN-UDP, Segmentzahl des H619E (Standard 20) ungeprüft.
  Die Lichter nutzen noch die erkannten Kicks, nicht den Takt. Protokoll- und
  OpenAPI-Referenz liegt im Skill `.agent/skills/govee-lights/SKILL.md`.

## Latenz (Ton → Bild)

Stand 2026-11-07, Branch `claude/project-thread-y9iola`.

- **Ursachen, die behoben sind**: HUD lief mit 10 Hz und langen Pegel-Fenstern;
  Schlieren wurden jedes Bild mit dem letzten gemischt und „Glättung“ bremste
  den Anstieg. Jetzt sind Schlieren ein Nachglühen, Glättung bremst nur das
  Abfallen, Zoom/Größe/Meter steigen schneller.
- **Zahlen** (synthetischer Groove, Kick bis halbe Bewegung auf dem Schirm):
  Glas ~100 → 62 → **38 ms**; Minimal/Flächen 35 ms; maximale
  Schlieren + Glättung 42 ms. Kick erkannt nach ~19 ms. Realistisch mit
  Windows-Aufnahme und Bildschirm: 40–80 ms.
- **Messen**: `node scripts/measure-latency.mjs [fftSize]` gibt Werte je Stil
  und Einstellung aus (nicht Teil von `npm test`). `scripts/test-analysis.mjs`
  hält jeden Stil bei ≤ 45 ms. Wer Bild oder Analyse ändert, misst vorher und
  nachher.
- **Takt** (`src/engine/beatTracker.js`): BPM 70–180, phasenstarre Uhr,
  Zustände Suchen/Eingerastet/Gehalten. Bildpuls kommt ~17 ms vor dem Schlag
  von der Uhr. Tempo pro Song in `localStorage` (`src/state/tempoMemory.js`),
  Takt-Ansicht per Klick aufs BPM-Feld. Fabians Regel: lieber kein Takt als ein
  falscher, kein Pulsieren ohne hörbaren Rhythmus.
- **Offen**: Feedback von Fabian mit echten Songs steht aus; Schritt 4 (Takte/
  Phrasen 8/16/32 für Drops und Farbwechsel) angeboten, nicht beauftragt; ein
  Knopf „Latenz messen“ (Klick abspielen, Ankunft messen) angeboten.

## UI-Redesign (Liquid Glass)

Stand 2026-11-23, **auf Branch `feat/liquid-glass-ui` umgesetzt** (wartet auf Fabians Test).

- Ziel: Apple Liquid Glass überall (Vorbild Kontrollzentrum: klares Glas,
  Hintergrund am Rand gebrochen, heller Rand), Auswahlzustände als Glastropfen
  statt blauem `#4cc3ff`-Akzent; Paletten, Cover und Statusfarben bleiben farbig
  (Regler/Meter folgen `--pal-1`/`--pal-2`).
- Umsetzung (`src/components/LiquidGlass.jsx`, `controls.jsx`,
  `LivePreviews.jsx`, `SettingsPanel.jsx`, `NowPlaying.jsx`, `src/App.jsx`,
  `src/styles.css`):
  - Verallgemeinerte Rounded-Rect-SDF-Displacement-Map + 3-Kanal-RGB-Split in
    `backdrop-filter: url()` (nur auf Top-Level-Flächen über dem Canvas) plus
    2×-Spekularrand (oben links stark, unten rechts weicher, keine 1-px-Linie)
    und LRU-Cache.
  - 5-Tab-Einstellungs-Panel (Bild, Reaktion, Effekte, Licht, System) mit
    persistenter Szenenleiste, Live-Canvas-Thumbnails & Regler-Vorschauen,
    24-LED-Vorschau, inline Bandmetern, Fachreglern unter „Mehr“, Peek-Modus
    beim Ziehen von Reglern und nativem `<dialog>`-StartWarning.
- Stolperfallen: kein `mix-blend-mode` an irgendeinem Element (schaltet den
  `url()`-Backdrop-Filter in Chromium ab); auf weichen Farbwolken wirkt die
  Brechung dezenter als über Kanten/Details.
- **Offen**: Fabians Feedback auf `feat/liquid-glass-ui` in Electron
  (`Start.bat`); das Szenen-System (anlegen, speichern, bearbeiten) soll später
  noch weiter ausgebaut werden.
- Referenz-Mockups: `design/liquid-glass/glass-button.html` (abgenommene
  Lichtbrechung) und `design/liquid-glass/vibsync-liquid-glass.html`
  (Struktur-Referenz).

## Git und Fabians PC

- Repo: `github.com/Fabian-Kolb/musicvibes`, Standard-Branch `main`.
  Lokal: `C:\Users\Fabia\Desktop\Eigene_Projekte\vibe_codeing\musicvibes`.
- `claude/project-thread-y9iola` (`82defae`) ist in `main` (`7bef3e5`) gemergt.
  Neueste UI-Arbeit liegt auf `feat/liquid-glass-ui`. Vor neuer Arbeit
  `git fetch` und den passenden Branch prüfen.
- Fabian testet einen Branch so: `git checkout <branch>`, `git pull`, dann
  `Start.bat`. Die Desktop-Verknüpfung startet eine alte installierte Version.
- Updates kommen nur noch per `git pull` auf seinen PC, keine tar-Pakete mehr.
