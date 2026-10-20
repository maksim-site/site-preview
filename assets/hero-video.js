(() => {
  const root = document.documentElement;
  const story = document.querySelector('.hero-story');
  const hero = story?.querySelector('.hero');
  const copy = story?.querySelector('.hero-grid');
  const canvas = story?.querySelector('canvas.hero-video');
  const services = document.querySelector('#services');
  if (!canvas) return;
  let render;
  try { render = makeRenderer(canvas); } catch { return; }
  if (!render) return; // The matching first-frame poster remains visible.

  function makeRenderer(element) {
    // Upload only the two adjacent poses; interpolation stays on the GPU.
    // Unlike repeated canvas copies this does not repaint a full bitmap on CPU.
    const gl = element.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) {
      const context = element.getContext('2d', { alpha: false });
      if (!context) return null;
      return (a, b, mix) => {
        context.globalAlpha = 1;
        context.drawImage(a, 0, 0, element.width, element.height);
        if (a !== b && mix > 0) {
          context.globalAlpha = mix;
          context.drawImage(b, 0, 0, element.width, element.height);
          context.globalAlpha = 1;
        }
      };
    }
    const shader = (type, source) => {
      const result = gl.createShader(type);
      gl.shaderSource(result, source); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error('Hero shader unavailable');
      return result;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.)*.5,1.-(p.y+1.)*.5);gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 uv;uniform sampler2D a;uniform sampler2D b;uniform float blend;void main(){gl_FragColor=mix(texture2D(a,uv),texture2D(b,uv),blend);}'));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    const aUniform = gl.getUniformLocation(program, 'a'), bUniform = gl.getUniformLocation(program, 'b'), blendUniform = gl.getUniformLocation(program, 'blend');
    const slots = [0,1].map(unit => {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
      for (const [key,value] of [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D,key,value);
      return { texture, image: null, allocated: false };
    });
    function upload(unit, image) {
      const slot = slots[unit];
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, slot.texture);
      if (slot.allocated) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
      else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); slot.allocated = true; }
      slot.image = image;
    }
    return (a, b, mix) => {
      let first = slots.findIndex(slot => slot.image === a), second = slots.findIndex(slot => slot.image === b);
      if (first < 0) { first = second === 0 ? 1 : 0; upload(first,a); }
      if (a === b) second = first;
      else if (second < 0) { second = 1-first; upload(second,b); }
      gl.viewport(0,0,element.width,element.height);
      gl.uniform1i(aUniform,first); gl.uniform1i(bUniform,second); gl.uniform1f(blendUniform,mix);
      gl.drawArrays(gl.TRIANGLES,0,3);
    };
  }


  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 899px), (pointer: coarse)').matches;
  const manifestURL = mobile ? canvas.dataset.mobileSrc : canvas.dataset.src;
  const cacheLimit = mobile ? 14 : 12;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = (a, b, value) => {
    const t = clamp((value - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  let manifest, manifestLoading = false, raf = 0, inView = true;
  let start = 0, distance = 1, height = 0, coveredAt = Infinity, pinned = false;
  let progress = 0, filmProgress = 0, motion = 0, target = 0, drawn = -1, direction = 1, lastTick = 0, position = 0;
  let contextLost = false, blendFrames = true;
  let fetching = 0, decoding = 0, retryTimer = 0;
  const chunks = new Map(), fetchingChunks = new Set(), retryAfter = new Map();
  const images = new Map(), decodingFrames = new Set();
  const active = () => !document.hidden && !reduced.matches && inView && scrollY < coveredAt && !contextLost;
  const lastFrame = () => (manifest?.frames.length ?? 121) - 1;

  function schedule() {
    if (!raf && !document.hidden) raf = requestAnimationFrame(update);
  }
  function wanted() {
    const low = Math.floor(position), high = Math.ceil(position);
    const order = blendFrames ? [low, high] : [target];
    const destination = Math.round(filmProgress * lastFrame());
    // Ready both sides of the fractional pose before advancing. Also prepare
    // the wheel's destination, so a fast gesture cannot starve its final frame.
    if (Math.abs(destination - target) > 4) order.push(destination, destination + direction);
    for (let n = 1; n <= cacheLimit; n++) order.push(target + n * direction, target - n * direction);
    return [...new Set(order.filter(i => i >= 0 && i <= lastFrame()))].slice(0, cacheLimit - 2);
  }
  function trim() {
    const farthest = [...images.keys()].filter(i => i !== Math.floor(drawn) && i !== Math.ceil(drawn))
      .sort((a, b) => Math.abs(b - target) - Math.abs(a - target));
    while (images.size > cacheLimit && farthest.length) {
      const index = farthest.shift();
      images.get(index).close?.();
      images.delete(index);
    }
    canvas.dataset.cachedFrames = images.size;
  }
  async function decode(blob) {
    // Safari can upload a decoded HTML image directly. ImageBitmap introduced
    // an extra copy here; native images are also the path used by pear.no.
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = 'async';
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
    const lastPart = manifest.chunks.length - 1;
    // Fetch the end early as well as the current pose. A first quick swipe
    // must not wait for every preceding network request to finish.
    const priority = [...new Set([...wanted().map(i => manifest.frames[i][0]), lastPart, Math.floor(lastPart / 2), ...manifest.chunks.map((_, i) => i)])];
    for (const part of priority) {
      if (fetching >= 4) break;
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
    const delta = lastTick ? Math.min(50, now - lastTick) : 16.7;
    lastTick = now;
    const previous = motion;
    // A short, time-based response (38 ms) smooths wheel packets without a
    // separate playback timeline. Reversing the scroll immediately retargets it.
    motion += (filmProgress - motion) * (1 - Math.exp(-delta / 38));
    if (Math.abs(filmProgress - motion) * lastFrame() < .08) motion = filmProgress;
    if (motion !== previous) direction = motion > previous ? 1 : -1;
    // At fast speeds each refresh already advances a whole source frame.
    // Only slow motion needs subframe blending; avoid two texture uploads
    // per refresh during fast swipes on phones.
    blendFrames = Math.abs(motion - previous) * lastFrame() / delta < .03;
    position = motion * lastFrame();
    target = Math.round(position);
  }
  function draw() {
    let low = blendFrames ? Math.floor(position) : target, high = blendFrames ? Math.ceil(position) : target, value = blendFrames ? position : target;
    if (!images.has(low) || !images.has(high)) {
      // Never show a future frame and then step backwards when the requested
      // one finishes decoding. Hold the last valid pose until data catches up.
      const eligible = [...images.keys()].filter(i => direction > 0
        ? i <= position && (drawn < 0 || i >= drawn)
        : i >= position && (drawn < 0 || i <= drawn));
      if (!eligible.length) return;
      value = direction > 0 ? Math.max(...eligible) : Math.min(...eligible);
      low = high = value;
    }
    if (drawn >= 0 && (direction > 0 ? value < drawn : value > drawn)) return;
    if (Math.abs(value - drawn) < .003) return;
    render(images.get(low), images.get(high), high === low ? 0 : value - low);
    drawn = value;
    canvas.dataset.frame = Math.round(value);
    canvas.dataset.position = value.toFixed(3);
    root.classList.add('hero-video-ready');
  }
  function update(now) {
    raf = 0;
    progress = reduced.matches ? 0 : clamp((scrollY - start) / distance);
    // Reveal the motion in the first screen, before the services panel covers
    // it: accelerate through the film's quiet opening and finish at 65% scroll.
    filmProgress = 1 - (1 - clamp(progress / .65)) ** 2;
    canvas.dataset.targetFrame = Math.round(filmProgress * lastFrame());
    copy.style.setProperty('--hero-copy-opacity', pinned ? 1 - smooth(.08, .98, progress) : 1);
    copy.style.setProperty('--hero-copy-y', pinned ? `${-height * .18 * progress}px` : '0px');
    copy.inert = pinned && progress > .95;
    if (!active()) {
      lastTick = 0;
      // Keep the last canvas pixels but free decoded frames below the hero.
      for (const image of images.values()) image.close?.();
      images.clear(); canvas.dataset.cachedFrames = 0;
      return;
    }
    advance(now);
    draw(); pumpDecodes(); pumpNetwork(); load();
    if (motion !== filmProgress) schedule();
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
    else { cancelAnimationFrame(raf); raf = 0; lastTick = 0; }
  });
  reduced.addEventListener('change', () => {
    root.classList.toggle('hero-video-ready', !reduced.matches && drawn >= 0);
    lastTick = 0; resume();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); contextLost = true;
    root.classList.remove('hero-video-ready');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try { render = makeRenderer(canvas); contextLost = !render; } catch { return; }
    drawn = -1; lastTick = 0; resume();
  });
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) resume();
  }).observe(hero);
  new ResizeObserver(measure).observe(hero);
  document.fonts.ready.then(measure);
  measure(); load();
})();
