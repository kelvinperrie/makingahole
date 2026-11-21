// Sound effects and music, generated with the Web Audio API.
(function (MH) {
  'use strict';

  const A = {
    ctx: null, master: null, sfx: null, music: null, noiseBuf: null,
    drill: null, musicTimer: null, nextNote: 0, depth: 0, step: 0, beat: 0,

    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.music = ctx.createGain(); this.music.connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      return true;
    },

    applyVolumes() {
      if (!this.ctx) return;
      const s = MH.settings;
      this.master.gain.value = s.master;
      this.sfx.gain.value = s.sfx;
      this.music.gain.value = s.music * 0.35;
    },

    tone(freq, dur, type, vol, slideTo, delay, dest) {
      const ctx = this.ctx, t = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },

    noise(dur, freq, vol, filterType, q, delay) {
      const ctx = this.ctx, t = ctx.currentTime + (delay || 0);
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = filterType || 'bandpass';
      f.frequency.value = freq; f.Q.value = q || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.sfx);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    },

    play(name) {
      if (!this.ctx) return;
      switch (name) {
        case 'break': this.noise(0.12, 700 + Math.random() * 400, 0.25); break;
        case 'collect': this.tone(660, 0.08, 'square', 0.08); this.tone(990, 0.12, 'square', 0.08, null, 0.07); break;
        case 'full': this.tone(300, 0.15, 'square', 0.08, 180); break;
        case 'land': this.noise(0.15, 220, 0.4, 'lowpass'); this.tone(90, 0.15, 'sine', 0.3, 50); break;
        case 'buy': [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.07, null, i * 0.07)); break;
        case 'sell': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, 'square', 0.07, null, i * 0.06)); break;
        case 'error': this.tone(160, 0.18, 'square', 0.1, 110); break;
        case 'warn': this.tone(880, 0.09, 'square', 0.08); this.tone(880, 0.09, 'square', 0.08, null, 0.16); break;
        case 'explode': this.noise(0.7, 300, 0.8, 'lowpass', 0.7); this.tone(80, 0.6, 'sine', 0.5, 30); break;
        case 'hit': this.noise(0.2, 500, 0.5); this.tone(130, 0.2, 'square', 0.15, 60); break;
        case 'burn': this.noise(0.08, 2000, 0.06, 'highpass'); break;
        case 'splash': this.noise(0.25, 1400, 0.18, 'highpass'); break;
        case 'achieve': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.12, null, i * 0.09)); break;
        case 'teleport': this.tone(200, 0.5, 'sine', 0.2, 1600); break;
        case 'place': this.noise(0.08, 400, 0.3, 'lowpass'); break;
        case 'worm': this.noise(0.9, 120, 0.5, 'lowpass', 1); this.tone(55, 0.9, 'sawtooth', 0.12, 40); break;
        case 'wormwarn': [440, 330, 440, 330].forEach((f, i) => this.tone(f, 0.14, 'square', 0.09, null, i * 0.18)); break;
        case 'click': this.tone(1200, 0.03, 'square', 0.04); break;
        case 'win': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, null, i * 0.12)); break;
      }
    },

    drillStart(hardness) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      if (!this.drill) {
        const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
        const g = ctx.createGain(); g.gain.value = 0;
        const trem = ctx.createGain(); trem.gain.value = 0.7;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 22;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.3;
        lfo.connect(lfoGain); lfoGain.connect(trem.gain);
        src.connect(f); f.connect(g); g.connect(trem); trem.connect(this.sfx);
        src.start(); lfo.start();
        this.drill = { f, g };
      }
      const t = ctx.currentTime;
      this.drill.f.frequency.setTargetAtTime(250 + hardness * 110, t, 0.02);
      this.drill.g.gain.setTargetAtTime(0.16, t, 0.02);
    },

    drillStop() {
      if (!this.drill) return;
      this.drill.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    },

    // ---------- Music: a slow pentatonic wander that sinks with depth ----------
    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      this.nextNote = this.ctx.currentTime + 0.2;
      this.musicTimer = setInterval(() => this.schedule(), 100);
    },
    stopMusic() {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    },
    setDepth(d) { this.depth = d; },
    schedule() {
      const ctx = this.ctx;
      const scale = [0, 3, 5, 7, 10, 12, 15];
      const deep = Math.min(1, this.depth / 350);
      const beatLen = 0.34 + deep * 0.2;
      const base = 196 * Math.pow(2, -deep * 1.2);
      while (this.nextNote < ctx.currentTime + 0.3) {
        const t0 = this.nextNote - ctx.currentTime;
        if (this.beat % 8 === 0) {
          this.tone(base / 2, beatLen * 7, 'sine', 0.22, null, t0, this.music);
        }
        if (Math.random() > 0.3) {
          this.step = Math.max(0, Math.min(scale.length - 1, this.step + ((Math.random() * 3) | 0) - 1));
          const f = base * Math.pow(2, scale[this.step] / 12);
          this.tone(f, beatLen * 1.8, 'triangle', 0.12, null, t0, this.music);
        }
        this.beat++;
        this.nextNote += beatLen;
      }
    },
  };

  MH.audio = A;
})(window.MH);
