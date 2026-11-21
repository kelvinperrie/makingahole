// World grid, procedural generation, and the fluid / boulder simulation.
(function (MH) {
  'use strict';
  const { T, TILES, CONFIG: C, ORE_GEN } = MH;

  class World {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.tiles = new Uint8Array(w * h);
      this.moved = new Uint8Array(w * h);
      this.shaking = new Map();   // tile index -> seconds shaken so far
      this.falling = new Set();   // tile indexes of boulders in free fall
      this.simTimer = 0; this.tick = 0;
    }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    get(x, y) {
      if (y < 0) return T.EMPTY;
      if (y >= this.h) return T.BEDROCK;
      if (x < 0 || x >= this.w) return y < C.SURFACE_Y ? T.EMPTY : T.BEDROCK;
      return this.tiles[y * this.w + x];
    }
    set(x, y, t) { if (this.inBounds(x, y)) this.tiles[y * this.w + x] = t; }
    solid(x, y) { return TILES[this.get(x, y)].solid; }

    // ---------- Simulation: fluids flow, boulders fall ----------
    simulate(dt, game) {
      this.simTimer += dt;
      if (this.simTimer < C.SIM_STEP) return;
      this.simTimer = Math.min(this.simTimer - C.SIM_STEP, C.SIM_STEP);
      this.tick++;
      const W = this.w, H = this.h, t = this.tiles, moved = this.moved;
      moved.fill(0);
      const flip = this.tick % 2 === 0;
      const lavaTick = this.tick % C.LAVA_EVERY === 0;
      for (let y = H - 2; y >= 0; y--) {
        for (let i = 0; i < W; i++) {
          const x = flip ? i : W - 1 - i;
          const idx = y * W + x;
          if (moved[idx]) continue;
          const id = t[idx];
          if (id === T.WATER || (id === T.LAVA && lavaTick)) this.flow(x, y, id, flip, game);
          else if (id === T.BOULDER) this.updateBoulder(x, y, game);
        }
      }
    }

    flow(x, y, id, flip, game) {
      const W = this.w;
      // Water meeting lava cools it to stone (never inside the miner's tile).
      const other = id === T.WATER ? T.LAVA : T.WATER;
      const nbrs = [[0, 1], [1, 0], [-1, 0], [0, -1]];
      for (const [dx, dy] of nbrs) {
        if (this.get(x + dx, y + dy) === other) {
          const lx = id === T.LAVA ? x : x + dx, ly = id === T.LAVA ? y : y + dy;
          if (!game.minerOccupies(lx, ly)) {
            this.set(lx, ly, T.STONE);
            game.fx.steam(lx, ly);
            return;
          }
        }
      }
      const move = (nx, ny) => {
        this.set(x, y, T.EMPTY);
        this.set(nx, ny, id);
        this.moved[ny * W + nx] = 1;
      };
      if (this.get(x, y + 1) === T.EMPTY && y + 1 < this.h) { move(x, y + 1); return; }
      const pressure = this.get(x, y - 1) === id;
      const dirs = flip ? [-1, 1] : [1, -1];
      for (const dx of dirs) {
        const nx = x + dx;
        if (nx < 0 || nx >= W) continue;
        if (this.get(nx, y) !== T.EMPTY) continue;
        if (pressure || this.get(nx, y + 1) === T.EMPTY) { move(nx, y); return; }
      }
    }

    updateBoulder(x, y, game) {
      const W = this.w, key = y * W + x;
      const belowId = this.get(x, y + 1);
      if (TILES[belowId].solid) {
        this.shaking.delete(key);
        if (this.falling.has(key)) {          // just landed: shatter
          this.falling.delete(key);
          this.set(x, y, T.EMPTY);
          game.fx.shatter(x, y);
        }
        return;
      }
      if (!this.falling.has(key)) {
        const s = (this.shaking.get(key) || 0) + C.SIM_STEP;
        if (s < C.BOULDER_SHAKE) { this.shaking.set(key, s); return; }
        this.shaking.delete(key);
      }
      this.falling.delete(key);
      if (game.minerOccupies(x, y + 1)) {
        this.set(x, y, T.EMPTY);
        game.boulderHit(x, y);
        return;
      }
      // Swap with whatever fluid (or nothing) is below.
      this.set(x, y, belowId === T.EMPTY ? T.EMPTY : belowId);
      this.set(x, y + 1, T.BOULDER);
      const nk = key + W;
      this.falling.add(nk);
      this.moved[nk] = 1;
    }

    serialize() {
      const parts = new Array(this.tiles.length);
      for (let i = 0; i < this.tiles.length; i++) parts[i] = String.fromCharCode(48 + this.tiles[i]);
      return parts.join('');
    }
    static deserialize(w, h, str) {
      const world = new World(w, h);
      for (let i = 0; i < world.tiles.length && i < str.length; i++) world.tiles[i] = str.charCodeAt(i) - 48;
      return world;
    }
  }

  // ---------- Generation ----------
  function generateWorld(seedStr) {
    const seed = MH.rng.hashSeed(String(seedStr));
    const rnd = MH.rng.mulberry32(seed);
    const W = C.WORLD_W, SY = C.SURFACE_Y, H = SY + C.WORLD_DEPTH + 3;
    const world = new World(W, H);
    const noise = (x, y, off) => MH.rng.fbm(x, y, (seed + off) | 0, 3);

    function baseTile(x, y, d) {
      const n = noise(x * 0.12, y * 0.12, 11);
      const m = noise(x * 0.07, y * 0.07, 23);
      if (d < 5) return n > 0.6 ? T.SAND : T.DIRT;
      if (d < 30) return n > 0.62 ? T.SAND : m < 0.36 ? T.STONE : T.DIRT;
      if (d < 90) return n > 0.64 ? T.MUD : m < 0.42 ? T.STONE : T.DIRT;
      if (d < 160) return n > 0.68 ? T.MUD : m > 0.64 ? T.DIRT : T.STONE;
      if (d < 280) { const g = (d - 160) / 120; return m < 0.35 + 0.4 * g ? T.GRANITE : T.STONE; }
      const g = (d - 280) / (C.WORLD_DEPTH - 280);
      return m < 0.3 + 0.5 * g ? T.OBSIDIAN : T.GRANITE;
    }

    // Base layers
    for (let y = 0; y < H; y++) {
      const d = y - SY;
      for (let x = 0; x < W; x++) {
        let t;
        if (d < 0) t = T.EMPTY;
        else if (y >= H - 3 || x === 0 || x === W - 1) t = T.BEDROCK;
        else if (d === 0) t = T.GRASS;
        else t = baseTile(x, y, d);
        world.set(x, y, t);
      }
    }

    // Caves
    for (let y = SY + 13; y < H - 3; y++) {
      const d = y - SY;
      const thresh = 0.68 - Math.min(0.04, d / 5000);
      for (let x = 1; x < W - 1; x++) {
        if (noise(x * 0.09, y * 0.14, 77) > thresh) world.set(x, y, T.EMPTY);
      }
    }

    // Ore veins
    const fillers = new Set([T.DIRT, T.SAND, T.MUD, T.STONE, T.GRANITE, T.OBSIDIAN]);
    for (const og of ORE_GEN) {
      const maxD = Math.min(og.max, C.WORLD_DEPTH - 1);
      const rows = maxD - og.min;
      const count = Math.round(og.veins * rows / 100 * (W / 48));
      for (let i = 0; i < count; i++) {
        let x = 1 + ((rnd() * (W - 2)) | 0);
        let y = SY + og.min + ((rnd() * rows) | 0);
        const size = og.size[0] + ((rnd() * (og.size[1] - og.size[0] + 1)) | 0);
        for (let k = 0; k < size; k++) {
          if (fillers.has(world.get(x, y)) && y > SY) world.set(x, y, og.tile);
          const r = rnd();
          if (r < 0.25) x++; else if (r < 0.5) x--; else if (r < 0.75) y++; else y--;
          x = Math.max(1, Math.min(W - 2, x));
          y = Math.max(SY + 1, Math.min(H - 4, y));
        }
      }
    }

    // Fluids: water lakes in mid caves, lava pools in deep caves.
    for (let y = SY + 50; y < H - 3; y++) {
      const d = y - SY;
      for (let x = 1; x < W - 1; x++) {
        if (world.get(x, y) !== T.EMPTY) continue;
        if (d >= 50 && d <= 230 && noise(x * 0.05, y * 0.05, 99) > 0.55) world.set(x, y, T.WATER);
        else if (d >= 240 && noise(x * 0.06, y * 0.06, 123) > 0.5) world.set(x, y, T.LAVA);
      }
    }

    // Hazards: gas pockets and boulders replace filler.
    for (let y = SY + 20; y < H - 3; y++) {
      const d = y - SY;
      for (let x = 1; x < W - 1; x++) {
        const t = world.get(x, y);
        if (!fillers.has(t)) continue;
        if (d >= 35 && rnd() < 0.006 + Math.min(0.012, d / 30000)) world.set(x, y, T.GAS);
        else if (rnd() < 0.006 && world.solid(x, y + 1)) world.set(x, y, T.BOULDER);
      }
    }

    // Fossils: rare, scattered through ordinary rock.
    for (let y = SY + C.FOSSIL_MIN_DEPTH; y < H - 3; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (fillers.has(world.get(x, y)) && rnd() < C.FOSSIL_CHANCE) world.set(x, y, T.FOSSIL);
      }
    }

    // Base foundations: shop, fuel pump and the landing pad.
    for (let x = C.SHOP_X - 1; x <= C.START_X; x++) {
      for (let y = SY; y < SY + 3; y++) world.set(x, y, T.CONCRETE);
    }

    // The Ancient Core, wrapped in obsidian, just above the bedrock.
    const rx = (W / 2) | 0, ry = H - 5;
    for (let y = ry - 2; y <= ry + 1; y++)
      for (let x = rx - 2; x <= rx + 2; x++) world.set(x, y, T.OBSIDIAN);
    world.set(rx, ry, T.RELIC);

    return world;
  }

  MH.World = World;
  MH.generateWorld = generateWorld;
})(window.MH);
