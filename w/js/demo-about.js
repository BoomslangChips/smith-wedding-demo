/* demo-about.js: the Smith demo's own band under the invitation, "About the developer": who made it, a form to write
   to him about a website of your own, and (once the couple's tip page exists: window.SMITH_TIP_LINK) "Buy us a coffee".
   The form sends nothing itself: it opens the visitor's own email app with the message written out, so nothing is
   stored or handled by this page. THIS FILE is the one place in the demo that names the real developer; build.mjs
   leaves it (and only it) out of its check for words of the real wedding, on purpose. */
(function () {
  'use strict';
  // (put together here, so that the address is not written out in the page for every address collector to pick up)
  var TO = ['wentzel', 'dev'].join('.') + String.fromCharCode(64) + ['gmail', 'com'].join('.');
  var GITHUB = 'https://github.com/BoomslangChips', GUESTS = 'https://github.com/BoomslangChips/wedding-guests-3d';
  var CSS = ''
    + '#developer{position:relative;background:#171A19;color:#F3F0EA;padding:72px 0 96px;font:400 17px/1.65 var(--font-body);scroll-margin-top:72px}'
    + '#developer .dv-in{max-width:1080px;margin:0 auto;padding:0 22px}'
    + '#developer .dv-eyebrow{margin:0;font:600 13px/1.4 var(--font-body);letter-spacing:.22em;text-transform:uppercase;color:#D8C3A5;text-align:center}'
    + '#developer .dv-title{margin:10px 0 0;font:400 clamp(34px,6vw,48px)/1.1 var(--font-title);color:#F3F0EA;text-align:center}'
    + '#developer .dv-lede{max-width:34em;margin:14px auto 0;text-align:center;color:#B8BDB9;text-wrap:balance}'
    + '#developer .dv-grid{display:grid;gap:36px;margin-top:44px}'
    + '@media (min-width:900px){#developer .dv-grid{grid-template-columns:1fr 1fr;gap:56px;align-items:start}}'
    + '#developer .dv-hi{margin:0 0 6px;font:400 44px/1.1 var(--font-script);color:#D8C3A5}'
    + '#developer .dv-about p{margin:0 0 14px;color:#D9DAD5}'
    + '#developer .dv-about strong{font-weight:600;color:#fff}'
    + '#developer .dv-links{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 0;padding:0;list-style:none}'
    + '#developer .dv-links a{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid rgba(243,240,234,.28);color:#F3F0EA;font:600 14.5px/1 var(--font-body);letter-spacing:.02em;text-decoration:none;transition:background-color .18s ease,border-color .18s ease}'
    + '#developer .dv-links a:hover{background:rgba(243,240,234,.1);border-color:rgba(243,240,234,.55)}'
    + '#developer .dv-links svg{width:18px;height:18px}'
    + '#developer a:focus-visible,#developer button:focus-visible{outline:3px solid #D8C3A5;outline-offset:3px}'
    + '#developer .dv-coffee{margin:30px 0 0;padding:22px 22px 24px;border-radius:18px;border:1px solid rgba(216,195,165,.45);background:rgba(216,195,165,.08)}'
    + '#developer .dv-coffee h3{margin:0 0 4px;font:400 24px/1.2 var(--font-title);color:#F3F0EA}'
    + '#developer .dv-coffee p{margin:0 0 16px;color:#B8BDB9;font-size:16px}'
    + '#developer .dv-coffee a{display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:0 24px;border-radius:999px;background:#D8C3A5;color:#171A19;font:600 15.5px/1 var(--font-body);text-decoration:none}'
    + '#developer .dv-coffee a:hover{background:#E6D5BC}'
    + '#developer .dv-card{padding:26px 24px 24px;border-radius:20px;background:#fff;color:#2E3532;box-shadow:0 30px 60px -36px rgba(0,0,0,.8)}'
    + '@media (min-width:480px){#developer .dv-card{padding:32px 32px 30px}}'
    + '#developer .dv-card h3{margin:0;font:400 27px/1.2 var(--font-title);color:#5A6964}'
    + '#developer .dv-card .dv-sub{margin:6px 0 4px;font-size:16px;line-height:1.55;color:#626A66}'
    + '#developer .dv-card .label{margin:16px 0 6px;font-size:14.5px;color:#2E3532}'
    + '#developer .dv-card .label i{font-style:normal;font-weight:400;color:#7A827E}'
    + '#developer .dv-card .input{font-size:16px}'
    + '#developer .dv-card textarea.input{min-height:132px}'
    + '#developer .dv-card .btn{width:100%;min-height:52px;margin-top:20px;font-size:16px}'
    + '#developer .dv-fine{margin:12px 0 0;font-size:13.5px;line-height:1.5;color:#7A827E;text-align:center}'
    + '#developer .dv-msg{margin:12px 0 0;font-size:15px;font-weight:600;color:#8C3A4C}'
    + '#developer .dv-sent{margin:18px 0 0;padding:16px 18px;border-radius:14px;background:#F4F7F5;border:1px solid #E3E9E5;font-size:15px;line-height:1.55;color:#2E3532}'
    + '#developer .dv-sent b{font-weight:600}'
    + '#developer .dv-sent .dv-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}'
    + '#developer .dv-sent button{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #B9C4BD;background:#fff;color:#5A6964;font:600 14px/1 var(--font-body);cursor:pointer}'
    + '#developer .dv-sent code{font:500 15px/1.4 ui-monospace,Consolas,monospace;overflow-wrap:anywhere}'
    + '#developer .dv-foot{margin:56px 0 0;text-align:center;font-size:14px;color:#8E9590}';
  var IC = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function build() {
    if (!window.SMITH_DEMO || document.getElementById('developer')) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var tip = /^https:\/\/[^\s"'<>]+$/.test(window.SMITH_TIP_LINK || '') ? window.SMITH_TIP_LINK : '';
    var README = window.SMITH_DEMO_LINK || '';
    var s = document.createElement('section'); s.id = 'developer'; s.setAttribute('aria-labelledby', 'dvTitle');
    s.innerHTML = '<div class="dv-in">'
      + '<p class="dv-eyebrow">Behind the demo</p><h2 class="dv-title" id="dvTitle" tabindex="-1">About the developer</h2>'
      + '<p class="dv-lede">James and Sophie are made up. The person who built their website is not.</p>'
      + '<div class="dv-grid">'
      + '<div class="dv-about"><p class="dv-hi">Hi, I&rsquo;m Jean</p>'
      + '<p>I&rsquo;m <strong>Jean Wentzel</strong>, a developer. I built this website for my own wedding: Shani and I are getting married in 2027, and I got a little carried away. What you have just scrolled through is a copy of ours, with every name, date and place changed.</p>'
      + '<p>It is all written by hand, with Claude Code: plain JavaScript, CSS and WebGL, with no template, no page builder and no 3D library. The guests in What to Wear are real 3D figures that breathe and change pose; the reply knows who is invited to what; and behind the real one there is a guest list and a dashboard for the two of us.</p>'
      + '<p>If you would like something like this for your own wedding or event, or help with a website or web app, write to me.</p>'
      + '<ul class="dv-links">'
      + '<li><a href="' + GITHUB + '" target="_blank" rel="noopener">' + IC('<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>') + 'GitHub</a></li>'
      + '<li><a href="' + GUESTS + '" target="_blank" rel="noopener">' + IC('<circle cx="12" cy="7" r="3.2"/><path d="M5.5 20.5c.4-4 3-6.3 6.5-6.3s6.1 2.3 6.5 6.3"/>') + 'The 3D guests, open source</a></li>'
      + (README ? '<li><a href="' + esc(README) + '" target="_blank" rel="noopener">' + IC('<path d="M5 4h10l4 4v12H5zM14 4v5h5M8.5 13h7M8.5 16.5h7"/>') + 'How this demo was made</a></li>' : '')
      + '</ul>'
      + (tip ? '<div class="dv-coffee"><h3>Buy us a coffee</h3><p>If the Smiths made you smile, you can buy the real couple a coffee for the big day.</p>'
        + '<a href="' + esc(tip) + '" target="_blank" rel="noopener">' + IC('<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10.5h1.5a2.5 2.5 0 0 1 0 5H17M7.5 3.5V6M11 3.5V6M14.5 3.5V6"/>') + 'Buy us a coffee</a></div>' : '')
      + '</div>'
      + '<form class="dv-card" id="dvForm" novalidate>'
      + '<h3>Need something like this?</h3><p class="dv-sub">A wedding or event website, a web app, or help with one you already have: tell me about it.</p>'
      + '<label class="label" for="dvName">Your name</label><input class="input" id="dvName" name="name" type="text" autocomplete="name" maxlength="80" required>'
      + '<label class="label" for="dvMail">Your email <i>(so that I can answer)</i></label><input class="input" id="dvMail" name="email" type="email" autocomplete="email" maxlength="120" inputmode="email">'
      + '<label class="label" for="dvAbout">What is it about?</label><select class="input" id="dvAbout" name="about"><option>A wedding or event website</option><option>A website or web app</option><option>The 3D guests</option><option>Something else</option></select>'
      + '<label class="label" for="dvText">Your message</label><textarea class="input" id="dvText" name="message" maxlength="3000" required placeholder="What would you like to build, and by when?"></textarea>'
      + '<button class="btn btn-primary" type="submit">' + IC('<path d="M4 6h16v12H4zM4 7l8 6 8-6"/>').replace('<svg ', '<svg width="20" height="20" ') + 'Write to Jean</button>'
      + '<p class="dv-msg" id="dvMsg" role="alert" hidden></p>'
      + '<p class="dv-fine">This opens your own email app with your message ready to send. This page stores and sends nothing itself.</p>'
      + '<div class="dv-sent" id="dvSent" hidden></div>'
      + '</form></div>'
      + '<p class="dv-foot">The Smith Wedding is a demo. Nothing you type on this page is kept.</p></div>';
    var foot = document.querySelector('footer.colophon') || document.querySelector('footer');
    if (foot && foot.parentNode) foot.parentNode.insertBefore(s, foot.nextSibling); else document.body.appendChild(s);
    var form = s.querySelector('#dvForm'), msg = s.querySelector('#dvMsg'), sent = s.querySelector('#dvSent');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.name.value.trim(), mail = form.email.value.trim(), about = form.about.value, text = form.message.value.trim();
      var bad = !name ? [form.name, 'Please tell me your name.'] : (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) ? [form.email, 'That email address does not look complete.'] : !text ? [form.message, 'Please write a line or two about what you need.'] : null;
      if (bad) { msg.textContent = bad[1]; msg.hidden = false; bad[0].focus(); return; }
      msg.hidden = true;
      var subject = 'Website enquiry: ' + about + ' (from the Smith demo)';
      var body = text + '\n\n' + name + (mail ? '\n' + mail : '') + '\n\n(written on demo.wentzel.wedding)';
      sent.innerHTML = '<b>Your email app should now be open</b> with the message ready: press Send there. If nothing opened, copy the message and send it to <code>' + esc(TO) + '</code>.'
        + '<div class="dv-row"><button type="button" data-copy="body">Copy the message</button><button type="button" data-copy="to">Copy the address</button></div>';
      sent.hidden = false;
      [].forEach.call(sent.querySelectorAll('[data-copy]'), function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-copy') === 'to' ? TO : subject + '\n\n' + body, done = function () { var t = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = t; }, 1600); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, function () {}); else { var ta = document.createElement('textarea'); ta.value = v; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (x) { /* the text stays to be copied by hand */ } ta.remove(); }
        });
      });
      window.location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    });
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
  if (document.readyState !== 'complete') window.addEventListener('load', build);
})();
