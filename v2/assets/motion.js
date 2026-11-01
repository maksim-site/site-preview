(() => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window) || !Element.prototype.animate || preference.matches) return;
  const active = new Map();
  const waiting = new Map();
  let observer, edgeObserver;

  // Existing editorial line breaks are preserved, including mobile wrapping.
  document.querySelectorAll('main h2').forEach(heading => {
    const lines = heading.innerHTML.split(/<br\s*\/?>/i);
    heading.innerHTML = lines.map(line => `<span class="reveal-line"><span>${line}</span></span>`).join('');
  });
  function finish(element) {
    observer?.unobserve(element);
    edgeObserver?.unobserve(element);
    active.get(element)?.cancel();
    active.delete(element);
    waiting.delete(element);
    element.removeAttribute('data-reveal');
  }
  function play(element) {
    const options = waiting.get(element);
    if (!options) return;
    observer.unobserve(element);
    edgeObserver.unobserve(element);
    waiting.delete(element);
    element.removeAttribute('data-reveal');
    if (preference.matches || element.contains(document.activeElement)) return;
    const line = element.parentElement.classList.contains('reveal-line');
    const animation = element.animate([
      {opacity:0,transform:line ? 'translateY(110%) rotateX(-12deg)' : 'translateY(40px)',filter:line ? 'blur(0px)' : 'blur(4px)'},
      {opacity:1,transform:'translateY(0) rotateX(0)',filter:'blur(0px)'}
    ], {duration:line ? 1050 : 920,delay:options.delay,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'});
    active.set(element,animation);
    animation.onfinish = () => finish(element);
  }
  observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) play(entry.target); });
  }, {threshold:0,rootMargin:`0px 0px -${Math.round(innerHeight*.13)}px 0px`});
  // The last page elements cannot always reach the inset reveal boundary.
  // Reveal footer rows as soon as they enter the actual viewport.
  edgeObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) play(entry.target); });
  }, {threshold:0,rootMargin:'0px'});
  function enroll(selector, step=0, base=0, scope=document, entranceObserver=observer) {
    scope.querySelectorAll(selector).forEach((element,index) => {
      // The selected homepage has one coordinated, first-paint-safe entrance.
      if (document.body.classList.contains('hero-video-page') && element.closest('.hero')) return;
      if (waiting.has(element)) return;
      // A restored/anchor position should never flash or hide already read content.
      if ((scrollY > 80 || location.hash) && element.getBoundingClientRect().top < innerHeight) return;
      waiting.set(element,{delay:base+Math.min(index*step,280)});
      element.dataset.reveal='waiting';
      entranceObserver.observe(element);
    });
  }
  enroll('.hero-kicker',0,40);
  enroll('body:not([data-direction]) .hero h1, .hero-equipment',0,120);
  enroll('.hero-subtitle',0,270);
  enroll('.hero-description',0,350);
  enroll('.hero-copy .button',0,440);
  document.querySelectorAll('main h2').forEach(heading => enroll('.reveal-line>span',120,0,heading));
  enroll('.section .eyebrow, .section-intro, .questions-heading>p:not(.eyebrow), .questions-heading>.text-link, .contact-intro>p:not(.eyebrow), .request-guidance');
  document.querySelectorAll('.service').forEach(service => {
    enroll('.service-heading, .service-content>p',90,0,service);
    enroll('.service-content li',65,40,service);
  });
  enroll('.cube-caption, .service-note, .request-area');
  enroll('.faq',70);
  enroll('.footer-top, .footer-bottom',80,0,document,edgeObserver);
  function revealWithin(container) {
    [...waiting.keys(),...active.keys()].forEach(element => {
      if (container === element || container.contains(element)) finish(element);
    });
  }
  function showAll() { revealWithin(document.documentElement); observer.disconnect(); edgeObserver.disconnect(); }
  function revealAnchor() {
    try {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) revealWithin(target);
    } catch { /* Malformed fragments do not affect content. */ }
  }
  document.addEventListener('focusin',event => {
    [...waiting.keys(),...active.keys()].forEach(element => {
      if (element.contains(event.target)) finish(element);
    });
  });
  // Navigation is immediate; only ordinary reading scrolls play the entrances.
  document.addEventListener('click',event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;
    const target = document.getElementById(anchor.getAttribute('href').slice(1));
    if (target) revealWithin(target);
  });
  addEventListener('hashchange',revealAnchor);
  document.addEventListener('section:navigate',event => revealWithin(event.detail.section));
  preference.addEventListener('change',showAll);
  addEventListener('beforeprint',showAll);
  addEventListener('pageshow',event => { if (event.persisted) showAll(); });
})();
