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

## So wird der Ton ausgewertet

Pro Bild liest die App das Spektrum des Desktop-Tons (FFT mit 4096 Punkten, etwa 12 Hz pro Stufe) und bildet drei Bänder, wie man sie hört:

| Band | Frequenzen | Was darin liegt | Wirkung im Bild |
| --- | --- | --- | --- |
| Bass | 35 bis 100 Hz | Kick, Bassline | Farben schwellen an, Puls im Hintergrund |
| Mitten | 500 Hz bis 4 kHz | Gesang, Melodie, Snare | Formen verbiegen sich, Farben fließen schneller |
| Höhen | 5 bis 16 kHz | Hi-Hats, Becken, S-Laute | Feines Funkeln in den Farben |

Gemessen wird die Leistung im Band. Jedes Band hat seine eigene automatische Aussteuerung, deshalb hebt der einsetzende Bass die Mitten und Höhen nicht mit an. Ein Band, das im Song kaum vorkommt (Bass in einem A-cappella-Intro), bleibt unten, statt hochverstärkt zu werden. Schläge (Kick, Snare, Hi-Hat) erkennt die App am spektralen Fluss: wie stark die Frequenzen eines Bandes gegenüber dem Moment davor ansteigen. Ein Drop zählt nur, wenn Bass und Kick nach einem Breakdown von ein paar Sekunden zurückkommen.

## Licht (Govee)

In der Desktop-App können Govee-Lichter im WLAN mitleuchten (Einstellungen → Licht). Die App spricht die Lichter direkt im Heimnetz an (Govee LAN API, UDP), ohne Cloud und ohne API-Schlüssel.

1. In der Govee Home App beim Gerät unter Einstellungen „LAN Control“ einschalten (einmalig).
2. In VibSync „Lichter suchen“ drücken, oder die IP-Adresse des Lichts von Hand eintragen. Fragt Windows nach dem Netzwerkzugriff, „Private Netzwerke“ zulassen.
3. Mit „Test“ prüfen: Läuft ein Regenbogen über den ganzen Streifen, passt „Segmente“. Sonst „Eine Farbe“ wählen.
4. „Lichter steuern“ einschalten.

Die Lichter zeigen die Palette des Bildes (mit Farbwanderung und Farbsprung beim Drop), werden mit Bass und Kicks heller (höchstens 3 Pulse pro Sekunde) und funkeln bei Hi-Hats in einzelnen Segmenten. Strobe auf den Lichtern ist aus, bis man es einschaltet, und bleibt auf höchstens 3 Blitze pro Sekunde begrenzt. Beim Ausschalten oder Beenden bekommen die Lichter ihren vorigen Zustand zurück (an/aus, Farbe oder Weißton, Helligkeit). Gespeicherte Govee-Szenen kann die LAN-Schnittstelle nicht auslesen; ein Licht, das vorher eine Szene zeigte, kommt mit seiner letzten Farbe zurück.

Segmentfarben laufen über den Befehl `razer` (dasselbe Protokoll wie Razer-Chroma-Sync, nachgebaut wie in OpenRGB). Läuft schon ein anderes Programm, das Govee-Lichter steuert (OpenRGB, Govee Desktop), ist Port 4002 belegt; dann dieses Programm schließen.

## Tests

```bash
npm test     # Audio-Engine, Bild-Logik, Frequenzanalyse und Govee-Lichter
npm run lint
```

Die Analyse-Tests spielen synthetische Stimmen, Bass, Kick, Snare und Hi-Hats durch denselben Analyser wie der Browser und prüfen zum Beispiel, dass eine Stimme die Mitten bewegt und nicht den Bass, und dass der einsetzende Bass die Mitten nicht mitzieht.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `electron/` | Desktop-App: Fenster, Loopback-Aufnahme des Desktop-Tons, Govee-Lichter (`govee.cjs`) |
| `src/lights/` | Farben und Helligkeit der Lichter aus Musik und Bild |
| `src/audio/` | Tonquelle starten (Desktop, Gerät, Testsignal) und Frequenzbänder messen (`analysis.js`) |
| `src/engine/` | Audio-Engine (Auto-Pegel, Kicks, Drive, Drops) und das Testsignal |
| `src/render/` | WebGL-Shader, Renderer und die Abbildung Musik → Bild |
| `src/state/` | Einstellungen, Szenen, Paletten (ein Objekt, später auch fürs Handy) |
| `src/components/` | Oberfläche: Visualizer, Leiste, Einstellungen |
| `scripts/` | Tests; `scripts/lib/` ahmt den Analyser des Browsers nach und erzeugt Testklänge |
