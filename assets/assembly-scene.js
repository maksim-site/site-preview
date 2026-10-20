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
  let measureScene, lost = false;
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
    if (!visible) return;
    // Do not compile a WebGL scene while the hero film is still prominent.
    // Its matching still image covers this brief overlap between sections.
    if (!loading && (experience.closest('.services').getBoundingClientRect().top < Math.min(180, innerHeight * .2) || stage.getBoundingClientRect().bottom <= innerHeight)) init();
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
      const silver = new T.MeshStandardMaterial({ color: '#aebbc1', metalness: .86, roughness: .28, envMapIntensity: .8 });
      const edge = new T.MeshStandardMaterial({ color: '#79888e', metalness: .9, roughness: .3, envMapIntensity: .9 });
      const copper = new T.MeshStandardMaterial({ color: '#bc8150', metalness: .86, roughness: .3, envMapIntensity: 1 });
      const dark = new T.MeshStandardMaterial({ color: '#3d484e', metalness: .7, roughness: .32 });
      function hole(shape, cx, cy, radius) { const p = new T.Path(); p.absarc(cx, cy, radius, 0, Math.PI * 2, true); shape.holes.push(p); }
      function extrude(shape, depth, bevel = .045) {
        const geometry = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 32 });
        geometry.translate(0, 0, -depth / 2); return geometry;
      }
      function plate() {
        const s = new T.Shape(), a = 1.42, r = .23;
        s.moveTo(-a + r, -a); s.lineTo(a - r, -a); s.quadraticCurveTo(a, -a, a, -a + r);
        s.lineTo(a, a - r); s.quadraticCurveTo(a, a, a - r, a);
        s.lineTo(-a + r, a); s.quadraticCurveTo(-a, a, -a, a - r);
        s.lineTo(-a, -a + r); s.quadraticCurveTo(-a, -a, -a + r, -a);
        hole(s, 0, 0, .65);
        for (const px of [-1.02, 1.02]) for (const py of [-1.02, 1.02]) hole(s, px, py, .115);
        return new T.Mesh(extrude(s, .28), [silver, edge]);
      }
      function ring(outer, inner, depth, material) {
        const b = Math.min(.025, depth / 4), z = depth / 2;
        const profile = [[inner, -z + b], [inner + b, -z], [outer - b, -z], [outer, -z + b], [outer, z - b], [outer - b, z], [inner + b, z], [inner, z - b], [inner, -z + b]];
        const geometry = new T.LatheGeometry(profile.map(([r, h]) => new T.Vector2(r, h)), 96);
        geometry.rotateX(Math.PI / 2);
        return new T.Mesh(geometry, material);
      }
      const assembly = new T.Group(); scene.add(assembly);
      const front = new T.Group(), rear = new T.Group(), core = new T.Group();
      front.add(plate()); rear.add(plate());
      const frontRim = ring(.87, .65, .055, silver); frontRim.position.z = .19; front.add(frontRim);
      const rearRim = ring(.87, .65, .055, silver); rearRim.position.z = -.19; rear.add(rearRim);
      core.add(ring(.79, .54, .82, copper));
      for (const z of [-.31, .31]) { const rim = ring(.84, .54, .08, copper); rim.position.z = z; core.add(rim); }
      const pinGeometry = new T.CylinderGeometry(.075, .075, .99, 16); pinGeometry.rotateX(Math.PI / 2);
      const headGeometry = new T.CylinderGeometry(.15, .15, .08, 6); headGeometry.rotateX(Math.PI / 2);
      for (const [px, py] of [[-1.02, 1.02], [1.02, -1.02]]) {
        const pin = new T.Mesh(pinGeometry, silver); pin.position.set(px, py, .63); rear.add(pin);
        const head = new T.Mesh(headGeometry, dark); head.position.set(px, py, -.21); rear.add(head);
      }
      assembly.add(front, rear, core);
      drawScene = (p, pointerX, pointerY) => {
        const t = p * p * (3 - 2 * p);
        front.position.z = 1.9 + (.62 - 1.9) * t;
        rear.position.z = -1.65 + (-.62 + 1.65) * t;
        front.rotation.z = .045 * (1 - t);
        rear.rotation.z = -.025 * (1 - t);
        assembly.rotation.set(pointerY * .1, -.13 + t * .2 + pointerX * .13, -.08);
        renderer.render(scene, camera);
        stage.classList.remove('is-loading', 'is-fallback');
        stage.classList.add('is-ready');
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
      measureScene(); updateTarget();
      progress = target; schedule();
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; showFallback(); cancelAnimationFrame(frame); frame = 0; });
      canvas.addEventListener('webglcontextrestored', () => { lost = false; stage.classList.add('is-loading'); updateTarget(); progress = target; last = 0; schedule(); });
    } catch {
      // No WebGL: retain the useful static illustration.
      showFallback();
    }
  }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) { last = 0; updateTarget(); progress = target; x = pointerX; y = pointerY; }
    else { cancelAnimationFrame(frame); frame = 0; last = 0; }
  }, { rootMargin: '100px' }).observe(stage);
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
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else { last = 0; updateTarget(); progress = target; schedule(); }
  });
})();
