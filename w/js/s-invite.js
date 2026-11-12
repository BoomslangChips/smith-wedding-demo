/* THE SMITH WEDDING · I The Invitation (WP1): the hero's Now card (#heroNow from 'ww:live') and the invitation's small behaviours. */
/* =====================================================================
   During the weekend (html.is-weekend, known before the first paint) the invitation card's countdown slot shows
   what is happening now: s-invite.css shows #heroNow at once with its height kept (a placeholder, "Today" and the
   day, until the first 'ww:live'); here it is rendered from location.js's 'ww:live' detail (SPEC §4.3:
   { at, day, current: [Ev], next: [Ev] }, null outside the weekend; WWLoc.live keeps the last one):
     ● HAPPENING NOW · Saturday        (or "Up next · Sunday 19 September" before anything has started)
     The Ceremony                      15h00 to 16h00 · The gardens at the Great Barn
     ▬▬▬▬▬────  20 min left            the time-left hairline (--p = (at - start) / (end - start))
     [ ➤ Navigate there ]              data-loc-nav="ev:<id>", only when the event has a confirmed place (nav)
     + Spa Day for the Ladies, also now
     Up next · in 40 min · Canapés & Lawn Games  ›   (the same Navigate sheet, or the day in the weekend)
   'ww:live' comes again every 30 s: the card is rebuilt only when what it says changes (the focus stays where it
   was); the hairline, the time left and "in 40 min" are written in place. With nothing left to happen (Monday
   afternoon) the card steps aside and the countdown's place reads "Just married!" (#home.hero--quiet).
   ===================================================================== */
(function () {
  'use strict';
  const root = document.documentElement;
  const box = document.getElementById('heroNow');
  const home = document.getElementById('home');
  if (!box || !home) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'September', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const SAST = 2 * 3600e3;
  const nowMs = () => { const P = window.WWPhase; const n = P && typeof P.now === 'function' ? +P.now() : 0; return n || Date.now(); };
  // a moment (ms) -> "Saturday 18 September" in SAST; an ISO day -> the same
  const dayOfMs = (ms) => { const d = new Date(ms + SAST); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const dayOfIso = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? dayOfMs(Date.UTC(+m[1], +m[2] - 1, +m[3], 12) - SAST) : ''; };
  const isoOfMs = (ms) => new Date(ms + SAST).toISOString().slice(0, 10);
  const weekdayOf = (s) => String(s || '').split(/[\s,]+/)[0];
  const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
  const ICON = {
    nav: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 3.5 3.5 10.6l7 2.4 2.4 7z"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 5.5 6.5 6.5-6.5 6.5"/></svg>'
  };

  // the day's anchor in II (#d-<id>) for an event without a place; the chapter while the days are not drawn yet
  function dayHref(ev) {
    const days = ((window.WW_CONFIG || {}).days) || [];
    const d = days.find((x) => x && x.date === ev.date);
    return d && d.id && document.getElementById(`d-${d.id}`) ? `#d-${d.id}` : '#weekend';
  }
  // the time left of an event that is on: { p: 0..1, text: "20 min left" | "1 h 20 min left" | "Until late" }
  function left(ev, at) {
    if (!(ev.end > ev.start) || /morning/i.test(ev.time || '')) return null;
    const p = Math.max(0, Math.min(1, (at - ev.start) / (ev.end - ev.start)));
    if (/late/i.test(ev.time || '')) return { p, text: 'Until late' };
    const mins = Math.max(1, Math.ceil((ev.end - at) / 6e4));
    const h = Math.floor(mins / 60), m = mins % 60;
    return { p, text: `${h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`} left` };
  }

  // the card's words, without the parts that change every tick (they are written in place, see tickParts)
  function shape(L) {
    const cur = L.current && L.current[0], nxt = L.next && L.next[0];
    const ev = cur || nxt;
    if (!ev) return '';
    const today = isoOfMs(L.at);
    const eyebrow = cur
      ? `<span class="hero-now__dot" aria-hidden="true"></span>Happening now<span class="hero-now__day">· ${esc(weekdayOf(L.day))}</span>`
      : `Up next<span class="hero-now__day">· ${esc(ev.date && ev.date !== today ? dayOfIso(ev.date) : 'Today')}</span>`;
    const meta = [cur ? '' : '<span data-k="rel"></span>', esc(ev.time), esc(ev.location)].filter(Boolean).join(' · ');
    const lf = cur ? left(cur, L.at) : null;
    let html = `<p class="hero-now__eyebrow">${eyebrow}</p><p class="hero-now__t">${esc(ev.title)}</p>`
      + (meta ? `<p class="hero-now__m">${meta}</p>` : '')
      + (lf ? '<p class="hero-now__left"><span class="hero-now__bar" aria-hidden="true"><i></i></span><span data-k="left"></span></p>' : '');
    html += ev.nav
      ? `<button type="button" class="btn btn-primary btn-lg btn-block hero-now__go" data-k="go" data-loc-nav="ev:${esc(ev.id)}" aria-haspopup="dialog">${ICON.nav}Navigate there<span class="vh"> to ${esc(ev.title)}</span></button>`
      : `<a class="text-btn hero-now__see" data-k="see" href="${dayHref(ev)}">See it in the weekend</a>`;
    if (cur && L.current[1]) html += `<p class="hero-now__also">+ ${esc(L.current[1].title)}, also now</p>`;
    if (cur && nxt) {
      const inner = `<span class="hero-now__nl">Up next<span data-k="nrel"></span></span><span class="hero-now__nt">${esc(nxt.title)}</span><span class="hero-now__chev">${ICON.chev}</span>`;
      html += nxt.nav
        ? `<button type="button" class="hero-now__next" data-k="next" data-loc-nav="ev:${esc(nxt.id)}" aria-haspopup="dialog">${inner}</button>`
        : `<a class="hero-now__next" data-k="next" href="${dayHref(nxt)}">${inner}</a>`;
    }
    return html;
  }
  // what changes on every tick: the hairline, the time left, "in 40 min"
  function tickParts(L) {
    const cur = L.current && L.current[0], nxt = L.next && L.next[0];
    const lf = cur ? left(cur, L.at) : null;
    const bar = box.querySelector('.hero-now__bar i');
    if (bar && lf) bar.style.setProperty('--p', lf.p.toFixed(3));
    const put = (k, t) => { const el = box.querySelector(`[data-k="${k}"]`); if (el && el.textContent !== t) el.textContent = t; };
    if (lf) put('left', lf.text);
    if (!cur && nxt) put('rel', nxt.rel || '');
    if (cur && nxt) put('nrel', nxt.rel ? ` · ${lower(nxt.rel)}` : '');
  }

  let shown = null;   // the markup the card holds now
  function placeholder() {
    if (shown !== null) return;
    const t = box.querySelector('[data-now-day]');
    if (t) t.textContent = dayOfMs(nowMs());
  }
  function render(L) {
    const weekend = root.classList.contains('is-weekend');
    const html = weekend && L ? shape(L) : '';
    // nothing on and nothing next, with the content in (not just a page still waiting for it): "Just married!"
    const quiet = weekend && !html && !!window.WW_CONFIG;
    home.classList.toggle('hero--quiet', quiet);
    box.hidden = !weekend || quiet;
    if (!html) { if (weekend && !quiet) placeholder(); return; }
    if (html !== shown) {
      // (a focused control keeps the focus when the card is redrawn)
      const a = document.activeElement;
      const k = a && box.contains(a) ? a.getAttribute('data-k') : null;
      box.innerHTML = html;
      shown = html;
      if (k) {
        const b = box.querySelector(`[data-k="${k}"]`) || box.querySelector('button, a');
        if (b) { try { b.focus({ preventScroll: true }); } catch (e) { /* a courtesy */ } }
      }
    }
    tickParts(L);
  }

  document.addEventListener('ww:live', (e) => render((e && e.detail) || null));
  // a detail announced before this script ran (location.js is a module, so normally it comes later)
  const L0 = window.WWLoc && window.WWLoc.live;
  if (L0 !== undefined) render(L0 || null); else placeholder();
})();
