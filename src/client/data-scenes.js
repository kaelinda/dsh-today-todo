/**
 * Data-driven Three.js views for the workbench: project orbits, the capacity
 * ring and the seven-day activity terrain. Each is decoration over accessible
 * HTML: the cards, checkboxes and day buttons beside them stay the real controls,
 * and every canvas is aria-hidden. Colours come from the Host theme tokens.
 */
import {
  BufferAttribute, DynamicDrawUsage,
  BoxGeometry, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Group, HemisphereLight,
  InstancedMesh, Line, LineBasicMaterial, LineLoop, Mesh, MeshLambertMaterial, Object3D, PerspectiveCamera,
  Points, Raycaster, Scene, ShaderMaterial, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { createFrameLoop } from './focus-motion.js';
import { MAX_ORBIT_PROJECTS, ORBIT_RADII } from './scene-data.js';

/** Frame-rate independent approach toward a target. */
const approach = (current, target, delta, rate) => current + (target - current) * (1 - Math.exp(-delta * rate));
const settled = (a, b, epsilon = 0.0015) => Math.abs(a - b) < epsilon;

/**
 * One renderer, camera and lifecycle per view. `step(delta, snap)` advances the
 * scene and returns true while anything is still moving; `ambient()` keeps the
 * loop alive for continuous motion. Without motion every invalidation paints
 * one settled frame, so hover and drag still respond under reduced motion.
 */
function createStage(host, { fov, motion, step, ambient = () => false, onResize = () => {} }) {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  host.appendChild(canvas);
  host.dataset.renderer = 'webgl';
  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, 1, 0.1, 80);
  const resources = [];
  const keep = (resource) => { resources.push(resource); return resource; };
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { ndc: new Vector2(), x: 0, y: 0, inside: false };
  const state = { motion: motion !== false, disposed: false, lost: false, visible: true, width: 0, height: 0, busy: true, dpr: 1 };
  const moving = () => state.motion && !motionQuery.matches;
  const canRender = () => !state.disposed && !state.lost && state.visible && state.width > 0 && state.height > 0
    && document.visibilityState !== 'hidden';
  const loop = createFrameLoop((delta) => {
    if (!canRender()) return;
    state.busy = step(delta, !moving()) === true;
    renderer.render(scene, camera);
  }, () => canRender() && moving() && (state.busy || ambient()));
  const invalidate = () => { state.busy = true; loop.invalidate(); };
  const resize = () => {
    state.width = host.clientWidth; state.height = host.clientHeight;
    if (state.width > 0 && state.height > 0 && !state.lost) {
      state.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(state.dpr);
      renderer.setSize(state.width, state.height, false);
      camera.aspect = state.width / state.height;
      onResize(state.width, state.height, state.dpr);
      camera.updateProjectionMatrix();
    }
    invalidate();
  };
  const track = (event) => {
    const bounds = host.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.ndc.set((pointer.x / bounds.width) * 2 - 1, -(pointer.y / bounds.height) * 2 + 1);
  };
  const move = (event) => { track(event); pointer.inside = event.pointerType !== 'touch'; invalidate(); };
  const leave = () => { pointer.inside = false; invalidate(); };
  const onLost = (event) => { event.preventDefault(); state.lost = true; host.dataset.renderer = 'fallback'; };
  const onRestored = () => { state.lost = false; host.dataset.renderer = 'webgl'; resize(); };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; invalidate(); }) : null;
  intersection?.observe(host);
  document.addEventListener('visibilitychange', invalidate);
  motionQuery.addEventListener('change', invalidate);
  host.addEventListener('pointermove', move, { passive: true });
  host.addEventListener('pointerleave', leave);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return {
    scene, camera, keep, pointer, state, track, invalidate, resize, moving,
    setMotion(value) { state.motion = value !== false; invalidate(); },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      loop.dispose();
      resizeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener('visibilitychange', invalidate);
      motionQuery.removeEventListener('change', invalidate);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

const colorOf = (value, fallback) => new Color(typeof value === 'string' && value ? value : fallback);

/* ---------------------------------------------------------------- orbit -- */

const TRAIL = 7;
const BODY_SHADER = {
  vertexShader: `
    attribute vec3 aColor;
    attribute float aSize, aAlpha, aSolid;
    uniform float uScale;
    varying vec3 vColor;
    varying float vAlpha, vSolid;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uScale / -mv.z;
      vColor = aColor; vAlpha = aAlpha; vSolid = aSolid;
    }`,
  fragmentShader: `
    varying vec3 vColor;
    varying float vAlpha, vSolid;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float d = length(p);
      // A lit sphere inside a soft halo; trail dots are halo only.
      float disc = (1.0 - smoothstep(0.255, 0.285, d)) * vSolid;
      float halo = (1.0 - smoothstep(0.08, 0.5, d)) * mix(0.55, 0.22, vSolid);
      vec2 s = p / 0.27;
      float z = sqrt(max(0.0, 1.0 - dot(s, s)));
      float light = 0.72 + 0.34 * dot(normalize(vec3(s.x, -s.y, z)), normalize(vec3(-0.45, 0.55, 0.7)));
      vec3 color = mix(vColor, vColor * light, disc);
      float alpha = max(disc, halo) * vAlpha;
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(color, alpha);
      #include <colorspace_fragment>
    }`,
};

export function createProjectOrbit(host, initial) {
  let settings = { ...initial };
  let elapsed = 0;
  let yaw = 0.35;
  let spin = 0;
  let hoverId = null;
  let drag = null;
  const tooltip = host.querySelector('[data-scene-tooltip]');
  const bodies = new Map();
  const screen = new Map();
  const projector = new Vector3();
  const colors = {};
  const paint = () => {
    colors.accent = colorOf(settings.palette?.accent, '#4176e6');
    colors.muted = colorOf(settings.palette?.muted, '#657080');
    colors.border = colorOf(settings.palette?.border, '#d8dde6');
    colors.dim = colors.muted.clone().lerp(colors.accent, 0.28);
  };
  paint();

  const stage = createStage(host, {
    fov: 32, motion: settings.motion, ambient: () => true,
    step: (delta, snap) => step(delta, snap),
    onResize: (width, height, dpr) => {
      const narrow = width < 520;
      stage.camera.position.set(0, narrow ? 5.6 : 4.3, narrow ? 12.2 : 10.4);
      stage.camera.lookAt(0, narrow ? -0.15 : -0.35, 0);
      material.uniforms.uScale.value = 64 * dpr * stage.camera.position.length() / 2;
    },
  });
  const { scene, keep } = stage;
  const system = new Group();
  scene.add(system);

  const rings = ORBIT_RADII.map((radius) => {
    const points = [];
    for (let index = 0; index < 160; index += 1) {
      const angle = (index / 160) * Math.PI * 2;
      points.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    }
    const geometry = keep(new BufferGeometry());
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    const line = new LineLoop(geometry, keep(new LineBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false })));
    line.userData.glow = 0;
    system.add(line);
    return line;
  });

  const capacity = 1 + MAX_ORBIT_PROJECTS * (1 + TRAIL);
  const geometry = keep(new BufferGeometry());
  const attribute = (name, size) => {
    const values = new Float32Array(capacity * size);
    geometry.setAttribute(name, new BufferAttribute(values, size).setUsage(DynamicDrawUsage)); // shares `values`; Float32BufferAttribute would copy it
    return values;
  };
  const position = attribute('position', 3);
  const color = attribute('aColor', 3);
  const size = attribute('aSize', 1);
  const alpha = attribute('aAlpha', 1);
  const solid = attribute('aSolid', 1);
  const material = keep(new ShaderMaterial({ ...BODY_SHADER, uniforms: { uScale: { value: 60 } }, transparent: true, depthWrite: false }));
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  system.add(points);

  const sync = () => {
    const seen = new Set();
    for (const node of settings.layout?.nodes ?? []) {
      seen.add(node.id);
      const body = bodies.get(node.id) ?? { grow: 0, emphasis: 0, fade: 1, radius: node.radius };
      bodies.set(node.id, Object.assign(body, { node }));
    }
    for (const id of [...bodies.keys()]) if (!seen.has(id)) bodies.delete(id);
  };
  sync();

  const tint = new Color();
  const focusId = () => hoverId ?? settings.highlightId ?? (settings.selectedId || null);
  function step(delta, snap) {
    elapsed += delta;
    if (!drag) {
      if (snap) spin = 0;
      yaw += (snap ? 0 : 0.045 * delta) + spin * delta;
      spin = approach(spin, 0, delta, 2.2);
    }
    system.rotation.y = yaw;
    system.updateMatrixWorld();
    const focused = focusId();
    let moving = false;
    let cursor = 0;
    const write = (x, y, z, c, s, a, isSolid) => {
      position[cursor * 3] = x; position[cursor * 3 + 1] = y; position[cursor * 3 + 2] = z;
      color[cursor * 3] = c.r; color[cursor * 3 + 1] = c.g; color[cursor * 3 + 2] = c.b;
      size[cursor] = s; alpha[cursor] = a; solid[cursor] = isSolid; cursor += 1;
    };
    // The core carries everything still open, assigned or not.
    const core = 0.9 + Math.min(1.2, Math.sqrt(settings.layout?.totalOpen ?? 0) / 4);
    write(0, 0, 0, colors.accent, core * (1 + Math.sin(elapsed * 1.4) * 0.03 * Number(!snap)), focused ? 0.55 : 0.9, 1);
    screen.clear();
    for (const [id, body] of bodies) {
      const { node } = body;
      const target = id === focused ? 1 : 0;
      body.grow = snap ? 1 : approach(body.grow, 1, delta, 3.2);
      body.emphasis = snap ? target : approach(body.emphasis, target, delta, 9);
      body.fade = snap ? (focused && id !== focused ? 0.38 : 1) : approach(body.fade, focused && id !== focused ? 0.38 : 1, delta, 8);
      body.radius = snap ? node.radius : approach(body.radius, node.radius, delta, 3);
      moving ||= !settled(body.grow, 1) || !settled(body.emphasis, target) || !settled(body.radius, node.radius);
      // Inner orbits run faster, as orbits do.
      const speed = 0.32 / Math.pow(body.radius, 1.5);
      const angle = node.phase + elapsed * speed;
      const bob = Math.sin(elapsed * 0.7 + node.phase * 3) * 0.06;
      tint.copy(colors.dim).lerp(colors.accent, 0.35 + node.activity * 0.65);
      const scale = node.size * body.grow * (1 + body.emphasis * 0.45);
      for (let tail = TRAIL; tail >= 1; tail -= 1) {
        const behind = angle - tail * 0.045;
        write(Math.cos(behind) * body.radius, bob, Math.sin(behind) * body.radius, tint,
          scale * (0.42 - tail * 0.035), body.fade * body.grow * (0.32 - tail * 0.038) * (0.4 + node.activity * 0.6), 0);
      }
      const x = Math.cos(angle) * body.radius;
      const z = Math.sin(angle) * body.radius;
      write(x, bob, z, tint, scale, body.fade, 1);
      projector.set(x, bob, z).applyMatrix4(system.matrixWorld);
      const depth = Math.max(1, projector.distanceTo(stage.camera.position));
      projector.project(stage.camera);
      screen.set(id, {
        x: (projector.x + 1) / 2 * stage.state.width,
        y: (1 - projector.y) / 2 * stage.state.height,
        // The lit disc spans 0.285 of the point; add a forgiving margin for the pointer.
        r: 0.285 * scale * material.uniforms.uScale.value / stage.state.dpr / depth + 8,
      });
    }
    for (let rest = cursor; rest < capacity; rest += 1) alpha[rest] = 0;
    geometry.setDrawRange(0, cursor);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha', 'aSolid']) geometry.attributes[name].needsUpdate = true;
    const ringOf = focused ? bodies.get(focused)?.node.ring : undefined;
    rings.forEach((line, index) => {
      line.userData.glow = snap ? Number(index === ringOf) : approach(line.userData.glow, Number(index === ringOf), delta, 8);
      line.material.color.copy(colors.border).lerp(colors.accent, line.userData.glow * 0.8);
      line.material.opacity = 0.55 + line.userData.glow * 0.35;
    });
    pick();
    placeTooltip();
    return moving;
  }

  const nearest = (x, y) => {
    let best = null;
    let distance = Infinity;
    for (const [id, spot] of screen) {
      const d = Math.hypot(spot.x - x, spot.y - y);
      if (d < spot.r && d < distance) { best = id; distance = d; }
    }
    return best;
  };
  function pick() {
    const next = stage.pointer.inside && !drag ? nearest(stage.pointer.x, stage.pointer.y) : drag ? hoverId : null;
    if (next === hoverId) return;
    hoverId = next;
    if (hoverId) host.dataset.hovering = ''; else delete host.dataset.hovering;
    settings.onHover?.(hoverId);
  }
  function placeTooltip() {
    if (!tooltip) return;
    const id = hoverId ?? settings.highlightId; // hovering a card points at its body too
    const spot = id ? screen.get(id) : null;
    if (!spot) { delete tooltip.dataset.visible; return; }
    tooltip.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y - spot.r)}px) translate(-50%, -100%)`;
    tooltip.dataset.visible = '';
  }

  // Horizontal drag turns the system with inertia; vertical swipes still scroll.
  const down = (event) => {
    if (event.button !== 0) return;
    stage.track(event);
    drag = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, lastAt: event.timeStamp, travel: 0 };
    host.setPointerCapture?.(event.pointerId);
  };
  const dragMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.lastX;
    const dt = Math.max(1, event.timeStamp - drag.lastAt) / 1000;
    drag.travel += Math.abs(dx);
    if (drag.travel > 4) host.dataset.dragging = '';
    const turn = (dx / Math.max(1, stage.state.width)) * Math.PI * 1.2;
    yaw += turn;
    spin = turn / dt;
    drag.lastX = event.clientX; drag.lastAt = event.timeStamp;
    stage.invalidate();
  };
  const up = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const tap = drag.travel <= 4;
    drag = null;
    delete host.dataset.dragging;
    if (!stage.moving()) spin = 0;
    if (tap) {
      stage.track(event);
      const id = nearest(stage.pointer.x, stage.pointer.y);
      if (id) settings.onSelect?.(id);
    }
    stage.invalidate();
  };
  const cancel = () => { drag = null; delete host.dataset.dragging; stage.invalidate(); };
  host.addEventListener('pointerdown', down);
  host.addEventListener('pointermove', dragMove);
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', cancel);
  host.addEventListener('lostpointercapture', cancel);
  stage.resize();

  return {
    update(next) {
      const paletteChanged = next.palette !== settings.palette;
      settings = { ...settings, ...next };
      if (paletteChanged) paint();
      sync();
      stage.setMotion(settings.motion);
    },
    dispose() {
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointermove', dragMove);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', cancel);
      host.removeEventListener('lostpointercapture', cancel);
      stage.dispose();
    },
  };
}

/* ---------------------------------------------------------------- ring -- */

const MAX_SEGMENTS = 32;
const RING_SHADER = {
  vertexShader: `
    uniform float uHoverStart, uHoverEnd;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying float vT;
    void main() {
      vUv = uv;
      vT = fract(0.25 - uv.x);
      vec3 p = position;
      // The hovered arc lifts off the ring a little.
      float lifted = step(uHoverStart, vT) * step(vT, uHoverEnd);
      p += normal * lifted * 0.035;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `
    uniform float uStart[${MAX_SEGMENTS}], uEnd[${MAX_SEGMENTS}], uKind[${MAX_SEGMENTS}];
    uniform int uCount;
    uniform float uUsable, uCapacity, uHoverStart, uHoverEnd;
    uniform vec3 uTrack, uAccent, uWarn, uError;
    varying vec3 vNormal;
    varying float vT;
    void main() {
      vec3 color = uTrack;
      float alpha = 0.7;
      if (vT > uUsable && vT < uCapacity) color = mix(uTrack, uWarn, 0.22);
      for (int i = 0; i < ${MAX_SEGMENTS}; i++) {
        if (i >= uCount) break;
        if (vT >= uStart[i] + 0.0035 && vT <= uEnd[i] - 0.0035) {
          color = uKind[i] > 1.5 ? uError : uKind[i] > 0.5 ? uWarn : uAccent;
          alpha = 1.0;
        }
      }
      float lifted = step(uHoverStart, vT) * step(vT, uHoverEnd);
      vec3 n = normalize(vNormal);
      float light = 0.62 + 0.42 * max(dot(n, normalize(vec3(-0.35, 0.6, 0.75))), 0.0);
      float rim = pow(1.0 - max(n.z, 0.0), 2.0) * 0.18;
      gl_FragColor = vec4(color * (light + lifted * 0.12) + rim, alpha);
      #include <colorspace_fragment>
    }`,
};

export function createCapacityRing(host, initial) {
  let settings = { ...initial };
  let current = [];
  let hoverId = null;
  const raycaster = new Raycaster();
  const uniforms = {
    uStart: { value: new Array(MAX_SEGMENTS).fill(0) }, uEnd: { value: new Array(MAX_SEGMENTS).fill(0) },
    uKind: { value: new Array(MAX_SEGMENTS).fill(0) }, uCount: { value: 0 },
    uUsable: { value: 1 }, uCapacity: { value: 1 }, uHoverStart: { value: 2 }, uHoverEnd: { value: -1 },
    uTrack: { value: new Color() }, uAccent: { value: new Color() }, uWarn: { value: new Color() }, uError: { value: new Color() },
  };
  const ticks = [];
  const paint = () => {
    const palette = settings.palette ?? {};
    uniforms.uTrack.value.copy(colorOf(palette.border, '#d8dde6')).lerp(colorOf(palette.muted, '#657080'), 0.18);
    uniforms.uAccent.value.copy(colorOf(palette.accent, '#4176e6'));
    uniforms.uWarn.value.copy(colorOf(palette.warn, '#a86716'));
    uniforms.uError.value.copy(colorOf(palette.error, '#c44242'));
    ticks.forEach((tick) => tick.material.color.copy(colorOf(palette.text, '#202936')));
  };

  const stage = createStage(host, {
    fov: 30, motion: settings.motion,
    step: (delta, snap) => step(delta, snap),
    onResize: () => { stage.camera.position.set(0, 0, 4.6); stage.camera.lookAt(0, 0, 0); },
  });
  const { scene, keep } = stage;
  const ring = new Mesh(keep(new TorusGeometry(1, 0.17, 28, 220)),
    keep(new ShaderMaterial({ ...RING_SHADER, uniforms, transparent: true })));
  const tilt = new Group();
  tilt.add(ring);
  scene.add(tilt);
  // Two radial marks: where the buffer starts and, when overloaded, where capacity ends.
  for (let index = 0; index < 2; index += 1) {
    const geometry = keep(new BufferGeometry());
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0.76, 0.02, 0, 1.25, 0.02], 3));
    const tick = new Line(geometry, keep(new LineBasicMaterial({ transparent: true, opacity: 0.55 })));
    tilt.add(tick);
    ticks.push(tick);
  }
  paint();

  const targets = () => settings.ring?.segments ?? [];
  function step(delta, snap) {
    const next = targets();
    const byId = new Map(current.map((entry) => [entry.id, entry]));
    let moving = false;
    current = next.slice(0, MAX_SEGMENTS).map((segment) => {
      const entry = byId.get(segment.id) ?? { id: segment.id, start: segment.start, end: segment.start };
      entry.start = snap ? segment.start : approach(entry.start, segment.start, delta, 9);
      entry.end = snap ? segment.end : approach(entry.end, segment.end, delta, 9);
      entry.kind = segment.zone === 'overflow' ? 2 : segment.zone === 'buffer' ? 1 : 0;
      moving ||= !settled(entry.start, segment.start) || !settled(entry.end, segment.end);
      return entry;
    });
    current.forEach((entry, index) => {
      uniforms.uStart.value[index] = entry.start;
      uniforms.uEnd.value[index] = entry.end;
      uniforms.uKind.value[index] = entry.kind;
    });
    uniforms.uCount.value = current.length;
    const usableAt = settings.ring?.usableAt ?? 1;
    const capacityAt = settings.ring?.capacityAt ?? 1;
    uniforms.uUsable.value = snap ? usableAt : approach(uniforms.uUsable.value, usableAt, delta, 9);
    uniforms.uCapacity.value = snap ? capacityAt : approach(uniforms.uCapacity.value, capacityAt, delta, 9);
    moving ||= !settled(uniforms.uUsable.value, usableAt) || !settled(uniforms.uCapacity.value, capacityAt);
    [uniforms.uUsable.value, uniforms.uCapacity.value].forEach((at, index) => {
      ticks[index].rotation.z = -at * Math.PI * 2;
      ticks[index].visible = index === 0 ? at < 0.999 && at > 0.001 : at < 0.999;
    });
    // A slight tilt that leans toward the pointer gives the ring its depth.
    const leanX = stage.pointer.inside && !snap ? -stage.pointer.ndc.y * 0.12 : 0;
    const leanY = stage.pointer.inside && !snap ? stage.pointer.ndc.x * 0.16 : 0;
    tilt.rotation.x = snap ? -0.42 : approach(tilt.rotation.x, -0.42 + leanX, delta, 6);
    tilt.rotation.y = snap ? 0 : approach(tilt.rotation.y, leanY, delta, 6);
    moving ||= !settled(tilt.rotation.x, -0.42 + leanX) || !settled(tilt.rotation.y, leanY);
    hover();
    return moving;
  }
  function hover() {
    let found = null;
    if (stage.pointer.inside) {
      raycaster.setFromCamera(stage.pointer.ndc, stage.camera);
      const hit = raycaster.intersectObject(ring)[0];
      const at = hit?.uv ? ((0.25 - hit.uv.x) % 1 + 1) % 1 : null;
      found = at === null ? null : current.find((entry) => at >= entry.start && at <= entry.end)?.id ?? null;
    }
    if (found !== hoverId) { hoverId = found; settings.onHover?.(found); }
    // A task row hovered in the list lifts its arc too.
    const id = hoverId ?? settings.hoverId ?? null;
    const lifted = current.find((entry) => entry.id === id);
    uniforms.uHoverStart.value = lifted ? lifted.start : 2;
    uniforms.uHoverEnd.value = lifted ? lifted.end : -1;
  }
  stage.resize();

  return {
    update(next) {
      const paletteChanged = next.palette !== settings.palette;
      settings = { ...settings, ...next };
      if (paletteChanged) paint();
      stage.setMotion(settings.motion);
    },
    dispose() { stage.dispose(); },
  };
}

/* ------------------------------------------------------------- terrain -- */

export function createActivityTerrain(host, initial) {
  let settings = { ...initial };
  let elapsed = 0;
  let hoverIndex = null;
  let heights = [];
  const raycaster = new Raycaster();
  const holder = new Object3D();
  const tint = new Color();
  const colors = {};
  const paint = () => {
    const palette = settings.palette ?? {};
    colors.accent = colorOf(palette.accent, '#4176e6');
    colors.base = colorOf(palette.border, '#d8dde6');
    colors.text = colorOf(palette.text, '#202936');
    colors.warm = colors.base.clone().lerp(colors.accent, 0.35);
  };
  paint();
  const layout = { gapX: 0.98, gapZ: 0.62 };

  const stage = createStage(host, {
    fov: 28, motion: settings.motion,
    step: (delta, snap) => step(delta, snap),
    onResize: (width) => {
      const narrow = width < 520;
      stage.camera.position.set(narrow ? 6.6 : 5.6, narrow ? 9.4 : 7.4, narrow ? 13.2 : 10.6);
      stage.camera.lookAt(0, 0.35, 0);
    },
  });
  const { scene, keep } = stage;
  scene.add(new HemisphereLight(0xffffff, 0x8a96a8, 1.55));
  const sun = new DirectionalLight(0xffffff, 1.35);
  sun.position.set(-4, 9, 6);
  scene.add(sun);
  const terrain = new Group();
  scene.add(terrain);
  const box = keep(new BoxGeometry(0.78, 1, 0.5));
  box.translate(0, 0.5, 0);
  const material = keep(new MeshLambertMaterial({ color: 0xffffff }));
  let mesh = null;

  const build = () => {
    const grid = settings.grid;
    const count = grid ? grid.cells.length : 0;
    if (mesh && mesh.count === count) return;
    if (mesh) { terrain.remove(mesh); mesh.dispose(); }
    mesh = count ? new InstancedMesh(box, material, count) : null;
    heights = new Array(count).fill(0);
    if (mesh) terrain.add(mesh);
  };
  build();

  function step(delta, snap) {
    elapsed += delta;
    const grid = settings.grid;
    if (!mesh || !grid) return false;
    const days = grid.dates.length;
    let moving = false;
    grid.cells.forEach((cell, index) => {
      const norm = grid.max > 0 ? Math.pow(cell.value / grid.max, 0.72) : 0;
      // Columns rise day by day on arrival; later changes simply ease.
      const target = elapsed < cell.day * 0.06 && !snap ? 0 : 0.08 + norm * 2.4;
      heights[index] = snap ? target : approach(heights[index], target, delta, 7);
      moving ||= !settled(heights[index], target, 0.002);
      holder.position.set((cell.day - (days - 1) / 2) * layout.gapX, 0, (cell.bucket - (grid.buckets - 1) / 2) * layout.gapZ);
      holder.scale.set(1, Math.max(0.02, heights[index]), 1);
      holder.updateMatrix();
      mesh.setMatrixAt(index, holder.matrix);
      const highlighted = settings.highlightDay === cell.day;
      tint.copy(cell.value > 0 ? colors.warm : colors.base);
      if (cell.value > 0) tint.lerp(colors.accent, 0.35 + norm * 0.65);
      if (highlighted) tint.lerp(colors.accent, 0.4);
      if (index === hoverIndex) tint.lerp(colors.text, 0.22);
      mesh.setColorAt(index, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    const lean = stage.pointer.inside && !snap ? stage.pointer.ndc.x * 0.1 : 0;
    terrain.rotation.y = snap ? 0 : approach(terrain.rotation.y, lean, delta, 4);
    moving ||= !settled(terrain.rotation.y, lean) || elapsed < days * 0.06;
    hover();
    return moving;
  }
  function hover() {
    let next = null;
    if (stage.pointer.inside && mesh) {
      terrain.updateMatrixWorld();
      raycaster.setFromCamera(stage.pointer.ndc, stage.camera);
      next = raycaster.intersectObject(mesh)[0]?.instanceId ?? null;
    }
    if (next === hoverIndex) return;
    hoverIndex = next;
    if (next === null) delete host.dataset.hovering; else host.dataset.hovering = '';
    settings.onHover?.(next === null ? null : settings.grid.cells[next]);
  }
  const click = () => {
    if (hoverIndex !== null) settings.onPickDay?.(settings.grid.cells[hoverIndex].date);
  };
  host.addEventListener('click', click);
  stage.resize();

  return {
    update(next) {
      const paletteChanged = next.palette !== settings.palette;
      settings = { ...settings, ...next };
      if (paletteChanged) paint();
      build();
      stage.setMotion(settings.motion);
    },
    dispose() {
      host.removeEventListener('click', click);
      mesh?.dispose();
      stage.dispose();
    },
  };
}
