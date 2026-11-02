/* The forecasting program's interface: readouts, log, dotted grid and the
 * "scenario" panel. Its labels drift from measurement to devotion as the
 * forecast degrades (director progress D). */
(function () {
'use strict';
const R = Math.random;

const READOUTS = [
  ['PRECIP_RATE_MM/H',     'RAIN AS ANSWER'],
  ['WIND_VECTOR_KT',       'WIND WITHOUT NAME'],
  ['SEISMIC_AMPLITUDE',    'THE FLOOR KNEELS'],
  ['THERMAL_INDEX',        'HEAT, FORGIVEN'],
  ['CANOPY_COVER_PCT',     'GREEN REMEMBERS'],
  ['STRUCT_INTEGRITY',     'WHAT HOLDS, HOLDS'],
  ['AIRBORNE_MASS',        'DUST IN ORBIT'],
  ['MODEL_CONFIDENCE',     'FAITH'],
];
const GLYPHS = '#%&?*/\\|+=~:;';

function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; }

// Swap characters from a to b as p goes 0 -> 1, with noise at the boundary.
function corrupt(a, b, p, seed) {
  if (p <= 0) return a; if (p >= 1) return b;
  const L = Math.max(a.length, b.length); let s = '';
  for (let j = 0; j < L; j++) {
    const h = hash(j * 131 + seed * 7);
    if (Math.abs(h - p) < 0.06 && R() < 0.5) s += GLYPHS[(R() * GLYPHS.length) | 0];
    else s += (h < p ? b[j] : a[j]) || ' ';
  }
  return s;
}

class Overlay {
  constructor() { this.hist = { rain: [], quake: [], heat: [] }; this.phaseT = performance.now(); this.lastPhase = -1; }

  draw(ctx, st) {
    const { W, H, dpr, sim, dir, rect, panel } = st;
    const D = dir.D, fs = Math.round(11 * dpr), lh = Math.round(fs * 1.25);
    const ink = 'rgba(222,222,212,0.9)', dim = 'rgba(222,222,212,0.35)';
    ctx.save();
    ctx.font = `${fs}px "Courier New", Courier, monospace`;
    ctx.textBaseline = 'top';

    // dotted measurement grid
    const step = Math.round(48 * dpr);
    ctx.fillStyle = 'rgba(200,200,200,0.22)';
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) ctx.fillRect(x | 0, y | 0, dpr, dpr);
    // ticks down the left edge of the field
    ctx.fillStyle = dim;
    for (let y = rect.y; y < rect.y + rect.h; y += Math.round(52 * dpr)) ctx.fillRect(rect.x - 14 * dpr, y, 10 * dpr, dpr);

    // history for diagrams
    const hs = this.hist;
    hs.rain.push(sim.rain + (sim.counts[4] / (sim.w * sim.h)) * 2); hs.quake.push(sim.quake); hs.heat.push(sim.counts[6] / 400);
    for (const k in hs) if (hs[k].length > 240) hs[k].shift();

    // readouts
    const c = sim.counts, N = sim.w * sim.h;
    const vals = [
      (sim.rain * 84.3 + c[4] / N * 40).toFixed(2),
      (sim.wind * 60).toFixed(1),
      (sim.quake * 7.4).toFixed(3),
      (c[6] / 25 + c[8] / 10).toFixed(1),
      ((c[5] + c[11]) / N * 100).toFixed(2),
      (sim.heldCount / sim.heldStart * 100).toFixed(1),
      String(sim.proj.length),
      (Math.max(0, 1 - D * 1.15) * 100).toFixed(1) + '%',
    ];
    let x0 = Math.round(18 * dpr), y0 = Math.round(16 * dpr);
    if (panel) { x0 = panel.x; }
    for (let i = 0; i < READOUTS.length; i++) {
      const p = Math.max(0, Math.min(1, (D - 0.5) / 0.3 - i * 0.05));
      const label = corrupt(READOUTS[i][0], READOUTS[i][1], p, i + 1).padEnd(20, ' ');
      let v = vals[i];
      if (p > 0.6) v = p >= 1 ? (D > 0.84 ? '' : '·'.repeat(v.length)) : v.replace(/\d/g, d => R() < p ? '·' : d);
      ctx.fillStyle = ink; ctx.fillText(label, x0, y0 + i * lh);
      ctx.fillStyle = dim; ctx.fillText(v, x0 + 21 * fs * 0.6, y0 + i * lh);
    }

    // scenario panel, then signal routing and the transport under it
    const A = window.DIS.audio;
    let ty;
    if (panel) {
      const boxY = panel.y + lh * 10, boxH = Math.min(panel.h * 0.48, panel.w * 0.66);
      this.panel(ctx, st, fs, lh, ink, dim, boxY, boxH);
      const my = this.meters(ctx, st, panel.x, boxY + boxH + lh * 1.2, panel.w, fs, lh, ink, dim);
      this.drawTransport(ctx, st, panel.x, my + lh * 1.6, panel.w, Math.round(44 * dpr), fs, lh, ink, dim);
    }

    // status line + log, bottom left
    const t = (performance.now() - dir.t0) / 1000;
    const tc = `T+${String((t / 60) | 0).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
    const status = [
      `FORECAST/ENV  SCN ${String(dir.scenario).padStart(3, '0')}  PHASE ${dir.current.id}  ` + (W > 1000 * dpr ? `FRAME ${String(sim.frame).padStart(6, '0')}  ` : '') + tc,
      `GRID ${sim.w}x${sim.h}  HELD ${sim.heldCount}  PART ${sim.proj.length}  ${A.el ? 'AUDIO ' + A.name.toUpperCase().slice(0, 32) + (A.playing ? '' : ' [PAUSED]') : 'NO AUDIO'}  ${dir.on ? 'AUTO' : 'MANUAL'}`,
    ];
    const by = H - (st.bottomPad || 0) - lh * 2 - Math.round(14 * dpr);
    ctx.fillStyle = dim; status.forEach((s, k) => ctx.fillText(s, Math.round(18 * dpr), by + k * lh));
    let logBase = by;
    if (!panel) {   // narrow screens: transport sits above the status lines
      const th = Math.round(26 * dpr), x = Math.round(18 * dpr);
      ty = by - th - lh * 0.8;
      this.drawTransport(ctx, st, x, ty, W - x * 2, th, fs, lh, ink, dim);
      logBase = ty - lh * 1.4;
    }
    const now = performance.now();
    (W > 1000 * dpr ? dir.lines : dir.lines.slice(-4)).forEach((l, k, arr) => {
      const age = (now - l.t) / 1000;
      const n = Math.min(l.text.length, (age * 28) | 0);
      ctx.fillStyle = `rgba(222,222,212,${Math.max(0.25, 1 - age / 25)})`;
      ctx.fillText('> ' + l.text.slice(0, n) + (n < l.text.length ? '_' : ''), Math.round(18 * dpr), logBase - (arr.length - k + 0.5) * lh);
    });
    for (const e of sim.events) dir.say(e);
    sim.events.length = 0;
    ctx.restore();
  }

  panel(ctx, st, fs, lh, ink, dim, boxY, boxH) {
    const { panel: P, dir, dpr } = st;
    const ph = dir.phase;
    if (ph !== this.lastPhase) { this.lastPhase = ph; this.phaseT = performance.now(); }
    const age = (performance.now() - this.phaseT) / 1000;
    const bx = P.x, by = boxY, bw = P.w, bh = boxH;
    ctx.strokeStyle = 'rgba(222,222,212,0.55)'; ctx.lineWidth = dpr;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
    ctx.fillStyle = ink;
    ctx.fillText(`SCENARIO CONSIDERATION ${String(dir.scenario).padStart(3, '0')}  /  ${dir.current.id}`, bx + 6 * dpr, by + 6 * dpr);
    if (age < 0.6) {   // brief noise burst when the scenario changes
      ctx.fillStyle = dim;
      for (let y = by + lh * 2; y < by + bh - lh; y += lh * 0.8) {
        let s = ''; for (let k = 0; k < bw / (fs * 0.6) - 2; k++) s += GLYPHS[(R() * GLYPHS.length) | 0];
        ctx.fillText(s, bx + 6 * dpr, y);
      }
      return;
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by + lh * 1.5, bw, bh - lh * 1.5); ctx.clip();
    const cx = bx + bw / 2, cy = by + bh / 2, u = bw / 100;
    ctx.strokeStyle = 'rgba(222,222,212,0.8)'; ctx.fillStyle = ink;
    const D = DIAG[dir.current.diag] || DIAG.planets;
    D.call(this, ctx, { cx, cy, u, bx, by, bw, bh, age, fs, lh, dpr, sim: st.sim, hist: this.hist });
    ctx.restore();
  }

  // Band meters drawn as sim-style tiles, each with the action it drives now.
  meters(ctx, st, x, y, w, fs, lh, ink, dim) {
    const A = window.DIS.audio, dir = st.dir, dpr = st.dpr;
    const ph = dir.current, routes = dir.routes();
    ctx.fillStyle = dim;
    ctx.fillText(dir.on ? 'SIGNAL ROUTING  /  FREQUENCY → ACTION' : 'SIGNAL ROUTING  /  MANUAL (KICK → COLLAPSE ONLY)', x, y);
    const cell = Math.round(5 * dpr), gap = Math.max(1, Math.round(dpr)), n = 18;
    const cx0 = x + fs * 0.6 * 6, nx = cx0 + n * (cell + gap) + fs * 0.6;
    const loudName = !dir.on ? '—' : ph.on.SWELL ? 'SWELL → SURGE' : ph.W.spin ? 'VORTEX LIFT' : ph.W.calm ? 'QUIET → GROWTH' : ph.on.DROP ? 'DROP → METEOR' : '—';
    const glitchOn = dir.on && (ph.W.glitch || dir.D > 0.6);
    const rows = A.bands.map((b, i) => ({ key: b.id, level: b.level, flash: b.flash, name: routes[i].name, active: routes[i].active }));
    rows.push({ key: 'LOUD', level: A.loudFast, flash: Math.max(A.drop, A.swell), name: loudName, active: loudName !== '—' });
    rows.push({ key: 'FLUX', level: A.flux, flash: 0, name: glitchOn ? 'DEGRADE' : '—', active: glitchOn });
    rows.forEach((r, k) => {
      const ry = y + lh * (1.3 + k);
      ctx.fillStyle = r.active ? ink : dim; ctx.fillText(r.key, x, ry);
      const lit = Math.round(Math.min(1, r.level) * n);
      for (let c = 0; c < n; c++) {
        ctx.fillStyle = c < lit ? (r.flash > 0.5 ? '#ffffff' : r.active ? 'rgba(222,222,212,0.85)' : 'rgba(222,222,212,0.4)') : 'rgba(222,222,212,0.1)';
        ctx.fillRect(cx0 + c * (cell + gap), ry + (lh - cell) / 2 - gap, cell, cell);
      }
      ctx.fillStyle = r.flash > 0.5 && r.active ? '#ffffff' : r.active ? ink : dim;
      ctx.fillText((r.flash > 0.5 && r.active ? '[' + r.name + ']' : r.name), nx, ry);
    });
    return y + lh * (1.3 + rows.length);
  }

  // Waveform transport: played part bright, phase boundaries marked, seekable.
  drawTransport(ctx, st, x, y, w, h, fs, lh, ink, dim) {
    const A = window.DIS.audio, dir = st.dir, dpr = st.dpr;
    this.transport = { x, y: y - lh, w, h: h + lh * 2.2 };
    const fmt = t => `${String((t / 60) | 0).padStart(2, '0')}:${String((t % 60) | 0).padStart(2, '0')}`;
    const mid = y + h / 2;
    if (!A.el) {
      ctx.fillStyle = dim;
      ctx.fillText('NO SIGNAL  /  [M] LOAD AUDIO OR CLICK HERE', x, y - lh);
      ctx.setLineDash([2 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(222,222,212,0.3)';
      ctx.beginPath(); ctx.moveTo(x, mid); ctx.lineTo(x + w, mid); ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    const L = A.length || 0, p = L ? A.time / L : 0;
    ctx.fillStyle = ink;
    const title = 'SIGNAL  ' + A.name.toUpperCase();
    const time = `${A.playing ? '▶' : 'II'} ${fmt(A.time)} / ${L ? fmt(L) : '--:--'}`;
    const maxChars = Math.max(4, ((w - time.length * fs * 0.6) / (fs * 0.6)) | 0) - 2;
    ctx.fillText(title.slice(0, maxChars), x, y - lh);
    ctx.fillStyle = dim; ctx.fillText(time, x + w - time.length * fs * 0.6, y - lh);

    const cell = Math.max(2, Math.round(3 * dpr)), gap = Math.max(1, Math.round(dpr) - 0);
    const cols = Math.floor(w / (cell + gap)), rowsHalf = Math.max(1, Math.floor(h / 2 / (cell + gap)));
    if (A.peaks) {
      for (let c = 0; c < cols; c++) {
        const k = Math.floor(c / cols * A.peaks.length);
        const a = Math.max(1, Math.round(Math.pow(A.peaks[k], 0.8) * rowsHalf));
        ctx.fillStyle = c / cols <= p ? 'rgba(222,222,212,0.9)' : 'rgba(222,222,212,0.25)';
        const px = x + c * (cell + gap);
        for (let r = 0; r < a; r++) {
          ctx.fillRect(px, mid - (r + 1) * (cell + gap) + gap, cell, cell);
          ctx.fillRect(px, mid + r * (cell + gap) + gap, cell, cell);
        }
      }
    } else {
      ctx.fillStyle = dim; ctx.fillText('DECODING SIGNAL…', x, mid - lh / 2);
    }
    // phase boundaries
    const bounds = dir.bounds;
    ctx.font = `${Math.round(fs * 0.8)}px "Courier New", Courier, monospace`;
    let lastLabel = -1e9;
    for (let k = 0; k < bounds.length; k++) {
      const bx = Math.round(x + bounds[k] * w);
      ctx.fillStyle = k === dir.phase ? 'rgba(255,255,255,0.9)' : 'rgba(222,222,212,0.35)';
      for (let yy = y - 2 * dpr; yy < y + h + 2 * dpr; yy += 3 * dpr) ctx.fillRect(bx, yy, Math.max(1, dpr / 2), dpr);
      const id = window.DIS.PHASES[k].id.slice(0, 5);
      if (bx - lastLabel > id.length * fs * 0.5 + 4 * dpr) { ctx.fillText(id, bx + 2 * dpr, y + h + 3 * dpr); lastLabel = bx; }
    }
    ctx.font = `${fs}px "Courier New", Courier, monospace`;
    // playhead
    const hx = Math.round(x + p * w);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx, y - 3 * dpr, Math.max(1, dpr), h + 6 * dpr);
    ctx.fillRect(hx - 2 * dpr, y - 5 * dpr, 5 * dpr, 3 * dpr);
  }

}

function label(ctx, s, x, y) { ctx.fillText(s, x, y); }
function series(ctx, arr, x, y, w, h, scale) {
  ctx.beginPath();
  arr.forEach((v, i) => { const px = x + i / 240 * w, py = y + h / 2 - v * scale * h / 2; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke();
}

const DIAG = {
  planets(ctx, g) {
    const { u, bx, by, bw, bh, age } = g;
    const sizes = [26, 13, 8, 5, 3];
    let x = bx + bw - 6 * u;
    const grow = Math.min(1, age / 8);
    ctx.fillStyle = 'rgba(205,205,205,0.9)';
    sizes.forEach((s, k) => {
      const r = s * u * (k === 0 ? 0.4 + grow * 0.6 : 1);
      x -= r + 6 * u;
      ctx.beginPath(); ctx.arc(x, by + bh * 0.33, r, 0, 7); ctx.fill();
      x -= r;
    });
    ctx.setLineDash([2 * g.dpr, 3 * g.dpr]); ctx.beginPath(); ctx.moveTo(bx, by + bh * 0.62); ctx.lineTo(bx + bw, by + bh * 0.62); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(222,222,212,0.7)';
    const chars = '+=-x#';
    for (let k = 0; k < 140 * grow; k++) {
      const cxk = bx + bw * (0.1 + hash(k * 3) * 0.8), cyk = by + bh * (0.7 + hash(k * 5) * 0.18);
      ctx.fillText(chars[(hash(k * 11) * 5) | 0], cxk, cyk);
    }
    label(ctx, 'ORBITAL SPACING / SCALE UNVERIFIED', bx + 4 * u, by + bh - g.lh * 1.4);
  },
  rain(ctx, g) {
    const { bx, by, bw, bh, hist } = g;
    const n = 48, a = hist.rain.slice(-n);
    a.forEach((v, i) => {
      const hh = Math.min(1, v) * bh * 0.6;
      ctx.fillRect(bx + 8 + i * (bw - 16) / n, by + bh * 0.85 - hh, (bw - 16) / n - 2, hh);
    });
    label(ctx, 'PRECIPITATION  (ROLLING)', bx + 8, by + bh * 0.88);
  },
  heat(ctx, g) {
    const { cx, cy, u, age } = g;
    for (let k = 1; k <= 7; k++) {
      ctx.globalAlpha = 1 - k / 8;
      ctx.beginPath(); ctx.ellipse(cx, cy, (k * 6 + (age * 4) % 6) * u, (k * 4 + (age * 3) % 4) * u, 0.3, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#e02020'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
    ctx.fillStyle = 'rgba(222,222,212,0.9)';
    label(ctx, 'ISOTHERM SPREAD', cx - 40 * u, cy + 34 * u); label(ctx, '(ORIGIN)', cx + 4 * u, cy - 6 * u);
  },
  seismo(ctx, g) {
    const { bx, by, bw, bh, hist } = g;
    for (let k = 0; k < 3; k++) {
      const noisy = hist.quake.map(v => (v + 0.03) * (Math.random() - 0.5) * 2.2);
      series(ctx, noisy, bx + 6, by + bh * (0.25 + k * 0.22), bw - 12, bh * 0.2, 1);
    }
    label(ctx, 'N-S   E-W   VERT', bx + 8, by + bh * 0.9);
  },
  volcano(ctx, g) {
    const { cx, cy, u, age } = g;
    ctx.beginPath(); ctx.moveTo(cx - 40 * u, cy + 30 * u); ctx.lineTo(cx - 5 * u, cy - 10 * u); ctx.lineTo(cx + 5 * u, cy - 10 * u); ctx.lineTo(cx + 40 * u, cy + 30 * u); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy + 38 * u, 14 * u, 5 * u, 0, 0, 7); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cx, cy + 33 * u); ctx.lineTo(cx, cy - 10 * u); ctx.stroke(); ctx.setLineDash([]);
    for (let k = 0; k < 30; k++) {
      const t = (age * 0.3 + k / 30) % 1;
      ctx.fillRect(cx + Math.sin(k * 7.1) * t * 18 * u, cy - 12 * u - t * 30 * u, 2, 2);
    }
    label(ctx, 'ASH COLUMN', cx + 12 * u, cy - 36 * u); label(ctx, 'VENT', cx + 8 * u, cy - 12 * u); label(ctx, 'CHAMBER', cx + 16 * u, cy + 36 * u);
  },
  comet(ctx, g) {
    const { cx, cy, u, age } = g;
    const nx = cx - 18 * u, ny = cy;
    for (let k = 0; k < 160; k++) {
      const a = hash(k * 7) * 6.28, r = hash(k * 13) * 9 * u;
      ctx.fillRect(nx + Math.cos(a) * r, ny + Math.sin(a) * r, 1.5, 1.5);
    }
    ctx.beginPath(); ctx.arc(nx, ny, 2.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(nx + 9 * u, ny + 1 * u); ctx.lineTo(nx + 52 * u, ny + 1 * u); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nx + 9 * u, ny + 3 * u); ctx.quadraticCurveTo(nx + 30 * u, ny + 6 * u, nx + 48 * u, ny + 14 * u); ctx.stroke();
    label(ctx, 'Nucleus', nx + 4 * u, ny - 6 * u); label(ctx, '(Coma)', nx - 22 * u, ny - 14 * u);
    label(ctx, 'Ion tail →', nx + 36 * u, ny - 4 * u); label(ctx, 'Dust tail →', nx + 34 * u, ny + 16 * u);
    ctx.globalAlpha = 0.5;
    for (let k = 0; k < 90; k++) ctx.fillText('.', g.bx + hash(k) * g.bw, g.by + g.bh * (0.15 + hash(k * 3) * 0.75) + Math.sin(age + k) * 2);
    ctx.globalAlpha = 1;
  },
  wave(ctx, g) {
    const { bx, by, bw, bh, age } = g;
    for (let k = 0; k < 6; k++) {
      ctx.globalAlpha = 1 - k * 0.14;
      ctx.beginPath();
      for (let x = 0; x <= bw; x += 3) {
        const y = by + bh * (0.35 + k * 0.08) + Math.sin(x * 0.03 - age * 2 + k) * bh * 0.06 * Math.exp(-Math.pow((x / bw - ((age * 0.15) % 1)) * 3, 2)) * 3;
        x ? ctx.lineTo(bx + x, y) : ctx.moveTo(bx + x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; label(ctx, 'WAVE PERIOD / RUN-UP', bx + 8, by + bh * 0.88);
  },
  spiral(ctx, g) {
    const { cx, cy, u, age } = g;
    for (let k = 0; k < 220; k++) {
      const t = k / 220, a = t * 26 + age * 3, r = t * 40 * u;
      ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.45 - (1 - t) * 30 * u, 2, 2);
    }
    label(ctx, 'ROTATION (CCW)', cx - 20 * u, cy + 30 * u);
  },
  noise(ctx, g) {
    const { bx, by, bw, bh, fs, lh } = g;
    for (let y = by + lh * 2; y < by + bh; y += lh) {
      let s = ''; for (let k = 0; k < bw / (fs * 0.6) - 1; k++) s += Math.random() < 0.7 ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      ctx.fillText(s, bx + 4, y);
    }
  },
  growth(ctx, g) {
    const { cx, by, bh, u, age } = g;
    const depth = Math.min(9, 1 + age / 2.2);
    ctx.strokeStyle = 'rgba(120,220,110,0.85)';
    const br = (x, y, a, len, d) => {
      if (d > depth) return;
      const k = Math.min(1, depth - d);
      const x2 = x + Math.cos(a) * len * k, y2 = y + Math.sin(a) * len * k;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      br(x2, y2, a - 0.45 - hash(d * 31 + (x | 0)) * 0.2, len * 0.74, d + 1);
      br(x2, y2, a + 0.4 + hash(d * 17 + (y | 0)) * 0.2, len * 0.72, d + 1);
    };
    br(cx, by + bh * 0.92, -Math.PI / 2, 18 * u, 1);
    ctx.fillStyle = 'rgba(222,222,212,0.9)';
    label(ctx, 'OVERGROWTH  /  NOT PREDICTED', g.bx + 8, by + bh * 0.94);
  },
};

window.DIS = window.DIS || {};
window.DIS.Overlay = Overlay;
})();
