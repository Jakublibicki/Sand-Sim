/* Audio input: plays a local file and turns its spectrum into control signals. */
(function () {
'use strict';
const A = {
  ctx: null, el: null, an: null, data: null, dest: null,
  bass: 0, mid: 0, high: 0, bassAvg: 0, onset: 0, cool: 0,
  floor: new Float32Array(48), name: '',

  load(file) {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.el) { this.el.pause(); URL.revokeObjectURL(this.el.src); }
    this.el = new Audio(URL.createObjectURL(file));
    this.name = file.name.replace(/\.[^.]+$/, '');
    const src = this.ctx.createMediaElementSource(this.el);
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0.55;
    src.connect(this.an); this.an.connect(this.ctx.destination);
    this.dest = this.ctx.createMediaStreamDestination(); this.an.connect(this.dest);
    this.data = new Uint8Array(this.an.frequencyBinCount);
    this.ctx.resume(); this.el.play();
  },

  get playing() { return !!(this.el && !this.el.paused && !this.el.ended); },
  get progress() { return this.el && this.el.duration ? this.el.currentTime / this.el.duration : 0; },

  toggle() { if (!this.el) return; if (this.el.paused) { this.ctx.resume(); this.el.play(); } else this.el.pause(); },

  update() {
    this.onset = 0;
    if (!this.playing) { this.bass *= 0.9; this.mid *= 0.9; this.high *= 0.9; this.floor.fill(0); return; }
    this.an.getByteFrequencyData(this.data);
    const d = this.data, hz = this.ctx.sampleRate / this.an.fftSize;
    const band = (lo, hi) => { let s = 0, n = 0; for (let i = Math.max(1, lo / hz | 0); i <= hi / hz; i++) { s += d[i]; n++; } return n ? s / n / 255 : 0; };
    this.bass = band(30, 160); this.mid = band(160, 2000); this.high = band(2000, 9000);
    this.bassAvg = this.bassAvg * 0.96 + this.bass * 0.04;
    if (this.cool > 0) this.cool--;
    else if (this.bass > 0.35 && this.bass > this.bassAvg * 1.25 + 0.04) { this.onset = this.bass; this.cool = 12; }
    // log-spaced bins for the burning floor
    const n = this.floor.length;
    for (let b = 0; b < n; b++) {
      const lo = 40 * Math.pow(400, b / n), hi = 40 * Math.pow(400, (b + 1) / n);
      this.floor[b] = Math.min(1, band(lo, hi + hz) * 1.25);
    }
  },
};
window.DIS = window.DIS || {};
window.DIS.audio = A;
})();
