(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const title = [...document.querySelectorAll('.title-mask .metal-type')];
  const backdrop = hero.querySelector('.metal-backdrop');
  const scene = document.querySelector('.cube-scene');
  const experience = document.querySelector('.services-experience');
  const assembly = document.querySelector('.cube-assembly');
  const layers = [...document.querySelectorAll('.cube-layer')];
  const stage = document.querySelector('.cube-stage');
  const animations = new Set();
  const clamp = (value,min,max) => Math.max(min,Math.min(value,max));
  let cubeFrame=0, heroFrame=0;
  let pointerX=0, pointerY=0, currentX=0, currentY=0;
  let lightX=78, lightY=40, targetLightX=78, targetLightY=40;
  let cubeVisible=false, heroVisible=false;
  let printing=false;
  const canMove = () => !reduced.matches && !document.hidden && !printing;

  function track(animation) {
    animations.add(animation);
    animation.onfinish = () => { animations.delete(animation);animation.cancel(); };
  }
  if (!document.body.classList.contains('hero-video-page') && canMove() && Element.prototype.animate && !location.hash && scrollY<80) {
    title.forEach((line,index) => track(line.animate([
      {transform:'translateY(110%) rotateX(-25deg)',opacity:0},
      {transform:'translateY(0) rotateX(0)',opacity:1}
    ],{duration:1200,delay:110+index*160,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'})));

  }

  function drawCube() {
    cubeFrame=0;
    if (!canMove() || !cubeVisible) return;
    currentX+=(pointerX-currentX)*.12;
    currentY+=(pointerY-currentY)*.12;
    const rect=experience.getBoundingClientRect();
    const progress=clamp((innerHeight*.6-rect.top)/(rect.height+innerHeight*.2),0,1);
    const split=Math.sin(progress*Math.PI)*43;
    assembly.style.transform=`rotateX(${-22+currentY}deg) rotateY(${-32+progress*64+currentX}deg)`;
    layers.forEach((layer,index) => {
      const level=index-1;
      layer.style.transform=`translateY(${level*(69+split)}px) rotateY(${level*Math.sin(progress*Math.PI)*-7}deg)`;
    });
    if (Math.abs(currentX-pointerX)>.02 || Math.abs(currentY-pointerY)>.02) scheduleCube();
  }
  function scheduleCube() { if (!cubeFrame && cubeVisible && canMove()) cubeFrame=requestAnimationFrame(drawCube); }

  function drawHero() {
    heroFrame=0;
    if (!canMove() || !heroVisible) return;
    lightX+=(targetLightX-lightX)*.12;
    lightY+=(targetLightY-lightY)*.12;
    hero.style.setProperty('--cursor-x',`${lightX.toFixed(2)}%`);
    hero.style.setProperty('--cursor-y',`${lightY.toFixed(2)}%`);
    if (Math.abs(targetLightX-lightX)>.03 || Math.abs(targetLightY-lightY)>.03) scheduleHero();
  }
  function scheduleHero() { if (!heroFrame && heroVisible && canMove()) heroFrame=requestAnimationFrame(drawHero); }
  function syncAmbient() { if (!canMove()) hero.style.setProperty('--cursor-opacity','0'); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      heroVisible=entries[0].isIntersecting;
      syncAmbient();scheduleHero();
    }).observe(hero);
    if (scene && assembly && experience) new IntersectionObserver(entries => {
      cubeVisible=entries[0].isIntersecting;scheduleCube();
    },{rootMargin:'120px'}).observe(scene);
  }
  addEventListener('scroll',() => {scheduleCube();scheduleHero();},{passive:true});
  addEventListener('resize',() => {scheduleCube();scheduleHero();});
  stage?.addEventListener('pointermove',event => {
    if (!fine.matches || !canMove()) return;
    const rect=stage.getBoundingClientRect();
    pointerX=((event.clientX-rect.left)/rect.width-.5)*30;
    pointerY=-((event.clientY-rect.top)/rect.height-.5)*20;
    scheduleCube();
  });
  stage?.addEventListener('pointerleave',() => {pointerX=0;pointerY=0;scheduleCube();});
  hero.addEventListener('pointermove',event => {
    if (!fine.matches || !canMove()) return;
    const rect=hero.getBoundingClientRect();
    const x=clamp((event.clientX-rect.left)/rect.width,0,1);
    const y=clamp((event.clientY-rect.top)/rect.height,0,1);
    targetLightX=x*100;targetLightY=y*100;
    hero.style.setProperty('--cursor-opacity','.48');
    scheduleHero();
  });
  hero.addEventListener('pointerleave',() => {
    hero.style.setProperty('--cursor-opacity','0');
  });
  function reset() {
    animations.forEach(animation=>animation.cancel());animations.clear();
    cancelAnimationFrame(cubeFrame);cubeFrame=0;
    cancelAnimationFrame(heroFrame);heroFrame=0;
    if (assembly) assembly.style.transform='';
    layers.forEach(layer=>layer.style.transform='');
    ['--cursor-x','--cursor-y','--cursor-opacity'].forEach(name=>hero.style.removeProperty(name));
    lightX=78;lightY=40;
    syncAmbient();scheduleHero();scheduleCube();
  }
  reduced.addEventListener('change',reset);
  document.addEventListener('visibilitychange',() => {
    syncAmbient();
    if (document.hidden) {cancelAnimationFrame(heroFrame);cancelAnimationFrame(cubeFrame);heroFrame=0;cubeFrame=0;}
    else {scheduleHero();scheduleCube();}
  });
  addEventListener('beforeprint',() => {printing=true;reset();});
  addEventListener('afterprint',() => {printing=false;reset();});
  addEventListener('pageshow',event => {if(event.persisted) reset();});
})();
