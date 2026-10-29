# Teddy-Docs Bayreuth – Webseite

Statische Webseite (Jekyll, gehostet auf GitHub Pages) mit Terminkalender für Kindergärten und Schulklassen.
Anfragen landen in einer Google-Tabelle und kommen per Mail mit den Knöpfen **Bestätigen** und **Ablehnen** ins Gmail-Postfach.

```
Webseite (GitHub Pages)  ──Anfrage──▶  Google Apps Script  ──▶  Google-Tabelle + Mail an euch
        ▲                                     │
        └── angebotene + belegte Termine ◀────┘   Klick auf „Bestätigen“ in der Mail
                                                  → Termin belegt (+ Eintrag im Google Kalender)
```

## Einrichtung (einmalig, ca. 15 Minuten)

### 1. Google-Tabelle und Skript anlegen

Alles im **Gmail-Team-Konto** der Teddy-Docs machen – dann laufen Tabelle, Mails und Kalender dort.

1. In Google Drive eine neue **Google-Tabelle** anlegen, z. B. „Teddy-Docs Anfragen“.
2. In der Tabelle: **Erweiterungen → Apps Script**.
3. Den Inhalt von [`apps-script/Code.gs`](apps-script/Code.gs) komplett in den Editor kopieren (vorhandenen Code ersetzen) und speichern.
4. Oben in der Funktionsauswahl **`einrichten`** wählen und auf **Ausführen** klicken.
   Google fragt nach Berechtigungen → Konto wählen → „Erweitert“ → „Zu … wechseln (unsicher)“ → **Zulassen**.
   (Die Warnung kommt, weil das Skript nicht von Google geprüft ist – es ist euer eigenes.)
   Danach hat die Tabelle die Blätter „Anfragen“ und „Termine“ mit Kopfzeile.

### 2. Als Web-App bereitstellen

1. Im Apps-Script-Editor: **Bereitstellen → Neue Bereitstellung**.
2. Zahnrad → Typ **Web-App**.
3. *Ausführen als:* **Ich**, *Zugriff:* **Jeder**.
4. **Bereitstellen** → die **Web-App-URL** (endet auf `/exec`) kopieren.
5. In [`_config.yml`](_config.yml) bei `apps_script_url` eintragen.

> **Wichtig:** Wenn ihr den Skript-Code später ändert, unter **Bereitstellen → Bereitstellungen verwalten →
> Bearbeiten (Stift) → Version: Neue Version** aktualisieren. Sonst läuft weiter die alte Version, die URL bleibt gleich.

### 3. Auf GitHub veröffentlichen

1. Auf GitHub ein neues **öffentliches** Repository anlegen (z. B. `teddydocswebsite`) und alle Dateien hochladen.
2. Im Repository: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)`** → Save.
3. Nach 1–2 Minuten ist die Seite unter `https://<github-name>.github.io/teddydocswebsite/` erreichbar.
4. Diese Adresse im Skript bei `webseite:` eintragen (für die Antwort-Vorlage bei Absagen) und eine neue Version bereitstellen (siehe oben).

### 4. Anpassen

- **Logo:** `assets/img/logo.png` ersetzen (gleicher Dateiname).
- **Farben:** ganz oben in `assets/css/style.css`.
- **Termine:** werden nicht hier, sondern im Blatt **„Termine“** der Google-Tabelle gepflegt (siehe „Im Alltag“). Der Satz bei den Eckdaten über dem Kalender („Meist freitags vormittags“) steht in `_config.yml` unter `zeiten_hinweis`.
- **Antwort-Vorlagen:** Treffpunkt und Grußformel stehen im Skript oben unter `treffpunkt` und `gruss`. Die Texte selbst in der Funktion `antwortVorlagen_`.
- **Kinder pro Termin / Vorlauf:** `kinder_pro_termin` (Richtwert, aktuell ca. 25) und `vorlauf_tage` (aktuell 7 = eine Woche) in `_config.yml`.
- **Impressum & Datenschutz:** Platzhalter in `impressum.md` und `datenschutz.md` ausfüllen.

## Im Alltag

| Was | Wie |
| --- | --- |
| Termine anbieten | Im Blatt **„Termine“** pro Zeitfenster eine Zeile: *Datum* (z. B. `14.11.2026`), *Von* (`8:30`), *Bis* (`10:30`). Zwei Zeitfenster am selben Tag = zwei Zeilen. Jeder Wochentag und jede Uhrzeit ist möglich. Nur diese Termine sind auf der Webseite wählbar – Termine, die näher als `vorlauf_tage` liegen, und vergangene werden automatisch ausgeblendet. |
| Angebot zurückziehen | Zeile im Blatt „Termine“ löschen. Schon eingegangene Anfragen bleiben im Blatt „Anfragen“ erhalten. |
| Neue Anfrage | Kommt per Mail. Auf **✓ Termin bestätigen & blocken** klicken und auf der Seite noch einmal bestätigen. Danach ist der Termin auf der Webseite belegt und steht in eurem Google Kalender. |
| Der Einrichtung antworten | Nach dem Bestätigen/Ablehnen legt das Skript die fertige Mail (Termin, Ort, Hinweise) als **Entwurf in Gmail** an. Auf **✉ Mail in Gmail öffnen** klicken, dort bei Bedarf Text, Anhänge oder CC anpassen und senden. Wer sie nicht gleich schickt, findet sie später unter **Entwürfe**. Öffnet man den Link aus der Anfrage-Mail noch einmal, kann man mit **✉ Mail-Entwurf erstellen** einen neuen Entwurf anlegen. |
| Anfrage ablehnen | In der Mail auf **✕ Ablehnen** klicken. Der Termin ist dann wieder frei. |
| Termin sperren, ohne ihn zu löschen | Im Blatt „Anfragen“ eine neue Zeile: Spalte *Termin* = Datum, *Zeitfenster* = z. B. `8:30–10:30 Uhr` oder `ganztägig`, *Status* = `gesperrt`. Der Termin erscheint dann als „belegt“. |
| Termin nachträglich freigeben | In der Tabelle den Status auf `abgelehnt` setzen oder die Zeile löschen. |
| Überblick | Die Google-Tabelle zeigt alle Anfragen mit Status. |
| Kontaktformular (Mitmachen, Unterstützung, Sonstiges) | Kommt als normale Mail. Einfach antworten – die Antwort geht direkt an die Person. |

Angefragte, aber noch nicht bestätigte Termine sind auf der Webseite schon gesperrt (gelb „angefragt“), damit keine Doppelanfragen kommen.
Wer das nicht möchte, setzt im Skript `angefragtSperrt: false`.

Änderungen in der Tabelle sind sofort auf der Webseite sichtbar.

**Spamschutz:** Die E-Mail-Adresse steht nicht im Klartext auf der Seite. Beide Formulare haben ein unsichtbares Feld für Bots
und verwerfen Einsendungen, die schneller als 3 Sekunden nach dem Laden der Seite abgeschickt werden.

## Für später – daran denken

**Noch offen**
- **Datenschutzerklärung:** In `datenschutz.md` stehen noch Platzhalter (Rechtsgrundlage für die Übermittlung in die USA, Löschfrist). Ausfüllen und am besten von der Datenschutzbeauftragten der FAU prüfen lassen.
- **Alte Anfragen löschen:** Die Datenschutzerklärung verspricht eine Löschfrist. Also regelmäßig, z. B. nach jedem Semester, alte Zeilen im Blatt „Anfragen“ löschen, ebenso die zugehörigen Mails und Entwürfe in Gmail.
- **Klausurenphase vorbei?** Den Text `keine_termine_text` in `_config.yml` wieder anpassen.

**Wenn die Seite eine eigene Domain bekommt** (z. B. `teddydocs-bayreuth.de`)
1. `_config.yml`: `url: "https://www.teddydocs-bayreuth.de"` und `baseurl: ""`.
2. GitHub → Settings → Pages → *Custom domain* eintragen, beim Domain-Anbieter die DNS-Einträge laut GitHub-Anleitung setzen, *Enforce HTTPS* anhaken. Alte `github.io`-Links leitet GitHub dann automatisch weiter.
3. Im Skript `webseite:` auf die neue Adresse ändern und eine neue Version bereitstellen. Die Adresse steht in den Absage-Mails.
4. **Google Search Console** (search.google.com/search-console): neue Domain als Property hinzufügen, bestätigen und unter *Sitemaps* `sitemap.xml` einreichen. Die Weiterleitung von der alten `github.io`-Adresse übernimmt Google von selbst. Das Werkzeug *Adressänderung* geht für eine Adresse mit Unterordner ohnehin nicht.
5. Erst mit eigener Domain wirkt auch `robots.txt`. Suchmaschinen lesen sie nur im Hauptverzeichnis der Domain, nicht unter `/teddydocswebsite/`.

**Apps Script**
- Nach jeder Code-Änderung **Bereitstellungen verwalten → Bearbeiten → Neue Version**, *nicht* „Neue Bereitstellung“. Eine neue Bereitstellung bekommt eine andere URL. Dann muss `apps_script_url` in `_config.yml` geändert werden, und die Bestätigen-/Ablehnen-Links in älteren Anfrage-Mails funktionieren nicht mehr, sobald die alte Bereitstellung archiviert wird.
- Nutzt das Skript einen neuen Google-Dienst (z. B. Drive), muss man einmal im Editor eine Funktion ausführen (z. B. `einrichten`) und die neue Berechtigung zulassen. Sonst schlägt die Funktion fehl.
- Prüfen, welche Version live ist: die Web-App-URL im Browser öffnen. Es sollte JSON mit `termine`, `belegt` und `angefragt` erscheinen.
- Grenzen bei kostenlosen Gmail-Konten: ca. 100 Mails pro Tag über das Skript. Für Anfragen reicht das locker.

**Übergabe an ein neues Team**
- Tabelle, Skript, Kalender und Mails hängen alle am **Gmail-Team-Konto**. Bei einer Übergabe nur die Zugangsdaten zu diesem Konto und zum GitHub-Repository weitergeben. Keine Kopie der Tabelle anlegen, denn das Skript hängt an genau dieser Tabelle.
- Wechselt das Konto doch einmal, muss die Einrichtung (Schritte 1–2) im neuen Konto wiederholt und `apps_script_url` angepasst werden.

## Lokal ansehen (optional)

```bash
bundle exec jekyll serve   # bzw. jekyll serve, falls Jekyll installiert ist
```
