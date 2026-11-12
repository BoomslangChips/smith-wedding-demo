/* The Smith wedding is a DEMO: there is no server behind it. This file answers the page's own requests (/api/...)
   here in the browser: the invitation code, the site's content, a made-up household for the reply. Nothing a visitor
   types is sent anywhere; a reply lives in this tab only (sessionStorage) and is gone when the tab is closed. */
(function () {
  'use strict';
  var CODE = 'DEMO';
  var KEY = 'smith_demo_reply';
  var real = window.fetch ? window.fetch.bind(window) : null;
  var json = function (status, obj) { return new Response(JSON.stringify(obj), { status: status, headers: { 'Content-Type': 'application/json' } }); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var norm = function (s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
  var load = function () { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };
  var save = function (v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* a private window: the reply lasts until the page is left */ } };
  var cfg = function () { return window.DEFAULT_CONFIG || {}; };
  var deadline = function () { return (cfg().rsvp || {}).deadline || '2027-07-16'; };
  var eventIds = function () { var out = []; (cfg().days || []).forEach(function (d) { (d.events || []).forEach(function (e) { if (e.rsvp) out.push(e.id); }); }); return out; };

  // The made-up household: whoever the visitor says they are (any first name and surname), and Robin, who comes with
  // them. The visitor may play golf; Robin may not (golf is by invitation), so both kinds of Friday are on show.
  function household(name) {
    var st = load();
    if (name) {
      var parts = String(name).replace(/[<>&"']/g, '').trim().split(/\s+/);
      st.first = cap(parts[0] || 'Alex').slice(0, 24);
      st.last = parts.slice(1).map(cap).join(' ').slice(0, 32) || 'Taylor';
      save(st);
    }
    if (!st.first) return null;
    var a = st.answers || [null, null];
    return {
      token: 'demo', code: null, found_by: 'name', deadline: deadline(), open: true, closed_reason: null,
      members: [
        { ref: 0, first_name: st.first, surname: st.last, plus_one: false, responded: !!a[0], answers: a[0], closed: [] },
        { ref: 1, first_name: 'Robin', surname: st.last, plus_one: false, responded: !!a[1], answers: a[1], closed: ['fri-golf'] }
      ],
      message: st.message || '', song: st.song || '', song_artist: st.song_artist || '',
      message_on_file: !!st.message, song_on_file: !!(st.song || st.song_artist), contact_on_file: false, room_held: false
    };
  }
  // A reply, kept as the real server keeps it: golf never for a guest it is closed to, never golf and the spa together
  function respond(b) {
    var st = load();
    if (!st.first) return json(401, { error: 'This page has been open for a while. Please find your invitation again, then send your reply.' });
    var ids = eventIds(), answers = st.answers || [null, null], out = [];
    var list = Array.isArray(b.members) ? b.members : [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i], ref = m && m.ref;
      if (ref !== 0 && ref !== 1) return json(400, { error: 'Your invitation changed since you opened it. Please find it again.' });
      var yes = m.attending === 'yes', ev = {};
      ids.forEach(function (id) { ev[id] = yes && !!(m.events && m.events[id]); });
      if (ref === 1) ev['fri-golf'] = false;
      if (ev['fri-golf'] && ev['fri-spa']) return json(400, { error: 'Golf and the spa are at the same time. Please choose one of them.' });
      answers[ref] = {
        attending: yes ? 'yes' : 'no', events: ev, stay: yes ? String(m.stay || '') : '', nights: yes && m.nights ? m.nights : {},
        room_people: yes && m.room_people ? Number(m.room_people) : null, dietary: yes ? String(m.dietary || '').slice(0, 200) : '',
        plus_one_name: '', menu: yes && m.menu ? m.menu : {}, menu_names: {}
      };
      out.push({ first_name: ref === 0 ? st.first : 'Robin', attending: answers[ref].attending });
    }
    st.answers = answers; st.message = String(b.message || '').slice(0, 1000); st.song = String(b.song || '').slice(0, 120); st.song_artist = String(b.song_artist || '').slice(0, 120);
    save(st);
    return json(200, { ok: true, members: out });
  }

  function answer(path, method, body) {
    if (path === '/api/rsvp/gate') {
      if (body && typeof body.token === 'string' && body.token) return json(200, { ok: true, kind: 'shared', token: 'demo-invite', expires: Math.floor(Date.now() / 1000) + 30 * 86400 });
      return norm(body && body.code) === CODE
        ? json(200, { ok: true, kind: 'shared', token: 'demo-invite', expires: Math.floor(Date.now() / 1000) + 30 * 86400 })
        : json(200, { ok: false });
    }
    if (path === '/api/site2/config') return json(200, { defaults: null, override: {}, live: { open: true, deadline: deadline(), allow_late: false } });
    if (path === '/api/rsvp/find') {
      var p = household(body && (body.name || [body.first, body.last].filter(Boolean).join(' ')));
      return json(200, { ok: true, party: p });
    }
    if (path === '/api/rsvp/respond') return respond(body || {});
    if (path === '/api/me' || path === '/api/login' || path.indexOf('/api/rsvp-admin/') === 0) return json(401, { error: 'The couple’s dashboard is not part of this demo.' });
    return json(404, { error: 'Not part of this demo.' });
  }

  if (real) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var u; try { u = new URL(url, location.href); } catch (e) { return real(input, init); }
      if (u.origin !== location.origin || u.pathname.indexOf('/api/') !== 0) return real(input, init);
      var method = (init && init.method) || 'GET', body = null;
      try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) { body = null; }
      // (as long as the real site takes: the envelope has time to open, a lookup to "look")
      return wait(350 + Math.random() * 250).then(function () { return answer(u.pathname, method, body); });
    };
  }
  // no offline worker in the demo (there is nothing to keep fresh)
  try { if (navigator.serviceWorker) navigator.serviceWorker.register = function () { return new Promise(function () {}); }; } catch (e) { /* fine */ }

  // What every visitor should know: it is a demo, and the code that opens it
  function pill() {
    if (document.getElementById('demoPill')) return;
    var s = document.createElement('style');
    s.textContent = '#demoPill{position:fixed;left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;max-width:calc(100vw - 20px);padding:8px 14px;border-radius:999px;background:rgba(46,53,50,.92);color:#fff;font:500 13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;box-shadow:0 6px 20px -8px rgba(0,0,0,.5)}#demoPill b{letter-spacing:.08em}#demoPill a{color:#F0C4CB;margin-left:6px}#demoPill button{margin-left:8px;border:0;background:none;color:#fff;font:inherit;cursor:pointer;opacity:.75}#demoPill .short{display:none}#demoPill.is-in{left:8px;bottom:max(8px,env(safe-area-inset-bottom));transform:none;padding:4px 10px;font-size:12px;opacity:.82}#demoPill.is-in .long{display:none}#demoPill.is-in .short{display:inline;letter-spacing:.08em;text-transform:uppercase}';
    document.head.appendChild(s);
    var d = document.createElement('div');
    d.id = 'demoPill'; d.setAttribute('role', 'note');
    d.innerHTML = '<span class="long">A demo: the Smiths are made up. The invitation code is <b>' + CODE + '</b>.</span><span class="short">Demo</span>' + (window.SMITH_DEMO_LINK ? '<a href="' + window.SMITH_DEMO_LINK + '">About</a>' : '') + '<button type="button" aria-label="Hide this note">&times;</button>';
    d.querySelector('button').addEventListener('click', function () { d.remove(); });
    document.body.appendChild(d);
    // once the invitation is open, the note is a small tag in the corner (it no longer names the code or covers a button)
    var gate = document.getElementById('gate');
    var tuck = function () { d.classList.toggle('is-in', !!gate && gate.hidden); };
    if (gate) { tuck(); try { new MutationObserver(tuck).observe(gate, { attributes: true, attributeFilter: ['hidden'] }); } catch (e) { /* stays as it is */ } }
  }
  // A tip jar, only when the couple have set one up (window.SMITH_TIP_LINK: their own page at a tipping service; this
  // demo never handles money itself): a card at the foot of the page
  function tipCard() {
    var link = window.SMITH_TIP_LINK;
    if (!link || document.getElementById('demoTip')) return;
    var host = document.querySelector('.colophon') || document.querySelector('footer');
    var s = document.createElement('section');
    s.id = 'demoTip';
    s.style.cssText = 'margin:0 auto;padding:40px 20px 48px;max-width:560px;text-align:center;font:400 17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#2E3532';
    s.innerHTML = '<p style="margin:0 0 6px;font:400 26px/1.25 \'Playfair Display\',Georgia,serif;color:#5A6964">Enjoyed the Smiths?</p>'
      + '<p style="margin:0 0 18px;color:#626A66">This demo was made for a real wedding. If it made you smile, you can buy the real couple a coffee.</p>'
      + '<a href="' + link + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;min-height:48px;padding:0 26px;border-radius:999px;background:#5A6964;color:#fff;font-weight:600;text-decoration:none">Buy us a coffee</a>';
    if (host && host.parentNode) host.parentNode.insertBefore(s, host); else document.body.appendChild(s);
  }
  var start = function () { pill(); tipCard(); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
