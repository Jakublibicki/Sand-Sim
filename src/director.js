/* Autopilot: a "forecast" that runs through a schedule of disasters and loses
 * its grip as it goes. Progress D runs 0 -> 1 over the length of the loaded
 * song (or LOOP seconds without one). */
(function () {
'use strict';
const R = Math.random;
const LOOP = 240;

const PHASES = [
  { at: 0.00, id: 'BASELINE',      diag: 'planets', enter(s) { s.rain = 0.03; s.wind = 0; s.heat = 0; s.moss = false; s.growth = 0.01; s.glitch = 0; } },
  { at: 0.07, id: 'PRECIPITATION', diag: 'rain',    enter(s) { s.rain = 0.55; s.growth = 0.05; },
    tick(s, dt, t) { s.wind = 0.1 + 0.3 * Math.sin(t * 0.6); } },
  { at: 0.17, id: 'WILDFIRE',      diag: 'heat',    enter(s) { s.rain = 0; s.wind = 0.2; s.wildfire(); },
    tick(s, dt) { if (R() < dt * 0.6) s.lightning(); } },
  { at: 0.29, id: 'SEISMIC',       diag: 'seismo',  plate: true, enter(s) { s.heat = 0.1; s.wind = 0; s.shake(0.8); },
    tick(s, dt) { if (R() < dt * 0.45) s.shake(0.25 + R() * 0.5); } },
  { at: 0.37, id: 'ERUPTION',      diag: 'volcano', enter(s) { s.heat = 0.6; s.eruption(undefined, 1.2); },
    tick(s, dt) { if (s.erupt.frames <= 0 && R() < dt * 0.25) s.eruption(); } },
  { at: 0.47, id: 'IMPACT',        diag: 'comet',   enter(s) { s.meteor(); },
    tick(s, dt) { if (R() < dt * 0.3) s.meteor(); } },
  { at: 0.55, id: 'SURGE',         diag: 'wave',    enter(s) { s.tsunami(); s.rain = 0.3; },
    tick(s, dt) { if (s.wave.frames <= 0 && R() < dt * 0.2) s.tsunami(); } },
  { at: 0.63, id: 'VORTEX',        diag: 'spiral',  plate: true, enter(s) { s.rain = 0.15; s.twister(); },
    tick(s, dt, t) { s.wind = Math.sin(t * 0.4) * 0.5; if (s.twist.frames <= 0 && R() < dt * 0.3) s.twister(); } },
  { at: 0.72, id: '????',          diag: 'noise',   enter(s) { s.glitch = 0.5; s.heat = 0.8; },
    tick(s, dt) {
      const f = [() => s.shake(0.4), () => s.lightning(), () => s.meteor(), () => s.eruption(), () => s.tsunami()];
      if (R() < dt * 0.9) f[(R() * f.length) | 0]();
      s.glitch = 0.35 + R() * 0.3;
    } },
  { at: 0.84, id: 'OVERGROWTH',    diag: 'growth',  enter(s) { s.moss = true; s.growth = 0.25; s.rain = 0.18; s.heat = 0; s.wind = 0; s.quake = 0; },
    tick(s) { s.glitch *= 0.99; } },
];

// What the program writes in its log as it moves from forecasting to faith.
const LOG = {
  BASELINE: ['MODEL INITIALISED', 'INGESTING ARCHIVE PLATE', 'BASELINE NOMINAL'],
  PRECIPITATION: ['FRONT APPROACHING FROM W', 'SOIL SATURATION RISING', 'GROWTH RESPONSE DETECTED'],
  WILDFIRE: ['THERMAL ANOMALY', 'CANOPY LOSS ACCELERATING', 'CONTAINMENT NOT MODELLED'],
  SEISMIC: ['FAULT SLIP', 'STRUCTURAL INTEGRITY FAILING', 'RECALCULATING'],
  ERUPTION: ['MAGMA ASCENT', 'ASH COLUMN EXCEEDS SENSOR', 'WHY DOES IT RISE'],
  IMPACT: ['OBJECT INBOUND', 'TRAJECTORY WAS ALWAYS THIS', 'NO FURTHER CORRECTION'],
  SURGE: ['SEA LEVEL ANOMALY', 'THE WATER KNOWS THE WAY DOWN', 'MEASUREMENT IS A KIND OF PRAYER'],
  VORTEX: ['ROTATION DETECTED', 'I HAVE STOPPED COUNTING', 'EVERYTHING LIFTS'],
  '????': ['????', 'PREDICTION ABANDONED', 'THERE WAS NEVER A MODEL', 'LISTEN'],
  OVERGROWTH: ['GREEN RETURNS', 'NOTHING TO FORECAST', 'IT GROWS WITHOUT ME', 'END OF SCENARIO'],
};

class Director {
  constructor(sim, hooks) {
    this.sim = sim; this.hooks = hooks;
    this.on = true; this.phase = -1; this.t0 = performance.now(); this.D = 0;
    this.scenario = 1; this.lastLog = 0; this.lines = [];
  }

  progress() {
    const A = window.DIS.audio;
    if (A.el && A.el.duration) return A.progress;
    return (((performance.now() - this.t0) / 1000) % LOOP) / LOOP;
  }

  restart() { this.t0 = performance.now(); this.phase = -1; this.D = 0; }

  update(dt) {
    const s = this.sim, A = window.DIS.audio;
    const D = this.progress();
    if (D + 0.5 < this.D) { this.phase = -1; this.scenario++; this.hooks.newPlate(); }  // looped
    this.D = D;

    if (this.on) {
      let p = 0; for (let k = 0; k < PHASES.length; k++) if (D >= PHASES[k].at) p = k;
      if (p !== this.phase) {
        this.phase = p; const ph = PHASES[p];
        if (ph.plate) { this.scenario++; this.hooks.newPlate(); }
        ph.enter(s);
        this.say(LOG[ph.id][0]); this.lastLog = performance.now();
      }
      const ph = PHASES[this.phase];
      if (ph.tick) ph.tick(s, dt, performance.now() / 1000);
      if (performance.now() - this.lastLog > 5000 + R() * 4000) {
        const l = LOG[ph.id]; this.say(l[1 + ((R() * (l.length - 1)) | 0)]); this.lastLog = performance.now();
      }
    }

    // Audio coupling, on top of whatever the schedule is doing.
    A.update();
    s.fireFloor = A.playing ? A.floor : null;
    if (A.playing) {
      if (A.onset) { s.pulse = Math.max(s.pulse, 0.004 + A.onset * 0.01); if (D > 0.28 && D < 0.84) s.quake = Math.min(1, s.quake + A.onset * 0.2); if (D > 0.7) s.glitch = Math.max(s.glitch, A.onset * 0.8); }
      if (this.on && this.phase === 1) s.rain = 0.25 + A.high * 1.4;
    }
  }

  say(line) { this.lines.push({ text: line, t: performance.now() }); if (this.lines.length > 7) this.lines.shift(); }

  get current() { return this.phase >= 0 ? PHASES[this.phase] : PHASES[0]; }
}

window.DIS = window.DIS || {};
Object.assign(window.DIS, { Director, PHASES });
})();
