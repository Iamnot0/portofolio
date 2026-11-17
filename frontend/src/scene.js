import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  MathUtils,
  PerspectiveCamera,
  Plane,
  Points,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { buildFormations, CODE_ROWS, CODE_ROW_HEIGHT } from './formations.js';

// Swarm placement per [data-stage] section, relative to the camera as it travels forward.
const STAGES = [
  { x: 1.4, y: 0.0, z: 0.0, scale: 0.95, rotX: 0.05, rotY: -0.22, opacity: 1 },
  { x: 0.0, y: 0.05, z: -3.0, scale: 3.8, rotX: 0.0, rotY: 0.0, opacity: 0.55 },
  { x: 2.35, y: 1.05, z: 0.0, scale: 0.4, rotX: 0.0, rotY: -0.2, opacity: 1 },
  { x: -1.75, y: 0.0, z: 0.0, scale: 0.62, rotX: 0.0, rotY: 0.35, opacity: 1 },
  { x: 0.0, y: 0.95, z: 0.0, scale: 0.6, rotX: 0.25, rotY: 0.0, opacity: 1 },
];

const PALETTES = {
  light: { ink: '#1c1814', accent: '#b8633f' },
  dark: { ink: '#ede6dc', accent: '#d98a63' },
};

const CAMERA_TRAVEL = 60;
const CAMERA_FOV = 35;
const CAMERA_START_Z = 6;
// The desktop stages were composed for a 16:10 window; narrower windows shrink and pull them inward.
const DESIGN_ASPECT = 1.6;
// Breathing room, in CSS pixels, between a phone placement and the nav or the copy it must clear.
const PHONE_CLEARANCE = 16;
// Tilt and perspective render a formation slightly larger than its flat bounds.
const PERSPECTIVE_ALLOWANCE = 0.9;

const swarmVertex = /* glsl */ `
attribute vec3 aP1;
attribute vec3 aP2;
attribute vec3 aP3;
attribute vec3 aP4;
attribute vec3 aLine;
attribute float aOffset;
attribute float aDelay;
attribute float aTone;
attribute float aSize;
uniform float uStage;
uniform float uTime;
uniform float uPixelRatio;
uniform float uCodeSpan;
uniform vec3 uPointer;
uniform float uPointerStrength;
varying float vTone;
varying float vAlpha;

float codeAlpha = 1.0;

// Formation 0 (hero): the code column scrolls upward; each line types itself in as it enters at the
// bottom and fades out at the top, so the wrap-around is never visible.
vec3 runningCode() {
  float halfSpan = uCodeSpan * 0.5;
  float y = mod(position.y + halfSpan + uTime * 0.14, uCodeSpan) - halfSpan;
  float typed = clamp((y + halfSpan) / 0.7, 0.0, 1.0);
  float shown = step((position.x - aLine.x) / max(aLine.y, 1e-3), typed);
  codeAlpha = shown * smoothstep(halfSpan, halfSpan - 0.4, abs(y));
  return vec3(position.x, y, position.z);
}

vec3 formation(float index) {
  if (index < 0.5) return runningCode();
  if (index < 1.5) return aP1;
  if (index < 2.5) return aP2;
  if (index < 3.5) return aP3;
  return aP4;
}

void main() {
  float s = clamp(uStage, 0.0, 4.0);
  float fromIndex = min(floor(s), 3.0);
  float local = smoothstep(aDelay * 0.45, aDelay * 0.45 + 0.55, s - fromIndex);
  vec3 p = mix(formation(fromIndex), formation(fromIndex + 1.0), local);
  vAlpha = mix(fromIndex < 0.5 ? codeAlpha : 1.0, 1.0, local);
  p += normalize(p + vec3(1e-4)) * sin(local * 3.14159) * 0.4 * aDelay;
  // Code needs crisp, steady strokes to stay readable: smaller dots and almost no drift.
  float codeWeight = fromIndex < 0.5 ? 1.0 - local : 0.0;
  p += vec3(sin(uTime * 0.6 + aOffset * 20.0), cos(uTime * 0.5 + aOffset * 13.0), sin(uTime * 0.4 + aOffset * 7.0)) * mix(0.01, 0.0008, codeWeight);

  vec4 world = modelMatrix * vec4(p, 1.0);
  vec2 away = world.xy - uPointer.xy;
  float dist = length(away);
  float push = smoothstep(0.8, 0.0, dist) * uPointerStrength;
  world.xy += (dist > 1e-4 ? away / dist : vec2(0.0)) * push * 0.4;
  world.z += push * 0.3;

  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * 14.0 * mix(1.0, 0.6, codeWeight) * uPixelRatio / -mv.z;
  vTone = aTone;
}
`;

const swarmFragment = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uAccent;
uniform float uOpacity;
varying float vTone;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5 || vAlpha < 0.01) discard;
  vec3 col = mix(uInk, uAccent, step(0.7, vTone));
  gl_FragColor = vec4(col, smoothstep(0.5, 0.32, d) * uOpacity * vAlpha);
  #include <colorspace_fragment>
}
`;

const dustVertex = /* glsl */ `
attribute float aSize;
uniform float uPixelRatio;
varying float vFade;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * 9.0 * uPixelRatio / -mv.z;
  float depth = -mv.z;
  vFade = smoothstep(0.6, 2.5, depth) * smoothstep(45.0, 8.0, depth);
}
`;

const dustFragment = /* glsl */ `
uniform vec3 uInk;
varying float vFade;

void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uInk, smoothstep(0.5, 0.2, d) * vFade * 0.3);
  #include <colorspace_fragment>
}
`;

const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const smooth = (t) => t * t * (3 - 2 * t);

// Extent of a formation's points on the x and y axes, with its centre.
function boundsOf(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { width: maxX - minX, height: maxY - minY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

function makeDust(count) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 2] = 4 - Math.random() * (CAMERA_TRAVEL + 30);
    sizes[i] = 0.6 + Math.random() * 1.4;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  return geometry;
}

export async function createScene(canvas, { reduceMotion }) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    document.documentElement.classList.add('no-webgl');
    return null;
  }
  renderer.setClearColor(0x000000, 0);

  const narrowQuery = matchMedia('(max-width: 760px)');
  const count = narrowQuery.matches ? 9000 : 22000;
  const data = await buildFormations(count);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 120);
  camera.position.z = CAMERA_START_Z;

  const geometry = new BufferGeometry();
  const [code, glyph, gear, shield, orbit] = data.formations;
  geometry.setAttribute('position', new BufferAttribute(code, 3));
  geometry.setAttribute('aP1', new BufferAttribute(glyph, 3));
  geometry.setAttribute('aP2', new BufferAttribute(gear, 3));
  geometry.setAttribute('aP3', new BufferAttribute(shield, 3));
  geometry.setAttribute('aP4', new BufferAttribute(orbit, 3));
  geometry.setAttribute('aLine', new BufferAttribute(data.line, 3));
  geometry.setAttribute('aOffset', new BufferAttribute(data.offset, 1));
  geometry.setAttribute('aDelay', new BufferAttribute(data.delay, 1));
  geometry.setAttribute('aTone', new BufferAttribute(data.tone, 1));
  geometry.setAttribute('aSize', new BufferAttribute(data.size, 1));

  const uniforms = {
    uStage: { value: 0 },
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uCodeSpan: { value: CODE_ROWS * CODE_ROW_HEIGHT },
    uPointer: { value: new Vector3(99, 99, 0) },
    uPointerStrength: { value: 0 },
    uInk: { value: new Color() },
    uAccent: { value: new Color() },
    uOpacity: { value: 1 },
  };
  const swarm = new Points(geometry, new ShaderMaterial({
    uniforms, vertexShader: swarmVertex, fragmentShader: swarmFragment, transparent: true, depthWrite: false,
  }));
  swarm.frustumCulled = false;
  const group = new Group();
  group.add(swarm);
  scene.add(group);

  const dustUniforms = { uPixelRatio: uniforms.uPixelRatio, uInk: uniforms.uInk };
  const dust = new Points(makeDust(narrowQuery.matches ? 900 : 2200), new ShaderMaterial({
    uniforms: dustUniforms, vertexShader: dustVertex, fragmentShader: dustFragment, transparent: true, depthWrite: false,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  const codeBounds = boundsOf(code);
  const orbitBounds = boundsOf(orbit);
  const phoneStages = { hero: null, contact: null };

  const state = { ...STAGES[0] };
  const pointer = { ndc: new Vector2(), inside: false, tiltX: 0, tiltY: 0 };
  const raycaster = new Raycaster();
  const plane = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();
  let progressSource = () => [];
  let scrollFraction = 0;
  let gearTurn = 0;
  let hidden = document.hidden;

  function setTheme(theme) {
    const palette = PALETTES[theme] ?? PALETTES.light;
    uniforms.uInk.value.set(palette.ink);
    uniforms.uAccent.value.set(palette.accent);
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio, 1.75);
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    uniforms.uPixelRatio.value = ratio;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (narrowQuery.matches) measurePhoneStages();
  }

  // Phones: fit a formation into the free band between two page landmarks, measured from the live layout.
  function fitToBand(bounds, stage, topPx, bottomPx) {
    const unitsPerPx = (2 * CAMERA_START_Z * Math.tan(MathUtils.degToRad(CAMERA_FOV / 2))) / window.innerHeight;
    const bandPx = Math.max(bottomPx - topPx, 1);
    const widthPx = window.innerWidth - 2 * PHONE_CLEARANCE;
    const scale = PERSPECTIVE_ALLOWANCE * Math.min((bandPx * unitsPerPx) / bounds.height, (widthPx * unitsPerPx) / bounds.width);
    const centerPx = (topPx + bottomPx) / 2;
    return {
      ...stage,
      x: -bounds.centerX * scale,
      y: (window.innerHeight / 2 - centerPx) * unitsPerPx - bounds.centerY * scale,
      scale,
    };
  }

  function measurePhoneStages() {
    const navBottom = document.querySelector('.nav').getBoundingClientRect().bottom + PHONE_CLEARANCE;
    const heroTitleTop = document.querySelector('.hero-title').offsetTop - PHONE_CLEARANCE;
    const contact = document.getElementById('contact');
    const contactTitleTop = document.querySelector('.contact-title').offsetTop - contact.offsetTop - PHONE_CLEARANCE;
    phoneStages.hero = fitToBand(codeBounds, STAGES[0], navBottom, heroTitleTop);
    phoneStages.contact = { ...fitToBand(orbitBounds, STAGES[4], navBottom, contactTitleTop), opacity: 0.45 };
  }

  function stageTarget(stage, index) {
    if (!narrowQuery.matches) {
      const fit = Math.min(1, camera.aspect / DESIGN_ASPECT);
      return { ...stage, x: stage.x * fit, scale: stage.scale * fit };
    }
    // Phones: the swarm leads the hero above the copy, recedes behind the text, then settles above the contact heading.
    if (index === 0) return phoneStages.hero;
    if (index === STAGES.length - 1) return phoneStages.contact;
    return { ...stage, x: 0, y: 0.2, z: -1.5, scale: 0.75, opacity: 0.22 };
  }

  function computeTarget(progress) {
    const target = { ...stageTarget(STAGES[0], 0) };
    let stage = 0;
    for (let i = 1; i < STAGES.length; i += 1) {
      const t = smooth(progress[i] ?? 0);
      stage += t;
      if (t <= 0) continue;
      const next = stageTarget(STAGES[i], i);
      for (const key of Object.keys(target)) target[key] += (next[key] - target[key]) * t;
    }
    return { target, stage };
  }

  function render(dt) {
    if (hidden) return;
    const step = Math.min(dt, 0.05);
    const { target, stage } = computeTarget(progressSource());
    const rate = reduceMotion ? 1000 : 3;
    for (const key of Object.keys(state)) state[key] = damp(state[key], target[key], rate, step);
    uniforms.uStage.value = reduceMotion ? stage : damp(uniforms.uStage.value, stage, 2.6, step);

    camera.position.z = damp(camera.position.z, CAMERA_START_Z - scrollFraction * CAMERA_TRAVEL, reduceMotion ? 1000 : 4, step);

    pointer.tiltX = damp(pointer.tiltX, pointer.inside ? pointer.ndc.y * 0.2 : 0, 2.5, step);
    pointer.tiltY = damp(pointer.tiltY, pointer.inside ? pointer.ndc.x * 0.3 : 0, 2.5, step);

    group.position.set(state.x, state.y, camera.position.z - CAMERA_START_Z + state.z);
    group.scale.setScalar(state.scale);
    // The gear turns while the founder section is in view; other shapes stay upright.
    const gearWeight = Math.max(0, 1 - Math.abs(stage - 2));
    if (!reduceMotion) gearTurn += step * 0.35 * gearWeight;
    group.rotation.set(state.rotX - pointer.tiltX, state.rotY + pointer.tiltY, gearTurn * gearWeight);
    uniforms.uOpacity.value = state.opacity;

    let pointerActive = false;
    if (pointer.inside) {
      raycaster.setFromCamera(pointer.ndc, camera);
      plane.constant = -group.position.z;
      pointerActive = raycaster.ray.intersectPlane(plane, hit) !== null;
      if (pointerActive) uniforms.uPointer.value.copy(hit);
    }
    uniforms.uPointerStrength.value = damp(uniforms.uPointerStrength.value, pointerActive ? 1 : 0, 4, step);
    if (!reduceMotion) uniforms.uTime.value += dt;

    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (event) => {
    pointer.inside = true;
    pointer.ndc.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  }, { passive: true });
  window.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'mouse') pointer.inside = false;
  });
  document.addEventListener('pointerleave', () => { pointer.inside = false; });
  window.addEventListener('blur', () => { pointer.inside = false; });
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  setTheme(document.documentElement.dataset.theme);
  resize();

  return {
    render,
    setTheme,
    setProgressSource(fn) { progressSource = fn; },
    setScrollFraction(value) { scrollFraction = value; },
  };
}
