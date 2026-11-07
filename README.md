# VibSync

Musik-Visualizer für den PC. Er hört live mit, was gerade über deine Lautsprecher läuft (Spotify, YouTube, DJ-Software, Spiele …), und lässt dazu Farben fließen, pulsieren und bei Drops aufblitzen. Kein Datei-Upload, keine Bildschirmfreigabe.

## Starten

Voraussetzung: [Node.js](https://nodejs.org/) 20 oder neuer.

```bash
npm install
npm run app          # baut die Oberfläche und startet die Desktop-App
```

Unter Windows reicht ein Doppelklick auf `Start.bat`: Es installiert beim ersten Mal die Pakete (samt Electron) und startet dann `npm run app`.

Die Desktop-App verbindet sich beim Start automatisch mit dem Desktop-Ton:

- **Windows:** WASAPI-Loopback, also genau das, was auf dem Standard-Ausgabegerät läuft. Ein neues Ausgabegerät (Kopfhörer, HDMI) wird automatisch übernommen.
- **Linux:** Die App nimmt das Standard-Ausgabegerät mit `parec` (Paket `pulseaudio-utils`) oder `pw-record` (Paket `pipewire`) auf. Das klappt mit PulseAudio und PipeWire, unter X11 und Wayland, ohne Freigabe-Dialog. Ein neues Ausgabegerät wird automatisch übernommen. Fehlen beide Programme, versucht sie Chromiums Loopback und das Gerät „Monitor of …“. Findet die App keine Quelle, zeigt sie den Fehler des Loopbacks an. Beim Start mit `npm run app` legt sie einmalig `~/.local/share/applications/vibsync.desktop` an, damit die Taskleiste Name und Symbol zeigt (das AppImage bringt seinen eigenen Eintrag mit).

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

Der Strobe ist standardmäßig aus. Eingeschaltet blitzt er nur während eines Drops (oder durchgehend, je nach Einstellung), auf den Kicks oder mit einer festen Rate. Eine feste Obergrenze gibt es nicht; unter Einstellungen → Drops & Strobe lässt sich eine Sicherheitsgrenze von höchstens 3 Blitzen pro Sekunde einschalten (siehe [Lichtblitze](#licht-govee)).

## So wird der Ton ausgewertet

Pro Bild liest die App das Spektrum des Desktop-Tons zweimal: lang (FFT mit 4096 Punkten, etwa 12 Hz pro Stufe) für die Pegel, damit die Stimme nicht in den Bass rutscht, und kurz (2048 Punkte) für die Schläge, damit ein Kick nach etwa 20 ms erkannt ist. `node scripts/measure-latency.mjs` misst, wie lange es vom Kick bis zur Reaktion im Bild dauert. Die Bänder sind so gebaut, wie man sie hört:

| Band | Frequenzen | Was darin liegt | Wirkung im Bild |
| --- | --- | --- | --- |
| Bass | 35 bis 100 Hz | Kick, Bassline | Farben schwellen an, Puls im Hintergrund |
| Mitten | 500 Hz bis 4 kHz | Gesang, Melodie, Snare | Formen verbiegen sich, Farben fließen schneller |
| Höhen | 5 bis 16 kHz | Hi-Hats, Becken, S-Laute | Feines Funkeln in den Farben |

Die Pegelanzeige und das Bild nutzen eine schnelle Fassung jedes Bandes: zwischen den leisen und den lauten Momenten der letzten Sekunden, aus der kurzen Analyse, 60-mal pro Sekunde aktualisiert. So schlägt der Bass bei jedem Kick aus und die Höhen bei jeder Hi-Hat. Gemessen wird die Leistung im Band. Jedes Band hat seine eigene automatische Aussteuerung, deshalb hebt der einsetzende Bass die Mitten und Höhen nicht mit an. Ein Band, das im Song kaum vorkommt (Bass in einem A-cappella-Intro), bleibt unten, statt hochverstärkt zu werden. Schläge (Kick, Snare, Hi-Hat) erkennt die App am spektralen Fluss: wie stark die Frequenzen eines Bandes gegenüber dem Moment davor ansteigen. Ein Drop zählt nur, wenn Bass und Kick nach einem Breakdown von ein paar Sekunden zurückkommen.

**Takt.** Die App hört das Tempo und lässt einen inneren Takt mitlaufen, wie DJ-Software: Aus den Schlägen der letzten 8 Sekunden schätzt sie die BPM (70 bis 180). Kommt zwei Sekunden lang dasselbe Tempo heraus und sind Bass oder Kicks zu hören, steht der Takt, und das Bild pulsiert auf jedem Schlag, die 1 etwas stärker. Weil der Takt weiß, wann der nächste Schlag kommt, kommt der Puls schon einen Moment vor der Analyse und damit auf dem Schlag. Ein Basston oder Offbeat zwischen den Schlägen gibt nur einen kleinen Stoß. Ein Lied hat meist ein Tempo, deshalb hält die App es fest: Ein Fill oder ein schiefer Takt ändern nichts. Setzt der Bass aus (Breakdown, Ausklang), hört das Bild nach etwa drei Schlägen auf zu pulsieren, der Takt läuft aber im Hintergrund weiter und sitzt wieder, sobald der Bass zurück ist und auf ihn passt. Neu gesucht wird bei einem neuen Lied (anderer Titel in „Läuft gerade“ oder eine Pause von zwei Sekunden), wenn über Sekunden klar ein anderes Tempo herauskommt, oder nach einer halben Minute ohne Beat. Halbes oder doppeltes Tempo (Halftime) gilt als dasselbe Lied. Hat ein Lied 20 Sekunden lang einen Takt, merkt sich die App sein Tempo; läuft es wieder, steht der Takt nach wenigen Schlägen. Ohne Beat (Ambient, Stimme allein) zeigt sie keinen Takt und reagiert auf einzelne Kicks.

Oben links stehen die BPM und der Zähler 1-2-3-4. Ein Klick darauf öffnet die **Takt-Ansicht**: was die App gerade macht (sucht, gefunden, gehalten), das gemessene Tempo, wie sicher sie ist, ob Bass im Takt zu hören ist, das Lied und sein gemerktes Tempo. Dazu Knöpfe für „Neu suchen“, „Halbes Tempo“, „Doppeltes Tempo“ und „Hier ist die 1“ (im Moment des ersten Schlags drücken).

Damit der Bass in jedem Stil auf dem Beat sitzt, bremsen die Regler den Anstieg nicht: Schlieren sind ein Nachleuchten (was heller wird, erscheint sofort, nur das Ausklingen zieht nach), und „Glättung“ macht nur das Ausklingen weicher. Vom Kick im Ton bis das Bild halb ausgeschlagen hat, vergehen so in der Simulation in allen Stilen 35 bis 45 ms; dazu kommen Windows-Aufnahme und Bildschirm.

## Licht (Govee)

In der Desktop-App können Govee-Lichter im WLAN mitleuchten (Einstellungen → Licht). Die App spricht die Lichter direkt im Heimnetz an (Govee LAN API, UDP), ohne Cloud und ohne API-Schlüssel.

1. In der Govee Home App beim Gerät unter Einstellungen „LAN Control“ einschalten (einmalig).
2. In VibSync „Lichter suchen“ drücken, oder die IP-Adresse des Lichts von Hand eintragen. Fragt Windows nach dem Netzwerkzugriff, „Private Netzwerke“ zulassen.
3. Mit „Test“ prüfen: Läuft ein Regenbogen über den ganzen Streifen, passt „Segmente“. Sonst „Eine Farbe“ wählen.
4. „Lichter steuern“ einschalten.

Die Lichter zeigen die Palette des Bildes (mit Farbwanderung und Farbsprung beim Drop). Bass, Stimme und Drive bestimmen, wie hell sie leuchten; bei einem durchgehenden Beat werden sie zwischen den Kicks dunkler und blitzen auf jedem Kick auf („Reaktion auf die Musik“). Wie die Farben über die Segmente verteilt sind, legt der Effekt fest:

| Effekt | Was passiert |
| --- | --- |
| Farbfluss | Die Palette fließt über den Streifen |
| Wellen auf Kicks | Jeder Kick schickt eine Welle in der nächsten Farbe von der Mitte nach außen |
| Pegel aus der Mitte | Ein Pegelbalken: Bass und Kicks schieben ihn nach außen |
| Lauflicht im Takt | Farbblöcke rücken pro Kick weiter, eine Snare dreht die Richtung |
| Funken | Dunkler Streifen, Kicks lassen ihn aufleuchten, Hi-Hats und Snares zünden einzelne Segmente |

„Automatisch wechseln“ (Standard) wechselt bei Drops und alle 32 Kicks, ruhige Effekte in ruhiger Musik. Der Licht-Strobe schaltet einzelne Segmente (oder den ganzen Streifen) sehr schnell an und aus, nur bei Drops oder durchgehend, bis zu 25 Wechsel pro Sekunde. Er ist aus, bis man ihn einschaltet.

Beim Ausschalten oder Beenden bekommen die Lichter ihren vorigen Zustand zurück (an/aus, Farbe oder Weißton, Helligkeit). Gespeicherte Govee-Szenen kann die LAN-Schnittstelle nicht auslesen; ein Licht, das vorher eine Szene zeigte, kommt mit seiner letzten Farbe zurück.

**Lichtblitze:** Beim Start warnt die App vor Lichtblitzen (abschaltbar). Eine feste Grenze gibt es nicht; unter Drops & Strobe lässt sich eine Sicherheitsgrenze von höchstens 3 Blitzen pro Sekunde für Bild und Lichter einschalten.

Segmentfarben laufen über den Befehl `razer` (dasselbe Protokoll wie Razer-Chroma-Sync, nachgebaut wie in OpenRGB). Läuft schon ein anderes Programm, das Govee-Lichter steuert (OpenRGB, Govee Desktop), ist Port 4002 belegt; dann dieses Programm schließen.

## Song-Anzeige und Cover-Farben

Die Desktop-App zeigt oben rechts, welcher Song gerade läuft: Cover, Titel, Künstler und Tasten für Zurück, Pause und Weiter (Einstellungen → Musik). Die Daten kommen vom Betriebssystem, nicht von Spotify direkt, deshalb braucht es weder Anmeldung noch Premium, und es klappt auch mit YouTube im Browser und den meisten Playern:

- **Windows:** die Mediensteuerung von Windows (dieselbe Anzeige wie neben der Lautstärke), gelesen von `electron/nowplaying.ps1` über WinRT.
- **Linux:** MPRIS über `playerctl` (`sudo apt install playerctl`).

Die Palette **Cover** nimmt fünf Farben aus dem Album-Cover und wechselt mit jedem Song, auch auf den Govee-Lichtern. Tempo oder Stimmung liefert Spotify für neue Apps nicht mehr; Beat und Drops erkennt VibSync weiter selbst am Ton.

## Tests

```bash
npm run check   # alles, was die CI prüft: Lint, Tests und Build
npm test        # nur die Tests
```

| Test | Prüft |
| --- | --- |
| `scripts/test-engine.mjs` | Audio-Engine mit den simulierten Songs: Drops an der richtigen Stelle, Kicks im Tempo, Drive je Genre, gleiches Verhalten bei leiser Musik |
| `scripts/test-frame.mjs` | Musik → Bild: Strobe-Sicherheit, Unterschiede der Stile, Palettenwechsel, gespeicherte Einstellungen und Szenen |
| `scripts/test-analysis.mjs` | Frequenzanalyse mit synthetischen Klängen (siehe unten) |
| `scripts/test-beat.mjs` | Takt: Tempo und jeder Schlag pünktlich bei Pop, Hip-Hop, House mit Offbeat-Bass, Techno mit rollendem Bass, Hardtechno, Breakbeat und Dubstep; ein Lied mit Fills, Ghost-Kicks und schiefem Timing behält seinen Takt; kein Takt ohne Beat; im Breakdown gehalten und still; neues Lied nach Pause; gemerktes Tempo; Knöpfe |
| `scripts/test-lights.mjs` | Govee: Pakete, Stream an ein nachgebautes Licht über echtes UDP, Wiederherstellen, Lichteffekte und Licht-Strobe |
| `scripts/test-system-audio.mjs` | Linux-Desktop-Ton: Rückfall auf den nächsten Recorder, Fehlermeldungen, Wechsel des Ausgabegeräts, Worklet-Puffer der Seite |
| `scripts/test-media.mjs` | Song-Anzeige: Cover-Palette, Windows-Mediensteuerung und playerctl (mit nachgebauten Programmen) |
| `scripts/test-media-win.mjs` | Nur in der Windows-CI: das echte PowerShell-Skript der Song-Anzeige |

`npm run check` vor jedem Push laufen lassen, dann bleibt die CI grün. Die CI läuft nur bei Pull Requests, nach einem Merge auf `main` und von Hand (Actions → Build → Run workflow).

Die Analyse-Tests spielen synthetische Stimmen, Bass, Kick, Snare und Hi-Hats durch denselben Analyser wie der Browser und prüfen zum Beispiel, dass eine Stimme die Mitten bewegt und nicht den Bass, und dass der einsetzende Bass die Mitten nicht mitzieht.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `electron/` | Desktop-App: Fenster, Loopback-Aufnahme des Desktop-Tons, Govee-Lichter (`govee.cjs`) |
| `src/media/` | Song, der gerade läuft, und die Palette aus dem Cover |
| `src/lights/` | Farben und Helligkeit der Lichter aus Musik und Bild |
| `src/audio/` | Tonquelle starten (Desktop, Gerät, Testsignal) und Frequenzbänder messen (`analysis.js`) |
| `src/engine/` | Audio-Engine (Auto-Pegel, Kicks, Drive, Drops), Takt (`beatTracker.js`) und das Testsignal |
| `src/render/` | WebGL-Shader, Renderer und die Abbildung Musik → Bild |
| `src/state/` | Einstellungen, Szenen, Paletten (ein Objekt, später auch fürs Handy) |
| `src/components/` | Oberfläche: Visualizer, Leiste, Einstellungen |
| `scripts/` | Tests; `scripts/lib/` ahmt den Analyser des Browsers nach, erzeugt Testklänge und enthält den Test-Runner |
| `public/` | Favicon (`vibsync-logo.jpg`) |
| `build/` | App-Symbol für Installer und Taskleiste |
| `Start.bat` | Start per Doppelklick unter Windows |
