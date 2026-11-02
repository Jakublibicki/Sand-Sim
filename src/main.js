/* Wiring: canvas layout, rendering, input, plates, recording. */
(function () {
'use strict';
const { Sim, M, Director, Overlay, makePlate, PLATE_KINDS, audio: A } = window.DIS;
const R = Math.random;
const params = new URLSearchParams(location.search);

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const scan = document.createElement('canvas');      // 1 pixel per cell
const sctx = scan.getContext('2d');
let W, H, dpr, cs, rect, panel, img, buf32, gapPattern, sim, dir;
const overlay = new Overlay();
const userImages = [];
let plateIndex = 0, currentPlate = null, paused = false, hideUI = false, tool = 'eruption';

// ------------------------------------------------------------------ layout
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.width = Math.round(innerWidth * dpr);
  H = canvas.height = Math.round(innerHeight * dpr);
  const cellCss = +params.get('cell') || (innerWidth < 700 ? 3 : 4);
  cs = Math.max(1, Math.round(cellCss * dpr));
  const wide = innerWidth > 1000;
  const barH = document.getElementById('bar').offsetHeight;
  const top = Math.round(wide ? H * 0.03 : 130 * dpr);
  const bottom = Math.round(wide ? H * 0.13 : (barH + 120) * dpr);
  const left = Math.round(36 * dpr);
  const panelW = wide ? Math.round(W * 0.27) : 0;
  const fieldW = W - left - (wide ? panelW + 60 * dpr : left);
  const gw = Math.floor(fieldW / cs), gh = Math.floor((H - top - bottom) / cs);
  rect = { x: left, y: top, w: gw * cs, h: gh * cs };
  panel = wide ? { x: rect.x + rect.w + 30 * dpr, y: top, w: panelW, h: H - top - bottom } : null;

  if (!sim) sim = new Sim(gw, gh); else sim.resize(gw, gh);
  if (params.has('density')) sim.density = +params.get('density');
  scan.width = gw; scan.height = gh;
  img = sctx.createImageData(gw, gh);
  buf32 = new Uint32Array(img.data.buffer);

  // 1px dark seam between cells: the "every pixel is a tile" look
  const p = document.createElement('canvas'); p.width = p.height = cs;
  const pc = p.getContext('2d');
  if (cs >= 3) { pc.fillStyle = 'rgba(0,0,0,0.85)'; pc.fillRect(cs - 1, 0, 1, cs); pc.fillRect(0, cs - 1, cs, 1); }
  gapPattern = ctx.createPattern(p, 'repeat');
  if (currentPlate) placePlate(currentPlate);
}

// ------------------------------------------------------------------ plates
function placePlate(source) {
  currentPlate = source;
  const gw = sim.w, gh = sim.h;
  const sw = source.width, sh = source.height;
  const s = Math.min(gw * (panel ? 0.62 : 0.95) / sw, gh * 0.97 / sh);
  const dw = Math.max(1, Math.round(sw * s)), dh = Math.max(1, Math.round(sh * s));
  const t = document.createElement('canvas'); t.width = dw; t.height = dh;
  const tc = t.getContext('2d');
  tc.imageSmoothingQuality = 'high';
  tc.drawImage(source, 0, 0, dw, dh);
  const data = tc.getImageData(0, 0, dw, dh).data;
  sim.clear();
  sim.loadPixels(data, dw, dh, Math.round((gw - dw) / 2), gh - dh);
  sim.count();
  sim.heldStart = Math.max(1, sim.heldCount);
}

function newPlate() {
  if (userImages.length) { placePlate(userImages[plateIndex++ % userImages.length]); return; }
  const kind = PLATE_KINDS[plateIndex++ % PLATE_KINDS.length];
  placePlate(makePlate(kind, (R() * 1e9) | 0));
  sim.log('ARCHIVE PLATE ' + kind.toUpperCase() + ' LOADED');
}

function addImages(files) {
  const list = [...files].filter(f => f.type.startsWith('image/'));
  let first = true;
  for (const f of list) {
    const im = new Image();
    im.onload = () => {
      userImages.push(im);
      if (first) { first = false; plateIndex = userImages.length - 1; newPlate(); sim.log('USER PLATE ' + f.name.toUpperCase().slice(0, 30)); }
    };
    im.src = URL.createObjectURL(f);
  }
}

// ------------------------------------------------------------------ render
function render() {
  const { mat, col, w, h } = sim, n = w * h;
  for (let i = 0; i < n; i++) {
    const m = mat[i];
    buf32[i] = m === 0 ? 0xff000000 : (m === M.FIRE && R() < 0.25) ? (0xff000000 | ((R() * 30) << 8) | (200 + R() * 55)) >>> 0 : col[i];
  }
  for (const p of sim.proj) {
    const x = p.x | 0, y = p.y | 0;
    if (x >= 0 && x < w && y >= 0 && y < h) {
      buf32[y * w + x] = p.c;
      if (p.meteor) for (let k = 0; k < 4; k++) { const j = (y + ((k / 2) | 0)) * w + x + (k & 1); if (j < n) buf32[j] = 0xffe0f0ff; }
    }
  }
  sctx.putImageData(img, 0, 0);

  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const q = sim.quake * cs * 1.5;
  const sx = Math.round((R() - 0.5) * q), sy = Math.round((R() - 0.5) * q);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scan, rect.x + sx, rect.y + sy, rect.w, rect.h);
  ctx.save(); ctx.translate(rect.x + sx, rect.y + sy);
  ctx.fillStyle = gapPattern; ctx.fillRect(0, 0, rect.w, rect.h);
  ctx.restore();
  // floor line
  ctx.fillStyle = 'rgba(220,220,220,0.5)'; ctx.fillRect(rect.x, rect.y + rect.h + 2 * dpr, rect.w, dpr);

  // lightning
  for (const b of sim.bolts) {
    ctx.strokeStyle = `rgba(255,255,255,${b.frames / 8})`; ctx.lineWidth = cs * 0.6;
    ctx.beginPath();
    b.pts.forEach(([x, y], k) => { const px = rect.x + x * cs, py = rect.y + y * cs; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
  }

  // degradation: horizontal smears and torn bands
  const g = Math.max(sim.glitch, dir.D > 0.6 && dir.D < 0.9 ? (dir.D - 0.6) * 0.4 : 0);
  if (g > 0.02) {
    const bands = Math.ceil(g * 10);
    for (let k = 0; k < bands; k++) {
      if (R() > g + 0.1) continue;
      const y = rect.y + R() * rect.h, bh = cs * (1 + ((R() * 8) | 0));
      if (R() < 0.35) {
        const x = rect.x + R() * rect.w;    // stretch one column of cells sideways
        ctx.globalAlpha = 0.85;
        ctx.drawImage(canvas, x, y, cs, bh, x, y, (R() < 0.5 ? -1 : 1) * R() * W * 0.5, bh);
        ctx.globalAlpha = 1;
      } else {
        const dx = (R() - 0.5) * rect.w * 0.4 * g;
        ctx.drawImage(canvas, rect.x, y, rect.w, bh, rect.x + dx, y, rect.w * (1 + R() * g * 0.3), bh);
      }
    }
  }
  const bar = document.getElementById('bar');
  const bottomPad = innerWidth > 1000 ? 0 : bar.offsetHeight * dpr;
  if (!hideUI) overlay.draw(ctx, { W, H, dpr, sim, dir, rect, panel, bottomPad });
}

// ------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  dir.update(dt);
  if (!paused) { sim.step(); if (params.get('speed') === '2') sim.step(); }
  sim.glitch *= 0.97;
  render();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ controls
const ACTIONS = {
  rain:     { key: '1', label: 'RAIN',     run: () => { sim.rain = sim.rain > 0.2 ? 0 : 0.6; sim.log(sim.rain ? 'PRECIPITATION ON' : 'PRECIPITATION OFF'); } },
  fire:     { key: '2', label: 'FIRE',     run: x => { x === undefined ? sim.wildfire() : sim.lightning(x); }, at: true },
  quake:    { key: '3', label: 'QUAKE',    run: () => sim.shake(0.8) },
  eruption: { key: '4', label: 'ERUPT',    run: x => sim.eruption(x), at: true },
  meteor:   { key: '5', label: 'METEOR',   run: x => sim.meteor(x), at: true },
  tsunami:  { key: '6', label: 'SURGE',    run: () => sim.tsunami() },
  twister:  { key: '7', label: 'VORTEX',   run: x => sim.twister(x), at: true },
  growth:   { key: '8', label: 'GROWTH',   run: () => { sim.moss = !sim.moss; sim.growth = sim.moss ? 0.25 : 0.02; sim.log(sim.moss ? 'OVERGROWTH RULE ENABLED' : 'OVERGROWTH RULE DISABLED'); } },
  glitch:   { key: '9', label: 'DEGRADE',  run: () => { sim.glitch = 1; } },
  plate:    { key: '0', label: 'NEW PLATE', run: () => newPlate() },
  auto:     { key: 'a', label: 'AUTO',     run: () => { dir.on = !dir.on; sim.log(dir.on ? 'AUTOPILOT ENGAGED' : 'MANUAL CONTROL'); } },
  image:    { key: 'i', label: 'IMAGE…',   run: () => document.getElementById('imgIn').click() },
  audio:    { key: 'm', label: 'AUDIO…',   run: () => document.getElementById('audIn').click() },
  play:     { key: 'p', label: 'PLAY/PAUSE', run: () => A.toggle() },
  rec:      { key: 'r', label: 'REC',      run: () => toggleRec() },
  hide:     { key: 'h', label: 'HIDE UI',  run: () => { hideUI = !hideUI; document.getElementById('bar').classList.toggle('gone', hideUI); } },
};

function buildBar() {
  const bar = document.getElementById('bar');
  for (const [id, a] of Object.entries(ACTIONS)) {
    const b = document.createElement('button');
    b.textContent = `[${a.key.toUpperCase()}] ${a.label}`; b.dataset.id = id;
    b.onclick = e => { e.stopPropagation(); if (a.at) tool = id; a.run(); syncBar(); };
    bar.appendChild(b);
  }
  syncBar();
}
function syncBar() {
  document.querySelectorAll('#bar button').forEach(b => {
    const id = b.dataset.id;
    b.classList.toggle('on', id === tool || (id === 'auto' && dir.on) || (id === 'growth' && sim.moss) || (id === 'rain' && sim.rain > 0.2) || (id === 'rec' && !!rec));
  });
}

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey) return;
  if (e.key === ' ') { paused = !paused; e.preventDefault(); return; }
  for (const [id, a] of Object.entries(ACTIONS)) if (e.key.toLowerCase() === a.key) { if (a.at) tool = id; a.run(); syncBar(); }
});

canvas.addEventListener('pointerdown', e => {
  const gx = ((e.clientX * dpr - rect.x) / cs) | 0;
  if (gx < 0 || gx >= sim.w) return;
  ACTIONS[tool].run(gx);
});

document.getElementById('imgIn').onchange = e => addImages(e.target.files);
document.getElementById('audIn').onchange = e => { if (e.target.files[0]) { A.load(e.target.files[0]); dir.restart(); newPlate(); } };
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => {
  e.preventDefault();
  const files = [...e.dataTransfer.files];
  const aud = files.find(f => f.type.startsWith('audio/'));
  if (aud) { A.load(aud); dir.restart(); }
  addImages(files);
  if (aud && !files.some(f => f.type.startsWith('image/'))) newPlate();
  hideIntro();
});

// ------------------------------------------------------------------ recording
let rec = null, chunks = [];
function toggleRec() {
  if (rec) { rec.stop(); return; }
  const stream = canvas.captureStream(60);
  if (A.dest) A.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
  rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16e6 });
  chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type }));
    a.download = `forecast-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`; a.click();
    rec = null; syncBar();
  };
  rec.start(500); sim.log('RECORDING');
}

// ------------------------------------------------------------------ intro
function hideIntro() { document.getElementById('intro').classList.add('gone'); }
document.getElementById('intro').addEventListener('click', e => {
  const t = e.target.dataset.act;
  if (t === 'audio') document.getElementById('audIn').click();
  if (t === 'image') document.getElementById('imgIn').click();
  hideIntro();
});
if (params.has('nointro')) hideIntro();

// ------------------------------------------------------------------ boot
layout();
dir = new Director(sim, { newPlate });
buildBar();
layout();
newPlate();
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 200); });
if (params.has('phase')) dir.t0 -= +params.get('phase') * 240 * 1000;   // jump ahead for testing
requestAnimationFrame(frame);
window.DIS.app = { get sim() { return sim; }, get dir() { return dir; }, newPlate };
})();
