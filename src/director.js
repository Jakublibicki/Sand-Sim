/* Autopilot: a "forecast" that runs through a schedule of disasters and loses
 * its grip as it goes.
 *
 * With a song loaded, the schedule is the song: phase boundaries snap to the
 * track's section changes, and disasters fire on detected hits in the band
 * that matches them (kick -> quake, snare -> lightning, hats -> rain ...).
 * Without a song, phases run on a LOOP-second clock with random triggers. */
(function () {
'use strict';
const R = Math.random;
const LOOP = 240;

/* W = how strongly each continuous signal reaches the sim in this phase.
 *   seis: SUB level -> ground tremor     rain: HIGH level -> rainfall
 *   heat: MID level -> fire spread        wind: AIR level -> wind
 *   glitch: spectral flux -> image tearing
 * on = which discrete hits trigger events (handlers below).
 * Each entry of `routes` names what a signal does right now, for the UI. */
const PHASES = [
  { at: 0.00, id: 'BASELINE', diag: 'planets',
    enter(s) { s.rain = 0.03; s.wind = 0; s.heat = 0; s.moss = false; s.growth = 0.01; s.glitch = 0; },
    W: { seis: 0.25, rain: 0.15, heat: 0, wind: 0.1 }, on: {} },
  { at: 0.07, id: 'PRECIPITATION', diag: 'rain',
    enter(s) { s.rain = 0.45; s.growth = 0.05; },
    tick(s, dt, t) { s.wind = 0.1 + 0.3 * Math.sin(t * 0.6); },
    W: { seis: 0.2, rain: 1.1, heat: 0, wind: 0.6 }, on: { HIGH: 'rainBurst', AIR: 'gust' } },
  { at: 0.17, id: 'WILDFIRE', diag: 'heat',
    enter(s) { s.rain = 0; s.wind = 0.2; s.wildfire(); },
    tick(s, dt) { if (R() < dt * 0.6) s.lightning(); },
    W: { seis: 0.2, rain: 0, heat: 1, wind: 0.4 }, on: { MID: 'lightning' } },
  { at: 0.29, id: 'SEISMIC', diag: 'seismo', plate: true,
    enter(s) { s.heat = 0.1; s.wind = 0; s.shake(0.8); },
    tick(s, dt) { if (R() < dt * 0.45) s.shake(0.25 + R() * 0.5); },
    W: { seis: 1, rain: 0.1, heat: 0.2, wind: 0 }, on: { SUB: 'quake' } },
  { at: 0.37, id: 'ERUPTION', diag: 'volcano',
    enter(s) { s.heat = 0.6; s.eruption(undefined, 1.2); },
    tick(s, dt) { if (s.erupt.frames <= 0 && R() < dt * 0.25) s.eruption(); },
    W: { seis: 0.5, rain: 0, heat: 0.8, wind: 0.2, magma: 1 }, on: { LOW: 'erupt' } },
  { at: 0.47, id: 'IMPACT', diag: 'comet',
    enter(s) { s.meteor(); },
    tick(s, dt) { if (R() < dt * 0.3) s.meteor(); },
    W: { seis: 0.5, rain: 0.1, heat: 0.4, wind: 0.2 }, on: { DROP: 'meteor', HIT: 'meteor' } },
  { at: 0.55, id: 'SURGE', diag: 'wave',
    enter(s) { s.tsunami(); s.rain = 0.3; },
    tick(s, dt) { if (s.wave.frames <= 0 && R() < dt * 0.2) s.tsunami(); },
    W: { seis: 0.3, rain: 0.5, heat: 0, wind: 0.3 }, on: { SWELL: 'surge', SUB: 'pulse' } },
  { at: 0.63, id: 'VORTEX', diag: 'spiral', plate: true,
    enter(s) { s.rain = 0.15; s.twister(); },
    tick(s, dt, t) { s.wind = Math.sin(t * 0.4) * 0.5; if (s.twist.frames <= 0 && R() < dt * 0.3) s.twister(); },
    W: { seis: 0.2, rain: 0.2, heat: 0, wind: 1, spin: 1 }, on: { AIR: 'gust' } },
  { at: 0.72, id: '????', diag: 'noise',
    enter(s) { s.glitch = 0.5; s.heat = 0.8; },
    tick(s, dt) {
      const f = [() => s.shake(0.4), () => s.lightning(), () => s.meteor(), () => s.eruption(), () => s.tsunami()];
      if (R() < dt * 0.9) f[(R() * f.length) | 0]();
      s.glitch = 0.35 + R() * 0.3;
    },
    W: { seis: 0.6, rain: 0.3, heat: 0.6, wind: 0.5, glitch: 1 },
    on: { SUB: 'quake', LOW: 'erupt', MID: 'lightning', HIGH: 'rainBurst', AIR: 'meteor' } },
  { at: 0.84, id: 'OVERGROWTH', diag: 'growth',
    enter(s) { s.moss = true; s.growth = 0.25; s.rain = 0.18; s.heat = 0; s.wind = 0; s.quake = 0; },
    tick(s) { s.glitch *= 0.99; },
    W: { seis: 0, rain: 0.4, heat: 0, wind: 0.1, glitch: 0.15, calm: 1 }, on: {} },
];

// What each band, or song event, is called on screen, and what it does.
const ROUTES = [
  { key: 'SUB',   cont: 'seis',  name: 'TREMOR' },
  { key: 'LOW',   cont: 'magma', name: 'MAGMA' },
  { key: 'MID',   cont: 'heat',  name: 'FIRE' },
  { key: 'HIGH',  cont: 'rain',  name: 'RAIN' },
  { key: 'AIR',   cont: 'wind',  name: 'WIND' },
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
    this.bounds = PHASES.map(p => p.at); this.snappedFor = 0;
    this.base = { rain: 0, heat: 0, wind: 0, growth: 0.01 };
    this.windDir = 1; this.cool = {}; this.lastErupt = 0;
  }

  progress() {
    const A = window.DIS.audio;
    if (A.el && A.length) return A.progress;
    return (((performance.now() - this.t0) / 1000) % LOOP) / LOOP;
  }

  restart() { this.t0 = performance.now(); this.phase = -1; this.D = 0; }

  get audioDriven() { const A = window.DIS.audio; return !!(A.el && A.length); }

  update(dt) {
    const s = this.sim, A = window.DIS.audio;
    A.update();

    // Snap phase boundaries to the song's sections once it has been decoded.
    if (A.env && this.snappedFor !== A.loadId) {
      this.bounds = A.snap(PHASES.map(p => p.at)) || PHASES.map(p => p.at);
      this.snappedFor = A.loadId; this.phase = -1;
      this.say('SIGNAL MAPPED  ' + this.bounds.length + ' SECTIONS');
    }
    if (!this.audioDriven) this.bounds = PHASES.map(p => p.at);

    const D = this.progress();
    if (!this.audioDriven && D + 0.5 < this.D) { this.phase = -1; this.scenario++; this.hooks.newPlate(); }  // clock looped
    this.D = D;

    if (this.on) {
      let p = 0; for (let k = 0; k < this.bounds.length; k++) if (D >= this.bounds[k]) p = k;
      if (p !== this.phase) {
        const forward = p > this.phase;
        this.phase = p; const ph = PHASES[p];
        if (ph.plate && forward) { this.scenario++; this.hooks.newPlate(); }
        ph.enter(s);
        this.base = { rain: s.rain, heat: s.heat, wind: s.wind, growth: s.growth };
        this.say(LOG[ph.id][0]); this.lastLog = performance.now();
      }
      const ph = PHASES[this.phase];
      // Without music the schedule triggers its own events at random.
      if (!this.audioDriven && ph.tick) ph.tick(s, dt, performance.now() / 1000);
      if (performance.now() - this.lastLog > 5000 + R() * 4000) {
        const l = LOG[ph.id]; this.say(l[1 + ((R() * (l.length - 1)) | 0)]); this.lastLog = performance.now();
      }
    }

    s.fireFloor = A.playing ? A.floor : null;
    if (A.playing) this.react(A, s, dt);
  }

  // ---------------------------------------------------------- audio -> sim
  react(A, s, dt) {
    const [SUB, LOW, MID, HIGH, AIR] = A.bands;
    const now = performance.now();
    const ready = (k, ms) => { if ((this.cool[k] || 0) > now) return false; this.cool[k] = now + ms; return true; };

    // Every kick loosens the image a little, in any mode.
    if (SUB.onset) s.pulse = Math.max(s.pulse, 0.003 + 0.01 * SUB.onset);

    if (!this.on) return;   // manual mode: the buttons own the weather
    const ph = PHASES[this.phase], W = ph.W, on = ph.on, b = this.base;

    // continuous signals
    s.quake = Math.max(s.quake, Math.pow(SUB.level, 3) * 0.12 * (W.seis || 0));
    s.rain = b.rain * 0.4 + HIGH.level * HIGH.level * (W.rain || 0) * 0.7;
    s.heat = Math.max(b.heat * 0.5, MID.level * (W.heat || 0));
    if (AIR.onset && R() < 0.25) this.windDir *= -1;
    s.wind = b.wind * 0.3 + this.windDir * AIR.level * (W.wind || 0) * 0.6;
    s.growth = W.calm ? 0.08 + 0.5 * (1 - A.loudFast) : b.growth;     // quiet passages grow
    if (W.magma && s.erupt.frames > 0) s.erupt.power = 0.35 + 1.6 * LOW.level;
    if (W.spin) {
      if (s.twist.frames <= 0) s.twister();
      s.twist.frames = Math.max(s.twist.frames, 60);
      s.twist.power = 0.25 + 1.3 * A.loudFast;
      s.twist.vx += this.windDir * AIR.level * 0.04;
    }
    const glitchW = W.glitch !== undefined ? W.glitch : (this.D > 0.6 ? 0.3 : 0);
    if (glitchW) s.glitch = Math.max(s.glitch, A.flux * glitchW);

    // discrete hits
    const fire = (what, strength) => {
      switch (what) {
        case 'quake': if (ready('quake', 250)) s.shake(0.15 + 0.6 * strength, true); break;
        case 'pulse': s.pulse = Math.max(s.pulse, 0.02 * strength); break;
        case 'lightning': if (strength > 0.35 && ready('bolt', 350)) s.lightning(); break;
        case 'rainBurst': s.rainBurst(strength); break;
        case 'gust': this.windDir *= -1; s.wind = this.windDir * 0.8; break;
        case 'erupt':
          if (s.erupt.frames > 0) { s.erupt.frames = Math.max(s.erupt.frames, 90); break; }
          if ((strength > 0.55 || now - this.lastErupt > 6000) && ready('erupt', 1500)) { s.eruption(undefined, 0.6 + strength); this.lastErupt = now; }
          break;
        case 'meteor': if (ready('meteor', 1200)) s.meteor(); break;
        case 'surge': if (s.wave.frames <= 0) s.tsunami(); break;
      }
    };
    for (const band of A.bands) if (band.onset && on[band.id]) fire(on[band.id], band.onset);
    if (A.drop && on.DROP) fire(on.DROP, 1);
    if (on.HIT && SUB.onset && MID.onset) fire(on.HIT, 1);
    if (A.swell && on.SWELL) fire(on.SWELL, 1);
  }

  // For the UI: what each band is wired to in the current phase.
  routes() {
    const ph = PHASES[Math.max(0, this.phase)], W = this.on ? ph.W : {}, on = this.on ? ph.on : {};
    return ROUTES.map(r => {
      const ev = on[r.key];
      const label = ev ? { quake: 'QUAKE', lightning: 'LIGHTNING', rainBurst: 'DOWNPOUR', gust: 'GUST', erupt: 'ERUPTION', meteor: 'METEOR', pulse: 'COLLAPSE' }[ev] : null;
      return { key: r.key, name: label || r.name, active: !!ev || (W[r.cont] || 0) > 0.3 };
    });
  }

  say(line) { this.lines.push({ text: line, t: performance.now() }); if (this.lines.length > 7) this.lines.shift(); }

  get current() { return this.phase >= 0 ? PHASES[this.phase] : PHASES[0]; }
}

window.DIS = window.DIS || {};
Object.assign(window.DIS, { Director, PHASES });
})();
