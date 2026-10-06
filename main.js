/* Hero: static headline, animated glyph field from hero-glyphs.js */
(function () {
  if (typeof initHeroGlyphs !== 'function') return;
  initHeroGlyphs(document.getElementById('glyphs'), {
    hero: document.getElementById('top'),
    content: document.querySelector('.hero-copy'),
    findings: true
  });
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
