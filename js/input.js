// Keyboard + gamepad input with rebindable keys.
(function (MH) {
  'use strict';

  const DIRS = ['up', 'down', 'left', 'right'];
  const GP_BUTTONS = { 0: 'interact', 1: 'cargo', 2: 'item1', 3: 'item2', 4: 'item3', 5: 'item4', 6: 'item5', 8: 'recover', 9: 'pause' };

  const input = {
    held: new Set(), order: [], pressed: new Set(),
    gpDir: null, gpPrev: {}, gpPressed: new Set(),
    rebindCallback: null,

    init() {
      window.addEventListener('keydown', e => {
        MH.audio.ensure();
        if (this.rebindCallback) {
          e.preventDefault();
          e._mhRebind = true;
          const cb = this.rebindCallback; this.rebindCallback = null;
          cb(e.code);
          return;
        }
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT') return;
        if (!this.held.has(e.code)) { this.pressed.add(e.code); this.order.push(e.code); }
        this.held.add(e.code);
        if (this.actionOf(e.code)) e.preventDefault();
      });
      window.addEventListener('keyup', e => {
        this.held.delete(e.code);
        this.order = this.order.filter(c => c !== e.code);
      });
      window.addEventListener('blur', () => { this.held.clear(); this.order = []; });
      window.addEventListener('mousedown', () => MH.audio.ensure());
    },

    actionOf(code) {
      const b = MH.settings.bindings;
      for (const a in b) if (b[a].includes(code)) return a;
      return null;
    },

    // Most recently pressed direction that is still held.
    dir() {
      for (let i = this.order.length - 1; i >= 0; i--) {
        const a = this.actionOf(this.order[i]);
        if (DIRS.includes(a)) return a;
      }
      return this.gpDir;
    },

    consume(action) {
      const codes = MH.settings.bindings[action] || [];
      let hit = false;
      for (const c of codes) if (this.pressed.has(c)) { this.pressed.delete(c); hit = true; }
      if (this.gpPressed.has(action)) { this.gpPressed.delete(action); hit = true; }
      return hit;
    },

    swallow(code) { this.pressed.delete(code); },

    pollGamepad() {
      this.gpDir = null;
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (const p of pads) if (p && p.connected) { gp = p; break; }
      if (!gp) return;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const b = i => gp.buttons[i] && gp.buttons[i].pressed;
      if (b(12) || ay < -0.5) this.gpDir = 'up';
      else if (b(13) || ay > 0.5) this.gpDir = 'down';
      else if (b(14) || ax < -0.5) this.gpDir = 'left';
      else if (b(15) || ax > 0.5) this.gpDir = 'right';
      for (const i in GP_BUTTONS) {
        const now = !!b(+i);
        if (now && !this.gpPrev[i]) { this.gpPressed.add(GP_BUTTONS[i]); MH.audio.ensure(); }
        this.gpPrev[i] = now;
      }
    },

    endFrame() { this.pressed.clear(); this.gpPressed.clear(); },
  };

  MH.input = input;
})(window.MH);
