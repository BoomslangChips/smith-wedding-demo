/* =====================================================================
   THE SMITH WEDDING · STORY (the navigator of the one-page invitation)
   A sync script, before app.js (it must hear app.js's first 'ww:route'). No libraries. SPEC v9 §2.2 and §4.4.

   - Jumps: WW.jump(id, { push, focus, instant }) cut and settle. A short hop (within 2.5 screens) scrolls smoothly
     and is corrected after 'scrollend' (or 700 ms); a long hop (any hop with reduced motion) is a cut, re-measured
     after two frames. For a little while after landing the place is kept against what renders late (any scroll,
     tap or key of the guest ends that). On arrival the chapter head plays (.in), its knot pulses (.is-pulse) and
     the focus moves to the heading (preventScroll). A target inside a [data-snap] scroller (a [data-snap-wrap]'s
     child; the maps' sheet has a data-snap of its own): the page goes to the scroller's wrap and the scroller to
     the item. The offset is the target's own scroll-margin-top (story.css).
   - Anchors: one delegated click turns a[href="#id"] with its target inside #main into a jump with a history
     entry (pushState only when the hash differs); the entry it leaves keeps where the guest was: state.wwY, and
     state.wwA { id, o } (the nearest element with an id at the reading point and the offset from it).
   - History: scrollRestoration 'manual'. Back / Forward: 'hashchange' -> app.js route() -> 'ww:route' -> here:
     the entry's place when it has one, else the section. The map and the gallery keep their own layers (their
     popstates are theirs). First load: the jump happens in the same task as motion.js's release; a reload with
     the same hash returns to sessionStorage['ww.y'] ({ y, a, h }, saved on 'pagehide'). #admin is a separate view.
   - Observers: the scroll-spy (html[data-ch], the running head, aria-current in the Contents and the desktop nav,
     'ww:chapter'), the hero (html.on-hero), presence ('ww:near' once per chapter; WW.isNear, WW.onNear), the
     header's ink over [data-ink="night"] (html.ink-night), [data-ambient] (.is-off), the [data-rail] day spies
     and the [data-snap] pagers. A MutationObserver on #main wires whatever app.js renders later.
   - Contents (<dialog id="toc">): showModal() over its own history entry (Back closes it); a row turns that entry
     into the chapter's. Its now block (#tocNow) and the floating Now pill (#nowPill) follow 'ww:live'.
   - After 'ww:config': WWPhase.apply(CFG) (motion.js), then html[data-phase], .is-weekend, .rsvp-open, .has-replied.
   - The header's progress line without scroll timelines: --p on .hdr-progress (rAF, a cached height).
   window.WW = { jump, isNear, onNear, chapter (getter), live (the last 'ww:live' detail) }
   ===================================================================== */
(function () {
  'use strict';
  const root = document.documentElement;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const byId = (id) => (id ? document.getElementById(id) : null);
  const has = (c) => root.classList.contains(c);
  const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const still = () => !!(RM && RM.matches);
  const IO = 'IntersectionObserver' in window;
  const raf = (f) => (window.requestAnimationFrame ? window.requestAnimationFrame(f) : setTimeout(f, 16));
  const frames = (n, f) => raf(() => (n > 1 ? frames(n - 1, f) : f()));
  const fire = (name, detail) => { try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) { /* no CustomEvent */ } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
  const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } };
  const debounce = (f, ms) => { let t = 0; return () => { clearTimeout(t); t = setTimeout(f, ms); }; };
  const stateObj = () => { const s = history.state; return s && typeof s === 'object' ? s : {}; };
  const main = () => byId('main');
  const inMain = (el) => { const m = main(); return !!(el && m && m.contains(el)); };
  const admin = () => has('view-admin');
  const mark = (a, on) => { if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); };
  // "#weekend", "weekend", "rsvp=7K3M" -> "weekend", "rsvp"; nothing -> "home"
  function sectionOf(s) {
    s = String(s == null ? location.hash : s).replace(/^#/, '');
    try { s = decodeURIComponent(s); } catch (e) { /* keep it as it is */ }
    return /^rsvp=/.test(s) ? 'rsvp' : s || 'home';
  }

  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* sandboxed */ }

  const WW = window.WW = window.WW || {};
  let hdrPx = window.matchMedia && window.matchMedia('(min-width: 900px)').matches ? 64 : 56;   // the header (ResizeObserver keeps it)
  let chapter = '';
  let jumpSeq = 0;                 // a newer jump (or the guest's own scroll) retires the settling of an older one
  let live = null, pillEv = null, typing = false, cfgNow = null;

  /* ---------------------------------------------------------------- where the first load lands */
  const navType = (() => {
    try { const n = performance.getEntriesByType('navigation')[0]; if (n && n.type) return n.type; } catch (e) { /* old */ }
    try { const t = performance.navigation.type; return t === 1 ? 'reload' : t === 2 ? 'back_forward' : 'navigate'; } catch (e) { return 'navigate'; }
  })();
  const restore = (() => {
    if (navType !== 'reload' && navType !== 'back_forward') return null;
    try { const s = JSON.parse(ssGet('ww.y') || 'null'); return s && typeof s.y === 'number' && s.h === location.hash ? s : null; } catch (e) { return null; }
  })();

  /* ---------------------------------------------------------------- scrolling */
  function toY(y, behavior) {
    try { window.scrollTo({ top: y, left: 0, behavior }); } catch (e) { window.scrollTo(0, y); }
  }
  // the sticky day rail covers what is under it in its chapter (only when the target has no scroll-margin of its own)
  function railAbove(el) {
    const ch = el.closest('.ch, [data-ch]');
    const rail = ch && $('[data-rail]', ch);
    return rail && !rail.contains(el) && (rail.compareDocumentPosition(el) & 4) ? rail.getBoundingClientRect().height || 0 : 0;
  }
  // where the page goes for this element: its top at its scroll-margin-top under the header (raw: unclamped)
  function yOf(el, raw) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    let m = parseFloat(cs.scrollMarginTop);
    if (!(m > 0)) m = hdrPx + 8 + railAbove(el);
    // a [data-rv] reveal still rising (its own `translate`) lands where it will rest, not where it is this frame
    const ty = parseFloat(String(cs.translate || '').split(' ')[1]) || 0;
    const y = Math.round(r.top - ty + window.scrollY - m);
    return raw ? y : clampY(y);
  }
  const clampY = (y) => Math.max(0, Math.min(Math.max(0, document.documentElement.scrollHeight - window.innerHeight), y));
  // the guest scrolls, taps or types: a jump still settling leaves the page alone
  const retire = () => { jumpSeq++; keeping = null; };
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((t) => window.addEventListener(t, retire, { passive: true, capture: true }));
  const hasScrollEnd = 'onscrollend' in window;
  function settled(seq, fn) {
    let done = false, t = 0;
    const end = () => { if (done) return; done = true; clearTimeout(t); window.removeEventListener('scrollend', end); if (seq === jumpSeq) fn(); };
    if (hasScrollEnd) window.addEventListener('scrollend', end);
    t = setTimeout(end, hasScrollEnd ? 1400 : 700);
  }
  // the chapter under the reading line and the hero, read at once after a cut (the observers confirm a frame later)
  function spyNow() {
    const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.45);
    // the colophon has no chapter of its own: it reads as the last one (IX)
    const sec = hit && hit.closest ? (hit.closest('[data-ch]') || (hit.closest('.site-footer') ? byId('rsvp') : null)) : null;
    if (sec && inMain(sec)) setChapter(sec);
    const hero = byId('home');
    if (hero) { const r = hero.getBoundingClientRect(); setOnHero(r.height > 0 && r.bottom > hdrPx && r.top < window.innerHeight); }
  }
  const pulseT = new WeakMap();
  function pulse(k) {
    k.classList.remove('is-pulse');
    void k.offsetWidth;   // restart the animation
    k.classList.add('is-pulse');
    clearTimeout(pulseT.get(k));
    pulseT.set(k, setTimeout(() => k.classList.remove('is-pulse'), 600));
  }
  function focusIn(el) {
    let h = /^H[1-6]$/.test(el.tagName) ? el : $('h1, h2, h3, h4, h5, h6', el);
    if (!h) h = el;
    if (!h.hasAttribute('tabindex') && !h.matches('a[href], button, input, select, textarea')) h.setAttribute('tabindex', '-1');
    try { h.focus({ preventScroll: true }); } catch (e) { /* focus is a courtesy */ }
  }
  // on arrival: the chapter head plays as the arrival, its knot pulses, the focus goes to the heading
  function arrive(el, sec, opts) {
    const go = () => {
      if (sec && el === sec) {
        const head = $('.ch-head', sec); if (head) head.classList.add('in');
        const knot = $('.ch-knot', sec); if (knot) pulse(knot);
      }
      if (opts.focus !== false) focusIn(el);
    };
    if (tocEl && tocEl.open) afterToc.push(go); else go();   // the page is inert until the Contents has gone
  }
  function snapTo(sc, item, instant) {
    const pad = parseFloat(getComputedStyle(sc).scrollPaddingLeft) || 0;
    const left = Math.round(sc.scrollLeft + item.getBoundingClientRect().left - sc.getBoundingClientRect().left - pad);
    try { sc.scrollTo({ left, behavior: instant ? 'instant' : 'smooth' }); } catch (e) { sc.scrollLeft = left; }
  }
  function jumpTo(el, opts) {
    opts = opts || {};
    if (!el || admin()) return false;
    const seq = ++jumpSeq;
    const sec = el.closest('[data-ch]');
    const y0 = window.scrollY;
    // inside a horizontal scroller: the page goes to its wrap, the scroller to the item
    const sc = el.closest('[data-snap-wrap] > [data-snap]');
    const page = sc && sc !== el ? sc.closest('[data-snap-wrap]') || sc : el;
    const y = yOf(page);
    const cut = !!opts.instant || still() || Math.abs(y - y0) > 2.5 * window.innerHeight;
    if (page !== el) snapTo(sc, el, cut);
    const measure = () => yOf(page);
    if (cut) {
      toY(y, 'instant');
      spyNow();
      if (!opts.first) arrive(el, sec, opts);
      keep(seq, measure, opts.first);
    } else if (Math.abs(y - y0) < 2) { arrive(el, sec, opts); keep(seq, measure); }
    else {
      toY(y, 'smooth');
      settled(seq, () => { keep(seq, measure); arrive(el, sec, opts); });
    }
    return true;
  }
  // For a little while after a jump or a restore the place is kept: what renders or re-lays out after it
  // (content-visibility estimates, the gallery's trim, the itinerary's places, the reply card, scroll anchoring that
  // does not hold, and Safari has none) cannot move it. The goal is re-measured only when the layout may have moved
  // (two frames on, the document's size, the fonts, the load); the scroll check in between reads scrollY alone.
  // The guest's own scroll, tap or key, or the next jump, ends it at once.
  let keeping = null, keepT = 0;
  function keep(seq, measure, late) {
    keeping = { seq, measure, goal: measure(), until: Date.now() + (late ? 6000 : 2500) };
    keepCheck(false);
    frames(2, () => keepCheck(true));
    if (!late) return;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => frames(2, () => keepCheck(true)));
    if (document.readyState !== 'complete') window.addEventListener('load', () => frames(2, () => keepCheck(true)), { once: true });
  }
  function keepCheck(remeasure) {
    const k = keeping;
    if (!k) return;
    if (k.seq !== jumpSeq || Date.now() > k.until || admin()) { keeping = null; return; }
    if (remeasure) k.goal = k.measure();
    if (Math.abs(window.scrollY - k.goal) > 4) toY(k.goal, 'instant');
  }
  window.addEventListener('scroll', () => { if (keeping && !keepT) keepT = raf(() => { keepT = 0; keepCheck(false); }); }, { passive: true });
  // a place on the page: { wwY, wwA: { id, o } }, the nearest element with an id at the reading point and the offset
  // from its top, so the place survives what renders above it in the meantime (fonts, the gallery's trim, the
  // dashboard's round trip); wwY alone when there is no such element
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  function placeHere() {
    const y = Math.round(window.scrollY);
    let el = document.elementFromPoint(window.innerWidth / 2, Math.round(window.innerHeight / 3));
    while (el && !(el.id && inMain(el) && el !== main() && !/^(sticky|fixed)$/.test(getComputedStyle(el).position))) el = el.parentElement;
    return { wwY: y, wwA: el ? { id: el.id, o: Math.round(y - docTop(el)) } : null };
  }
  function yOfPlace(p) {
    const a = p.wwA && byId(p.wwA.id);
    return clampY(a && inMain(a) ? Math.round(docTop(a) + p.wwA.o) : p.wwY);
  }
  function restorePlace(p, late) {
    const seq = ++jumpSeq;
    toY(yOfPlace(p), 'instant');
    spyNow();
    keep(seq, () => yOfPlace(p), late);
  }
  const toTop = (opts) => { const hero = byId('home'); if (hero) jumpTo(hero, opts); else toY(0, 'instant'); };
  /** WW.jump(id, { push, focus, instant }) -> false when there is no such place on the page */
  function jump(id, opts) {
    opts = opts || {};
    id = sectionOf(id);
    const el = byId(id);
    if (!el || !inMain(el)) return false;
    if (opts.push) {
      // with the Contents open over its own entry (a map opened from its Now block, a link in that map): the jump
      // takes that entry over, as a row does, so the Contents closes and Back returns to where the guest was
      if (tocEl && tocEl.open && stateObj().wwToc) {
        const same = location.hash === '#' + id;
        tocClose({ forRow: true, keep: !same });
        if (!same) { try { history.replaceState({}, '', '#' + id); } catch (e) { /* sandboxed */ } }
      } else { record(); if (location.hash !== '#' + id) push('#' + id); }
    }
    return jumpTo(el, opts);
  }

  /* ---------------------------------------------------------------- history */
  // the entry being left keeps where the guest was (always spreading what other layers keep there)
  function record() { try { history.replaceState(Object.assign({}, stateObj(), placeHere()), ''); } catch (e) { /* sandboxed */ } }
  function push(hash) { try { history.pushState({}, '', hash); } catch (e) { /* sandboxed */ } }
  let firstRoute = true, inAdmin = false, adminFrom = null, hashPending = false, preHash = null;
  function firstPosition(section) {
    if (restore) {
      if (restore.y > window.innerHeight / 2) root.classList.add('ww-intro-done');
      restorePlace({ wwY: restore.y, wwA: restore.a || null }, true);
      return;
    }
    const el = section !== 'home' ? byId(section) : null;
    if (el && inMain(el) && el !== main()) {
      root.classList.add('ww-intro-done');
      jumpTo(el, { instant: true, focus: false, first: true });
      return;
    }
    if (window.scrollY) toY(0, 'instant');
  }
  function leaveAdmin(section) {
    const st = stateObj();
    const saved = adminFrom;
    adminFrom = null;
    if (typeof st.wwY === 'number') { restorePlace(st); return; }
    const el = section !== 'home' ? byId(section) : null;
    if (el && inMain(el)) { jumpTo(el, { instant: true }); return; }
    if (saved) { restorePlace(saved); return; }
    toY(0, 'instant');
  }
  // app.js route(): { page: 'story' | 'admin', section }. Its first call positions the page; later ones that come
  // from a hash change (Back, Forward, a typed hash) restore the entry's place or go to its section.
  function onRoute(d) {
    d = d || {};
    const fromHash = hashPending;
    hashPending = false;
    if (d.page === 'admin' || admin()) {
      // entering: the dashboard opens at its top (the story's place is already kept: record() and adminFrom on the
      // colophon's link, preHash on a hash change; leaveAdmin brings it back)
      if (!inAdmin) { inAdmin = true; if (!firstRoute && !adminFrom) adminFrom = fromHash ? preHash : null; retire(); toY(0, 'instant'); }
      firstRoute = false;
      if (tocEl && tocEl.open) tocClose({ fromHistory: true, instant: true });
      syncPill();
      return;
    }
    const section = sectionOf(d.section != null ? d.section : null);
    if (firstRoute) {
      firstRoute = false;
      firstPosition(section);
      // the chapters not yet near are measured afresh once the hold is really off: at once with the gate down
      // (motion.js hears ww:route first), after the gate's exit (its ghost, the unseal) when a code was typed
      if (nearIO) whenUnheld(() => $$('[data-ch]', main()).forEach((s) => { if (!near.has(s.id)) { nearIO.unobserve(s); nearIO.observe(s); } }));
      return;
    }
    if (inAdmin) { inAdmin = false; leaveAdmin(section); syncPill(); return; }
    if (!fromHash) return;   // route() again without a new hash (the gate came back, a personal code): stay put
    const st = stateObj();
    if (typeof st.wwY === 'number') { restorePlace(st); return; }
    const el = byId(section);
    if (el && inMain(el)) jumpTo(el, {}); else toTop({ focus: false });
  }
  document.addEventListener('ww:route', (e) => onRoute(e && e.detail));
  // (registered before app.js's own listener: this runs first, while the old view is still there)
  window.addEventListener('hashchange', () => {
    hashPending = true;
    preHash = admin() ? null : placeHere();
    if (tocEl && tocEl.open) tocClose({ fromHistory: true, instant: true });
    setTimeout(() => { if (hashPending) onRoute({ page: admin() ? 'admin' : 'story' }); }, 30);   // app.js always answers
  });
  window.addEventListener('pagehide', () => {
    if (admin()) return;
    const p = placeHere();
    ssSet('ww.y', JSON.stringify({ y: p.wwY, a: p.wwA, h: location.hash }));
  });

  /* ---------------------------------------------------------------- anchors (one delegated click) */
  const skipAttr = (a) => Array.prototype.some.call(a.attributes, (x) => x.name === 'data-action' || x.name.indexOf('data-gx') === 0 || x.name.indexOf('data-loc-') === 0);
  const plainClick = (e) => !(e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    // the [data-snap] pagers
    const b = t.closest('[data-snap-prev], [data-snap-next]');
    if (b) {
      const rec = snaps.get(b.closest('[data-snap-wrap]'));
      if (rec) { e.preventDefault(); snapGo(rec, b.hasAttribute('data-snap-next') ? 1 : -1); }
      return;
    }
    if (!plainClick(e)) return;
    const a = t.closest('a[href^="#"]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (href === '#admin') { if (!admin()) { record(); adminFrom = placeHere(); } return; }   // the browser switches the view
    if (href === '#' || /^#rsvp=/.test(href) || skipAttr(a) || admin()) return;
    const id = sectionOf(href);
    const el = byId(id);
    if (!el || !inMain(el) || el === main()) return;
    e.preventDefault();
    record();
    if (location.hash !== '#' + id) push('#' + id);
    jumpTo(el, {});
  });

  /* ---------------------------------------------------------------- the chapter (spy), the hero, presence */
  let runAnim = null;
  // the running head: out 120 ms (6px up), in 220 ms
  function runHead(n, t, animate) {
    const run = byId('hdrRun');
    if (!run) return;
    const nEl = $('.hdr-run__n', run), tEl = $('.hdr-run__t', run);
    const write = () => { if (nEl) nEl.textContent = n; if (tEl) tEl.textContent = t; };
    if (runAnim) { runAnim.cancel(); runAnim = null; }
    if (!animate || still() || has('on-hero') || typeof run.animate !== 'function') { write(); return; }
    const out = runAnim = run.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }],
      { duration: 120, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    out.onfinish = () => {
      write();
      runAnim = run.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 220, easing: 'cubic-bezier(.22,.61,.36,1)' });
      out.cancel();
    };
  }
  function setChapter(sec) {
    const id = sec && (sec.getAttribute('data-ch') || sec.id);
    if (!id || id === chapter || admin()) return;
    const first = !chapter;
    chapter = id;
    root.setAttribute('data-ch', id);
    runHead(sec.getAttribute('data-n') || '', sec.getAttribute('data-title') || '', !first);
    $$('#toc [data-toc]').forEach((a) => mark(a, a.getAttribute('data-toc') === id));
    $$('#siteHeader [data-nav]').forEach((a) => mark(a, a.getAttribute('data-nav') === id));
    syncPill();
    fire('ww:chapter', { id });
  }
  function setOnHero(on) {
    if (has('on-hero') === on) return;
    root.classList.toggle('on-hero', on);
    syncPill();
  }
  const spyOn = new Set();
  const spyIO = IO ? new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) spyOn.add(e.target); else spyOn.delete(e.target); });
    let cur = null;
    spyOn.forEach((s) => { if (!s.isConnected) spyOn.delete(s); else if (!cur || (cur.compareDocumentPosition(s) & 4)) cur = s; });
    if (cur) setChapter(cur);
  }, { rootMargin: '-45% 0px -54% 0px' }) : null;
  // presence: once per chapter, about a screen ahead and behind
  const near = new Set();
  const waiting = {};
  function nearNow(id) {
    if (!id || near.has(id)) return;
    near.add(id);
    fire('ww:near', { id });
    const list = waiting[id];
    delete waiting[id];
    (list || []).forEach((fn) => { try { fn(id); } catch (err) { console.error('[story] onNear', err); } });
  }
  // (not while the story is held: on a deep link the page is positioned before app.js has rendered, when every
  // chapter is a fraction of its height and far more of them would count as near than really are)
  const nearIO = IO ? new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting || root.classList.contains('ww-hold')) return;
    nearIO.unobserve(e.target);
    nearNow(e.target.id);
    nearNow(e.target.getAttribute('data-ch'));
  }), { rootMargin: '100% 0px 100% 0px' }) : null;
  // fn on the frame after html.ww-hold has gone (the entries the observer dropped while held do not come again)
  function whenUnheld(fn) {
    if (!has('ww-hold')) { raf(fn); return; }
    if (!('MutationObserver' in window)) { setTimeout(() => whenUnheld(fn), 200); return; }
    const mo = new MutationObserver(() => { if (!has('ww-hold')) { mo.disconnect(); raf(fn); } });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  const isNear = (id) => near.has(sectionOf(id));
  function onNear(id, fn) {
    if (typeof fn !== 'function') return;
    id = sectionOf(id);
    if (near.has(id)) fn(id); else (waiting[id] = waiting[id] || []).push(fn);
  }
  const seenSec = new WeakSet();
  function observeSections() {
    const m = main();
    if (!m) return;
    $$('[data-ch]', m).forEach((s) => {
      if (seenSec.has(s)) return;
      seenSec.add(s);
      if (spyIO) spyIO.observe(s);
      if (nearIO) nearIO.observe(s);
      else { nearNow(s.id); nearNow(s.getAttribute('data-ch')); }
    });
  }

  /* ---------------------------------------------------------------- bands under the header (rebuilt on resize) */
  // a 1px line `top` px below the top of the viewport, as a rootMargin
  const band = (top) => `-${Math.max(0, Math.round(top))}px 0px -${Math.max(0, Math.round(window.innerHeight - top - 1))}px 0px`;
  let heroIO = null;
  const heroNow = { io: null, on: false };
  function buildHero() {
    if (!IO) return;
    if (heroIO) heroIO.disconnect();
    if (heroNow.io) heroNow.io.disconnect();
    const m = `-${Math.round(hdrPx)}px 0px 0px 0px`;
    const hero = byId('home');
    if (hero) { heroIO = new IntersectionObserver((es) => setOnHero(es[es.length - 1].isIntersecting), { rootMargin: m }); heroIO.observe(hero); }
    const hn = byId('heroNow');
    if (hn) { heroNow.io = new IntersectionObserver((es) => { heroNow.on = es[es.length - 1].isIntersecting; syncPill(); }, { rootMargin: m }); heroNow.io.observe(hn); }
  }
  const ink = { io: null, els: [], on: new Set() };
  function buildInk() {
    const m = main();
    const els = m ? $$('[data-ink="night"]', m) : [];
    if (ink.io) ink.io.disconnect();
    ink.io = null; ink.els = els; ink.on.clear();
    if (!els.length || !IO) { root.classList.remove('ink-night'); return; }
    ink.io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) ink.on.add(e.target); else ink.on.delete(e.target); });
      root.classList.toggle('ink-night', ink.on.size > 0);
    }, { rootMargin: band(hdrPx / 2) });
    els.forEach((el) => ink.io.observe(el));
  }
  // [data-rail]: aria-current on the link whose day last crossed the line under the header and the rail
  const rails = new Map();
  function buildRail(rail, force) {
    const pairs = $$('a[href^="#"]', rail).map((a) => [a, byId(sectionOf(a.getAttribute('href')))]).filter((p) => p[1]);
    let rec = rails.get(rail);
    if (rec && !force && rec.pairs.length === pairs.length && rec.pairs.every((p, i) => p[0] === pairs[i][0] && p[1] === pairs[i][1])) return;
    if (rec && rec.io) rec.io.disconnect();
    const cur = rec && rec.cur;
    rec = { pairs, line: 0, cur: null, io: null };
    rails.set(rail, rec);
    if (!pairs.length) return;
    railSet(rec, pairs.some((p) => p[0] === cur) ? cur : pairs[0][0]);
    if (!IO) return;
    // the line: just below where a day lands (its scroll-margin-top: the header, the rail and 8px)
    const m = parseFloat(getComputedStyle(pairs[0][1]).scrollMarginTop);
    rec.line = (m > 0 ? m : hdrPx + (rail.getBoundingClientRect().height || 44) + 8) + 4;
    rec.io = new IntersectionObserver(() => railSet(rec, railAt(rec)), { rootMargin: band(rec.line) });
    pairs.forEach((p) => rec.io.observe(p[1]));
  }
  // the day at the line: the last one that starts above it (the first day while the page is still above them all)
  function railAt(rec) {
    let a = null;
    rec.pairs.forEach((p) => { const r = p[1].getBoundingClientRect(); if (r.height > 0 && r.top <= rec.line) a = p[0]; });
    return a || rec.pairs[0][0];
  }
  function railSet(rec, a) {
    if (rec.cur === a) return;
    rec.cur = a;
    rec.pairs.forEach((p) => mark(p[0], p[0] === a));
  }
  // a hop past a whole day (Page Down, a cut to another chapter) crosses the line with no day on it, so the observer
  // has nothing to say: once the page has come to rest the mark is set from where the days are
  window.addEventListener('scroll', debounce(() => rails.forEach((rec) => { if (rec.line) railSet(rec, railAt(rec)); }), 140), { passive: true });
  function rebuildBands() {
    buildHero();
    buildInk();
    rails.forEach((rec, rail) => buildRail(rail, true));
    buildIsNow(true);
  }

  /* ---------------------------------------------------------------- [data-snap] pagers */
  const snaps = new Map();
  function buildSnap(wrap) {
    const sc = $(':scope > [data-snap]', wrap);
    const items = sc ? Array.prototype.filter.call(sc.children, (c) => c.nodeType === 1) : [];
    let rec = snaps.get(wrap);
    if (rec && rec.sc === sc && rec.items.length === items.length && rec.items.every((it, i) => it === items[i])) return;
    if (rec && rec.io) rec.io.disconnect();
    rec = { wrap, sc, items, vis: new Set(), cur: 0, io: null };
    snaps.set(wrap, rec);
    if (sc && items.length && IO) {
      rec.io = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) rec.vis.add(e.target); else rec.vis.delete(e.target); });
        const i = rec.items.findIndex((it) => rec.vis.has(it));
        if (i >= 0) rec.cur = i;
        paintSnap(rec);
      }, { root: sc, threshold: 0.6 });
      items.forEach((it) => rec.io.observe(it));
    }
    paintSnap(rec);
  }
  function paintSnap(rec) {
    const n = rec.items.length;
    rec.items.forEach((it, i) => it.classList.toggle('is-current', i === rec.cur));
    const txt = n ? `${rec.cur + 1} of ${n}` : '';
    $$('[data-snap-count]', rec.wrap).forEach((c) => { if (c.textContent !== txt) c.textContent = txt; });
    const end = !n || rec.cur >= n - 1 || rec.vis.has(rec.items[n - 1]);
    $$('[data-snap-prev]', rec.wrap).forEach((b) => b.setAttribute('aria-disabled', String(rec.cur <= 0)));
    $$('[data-snap-next]', rec.wrap).forEach((b) => b.setAttribute('aria-disabled', String(end)));
  }
  function snapGo(rec, dir) {
    const n = rec.items.length;
    if (!rec.sc || !n) return;
    if (dir > 0 && (rec.cur >= n - 1 || rec.vis.has(rec.items[n - 1]))) return;
    const i = Math.max(0, Math.min(n - 1, rec.cur + dir));
    snapTo(rec.sc, rec.items[i], still());
  }

  /* ---------------------------------------------------------------- [data-ambient] loops rest off screen */
  const amb = { io: null, seen: new WeakSet(), vis: new WeakMap() };
  const paintAmb = (el) => el.classList.toggle('is-off', document.hidden || amb.vis.get(el) === false);
  function observeAmb(el) {
    if (amb.seen.has(el)) return;
    amb.seen.add(el);
    if (!IO) return;
    if (!amb.io) amb.io = new IntersectionObserver((es) => es.forEach((e) => { amb.vis.set(e.target, e.isIntersecting); paintAmb(e.target); }));
    amb.io.observe(el);
  }
  document.addEventListener('visibilitychange', () => $$('[data-ambient]').forEach(paintAmb));

  /* ---------------------------------------------------------------- the progress line without scroll timelines */
  const prog = { on: !(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()')), max: 1, ticking: false };
  function paintProgress() {
    prog.ticking = false;
    const bar = $('.hdr-progress');
    if (bar) bar.style.setProperty('--p', Math.min(1, Math.max(0, window.scrollY / prog.max)).toFixed(4));
  }
  function measure() {
    if (!prog.on) return;
    prog.max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    paintProgress();
  }
  if (prog.on) {
    window.addEventListener('scroll', () => { if (!prog.ticking) { prog.ticking = true; raf(paintProgress); } }, { passive: true });
    window.addEventListener('load', measure);
  }
  const measureSoon = debounce(measure, 120);

  /* ---------------------------------------------------------------- what app.js renders later is wired too */
  let reconT = 0;
  const reconcileSoon = () => { if (!reconT) reconT = raf(() => { reconT = 0; reconcile(); }); };
  function reconcile() {
    observeSections();
    const m = main();
    if (m) {
      $$('[data-rail]', m).forEach((r) => buildRail(r));
      $$('[data-snap-wrap]', m).forEach((w) => buildSnap(w));
      const nights = $$('[data-ink="night"]', m);
      if (nights.length !== ink.els.length || nights.some((el, i) => el !== ink.els[i])) buildInk();
    }
    rails.forEach((rec, r) => { if (!r.isConnected) { if (rec.io) rec.io.disconnect(); rails.delete(r); } });
    snaps.forEach((rec, w) => { if (!w.isConnected) { if (rec.io) rec.io.disconnect(); snaps.delete(w); } });
    $$('[data-ambient]').forEach(observeAmb);
    buildIsNow();
    measure();
  }

  /* ---------------------------------------------------------------- phase, reply state (after the config) */
  const SAST = (date, hm) => Date.parse(`${date}T${hm || '00:00'}:00+02:00`);
  // the clock (motion.js WWPhase.now honours ?now= and sessionStorage['jsw.now'], JSON-encoded as time.js keeps it)
  function nowMs() {
    const P = window.WWPhase;
    if (P && typeof P.now === 'function') { const n = +P.now(); if (n) return n; }
    let o = null;
    try { const q = new URLSearchParams(location.search).get('now'); if (q === 'off') return Date.now(); if (q) o = q; } catch (e) { /* old */ }
    if (!o) { try { o = JSON.parse(ssGet('jsw.now') || 'null'); } catch (e) { o = null; } }
    if (typeof o === 'string' && /^\d{4}-\d{2}-\d{2}/.test(o)) { const t = SAST(o.slice(0, 10), o.length > 10 ? o.slice(11, 16) : '09:00'); if (!isNaN(t)) return t; }
    return Date.now();
  }
  function phaseOf(cfg) {
    const P = window.WWPhase;
    if (P && typeof P.compute === 'function') { try { const r = P.compute(cfg); if (r && r.phase) return r; } catch (e) { /* below */ } }
    if (!cfg) return null;
    const at = nowMs();
    const days = (cfg.days || []).map((d) => d && d.date).filter(Boolean).sort();
    const w = cfg.wedding || {};
    const start = SAST(days[0] || w.date || '2027-09-17'), end = SAST(days[days.length - 1] || w.date || '2027-09-20', '23:59') + 59999;
    const lv = cfg.live || {}, rs = cfg.rsvp || {};
    const deadline = SAST(lv.deadline || rs.deadline || '2027-07-16', '23:59') + 59999;
    return { phase: at < start ? 'pre' : at > end ? 'post' : 'weekend', rsvpOpen: lv.open !== false && (at <= deadline || !!(lv.allow_late || rs.allowLate)) };
  }
  function applyPhase() {
    const cfg = cfgNow || window.WW_CONFIG || null;
    const P = window.WWPhase;
    if (cfg && P && typeof P.apply === 'function') { try { P.apply(cfg); } catch (e) { /* the attributes below */ } }
    const r = phaseOf(cfg);
    if (r) {
      if (root.getAttribute('data-phase') !== r.phase) root.setAttribute('data-phase', r.phase);
      root.classList.toggle('is-weekend', r.phase === 'weekend');
      root.classList.toggle('rsvp-open', !!r.rsvpOpen);
    }
    if (lsGet('ww_replied') === '1') root.classList.add('has-replied');
    syncPill();
  }
  document.addEventListener('ww:config', (e) => { cfgNow = (e && e.detail) || window.WW_CONFIG || null; applyPhase(); });
  window.addEventListener('storage', (e) => { if (e.key === 'ww_replied') applyPhase(); });

  /* ---------------------------------------------------------------- the Contents */
  const tocEl = byId('toc');
  const tocBtn = byId('tocOpen');
  const afterToc = [];
  let tocOpener = null, tocBack = false, tocBackT = 0, tocClosing = false, tocShown = false;
  function tocOpen() {
    if (!tocEl || tocEl.open || admin() || typeof tocEl.showModal !== 'function') return;
    tocOpener = tocBtn || document.activeElement;
    record();
    try { history.pushState({ wwToc: 1 }, ''); } catch (e) { /* no entry: Esc and the × still close it */ }
    tocEl.classList.remove('is-closing');
    root.classList.add('toc-open');
    try { tocEl.showModal(); } catch (e) { tocEl.setAttribute('open', ''); }
    tocShown = true;
    tocEl.scrollTop = 0;
    if (tocBtn) tocBtn.setAttribute('aria-expanded', 'true');
    renderTocNow();
    const cur = $('[data-toc][aria-current]', tocEl) || $('[data-toc-close]', tocEl);
    if (cur) { try { cur.focus({ preventScroll: true }); } catch (e) { /* courtesy */ } }
    syncPill();
  }
  // the end of a close, whoever started it
  function tocFinish(forRow) {
    tocClosing = false;
    tocShown = false;
    tocEl.classList.remove('is-closing');
    if (tocEl.open) { try { tocEl.close(); } catch (e) { tocEl.removeAttribute('open'); } }
    root.classList.remove('toc-open');
    if (tocBtn) tocBtn.setAttribute('aria-expanded', 'false');
    const o = tocOpener;
    tocOpener = null;
    if (!forRow && o && o.isConnected) { try { o.focus({ preventScroll: true }); } catch (e) { /* courtesy */ } }
    afterToc.splice(0).forEach((f) => f());
    syncPill();
  }
  function tocHistoryBack() {
    if (!stateObj().wwToc) return;
    tocBack = true;
    clearTimeout(tocBackT);
    tocBackT = setTimeout(() => { tocBack = false; }, 1000);
    try { history.back(); } catch (e) { tocBack = false; }
  }
  // opts: fromHistory (Back already went), forRow (a row takes the entry over), keep (leave the entry), instant
  function tocClose(opts) {
    opts = opts || {};
    if (!tocEl || !tocEl.open || tocClosing) return;
    if (!opts.fromHistory && !opts.keep) tocHistoryBack();
    if (opts.instant || still()) { tocFinish(opts.forRow); return; }
    // story.css may animate .is-closing (fade and lift); the dialog closes when that is done (at most 400 ms)
    tocClosing = true;
    tocEl.classList.add('is-closing');
    let anims = [];
    try { anims = tocEl.getAnimations ? tocEl.getAnimations() : []; } catch (e) { anims = []; }
    if (!anims.length) { tocFinish(opts.forRow); return; }
    let done = false;
    const fin = () => { if (!done) { done = true; tocFinish(opts.forRow); } };
    Promise.all(anims.map((a) => a.finished)).then(fin, fin);
    setTimeout(fin, 400);
  }
  if (tocEl) {
    tocEl.addEventListener('cancel', (e) => { e.preventDefault(); tocClose(); });
    // closed by the browser itself (Android Back through a close watcher, a form method="dialog"): tidy up
    // ('close' comes a task after close(): our own closes have finished by then)
    tocEl.addEventListener('close', () => { if (!tocShown) return; tocHistoryBack(); tocFinish(false); });
    tocEl.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-toc-close]')) { e.preventDefault(); tocClose(); return; }
      if (t === tocEl) {   // the backdrop (outside the sheet's box)
        const r = tocEl.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) tocClose();
        return;
      }
      const a = t.closest('a[href^="#"]');
      if (!a || !plainClick(e) || skipAttr(a)) return;
      const id = sectionOf(a.getAttribute('href'));
      const el = byId(id);
      if (!el || !inMain(el)) return;
      e.preventDefault();
      // the Contents entry becomes the chapter's entry, so Back lands where the guest was (its wwY); a row for the
      // hash the page already has makes no new entry (as a link to the same hash)
      const same = location.hash === '#' + id;
      tocClose({ forRow: true, keep: !same });
      if (!same) { try { history.replaceState({}, '', '#' + id); } catch (err) { /* sandboxed */ } }
      jumpTo(el, {});
    });
  }
  if (tocBtn) tocBtn.addEventListener('click', (e) => { e.preventDefault(); tocOpen(); });
  const runEl = byId('hdrRun');
  if (runEl) runEl.addEventListener('click', tocOpen);
  window.addEventListener('popstate', () => {
    if (tocBack) { tocBack = false; clearTimeout(tocBackT); return; }   // our own Back after a close
    if (tocEl && tocEl.open && !stateObj().wwToc) tocClose({ fromHistory: true });
  });

  /* ---------------------------------------------------------------- now: the Contents block and the Now pill */
  const startOf = (ev) => { const m = /\d{1,2}h\d{2}/.exec(ev.time || ''); if (m) return m[0]; const d = new Date(+ev.start + 2 * 3600e3); return isNaN(d) ? '' : `${String(d.getUTCHours()).padStart(2, '0')}h${String(d.getUTCMinutes()).padStart(2, '0')}`; };
  let tocNowHTML = null;
  function renderTocNow() {
    const box = byId('tocNow');
    if (!box) return;
    const L = live;
    const cur = L && L.current && L.current[0], nxt = L && L.next && L.next[0];
    const ev = cur || nxt;
    let html = '';
    if (ev) {
      const day = String(L.day || '').split(/[\s,]+/)[0];
      const meta = [cur ? '' : nxt.rel, ev.time, ev.location].filter(Boolean).join(' · ');
      html = `<p class="toc-now__eyebrow">${cur ? '<span class="toc-now__dot" aria-hidden="true"></span>Happening now' : 'Up next'}${day ? `<span class="toc-now__day"> · ${esc(day)}</span>` : ''}</p>`
        + `<p class="toc-now__t">${esc(ev.title)}</p>`
        + (meta ? `<p class="toc-now__m">${esc(meta)}</p>` : '')
        + (ev.nav ? `<button type="button" class="btn btn-primary toc-now__go" data-loc-nav="ev:${esc(ev.id)}" aria-haspopup="dialog">Navigate<span class="vh"> to ${esc(ev.title)}</span></button>` : '')
        + (cur && L.current[1] ? `<p class="toc-now__also">+ ${esc(L.current[1].title)}, also now</p>` : '')
        + (cur && nxt ? `<p class="toc-now__next">Up next${nxt.rel ? ` · ${esc(lower(nxt.rel))}` : ''} · ${esc(nxt.title)}</p>` : '');
    }
    if (html === tocNowHTML) return;
    tocNowHTML = html;
    // (a focused Navigate keeps the focus when the block is redrawn)
    const f = document.activeElement && box.contains(document.activeElement) ? document.activeElement.getAttribute('data-loc-nav') : null;
    box.innerHTML = html;
    box.hidden = !html;
    if (f !== null) {
      const b = $(`[data-loc-nav="${cssEsc(f)}"]`, box) || $('button', box) || $('[data-toc-close]', tocEl);
      if (b) { try { b.focus({ preventScroll: true }); } catch (e) { /* courtesy */ } }
    }
  }
  function renderPill() {
    const pill = byId('nowPill');
    if (!pill) return;
    const ev = pillEv;
    if (ev) {
      const now = !!(live.current && live.current[0]);
      const text = now ? `Now · ${ev.title}` : `Next · ${[startOf(ev), ev.title].filter(Boolean).join(' · ')}`;
      const t = $('.now-pill__t', pill), go = $('.now-pill__go', pill);
      if (t && t.textContent !== text) t.textContent = text;
      if (go && go.textContent !== (ev.nav ? 'Navigate' : 'View')) go.textContent = ev.nav ? 'Navigate' : 'View';
      if (ev.nav) { pill.setAttribute('data-loc-nav', `ev:${ev.id}`); pill.setAttribute('aria-haspopup', 'dialog'); }
      else { pill.removeAttribute('data-loc-nav'); pill.removeAttribute('aria-haspopup'); }
      pill.setAttribute('aria-label', `${now ? 'Happening now' : 'Up next'}: ${ev.title}. ${ev.nav ? 'Navigate there' : 'See it in the weekend'}`);
    }
    syncPill();
  }
  // an event without a place: its row in II (the day's anchor goes into the history)
  function toEvent(ev) {
    const row = $(`#weekend [data-ev="${cssEsc(ev.id)}"]`);
    if (!row) { jump('weekend', { push: true }); return; }
    const day = row.closest('[data-day][id], .wk-day[id]');
    record();
    if (day && location.hash !== '#' + day.id) push('#' + day.id);
    jumpTo(row, {});
  }
  const pillBtn = byId('nowPill');
  if (pillBtn) pillBtn.addEventListener('click', () => { if (pillEv && !pillEv.nav) toEvent(pillEv); });
  // II's .is-now row in view hides the pill (s-weekend.js marks it)
  const isNow = { io: null, els: [], on: new Set() };
  function buildIsNow(force) {
    const els = $$('#weekend .is-now');
    if (!force && els.length === isNow.els.length && els.every((el, i) => el === isNow.els[i])) return;
    if (isNow.io) isNow.io.disconnect();
    isNow.io = null; isNow.els = els; isNow.on.clear();
    if (els.length && IO) {
      isNow.io = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) isNow.on.add(e.target); else isNow.on.delete(e.target); });
        syncPill();
      }, { rootMargin: `-${Math.round(hdrPx)}px 0px 0px 0px` });
      els.forEach((el) => isNow.io.observe(el));
    }
    syncPill();
  }
  const dialogUp = () => {
    if ($('dialog[open]')) return true;
    const lb = byId('lightbox'), g = byId('gate');
    return !!((lb && !lb.hidden) || (g && !g.hidden));
  };
  // shown after #heroNow leaves the screen (the hero, when #heroNow is not shown); hidden while II's now row is in
  // view, while any dialog is open, while a field has focus, and on the dashboard
  function syncPill() {
    const pill = byId('nowPill');
    if (!pill) return;
    let show = !!pillEv && !isNow.on.size && !typing && !admin() && !dialogUp();
    if (show) { const hn = byId('heroNow'); show = !(hn && hn.getClientRects().length ? heroNow.on : has('on-hero')); }
    if (pill.hidden === show) pill.hidden = !show;
    if (has('has-now-pill') !== show) root.classList.toggle('has-now-pill', show);
  }
  let pillT = false;
  const syncPillSoon = () => { if (!pillT) { pillT = true; Promise.resolve().then(() => { pillT = false; syncPill(); }); } };
  const isField = (el) => !!(el && el.matches && el.matches('input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select, [contenteditable=""], [contenteditable="true"]'));
  document.addEventListener('focusin', (e) => { if (isField(e.target)) { typing = true; syncPill(); } });
  document.addEventListener('focusout', () => setTimeout(() => { const t = isField(document.activeElement); if (t !== typing) { typing = t; syncPill(); } }, 0));
  document.addEventListener('ww:live', (e) => {
    live = (e && e.detail) || null;
    WW.live = live;
    pillEv = live ? (live.current && live.current[0]) || (live.next && live.next[0]) || null : null;
    renderTocNow();
    renderPill();
    applyPhase();   // the weekend may begin (or end) while the page is open
    Promise.resolve().then(() => buildIsNow());   // s-weekend.js marks the rows in this same dispatch
  });

  /* ---------------------------------------------------------------- start */
  function start() {
    // before the first paint: the hero is on screen unless the page opens somewhere else
    const h = sectionOf();
    const deep = h !== 'home' && inMain(byId(h)) && byId(h) !== main();
    if (deep || (restore && restore.y > window.innerHeight / 2)) root.classList.add('ww-intro-done');
    else if (!restore || !restore.y) { root.classList.add('on-hero'); setChapter(byId('home')); }
    // a deep link that waits for the network (a personal code being checked): the first frame is already near
    // the target, not on the hero (everything there is still held); the first route places it exactly
    if (deep && !restore) raf(() => { if (firstRoute && !admin()) toY(yOf(byId(h)), 'instant'); });
    observeSections();
    const hdr = byId('siteHeader');
    if (hdr && 'ResizeObserver' in window) {
      new ResizeObserver(() => {
        const v = Math.round(hdr.getBoundingClientRect().height);
        if (v > 0 && v !== hdrPx) { hdrPx = v; rebuildBands(); }
      }).observe(hdr);
    }
    buildHero();
    reconcile();
    const m = main();
    if (m && 'MutationObserver' in window) {
      new MutationObserver((list) => {
        for (const r of list) {
          if ((r.addedNodes.length || r.removedNodes.length) && !(r.target.closest && r.target.closest('[data-snap-count]'))) { reconcileSoon(); return; }
        }
      }).observe(m, { childList: true, subtree: true });
    }
    // dialogs opening and closing (any <dialog>, the lightbox, the gate) show and hide the Now pill
    if (document.body && 'MutationObserver' in window) {
      new MutationObserver(syncPillSoon).observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
      ['lightbox', 'gate'].forEach((id) => { const el = byId(id); if (el) new MutationObserver(syncPillSoon).observe(el, { attributes: true, attributeFilter: ['hidden'] }); });
    }
    if (document.body && 'ResizeObserver' in window) new ResizeObserver(() => { keepCheck(true); if (prog.on) measureSoon(); }).observe(document.body);
    window.addEventListener('resize', debounce(() => { rebuildBands(); measure(); }, 150), { passive: true });
    document.addEventListener('ww:rendered', reconcileSoon);
    applyPhase();
  }

  WW.jump = jump;
  WW.isNear = isNear;
  WW.onNear = onNear;
  WW.live = null;
  try { Object.defineProperty(WW, 'chapter', { get: () => chapter, configurable: true, enumerable: true }); } catch (e) { /* frozen */ }

  start();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reconcile, { once: true });
})();
