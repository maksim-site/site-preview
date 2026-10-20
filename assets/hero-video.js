(() => {
  const root = document.documentElement;
  const story = document.querySelector('.hero-story');
  const hero = story?.querySelector('.hero');
  const copy = story?.querySelector('.hero-grid');
  const video = story?.querySelector('.hero-video');
  const services = document.querySelector('#services');
  if (!video || !video.canPlayType('video/mp4')) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const source = matchMedia('(max-width: 899px), (pointer: coarse)').matches
    ? video.dataset.mobileSrc || video.dataset.src : video.dataset.src;
  const fps = 24;
  const wakeOnResume = navigator.vendor === 'Apple Computer, Inc.';
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = (start, end, value) => {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  };
  let ready = false, failed = false, requested = false, frame = 0, inView = true;
  let progress = 0, start = 0, coveredAt = Infinity, distance = 1, height = 0, pinned = false;
  let pending = null, completedFrame = -1, lastSeek = -Infinity;
  let watchdog = 0, wakeup = 0, paint = 0, videoFrame = 0;
  let reloads = 0, lastReload = -Infinity, lastNetworkProgress = 0;
  let seekSerial = 0, retryNext = false;
  let warming = false, warmTimer = 0, warmGeneration = 0;
  let motion = 0, inputProgress = 0, presentedFrame = 0, bridge = null;

  const finalFrame = () => Number.isFinite(video.duration) ? Math.max(1, Math.round(video.duration * fps) - 1) : 1;

  function restMotion() {
    // Keep the last visible pose when leaving the hero. Returning to it must
    // reverse from that pose, rather than teleport to the current scroll target.
    motion = presentedFrame / finalFrame();
    inputProgress = motion;
    bridge = null;
  }

  function advanceMotion(now) {
    // Ordinary wheel/touch movement maps directly to the film. Only a large
    // discontinuity gets a short bridge, with a wall-clock deadline rather
    // than a per-frame speed cap that falls behind on slower decoders.
    const jump = Math.abs(progress - inputProgress);
    if (jump > .18 && Math.abs(progress - motion) > .1) {
      bridge = { from: motion, started: now, duration: 180 + 100 * Math.abs(progress - motion) };
    }
    inputProgress = progress;
    if (!bridge) { motion = progress; return; }
    const t = clamp((now - bridge.started) / bridge.duration);
    motion = bridge.from + (progress - bridge.from) * (1 - (1 - t) ** 2);
    if (t === 1) { motion = progress; bridge = null; }
  }

  const canAnimate = () => !document.hidden && !reduced.matches && inView && scrollY < coveredAt && !failed;

  function cancelSeek() {
    clearTimeout(watchdog);
    clearTimeout(wakeup);
    cancelAnimationFrame(paint);
    if (videoFrame) video.cancelVideoFrameCallback?.(videoFrame);
    watchdog = wakeup = paint = videoFrame = 0;
    pending = null;
    retryNext = false;
  }

  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(update);
  }
  function stopWarmup(reschedule = false) {
    warmGeneration++;
    clearTimeout(warmTimer);
    warming = false;
    video.pause();
    if (reschedule) { completedFrame = -1; schedule(); }
  }
  function warmDecoder() {
    if (!ready || !canAnimate() || warming) return;
    // WebKit can suspend presentation of a paused video while it is offscreen.
    // Briefly wake the muted decoder, then return control to the scroll position.
    warming = true;
    const generation = ++warmGeneration;
    const finish = () => { if (generation === warmGeneration) stopWarmup(true); };
    warmTimer = setTimeout(finish, 180);
    video.play().then(() => {
      if (generation !== warmGeneration) return;
      clearTimeout(warmTimer);
      warmTimer = setTimeout(finish, 50);
    }).catch(finish);
  }
  function finishSeek(job) {
    if (pending !== job || video.seeking || video.readyState < 2 || Math.abs(video.currentTime - job.time) > 1 / fps) return;
    if (video.requestVideoFrameCallback && !job.presented) return;
    completedFrame = job.index;
    presentedFrame = job.index;
    cancelSeek();
    schedule();
  }

  function recover() {
    cancelSeek();
    stopWarmup();
    if (!canAnimate()) return;
    if (performance.now() - lastReload > 30000) reloads = 0;
    if (reloads >= 2) {
      failed = true;
      ready = false;
      root.classList.remove('hero-video-ready');
      measure();
      return;
    }
    reloads++;
    lastReload = performance.now();
    ready = false;
    root.classList.remove('hero-video-ready');
    requested = false;
    completedFrame = -1;
    load();
  }

  function watch(job, delay = 250) {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (pending !== job || !canAnimate()) return;
      if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - job.time) < 1 / fps && (!video.requestVideoFrameCallback || job.presented)) {
        finishSeek(job); // A missing event must not leave the controller locked.
      } else if (video.readyState < 2 && performance.now() - lastNetworkProgress < 2000) {
        watch(job); // A slow, progressing download is not a decoder failure.
      } else if (job.retry && video.seeking && performance.now() - job.started < 1200) {
        watch(job); // Give the recovery seek time on a busy/slow device.
      } else if (!job.retry) {
        cancelSeek();
        retryNext = true;
        warmDecoder();
        seek(true); // Request the latest position after waking a stalled decoder.
      } else {
        recover();
      }
    }, delay);
  }

  function seek(retry = retryNext) {
    if (!ready || !canAnimate() || warming || pending || !Number.isFinite(video.duration)) return;
    const index = Math.round(motion * finalFrame());
    if (!retry && index === completedFrame) return;
    const delay = 1000 / 60 - (performance.now() - lastSeek);
    if (!retry && delay > 0) {
      clearTimeout(wakeup);
      wakeup = setTimeout(schedule, delay);
      return;
    }
    // Seek to frame centres, never the duration boundary. Repeated scroll
    // positions share a frame, so they do not cause redundant decode work.
    // A tiny alternating offset within the same frame also wakes WebKit after
    // the video was offscreen; assigning the identical time can retain a stale image.
    const time = Math.min((index + (++seekSerial % 2 ? .1 : .2)) / fps, video.duration - 1 / (fps * 2));
    const job = pending = { index, time, retry, presented: false, started: performance.now() };
    retryNext = false;
    lastSeek = performance.now();
    if (video.requestVideoFrameCallback) {
      const onPresented = (_, metadata) => {
        videoFrame = 0;
        if (pending !== job) return;
        job.presented = Math.abs(metadata.mediaTime - time) < 1 / fps;
        if (job.presented) finishSeek(job);
        else videoFrame = video.requestVideoFrameCallback(onPresented);
      };
      videoFrame = video.requestVideoFrameCallback(onPresented);
    }
    watch(job);
    try { video.currentTime = time; } catch { recover(); }
  }
  function update(now) {
    frame = 0;
    progress = reduced.matches ? 0 : clamp((scrollY - start) / distance);
    copy.style.setProperty('--hero-copy-opacity', pinned ? 1 - smooth(.08, .98, progress) : 1);
    copy.style.setProperty('--hero-copy-y', pinned ? `${-height * .18 * progress}px` : '0px');
    copy.inert = pinned && progress > .95;
    if (canAnimate()) {
      // Let the decoder present each requested pose before advancing again.
      // Otherwise a slow seek lets the virtual timeline race ahead unseen.
      if (ready && !warming && !pending) {
        advanceMotion(now);
        seek();
        if (bridge) schedule();
      }
    } else {
      cancelSeek();
      if (warming) stopWarmup();
      completedFrame = -1;
      restMotion();
    }
  }
  function measure() {
    // A short/landscape window keeps ordinary flow so the CTA cannot be cut off.
    height = hero.offsetHeight;
    pinned = !reduced.matches && !failed && height <= innerHeight + 1;
    root.classList.toggle('hero-motion', pinned);
    story.style.setProperty('--hero-height', `${height}px`);
    start = story.getBoundingClientRect().top + scrollY;
    distance = pinned ? Math.max(1, story.offsetHeight - height) : height * .7;
    coveredAt = services.getBoundingClientRect().top + scrollY;
    schedule();
  }
  function load() {
    if (requested || reduced.matches || failed) return;
    requested = true;
    video.muted = true;
    video.preload = 'auto';
    video.src = source;
    video.load();
  }
  function markReady() {
    if (video.readyState < 2 || failed) return;
    ready = true;
    // loadeddata already provides frame zero. Seeking to that same frame can
    // produce no presentation callback in WebKit, despite a healthy decoder.
    if (!pending && completedFrame < 0 && video.currentTime < 1 / fps) {
      completedFrame = 0;
      presentedFrame = 0;
    }
    root.classList.toggle('hero-video-ready', !reduced.matches);
    schedule();
  }
  video.addEventListener('loadeddata', markReady);
  video.addEventListener('canplay', markReady);
  video.addEventListener('progress', () => { lastNetworkProgress = performance.now(); });
  video.addEventListener('seeked', () => {
    const job = pending;
    if (!job) return;
    // Do not issue another seek inside seeked: allow the decoded frame to paint.
    cancelAnimationFrame(paint);
    paint = requestAnimationFrame(() => {
      paint = requestAnimationFrame(() => {
        finishSeek(job);
        if (pending === job && video.requestVideoFrameCallback && !job.presented) watch(job, 200);
      });
    });
  });
  video.addEventListener('error', recover);
  reduced.addEventListener('change', () => {
    cancelSeek();
    stopWarmup();
    completedFrame = -1;
    root.classList.toggle('hero-video-ready', ready && !reduced.matches);
    load();
    measure();
  });

  function resume() {
    if (document.hidden) return;
    cancelSeek();
    completedFrame = -1;
    restMotion();
    if (failed && performance.now() - lastReload > 30000) { failed = false; requested = false; }
    if (requested && (video.error || video.networkState === video.NETWORK_EMPTY || video.networkState === video.NETWORK_NO_SOURCE) && !failed) recover();
    else load();
    measure();
    if (wakeOnResume) warmDecoder();
  }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', measure);
  addEventListener('pageshow', resume);
  addEventListener('online', resume);
  addEventListener('pagehide', () => { cancelSeek(); stopWarmup(); restMotion(); cancelAnimationFrame(frame); frame = 0; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelSeek(); stopWarmup(); restMotion(); cancelAnimationFrame(frame); frame = 0; }
    else resume();
  });
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) { completedFrame = -1; resume(); }
    else { cancelSeek(); stopWarmup(); restMotion(); }
  }).observe(hero);
  new ResizeObserver(measure).observe(hero);
  document.fonts.ready.then(measure);
  measure();
  load();
})();
