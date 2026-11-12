/* =====================================================================
   THE SMITH WEDDING - APPLICATION LOGIC
   Pages: home, weekend, party, venue, nearby, dresscode, gallery, faq, rsvp, admin
   ===================================================================== */
(function () {
  'use strict';

  const SETTINGS = window.WEDDING_SETTINGS || {};
  const FULL_ADMIN = SETTINGS.FULL_ADMIN_URL || '/admin';
  // The invitation (shared with the map module): the token from POST /api/rsvp/gate goes with every request for
  // the content as X-Invite; the code that opened the gate is kept so it can be opened again when the token expires.
  const LS_TOKEN = 'ww_invite_token';
  const LS_CODE = 'ww_invite_code';
  const LS_KIND = 'ww_invite_kind';      // "shared" (the code on the invitation) | "party" (a household's own code)
  const LS_AT = 'ww_invite_at';          // when the token was issued (renewed once a week)
  const LS_CACHE = 'ww_config_v1';       // the last content from the server, so a returning guest opens at once
  const SS_ADMIN = 'ww_admin_user';      // the name typed at the couple's login (a greeting only)
  const SS_MANUAL = 'ww_rsvp_manual';    // "Not you? Start over": don't reopen the household from its code
  const TZ_OFFSET = '+02:00';
  const MAX_NEARBY_PHOTOS = 3;

  let CFG = null;
  let CFG_BASE = null;                   // the default content (config.js) the couple's edits apply to

  /* ---------------- Utilities ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  function deepMerge(base, over) {
    if (Array.isArray(over)) return clone(over);
    if (over && typeof over === 'object') {
      const out = (base && typeof base === 'object' && !Array.isArray(base)) ? base : {};
      Object.keys(over).forEach((k) => { out[k] = deepMerge(out[k], over[k]); });
      return out;
    }
    return over === undefined ? base : over;
  }
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Browser storage is full. Try fewer or smaller photos.'); return false; } };

  // A modal dialog (Contents, the gallery, the Navigate sheet, the map) sits in the top layer, above any z-index, and
  // makes the rest of the page inert: while one is open, #toast lives inside the topmost one (shown above it, and still
  // announced), and it comes back to the page when that closes. location.js writes to the same #toast.
  const toastEl = $('#toast');
  const modals = [];   // the open modal dialogs, in the order they opened (the last one is on top)
  function toastHost(records) {
    (records || []).forEach((r) => {
      const d = r.target;
      if (!d || d.tagName !== 'DIALOG') return;
      const i = modals.indexOf(d);
      if (i > -1) modals.splice(i, 1);
      let modal = d.open;
      try { modal = d.matches(':modal'); } catch (e) { /* no :modal: every dialog here opens with showModal() */ }
      if (modal) modals.push(d);
    });
    for (let i = modals.length - 1; i >= 0; i--) if (!modals[i].open || !modals[i].isConnected) modals.splice(i, 1);
    const host = modals[modals.length - 1] || document.body;
    if (toastEl && toastEl.parentNode !== host) host.appendChild(toastEl);
  }
  const toastMO = toastEl && document.body && 'MutationObserver' in window ? new MutationObserver(toastHost) : null;
  if (toastMO) toastMO.observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
  function toast(msg) {
    if (toastMO) toastHost(toastMO.takeRecords());
    const t = toastEl || $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast((label || text) + ' copied to clipboard');
  }

  const dateObj = (d) => new Date(d + 'T12:00:00');
  const fmtLong = (d) => dateObj(d).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtDM = (d) => dateObj(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtShortDay = (d) => dateObj(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  const fmtTime = (t) => (!t ? '' : (String(t).toLowerCase() === 'late' ? 'Late' : String(t).replace(':', 'h')));

  /* ---------------- Server API (the wedding server, same origin) ---------------- */
  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
  };
  const sstore = {
    get(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
  };
  class ApiError extends Error {
    constructor(message, status, data) { super(message); this.status = status; this.data = data || {}; }
  }
  // JSON in, JSON out. Throws ApiError (status 0: offline or the server could not be reached). The invite token
  // goes along as X-Invite; the couple's login is the planner cookie (same origin).
  async function api(path, { method = 'GET', body, form, timeout = 20000, withInvite = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const tok = withInvite ? store.get(LS_TOKEN) : '';
    if (tok) headers['X-Invite'] = tok;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : 0;
    let res;
    try {
      res = await fetch(path, {
        method, headers, credentials: 'same-origin', cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined,
        body: form || (body === undefined ? undefined : JSON.stringify(body))
      });
    } catch (e) {
      throw new ApiError(navigator.onLine === false ? 'You are offline. Please connect to the internet and try again.'
        : 'We could not reach the website just now. Please try again in a moment.', 0);
    } finally { clearTimeout(timer); }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const msg = data && typeof data.error === 'string' && data.error !== 'invite' ? data.error : `Something went wrong (${res.status}). Please try again.`;
      throw new ApiError(msg, res.status, data);
    }
    return data || {};
  }
  const joinNames = (list) => { const l = list.filter(Boolean); return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}` : (l[0] || ''); };
  const coupleNames = () => `${CFG.couple.one} & ${CFG.couple.two}`;

  /* ---------------- Icons ---------------- */
  const ICONS = {
    calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    bed: '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8M2 17h20M6 10V7.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V10"/>',
    hanger: '<path d="M12 7.5a2.2 2.2 0 1 1 2.2-2.2M12 7.5v1.2L2.8 15.4A1 1 0 0 0 3.4 17.2h17.2a1 1 0 0 0 .6-1.8L12 8.7"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    coffee: '<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v2M10 2v2M14 2v2"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    car: '<path d="M3 13l2-6h14l2 6M3 13v4h2M21 13v4h-2M3 13h18M9 17h6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
    umbrella: '<path d="M22 12a10 10 0 0 0-20 0zM12 12v7a2 2 0 0 0 4 0M12 2v1"/>',
    'camera-off': '<path d="M2 2l20 20M9 4.5h6l2 3h3a2 2 0 0 1 2 2V18M19 20H4a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h2.5"/><path d="M9.5 10.5a3.2 3.2 0 0 0 4.3 4.3"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    users: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.9"/>',
    flag: '<path d="M6 21V3l12 5-12 5M3 21h7"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    'chev-left': '<path d="m15 18-6-6 6-6"/>',
    'chev-right': '<path d="m9 18 6-6-6-6"/>',
    'chev-down': '<path d="m6 9 6 6 6-6"/>'
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.info}</svg>`;
  const ic = (name, cls = 'ic-inline') => `<span class="ic ${cls}" aria-hidden="true">${svg(name)}</span>`;
  function fillIcons(root = document) { $$('[data-icon]', root).forEach((el) => { if (!el.firstElementChild) { el.innerHTML = svg(el.dataset.icon); el.setAttribute('aria-hidden', 'true'); } }); }

  /* ---------------- Config: config.js defaults + the couple's saved edits (from the server) ---------------- */
  // Served by the wedding server, window.DEFAULT_CONFIG is only the invitation envelope (_envelope: true) and the
  // defaults come with the couple's edits from /api/site2/config (after the gate); served by a dev server it is the
  // whole file, and that copy is used.
  // cfgStamp: which content CFG is (the defaults, the couple's edits, the RSVP settings), so two copies can be told apart
  const contentStamp = (data) => JSON.stringify([data.defaults || null, data.override || null, (data.live || {}).deadline || null, !!(data.live || {}).allow_late]);
  let cfgStamp = '';
  function useConfig(data) {
    cfgStamp = contentStamp(data);
    const local = window.DEFAULT_CONFIG && !window.DEFAULT_CONFIG._envelope ? window.DEFAULT_CONFIG : null;
    CFG_BASE = clone(local || data.defaults || {});
    CFG = deepMerge(clone(CFG_BASE), clone(data.override || {}));
    // the RSVP state the server enforces for both sites (deadline, open, allow late)
    CFG.live = data.live || null;
    CFG.rsvp = CFG.rsvp || {};
    if (CFG.live) {
      if (CFG.live.deadline) CFG.rsvp.deadline = CFG.live.deadline;
      CFG.rsvp.allowLate = !!CFG.live.allow_late;
    }
    // other modules (the map / location module) read the live content here, and hear about every reload
    window.WW_CONFIG = CFG;
    document.dispatchEvent(new CustomEvent('ww:config', { detail: CFG }));
  }
  function readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(LS_CACHE) || 'null');
      return c && c.data && (c.data.defaults || c.data.override) ? c.data : null;
    } catch (e) { return null; }
  }
  function writeCache(data) {
    try { localStorage.setItem(LS_CACHE, JSON.stringify({ at: Date.now(), data: { defaults: data.defaults, override: data.override, live: data.live } })); }
    catch (e) { /* full or blocked: the next visit loads from the server */ }
  }
  // -> { ok: true, changed } | { ok: false, status, error }
  async function loadConfig() {
    try {
      const data = await api('/api/site2/config', { timeout: 12000 });
      const before = JSON.stringify(readCache());
      useConfig(data);
      writeCache(data);
      return { ok: true, changed: before !== JSON.stringify(readCache()) };
    } catch (e) { return { ok: false, status: e.status, error: e.message }; }
  }

  function allEvents(cfg = CFG) {
    const out = [];
    cfg.days.forEach((d) => d.events.forEach((e) => out.push(Object.assign({ day: d.label, date: d.date, dayId: d.id }, e))));
    return out;
  }
  const rsvpEvents = (cfg = CFG) => allEvents(cfg).filter((e) => e.rsvp);
  const courses = () => ((CFG.menu || {}).courses || []).filter((c) => c && (c.options || []).length);
  const choiceCourses = () => courses().filter((c) => c.choose);

  /* ---------------- Invitation gate (the code is checked by the server) ---------------- */
  const GATE_MSG = {
    empty: 'Please type the code printed on your invitation.',
    wrong: 'That code is not quite right. Please check your invitation.',
    link: 'This invitation link did not work. Please type the code from your invitation.',
    again: 'Please enter the invitation code again. If it does not work, it may have changed: check your messages from James & Sophie.',
    opening: 'Opening your invitation...'
  };
  function gateSay(text, error) {
    const m = $('#gateMsg');
    if (m) { m.className = error ? 'form-msg error' : 'form-msg'; m.textContent = text || ''; }
  }
  // locked: show the gate over the page. Listeners can follow it: "ww:gate-shown" / "ww:gate-opened" on document.
  // While it is up, the page under it is out of reach (inert: no Tab, no screen reader behind the card).
  // Opening it with the invitation on screen (P1, html.story-vt): the seal breaks first (motion.js WWMotion.unseal,
  // at most 1.2 s), then one View Transition carries the monogram, the names and the date from the card into the
  // header and the hero (a name is only ever on one element). Otherwise it simply opens (motion.js plays the exit).
  const VT_NAMES = [['invite-mono', '#gate .logo-gate', '#siteHeader .hdr-mono .logo'], ['invite-names', '#gate .gate-names', '#home .hero-names'], ['invite-date', '#gate .gate-date', '#home .hero-date']];
  const vtName = (sel, name) => { const el = $(sel); if (el) el.style.viewTransitionName = name; };
  function showGate(locked = true, notice = '') {
    const gate = $('#gate');
    if (!gate) return;
    const set = () => {
      gate.hidden = !locked;
      document.body.classList.toggle('locked', locked);
      ['#siteHeader', '#main', '.site-footer', '.skip-link'].forEach((s) => { const el = $(s); if (el) el.inert = locked; });
      if (locked) { gateSay(notice, false); setTimeout(() => { const i = $('#gateCode'); if (i) i.focus(); }, 50); }
      document.dispatchEvent(new CustomEvent(locked ? 'ww:gate-shown' : 'ww:gate-opened'));
    };
    const html = document.documentElement;
    const M = window.WWMotion;
    const carry = !locked && !gate.hidden && M && typeof M.unseal === 'function' && typeof document.startViewTransition === 'function'
      && html.classList.contains('story-vt') && html.classList.contains('on-hero') && !html.classList.contains('ww-deep') && !html.classList.contains('view-admin');
    if (!carry) { set(); return; }
    const input = $('#gateCode');
    if (input) input.blur();   // the keyboard goes away before the card does
    Promise.race([M.unseal(), new Promise((r) => setTimeout(r, 1200))]).then((ok) => {
      if (!ok || gate.hidden) { set(); return; }
      VT_NAMES.forEach(([n, from]) => vtName(from, n));
      let vt = null;
      try {
        vt = document.startViewTransition(() => {
          VT_NAMES.forEach(([n, from, to]) => { vtName(from, ''); vtName(to, n); });
          const home = $('#home');
          if (home) home.classList.add('hero--carried');
          set();
        });
      } catch (e) { VT_NAMES.forEach(([, from]) => vtName(from, '')); set(); return; }
      const clear = () => VT_NAMES.forEach(([, , to]) => vtName(to, ''));
      vt.finished.then(clear, clear);
    }, set);
  }
  // The names and date on the envelope, before the content is in (window.DEFAULT_CONFIG has them either way).
  function fillEnvelope() {
    const c = window.DEFAULT_CONFIG || {};
    const one = (c.couple || {}).one || '', two = (c.couple || {}).two || '', date = (c.wedding || {}).date || '';
    const map = { one, two, couplesNames: one && two ? `${one} & ${two}` : '', longDate: date ? fmtLong(date) : '' };
    $$('#gate [data-bind]').forEach((el) => { const v = map[el.dataset.bind]; if (v) el.textContent = v; });
  }
  // Invitation codes may have letters (the couple can choose one; every household has its own).
  function tuneGateInput() {
    const i = $('#gateCode');
    if (!i) return;
    i.setAttribute('inputmode', 'text'); i.setAttribute('autocapitalize', 'characters'); i.setAttribute('autocorrect', 'off');
    i.setAttribute('spellcheck', 'false'); i.setAttribute('maxlength', '40'); i.setAttribute('enterkeyhint', 'go');
  }
  // The page renders again under the gate (the code was asked for again): what the guest was reading stays where it
  // was. The deepest element with an id across the reading line is found again by its id after the render.
  function holdPlace() {
    const line = Math.round(window.innerHeight / 3);
    let pick = null;
    $$('#main [id]').forEach((el) => { const r = el.getBoundingClientRect(); if (r.height && r.top <= line && r.bottom > line) pick = { id: el.id, top: r.top }; });
    return () => {
      const el = pick && document.getElementById(pick.id);
      const d = el ? Math.round(el.getBoundingClientRect().top - pick.top) : 0;
      if (d) window.scrollBy(0, d);
    };
  }
  // POST /api/rsvp/gate {code} | {token} -> { ok, kind, token, code? } | { ok: false, status, error }
  async function gateCheck(body) {
    try {
      const r = await api('/api/rsvp/gate', { method: 'POST', body, withInvite: false, timeout: 15000 });
      return r && r.ok && r.token ? r : { ok: false, status: 403, error: GATE_MSG.wrong };
    } catch (e) { return { ok: false, status: e.status, error: e.message }; }
  }
  const gateProblem = (r) => (r.status === 429 || r.status === 0 || r.status >= 500 ? r.error : '');
  function acceptInvite(r, code) {
    store.set(LS_TOKEN, r.token);
    store.set(LS_KIND, r.kind === 'party' ? 'party' : 'shared');
    store.set(LS_AT, String(Date.now()));
    if (r.kind === 'party' && r.code) store.set(LS_CODE, r.code);
    else if (code) store.set(LS_CODE, String(code).trim());
  }
  function forgetInvite() { [LS_TOKEN, LS_KIND, LS_AT].forEach((k) => store.set(k, '')); }
  // Invite tokens last 30 days: renew quietly once a week so a guest who keeps coming back is never asked again.
  async function renewInvite() {
    const tok = store.get(LS_TOKEN);
    if (!tok || navigator.onLine === false || Date.now() - Number(store.get(LS_AT) || 0) < 7 * 864e5) return;
    const r = await gateCheck({ token: tok });
    if (r.ok) acceptInvite(r, '');
  }
  // A personal link: .../#rsvp=CODE (the couple's dashboard hands these out), ?invite=CODE or ?code=CODE.
  function takePersonalCode() {
    const url = new URL(location.href);
    let code = '';
    const h = /^#rsvp=([^&]{4,80})$/.exec(url.hash);
    if (h) { try { code = decodeURIComponent(h[1]); } catch (e) { code = h[1]; } url.hash = '#rsvp'; }
    ['invite', 'code'].forEach((k) => {
      const q = url.searchParams.get(k);
      if (q == null) return;
      if (!code && /^[A-Za-z0-9 -]{4,40}$/.test(q)) code = q;
      url.searchParams.delete(k);
    });
    if (url.href !== location.href) history.replaceState(null, '', url.pathname + url.search + url.hash);
    return code.trim();
  }
  const toRsvpPage = () => { if (location.hash !== '#rsvp') history.replaceState(null, '', location.pathname + location.search + '#rsvp'); };

  // Resolves once the content is in: at once for a returning guest (the copy saved on this device, refreshed
  // after the page is on screen), after the gate otherwise. A household's personal link opens the gate by itself.
  let gateResolve = null;
  function openInvitation() {
    return new Promise((resolve) => {
      gateResolve = resolve;
      (async () => {
        let notice = '';
        const personal = takePersonalCode();
        if (personal) {
          const r = await gateCheck({ code: personal });
          if (r.ok) {
            acceptInvite(r, personal);
            if (r.kind === 'party') { sstore.set(SS_MANUAL, ''); toRsvpPage(); }
          } else notice = gateProblem(r) || GATE_MSG.link;
        }
        const tok = store.get(LS_TOKEN);
        // #admin also opens with the couple's login alone (the server accepts the planner cookie)
        if (tok || location.hash === '#admin') {
          const cached = tok && !personal ? readCache() : null;
          if (cached) { useConfig(cached); finishGate({ cached: true }); return; }
          const r = await loadConfig();
          if (r.ok) { finishGate({}); return; }
          if (r.status === 401) { if (tok) { forgetInvite(); notice = notice || GATE_MSG.again; } }
          else if (tok) {
            const c = readCache();
            if (c) { useConfig(c); finishGate({ cached: true, offline: true }); return; }
            notice = notice || r.error;
          }
        }
        showGate(true, notice);
      })().catch((e) => { console.error('[gate]', e); showGate(true, 'Something went wrong. Please refresh the page.'); });
    });
  }
  function finishGate(info) { const r = gateResolve; gateResolve = null; if (r) r(info || {}); }
  function bindGate() {
    fillEnvelope();
    tuneGateInput();
    $('#gateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('#gateCode');
      const btn = $('#gateForm [type="submit"]');
      const code = input.value.trim();
      if (!code) { gateSay(GATE_MSG.empty, true); input.focus(); return; }
      if (btn) btn.disabled = true;
      gateSay(GATE_MSG.opening);
      const r = await gateCheck({ code });
      if (!r.ok) {
        if (btn) btn.disabled = false;
        gateSay(gateProblem(r) || GATE_MSG.wrong, true);
        input.select();
        return;
      }
      acceptInvite(r, code);
      const c = await loadConfig();
      if (btn) btn.disabled = false;
      if (!c.ok) { gateSay(c.error || 'The invitation could not load. Please try again.', true); return; }
      gateSay('');
      input.value = '';
      if (r.kind === 'party') sstore.set(SS_MANUAL, '');
      if (gateResolve) { finishGate({}); return; }
      // the code was asked for again over the page (it had changed): the latest content, where the guest is. No new
      // 'ww:route': the view and the hash are the same, so nothing jumps
      const keep = holdPlace();
      renderAll();
      keep();
      showGate(false);
    });
  }
  // A returning guest opened the copy saved on this device: fetch the latest quietly and show it where they are (what
  // they were reading stays put: holdPlace). While they are busy (the dashboard, a household being found or open in the
  // reply, typing) it waits, and is drawn at the next quiet moment: back from the dashboard (route), the household
  // closed (resetRsvp), the field left (focusout); IX's open / closed card follows at once all the same (it never
  // touches a typed value). A 401: the invitation code changed, so ask for it again.
  let renderPending = false;   // the story on screen is older than CFG (renderAll clears it)
  function renderFresh() {
    const a = document.activeElement;
    const admin = document.documentElement.classList.contains('view-admin');
    if (admin || party || finding || (a && a.matches && a.matches('input, select, textarea'))) {
      renderPending = true;
      if (!admin && !party && !finding) { try { renderRsvpShell(); } catch (e) { console.error('[render] renderRsvpShell', e); } }
      return false;
    }
    const keep = holdPlace();
    renderAll();
    keep();
    return true;
  }
  async function refreshConfig() {
    const r = await loadConfig();
    if (!r.ok) { if (r.status === 401) { forgetInvite(); showGate(true, GATE_MSG.again); } return; }
    if (!r.changed) return;
    Admin.refresh();
    renderFresh();
  }

  /* ---------------- Bindings ---------------- */
  // Every [data-bind] in the page takes its words from the content; a value the content does not have leaves the
  // page's own words (index.html) in place. [data-show-if] shows only when the content says so.
  const fillRef = (s) => String(s || '').replace(/\{ref\}/g, ((CFG && CFG.accommodation) || {}).reference || '');
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'September', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  // "2027-09-17" -> { wd: 'Friday', d: 26, mo: 'September' } (null for anything that is not such a date)
  const dayParts = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    const dt = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    return dt && !isNaN(dt) ? { wd: WEEKDAYS[dt.getUTCDay()], d: +m[3], mo: MONTHS[+m[2] - 1] } : null;
  };
  // "15:00" -> "3 pm", "15:30" -> "3:30 pm"
  const time12 = (t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
    return m ? `${+m[1] % 12 || 12}${m[2] === '00' ? '' : ':' + m[2]} ${+m[1] < 12 ? 'am' : 'pm'}` : '';
  };
  function renderBindings() {
    const c = CFG || {}, w = c.wedding || {}, acc = c.accommodation || {}, rsvp = c.rsvp || {}, couple = c.couple || {};
    const dc = c.dressCode || {}, party = dc.party || {}, welcome = c.welcome || {};
    const long = (iso) => (dayParts(iso) ? fmtLong(iso) : undefined);
    const days = (c.days || []).map((d) => d && d.date).filter((d) => dayParts(d)).sort();
    const first = dayParts(days[0]), last = dayParts(days[days.length - 1]);
    const range = days.length ? `${dateObj(days[0]).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric' })} to ${fmtLong(days[days.length - 1])}` : long(w.date);
    // "Friday 17 to Monday 20 September"
    const short = !first ? undefined : days.length === 1 ? `${first.wd} ${first.d} ${first.mo}`
      : `${first.wd} ${first.d}${first.mo !== last.mo ? ` ${first.mo}` : ''} to ${last.wd} ${last.d} ${last.mo}`;
    const wed = dayParts(w.date), dl = dayParts(rsvp.deadline), at = time12(w.ceremonyTime || '15:00');
    const ceremony = (c.days || []).flatMap((d) => (d && d.events) || []).find((e) => e && e.id === c.weddingEventId);
    const people = (c.bridalParty || {}).people, gallery = (c.photos || {}).gallery;
    const cast = Array.isArray(people) ? people.filter((p) => p && p.name).length : -1;
    const dress = (k) => (dc[k] && dc[k].title ? String(dc[k].title).toLowerCase() : undefined);
    const names = couple.one && couple.two ? `${couple.one} & ${couple.two}` : undefined;
    const map = {
      one: couple.one, two: couple.two, couplesNames: names,
      longDate: long(w.date), venue: w.venue, town: w.town,
      deadlineShort: dl ? fmtDM(rsvp.deadline) : undefined, deadlineLong: long(rsvp.deadline),
      deadlineDay: dl ? `${dl.d} ${dl.mo}` : undefined,
      weekendRange: range, weekendShort: short,
      ceremonyWhen: wed && at ? `${wed.wd} at ${at}` : undefined,
      ceremonyWhere: ceremony && ceremony.location ? String(ceremony.location).replace(/^The /, 'the ') : undefined,
      partyCount: cast < 0 ? undefined : cast > 20 ? String(cast) : NUMBER_WORDS[cast],
      photoCount: Array.isArray(gallery) ? String(gallery.filter((p) => p && p.src).length) : undefined,
      satDress: dress('saturday'), friDress: dress('friday'), sunDress: dress('sunday'),
      welcomeHeading: welcome.heading, welcomeText: welcome.text,
      accHeading: acc.heading, accText: acc.text,
      accRef: acc.reference, accPhone: acc.phone, accEmail: acc.email,
      dressIntro: dc.intro, dressNote: dc.note,
      partyTitle: party.title || 'Our Wedding Party', partyText: party.text || '',
      partyIntro: (c.bridalParty && c.bridalParty.intro) || '',
      // (IX's lede, data-bind="rsvpIntro", is renderRsvpShell's: the intro with the deadline in bold)
      footerNote: c.footerNote
    };
    $$('[data-bind]').forEach((el) => { const v = map[el.dataset.bind]; if (v != null) el.textContent = v; });
    const hrefs = {
      mapUrl: w.mapUrl,
      accTel: acc.phone ? 'tel:' + String(acc.phone).replace(/[^\d+]/g, '') : '',
      accMail: acc.email ? `mailto:${acc.email}?subject=${encodeURIComponent(fillRef(acc.emailSubject))}&body=${encodeURIComponent(fillRef(acc.emailBody))}` : ''
    };
    $$('[data-bind-href]').forEach((el) => { el.href = hrefs[el.dataset.bindHref] || '#'; });
    const show = { breakfast: !!acc.breakfastIncluded };
    $$('[data-show-if]').forEach((el) => { const k = el.dataset.showIf; if (k in show) el.hidden = !show[k]; });
    const pill = $('#breakfastPill'); if (pill) pill.hidden = !acc.breakfastIncluded;
    if (couple.title && names && wed) document.title = `${couple.title} | ${names} | ${fmtDM(w.date)}`;
  }

  // The default hero is in index.html as a static <picture> (AVIF / WebP, painted before any script runs): it stays.
  // A photo the couple chose replaces it with a plain <img>, fetched at once; every other photo waits until it is near.
  const HERO_STATIC = 'w/img/shoot-123.jpg';
  function renderPhotoSlots() {
    const photos = (CFG && CFG.photos) || {}, couple = (CFG && CFG.couple) || {};
    $$('[data-photo]').forEach((slot) => {
      const src = photos[slot.dataset.photo] || '';
      const hero = slot.dataset.photo === 'hero';
      slot.classList.toggle('empty', !src);
      // a slot that ships its photo as a static <picture> (the hero; the letter's portrait, data-static) keeps it while
      // the content still names that photo: no second download of the full-size original
      if ((hero ? src === HERO_STATIC : !!slot.dataset.static && src === slot.dataset.static) && slot.querySelector('picture')) return;
      const shown = !slot.querySelector('picture') && slot.querySelector('img');
      if (src && shown && shown.getAttribute('src') === src) return;   // (already there: no second download, no flash)
      slot.innerHTML = '';
      if (!src) return;
      const img = new Image();
      img.decoding = 'async';
      if (hero) img.fetchPriority = 'high'; else img.loading = 'lazy';
      img.src = src; img.alt = couple.one && couple.two ? `${couple.one} and ${couple.two}` : ''; slot.appendChild(img);
    });
  }

  /* ---------------- Countdown ---------------- */
  // Four hairline columns (days, hours, minutes, seconds), built once: a tick writes only the digits that changed, and
  // the seconds flip in (not with reduced motion). It runs only while it is on screen and the tab is shown, on the
  // weekend clock (WWPhase.now(): a ?now= moment keeps ticking from there). From the ceremony on: "Just married!".
  // Screen readers hear one sentence, kept to the minute (role="timer" is not announced as it changes).
  const CD = { tick: null, timer: 0, io: null, vis: true, done: false, skew: null };
  const CD_UNITS = [['d', 'Days'], ['h', 'Hrs'], ['m', 'Min'], ['s', 'Sec']];
  function cdRun() {
    const on = !!CD.tick && CD.vis && !CD.done && !document.hidden;
    if (on && !CD.timer) { CD.tick(); CD.timer = setInterval(() => CD.tick(), 1000); }
    else if (!on && CD.timer) { clearInterval(CD.timer); CD.timer = 0; }
  }
  function startCountdown() {
    const el = $('#countdown');
    if (!el) return;
    const P = window.WWPhase;
    if (CD.skew === null) CD.skew = (P && typeof P.now === 'function' ? +P.now() : Date.now()) - Date.now();
    const flip = typeof el.animate === 'function' && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const pad = (n) => String(n).padStart(2, '0');
    CD.done = false;
    CD.tick = () => {
      const w = (CFG && CFG.wedding) || {};
      let diff = Date.parse(`${w.date}T${w.ceremonyTime || '15:00'}:00${TZ_OFFSET}`) - (Date.now() + CD.skew);
      if (isNaN(diff)) { if (el.firstChild) el.textContent = ''; return; }
      if (diff <= 0) {
        if (!el.querySelector('.cd-done')) { el.innerHTML = '<span class="cd-done">Just married!</span>'; el.setAttribute('aria-label', 'Just married!'); }
        CD.done = true; cdRun();
        return;
      }
      if (!el.querySelector('.cd-col')) {
        el.innerHTML = CD_UNITS.map(([k, u]) => `<span class="cd-col" aria-hidden="true"><span class="cd-n" data-cd="${k}"></span><span class="cd-u">${u}</span></span>`).join('');
      }
      const d = Math.floor(diff / 864e5); diff -= d * 864e5;
      const h = Math.floor(diff / 36e5); diff -= h * 36e5;
      const m = Math.floor(diff / 6e4); diff -= m * 6e4;
      const v = { d: String(d), h: pad(h), m: pad(m), s: pad(Math.floor(diff / 1e3)) };
      $$('[data-cd]', el).forEach((n) => {
        const t = v[n.dataset.cd];
        if (n.textContent === t) return;
        const first = !n.textContent;
        n.textContent = t;
        if (flip && !first && n.dataset.cd === 's') {
          n.animate([{ transform: 'perspective(160px) rotateX(-70deg)', opacity: 0.25 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.22,.61,.36,1)' });
        }
      });
      const label = `${d} ${d === 1 ? 'day' : 'days'}, ${h} ${h === 1 ? 'hour' : 'hours'} and ${m} ${m === 1 ? 'minute' : 'minutes'} to the wedding`;
      if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
    };
    CD.tick();
    if (!CD.io) {
      if ('IntersectionObserver' in window) {
        CD.io = new IntersectionObserver((es) => { CD.vis = es[es.length - 1].isIntersecting; cdRun(); });
        CD.io.observe(el);
      }
      document.addEventListener('visibilitychange', cdRun);
    }
    cdRun();
  }

  /* ---------------- Weekend ---------------- */
  // II: the day rail (#wkRail, "FRI 26": story.js spies on it) and every day stacked on one spine (#daysWrap). Each
  // event carries its SAST start and end (data-s / data-e, ms, as time.js has them: no start is the morning, 07h00 to
  // 12h00; no end is two hours; 'late' is 23h59) and is drawn already past / now / next at the weekend's clock
  // (WWPhase.now() honours ?now=), so the first paint is right; s-weekend.js keeps it so from 'ww:live'. location.js
  // turns each .tl-where into the place's button (Navigate) and hides its .tl-loc; a place the event before it on
  // that day already showed is .wk-where--repeat (hidden unless that event is happening now).
  const wkHM = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
  const wkMs = (date, hm) => Date.parse(`${date}T${hm}:00${TZ_OFFSET}`);
  function wkSpan(date, e) {
    const s = wkHM(e.start), en = wkHM(e.end);
    if (!s) return { s: wkMs(date, '07:00'), e: wkMs(date, '12:00'), untimed: true };
    const start = wkMs(date, s);
    let end = en ? wkMs(date, en) : String(e.end || '').trim().toLowerCase() === 'late' ? wkMs(date, '23:59') : start + 72e5;
    if (en && end <= start) end += 864e5;
    return { s: start, e: end, untimed: false };
  }
  // what location.js's liveNow() will say at `at`: null outside the weekend (its first day 00h00 to its last 23h59)
  // or with nothing on or ahead; else now = the timed events under way (or the untimed one of that morning) and
  // next = the timed events that start soonest
  function wkLive(days, evs, at) {
    if (!days.length || at < wkMs(days[0].date, '00:00') || at > wkMs(days[days.length - 1].date, '23:59')) return null;
    const today = new Date(at + 72e5).toISOString().slice(0, 10);
    let now = evs.filter((v) => !v.untimed && v.s <= at && at < v.e);
    if (!now.length) now = evs.filter((v) => v.untimed && v.date === today && v.s <= at && at < v.e);
    const ahead = evs.filter((v) => !v.untimed && v.s > at);
    const soon = Math.min(...ahead.map((v) => v.s));
    const next = ahead.filter((v) => v.s === soon);
    return now.length || next.length ? { now: new Set(now.map((v) => v.ev)), next: new Set(next.map((v) => v.ev)) } : null;
  }
  function renderWeekend() {
    const days = (CFG.days || []).filter((d) => d && dayParts(d.date)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const clock = window.WWPhase && typeof window.WWPhase.now === 'function' ? +window.WWPhase.now() : Date.now();
    const at = isNaN(clock) ? Date.now() : clock;
    const evs = days.flatMap((d) => (d.events || []).filter(Boolean).map((e) => Object.assign({ ev: e, date: d.date }, wkSpan(d.date, e))));
    const live = wkLive(days, evs, at);
    const today = live ? new Date(at + 72e5).toISOString().slice(0, 10) : '';
    $('#wkRail').innerHTML = days.map((d) => {
      const p = dayParts(d.date);
      return `<a href="#d-${esc(d.id)}"${d.date === today ? ' class="is-today"' : ''}><span class="wk-rail__w">${esc(String(d.label || p.wd).slice(0, 3))}</span> <span class="wk-rail__n">${p.d}</span>${d.date === today ? '<span class="vh wk-rail__today">, today</span>' : ''}</a>`;
    }).join('');
    const hm = (t) => wkHM(t).replace(':', 'h');
    const timeHTML = (d, e) => {
      const s = wkHM(e.start), en = wkHM(e.end);
      if (!s) return 'All morning';
      const late = String(e.end || '').trim().toLowerCase() === 'late';
      return `<time datetime="${esc(d.date)}T${s}">${hm(s)}</time>${en ? `<span aria-hidden="true"> – </span><span class="vh"> to </span><time datetime="${esc(d.date)}T${en}">${hm(en)}</time>` : late ? ' until late' : ''}`;
    };
    // the day's dress as a chip ("Semi-formal"), its aside in words beside it ("in our colour palette")
    const wear = (d) => {
      const m = /^(.+?)\s*\((.+)\)\s*$/.exec(String(d.dress).trim());
      const main = m ? m[1] : String(d.dress).trim(), note = m ? m[2] : '';
      return `<p class="wk-wear"><a class="chip wk-dress" href="#dresscode">${ic('hanger')}<span class="vh">What to wear: </span>${esc(main)}</a>${note ? `<span class="wk-wear__note">${esc(note)}</span>` : ''}</p>`;
    };
    $('#daysWrap').classList.toggle('is-live', !!live);
    $('#daysWrap').innerHTML = '<span class="wk-spine" aria-hidden="true"><span class="wk-spine__draw"></span><span class="wk-spine__now"></span></span>'
      + days.map((d) => {
        const p = dayParts(d.date);
        const feature = d.date === CFG.wedding.date;
        let prev = '';
        const items = (d.events || []).filter(Boolean).map((e) => {
          const v = wkSpan(d.date, e);
          const state = !live ? '' : live.now.has(e) ? ' is-now' : live.next.has(e) ? ' is-next' : v.e <= at ? ' is-past' : '';
          const place = norm(e.location);
          const rep = place && place === prev ? ' wk-where--repeat' : '';
          prev = place;
          return `<li class="wk-ev${state}" data-ev="${esc(e.id)}" data-s="${v.s}" data-e="${v.e}" data-rv>
            <span class="wk-bead" data-ambient aria-hidden="true"></span>
            <p class="wk-time">${timeHTML(d, e)}<span class="wk-rel"></span><span class="wk-now">Now</span></p>
            <h4 class="wk-title">${esc(e.title)}</h4>
            ${e.desc ? `<p class="wk-desc">${esc(e.desc)}</p>` : ''}
            ${e.location ? `<p class="tl-loc${rep}">${ic('pin')}<span class="tl-loc__t">${esc(e.location)}</span></p>` : ''}
            <div class="tl-where${rep}" data-loc-event="${esc(e.id)}" data-loc-where="${esc(e.location || '')}" hidden></div></li>`;
        }).join('');
        return `<section class="wk-day${feature ? ' wk-day--feature' : ''}" id="d-${esc(d.id)}" data-day="${esc(d.id)}" data-date="${esc(d.date)}"${feature ? ` data-n="${p.d}"` : ''}>
          ${feature ? '<span class="wk-paper" aria-hidden="true"></span>' : ''}
          <header class="wk-head" data-rv="group">
            ${feature ? '<span class="wk-gazebo" aria-hidden="true"></span>' : ''}
            <svg class="wk-ring" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9.25" pathLength="1"/></svg>
            <h3 class="wk-h"><span class="wk-label">${esc(d.label || p.wd)}</span><span class="wk-num"><span class="vh"> </span>${p.d}<span class="vh"> ${esc(p.mo)}: </span></span><span class="wk-name">${esc(d.title)}</span></h3>
            ${d.dress ? wear(d) : ''}
          </header>
          <ol class="wk-evs" role="list">${items || '<li class="wk-ev wk-ev--tbc"><p class="wk-desc">Details coming soon.</p></li>'}</ol>
        </section>`;
      }).join('');
  }

  /* ---------------- The wedding party (V) ----------------
     The bridesmaids on the white page, their photographs printed into arches; then the night band: the highlands
     rise over the page, three champagne stars come out and the groomsmen and the MC develop like darkroom prints,
     until a ridge of morning white closes it. Someone without a photograph has a cameo (their initials in script
     over a sprig), never a "coming soon". Looks and motion: s-party.css (each person is a [data-rv] group). */
  // "Anne-Marie Jones" -> "MK", "Marco Clarke" -> "MK": the first name and the surname
  const initials = (name) => {
    const w = String(name || '').split(/\s+/).map((x) => x.replace(/[^\p{L}]/gu, '')).filter(Boolean);
    return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || '').slice(0, 2)).toUpperCase();
  };
  function renderBridalParty() {
    const host = $('#partyGroups'); if (!host) return;
    const ppl = ((CFG.bridalParty || {}).people || []).filter((p) => p && p.name);
    const of = (g) => ppl.filter((p) => p.group === g);
    const maids = of('bride'), men = of('groom'), mcs = of('mc');
    // (the photograph is described by the name under it, so it has no words of its own)
    const photo = (p) => (p.photo
      ? `<figure class="pt-photo print"><img src="${esc(p.photo)}" alt="" width="480" height="600" loading="lazy" decoding="async"></figure>`
      : `<figure class="pt-photo pt-photo--cameo" aria-hidden="true"><span class="pt-cameo">${esc(initials(p.name))}</span></figure>`);
    const words = (p) => `<h4 class="pt-name">${esc(p.name)}</h4>${p.role ? `<p class="pt-role">${esc(p.role)}</p>` : ''}`;
    // a staggered cast on phones (every second person a step lower); an even cast keeps room for the last step
    const cast = (list) => `<ul class="pt-cast${list.length % 2 ? '' : ' pt-cast--even'}" style="--cols:${Math.min(list.length, 5)}">
      ${list.map((p) => `<li class="pt-person" data-rv="group">${photo(p)}${words(p)}</li>`).join('')}</ul>`;
    const wears = (name, hex) => `<p class="pt-note"><i style="--c:${hex}" aria-hidden="true"></i>Wearing ${name}</p>`;
    const maidsHTML = maids.length ? `<div class="ch-col pt-maids">
        <h3 class="pt-h">The Bridesmaids</h3>${wears('Sage Mist', '#B9C4BD')}${cast(maids)}</div>` : '';
    // The MC between the two sides: one MC whose portrait also comes as a cut-out (people[].cutout, a picture with a
    // transparent ground named after the photo: "<photo>-cutout") stands on the seam itself. Head and shoulders on
    // the bridesmaids' white page, before a pale moon that rises behind the ridge; the dinner jacket runs into the
    // night band, where the name is. A photo changed in the dashboard no longer matches its cut-out, and then (as
    // for an MC without a cut-out, or two MCs) the MC keeps the feature row under the groomsmen.
    const stem = (s) => String(s || '').replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
    const seam = mcs.length === 1 && mcs[0].cutout && stem(mcs[0].cutout) === `${stem(mcs[0].photo)}-cutout` ? mcs[0] : null;
    // (round him, to keep him company: a fine ring that turns with two small stars on it, two drifts of mist, a few stars on the page)
    const sparks = [[-0.78, 0.86, 11, 0], [0.84, 0.70, 9, 1], [-0.96, 0.30, 8, 2], [0.98, 0.20, 10, 3], [-0.52, 1.08, 8, 4], [0.58, 1.02, 7, 5]].map(([x, y, s, i]) => `<i class="pt-spark" style="--x:${x};--y:${y};--s:${s}px;--i:${i}"></i>`).join('');
    const hostHTML = seam ? `<span class="pt-moonbox" aria-hidden="true"><i class="pt-orb"><i class="pt-halo"></i><i class="pt-moon"></i></i><i class="pt-mist pt-mist--a"></i><i class="pt-mist pt-mist--b"></i>${sparks}</span>` : '';
    const hostFig = seam ? `<figure class="pt-host" data-rv="group" aria-hidden="true"><img class="pt-host__img" src="${esc(seam.cutout)}" alt="" width="1016" height="1228" loading="lazy" decoding="async"></figure>` : '';
    const hostWords = seam ? `<div class="pt-hostwords" data-rv="group">
          <h3 class="pt-host__k">Our MC</h3>${words(seam)}<span class="pt-host__thread" aria-hidden="true"></span></div>` : '';
    const mcHTML = mcs.length && !seam ? `<div class="pt-mc">
        <h3 class="pt-mc__h">${mcs.length > 1 ? 'Our MCs' : 'Our MC'}</h3>
        ${mcs.map((p) => `<div class="pt-mc__row" data-rv="group">${photo(p)}<div class="pt-mc__words">${words(p)}</div></div>`).join('')}</div>` : '';
    const nightHTML = men.length || mcs.length ? `<div class="pt-night${seam ? ' pt-night--host' : ''}" data-ink="night" data-ambient>
        ${hostHTML}<span class="pt-ridges" aria-hidden="true"><span class="pt-ridge pt-ridge--far"></span><span class="pt-ridge pt-ridge--near"></span></span>
        ${hostFig}<div class="pt-sky" data-rv="group" aria-hidden="true"><span class="pt-thread"></span>
          <i class="pt-star" style="--i:0"><b></b></i><i class="pt-star" style="--i:1"><b></b></i><i class="pt-star" style="--i:2"><b></b></i></div>
        <div class="ch-col pt-men">
          ${hostWords}
          ${men.length ? `<h3 class="pt-h">The Groomsmen</h3>${wears('Stone Khaki', '#B4AA96')}${cast(men)}` : ''}
          ${mcHTML}
        </div>
        <span class="pt-dawn" aria-hidden="true"></span>
      </div>` : '';
    host.innerHTML = maidsHTML + nightHTML;
    host.classList.toggle('pt--night', !!nightHTML);
  }

  /* ---------------- Venue ---------------- */
  // the default venue photos also come as light AVIF / WebP copies at the gallery's sizes (w/img/venue/<name>-<width>)
  const VENUE_W = { 'w/img/venue-garden.jpg': [480, 789], 'w/img/venue-sporting-horse.jpg': [480, 800], 'w/img/venue-sporting-horse-gable.jpg': [480, 800] };
  function venuePhoto(p, i, eager) {
    const img = `<img src="${esc(p.src)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
    const ws = VENUE_W[p.src];
    if (!ws) return img;
    const name = p.src.replace(/^.*\//, '').replace(/\.jpg$/, '');
    // the lead is printed full bleed on a phone (the column on wide screens); the pair share the column
    const sizes = i ? '(min-width: 900px) 350px, calc(50vw - 26px)' : '(min-width: 900px) 720px, 100vw';
    const set = (f) => ws.map((w) => `w/img/venue/${name}-${w}.${f} ${w}w`).join(', ');
    return `<picture><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}">${img}</picture>`;
  }
  function renderVenue() {
    const v = CFG.photos.venue || [];
    // opened straight on The Venue: its first photo is the chapter's largest picture, so it is fetched at once
    const here = (location.hash || '').slice(1) === 'venue';
    // The plates: the lead (the gardens, at the photo's own ratio) and the pair (4:5), each printed into the paper and
    // captioned under it. Each opens the photo viewer (the button is named by its caption, so the caption under it is
    // not announced twice).
    const plate = (p, i, cls) => `<figure class="${cls}"><button type="button" class="vn-photo print" data-lightbox="venue" data-index="${i}" data-rv="ink" aria-label="View photo: ${esc(p.caption || CFG.wedding.venue)}">${venuePhoto(p, i, here && !i)}</button>${p.caption ? `<figcaption class="vn-cap" aria-hidden="true">${esc(p.caption)}</figcaption>` : ''}</figure>`;
    const pair = v.slice(1, 3).map((p, j) => plate(p, j + 1, 'vn-plate')).join('');
    $('#venueGallery').innerHTML = (v[0] ? plate(v[0], 0, 'vn-lead') : '') + (pair ? `<div class="vn-pair">${pair}</div>` : '');
    $('#venueGallery').hidden = !v.length;
    // LOCATION: the address and the main gate's exact coordinates (location.js adds the Directions chooser and the maps)
    const w = CFG.wedding, gate = Array.isArray(w.gate) && w.gate.length === 2 ? w.gate : null;
    $$('[data-loc-address]').forEach((el) => { el.textContent = w.address || w.town; });
    $$('a[data-loc-dir="gate"]').forEach((a) => { a.href = gate ? `https://www.google.com/maps/dir/?api=1&destination=${+gate[1]},${+gate[0]}&travelmode=driving` : w.mapUrl; });
    (window.WWLoc = window.WWLoc || {}).cfg = CFG;
  }

  /* ---------------- Nearby ---------------- */
  // IV · Where to Stay. The ticket is in index.html (renderBindings fills it); renderNearby() names the contact on
  // its Email button (from the pre-typed email's greeting: "Hi the estate," -> "Email the estate"), shows Call / Email
  // only with a number / an address, and the link to the reply only while the reply asks where guests stay. Then the
  // stays nearby: one card each in the [data-snap] row #nearbyGrid (story.js pages it; places.js adds one Google Maps
  // photo per card as it comes into view, once IV is near): the couple's own photo (Admin > Stay) or an engraved
  // placeholder, the drive, the name, the area, the blurb, Call / Website / Directions and the email address.
  // LOCATION: a stay with its own pin gets Directions to those exact coordinates (location.js opens the Navigate
  // sheet, which also shows it on the map); one without keeps its Google Maps search link
  const stayKey = (n) => n.id || String(n.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stayPin = (n) => (Array.isArray(n.coord) && n.coord.length === 2 && n.coord.every((x) => Number.isFinite(+x)) ? n.coord : null);
  const ST_NAV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20.5 3.5 3.5 10.6l7 2.4 2.4 7z"/></svg>';
  const stAct = (href, icon, label, more, extra = '') => `<a class="st-act" href="${esc(href)}"${extra}>${icon}<span>${label}</span><span class="vh">${esc(more)}</span></a>`;
  function stayCard(n, i) {
    const pin = stayPin(n), key = esc(stayKey(n)), name = esc(n.name);
    const own = (n.photos || []).find((p) => p && p.src);
    const has = (v) => v !== '' && v != null;
    const dist = [has(n.distanceKm) ? `${esc(n.distanceKm)} km` : '', has(n.driveMin) ? `${esc(n.driveMin)} min` : ''].filter(Boolean).join(' · ');
    const acts = [
      n.phone ? stAct(`tel:${String(n.phone).replace(/[^\d+]/g, '')}`, svg('phone'), 'Call', ` ${n.name}, ${n.phone}`) : '',
      n.url ? stAct(n.url, svg('globe'), 'Website', ` of ${n.name}`, ' target="_blank" rel="noopener"') : '',
      pin ? stAct(`https://www.google.com/maps/dir/?api=1&destination=${+pin[1]},${+pin[0]}&travelmode=driving`, ST_NAV, 'Directions', ` to ${n.name}`, ` target="_blank" rel="noopener" data-loc-dir="stay:${key}" aria-haspopup="dialog"`)
        : n.mapUrl ? stAct(n.mapUrl, ST_NAV, 'Directions', ` to ${n.name}, on Google Maps`, ' target="_blank" rel="noopener"') : ''
    ].join('');
    // the couple's own photos open in the lightbox (all of them); a stay without gets an engraving until places.js
    // brings one from Google Maps
    const photo = own ? `<button class="st-ph-open" type="button" data-lightbox="nearby-${i}" data-index="0" aria-label="View the photos of ${name}"><img src="${esc(own.src)}" alt="" loading="lazy" decoding="async"></button>`
      : '<span class="st-art" aria-hidden="true"></span>';
    return `<li class="st-card" id="stay-${key}" data-stay="${key}" style="--i:${i}">
      <figure class="st-photo"${own ? ' data-own' : ''}><div class="st-ph${own ? ' print' : ''}">${photo}${dist ? `<span class="st-dist">${svg('car')}<span class="vh">From the estate: </span>${dist}</span>` : ''}</div><figcaption class="st-credit"></figcaption></figure>
      <div class="st-body">
        <h4 class="st-name">${name}</h4>${n.area ? `<p class="st-area">${esc(n.area)}</p>` : ''}${n.blurb ? `<p class="st-blurb">${esc(n.blurb)}</p>` : ''}
        <div class="st-acts">${acts}</div>
        <p class="st-email">${n.email ? `<a href="mailto:${esc(n.email)}">${esc(n.email)}</a>` : ''}</p>
      </div></li>`;
  }
  // Who books a room on the estate (accommodation.mode): 'venue' = guests book with the estate themselves, and the
  // reply only notes who stays where; anything else ('couple') = a room is asked for in the reply and James & Sophie
  // confirm it. The Stay chapter, the reply's accommodation question and its thank-you all follow this.
  function venueStay() { return (CFG.accommodation || {}).mode === 'venue'; }
  const ST_NOT_A_NAME = /^(sir|madam|team|all|there|everyone|friends)$/i;
  let nearbyHTML = null;
  function renderNearby() {
    const acc = CFG.accommodation || {};
    const hi = /^\s*(?:hi|hello|hey|dear|good (?:morning|day|afternoon))\s+([^\s,!.]{2,24})\s*[,!.]/i.exec(String(acc.emailBody || ''));
    const who = hi && /^[A-Z][A-Za-z'’-]+$/.test(hi[1]) && !ST_NOT_A_NAME.test(hi[1]) ? hi[1] : '';
    $$('#stay .st-write__t').forEach((el) => { el.textContent = who ? `Email ${who}` : 'Email to book'; });
    $$('#stay .st-call').forEach((el) => { el.hidden = !acc.phone; });
    $$('#stay .st-write').forEach((el) => { el.hidden = !acc.email; });
    // "Or ask for a room in your reply" only when rooms are asked for through the reply ('couple' mode)
    $$('#stay .st-ask').forEach((el) => { el.hidden = (CFG.rsvp || {}).askStay === false || venueStay(); });
    $$('#stay [data-acc-how]').forEach((el) => { el.textContent = venueStay() ? 'directly with the estate' : 'on the estate'; });
    const grid = $('#nearbyGrid');
    if (!grid) return;
    const html = (CFG.nearby || []).map((n, i) => (n && n.name ? stayCard(n, i) : '')).join('');
    // the same stays as on the page: the cards stay as they are (their photos, and where the row was scrolled to)
    if (html !== nearbyHTML) { grid.innerHTML = html; nearbyHTML = html; }
    $$('#nearby [data-snap-wrap], #nearby .st-onmap, #nearby .st-note').forEach((el) => { el.hidden = !html; });
    $$('#nearby .st-soon').forEach((el) => { el.hidden = !!html; });
  }
  // Copy flashes the reference (a rose wash) and its icon turns into a tick for a moment (the toast says it too);
  // the row's "2 of 6" is read out once the guest uses its arrows (not as the page draws it)
  let copiedT = 0;
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#stay .st-copy, #stay [data-snap-prev], #stay [data-snap-next]');
    if (!t) return;
    const row = t.closest('.st-ref');
    if (row) {
      row.classList.remove('is-copied');
      void row.offsetWidth;   // (again from the start)
      row.classList.add('is-copied');
      clearTimeout(copiedT);
      copiedT = setTimeout(() => row.classList.remove('is-copied'), 1600);
      return;
    }
    const n = t.closest('[data-snap-wrap]') && t.closest('[data-snap-wrap]').querySelector('[data-snap-count]');
    if (n && !n.hasAttribute('aria-live')) n.setAttribute('aria-live', 'polite');
  });

  /* ---------------- FAQ ---------------- */
  // VIII: quiet hairline rows, all closed, one open at a time (<details name>); a + that turns into a x (s-reply.css)
  function renderFaq() {
    // a blank line starts a new paragraph; a single line break stays a line break (an address, banking details)
    const paras = (a) => String(a || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
      .map((s) => `<p>${s.split(/\s*\n\s*/).map(esc).join('<br>')}</p>`).join('');
    $('#faqList').innerHTML = (CFG.faq || []).filter((f) => f && f.q).map((f) => `<details class="faq-item" name="faq" data-rv>
      <summary class="faq-sum"><span class="faq-q">${esc(f.q)}</span><span class="faq-x" aria-hidden="true"></span></summary>
      <div class="faq-a">${paras(f.a)}</div></details>`).join('') || '<p class="faq-soon">Questions coming soon.</p>';
  }

  /* ---------------- What to wear (VI) ---------------- */
  // The weekend at a glance (three rows, each to its look), the palette as a swatch book of silk swatches grouped
  // by who wears them (nothing to tap or copy: every colour is on the page at once), and the looks: one fashion
  // plate per day in a swipeable lookbook ([data-snap], story.js pages it). Looks and motion: dress.css.
  // The plates' figures: Sophie's gown and suit drawn taller and finer, 100 x 260 drawings standing on y = 248,
  // each cropped to its own width (the viewBox) so a row of them shares one scale. Decorative: the plate around
  // them is one role="img" with the description.
  const DC_SKIN = ['#EBCFBF', '#D6A98E', '#B98466', '#8C5E46'];
  const DC_HAIR = ['#5B4636', '#2E2520', '#8A6A4E', '#3B2E26'];
  const DC_SHOE = '#3B332E';
  const DC_DENIM = '#64748A';
  const HEX6 = /^#[0-9a-f]{6}$/i;
  const fig = (vb, body, shadow, w = vb === 11 ? 78 : 50) => `<svg viewBox="${vb} 0 ${w} 260" aria-hidden="true" focusable="false">
    <ellipse cx="50" cy="248.6" rx="${shadow}" ry="3" fill="#2E2A26" opacity=".08"/>${body}</svg>`;
  function dcHead(i, hair) {
    const s = DC_SKIN[i % 4], h = DC_HAIR[i % 4];
    const locks = {
      bun: `<path d="M42.5 19C42 10.8 46 7.9 50 7.9S58 10.8 57.5 19C56.2 14 53.4 12.3 50 12.3S43.8 14 42.5 19Z" fill="${h}"/><circle cx="50" cy="7.4" r="4.3" fill="${h}"/>`,
      long: `<path d="M42.3 20.5C41.6 11 45.6 7.9 50 7.9S58.4 11 57.7 20.5C58.4 29 60.2 37 61.6 45.4L56.4 45.4C56.3 37 56.1 29 55.5 22.4C54.9 15.6 52.9 12.6 50 12.6S45.1 15.6 44.5 22.4C43.9 29 43.7 37 43.6 45.4L38.4 45.4C39.8 37 41.6 29 42.3 20.5Z" fill="${h}"/>`,
      short: `<path d="M42.4 18.4C42 10.9 45.8 8.5 50 8.5S58 10.9 57.6 18.4C56.3 14.2 53.5 12.7 50 12.7S43.7 14.2 42.4 18.4Z" fill="${h}"/>`
    };
    return `<ellipse cx="50" cy="18.8" rx="7.3" ry="8.8" fill="${s}"/>${locks[hair] || ''}`;
  }
  const dcNeck = (s, chest) => `<path d="M47.3 25h5.4v13.5h-5.4z" fill="${s}"/>${chest ? `<path d="M40.4 39.8Q50 36.2 59.6 39.8L57 58L43 58Z" fill="${s}"/>` : ''}`;
  const dcHands = (s, y, x) => `<ellipse cx="${50 - x}" cy="${y}" rx="1.9" ry="2.7" fill="${s}"/><ellipse cx="${50 + x}" cy="${y}" rx="1.9" ry="2.7" fill="${s}"/>`;
  const dcShoes = (c, y) => `<path d="M41.4 ${y}h7.4v3.4h-8.6q0-2 1.2-3.4zM51.2 ${y}h7.4q1.2 1.4 1.2 3.4h-8.6z" fill="${c}"/>`;
  // a stole over the shoulders, its ends falling over the arms (Friday's warm layer)
  const dcWrap = (w) => {
    const d = 'M39.4 41.6C35.8 53 34.4 72 34.8 101L40.6 102.4C40.2 80 41 61 44 48ZM60.6 41.6C64.2 53 65.6 72 65.2 101L59.4 102.4C59.8 80 59 61 56 48Z';
    return `<path d="M39.6 40Q50 35.4 60.4 40L61 45.6Q50 41.6 39 45.6Z" fill="${w}"/><path d="${d}" fill="${w}"/><path d="${d}" fill="url(#dc-silk)"/>
      <path d="M35.4 101.2l-.4 3.2M37.4 101.7l-.2 3.2M39.4 102.1v3.2M60.6 102.1v3.2M62.6 101.7l.2 3.2M64.6 101.2l.4 3.2" stroke="${w}" stroke-width=".8"/>`;
  };
  // Sophie's gown, upgraded: a V-neck bodice, a waist seam and an A-line skirt with folds and a silk sheen;
  // floor-length (Saturday), tea-length to the mid-calf (Saturday's shorter dress: tea: true) or midi with legs and
  // block heels (Friday, Sunday), with or without a wrap
  function gownSVG(colour, i, { long = true, tea = false, wrap = '', hair = 'bun' } = {}) {
    const s = DC_SKIN[i % 4];
    const hem = long ? 246 : (tea ? 214 : 183);
    const skirt = long ? 'M43.3 84L56.7 84C61 128 75 186 87 246Q50 254 13 246C25 186 39 128 43.3 84Z'
      : tea ? 'M43.3 84L56.7 84C60.3 120 70.4 167.7 78.7 214Q50 221 21.3 214C29.6 167.7 39.7 120 43.3 84Z'
        : 'M43.3 84L56.7 84C59.6 112 66 150 70.6 183Q50 189 29.4 183C34 150 40.4 112 43.3 84Z';
    const folds = long ? 'M47.6 87C46 140 40 196 33 248M52.4 87C54.6 140 61 196 67.6 249.4M50 88C50 150 50.6 200 50.8 252'
      : tea ? 'M47.6 87C46.3 129.8 41.5 173.6 36.4 216.5M52.4 87C54.1 129.8 59 173.6 64 217.4M50 88C50 139.8 50.4 179.7 50.5 219.7'
        : 'M47.6 87C46.6 120 43 152 39.6 186M52.4 87C53.6 120 57 152 60.6 186.4M50 88C50 130 50.2 160 50.3 188.4';
    const bodice = 'M40.3 39.8Q44.4 38.4 46.3 39.6L50 56.5L53.7 39.6Q55.6 38.4 59.7 39.8C61 54 59.3 70 56.7 84L43.3 84C40.7 70 39 54 40.3 39.8Z';
    return fig(long ? 11 : (tea ? 19 : 25), `
      ${long ? '' : `<path d="M45.8 ${hem}L45.4 238.5M54.2 ${hem}L54.6 238.5" stroke="${s}" stroke-width="3.4" stroke-linecap="round"/>${dcShoes(DC_SHOE, 237.8)}`}
      ${dcNeck(s, true)}
      <path d="M40.6 41.5C37.6 56 36.2 72 36.6 88C36.9 98 37.6 106 38.2 112.5M59.4 41.5C62.4 56 63.8 72 63.4 88C63.1 98 62.4 106 61.8 112.5" fill="none" stroke="${s}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="${skirt}" fill="${colour}"/><path d="${folds}" fill="none" stroke="#000" stroke-opacity=".08" stroke-width="1.1"/><path d="${skirt}" fill="url(#dc-silk)"/>
      <path d="${bodice}" fill="${colour}"/><path d="${bodice}" fill="url(#dc-silk)"/>
      <path d="M43.3 84Q50 86.6 56.7 84" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.3"/>
      ${wrap ? dcWrap(wrap) : ''}${dcHead(i, hair)}`, long ? 37 : (tea ? 27 : 16), long ? 78 : (tea ? 62 : 50));
  }
  // Sophie's suit, upgraded: a jacket with lapels and sleeves, shirt, tie and pocket square (style 'suit'); an open
  // jacket over a collared shirt with chinos ('smart'); a crew-neck knit with trousers ('knit')
  function suitSVG(colour, i, { style = 'suit', tie = '#F0C4CB', square = '#FBEAD6', shirt = '#FBF8F4', trousers = colour, shoe = DC_SHOE } = {}) {
    const s = DC_SKIN[i % 4];
    const sleeves = 'M33.8 42.6C30.6 58 29.4 92 29.8 124L36 124.6C35.8 98 36.4 70 38.2 52ZM66.2 42.6C69.4 58 70.6 92 70.2 124L64 124.6C64.2 98 63.6 70 61.8 52Z';
    const legs = `<path d="M34.8 126L49.2 126L47.4 246L38 246ZM50.8 126L65.2 126L62 246L52.6 246Z" fill="${trousers}"/>
      <path d="M42.4 132L42.7 245M57.6 132L57.3 245" stroke="#000" stroke-opacity=".09" stroke-width=".9"/>
      <path d="M36.4 245.2h11.4v3.6h-13.4q0-2.4 2-3.6zM52.2 245.2h11.4q2 1.2 2 3.6h-13.4z" fill="${shoe}"/>`;
    const seams = '<path d="M36.2 52.6C35.6 78 35.8 104 36 124M63.8 52.6C64.4 78 64.2 104 64 124" stroke="#000" stroke-opacity=".12" stroke-width=".9" fill="none"/>';
    let body;
    if (style === 'knit') {
      const knit = 'M33.6 42.4Q50 37 66.4 42.4C67.8 64 67.8 100 66.8 127L33.2 127C32.2 100 32.2 64 33.6 42.4Z';
      body = `${legs}${dcNeck(s)}<path d="${sleeves}" fill="${colour}"/><path d="${knit}" fill="${colour}"/><path d="${knit} ${sleeves}" fill="url(#dc-wool)"/>
        <path d="M42 50V118M50 46V118M58 50V118" stroke="#fff" stroke-opacity=".16" stroke-width="1.2" stroke-dasharray="3.4 1"/>
        <path d="M33.2 120.4h33.6v6.6h-33.6zM29.8 118.6l6.2.5v5.6l-6.2-.4zM70.2 118.6l-6.2.5v5.6l6.2-.4z" fill="#000" fill-opacity=".08"/>
        <path d="M44.2 39.4Q50 44.4 55.8 39.4" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.8"/>${seams}`;
    } else if (style === 'smart') {
      const panels = 'M33.6 42.4Q39.8 39 44.4 38.6L47.4 131L32.8 131C31.8 98 32.2 64 33.6 42.4ZM66.4 42.4Q60.2 39 55.6 38.6L52.6 131L67.2 131C68.2 98 67.8 64 66.4 42.4Z';
      body = `${legs}${dcNeck(s)}<path d="M36.4 41Q50 37.4 63.6 41L64.4 129L35.6 129Z" fill="${shirt}"/>
        <path d="M47.4 38L50 43.4L52.6 38Z" fill="${s}"/>
        <path d="M44.8 37.2L50 43.4L46.4 46.6L42.8 40.2ZM55.2 37.2L50 43.4L53.6 46.6L57.2 40.2Z" fill="${shirt}" stroke="#000" stroke-opacity=".14" stroke-width=".6"/>
        <path d="M50 44V124" stroke="#000" stroke-opacity=".1" stroke-width=".6"/><path d="M35.8 124.6h28.4v2.8h-28.4z" fill="#5B4838"/>
        <path d="${sleeves}" fill="${colour}"/><path d="${panels}" fill="${colour}"/><path d="${panels} ${sleeves}" fill="url(#dc-wool)"/>
        <path d="M44.4 38.6L46.6 74L41.4 55ZM55.6 38.6L53.4 74L58.6 55Z" fill="#000" fill-opacity=".13"/>${seams}`;
    } else {
      const jacket = 'M33.6 42.4Q40.6 38.6 45 38.4L50 64L55 38.4Q59.4 38.6 66.4 42.4C67.8 64 68.2 98 67.2 130L52.4 130L50 104L47.6 130L32.8 130C31.8 98 32.2 64 33.6 42.4Z';
      body = `${legs}${dcNeck(s)}<path d="M43.4 38.4L50 66L56.6 38.4Z" fill="${shirt}"/>
        <path d="M45.2 37.6L50 43.6L47 45.8L44 39.4ZM54.8 37.6L50 43.6L53 45.8L56 39.4Z" fill="#EEE9E2"/>
        <path d="M48.7 41.4L50 44.6L51.3 41.4L51.6 60.4L50 64L48.4 60.4ZM48.5 39.6h3l-.5 2.4h-2z" fill="${tie}"/>
        <path d="${sleeves}" fill="${colour}"/><path d="${jacket}" fill="${colour}"/><path d="${jacket} ${sleeves}" fill="url(#dc-wool)"/>
        <path d="M45 38.4L50 64L42.4 54.4L44.4 46.6ZM55 38.4L50 64L57.6 54.4L55.6 46.6Z" fill="#000" fill-opacity=".14"/>
        <path d="M57.6 55.6l5.4-1.5l-.3 2.6l-5 .5z" fill="${square}"/>
        <circle cx="50" cy="78" r=".95" fill="#000" fill-opacity=".3"/><circle cx="50" cy="90" r=".95" fill="#000" fill-opacity=".3"/>${seams}`;
    }
    return fig(25, `${body}${dcHands(s, 127.6, 17.1)}${dcHead(i, 'short')}`, 17);
  }
  // her separates: a blouse with jeans and an open cardigan (Friday), or a soft oversized knit with jeans (Sunday)
  function separatesSVG(top, i, { knit = '', jumper = false, jeans = DC_DENIM, hair = 'long' } = {}) {
    const s = DC_SKIN[i % 4];
    const sleeves = jumper ? 'M39.8 40.6C35.4 56 33.8 84 34.4 108L39.6 109C39.6 88 40.8 64 43.2 49ZM60.2 40.6C64.6 56 66.2 84 65.6 108L60.4 109C60.4 88 59.2 64 56.8 49Z'
      : 'M40.2 40C36.2 56 34.8 84 35.4 110L39.8 110.6C39.8 88 41 64 43.4 49ZM59.8 40C63.8 56 65.2 84 64.6 110L60.2 110.6C60.2 88 59 64 56.6 49Z';
    const blouse = jumper ? 'M39.8 40Q50 36.8 60.2 40C62.6 60 63.2 86 62.6 110L37.4 110C36.8 86 37.4 60 39.8 40Z'
      : 'M40.3 39.8Q50 45 59.7 39.8C61.2 58 60.5 84 61.4 104.5L38.6 104.5C39.5 84 38.8 58 40.3 39.8Z';
    return fig(25, `
      <path d="M38.8 103L49.4 103L48.4 239L42.8 239ZM50.6 103L61.2 103L57.2 239L51.6 239Z" fill="${jeans}"/>
      <path d="M45.6 108L45.4 236M55.8 108L54.4 236" stroke="#fff" stroke-opacity=".14" stroke-width=".8"/>${dcShoes(DC_SHOE, 238.4)}
      ${dcNeck(s, !jumper)}
      <path d="${sleeves}" fill="${knit || top}"/><path d="${blouse}" fill="${top}"/><path d="${blouse}" fill="url(#dc-${jumper ? 'wool' : 'silk'})"/>
      ${jumper ? `<path d="M45 46V102M55 46V102" stroke="#fff" stroke-opacity=".2" stroke-width="1.2" stroke-dasharray="3.4 1"/>
        <path d="M37.4 104h25.2v6h-25.2zM34.4 103.4l5.2.5v5.1l-5.2-.5zM65.6 103.4l-5.2.5v5.1l5.2-.5z" fill="#000" fill-opacity=".07"/>
        <path d="M44.6 39Q50 43 55.4 39" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="1.6"/>` : ''}
      ${knit ? `<path d="M40.3 39.8Q43.2 38.8 45.3 40.6L46.6 112L37.9 112C38.5 86 38.6 60 40.3 39.8ZM59.7 39.8Q56.8 38.8 54.7 40.6L53.4 112L62.1 112C61.5 86 61.4 60 59.7 39.8Z" fill="${knit}"/>
        <path d="M37.9 108.4h8.6M53.5 108.4h8.6" stroke="#000" stroke-opacity=".1" stroke-width="1.4"/>` : ''}
      ${dcHands(s, jumper ? 111.6 : 113, jumper ? 13 : 12.6)}${dcHead(i, hair)}`, 15);
  }

  const DC_WEAR = { blush: 'ladies', 'dusk rose': 'ladies', 'heather mauve': 'ladies', 'sage mist': 'ladies', 'night sage': 'gents', 'slate eucalyptus': 'gents', 'stone sand': 'gents', 'dusty blue': 'ladies', 'midnight navy': 'gents', burgundy: 'ladies', champagne: 'accent', moonbone: 'accent' };
  // where a colour is shown: palette[].wear, else by its name (a palette saved before wear existed), else by how light it is
  function wearOf(p) {
    if (['ladies', 'gents', 'both', 'accent'].includes(p.wear)) return p.wear;
    return sideOf(p);
  }
  // the one side a colour belongs to by its name or its lightness: where a colour "for both" stands in the lookbook
  // (Blush stays on a dress, Slate Eucalyptus on a suit)
  function sideOf(p) {
    if (DC_WEAR[norm(p.name)]) return DC_WEAR[norm(p.name)];
    const n = parseInt(p.hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
    return l > 0.88 ? 'accent' : (l < 0.5 ? 'gents' : 'ladies');
  }
  // The looks in the round (atelier-core / -body / -cloth / -figure / -stage.js and w/3d/body.json: four guests a day,
  // real bodies (the MakeHuman base mesh, CC0) posed, dressed and drawn on the device; they breathe and look at
  // whoever looks at them, their skirts and long hair are cloth that swings when a guest is turned).
  // The files are fetched only when the chapter comes near, and only where WebGL is available; the stage is
  // set above the day cards, which keep their words (their drawn plates are what a device without WebGL shows).
  // The cards and the stage follow each other: paging the cards changes the stage's day, and the other way round.
  let atelier = null;
  function stage3d(host, days, pal) {
    const looks = $('.dc-looks', host), head = looks && $('.dc-looks__head', looks), book = looks && $('.dc-lookbook', looks);
    if (!looks || !head || !book || !days.length || !window.WebGLRenderingContext) return;
    // can this device draw it? Asked only when the chapter comes near (the question makes a drawing context, which
    // costs a slow phone tens of milliseconds the page's first seconds should not pay); the test context is given back
    const canDraw = () => { try { const c = document.createElement('canvas'), g = c.getContext('webgl') || c.getContext('experimental-webgl'); if (!g) return false; const x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return true; } catch (e) { return false; } };
    const stage = document.createElement('div');
    // The stage has its place on the page from the start (a guest who lands on this chapter saw the page jump when
    // the stage came in over the cards): the same view and the same line under it as the stage itself will have,
    // and the cards without their drawn plates. Should the stage not come after all, the plates are back.
    stage.className = 'dc-stage is-wait'; stage.id = 'dcStage';
    stage.innerHTML = '<div class="dc-stage__view"><p class="dc-stage__wait">The guests are getting dressed&hellip;</p></div><p class="dc-stage__hint">Drag a guest to turn them <span aria-hidden="true">&middot;</span> tap one to step closer</p>';
    looks.classList.add('dc-looks--3d');
    const fail = () => { looks.classList.remove('dc-looks--3d'); stage.remove(); atelier = null; };
    stage.setAttribute('role', 'group'); stage.setAttribute('aria-label', 'The looks in the round: turn a guest with a finger or the arrow keys, or step closer');
    head.after(stage);
    const sideways = () => book.scrollWidth > book.clientWidth + 4;                         // a phone's pager
    const cardOf = (id) => $(`#look-${id}`, book);
    const toCard = (id) => { const c = cardOf(id); if (!c || !sideways()) return; const pad = parseFloat(getComputedStyle(book).scrollPaddingLeft) || 0; book.scrollTo({ left: Math.round(book.scrollLeft + c.getBoundingClientRect().left - book.getBoundingClientRect().left - pad), behavior: 'smooth' }); };
    const mark = (id, names, quiet) => {
      if (!quiet) $$('.dc-look', book).forEach((c) => c.classList.toggle('is-stage', c.id === `look-${id}`));
      const c = cardOf(id), copy = c && $('.dc-copy', c); if (!copy) return;
      let box = $('.dc-wearsbox', copy);
      if (!box) { box = document.createElement('div'); box.className = 'dc-wearsbox'; const tip = $('.dc-tip', copy); if (tip) copy.insertBefore(box, tip); else copy.appendChild(box); }
      box.innerHTML = `<p class="dc-tip__label">On the stage, left to right</p><ol class="dc-wears">${names.map((n, i) => `<li><button type="button" data-stage-look="${i}" data-stage-day="${id}">${esc(n)}</button></li>`).join('')}</ol>`;
    };
    const mount = () => {
      if (!stage.isConnected) return;
      stage.textContent = ''; stage.classList.remove('is-wait');      // (its place was kept: the stage itself takes it)
      try {
        atelier = window.WWAtelier.mount(stage, {
          days: days.map(([id, day]) => ({ id, name: day })), start: 'sat',
          palette: pal.map((p) => ({ name: p.name, hex: p.hex, wear: wearOf(p) })),
          colour: (v) => { const p = pal.find((x) => norm(x.name) === norm(v)); return p ? p.hex : v; },
          onDay: (id, names) => { mark(id, names); if (stage.dataset.by !== 'card') toCard(id); stage.dataset.by = ''; },
          onLost: () => { looks.classList.remove('dc-looks--3d'); stage.hidden = true; },
        });
        // every card lists its four looks from the start (the open day's list follows a colour a guest tries)
        const L = window.WWAtelier.LOOKS; days.forEach(([id]) => { if (id !== atelier.day() && L[id]) mark(id, L[id].map((l) => (l.noun ? `${l.noun} ${String(l.c.main).toLowerCase()}${l.tail || ''}` : l.label)), true); });
      } catch (e) { fail(); }
    };
    const load = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    const start = () => !canDraw() ? fail() : (window.WWAtelier && window.WWAtelier.mount ? Promise.resolve() : ['w/js/atelier-core.js', 'w/js/atelier-body.js', 'w/js/atelier-cloth.js', 'w/js/atelier-figure.js', 'w/js/atelier-stage.js'].reduce((p, src) => p.then(() => load(src)), Promise.resolve()))
      .then(() => window.WWAtelier.loadBody('w/3d/body.json?v=2'))                           // the real bodies the figures are made of (raise v when the file changes: an old copy may be cached; v=2: with the feet)
      .then(mount, fail);
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '1400px 0px' }); io.observe(looks); } else start();
    // the cards lead the stage: the card a phone's pager rests on, a card that is clicked, a line of its list
    let rest = 0;
    book.addEventListener('scroll', () => { clearTimeout(rest); rest = setTimeout(() => {
      if (!atelier || !sideways()) return;
      const mid = book.getBoundingClientRect().left + book.clientWidth / 2;
      const near = $$('.dc-look', book).map((c) => { const r = c.getBoundingClientRect(); return [Math.abs((r.left + r.right) / 2 - mid), c.id.replace('look-', '')]; }).sort((a, b) => a[0] - b[0])[0];
      if (near && near[1] !== atelier.day()) { stage.dataset.by = 'card'; atelier.setDay(near[1]); }
    }, 140); }, { passive: true });
    book.addEventListener('click', (e) => {
      if (!atelier) return;
      const b = e.target.closest('[data-stage-look]'), c = e.target.closest('.dc-look');
      if (b) { atelier.setDay(b.dataset.stageDay, 0); atelier.focus(+b.dataset.stageLook); stage.scrollIntoView({ block: 'center', behavior: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
      else if (c && !sideways()) { stage.dataset.by = 'card'; atelier.setDay(c.id.replace('look-', '')); }
    });
  }
  function renderDress() {
    const host = $('#dressCode'); if (!host) return;
    if (atelier) { try { atelier.destroy(); } catch (e) { /* already gone */ } atelier = null; }
    const dc = CFG.dressCode || {};
    const pal = (CFG.palette || []).filter((p) => p && HEX6.test(p.hex) && String(p.name || '').trim());
    const col = (name, d) => { const p = pal.find((x) => norm(x.name) === norm(name)); return p ? p.hex : d; };
    // a colour for both is in the ladies' row and in the gents' row
    const group = (w) => pal.filter((p) => { const x = wearOf(p); return x === w || (x === 'both' && w !== 'accent'); });
    const ladies = group('ladies'), gents = group('gents'), accents = group('accent');
    // the figures wear a colour for both on the side it belongs to; an accent colour set to both stays in the rows only
    const worn = (list, w) => { const own = list.filter((p) => wearOf(p) === w || sideOf(p) === w); return own.length ? own : list; };
    const names = (list) => joinNames(list.map((p) => p.name));
    const dayDate = (id) => { const d = (CFG.days || []).find((x) => x.id === id); return d && d.date ? dateObj(d.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' }) : ''; };
    const plate = (key, script, label, figs) => `<div class="dc-plate dc-plate--${key}" role="img" aria-label="${esc(label)}">
        <span class="dc-plate__script" aria-hidden="true">${esc(script)}</span><span class="dc-plate__land" aria-hidden="true"></span>
        <span class="dc-figs">${figs.map((f, i) => `<span class="dc-fig" style="--n:${i}">${f}</span>`).join('')}</span></div>`;
    // a look: its plate, then the day, the dress code (h3), the occasion, what to wear and a kind tip
    const look = (id, dayName, d, plateHtml) => `
      <article class="dc-look dc-look--${id}" id="look-${id}" aria-labelledby="dc-${id}">
        ${plateHtml}
        <div class="dc-copy">
          <p class="dc-eyebrow">${esc(dayName)}${dayDate(id) ? ` <span aria-hidden="true">&middot;</span> ${esc(dayDate(id))}` : ''}</p>
          <h3 class="dc-title" id="dc-${id}">${esc(d.title)}</h3>
          ${d.when ? `<p class="dc-when">${esc(d.when)}</p>` : ''}
          ${d.text ? `<p class="dc-text">${esc(d.text)}</p>` : ''}
          ${d.tip ? `<p class="dc-tip"><span class="dc-tip__label">A kind tip</span>${esc(d.tip)}</p>` : ''}
        </div>
      </article>`;

    // Friday: smart casual with a warm layer for the fire pit
    const fri = [
      gownSVG(col('Dusk Rose', '#B48A93'), 0, { long: false, wrap: col('Champagne', '#FBEAD6') }),
      suitSVG(col('Night Sage', '#8E9A92'), 1, { style: 'smart', shirt: col('Moonbone', '#F2EEE9'), trousers: col('Stone Sand', '#D6CBBE'), shoe: '#6A4E3B' }),
      separatesSVG(col('Blush', '#F0C4CB'), 2, { knit: col('Moonbone', '#F2EEE9') }),
      suitSVG(col('Stone Sand', '#D6CBBE'), 3, { style: 'knit', trousers: col('Slate Eucalyptus', '#5A6964'), shoe: '#6A4E3B' })
    ];
    // Saturday: the palette itself, dresses and suits in turn (a phone shows the first four, two of each).
    // A semi-formal Saturday (its title says so) shows what that means: every second dress is tea-length (to the
    // mid-calf: no cocktail dresses, Sophie 2026-11-10), the second suit is worn with an open collar, the third is a
    // jacket with trousers in another shade; a formal one keeps floor-length gowns and a tie on every suit
    const semi = /semi|cocktail/i.test(String((dc.saturday || {}).title || ''));
    const gowns = (ladies.length ? worn(ladies, 'ladies') : [{ name: 'Blush', hex: '#F0C4CB' }]).slice(0, 4);
    const suits = (gents.length ? worn(gents, 'gents') : [{ name: 'Slate Eucalyptus', hex: '#5A6964' }]).slice(0, 3);
    const ties = [col('Blush', '#F0C4CB'), col('Dusk Rose', '#B48A93'), col('Champagne', '#FBEAD6')];
    const squares = [col('Champagne', '#FBEAD6'), col('Moonbone', '#F2EEE9'), col('Blush', '#F0C4CB')];
    const sat = [];
    for (let k = 0; k < Math.max(gowns.length, suits.length); k++) {
      if (gowns[k]) sat.push(gownSVG(gowns[k].hex, k * 2, { long: !(semi && k % 2), tea: true, hair: k % 2 ? 'long' : 'bun' }));
      if (suits[k]) {
        const o = { tie: ties[k % 3], square: squares[k % 3] };
        if (semi && k % 3 === 1) Object.assign(o, { style: 'smart', shirt: col('Moonbone', '#F2EEE9') });
        if (semi && k % 3 === 2 && suits.length > 1) o.trousers = suits[(k + 2) % suits.length].hex;
        sat.push(suitSVG(suits[k].hex, k * 2 + 1, o));
      }
    }
    const satLabel = semi
      ? `Saturday's look: floor-length and tea-length dresses in ${names(gowns)}, and suits and smart jackets in ${names(suits)}, with a tie or an open collar (a jacket is not needed).`
      : `Saturday's look: floor-length gowns in ${names(gowns)}, and suits in ${names(suits)}.`;
    // Sunday: soft knits and denim
    const sun = [
      separatesSVG(col('Champagne', '#FBEAD6'), 1, { jumper: true }),
      suitSVG(col('Sage Mist', '#B9C4BD'), 2, { style: 'knit', trousers: DC_DENIM, shoe: '#6A4E3B' }),
      gownSVG(col('Heather Mauve', '#9E7F8E'), 3, { long: false, wrap: col('Moonbone', '#F2EEE9'), hair: 'long' })
    ];
    const days = [
      ['fri', 'Friday', dc.friday, () => plate('fri', 'Friday', "Friday's look: a midi dress with a warm wrap, an open jacket over a collared shirt with chinos, a pretty blouse with smart jeans and a cardigan, and a knit with trousers.", fri)],
      ['sat', 'Saturday', dc.saturday, () => plate('sat', 'Saturday', satLabel, sat)],
      ['sun', 'Sunday', dc.sunday, () => plate('sun', 'Sunday', "Sunday's look: a soft knit with jeans, a jumper with jeans, and a midi dress with a light wrap.", sun)]
    ].filter(([, , d]) => d && d.title);

    // the swatch book: a silk swatch per colour, its name under it; four across at most (--n columns, --i the place
    // in its row, from which it fans out); accents and the bride share a row while the accents are one or two
    // (a row holds four at most; five or more share the rows evenly: five = three, then two. Each swatch knows
    // its place in its own row, --i of --n, for the fan)
    const perRow = (len) => Math.ceil(len / Math.ceil(len / 4));
    const swatch = (p, i, list) => {
      const n = perRow(list.length), inRow = Math.min(n, list.length - Math.floor(i / n) * n);
      return `<li class="dc-sw" style="--c:${p.hex};--i:${i % n};--n:${inRow}"><span class="dc-sw__fab" aria-hidden="true"></span><span class="dc-sw__name">${esc(p.name)}</span></li>`;
    };
    const sgroup = (key, title, text, list) => list.length ? `<div class="dc-group dc-group--${key}" data-rv="group">
        <h4 class="dc-group__title">${title}</h4>
        <ul class="dc-sws" style="--n:${perRow(list.length)}">${list.map(swatch).join('')}</ul>
        ${text ? `<p class="dc-group__text">${esc(text)}</p>` : ''}</div>` : '';
    const bride = `<div class="dc-group dc-group--bride" data-rv="group">
        <h4 class="dc-group__title">For the bride</h4>
        <ul class="dc-sws" style="--n:1"><li class="dc-sw dc-sw--bride" style="--i:0"><span class="dc-sw__fab" aria-hidden="true"><span class="dc-sw__mark">reserved</span></span><span class="dc-sw__name">White &amp; Ivory</span></li></ul>
        <p class="dc-group__text">${esc(dc.bride || 'Kindly leave white and ivory to the bride.')}</p></div>`;

    host.innerHTML = `
      ${days.length ? `<div class="dc-looks">
        <div class="ch-col dc-looks__head">
          <p class="dc-looks__t">The looks</p>
          <nav class="dc-chips" aria-label="The looks, day by day">${days.map(([id, day]) => `<a class="chip dc-chip" href="#look-${id}">${day.slice(0, 3)}<span class="dc-chip__more">${day.slice(3)}</span></a>`).join('')}</nav>
        </div>
        <div class="snap-wrap dc-lookwrap" data-snap-wrap data-rv="group">
          <div class="dc-lookbook" data-snap tabindex="0" role="group" aria-label="The looks: ${days.length} plates, one for each day">
            ${days.map(([id, day, d, plateFn]) => look(id, day, d, plateFn())).join('')}
          </div>
          ${days.length > 1 ? `<div class="dc-pager"><button type="button" data-snap-prev aria-label="The look before"><span aria-hidden="true">&lsaquo;</span></button><span data-snap-count aria-live="polite">1 of ${days.length}</span><button type="button" data-snap-next aria-label="The next look"><span aria-hidden="true">&rsaquo;</span></button></div>` : ''}
        </div>
      </div>` : ''}

      ${pal.length ? `<section class="dc-palette" aria-labelledby="dcPaletteTitle">
        <div class="ch-col dc-palette__head">
          <h3 class="dc-h" id="dcPaletteTitle">Saturday&rsquo;s palette</h3>
          ${dc.paletteText ? `<p class="dc-palette__sub">${esc(dc.paletteText)}</p>` : ''}
        </div>
        <div class="ch-col dc-bookcol"><div class="dc-book${ladies.length && gents.length ? ' dc-book--spread' : ''}">
          <span class="orn" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
          ${sgroup('ladies', 'For the ladies', dc.ladies, ladies)}${sgroup('gents', 'For the gents', dc.gents, gents)}
          ${accents.length > 2 ? sgroup('accent', 'As accents', dc.note, accents) + bride : `<div class="dc-pair">${sgroup('accent', 'As accents', dc.note, accents)}${bride}</div>`}
        </div></div>
      </section>` : ''}`;
    stage3d(host, days, pal);
    // the lookbook opens on the wedding day (phones page it sideways; wide screens show the three side by side)
    requestAnimationFrame(() => {
      const sc = $('.dc-lookbook', host), sat = $('#look-sat', host);
      if (!sc || !sat || sc.scrollWidth <= sc.clientWidth + 4) return;
      const pad = parseFloat(getComputedStyle(sc).scrollPaddingLeft) || 0;
      const left = Math.round(sc.scrollLeft + sat.getBoundingClientRect().left - sc.getBoundingClientRect().left - pad);
      try { sc.scrollTo({ left, behavior: 'instant' }); } catch (e) { sc.scrollLeft = left; }
    });
  }

  /* ---------------- Gallery: the photos on the page, the viewer and (for a big set) a full-screen gallery ----------------
     photos.gallery entries: { src (small picture), mid (middle picture), full (viewer picture), w, h (the full
     picture's size), caption }; src alone works too (a photo uploaded on the admin page). A file name that ends in
     -<number> says the picture's long side in pixels (-640, -1080): from that a tile offers the browser both sizes.
     A small set (GALLERY_WALL photos or fewer) is a wall: every photo is on the page (VII), in justified rows of
     printed photos, and each one opens the viewer. A bigger set shows a preview instead: at most 9 photos on phones
     and 12 from 600px wide, and from 1100px (where the wall is wider than the column) three whole rows of up to 24;
     whole rows only, the last photo darkened as "+N · See all" (it opens the full gallery). Either way the rows are
     worked out from the photos' ratios and the column's width: no photo is ever shown, measured and hidden again
     under a guest who is reading (scroll anchoring would move the page). The gallery and the viewer are dialogs of
     their own (independent of the page): the browser's Back button and Esc close the top one. */
  const GALLERY_WALL = 30;           // up to this many photos, the page shows every one of them
  const GALLERY_PREVIEW = 12;
  const GALLERY_PREVIEW_PHONE = 9;
  const GALLERY_PREVIEW_WIDE = 24;   // the most the wide preview draws from; it shows GALLERY_ROWS_WIDE whole rows
  const GALLERY_ROWS_WIDE = 3;
  const GALLERY_BATCH = 48;
  const GAL = { list: [], i: 0, shown: 0, layers: [], from: null, io: null };
  const galList = () => (CFG.photos.gallery || []).filter((p) => p && p.src);
  const galRatio = (p) => (p.w > 0 && p.h > 0 ? +(p.w / p.h).toFixed(4) : 1);
  const galAlt = (p) => p.caption || `James and Sophie ${/bumping-cars/.test(p.src) ? 'together' : 'and their guests'}`;
  // how wide a picture is, from its name ("...-640.webp" is 640px on its long side); 0 when the name does not say
  const galWide = (url, p) => {
    const m = /-(\d{3,4})\.(?:webp|avif|jpe?g|png)$/i.exec(url || '');
    return m && p.w > 0 && p.h > 0 ? Math.round(+m[1] * Math.min(1, p.w / p.h)) : 0;
  };
  // the pictures a tile may draw, by width: the small and the middle one (nothing for a photo that is a src alone)
  function galSet(p) {
    const a = galWide(p.src, p), b = galWide(p.mid, p);
    return a && b > a && !/[\s,]/.test(p.src + p.mid) ? `${p.src} ${a}w, ${p.mid} ${b}w` : '';
  }
  // about how wide a tile is drawn (its ratio x its row's height); the wall then sets the exact width (galRows)
  const galSizes = (p) => {
    const a = galRatio(p);
    return `(min-width: 1000px) ${Math.round(a * 300)}px, (min-width: 600px) ${Math.round(a * 235)}px, ${Math.round(a * 170)}px`;
  };
  // preview: a tile on the page (printed into the paper, revealed as it comes into view); else one in the full gallery
  function galTile(p, i, preview) {
    const label = `${galAlt(p)}, photo ${i + 1} of ${GAL.list.length}`;
    const set = galSet(p);
    return `<button class="gx-tile${preview ? ' print' : ''}" type="button" data-gx="${i}"${preview ? ` data-rv="ink" data-label="${esc(label)}"` : ''} style="--ar:${galRatio(p)}" aria-label="${esc(label)}">`
      + `<img${set ? ` srcset="${esc(set)}" sizes="${galSizes(p)}"` : ''} src="${esc(p.src)}" alt="" width="${+p.w || 4}" height="${+p.h || 3}" loading="lazy" decoding="async"></button>`;
  }
  function renderGallery() {
    GAL.list = galList();
    const n = GAL.list.length;
    const wall = n <= GALLERY_WALL;
    const box = $('#galleryPreview');
    box.classList.toggle('is-wall', wall);
    box.innerHTML = GAL.list.slice(0, wall ? n : GALLERY_PREVIEW_WIDE).map((p, i) => galTile(p, i, true)).join('') || '<p class="gx-soon">Photos coming soon.</p>';
    const all = $('#galleryAll');
    all.textContent = `See all ${n} photos`;
    all.hidden = wall || !n;
    if ($('#gx') && $('#gx').open) galFill(true);
    // the rows are worked out once the browser has laid the photos out: a ResizeObserver reports after layout and
    // before the frame is painted, so nothing is measured in the middle of the render and no frame shows the photos
    // before their rows are set (observing afresh always reports); then again whenever the column's width changes
    GAL.trim = '';
    if ('ResizeObserver' in window) {
      if (!GAL.ro) GAL.ro = new ResizeObserver(() => galLay());
      GAL.ro.unobserve(box);
      GAL.ro.observe(box);
    } else requestAnimationFrame(galLay);
  }
  const galLay = () => { const box = $('#galleryPreview'); if (box) (box.classList.contains('is-wall') ? galRows : galTrim)(); };
  // The wall's rows. The photos keep their order; where the rows break is chosen so that every row's height stays as
  // close as it can to a target (about 28% of the wall's width, more on a phone: there a pair of portraits or one
  // landscape makes a row, on a desktop four or five photos do). Each tile then carries its row's height as --rh (a
  // pixel under, so that the row is sure to fit): flex-wrap (gallery.css) breaks exactly there and the tiles grow to
  // fill the width. A last row that would come out far too tall (a wall of one or two photos on a wide screen)
  // keeps a sane height and sits in the middle instead. Every picture is told how wide its tile is (sizes), so the
  // browser fetches the small or the middle picture, whichever the tile and the screen need.
  function galRows() {
    const box = $('#galleryPreview');
    const tiles = box ? $$('.gx-tile', box) : [];
    const W = box ? box.getBoundingClientRect().width : 0;
    if (!tiles.length || W < 60) return;   // not laid out (the dashboard view): the observer comes back with a width
    const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
    const key = `wall/${tiles.length}/${W.toFixed(1)}/${gap}`;
    if (key === GAL.trim) return;
    GAL.trim = key;
    const n = tiles.length;
    const ar = tiles.map((t, k) => galRatio(GAL.list[k]));
    const target = Math.min(0.58 * W, Math.max(250, 0.275 * W));
    const tall = target * 1.75;
    // best[i]: the least cost of the first i photos set in rows (a row costs the square of ln(its height / target));
    // cut[i]: where the last of those rows starts
    const best = [0], cut = [0];
    for (let i = 1; i <= n; i++) {
      best[i] = Infinity; cut[i] = i - 1;
      let sum = 0;
      for (let j = i - 1; j >= 0; j--) {
        sum += ar[j];
        const h = (W - (i - j - 1) * gap) / sum;
        if (h < target * 0.45 && i - j > 1) break;   // (a longer row only gets lower)
        const d = Math.log(h / target), c = best[j] + d * d;
        if (c < best[i]) { best[i] = c; cut[i] = j; }
      }
    }
    for (let i = n, last = true; i > 0; i = cut[i], last = false) {
      const j = cut[i];
      let sum = 0;
      for (let k = j; k < i; k++) sum += ar[k];
      const full = (W - (i - j - 1) * gap) / sum;
      const loose = last && full > tall;
      const h = loose ? tall : full;
      for (let k = j; k < i; k++) {
        const t = tiles[k], img = t.firstElementChild;
        t.style.setProperty('--rh', `${(loose ? h : h - 1).toFixed(2)}px`);
        t.classList.toggle('is-loose', loose);
        const sizes = `${Math.ceil(ar[k] * h)}px`;
        if (img && img.srcset && img.sizes !== sizes) img.sizes = sizes;
      }
    }
  }
  // The preview's rows, worked out as flex-wrap lays them out (gallery.css: every tile is its ratio x --rh wide, the
  // gaps --gap; a row ends where the next photo no longer fits, then grows to the column's width). The rows within
  // the count (9 on phones, 12 from 600px; from 1100px the first three rows, whatever they hold) are shown; a last
  // row shorter than two thirds of the column is left out (it would grow far taller than the others). The last
  // photo shown becomes "+N · See all". Only what changes is touched, so a width that keeps the rows changes nothing.
  function galTrim() {
    const box = $('#galleryPreview');
    const tiles = box ? $$('.gx-tile', box) : [];
    const W = box ? box.getBoundingClientRect().width : 0;
    if (!tiles.length || W < 60) return;   // not laid out (the dashboard view): the observer comes back with a width
    const cs = getComputedStyle(box);
    const rh = parseFloat(cs.getPropertyValue('--rh')) || 120;
    const gap = parseFloat(cs.columnGap) || 0;
    const mq = (q) => !!window.matchMedia && matchMedia(q).matches;
    const wide = mq('(min-width: 1100px)');
    const most = Math.min(tiles.length, wide ? GALLERY_PREVIEW_WIDE : mq('(min-width: 600px)') ? GALLERY_PREVIEW : GALLERY_PREVIEW_PHONE);
    const rows = [];
    let row = 0, used = 0;
    for (let k = 0; k < most; k++) {
      const w = Math.min(W, galRatio(GAL.list[k]) * rh);
      if (row && used + gap + w > W + 0.01) {
        rows.push({ n: row, used }); row = 0; used = 0;
        if (wide && rows.length === GALLERY_ROWS_WIDE) break;
      }
      used += (row ? gap : 0) + w;
      row++;
    }
    if (row) rows.push({ n: row, used });
    if (rows.length > 1 && rows[rows.length - 1].used < W * 2 / 3) rows.pop();
    const shown = rows.reduce((s, r) => s + r.n, 0);
    const more = GAL.list.length - shown;
    const key = `${shown}/${more}`;
    if (key === GAL.trim) return;
    GAL.trim = key;
    const all = $('#galleryAll');
    if (all) all.hidden = more <= 0;
    tiles.forEach((t, k) => {
      if (t.hidden !== (k >= shown)) t.hidden = k >= shown;
      const last = more > 0 && k === shown - 1;
      if (t.classList.contains('is-more') === last) return;
      t.classList.toggle('is-more', last);
      const tag = $('.gx-more', t);
      if (tag) tag.remove();
      // (its words are its name: "+48 See all 60 photos")
      if (last) {
        t.insertAdjacentHTML('beforeend', `<span class="gx-more"><b>+${more}</b> <span>See all</span><span class="vh"> ${GAL.list.length} photos</span></span>`);
        t.removeAttribute('aria-label');
      } else t.setAttribute('aria-label', t.dataset.label || '');
    });
  }
  // the dialogs, built once
  function galUI() {
    if ($('#gx')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <dialog class="gx" id="gx" aria-labelledby="gxTitle">
        <div class="gx-bar"><div class="gx-head"><p class="eyebrow">Our engagement shoot</p><h2 id="gxTitle">All our photos</h2></div>
          <button class="gx-close" type="button" data-gx-close aria-label="Close the gallery">${svg('chev-left')}<span>Back</span></button></div>
        <div class="gx-body" id="gxBody"></div><div class="gx-end" id="gxEnd"></div>
      </dialog>
      <dialog class="gv" id="gv" aria-label="Photo viewer">
        <figure class="gv-fig" id="gvFig"><img class="gv-low" id="gvLow" alt=""><img class="gv-img" id="gvImg" alt=""></figure>
        <p class="gv-meta" aria-live="polite"><span id="gvCount"></span><span id="gvCap"></span></p>
        <button class="gv-btn gv-close" type="button" data-gv="close" aria-label="Close the photo">×</button>
        <button class="gv-btn gv-prev" type="button" data-gv="prev" aria-label="Previous photo">${svg('chev-left')}</button>
        <button class="gv-btn gv-next" type="button" data-gv="next" aria-label="Next photo">${svg('chev-right')}</button>
      </dialog>`);
    const gx = $('#gx'), gv = $('#gv');
    [gx, gv].forEach((d) => d.addEventListener('cancel', (e) => { e.preventDefault(); galBack(d.id); }));
    gx.addEventListener('scroll', galMore, { passive: true });
    gv.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); gvShow(GAL.i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); gvShow(GAL.i - 1); }
      else if (e.key === 'Home') { e.preventDefault(); gvShow(0); }
      else if (e.key === 'End') { e.preventDefault(); gvShow(GAL.list.length - 1); }
    });
    // swipe left / right (vertical pans and pinch-zoom stay with the browser)
    let sx = 0, sy = 0, down = false;
    const fig = $('#gvFig');
    fig.addEventListener('pointerdown', (e) => { down = true; sx = e.clientX; sy = e.clientY; });
    fig.addEventListener('pointercancel', () => { down = false; });
    fig.addEventListener('pointerup', (e) => {
      if (!down) return; down = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) gvShow(GAL.i + (dx < 0 ? 1 : -1));
    });
    $('#gvImg').addEventListener('load', () => $('#gvImg').classList.add('is-in'));
    window.addEventListener('popstate', () => { const top = GAL.layers.pop(); if (top) galClose(top); });
  }
  // every photo, rendered in batches as the gallery is scrolled
  function galFill(reset) {
    const body = $('#gxBody');
    if (reset || !body.firstElementChild) { body.innerHTML = '<div class="gx-grid"></div>'; GAL.shown = 0; }
    const end = Math.min(GAL.list.length, GAL.shown + GALLERY_BATCH);
    let html = '';
    for (let i = GAL.shown; i < end; i++) html += galTile(GAL.list[i], i);
    body.firstElementChild.insertAdjacentHTML('beforeend', html);
    GAL.shown = end;
  }
  function galMore() {
    const gx = $('#gx');
    if (GAL.shown < GAL.list.length && gx.scrollTop + gx.clientHeight > gx.scrollHeight - gx.clientHeight * 1.5) galFill(false);
  }
  const galLock = () => { document.documentElement.classList.toggle('gx-lock', GAL.layers.length > 0); };
  function galPush(id) { GAL.layers.push(id); try { history.pushState({ wwGallery: id }, ''); } catch (e) { /* no history: Esc and the buttons still close */ } galLock(); }
  // a close from the page (button, Esc): through history, so Back and the button agree; popstate closes the dialog
  function galBack(id) { if (GAL.layers[GAL.layers.length - 1] === id) history.back(); else galClose(id); }
  function galClose(id) {
    const d = $('#' + id);
    const i = GAL.layers.indexOf(id); if (i > -1) GAL.layers.splice(i, 1);
    if (d && d.open) d.close();
    galLock();
    if (id === 'gv') {
      // back to the photo that is now on screen, in the full gallery when it is open
      const gx = $('#gx');
      if (gx && gx.open) {
        while (GAL.shown <= GAL.i && GAL.shown < GAL.list.length) galFill(false);
        const t = gx.querySelector(`[data-gx="${GAL.i}"]`); if (t) { t.scrollIntoView({ block: 'nearest' }); t.focus({ preventScroll: true }); }
      } else if (GAL.from && GAL.from.isConnected) GAL.from.focus({ preventScroll: true });
    } else if (id === 'gx') {
      const b = GAL.gxFrom && GAL.gxFrom.isConnected && !GAL.gxFrom.hidden ? GAL.gxFrom : $('#galleryAll');
      if (b) b.focus({ preventScroll: true });
    }
  }
  // from: what opened it (the focus goes back there when it closes)
  function galOpenAll(from) {
    galUI();
    const gx = $('#gx');
    if (gx.open) return;
    GAL.gxFrom = from || null;
    $('#gxTitle').textContent = `All ${GAL.list.length} photos`;
    galFill(true);
    gx.showModal(); gx.scrollTop = 0; galPush('gx');
    galMore();
  }
  function gvOpen(i, from) {
    galUI();
    GAL.from = from || null;
    const gv = $('#gv');
    gvShow(i);
    if (!gv.open) { gv.showModal(); galPush('gv'); }
    const next = $('.gv-next'); if (next) next.focus({ preventScroll: true });
  }
  function gvShow(i) {
    const L = GAL.list; if (!L.length) return;
    GAL.i = (i + L.length) % L.length;
    const p = L[GAL.i], img = $('#gvImg'), low = $('#gvLow');
    // under the full picture while it loads: the picture the photo's tile already shows
    const tile = $(`.gx-tile[data-gx="${GAL.i}"] img`);
    low.src = (tile && tile.currentSrc) || p.src;
    img.classList.remove('is-in');
    img.alt = galAlt(p);
    img.src = p.full || p.src;
    if (img.complete && img.naturalWidth) img.classList.add('is-in');
    $('#gvCount').textContent = `${GAL.i + 1} / ${L.length}`;
    $('#gvCap').textContent = p.caption || '';
    // the next and the previous photo are fetched ahead
    [1, -1].forEach((d) => { const q = L[(GAL.i + d + L.length) % L.length]; if (q) { const im = new Image(); im.decoding = 'async'; im.src = q.full || q.src; } });
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-gx],[data-gx-open],[data-gx-close],[data-gv]');
    if (!t) return;
    if (t.dataset.gx !== undefined) { e.preventDefault(); if (t.classList.contains('is-more')) galOpenAll(t); else gvOpen(+t.dataset.gx, t); }
    else if (t.hasAttribute('data-gx-open')) galOpenAll(t);
    else if (t.hasAttribute('data-gx-close')) galBack('gx');
    else if (t.dataset.gv === 'close') galBack('gv');
    else if (t.dataset.gv === 'next') gvShow(GAL.i + 1);
    else if (t.dataset.gv === 'prev') gvShow(GAL.i - 1);
  });
  let lbList = [], lbIdx = 0;
  function lightboxList(key) {
    if (key === 'venue') return CFG.photos.venue;
    if (key === 'gallery') return CFG.photos.gallery;
    if (key === 'highlights') return (CFG.photos.highlights || []).filter((p) => p && p.src);
    const m = key.match(/^nearby-(\d+)$/);
    if (m) { const n = CFG.nearby[+m[1]]; return (n.photos || []).filter((p) => p && p.src).slice(0, MAX_NEARBY_PHOTOS).map((p) => ({ src: p.src, caption: p.caption || n.name })); }
    return [];
  }
  function openLightbox(list, idx) { lbList = list; lbIdx = idx; showLb(); $('#lightbox').hidden = false; document.body.style.overflow = 'hidden'; $('.lb-close').focus(); }
  function showLb() { const p = lbList[lbIdx]; if (!p) return; $('#lbImg').src = p.src; $('#lbImg').alt = p.caption || ''; $('#lbCap').textContent = p.caption || ''; }
  function closeLb() { $('#lightbox').hidden = true; document.body.style.overflow = ''; }

  /* ---------------- Calendar (.ics) ---------------- */
  function eventTimes(e) {
    if (!e.start) return null;
    const start = new Date(`${e.date}T${e.start}:00${TZ_OFFSET}`);
    let end;
    if (/^\d{1,2}:\d{2}$/.test(e.end || '')) { end = new Date(`${e.date}T${e.end}:00${TZ_OFFSET}`); if (end <= start) end = new Date(end.getTime() + 864e5); }
    else if (String(e.end).toLowerCase() === 'late') end = new Date(`${e.date}T23:59:00${TZ_OFFSET}`);
    else end = new Date(start.getTime() + 2 * 36e5);
    return { start, end };
  }
  const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  function downloadICS(events, filename) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Smith Wedding//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsText(CFG.couple.title)];
    const stamp = icsDate(new Date());
    events.forEach((e) => {
      const t = eventTimes(e); if (!t) return;
      lines.push('BEGIN:VEVENT', `UID:${e.id}-${e.date}@smith-wedding`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(t.start)}`, `DTEND:${icsDate(t.end)}`,
        `SUMMARY:${icsText(CFG.couple.title + ': ' + e.title)}`, `LOCATION:${icsText(e.location ? e.location + ', ' + CFG.wedding.town : CFG.wedding.venue + ', ' + CFG.wedding.town)}`,
        `DESCRIPTION:${icsText(e.desc || '')}`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename || 'smith-wedding.ics';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Calendar file downloaded');
  }

  /* =====================================================================
     RSVP (3 steps: 1 Your reply · 2 Menu & dietary · 3 Song & details)
     The invitation (a household) comes from the server: found by full name (with the invitation code) or by
     its own code (the personal link). Replies are saved on the server, where the couple's dashboard (/admin)
     sees them too: attendance per event, where guests stay (a room on the estate: nights + people), the dinner
     choice per guest, dietary needs, the song, contact details and a note.
     IX (index.html region "rsvp", s-reply.css): one reply card on the moonbone table, in one of its states: the
     lookup (#rsvpLookup), a household's own code opening (#rsvpWait), the steps (#rsvpForm, its Back / Next in a
     sticky .step-nav), the thank-you (#rsvpThanks, sealed: .reply-seal) or closed (#rsvpDeadlineNotice). The
     chapter's answer line names the deadline, once. A household's own code opens its invitation when IX comes
     near (WW.onNear) or at once on #rsvp; a sent reply marks this device (localStorage ww_replied, html.has-replied).
     ===================================================================== */
  let party = null;     // the invitation from the server (POST /api/rsvp/find, v3)
  let lookup = null;    // how it was found ({name} | {code}): its reply token lasts 2 hours, then it is found again
  let R = null;         // the reply being edited
  let step = 1;
  let finding = false;
  const ON_FILE = 'Already noted. Leave this blank to keep it, or type to change it.';
  const PAUSED = 'Replies are paused for now. Please message James or Sophie directly.';
  const AMBIGUOUS = 'That name is on more than one invitation. Please use the personal code from your invitation link (below), or message James or Sophie.';
  const STAY_IDS = ['estate', 'nearby', 'day', 'unsure'];
  const ROOM_NIGHTS = [{ id: 'fri', label: 'Friday' }, { id: 'sat', label: 'Saturday' }, { id: 'sun', label: 'Sunday' }];
  // the guest is at IX (its hash) or it has come near (story.js presence): a household's own code may open
  const rsvpNear = () => location.hash === '#rsvp' || !!(window.WW && typeof WW.isNear === 'function' && WW.isNear('rsvp'));
  // closed: the server says so (live.open), or the deadline has passed on the clock the whole page follows
  // (motion.js WWPhase, which honours ?now= and allow_late), so IX agrees with the hero, the header and Contents
  const rsvpClosed = () => {
    if (CFG.live && CFG.live.open === false) return true;
    const P = window.WWPhase;
    try { return !!(P && typeof P.compute === 'function' && P.compute(CFG).rsvpOpen === false); } catch (e) { return false; }
  };
  // the server has turned a reply away for good (the deadline, no late replies: a 403): Send no longer invites a resend
  // that is sure to fail. Paused, it stays on (once the couple resumes, a resend goes through)
  const sendShut = () => !!(CFG.live && CFG.live.open === false && CFG.live.closed_reason !== 'paused');
  const rpStill = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // the page to el's top under the header (its scroll-margin-top, where WW.jump lands it) unless that is in view
  function rpScroll(el) {
    if (!el || !el.getClientRects().length) return;
    const top = el.getBoundingClientRect().top;
    const m = parseFloat(getComputedStyle(el).scrollMarginTop) || 64;
    if (top >= m - 2 && top <= window.innerHeight * 0.45) return;
    try { window.scrollTo({ top: Math.max(0, Math.round(top + window.scrollY - m)), behavior: rpStill() ? 'auto' : 'smooth' }); }
    catch (e) { window.scrollTo(0, Math.max(0, Math.round(top + window.scrollY - m))); }
  }
  // the focus to a state's heading (it is not a control: tabindex -1, no scroll)
  function rpFocus(sel) {
    const h = $(sel);
    if (!h) return;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    try { h.focus({ preventScroll: true }); } catch (e) { /* focus is a courtesy */ }
  }
  // A field or button that takes the focus is never left under the sticky Back / Next: the browser's own focus
  // scroll keeps its scroll-margin clear (s-reply.css), but a textarea only brings its caret into view; after that
  // scroll, whatever is still covered moves up (never under the header)
  const rpFormEl = $('#rsvpForm');
  if (rpFormEl) rpFormEl.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el || !el.matches || !el.matches('input, select, textarea, button, a[href]') || el.closest('.step-nav')) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const nav = $('.step-nav', rpFormEl);
      if (!nav || document.activeElement !== el) return;
      const box = (el.closest('label') || el).getBoundingClientRect(), n = nav.getBoundingClientRect();
      if (box.bottom <= n.top - 8 || box.top >= n.bottom) return;
      const hdr = $('#siteHeader'), top = hdr ? hdr.getBoundingClientRect().bottom + 8 : 64;
      const dy = Math.min(box.bottom - n.top + 16, box.top - top);
      if (dy > 0) window.scrollBy({ top: Math.round(dy), behavior: 'instant' });
    }));
  });
  const askStay = () => CFG.rsvp.askStay !== false && Array.isArray(CFG.rsvp.stayOptions) && CFG.rsvp.stayOptions.some((o) => o && STAY_IDS.includes(o.id));
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const solo = () => !!R && R.people.length === 1;
  const fullName = (p) => (p.plus ? (p.plusName.trim() || 'Your guest') : `${p.first} ${p.surname}`.trim());
  const shortName = (p) => (p.plus ? firstName(p.plusName) || 'your guest' : p.first);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const roomNights = () => {
    const r = CFG.rsvp.rooms || {};
    const list = Array.isArray(r.nights) && r.nights.length ? r.nights : ROOM_NIGHTS;
    return list.filter((n) => n && ROOM_NIGHTS.some((x) => x.id === n.id));
  };

  // Does this person choose a dinner? (attending + at the wedding event the menu belongs to)
  function needsMenu(p) {
    if (!p.attending || !choiceCourses().length) return false;
    const wid = CFG.weddingEventId;
    const hasWeddingEvent = rsvpEvents().some((e) => e.id === wid);
    return hasWeddingEvent ? !!(p.events && p.events[wid]) : true;
  }
  // A plus one comes with their host: when the host (or, with nobody named as host, everyone else on the
  // invitation) can't make it, the plus one is declined too. The server applies the same rule.
  function plusOneLockedBy(p) {
    if (!p.plus) return null;
    const host = p.hostRef != null ? R.people.find((x) => x.ref === p.hostRef && !x.plus) : null;
    if (host) return host.attending === false ? [host] : null;
    const others = R.people.filter((x) => !x.plus);
    return others.length && others.every((x) => x.attending === false) ? others : null;
  }
  function applyPlusOneRule() { R.people.forEach((p) => { if (plusOneLockedBy(p)) p.attending = false; }); }
  function lockNote(p, by) {
    const because = by.length === 1 ? `${by[0].first} can't make it` : 'nobody else on your invitation can make it';
    return `Because ${because}, ${p.plusName.trim() ? `${firstName(p.plusName)}'s reply` : 'the plus one'} is set to declined too.`;
  }

  // IX's answer line: rsvp.intro with the deadline in bold (the only place in IX that names it), and while replies
  // are open, that a reply can be changed until then
  function rsvpLede(closed) {
    const dl = CFG.rsvp.deadline && dayParts(CFG.rsvp.deadline) ? fmtLong(CFG.rsvp.deadline) : '';
    const intro = String(CFG.rsvp.intro || '').trim();
    const strong = `<strong>${esc(dl || 'the deadline')}</strong>`;
    let html = intro.includes('{deadline}') ? intro.split('{deadline}').map(esc).join(strong) : esc(intro);
    // (an intro written without {deadline} still says it once, unless it names the day itself)
    const d = dayParts(CFG.rsvp.deadline);
    if (dl && !intro.includes('{deadline}') && !(d && intro.includes(`${d.d} ${d.mo}`))) html += `${html ? ' ' : ''}Kindly reply by ${strong}.`;
    if (dl && !closed) html += ' You can change your reply until then.';
    return html;
  }
  function renderRsvpShell() {
    if (!CFG) return;
    const closed = rsvpClosed();
    const lede = $('#rsvp .ch-lede');
    if (lede) lede.innerHTML = rsvpLede(closed);
    const paused = !!(CFG.live && CFG.live.closed_reason === 'paused');
    const note = $('#rsvpDeadlineNotice');
    note.innerHTML = closed ? `<h3 class="rp-h">${paused ? 'Replies are paused' : 'Replies have closed'}</h3>
      <p>${esc(paused ? PAUSED : CFG.rsvp.closedText || 'Our RSVP deadline has passed. If you still need to let us know something, please contact James or Sophie directly.')}</p>` : '';
    note.hidden = !closed;
    // a reply can no longer be changed once replies have closed (the thank-you keeps what was sent)
    $$('#rsvpThanks [data-action="rsvp-edit"]').forEach((b) => { b.hidden = closed; });
    // the household's own code (its personal link, or typed at the gate) opens its invitation once IX is near;
    // until then the card says that it will (no lookup to fill in)
    const own = !closed && !party && !sstore.get(SS_MANUAL) && store.get(LS_KIND) === 'party' ? store.get(LS_CODE) : '';
    $('#rsvpLookup').hidden = closed || !!party || !!own || finding;
    const wait = $('#rsvpWait');
    if (wait) wait.hidden = !own;
    if (own && !finding && rsvpNear()) openParty({ code: own });
  }
  // IX coming near (story.js presence) opens a household's own invitation (renderRsvpShell decides)
  if (window.WW && typeof WW.onNear === 'function') WW.onNear('rsvp', () => renderRsvpShell());

  // POST /api/rsvp/find -> the invitation | null (throws for "ambiguous", throttling, a dead invite token, offline)
  async function findParty(q) {
    const r = await api('/api/rsvp/find', { method: 'POST', body: Object.assign({ v: 3 }, q) });
    if (!r.party && r.ambiguous) throw new ApiError(AMBIGUOUS, 200, { ambiguous: true });
    return r.party || null;
  }
  async function openParty(q) {
    if (finding) return;
    finding = true;
    const msg = $('#lookupMsg');
    // typed in the lookup (the guest is there: the household's form takes the focus), or the household's own code
    // opening by itself (the card's wait line shows meanwhile)
    const typed = !$('#rsvpLookup').hidden;
    const wait = $('#rsvpWait');
    if (!typed && wait) wait.hidden = false;
    msg.className = 'form-msg'; msg.textContent = typed ? 'Looking for your invitation...' : '';
    try {
      const found = await findParty(q);
      if (!found) {
        msg.className = 'form-msg error';
        msg.textContent = q.code ? 'We could not find an invitation with that code. Please check it, or find your invitation by your full name.'
          : (CFG.rsvp.notFound || "We couldn't find that name on our guest list. Please use your full name as it appears on your invitation.");
        if (q.code) { sstore.set(SS_MANUAL, '1'); $('#rsvpLookup').hidden = false; }
        return;
      }
      msg.textContent = '';
      party = found; lookup = q;
      if (found.open === false) {
        CFG.live = Object.assign({}, CFG.live, { open: false, closed_reason: found.closed_reason });
        renderRsvpShell();
        return;
      }
      startRsvp({ user: typed });
    } catch (e) {
      if (e.status === 401) { msg.textContent = ''; forgetInvite(); showGate(true, GATE_MSG.again); return; }
      msg.className = 'form-msg error';
      msg.textContent = e.message;
      $('#rsvpLookup').hidden = false;
      if (e.data && e.data.ambiguous) showCodeBox();
    } finally {
      finding = false;
      if (wait) wait.hidden = true;
    }
  }
  function showCodeBox() {
    const box = $('#lookupCodeBox');
    if (!box) return;
    box.hidden = false;
    const b = $('#rsvpLookup [data-action="rsvp-use-code"]');
    if (b) b.setAttribute('aria-expanded', 'true');
    setTimeout(() => { const i = $('#lookupCode'); if (i) i.focus(); }, 30);
  }
  function lookupByName() {
    const name = $('#lookupName').value.trim();
    const msg = $('#lookupMsg');
    if (name.split(/\s+/).filter(Boolean).length < 2) {
      msg.className = 'form-msg error';
      msg.textContent = 'Please type your first name and surname, as they appear on your invitation.';
      $('#lookupName').focus();
      return;
    }
    openParty({ name });
  }
  function lookupByCode() {
    const code = ($('#lookupCode').value || '').trim();
    const msg = $('#lookupMsg');
    if (code.replace(/[\s-]/g, '').length < 8) {
      msg.className = 'form-msg error';
      msg.textContent = 'Your personal code has 8 letters and numbers: it is the end of your invitation link.';
      $('#lookupCode').focus();
      return;
    }
    openParty({ code });
  }

  /* ---- who may choose what (config rsvp.choices; the server enforces both) ----
     byInvitation: a part only guests marked for it in the planner may choose (golf): the server says what is closed
     for each guest (member.closed); oneOf: parts at the same time (golf and the spa): one of them, or neither. */
  const oneOfGroups = () => {
    const ids = new Set(rsvpEvents().map((e) => e.id));
    return (((CFG.rsvp || {}).choices || {}).oneOf || []).filter((g) => g && Array.isArray(g.events))
      .map((g) => Object.assign({}, g, { events: g.events.filter((id) => ids.has(id)) })).filter((g) => g.events.length > 1);
  };
  const groupOf = (id) => oneOfGroups().find((g) => g.events.includes(id)) || null;
  const mayChoose = (p, id) => !(p.closed || []).includes(id);
  // a room on the estate is set aside for this household (the planner's on-site column): it is told so, not asked
  const roomHeld = () => !!(party && party.room_held) && askStay();
  const hoursOf = (e) => (e.start ? fmtTime(e.start) + (e.end ? ' to ' + fmtTime(e.end) : '') : '');
  const wkShort = (iso) => dateObj(iso).toLocaleDateString('en-ZA', { weekday: 'short' });

  // o.user: the guest asked for it (the lookup): the page goes to the card's top and the focus to its greeting
  // (as it does for "Change my reply"); a household's own code opening by itself leaves both where they are.
  // A household that opens sees its invitation first (step 0: who is invited, to what, when and where); "Change my
  // reply" on the thank-you goes straight to the first question.
  function startRsvp(o) {
    const edit = !$('#rsvpThanks').hidden;
    const evs = rsvpEvents();
    const cs = choiceCourses();
    R = {
      people: party.members.map((m) => {
        const a = m.answers || null;
        const closed = Array.isArray(m.closed) ? m.closed : [];
        const events = {};
        evs.forEach((e) => { events[e.id] = !closed.includes(e.id) && (a ? !!(a.events && a.events[e.id]) : e.id === CFG.weddingEventId); });
        // (of parts at the same time only the first one on file stays)
        oneOfGroups().forEach((g) => { let got = false; g.events.forEach((id) => { if (events[id]) { if (got) events[id] = false; got = true; } }); });
        const menu = {};
        if (a && a.menu) cs.forEach((c) => { const id = a.menu[c.id]; if (id && c.options.some((x) => x.id === id)) menu[c.id] = id; });
        return {
          ref: m.ref, first: m.first_name || '', surname: m.surname || '', plus: !!m.plus_one, closed,
          hostRef: Number.isInteger(m.host_ref) ? m.host_ref : null,
          attending: a ? a.attending === 'yes' : null, events, menu,
          plusName: (a && a.plus_one_name) || '', plusOnFile: !!(a && a.plus_one_on_file),
          dietary: (a && a.dietary) || '', dietaryOnFile: !!(a && a.dietary_on_file)
        };
      }),
      stay: '', nights: {}, roomPeople: 0,
      contact: { email: '', phone: '', songTitle: party.song || '', songArtist: party.song_artist || '', message: party.message || '' }
    };
    // where the household stays is asked once: what is on file from anyone coming (a room that is set aside is
    // theirs unless they say they will not need it)
    const st = party.members.map((m) => m.answers).find((a) => a && a.attending === 'yes' && a.stay);
    if (st) { R.stay = st.stay; if (st.stay === 'estate') { R.nights = Object.assign({}, st.nights); R.roomPeople = st.room_people || 0; } }
    else if (roomHeld()) R.stay = 'estate';
    applyPlusOneRule();
    step = edit ? 1 : 0;
    renderRsvpForm({ opening: !edit });
    $('#rsvpLookup').hidden = true; $('#rsvpThanks').hidden = true; $('#rsvpForm').hidden = false;
    const wait = $('#rsvpWait'); if (wait) wait.hidden = true;
    if (edit || (o && o.user)) { rpScroll($('#rsvpForm')); rpFocus('#rsvpForm .rp-h'); }
  }

  const anyoneComing = () => R.people.some((p) => p.attending);
  const goingCount = () => R.people.filter((p) => p.attending).length;
  const hasReplied = () => !!party && party.members.some((m) => m.responded);
  // the steps: the weekend and the dinner only when someone may come (before anyone has answered, all four are shown)
  function stepList() {
    return R.people.some((p) => p.attending !== false) ? [[1, 'Who'], [2, 'Weekend'], [3, 'Dinner'], [4, 'Send']] : [[1, 'Who'], [4, 'Send']];
  }

  // The step thread: a bead per step on a hairline, filled up to the current one; a bead travels there from the
  // step before (from: its index; s-reply.css draws and moves it)
  function stepsHTML(from) {
    const list = stepList();
    const idx = Math.max(0, list.findIndex((s) => s[0] === step));
    const f = from == null || from < 0 ? idx : Math.min(from, list.length - 1);
    return `<div class="rp-steps" style="--n:${list.length};--at:${idx};--from:${f}"><span class="rp-steps__fill" aria-hidden="true"></span><span class="rp-steps__go" aria-hidden="true"></span>
      <ol aria-label="Step ${idx + 1} of ${list.length}">${list.map((s, i) => `<li class="${i < idx ? 'is-done' : i === idx ? 'is-current' : ''}"${i === idx ? ' aria-current="step"' : ''}><span class="rp-steps__bead" aria-hidden="true"></span>${esc(s[1])}</li>`).join('')}</ol></div>`;
  }
  // a radio or a checkbox on a 48px row (the input is the row's whole area; .rp-box draws it)
  const rpRow = (kind, attrs, checked, title, meta) => `<label class="rp-${kind === 'radio' ? 'opt' : 'check'}"><input type="${kind}" ${attrs}${checked ? ' checked' : ''}><span class="rp-box" aria-hidden="true"></span>
    <span class="rp-row__t"><strong>${esc(title)}</strong>${meta ? `<span class="rp-row__m">${esc(meta)}</span>` : ''}</span></label>`;
  // a value on file that is never shown back (found by name): "Already noted" in the field, what that means under it
  const keptAttrs = (on, id, ph) => (on ? ` placeholder="Already noted" aria-describedby="${id}-kept"` : ph ? ` placeholder="${esc(ph)}"` : '');
  const keptNote = (on, id) => (on ? `<p class="rp-note" id="${id}-kept">${esc(ON_FILE)}</p>` : '');
  // a group's name: the role over the name (h4), as the fieldset's legend
  const rpLegend = (role, name) => `<legend class="rp-legend"><span class="rp-role">${role}</span>${name ? `<h4 class="rp-name">${esc(name)}</h4>` : ''}</legend>`;

  /* ---- the weekend as a household sees it: the parts guests answer for, in order; parts at the same time are one
     line. pick(e): is this part on the list (the invitation: what someone on it may choose; the thank-you: what
     was chosen, each part by itself: split). -> [{ d: the day, list: [events], group }] */
  function planLines(pick, split) {
    const evs = rsvpEvents(), out = [], done = new Set();
    evs.forEach((e) => {
      if (done.has(e.id)) return;
      const g = split ? null : groupOf(e.id);
      (g ? g.events : [e.id]).forEach((id) => done.add(id));
      const list = (g ? evs.filter((x) => g.events.includes(x.id)) : [e]).filter(pick);
      if (list.length) out.push({ d: CFG.days.find((d) => d.id === e.dayId) || { label: e.day, date: e.date }, list, group: g && list.length > 1 ? g : null });
    });
    return out;
  }
  // the wedding's own line: when to arrive, the ceremony, and that the evening follows in the same place
  function weddingMeta(e) {
    const day = (CFG.days.find((d) => d.id === e.dayId) || {}).events || [];
    const before = day.filter((x) => x.start && e.start && x.start < e.start)[0];
    const after = day.filter((x) => x.start && e.start && x.start > e.start);
    return `${before ? `Arrive from ${fmtTime(before.start)} · ` : ''}Ceremony at ${fmtTime(e.start)}${after.length ? ', then the reception until late' : ''}`;
  }
  // who: names shown on a line when not everyone coming takes that part (the thank-you)
  function planHTML(lines, who) {
    return `<ol class="rp-plan">${lines.map(({ d, list, group }) => {
      const main = list.some((e) => e.id === CFG.weddingEventId);
      const title = group ? (group.title || list.map((e) => e.title).join(' or ')) : main ? 'The Wedding' : list[0].title;
      const rows = group
        ? [`${hoursOf(list[0])} · one of these, or neither`].concat(list.map((e) => `${e.title}${e.location ? ' · ' + e.location : ''}`))
        : [main ? weddingMeta(list[0]) : hoursOf(list[0]), list[0].location].filter(Boolean);
      const names = who ? who(list) : '';
      return `<li class="rp-plan__i${main ? ' is-main' : ''}"><span class="rp-plan__d"><b>${esc(wkShort(d.date))}</b><i>${esc(fmtShortDay(d.date))}</i></span>
        <span class="rp-plan__w"><strong>${esc(title)}</strong>${rows.map((r) => `<span class="rp-plan__m">${esc(r)}</span>`).join('')}
        ${d.dress ? `<span class="rp-plan__m rp-plan__dress">Dress: ${esc(d.dress)}</span>` : ''}${names ? `<span class="rp-plan__who">${esc(names)}</span>` : ''}</span></li>`;
    }).join('')}</ol>`;
  }

  /* ---- step 0 · the invitation: who is invited, to what, when and where, and what to do next ---- */
  function inviteHTML(opening) {
    const regular = R.people.filter((p) => !p.plus);
    const plusOnes = R.people.filter((p) => p.plus);
    const names = joinNames(regular.map((p) => p.first)) || 'friend';
    const seats = R.people.length === 1 ? '<strong>One seat</strong> is reserved in your name'
      : `<strong>${R.people.length} seats</strong> are reserved: ${esc(joinNames([...regular.map((p) => p.first), ...plusOnes.map(() => 'a guest of your choice')]))}`;
    const replied = hasReplied();
    const going = R.people.filter((p) => p.attending);
    // what the household is invited to; once it has replied: the parts it chose, each with who takes it
    const lines = replied && going.length ? planLines((e) => going.some((p) => p.events[e.id]), true) : planLines((e) => R.people.some((p) => mayChoose(p, e.id)));
    const who = (list) => { const on = going.filter((p) => list.some((e) => p.events[e.id])); return replied && on.length && on.length < going.length ? joinNames(on.map((p) => cap(shortName(p)))) : ''; };
    const dl = CFG.rsvp.deadline && dayParts(CFG.rsvp.deadline) ? fmtLong(CFG.rsvp.deadline) : '';
    const ref = String((CFG.accommodation || {}).reference || '').trim();
    const room = roomHeld()
      ? `<li>${ic('bed')}<span><strong>A room on the estate is set aside for you.</strong> You do not need to look for a place to stay.</span></li>`
      : askStay() ? `<li>${ic('bed')}<span>Staying over? ${venueStay() ? `Rooms on the estate are booked with the estate itself${ref ? `, with the reference “${esc(ref)}”` : ''}.` : 'You can ask for a room on the estate in your reply.'} <a href="#stay">Where to stay</a></span></li>` : '';
    return `<div class="rp-invite${opening && !rpStill() ? ' is-opening' : ''}">
      <div class="rp-seal rp-seal--open" aria-hidden="true">
        <svg class="rp-flap" viewBox="0 0 132 56" focusable="false"><path d="M.75 .75h130.5L68.2 53.6a3.4 3.4 0 0 1-4.4 0z" fill="#F8F5F1" stroke="#C5CEC8" stroke-width="1.5" stroke-linejoin="round"/></svg>
        <span class="rp-letter"><i></i><i></i><i></i></span>
        <svg class="rp-env" viewBox="0 0 132 86" focusable="false"><path d="M.75 3.75v78.5a3 3 0 0 0 3 3h124.5a3 3 0 0 0 3-3V3.75L68.2 50.6a3.4 3.4 0 0 1-4.4 0z" fill="#fff" stroke="#C5CEC8" stroke-width="1.5" stroke-linejoin="round"/><path d="M1.5 84.5 52 46M130.5 84.5 80 46" fill="none" stroke="#DCE2DE" stroke-width="1.25"/></svg>
      </div>
      <p class="rp-eyebrow">Your invitation</p>
      <h3 class="rp-h rp-dear">Dear <span class="rp-dear__n">${esc(names)}</span></h3>
      <p class="rp-lead rp-invite__lead">${replied ? 'Your reply is with us. Thank you! This is what we have noted, and what the weekend holds for you.' : `${esc(coupleNames())} would love to have you with them for their wedding weekend in the highlands of Mistvale.`}</p>
      ${replied ? sumHTML() : ''}
      <p class="rp-sub">${replied && going.length ? 'Your weekend' : 'What you are invited to'}</p>
      ${planHTML(lines, who)}
      <ul class="rp-facts">
        <li>${ic('users')}<span>${seats}.${R.people.length === 1 ? ' Your invitation is for you personally.' : ''}</span></li>
        ${room}
        ${dl && !rsvpClosed() ? `<li>${ic('calendar')}<span>${replied ? 'You can change your reply until' : 'Kindly reply by'} <strong>${esc(dl)}</strong>.</span></li>` : ''}
      </ul>
      <button class="text-btn rp-notyou" type="button" data-action="rsvp-reset">Not you? Start over</button>
    </div>`;
  }

  /* ---- step 1 · who is coming ---- */
  function step1HTML() {
    const regular = R.people.filter((p) => !p.plus);
    const card = (p, i) => {
      const by = plusOneLockedBy(p);
      const att = p.attending === true ? 'yes' : p.attending === false ? 'no' : '';
      const title = p.plus ? 'Bringing a guest?' : fullName(p);
      const choice = (v, label) => `<label class="rp-choice${v === 'no' ? ' rp-choice--no' : ''}"><input type="radio"${v === 'no' ? ' class="decline"' : ''} id="att-${i}-${v === 'yes' ? 'y' : 'n'}" name="att-${i}" value="${v}"${att === v ? ' checked' : ''}${by ? ' disabled' : ''}><span>${label}</span></label>`;
      return `<fieldset class="rp-person${by ? ' is-locked' : ''}" data-person="${i}">
        ${rpLegend(p.plus ? 'Plus one' : 'Invited guest', title)}
        <div class="rp-choices">${choice('yes', p.plus ? 'Yes, bringing someone' : 'Joyfully accepts')}${choice('no', p.plus ? 'Not this time' : 'Regretfully declines')}</div>
        ${by ? `<p class="rp-note rp-note--lock">${esc(lockNote(p, by))}</p>` : ''}
        ${p.plus && att === 'yes' ? `<label class="label" for="plus-${i}">Their full name</label>
          <input class="input" id="plus-${i}" data-field="plusName" maxlength="80" autocomplete="off" autocapitalize="words" value="${esc(p.plusName)}"${keptAttrs(p.plusOnFile && !p.plusName, `plus-${i}`)}>${keptNote(p.plusOnFile && !p.plusName, `plus-${i}`)}` : ''}
      </fieldset>`;
    };
    return `<div class="rp-hello"><h3 class="rp-h">${solo() ? 'Will you be joining us?' : 'Who will be joining us?'}</h3>
      <p class="rp-lead">${solo() ? `${esc(regular[0] ? regular[0].first : 'Dear guest')}, we would love to have you there.` : 'One answer for each person on your invitation.'}</p>
      ${hasReplied() ? '<p class="rp-note">You have already replied. Change anything and send it again.</p>' : ''}</div>
      ${R.people.map(card).join('')}`;
  }

  /* ---- step 2 · the weekend: for everyone coming, which parts they join (each with its hours and its place); parts
     at the same time are one question (golf, the spa, or neither); then where the household stays ---- */
  function step2HTML() {
    const evs = rsvpEvents();
    const byDay = CFG.days.map((d) => ({ d, evs: evs.filter((e) => e.dayId === d.id) })).filter((x) => x.evs.length);
    const meta = (e) => [hoursOf(e), e.location].filter(Boolean).join(' · ');
    const block = (p, i) => {
      if (!p.attending) return '';
      const done = new Set();
      const dayHTML = ({ d, evs: list }) => {
        const rows = list.map((e) => {
          if (done.has(e.id)) return '';
          const g = groupOf(e.id);
          if (g) g.events.forEach((id) => done.add(id));
          const open = (g ? list.filter((x) => g.events.includes(x.id)) : [e]).filter((x) => mayChoose(p, x.id));
          if (!open.length) return '';
          if (!g || open.length === 1) return open.map((x) => rpRow('checkbox', `data-event="${esc(x.id)}"`, p.events[x.id], x.rsvpLabel || x.title, meta(x))).join('');
          const none = !open.some((x) => p.events[x.id]);
          return `<div class="rp-pick" role="radiogroup" aria-label="${esc(g.question || d.label)}" data-group="${esc(g.id)}">
            <p class="rp-pick__q">${esc(g.question || 'One of these')}<span>They are at the same time: one of them, or neither.</span></p>
            ${open.map((x) => rpRow('radio', `name="g-${i}-${esc(g.id)}" value="${esc(x.id)}"`, p.events[x.id], x.rsvpLabel || x.title, meta(x))).join('')}
            ${rpRow('radio', `name="g-${i}-${esc(g.id)}" value=""`, none, g.none || 'Neither', g.noneHint || '')}</div>`;
        }).join('');
        return rows ? `<p class="rp-day">${esc(d.label)} · ${esc(fmtShortDay(d.date))}${d.dress ? `<span class="rp-day__dress">${esc(d.dress)}</span>` : ''}</p>${rows}` : '';
      };
      return `<fieldset class="rp-person" data-person="${i}">
        ${rpLegend(solo() ? 'Your weekend' : 'The weekend for', solo() ? '' : fullName(p))}
        ${byDay.map(dayHTML).join('')}
      </fieldset>`;
    };
    return `<div class="rp-hello"><h3 class="rp-h">${solo() ? 'Which parts will you join?' : 'Who joins which part?'}</h3>
      <p class="rp-lead">Tick everything ${solo() ? 'you' : 'each of you'} would like to be part of. The wedding itself is already ticked.</p></div>
      ${R.people.map(block).join('')}
      ${stayHTML()}`;
  }

  // Where the household stays (asked once, for everyone coming). A household the planner marks as having a room on
  // the estate is told so (and can say that it will not need it). Otherwise, for the estate: which nights and how
  // many people, which shows on the couple's dashboard (Rooms). With accommodation.mode 'venue' the guests book the
  // room with the estate themselves, so the answer is only noted and the line under it sends them to the Stay chapter
  // with the booking reference; with 'couple' the room is asked for here and the couple confirm it (rooms.confirmNote).
  function stayHTML() {
    if (!askStay() || !anyoneComing()) return '';
    const r = CFG.rsvp.rooms || {};
    if (roomHeld()) {
      return `<fieldset class="rp-person rp-held" data-stay>
        ${rpLegend('Accommodation', r.heldTitle || 'Your room on the estate')}
        <p class="rp-held__note">${ic('bed')}<span>${esc(r.heldNote || 'A room on the estate is set aside for you, so there is nothing to book.')}</span></p>
        ${rpRow('checkbox', 'data-noroom', !!R.stay && R.stay !== 'estate', r.heldDecline || 'We will not need the room', r.heldDeclineHint || 'We are staying somewhere else, or coming for the day')}
      </fieldset>`;
    }
    const venue = venueStay();
    const ref = String((CFG.accommodation || {}).reference || '').trim();
    const q = CFG.rsvp.stayQuestion || 'Where will you stay?';
    const going = Math.max(1, goingCount());
    const people = Math.min(R.roomPeople || going, going);
    const legend = (venue && r.nightsLegendVenue) || r.nightsLegend || (venue ? 'Which nights will you stay?' : 'Which nights would you like the room?');
    const note = venue
      ? `<p class="rp-note">Your room is booked with the estate, not through this reply. Haven’t booked yet? <a href="#stay">See where to stay</a>${ref ? ` and use the reference “${esc(ref)}”` : ''}.</p>`
      : r.confirmNote ? `<p class="rp-note">${esc(r.confirmNote)}</p>` : '';
    return `<fieldset class="rp-person" data-stay>
      ${rpLegend('Accommodation', q)}
      <div class="rp-opts">${CFG.rsvp.stayOptions.filter((o) => o && STAY_IDS.includes(o.id)).map((o) => rpRow('radio', `name="stay" value="${esc(o.id)}"`, R.stay === o.id, (venue && o.labelVenue) || o.label || o.id, (venue && o.hintVenue) || o.hint)).join('')}</div>
      <div class="rp-events" ${R.stay === 'estate' ? '' : 'hidden'}>
        <p class="rp-q">${esc(legend)}</p>
        ${roomNights().map((n) => rpRow('checkbox', `data-night="${esc(n.id)}"`, R.nights[n.id], n.label, n.hint)).join('')}
        <label class="label" for="roomPeople">${esc(r.peopleLabel || 'How many people in the room?')}</label>
        <select class="input" id="roomPeople">${Array.from({ length: going }, (_, k) => k + 1).map((n) => `<option value="${n}" ${n === people ? 'selected' : ''}>${n}</option>`).join('')}</select>
        ${note}
      </div>
    </fieldset>`;
  }

  /* ---- step 3 · the dinner ---- */
  function step3HTML() {
    const cs = courses();
    const block = (p, i) => {
      if (!p.attending) return '';
      const menu = needsMenu(p);
      const skip = solo() ? 'You are not joining the wedding reception, so no menu choice is needed.' : `${cap(shortName(p))} is not joining the wedding reception, so no menu choice is needed.`;
      // a course to choose is a group of its own (a fieldset: its title is the legend); one served to all is shown
      return `<fieldset class="rp-person" data-person="${i}">
        ${rpLegend(menu ? 'Wedding dinner' : 'Dietary requirements', fullName(p))}
        ${menu ? cs.map((c) => (c.choose
          ? `<fieldset class="rp-course"><legend class="rp-course__t">${esc(c.title)}</legend>
            ${c.options.map((o) => rpRow('radio', `name="m-${i}-${esc(c.id)}" value="${esc(o.id)}" data-course="${esc(c.id)}"`, p.menu[c.id] === o.id, o.name, o.desc)).join('')}</fieldset>`
          : `<div class="rp-course"><p class="rp-course__t">${esc(c.title)} <span class="rp-tag">Served to all guests</span></p>
            ${c.options.map((o) => `<div class="rp-opt is-fixed"><span class="rp-row__t"><strong>${esc(o.name)}</strong>${o.desc ? `<span class="rp-row__m">${esc(o.desc)}</span>` : ''}</span></div>`).join('')}</div>`)).join('')
          : `<p class="rp-note">${esc(skip)} Let us know about any dietary needs for the other meals.</p>`}
        <label class="label" for="diet-${i}">Dietary requirements or allergies</label>
        <input class="input" id="diet-${i}" data-field="dietary" maxlength="200" value="${esc(p.dietary)}"${keptAttrs(p.dietaryOnFile && !p.dietary, `diet-${i}`, 'e.g. vegetarian, no nuts')}>${keptNote(p.dietaryOnFile && !p.dietary, `diet-${i}`)}
      </fieldset>`;
    };
    const intro = (CFG.menu || {}).intro || '';
    return `<div class="rp-hello"><h3 class="rp-h">The wedding dinner</h3>${intro ? `<p class="rp-lead">${esc(intro)}</p>` : ''}</div>${R.people.map(block).join('')}`;
  }

  /* ---- step 4 · a song, a note, and the reply read back before it is sent ---- */
  function step4HTML() {
    const c = R.contact;
    const coming = anyoneComing();
    const byName = party.found_by === 'name';
    // contact details are never shown back; found by name with details on file, they can't be replaced from
    // here (anyone with the invitation code and a name could otherwise redirect them): the personal link can
    const locked = byName && party.contact_on_file;
    const hint = locked
      ? `We already have your email address and mobile number. To change them, open the personal link from your invitation or message ${coupleNames()}.`
      : party.contact_on_file ? 'We already have your contact details. Leave these blank to keep them, or type new ones to change them.'
        : 'Optional: in case plans change, so we can reach you.';
    const songKept = byName && party.song_on_file && !c.songTitle && !c.songArtist;
    return `<div class="rp-hello"><h3 class="rp-h">${coming ? 'Almost there' : 'Thank you for letting us know'}</h3>
      ${coming ? '<p class="rp-lead">A song for the dance floor, a word for us if you like, and then a last look before it goes.</p>' : ''}</div>
      ${coming ? `<fieldset class="rp-person rp-song">
        ${rpLegend(`${ic('music')} Song request`, '')}
        <p class="rp-note">${songKept ? esc(ON_FILE) : 'Which song will get you on the dance floor?'}</p>
        <div class="grid-2">
          <div><label class="label" for="songTitle">Song name</label><input class="input" id="songTitle" maxlength="120" autocomplete="off" value="${esc(c.songTitle)}" placeholder="e.g. September"></div>
          <div><label class="label" for="songArtist">Artist</label><input class="input" id="songArtist" maxlength="120" autocomplete="off" value="${esc(c.songArtist)}" placeholder="e.g. Earth, Wind &amp; Fire"></div>
        </div></fieldset>` : ''}
      <div class="rp-person rp-contact">
        <p class="rp-note">${esc(hint)}</p>
        ${locked ? '' : `<div class="grid-2">
          <div><label class="label" for="rsvpEmail">Email address</label><input class="input" id="rsvpEmail" type="email" inputmode="email" autocomplete="email" maxlength="160" value="${esc(c.email)}"></div>
          <div><label class="label" for="rsvpPhone">Mobile number</label><input class="input" id="rsvpPhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" value="${esc(c.phone)}"></div>
        </div>`}
        <label class="label" for="rsvpMsg">A note for ${esc(coupleNames())} (optional)</label>
        <textarea class="input" id="rsvpMsg" maxlength="1000"${byName && party.message_on_file && !c.message ? ` placeholder="${esc(ON_FILE)}"` : ''}>${esc(c.message)}</textarea>
      </div>
      <div class="rp-person rp-review"><p class="rp-role">Your reply, before it goes</p>${sumHTML()}
        <p class="rp-note">Something not right? Go back and change it. You can also change your reply after sending it${CFG.rsvp.deadline && dayParts(CFG.rsvp.deadline) ? `, until ${esc(fmtDM(CFG.rsvp.deadline))}` : ''}.</p></div>`;
  }

  // What the reply says, person by person (the last look before sending, the thank-you, a household that comes back)
  function sumHTML() {
    const evs = rsvpEvents();
    const cs = choiceCourses();
    const list = R.people.map((p) => {
      if (p.attending === null) return `<li><strong>${esc(fullName(p))}</strong><span class="rp-sum__m">Not answered yet</span></li>`;
      if (!p.attending) return `<li><strong>${esc(fullName(p))}</strong><span class="rp-sum__m">Not able to attend</span></li>`;
      const meal = needsMenu(p) ? cs.map((c) => (c.options.find((o) => o.id === p.menu[c.id]) || {}).name).filter(Boolean) : [];
      return `<li><strong>${esc(fullName(p))}</strong><span class="rp-sum__m">${evs.filter((e) => p.events[e.id]).map((e) => esc(e.rsvpLabel || e.title)).join(', ')}</span>
        ${meal.length ? `<span class="rp-sum__m">Menu: ${meal.map(esc).join(' · ')}</span>` : ''}${p.dietary.trim() ? `<span class="rp-sum__m">Dietary: ${esc(p.dietary.trim())}</span>` : p.dietaryOnFile ? '<span class="rp-sum__m">Dietary: already noted</span>' : ''}</li>`;
    }).join('');
    const stay = anyoneComing() ? stayLine() : '';
    return `<ul class="rp-sum">${list}</ul>${stay ? `<p class="rp-note">${ic('bed')} ${esc(stay)}</p>` : ''}`;
  }

  const sendLabel = () => (solo() ? 'Send my reply' : 'Send our reply');
  // o.from: the step index the thread's bead travels from; o.dir: the new step slides in from that side (goStep);
  // o.opening: the invitation is being opened (its envelope opens, then its words rise)
  function renderRsvpForm(o) {
    o = o || {};
    if (step === 0) {
      const shut = rsvpClosed();
      $('#rsvpForm').innerHTML = `<div class="rp-step"${o.dir ? ' data-enter="back"' : ''}>${inviteHTML(o.opening)}</div>
        <div class="step-nav rp-nav0">
          <div class="form-msg error rp-msg" id="rsvpMsgBox" role="alert"></div>
          ${shut ? '' : `<button class="btn btn-primary" type="button" data-action="rsvp-next">${hasReplied() ? 'Change my reply' : solo() ? 'Reply now' : 'Reply for us'}</button>`}
          ${hasReplied() && anyoneComing() ? '<button class="btn btn-outline" type="button" data-action="ics-mine">Add to my calendar</button>' : ''}
        </div>`;
      return;
    }
    const body = step === 1 ? step1HTML() : step === 2 ? step2HTML() : step === 3 ? step3HTML() : step4HTML();
    const list = stepList();
    const idx = list.findIndex((s) => s[0] === step);
    const last = idx === list.length - 1;
    $('#rsvpForm').innerHTML = `${stepsHTML(o.from)}<div class="rp-step"${o.dir ? ` data-enter="${o.dir > 0 ? 'next' : 'back'}"` : ''}>${body}</div>
      <div class="step-nav">
        <div class="form-msg error rp-msg" id="rsvpMsgBox" role="alert"></div>
        <button class="btn btn-outline" type="button" data-action="rsvp-back">Back</button>
        ${last ? `<button class="btn btn-primary" type="submit" id="rsvpSubmit"${sendShut() ? ' disabled' : ''}>${sendLabel()}</button>` : '<button class="btn btn-primary" type="button" data-action="rsvp-next">Next</button>'}
      </div>`;
  }

  // Read whatever is on screen into R
  function readStep() {
    if (step === 1) {
      $$('#rsvpForm [data-person]').forEach((card) => {
        const i = +card.dataset.person; const p = R.people[i];
        const v = (card.querySelector(`input[name="att-${i}"]:checked`) || {}).value;
        const was = p.attending;
        p.attending = v === 'yes' ? true : v === 'no' ? false : null;
        // someone who now accepts with nothing ticked (e.g. after declining before) starts with the wedding, like a first reply
        if (p.attending && was !== true && !Object.values(p.events).some(Boolean) && rsvpEvents().some((e) => e.id === CFG.weddingEventId)) p.events[CFG.weddingEventId] = true;
        const pn = card.querySelector('[data-field="plusName"]');
        if (pn) p.plusName = pn.value;
      });
      applyPlusOneRule();
    } else if (step === 2) {
      $$('#rsvpForm [data-person]').forEach((card) => {
        const i = +card.dataset.person; const p = R.people[i];
        $$('input[data-event]', card).forEach((cb) => { p.events[cb.dataset.event] = cb.checked && mayChoose(p, cb.dataset.event); });
        // parts at the same time: the one that is chosen, none of the others
        $$('[data-group]', card).forEach((box) => {
          const g = oneOfGroups().find((x) => x.id === box.dataset.group); if (!g) return;
          const v = (box.querySelector('input[type="radio"]:checked') || {}).value || '';
          g.events.forEach((id) => { p.events[id] = id === v && mayChoose(p, id); });
        });
      });
      const nr = $('#rsvpForm input[data-noroom]');
      if (nr) R.stay = nr.checked ? 'nearby' : 'estate';
      const st = $('#rsvpForm input[name="stay"]:checked');
      if (st) R.stay = st.value;
      $$('#rsvpForm input[data-night]').forEach((cb) => { R.nights[cb.dataset.night] = cb.checked; });
      // the number of people in the room is only taken when the guest picks it (else: everyone coming)
    } else if (step === 3) {
      $$('#rsvpForm [data-person]').forEach((card) => {
        const i = +card.dataset.person; const p = R.people[i];
        choiceCourses().forEach((c) => { const r = card.querySelector(`input[data-course="${c.id}"]:checked`); if (r) p.menu[c.id] = r.value; });
        p.dietary = ($('[data-field="dietary"]', card) || {}).value || '';
      });
    } else if (step === 4) {
      const has = (id) => !!$('#' + id);
      const v = (id) => (($('#' + id) || {}).value || '').trim();
      R.contact = {
        email: has('rsvpEmail') ? v('rsvpEmail') : R.contact.email,
        phone: has('rsvpPhone') ? v('rsvpPhone') : R.contact.phone,
        songTitle: has('songTitle') ? v('songTitle') : R.contact.songTitle,
        songArtist: has('songArtist') ? v('songArtist') : R.contact.songArtist,
        message: has('rsvpMsg') ? v('rsvpMsg') : R.contact.message
      };
      if (!anyoneComing()) { R.contact.songTitle = ''; R.contact.songArtist = ''; }
    }
  }

  // every step up to the one on screen (Send checks them all: a reply is never sent with a step unanswered)
  function validateStep(at) {
    const s = at == null ? step : at;
    if (s === 1) {
      for (const p of R.people) {
        if (p.attending === null) return p.plus ? 'Please let us know whether you are bringing a guest.' : `Please let us know whether ${solo() ? 'you' : p.first} will be attending.`;
        if (p.plus && p.attending && !p.plusName.trim() && !p.plusOnFile) return 'Please add your guest’s full name, or choose “Not this time”.';
      }
    }
    if (s === 2 && anyoneComing()) {
      for (const p of R.people) {
        if (p.attending && rsvpEvents().length && !Object.values(p.events).some(Boolean)) return `Please tick at least one part of the weekend for ${solo() ? 'yourself' : shortName(p)}.`;
      }
      if (askStay() && !roomHeld() && R.stay === 'estate' && !roomNights().some((n) => R.nights[n.id])) return venueStay() ? 'Please tick the nights you will be staying on the estate.' : 'Please tick the nights you would like a room for.';
    }
    if (s === 3) {
      for (const p of R.people) {
        if (!needsMenu(p)) continue;
        const c = choiceCourses().find((x) => !p.menu[x.id]);
        if (c) return `Please choose a ${c.title.toLowerCase()} for ${solo() ? 'yourself' : fullName(p)}.`;
      }
    }
    if (s === 4) {
      const em = R.contact.email;
      if (em && (em.length > 160 || !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:.]{2,}$/.test(em))) return 'Please check your email address.';
      const ph = R.contact.phone;
      const digits = ph.replace(/\D/g, '');
      if (ph && (!/^\+?[0-9 ()\-.]+$/.test(ph) || digits.length < 7 || digits.length > 15)) return 'Please check your mobile number.';
    }
    return '';
  }

  // Next / Back: the page goes to the card's top (under the header, never 2 x too low as scrollIntoView would land)
  // while the step on screen leaves (200 ms, s-reply.css .is-leaving); the new one comes in from its side and the
  // focus goes to its heading. With reduced motion it is one cut. From the invitation (step 0) Next is the first
  // question; Back on the first question is the invitation again.
  let stepping = false;
  let sending = false;   // a reply is on its way: the step stays on screen (Back waits) so its answer shows there
  // A "please tick…" message from Next or Send is answered as soon as something on the step changes: it goes then
  // (rpAnswered, on the form's input event) instead of standing under ticked boxes until the next press. A message
  // from the server (replies closed, could not send) is not one of these and stays.
  function rpAsk(err) { const box = $('#rsvpMsgBox'); if (box) { box.textContent = err; box.dataset.check = '1'; } }
  function rpAnswered() { const box = $('#rsvpMsgBox'); if (box && box.dataset.check) { box.textContent = ''; delete box.dataset.check; } }
  function goStep(dir) {
    if (stepping || sending) return;
    readStep();
    if (dir > 0 && step > 0) { const err = validateStep(); if (err) { rpAsk(err); return; } }
    const list = stepList().map((s) => s[0]);
    const from = list.indexOf(step);
    const to = step === 0 ? list[0] : from + dir < 0 ? 0 : list[Math.min(list.length - 1, from + dir)] || 1;
    const go = () => {
      stepping = false;
      step = to;
      renderRsvpForm({ from: Math.max(0, from), dir });
      rpFocus('#rsvpForm .rp-h');
    };
    rpScroll($('#rsvpForm'));
    const cur = $('#rsvpForm .rp-step');
    if (rpStill() || !cur) { go(); return; }
    stepping = true;
    cur.classList.add(dir > 0 ? 'is-leaving' : 'is-leaving-back');
    setTimeout(go, 200);
  }

  // POST /api/rsvp/respond, v3 (site2): per person attendance, events, stay (+ room), dinner, dietary
  function buildPayload() {
    const evIds = rsvpEvents().map((e) => e.id);
    const cs = choiceCourses();
    const going = goingCount();
    const room = askStay() && R.stay === 'estate' && !roomHeld();
    const members = R.people.map((p) => {
      const m = { ref: p.ref, attending: p.attending ? 'yes' : 'no' };
      if (!p.attending) return m;
      m.events = Object.fromEntries(evIds.map((id) => [id, !!p.events[id] && mayChoose(p, id)]));
      m.dietary = p.dietary.trim();
      if (p.plus) m.plus_one_name = p.plusName.replace(/\s+/g, ' ').trim();
      if (askStay()) m.stay = STAY_IDS.includes(R.stay) ? R.stay : '';
      if (room) {
        m.nights = Object.fromEntries(ROOM_NIGHTS.map((n) => [n.id, !!R.nights[n.id]]));
        m.room_people = Math.max(1, Math.min(R.roomPeople || going, going));
      }
      m.menu = needsMenu(p) ? Object.fromEntries(cs.filter((c) => p.menu[c.id]).map((c) => [c.id, p.menu[c.id]])) : {};
      return m;
    });
    const c = R.contact;
    return { v: 3, token: party.token, members, song: c.songTitle, song_artist: c.songArtist, message: c.message, email: c.email, phone: c.phone };
  }

  async function submitRsvp(ev) {
    ev.preventDefault();
    // (a Send during Back's slide-out, or a second one while the first is on its way, is not a reply)
    if (stepping || sending || step === 0) return;
    readStep();
    const box = $('#rsvpMsgBox'); box.textContent = ''; delete box.dataset.check;
    const err = stepList().map((s) => validateStep(s[0])).find(Boolean); if (err) { rpAsk(err); return; }
    const btn = $('#rsvpSubmit'); btn.disabled = true; btn.textContent = 'Sending...';
    const back = $('#rsvpForm [data-action="rsvp-back"]'); if (back) back.disabled = true;
    sending = true;
    const send = () => api('/api/rsvp/respond', { method: 'POST', body: buildPayload(), withInvite: false });
    try {
      let res;
      try { res = await send(); }
      catch (e) {
        // the page was open for a while (a reply token lasts 2 hours): find the invitation again, then send
        if (e.status !== 401 || !lookup) throw e;
        const again = await findParty(lookup);
        if (!again) throw e;
        party.token = again.token;
        res = await send();
      }
      // the server's word on who is coming (a plus one follows their host)
      (res.members || []).forEach((x, i) => { if (R.people[i] && x && (x.attending === 'yes' || x.attending === 'no')) R.people[i].attending = x.attending === 'yes'; });
      rememberSent();
      // this device has replied (the hero, the header and Contents stop asking: motion.js and story.js read it)
      store.set('ww_replied', '1');
      document.documentElement.classList.add('has-replied');
      // (it went through, so replies are open: a pause that turned an earlier Send away is over)
      if (CFG.live && CFG.live.open === false) { CFG.live = Object.assign({}, CFG.live, { open: true, closed_reason: null }); renderRsvpShell(); }
      showThanks();
    } catch (e) {
      // (the step on screen now: looked up again rather than trusting what was there when it was sent)
      const msg = $('#rsvpMsgBox'), sendBtn = $('#rsvpSubmit'), backBtn = $('#rsvpForm [data-action="rsvp-back"]');
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = sendLabel(); }
      if (backBtn) backBtn.disabled = false;
      if (e.status === 403) {
        CFG.live = Object.assign({}, CFG.live, { open: false, closed_reason: (e.data && e.data.closed_reason) || 'deadline' });
        renderRsvpShell();
        // the answers stay (the guest can still read or copy them); closed for good, Send is off
        if (sendBtn) sendBtn.disabled = sendShut();
        if (msg) msg.textContent = e.message;
        return;
      }
      if (!msg) return;
      if (e.status === 409 || e.status === 401) { msg.innerHTML = `${esc(e.message)} <button type="button" class="btn btn-outline btn-sm" data-action="rsvp-refind">Find my invitation again</button>`; return; }
      msg.textContent = e.status === 400 ? e.message : `Sorry, we could not save your RSVP: ${e.message}`;
    } finally { sending = false; }
  }

  // What was sent is what is on file now ("Change my reply" starts from it)
  function rememberSent() {
    const evs = rsvpEvents();
    R.people.forEach((p) => {
      const m = party.members.find((x) => x.ref === p.ref);
      if (!m) return;
      const yes = !!p.attending;
      const prev = m.answers || {};
      m.responded = true;
      m.answers = {
        attending: yes ? 'yes' : 'no',
        events: Object.fromEntries(evs.map((e) => [e.id, yes && !!p.events[e.id] && mayChoose(p, e.id)])),
        stay: yes ? (askStay() ? R.stay : prev.stay || '') : '',
        nights: yes && R.stay === 'estate' && !roomHeld() ? Object.assign({}, R.nights) : {},
        room_people: yes && R.stay === 'estate' && !roomHeld() ? Math.max(1, Math.min(R.roomPeople || goingCount(), goingCount())) : null,
        dietary: yes ? p.dietary.trim() : '',
        dietary_on_file: yes && (!!p.dietary.trim() || !!prev.dietary_on_file),
        plus_one_name: yes && p.plus ? p.plusName.trim() : '',
        plus_one_on_file: yes && p.plus && (!!p.plusName.trim() || !!prev.plus_one_on_file),
        menu: yes && needsMenu(p) ? Object.assign({}, p.menu) : {}
      };
    });
    party.song = R.contact.songTitle; party.song_artist = R.contact.songArtist; party.message = R.contact.message;
    party.song_on_file = party.song_on_file || !!(R.contact.songTitle || R.contact.songArtist);
    party.message_on_file = party.message_on_file || !!R.contact.message;
    party.contact_on_file = party.contact_on_file || !!(R.contact.email || R.contact.phone);
    R.contact.email = ''; R.contact.phone = '';
  }

  function stayLine() {
    if (!askStay() || !R.stay) return '';
    if (roomHeld()) return R.stay === 'estate' ? 'Your room on the estate is set aside for you.' : 'You will not need the room on the estate. Thank you for letting us know.';
    if (R.stay === 'estate') {
      const n = roomNights().filter((x) => R.nights[x.id]).map((x) => (ROOM_NIGHTS.find((y) => y.id === x.id) || x).label);
      const people = Math.max(1, Math.min(R.roomPeople || goingCount(), goingCount()));
      const what = `${n.length ? ` for ${joinNames(n)} night${n.length > 1 ? 's' : ''}` : ''} (${people} ${people === 1 ? 'person' : 'people'})`;
      if (venueStay()) {
        // the guests book this room themselves: say so once more, with the reference the estate asks for
        const ref = String((CFG.accommodation || {}).reference || '').trim();
        return `Staying on the estate${what}. Remember to book your room with the estate${ref ? `, using the reference “${ref}”` : ''}.`;
      }
      return `A room on the estate${what}. We will be in touch to confirm it.`;
    }
    const o = (CFG.rsvp.stayOptions || []).find((x) => x && x.id === R.stay);
    return { nearby: 'Staying nearby', day: 'Coming for the day', unsure: 'Where to stay: still deciding' }[R.stay] || (o ? o.label : '');
  }

  // The thank-you: the reply sealed in its envelope (P1 .reply-seal: the flap shuts, the wax is pressed and the
  // thread ties a bow as it comes into view; with reduced motion it is simply sealed), "Thank you, {names}!" in
  // Pinyon, what was noted, the household's own weekend (each part with its day, its hours and its place), the
  // calendar and "Change my reply", then where to look next (#stay, #weekend, #dresscode). The page goes to the top
  // of IX, never the page's top.
  function showThanks() {
    const anyYes = anyoneComing();
    const going = R.people.filter((p) => p.attending);
    const song = R.contact.songTitle ? `<p class="rp-note">${ic('music')} Song request: <strong>${esc(R.contact.songTitle)}</strong>${R.contact.songArtist ? ' by ' + esc(R.contact.songArtist) : ''}</p>` : '';
    // who takes a part, when not everyone coming does
    const who = (list) => { const on = going.filter((p) => list.some((e) => p.events[e.id])); return on.length && on.length < going.length ? joinNames(on.map((p) => cap(shortName(p)))) : ''; };
    const plan = anyYes ? planLines((e) => going.some((p) => p.events[e.id]), true) : [];
    // where to look next: someone staying on the estate who books the room themselves ('venue') goes to the Stay
    // chapter first (the phone number, the pre-typed email, the reference)
    const next = roomHeld() ? '<a class="text-btn" href="#dresscode">What to wear</a><a class="text-btn" href="#weekend">The weekend, hour by hour</a>'
      : R.stay === 'estate' && venueStay()
        ? '<a class="text-btn" href="#stay">Book your room on the estate</a><a class="text-btn" href="#dresscode">What to wear</a>'
        : R.stay === 'estate'
          ? '<a class="text-btn" href="#dresscode">What to wear</a><a class="text-btn" href="#weekend">The weekend, hour by hour</a>'
          : '<a class="text-btn" href="#stay">Where to stay</a><a class="text-btn" href="#dresscode">What to wear</a>';
    const names = joinNames(R.people.filter((p) => !p.plus).map((p) => p.first).filter(Boolean));
    const T = $('#rsvpThanks');
    T.classList.toggle('reply-seal', !rpStill());
    T.innerHTML = `<div class="rp-thanks__in" data-rv="group">
      <div class="rp-seal" aria-hidden="true">
        <svg class="rp-env" viewBox="0 0 132 86" focusable="false"><rect x=".75" y=".75" width="130.5" height="84.5" rx="3" fill="#fff" stroke="#C5CEC8" stroke-width="1.5"/><path d="M1.5 84.5 57 43.5M130.5 84.5 75 43.5" fill="none" stroke="#DCE2DE" stroke-width="1.25"/></svg>
        <svg class="rp-flap" viewBox="0 0 132 56" focusable="false"><path d="M.75 .75h130.5L68.2 53.6a3.4 3.4 0 0 1-4.4 0z" fill="#F8F5F1" stroke="#C5CEC8" stroke-width="1.5" stroke-linejoin="round"/></svg>
        <span class="rp-bow"><svg viewBox="0 0 104 44" focusable="false"><path d="M52 20C43 7 21 4 20 15 19 25 39 26 52 20ZM52 20C61 7 83 4 84 15 85 25 65 26 52 20ZM52 20C49 29 42 36 31 42M52 20C55 29 62 36 73 42" fill="none" stroke="#B48A93" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <img class="rp-wax" src="w/img/ornament/seal.svg" alt="" width="200" height="200" decoding="async">
      </div>
      <h3 class="rp-thanks__t">${names ? `Thank you,<span class="rp-thanks__n"> ${esc(names)}!</span>` : 'Thank you!'}</h3>
      <p class="rp-lead">${anyYes ? 'We are so happy you will be celebrating with us. Here is what we have noted:' : 'Thank you for letting us know. We will miss you and will raise a glass in your honour.'}</p>
      ${sumHTML()}${song}
      ${plan.length ? `<p class="rp-sub">Your weekend</p>${planHTML(plan, who)}` : ''}
      <div class="rp-actions">
        ${anyYes ? '<button class="btn btn-primary" type="button" data-action="ics-mine">Add to my calendar</button>' : ''}
        <button class="btn btn-outline" type="button" data-action="rsvp-edit"${rsvpClosed() ? ' hidden' : ''}>Change my reply</button>
      </div>
      ${anyYes ? `<div class="rp-next"><p class="rp-next__t">While you are here</p>${next}</div>` : ''}</div>`;
    $('#rsvpForm').hidden = true; T.hidden = false;
    if (!(window.WW && typeof WW.jump === 'function' && WW.jump('rsvp', { focus: false }))) rpScroll($('#rsvp'));
    rpFocus('#rsvpThanks .rp-thanks__t');
  }

  function myEvents() {
    const ids = new Set();
    (R ? R.people : []).forEach((p) => { if (p.attending) Object.keys(p.events).forEach((k) => p.events[k] && ids.add(k)); });
    const out = allEvents().filter((e) => ids.has(e.id));
    const sat = allEvents().filter((e) => e.date === CFG.wedding.date);
    if (sat.some((e) => ids.has(e.id))) sat.forEach((e) => { if (!out.find((o) => o.id === e.id)) out.push(e); });
    return out;
  }
  // manual: "Not you? Start over" (the household's code no longer opens it by itself this visit)
  function resetRsvp(manual) {
    party = null; R = null; lookup = null;
    if (manual) sstore.set(SS_MANUAL, '1');
    $('#rsvpForm').hidden = true; $('#rsvpThanks').hidden = true;
    $('#lookupName').value = ''; $('#lookupMsg').textContent = '';
    const lc = $('#lookupCode'); if (lc) lc.value = '';
    // (fresh content that waited while the household was open is drawn now: renderAll draws IX's card too)
    if (!(renderPending && renderFresh())) renderRsvpShell();
    // the guest's own "Not you? Start over": the lookup, from its top
    if (manual && !$('#rsvpLookup').hidden) { rpScroll($('#rsvpLookup')); rpFocus('#rsvpLookup .rp-h'); }
  }

  /* ---------------- Router ---------------- */
  // One page with two views: the story (every chapter, one long page) and the couple's dashboard (#admin, on its
  // own: html.view-admin). Nothing here scrolls: story.js hears 'ww:route' { page: 'story' | 'admin', section: the
  // hash's id, or null in the dashboard } and moves to the section (or back to where the guest was); motion.js
  // releases the hold on the first one; location.js puts the map away in the dashboard.
  function route() {
    // (#rsvp=CODE is a personal link: the hashchange listener below turns it into #rsvp)
    const h = (location.hash || '').slice(1).replace(/^rsvp=.*$/, 'rsvp');
    const admin = h === 'admin';
    document.documentElement.classList.toggle('view-admin', admin);
    const dash = $('#page-admin'); if (dash) dash.hidden = !admin;
    if (admin) Admin.enter();
    // (content that came in while the dashboard was open is drawn before story.js puts the guest back)
    else if (renderPending) renderFresh();
    if (h === 'rsvp') renderRsvpShell();
    document.dispatchEvent(new CustomEvent('ww:route', { detail: { page: admin ? 'admin' : 'story', section: admin ? null : (h || 'home') } }));
  }

  // Every section from the content (each on its own: one that fails is logged and the others still show), then
  // 'ww:rendered' on document.
  function renderAll() {
    renderPending = false;
    [renderBindings, renderPhotoSlots, renderWeekend, renderBridalParty, renderVenue, renderNearby, renderDress, renderGallery, renderFaq, renderRsvpShell, startCountdown, fillIcons]
      .forEach((fn) => { try { fn(); } catch (e) { console.error('[render]', fn.name, e); } });
    document.dispatchEvent(new CustomEvent('ww:rendered'));
  }

  /* =====================================================================
     ADMIN (#admin): the couple's login is the planner password (POST /api/login, a cookie); the content saves
     to the server (PUT /api/rsvp-admin/site2/config), photos upload to it (/api/rsvp-admin/upload), and the
     RSVP dashboard reads the guest list and replies from it (/api/rsvp-admin/overview). The guest list itself,
     households, personal codes and room requests are managed on the full dashboard (/admin).
     ===================================================================== */
  const Admin = (function () {
    let authed = false, draft = null, tab = 'dashboard', dirty = false, last = null;
    let user = sstore.get(SS_ADMIN);
    // The draft is only ever the content as the server has it (never the copy saved on this device: it may be from
    // before an update, or before the other phone saved). base: which content it was taken from (cfgStamp); Save
    // publishes only while the server still has that, so it never puts older content back over newer.
    let base = '', loading = null, loadErr = '';
    const adminApi = (path, opts = {}) => api(path, Object.assign({ withInvite: false }, opts));
    function fromCfg() { draft = clone(CFG); base = cfgStamp; dirty = false; }
    // an answer of the dashboard's API with the content: into the page and the copy saved on this device (the story
    // under the dashboard is drawn afresh when the couple goes back to it)
    function take(r) {
      const data = { defaults: r.defaults, override: r.override, live: r.live };
      const was = cfgStamp;
      useConfig(data); writeCache(data);
      if (cfgStamp !== was) renderFresh();
    }
    // the content from the server (the planner cookie): the draft starts from it, unless it has edits
    function load() {
      if (loading) return loading;
      loadErr = '';
      loading = adminApi('/api/rsvp-admin/site2/config', { timeout: 20000 }).then((r) => {
        loading = null;
        const was = cfgStamp, had = !!draft;
        take(r);
        if (dirty) { const d = $('#dirtyFlag'); if (d) d.textContent = flagText(); return; }
        fromCfg();
        if (authed && (cfgStamp !== was || (!had && tab !== 'dashboard'))) render();
      }, (e) => {
        loading = null;
        if (e.status === 401) { lost(); return; }
        loadErr = e.message;
        if (authed && !draft) render();
      });
      return loading;
    }

    async function enter() {
      if (!authed) {
        try { const r = await adminApi('/api/me', { timeout: 10000 }); authed = !!(r && r.authed); } catch (e) { authed = false; }
      }
      $('#adminLogin').hidden = authed; $('#adminApp').hidden = !authed;
      if (!authed) return;
      render();
      if (!dirty) load();
    }
    // newer content came in while the dashboard was open (the quiet refresh): a draft without edits follows it; one with
    // edits says by Save that it no longer can be published as it is
    function refresh() {
      if (!authed || !draft || base === cfgStamp) return;
      if (dirty) { const d = $('#dirtyFlag'); if (d) d.textContent = flagText(); return; }
      fromCfg();
      if (document.documentElement.classList.contains('view-admin')) render();
    }
    async function login(name, pass) {
      await adminApi('/api/login', { method: 'POST', body: { password: pass }, timeout: 15000 });
      authed = true;
      user = String(name || '').trim().slice(0, 40);
      sstore.set(SS_ADMIN, user);
      draft = null; base = ''; tab = 'dashboard'; dirty = false; enter();
    }
    async function logout() {
      try { await adminApi('/api/logout', { method: 'POST', body: {} }); } catch (e) { /* the cookie goes anyway */ }
      authed = false; draft = null; dirty = false; sstore.set(SS_ADMIN, ''); enter();
    }
    // the planner session ended (14 days, a password change, a logout elsewhere)
    function lost() { authed = false; toast('Please log in again: your session has ended.'); enter(); }

    const getP = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    function setP(obj, path, val) { const ks = path.split('.'); const lastK = ks.pop(); const t = ks.reduce((o, k) => { if (o[k] == null) o[k] = {}; return o[k]; }, obj); t[lastK] = val; }
    const STALE = 'The website was changed elsewhere since you began (on the other phone, or by an update). Discard changes to load the latest, then make yours again.';
    const flagText = () => (dirty && base !== cfgStamp ? STALE : dirty ? 'Unsaved changes' : '');
    const markDirty = () => { dirty = true; const d = $('#dirtyFlag'); if (d) d.textContent = flagText(); };

    const f = (label, path, type = 'text', extra = '') => {
      const v = getP(draft, path);
      if (type === 'textarea') return `<div><label class="label">${label}</label><textarea class="input" data-path="${path}" ${extra}>${esc(v)}</textarea></div>`;
      if (type === 'checkbox') return `<label class="inline-check"><input type="checkbox" data-path="${path}" ${v ? 'checked' : ''}> ${label}</label>`;
      if (type === 'icon') return `<div><label class="label">${label}</label><select class="input" data-path="${path}">${['users', 'car', 'umbrella', 'camera-off', 'gift', 'flag', 'info', 'calendar', 'bed', 'pin', 'hanger', 'coffee', 'music'].map((o) => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
      if (type === 'group') return `<div><label class="label">${label}</label><select class="input" data-path="${path}">${[['bride', 'Bridesmaids'], ['groom', 'Groomsmen'], ['mc', 'MC']].map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
      // who books the rooms on the estate (accommodation.mode; anything but 'venue' counts as 'couple')
      if (type === 'accmode') return `<div><label class="label">${label}</label><select class="input" data-path="${path}">${[['venue', 'The estate: guests book their room with the venue themselves'], ['couple', 'You: guests ask for a room in their RSVP and you confirm it']].map(([k, l]) => `<option value="${k}" ${(k === 'venue') === (v === 'venue') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
      if (type === 'event') return `<div><label class="label">${label}</label><select class="input" data-path="${path}">${allEvents(draft).filter((e) => e.rsvp).map((e) => `<option value="${esc(e.id)}" ${e.id === v ? 'selected' : ''}>${esc(e.rsvpLabel || e.title)}</option>`).join('')}</select></div>`;
      return `<div><label class="label">${label}</label><input class="input" type="${type}" data-path="${path}" value="${esc(v)}" ${extra}></div>`;
    };
    const rowBtns = (list, i) => `<div class="icon-btns"><button type="button" class="icon-btn" data-move="${list}" data-i="${i}" data-dir="-1" aria-label="Move up">↑</button>
      <button type="button" class="icon-btn" data-move="${list}" data-i="${i}" data-dir="1" aria-label="Move down">↓</button>
      <button type="button" class="icon-btn del" data-remove="${list}" data-i="${i}">Remove</button></div>`;
    // a thumbnail that hides itself while it has no picture (see the error listener in bind)
    const thumb = (src) => `<img class="photo-thumb" src="${esc(src || '')}" alt=""${src ? '' : ' style="visibility:hidden"'}>`;

    const TABS = [['dashboard', 'RSVP Dashboard'], ['details', 'Wedding Details'], ['itinerary', 'Itinerary'], ['menu', 'Menu'], ['party', 'Bridal Party'], ['photos', 'Photos'], ['stay', 'Accommodation'], ['dress', 'Dress Code'], ['faq', 'FAQ'], ['backup', 'Backup']];

    function render() {
      const app = $('#adminApp');
      const hello = user ? user.charAt(0).toUpperCase() + user.slice(1) : `${CFG.couple.one} & ${CFG.couple.two}`;
      app.innerHTML = `<div class="card">
        <div class="admin-top"><div><h2 style="margin:0">Welcome, ${esc(hello)}</h2>
          <p class="small muted" style="margin:0">Changes go live for every guest when you save. Guest list, households, personal invitation links and room requests: <a class="text-link" href="${esc(FULL_ADMIN)}">open the full dashboard</a>.</p></div>
          <button class="btn btn-outline btn-sm" data-admin="logout">Log out</button></div>
        <div class="admin-tabs" role="tablist">${TABS.map(([k, l]) => `<button class="admin-tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join('')}</div>
        <div id="adminPanel"></div>
        ${tab !== 'dashboard' && tab !== 'backup' && draft ? `<div class="save-bar"><span class="dirty" id="dirtyFlag">${flagText()}</span>
          <button class="btn btn-outline" data-admin="discard">Discard changes</button>
          <button class="btn btn-primary" data-admin="save">Save &amp; publish</button></div>` : ''}
      </div>`;
      // (what edits the content waits for it to come from the server)
      if (!draft && tab !== 'dashboard') {
        $('#adminPanel').innerHTML = loadErr ? `<div class="notice warn"><span>The website's content could not load: ${esc(loadErr)}</span> <button type="button" class="btn btn-outline btn-sm" data-admin="reload">Try again</button></div>`
          : '<p class="muted">Loading the website\'s content...</p>';
        return;
      }
      ({ dashboard: panelDashboard, details: panelDetails, itinerary: panelItinerary, menu: panelMenu, party: panelParty, photos: panelPhotos, stay: panelStay, dress: panelDress, faq: panelFaq, backup: panelBackup })[tab]($('#adminPanel'));
    }

    function panelDetails(p) {
      p.innerHTML = `<h3>Couple</h3><div class="grid-2">${f('First name (1)', 'couple.one')}${f('First name (2)', 'couple.two')}${f('Full name (1)', 'couple.fullOne')}${f('Full name (2)', 'couple.fullTwo')}</div>
        ${f('Website title', 'couple.title')}
        <h3 class="mt-2">Wedding</h3><div class="grid-3">${f('Wedding date', 'wedding.date', 'date')}${f('Ceremony time (countdown)', 'wedding.ceremonyTime', 'time')}${f('RSVP deadline', 'rsvp.deadline', 'date')}</div>
        <div class="grid-2">${f('Venue', 'wedding.venue')}${f('Town / region', 'wedding.town')}</div>
        ${f('Google Maps link', 'wedding.mapUrl', 'url')}
        <h3 class="mt-2">Invitation code</h3>
        <p class="small muted">Guests enter this code to open the website (each household's personal link opens it too). Leave blank to keep the current code. A new code asks everyone who already opened the website for the new one.</p>
        <div class="grid-2"><div><label class="label" for="newInvite">New invitation code</label><input class="input" id="newInvite" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="e.g. 6 to 8 letters and numbers"></div></div>
        <h3 class="mt-2">Welcome message</h3>${f('Heading', 'welcome.heading')}${f('Text', 'welcome.text', 'textarea')}
        <h3 class="mt-2">RSVP page</h3>${f('Intro text ({deadline} shows the RSVP deadline)', 'rsvp.intro', 'textarea')}${f('Message shown after the deadline', 'rsvp.closedText', 'textarea')}
        ${f('Allow late RSVPs after the deadline', 'rsvp.allowLate', 'checkbox')}
        ${f('Ask where guests will stay (on the estate, nearby or a day guest; for the estate also which nights and how many people)', 'rsvp.askStay', 'checkbox')}
        ${f('Footer note', 'footerNote')}`;
    }

    function panelItinerary(p) {
      p.innerHTML = `<p class="muted">Edit each day and its events. Tick <strong>"Guests can RSVP"</strong> to add an event to the RSVP form. Use 24-hour times (e.g. 15:00). For an open-ended end time type <em>late</em>. Once replies come in, keep the events that guests answered for: replies are stored per event.</p>
        ${draft.days.map((d, di) => `<div class="edit-block"><div class="edit-row-head"><h3>${esc(d.label || 'New day')}</h3>${rowBtns('days', di)}</div>
          <div class="grid-4">${f('Day label', `days.${di}.label`)}${f('Date', `days.${di}.date`, 'date')}${f('Day title', `days.${di}.title`)}${f('Dress code', `days.${di}.dress`)}</div>
          ${d.events.map((e, ei) => `<div class="edit-row"><div class="edit-row-head"><strong>${esc(e.title || 'New event')}</strong>${rowBtns(`days.${di}.events`, ei)}</div>
            <div class="grid-4">${f('Start', `days.${di}.events.${ei}.start`, 'text', 'placeholder="15:00"')}${f('End', `days.${di}.events.${ei}.end`, 'text', 'placeholder="16:00 or late"')}
            <div style="grid-column:span 2">${f('Title', `days.${di}.events.${ei}.title`)}</div></div>
            <div class="grid-2">${f('Location', `days.${di}.events.${ei}.location`)}${f('RSVP label (shown on RSVP form)', `days.${di}.events.${ei}.rsvpLabel`)}</div>
            ${f('Description', `days.${di}.events.${ei}.desc`, 'textarea', 'style="min-height:70px"')}
            ${f('Guests can RSVP for this event', `days.${di}.events.${ei}.rsvp`, 'checkbox')}</div>`).join('')}
          <button type="button" class="btn btn-outline btn-sm mt-1" data-add-event="${di}">+ Add event</button></div>`).join('')}
        <button type="button" class="btn btn-outline mt-1" data-admin="add-day">+ Add day</button>`;
    }

    function panelMenu(p) {
      draft.menu = draft.menu || { intro: '', courses: [] };
      p.innerHTML = `<p class="muted">Guests attending the wedding reception choose one dish for each course marked <strong>"Guests choose"</strong>. Courses that aren't marked are shown as served to everyone.</p>
        <div class="notice info">${ic('info', 'ic-circle ic-sm')}<span>Dishes are counted by the dish itself, so you can fix a dish's name at any time. A dish you remove after guests chose it still shows in the meal numbers under its old name.</span></div>
        ${f('Intro text on the RSVP menu step', 'menu.intro', 'textarea', 'style="min-height:70px"')}
        ${f('Menu is required for guests attending', 'weddingEventId', 'event')}
        ${draft.menu.courses.map((c, ci) => `<div class="edit-block"><div class="edit-row-head"><h3>${esc(c.title || 'New course')}</h3>${rowBtns('menu.courses', ci)}</div>
          <div class="grid-2">${f('Course name', `menu.courses.${ci}.title`)}<div>${f('Guests choose one option', `menu.courses.${ci}.choose`, 'checkbox')}</div></div>
          ${(c.options || []).map((o, oi) => `<div class="edit-row"><div class="edit-row-head"><strong>${esc(o.name || 'New dish')}</strong>${rowBtns(`menu.courses.${ci}.options`, oi)}</div>
            <div class="grid-2">${f('Dish name', `menu.courses.${ci}.options.${oi}.name`)}${f('Description (optional)', `menu.courses.${ci}.options.${oi}.desc`)}</div></div>`).join('')}
          <button type="button" class="btn btn-outline btn-sm mt-1" data-add-dish="${ci}">+ Add dish</button></div>`).join('')}
        <button type="button" class="btn btn-outline mt-1" data-admin="add-course">+ Add course</button>`;
    }

    function panelParty(p) {
      draft.bridalParty = draft.bridalParty || { intro: '', people: [] };
      p.innerHTML = `<p class="muted">Upload a photo for each person (portrait photos work best; they are cropped to an arch). Until a photo is added, their initials are shown.</p>
        ${f('Intro text', 'bridalParty.intro', 'textarea')}
        ${draft.bridalParty.people.map((m, i) => `<div class="edit-row"><div class="edit-row-head"><strong>${esc(m.name || 'New person')}</strong>${rowBtns('bridalParty.people', i)}</div>
          <div class="photo-edit">${thumb(m.photo)}
          <div><div class="grid-3">${f('Name', `bridalParty.people.${i}.name`)}${f('Role', `bridalParty.people.${i}.role`)}${f('Group', `bridalParty.people.${i}.group`, 'group')}</div>
          ${f('Photo (upload one, or a path on this website)', `bridalParty.people.${i}.photo`)}
          <div class="btn-row" style="margin-top:.8rem"><label class="btn btn-outline btn-sm file-btn">Upload photo<input type="file" accept="image/*" data-upload="bridalParty.people.${i}.photo"></label>
          ${m.photo ? `<button type="button" class="icon-btn del" data-clear="bridalParty.people.${i}.photo">Remove photo</button>` : ''}</div></div></div></div>`).join('')}
        <button type="button" class="btn btn-outline btn-sm mt-1" data-admin="add-person">+ Add person</button>`;
    }

    function photoRow(path, label, withCaption) {
      const val = getP(draft, path);
      const src = withCaption ? (val && val.src) : val;
      const srcPath = withCaption ? path + '.src' : path;
      return `<div class="photo-edit">${thumb(src)}
        <div>${label ? `<strong>${label}</strong>` : ''}
          ${f('Photo (upload one, or a path on this website)', srcPath)}
          ${withCaption ? f('Caption (optional)', path + '.caption') : ''}
          <div class="btn-row" style="margin-top:.8rem"><label class="btn btn-outline btn-sm file-btn">Upload photo<input type="file" accept="image/*" data-upload="${srcPath}"></label></div></div></div>`;
    }
    // (only what the website shows: its "Stay for the weekend" photo and favourites strip are gone, their data is kept)
    function panelPhotos(p) {
      const list = (key, title) => `<div class="edit-block"><h3>${title}</h3>
        ${(draft.photos[key] || []).map((ph, i) => `<div class="edit-row"><div class="edit-row-head"><strong>Photo ${i + 1}</strong>${rowBtns('photos.' + key, i)}</div>${photoRow(`photos.${key}.${i}`, '', true)}</div>`).join('')}
        <div class="btn-row"><label class="btn btn-outline btn-sm file-btn">+ Upload photos<input type="file" accept="image/*" multiple data-upload-list="${key}"></label>
        <button type="button" class="btn btn-outline btn-sm" data-add-photo="${key}">+ Add by path</button></div></div>`;
      p.innerHTML = `<p class="muted">Uploaded photos are stored on the wedding server (resized, location data removed) and appear for guests when you save. Photos must come from this website: links to other websites are not shown.</p>
        <div class="edit-block"><h3>Feature photos</h3>
          ${photoRow('photos.hero', 'Home page main photo (arched, portrait works best)')}
          <hr style="border:0;border-top:1px solid var(--line);margin:1.2rem 0">${photoRow('photos.portrait', 'Welcome section photo (portrait)')}</div>
        ${list('gallery', 'Gallery')}${list('venue', 'Venue photos (first three are shown)')}`;
    }

    function panelStay(p) {
      p.innerHTML = `<div class="edit-block"><h3>Venue accommodation</h3>
        ${f('Heading', 'accommodation.heading')}${f('Text', 'accommodation.text', 'textarea')}
        <div class="grid-3">${f('Booking reference', 'accommodation.reference')}${f('Phone', 'accommodation.phone')}${f('Email', 'accommodation.email', 'email')}</div>
        ${f('Breakfast is included', 'accommodation.breakfastIncluded', 'checkbox')}
        ${f('Rooms on the estate are booked with', 'accommodation.mode', 'accmode')}
        <p class="small muted">This sets the wording on this website’s Stay and RSVP sections. The full dashboard and the map pages have the same switch under their own content editor.</p>
        <h3 class="mt-2">Pre-typed booking email</h3>
        <p class="small muted">Opens when guests tap the email address. <code>{ref}</code> is replaced with the booking reference.</p>
        ${f('Email subject', 'accommodation.emailSubject')}${f('Email text', 'accommodation.emailBody', 'textarea', 'style="min-height:260px"')}</div>
        <div class="edit-block"><h3>Nearby accommodation</h3>
        <p class="small muted">Add up to ${MAX_NEARBY_PHOTOS} photos per place. Distance is the approximate driving distance from Highland Meadow in km.</p>
        ${draft.nearby.map((n, i) => {
          const photos = n.photos || [];
          return `<div class="edit-row"><div class="edit-row-head"><strong>${esc(n.name || 'New place')}</strong>${rowBtns('nearby', i)}</div>
          <div class="grid-3">${f('Name', `nearby.${i}.name`)}${f('Area', `nearby.${i}.area`)}${f('Distance from Highland Meadow (km)', `nearby.${i}.distanceKm`, 'number', 'min="0" step="1"')}</div>
          ${f('Description', `nearby.${i}.blurb`, 'textarea', 'style="min-height:70px"')}
          <div class="grid-3">${f('Phone', `nearby.${i}.phone`)}${f('Email', `nearby.${i}.email`)}${f('Website', `nearby.${i}.url`, 'url')}</div>
          ${f('Google Maps link', `nearby.${i}.mapUrl`, 'url')}
          <p class="label">Photos (${photos.length} of ${MAX_NEARBY_PHOTOS})</p>
          <div class="thumb-row">${photos.map((ph, pi) => `<div class="thumb-item"><img src="${esc(ph.src)}" alt=""><button type="button" class="icon-btn del" data-remove="nearby.${i}.photos" data-i="${pi}">Remove</button></div>`).join('')}</div>
          ${photos.length < MAX_NEARBY_PHOTOS ? `<div class="btn-row" style="margin-top:.8rem"><label class="btn btn-outline btn-sm file-btn">+ Upload photos<input type="file" accept="image/*" multiple data-upload-nearby="${i}"></label></div>` : ''}
          </div>`;
        }).join('')}
        <button type="button" class="btn btn-outline btn-sm mt-1" data-admin="add-nearby">+ Add place</button></div>`;
    }

    function panelDress(p) {
      // each day's look: its title, the occasion line, what to wear and a kind tip (empty fields are not shown)
      const day = (key, name) => `<div class="edit-block"><h3>${name}</h3>
        <div class="grid-2">${f('Title (the dress code)', `dressCode.${key}.title`)}${f('Occasion line', `dressCode.${key}.when`)}</div>
        ${f('What to wear', `dressCode.${key}.text`, 'textarea')}${f('A kind tip', `dressCode.${key}.tip`, 'textarea')}</div>`;
      const WEARS = [['ladies', 'For the ladies'], ['gents', 'For the gents'], ['both', 'For the ladies and the gents'], ['accent', 'As accents']];
      // (no intro and no wedding-party title: the website no longer shows them; their data is kept)
      p.innerHTML = `${day('friday', 'Friday')}${day('saturday', 'Saturday')}${day('sunday', 'Sunday')}
        <div class="edit-block"><h3>Wedding party</h3>${f('What they wear (the line under the wedding party on the website)', 'dressCode.party.text', 'textarea')}</div>
        <div class="edit-block"><h3>The palette's words</h3>${f('Under the palette heading', 'dressCode.paletteText', 'textarea')}
          <div class="grid-2">${f('For the ladies', 'dressCode.ladies', 'textarea')}${f('For the gents', 'dressCode.gents', 'textarea')}</div>
          <div class="grid-2">${f('As accents', 'dressCode.note', 'textarea')}${f('For the bride (white and ivory)', 'dressCode.bride', 'textarea')}</div></div>
        <div class="edit-block"><h3>Colour palette</h3>${draft.palette.map((c, i) => {
          const w = HEX6.test(c.hex || '') ? wearOf(c) : (c.wear || 'ladies');
          return `<div class="grid-4" style="align-items:end">${f('Name', `palette.${i}.name`)}${f('HEX', `palette.${i}.hex`)}
          <div><label class="label">Shown</label><select class="input" data-path="palette.${i}.wear">${WEARS.map(([k, l]) => `<option value="${k}" ${k === w ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div style="height:46px;border-radius:10px;border:1px solid var(--line);background:${esc(c.hex)}"></div></div>`;
        }).join('')}</div>`;
    }

    function panelFaq(p) {
      p.innerHTML = `<p class="muted">Add, edit, reorder or remove questions.</p>
        ${(draft.faq || []).map((q, i) => `<div class="edit-row"><div class="edit-row-head"><strong>${esc(q.q || 'New question')}</strong>${rowBtns('faq', i)}</div>
          ${f('Question', `faq.${i}.q`)}
          ${f('Answer', `faq.${i}.a`, 'textarea', 'style="min-height:80px"')}</div>`).join('')}
        <button type="button" class="btn btn-outline btn-sm mt-1" data-admin="add-faq">+ Add question</button>`;
    }

    const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    function panelBackup(p) {
      p.innerHTML = `<p>Download a backup of all website content, or restore one. The guest list, households and RSVPs are kept on the wedding server: see <a class="text-link" href="${esc(FULL_ADMIN)}">the full dashboard</a>.</p>
        <div class="btn-row"><button class="btn btn-primary" data-admin="export">Download content backup (.json)</button>
        <label class="btn btn-outline file-btn">Restore from backup<input type="file" accept="application/json" data-admin-import></label>
        <button class="btn btn-danger" data-admin="reset">Reset to original content</button></div>
        <h3 class="mt-2">Saved versions</h3><p class="small muted">The last 20 times the website was saved. Restoring one publishes it at once.</p>
        <div id="s2History"><p class="muted">Loading...</p></div>`;
      loadHistory();
    }
    async function loadHistory() {
      let r;
      try { r = await adminApi('/api/rsvp-admin/site2/config'); } catch (e) { if (e.status === 401) return lost(); const b = $('#s2History'); if (b) b.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
      const box = $('#s2History');
      if (!box) return;
      box.innerHTML = (r.history || []).length
        ? `<div class="table-wrap"><table class="data"><thead><tr><th>Saved</th><th>What</th><th></th></tr></thead><tbody>${r.history.map((h) => `<tr><td>${esc(when(h.saved_at))}</td>
          <td>${h.current ? '<span class="status yes">Live now</span>' : esc(/^restore/.test(h.note) ? 'A restored version' : 'Saved')}</td>
          <td>${h.current ? '' : `<button type="button" class="btn btn-outline btn-sm" data-restore="${esc(h.id)}">Restore</button>`}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Nothing saved yet: the website shows the original content.</p>';
    }
    // a server answer with the content -> the page shows it (and the saved copy on this device is updated)
    function published(r) {
      const data = { defaults: r.defaults, override: r.override, live: r.live };
      useConfig(data); writeCache(data);
      fromCfg(); renderAll(); render();
    }
    async function restoreVersion(id) {
      if (!confirm('Restore this version? It replaces what guests see now.')) return;
      try { published(await adminApi(`/api/rsvp-admin/site2/config/restore/${encodeURIComponent(id)}`, { method: 'POST', body: {} })); toast('Restored. The website has been updated.'); }
      catch (e) { if (e.status === 401) return lost(); toast('Restore failed: ' + e.message); }
    }

    /* ----- RSVP dashboard (from the server's overview of every invitation) ----- */
    const guestName = (m) => (m.plus_one ? ((m.answers && m.answers.plus_one_name) || 'Plus one') : `${m.name} ${m.surname}`.trim());
    const householdName = (pt) => (pt ? pt.label || joinNames(pt.members.filter((m) => !m.plus_one).map((m) => m.name)) : '');
    function summarise(o) {
      const evs = rsvpEvents();
      const cs = choiceCourses();
      const wid = evs.some((e) => e.id === CFG.weddingEventId) ? CFG.weddingEventId : null;
      const rows = [];
      (o.parties || []).forEach((pt) => pt.members.forEach((m) => rows.push({ m, pt, a: m.answers })));
      (o.unassigned || []).forEach((m) => rows.push({ m, pt: null, a: m.answers }));
      const yes = rows.filter((r) => r.a && r.a.attending === 'yes');
      const atDinner = yes.filter((r) => (wid ? r.a.events && r.a.events[wid] : true));
      const dishName = (c, id, r) => { const o2 = c.options.find((x) => x.id === id); return o2 ? o2.name : `${(r && r.a.menu_names && r.a.menu_names[c.id]) || id} (no longer on the menu)`; };
      const meals = cs.map((c) => {
        const counts = new Map(c.options.map((x) => [x.name, 0]));
        let open = 0;
        atDinner.forEach((r) => {
          const id = r.a.menu && r.a.menu[c.id];
          if (!id) { open += 1; return; }
          const n = dishName(c, id, r);
          counts.set(n, (counts.get(n) || 0) + 1);
        });
        return { c, counts: [...counts], open };
      });
      return { o, evs, cs, rows, yes, meals, dishName };
    }
    async function panelDashboard(p) {
      p.innerHTML = '<p class="muted">Loading RSVPs...</p>';
      let o;
      try { o = await adminApi('/api/rsvp-admin/overview', { timeout: 30000 }); }
      catch (e) { if (e.status === 401) return lost(); p.innerHTML = `<div class="notice warn">Could not load RSVPs: ${esc(e.message)}</div>`; return; }
      const s = last = summarise(o);
      const t = o.totals || {};
      const attending = t.attending || 0;
      const evCount = (id) => s.yes.filter((r) => r.a.events && r.a.events[id]).length;
      const diets = s.yes.filter((r) => r.a.dietary);
      const songs = (o.parties || []).filter((pt) => pt.song_title || pt.song_artist);
      const waiting = (o.parties || []).filter((pt) => pt.members.some((m) => !m.answers));
      const replied = s.rows.filter((r) => r.a);
      const golfers = s.rows.filter((r) => r.m.golf), roomed = s.rows.filter((r) => r.m.room);
      p.innerHTML = `
        <div class="stats"><div class="stat"><b>${t.guests || 0}</b><span>Guests invited</span></div><div class="stat"><b>${attending}</b><span>Attending</span></div>
        <div class="stat rose"><b>${t.declined || 0}</b><span>Declined</span></div><div class="stat"><b>${t.pending || 0}</b><span>Awaiting reply</span></div></div>
        <div class="grid-3" style="gap:1.2rem">
          <div class="edit-block" style="margin-top:0"><h3>Headcount per event</h3>
            ${s.evs.map((e) => { const n = evCount(e.id); return `<div class="event-stat"><div><span>${esc(e.rsvpLabel || e.title)}</span><span>${n}</span></div><div class="bar"><i style="width:${attending ? Math.round(n / Math.max(attending, 1) * 100) : 0}%"></i></div></div>`; }).join('')}</div>
          <div class="edit-block menu-count" style="margin-top:0"><h3>Meal numbers for the kitchen</h3>
            ${s.meals.map(({ c, counts, open }) => `<h4>${esc(c.title)}</h4>${counts.map(([n, k]) => `<div class="event-stat"><div><span>${esc(n)}</span><span>${k}</span></div></div>`).join('')}
              ${open ? `<div class="event-stat"><div><span class="muted">Not chosen yet</span><span>${open}</span></div></div>` : ''}`).join('') || '<p class="muted">No courses set up.</p>'}
            ${courses().filter((c) => !c.choose).map((c) => `<p class="small muted">${esc(c.title)}: served to all guests at the dinner.</p>`).join('')}</div>
          <div class="edit-block" style="margin-top:0"><h3>Still to reply</h3>
            ${waiting.map((pt) => `<div class="event-stat">${esc(householdName(pt))} <span class="muted">(${pt.members.filter((m) => !m.answers).length} of ${pt.members.length})</span></div>`).join('') || '<p class="muted">Everyone has replied!</p>'}</div>
        </div>
        <div class="grid-2" style="gap:1.2rem">
          <div class="edit-block"><h3>Dietary requirements</h3>${diets.map((r) => `<div class="event-stat"><div><span>${esc(guestName(r.m))}</span><span class="muted">${esc(r.a.dietary)}</span></div></div>`).join('') || '<p class="muted">None yet.</p>'}</div>
          <div class="edit-block"><h3>Song requests</h3>${songs.map((pt) => `<div class="event-stat"><div><span>${esc(pt.song_title || '')}${pt.song_artist ? ` <span class="muted">by ${esc(pt.song_artist)}</span>` : ''}</span><span class="muted">${esc(householdName(pt))}</span></div></div>`).join('') || '<p class="muted">None yet.</p>'}</div>
        </div>
        <div class="grid-2" style="gap:1.2rem">
          <div class="edit-block"><h3>May play golf (${golfers.length})</h3><p class="small muted">From your Guest List sheet: the column whose heading says Golf (Yes, 1 or x). Only these guests are offered golf; everyone else chooses the spa or neither.</p>
            ${golfers.length ? `<details><summary>Show the names</summary>${golfers.map((r) => `<div class="event-stat">${esc(guestName(r.m))}</div>`).join('')}</details>` : '<p class="muted">Nobody is marked yet, so nobody is offered golf.</p>'}</div>
          <div class="edit-block"><h3>A room on the estate set aside (${roomed.length})</h3><p class="small muted">From your Guest List sheet: the on-site accommodation column (1 or Yes). These guests are told a room is set aside for them and are not asked where they will stay.</p>
            ${roomed.length ? `<details><summary>Show the names</summary>${roomed.map((r) => `<div class="event-stat">${esc(guestName(r.m))}</div>`).join('')}</details>` : '<p class="muted">Nobody is marked.</p>'}</div>
        </div>
        <div class="admin-top mt-2"><h3 style="margin:0">All responses</h3><div class="btn-row" style="margin:0"><button class="btn btn-outline btn-sm" data-admin="refresh">Refresh</button>
          <button class="btn btn-primary btn-sm" data-admin="csv">Download CSV</button></div></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Invitation</th><th>Status</th>${s.evs.map((e) => `<th>${esc(e.rsvpLabel || e.title)}</th>`).join('')}<th>Stay</th>${s.cs.map((c) => `<th>${esc(c.title)}</th>`).join('')}<th>Dietary</th><th>Song</th><th>Artist</th><th>Email</th><th>Phone</th><th>Message</th></tr></thead>
        <tbody>${replied.map((r) => { const a = r.a.attending === 'yes'; const pt = r.pt || {}; return `<tr><td><strong>${esc(guestName(r.m))}</strong></td><td>${esc(householdName(r.pt))}</td>
          <td><span class="status ${a ? 'yes' : 'no'}">${a ? 'Attending' : 'Declined'}</span></td>
          ${s.evs.map((e) => `<td>${a && r.a.events && r.a.events[e.id] ? '✔' : ''}</td>`).join('')}
          <td>${esc(a ? stayText(r.a) : '')}</td>
          ${s.cs.map((c) => `<td>${a && r.a.menu && r.a.menu[c.id] ? esc(s.dishName(c, r.a.menu[c.id], r)) : ''}</td>`).join('')}
          <td>${esc(a ? r.a.dietary : '')}</td><td>${esc(pt.song_title || '')}</td><td>${esc(pt.song_artist || '')}</td><td>${esc(pt.email || '')}</td><td>${esc(pt.phone || '')}</td><td>${esc(pt.message || '')}</td></tr>`; }).join('')
          || `<tr><td colspan="${10 + s.evs.length + s.cs.length}" class="muted">No RSVPs yet.</td></tr>`}</tbody></table></div>
        <p class="small muted mt-1">Room requests, households and personal invitation links: <a class="text-link" href="${esc(FULL_ADMIN)}">the full dashboard</a>. Its CSV has every guest: <a class="text-link" href="/api/rsvp-admin/export.csv" download>download it here</a>.</p>`;
    }
    function stayText(a) {
      if (a.stay !== 'estate') return { nearby: 'Nearby', day: 'Day guest', unsure: 'Not sure yet' }[a.stay] || '';
      const n = ROOM_NIGHTS.filter((x) => a.nights && a.nights[x.id]).map((x) => x.label.slice(0, 3));
      return `Estate room${n.length ? ` (${n.join(', ')})` : ''}`;
    }
    // a spreadsheet must never run guest text as a formula; phone numbers and plain numbers stay as typed
    const cell = (v) => {
      let x = v == null ? '' : String(v);
      if (/^[=@\t\r]/.test(x) || (/^[+-]/.test(x) && !/^[+-]?[\d\s().,/-]*\d[\d\s().,/-]*$/.test(x))) x = `'${x}`;
      return `"${x.replace(/"/g, '""')}"`;
    };
    function downloadCSV() {
      if (!last) return;
      const s = last;
      const head = ['Name', 'Invitation', 'Code', 'Attending', ...s.evs.map((e) => e.rsvpLabel || e.title), 'Stay', 'Room nights', 'Room people',
        ...s.cs.map((c) => c.title), 'Dietary', 'Song', 'Artist', 'Email', 'Phone', 'Message', 'Replied'];
      const rows = s.rows.filter((r) => r.a).map((r) => {
        const a = r.a.attending === 'yes';
        const pt = r.pt || {};
        return [guestName(r.m), householdName(r.pt), pt.code || '', a ? 'Yes' : 'No',
          ...s.evs.map((e) => (a && r.a.events && r.a.events[e.id] ? 'Yes' : '')),
          a ? stayText(r.a) : '', a && r.a.stay === 'estate' ? ROOM_NIGHTS.filter((x) => r.a.nights && r.a.nights[x.id]).map((x) => x.label).join(' ') : '',
          a && r.a.stay === 'estate' && pt.room ? pt.room.people : '',
          ...s.cs.map((c) => (a && r.a.menu && r.a.menu[c.id] ? s.dishName(c, r.a.menu[c.id], r) : '')),
          a ? r.a.dietary : '', pt.song_title || '', pt.song_artist || '', pt.email || '', pt.phone || '', pt.message || '', r.m.responded_at || ''];
      });
      const csv = [head, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
      a.download = `smith-wedding-rsvps-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    /* ----- photos: uploaded to the server (it resizes, strips location data and stores them) ----- */
    function shrink(file, max, q) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          c.toBlob((b) => (b ? resolve(b) : reject(new Error('That photo could not be read'))), 'image/jpeg', q);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be read')); };
        img.src = url;
      });
    }
    async function uploadFile(file) {
      let blob = file;
      // big or unusual photos are made smaller here first (the server's limit is 8 MB); HEIC goes as it is
      if (file.size > 4.5 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type)) { try { blob = await shrink(file, 2400, 0.86); } catch (e) { blob = file; } }
      if (blob.size > 8 * 1024 * 1024) throw new Error('That photo is larger than 8 MB. Please choose a smaller one.');
      const form = new FormData();
      form.append('file', blob, blob === file ? (file.name || 'photo.jpg') : 'photo.jpg');
      const r = await adminApi('/api/rsvp-admin/upload', { method: 'POST', form, timeout: 120000 });
      return r.url;
    }

    // what goes to the server: times as HH:MM, nothing the server computes
    function prepareDraft(d) {
      delete d.live;
      const pad = (t) => (typeof t === 'string' ? (/^\d:\d{2}$/.test(t.trim()) ? '0' + t.trim() : t.trim()) : t);
      (d.days || []).forEach((day) => (day.events || []).forEach((e) => { e.start = pad(e.start); if (!/^late$/i.test(String(e.end || '').trim())) e.end = pad(e.end); }));
      if (d.wedding) d.wedding.ceremonyTime = pad(d.wedding.ceremonyTime);
      return d;
    }
    async function save() {
      const btn = $('[data-admin="save"]');
      const done = () => { if (btn) { btn.disabled = false; btn.textContent = 'Save & publish'; } };
      const code = (($('#newInvite') || {}).value || '').trim();
      if (code && !/^[A-Za-z0-9]{4,40}$/.test(code.replace(/[\s._-]/g, ''))) { toast('The invitation code needs at least 4 letters or numbers (no symbols).'); return; }
      if (!draft) return;
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      try {
        const out = prepareDraft(clone(draft)), from = base;
        if (JSON.stringify(out).indexOf('data:image') !== -1) throw new Error('Some photos have not finished uploading yet');
        // never over newer content: the server must still have what this draft was taken from (the whole draft is
        // published, so a draft from before the other phone saved, or before an update, would put the old back)
        const now = await adminApi('/api/rsvp-admin/site2/config', { timeout: 20000 });
        if (contentStamp(now) !== from) {
          done();
          take(now);
          if (!dirty) { fromCfg(); render(); toast('This page now shows the latest version of the website.'); return; }
          const d = $('#dirtyFlag'); if (d) d.textContent = flagText();
          toast('Not published: see the note by Save.');
          return;
        }
        const r = await adminApi('/api/rsvp-admin/site2/config', { method: 'PUT', body: { config: out }, timeout: 30000 });
        if (code) {
          await adminApi('/api/rsvp-admin/invite-code', { method: 'POST', body: { code } });
          // every earlier invitation is asked for the new code: this device gets it now
          const g = await gateCheck({ code });
          if (g.ok) acceptInvite(g, code);
        }
        published(r);
        toast(code ? 'Saved! The new invitation code is active.' : 'Saved! The website has been updated.');
      } catch (e) {
        done();
        if (e.status === 401) return lost();
        toast('Save failed: ' + e.message);
      }
    }

    function bind() {
      $('#adminLogin').addEventListener('submit', async (e) => {
        e.preventDefault(); const m = $('#adminMsg'); m.className = 'form-msg'; m.textContent = 'Checking...';
        try { await login($('#adminUser').value, $('#adminPass').value); m.textContent = ''; $('#adminPass').value = ''; }
        catch (err) { m.className = 'form-msg error'; m.textContent = err.status === 401 ? 'That password is not right. It is the planner password.' : err.message; }
      });
      const app = $('#adminApp');
      // thumbnails hide while their picture can't load (an empty or wrong path)
      app.addEventListener('error', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('photo-thumb')) t.style.visibility = 'hidden'; }, true);
      app.addEventListener('input', (e) => {
        const el = e.target;
        if (el.id === 'newInvite') { markDirty(); return; }
        if (!el.dataset.path || el.tagName === 'SELECT') return;
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.type === 'number') v = el.value === '' ? '' : Number(el.value);
        setP(draft, el.dataset.path, v); markDirty();
        if (el.closest('.photo-edit') && /(src|hero|portrait|story|photo)$/.test(el.dataset.path)) { const t = el.closest('.photo-edit').querySelector('.photo-thumb'); t.style.visibility = ''; t.src = el.value; }
      });
      app.addEventListener('change', async (e) => {
        const el = e.target;
        const fail = (err) => { if (err && err.status === 401) lost(); else toast('Upload failed: ' + (err && err.message)); };
        if (el.dataset.path && (el.type === 'checkbox' || el.tagName === 'SELECT')) { setP(draft, el.dataset.path, el.type === 'checkbox' ? el.checked : el.value); markDirty(); }
        if (el.dataset.upload && el.files[0]) {
          toast('Uploading photo...');
          try { setP(draft, el.dataset.upload, await uploadFile(el.files[0])); markDirty(); render(); toast('Photo ready. Remember to save.'); } catch (err) { fail(err); }
        }
        if (el.dataset.uploadList && el.files.length) {
          toast(`Uploading ${el.files.length} photo(s)...`);
          try { for (const file of el.files) draft.photos[el.dataset.uploadList].push({ src: await uploadFile(file), caption: '' }); markDirty(); render(); toast('Photos added. Remember to save.'); }
          catch (err) { markDirty(); render(); fail(err); }
        }
        if (el.dataset.uploadNearby && el.files.length) {
          const n = draft.nearby[+el.dataset.uploadNearby]; n.photos = n.photos || [];
          const room = MAX_NEARBY_PHOTOS - n.photos.length;
          const files = Array.from(el.files).slice(0, room);
          if (el.files.length > room) toast(`Only ${MAX_NEARBY_PHOTOS} photos per place. Adding the first ${room}.`);
          try { for (const file of files) n.photos.push({ src: await uploadFile(file), caption: '' }); markDirty(); render(); toast('Photos added. Remember to save.'); }
          catch (err) { markDirty(); render(); fail(err); }
        }
        if (el.hasAttribute('data-admin-import') && el.files[0]) {
          try { const txt = await el.files[0].text(); const j = JSON.parse(txt); if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('not an object'); delete j.live; delete j._envelope; draft = deepMerge(clone(CFG_BASE), j); markDirty(); tab = 'details'; render(); toast('Backup loaded. Review and save to publish.'); }
          catch (err) { toast('That file is not a valid backup.'); }
        }
      });
      app.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
        if (b.dataset.restore) { restoreVersion(b.dataset.restore); return; }
        if (b.dataset.clear) { setP(draft, b.dataset.clear, ''); markDirty(); render(); return; }
        if (b.dataset.move) { const list = getP(draft, b.dataset.move); const i = +b.dataset.i, j = i + +b.dataset.dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; markDirty(); render(); return; }
        if (b.dataset.remove) { if (!confirm('Remove this item?')) return; getP(draft, b.dataset.remove).splice(+b.dataset.i, 1); markDirty(); render(); return; }
        if (b.dataset.addEvent) { const d = draft.days[+b.dataset.addEvent]; d.events.push({ id: `${d.id}-${Date.now().toString(36)}`, start: '', end: '', title: 'New event', location: '', desc: '', rsvp: false, rsvpLabel: '' }); markDirty(); render(); return; }
        if (b.dataset.addDish) { const c = draft.menu.courses[+b.dataset.addDish]; c.options = c.options || []; c.options.push({ id: uid(c.id || 'dish'), name: '', desc: '' }); markDirty(); render(); return; }
        if (b.dataset.addPhoto) { draft.photos[b.dataset.addPhoto].push({ src: '', caption: '' }); markDirty(); render(); return; }
        const a = b.dataset.admin;
        if (a === 'logout') logout();
        else if (a === 'save') save();
        else if (a === 'discard') { fromCfg(); render(); load(); toast('Changes discarded'); }
        else if (a === 'reload') { load(); render(); }
        else if (a === 'add-day') { draft.days.push({ id: 'day-' + Date.now().toString(36), label: 'New day', date: CFG.wedding.date, title: '', dress: '', events: [] }); markDirty(); render(); }
        else if (a === 'add-course') { draft.menu.courses.push({ id: uid('course'), title: 'New course', choose: true, options: [] }); markDirty(); render(); }
        else if (a === 'add-person') { draft.bridalParty.people.push({ name: '', role: '', group: 'bride', photo: '' }); markDirty(); render(); }
        else if (a === 'add-nearby') { draft.nearby.push({ name: '', area: '', blurb: '', phone: '', email: '', url: '', distanceKm: '', mapUrl: '', photos: [] }); markDirty(); render(); }
        else if (a === 'add-faq') { draft.faq = draft.faq || []; draft.faq.push({ icon: 'info', q: '', a: '' }); markDirty(); render(); }
        else if (a === 'refresh') render();
        else if (a === 'csv') downloadCSV();
        else if (a === 'export') { const out = prepareDraft(clone(draft)); const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }); const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'smith-wedding-content.json'; l.click(); }
        else if (a === 'reset') { if (!confirm('Reset all website content to the original version? (RSVPs are not affected)')) return; draft = clone(CFG_BASE); markDirty(); tab = 'details'; render(); toast('Original content loaded. Save to publish.'); }
      });
      window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    }
    return { enter, bind, refresh };
  })();

  /* ---------------- Global events ---------------- */
  function bindGlobal() {
    // (a part of the page that is missing never stops the rest from starting)
    const on = (sel, type, fn) => { const el = $(sel); if (el) el.addEventListener(type, fn); };
    window.addEventListener('hashchange', route);
    // fresh content that waited while the guest typed is drawn once the field is left (and nothing else holds it), after
    // the press that left it has landed: a render between a mouse's down and its click would take away what it pressed
    let pressing = false;
    window.addEventListener('pointerdown', () => { pressing = true; }, { capture: true, passive: true });
    ['pointerup', 'pointercancel'].forEach((t) => window.addEventListener(t, () => { pressing = false; }, { capture: true, passive: true }));
    const flush = (n = 0) => { if (!renderPending) return; if (pressing && n < 20) { setTimeout(() => flush(n + 1), 150); return; } renderFresh(); };
    document.addEventListener('focusout', () => { if (renderPending) setTimeout(() => flush(), 0); });
    // a personal link (#rsvp=CODE) opened in a tab that already shows the site
    window.addEventListener('hashchange', async () => {
      if (!/^#rsvp=/.test(location.hash)) return;
      const code = takePersonalCode();
      toRsvpPage();
      if (!code) { route(); return; }
      const r = await gateCheck({ code });
      if (r.ok) { acceptInvite(r, code); if (r.kind === 'party') { sstore.set(SS_MANUAL, ''); resetRsvp(false); } }
      route();
      if (!r.ok) { const m = $('#lookupMsg'); m.className = 'form-msg error'; m.textContent = gateProblem(r) || GATE_MSG.link; }
    });
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action],[data-lightbox],[data-lb]');
      if (!t) return;
      if (t.dataset.lightbox) { openLightbox(lightboxList(t.dataset.lightbox), +t.dataset.index); return; }
      if (t.dataset.lb) { if (t.dataset.lb === 'close') closeLb(); else { lbIdx = (lbIdx + (t.dataset.lb === 'next' ? 1 : -1) + lbList.length) % lbList.length; showLb(); } return; }
      const a = t.dataset.action;
      if (a === 'ics-all') downloadICS(allEvents(), 'smith-wedding-weekend.ics');
      else if (a === 'copy-ref') copyText(CFG.accommodation.reference, 'Booking reference');
      else if (a === 'rsvp-reset') resetRsvp(true);
      else if (a === 'rsvp-refind') { const q = lookup; resetRsvp(false); if (q) openParty(q); }
      else if (a === 'rsvp-use-code') { e.preventDefault(); showCodeBox(); }
      else if (a === 'rsvp-find-code') lookupByCode();
      // (replies closed since the thank-you was drawn, by the deadline passing or the couple: the card says so instead)
      else if (a === 'rsvp-edit') { if (rsvpClosed()) { renderRsvpShell(); rpScroll($('#rsvpDeadlineNotice')); rpFocus('#rsvpDeadlineNotice .rp-h'); } else startRsvp(); }
      else if (a === 'rsvp-next') goStep(1);
      else if (a === 'rsvp-back') goStep(-1);
      else if (a === 'ics-mine') downloadICS(myEvents(), 'my-smith-wedding-events.ics');
    });
    on('#lightbox', 'click', (e) => { if (e.target.id === 'lightbox') closeLb(); });
    document.addEventListener('keydown', (e) => {
      const lb = $('#lightbox');
      if (!lb || lb.hidden) return;
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowRight') $('[data-lb="next"]').click();
      if (e.key === 'ArrowLeft') $('[data-lb="prev"]').click();
    });
    on('#rsvpLookup', 'submit', (e) => { e.preventDefault(); lookupByName(); });
    on('#lookupCode', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookupByCode(); } });
    on('#rsvpForm', 'submit', submitRsvp);
    on('#rsvpForm', 'input', rpAnswered);
    // Live behaviour: who is coming (a plus one's name, a plus one whose host declines) and where the household
    // stays (the nights of a room on the estate)
    on('#rsvpForm', 'change', (e) => {
      if (e.target.id === 'roomPeople') { R.roomPeople = Number(e.target.value) || 0; return; }
      if (!((step === 1 && e.target.type === 'radio') || (step === 2 && e.target.name === 'stay'))) return;
      const id = e.target.id;
      const name = e.target.name;
      readStep();
      renderRsvpForm();
      const back = (id && document.getElementById(id)) || $(`#rsvpForm input[name="${name}"]:checked`);
      if (back) back.focus({ preventScroll: true });
    });
    // Enter key moves to the next step instead of submitting early
    on('#rsvpForm', 'keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !$('#rsvpSubmit')) { e.preventDefault(); goStep(1); }
    });
    Admin.bind();
  }

  // A returning guest who opens at the top sees the invitation card (the page's largest paint, static HTML) at once:
  // the chapters, held under html.ww-hold until the first 'ww:route' anyway, are built a frame later. A deep link or
  // a restored place is built at once, as before (the card is not what they see first).
  function opensAtTop() {
    const h = location.hash.slice(1);
    if (h && h !== 'home') return false;
    try { const r = JSON.parse(sessionStorage.getItem('ww.y') || 'null'); if (r && r.h === location.hash && r.y > 0) return false; } catch (e) { /* no storage */ }
    return true;
  }
  const nextFrame = () => new Promise((res) => { requestAnimationFrame(() => setTimeout(res, 0)); setTimeout(res, 120); });

  (async function init() {
    bindGate();
    const info = await openInvitation();
    if (info.cached && opensAtTop()) await nextFrame();
    renderAll();
    bindGlobal();
    route();
    showGate(false);
    if (info.offline) toast('You are offline. Showing the invitation saved on this device.');
    else if (info.cached) setTimeout(refreshConfig, 1200);
    renewInvite();
  })();
})();
