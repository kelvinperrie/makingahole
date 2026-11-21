// Giant worm event: every few minutes a worm tunnels across the world at some depth.
// It fills empty space it passes through with soft earth and seeds ore along its path.
// The player gets a warning a minute ahead so they can get above it.
(function (MH) {
  'use strict';
  const { T, TILES, CONFIG: C, ORE_GEN } = MH;
  const TS = C.TILE;
  const AMP = 2, FREQ = 0.22;             // path wiggle: rows up/down, and how tight
  const PROTECTED = new Set([T.BEDROCK, T.CONCRETE, T.RELIC, T.FOSSIL]);
  const rand = (a, b) => a + Math.random() * (b - a);

  class Worms {
    constructor(game) {
      this.game = game;
      this.timer = rand(C.WORM_FIRST[0], C.WORM_FIRST[1]);
      this.pending = null;   // warned, not yet arrived
      this.worm = null;      // currently tunnelling
      this.rumbleT = 0;
    }

    // Row the worm's body is centred on at column x.
    pathRow(w, x) { return w.row + Math.round(AMP * Math.sin(x * FREQ + w.phase)); }

    update(dt) {
      if (this.worm) return this.advance(dt);
      if (this.pending) {
        const p = this.pending;
        p.t -= dt;
        if (!p.warned10 && p.t <= 10) {
          p.warned10 = true;
          MH.ui.toast(`Worm incoming at ${p.depth}m deep!`, 'warn');
          MH.audio.play('wormwarn');
        }
        if (p.t <= 0) this.spawn();
        return;
      }
      this.timer -= dt;
      if (this.timer <= 0 && !this.plan()) this.timer = 30; // not deep enough yet: try again later
    }

    // Pick a depth near where the player is digging and announce it.
    plan(forceDepth) {
      const g = this.game, m = g.miner, deepest = g.state.stats.deepest;
      let depth = forceDepth;
      if (depth === undefined) {
        if (deepest < C.WORM_MIN_DEPTH + 5) return false;
        const ref = m.depth >= 10 ? m.depth : deepest * 0.6;
        depth = Math.round(ref + rand(-8, 20));
        depth = Math.max(C.WORM_MIN_DEPTH, Math.min(depth, deepest + 25, C.WORLD_DEPTH - 8));
      }
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.pending = {
        t: C.WORM_WARNING, depth, dir, warned10: false,
        row: C.SURFACE_Y - 1 + depth, phase: Math.random() * Math.PI * 2,
      };
      MH.ui.toast(`Worm detected at ${depth}m deep! Arrives in ${C.WORM_WARNING}s. Get above it!`, 'warn');
      MH.audio.play('wormwarn');
      return true;
    }

    spawn() {
      const p = this.pending, W = this.game.world.w;
      this.pending = null;
      this.worm = {
        depth: p.depth, row: p.row, phase: p.phase, dir: p.dir,
        hx: p.dir > 0 ? -1 : W, next: p.dir > 0 ? 0 : W - 1, hit: false,
      };
      this.rumbleT = 0;
    }

    advance(dt) {
      const g = this.game, w = this.worm, W = g.world.w;
      w.hx += w.dir * C.WORM_SPEED * dt;
      while (w.next >= 0 && w.next < W && (w.dir > 0 ? w.hx >= w.next : w.hx <= w.next)) {
        this.eat(w.next);
        w.next += w.dir;
      }
      // Rumble and shake while it's close to the miner.
      const m = g.miner, dist = Math.hypot(w.hx - m.x, this.pathRow(w, Math.round(w.hx)) - m.y);
      this.rumbleT -= dt;
      if (dist < 22 && this.rumbleT <= 0) {
        this.rumbleT = 0.8;
        MH.audio.play('worm');
        g.shake(Math.max(0.1, 0.7 - dist / 25));
      }
      const tail = w.hx - w.dir * C.WORM_LENGTH;
      if (w.dir > 0 ? tail > W + 1 : tail < -2) {
        this.worm = null;
        this.timer = rand(C.WORM_EVERY[0], C.WORM_EVERY[1]);
        MH.ui.toast('The worm has passed.', 'info');
      }
    }

    // Chew through one column: fill holes with earth, sprinkle ore.
    eat(x) {
      const g = this.game, world = g.world, w = this.worm;
      const yc = this.pathRow(w, x);
      for (let y = yc - 1; y <= yc + 1; y++) {
        const d = y - (C.SURFACE_Y - 1);
        if (d < C.WORM_MIN_DEPTH - AMP - 1 || y >= world.h - 3) continue;
        const id = world.get(x, y);
        if (PROTECTED.has(id) || TILES[id].collect) continue;
        if (g.minerOccupies(x, y)) { this.hitMiner(); continue; }
        world.set(x, y, Math.random() < C.WORM_ORE_CHANCE ? this.oreFor(d) : (d < 90 ? T.DIRT : T.MUD));
        const key = y * world.w + x;
        world.shaking.delete(key); world.falling.delete(key);
        if (Math.random() < 0.3) g.fx.debris(x, y, '#c86a7a');
      }
    }

    oreFor(d) {
      const opts = ORE_GEN.filter(o => d >= o.min && d <= o.max);
      if (!opts.length) return d < 90 ? T.DIRT : T.MUD;
      let r = Math.random() * opts.reduce((s, o) => s + o.veins, 0);
      for (const o of opts) { r -= o.veins; if (r <= 0) return o.tile; }
      return opts[0].tile;
    }

    hitMiner() {
      const w = this.worm;
      if (w.hit) return;
      w.hit = true;
      this.game.notify('wormhit', 'The worm rammed you!', 'warn');
      this.game.miner.damage(C.WORM_DAMAGE, 'worm');
    }

    promptText() {
      if (this.pending) return `Worm at ${this.pending.depth}m in ${Math.ceil(this.pending.t)}s`;
      if (this.worm) return `Worm tunnelling at ${this.worm.depth}m!`;
      return null;
    }

    // ---------- Drawing (called after the darkness pass) ----------
    draw(ctx, x0, x1) {
      const g = this.game;
      if (this.pending) {
        // Pulsing red band showing where the worm will pass.
        const p = this.pending, a = 0.12 + 0.1 * Math.sin(g.time * 6);
        ctx.fillStyle = `rgba(255,40,40,${a.toFixed(3)})`;
        for (let x = x0; x <= x1; x++) {
          const yc = this.pathRow(p, x);
          ctx.fillRect(x * TS, (yc - 1) * TS, TS, TS * 3);
        }
        return;
      }
      const w = this.worm;
      if (!w) return;
      const m = g.miner, light = g.stats().light;
      for (let i = C.WORM_LENGTH - 1; i >= 0; i--) {
        const sx = w.hx - w.dir * i * 0.9;
        if (sx < x0 - 3 || sx > x1 + 3) continue;
        const sy = w.row + AMP * Math.sin(sx * FREQ + w.phase);
        const cx = Math.round((sx + 0.5) * TS), cy = Math.round((sy + 0.5) * TS);
        const r = i === 0 ? 22 : Math.round(20 - i * 0.6);
        disc(ctx, cx, cy, r + 1, '#3a1820');
        disc(ctx, cx, cy, r, i % 2 ? '#c86a7a' : '#b85868');
        disc(ctx, cx - 3, cy - 5, Math.max(3, r - 9), i % 2 ? '#e08c98' : '#d07a88');
        if (i === 0) this.drawHead(ctx, cx, cy, w.dir);
        // Fade into the dark like everything else, but never fully.
        const dark = g.darkness(Math.floor(sx), Math.floor(sy), m.px + 0.5, m.py + 0.5, light) * 0.6;
        if (dark > 0.02) disc(ctx, cx, cy, r + 1, `rgba(0,0,0,${dark.toFixed(2)})`);
      }
    }

    drawHead(ctx, cx, cy, dir) {
      const mx = cx + dir * 10;
      disc(ctx, mx, cy + 2, 10, '#200810');           // mouth
      ctx.fillStyle = '#f4ecd8';                       // ring of teeth
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2 + this.game.time * 3;
        ctx.fillRect(Math.round(mx + Math.cos(a) * 8) - 1, Math.round(cy + 2 + Math.sin(a) * 8) - 1, 3, 3);
      }
      ctx.fillStyle = '#ffe040';                       // eyes
      ctx.fillRect(cx - dir * 4 - 2, cy - 14, 4, 4);
      ctx.fillRect(cx - dir * 4 + 5, cy - 12, 3, 3);
    }
  }

  // Pixel-crisp filled circle.
  function disc(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.floor(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }

  MH.Worms = Worms;
})(window.MH);
