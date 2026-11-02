(() => {
  document.documentElement.classList.add('js');
  // Рамки фокуса только при работе с клавиатуры, не при нажатиях пальцем или мышью
  const root = document.documentElement;
  addEventListener('keydown', (e) => { if (e.key === 'Tab') root.classList.add('kbd'); });
  addEventListener('pointerdown', () => root.classList.remove('kbd'));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Шапка закреплена сверху; после прокрутки появляется тонкая линия
  const header = document.querySelector('.header');
  const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Мобильное меню
  const dialog = document.querySelector('.mobile-menu'), trigger = document.querySelector('.menu-trigger');
  if (dialog && trigger) {
    trigger.addEventListener('click', () => { dialog.showModal(); dialog.focus(); trigger.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; });
    const close = () => { dialog.close(); document.body.style.overflow = ''; };
    dialog.querySelector('.menu-close').addEventListener('click', close);
    // Якорь из меню: сначала закрыть окно, потом прокрутить (пока окно открыто, браузер не скроллит)
    dialog.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => {
      close();
      const target = a.hash && a.pathname === location.pathname && document.querySelector(a.hash);
      if (!target) return;
      e.preventDefault();
      history.pushState(null, '', a.hash);
      requestAnimationFrame(() => target.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth' }));
    }));
    dialog.addEventListener('close', () => { trigger.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; if (root.classList.contains('kbd')) trigger.focus({ preventScroll: true }); else document.activeElement?.blur(); });
  }

  // Появление блоков при прокрутке
  if (!reduce.matches && 'IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in-view'); obs.unobserve(e.target); }
    }, { threshold: 0.08, rootMargin: '0px 0px 35px 0px' });
    document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));
    document.documentElement.classList.add('reveal-ready');
  }

  // Флот: строка таблицы подсвечивает своё фото в мозаике (если у борта указано фото)
  const mosaic = document.querySelector('.fleet-mosaic');
  document.querySelectorAll('.fleet-table tr[data-photo]').forEach((row) => {
    const fig = mosaic?.querySelector(`figure[data-photo="${row.dataset.photo}"]`);
    if (!fig) return;
    row.addEventListener('mouseenter', () => { mosaic.classList.add('is-focus'); fig.classList.add('is-linked'); });
    row.addEventListener('mouseleave', () => { mosaic.classList.remove('is-focus'); fig.classList.remove('is-linked'); });
  });

  // Видео первого экрана
  const hero = document.querySelector('.hero'), video = document.querySelector('.hero-video'), button = document.querySelector('.video-toggle');
  if (!hero || !video || !button) return;
  const scenes = JSON.parse(hero.dataset.scenes || '[]');
  const bars = [...hero.querySelectorAll('.video-scenes span')];
  let manuallyPaused = false, started = false, raf = 0;

  const setState = (playing) => {
    hero.classList.toggle('is-playing', playing);
    button.setAttribute('aria-label', playing ? 'Приостановить фоновое видео' : 'Включить фоновое видео');
  };
  const draw = () => {
    const t = video.currentTime;
    bars.forEach((bar, i) => {
      const p = Math.min(1, Math.max(0, (t - scenes[i]) / (scenes[i + 1] - scenes[i])));
      bar.style.transform = `scaleX(${p.toFixed(3)})`;
    });
    if (!video.paused) raf = requestAnimationFrame(draw);
  };
  const pickSrc = () => (window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches ? video.dataset.srcMobile : video.dataset.src);
  const play = async (user = false) => {
    if (!started) { video.src = pickSrc(); started = true; }
    if (user) video.classList.add('user-playing');
    try { await video.play(); } catch { setState(false); }
  };

  video.addEventListener('playing', () => { video.classList.add('is-playing'); hero.classList.add('has-played'); setState(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
  video.addEventListener('pause', () => { setState(false); cancelAnimationFrame(raf); });
  video.addEventListener('error', () => { video.classList.remove('is-playing'); setState(false); });
  button.addEventListener('click', () => {
    if (video.paused) { manuallyPaused = false; play(true); } else { manuallyPaused = true; video.pause(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); else if (started && !manuallyPaused && !reduce.matches) play(); });
  reduce.addEventListener('change', () => { if (reduce.matches) { video.pause(); video.classList.remove('is-playing'); } });
  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) video.pause();
    else if (started && !manuallyPaused && !reduce.matches && !document.hidden) play();
  }, { threshold: 0.05 }).observe(video);

  if (!reduce.matches && !navigator.connection?.saveData) {
    if (document.readyState === 'complete') play(); else window.addEventListener('load', () => play(), { once: true });
  }
})();
