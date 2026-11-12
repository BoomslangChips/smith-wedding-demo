/* =====================================================================
   THE SMITH WEDDING · MOTION (look and motion only; no content, no logic of app.js)
   Loaded in <head> without defer: it is tiny and marks <html> before the first paint, so every intro starts
   from its first frame. It never blocks input and never changes what the page says.

   - html.ww-js / ww-hold: the story (all but the hero card) stays unshown (and the home intro waits) until
     app.js has rendered it (its first 'ww:route') with the gate down, or the gate has been passed.
   - The phase, before the first paint (window.WWPhase): html[data-phase] pre | weekend | post, .is-weekend,
     .rsvp-open and .has-replied, from the copy of the content saved on this device and the clock (?now=).
   - The gate: while the server checks a code the form rests and the wax seal hovers over the card, breathing
     (.is-pending); a code that is not right shakes the field gently and the message rises (.is-wrong); when
     the gate opens ('ww:gate-opened') a copy of the gate presses the seal and dissolves over the site (the
     real gate is already gone, so the site underneath is live at once).
   - Scroll reveals (IntersectionObserver) for [data-rv] and what the renders draw; the hero photograph is
     inked in once it is decoded; [data-ambient] loops rest off screen; the toile is painted after load.
   Events from app.js on document (each has a fallback):
     'ww:gate-shown'   the gate is up (locked)             'ww:gate-opened'  the gate was passed (or not needed)
     'ww:route' { detail: { page, section } }  the story or the dashboard is shown (the first releases the hold)
   ===================================================================== */
(function () {
  'use strict';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var still = function () { return !!(mq && mq.matches); };
  root.classList.add('ww-js', 'ww-hold');
  // a deep link (a chapter, a day, a stay, a reply code): the invitation card is not painted for the frames
  // before story.js puts the page where the link points (style.css: html.ww-hold.ww-deep #home)
  (function () {
    var h = (location.hash || '').slice(1);
    if (h && h !== 'home' && h !== 'admin' && h.indexOf('admin') !== 0) root.classList.add('ww-deep');
  })();

  /* ---------------------------------------------------------------- the phase (before the first paint) */
  // Where the weekend stands and whether replies are open, decided here so the first paint is already right:
  // the weekend window is its first day 00:00 to its last day 23:59, SAST (UTC+2), as site/s/js/ui/time.js has it;
  // replies are open while the server has not closed them and the deadline day has not passed (or late replies
  // are allowed). ?now=2027-09-18T15:20 tests any moment: it is kept for the browser session in sessionStorage
  // jsw.now, JSON-encoded exactly as time.js keeps it (?now=off clears it). story.js applies the content itself
  // after 'ww:config'.   window.WWPhase = { now(), compute(cfg) -> { phase, rsvpOpen }, apply(cfg) }
  var WWPhase = (function () {
    var KEY = 'jsw.now';
    var DAY = /^\d{4}-\d{2}-\d{2}$/;
    var isDay = function (d) { return typeof d === 'string' && DAY.test(d); };
    var session = function (fn) { try { return fn(window.sessionStorage); } catch (e) { return null; } };
    var local = function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
    var sast = function (date, time) { return Date.parse(date + 'T' + time + ':00+02:00'); };
    (function keepNow() {
      var q = null;
      try { q = new URLSearchParams(location.search).get('now'); } catch (e) { return; }
      if (q === 'off' || q === '') session(function (s) { s.removeItem(KEY); });
      else if (q && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(q)) session(function (s) { s.setItem(KEY, JSON.stringify(q)); });
    })();
    // now (a Date), or the moment ?now= asked for (SAST wall time; a date alone is 09h00 that day)
    function now() {
      var o = session(function (s) { return JSON.parse(s.getItem(KEY) || 'null'); });
      if (typeof o === 'string' && isDay(o.slice(0, 10))) {
        var t = sast(o.slice(0, 10), o.length > 10 ? o.slice(11, 16) : '09:00');
        if (!isNaN(t)) return new Date(t);
      }
      return new Date();
    }
    // cfg: app.js's content (days, wedding.date, rsvp.deadline / allowLate, live), or the like from the saved copy
    function compute(cfg) {
      cfg = cfg || {};
      var at = now().getTime();
      var wed = isDay((cfg.wedding || {}).date) ? cfg.wedding.date : '';
      var dates = (Array.isArray(cfg.days) ? cfg.days : []).map(function (d) { return d && d.date; }).filter(isDay).sort();
      var first = dates[0] || wed || '2027-09-17', last = dates[dates.length - 1] || wed || '2027-09-20';
      var phase = at < sast(first, '00:00') ? 'pre' : at <= sast(last, '23:59') ? 'weekend' : 'post';
      var live = cfg.live && typeof cfg.live === 'object' ? cfg.live : null;
      var r = cfg.rsvp || {};
      var deadline = [live && live.deadline, r.deadline].filter(isDay)[0] || '2027-07-16';
      var late = live && typeof live.allow_late === 'boolean' ? live.allow_late : r.allowLate === true;
      var past = at > Date.parse(deadline + 'T23:59:59+02:00');
      return { phase: phase, rsvpOpen: !(live && live.open === false) && (late || !past) };
    }
    function apply(cfg) {
      var r = compute(cfg);
      root.setAttribute('data-phase', r.phase);
      root.classList.toggle('is-weekend', r.phase === 'weekend');
      root.classList.toggle('rsvp-open', r.rsvpOpen);
      // (this device sent a reply: it stays so for the visit, even should the storage be refused later)
      if (local('ww_replied') === '1') root.classList.add('has-replied');
      return r;
    }
    // the copy of the content app.js saved on this device ({ at, data: { defaults, override, live } }), if any
    function saved() {
      var c = null;
      try { c = JSON.parse(local('ww_config_v1') || 'null'); } catch (e) { c = null; }
      var d = c && c.data;
      if (!d || typeof d !== 'object') return {};
      var def = d.defaults || {}, over = d.override || {};
      var dr = def.rsvp || {}, or = over.rsvp || {};
      return {
        days: over.days || def.days,
        wedding: { date: (over.wedding || {}).date || (def.wedding || {}).date },
        rsvp: { deadline: or.deadline || dr.deadline, allowLate: typeof or.allowLate === 'boolean' ? or.allowLate : dr.allowLate },
        live: d.live || null
      };
    }
    apply(saved());
    return { now: now, compute: compute, apply: apply };
  })();
  window.WWPhase = WWPhase;

  var released = false;
  var exiting = false;
  var observing = false;
  var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  var io = null;

  var gateEl = function () { return document.getElementById('gate'); };
  var gateUp = function () { var g = gateEl(); return !!g && !g.hidden; };

  /* ---------------------------------------------------------------- the home intro */
  function release() {
    if (released) return;
    released = true;
    root.classList.remove('ww-hold');
    inkHero();
    startReveals();
    // the intro has played: later visits to Home simply fade in with the page
    setTimeout(function () { root.classList.add('ww-intro-done'); }, still() ? 0 : 3800);
  }

  // the hero photograph is printed in once it is decoded (never an empty sweep). It does not wait for the hold (the
  // words do): its first frame is already on the paper (s-invite.css), and the print starts as soon as the picture
  // has arrived, from a capture listener below, well before app.js has run (release() calls this again: once is enough)
  var inking = false;
  function inkHero() {
    var slot = document.querySelector('.arch.photo-slot');
    if (!slot || inking) return;
    inking = true;
    var done = false;
    var go = function () { if (!done) { done = true; slot.classList.add('inked'); } };
    var hook = function () {
      var img = slot.querySelector('img');
      if (!img) return false;
      if (img.complete && img.naturalWidth) {
        if (img.decode) img.decode().then(go, go); else go();
      } else {
        img.addEventListener('load', go, { once: true });
        img.addEventListener('error', go, { once: true });
      }
      return true;
    };
    if (!hook() && 'MutationObserver' in window) {
      var mo = new MutationObserver(function () { if (hook()) mo.disconnect(); });
      mo.observe(slot, { childList: true });
    }
    setTimeout(go, 2600);
  }
  // ('load' does not bubble: a capture listener on the document hears the picture arrive)
  document.addEventListener('load', function (e) {
    var t = e.target;
    if (!inking && t && t.tagName === 'IMG' && t.closest && t.closest('.arch.photo-slot')) inkHero();
  }, true);
  document.addEventListener('DOMContentLoaded', inkHero);

  /* ---------------------------------------------------------------- the gate */
  var shownOnce = false;                       // the gate has been on screen (a returning guest never sees it)
  var gateCard = function () { var g = gateEl(); return g && g.querySelector('.gate-card'); };
  function setPending(on) { var c = gateCard(); if (c) c.classList.toggle('is-pending', !!on); }

  // the exit: a copy of the gate (#gate-ghost; no other ids, inert, hidden from assistive tech) presses the seal (or,
  // tied, breaks it), lifts the card and dissolves; the real gate was already hidden by app.js, so the site underneath
  // is live at once. A gate whose seal was broken (P1) was carried into the hero by a View Transition: no copy.
  function gateExit() {
    if (exiting) return;
    var gate = gateEl();
    if (gate && gate.classList.contains('is-unsealed')) { setPending(false); release(); return; }
    if (!shownOnce) { release(); return; }
    exiting = true;
    if (still() || !gate || !document.body) { setPending(false); exiting = false; release(); return; }
    var ghost = gate.cloneNode(true);
    ghost.id = 'gate-ghost';
    ghost.hidden = false;
    ghost.classList.add('gate-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    Array.prototype.forEach.call(ghost.querySelectorAll('[id],[for],[aria-describedby]'), function (n) {
      n.removeAttribute('id'); n.removeAttribute('for'); n.removeAttribute('aria-describedby');
    });
    Array.prototype.forEach.call(ghost.querySelectorAll('input,button,select,textarea,a'), function (n) { n.setAttribute('tabindex', '-1'); });
    var top = gate.scrollTop;
    document.body.appendChild(ghost);
    ghost.scrollTop = top;
    setPending(false);                         // the real (hidden) gate is clean for another time
    var card = gateCard(); if (card) card.classList.remove('is-wrong');
    setTimeout(release, 1000);
    setTimeout(function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); exiting = false; }, 2100);
  }
  document.addEventListener('ww:gate-shown', function () {
    shownOnce = true;
    setPending(false);
    var g = gateEl(); if (g) g.classList.remove('is-unsealed');   // shown again (the code changed): the seal is whole
  });
  document.addEventListener('ww:gate-opened', gateExit);

  // P1: the gate's card is tied with ribbons and sealed, and a View Transition carries it into the hero
  // (html.story-vt: where View Transitions exist, never with reduced motion; set before the first paint)
  if (typeof document.startViewTransition === 'function' && !still()) root.classList.add('story-vt');
  // WWMotion.unseal(): the right code. The seal splits along its crack and the ribbons fall away to the edges (s-invite.css
  // #gate.is-unsealed). -> Promise<boolean>: true once it has played (about 600 ms; app.js showGate then carries the
  // card into the hero), false at once when it cannot (reduced motion, no View Transitions, no gate on screen)
  function unseal() {
    var gate = gateEl();
    if (still() || !root.classList.contains('story-vt') || !gate || gate.hidden) return Promise.resolve(false);
    setPending(false);
    var card = gateCard(); if (card) card.classList.remove('is-wrong');
    gate.classList.add('is-unsealed');
    return new Promise(function (resolve) { setTimeout(function () { resolve(true); }, 640); });
  }
  window.WWMotion = { unseal: unseal };

  function watchGate() {
    var gate = gateEl();
    if (!gate) return;
    var form = document.getElementById('gateForm');
    var input = document.getElementById('gateCode');
    var msg = document.getElementById('gateMsg');
    // on submit the server checks the code (0.2 to 2 s): the form rests and the seal hovers, ready
    if (form && input) {
      form.addEventListener('submit', function () { if (input.value.trim()) setPending(true); }, true);
      input.addEventListener('input', function () { var c = gateCard(); if (c) c.classList.remove('is-wrong'); });
    }
    if (!('MutationObserver' in window)) return;
    var wasUp = gateUp();
    if (wasUp) shownOnce = true;
    new MutationObserver(function () {
      var up = gateUp();
      if (up) shownOnce = true;
      if (wasUp && !up) gateExit();            // closed without its event: the same exit
      wasUp = up;
    }).observe(gate, { attributes: true, attributeFilter: ['hidden'] });
    // a message that is an error: the seal lifts away, the field gives a small shake and the message rises
    var card = gateCard();
    if (msg && card) {
      new MutationObserver(function () {
        if (!/\berror\b/.test(msg.className) || !msg.textContent) return;
        setPending(false);
        card.classList.remove('is-wrong');
        void card.offsetWidth; // restart the animation
        card.classList.add('is-wrong');
      }).observe(msg, { attributes: true, childList: true, characterData: true, subtree: true });
    }
  }

  /* ---------------------------------------------------------------- scroll reveals */
  // [data-rv] (the markup asks): "" rises (.rv), "ink" is a photograph printed in once it has decoded (.rv-ink),
  // "group" plays its own choreography, its parts held on their first frame until it is revealed (.rvg: a chapter
  // head, the colophon). Each is revealed once (.in).
  var RV = { '': 'rv', ink: 'rv-ink', group: 'rvg' };
  // [selector, kind]: what the renders that do not mark [data-rv] themselves still draw
  var TARGETS = [
    ['.site-footer', 'rvg']
  ];
  var SKIP = '#page-admin, .gate, .lightbox, .hero, dialog';
  // loops that rest while they are off screen or the tab is hidden (.is-off; motion.css pauses them)
  var AMBIENT = '[data-ambient]';

  function tag(el, kind) {
    if (seen ? seen.has(el) : el.__ww) return;
    if (seen) seen.add(el); else el.__ww = 1;
    if (el.closest && el.closest(SKIP)) return;
    if (kind === 'rv' && el.classList.contains('photo-slot')) return;
    el.classList.add(kind);
    if (io) { io.observe(el); waiting.push(el); } else el.classList.add('in');
  }
  function each(scope, sel, fn) {
    if (scope !== document && scope.matches && scope.matches(sel)) fn(scope);
    Array.prototype.forEach.call(scope.querySelectorAll(sel), fn);
  }
  function scan(scope) {
    scope = scope || document;
    if (!scope.querySelectorAll) return;
    each(scope, '[data-rv]', function (el) { tag(el, RV[el.getAttribute('data-rv')] || 'rv'); });
    TARGETS.forEach(function (t) { each(scope, t[0], function (el) { tag(el, t[1]); }); });
    each(scope, AMBIENT, ambient);
  }
  // What was passed so quickly that the observer never saw it on the screen (a fast flick while the page was busy)
  // is simply there when a guest comes back up: whatever still waits ABOVE the screen is shown, without its rise.
  var waiting = [], swept = 0;
  function sweep() {
    var now = Date.now(); if (now - swept < 250 || !waiting.length) return; swept = now;
    waiting = waiting.filter(function (el) {
      if (el.classList.contains('in') || !el.isConnected) return false;
      if (el.getBoundingClientRect().bottom > -24) return true;
      io.unobserve(el); el.style.setProperty('--d', '0ms'); el.classList.add('in'); return false;
    });
  }
  function onIntersect(entries) {
    sweep();
    var batch = [];
    entries.forEach(function (e) { if (e.isIntersecting) batch.push(e.target); });
    batch.sort(function (a, b) {
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    });
    batch.forEach(function (el, i) {
      var ink = el.classList.contains('rv-ink');
      // in turn: words 70 ms apart, photographs 90 ms, never more than six steps
      el.style.setProperty('--d', Math.min(i, 5) * (ink ? 90 : 70) + 'ms');
      io.unobserve(el);
      var go = function () { el.classList.add('in'); };
      // a photograph is printed in only once it has arrived and decoded (lazy pictures load as they come near)
      var img = ink ? (el.tagName === 'IMG' ? el : el.querySelector('img')) : null;
      if (!img) { go(); return; }
      var decoded = function () { if (img.decode) img.decode().then(go, go); else go(); };
      if (img.complete && img.naturalWidth) decoded();
      else {
        img.addEventListener('load', decoded, { once: true });
        img.addEventListener('error', go, { once: true });
        setTimeout(go, 4000);
      }
    });
  }

  // ambient loops (the swallows, the stars, a halo): .is-off while off screen or while the tab is hidden
  var amb = [], ambIO = null;
  function rest(el) { el.classList.toggle('is-off', !!document.hidden || el.__wwAmb === false); }
  function ambient(el) {
    if (amb.indexOf(el) > -1) return;
    amb.push(el);
    if (!('IntersectionObserver' in window)) return;
    if (!ambIO) ambIO = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.__wwAmb = e.isIntersecting; rest(e.target); }); });
    ambIO.observe(el);
  }
  document.addEventListener('visibilitychange', function () {
    amb = amb.filter(function (el) {
      if (el.isConnected) { rest(el); return true; }
      if (ambIO) ambIO.unobserve(el);
      return false;
    });
  });

  function startReveals() {
    if (observing) return;
    observing = true;
    if ('IntersectionObserver' in window && !still()) {
      io = new IntersectionObserver(onIntersect, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 });
    }
    scan(document);
    // whatever is drawn into the story later (app.js renders, a chapter's own script) is revealed too
    var main = document.getElementById('main');
    if (main && 'MutationObserver' in window) {
      new MutationObserver(function (list) {
        list.forEach(function (m) {
          Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) scan(n); });
        });
      }).observe(main, { childList: true, subtree: true });
    }
  }

  /* ---------------------------------------------------------------- app.js hooks */
  document.addEventListener('ww:route', function () {
    // the first one (the gate down) releases the hold; story.js positions the page in the same task
    if (!released && !gateUp()) release();
    if (observing) scan(document);
  });

  /* ---------------------------------------------------------------- start */
  function ready() {
    watchGate();
    // fallback, only if app.js never announces a route (a lost hook): show the page anyway
    setTimeout(function () { if (!released && !gateUp() && !exiting) release(); }, 6000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();

  // late decoration: the toile (hero and gate landscapes, swallows, the wallpaper on the bands) is fetched only
  // after the page has loaded and its largest picture is painted, then faded in; nothing decorative ever sits on
  // the critical path. The engravings are warmed first so the fade never shows a half-loaded layer.
  var ORN = ['swallow-1.svg', 'swallow-2.svg'];
  function decorate() {
    var wide = !window.matchMedia || window.matchMedia('(min-width: 600px)').matches;
    if (wide && gateUp()) ORN.push('ridge.svg', 'ground.svg');
    var left = ORN.length;
    var done = function () { if (--left === 0) root.classList.add('ww-deco'); };
    ORN.forEach(function (n) { var i = new Image(); i.onload = i.onerror = done; i.src = 'w/img/ornament/' + n; });
    setTimeout(function () { root.classList.add('ww-deco'); }, 4000);
  }
  window.addEventListener('load', function () { setTimeout(decorate, 700); });
})();
