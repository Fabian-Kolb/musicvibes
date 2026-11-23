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
| Oberfläche (`SettingsPanel.jsx` mit `SECTIONS`, `Visualizer.jsx`, `NowPlaying.jsx`) | `src/components/`, `src/styles.css` |
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
  Die Lichter nutzen noch die erkannten Kicks, nicht den Takt.

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

Stand 2026-11-07, **Umsetzung noch nicht begonnen.**

- Fabian findet die jetzige Milchglas-Oberfläche „nicht gut“. Ziel: Apple
  Liquid Glass überall (Vorbild Kontrollzentrum: klares Glas, Hintergrund am
  Rand gebrochen, heller Rand), auch Auswahlzustände als Glastropfen statt
  blauem Akzent. Ausnahme: Paletten und Farben bleiben farbig.
- Abgenommene Richtung: **ein Glas-Button** mit eigener Displacement-Map
  (Kapsel-SDF, Randabfall, leichte Vergrößerung, RGB-Split) in
  `backdrop-filter: url()`, nur in Chromium/Electron. Rand als weicher
  Verlauf (hell an der Kante, nach innen 3–10 px auslaufend, oben links stark,
  unten rechts schwächer) plus weiches Inset-Glow, keine 1-px-Linie.
- Stolperfallen: ein Geschwister-Element mit `mix-blend-mode` schaltet den
  `url()`-Backdrop-Filter ab. Auf VibSyncs weichen Wolken sieht man die
  Brechung kaum; sie braucht Kanten/Details dahinter.
- Einstellungen: `SettingsPanel.jsx` hat ~60 Regler in 9 Akkordeon-Abschnitten,
  Hinweise nur als Text. Mockup-Vorschlag: 5 Tabs (Bild, Reaktion, Effekte,
  Licht, System), Szenenkarten mit Vorschaubild oben, „Mehr“ für seltene
  Regler, Mini-Livevorschau neben Reglern, Panel wird beim Ziehen durchsichtig
  („Peek“), Bandmeter neben Bass/Mitten/Höhen, A/B-Vergleich.
- **Offene Fragen an Fabian**: Passt die Tab-Aufteilung? Welche der Ideen
  (Livevorschau, Peek, A/B, Bandmeter) will er? Womit anfangen (Button-Stil
  auf die ganze Leiste übertragen oder gleich das Panel)? Das Szenen-System
  (anlegen, speichern, bearbeiten) soll später ebenfalls neu werden.
- Mockups zum Ansehen im Browser (Chrome/Edge): `design/liquid-glass/glass-button.html`
  (abgenommener Button-Stil) und `design/liquid-glass/vibsync-liquid-glass.html`
  (erstes Panel-Mockup, Glas dort noch „schaut nicht gut aus“, nur Struktur zählt). UI-Änderungen auf
  `src/components/` und `src/styles.css` beschränken, damit sie nicht mit der
  Takt-/Bildarbeit kollidieren.

## Git und Fabians PC

- Repo: `github.com/Fabian-Kolb/musicvibes`, Standard-Branch `main`.
  Lokal: `C:\Users\Fabia\Desktop\Eigene_Projekte\vibe_codeing\musicvibes`.
- Neueste Arbeit liegt auf `claude/project-thread-y9iola` (noch nicht in
  `main`). Vor neuer Arbeit `git fetch` und den passenden Branch prüfen.
- Fabian testet einen Branch so: `git checkout <branch>`, `git pull`, dann
  `Start.bat`. Die Desktop-Verknüpfung startet eine alte installierte Version.
- Updates kommen nur noch per `git pull` auf seinen PC, keine tar-Pakete mehr.
