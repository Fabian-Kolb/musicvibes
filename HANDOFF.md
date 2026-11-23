# Übergabe-Log

Jeder Agent (Claude, Gemini, …) liest zu Beginn die obersten Einträge und fügt
am Ende einer Sitzung einen neuen Eintrag **ganz oben** ein (direkt unter der
Linie): was er geändert hat und was offen ist. **Neueste oben, älteste unten.**
Dauerhafte Regeln und Erkenntnisse gehören nach [`AGENTS.md`](AGENTS.md).

Format:

```
## JJJJ-MM-TT · Agent · Branch
**Geändert:** …
**Offen:** …
```

---

## 2026-11-23 · Claude · Arbeitsordner auf `claude/project-thread-y9iola`, nicht committet

**Geändert:** Gemeinsamen Agenten-Kontext angelegt: `AGENTS.md` (Regeln,
Aufbau, Entscheidungen, Latenz, UI-Redesign), `CLAUDE.md` (importiert
`AGENTS.md`), `GEMINI.md` und `.agent/rules/agents-md.md` (verweisen auf
`AGENTS.md`), dieses Log im Repo-Root. Die Liquid-Glass-Mockups liegen jetzt
in `design/liquid-glass/`.

**Als Nächstes: Liquid-Glass-Oberfläche (Fabian will das jetzt mit Antigravity weitermachen)**

Das war das erste, was Fabian noch machen wollte; es ist bisher nur als
Mockup da, im App-Code ist nichts umgesetzt. Details in `AGENTS.md` →
„UI-Redesign (Liquid Glass)“.

- Stand: Fabian hat genau **einen Glas-Button** abgenommen
  (`design/liquid-glass/glass-button.html` in Chrome/Edge öffnen). Die
  Lichtbrechung fand er „extrem gut“: eigene Displacement-Map pro Element
  (Kapsel-SDF, Randabfall, leichte Vergrößerung, RGB-Split) über
  `backdrop-filter: url(#…)`, weicher Lichtrand statt 1-px-Linie.
- Das erste Panel-Mockup (`vibsync-liquid-glass.html`) zeigt die geplante
  Struktur der Einstellungen (5 Tabs, Szenenkarten, Livevorschau, Peek, A/B,
  Bandmeter). Dessen Glas gefiel ihm nicht, nur die Struktur ist Vorschlag.
- Nächster sinnvoller Schritt: den Button-Stil in die App übernehmen
  (`src/styles.css`, Leiste und Knöpfe in `src/components/`), erst klein,
  dann Fabian zeigen. Vor dem Umbau des Einstellungs-Panels die offenen Fragen
  aus `AGENTS.md` mit ihm klären.
- Stolperfallen: `mix-blend-mode` an einem Geschwister-Element schaltet den
  `url()`-Backdrop-Filter ab; auf weichen Farbwolken sieht man die Brechung
  kaum, sie braucht Kanten/Details dahinter. Farbige Elemente (Paletten)
  bleiben farbig, Auswahl als Glastropfen statt blauem Akzent.
- Branch: von `claude/project-thread-y9iola` abzweigen (neuester Stand) und
  UI-Änderungen auf `src/components/` und `src/styles.css` beschränken.

**Sonst offen:**
- Fabian entscheidet, auf welchem Branch diese Dateien committet werden.
- Takt und Latenz: Feedback mit echten Songs steht aus (`AGENTS.md` → Latenz).
- Der lokale Ordner ist einen Commit hinter `origin/claude/project-thread-y9iola`
  (82defae, „Beat clock holds the song's tempo“): `git pull`.
