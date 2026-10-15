# VibSync

Musik-Visualizer für den PC. Er hört live mit, was gerade über deine Lautsprecher läuft (Spotify, YouTube, DJ-Software, Spiele …), und lässt dazu Farben fließen, pulsieren und bei Drops aufblitzen. Kein Datei-Upload, keine Bildschirmfreigabe.

## Starten

Voraussetzung: [Node.js](https://nodejs.org/) 20 oder neuer.

```bash
npm install
npm run app          # baut die Oberfläche und startet die Desktop-App
```

Die Desktop-App verbindet sich beim Start automatisch mit dem Desktop-Ton:

- **Windows:** WASAPI-Loopback, also genau das, was auf dem Standard-Ausgabegerät läuft. Ein neues Ausgabegerät (Kopfhörer, HDMI) wird automatisch übernommen.
- **Linux:** PulseAudio/PipeWire-Loopback, ersatzweise das Gerät „Monitor of …“.

Andere Quellen (Mikrofon, „Stereomix“, virtuelle Kabel) und ein **Testsignal** mit simulierten Songs gibt es unter Einstellungen → Audio.

## Installer bauen

```bash
npm run dist:win     # unter Windows: release/VibSync-Setup-<version>.exe und eine portable .exe
npm run dist:linux   # unter Linux: release/VibSync-<version>.AppImage
```

Bei jedem Push baut GitHub Actions zusätzlich einen Windows-Installer und hängt ihn als Artefakt an den Lauf.

## Im Browser (nur zum Entwickeln)

```bash
npm run dev
```

Im Browser muss Chrome bei jedem Start fragen: „Gesamter Bildschirm“ wählen und „Systemaudio teilen“ anhaken. Das Bild selbst wird verworfen.

## Bedienung

| Taste | Wirkung |
| --- | --- |
| F | Vollbild |
| H | Menü ein- oder ausblenden |
| E | Einstellungen |
| G | Nächster Stil (Minimal, Flächen, Glas) |
| P | Nächste Palette |
| S | Strobe an oder aus |
| Esc | Einstellungen schließen |

Der Strobe ist standardmäßig aus und blitzt dann nur während eines Drops, höchstens dreimal pro Sekunde. Die Grenze lässt sich abschalten.

## Tests

```bash
npm test     # Audio-Engine und Bild-Logik mit simulierten Songs
npm run lint
```

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `electron/` | Desktop-App: Fenster und Loopback-Aufnahme des Desktop-Tons |
| `src/audio/` | Tonquelle starten (Desktop, Gerät, Testsignal) und Frequenzbänder messen |
| `src/engine/` | Audio-Engine (Auto-Pegel, Kicks, Drive, Drops) und das Testsignal |
| `src/render/` | WebGL-Shader, Renderer und die Abbildung Musik → Bild |
| `src/state/` | Einstellungen, Szenen, Paletten (ein Objekt, später auch fürs Handy) |
| `src/components/` | Oberfläche: Visualizer, Leiste, Einstellungen |
| `scripts/` | Tests |
