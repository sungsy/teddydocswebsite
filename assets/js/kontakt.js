// Kontaktformular (Mitmachen, Unterstützung, Sonstiges). Wird wie die Terminanfragen an das Apps Script geschickt.
(() => {
  'use strict';

  const url = (window.TEDDY_BUCHUNG || {}).apps_script_url || '';
  const $ = (id) => document.getElementById(id);
  const form = $('kontakt-form');
  if (!form) return;
  const status = $('kontakt-status');
  const absenden = $('kontakt-absenden');
  const geladen = Date.now();

  // Knöpfe in den Karten "Mitmachen" und "Unterstützen" wählen das passende Anliegen vor.
  document.querySelectorAll('[data-anliegen]').forEach((link) => {
    link.addEventListener('click', () => {
      const radio = form.querySelector(`input[name="anliegen"][value="${link.dataset.anliegen}"]`);
      if (radio) radio.checked = true;
    });
  });

  const fehler = (text) => {
    status.textContent = text;
    status.classList.add('form-status-fehler');
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    status.textContent = '';
    status.classList.remove('form-status-fehler');
    if (!url) {
      fehler('Das Formular ist noch nicht eingerichtet (apps_script_url fehlt in _config.yml).');
      return;
    }

    const daten = Object.fromEntries(new FormData(form).entries());
    daten.typ = 'kontakt';
    daten.dauer = Date.now() - geladen; // Spamschutz: Bots senden sofort ab

    absenden.disabled = true;
    absenden.textContent = 'Wird gesendet …';
    try {
      // text/plain vermeidet eine CORS-Vorabanfrage, die Apps Script nicht beantwortet.
      const antwort = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(daten),
      });
      const ergebnis = await antwort.json();
      if (!ergebnis.ok) throw new Error(ergebnis.fehler || 'unbekannt');
      form.reset();
      form.hidden = true;
      $('kontakt-danke').hidden = false;
      $('kontakt-danke').focus();
    } catch (err) {
      console.error(err);
      fehler('Leider hat das Senden nicht geklappt. Bitte später noch einmal versuchen.');
    } finally {
      absenden.disabled = false;
      absenden.textContent = 'Nachricht senden';
    }
  });
})();
