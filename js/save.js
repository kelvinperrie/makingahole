// Saving and loading (browser local storage).
(function (MH) {
  'use strict';
  const SAVE_KEY = 'makingahole.save.v1';
  const SETTINGS_KEY = 'makingahole.settings.v1';

  function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, val) { try { localStorage.setItem(key, val); return true; } catch (e) { return false; } }

  function defaultSettings() {
    return {
      master: 0.8, sfx: 0.8, music: 0.5, moveRule: 'corner',
      bindings: JSON.parse(JSON.stringify(MH.DEFAULT_BINDINGS)),
    };
  }

  MH.loadSettings = function () {
    const s = defaultSettings();
    const raw = storageGet(SETTINGS_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        for (const k of ['master', 'sfx', 'music', 'moveRule']) if (k in saved) s[k] = saved[k];
        if (saved.bindings) for (const a in s.bindings) if (Array.isArray(saved.bindings[a])) s.bindings[a] = saved.bindings[a];
      } catch (e) { /* ignore corrupt settings */ }
    }
    if (!MH.MOVE_RULES[s.moveRule]) s.moveRule = 'corner';
    MH.settings = s;
  };
  MH.saveSettings = function () { storageSet(SETTINGS_KEY, JSON.stringify(MH.settings)); };
  MH.resetBindings = function () { MH.settings.bindings = JSON.parse(JSON.stringify(MH.DEFAULT_BINDINGS)); };

  MH.save = {
    exists() { return !!storageGet(SAVE_KEY); },

    write(game) {
      const m = game.miner, w = game.world;
      const data = {
        v: 1,
        seed: game.state.seed,
        world: { w: w.w, h: w.h, tiles: w.serialize() },
        state: game.state,
        miner: { x: m.x, y: m.y, facing: m.facing, fuel: m.fuel, hull: m.hull, cargo: m.cargo },
      };
      return storageSet(SAVE_KEY, JSON.stringify(data));
    },

    read() {
      const raw = storageGet(SAVE_KEY);
      if (!raw) return null;
      try {
        const data = JSON.parse(raw);
        if (data.v !== 1) return null;
        return data;
      } catch (e) { return null; }
    },

    clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },
  };
})(window.MH);
