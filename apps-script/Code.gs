/**
 * Teddy-Docs Bayreuth – Terminanfragen und Kontaktformular
 *
 * Dieses Skript gehört in eine Google-Tabelle (Erweiterungen → Apps Script)
 * und wird als Web-App bereitgestellt. Es
 *   - liefert der Webseite die angebotenen (Blatt „Termine“) und belegten Termine (GET),
 *   - nimmt Anfragen entgegen, speichert sie in der Tabelle und schickt eine Mail (POST),
 *   - bestätigt oder lehnt Anfragen über die Links in der Mail ab,
 *   - leitet Nachrichten aus dem Kontaktformular per Mail weiter,
 *   - verwaltet die Einsätze für Studierende (Seite /einsaetze/): Liste mit freien Plätzen (GET ?typ=einsaetze),
 *     Anmeldung mit Bestätigungsmail (POST) und Abmeldung über den Link in der Mail.
 *
 * Einrichtung: siehe README.md im Repository.
 */

// ===== Einstellungen =====
const EINSTELLUNGEN = {
  // Leer = Mails gehen an das Google-Konto, unter dem das Skript läuft (empfohlen,
  // damit die Adresse nicht im öffentlichen Repository steht).
  empfaenger: '',
  zeitzone: 'Europe/Berlin',
  // Link zur Webseite (für die Antwort-Vorlage bei Absagen), z. B. 'https://name.github.io/teddydocswebsite/'
  webseite: 'https://sungsy.github.io/teddydocswebsite/',
  // Für die Antwort-Vorlagen an die Einrichtungen:
  treffpunkt: 'Lehrgebäude des Medizincampus Oberfranken (MCO) auf dem Klinikgelände, Preuschwitzer Straße, Bayreuth',
  gruss: 'Herzliche Grüße\nEuer Team der Teddy-Docs\nTeddybärkrankenhaus Bayreuth · Medizincampus Oberfranken (MCO)',
  // Sind angefragte, noch nicht bestätigte Termine auf der Webseite schon gesperrt?
  angefragtSperrt: true,
  // Bei Bestätigung einen Termin im Google Kalender anlegen?
  kalenderEintrag: true,

  // ----- Einsätze für Studierende -----
  // Plätze pro Einsatz, wenn im Blatt „Einsätze“ in der Spalte „Plätze“ nichts steht.
  plaetzeStandard: 8,
  // Bis wie viele Tage vor dem Einsatz kann man sich selbst abmelden? 0 = bis zum Einsatztag.
  abmeldenBisTageVorher: 2,
  // Bestätigter Kita-Termin → automatisch eine Zeile im Blatt „Einsätze“ anlegen?
  einsatzBeiBestaetigung: true,
  // Bei jeder An- und Abmeldung eine kurze Info-Mail an euch?
  teamMailBeiAnmeldung: true,
};

// Angebotene Termine: eine Zeile pro Zeitfenster (Datum, Von, Bis). Nur diese sind auf der Webseite wählbar.
const BLATT_TERMINE = 'Termine';
const TERMIN_SPALTEN = ['Datum', 'Von', 'Bis'];
const BLATT = 'Anfragen';
const SPALTEN = ['Eingang', 'Termin', 'Zeitfenster', 'Status', 'Einrichtung', 'Art', 'Ansprechperson',
  'E-Mail', 'Telefon', 'Kinder', 'Nachricht', 'ID', 'Schlüssel'];
const STATUS = { ANGEFRAGT: 'angefragt', BESTAETIGT: 'bestätigt', ABGELEHNT: 'abgelehnt', GESPERRT: 'gesperrt' };
const GANZTAG = 'ganztag';
const GANZTAG_NAME = 'ganztägig';
const ANLIEGEN = ['Mitmachen', 'Unterstützung', 'Sonstiges'];

// Einsätze für Studierende: eine Zeile pro Einsatz. „Hinweis“ steht auf der Seite, „Intern“ nicht.
const BLATT_EINSAETZE = 'Einsätze';
const EINSATZ_SPALTEN = ['Datum', 'Von', 'Bis', 'Plätze', 'Hinweis', 'Intern'];
const BLATT_ANMELDUNGEN = 'Anmeldungen';
const ANMELDUNG_SPALTEN = ['Eingang', 'Einsatz', 'Zeitfenster', 'Status', 'Name', 'E-Mail', 'Telefon', 'Semester',
  'ID', 'Schlüssel'];
const ANMELDE_STATUS = { ANGEMELDET: 'angemeldet', ABGEMELDET: 'abgemeldet' };
// Formulare, die schneller abgeschickt werden, stammen fast sicher von Bots.
const MIN_AUSFUELLZEIT_MS = 3000;
const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** Einmal im Editor ausführen: legt die Blätter mit Kopfzeile, Auswahllisten und Formaten an. */
function einrichten() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(EINSTELLUNGEN.zeitzone);
  const blatt = ss.getSheetByName(BLATT) || ss.insertSheet(BLATT, 0);
  blatt.getRange(1, 1, 1, SPALTEN.length).setValues([SPALTEN]).setFontWeight('bold');
  blatt.setFrozenRows(1);

  const zeilen = blatt.getMaxRows() - 1;
  const liste = (werte) => SpreadsheetApp.newDataValidation().requireValueInList(werte, true).setAllowInvalid(false).build();
  blatt.getRange(2, 1, zeilen, 1).setNumberFormat('dd.MM.yyyy HH:mm');
  blatt.getRange(2, 2, zeilen, 1).setNumberFormat('dd.MM.yyyy');
  // Zeitfenster sind frei wählbar ("9:00–11:00 Uhr", "ganztägig" …), daher keine Auswahlliste.
  blatt.getRange(2, 3, zeilen, 1).clearDataValidations();
  blatt.getRange(2, 4, zeilen, 1).setDataValidation(liste(Object.values(STATUS)));
  blatt.hideColumns(12, 2);

  const termine = ss.getSheetByName(BLATT_TERMINE) || ss.insertSheet(BLATT_TERMINE, 1);
  termine.getRange(1, 1, 1, TERMIN_SPALTEN.length).setValues([TERMIN_SPALTEN]).setFontWeight('bold');
  termine.setFrozenRows(1);
  const terminZeilen = termine.getMaxRows() - 1;
  termine.getRange(2, 1, terminZeilen, 1).setNumberFormat('dd.MM.yyyy')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  termine.getRange(2, 2, terminZeilen, 2).setNumberFormat('HH:mm');

  const einsaetze = ss.getSheetByName(BLATT_EINSAETZE) || ss.insertSheet(BLATT_EINSAETZE);
  einsaetze.getRange(1, 1, 1, EINSATZ_SPALTEN.length).setValues([EINSATZ_SPALTEN]).setFontWeight('bold');
  einsaetze.setFrozenRows(1);
  const einsatzZeilen = einsaetze.getMaxRows() - 1;
  einsaetze.getRange(2, 1, einsatzZeilen, 1).setNumberFormat('dd.MM.yyyy')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  einsaetze.getRange(2, 2, einsatzZeilen, 2).setNumberFormat('HH:mm');
  einsaetze.getRange(2, 4, einsatzZeilen, 1).setNumberFormat('0');

  const anmeldungen = ss.getSheetByName(BLATT_ANMELDUNGEN) || ss.insertSheet(BLATT_ANMELDUNGEN);
  anmeldungen.getRange(1, 1, 1, ANMELDUNG_SPALTEN.length).setValues([ANMELDUNG_SPALTEN]).setFontWeight('bold');
  anmeldungen.setFrozenRows(1);
  const anmeldeZeilen = anmeldungen.getMaxRows() - 1;
  anmeldungen.getRange(2, 1, anmeldeZeilen, 1).setNumberFormat('dd.MM.yyyy HH:mm');
  anmeldungen.getRange(2, 2, anmeldeZeilen, 1).setNumberFormat('dd.MM.yyyy');
  anmeldungen.getRange(2, 4, anmeldeZeilen, 1).setDataValidation(liste(Object.values(ANMELDE_STATUS)));
  anmeldungen.hideColumns(9, 2);
}

// ===== Web-App =====

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.abmelden) return abmeldeSeite_(p);
  if (p.id) return aktionsSeite_(p);
  if (p.typ === 'einsaetze') {
    return json_({ einsaetze: einsaetzeOeffentlich_(), abmeldenBisTageVorher: EINSTELLUNGEN.abmeldenBisTageVorher });
  }
  return json_(Object.assign({ termine: termine_() }, belegung_()));
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    // Spam still verwerfen: verstecktes Feld ausgefüllt oder zu schnell abgeschickt.
    if (d.botcheck || !(Number(d.dauer) >= MIN_AUSFUELLZEIT_MS)) return json_({ ok: true });
    if (d.typ === 'kontakt') return kontaktNachricht_(d);
    if (d.typ === 'einsatz') return einsatzAnmelden_(d);

    const anfrage = {
      datum: String(d.datum || ''),
      zeitfenster: String(d.zeitfenster || ''),
      einrichtung: text_(d.einrichtung),
      art: text_(d.art),
      ansprechperson: text_(d.ansprechperson),
      email: text_(d.email),
      telefon: text_(d.telefon),
      kinder: parseInt(d.kinder, 10) || '',
      nachricht: text_(d.nachricht, 2000),
    };
    const pflicht = ['einrichtung', 'art', 'ansprechperson', 'email', 'kinder'];
    const slot = slotAusId_(anfrage.zeitfenster);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anfrage.datum) || !slot
      || pflicht.some((k) => !anfrage[k]) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(anfrage.email)) {
      return json_({ ok: false, fehler: 'ungueltig' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      if (!termine_().some((t) => t.datum === anfrage.datum && t.id === slot.id)) {
        return json_({ ok: false, fehler: 'nicht_angeboten' });
      }
      if (istVergeben_(anfrage.datum, anfrage.zeitfenster, EINSTELLUNGEN.angefragtSperrt)) {
        return json_({ ok: false, fehler: 'vergeben' });
      }
      anfrage.id = Utilities.getUuid();
      anfrage.schluessel = Utilities.getUuid().replace(/-/g, '');
      const blatt = blatt_();
      blatt.getRange(blatt.getLastRow() + 1, 1, 1, SPALTEN.length).setValues([[
        new Date(),
        Utilities.parseDate(anfrage.datum, EINSTELLUNGEN.zeitzone, 'yyyy-MM-dd'),
        slot.name,
        STATUS.ANGEFRAGT,
        zelle_(anfrage.einrichtung),
        zelle_(anfrage.art),
        zelle_(anfrage.ansprechperson),
        zelle_(anfrage.email),
        zelle_(anfrage.telefon),
        anfrage.kinder,
        zelle_(anfrage.nachricht),
        anfrage.id,
        anfrage.schluessel,
      ]]);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    mailSenden_(anfrage);
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, fehler: 'server' });
  }
}

/** Wird von der Bestätigungsseite (google.script.run) aufgerufen. */
function aktionAusfuehren(id, schluessel, aktion) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const z = zeileFinden_(id, schluessel);
    if (!z) return { ok: false, meldung: 'Diese Anfrage wurde nicht gefunden.' };
    if (z.status !== STATUS.ANGEFRAGT) {
      return { ok: false, meldung: `Diese Anfrage ist bereits „${z.status}“.` };
    }

    if (aktion === 'bestaetigen') {
      if (istVergeben_(z.datum, z.zeitfenster, false)) {
        return { ok: false, meldung: 'Für diesen Termin gibt es schon eine Bestätigung oder Sperre.' };
      }
      blatt_().getRange(z.zeile, 4).setValue(STATUS.BESTAETIGT);
      if (EINSTELLUNGEN.kalenderEintrag) kalenderEintragen_(z);
      let einsatz = false;
      if (EINSTELLUNGEN.einsatzBeiBestaetigung) {
        try {
          einsatz = einsatzAnlegen_(z);
        } catch (err) {
          console.error(err);
        }
      }
      return { ok: true, status: STATUS.BESTAETIGT, einsatz };
    }
    if (aktion === 'ablehnen') {
      blatt_().getRange(z.zeile, 4).setValue(STATUS.ABGELEHNT);
      return { ok: true, status: STATUS.ABGELEHNT };
    }
    return { ok: false, meldung: 'Unbekannte Aktion.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Wird von der Bestätigungsseite aufgerufen: legt die Antwort an die Einrichtung als Gmail-Entwurf an
 * und gibt den Link zurück, der den Entwurf in Gmail öffnet.
 */
function entwurfErstellen(id, schluessel) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const z = zeileFinden_(id, schluessel);
    if (!z) return { ok: false, meldung: 'Diese Anfrage wurde nicht gefunden.' };
    if (z.status !== STATUS.BESTAETIGT && z.status !== STATUS.ABGELEHNT) {
      return { ok: false, meldung: 'Bitte die Anfrage zuerst bestätigen oder ablehnen.' };
    }
    // Pro Anfrage und Status nur ein Entwurf: solange er noch in Gmail liegt, wird er wiederverwendet.
    const props = PropertiesService.getScriptProperties();
    const key = `entwurf_${z.id}_${z.status}`;
    const vorhanden = vorhandenerEntwurf_(props.getProperty(key));
    const entwurf = vorhanden || neuerEntwurf_(z);
    props.setProperty(key, entwurf.getId());
    // authuser sorgt dafür, dass Gmail im richtigen Konto aufgeht, wenn mehrere angemeldet sind.
    const konto = encodeURIComponent(Session.getEffectiveUser().getEmail());
    const url = `https://mail.google.com/mail/?authuser=${konto}#drafts?compose=${entwurf.getMessage().getId()}`;
    return { ok: true, an: String(z.email), url, neu: !vorhanden };
  } finally {
    lock.releaseLock();
  }
}

/** Entwurf zur gespeicherten ID – oder null, wenn er inzwischen gesendet oder gelöscht wurde. */
function vorhandenerEntwurf_(entwurfId) {
  if (!entwurfId) return null;
  try {
    return GmailApp.getDraft(entwurfId) || null;
  } catch (err) {
    return null;
  }
}

function neuerEntwurf_(z) {
  const v = antwortVorlagen_(z)[z.status === STATUS.BESTAETIGT ? 'bestaetigt' : 'abgelehnt'];
  // Empfänger kommt aus der Tabelle, nicht von der Seite – so kann niemand beliebige Adressen anschreiben.
  return GmailApp.createDraft(String(z.email), v.betreff, v.text, {
    name: 'Teddy-Docs Bayreuth',
    htmlBody: `<div>${esc_(v.text).replace(/\n/g, '<br>')}</div>`,
  });
}

// ===== Daten =====

function blatt_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(BLATT)) einrichten();
  return ss.getSheetByName(BLATT);
}

function zeilen_() {
  const blatt = blatt_();
  const n = blatt.getLastRow() - 1;
  if (n < 1) return [];
  return blatt.getRange(2, 1, n, SPALTEN.length).getValues().map((r, i) => ({
    zeile: i + 2,
    datum: datumText_(r[1]),
    zeitfenster: slotId_(r[2]),
    status: String(r[3]).trim().toLowerCase(),
    einrichtung: r[4],
    art: r[5],
    ansprechperson: r[6],
    email: r[7],
    telefon: r[8],
    kinder: r[9],
    nachricht: r[10],
    id: String(r[11]),
    schluessel: String(r[12]),
  })).filter((z) => z.datum && z.zeitfenster);
}

/** Angebotene Termine ab heute aus dem Blatt „Termine“, sortiert: [{ datum, id, name }]. */
function termine_() {
  const blatt = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BLATT_TERMINE);
  if (!blatt || blatt.getLastRow() < 2) return [];
  const bereich = blatt.getRange(2, 1, blatt.getLastRow() - 1, TERMIN_SPALTEN.length);
  // Uhrzeiten als angezeigter Text lesen – Zeitwerte der Tabelle hängen am Jahr 1899 und
  // würden mit der damaligen Zeitzonenverschiebung umgerechnet.
  const anzeige = bereich.getDisplayValues();
  const heute = Utilities.formatDate(new Date(), EINSTELLUNGEN.zeitzone, 'yyyy-MM-dd');
  const gesehen = new Set();
  return bereich.getValues()
    .map((r, i) => ({ datum: datumText_(r[0]), slot: slot_(anzeige[i][1], anzeige[i][2]) }))
    .filter((t) => t.datum >= heute && t.slot && !gesehen.has(t.datum + t.slot.id) && gesehen.add(t.datum + t.slot.id))
    .sort((a, b) => (a.datum + a.slot.id).localeCompare(b.datum + b.slot.id))
    .map((t) => ({ datum: t.datum, id: t.slot.id, name: t.slot.name }));
}

/** Uhrzeit wie "8:30", "08:30", "8.30" oder "9" → { h, m } – oder null. */
function uhrzeit_(wert) {
  const m = String(wert).trim().match(/^(\d{1,2})(?:[:.](\d{2}))?(?!\d)/);
  if (!m || Number(m[1]) > 23 || Number(m[2] || 0) > 59) return null;
  return { h: Number(m[1]), m: Number(m[2] || 0) };
}

/** Zeitfenster aus Von/Bis: id "0830-1030" (für Webseite und Tabelle), name "8:30–10:30 Uhr", von/bis "08:30". */
function slot_(von, bis) {
  const a = uhrzeit_(von);
  const b = uhrzeit_(bis);
  if (!a || !b) return null;
  const p = (n) => String(n).padStart(2, '0');
  return {
    id: `${p(a.h)}${p(a.m)}-${p(b.h)}${p(b.m)}`,
    name: `${a.h}:${p(a.m)}–${b.h}:${p(b.m)} Uhr`,
    von: `${p(a.h)}:${p(a.m)}`,
    bis: `${p(b.h)}:${p(b.m)}`,
  };
}

function slotAusId_(id) {
  const m = String(id).match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  return m ? slot_(`${m[1]}:${m[2]}`, `${m[3]}:${m[4]}`) : null;
}

/** Zeitfenster aus der Tabelle ("8:30–10:30 Uhr", "ganztägig" …) → id ("0830-1030" bzw. "ganztag"). */
function slotId_(wert) {
  const s = String(wert).trim().toLowerCase();
  if (!s) return '';
  if (s === GANZTAG || s === GANZTAG_NAME) return GANZTAG;
  const m = s.match(/^(\d{1,2}(?:[:.]\d{2})?)\s*[–—-]\s*(\d{1,2}(?:[:.]\d{2})?)/);
  const slot = m && slot_(m[1], m[2]);
  return slot ? slot.id : s;
}

function belegung_() {
  const belegt = [];
  const angefragt = [];
  zeilen_().forEach((z) => {
    const key = `${z.datum}-${z.zeitfenster}`;
    if (z.status === STATUS.BESTAETIGT || z.status === STATUS.GESPERRT) belegt.push(key);
    else if (z.status === STATUS.ANGEFRAGT) angefragt.push(key);
  });
  return { belegt, angefragt };
}

function istVergeben_(datum, zeitfenster, angefragtZaehlt) {
  const b = belegung_();
  const keys = [`${datum}-${zeitfenster}`, `${datum}-${GANZTAG}`];
  return keys.some((k) => b.belegt.includes(k) || (angefragtZaehlt && b.angefragt.includes(k)));
}

function zeileFinden_(id, schluessel) {
  if (!id || !schluessel) return null;
  return zeilen_().find((z) => z.id === String(id) && z.schluessel === String(schluessel)) || null;
}

function kalenderEintragen_(z) {
  const fenster = slotAusId_(z.zeitfenster);
  if (!fenster) return;
  const tz = EINSTELLUNGEN.zeitzone;
  const start = Utilities.parseDate(`${z.datum} ${fenster.von}`, tz, 'yyyy-MM-dd HH:mm');
  const ende = Utilities.parseDate(`${z.datum} ${fenster.bis}`, tz, 'yyyy-MM-dd HH:mm');
  const beschreibung = [
    `${z.art}: ${z.einrichtung}`,
    `Ansprechperson: ${z.ansprechperson}`,
    `E-Mail: ${z.email}`,
    z.telefon ? `Telefon: ${z.telefon}` : '',
    `Kinder: ${z.kinder}`,
    z.nachricht ? `\nNachricht:\n${z.nachricht}` : '',
  ].filter(Boolean).join('\n');
  CalendarApp.getDefaultCalendar().createEvent(`Teddy-Docs: ${z.einrichtung}`, start, ende, { description: beschreibung });
}

// ===== Mail =====

function mailSenden_(a) {
  const basis = ScriptApp.getService().getUrl();
  const link = (aktion) => `${basis}?id=${encodeURIComponent(a.id)}&s=${a.schluessel}&aktion=${aktion}`;
  const termin = terminText_(a.datum, a.zeitfenster);
  const zeilen = [
    ['Termin', termin],
    ['Einrichtung', `${a.einrichtung} (${a.art})`],
    ['Ansprechperson', a.ansprechperson],
    ['E-Mail', a.email],
    ['Telefon', a.telefon || '–'],
    ['Kinder', String(a.kinder)],
    ['Nachricht', a.nachricht || '–'],
  ];
  const knopf = (href, text, farbe) =>
    `<a href="${href}" style="display:inline-block;padding:12px 22px;margin:0 8px 8px 0;border-radius:999px;` +
    `background:${farbe};color:#fff;font-weight:bold;text-decoration:none">${text}</a>`;

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#3a2a22;max-width:560px">
      <h2 style="margin:0 0 12px">Neue Terminanfrage</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:20px">
        ${zeilen.map(([k, v]) => `<tr>
          <td style="padding:6px 12px 6px 0;color:#6f5a4d;vertical-align:top;white-space:nowrap">${k}</td>
          <td style="padding:6px 0;white-space:pre-wrap">${esc_(v)}</td></tr>`).join('')}
      </table>
      ${knopf(link('bestaetigen'), '✓ Termin bestätigen &amp; blocken', '#3f9a6b')}
      ${knopf(link('ablehnen'), '✕ Ablehnen', '#b3332c')}
      <p style="color:#6f5a4d;font-size:13px;margin-top:16px">
        Auf diese Mail antworten = direkt an ${esc_(a.ansprechperson)} schreiben.<br>
        <a href="${SpreadsheetApp.getActiveSpreadsheet().getUrl()}" style="color:#6f5a4d">Alle Anfragen in der Tabelle</a>
      </p>
    </div>`;

  MailApp.sendEmail({
    to: EINSTELLUNGEN.empfaenger || Session.getEffectiveUser().getEmail(),
    replyTo: a.email,
    name: 'Teddy-Docs Webseite',
    subject: `Teddy-Docs Anfrage: ${termin} – ${a.einrichtung}`,
    htmlBody: html,
  });
}

function kontaktNachricht_(d) {
  const k = {
    anliegen: text_(d.anliegen),
    name: text_(d.name),
    email: text_(d.email),
    nachricht: text_(d.nachricht, 5000),
  };
  if (!ANLIEGEN.includes(k.anliegen) || !k.name || !k.nachricht || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email)) {
    return json_({ ok: false, fehler: 'ungueltig' });
  }
  MailApp.sendEmail({
    to: EINSTELLUNGEN.empfaenger || Session.getEffectiveUser().getEmail(),
    replyTo: k.email,
    name: 'Teddy-Docs Webseite',
    subject: `Teddy-Docs Kontakt (${k.anliegen}): ${k.name}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#3d2817;max-width:560px">
        <h2 style="margin:0 0 12px">Neue Nachricht: ${esc_(k.anliegen)}</h2>
        <p style="margin:0 0 4px"><strong>${esc_(k.name)}</strong> · ${esc_(k.email)}</p>
        <p style="white-space:pre-wrap;background:#fff8f2;padding:12px 14px;border-radius:8px">${esc_(k.nachricht)}</p>
        <p style="color:#6e5443;font-size:13px">Auf diese Mail antworten = direkt an ${esc_(k.name)} schreiben.</p>
      </div>`,
  });
  return json_({ ok: true });
}

// ===== Einsätze für Studierende =====

function einsaetzeBlatt_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(BLATT_EINSAETZE)) einrichten();
  return ss.getSheetByName(BLATT_EINSAETZE);
}

function anmeldungenBlatt_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(BLATT_ANMELDUNGEN)) einrichten();
  return ss.getSheetByName(BLATT_ANMELDUNGEN);
}

/** Leer = Standardwert, 0 = keine Anmeldung möglich. */
function plaetze_(wert) {
  const n = parseInt(wert, 10);
  return Number.isFinite(n) && n >= 0 ? n : EINSTELLUNGEN.plaetzeStandard;
}

/** Einsätze ab heute aus dem Blatt „Einsätze“, sortiert: [{ datum, id, name, plaetze, hinweis, intern }]. */
function einsaetze_() {
  const blatt = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BLATT_EINSAETZE);
  if (!blatt || blatt.getLastRow() < 2) return [];
  const bereich = blatt.getRange(2, 1, blatt.getLastRow() - 1, EINSATZ_SPALTEN.length);
  const anzeige = bereich.getDisplayValues(); // Uhrzeiten als Text, siehe termine_()
  const heute = Utilities.formatDate(new Date(), EINSTELLUNGEN.zeitzone, 'yyyy-MM-dd');
  const gesehen = new Set();
  return bereich.getValues()
    .map((r, i) => ({
      datum: datumText_(r[0]),
      slot: slot_(anzeige[i][1], anzeige[i][2]),
      plaetze: plaetze_(r[3]),
      hinweis: String(r[4] || '').trim(),
      intern: String(r[5] || '').trim(),
    }))
    .filter((t) => t.datum >= heute && t.slot && !gesehen.has(t.datum + t.slot.id) && gesehen.add(t.datum + t.slot.id))
    .sort((a, b) => (a.datum + a.slot.id).localeCompare(b.datum + b.slot.id))
    .map((t) => ({ datum: t.datum, id: t.slot.id, name: t.slot.name, plaetze: t.plaetze, hinweis: t.hinweis, intern: t.intern }));
}

function anmeldungen_() {
  const blatt = anmeldungenBlatt_();
  const n = blatt.getLastRow() - 1;
  if (n < 1) return [];
  return blatt.getRange(2, 1, n, ANMELDUNG_SPALTEN.length).getValues().map((r, i) => ({
    zeile: i + 2,
    datum: datumText_(r[1]),
    zeitfenster: slotId_(r[2]),
    status: String(r[3]).trim().toLowerCase(),
    name: String(r[4]),
    email: String(r[5]).trim(),
    telefon: String(r[6]),
    semester: String(r[7]),
    id: String(r[8]),
    schluessel: String(r[9]),
  })).filter((z) => z.datum && z.zeitfenster);
}

/** Wer nicht abgemeldet ist, belegt einen Platz – auch von Hand eingetragene Zeilen ohne Status. */
function aktiveAnmeldungen_(alle, datum, zeitfenster) {
  return alle.filter((z) => z.datum === datum && z.zeitfenster === zeitfenster && z.status !== ANMELDE_STATUS.ABGEMELDET);
}

/** Für die Webseite: nur Zahlen, keine Namen. */
function einsaetzeOeffentlich_() {
  const alle = anmeldungen_();
  return einsaetze_().map((t) => ({
    datum: t.datum,
    id: t.id,
    name: t.name,
    plaetze: t.plaetze,
    belegt: aktiveAnmeldungen_(alle, t.datum, t.id).length,
    hinweis: t.hinweis,
  }));
}

function einsatzAnmelden_(d) {
  const a = {
    datum: String(d.datum || ''),
    zeitfenster: String(d.zeitfenster || ''),
    name: text_(d.name),
    email: text_(d.email),
    telefon: text_(d.telefon, 40),
    semester: text_(d.semester, 40),
  };
  const slot = slotAusId_(a.zeitfenster);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.datum) || !slot || !a.name
    || (a.telefon.match(/\d/g) || []).length < 6 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)) {
    return json_({ ok: false, fehler: 'ungueltig' });
  }

  let einsatz;
  let belegt;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    einsatz = einsaetze_().find((t) => t.datum === a.datum && t.id === slot.id);
    if (!einsatz) return json_({ ok: false, fehler: 'nicht_angeboten' });
    const aktiv = aktiveAnmeldungen_(anmeldungen_(), a.datum, slot.id);
    if (aktiv.some((z) => z.email.toLowerCase() === a.email.toLowerCase())) {
      return json_({ ok: false, fehler: 'doppelt' });
    }
    if (aktiv.length >= einsatz.plaetze) return json_({ ok: false, fehler: 'voll' });

    a.id = Utilities.getUuid();
    a.schluessel = Utilities.getUuid().replace(/-/g, '');
    const blatt = anmeldungenBlatt_();
    blatt.getRange(blatt.getLastRow() + 1, 1, 1, ANMELDUNG_SPALTEN.length).setValues([[
      new Date(),
      Utilities.parseDate(a.datum, EINSTELLUNGEN.zeitzone, 'yyyy-MM-dd'),
      slot.name,
      ANMELDE_STATUS.ANGEMELDET,
      zelle_(a.name),
      zelle_(a.email),
      zelle_(a.telefon),
      zelle_(a.semester),
      a.id,
      a.schluessel,
    ]]);
    SpreadsheetApp.flush();
    belegt = aktiv.length + 1;
  } finally {
    lock.releaseLock();
  }

  // Die Anmeldung steht. Klappt eine Mail nicht, soll das die Anmeldung nicht als Fehler melden.
  try {
    anmeldeBestaetigung_(a, einsatz);
  } catch (err) {
    console.error(err);
  }
  if (EINSTELLUNGEN.teamMailBeiAnmeldung) {
    try {
      teamMailEinsatz_('Neue Anmeldung', a, einsatz, belegt);
    } catch (err) {
      console.error(err);
    }
  }
  return json_({ ok: true, belegt, plaetze: einsatz.plaetze });
}

/** Tage von heute bis zum Einsatz (heute = 0). */
function tageBis_(datum) {
  const tag = (s) => { const [j, m, t] = s.split('-').map(Number); return Date.UTC(j, m - 1, t); };
  const heute = Utilities.formatDate(new Date(), EINSTELLUNGEN.zeitzone, 'yyyy-MM-dd');
  return Math.round((tag(datum) - tag(heute)) / 86400000);
}

function abmeldenMoeglich_(datum) {
  return tageBis_(datum) >= Number(EINSTELLUNGEN.abmeldenBisTageVorher || 0);
}

function fristText_() {
  const n = Number(EINSTELLUNGEN.abmeldenBisTageVorher || 0);
  if (n === 0) return 'bis zum Einsatztag';
  return n === 1 ? 'bis einen Tag vor dem Einsatz' : `bis ${n} Tage vor dem Einsatz`;
}

/** Wird von der Abmeldeseite (google.script.run) aufgerufen. */
function einsatzAbmelden(id, schluessel) {
  let z;
  let belegt;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const alle = anmeldungen_();
    z = alle.find((x) => x.id === String(id) && x.schluessel === String(schluessel) && id && schluessel);
    if (!z) return { ok: false, meldung: 'Diese Anmeldung wurde nicht gefunden.' };
    if (z.status === ANMELDE_STATUS.ABGEMELDET) return { ok: false, meldung: 'Du bist für diesen Einsatz schon abgemeldet.' };
    if (!abmeldenMoeglich_(z.datum)) {
      return { ok: false, meldung: `Abmelden geht hier nur ${fristText_()}. Sag bitte direkt dem Orga-Team Bescheid.` };
    }
    anmeldungenBlatt_().getRange(z.zeile, 4).setValue(ANMELDE_STATUS.ABGEMELDET);
    belegt = aktiveAnmeldungen_(alle, z.datum, z.zeitfenster).length - 1;
  } finally {
    lock.releaseLock();
  }
  if (EINSTELLUNGEN.teamMailBeiAnmeldung) {
    try {
      const einsatz = einsaetze_().find((t) => t.datum === z.datum && t.id === z.zeitfenster);
      teamMailEinsatz_('Abmeldung', z, einsatz || { datum: z.datum, id: z.zeitfenster }, belegt);
    } catch (err) {
      console.error(err);
    }
  }
  return { ok: true };
}

/** Bestätigter Kita-Termin → Zeile im Blatt „Einsätze“ (falls es dort noch keine für dieses Zeitfenster gibt). */
function einsatzAnlegen_(z) {
  const fenster = slotAusId_(z.zeitfenster);
  if (!fenster) return false;
  if (einsaetze_().some((t) => t.datum === z.datum && t.id === fenster.id)) return false;
  const blatt = einsaetzeBlatt_();
  blatt.getRange(blatt.getLastRow() + 1, 1, 1, EINSATZ_SPALTEN.length).setValues([[
    Utilities.parseDate(z.datum, EINSTELLUNGEN.zeitzone, 'yyyy-MM-dd'),
    fenster.von,
    fenster.bis,
    '',
    '',
    zelle_(`${z.einrichtung} (${z.art}), ${z.kinder} Kinder`),
  ]]);
  return true;
}

function abmeldeLink_(a) {
  return `${ScriptApp.getService().getUrl()}?abmelden=${encodeURIComponent(a.id)}&s=${a.schluessel}`;
}

function anmeldeBestaetigung_(a, einsatz) {
  const termin = terminText_(a.datum, a.zeitfenster);
  const link = abmeldeLink_(a);
  const vorAbmelden = [
    `Hallo ${a.name},`,
    '',
    'danke, dass du dabei bist! Du bist für folgenden Einsatz im Teddybärkrankenhaus eingetragen:',
    '',
    `Termin: ${termin}`,
    `Ort: ${EINSTELLUNGEN.treffpunkt}`,
    einsatz.hinweis ? `Hinweis: ${einsatz.hinweis}` : '',
    '',
    'Alles Weitere besprechen wir per WhatsApp – wir melden uns unter deiner Handynummer.',
    '',
    'Falls du doch nicht kannst, melde dich bitte ab, damit jemand anderes den Platz bekommt. ' +
      `Das geht ${fristText_()}, danach sag bitte direkt dem Orga-Team Bescheid.`,
  ].filter((z, i, arr) => z !== '' || arr[i - 1] !== '');
  const text = [...vorAbmelden, '', `Abmelden: ${link}`, '', EINSTELLUNGEN.gruss].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#3d2817;max-width:560px">
    <p style="white-space:pre-wrap;margin:0 0 16px">${esc_(vorAbmelden.join('\n'))}</p>
    <p><a href="${link}" style="display:inline-block;padding:10px 20px;border-radius:999px;background:#b3332c;
      color:#fff;font-weight:bold;text-decoration:none">Vom Einsatz abmelden</a></p>
    <p style="white-space:pre-wrap;margin:16px 0 0">${esc_(EINSTELLUNGEN.gruss)}</p>
  </div>`;
  MailApp.sendEmail({
    to: a.email,
    name: 'Teddy-Docs Bayreuth',
    subject: `Teddy-Docs: Du bist dabei – ${termin}`,
    body: text,
    htmlBody: html,
  });
}

function teamMailEinsatz_(was, a, einsatz, belegt) {
  const termin = terminText_(a.datum || einsatz.datum, a.zeitfenster || einsatz.id);
  const plaetze = einsatz.plaetze != null ? `${belegt} von ${einsatz.plaetze}` : String(belegt);
  const zeilen = [
    ['Einsatz', termin],
    ['Name', a.name],
    ['E-Mail', a.email],
    ['Telefon', a.telefon || '–'],
    ['Semester', a.semester || '–'],
    ['Belegt', plaetze],
  ];
  MailApp.sendEmail({
    to: EINSTELLUNGEN.empfaenger || Session.getEffectiveUser().getEmail(),
    replyTo: a.email,
    name: 'Teddy-Docs Webseite',
    subject: `Teddy-Docs Einsatz – ${was}: ${a.name}, ${termin} (${plaetze})`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#3d2817;max-width:560px">
        <h2 style="margin:0 0 12px">${esc_(was)}</h2>
        <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
          ${zeilen.map(([k, v]) => `<tr>
            <td style="padding:6px 12px 6px 0;color:#6e5443;vertical-align:top;white-space:nowrap">${k}</td>
            <td style="padding:6px 0">${esc_(v)}</td></tr>`).join('')}
        </table>
        <p style="color:#6e5443;font-size:13px">
          <a href="${SpreadsheetApp.getActiveSpreadsheet().getUrl()}" style="color:#6e5443">Alle Anmeldungen in der Tabelle</a>
        </p>
      </div>`,
  });
}

function abmeldeSeite_(p) {
  const z = anmeldungen_().find((x) => p.abmelden && p.s && x.id === String(p.abmelden) && x.schluessel === String(p.s));
  const vorlage = HtmlService.createTemplate(ABMELDE_HTML);
  vorlage.z = z || null;
  vorlage.termin = z ? terminText_(z.datum, z.zeitfenster) : '';
  vorlage.moeglich = z ? abmeldenMoeglich_(z.datum) : false;
  vorlage.frist = fristText_();
  vorlage.idJson = jsonSicher_(String(p.abmelden || ''));
  vorlage.sJson = jsonSicher_(String(p.s || ''));
  return vorlage.evaluate()
    .setTitle('Teddy-Docs – Abmelden')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

const ABMELDE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><base target="_top">
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fff8f2;color:#3d2817;margin:0;padding:24px 16px}
  .karte{max-width:600px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 6px 24px rgba(61,40,23,.1)}
  h1{font-size:22px;margin:0 0 16px}
  dl{margin:0 0 20px} dt{color:#6e5443;font-size:13px;margin-top:10px} dd{margin:2px 0 0}
  button{display:inline-block;font:inherit;font-weight:700;border:0;border-radius:999px;padding:12px 22px;
    cursor:pointer;color:#fff;background:#b3332c;margin-top:4px}
  button:disabled{opacity:.6;cursor:wait}
  .meldung{font-weight:600;margin:16px 0 0}
</style></head><body><div class="karte">
<? if (!z) { ?>
  <h1>Anmeldung nicht gefunden</h1><p>Der Link ist ungültig oder die Anmeldung wurde aus der Tabelle gelöscht.</p>
<? } else { ?>
  <h1><?= z.status === 'abgemeldet' ? 'Schon abgemeldet' : 'Vom Einsatz abmelden?' ?></h1>
  <dl>
    <dt>Einsatz</dt><dd><?= termin ?></dd>
    <dt>Name</dt><dd><?= z.name ?></dd>
  </dl>
  <? if (z.status === 'abgemeldet') { ?>
    <p>Du bist für diesen Einsatz nicht mehr eingetragen.</p>
  <? } else if (!moeglich) { ?>
    <p>Abmelden geht hier nur <?= frist ?>. Sag bitte direkt dem Orga-Team Bescheid, damit wir umplanen können.</p>
  <? } else { ?>
    <button id="los">Ja, abmelden</button>
  <? } ?>
  <p class="meldung" id="meldung"></p>
  <script>
    var los = document.getElementById('los');
    if (los) los.addEventListener('click', function () {
      los.disabled = true; los.textContent = 'Einen Moment …';
      google.script.run
        .withSuccessHandler(function (r) {
          los.hidden = true;
          document.getElementById('meldung').textContent = r.ok
            ? 'Erledigt! Du bist abgemeldet, der Platz ist wieder frei. Danke fürs Bescheidsagen.'
            : r.meldung;
        })
        .withFailureHandler(function (e) {
          document.getElementById('meldung').textContent = 'Fehler: ' + e.message;
          los.disabled = false; los.textContent = 'Nochmal versuchen';
        })
        .einsatzAbmelden(<?!= idJson ?>, <?!= sJson ?>);
    });
  </script>
<? } ?>
</div></body></html>`;

// ===== Bestätigungsseite =====

function aktionsSeite_(p) {
  const z = zeileFinden_(p.id, p.s);
  const aktion = p.aktion === 'ablehnen' ? 'ablehnen' : 'bestaetigen';
  const vorlage = HtmlService.createTemplate(SEITE_HTML);
  vorlage.z = z;
  vorlage.aktion = aktion;
  vorlage.termin = z ? terminText_(z.datum, z.zeitfenster) : '';
  vorlage.idJson = jsonSicher_(String(p.id || ''));
  vorlage.sJson = jsonSicher_(String(p.s || ''));
  vorlage.aktionJson = jsonSicher_(aktion);
  vorlage.statusJson = jsonSicher_(z ? z.status : '');
  return vorlage.evaluate()
    .setTitle('Teddy-Docs – Anfrage')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Antwort-Mails an die Einrichtung – landen als Entwurf in Gmail und werden dort bei Bedarf angepasst. */
function antwortVorlagen_(z) {
  const termin = terminText_(z.datum, z.zeitfenster);

  const bestaetigung = [
    `Hallo ${z.ansprechperson},`,
    '',
    'vielen Dank für deine Anfrage! Wir freuen uns sehr, eure Kinder bei uns im Teddybärkrankenhaus ' +
      'begrüßen zu dürfen, und bestätigen dir hiermit folgenden Termin:',
    '',
    `Termin: ${termin}`,
    `Gruppe: ${z.einrichtung} (${z.art}), ${z.kinder} Kinder`,
    `Ort: ${EINSTELLUNGEN.treffpunkt}`,
    '',
    'Dort bauen wir eine kindgerechte „Krankenhausumgebung“ auf, in der die Kinder gemeinsam mit unseren ' +
      'Teddy-Docs ihre Kuscheltiere untersuchen und behandeln – und dabei selbst einmal in die Rolle von ' +
      'Ärzt:innen schlüpfen.',
    '',
    'Bitte denk daran: Jedes Kind bringt ein Kuscheltier mit, dem es gerade „nicht so gut geht“. ' +
      'Die Teilnahme ist für eure Einrichtung selbstverständlich kostenfrei.',
    '',
    'Falls sich an der Gruppengröße etwas ändert oder ihr den Termin nicht wahrnehmen könnt, ' +
      'gib uns bitte kurz Bescheid – so können wir den Platz an eine andere Einrichtung weitergeben.',
    '',
    'Bei Fragen sind wir jederzeit gerne für dich da.',
    '',
    EINSTELLUNGEN.gruss,
  ].join('\n');

  const absage = [
    `Hallo ${z.ansprechperson},`,
    '',
    'vielen Dank für deine Anfrage und dein Interesse am Teddybärkrankenhaus Bayreuth!',
    '',
    `Leider können wir dir den gewünschten Termin (${termin}) nicht anbieten. ` +
      'Da wir als Medizinstudierende die Tage ehrenamtlich gestalten, haben wir nur begrenzte Kapazitäten.',
    '',
    EINSTELLUNGEN.webseite
      ? `Gerne kannst du über unsere Webseite einen anderen Termin anfragen: ${EINSTELLUNGEN.webseite}`
      : 'Gerne kannst du einen anderen Termin anfragen – antworte dazu einfach auf diese E-Mail.',
    '',
    EINSTELLUNGEN.gruss,
  ].join('\n');

  return {
    bestaetigt: { betreff: `Teddybärkrankenhaus Bayreuth: Euer Termin am ${termin}`, text: bestaetigung },
    abgelehnt: { betreff: `Teddybärkrankenhaus Bayreuth: Deine Terminanfrage (${termin})`, text: absage },
  };
}

const SEITE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><base target="_top">
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fff8f2;color:#3d2817;margin:0;padding:24px 16px}
  .karte{max-width:600px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 6px 24px rgba(61,40,23,.1)}
  h1{font-size:22px;margin:0 0 16px} h2{font-size:18px;margin:28px 0 4px}
  dl{margin:0 0 20px} dt{color:#6e5443;font-size:13px;margin-top:10px} dd{margin:2px 0 0}
  [hidden]{display:none!important}
  button,a.knopf{display:inline-block;font:inherit;font-weight:700;border:0;border-radius:999px;padding:12px 22px;
    cursor:pointer;color:#fff;margin:12px 8px 0 0;text-decoration:none}
  button.gruen,a.gruen{background:#3f9a6b} button.rot{background:#b3332c}
  button:disabled{opacity:.6;cursor:wait}
  .hinweis{color:#6e5443;font-size:14px;margin:0} .meldung{font-weight:600;margin:16px 0 0}
</style></head><body><div class="karte">
<? if (!z) { ?>
  <h1>Anfrage nicht gefunden</h1><p>Der Link ist ungültig oder die Anfrage wurde aus der Tabelle gelöscht.</p>
<? } else { ?>
  <h1><?= z.status !== 'angefragt' ? 'Anfrage' : aktion === 'bestaetigen' ? 'Termin bestätigen?' : 'Anfrage ablehnen?' ?></h1>
  <dl>
    <dt>Termin</dt><dd><?= termin ?></dd>
    <dt>Einrichtung</dt><dd><?= z.einrichtung ?> (<?= z.art ?>), <?= z.kinder ?> Kinder</dd>
    <dt>Ansprechperson</dt><dd><?= z.ansprechperson ?> · <?= z.email ?></dd>
    <dt>Status</dt><dd id="status"><?= z.status ?></dd>
  </dl>
  <? if (z.status === 'angefragt') { ?>
    <div id="aktion">
      <button id="los" class="<?= aktion === 'bestaetigen' ? 'gruen' : 'rot' ?>">
        <?= aktion === 'bestaetigen' ? '✓ Ja, bestätigen & Termin blocken' : '✕ Ja, ablehnen' ?></button>
    </div>
  <? } ?>
  <p class="meldung" id="meldung"></p>

  <div id="antwort" hidden>
    <h2>Mail an die Einrichtung</h2>
    <p class="hinweis">An: <?= z.email ?> – die fertige Antwort wird als Entwurf in Gmail angelegt.
      Dort Text, Anhänge oder CC anpassen und senden. Nicht abgeschickt bleibt sie unter „Entwürfe“.</p>
    <button id="entwurf" class="gruen">✉ Mail-Entwurf erstellen</button>
    <a id="oeffnen" class="knopf gruen" target="_blank" rel="noopener" hidden>✉ Mail in Gmail öffnen</a>
    <p class="meldung" id="antwort-meldung"></p>
  </div>

  <script>
    var id = <?!= idJson ?>, s = <?!= sJson ?>;
    var $ = function (x) { return document.getElementById(x); };

    function entwurfAnlegen() {
      var knopf = $('entwurf');
      var zurueck = function (text) {
        $('antwort-meldung').textContent = text;
        knopf.disabled = false; knopf.textContent = '✉ Mail-Entwurf erstellen';
      };
      knopf.disabled = true; knopf.textContent = 'Entwurf wird angelegt …';
      google.script.run
        .withSuccessHandler(function (r) {
          if (!r.ok) return zurueck(r.meldung);
          knopf.hidden = true;
          $('oeffnen').href = r.url;
          $('oeffnen').hidden = false;
          $('antwort-meldung').textContent = (r.neu ? '✓ Entwurf an ' : '✓ Der Entwurf an ') + r.an
            + (r.neu ? ' liegt in Gmail unter „Entwürfe“.' : ' liegt schon in Gmail unter „Entwürfe“.');
        })
        .withFailureHandler(function (e) { zurueck('Fehler: ' + e.message); })
        .entwurfErstellen(id, s);
    }
    $('entwurf').addEventListener('click', entwurfAnlegen);

    // Bereits bearbeitete Anfrage (Link erneut geöffnet): Entwurf nur auf Klick anlegen, damit keine Doppelten entstehen.
    var status = <?!= statusJson ?>;
    if (status === 'bestätigt' || status === 'abgelehnt') $('antwort').hidden = false;

    var los = $('los');
    if (los) los.addEventListener('click', function () {
      los.disabled = true; los.textContent = 'Einen Moment …';
      google.script.run
        .withSuccessHandler(function (r) {
          if (!r.ok) { $('meldung').textContent = r.meldung; $('aktion').hidden = true; return; }
          $('aktion').hidden = true;
          $('status').textContent = r.status;
          $('meldung').textContent = r.status === 'bestätigt'
            ? 'Erledigt! Der Termin ist jetzt auf der Webseite belegt.'
              + (r.einsatz ? ' Studierende können sich ab sofort dafür eintragen (Blatt „Einsätze“).' : '')
            : 'Erledigt! Die Anfrage ist abgelehnt, der Termin ist wieder frei.';
          $('antwort').hidden = false;
          entwurfAnlegen();
        })
        .withFailureHandler(function (e) {
          $('meldung').textContent = 'Fehler: ' + e.message;
          los.disabled = false; los.textContent = 'Nochmal versuchen';
        })
        .aktionAusfuehren(id, s, <?!= aktionJson ?>);
    });
  </script>
<? } ?>
</div></body></html>`;

// ===== Hilfsfunktionen =====

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** JSON, das gefahrlos in ein <script> eingesetzt werden kann. */
function jsonSicher_(wert) {
  return JSON.stringify(wert).replace(/</g, '\\u003c');
}

function text_(wert, max) {
  return String(wert == null ? '' : wert).trim().slice(0, max || 300);
}

/** Verhindert, dass Eingaben in der Tabelle als Formel oder Datum interpretiert werden. */
function zelle_(wert) {
  return wert ? `'${wert}` : '';
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Datum aus der Tabelle (Datumswert oder Text) als 'yyyy-MM-dd'. */
function datumText_(wert) {
  if (wert instanceof Date) return Utilities.formatDate(wert, EINSTELLUNGEN.zeitzone, 'yyyy-MM-dd');
  const s = String(wert).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

function terminText_(datum, zeitfenster) {
  const [j, m, t] = datum.split('-').map(Number);
  const wochentag = WOCHENTAGE[new Date(Date.UTC(j, m - 1, t)).getUTCDay()];
  const fenster = slotAusId_(zeitfenster);
  const name = fenster ? fenster.name : zeitfenster === GANZTAG ? GANZTAG_NAME : zeitfenster;
  return `${wochentag}, ${String(t).padStart(2, '0')}.${String(m).padStart(2, '0')}.${j}, ${name}`;
}
