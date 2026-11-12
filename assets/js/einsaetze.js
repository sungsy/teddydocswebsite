// Einsatzliste und Anmeldung für Studierende (Seite /einsaetze/). Die Einsätze kommen aus dem Blatt „Einsätze“
// der Google-Tabelle, die Zahl der belegten Plätze aus dem Blatt „Anmeldungen“ – Namen bekommt die Seite nie zu sehen.
(() => {
  'use strict';

  const cfg = window.TEDDY_EINSAETZE || {};
  const url = cfg.apps_script_url || '';

  const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'];
  const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  const $ = (id) => document.getElementById(id);
  const el = {
    tage: $('einsatz-tage'),
    hinweis: $('einsatz-hinweis'),
    form: $('einsatz-form'),
    termin: $('gewaehlter-einsatz'),
    terminFehler: $('einsatz-fehler'),
    status: $('form-status'),
    absenden: $('absenden'),
    danke: $('einsatz-danke'),
    dankeTermin: $('danke-einsatz'),
    neu: $('neue-anmeldung'),
  };
  if (!el.tage) return;

  const ausIso = (s) => {
    const [j, m, t] = s.split('-').map(Number);
    return new Date(j, m - 1, t);
  };
  const key = (e) => `${e.datum}-${e.id}`;
  const terminText = (e) => {
    const d = ausIso(e.datum);
    return `${WOCHENTAGE[d.getDay()]}, ${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()} · ${e.name}`;
  };
  const frei = (e) => Math.max(0, e.plaetze - e.belegt);

  // ----- Zustand -----
  let einsaetze = []; // [{ datum, id, name, plaetze, belegt, hinweis }]
  let laden = 'laeuft'; // 'laeuft' | 'ok' | 'fehler'
  let auswahl = null;
  const eigene = new Set(); // in diesem Browser-Tab schon eingetragen

  const neu = (tag, klasse, text) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (text != null) n.textContent = text;
    return n;
  };

  // ----- Liste -----
  const render = () => {
    el.tage.replaceChildren();
    if (!einsaetze.length) {
      if (laden === 'ok') {
        el.tage.append(neu('li', 'tage-leer', cfg.keine_einsaetze_text || 'Gerade sind keine Einsätze geplant.'));
      }
      return;
    }
    const tage = new Map();
    for (const e of einsaetze) {
      if (!tage.has(e.datum)) tage.set(e.datum, []);
      tage.get(e.datum).push(e);
    }
    for (const [datum, liste] of tage) {
      const d = ausIso(datum);
      const li = neu('li', 'tag');
      const kopf = neu('div', 'tag-datum');
      kopf.append(neu('span', 'tag-wochentag', WOCHENTAGE[d.getDay()]),
        neu('span', 'tag-nr', `${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()}`));

      const reihe = neu('div', 'tag-slots');
      for (const e of liste) {
        const dabei = eigene.has(key(e));
        const offen = frei(e);
        const gewaehlt = auswahl && key(auswahl) === key(e);
        const klasse = dabei ? 'dabei' : offen > 0 ? 'frei' : 'belegt';
        const status = gewaehlt ? 'ausgewählt'
          : dabei ? '✓ Du bist eingetragen'
            : offen > 0 ? `${offen} von ${e.plaetze} ${e.plaetze === 1 ? 'Platz' : 'Plätzen'} frei`
              : 'ausgebucht';

        const knopf = neu('button', `slot slot-${klasse}${gewaehlt ? ' slot-gewaehlt' : ''}`);
        knopf.type = 'button';
        knopf.disabled = klasse !== 'frei';
        knopf.setAttribute('aria-pressed', String(Boolean(gewaehlt)));
        knopf.setAttribute('aria-label', `${terminText(e)}${e.hinweis ? ` (${e.hinweis})` : ''}: ${status}`);
        knopf.append(neu('span', 'slot-name', e.name));
        if (e.hinweis) knopf.append(neu('span', 'slot-hinweis', e.hinweis));
        const balken = neu('span', 'plaetze');
        balken.setAttribute('aria-hidden', 'true');
        const fuellung = neu('span');
        fuellung.style.width = `${e.plaetze ? Math.min(100, (e.belegt / e.plaetze) * 100) : 100}%`;
        balken.append(fuellung);
        knopf.append(balken, neu('span', 'slot-status', status));
        knopf.addEventListener('click', () => waehlen(e));
        reihe.append(knopf);
      }
      li.append(kopf, reihe);
      el.tage.append(li);
    }
  };

  const zeigeAuswahl = () => {
    el.termin.textContent = auswahl ? terminText(auswahl) : 'Noch kein Einsatz gewählt – bitte links auswählen.';
    el.termin.classList.toggle('auswahl-gesetzt', Boolean(auswahl));
    if (auswahl) el.terminFehler.hidden = true;
  };

  const waehlen = (e) => {
    auswahl = e;
    render();
    zeigeAuswahl();
    // Auf schmalen Bildschirmen steht das Formular unter der Liste – dorthin scrollen.
    const box = $('auswahl').getBoundingClientRect();
    if (box.top > window.innerHeight || box.bottom < 0) {
      $('auswahl').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const einsaetzeLaden = async () => {
    el.hinweis.textContent = 'Einsätze werden geladen …';
    try {
      if (!url) throw new Error('apps_script_url fehlt in _config.yml');
      const antwort = await fetch(`${url}?typ=einsaetze`, { cache: 'no-store' });
      const daten = await antwort.json();
      if (!Array.isArray(daten.einsaetze)) throw new Error('Antwort ohne Einsätze – alte Skript-Version?');
      einsaetze = daten.einsaetze;
      laden = 'ok';
      el.hinweis.textContent = '';
      if (auswahl) {
        auswahl = einsaetze.find((e) => key(e) === key(auswahl) && frei(e) > 0 && !eigene.has(key(e))) || null;
        zeigeAuswahl();
      }
    } catch (err) {
      console.error(err);
      laden = 'fehler';
      el.hinweis.textContent = 'Die Einsätze konnten nicht geladen werden. Bitte lade die Seite neu.';
    }
    render();
  };

  // ----- Formular -----
  const geladen = Date.now();
  const fehler = (text) => {
    el.status.textContent = text;
    el.status.classList.add('form-status-fehler');
  };

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
      fehler('Das Formular ist noch nicht eingerichtet (apps_script_url fehlt in _config.yml).');
      return;
    }

    const daten = Object.fromEntries(new FormData(el.form).entries());
    daten.typ = 'einsatz';
    daten.datum = auswahl.datum;
    daten.zeitfenster = auswahl.id;
    daten.dauer = Date.now() - geladen; // Spamschutz: Bots senden sofort ab

    el.absenden.disabled = true;
    el.absenden.textContent = 'Wird eingetragen …';
    try {
      // text/plain vermeidet eine CORS-Vorabanfrage, die Apps Script nicht beantwortet.
      const antwort = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(daten),
      });
      const ergebnis = await antwort.json();

      if (ergebnis.ok) {
        if (Number.isFinite(ergebnis.belegt)) auswahl.belegt = ergebnis.belegt;
        eigene.add(key(auswahl));
        el.dankeTermin.textContent = terminText(auswahl);
        auswahl = null;
        // Name, Mail und Nummer stehen lassen – wer sich für mehrere Einsätze einträgt, muss nicht neu tippen.
        el.form.querySelector('input[name="datenschutz"]').checked = false;
        zeigeAuswahl();
        render();
        el.form.hidden = true;
        el.danke.hidden = false;
        el.danke.focus();
      } else if (ergebnis.fehler === 'doppelt') {
        fehler('Mit dieser E-Mail-Adresse bist du für diesen Einsatz schon eingetragen.');
      } else if (ergebnis.fehler === 'voll' || ergebnis.fehler === 'nicht_angeboten') {
        fehler(ergebnis.fehler === 'voll'
          ? 'Dieser Einsatz ist gerade voll geworden. Bitte wähle einen anderen.'
          : 'Diesen Einsatz gibt es leider nicht mehr. Bitte wähle einen anderen.');
        auswahl = null;
        zeigeAuswahl();
        await einsaetzeLaden();
      } else if (ergebnis.fehler === 'ungueltig') {
        fehler('Bitte prüfe deine Angaben – vor allem E-Mail-Adresse und Handynummer.');
      } else {
        throw new Error(ergebnis.fehler || 'unbekannt');
      }
    } catch (err) {
      console.error(err);
      fehler('Leider hat das Eintragen nicht geklappt. Bitte versuch es später noch einmal.');
    } finally {
      el.absenden.disabled = false;
      el.absenden.textContent = 'Eintragen';
    }
  });

  el.neu.addEventListener('click', () => {
    el.danke.hidden = true;
    el.form.hidden = false;
    $('einsaetze').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  render();
  zeigeAuswahl();
  einsaetzeLaden();
})();
