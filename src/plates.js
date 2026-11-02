/* Procedural "archive plates": painterly source images for the simulation.
 * The original video sampled a real image archive. These stand in for it;
 * drop your own images on the page to use those instead. */
(function () {
'use strict';

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise1(r) {
  const v = Array.from({ length: 256 }, r);
  return x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return v[i & 255] + (v[(i + 1) & 255] - v[i & 255]) * u; };
}
function fbm(f, x, oct = 4) { let s = 0, a = 0.5, fr = 1; for (let o = 0; o < oct; o++) { s += a * f(x * fr); a *= 0.5; fr *= 2.03; } return s; }
function noise2(r) {
  const p = Array.from({ length: 512 }, r);
  const h = (x, y) => p[(x * 37 + y * 101 + ((x * y) & 63)) & 511];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function ridge(ctx, W, H, f, base, amp, freq, fill) {
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) ctx.lineTo(x, base + (fbm(f, x * freq) - 0.5) * amp * 2);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function blobs(ctx, r, n, x0, x1, y0, y1, rad, colour) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colour(r);
    ctx.beginPath();
    ctx.ellipse(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), rad * (0.4 + r()), rad * (0.3 + r() * 0.8), r() * 3, 0, 7);
    ctx.fill();
  }
}

// --- compositions -----------------------------------------------------------
const PLATES = {
  valley(ctx, W, H, r) {
    const f = noise1(r);
    ridge(ctx, W, H, f, H * 0.32, H * 0.16, 0.012, '#8d939b');
    // snow on the peaks
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#e9ecef'; ctx.fillRect(0, 0, W, H * 0.3); ctx.restore();
    ridge(ctx, W, H, noise1(r), H * 0.5, H * 0.08, 0.02, '#5b3d24');
    blobs(ctx, r, 260, 0, W, H * 0.48, H * 0.7, W * 0.035, r => hsl(110 + r() * 40, 45 + r() * 30, 22 + r() * 22));
    ctx.fillStyle = '#2b78a8'; ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.78, W * 0.42, H * 0.07, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6cc3dc'; ctx.beginPath(); ctx.ellipse(W * 0.48, H * 0.77, W * 0.3, H * 0.03, 0, 0, 7); ctx.fill();
    ridge(ctx, W, H, noise1(r), H * 0.88, H * 0.03, 0.03, '#4a3a2c');
    blobs(ctx, r, 90, 0, W, H * 0.86, H, W * 0.02, r => hsl(100 + r() * 30, 50, 30 + r() * 15));
    blobs(ctx, r, 40, 0, W, H * 0.84, H, W * 0.008, () => '#d42020');
    blobs(ctx, r, 18, W * 0.1, W * 0.9, H * 0.05, H * 0.2, W * 0.05, r => hsl(195, 50, 55 + r() * 20, 0.8));
  },
  volcano(ctx, W, H, r) {
    const f = noise1(r);
    ctx.fillStyle = '#1f3f63'; ctx.fillRect(0, H * 0.86, W, H * 0.14);
    ctx.beginPath(); ctx.moveTo(W * 0.02, H * 0.9);
    for (let x = 0; x <= W; x += 2) {
      const d = Math.abs(x / W - 0.5) * 2;
      let y = H * 0.24 + Math.pow(d, 1.3) * H * 0.66 + (fbm(f, x * 0.03) - 0.5) * H * 0.05;
      if (d < 0.1) y += H * 0.04 * (1 - d / 0.1);   // crater dip
      ctx.lineTo(x, Math.min(H * 0.9, y));
    }
    ctx.lineTo(W, H * 0.9); ctx.closePath();
    const g = ctx.createLinearGradient(0, H * 0.2, 0, H); g.addColorStop(0, '#4a3b33'); g.addColorStop(1, '#2e2621');
    ctx.fillStyle = g; ctx.fill();
    // lava runs
    ctx.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      ctx.strokeStyle = r() < 0.5 ? '#e0281b' : '#ff7a1a'; ctx.lineWidth = 2 + r() * 4;
      ctx.beginPath(); let x = W * (0.47 + r() * 0.06), y = H * 0.27; ctx.moveTo(x, y);
      const dir = r() < 0.5 ? -1 : 1;
      for (let s = 0; s < 30; s++) { x += dir * (2 + r() * 4); y += 4 + r() * 6; ctx.lineTo(x, y); if (y > H * 0.8) break; }
      ctx.stroke();
    }
    blobs(ctx, r, 160, 0, W, H * 0.66, H * 0.87, W * 0.04, r => hsl(95 + r() * 50, 45 + r() * 25, 22 + r() * 18));
    blobs(ctx, r, 70, W * 0.3, W * 0.7, H * 0.02, H * 0.2, W * 0.06, r => hsl(0, 0, 55 + r() * 35, 0.85));
    blobs(ctx, r, 14, W * 0.45, W * 0.55, H * 0.22, H * 0.28, W * 0.02, () => '#ff3a1a');
  },
  figure(ctx, W, H, r) {
    const f = noise1(r), cx = W / 2;
    const prof = y => {           // silhouette half-width along height
      const t = y / H;
      const head = Math.exp(-Math.pow((t - 0.14) / 0.08, 2)) * 0.16;
      const body = t > 0.24 ? 0.22 + (t - 0.24) * 0.32 : 0.04;
      const arms = Math.exp(-Math.pow((t - 0.36) / 0.05, 2)) * 0.22;
      return (Math.max(head, body) + arms + (fbm(f, y * 0.04) - 0.5) * 0.08) * W;
    };
    for (let y = H * 0.04; y < H; y += 2) {
      const hw = prof(y), t = y / H;
      let col;
      if (t < 0.24) col = r() < 0.75 ? hsl(130 + r() * 30, 50, 30 + r() * 20) : hsl(8, 70, 55);
      else if (t < 0.65) col = r() < 0.7 ? hsl(188 + r() * 20, 55, 40 + r() * 25) : hsl(14, 65, 60);
      else col = r() < 0.6 ? hsl(0, 0, 38 + r() * 30) : hsl(140, 45, 30);
      ctx.fillStyle = col; ctx.fillRect(cx - hw, y, hw * 2, 2);
    }
    blobs(ctx, r, 120, W * 0.05, W * 0.95, H * 0.3, H * 0.62, W * 0.03, r => hsl(130 + r() * 30, 45, 25 + r() * 20));
  },
  canyon(ctx, W, H, r) {
    const f = noise1(r);
    const cliff = (x0, x1, dir) => {
      ctx.beginPath(); ctx.moveTo(x0, H);
      for (let y = H; y >= H * 0.05; y -= 3) ctx.lineTo(x0 + (fbm(f, y * 0.03 + x0) - 0.5) * W * 0.06, y);
      for (let y = H * 0.05; y <= H; y += 3) ctx.lineTo(x1 + dir * (y / H) * W * 0.12 + (fbm(f, y * 0.05 + x1) - 0.5) * W * 0.05, y);
      ctx.closePath(); ctx.fillStyle = '#3a2d22'; ctx.fill();
    };
    cliff(W * 0.04, W * 0.4, -1); cliff(W * 0.96, W * 0.56, 1);
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#3e9a3c'; ctx.fillRect(0, 0, W, H * 0.3);
    ctx.fillStyle = '#2f7f34'; ctx.fillRect(0, H * 0.68, W, H * 0.32);
    ctx.fillStyle = '#62c0d8'; ctx.fillRect(0, H * 0.53, W, H * 0.05);
    ctx.strokeStyle = '#e8e4da'; ctx.lineWidth = 4;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); const y = H * (0.3 + r() * 0.2); ctx.moveTo(0, y); ctx.lineTo(W, y + (r() - 0.5) * H * 0.3); ctx.stroke(); }
    ctx.restore();
    blobs(ctx, r, 10, 0, W, H * 0.5, H * 0.75, W * 0.01, () => '#d82222');
  },
};

/* Painterly pass: resample the composition as short brush strokes that follow a
 * flow field, then punch black holes into it so it reads as damaged. */
function paint(src, W, H, r) {
  const sctx = src.getContext('2d');
  const data = sctx.getImageData(0, 0, W, H).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const o = out.getContext('2d');
  o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
  o.globalAlpha = 0.9; o.drawImage(src, 0, 0); o.globalAlpha = 1;
  const n2 = noise2(r);
  const strokes = (W * H) / 9;
  o.lineCap = 'round';
  for (let k = 0; k < strokes; k++) {
    const x = r() * W, y = r() * H, p = ((y | 0) * W + (x | 0)) * 4;
    if (data[p + 3] < 10 || data[p] + data[p + 1] + data[p + 2] < 30) continue;
    const a = n2(x * 0.02, y * 0.02) * Math.PI * 4;
    const len = 2 + r() * 7, j = (r() - 0.5) * 50;
    o.strokeStyle = `rgb(${data[p] + j | 0},${data[p + 1] + j | 0},${data[p + 2] + j | 0})`;
    o.lineWidth = 1 + r() * 2.5;
    o.beginPath(); o.moveTo(x, y); o.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); o.stroke();
  }
  // damage: dark voids and dropouts
  o.fillStyle = '#000';
  for (let k = 0; k < 40; k++) {
    o.globalAlpha = 0.5 + r() * 0.5;
    o.beginPath(); o.ellipse(r() * W, r() * H, 3 + r() * W * 0.05, 2 + r() * H * 0.03, r() * 3, 0, 7); o.fill();
  }
  o.globalAlpha = 1;
  return out;
}

const KINDS = Object.keys(PLATES);
function makePlate(kind, seed, W = 360, H = 440) {
  const r = rng(seed);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  PLATES[kind](ctx, W, H, r);
  return paint(c, W, H, r);
}

window.DIS = window.DIS || {};
Object.assign(window.DIS, { makePlate, PLATE_KINDS: KINDS });
})();
