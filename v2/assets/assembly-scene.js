(() => {
  const stage = document.querySelector('.assembly-stage');
  const experience = document.querySelector('.services-experience');
  if (!stage || !experience) return;
  const canvas = stage.querySelector('canvas');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = x => Math.max(0, Math.min(1, x));
  let visible = false, loading = false, drawScene, frame = 0, last = 0;
  let target = 0, progress = 0, pointerX = 0, pointerY = 0, x = 0, y = 0;
  let measureScene, lost = false, warmQueued = false;
  // The still is a failure fallback, not a differently posed loading frame.
  stage.classList.add('is-loading');
  function showFallback() {
    stage.classList.remove('is-ready', 'is-loading');
    stage.classList.add('is-fallback');
  }
  function schedule() {
    if (!frame && visible && !document.hidden && drawScene && !lost) frame = requestAnimationFrame(draw);
  }
  function updateTarget() {
    // Fast scroll/anchor navigation can arrive before idle preparation completes.
    if (visible && !loading) init();
    const rect = experience.getBoundingClientRect();
    target = reduced.matches ? 1 : clamp((innerHeight * .7 - rect.top) / Math.min(rect.height, innerHeight * 1.2));
    schedule();
  }
  function draw(now) {
    frame = 0;
    if (!visible || document.hidden || lost) return;
    const dt = Math.min(.05, last ? (now - last) / 1000 : 1 / 60); last = now;
    const ease = 1 - Math.exp(-dt * 9);
    progress = reduced.matches ? 1 : progress + (target - progress) * ease;
    x += (pointerX - x) * ease; y += (pointerY - y) * ease;
    if (Math.abs(target - progress) < .0003) progress = target;
    if (Math.abs(pointerX - x) < .0003) x = pointerX;
    if (Math.abs(pointerY - y) < .0003) y = pointerY;
    drawScene(progress, reduced.matches ? 0 : x, reduced.matches ? 0 : y);
    if (progress !== target || x !== pointerX || y !== pointerY) schedule();
  }
  async function init() {
    if (loading) return;
    loading = true;
    try {
      const T = await import('./motion-study/vendor/three.module.js');
      // Network warming starts in the head. Build the offscreen scene in an
      // idle slot after the hero's first frame, rather than on its first scroll.
      if (!visible) await new Promise(resolve => {
        if ('requestIdleCallback' in window) requestIdleCallback(resolve, { timeout: 1000 });
        else setTimeout(resolve, 0);
      });
      const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(devicePixelRatio, fine.matches ? 1.75 : 1.25));
      renderer.setClearColor(0, 0);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-3.4, 3.4, 3.4, -3.4, .1, 50);
      camera.position.set(5, 3.3, 7); camera.lookAt(0, 0, 0);
      // Small procedural studio: broad reflections, no downloaded HDR or textures.
      const studio = new T.Scene(); studio.background = new T.Color('#6c7377');
      const panels = [
        [-5, 4, 3, 4, 7, 1, '#ffffff', 3],
        [4, 3, -4, 3, 5, 1, '#dce8ee', 2],
        [0, 6, 0, 7, 1, 4, '#fff3de', 3],
        [-5, -3, 7, 5, 6, .1, '#f5f8fa', 2.5],
        [4, -2, 5, 2, 5, 1, '#111a22', 1]
      ];
      for (const [px, py, pz, w, h, d, color, intensity] of panels) {
        const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity) }));
        mesh.position.set(px, py, pz); mesh.lookAt(0, 0, 0); studio.add(mesh);
      }
      const pmrem = new T.PMREMGenerator(renderer);
      const environment = pmrem.fromScene(studio, .04, .1, 30);
      scene.environment = environment.texture;
      pmrem.dispose(); studio.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      scene.add(new T.HemisphereLight('#eef4ff', '#615547', 1.5));
      const key = new T.DirectionalLight('#fff5e5', 2.1); key.position.set(-3, 5, 6); scene.add(key);
      const fill = new T.DirectionalLight('#c2d7e9', 1); fill.position.set(5, 2, -3); scene.add(fill);
      const boardMaterial = new T.MeshStandardMaterial({ color: '#263b82', metalness: .55, roughness: .38, envMapIntensity: .8 });
      const edge = new T.MeshStandardMaterial({ color: '#182651', metalness: .72, roughness: .32, envMapIntensity: .9 });
      const copper = new T.MeshStandardMaterial({ color: '#d0a56c', metalness: .82, roughness: .28, envMapIntensity: 1 });
      const silver = new T.MeshStandardMaterial({ color: '#aebbc1', metalness: .78, roughness: .3, envMapIntensity: .8 });
      const dark = new T.MeshStandardMaterial({ color: '#283041', metalness: .62, roughness: .33 });
      const chipTop = new T.MeshStandardMaterial({ color: '#465168', metalness: .5, roughness: .36 });
      const silk = new T.MeshStandardMaterial({ color: '#dce4f0', metalness: .28, roughness: .42 });
      function hole(shape, cx, cy, radius) { const p = new T.Path(); p.absarc(cx, cy, radius, 0, Math.PI * 2, true); shape.holes.push(p); }
      function extrude(shape, depth, bevel = .045) {
        const geometry = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 32 });
        geometry.translate(0, 0, -depth / 2); return geometry;
      }
      function circuitBoard() {
        const s = new T.Shape(), a = 1.55, b = 1.22, r = .16;
        s.moveTo(-a + r, -b); s.lineTo(a - r, -b); s.quadraticCurveTo(a, -b, a, -b + r);
        s.lineTo(a, b - r); s.quadraticCurveTo(a, b, a - r, b);
        s.lineTo(-a + r, b); s.quadraticCurveTo(-a, b, -a, b - r);
        s.lineTo(-a, -b + r); s.quadraticCurveTo(-a, -b, -a + r, -b);
        for (const px of [-1.32, 1.32]) for (const py of [-.94, .94]) hole(s, px, py, .105);
        return new T.Mesh(extrude(s, .2, .035), [boardMaterial, edge]);
      }
      function trace(group, x1, y1, x2, y2, width = .028, material = copper) {
        const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy);
        const mesh = new T.Mesh(new T.BoxGeometry(length, width, .014), material);
        mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, .145);
        mesh.rotation.z = Math.atan2(dy, dx);
        group.add(mesh);
      }
      function pad(group, x, y, radius = .07) {
        const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, .018, 24), copper);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(x, y, .16);
        group.add(mesh);
      }
      function chip(group, x, y, width, height, pins = 6) {
        const padWidth = Math.min(.105, width / (pins + 1) * .65);
        const padAcross = new T.BoxGeometry(padWidth, .045, .022);
        const padEnd = new T.BoxGeometry(.045, padWidth, .022);
        for (let i = 0; i < pins; i++) {
          const u = (i + 1) / (pins + 1);
          for (const side of [-1, 1]) {
            const a = new T.Mesh(padAcross, copper), b = new T.Mesh(padEnd, copper);
            a.position.set(x - width / 2 + width * u, y + side * (height / 2 + .035), .165);
            b.position.set(x + side * (width / 2 + .035), y - height / 2 + height * u, .165);
            group.add(a, b);
          }
        }
        const body = new T.Mesh(new T.BoxGeometry(width, height, .16), dark);
        body.position.set(x, y, .245);
        const top = new T.Mesh(new T.BoxGeometry(width * .82, height * .76, .024), chipTop);
        top.position.set(x, y, .337);
        group.add(body, top);
        // A quiet orientation mark makes the largest package read as a real IC.
        const mark = new T.Mesh(new T.CylinderGeometry(.035, .035, .008, 16), copper);
        mark.rotation.x = Math.PI / 2; mark.position.set(x - width * .32, y + height * .29, .352); group.add(mark);
      }
      const assembly = new T.Group(); scene.add(assembly);
      const front = new T.Group(), rear = new T.Group(), core = new T.Group();
      rear.add(circuitBoard());
      const via = new T.CylinderGeometry(.086, .086, .016, 24); via.rotateX(Math.PI / 2);
      const holeCore = new T.CylinderGeometry(.049, .049, .02, 24); holeCore.rotateX(Math.PI / 2);
      for (const px of [-1.32, 1.32]) for (const py of [-.94, .94]) {
        const rim = new T.Mesh(via, copper), center = new T.Mesh(holeCore, edge);
        rim.position.set(px, py, .145); center.position.set(px, py, .15); rear.add(rim, center);
      }
      // Delicate copper runs link the pads and chips across the board.
      [[[-1.17, .68], [-.88, .68], [-.72, .51], [-.48, .51]], [[-.82, -.02], [-.58, -.02], [-.44, .12]], [[.45, .18], [.72, .18], [.9, .42], [1.12, .42]], [[.43, -.06], [.7, -.06], [.94, -.32], [1.18, -.32]], [[-.48, -.4], [-.72, -.4], [-.92, -.63], [-1.18, -.63]], [[.14, .6], [.14, .83], [.46, 1.0]], [[-.2, -.55], [-.2, -.8], [.12, -1.0]]].forEach(path => {
        for (let i = 1; i < path.length; i++) trace(rear, ...path[i - 1], ...path[i]);
      });
      for (const [px, py] of [[-1.17, .68], [-1.18, -.63], [.46, 1.0], [.12, -1.0], [1.18, -.32], [1.12, .42]]) pad(rear, px, py);
      // Fine silkscreen outlines frame the connectors and component groups.
      for (const [x1, y1, x2, y2] of [[-.72, .92, -.1, .92], [-.72, .86, -.1, .86], [.87, -.83, 1.21, -.83], [.87, -.89, 1.21, -.89]]) trace(rear, x1, y1, x2, y2, .012, silk);
      chip(core, -.06, .12, .88, .68, 7);
      chip(core, .93, .51, .4, .3, 4);
      chip(core, -.91, -.43, .42, .3, 4);
      const capacitorGeometry = new T.CylinderGeometry(.14, .14, .24, 24); capacitorGeometry.rotateX(Math.PI / 2);
      for (const [px, py] of [[.95, -.48], [-.92, .63]]) {
        const can = new T.Mesh(capacitorGeometry, silver); can.position.set(px, py, .24);
        const lid = new T.Mesh(new T.CylinderGeometry(.11, .11, .012, 24), chipTop); lid.rotation.x = Math.PI / 2; lid.position.set(px, py, .366);
        front.add(can, lid);
      }
      const port = new T.Mesh(new T.BoxGeometry(.62, .32, .29), silk); port.position.set(1.02, -.93, .205); front.add(port);
      const portFace = new T.Mesh(new T.BoxGeometry(.46, .2, .018), dark); portFace.position.set(1.02, -.93, .36); front.add(portFace);
      const pinRows = new T.BoxGeometry(.035, .13, .02);
      for (let px = -.135; px <= .136; px += .09) {
        const pin = new T.Mesh(pinRows, copper); pin.position.set(1.02 + px, -.93, .38); front.add(pin);
      }
      assembly.add(front, rear, core);
      drawScene = (p, pointerX, pointerY) => {
        const t = p * p * (3 - 2 * p);
        front.position.z = 1.45 + (-.06 - 1.45) * t;
        rear.position.z = -1.15 + (-.1 + 1.15) * t;
        core.position.z = .95 + (-.06 - .95) * t;
        front.rotation.z = .055 * (1 - t);
        rear.rotation.z = -.035 * (1 - t);
        assembly.rotation.set(pointerY * .1, -.13 + t * .2 + pointerX * .13, -.08);
        renderer.render(scene, camera);
        stage.classList.remove('is-loading', 'is-fallback');
        stage.classList.add('is-ready');
        stage.classList.toggle('is-visible', visible && !document.hidden);
      };
      measureScene = () => {
        const w = stage.clientWidth, h = stage.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        const span = Math.max(5.65, 5.7 * h / w);
        camera.top = span / 2; camera.bottom = -span / 2;
        camera.left = -span * w / h / 2; camera.right = span * w / h / 2;
        camera.updateProjectionMatrix(); schedule();
      };
      new ResizeObserver(measureScene).observe(stage);
      measureScene();
      await renderer.compileAsync(scene, camera);
      updateTarget(); progress = target;
      // One warm frame also uploads geometry before the section is reached.
      if (!document.hidden) drawScene(progress, reduced.matches ? 0 : x, reduced.matches ? 0 : y);
      schedule();
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; showFallback(); cancelAnimationFrame(frame); frame = 0; });
      canvas.addEventListener('webglcontextrestored', () => { lost = false; stage.classList.add('is-loading'); updateTarget(); progress = target; last = 0; schedule(); });
    } catch {
      // No WebGL: retain the useful static illustration.
      showFallback();
    }
  }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      last = 0; updateTarget(); progress = target; x = pointerX; y = pointerY;
      // Synchronize the pose before exposing a previously warmed canvas.
      if (drawScene && !lost && !document.hidden) drawScene(progress, reduced.matches ? 0 : x, reduced.matches ? 0 : y);
    }
    else { stage.classList.remove('is-visible'); cancelAnimationFrame(frame); frame = 0; last = 0; }
  }, { rootMargin: '100px' }).observe(stage);
  function warmUp() {
    if (loading || warmQueued || document.hidden) return;
    warmQueued = true;
    const prepare = () => { warmQueued = false; if (!document.hidden) init(); };
    if ('requestIdleCallback' in window) requestIdleCallback(prepare, { timeout: 1000 });
    else setTimeout(prepare, 250);
  }
  const heroCanvas = document.querySelector('.hero-video');
  if (!heroCanvas || heroCanvas.hasAttribute('data-frame') || reduced.matches) warmUp();
  else {
    const firstFrame = new MutationObserver(() => {
      firstFrame.disconnect(); clearTimeout(warmFallback); warmUp();
    });
    firstFrame.observe(heroCanvas, { attributes: true, attributeFilter: ['data-frame'] });
    // A failed hero must not prevent the next section from preparing.
    const warmFallback = setTimeout(() => { firstFrame.disconnect(); warmUp(); }, 1200);
  }
  addEventListener('scroll', updateTarget, { passive: true });
  addEventListener('resize', updateTarget, { passive: true });
  stage.addEventListener('pointermove', event => {
    if (!fine.matches || reduced.matches) return;
    const r = stage.getBoundingClientRect();
    pointerX = (event.clientX - r.left) / r.width * 2 - 1;
    pointerY = (event.clientY - r.top) / r.height * 2 - 1;
    schedule();
  });
  stage.addEventListener('pointerleave', () => { pointerX = pointerY = 0; schedule(); });
  reduced.addEventListener('change', () => {
    pointerX = pointerY = x = y = 0;
    if (reduced.matches) progress = 1;
    updateTarget();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stage.classList.remove('is-visible'); cancelAnimationFrame(frame); frame = 0; }
    else { last = 0; warmUp(); updateTarget(); progress = target; schedule(); }
  });
})();
