(() => {
  const root = document.documentElement;
  const story = document.querySelector('.hero-story');
  const hero = story?.querySelector('.hero');
  const copy = story?.querySelector('.hero-grid');
  const canvas = story?.querySelector('canvas.hero-video');
  const services = document.querySelector('#services');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return; // The matching first-frame poster remains visible.

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 899px), (pointer: coarse)').matches;
  const manifestURL = mobile ? canvas.dataset.mobileSrc : canvas.dataset.src;
  const cacheLimit = 10;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = (a, b, value) => {
    const t = clamp((value - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  let manifest, manifestLoading = false, raf = 0, inView = true;
  let start = 0, distance = 1, height = 0, coveredAt = Infinity, pinned = false;
  let progress = 0, input = 0, motion = 0, bridge = null, target = 0, drawn = -1, direction = 1;
  let fetching = 0, decoding = 0, retryTimer = 0;
  const chunks = new Map(), fetchingChunks = new Set(), retryAfter = new Map();
  const images = new Map(), decodingFrames = new Set();
  const active = () => !document.hidden && !reduced.matches && inView && scrollY < coveredAt;
  const lastFrame = () => (manifest?.frames.length ?? 121) - 1;

  function schedule() {
    if (!raf && !document.hidden) raf = requestAnimationFrame(update);
  }
  function wanted() {
    const order = [target];
    // Decode only a small window around the thumb/wheel position. The full
    // film stays compressed, rather than occupying hundreds of MB as bitmaps.
    for (let n = 1; n <= 5; n++) order.push(target + n * direction, target - n * direction);
    return [...new Set(order.filter(i => i >= 0 && i <= lastFrame()))].slice(0, cacheLimit - 1);
  }
  function trim() {
    const farthest = [...images.keys()].filter(i => i !== drawn)
      .sort((a, b) => Math.abs(b - target) - Math.abs(a - target));
    while (images.size > cacheLimit && farthest.length) {
      const index = farthest.shift();
      images.get(index).close?.();
      images.delete(index);
    }
    canvas.dataset.cachedFrames = images.size;
  }
  async function decode(blob) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(blob); } catch { /* Older WebKit uses Image.decode below. */ }
    }
    const url = URL.createObjectURL(blob);
    const image = new Image();
    try { image.src = url; await image.decode(); return image; }
    finally { URL.revokeObjectURL(url); }
  }
  function pumpDecodes() {
    if (!manifest || !active()) return;
    for (const index of wanted()) {
      if (decoding >= 2) break;
      const [part, offset, size] = manifest.frames[index];
      if (images.has(index) || decodingFrames.has(index) || !chunks.has(part)) continue;
      decoding++; decodingFrames.add(index);
      let succeeded = false;
      decode(chunks.get(part).slice(offset, offset + size, 'image/webp')).then(image => {
        succeeded = true;
        if (!active() || !wanted().includes(index)) { image.close?.(); return; }
        images.set(index, image); trim(); schedule();
      }).catch(() => { /* Keep the previous valid frame if this decode fails. */ }).finally(() => {
        decoding--; decodingFrames.delete(index);
        // Only continue when something is available; never spin a RAF waiting
        // for a download, media callback, or an offscreen animation.
        if (active() && succeeded) pumpDecodes();
      });
    }
  }
  function pumpNetwork() {
    if (!manifest || !active()) return;
    const priority = [...new Set([...wanted().map(i => manifest.frames[i][0]), ...manifest.chunks.map((_, i) => i)])];
    for (const part of priority) {
      if (fetching >= 2) break;
      if (chunks.has(part) || fetchingChunks.has(part) || (retryAfter.get(part) ?? 0) > Date.now()) continue;
      fetching++; fetchingChunks.add(part);
      fetch(manifest.chunks[part], { cache: 'force-cache' }).then(response => {
        if (!response.ok) throw new Error(`Frame download: ${response.status}`);
        return response.blob();
      }).then(blob => { chunks.set(part, blob); retryAfter.delete(part); pumpDecodes(); }).catch(() => {
        retryAfter.set(part, Date.now() + 2500);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(pumpNetwork, 2600);
      }).finally(() => { fetching--; fetchingChunks.delete(part); pumpNetwork(); });
    }
  }
  async function load() {
    if (manifest || manifestLoading || !active()) return;
    manifestLoading = true;
    try {
      const response = await fetch(manifestURL, { cache: 'force-cache' });
      if (!response.ok) throw new Error('Frame manifest unavailable');
      const data = await response.json();
      if (!data.frames?.length || !data.chunks?.length) throw new Error('Invalid frames');
      manifest = data;
      canvas.width = data.width; canvas.height = data.height;
      schedule(); pumpNetwork();
    } catch {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(load, 2500);
    } finally { manifestLoading = false; }
  }
  function advance(now) {
    if (Math.abs(progress - input) > .18 && Math.abs(progress - motion) > .1) {
      bridge = { from: motion, start: now, duration: 160 + 80 * Math.abs(progress - motion) };
    }
    input = progress;
    if (!bridge) { motion = progress; return; }
    const t = clamp((now - bridge.start) / bridge.duration);
    motion = bridge.from + (progress - bridge.from) * (1 - (1 - t) ** 2);
    if (t === 1) { motion = progress; bridge = null; }
  }
  function draw() {
    let index = target;
    if (!images.has(index)) {
      // During a cold download use the closest decoded pose, never reset to
      // the poster and never replace the film with an unrelated photograph.
      index = [...images.keys()].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    }
    if (index === undefined || index === drawn) return;
    ctx.drawImage(images.get(index), 0, 0, canvas.width, canvas.height);
    drawn = index;
    canvas.dataset.frame = index;
    root.classList.add('hero-video-ready');
  }
  function update(now) {
    raf = 0;
    progress = reduced.matches ? 0 : clamp((scrollY - start) / distance);
    copy.style.setProperty('--hero-copy-opacity', pinned ? 1 - smooth(.08, .98, progress) : 1);
    copy.style.setProperty('--hero-copy-y', pinned ? `${-height * .18 * progress}px` : '0px');
    copy.inert = pinned && progress > .95;
    if (!active()) {
      bridge = null;
      // Keep the last canvas pixels but free decoded frames below the hero.
      for (const image of images.values()) image.close?.();
      images.clear(); canvas.dataset.cachedFrames = 0;
      return;
    }
    advance(now);
    const next = Math.round(motion * lastFrame());
    if (next !== target) direction = next > target ? 1 : -1;
    target = next;
    draw(); pumpDecodes(); pumpNetwork(); load();
    if (bridge) schedule();
  }
  function measure() {
    height = hero.offsetHeight;
    pinned = !reduced.matches && height <= innerHeight + 1;
    root.classList.toggle('hero-motion', pinned);
    story.style.setProperty('--hero-height', `${height}px`);
    start = story.getBoundingClientRect().top + scrollY;
    distance = pinned ? Math.max(1, story.offsetHeight - height) : height * .7;
    coveredAt = services.getBoundingClientRect().top + scrollY;
    schedule();
  }
  function resume() { measure(); load(); pumpNetwork(); pumpDecodes(); }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', measure, { passive: true });
  addEventListener('pageshow', resume);
  addEventListener('online', resume);
  addEventListener('pagehide', () => { cancelAnimationFrame(raf); raf = 0; clearTimeout(retryTimer); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resume();
    else { cancelAnimationFrame(raf); raf = 0; bridge = null; }
  });
  reduced.addEventListener('change', () => {
    root.classList.toggle('hero-video-ready', !reduced.matches && drawn >= 0);
    bridge = null; resume();
  });
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) resume();
  }).observe(hero);
  new ResizeObserver(measure).observe(hero);
  document.fonts.ready.then(measure);
  measure(); load();
})();
