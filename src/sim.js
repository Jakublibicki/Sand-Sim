/* Falling-sand cellular automaton where every cell remembers the colour of the
 * image pixel it came from. Material is decided by that colour (see classify),
 * so a painting becomes a landscape that can burn, flood, crumble and regrow. */
(function () {
'use strict';

const M = { EMPTY: 0, STONE: 1, SAND: 2, EARTH: 3, WATER: 4, PLANT: 5, FIRE: 6,
            EMBER: 7, LAVA: 8, SMOKE: 9, STEAM: 10, MOSS: 11, ASH: 12 };
const NAMES = ['VOID', 'STONE', 'SAND', 'EARTH', 'WATER', 'FLORA', 'FIRE',
               'EMBER', 'LAVA', 'SMOKE', 'STEAM', 'MOSS', 'ASH'];

// Density decides who may sink through whom. 0-1 gases, 3-4 liquids, 5+ solids.
const DENS = new Uint8Array(16);
DENS[M.SMOKE] = 1; DENS[M.STEAM] = 1; DENS[M.FIRE] = 1;
DENS[M.WATER] = 3; DENS[M.LAVA] = 4;
DENS[M.PLANT] = 5; DENS[M.MOSS] = 5; DENS[M.ASH] = 5;
DENS[M.SAND] = 6; DENS[M.EMBER] = 6; DENS[M.EARTH] = 7; DENS[M.STONE] = 8;

const R = Math.random;
const rgb = (r, g, b) => ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
const grey = v => rgb(v, v, v);

const C = {
  water: () => rgb(45 + R() * 50, 135 + R() * 75, 180 + R() * 65),
  fire:  () => R() < 0.86 ? rgb(215 + R() * 40, R() * 30, R() * 22) : rgb(255, 70 + R() * 70, 20 + R() * 30),
  lava:  () => rgb(240 + R() * 15, 50 + R() * 90, R() * 20),
  smoke: () => grey(50 + R() * 45),
  steam: () => { const v = 150 + R() * 60; return rgb(v, v + 6, v + 14); },
  plant: () => rgb(25 + R() * 45, 110 + R() * 90, 35 + R() * 40),
  moss:  () => rgb(40 + R() * 45, 135 + R() * 100, 35 + R() * 35),
  ash:   () => grey(85 + R() * 60),
  stone: () => { const v = 45 + R() * 35; return rgb(v + 10, v, v - 4); },
};

// Pull an existing colour toward green, so regrowth keeps a trace of what was there.
function toGreen(c, a) {
  const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  return rgb(r * (1 - a) + 35 * a, g * (1 - a) + (140 + R() * 90) * a, b * (1 - a) + 40 * a);
}
function jitter(c, n) {
  const k = (R() - 0.5) * n;
  return rgb((c & 255) + k, ((c >> 8) & 255) + k, ((c >> 16) & 255) + k);
}

/* Colour -> material. This is the whole "trick": hue decides behaviour. */
function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  if (v < 0.14) return M.EMPTY;
  if (s < 0.2) return v > 0.62 ? M.SAND : v > 0.34 ? M.STONE : M.EARTH;
  const d = mx - mn;
  let h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 16 || h >= 335) return (s > 0.45 && v > 0.35) ? M.EMBER : M.EARTH;
  if (h < 48) return (s > 0.7 && v > 0.85) ? M.EMBER : M.EARTH;
  if (h < 70) return M.SAND;
  if (h < 165) return M.PLANT;
  if (h < 255) return M.WATER;
  return M.STONE;
}

class Sim {
  constructor(w, h) {
    this.resize(w, h);
    // Environment knobs (the director and the buttons turn these).
    this.rain = 0; this.wind = 0; this.heat = 0; this.growth = 0.01;
    this.erosion = 0.0025; this.release = 0; this.pulse = 0; this.moss = false;
    this.quake = 0; this.glitch = 0; this.fireFloor = null;
    this.erupt = { frames: 0, x: 0, power: 1 };
    this.wave = { frames: 0, dir: 1, len: 1 };
    this.twist = { frames: 0, x: 0, vx: 0, power: 1 };
    this.bolts = [];
    this.density = 1;       // fraction of image pixels kept
    this.events = [];       // log hook: the UI reads and clears this
  }

  resize(w, h) {
    this.w = w; this.h = h; const n = w * h;
    this.mat = new Uint8Array(n); this.col = new Uint32Array(n);
    this.life = new Int16Array(n); this.held = new Uint8Array(n);
    this.stamp = new Uint8Array(n);
    this.proj = []; this.frame = 0;
    this.counts = new Int32Array(16); this.heldCount = 0; this.heldStart = 1;
  }

  clear() {
    this.mat.fill(0); this.held.fill(0); this.life.fill(0); this.proj = [];
    this.moss = false; this.quake = 0; this.erupt.frames = 0;
    this.wave.frames = 0; this.twist.frames = 0;
  }

  /* Write an RGBA buffer (gw x gh) into the grid at (ox, oy). Every visible
   * pixel becomes a "held" cell: pinned in place until erosion or a disaster
   * lets go of it. */
  loadPixels(data, gw, gh, ox, oy) {
    const { w, h } = this;
    let held = 0;
    for (let y = 0; y < gh; y++) {
      const gy = oy + y; if (gy < 0 || gy >= h) continue;
      for (let x = 0; x < gw; x++) {
        const gx = ox + x; if (gx < 0 || gx >= w) continue;
        const p = (y * gw + x) * 4;
        if (data[p + 3] < 128) continue;
        const k = (R() - 0.5) * 18;   // film grain
        const r = Math.max(0, Math.min(255, data[p] + k));
        const g = Math.max(0, Math.min(255, data[p + 1] + k));
        const b = Math.max(0, Math.min(255, data[p + 2] + k));
        const m = classify(r, g, b);
        if (!m) continue;
        // Thin the image out: greys turn to speckle, saturated colour stays dense.
        const mx = Math.max(r, g, b), sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
        if (R() > this.density * (0.55 + 0.45 * Math.min(1, sat * 2.2))) continue;
        const i = gy * w + gx;
        this.mat[i] = m; this.col[i] = rgb(r, g, b); this.held[i] = 1;
        this.life[i] = m === M.LAVA ? 600 : 0;
        held++;
      }
    }
    this.heldStart = Math.max(1, held);
  }

  set(i, m, c, life = 0, held = 0) {
    this.mat[i] = m; this.col[i] = c; this.life[i] = life; this.held[i] = held;
    this.stamp[i] = this.t;
  }

  swap(a, b) {
    const { mat, col, life, held, stamp } = this;
    let t = mat[a]; mat[a] = mat[b]; mat[b] = t;
    t = col[a]; col[a] = col[b]; col[b] = t;
    t = life[a]; life[a] = life[b]; life[b] = t;
    t = held[a]; held[a] = held[b]; held[b] = t;
    stamp[a] = stamp[b] = this.t;
  }

  nb(x, y) {
    const nx = x + ((R() * 3) | 0) - 1, ny = y + ((R() * 3) | 0) - 1;
    if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) return -1;
    return ny * this.w + nx;
  }

  surfaceY(x, minDens = 2) {
    const { w, h, mat } = this;
    x = Math.max(0, Math.min(w - 1, x | 0));
    for (let y = 0; y < h; y++) if (DENS[mat[y * w + x]] >= minDens) return y;
    return h;
  }

  // ---------------------------------------------------------------- main step
  step() {
    const { w, h, mat, held, stamp } = this;
    this.frame++;
    this.t = (this.frame % 254) + 1;
    const t = this.t;

    this.environment();

    for (let y = h - 1; y >= 0; y--) {
      const ltr = (this.frame + y) & 1, row = y * w;
      for (let k = 0; k < w; k++) {
        const x = ltr ? k : w - 1 - k, i = row + x, m = mat[i];
        if (m === 0 || stamp[i] === t) continue;
        if (held[i]) { this.heldCell(x, y, i, m); continue; }
        switch (m) {
          case M.WATER: this.water(x, y, i); break;
          case M.LAVA: this.lava(x, y, i); break;
          case M.FIRE: this.fire(x, y, i); break;
          case M.SMOKE: case M.STEAM: this.gas(x, y, i, m); break;
          default: this.react(x, y, i, m); if (mat[i] === m) this.powder(x, y, i, m);
        }
      }
    }
    this.projectiles();
    if (this.frame % 15 === 0) this.count();
  }

  count() {
    const c = this.counts; c.fill(0); let hc = 0;
    const { mat, held } = this;
    for (let i = 0; i < mat.length; i++) { c[mat[i]]++; hc += held[i]; }
    this.heldCount = hc;
  }

  // Interactions that happen whether or not a cell is pinned.
  react(x, y, i, m) {
    const { mat } = this;
    if (m === M.EMBER) {
      if (this.heat > 0 && R() < this.heat * 0.03) {
        const n = this.nb(x, y);
        if (n >= 0 && (mat[n] === M.PLANT || mat[n] === M.MOSS)) this.set(n, M.FIRE, C.fire(), 20 + R() * 40);
      }
      if (R() < this.heat * 0.0015) this.set(i, M.FIRE, C.fire(), 30 + R() * 60);
    } else if ((m === M.PLANT || m === M.MOSS) && this.moss && R() < 0.03) {
      this.overgrow(x, y, i);
    }
  }

  heldCell(x, y, i, m) {
    const { w, h, mat, held } = this;
    if (m === M.WATER) { if (R() < 0.08) this.waterReact(x, y, i); if (mat[i] !== m) return; }
    else if (m === M.LAVA) { this.lava(x, y, i); return; }
    else { this.react(x, y, i, m); if (mat[i] !== m) return; }
    let p = this.release;
    const below = y + 1 < h ? mat[i + w] : 255;
    if (below !== 255 && DENS[below] <= 1) p += m === M.WATER ? 0.012 : this.erosion;
    if (p > 0 && R() < p) held[i] = 0;
  }

  powder(x, y, i, m) {
    const { w, h, mat } = this;
    if (y + 1 >= h) return;
    const d = DENS[m];
    if (this.wind !== 0 && R() < Math.abs(this.wind) * 0.35) {
      const dx = this.wind > 0 ? 1 : -1, nx = x + dx;
      if (nx >= 0 && nx < w && mat[i + dx] === 0) { this.swap(i, i + dx); return; }
    }
    const b = i + w;
    if (DENS[mat[b]] < d && (mat[b] === 0 || DENS[mat[b]] <= 1 || R() < 0.5)) {
      if (mat[b] === 0 && y + 2 < h && mat[b + w] === 0) this.swap(i, b + w);
      else this.swap(i, b);
      return;
    }
    const slide = m === M.STONE ? 0.25 : (m === M.PLANT || m === M.MOSS) ? 0.5 : 1;
    if (R() < slide) {
      const dx = R() < 0.5 ? -1 : 1;
      if (x + dx >= 0 && x + dx < w && DENS[mat[b + dx]] < d && DENS[mat[i + dx]] < d) { this.swap(i, b + dx); return; }
      if (x - dx >= 0 && x - dx < w && DENS[mat[b - dx]] < d && DENS[mat[i - dx]] < d) { this.swap(i, b - dx); return; }
    }
  }

  waterReact(x, y, i) {
    const n = this.nb(x, y); if (n < 0) return;
    const nm = this.mat[n];
    if (nm === M.FIRE) { this.set(n, M.STEAM, C.steam(), 40 + R() * 60); }
    else if (nm === M.LAVA) { this.set(n, M.STONE, C.stone(), 0, 1); this.set(i, M.STEAM, C.steam(), 60 + R() * 60); }
    else if ((nm === M.PLANT || nm === M.MOSS) && R() < this.growth) {
      // Water feeds the plant next to it: the water cell becomes new growth.
      this.set(i, nm, jitter(this.col[n], 30), 0, 1);
    }
  }

  water(x, y, i) {
    const { w, h, mat } = this;
    if (R() < 0.15) { this.waterReact(x, y, i); if (mat[i] !== M.WATER) return; }
    if (y + 1 < h) {
      const b = i + w;
      if (DENS[mat[b]] < 3) {
        if (mat[b] === 0 && y + 2 < h && mat[b + w] === 0) this.swap(i, b + w); else this.swap(i, b);
        return;
      }
      const dx = R() < 0.5 ? -1 : 1;
      if (x + dx >= 0 && x + dx < w && mat[b + dx] === 0) { this.swap(i, b + dx); return; }
      if (x - dx >= 0 && x - dx < w && mat[b - dx] === 0) { this.swap(i, b - dx); return; }
    }
    let dir = R() < 0.5 ? -1 : 1;
    if (this.wind && R() < Math.abs(this.wind)) dir = this.wind > 0 ? 1 : -1;
    let last = 0;
    for (let k = 1; k <= 4; k++) {
      const nx = x + dir * k;
      if (nx < 0 || nx >= w || mat[i + dir * k] !== 0) break;
      last = k;
    }
    if (last) this.swap(i, i + dir * last);
  }

  lava(x, y, i) {
    const { w, h, mat, life } = this;
    if (--life[i] <= 0) { this.set(i, M.STONE, C.stone(), 0, 1); return; }
    const n = this.nb(x, y);
    if (n >= 0) {
      const nm = mat[n];
      if ((nm === M.PLANT || nm === M.MOSS || nm === M.EMBER) && R() < 0.3) this.set(n, M.FIRE, C.fire(), 30 + R() * 50);
      else if (nm === M.WATER) { this.set(n, M.STEAM, C.steam(), 60); this.set(i, M.STONE, C.stone(), 0, 1); return; }
      else if (nm === 0 && n < i - w + 2 && R() < 0.02) this.set(n, R() < 0.5 ? M.FIRE : M.SMOKE, R() < 0.5 ? C.fire() : C.smoke(), 30 + R() * 40);
    }
    if (this.held[i] || R() < 0.55) return;
    if (y + 1 < h) {
      const b = i + w;
      if (DENS[mat[b]] < 4 && mat[b] !== M.WATER) { this.swap(i, b); return; }
      const dx = R() < 0.5 ? -1 : 1;
      if (x + dx >= 0 && x + dx < w && mat[b + dx] === 0) { this.swap(i, b + dx); return; }
    }
    const dx = R() < 0.5 ? -1 : 1;
    if (x + dx >= 0 && x + dx < w && mat[i + dx] === 0) this.swap(i, i + dx);
  }

  fire(x, y, i) {
    const { w, mat, life } = this;
    if (--life[i] <= 0) {
      const r = R();
      if (r < 0.22) this.set(i, M.SMOKE, C.smoke(), 30 + R() * 50);
      else if (r < 0.3) this.set(i, M.ASH, C.ash());
      else mat[i] = 0;
      return;
    }
    for (let k = 0; k < 2; k++) {
      const n = this.nb(x, y); if (n < 0) continue;
      const nm = mat[n];
      if ((nm === M.PLANT && R() < 0.45) || (nm === M.MOSS && R() < 0.12) || (nm === M.EMBER && R() < 0.3)) {
        this.set(n, M.FIRE, C.fire(), 20 + R() * 45);
      } else if (nm === M.WATER) { this.set(i, M.STEAM, C.steam(), 30 + R() * 40); return; }
    }
    if (y > 0) {
      const r = R();
      let dx = r < 0.5 ? 0 : r < 0.75 ? -1 : 1;
      if (this.wind && R() < Math.abs(this.wind)) dx = this.wind > 0 ? 1 : -1;
      const nx = x + dx;
      if (R() < 0.7 && nx >= 0 && nx < w && mat[i - w + dx] === 0) { this.swap(i, i - w + dx); return; }
    }
    const dx = R() < 0.5 ? -1 : 1;
    if (x + dx >= 0 && x + dx < w && mat[i + dx] === 0 && R() < 0.3) this.swap(i, i + dx);
  }

  gas(x, y, i, m) {
    const { w, h, mat, life } = this;
    if (--life[i] <= 0) {
      // Steam near the top of the frame condenses back into rain.
      if (m === M.STEAM && y < h * 0.2 && R() < 0.35) this.set(i, M.WATER, C.water());
      else mat[i] = 0;
      return;
    }
    if (y === 0) return;
    let dx = ((R() * 3) | 0) - 1;
    if (this.wind && R() < Math.abs(this.wind) * 1.5) dx = this.wind > 0 ? 1 : -1;
    const nx = x + dx;
    if (nx >= 0 && nx < w && mat[i - w + dx] === 0 && R() < 0.8) { this.swap(i, i - w + dx); return; }
    if (nx >= 0 && nx < w && mat[i + dx] === 0) this.swap(i, i + dx);
  }

  // Late-stage rule ("overgrowth"): moss creeps over every surface.
  overgrow(x, y, i) {
    const { w, h, mat, col } = this;
    const n = this.nb(x, y); if (n < 0 || n === i) return;
    const nm = mat[n];
    if (nm === 0) {
      const nx = n % w, ny = (n / w) | 0;
      let solid = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const ax = nx + ox, ay = ny + oy;
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) { solid++; continue; }
        if (DENS[mat[ay * w + ax]] > 2) solid++;
      }
      if (solid >= 3) this.set(n, M.MOSS, C.moss(), 0, 1);
    } else if (nm === M.STONE || nm === M.EARTH || nm === M.ASH || nm === M.SAND || nm === M.EMBER) {
      if (R() < 0.5) { this.set(n, M.MOSS, toGreen(col[n], 0.75), 0, this.held[n]); }
    }
  }

  // ------------------------------------------------- forces and disasters
  environment() {
    const { w, h, mat } = this;
    // rain
    if (this.rain > 0) {
      const n = this.rain * w * 0.03;
      for (let k = 0; k < n; k++) {
        if (k + 1 > n && R() > n - k) break;
        const x = (R() * w) | 0;
        if (mat[x] === 0) this.set(x, M.WATER, C.water());
      }
    }
    // quake: release pins, shear rows sideways
    this.release = this.quake * 0.03 + this.pulse; this.pulse *= 0.85;
    if (this.quake > 0.02) {
      const bands = (this.quake * 4) | 0;
      for (let b = 0; b <= bands; b++) {
        if (R() > this.quake) continue;
        const y0 = (R() * h) | 0, bh = 1 + ((R() * 4) | 0);
        const s = (R() < 0.5 ? -1 : 1) * (1 + ((R() * this.quake * 3) | 0));
        for (let y = y0; y < Math.min(h, y0 + bh); y++) this.shiftRow(y, s);
      }
      this.quake *= 0.975;
    } else this.quake = 0;
    // eruption
    const e = this.erupt;
    if (e.frames > 0) {
      e.frames--;
      const sy = this.surfaceY(e.x, 5);
      const n = (3 + R() * 5) * e.power;
      for (let k = 0; k < n; k++) {
        const r = R();
        const m = r < 0.5 ? M.LAVA : r < 0.78 ? M.FIRE : M.ASH;
        const c = m === M.LAVA ? C.lava() : m === M.FIRE ? C.fire() : C.ash();
        this.launch(e.x + (R() - 0.5) * 4, sy - 2, (R() - 0.5) * 1.8, -(1.8 + R() * 3.2) * Math.sqrt(e.power), m, c);
      }
      if (R() < 0.5) this.launch(e.x + (R() - 0.5) * 3, sy - 3, (R() - 0.5) * 0.6, -1 - R(), M.SMOKE, C.smoke());
    }
    // tsunami: a wall of water thrown in from one side
    const wv = this.wave;
    if (wv.frames > 0) {
      wv.frames--;
      const env = Math.sin(Math.PI * wv.frames / wv.len);
      const top = h - h * 0.55 * env;
      for (let k = 0; k < 14; k++) {
        const y = top + R() * (h - top);
        const x = wv.dir > 0 ? R() * 3 : w - 1 - R() * 3;
        this.launch(x, y, wv.dir * (2 + R() * 2.5), -R() * 1.2, M.WATER, R() < 0.85 ? C.water() : grey(200 + R() * 55));
      }
    }
    // tornado: a wandering column that lifts what it touches
    const tw = this.twist;
    if (tw.frames > 0) {
      tw.frames--;
      tw.vx += (R() - 0.5) * 0.15; tw.vx *= 0.98;
      tw.x += tw.vx; if (tw.x < 5 || tw.x > w - 5) tw.vx *= -1;
      for (let k = 0; k < 70 * tw.power; k++) {
        const y = (R() * h) | 0;
        const rad = 2 + (1 - y / h) * 14;
        const x = (tw.x + (R() - 0.5) * 2 * rad) | 0;
        if (x < 0 || x >= w) continue;
        const i = y * w + x, m = mat[i];
        if (m === 0 || (this.held[i] && R() < 0.6)) continue;
        const side = x < tw.x ? 1 : -1;
        this.launch(x, y, side * (1 + R() * 1.5), -(1.5 + R() * 2.5), m, this.col[i], this.life[i]);
        mat[i] = 0;
      }
      if (R() < 0.8) this.launch(tw.x + (R() - 0.5) * 4, h - 2, (R() - 0.5) * 2, -2 - R() * 2, M.ASH, C.ash());
    }
    // the audio spectrum burns along the floor
    if (this.fireFloor) {
      const bins = this.fireFloor, nb = bins.length;
      for (let b = 0; b < nb; b++) {
        const v = bins[b]; if (v < 0.05) continue;
        const x0 = (b / nb * w) | 0, x1 = ((b + 1) / nb * w) | 0;
        const hgt = v * v * h * 0.22;
        for (let x = x0; x < x1; x++) {
          if (R() > 0.35) continue;
          const y = h - 1 - ((R() * hgt) | 0);
          const i = y * w + x;
          if (mat[i] === 0) this.set(i, M.FIRE, C.fire(), 3 + R() * 8);
        }
      }
    }
    for (const b of this.bolts) b.frames--;
    this.bolts = this.bolts.filter(b => b.frames > 0);
  }

  shiftRow(y, s) {
    const { w } = this, a = y * w;
    for (const arr of [this.mat, this.col, this.life, this.held]) {
      const row = arr.slice(a, a + w);
      for (let x = 0; x < w; x++) arr[a + ((x + s + w) % w)] = row[x];
    }
  }

  launch(x, y, vx, vy, m, c, life) {
    if (this.proj.length > 7000) return;
    this.proj.push({ x, y, vx, vy, m, c, life: life || 0, meteor: false });
  }

  projectiles() {
    const { w, h, mat } = this;
    const keep = [];
    for (const p of this.proj) {
      const gas = DENS[p.m] <= 1;
      p.vy += gas ? -0.01 : 0.12;
      p.vx += this.wind * 0.02;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy))));
      let landed = false, dead = false;
      let px = p.x, py = p.y;
      for (let s = 0; s < steps; s++) {
        const nx = px + p.vx / steps, ny = py + p.vy / steps;
        const ix = nx | 0, iy = ny | 0;
        if (nx < 0 || ix >= w || iy >= h + 2) { dead = true; break; }
        if (ny < 0) { px = nx; py = ny; continue; }
        const hit = iy >= h || DENS[mat[iy * w + ix]] > 1;
        if (hit) {
          if (p.meteor) { this.impact(px | 0, Math.min(h - 1, Math.max(0, py | 0)), p.r); dead = true; break; }
          const lx = px | 0, ly = Math.min(h - 1, py | 0);
          if (ly >= 0 && lx >= 0 && lx < w && mat[ly * w + lx] === 0) {
            const life = p.m === M.FIRE ? 20 + R() * 40 : p.m === M.LAVA ? 300 + R() * 400 : p.m >= M.SMOKE && p.m <= M.STEAM ? 40 : p.life;
            this.set(ly * w + lx, p.m, p.c, life);
          }
          landed = true; break;
        }
        px = nx; py = ny;
        if (gas && R() < 0.02) { dead = true; break; }
      }
      p.x = px; p.y = py;
      if (p.meteor && !landed && !dead) {
        for (let k = 0; k < 3; k++) {
          const tx = (px - p.vx * k * 0.5 + (R() - 0.5) * 2) | 0, ty = (py - p.vy * k * 0.5) | 0;
          if (tx >= 0 && tx < w && ty >= 0 && ty < h && mat[ty * w + tx] === 0)
            this.set(ty * w + tx, k === 0 ? M.FIRE : M.SMOKE, k === 0 ? C.fire() : C.smoke(), 20 + R() * 30);
        }
      }
      if (!landed && !dead) keep.push(p);
    }
    this.proj = keep;
  }

  // ------------------------------------------------- triggers (public)
  // Log a line, but only once per kind of event every 1.2 s.
  log(s) {
    const key = s.split('  ')[0], now = performance.now();
    this.lastLog = this.lastLog || {};
    if (this.lastLog[key] && now - this.lastLog[key] < 1200) return;
    this.lastLog[key] = now; this.events.push(s);
  }

  rainBurst(k = 1) {
    const n = (this.w * 0.12 * k) | 0;
    for (let j = 0; j < n; j++) {
      const x = (R() * this.w) | 0, y = (R() * 3) | 0, i = y * this.w + x;
      if (this.mat[i] === 0) this.set(i, M.WATER, C.water());
    }
  }

  shake(a = 0.7, quiet) { this.quake = Math.min(1.2, this.quake + a); if (!quiet || a > 0.5) this.log('SEISMIC EVENT  M' + (4 + a * 4).toFixed(1)); }

  eruption(x, power = 1) {
    if (x === undefined) {
      // erupt from the highest point of the terrain near the centre
      let best = this.w / 2, by = this.h;
      for (let k = 0; k < 40; k++) {
        const cx = this.w * (0.2 + R() * 0.6), sy = this.surfaceY(cx, 5);
        if (sy < by) { by = sy; best = cx; }
      }
      x = best;
    }
    this.erupt = { frames: 200 + R() * 160, x, power };
    this.log('VOLCANIC ERUPTION  X=' + (x | 0));
  }

  meteor(x) {
    const w = this.w;
    const tx = x === undefined ? w * (0.15 + R() * 0.7) : x;
    const dir = R() < 0.5 ? -1 : 1;
    const p = { x: tx - dir * this.h * 0.6, y: -5, vx: dir * 2.2, vy: 3.6, m: M.FIRE, c: rgb(255, 240, 220), life: 0, meteor: true, r: 6 + R() * 7 };
    this.proj.push(p);
    this.log('BOLIDE ENTRY  VEL ' + (11 + R() * 50).toFixed(1) + ' KM/S');
  }

  impact(cx, cy, r) {
    const { w, h, mat, col } = this;
    const r2 = r * r;
    for (let y = Math.max(0, cy - r); y < Math.min(h, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x < Math.min(w, cx + r); x++) {
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const i = y * w + x;
        if (mat[i] && R() < 0.8) {
          const d = Math.sqrt(d2) || 1, f = (1 - d / r) * 3 + 1;
          this.launch(x, y, dx / d * f + (R() - 0.5), dy / d * f - 2 - R() * 2, mat[i], col[i], this.life[i]);
        }
        if (d2 < r2 * 0.3) this.set(i, M.FIRE, C.fire(), 30 + R() * 60);
        else mat[i] = 0;
      }
    }
    this.quake = Math.min(1.2, this.quake + 0.5);
    this.log('IMPACT  CRATER R=' + (r | 0));
  }

  tsunami(dir) {
    dir = dir || (R() < 0.5 ? 1 : -1);
    this.wave = { frames: 240, len: 240, dir };
    this.log('SURGE  BEARING ' + (dir > 0 ? '090' : '270'));
  }

  twister(x) {
    this.twist = { frames: 420 + R() * 200, x: x === undefined ? this.w * (0.2 + R() * 0.6) : x, vx: (R() - 0.5) * 1.2, power: 1 };
    this.log('VORTEX  EF' + ((R() * 5) | 0));
  }

  lightning(x) {
    const { w, h, mat } = this;
    if (x === undefined) {
      // prefer columns with vegetation
      x = w * R();
      for (let k = 0; k < 30; k++) {
        const cx = (w * R()) | 0, sy = this.surfaceY(cx);
        if (sy < h && (mat[sy * w + cx] === M.PLANT || mat[sy * w + cx] === M.MOSS)) { x = cx; break; }
      }
    }
    x |= 0;
    const sy = this.surfaceY(x);
    const pts = []; let bx = x + (R() - 0.5) * 20;
    for (let y = 0; y <= sy; y += 3) { pts.push([bx, y]); bx += (R() - 0.5) * 4; bx += (x - bx) * (y / Math.max(1, sy)) * 0.3; }
    pts.push([x, sy]);
    this.bolts.push({ pts, frames: 8 });
    for (let y = sy - 4; y < sy + 4; y++) for (let xx = x - 4; xx < x + 4; xx++) {
      if (xx < 0 || xx >= w || y < 0 || y >= h) continue;
      const i = y * w + xx, m = mat[i];
      if (m === M.PLANT || m === M.MOSS || m === M.EMBER || (m === 0 && R() < 0.5)) this.set(i, M.FIRE, C.fire(), 40 + R() * 60);
    }
    this.heat = Math.max(this.heat, 0.5);
    this.log('LIGHTNING STRIKE  X=' + x);
  }

  wildfire() { for (let k = 0; k < 3; k++) this.lightning(); this.heat = 0.9; }
}

window.DIS = window.DIS || {};
Object.assign(window.DIS, { Sim, M, NAMES, classify, rgb });
})();
