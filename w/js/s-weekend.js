/* =====================================================================
   THE SMITH WEDDING · II The Weekend (WP2): the itinerary keeps time
   - 'ww:live' (location.js: on load, every 30 s, when the tab shows again) carries null or { at, day, current, next }.
     Every li[data-ev] in #daysWrap is then .is-now (in current), .is-next (in next, "· in 40 min" after its time) or
     .is-past (its end, data-e, is behind `at`); null clears them all. story.js looks for the .is-now rows in a
     microtask after the dispatch (the Now pill hides over them), so they are set here, inside the listener.
   - The spine (.wk-spine): its solid fill reaches the now-bead (--now-y, as --now-k of the spine's height), or, between
     events, the point between the last bead passed and the next one that the clock has reached; --feat-top / --feat-h
     are the wedding day's stretch (drawn 2px); --spine-top is the first day's ring. All measured from the layout
     (offsetTop, so a reveal still rising does not skew them), and again whenever the itinerary changes size.
   - A day's dress chip goes to that day's look in V (#look-<day>) once it is on the page, else to #dresscode.
   - The wedding day's ornament (the gazebo plate) is fetched once the day is about a screen away (.wk-near).
   - app.js renderWeekend() draws the same past / now / next from the same clock when it renders, so the first paint is
     already right; after every render ('ww:rendered') the last 'ww:live' is painted again.
   ===================================================================== */
(function () {
  'use strict';
  const doc = document;
  const $ = (s, r) => (r || doc).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || doc).querySelectorAll(s));
  const raf = window.requestAnimationFrame ? (f) => window.requestAnimationFrame(f) : (f) => setTimeout(f, 16);
  const days = () => doc.getElementById('daysWrap');
  const flip = (el, c, on) => { if (el.classList.contains(c) !== on) el.classList.toggle(c, on); };
  let last;   // the last 'ww:live' detail (undefined until one has come; null outside the weekend)

  // the weekend's clock: the last 'ww:live', else motion.js's (it honours ?now=)
  function clock() {
    if (last && typeof last.at === 'number' && isFinite(last.at)) return last.at;
    const P = window.WWPhase;
    const t = P && typeof P.now === 'function' ? +P.now() : NaN;
    return isFinite(t) ? t : Date.now();
  }
  // "In 40 min" -> "in 40 min"; "Tomorrow at 14h30" -> "tomorrow" (the row shows its time already)
  function relText(rel) {
    const r = String(rel || '').trim();
    const day = /^(.+?) at \d{1,2}h\d{2}$/i.exec(r);
    if (day) {
      const w = day[1].toLowerCase();
      return w === 'today' ? 'later today' : w === 'tomorrow' ? 'tomorrow' : `on ${day[1]}`;
    }
    return r ? r.charAt(0).toLowerCase() + r.slice(1) : '';
  }

  /* ---------------------------------------------------------------- past / now / next */
  function paint(d) {
    const w = days();
    if (!w) return;
    const ok = !!d && typeof d === 'object' && typeof d.at === 'number' && isFinite(d.at);
    const list = (k) => (ok && Array.isArray(d[k]) ? d[k].filter((e) => e && e.id != null) : []);
    const now = new Set(list('current').map((e) => String(e.id)));
    const next = new Map(list('next').map((e) => [String(e.id), relText(e.rel)]));
    $$('li[data-ev]', w).forEach((li) => {
      const id = li.getAttribute('data-ev');
      const end = parseFloat(li.getAttribute('data-e'));
      const isNow = now.has(id), isNext = !isNow && next.has(id);
      flip(li, 'is-now', isNow);
      flip(li, 'is-next', isNext);
      flip(li, 'is-past', ok && !isNow && !isNext && end <= +d.at);
      const r = $('.wk-rel', li);
      const t = isNext && next.get(id) ? ` · ${next.get(id)}` : '';
      if (r && r.textContent !== t) r.textContent = t;
    });
    flip(w, 'is-live', now.size + next.size > 0);
    today(ok ? new Date(+d.at + 72e5).toISOString().slice(0, 10) : '');
    measureSoon();
  }
  // the rail's day that is today (SAST) during the weekend: a rose dot, and "today" for a screen reader
  function today(iso) {
    $$('#wkRail a[href^="#d-"]').forEach((a) => {
      const day = doc.getElementById(a.getAttribute('href').slice(1));
      const on = !!iso && !!day && day.getAttribute('data-date') === iso;
      flip(a, 'is-today', on);
      let t = $('.wk-rail__today', a);
      if (on && !t) { t = doc.createElement('span'); t.className = 'vh wk-rail__today'; t.textContent = ', today'; a.appendChild(t); }
      else if (!on && t) t.remove();
    });
  }

  /* ---------------------------------------------------------------- the spine */
  function measure() {
    const w = days();
    const spine = w && $('.wk-spine', w);
    if (!spine || !w.offsetHeight) return;
    // the distance from the top of #daysWrap (offsetTop: transforms left out), and an element's middle
    const yIn = (el) => { let y = 0; for (let n = el; n && n !== w; n = n.offsetParent) y += n.offsetTop; return y; };
    const mid = (el) => yIn(el) + el.offsetHeight / 2;
    // an SVG ring has no offsetTop: where its head rests (the top of its day, inside the day's padding; not the
    // head's own offsetTop: on a wide screen the head sticks under the rail and rides down its day), plus where the
    // ring sits in its head
    const ringMid = (day) => {
      const head = day && $('.wk-head', day), ring = head && $('.wk-ring', head);
      if (!ring) return day ? yIn(day) : 0;
      const a = ring.getBoundingClientRect(), b = head.getBoundingClientRect();
      return yIn(day) + (parseFloat(getComputedStyle(day).paddingTop) || 0) + (a.top - b.top) + a.height / 2;
    };
    const set = (k, v) => { if (spine.style.getPropertyValue(k) !== v) spine.style.setProperty(k, v); };
    const top = Math.round(ringMid($('.wk-day', w)));
    const h = Math.max(1, w.offsetHeight - top);
    set('--spine-top', `${top}px`);
    // the wedding day: from its ring to its foot, 2px
    const feat = $('.wk-day--feature', w);
    const f0 = feat ? ringMid(feat) - top : 0;
    set('--feat-top', `${Math.round(f0)}px`);
    set('--feat-h', `${feat ? Math.round(yIn(feat) + feat.offsetHeight - top - f0) : 0}px`);
    // now
    const bead = (li) => $('.wk-bead', li) || li;
    const lis = $$('li[data-ev]', w);
    const nows = lis.filter((li) => li.classList.contains('is-now'));
    let y = 0;
    if (nows.length) y = mid(bead(nows[nows.length - 1])) - top;
    else {
      const nx = lis.find((li) => li.classList.contains('is-next'));
      if (nx) {
        const prev = lis.slice(0, lis.indexOf(nx)).filter((li) => li.classList.contains('is-past')).pop();
        const day0 = $('.wk-day', w);
        const t0 = prev ? parseFloat(prev.getAttribute('data-e')) : Date.parse(`${(day0 && day0.getAttribute('data-date')) || ''}T00:00:00+02:00`);
        const t1 = parseFloat(nx.getAttribute('data-s'));
        const y0 = prev ? mid(bead(prev)) - top : 0, y1 = mid(bead(nx)) - top;
        const k = t1 > t0 ? Math.min(1, Math.max(0, (clock() - t0) / (t1 - t0))) : 1;
        y = y0 + k * (y1 - y0);
      }
    }
    y = Math.max(0, Math.min(h, y));
    set('--now-y', `${Math.round(y)}px`);
    set('--now-k', (y / h).toFixed(4));
  }
  let measureT = 0;
  function measureSoon() { if (!measureT) measureT = raf(() => { measureT = 0; measure(); }); }

  /* ---------------------------------------------------------------- the dress chips: the day's look in V */
  function looks() {
    const main = doc.getElementById('main');
    $$('#daysWrap a.wk-dress').forEach((a) => {
      const day = a.closest('[data-day]');
      const look = day && doc.getElementById(`look-${day.getAttribute('data-day')}`);
      const href = look && main && main.contains(look) ? `#${look.id}` : '#dresscode';
      if (a.getAttribute('href') !== href) a.setAttribute('href', href);
    });
  }
  // (VI may render its looks later: the chip checks again as it is pressed or focused, before story.js reads it)
  const onChip = (e) => { if (e.target && e.target.closest && e.target.closest('a.wk-dress')) looks(); };
  doc.addEventListener('pointerdown', onChip, true);
  doc.addEventListener('focusin', onChip, true);

  /* ---------------------------------------------------------------- the wedding day's plate (the gazebo) */
  // fetched once the day is about a screen away (.wk-near on .wk-day--feature), never with the first screen; once
  // near, a fresh render of the day has it at once
  let plateIO = null, plateNear = false;
  function plate() {
    const f = $('#daysWrap .wk-day--feature');
    if (plateIO) plateIO.disconnect();
    if (!f) return;
    if (plateNear || !('IntersectionObserver' in window)) { f.classList.add('wk-near'); return; }
    plateIO = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      plateNear = true;
      plateIO.disconnect();
      f.classList.add('wk-near');
    }, { rootMargin: '100% 0px 100% 0px' });
    plateIO.observe(f);
  }

  /* ---------------------------------------------------------------- wiring */
  const known = () => (last !== undefined ? last : window.WWLoc && window.WWLoc.live !== undefined ? window.WWLoc.live : undefined);
  doc.addEventListener('ww:live', (e) => { last = e && e.detail ? e.detail : null; paint(last); });
  doc.addEventListener('ww:rendered', () => {
    const d = known();
    if (d !== undefined) paint(d); else measureSoon();
    looks();
    plate();
  });
  function start() {
    const w = days();
    if (w && 'ResizeObserver' in window) new ResizeObserver(measureSoon).observe(w);
    plate();
    const d = known();
    if (d !== undefined) paint(d); else measureSoon();
    looks();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
