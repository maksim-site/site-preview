(() => {
  const art = document.querySelector('[data-selected] .question-art');
  if (!art || !('IntersectionObserver' in window)) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const drawsStrokes = !!art.querySelector('.question-stroke') && !!Element.prototype.animate;
  const entrances = new Set();
  let visible = false;
  let entered = false;
  let printing = false;
  if (drawsStrokes && !reduced.matches) art.dataset.draw = 'pending';

  function finishEntrances() {
    entrances.forEach(animation => animation.cancel());
    entrances.clear();
    art.removeAttribute('data-draw');
    if (entered) art.classList.add('has-entered');
  }
  function drawMarks() {
    const marks = [...art.querySelectorAll('.question-mark')];
    marks.forEach((mark, index) => {
      const delay = index * 430;
      const stroke = mark.querySelector('.question-stroke').animate([
        { strokeDashoffset: '1', opacity: 0 },
        { strokeDashoffset: '.99', opacity: 1, offset: .03 },
        { strokeDashoffset: '0', opacity: 1 }
      ], { duration: 400, delay, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
      const dot = mark.querySelector('.question-dot').animate([
        { opacity: 0, transform: 'scale(.6)' },
        { opacity: 1, transform: 'scale(1)' }
      ], { duration: 80, delay: delay + 350, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
      entrances.add(stroke);
      entrances.add(dot);
      if (index === marks.length - 1) dot.onfinish = finishEntrances;
    });
  }
  function sync() {
    const canMove = visible && !document.hidden && !reduced.matches && !printing;
    art.classList.toggle('is-in-view', canMove);
    if (reduced.matches || printing) { entered = true; finishEntrances(); return; }
    if (!canMove && entered) finishEntrances();
    if (!visible || entered || document.hidden) return;
    entered = true;
    // The chosen hand-drawn style also writes itself on direct FAQ links.
    if (drawsStrokes) { drawMarks(); return; }
    art.classList.add('has-entered');
    // Restored positions and direct links stay visible, without a second reveal.
    if (!canMove || !Element.prototype.animate || location.hash) return;
    art.querySelectorAll('.question-mark').forEach((mark, index) => {
      const tilt = getComputedStyle(mark).getPropertyValue('--tilt').trim();
      const animation = mark.animate([
        { opacity: 0, transform: `translateY(22px) rotate(calc(${tilt} - 5deg))` },
        { opacity: 1, transform: `translateY(0) rotate(${tilt})` }
      ], { duration: 1100, delay: index * 75, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      entrances.add(animation);
      animation.onfinish = () => { entrances.delete(animation); animation.cancel(); };
    });
  }
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    sync();
  }, { threshold: .2 }).observe(art);
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  addEventListener('beforeprint', () => { printing = true; sync(); });
  addEventListener('afterprint', () => { printing = false; sync(); });
  addEventListener('pageshow', event => { if (event.persisted) { entered = true; finishEntrances(); sync(); } });
})();
