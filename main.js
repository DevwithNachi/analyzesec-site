
function startGlyphs(canvas, reduce) {
  var ctx = canvas.getContext('2d');
  var CH = 'ABCDEF0123456789#$%&*+=<>/\\|{}[]:;~^xz';
  var CW = 9.6, LH = 21, PAD = 40, MARGIN = 16, MOBILE_BREAK = 900;
  var W = 0, H = 0, cols = 0, rows = 0, grid = [], shade = [], timer = null, t0 = performance.now();
  var hero = canvas.parentElement;
  var TEXT_SEL = '.eyebrow, .hero-title, .hero-sub, .hero-actions';
  // Two findings per side zone, at different heights. Each line is one row of text.
  var FINDINGS = [
    { lines: ['L001  95  snakamura', 'okta still active'], side: 'left', at: 0.12 },
    { lines: ['N002  90', 'svc-legacy-reporting', 'owner left'], side: 'right', at: 0.34 },
    { lines: ['L001  89  ttanaka', 'github 1d ago'], side: 'left', at: 0.74 },
    { lines: ['P008  87  znakamura', 'idle 131d, admin'], side: 'right', at: 0.92 }
  ];
  var box = null;   // text block in canvas coordinates
  var ell = null;   // mask ellipse
  var dim = 1;      // overall glyph strength (dimmed below MOBILE_BREAK)
  var toks = [];
  function rc() { return CH.charAt(Math.floor(Math.random() * CH.length)); }

  // Text block = union of the hero text elements, in canvas coordinates.
  // The ellipse circumscribes the padded block, so its corners are clear too.
  function measure() {
    var cr = canvas.getBoundingClientRect();
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    hero.querySelectorAll(TEXT_SEL).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      x0 = Math.min(x0, r.left - cr.left); y0 = Math.min(y0, r.top - cr.top);
      x1 = Math.max(x1, r.right - cr.left); y1 = Math.max(y1, r.bottom - cr.top);
    });
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    ell = {
      cx: box.x + box.w / 2,
      cy: box.y + box.h / 2,
      rx: (box.w / 2) * Math.SQRT2 + PAD,
      ry: (box.h / 2) * Math.SQRT2 + PAD
    };
  }

  // Findings go in the side zones outside the padded text block.
  // A finding that does not fit fully in its zone is skipped.
  function layoutFindings() {
    toks = [];
    if (W < MOBILE_BREAK) return;
    var leftW = box.x - PAD - MARGIN;
    var rightX = box.x + box.w + PAD + MARGIN;
    var rightW = W - rightX - MARGIN;
    FINDINGS.forEach(function (f) {
      var maxLen = 0, total = 0;
      f.lines.forEach(function (l) { maxLen = Math.max(maxLen, l.length); total += l.length; });
      var pxW = maxLen * CW + 12, pxH = f.lines.length * LH;
      if (pxW > (f.side === 'left' ? leftW : rightW)) return;
      var x = f.side === 'left' ? MARGIN : rightX;
      var y = Math.min(Math.max(box.y + f.at * box.h - pxH / 2, 0), H - pxH);
      toks.push({ lines: f.lines, total: total, c: Math.floor(x / CW), r: Math.floor(y / LH) });
    });
  }

  function size() {
    var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / CW); rows = Math.ceil(H / LH); grid = []; shade = [];
    for (var i = 0; i < cols * rows; i++) { grid.push(rc()); shade.push(Math.random()); }
    dim = W < MOBILE_BREAK ? 0.35 : 1;
    measure();
    layoutFindings();
  }

  // 0 inside the ellipse (text area stays clear), 1 outside it, smooth ramp between.
  function maskAt(px, py) {
    var dx = (px - ell.cx) / ell.rx, dy = (py - ell.cy) / ell.ry;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 1) return 0;
    if (d >= 1.3) return 1;
    var t = (d - 1) / 0.3;
    return t * t * (3 - 2 * t);
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.font = "13px 'Geist Mono', ui-monospace, monospace"; ctx.textBaseline = 'top';
    var el = (now - t0) / 1000, cover = {};
    var states = toks.map(function (k, i) {
      var p = reduce ? 1.5 : ((el + i * 1.9) % 7.6);
      var shown = 0, on = false;
      if (reduce) { shown = k.total; on = true; }
      else if (p < 0.9) { shown = Math.floor(k.total * (p / 0.9)); on = true; }
      else if (p < 4.6) { shown = k.total; on = true; }
      else if (p < 5.2) { shown = Math.floor(k.total * (1 - (p - 4.6) / 0.6)); on = true; }
      if (on) k.lines.forEach(function (line, li) {
        for (var j = 0; j < line.length; j++) cover[(k.r + li) * cols + k.c + j] = 1;
      });
      return { on: on, shown: shown };
    });
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x; if (cover[i]) continue;
        var m = maskAt(x * CW + CW / 2, y * LH + LH / 2);
        var a = m * (0.10 + 0.30 * shade[i]) * dim;
        if (a < 0.02) continue;
        ctx.fillStyle = 'rgba(150, 155, 180, ' + a.toFixed(3) + ')';
        ctx.fillText(grid[i], x * CW, y * LH + 3);
      }
    }
    toks.forEach(function (k, i) {
      var s = states[i]; if (!s.on) return;
      var g = 0;
      k.lines.forEach(function (line, li) {
        var x0 = k.c * CW, y0 = (k.r + li) * LH;
        ctx.fillStyle = 'rgba(245, 183, 0, 0.10)';
        ctx.fillRect(x0 - 6, y0, line.length * CW + 12, LH);
        for (var j = 0; j < line.length; j++, g++) {
          var ch = line.charAt(j);
          if (g < s.shown) { ctx.fillStyle = '#F5B700'; ctx.fillText(ch, x0 + j * CW, y0 + 3); }
          else if (ch !== ' ') { ctx.fillStyle = 'rgba(245, 183, 0, 0.45)'; ctx.fillText(rc(), x0 + j * CW, y0 + 3); }
        }
      });
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
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { size(); draw(performance.now()); });
  return function stop() { clearTimeout(timer); cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
}
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  startGlyphs(document.getElementById('glyphs'), reduce);
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
