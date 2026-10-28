# Teddy-Docs Bayreuth – Webseite

Statische Webseite (Jekyll, gehostet auf GitHub Pages) mit Terminkalender für Kindergärten und Schulklassen.
Anfragen landen in einer Google-Tabelle und kommen per Mail mit den Knöpfen **Bestätigen** und **Ablehnen** ins Gmail-Postfach.

```
Webseite (GitHub Pages)  ──Anfrage──▶  Google Apps Script  ──▶  Google-Tabelle + Mail an euch
        ▲                                     │
        └────── belegte Termine ◀─────────────┘   Klick auf „Bestätigen“ in der Mail
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
   Danach hat die Tabelle ein Blatt „Anfragen“ mit Kopfzeile.

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
- **Zeitfenster:** aktuell 8:30–10:30 und 10:30–12:30 Uhr. Bei Änderungen an zwei Stellen anpassen: `slots` in `_config.yml` (Webseite) und `zeitfenster` im Skript (Tabelle + Kalendereintrag) – `id` und `name` müssen gleich sein. Danach im Skript `einrichten` erneut ausführen, damit die Auswahlliste in der Tabelle stimmt.
- **Antwort-Vorlagen:** Treffpunkt und Grußformel stehen im Skript oben unter `treffpunkt` und `gruss`. Die Texte selbst in der Funktion `antwortLinks_`.
- **Kinder pro Termin / Vorlauf:** `kinder_pro_termin` (Richtwert, aktuell ca. 25) und `vorlauf_tage` (aktuell 21 = 3 Wochen) in `_config.yml`.
- **Impressum & Datenschutz:** Platzhalter in `impressum.md` und `datenschutz.md` ausfüllen.

## Im Alltag

| Was | Wie |
| --- | --- |
| Neue Anfrage | Kommt per Mail. Auf **✓ Termin bestätigen & blocken** klicken und auf der Seite noch einmal bestätigen. Danach ist der Termin auf der Webseite belegt und steht in eurem Google Kalender. |
| Der Einrichtung antworten | Nach dem Bestätigen/Ablehnen erscheint die fertige Mail (Termin, Ort, Hinweise) direkt auf der Seite – bei Bedarf anpassen und auf **Mail senden** klicken. Sie geht vom Team-Konto raus. Wer sie später schicken will, öffnet einfach den Link aus der Anfrage-Mail noch einmal. |
| Anfrage ablehnen | In der Mail auf **✕ Ablehnen** klicken. Der Termin ist dann wieder frei. |
| Termin sperren (Ferien, Prüfungen …) | In der Tabelle eine neue Zeile: Spalte *Termin* = Datum, *Zeitfenster* = `8:30–10:30 Uhr`, `10:30–12:30 Uhr` oder `ganztägig` (Auswahlliste), *Status* = `gesperrt`. |
| Termin nachträglich freigeben | In der Tabelle den Status auf `abgelehnt` setzen oder die Zeile löschen. |
| Überblick | Die Google-Tabelle zeigt alle Anfragen mit Status. |
| Kontaktformular (Mitmachen, Unterstützung, Sonstiges) | Kommt als normale Mail. Einfach antworten – die Antwort geht direkt an die Person. |

Angefragte, aber noch nicht bestätigte Termine sind auf der Webseite schon gesperrt (gelb „angefragt“), damit keine Doppelanfragen kommen.
Wer das nicht möchte, setzt im Skript `angefragtSperrt: false`.

Änderungen in der Tabelle sind sofort auf der Webseite sichtbar.

**Spamschutz:** Die E-Mail-Adresse steht nicht im Klartext auf der Seite. Beide Formulare haben ein unsichtbares Feld für Bots
und verwerfen Einsendungen, die schneller als 3 Sekunden nach dem Laden der Seite abgeschickt werden.

## Lokal ansehen (optional)

```bash
bundle exec jekyll serve   # bzw. jekyll serve, falls Jekyll installiert ist
```
