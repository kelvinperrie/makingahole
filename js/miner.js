// The mining vehicle: movement rules, mining, fuel and hull.
(function (MH) {
  'use strict';
  const { T, TILES, CONFIG: C, TIER_NAMES } = MH;

  class Miner {
    constructor(game) {
      this.game = game;
      this.cargo = {};
      this.reset();
    }

    reset() {
      const st = this.game.stats();
      this.x = C.START_X; this.y = C.SURFACE_Y - 1;
      this.px = this.x; this.py = this.y;
      this.facing = 'right';
      this.anim = null; this.mining = null; this.fallSpeed = 0;
      this.fuel = st.fuelMax; this.hull = st.hullMax;
      this.frame = 0; this.frameT = 0;
      this.burning = false; this.clinging = false;
    }

    get cargoCount() { let n = 0; for (const k in this.cargo) n += this.cargo[k]; return n; }
    get depth() { return Math.max(0, this.y - (C.SURFACE_Y - 1)); }
    occupies(x, y) {
      return (this.x === x && this.y === y) || (!!this.anim && this.anim.tx === x && this.anim.ty === y);
    }

    update(dt, dir) {
      const g = this.game, st = g.stats();
      this.environment(dt, st);
      if (this.hull <= 0) return;

      if (this.mining || this.anim) {
        this.frameT += dt;
        if (this.frameT > 0.06) { this.frameT = 0; this.frame ^= 1; }
      }

      if (this.anim) { this.advance(dt); return; }

      if (this.fuel <= 0) dir = null;
      this.think(dir, dt, st);

      if (this.fuel <= 0 && !this.anim) g.onStranded();
      else g.clearStranded();
    }

    // ---------- Movement rules ----------
    think(dir, dt, st) {
      const w = this.game.world, x = this.x, y = this.y;
      const standing = w.solid(x, y + 1);
      const grip = w.solid(x - 1, y) || w.solid(x + 1, y);          // wall touching a side
      const ledge = w.solid(x - 1, y + 1) || w.solid(x + 1, y + 1); // rock at a lower corner
      // Rock beside the tile above: the miner can reach up and grab it.
      const reach = !w.solid(x, y - 1) && (w.solid(x - 1, y - 1) || w.solid(x + 1, y - 1));
      if (standing) this.clinging = false;
      const fall = () => { this.clinging = false; this.stopMining(); this.startMove(x, y + 1, 'fall', st); };

      if (dir === 'up') {
        if (grip || reach) {
          this.clinging = true;
          if (!w.solid(x, y - 1)) {
            if (y - 1 >= 0) { this.stopMining(); this.startMove(x, y - 1, 'climb', st); return; }
          } else if (this.game.state.upDrill) {
            this.facing = 'up'; this.tryMine(x, y - 1, dt, st); return;
          }
          this.stopMining(); this.fallSpeed = 0; // clinging to the wall
          return;
        }
        if (standing) {
          if (w.solid(x, y - 1) && this.game.state.upDrill) { this.facing = 'up'; this.tryMine(x, y - 1, dt, st); return; }
          if (!w.solid(x, y - 1) && y >= C.SURFACE_Y) this.game.notify('noclimb', 'Need a wall beside you to climb');
          this.stopMining();
          return;
        }
        if (ledge && this.clinging) {
          // Top of a climb: hang on the lip of the hole until the player steps sideways.
          this.stopMining(); this.fallSpeed = 0;
          return;
        }
        return fall();
      }

      if (dir === 'left' || dir === 'right') {
        const dx = dir === 'left' ? -1 : 1;
        const tx = x + dx;
        const held = grip || this.clinging;
        this.facing = dir;
        if (tx < 0 || tx >= w.w) {
          this.stopMining();
          if (!standing && !held) fall();
          return;
        }
        if (w.solid(tx, y)) {
          if (standing || held) { this.tryMine(tx, y, dt, st); return; }
          return fall();
        }
        if (standing || (held && this.attached(tx, y))) {
          this.clinging = false;
          this.stopMining(); this.startMove(tx, y, 'move', st); return;
        }
        if (!standing) return fall();
        return;
      }

      if (dir === 'down') {
        if (standing) { this.facing = 'down'; this.tryMine(x, y + 1, dt, st); return; }
        return fall();
      }

      this.stopMining();
      if (!standing) fall();
    }

    // Can the miner (clinging to a wall) step sideways into empty tile (tx, ty)?
    attached(tx, ty, fromX = this.x) {
      const w = this.game.world, rule = MH.settings.moveRule;
      const s = (a, b) => w.solid(a, b);
      const farX = tx + (tx - fromX);
      if (s(tx, ty + 1)) return true;
      if (rule === 'ledge') return false;
      if (s(farX, ty) || s(tx - 1, ty + 1) || s(tx + 1, ty + 1)) return true;
      if (rule === 'noCeiling') return false;
      return s(tx - 1, ty - 1) || s(tx + 1, ty - 1);
    }

    // Can the miner drive back to the surface through open tiles, without digging?
    // Returns true when unsure (search too big).
    canReachSurface(limit = 6000) {
      const r = this.routeHome(limit);
      return r.found || r.unknown;
    }

    // Cheapest way back to the surface through open tiles, in fuel (no digging).
    // Mirrors the movement rules in think(). Returns {found, cost, unknown}.
    routeHome(limit = 6000) {
      const w = this.game.world, top = C.SURFACE_Y - 1;
      if (this.y <= top) return { found: true, cost: 0 };
      const best = new Map(), heap = [];
      const push = (x, y, c, cost) => {
        const k = (y * w.w + x) * 2 + c;
        const old = best.get(k);
        if (old !== undefined && old <= cost) return;
        best.set(k, cost);
        heap.push([cost, x, y, c]);
        let i = heap.length - 1;                       // sift up
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heap[p][0] <= heap[i][0]) break;
          [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
        }
      };
      const pop = () => {
        const topItem = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          let i = 0;                                   // sift down
          for (;;) {
            const l = i * 2 + 1, r = l + 1;
            let m = i;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
          }
        }
        return topItem;
      };
      push(this.x, this.y, this.clinging ? 1 : 0, 0);
      let n = 0;
      while (heap.length) {
        const [cost, x, y, c0] = pop();
        if (best.get((y * w.w + x) * 2 + c0) < cost) continue; // stale entry
        if (y <= top) return { found: true, cost };
        if (++n > limit) return { found: false, unknown: true };
        const standing = w.solid(x, y + 1);
        const grip = w.solid(x - 1, y) || w.solid(x + 1, y);
        const ledge = w.solid(x - 1, y + 1) || w.solid(x + 1, y + 1);
        const reach = !w.solid(x, y - 1) && (w.solid(x - 1, y - 1) || w.solid(x + 1, y - 1));
        const c = standing ? 0 : (c0 || grip ? 1 : 0);
        if ((grip || reach) && !w.solid(x, y - 1)) push(x, y - 1, 1, cost + C.FUEL_CLIMB);
        // Clinging only lasts while there's a wall to grip or a lip to hang on.
        const held = grip || (c && ledge);
        if (standing || held) {
          for (const dx of [-1, 1]) {
            const tx = x + dx;
            if (tx < 0 || tx >= w.w || w.solid(tx, y)) continue;
            if (standing || this.attached(tx, y, x)) push(tx, y, 0, cost + C.FUEL_MOVE);
          }
        }
        if (!standing) push(x, y + 1, 0, cost); // can always let go and fall (free)
      }
      return { found: false };
    }

    // Rough fuel to drill straight up to the surface (for Upward Drill owners).
    drillHomeCost() {
      const w = this.game.world, st = this.game.stats();
      let cost = 0;
      for (let y = this.y - 1; y >= C.SURFACE_Y - 1; y--) {
        cost += C.FUEL_CLIMB;
        const td = TILES[w.get(this.x, y)];
        if (td.solid) {
          if (!td.breakable || td.minTier > st.drillTier) return null;
          cost += td.hardness * C.MINE_BASE / st.drillPower * C.FUEL_DRILL;
        }
      }
      return cost;
    }

    startMove(tx, ty, kind, st) {
      const w = this.game.world;
      const inWater = w.get(this.x, this.y) === T.WATER || w.get(tx, ty) === T.WATER;
      let speed;
      if (kind === 'fall') {
        const v = Math.max(C.FALL_START, this.fallSpeed);
        this.fallSpeed = Math.min(C.FALL_MAX, v + C.FALL_ACCEL / v);
        speed = inWater ? Math.min(this.fallSpeed, C.FALL_WATER) : this.fallSpeed;
      } else {
        this.fallSpeed = 0;
        speed = st.speed * (kind === 'climb' ? C.CLIMB_FACTOR : 1);
        if (inWater) speed *= C.WATER_FACTOR;
        this.useFuel(kind === 'climb' ? C.FUEL_CLIMB : C.FUEL_MOVE);
      }
      this.anim = { fx: this.x, fy: this.y, tx, ty, t: 0, dur: 1 / speed, kind };
    }

    advance(dt) {
      const a = this.anim;
      a.t += dt / a.dur;
      if (a.t >= 1) {
        const wasWater = this.game.world.get(this.x, this.y) === T.WATER;
        this.x = a.tx; this.y = a.ty; this.px = this.x; this.py = this.y;
        this.anim = null;
        this.onArrive(a.kind, wasWater);
      } else {
        this.px = a.fx + (a.tx - a.fx) * a.t;
        this.py = a.fy + (a.ty - a.fy) * a.t;
      }
    }

    onArrive(kind, wasWater) {
      const g = this.game, w = g.world;
      if (!wasWater && w.get(this.x, this.y) === T.WATER) MH.audio.play('splash');
      g.onDepth(this.depth);
      if (kind === 'fall' && w.solid(this.x, this.y + 1)) {
        if (this.fallSpeed > 9) { MH.audio.play('land'); g.shake(Math.min(0.25, this.fallSpeed / 80)); }
        this.fallSpeed = 0;
      }
    }

    // ---------- Mining ----------
    tryMine(tx, ty, dt, st) {
      const g = this.game, id = g.world.get(tx, ty), td = TILES[id];
      if (!td.breakable) {
        this.stopMining();
        g.notify('unbreak' + id, `${td.name} can't be broken`);
        return;
      }
      if (td.minTier > st.drillTier) {
        this.stopMining();
        g.notify('tier' + id, `${td.name} needs a ${TIER_NAMES[td.minTier]} drill`, 'warn');
        return;
      }
      if (!this.mining || this.mining.x !== tx || this.mining.y !== ty) {
        this.stopMining();
        this.mining = { x: tx, y: ty, p: 0, need: td.hardness * C.MINE_BASE / st.drillPower };
        MH.audio.drillStart(td.hardness);
      }
      this.mining.p += dt;
      this.useFuel(C.FUEL_DRILL * dt);
      if (Math.random() < dt * 25) g.fx.dust(tx, ty, td.color, this.x, this.y);
      if (this.mining.p >= this.mining.need) {
        this.stopMining();
        g.breakTile(tx, ty, 'drill');
      }
    }

    stopMining() {
      if (this.mining) { this.mining = null; MH.audio.drillStop(); }
    }

    // ---------- Resources ----------
    useFuel(amount) {
      const max = this.game.stats().fuelMax;
      const before = this.fuel;
      this.fuel = Math.max(0, this.fuel - amount);
      if (before / max >= C.LOW_FUEL && this.fuel / max < C.LOW_FUEL) {
        this.game.notify('lowfuel', 'Fuel low! Head back to the surface', 'warn');
        MH.audio.play('warn');
      }
    }

    environment(dt, st) {
      const g = this.game, here = g.world.get(this.x, this.y);
      let dps = 0;
      if (here === T.LAVA) dps += Math.max(C.LAVA_MIN_DPS, C.LAVA_DPS - st.cooling * C.LAVA_COOL_REDUCE);
      const heat = g.heatLevel(this.depth);
      if (heat > st.cooling) dps += (heat - st.cooling) * C.HEAT_DPS;
      this.burning = dps > 0;
      if (dps > 0) this.damage(dps * dt, here === T.LAVA ? 'lava' : 'heat', true);
    }

    damage(amount, cause, continuous) {
      if (this.hull <= 0) return;
      const g = this.game, max = g.stats().hullMax;
      const before = this.hull;
      this.hull = Math.max(0, this.hull - amount);
      if (!continuous) { MH.audio.play('hit'); g.shake(0.3); }
      else g.burnTick();
      if (before / max >= C.LOW_HULL && this.hull / max < C.LOW_HULL && this.hull > 0) {
        g.notify('lowhull', 'Hull critical!', 'warn');
        MH.audio.play('warn');
      }
      if (this.hull <= 0) { this.stopMining(); g.onDestroyed(cause); }
    }
  }

  MH.Miner = Miner;
})(window.MH);
