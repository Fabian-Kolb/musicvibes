---
name: "govee-lights"
description: "Govee-Lichter per Code schalten, dimmen, färben oder segmentweise ansteuern: über die Govee Desktop OpenAPI (GoveeAPI.dll, Windows) oder direkt über die Govee-LAN-API (UDP), z. B. für Musik-Sync."
---

# Govee-Lichter per Code steuern

Quelle: "Govee Desktop OpenAPI Instructions" (von Fabian bereitgestellt, Okt. 2026) plus die öffentlich bekannte Govee-LAN-API. Alles hier läuft auf dem PC des Nutzers im selben Netz wie die Lichter. Ein Cloud-Container hat weder Govee Desktop noch Zugang zu den Lichtern: dort nur Code schreiben, getestet wird auf dem Gerät des Nutzers.

## Welcher Weg?

| | A: Govee Desktop OpenAPI | B: Govee-LAN-API |
| --- | --- | --- |
| Läuft auf | Windows, Govee Desktop muss laufen (als Administrator) | Windows, Linux, macOS, ohne Zusatzprogramm |
| Aufruf | .NET-DLL `GoveeAPI.dll` (PowerShell, C#, Python mit pythonnet) | JSON über UDP, z. B. Node `dgram` im Electron-Hauptprozess |
| Segmente | offiziell: `DeviceSegmentsColor` | inoffiziell: `razer`-Befehl (siehe unten) |
| Zugang | API-GUID des Nutzers | keiner, nur "LAN Control" am Gerät |

Faustregel: Für eine App, die ohnehin in Node/Electron läuft, zuerst B versuchen (keine Zusatz-App, geringere Latenz, auch Linux). A nehmen, wenn ein Gerät B nicht kann oder offizielle Segment-Steuerung gebraucht wird. Nicht jedes Modell kann LAN oder Segmente: Liste unter https://desktop.govee.com/desktop/devices.

## A: Govee Desktop OpenAPI (GoveeAPI.dll)

### Voraussetzungen (der Nutzer erledigt das am PC)
1. Govee Desktop installieren und als Administrator starten.
2. In Govee Desktop: Einstellungen » API » "Enable API" einschalten. Dort steht die API-GUID.
3. In der Govee-Home-App für jedes Gerät "LAN Control" einschalten. Gerät und PC im selben Netz.
4. Scenic DreamView und Razer DreamView in Govee Desktop schließen, sonst überschreiben sie die Befehle.
5. Die DLL liegt im Installationsordner unter `GoveeAPI\GoveeAPI.dll`. Finden:
   ```powershell
   Get-ChildItem "$env:ProgramFiles", "${env:ProgramFiles(x86)}", "$env:LOCALAPPDATA" -Recurse -Filter GoveeAPI.dll -ErrorAction SilentlyContinue | Select-Object FullName
   ```

### Die API-GUID ist ein Geheimnis
Nie ins Repo, in Memory, in Logs oder in Chat-Antworten schreiben. Code liest sie aus der Umgebungsvariable `GOVEE_API_GUID` oder aus einer lokalen Datei außerhalb des Repos (z. B. App-Einstellungen im Benutzerprofil). Der Nutzer trägt sie selbst ein.

### Methoden der Klasse `GoveeAPI.ConnectGovee`

| Methode | Parameter | Ergebnis |
| --- | --- | --- |
| `InitConnect` | `string guidInfo` (API-GUID) | `0` = ok. Immer zuerst aufrufen. |
| `GetDeviceBaseInfo` | keine | JSON-String: Liste aller Geräte |
| `GetDeviceBaseInfoByName` | `string skuName` | JSON-String: ein Gerät |
| `DeviceSwitchControl` | `string skuName, int isOff` | `0` = ok. **Achtung: `isOff` 1 = an, 0 = aus.** |
| `DeviceBrightnessControl` | `string skuName, int brightness` (1–100) | `0` = ok |
| `DeviceColorControl` | `string skuName, int r, int g, int b` (je 0–255) | `0` = ok |
| `DeviceSegmentsColor` | `string skuName, string colorInfo, int isGradientOff` | `0` = ok. **Achtung: `isGradientOff` 1 = Verlauf an, 0 = aus.** |

Geräte-JSON: `Name` (string), `SegmentNums` (int, Anzahl Farbsegmente), `SkuType` (string, Modell), `IsLANOn` (1 = LAN an). `skuName` in allen Aufrufen ist der Gerätename `Name` aus dieser Liste.

`colorInfo`: Farben als `#RRGGBB`, mit Komma getrennt, genau `SegmentNums` Stück, z. B. `#00FFFF,#FFFF00,#00FF00`. Segmentfarben wirken nur, wenn das Licht an ist und der Razer-Schalter des Geräts an ist. Vorher `GetDeviceBaseInfo` aufrufen, um den Zustand zu synchronisieren.

Ungereimtheiten in der Original-Anleitung: Die Beispiele rufen `GetDeviceBasenfo` auf (Tippfehler), die Tabelle nennt `InitConnect` mit Typ `Guid`, die Beispiele übergeben einen `string`, und das Segment-Beispiel für "10 Segmente" hat 11 Farben. Deshalb vor dem ersten Einsatz die echten Signaturen per Reflection auslesen:

```powershell
$dll = "C:\Pfad\zu\GoveeAPI\GoveeAPI.dll"
$asm = [Reflection.Assembly]::LoadFrom($dll)
$asm.ImageRuntimeVersion   # v4.0.30319 = .NET Framework: Windows PowerShell 5.1 reicht
$asm.GetType("GoveeAPI.ConnectGovee").GetMethods() |
  Where-Object { $_.DeclaringType.Name -eq "ConnectGovee" } |
  ForEach-Object { "$($_.ReturnType.Name) $($_.Name)(" + (($_.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", ") + ")" }
```
Lässt sich die DLL in Windows PowerShell 5.1 nicht laden (Ziel .NET 5+), PowerShell 7 (`pwsh`) oder eine kleine .NET-Konsolen-App nehmen.

### Fehlercodes

| Wert | Bedeutung |
| --- | --- |
| 1 | Govee Desktop läuft nicht |
| 100 | Programmfehler |
| 101 | Initialisierung fehlgeschlagen |
| 102 | Gerät offline |
| 1001 | API-GUID falsch |
| 1002 | Parameter leer |
| 1003 | Gerät existiert nicht (Name prüfen) |
| 1010 | Farbwert falsch |
| 1011 | Helligkeit ungültig |
| 4000 | Keine Antwort (Zeitüberschreitung). Der Befehl kann trotzdem angekommen sein: am Licht nachsehen. |
| 4001 | Senden fehlgeschlagen |

### Aufrufen

PowerShell:
```powershell
[Reflection.Assembly]::LoadFrom($dll) | Out-Null
$api = New-Object GoveeAPI.ConnectGovee
$rc = $api.InitConnect($env:GOVEE_API_GUID); if ($rc -ne 0) { throw "InitConnect: $rc" }
$devices = $api.GetDeviceBaseInfo() | ConvertFrom-Json
$name = $devices[0].Name
$api.DeviceSwitchControl($name, 1)        # an
$api.DeviceBrightnessControl($name, 60)
$api.DeviceColorControl($name, 255, 0, 128)
```

Python (Windows, `pip install pythonnet`):
```python
import json, os, sys
sys.path.append(r"C:\Pfad\zu\GoveeAPI")  # der Ordner, nicht die Datei
import clr  # bei einer .NET-5+-DLL vorher: from pythonnet import load; load("coreclr")
clr.AddReference("GoveeAPI")
from GoveeAPI import ConnectGovee
api = ConnectGovee()
assert api.InitConnect(os.environ["GOVEE_API_GUID"]) == 0
devices = json.loads(api.GetDeviceBaseInfo())
```

Aus Node/Electron: .NET lässt sich nicht direkt laden. Einen dauerhaft laufenden Hilfsprozess starten, der Befehle als JSON-Zeilen über stdin bekommt. Nie einen Prozess pro Befehl starten (PowerShell braucht dafür jedes Mal rund eine Sekunde).

```powershell
# govee-bridge.ps1: eine JSON-Zeile rein, eine JSON-Zeile raus
param([string]$Dll)
[Reflection.Assembly]::LoadFrom($Dll) | Out-Null
$api = New-Object GoveeAPI.ConnectGovee
[Console]::Out.WriteLine((@{ op = 'init'; rc = $api.InitConnect($env:GOVEE_API_GUID) } | ConvertTo-Json -Compress))
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $c = $line | ConvertFrom-Json
  $rc = switch ($c.op) {
    'info'     { $api.GetDeviceBaseInfo() }
    'power'    { $api.DeviceSwitchControl($c.name, [int]$c.on) }
    'bright'   { $api.DeviceBrightnessControl($c.name, [int]$c.value) }
    'color'    { $api.DeviceColorControl($c.name, [int]$c.r, [int]$c.g, [int]$c.b) }
    'segments' { $api.DeviceSegmentsColor($c.name, $c.colors, [int]$c.gradient) }
  }
  [Console]::Out.WriteLine((@{ id = $c.id; rc = $rc } | ConvertTo-Json -Compress))
}
```
Start aus Node: `spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Dll', dllPath], { env: { ...process.env, GOVEE_API_GUID: guid } })`, dann `proc.stdin.write(JSON.stringify({ id, op: 'color', name, r, g, b }) + '\n')`.

## B: Govee-LAN-API (UDP, ohne Govee Desktop)

Voraussetzung: "LAN Control" am Gerät in der Govee-Home-App an (kann ein paar Minuten dauern, bis der Schalter erscheint). Firewall muss UDP 4001 bis 4003 und Multicast erlauben; PC und Lichter im selben Subnetz.

- Suchen: `{"msg":{"cmd":"scan","data":{"account_topic":"reserve"}}}` an `239.255.255.250:4001`. Antworten kommen an den lokalen UDP-Port 4002 und enthalten `ip`, `device` (ID) und `sku` (Modell).
- Befehle als UDP an `<Geräte-IP>:4003`:
  - an/aus: `{"msg":{"cmd":"turn","data":{"value":1}}}` (0 = aus)
  - Helligkeit: `{"msg":{"cmd":"brightness","data":{"value":60}}}` (1–100)
  - Farbe: `{"msg":{"cmd":"colorwc","data":{"color":{"r":255,"g":0,"b":128},"colorTemInKelvin":0}}}`
  - Zustand: `{"msg":{"cmd":"devStatus","data":{}}}`, Antwort an Port 4002 mit `onOff`, `brightness`, `color`, `colorTemInKelvin`.
- Segmente/LEDs einzeln (inoffiziell, von Govees Razer-/DreamView-Sync und OpenRGB genutzt): `{"msg":{"cmd":"razer","data":{"pt":"<base64>"}}}`. Das Paket ist `BB 00 <Länge> <Befehl> <Daten> <Prüfsumme>`, Prüfsumme = XOR aller Bytes davor. Befehl `B1` mit Daten `01` schaltet den Modus ein (ohne Daten fällt das Gerät nach etwa einer Minute zurück). Befehl `B0` mit Daten `<Verlauf 0/1> <Anzahl Farben> <R G B>...` setzt die Farben. Nicht offiziell dokumentiert: die Bedeutung des Längenbytes am echten Gerät prüfen (Referenz: Govee-Controller in OpenRGB) und auf `colorwc` zurückfallen, wenn das Gerät nicht reagiert.

## Lichter mit Musik synchronisieren (z. B. VibSync)

- Eine Verbindung bzw. ein Hilfsprozess für die ganze Sitzung, nicht pro Bild.
- Höchstens etwa 10 bis 20 Updates pro Sekunde und Gerät senden, nur bei Änderung. Kommt das Gerät nicht hinterher, alte Werte verwerfen statt sie zu stauen (der neueste Wert gewinnt). Die echte Grenze am Gerät messen; häufen sich 4000-Fehler, Rate senken.
- WLAN-Lichter hängen typischerweise 50 bis 150 ms hinter dem Ton her. Bild und Licht über eine Verzögerungs-Einstellung angleichen.
- Blitzen auf Lichtern wie beim Bildschirm-Strobe: standardmäßig aus und höchstens 3 Blitze pro Sekunde (WCAG-Grenze für Fotosensibilität).
- Beim Start den Zustand merken (`devStatus` bzw. `GetDeviceBaseInfo`) und beim Beenden wiederherstellen.

## Testen

Nur auf dem PC des Nutzers (Remote Control oder die Ordner-Werkzeuge mit Shell). Nie behaupten, dass ein Licht reagiert hat, ohne dass der Nutzer es bestätigt; Rückgabewert 0 heißt nur, dass Govee den Befehl angenommen hat.