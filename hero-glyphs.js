/*
 * AnalyzeSec hero glyph field
 * - A slow-moving character field rendered through a density ramp (faint)
 * - Ambient trails that wander across the field on their own and fade
 * - A purple trail that follows the pointer and scrambles the characters it touches
 * - Optional amber "findings" that decrypt in the side zones (never over the text)
 *
 * Usage:
 *   const stop = initHeroGlyphs(document.querySelector('#hero-canvas'), {
 *     hero: document.querySelector('#top'),          // element that receives pointer moves
 *     content: document.querySelector('.hero-content'), // text block to keep clear
 *     findings: true
 *   });
 */
(function (global) {
  function initHeroGlyphs(canvas, opts) {
    opts = opts || {};
    var hero = opts.hero || canvas.parentElement;
    var content = opts.content || null;
    var showFindings = opts.findings === true;   // off unless asked for
    // All the dials in one place. Any can be overridden through opts.
    var CFG = {
      fontSize: opts.fontSize || 10,         // px
      idleOpacity: opts.idleOpacity != null ? opts.idleOpacity : 0.40,   // resting glyphs
      ambientPeak: opts.ambientPeak != null ? opts.ambientPeak : 0.80,   // white trails at their brightest
      cursorPeak: opts.cursorPeak != null ? opts.cursorPeak : 1.0,       // purple cursor trail
      maxWalkers: opts.maxWalkers || 10,
      spawnMin: 150, spawnMax: 450           // ms between new trails
    };
    var ctx = canvas.getContext('2d');

    // Light to dense. Characters are picked by a smooth field value.
    var RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
    var NOISE = '!@#$%&*+=<>/\\|{}[]:;~^?';
    var CW = Math.round(CFG.fontSize * 1.15), LH = Math.round(CFG.fontSize * 1.6);
    var FONT = CFG.fontSize + "px 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
    var TRAIL_MS = 900, TRAIL_R = 56;

    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = 0, H = 0, cols = 0, rows = 0;
    var hole = null;             // {cx, cy, rx, ry} ellipse around the text
    var walkers = [];            // ambient wanderers
    var ambient = [];            // their trail points {x, y, t, tint}
    var ambBoost = null, ambTint = null;
    var trail = [];              // pointer points {x, y, t}
    var trailBoost = null;       // per-cell trail strength 0..1
    var scramble = null;         // per-cell scrambled char while under the trail
    var slots = [];              // placed findings
    var raf = 0, last = 0, nextWalker = 0, visible = true, t0 = performance.now();
    var AMB_MS = 1500, AMB_R = 40;
    var styleCache = {};

    var FINDINGS = [
      'L001  95  snakamura   terminated 47d, okta active',
      'N002  90  svc-legacy-reporting   owner left',
      'L001  89  ttanaka   github sign-in 1d ago',
      'P008  87  znakamura   okta admin, idle 131d'
    ];

    function rgba(r, g, b, a) {
      a = Math.max(0, Math.min(1, Math.round(a * 50) / 50));
      var k = r + ',' + g + ',' + b + ',' + a;
      return styleCache[k] || (styleCache[k] = 'rgba(' + k + ')');
    }
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function smooth(e0, e1, x) { var t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }

    function field(x, y, t) {
      var v = Math.sin(x * 0.055 + t * 0.22 + Math.sin(y * 0.09 + t * 0.15) * 1.8)
            + Math.sin(y * 0.12 - t * 0.18 + Math.sin(x * 0.035 - t * 0.1) * 2.2) * 0.8
            + Math.sin((x + y) * 0.025 + t * 0.07) * 0.6;
      return clamp01((v + 2.4) / 4.8);
    }

    function holeFactor(px, py) {
      if (!hole) return 1;
      var dx = (px - hole.cx) / hole.rx, dy = (py - hole.cy) / hole.ry;
      var d = Math.sqrt(dx * dx + dy * dy);
      return 0.15 + 0.85 * smooth(0.8, 1.25, d);   // very faint behind the text, full outside
    }
    function inHole(px, py) {
      if (!hole) return false;
      var dx = (px - hole.cx) / hole.rx, dy = (py - hole.cy) / hole.ry;
      return dx * dx + dy * dy < 1.1;
    }

    function size() {
      var r = canvas.getBoundingClientRect(), dpr = global.devicePixelRatio || 1;
      W = r.width; H = r.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / CW); rows = Math.ceil(H / LH);
      trailBoost = new Float32Array(cols * rows);
      ambBoost = new Float32Array(cols * rows);
      ambTint = new Uint8Array(cols * rows);
      scramble = new Array(cols * rows);
      hole = null;
      if (content) {
        var c = content.getBoundingClientRect();
        hole = {
          cx: c.left - r.left + c.width / 2,
          cy: c.top - r.top + c.height / 2,
          rx: c.width / 2 + 56,
          ry: c.height / 2 + 40
        };
      }
      placeFindings(r);
      if (reduce) draw(performance.now());
    }

    function placeFindings(r) {
      slots = [];
      if (!showFindings || !hole || W < 1100) return;
      var leftEnd = hole.cx - hole.rx - 24, rightStart = hole.cx + hole.rx + 24;
      var zones = [
        { x0: 24, x1: leftEnd, ys: [0.2, 0.72] },
        { x0: rightStart, x1: W - 24, ys: [0.34, 0.86] }
      ];
      var k = 0;
      zones.forEach(function (z) {
        z.ys.forEach(function (fy) {
          var text = FINDINGS[k++ % FINDINGS.length];
          var width = text.length * CW;
          if (z.x1 - z.x0 < width) return;           // doesn't fit: skip it
          var c = Math.floor((z.x0 + (z.x1 - z.x0 - width) / 2) / CW);
          var row = Math.min(rows - 2, Math.floor((H * fy) / LH));
          slots.push({ text: text, c: c, r: row, offset: slots.length * 2.1 });
        });
      });
    }

    function spawnWalker(now) {
      // Start just inside an edge or at a random point outside the text, heading somewhere random.
      for (var tries = 0; tries < 10; tries++) {
        var x = Math.random() * W, y = Math.random() * H;
        if (inHole(x, y)) continue;
        walkers.push({
          x: x, y: y,
          a: Math.random() * Math.PI * 2,
          turn: (Math.random() - 0.5) * 4,         // preferred curl, radians per second
          spd: 70 + Math.random() * 230,           // px per second
          born: now, life: 800 + Math.random() * 3200,
          tint: 0,                                 // ambient trails are always white
          lastT: now
        });
        return;
      }
    }

    function stepWalkers(now) {
      walkers = walkers.filter(function (w) {
        var dt = Math.min(0.05, (now - w.lastT) / 1000); w.lastT = now;
        w.turn += (Math.random() - 0.5) * 8 * dt;               // drift the curl
        if (w.turn > 4) w.turn = 4; if (w.turn < -4) w.turn = -4;
        w.a += w.turn * dt + (Math.random() - 0.5) * 0.9;       // wander
        if (Math.random() < 0.04) w.a += (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.2); // sudden turn
        w.spd *= 0.9 + Math.random() * 0.2;                     // speed jitter
        if (w.spd < 60) w.spd = 60; if (w.spd > 320) w.spd = 320;
        // steer away from the text block
        if (hole) {
          var dx = (w.x - hole.cx) / hole.rx, dy = (w.y - hole.cy) / hole.ry;
          if (dx * dx + dy * dy < 1.6) {
            var away = Math.atan2(w.y - hole.cy, w.x - hole.cx);
            w.a += Math.sin(away - w.a) * 4 * dt;
          }
        }
        w.x += Math.cos(w.a) * w.spd * dt; w.y += Math.sin(w.a) * w.spd * dt;
        ambient.push({ x: w.x, y: w.y, t: now, tint: w.tint });
        var out = w.x < -40 || w.y < -40 || w.x > W + 40 || w.y > H + 40;
        return !out && now - w.born < w.life;
      });
      while (ambient.length && now - ambient[0].t > AMB_MS) ambient.shift();
    }

    function stamp(points, ms, radius, strength, boost, tintArr, now) {
      for (var p = 0; p < points.length; p++) {
        var pt = points[p], life = 1 - (now - pt.t) / ms;
        if (life <= 0) continue;
        var c0 = Math.max(0, Math.floor((pt.x - radius) / CW)), c1 = Math.min(cols - 1, Math.ceil((pt.x + radius) / CW));
        var r0 = Math.max(0, Math.floor((pt.y - radius) / LH)), r1 = Math.min(rows - 1, Math.ceil((pt.y + radius) / LH));
        for (var ry = r0; ry <= r1; ry++) {
          for (var cx = c0; cx <= c1; cx++) {
            var dx = cx * CW + CW / 2 - pt.x, dy = ry * LH + LH / 2 - pt.y;
            var d = Math.sqrt(dx * dx + dy * dy);
            if (d > radius) continue;
            var sv = (1 - d / radius) * life * strength;
            var i = ry * cols + cx;
            if (sv > boost[i]) { boost[i] = sv; if (tintArr) tintArr[i] = pt.tint; }
          }
        }
      }
    }

    function draw(now) {
      var t = reduce ? 0 : (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.font = FONT;
      ctx.textBaseline = 'top';

      // Trails: the pointer's (indigo) and the ambient wanderers' (white or indigo).
      trailBoost.fill(0); ambBoost.fill(0);
      if (!reduce) {
        while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
        stamp(trail, TRAIL_MS, TRAIL_R, 1, trailBoost, null, now);
        stamp(ambient, AMB_MS, AMB_R, 1, ambBoost, ambTint, now);
      }

      // Findings: mark covered cells and compute reveal state.
      var cover = {}, states = [];
      slots.forEach(function (s, k) {
        var ph = reduce ? 2 : ((t + s.offset) % 8.4), shown = 0, on = false;
        if (reduce) { shown = s.text.length; on = true; }
        else if (ph < 1.0) { shown = Math.floor(s.text.length * ph); on = true; }
        else if (ph < 5.0) { shown = s.text.length; on = true; }
        else if (ph < 5.6) { shown = Math.floor(s.text.length * (1 - (ph - 5.0) / 0.6)); on = true; }
        if (on) for (var j = 0; j < s.text.length; j++) cover[s.r * cols + s.c + j] = 1;
        states[k] = { on: on, shown: shown };
      });

      // Base field.
      for (var row = 0; row < rows; row++) {
        var py = row * LH;
        var vfade = smooth(0, 0.12, py / H) * (1 - smooth(0.78, 1, py / H));
        for (var col = 0; col < cols; col++) {
          var idx = row * cols + col;
          if (cover[idx]) continue;
          var px = col * CW;
          var v = field(col, row, t);
          var ch = RAMP.charAt(Math.floor(v * (RAMP.length - 1)));
          var hf = holeFactor(px + CW / 2, py + LH / 2);
          var base = CFG.idleOpacity * (0.75 + 0.25 * v) * vfade * hf;

          var tb = trailBoost[idx];
          var ab = ambBoost[idx] * Math.max(hf, 0.5);
          if (tb > 0.04) {
            if (tb > 0.45) {
              if (!scramble[idx] || Math.random() < 0.25) scramble[idx] = NOISE.charAt(Math.floor(Math.random() * NOISE.length));
              ch = scramble[idx];
            }
            ctx.fillStyle = rgba(154, 155, 250, Math.max(base, tb * CFG.cursorPeak * Math.max(hf, 0.6)));
          } else if (ab > 0.04) {
            if (ab > 0.4) {
              if (!scramble[idx] || Math.random() < 0.2) scramble[idx] = NOISE.charAt(Math.floor(Math.random() * NOISE.length));
              ch = scramble[idx];
            } else if (ch === ' ') ch = RAMP.charAt(20 + (idx % 30));
            ctx.fillStyle = rgba(245, 245, 247, Math.max(base, ab * CFG.ambientPeak));
          } else {
            if (ch === ' ' || base < 0.015) continue;
            ctx.fillStyle = rgba(160, 164, 188, base);
          }
          ctx.fillText(ch, px, py + 4);
        }
      }

      // Findings on top.
      slots.forEach(function (s, k) {
        var st = states[k]; if (!st.on) return;
        var x0 = s.c * CW, y0 = s.r * LH;
        ctx.fillStyle = 'rgba(245, 183, 0, 0.09)';
        ctx.fillRect(x0 - 6, y0, s.text.length * CW + 12, LH);
        for (var j = 0; j < s.text.length; j++) {
          var c = s.text.charAt(j);
          if (j < st.shown) { ctx.fillStyle = '#F5B700'; ctx.fillText(c, x0 + j * CW, y0 + 4); }
          else if (c !== ' ') { ctx.fillStyle = 'rgba(245, 183, 0, 0.4)'; ctx.fillText(NOISE.charAt(Math.floor(Math.random() * NOISE.length)), x0 + j * CW, y0 + 4); }
        }
      });
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      if (now - last < 33) return;            // ~30 fps is plenty for this
      last = now;
      if (now > nextWalker && walkers.length < CFG.maxWalkers) { spawnWalker(now); nextWalker = now + CFG.spawnMin + Math.random() * (CFG.spawnMax - CFG.spawnMin); }
      stepWalkers(now);
      draw(now);
    }

    function onMove(e) {
      if (reduce || e.pointerType === 'touch') return;
      var r = canvas.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      var prev = trail[trail.length - 1];
      if (prev && Math.abs(prev.x - x) + Math.abs(prev.y - y) < 6) return;
      trail.push({ x: x, y: y, t: performance.now() });
      if (trail.length > 80) trail.shift();
    }

    size();
    var ro = global.ResizeObserver ? new ResizeObserver(size) : null;
    if (ro) { ro.observe(hero); if (content) ro.observe(content); } else global.addEventListener('resize', size);
    var io = global.IntersectionObserver ? new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }) : null;
    if (io) io.observe(hero);
    hero.addEventListener('pointermove', onMove);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(size);
    if (!reduce) raf = requestAnimationFrame(frame);

    return function destroy() {
      cancelAnimationFrame(raf);
      hero.removeEventListener('pointermove', onMove);
      if (ro) ro.disconnect(); else global.removeEventListener('resize', size);
      if (io) io.disconnect();
    };
  }
  global.initHeroGlyphs = initHeroGlyphs;
})(window);
