/* =====================================================================
   THE SMITH WEDDING · OFFLINE (the service worker's page side)
   ---------------------------------------------------------------------
   - Registers /sw.js (scope "/"). A new version waits until the guest taps "Refresh" on a quiet note
     ("A fresh version of the invitation is ready"); the very first install takes over silently.
   - <html class="ww-offline"> while the device is offline, with a small "Offline" note under the header (under
     II's day rail while that is stuck there) that keeps only its dot, on the header's foot, after a few seconds.
     Anything that needs the network (Google photos, live directions...) can carry data-online-only: it is
     hidden while offline (pwa.css).
   - Map warm-up: once the invitation gate is passed, the page is idle and the connection is good (not data
     saver, not 2g/3g), the worker saves the maps for offline use (the estate, Around Mistvale: ~10 MB, once)
     and the two content requests; "Map saved for offline use" then shows under the map.
   window.WWPwa = { warm(), state }
   ===================================================================== */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;

  var root = document.documentElement;
  var TILES = 'jsw-tiles-v1';              // the worker's tiles cache (and site/s/js/map-style.js tilesReady())
  var DONE = '/__tiles-warm-done';
  var state = { map: 'unknown', done: 0, total: 0 };
  var reg = null;
  var reloading = false;
  var refreshAsked = false;
  var hadController = !!navigator.serviceWorker.controller;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var idle = function (fn, t) { if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: t || 4000 }); else setTimeout(fn, 600); };
  var mark = '<svg class="ww-mark" aria-hidden="true" focusable="false"><use href="#logoMark"/></svg>';

  /* ---------------- registration and updates ---------------- */
  function register() {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(function (r) {
      reg = r;
      if (r.waiting && navigator.serviceWorker.controller) offer();
      r.addEventListener('updatefound', function () {
        var w = r.installing;
        if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(); });
      });
      // an installed app stays open for days: look for a new version whenever it comes back to the front
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') r.update().catch(function () {}); });
      maybeWarm();
    }).catch(function (e) { console.warn('[pwa] the offline worker did not register', e && e.message); });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      if (!hadController) { hadController = true; saveContent(); maybeWarm(); return; }   // the first install: silent
      if (refreshAsked) { reloading = true; location.reload(); }
    });
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'MAP_WARM') mapState(d);
    });
  }

  var note = null;
  function offer() {
    if (note) return;
    note = document.createElement('div');
    note.className = 'ww-update';
    note.setAttribute('role', 'status');
    note.innerHTML = mark + '<p>A fresh version of the invitation is ready</p>'
      + '<button type="button" class="btn btn-primary btn-sm" data-ww-refresh>Refresh</button>'
      + '<button type="button" class="ww-update__x" data-ww-later aria-label="Not now">&times;</button>';
    document.body.appendChild(note);
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (note) note.classList.add('is-in'); }); });
    note.addEventListener('click', function (e) {
      if (e.target.closest('[data-ww-later]')) { hideNote(); return; }
      if (!e.target.closest('[data-ww-refresh]')) return;
      refreshAsked = true;
      var w = reg && reg.waiting;
      // another tab already switched to the new version: nothing is waiting, a reload is enough
      if (!w) { reloading = true; location.reload(); return; }
      w.postMessage({ type: 'SKIP_WAITING' });
      // (controllerchange reloads; should it never come, reload anyway)
      setTimeout(function () { if (!reloading) { reloading = true; location.reload(); } }, 3000);
    });
  }
  function hideNote() {
    if (!note) return;
    var n = note;
    note = null;
    n.classList.remove('is-in');
    setTimeout(function () { n.remove(); }, 400);
  }

  /* ---------------- online / offline ---------------- */
  // The note sits under the header, or under II's day rail while that is stuck there (s-weekend.css: sticky under
  // the header where the screen is tall enough), so it never covers the days; a few seconds after it shows, only its
  // dot stays, on the foot of the header or of the rail (pwa.css .is-low, .is-dot)
  var netEl = null, netT = 0, netRaf = 0;
  function placeNet() {
    netRaf = 0;
    if (!netEl || netEl.hidden) return;
    var rail = document.getElementById('wkRail'), hdr = document.getElementById('siteHeader'), low = false;
    if (rail && hdr) {
      var h = hdr.getBoundingClientRect().bottom, r = rail.getBoundingClientRect();
      low = r.height > 0 && r.top < h + 1 && r.bottom > h + 1 && getComputedStyle(rail).position === 'sticky';
    }
    netEl.classList.toggle('is-low', low);
  }
  function queueNet() { if (!netRaf) netRaf = requestAnimationFrame(placeNet); }
  // (the countdown to the dot runs only while the page is in front: a guest coming back to it reads the words first)
  function dotLater() {
    clearTimeout(netT);
    if (netEl && !netEl.hidden && !document.hidden) netT = setTimeout(function () { netEl.classList.add('is-dot'); }, 6000);
  }
  function net() {
    var off = navigator.onLine === false;
    root.classList.toggle('ww-offline', off);
    if (off && !netEl) {
      netEl = document.createElement('p');
      netEl.className = 'ww-net';
      netEl.setAttribute('role', 'status');
      netEl.hidden = true;
      netEl.innerHTML = '<span class="ww-net__dot" aria-hidden="true"></span><span class="ww-net__t">Offline <span class="ww-net__sub">&middot; the invitation saved on this device</span></span>';
      document.body.appendChild(netEl);
    }
    if (netEl && netEl.hidden === off) {   // it shows, or it goes
      netEl.hidden = !off;
      netEl.classList.remove('is-dot');
      window[off ? 'addEventListener' : 'removeEventListener']('scroll', queueNet, { passive: true });
      window[off ? 'addEventListener' : 'removeEventListener']('resize', queueNet);
      if (off) placeNet();
      dotLater();
    }
    if (!off) maybeWarm();
  }
  window.addEventListener('online', net);
  window.addEventListener('offline', net);
  document.addEventListener('visibilitychange', function () { if (netEl && !netEl.classList.contains('is-dot')) dotLater(); });

  /* ---------------- the map, saved for offline use ---------------- */
  var gateOpen = function () { return !!window.WW_CONFIG && !document.body.classList.contains('locked'); };
  function goodConnection() {
    var c = navigator.connection;
    if (navigator.onLine === false) return false;
    return !(c && (c.saveData || /(^|-)(2g|3g)$/.test(String(c.effectiveType || ''))));
  }
  var asked = false;
  function maybeWarm() {
    if (asked || !reg || !reg.active || !navigator.serviceWorker.controller || !gateOpen() || !goodConnection()) return;
    asked = true;
    var go = function () {
      setTimeout(function () {
        idle(function () {
          saveContent();
          if (reg.active) reg.active.postMessage({ type: 'WARM_MAP' });
        }, 5000);
      }, 2500);
    };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }
  // The content requests went out before the worker existed on a first visit: ask once more, so the worker keeps the
  // last good copy for offline use (the same token the page itself uses).
  function saveContent() {
    var tok = '';
    try { tok = localStorage.getItem('ww_invite_token') || ''; } catch (e) { return; }
    if (!tok || tok.charAt(0) === '{' || tok.charAt(0) === '"') return;
    ['/api/site2/config', '/api/content'].forEach(function (u) {
      fetch(u, { headers: { 'X-Invite': tok, Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-cache' }).catch(function () {});
    });
  }

  // The line under the map is plain text (its percentage moves about every 0.7 s); what a screen reader hears comes
  // from a quiet live region of its own, there from the start, and only when a save starts and when it is done.
  var live = null;
  function statusEl() {
    var sec = document.getElementById('locMap');
    if (!sec) return null;
    var el = $('.ww-mapsave', sec);
    if (!el) {
      el = document.createElement('p');
      el.className = 'ww-mapsave';
      el.hidden = true;
      el.innerHTML = '<span class="ww-mapsave__ic" aria-hidden="true"></span><span class="ww-mapsave__t"></span><span class="ww-mapsave__bar" aria-hidden="true"><span></span></span>';
      var frame = document.getElementById('locFrame');
      var at = frame && (frame.closest('.vn-frame') || frame);
      if (at && at.parentNode === sec) at.after(el); else sec.appendChild(el);
    }
    if (!live || !sec.contains(live)) {
      live = document.createElement('span');
      live.className = 'vh';
      live.setAttribute('role', 'status');
      sec.appendChild(live);
    }
    return el;
  }
  var setText = function (n, s) { if (n && n.textContent !== s) n.textContent = s; };
  var liveT = 0;
  function say(s) {   // (and gone again a little later: never read out twice, never stale)
    clearTimeout(liveT);
    setText(live, s);
    if (s) liveT = setTimeout(function () { setText(live, ''); }, 10000);
  }
  function mapState(d) {
    var prev = state.map;
    if (d.state === 'progress') { state.map = 'saving'; state.done = d.done || 0; state.total = d.total || 0; }
    else if (d.state === 'done') state.map = 'saved';
    else if (state.map !== 'saved') state.map = d.state || 'unknown';
    paint();
    // in this visit: the start and the end of a save (a save that stops short says nothing more); never on a
    // return visit where the map was saved already
    if (state.map === 'saving' && prev !== 'saving') say('Saving the map for offline use');
    else if (prev === 'saving' && state.map !== 'saving') say(state.map === 'saved' ? 'Map saved for offline use' : '');
  }
  function paint() {
    var el = statusEl();
    if (!el) return;
    var t = $('.ww-mapsave__t', el);
    var bar = $('.ww-mapsave__bar > span', el);
    el.classList.toggle('is-saved', state.map === 'saved');
    el.classList.toggle('is-saving', state.map === 'saving');
    if (state.map === 'saved') { setText(t, 'Map saved for offline use'); el.hidden = false; }
    else if (state.map === 'saving' && state.total) {
      var pc = Math.min(99, Math.floor((state.done / state.total) * 100));
      setText(t, 'Saving the map for offline use · ' + pc + '%');
      if (bar) bar.style.width = pc + '%';
      el.hidden = false;
    } else el.hidden = true;
  }
  // already saved on an earlier visit?
  function checkSaved() {
    if (!('caches' in window)) return;
    caches.has(TILES).then(function (y) { return y ? caches.open(TILES).then(function (c) { return c.match(DONE); }) : null; }).then(function (r) {
      if (r && state.map !== 'saving') { state.map = 'saved'; paint(); }
    }).catch(function () {});
  }

  window.WWPwa = { state: state, warm: function () { asked = false; maybeWarm(); } };

  function start() {
    net();
    statusEl();   // (the line, hidden, and its live region: in place before anything is said)
    checkSaved();
    // after the page's own first load: the worker's precache never competes with the first screen
    if (document.readyState === 'complete') register(); else window.addEventListener('load', register, { once: true });
    document.addEventListener('ww:gate-opened', maybeWarm);
    document.addEventListener('ww:config', maybeWarm);
    document.addEventListener('ww:route', function () { paint(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
