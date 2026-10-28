// Kalender und Anfrageformular. Einstellungen kommen aus _config.yml (window.TEDDY_BUCHUNG).
(() => {
  'use strict';

  const cfg = window.TEDDY_BUCHUNG || {};
  const slots = cfg.slots || [];
  const wochentage = (cfg.wochentage || [5]).map(Number);
  const url = cfg.apps_script_url || '';

  const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'];
  const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const STATUS_TEXT = { frei: 'frei', angefragt: 'angefragt', belegt: 'belegt' };

  const $ = (id) => document.getElementById(id);
  const el = {
    monat: $('kalender-monat'),
    zurueck: $('kalender-zurueck'),
    weiter: $('kalender-weiter'),
    tage: $('kalender-tage'),
    hinweis: $('kalender-hinweis'),
    form: $('anfrage-form'),
    termin: $('gewaehlter-termin'),
    terminFehler: $('termin-fehler'),
    status: $('form-status'),
    absenden: $('absenden'),
    danke: $('anfrage-danke'),
    dankeTermin: $('danke-termin'),
    neu: $('neue-anfrage'),
  };
  if (!el.tage) return;

  // ----- Datumshilfen -----
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isoWochentag = (d) => d.getDay() || 7;
  const terminText = (d, slot) =>
    `${WOCHENTAGE[d.getDay()]}, ${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()} · ${slot.name}` +
    (slot.zeit ? ` (${slot.zeit})` : '');

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const erster = new Date(heute);
  erster.setDate(erster.getDate() + Number(cfg.vorlauf_tage ?? 7));
  const letzter = new Date(heute);
  letzter.setMonth(letzter.getMonth() + Number(cfg.monate_im_voraus ?? 6));

  const tageImMonat = (monat) => {
    const tage = [];
    const d = new Date(monat);
    while (d.getMonth() === monat.getMonth()) {
      if (d >= erster && d <= letzter && wochentage.includes(isoWochentag(d))) tage.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return tage;
  };

  const monate = [];
  for (const m = new Date(erster.getFullYear(), erster.getMonth(), 1); m <= letzter; m.setMonth(m.getMonth() + 1)) {
    if (tageImMonat(m).length) monate.push(new Date(m));
  }

  // ----- Zustand -----
  let belegt = new Set();
  let angefragt = new Set();
  let auswahl = null; // { datum: Date, slot }
  let monatIndex = 0;

  const slotStatus = (datum, slotId) => {
    const keys = [`${datum}-${slotId}`, `${datum}-ganztag`];
    if (keys.some((k) => belegt.has(k))) return 'belegt';
    if (keys.some((k) => angefragt.has(k))) return 'angefragt';
    return 'frei';
  };

  // ----- Kalender -----
  const neu = (tag, klasse, text) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (text != null) n.textContent = text;
    return n;
  };

  const render = () => {
    el.tage.replaceChildren();
    if (!monate.length) {
      el.monat.textContent = 'Keine Termine';
      el.zurueck.disabled = el.weiter.disabled = true;
      el.tage.append(neu('li', 'tage-leer', 'Aktuell sind keine Termine buchbar.'));
      return;
    }
    const monat = monate[monatIndex];
    el.monat.textContent = `${MONATE[monat.getMonth()]} ${monat.getFullYear()}`;
    el.zurueck.disabled = monatIndex === 0;
    el.weiter.disabled = monatIndex === monate.length - 1;

    for (const d of tageImMonat(monat)) {
      const datum = iso(d);
      const li = neu('li', 'tag');
      const kopf = neu('div', 'tag-datum');
      kopf.append(neu('span', 'tag-wochentag', WOCHENTAGE[d.getDay()]), neu('span', 'tag-nr', `${d.getDate()}. ${MONATE[d.getMonth()]}`));

      const reihe = neu('div', 'tag-slots');
      for (const slot of slots) {
        const status = slotStatus(datum, slot.id);
        const gewaehlt = auswahl && iso(auswahl.datum) === datum && auswahl.slot.id === slot.id;
        const knopf = neu('button', `slot slot-${status}${gewaehlt ? ' slot-gewaehlt' : ''}`);
        knopf.type = 'button';
        knopf.disabled = status !== 'frei';
        knopf.setAttribute('aria-pressed', String(Boolean(gewaehlt)));
        knopf.setAttribute('aria-label', `${terminText(d, slot)}: ${STATUS_TEXT[status]}`);
        knopf.append(neu('span', 'slot-name', slot.name));
        if (slot.zeit) knopf.append(neu('span', 'slot-zeit', slot.zeit));
        knopf.append(neu('span', 'slot-status', gewaehlt ? 'ausgewählt' : STATUS_TEXT[status]));
        knopf.addEventListener('click', () => waehlen(d, slot));
        reihe.append(knopf);
      }
      li.append(kopf, reihe);
      el.tage.append(li);
    }
  };

  const zeigeAuswahl = () => {
    el.termin.textContent = auswahl
      ? terminText(auswahl.datum, auswahl.slot)
      : 'Noch kein Termin gewählt – bitte im Kalender auswählen.';
    el.termin.classList.toggle('auswahl-gesetzt', Boolean(auswahl));
    if (auswahl) el.terminFehler.hidden = true;
  };

  const waehlen = (d, slot) => {
    auswahl = { datum: d, slot };
    render();
    zeigeAuswahl();
    // Auf schmalen Bildschirmen steht das Formular unter dem Kalender – dorthin scrollen.
    const box = $('auswahl').getBoundingClientRect();
    if (box.top > window.innerHeight || box.bottom < 0) {
      $('auswahl').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  el.zurueck.addEventListener('click', () => { monatIndex = Math.max(0, monatIndex - 1); render(); });
  el.weiter.addEventListener('click', () => { monatIndex = Math.min(monate.length - 1, monatIndex + 1); render(); });

  const belegungLaden = async () => {
    if (!url) return;
    el.hinweis.textContent = 'Belegung wird geladen …';
    try {
      const antwort = await fetch(url, { cache: 'no-store' });
      const daten = await antwort.json();
      belegt = new Set(daten.belegt || []);
      angefragt = new Set(daten.angefragt || []);
      el.hinweis.textContent = '';
      if (auswahl && slotStatus(iso(auswahl.datum), auswahl.slot.id) !== 'frei') {
        auswahl = null;
        zeigeAuswahl();
      }
    } catch (err) {
      console.error(err);
      el.hinweis.textContent = 'Die aktuelle Belegung konnte nicht geladen werden. Ihr könnt trotzdem anfragen – wir melden uns.';
    }
    render();
  };

  // ----- Formular -----
  const fehlerText = () =>
    'Leider hat das Senden nicht geklappt. Bitte versucht es später noch einmal oder nutzt das Kontaktformular weiter unten.';
  const geladen = Date.now();

  el.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    el.status.textContent = '';
    el.status.classList.remove('form-status-fehler');

    if (!auswahl) {
      el.terminFehler.hidden = false;
      $('auswahl').scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.termin.focus({ preventScroll: true });
      return;
    }
    if (!url) {
      el.status.textContent = 'Das Formular ist noch nicht eingerichtet (apps_script_url fehlt in _config.yml).';
      el.status.classList.add('form-status-fehler');
      return;
    }

    const daten = Object.fromEntries(new FormData(el.form).entries());
    daten.datum = iso(auswahl.datum);
    daten.zeitfenster = auswahl.slot.id;
    daten.dauer = Date.now() - geladen; // Spamschutz: Bots senden sofort ab

    el.absenden.disabled = true;
    el.absenden.textContent = 'Wird gesendet …';
    try {
      // text/plain vermeidet eine CORS-Vorabanfrage, die Apps Script nicht beantwortet.
      const antwort = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(daten),
      });
      const ergebnis = await antwort.json();

      if (ergebnis.ok) {
        angefragt.add(`${daten.datum}-${daten.zeitfenster}`);
        el.dankeTermin.textContent = terminText(auswahl.datum, auswahl.slot);
        auswahl = null;
        el.form.reset();
        zeigeAuswahl();
        render();
        el.form.hidden = true;
        el.danke.hidden = false;
        el.danke.focus();
      } else if (ergebnis.fehler === 'vergeben') {
        el.status.textContent = 'Dieser Termin wurde gerade schon angefragt. Bitte wählt einen anderen.';
        el.status.classList.add('form-status-fehler');
        auswahl = null;
        zeigeAuswahl();
        await belegungLaden();
      } else {
        throw new Error(ergebnis.fehler || 'unbekannt');
      }
    } catch (err) {
      console.error(err);
      el.status.textContent = fehlerText();
      el.status.classList.add('form-status-fehler');
    } finally {
      el.absenden.disabled = false;
      el.absenden.textContent = 'Anfrage senden';
    }
  });

  el.neu.addEventListener('click', () => {
    el.danke.hidden = true;
    el.form.hidden = false;
    $('kalender').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  render();
  zeigeAuswahl();
  belegungLaden();
})();
