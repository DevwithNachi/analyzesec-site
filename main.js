
function startGlyphs(canvas, reduce) {
  var ctx = canvas.getContext('2d');
  var CH = 'ABCDEF0123456789#$%&*+=<>/\\|{}[]:;~^xz';
  var CW = 9.6, LH = 21, W = 0, H = 0, cols = 0, rows = 0, grid = [], shade = [], timer = null, t0 = performance.now();
  var defs = [
    { t: 'L001  95  snakamura   terminated 47d, okta active', r: 0.20, c: 0.50 },
    { t: 'N002  90  svc-legacy-reporting   owner left', r: 0.40, c: 0.58 },
    { t: 'L001  89  ttanaka   github sign-in 1d ago', r: 0.62, c: 0.52 },
    { t: 'P008  87  znakamura   okta admin, idle 131d', r: 0.82, c: 0.60 }
  ];
  var toks = [];
  function rc() { return CH.charAt(Math.floor(Math.random() * CH.length)); }
  function size() {
    var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / CW); rows = Math.ceil(H / LH); grid = []; shade = [];
    for (var i = 0; i < cols * rows; i++) { grid.push(rc()); shade.push(Math.random()); }
    toks = [];
    defs.forEach(function (d) {
      var len = d.t.length; if (len + 2 > cols) return;
      var c = Math.min(Math.floor(d.c * cols), cols - len - 1), r = Math.min(rows - 1, Math.floor(d.r * rows));
      toks.push({ t: d.t, r: r, c: c });
    });
  }
  function fade(x) { var a = (x / W - 0.18) / 0.4; return a < 0 ? 0 : a > 1 ? 1 : a * a * (3 - 2 * a); }
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.font = "13px 'Geist Mono', ui-monospace, monospace"; ctx.textBaseline = 'top';
    var el = (now - t0) / 1000, cover = {};
    var states = toks.map(function (k, i) {
      var p = reduce ? 1.5 : ((el + i * 1.9) % 7.6);
      var shown = 0, on = false;
      if (reduce) { shown = k.t.length; on = true; }
      else if (p < 0.9) { shown = Math.floor(k.t.length * (p / 0.9)); on = true; }
      else if (p < 4.6) { shown = k.t.length; on = true; }
      else if (p < 5.2) { shown = Math.floor(k.t.length * (1 - (p - 4.6) / 0.6)); on = true; }
      if (on) for (var j = 0; j < k.t.length; j++) cover[k.r * cols + k.c + j] = 1;
      return { on: on, shown: shown };
    });
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x; if (cover[i]) continue;
        var px = x * CW, a = fade(px + CW / 2) * (0.10 + 0.30 * shade[i]);
        if (a < 0.02) continue;
        ctx.fillStyle = 'rgba(150, 155, 180, ' + a.toFixed(3) + ')';
        ctx.fillText(grid[i], px, y * LH + 3);
      }
    }
    toks.forEach(function (k, i) {
      var s = states[i]; if (!s.on) return;
      var x0 = k.c * CW, y0 = k.r * LH;
      ctx.fillStyle = 'rgba(245, 183, 0, 0.10)';
      ctx.fillRect(x0 - 6, y0, k.t.length * CW + 12, LH);
      for (var j = 0; j < k.t.length; j++) {
        var ch = k.t.charAt(j);
        if (j < s.shown) { ctx.fillStyle = '#F5B700'; ctx.fillText(ch, x0 + j * CW, y0 + 3); }
        else if (ch !== ' ') { ctx.fillStyle = 'rgba(245, 183, 0, 0.45)'; ctx.fillText(rc(), x0 + j * CW, y0 + 3); }
      }
    });
  }
  function tick() {
    var n = Math.max(1, Math.floor(grid.length * 0.025));
    for (var q = 0; q < n; q++) grid[Math.floor(Math.random() * grid.length)] = rc();
    draw(performance.now());
    timer = setTimeout(function () { raf = requestAnimationFrame(tick); }, 70);
  }
  var raf = null;
  function onResize() { size(); draw(performance.now()); }
  size();
  if (reduce) { draw(performance.now()); } else { tick(); }
  window.addEventListener('resize', onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { draw(performance.now()); });
  return function stop() { clearTimeout(timer); cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
}
function scrambleText(full, onFrame, done) {
  var CH = 'ABCDEF0123456789#$%&*+=<>/\\|{}[]';
  var start = performance.now(), dur = 1100, id = null;
  function step(now) {
    var p = Math.min(1, (now - start) / dur), n = Math.floor(full.length * p), out = '';
    for (var i = 0; i < full.length; i++) {
      var ch = full.charAt(i);
      out += (i < n || ch === ' ') ? ch : CH.charAt(Math.floor(Math.random() * CH.length));
    }
    onFrame(out);
    if (p < 1) id = requestAnimationFrame(step); else if (done) done();
  }
  id = requestAnimationFrame(step);
  return function () { cancelAnimationFrame(id); };
}

(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  startGlyphs(document.getElementById('glyphs'), reduce);
  if (!reduce) {
    var h = document.getElementById('headline');
    // Done callback restores the two-line accent once the scramble finishes.
    scrambleText('Find the access that shouldn’t exist.', function (s) { h.textContent = s; }, function () {
      h.innerHTML = '<span class="l1">Find the access</span> <span class="l2">that shouldn’t exist.</span>';
    });
  }
})();

/* Tabs: roving tabindex, arrow keys, 6s auto-advance, pause on hover or focus */
(function () {
  var DURATION = 6000;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var tablist = root.querySelector('[role="tablist"]');
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var section = root.closest('section');
    var panels = Array.prototype.slice.call(section.querySelectorAll('[role="tabpanel"]'));
    var index = 0, elapsed = 0, last = null, paused = false;

    function fillOf(tab) { return tab.querySelector('.fill'); }

    function activate(i, moveFocus) {
      index = (i + tabs.length) % tabs.length;
      tabs.forEach(function (t, n) {
        var on = n === index;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
        var f = fillOf(t); if (f && !on) f.style.width = '0';
      });
      panels.forEach(function (p, n) { p.classList.toggle('is-active', n === index); });
      elapsed = 0;
      if (moveFocus) tabs[index].focus();
    }

    tabs.forEach(function (t, n) {
      t.addEventListener('click', function () { activate(n, false); });
    });

    tablist.addEventListener('keydown', function (e) {
      var key = e.key, next = null;
      if (key === 'ArrowRight' || key === 'ArrowDown') next = index + 1;
      else if (key === 'ArrowLeft' || key === 'ArrowUp') next = index - 1;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault();
      activate(next, true);
    });

    function setPaused(v) { paused = v; }
    root.addEventListener('mouseenter', function () { setPaused(true); });
    root.addEventListener('mouseleave', function () { setPaused(false); });
    root.addEventListener('focusin', function () { setPaused(true); });
    root.addEventListener('focusout', function (e) {
      if (!root.contains(e.relatedTarget)) setPaused(false);
    });

    if (reduce) return;

    function frame(now) {
      if (last !== null && !paused) {
        elapsed += Math.min(now - last, 100);
        if (elapsed >= DURATION) { activate(index + 1, false); }
      }
      last = now;
      var f = fillOf(tabs[index]);
      if (f) f.style.width = Math.min(1, elapsed / DURATION) * 100 + '%';
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
})();
