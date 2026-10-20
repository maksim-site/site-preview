(() => {
  const root = document.documentElement;
  const hero = document.querySelector('.hero-video-page .hero');
  if (!hero) return;
  const poster = hero.querySelector('.hero-video-poster');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const parts = [...hero.querySelectorAll('.hero-kicker, .title-mask .metal-type, .hero-subtitle, .hero-description, .hero-copy .button')];
  const animations = new Set();
  let shown = false;
  const timeout = ms => new Promise(resolve => setTimeout(resolve, ms));

  function show(animate = true) {
    if (shown) return;
    shown = true;
    // If the early safety timer already revealed the page, never hide it again.
    if (animate && root.classList.contains('hero-intro-pending') && !reduced.matches && !location.hash && scrollY < 80 && Element.prototype.animate) {
      parts.forEach((part, index) => {
        const animation = part.animate([
          { opacity: 0, transform: 'translateY(18px)', filter: 'blur(4px)' },
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }
        ], { duration: 850, delay: index * 65, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
        animations.add(animation);
        animation.onfinish = () => { animations.delete(animation); animation.cancel(); };
      });
    }
    root.classList.remove('hero-intro-pending');
  }
  function finish() {
    show(false);
    animations.forEach(animation => animation.cancel());
    animations.clear();
  }

  // A tiny frame image is enough to open the page; a slow MP4 never blocks it.
  // Fonts and the image get a bounded wait, with a separate early fail-open guard.
  const imageReady = poster?.decode ? poster.decode().catch(() => {}) : Promise.resolve();
  Promise.race([Promise.all([imageReady, document.fonts.ready]), timeout(1100)]).then(() => show());
  reduced.addEventListener('change', finish);
  document.addEventListener('section:navigate', finish);
  hero.addEventListener('focusin', finish);
  addEventListener('scroll', () => { if (scrollY > 80) finish(); }, { passive: true });
  addEventListener('beforeprint', finish);
  addEventListener('pageshow', event => { if (event.persisted) finish(); });
})();
