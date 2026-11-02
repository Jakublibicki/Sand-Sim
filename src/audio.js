/* Audio input. Plays a local file, decodes it once for the waveform and for
 * section detection, and analyses the live spectrum every frame into five
 * bands with per-band onset detection, plus loudness, drops and swells. */
(function () {
'use strict';

// Each band drives one kind of action (see director.js ROUTES).
const BANDS = [
  { id: 'SUB',  lo: 30,   hi: 90 },
  { id: 'LOW',  lo: 90,   hi: 300 },
  { id: 'MID',  lo: 300,  hi: 2000 },
  { id: 'HIGH', lo: 2000, hi: 6000 },
  { id: 'AIR',  lo: 6000, hi: 14000 },
];

const A = {
  ctx: null, el: null, an: null, data: null, prev: null, wave: null, dest: null,
  name: '', loadId: 0,
  bands: BANDS.map(b => ({ ...b, raw: 0, peak: 0.1, level: 0, flux: 0, energy: 0, inc: 0, long: 0, rel: 0, relAvg: 0, onset: 0, cool: 0, flash: 0 })),
  loud: 0, loudPeak: 0.05, loudFast: 0, loudSlow: 0, quiet: 0, drop: 0, swell: 0, swellCool: 0, flux: 0, fluxAvg: 0.01,
  floor: new Float32Array(48),
  peaks: null, env: null, envHop: 0.1, duration: 0,   // from offline decode

  async load(file) {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.el) { this.el.pause(); URL.revokeObjectURL(this.el.src); }
    this.loadId++;
    this.peaks = null; this.env = null;
    this.el = new Audio(URL.createObjectURL(file));
    this.name = file.name.replace(/\.[^.]+$/, '');
    const src = this.ctx.createMediaElementSource(this.el);
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0.35;
    src.connect(this.an); this.an.connect(this.ctx.destination);
    this.dest = this.ctx.createMediaStreamDestination(); this.an.connect(this.dest);
    this.data = new Uint8Array(this.an.frequencyBinCount);
    this.prev = new Uint8Array(this.an.frequencyBinCount);
    this.fdata = new Float32Array(this.an.frequencyBinCount);
    this.wave = new Float32Array(this.an.fftSize);
    this.ctx.resume(); this.el.play();
    const id = this.loadId;
    try {
      const buf = await this.ctx.decodeAudioData(await file.arrayBuffer());
      if (id === this.loadId) this.analyse(buf);
    } catch (e) { console.warn('Could not decode audio for the waveform:', e); }
  },

  // One pass over the decoded file: waveform columns and a loudness envelope.
  analyse(buf) {
    const n = buf.length, chs = [];
    for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chs.push(buf.getChannelData(c));
    const COLS = 900, per = Math.max(1, Math.floor(n / COLS));
    const peaks = new Float32Array(COLS);
    for (let k = 0; k < COLS; k++) {
      let m = 0;
      for (let i = k * per, e = Math.min(n, i + per); i < e; i += 4) {
        const v = Math.abs(chs[0][i]); if (v > m) m = v;
      }
      peaks[k] = m;
    }
    /* Section envelope in three bands (low < 200 Hz < mid < 3 kHz < high),
     * so a change of sound at the same volume still counts as a new section. */
    const sr = buf.sampleRate, hop = Math.round(sr * this.envHop), envN = Math.floor(n / hop);
    const env = [new Float32Array(envN), new Float32Array(envN), new Float32Array(envN)];
    const a1 = 1 - Math.exp(-2 * Math.PI * 200 / sr), a2 = 1 - Math.exp(-2 * Math.PI * 3000 / sr);
    let l1 = 0, l2 = 0;
    const x = chs[0], x2 = chs[1];
    for (let k = 0; k < envN; k++) {
      let sl = 0, sm = 0, sh = 0;
      for (let i = k * hop, e = i + hop; i < e; i++) {
        const v = x2 ? (x[i] + x2[i]) * 0.5 : x[i];
        l1 += a1 * (v - l1); l2 += a2 * (v - l2);
        const m = l2 - l1, h = v - l2;
        sl += l1 * l1; sm += m * m; sh += h * h;
      }
      env[0][k] = Math.sqrt(sl / hop); env[1][k] = Math.sqrt(sm / hop); env[2][k] = Math.sqrt(sh / hop);
    }
    for (const e of env) { let m = 0; for (const v of e) m = Math.max(m, v); for (let k = 0; k < envN; k++) e[k] = Math.sqrt(e[k] / (m || 1)); }
    let pm = 0; for (const p of peaks) pm = Math.max(pm, p);
    for (let k = 0; k < COLS; k++) peaks[k] /= pm || 1;
    this.peaks = peaks; this.env = env; this.duration = buf.duration;
  },

  /* Move each nominal phase boundary (0..1) to the biggest change in loudness
   * nearby, so phases change where the song changes section. */
  snap(nominal) {
    const env = this.env; if (!env) return null;
    const N = env[0].length, win = Math.round(2 / this.envHop);   // 2 s either side
    const nov = new Float32Array(N); let maxNov = 0;
    for (let i = win; i < N - win; i++) {
      for (const e of env) {
        let a = 0, b = 0;
        for (let k = 1; k <= win; k++) { a += e[i - k]; b += e[i + k - 1]; }
        nov[i] += Math.abs(b - a) / win;
      }
      maxNov = Math.max(maxNov, nov[i]);
    }
    const out = [0]; let last = 0;
    for (let p = 1; p < nominal.length; p++) {
      const c = Math.round(nominal[p] * N), r = Math.round(0.06 * N);
      let best = c, bv = -1;
      for (let i = Math.max(last + Math.round(0.03 * N), c - r); i <= Math.min(N - 1, c + r); i++) if (nov[i] > bv) { bv = nov[i]; best = i; }
      if (bv < maxNov * 0.15) best = Math.max(c, last + 1);
      out.push(best / N); last = best;
    }
    return out;
  },

  get playing() { return !!(this.el && !this.el.paused && !this.el.ended); },
  get time() { return this.el ? this.el.currentTime : 0; },
  get length() { return this.el && isFinite(this.el.duration) ? this.el.duration : this.duration; },
  get progress() { const L = this.length; return L ? this.time / L : 0; },

  toggle() { if (!this.el) return; if (this.el.paused) { this.ctx.resume(); this.el.play(); } else this.el.pause(); },
  seek(frac) { if (this.el && this.length) this.el.currentTime = Math.max(0, Math.min(0.999, frac)) * this.length; },
  nudge(sec) { if (this.el) this.el.currentTime = Math.max(0, Math.min(this.length - 0.1, this.el.currentTime + sec)); },

  update() {
    for (const b of this.bands) { b.onset = 0; b.flash *= 0.86; }
    this.drop = 0; this.swell = 0;
    if (!this.playing) {
      for (const b of this.bands) { b.level *= 0.9; }
      this.loudFast *= 0.9; this.flux *= 0.9; this.floor.fill(0);
      return;
    }
    this.an.getByteFrequencyData(this.data);
    this.an.getFloatTimeDomainData(this.wave);
    const d = this.data, pv = this.prev, hz = this.ctx.sampleRate / this.an.fftSize;

    const fd = this.fdata; this.an.getFloatFrequencyData(fd);
    let fluxAll = 0, totalLong = 0;
    for (let bi = 0; bi < this.bands.length; bi++) {
      const b = this.bands[bi];
      const i0 = Math.max(1, Math.floor(b.lo / hz)), i1 = Math.max(i0 + 1, Math.ceil(b.hi / hz));
      let s = 0, f = 0;
      for (let i = i0; i < i1; i++) { s += d[i]; const df = d[i] - pv[i]; if (df > 0) f += df; }
      const nb = i1 - i0;
      b.raw = s / nb / 255; b.flux = f / nb / 255; fluxAll += b.flux;
      // adaptive range so quiet and loud masters both use the full scale
      b.peak = Math.max(b.raw, b.peak * 0.9985, 0.06);
      b.level = Math.min(1, b.raw / b.peak);
      // linear energy in the band, for onsets
      let e = 0;
      for (let i = i0; i < i1; i++) e += Math.pow(10, fd[i] / 10);
      b.inc = Math.max(0, e - b.energy); b.energy = e;
      b.long = b.long * 0.995 + e * 0.005;
      totalLong += b.long;
    }
    /* Onsets: how much energy a band gained this frame, relative to its own
     * usual energy. The floor (a share of the whole mix's energy) stops a
     * near-silent band from reacting to the spill of a hit in another band. */
    const floor = totalLong * 0.03 + 1e-12;
    let maxRel = 0;
    for (let bi = 0; bi < this.bands.length; bi++) {
      const b = this.bands[bi];
      b.rel = b.inc / (b.long + floor);
      if (b.cool > 0) b.cool--;
      else if (b.rel > b.relAvg * 2.5 + 0.25 && b.level > 0.25) {
        b.onset = Math.min(1, b.rel / (b.relAvg * 5 + 0.75));
        b.flash = 1; b.cool = bi === 0 ? 9 : 6;
        maxRel = Math.max(maxRel, b.rel);
      }
      b.relAvg = b.relAvg * 0.95 + b.rel * 0.05;
    }
    // A hit spills into neighbouring bands; give it to where it is strongest.
    for (const b of this.bands) if (b.onset && b.rel < maxRel * 0.5) { b.onset = 0; b.flash = 0; }
    pv.set(d);
    this.flux = Math.min(1, fluxAll / (this.fluxAvg * 6 + 0.02));
    this.fluxAvg = this.fluxAvg * 0.97 + fluxAll * 0.03;

    let r = 0; for (let i = 0; i < this.wave.length; i++) r += this.wave[i] * this.wave[i];
    r = Math.sqrt(r / this.wave.length);
    this.loudPeak = Math.max(r, this.loudPeak * 0.9992, 0.02);
    this.loud = r / this.loudPeak;
    this.loudFast = this.loudFast * 0.8 + this.loud * 0.2;
    this.loudSlow = this.loudSlow * 0.995 + this.loud * 0.005;
    // drop: loud again after at least ~0.8 s of quiet
    if (this.loudFast < 0.35) this.quiet++;
    else if (this.loudFast > 0.7) { if (this.quiet > 48) this.drop = 1; this.quiet = 0; }
    // swell: loudness climbing well above its running average
    if (this.swellCool > 0) this.swellCool--;
    else if (this.loudFast > 0.8 && this.loudFast > this.loudSlow * 1.35) { this.swell = 1; this.swellCool = 240; }

    const n = this.floor.length;
    for (let k = 0; k < n; k++) {
      const lo = 40 * Math.pow(400, k / n), hi = 40 * Math.pow(400, (k + 1) / n);
      let s = 0, c = 0;
      for (let i = Math.max(1, Math.floor(lo / hz)); i <= hi / hz + 1; i++) { s += d[i]; c++; }
      this.floor[k] = Math.min(1, (c ? s / c / 255 : 0) * 1.25);
    }
  },
};
window.DIS = window.DIS || {};
window.DIS.audio = A;
})();
