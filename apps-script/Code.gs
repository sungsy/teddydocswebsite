/**
 * Teddy-Docs Bayreuth – Terminanfragen und Kontaktformular
 *
 * Dieses Skript gehört in eine Google-Tabelle (Erweiterungen → Apps Script)
 * und wird als Web-App bereitgestellt. Es
 *   - liefert der Webseite die belegten Termine (GET),
 *   - nimmt Anfragen entgegen, speichert sie in der Tabelle und schickt eine Mail (POST),
 *   - bestätigt oder lehnt Anfragen über die Links in der Mail ab,
 *   - leitet Nachrichten aus dem Kontaktformular per Mail weiter.
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
  gruss: 'Herzliche Grüße\nIhr Team der Teddy-Docs\nTeddybärkrankenhaus Bayreuth · Medizincampus Oberfranken (MCO)',
  // Sind angefragte, noch nicht bestätigte Termine auf der Webseite schon gesperrt?
  angefragtSperrt: true,
  // Bei Bestätigung einen Termin im Google Kalender anlegen?
  kalenderEintrag: true,
  // Muss zu den "slots" in _config.yml passen (gleiche id und gleicher name).
  // "name" steht so in der Tabelle, "von"/"bis" gelten für den Kalendereintrag.
  zeitfenster: {
    frueh: { name: '8:30–10:30 Uhr', von: '08:30', bis: '10:30' },
    spaet: { name: '10:30–12:30 Uhr', von: '10:30', bis: '12:30' },
  },
};

const BLATT = 'Anfragen';
const SPALTEN = ['Eingang', 'Termin', 'Zeitfenster', 'Status', 'Einrichtung', 'Art', 'Ansprechperson',
  'E-Mail', 'Telefon', 'Kinder', 'Nachricht', 'ID', 'Schlüssel'];
const STATUS = { ANGEFRAGT: 'angefragt', BESTAETIGT: 'bestätigt', ABGELEHNT: 'abgelehnt', GESPERRT: 'gesperrt' };
const GANZTAG = 'ganztag';
const GANZTAG_NAME = 'ganztägig';
const ANLIEGEN = ['Mitmachen', 'Unterstützung', 'Sonstiges'];
// Formulare, die schneller abgeschickt werden, stammen fast sicher von Bots.
const MIN_AUSFUELLZEIT_MS = 3000;
const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** Einmal im Editor ausführen: legt Kopfzeile, Auswahllisten und Formate an. */
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
  const fensterNamen = Object.values(EINSTELLUNGEN.zeitfenster).map((f) => f.name);
  blatt.getRange(2, 3, zeilen, 1).setDataValidation(liste(fensterNamen.concat(GANZTAG_NAME)));
  blatt.getRange(2, 4, zeilen, 1).setDataValidation(liste(Object.values(STATUS)));
  blatt.hideColumns(12, 2);
}

// ===== Web-App =====

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.id) return aktionsSeite_(p);
  return json_(belegung_());
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    // Spam still verwerfen: verstecktes Feld ausgefüllt oder zu schnell abgeschickt.
    if (d.botcheck || !(Number(d.dauer) >= MIN_AUSFUELLZEIT_MS)) return json_({ ok: true });
    if (d.typ === 'kontakt') return kontaktNachricht_(d);

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anfrage.datum) || !EINSTELLUNGEN.zeitfenster[anfrage.zeitfenster]
      || pflicht.some((k) => !anfrage[k]) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(anfrage.email)) {
      return json_({ ok: false, fehler: 'ungueltig' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      if (istVergeben_(anfrage.datum, anfrage.zeitfenster, EINSTELLUNGEN.angefragtSperrt)) {
        return json_({ ok: false, fehler: 'vergeben' });
      }
      anfrage.id = Utilities.getUuid();
      anfrage.schluessel = Utilities.getUuid().replace(/-/g, '');
      const blatt = blatt_();
      blatt.getRange(blatt.getLastRow() + 1, 1, 1, SPALTEN.length).setValues([[
        new Date(),
        Utilities.parseDate(anfrage.datum, EINSTELLUNGEN.zeitzone, 'yyyy-MM-dd'),
        EINSTELLUNGEN.zeitfenster[anfrage.zeitfenster].name,
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
      return { ok: true, status: STATUS.BESTAETIGT };
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

/** Wird von der Bestätigungsseite aufgerufen: schickt die (ggf. bearbeitete) Antwort an die Einrichtung. */
function antwortSenden(id, schluessel, betreff, text) {
  const z = zeileFinden_(id, schluessel);
  if (!z) return { ok: false, meldung: 'Diese Anfrage wurde nicht gefunden.' };
  if (z.status !== STATUS.BESTAETIGT && z.status !== STATUS.ABGELEHNT) {
    return { ok: false, meldung: 'Bitte die Anfrage zuerst bestätigen oder ablehnen.' };
  }
  const b = text_(betreff, 200);
  const t = text_(text, 10000);
  if (!b || !t) return { ok: false, meldung: 'Betreff und Text dürfen nicht leer sein.' };
  // Empfänger kommt aus der Tabelle, nicht von der Seite – so kann niemand beliebige Adressen anschreiben.
  MailApp.sendEmail({ to: String(z.email), subject: b, body: t, name: 'Teddy-Docs Bayreuth' });
  return { ok: true, an: String(z.email) };
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

/** Zeitfenster aus der Tabelle ("8:30–10:30 Uhr", "ganztägig" …) → id aus EINSTELLUNGEN.zeitfenster. */
function slotId_(wert) {
  const s = String(wert).trim().toLowerCase();
  if (!s) return '';
  if (s === GANZTAG || s === GANZTAG_NAME) return GANZTAG;
  const fenster = EINSTELLUNGEN.zeitfenster;
  return Object.keys(fenster).find((id) => id === s || fenster[id].name.toLowerCase() === s) || s;
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
  const fenster = EINSTELLUNGEN.zeitfenster[z.zeitfenster];
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
  vorlage.vorlagenJson = jsonSicher_(z ? antwortVorlagen_(z) : {});
  vorlage.statusJson = jsonSicher_(z ? z.status : '');
  return vorlage.evaluate()
    .setTitle('Teddy-Docs – Anfrage')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Antwort-Mails an die Einrichtung – werden auf der Bestätigungsseite zum Bearbeiten angezeigt. */
function antwortVorlagen_(z) {
  const termin = terminText_(z.datum, z.zeitfenster);

  const bestaetigung = [
    `Guten Tag ${z.ansprechperson},`,
    '',
    'vielen Dank für Ihre Anfrage! Wir freuen uns sehr, Ihre Kinder bei uns im Teddybärkrankenhaus ' +
      'begrüßen zu dürfen, und bestätigen Ihnen hiermit folgenden Termin:',
    '',
    `Termin: ${termin}`,
    `Gruppe: ${z.einrichtung} (${z.art}), ${z.kinder} Kinder`,
    `Ort: ${EINSTELLUNGEN.treffpunkt}`,
    '',
    'Dort bauen wir eine kindgerechte „Krankenhausumgebung“ auf, in der die Kinder gemeinsam mit unseren ' +
      'Teddy-Docs ihre Kuscheltiere untersuchen und behandeln – und dabei selbst einmal in die Rolle von ' +
      'Ärzt:innen schlüpfen.',
    '',
    'Bitte denken Sie daran: Jedes Kind bringt ein Kuscheltier mit, dem es gerade „nicht so gut geht“. ' +
      'Die Teilnahme ist für Ihre Einrichtung selbstverständlich kostenfrei.',
    '',
    'Falls sich an der Gruppengröße etwas ändert oder Sie den Termin nicht wahrnehmen können, ' +
      'geben Sie uns bitte kurz Bescheid – so können wir den Platz an eine andere Einrichtung weitergeben.',
    '',
    'Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.',
    '',
    EINSTELLUNGEN.gruss,
  ].join('\n');

  const absage = [
    `Guten Tag ${z.ansprechperson},`,
    '',
    'vielen Dank für Ihre Anfrage und Ihr Interesse am Teddybärkrankenhaus Bayreuth!',
    '',
    `Leider können wir Ihnen den gewünschten Termin (${termin}) nicht anbieten. ` +
      'Da wir möglichst vielen Kindertagesstätten und Grundschulen eine Teilnahme ermöglichen möchten, ' +
      'sind die Plätze leider begrenzt.',
    '',
    EINSTELLUNGEN.webseite
      ? `Gerne können Sie über unsere Webseite einen anderen Termin anfragen: ${EINSTELLUNGEN.webseite}`
      : 'Gerne können Sie einen anderen Termin anfragen – antworten Sie dazu einfach auf diese E-Mail.',
    '',
    EINSTELLUNGEN.gruss,
  ].join('\n');

  return {
    bestaetigt: { betreff: `Teddybärkrankenhaus Bayreuth: Ihr Termin am ${termin}`, text: bestaetigung },
    abgelehnt: { betreff: `Teddybärkrankenhaus Bayreuth: Ihre Terminanfrage (${termin})`, text: absage },
  };
}

const SEITE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><base target="_top">
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fff8f2;color:#3d2817;margin:0;padding:24px 16px}
  .karte{max-width:600px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 6px 24px rgba(61,40,23,.1)}
  h1{font-size:22px;margin:0 0 16px} h2{font-size:18px;margin:28px 0 4px}
  dl{margin:0 0 20px} dt{color:#6e5443;font-size:13px;margin-top:10px} dd{margin:2px 0 0}
  button{font:inherit;font-weight:700;border:0;border-radius:999px;padding:12px 22px;cursor:pointer;color:#fff;margin:12px 8px 0 0}
  button.gruen{background:#3f9a6b} button.rot{background:#b3332c} button.hell{background:#ffeedf;color:#3d2817}
  button:disabled{opacity:.6;cursor:wait}
  label{display:block;font-size:13px;color:#6e5443;margin-top:14px}
  input,textarea{display:block;width:100%;box-sizing:border-box;font:inherit;font-size:15px;color:#3d2817;
    padding:10px 12px;margin-top:4px;border:2px solid #f3dccb;border-radius:12px}
  textarea{resize:vertical;line-height:1.5}
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
    <p class="hinweis">An: <?= z.email ?> – bei Bedarf anpassen und dann senden.</p>
    <label>Betreff<input id="betreff"></label>
    <label>Text<textarea id="text" rows="18"></textarea></label>
    <button id="senden" class="gruen">Mail senden</button>
    <button id="ohne" class="hell">Nicht senden</button>
    <p class="meldung" id="antwort-meldung"></p>
  </div>

  <script>
    var vorlagen = <?!= vorlagenJson ?>;
    var id = <?!= idJson ?>, s = <?!= sJson ?>;
    var $ = function (x) { return document.getElementById(x); };

    function antwortZeigen(status) {
      var v = vorlagen[status === 'bestätigt' ? 'bestaetigt' : 'abgelehnt'];
      $('betreff').value = v.betreff;
      $('text').value = v.text;
      $('antwort').hidden = false;
    }

    // Bereits bearbeitete Anfrage (Link erneut geöffnet): Mail direkt anbieten.
    var status = <?!= statusJson ?>;
    if (status === 'bestätigt' || status === 'abgelehnt') antwortZeigen(status);

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
            : 'Erledigt! Die Anfrage ist abgelehnt, der Termin ist wieder frei.';
          antwortZeigen(r.status);
        })
        .withFailureHandler(function (e) {
          $('meldung').textContent = 'Fehler: ' + e.message;
          los.disabled = false; los.textContent = 'Nochmal versuchen';
        })
        .aktionAusfuehren(id, s, <?!= aktionJson ?>);
    });

    $('senden').addEventListener('click', function () {
      var knopf = $('senden');
      knopf.disabled = true; knopf.textContent = 'Wird gesendet …';
      google.script.run
        .withSuccessHandler(function (r) {
          if (!r.ok) {
            $('antwort-meldung').textContent = r.meldung;
            knopf.disabled = false; knopf.textContent = 'Mail senden';
            return;
          }
          $('antwort').innerHTML = '<p class="meldung" id="gesendet"></p>';
          $('gesendet').textContent = '✓ Mail an ' + r.an + ' wurde gesendet.';
        })
        .withFailureHandler(function (e) {
          $('antwort-meldung').textContent = 'Fehler: ' + e.message;
          knopf.disabled = false; knopf.textContent = 'Mail senden';
        })
        .antwortSenden(id, s, $('betreff').value, $('text').value);
    });

    $('ohne').addEventListener('click', function () { $('antwort').hidden = true; });
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
  const fenster = EINSTELLUNGEN.zeitfenster[zeitfenster];
  const name = fenster ? fenster.name : zeitfenster === GANZTAG ? GANZTAG_NAME : zeitfenster;
  return `${wochentag}, ${String(t).padStart(2, '0')}.${String(m).padStart(2, '0')}.${j}, ${name}`;
}
