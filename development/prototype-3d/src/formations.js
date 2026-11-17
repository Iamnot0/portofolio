// Point-cloud targets the swarm morphs between, one per page section:
// running code → </> → gear → shield → orbit.

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rotate(out, rx, ry) {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  for (let i = 0; i < out.length; i += 3) {
    const x = out[i];
    const y = out[i + 1];
    const z = out[i + 2];
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;
    out[i] = x * cy + z1 * sy;
    out[i + 1] = y1;
    out[i + 2] = -x * sy + z1 * cy;
  }
  return out;
}

// Real code rendered in a monospace font and sampled into points, so every line is legible.
// The shader scrolls the column upward and types each line in as it enters.
const CODE = [
  '// agent workflow: ERP sync',
  'const agent = createAgent({',
  '  model: "planner",',
  '  tools: [erp.read, erp.write, notify],',
  '});',
  '',
  'for await (const step of agent.run(job)) {',
  '  if (step.kind === "tool") {',
  '    await audit.log(step);',
  '  }',
  '  if (step.done) break;',
  '}',
  '',
  'export async function reconcile(orders) {',
  '  const drift = await erp.diff(orders);',
  '  return agent.fix(drift, { dryRun: false });',
  '}',
];
const KEYWORDS = /\b(const|for|await|of|if|export|async|function|return|break|false|true)\b/g;
const FONT_PX = 30;
const ROW_PX = 44;

export const CODE_ROW_HEIGHT = 0.125;
export const CODE_ROWS = CODE.length + 3;

function runningCode(count, rand) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const font = `500 ${FONT_PX}px ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace`;
  ctx.font = font;
  const widths = CODE.map((text) => ctx.measureText(text).width);
  canvas.width = Math.ceil(Math.max(...widths)) + 8;
  canvas.height = ROW_PX * CODE.length;
  ctx.font = font;
  ctx.textBaseline = 'middle';

  // Plain code in green, keywords overdrawn in red, so the sampler can tell them apart.
  CODE.forEach((text, row) => {
    const y = row * ROW_PX + ROW_PX / 2;
    ctx.fillStyle = 'rgb(0,255,0)';
    ctx.fillText(text, 4, y);
    ctx.fillStyle = 'rgb(255,0,0)';
    for (const match of text.matchAll(KEYWORDS)) {
      const x = 4 + ctx.measureText(text.slice(0, match.index)).width;
      ctx.clearRect(x, row * ROW_PX, ctx.measureText(match[0]).width, ROW_PX);
      ctx.fillText(match[0], x, y);
    }
  });

  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const filled = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (data[o + 3] > 140) filled.push(x, y, data[o] > data[o + 1] ? 1 : 0);
    }
  }

  const unit = CODE_ROW_HEIGHT / ROW_PX;
  const span = CODE_ROWS * CODE_ROW_HEIGHT;
  const left = -(canvas.width * unit) / 2;
  const positions = new Float32Array(count * 3);
  const line = new Float32Array(count * 3);
  const tone = new Float32Array(count);
  const samples = filled.length / 3;
  for (let i = 0; i < count; i += 1) {
    const k = Math.floor(rand() * samples) * 3;
    const px = filled[k];
    const py = filled[k + 1];
    const row = Math.floor(py / ROW_PX);
    positions[i * 3] = left + px * unit;
    positions[i * 3 + 1] = span / 2 - py * unit;
    positions[i * 3 + 2] = (rand() - 0.5) * 0.01;
    line[i * 3] = left;
    line[i * 3 + 1] = Math.max(widths[row], 1) * unit;
    tone[i] = filled[k + 2] ? 0.9 : rand() * 0.6;
  }
  return { positions, line, tone };
}

// A gear, as on the MR ROBOT badge: operations and automation.
function gear(count, rand) {
  return sampleCanvas((ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const teeth = 10;
    const outer = w * 0.44;
    const root = w * 0.36;
    ctx.beginPath();
    for (let i = 0; i <= teeth * 4; i += 1) {
      const angle = (i / (teeth * 4)) * Math.PI * 2;
      const r = i % 4 === 1 || i % 4 === 2 ? outer : root;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }, count, rand, { width: 600, height: 600, span: 2.4, depth: 0.3 });
}

function sampleCanvas(draw, count, rand, { width = 1000, height = 600, span = 3.4, depth = 0.3 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  draw(ctx, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const filled = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] > 128) filled.push(x, y);
    }
  }
  const out = new Float32Array(count * 3);
  const pairs = filled.length / 2;
  for (let i = 0; i < count; i += 1) {
    const k = pairs ? Math.floor(rand() * pairs) * 2 : 0;
    out[i * 3] = ((filled[k] ?? width / 2) - width / 2) / width * span + (rand() - 0.5) * 0.006;
    out[i * 3 + 1] = -((filled[k + 1] ?? height / 2) - height / 2) / width * span;
    out[i * 3 + 2] = (rand() - 0.5) * depth;
  }
  return out;
}

function codeGlyph(count, rand) {
  return sampleCanvas((ctx, w, h) => {
    ctx.font = "400 400px 'Fraunces', Georgia, serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('</>', w / 2, h / 2);
  }, count, rand, { width: 1100, height: 520, span: 3.6, depth: 0.35 });
}

function shield(count, rand) {
  return sampleCanvas((ctx, w, h) => {
    const cx = w / 2;
    const top = h * 0.06;
    const bottom = h * 0.96;
    const sh = bottom - top;
    const sw = sh * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.quadraticCurveTo(cx + sw * 0.25, top + sh * 0.07, cx + sw / 2, top + sh * 0.09);
    ctx.lineTo(cx + sw / 2, top + sh * 0.46);
    ctx.bezierCurveTo(cx + sw / 2, top + sh * 0.76, cx + sw * 0.2, top + sh * 0.92, cx, bottom);
    ctx.bezierCurveTo(cx - sw * 0.2, top + sh * 0.92, cx - sw / 2, top + sh * 0.76, cx - sw / 2, top + sh * 0.46);
    ctx.lineTo(cx - sw / 2, top + sh * 0.09);
    ctx.quadraticCurveTo(cx - sw * 0.25, top + sh * 0.07, cx, top);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, top + sh * 0.42, sw * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - sw * 0.05, top + sh * 0.46);
    ctx.lineTo(cx + sw * 0.05, top + sh * 0.46);
    ctx.lineTo(cx + sw * 0.08, top + sh * 0.66);
    ctx.lineTo(cx - sw * 0.08, top + sh * 0.66);
    ctx.fill();
  }, count, rand, { width: 700, height: 700, span: 2.6, depth: 0.25 });
}

function orbit(count, rand) {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const inner = i < count * 0.3;
    const radius = (inner ? 0.72 : 1.25) + (rand() - 0.5) * 0.08;
    const u = rand() * Math.PI * 2;
    const tilt = inner ? -0.6 : 1.15;
    const x = Math.cos(u) * radius;
    const y = Math.sin(u) * radius;
    out[i * 3] = x;
    out[i * 3 + 1] = y * Math.cos(tilt);
    out[i * 3 + 2] = y * Math.sin(tilt) + (rand() - 0.5) * 0.04;
  }
  return rotate(out, 0, 0.4);
}

export async function buildFormations(count) {
  try {
    await document.fonts.load("400 400px 'Fraunces'");
  } catch {
    // Georgia stands in for the glyph if the web font is unavailable.
  }
  const rand = mulberry32(20261117);
  const code = runningCode(count, rand);
  const formations = [code.positions, codeGlyph(count, rand), gear(count, rand), shield(count, rand), orbit(count, rand)];

  const delay = new Float32Array(count);
  const offset = new Float32Array(count);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    delay[i] = rand();
    offset[i] = rand();
    size[i] = 0.75 + rand() * 0.45;
  }
  return { formations, line: code.line, tone: code.tone, delay, offset, size };
}
