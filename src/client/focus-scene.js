/**
 * Local Three.js renderer for Today. All assets are procedural; no network I/O.
 * UI, timer truth, and task actions remain ordinary accessible HTML above it.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Float32BufferAttribute,
  Group, LineBasicMaterial, LineLoop, Mesh, PerspectiveCamera, PlaneGeometry,
  Points, Scene, ShaderMaterial, WebGLRenderer,
} from 'three';
import { createFrameLoop } from './focus-motion.js';

export function createFocusScene(host, initial) {
  const renderer = new WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  host.appendChild(canvas);
  host.dataset.renderer = 'webgl';
  const scene = new Scene();
  const camera = new PerspectiveCamera(43, 1, 0.1, 40);
  camera.position.z = 9;
  const orbit = new Group();
  scene.add(orbit);
  const resources = [];
  const keep = (value) => { resources.push(value); return value; };
  let settings = { ...initial };
  let elapsed = 0;
  let satelliteTime = 0;
  let pulse = 1;
  let disposed = false;
  let lost = false;
  let visible = true;
  let pointerX = 0;
  let pointerY = 0;
  let width = 0;
  let height = 0;
  const focusTarget = () => settings.mode === 'focus' ? 0.65 + Math.min(1, Math.max(0, settings.progress)) * 0.35 : 0;
  let focus = focusTarget();
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = host.clientWidth < 540;
  const targetColor = new Color();
  const palette = { idle: '#92c7ef', focus: '#80ecda', paused: '#a5c7dd', break: '#f0cb95', complete: '#c4edce' };
  const tint = new Color(palette[settings.mode] || palette.idle);
  const uniforms = {
    uTime: { value: 0 }, uFocus: { value: focus }, uTint: { value: tint },
    uDpr: { value: 1 }, uPulse: { value: 1 },
  };
  let seed = 1701;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const material = keep(new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: `
      attribute float aSeed;
      uniform float uTime, uFocus, uDpr;
      varying float vAlpha;
      void main() {
        float a = position.x + uTime * (0.038 + aSeed * 0.012);
        float r = 2.03 + position.y * mix(0.46, 0.19, uFocus);
        r += sin(a * 4.0 + uTime * 0.24) * 0.035;
        vec3 p = vec3(cos(a) * r, sin(a) * r, position.z * 0.2);
        p.z += sin(a * 3.0 + uTime * 0.18) * 0.12;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.5 + aSeed * 3.8) * uDpr * (7.0 / -mv.z);
        vAlpha = (0.25 + aSeed * 0.65) * (0.7 + 0.3 * sin(a * 2.0 + uTime * 0.2));
      }`,
    fragmentShader: `
      uniform vec3 uTint;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.04, d);
        gl_FragColor = vec4(uTint, a * vAlpha);
        #include <colorspace_fragment>
      }`,
  }));
  const positions = [];
  const seeds = [];
  for (let i = 0; i < (narrow ? 1000 : 2200); i++) {
    positions.push(random() * Math.PI * 2, (random() + random() - 1), random() - 0.5);
    seeds.push(random());
  }
  const geometry = keep(new BufferGeometry());
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  const dust = new Points(geometry, material);
  // Positions are polar shader inputs, so the CPU cannot infer the visible bounds.
  dust.frustumCulled = false;
  orbit.add(dust);

  const tracks = [];
  const satellites = [];
  for (let j = 0; j < 3; j++) {
    const radius = 2.38 + j * 0.28;
    const vertices = [];
    for (let i = 0; i < 180; i++) {
      const angle = i / 180 * Math.PI * 2;
      vertices.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    }
    const track = new Group();
    track.rotation.set([0.64, -0.88, 1.1][j], [0.3, -0.3, 0.5][j], [0.25, -0.5, 0.75][j]);
    const line = new LineLoop(
      keep(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3))),
      keep(new LineBasicMaterial({ color: tint, transparent: true, opacity: j === 0 ? 0.22 : 0.1, depthWrite: false })),
    );
    track.add(line);
    orbit.add(track);
    tracks.push(line);
    const pointGeometry = keep(new BufferGeometry());
    pointGeometry.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
    const point = new Points(pointGeometry, keep(new ShaderMaterial({
      uniforms: { uTint: uniforms.uTint, uDpr: uniforms.uDpr },
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      vertexShader: `uniform float uDpr; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize=12.0*uDpr; }`,
      fragmentShader: `uniform vec3 uTint;
        void main(){ float d=length(gl_PointCoord-0.5); gl_FragColor=vec4(uTint, exp(-d*d*30.0));
        #include <colorspace_fragment>
        }`,
    })));
    point.frustumCulled = false;
    track.add(point);
    satellites.push({ geometry: pointGeometry, radius, offset: j * 2.1 });
  }

  const stars = [];
  const starSeeds = [];
  for (let i = 0; i < (narrow ? 70 : 180); i++) {
    stars.push((random() - 0.5) * 16, (random() - 0.5) * 8, -2 - random() * 5);
    starSeeds.push(random());
  }
  const starGeometry = keep(new BufferGeometry());
  starGeometry.setAttribute('position', new Float32BufferAttribute(stars, 3));
  starGeometry.setAttribute('aSeed', new Float32BufferAttribute(starSeeds, 1));
  scene.add(new Points(starGeometry, keep(new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: `attribute float aSeed; uniform float uDpr,uTime; varying float vAlpha;
      void main(){ vec3 p=position; p.y+=sin(uTime*.04+aSeed*6.28)*.06;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);gl_PointSize=(1.0+aSeed*1.5)*uDpr;
      vAlpha=.18+aSeed*.35; }`,
    fragmentShader: `varying float vAlpha; uniform vec3 uTint;
      void main(){float d=length(gl_PointCoord-.5); gl_FragColor=vec4(uTint,smoothstep(.5,.05,d)*vAlpha);
      #include <colorspace_fragment>
      }`,
  }))));
  const glow = new Mesh(keep(new PlaneGeometry(13, 9)), keep(new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv;uniform vec3 uTint;uniform float uPulse;
      void main(){ vec2 p=(vUv-.5)*vec2(1.44,1.0);float d=length(p);
      float halo=exp(-pow((d-.23)*9.0,2.0))*.045;
      float wave=exp(-pow((d-(.18+uPulse*.35))*100.0,2.0))*(1.0-uPulse)*.45;
      gl_FragColor=vec4(uTint,halo+wave);
      #include <colorspace_fragment>
      }`,
  })));
  glow.position.z = -1.2;
  scene.add(glow);

  const canAnimate = () => !disposed && !lost && visible && width > 0 && height > 0
    && document.visibilityState !== 'hidden' && settings.motion && !motionQuery.matches && settings.mode !== 'paused';
  const draw = (delta) => {
    if (disposed || lost || !visible || document.visibilityState === 'hidden' || width <= 0 || height <= 0) return;
    elapsed += delta;
    satelliteTime += delta * (settings.mode === 'focus' ? 0.09 : 0.045);
    const blend = delta === 0 ? 1 : 1 - Math.exp(-delta * 2.5);
    targetColor.set(palette[settings.mode] || palette.idle);
    tint.lerp(targetColor, blend);
    focus += (focusTarget() - focus) * blend;
    pulse = Math.min(1, pulse + delta / 1.6);
    uniforms.uTime.value = elapsed;
    uniforms.uFocus.value = focus;
    uniforms.uPulse.value = pulse;
    orbit.rotation.x += ((0.2 + pointerY * 0.07) - orbit.rotation.x) * blend;
    orbit.rotation.y += ((pointerX * 0.09) - orbit.rotation.y) * blend;
    orbit.rotation.z = -0.2 + Math.sin(elapsed * 0.06) * 0.035;
    tracks.forEach(line => line.material.color.copy(tint));
    satellites.forEach(({ geometry, radius, offset }) => {
      const angle = satelliteTime + offset;
      geometry.attributes.position.setXYZ(0, Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      geometry.attributes.position.needsUpdate = true;
    });
    renderer.render(scene, camera);
  };
  const loop = createFrameLoop(draw, canAnimate);
  const sync = () => loop.invalidate();
  const resize = () => {
    width = host.clientWidth; height = host.clientHeight;
    if (width > 0 && height > 0 && !lost) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      uniforms.uDpr.value = dpr;
      camera.aspect = width / height;
      camera.position.z = width < 540 ? 10.5 : 9;
      camera.updateProjectionMatrix();
    }
    sync();
  };
  const move = (event) => {
    if (!canAnimate() || event.pointerType === 'touch') return;
    const bounds = host.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
  };
  const leave = () => { pointerX = 0; pointerY = 0; };
  const onLost = (event) => {
    event.preventDefault(); lost = true; host.dataset.renderer = 'fallback'; sync();
  };
  const onRestored = () => { lost = false; host.dataset.renderer = 'webgl'; resize(); };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting; sync();
  }) : null;
  intersection?.observe(host);
  document.addEventListener('visibilitychange', sync);
  motionQuery.addEventListener('change', sync);
  const stage = host.parentElement;
  stage.addEventListener('pointermove', move, { passive: true });
  stage.addEventListener('pointerleave', leave);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  resize();
  return {
    update(next) {
      if (next.completed > settings.completed && canAnimate()) pulse = 0;
      settings = { ...next };
      if (!settings.motion || motionQuery.matches) { pointerX = 0; pointerY = 0; pulse = 1; }
      host.dataset.sceneMode = settings.mode;
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      resizeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motionQuery.removeEventListener('change', sync);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      resources.forEach(resource => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
