// Game state, rules, camera and rendering.
(function (MH) {
  'use strict';
  const { T, TILES, CONFIG: C, PARTS, PART_ORDER, VEHICLES, ITEMS, ACHIEVEMENTS, TIER_NAMES, UP_DRILL, TRIP_COMP } = MH;
  const TS = C.TILE;

  function newState(seed) {
    const parts = {};
    for (const k of PART_ORDER) parts[k] = 0;
    return {
      seed, money: 0, vehicle: 0, parts, upDrill: false, tripComp: false,
      items: { explosive: 0, teleport: 0, fuelcan: 0, repair: 0, support: 3 },
      stats: { deepest: 0, earned: 0, mined: 0, playTime: 0, fossils: 0 },
      achievements: {}, won: false,
    };
  }

  // Tiny 3x5 pixel font for the shop sign.
  const GLYPHS = {
    S: ['111', '100', '111', '001', '111'], H: ['101', '101', '111', '101', '101'],
    O: ['111', '101', '101', '101', '111'], P: ['111', '101', '111', '100', '100'],
  };
  function pixelText(ctx, str, x, y, color) {
    ctx.fillStyle = color;
    for (const ch of str) {
      const g = GLYPHS[ch];
      if (g) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === '1') ctx.fillRect(x + c, y + r, 1, 1);
      x += 4;
    }
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.mode = 'menu';           // menu | playing | paused
      this.state = null; this.world = null; this.miner = null;
      this.cam = { x: 0, y: 0 };
      this.time = 0; this.shakeT = 0; this.shakeAmt = 0;
      this.particles = []; this.floaters = [];
      this.notifyTimes = {}; this.strandedT = null; this.lastBurnSound = 0;
      this.alphaStr = [];
      for (let i = 0; i <= 20; i++) this.alphaStr.push(`rgba(0,0,0,${(i / 20).toFixed(2)})`);
      this.fx = this.makeFx();
      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.menuWorld = MH.generateWorld('title-screen');
      this.world = this.menuWorld;
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = window.innerWidth + 'px';
      this.canvas.style.height = window.innerHeight + 'px';
      this.scale = Math.max(1, Math.floor(Math.min(w / (24 * TS), h / (15 * TS))));
      this.viewW = Math.ceil(w / this.scale);
      this.viewH = Math.ceil(h / this.scale);
    }

    // ---------- Derived stats ----------
    stats() {
      const s = this.state, p = s.parts, v = VEHICLES[s.vehicle];
      return {
        drillPower: PARTS.drill.values[p.drill], drillTier: p.drill,
        cargoCap: PARTS.cargo.values[p.cargo], fuelMax: PARTS.fuel.values[p.fuel],
        speed: PARTS.engine.values[p.engine], hullMax: PARTS.hull.values[p.hull] + v.hullBonus,
        cooling: PARTS.cooling.values[p.cooling], light: PARTS.light.values[p.light],
        scan: PARTS.scanner.values[p.scanner], scanTier: p.scanner,
        maxTier: v.maxTier, color: v.color,
      };
    }

    // ---------- Lifecycle ----------
    newGame(seed) {
      seed = String(seed || '').trim() || String(Math.floor(Math.random() * 1e9));
      this.state = newState(seed);
      this.world = MH.generateWorld(seed);
      this.miner = new MH.Miner(this);
      this.startPlaying();
      this.save();
      MH.ui.toast('Dig down with the arrow keys. Bring ore back to the shop!', 'info');
    }

    loadGame() {
      const d = MH.save.read();
      if (!d) return false;
      const base = newState(d.seed);
      const s = Object.assign(base, d.state);
      s.parts = Object.assign(newState(d.seed).parts, d.state.parts);
      s.items = Object.assign(newState(d.seed).items, d.state.items);
      s.stats = Object.assign(newState(d.seed).stats, d.state.stats);
      this.state = s;
      this.world = MH.World.deserialize(d.world.w, d.world.h, d.world.tiles);
      this.miner = new MH.Miner(this);
      const m = this.miner;
      Object.assign(m, { x: d.miner.x, y: d.miner.y, facing: d.miner.facing || 'right', fuel: d.miner.fuel, hull: d.miner.hull, cargo: d.miner.cargo || {} });
      m.px = m.x; m.py = m.y;
      this.startPlaying();
      MH.ui.toast('Game loaded', 'info');
      return true;
    }

    startPlaying() {
      this.particles = []; this.floaters = []; this.strandedT = null; this.notifyTimes = {};
      this.stuck = false; this.stuckCheckT = 0;
      this.trip = null; this.tripT = 0; this.tripWarned = false;
      this.worms = new MH.Worms(this);
      this.mode = 'playing';
      MH.ui.closeModal();
      MH.ui.showHUD(true);
      MH.audio.ensure();
      MH.audio.startMusic();
      this.updateCamera(0, true);
    }

    save() {
      const ok = MH.save.write(this);
      if (!ok) MH.ui.toast('Could not save (browser storage unavailable)', 'warn');
      return ok;
    }

    quitToMenu() {
      this.save();
      if (this.miner) this.miner.stopMining();
      this.mode = 'menu';
      this.miner = null; this.state = null;
      this.world = this.menuWorld;
      MH.ui.showHUD(false);
      MH.ui.setPrompt(null);
      MH.ui.showMainMenu();
    }

    pause() {
      if (this.mode !== 'playing') return;
      this.mode = 'paused';
      if (this.miner) this.miner.stopMining();
      MH.audio.drillStop();
    }
    resume() {
      if (this.mode === 'paused' && this.miner) this.mode = 'playing';
    }

    // ---------- Main loop ----------
    frame(dt) {
      this.time += dt;
      MH.input.pollGamepad();
      if (this.mode === 'playing') this.update(dt);
      else if (this.mode === 'paused' && MH.input.consume('pause')) MH.ui.escape();
      if (this.mode === 'menu') this.menuCamera();
      else this.updateCamera(dt, false);
      this.render();
      if (this.miner) MH.ui.updateHUD(this);
      MH.input.endFrame();
    }

    update(dt) {
      const s = this.state, m = this.miner, inp = MH.input;
      s.stats.playTime += dt;

      if (inp.consume('pause')) { MH.ui.showPause(); return; }
      if (inp.consume('cargo')) { MH.ui.showCargo(); return; }
      if (inp.consume('interact')) {
        if (this.atShop()) { MH.ui.showShop(); return; }
        this.notify('noshop', 'Park at the shop on the surface to trade');
      }
      if (inp.consume('recover')) { this.askRecovery(); return; }
      ITEMS.forEach((it, i) => { if (inp.consume('item' + (i + 1))) this.useItem(it.id); });

      m.update(dt, inp.dir());
      if (this.mode !== 'playing') return;

      this.world.simulate(dt, this);
      this.updateStranded(dt);
      this.worms.update(dt);
      if (this.mode !== 'playing') return;
      this.updateStuck(dt);
      this.updateTrip(dt);
      this.updateFx(dt);
      MH.audio.setDepth(m.depth);

      const worm = this.worms.promptText();
      if (this.strandedT !== null) MH.ui.setPrompt(`Out of fuel! Recovery in ${Math.ceil(this.strandedT)}...`, 'warn');
      else if (this.stuck) MH.ui.setPrompt(`No way up from here. Press ${MH.ui.keyLabel('recover')} to call recovery ($${this.recoveryFee()})`, 'warn');
      else if (this.atShop()) MH.ui.setPrompt(`Press ${MH.ui.keyLabel('interact')} to open the shop` + (worm ? ` - ${worm}` : ''));
      else if (worm) MH.ui.setPrompt(worm, 'warn');
      else MH.ui.setPrompt(null);
    }

    atShop() {
      const m = this.miner;
      return !m.anim && m.y === C.SURFACE_Y - 1 && m.x >= C.SHOP_X - 1 && m.x <= C.START_X;
    }

    heatLevel(depth) {
      if (depth < C.HEAT_START) return 0;
      return Math.min(4, 1 + Math.floor((depth - C.HEAT_START) / C.HEAT_STEP));
    }

    // ---------- Notifications ----------
    notify(key, text, kind) {
      const last = this.notifyTimes[key];
      if (last !== undefined && this.time - last < 3) return;
      this.notifyTimes[key] = this.time;
      MH.ui.toast(text, kind || 'info');
    }

    award(id) {
      if (!this.state || this.state.achievements[id]) return;
      const a = ACHIEVEMENTS.find(x => x.id === id);
      if (!a) return;
      this.state.achievements[id] = true;
      MH.ui.toast(`★ ${a.name} — ${a.desc}`, 'achieve');
      MH.audio.play('achieve');
    }

    onDepth(d) {
      const st = this.state.stats;
      if (d > st.deepest) st.deepest = d;
      if (d >= 50) this.award('d50');
      if (d >= 100) this.award('d100');
      if (d >= 200) this.award('d200');
      if (d >= 300) this.award('d300');
      if (d >= C.HEAT_START - 5 && d < C.HEAT_START) this.notify('heatsoon', 'It is getting hot down here...', 'warn');
    }

    checkEarnings() {
      const e = this.state.stats.earned;
      if (e >= 1000) this.award('e1k');
      if (e >= 10000) this.award('e10k');
      if (e >= 100000) this.award('e100k');
    }

    burnTick() {
      if (this.time - this.lastBurnSound > 0.3) { this.lastBurnSound = this.time; MH.audio.play('burn'); }
      const m = this.miner;
      if (m && Math.random() < 0.3) this.fx.ember(m.px, m.py);
    }

    // ---------- Tiles, resources, hazards ----------
    breakTile(x, y, cause) {
      const w = this.world, id = w.get(x, y), td = TILES[id];
      if (!td.breakable) return;
      w.set(x, y, T.EMPTY);
      this.state.stats.mined++;
      this.fx.debris(x, y, td.color);
      MH.audio.play('break');
      if (id === T.GAS) { this.explode(x, y, 'gas'); return; }
      if (id === T.FOSSIL) { this.findFossil(x, y, cause); return; }
      if (td.collect) {
        if (cause === 'explosive' && id !== T.RELIC && Math.random() < 0.5) this.floater(x, y, td.name + ' lost', '#999');
        else this.collect(id, x, y);
      }
    }

    collect(id, x, y) {
      const m = this.miner, td = TILES[id];
      if (id !== T.RELIC && m.cargoCount >= this.stats().cargoCap) {
        this.notify('full', `Cargo full! Sell at the shop or drop items (${MH.ui.keyLabel('cargo')})`, 'warn');
        MH.audio.play('full');
        this.floater(x, y, 'Full!', '#ff6a6a');
        return;
      }
      m.cargo[id] = (m.cargo[id] || 0) + 1;
      this.floater(x, y, '+' + td.name, td.color);
      MH.audio.play('collect');
      this.award('first_ore');
      if (id === T.SILVER) this.award('silver');
      if (id === T.GOLD) this.award('gold');
      if (id === T.GEM) this.award('gem');
      if (id === T.RELIC) this.win();
    }

    // Fossils pay cash straight away: deeper ones are worth more.
    fossilValue(y) {
      const d = Math.max(0, y - (C.SURFACE_Y - 1));
      return Math.round((C.FOSSIL_BASE + C.FOSSIL_PER_M * d) * (0.7 + Math.random() * 0.6));
    }
    findFossil(x, y, cause) {
      let v = this.fossilValue(y);
      const smashed = cause === 'explosive';
      if (smashed) v = Math.max(1, Math.round(v * C.FOSSIL_BLAST));
      this.state.money += v;
      this.state.stats.earned += v;
      this.state.stats.fossils = (this.state.stats.fossils || 0) + 1;
      this.checkEarnings();
      this.floater(x, y, '+$' + v, '#ffe080');
      this.fx.sparkle(x, y);
      MH.audio.play('sell');
      MH.ui.toast(smashed ? `Fossil smashed by the blast! Fragments sold for $${v}.` : `Fossil found! Sold to a museum for $${v}.`, 'info');
      this.award('fossil');
    }

    explode(cx, cy, kind) {
      const w = this.world, st = this.stats();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, y = cy + dy, id = w.get(x, y), td = TILES[id];
          if (!w.inBounds(x, y) || !td.breakable || id === T.RELIC) continue;
          if (kind === 'explosive' && td.minTier > st.drillTier + 1) continue;
          this.breakTile(x, y, 'explosive');
        }
      }
      this.fx.explosion(cx, cy);
      MH.audio.play('explode');
      this.shake(0.6);
      if (kind === 'gas') {
        this.notify('gas', 'Gas pocket!', 'warn');
        const m = this.miner;
        if (Math.abs(m.x - cx) <= 1 && Math.abs(m.y - cy) <= 1) m.damage(C.GAS_DAMAGE, 'gas');
      }
    }

    boulderHit(x, y) {
      this.fx.shatter(x, y + 1);
      this.floater(x, y + 1, 'Crash!', '#ffb060');
      this.miner.damage(C.BOULDER_DAMAGE, 'boulder');
    }

    minerOccupies(x, y) { return !!this.miner && this.miner.occupies(x, y); }

    win() {
      if (this.state.won) return;
      this.state.won = true;
      this.award('core');
      MH.audio.play('win');
      MH.ui.showWin();
    }

    // ---------- Failure & recovery ----------
    onStranded() {
      if (this.strandedT !== null || this.atShop()) return;
      this.strandedT = C.STRANDED_DELAY;
      MH.audio.play('warn');
    }
    clearStranded() { this.strandedT = null; }
    updateStranded(dt) {
      if (this.strandedT === null) return;
      this.strandedT -= dt;
      if (this.strandedT <= 0) { this.strandedT = null; this.recover('fuel'); }
    }

    // Every half second while idle underground, check the miner can still drive
    // back to the surface. If not, offer recovery instead of leaving it trapped.
    updateStuck(dt) {
      const m = this.miner;
      if (m.anim || m.mining || m.depth === 0 || m.fuel <= 0 || this.state.upDrill) {
        if (m.depth === 0 || this.state.upDrill) this.stuck = false;
        return;
      }
      this.stuckCheckT = (this.stuckCheckT || 0) - dt;
      if (this.stuckCheckT > 0) return;
      this.stuckCheckT = 0.5;
      const was = this.stuck;
      this.stuck = !m.canReachSurface();
      if (this.stuck && !was) MH.audio.play('warn');
    }

    recoveryFee() {
      return Math.min(this.state.money, C.RECOVERY_BASE + C.RECOVERY_PER_M * this.miner.depth);
    }

    askRecovery() {
      if (this.miner.depth === 0) { this.notify('surf', 'You are already on the surface'); return; }
      const fee = this.recoveryFee();
      MH.ui.showConfirm('Call recovery?',
        `You will be towed to the surface.<br>You lose all cargo and pay <b>$${fee}</b>.`,
        () => this.recover('manual'));
    }

    recover(reason) {
      const m = this.miner, fee = this.recoveryFee(), lost = m.cargoCount;
      this.state.money -= fee;
      m.stopMining();
      m.cargo = {};
      m.reset();
      this.strandedT = null; this.stuck = false;
      this.updateCamera(0, true);
      MH.audio.play('teleport');
      const why = reason === 'fuel' ? 'Out of fuel' : reason === 'manual' ? 'Recovery called' : 'Miner destroyed';
      MH.ui.toast(`${why}: towed to the surface. Fee $${fee}${lost ? `, ${lost} cargo lost` : ''}.`, 'warn');
      this.save();
    }

    onDestroyed(cause) {
      const what = { lava: 'melted in lava', heat: 'overheated', gas: 'blown up by a gas pocket', boulder: 'crushed by a boulder', worm: 'eaten by the giant worm' }[cause] || 'destroyed';
      this.fx.explosion(this.miner.x, this.miner.y);
      MH.audio.play('explode');
      const fee = this.recoveryFee();
      MH.ui.showMessage('Miner destroyed!',
        `<p>Your miner was ${what}.</p><p>The recovery team will tow the wreck to the surface and fix it.<br>Cargo lost. Fee: <b>$${fee}</b>.</p>`,
        [{ label: 'Call recovery', primary: true, action: () => { MH.ui.closeModal(); this.recover('destroyed'); } }],
        false);
    }

    // ---------- Shop actions (each returns {ok, msg}) ----------
    sellAll() {
      const m = this.miner, s = this.state;
      const lines = []; let total = 0;
      for (const id in m.cargo) {
        const qty = m.cargo[id], td = TILES[id];
        if (!qty) continue;
        const val = td.value * qty;
        lines.push({ name: td.name, qty, val }); total += val;
      }
      if (!total) return { ok: false, msg: 'Nothing to sell' };
      m.cargo = {};
      s.money += total; s.stats.earned += total;
      MH.audio.play('sell');
      this.checkEarnings();
      return { ok: true, lines, total };
    }

    // One-click: sell all cargo, then fill the tank with whatever money there is.
    sellAndRefuel() {
      const sold = this.sellAll();
      const fuel = this.buyService('fuel');
      const parts = [];
      if (sold.ok) parts.push(`Sold ${sold.lines.reduce((n, l) => n + l.qty, 0)} ore for $${sold.total}`);
      if (fuel.ok) parts.push(fuel.msg);
      if (!parts.length) {
        const full = this.miner.fuel >= this.stats().fuelMax - 0.01;
        return { ok: false, msg: full ? 'Nothing to sell and the tank is full' : 'Nothing to sell and no money for fuel' };
      }
      return { ok: true, msg: parts.join('. ') };
    }

    buyService(kind) {
      const m = this.miner, s = this.state, st = this.stats();
      const isFuel = kind === 'fuel';
      const cur = isFuel ? m.fuel : m.hull, max = isFuel ? st.fuelMax : st.hullMax;
      const price = isFuel ? C.FUEL_PRICE : C.REPAIR_PRICE;
      const need = max - cur;
      if (need < 0.01) return { ok: false, msg: isFuel ? 'Tank already full' : 'Hull already perfect' };
      const cost = Math.ceil(need * price);
      let amount = need, paid = cost;
      if (s.money < cost) {
        if (s.money <= 0) { MH.audio.play('error'); return { ok: false, msg: 'Not enough money' }; }
        amount = s.money / price; paid = s.money;
      }
      s.money -= paid;
      if (isFuel) { m.fuel = Math.min(max, m.fuel + amount); this.strandedT = null; }
      else m.hull = Math.min(max, m.hull + amount);
      MH.audio.play('buy');
      return { ok: true, msg: `${isFuel ? 'Refuelled' : 'Repaired'} for $${paid}` };
    }

    partStatus(key) {
      const s = this.state, tier = s.parts[key], next = tier + 1, part = PARTS[key];
      if (next >= part.values.length) return { state: 'max' };
      if (next > VEHICLES[s.vehicle].maxTier) {
        const v = VEHICLES.find(v => v.maxTier >= next);
        return { state: 'vehicle', vehicle: v ? v.name : '?' };
      }
      return { state: 'buy', next, price: part.prices[next] };
    }

    buyPart(key) {
      const s = this.state, ps = this.partStatus(key), part = PARTS[key];
      if (ps.state !== 'buy') return { ok: false, msg: 'Not available' };
      if (s.money < ps.price) { MH.audio.play('error'); return { ok: false, msg: 'Not enough money' }; }
      const oldHull = this.stats().hullMax;
      s.money -= ps.price;
      s.parts[key] = ps.next;
      if (key === 'hull') this.miner.hull += this.stats().hullMax - oldHull;
      MH.audio.play('buy');
      return { ok: true, msg: `${part.name} upgraded to ${TIER_NAMES[ps.next]}` };
    }

    buyUpDrill() {
      const s = this.state;
      if (s.upDrill) return { ok: false, msg: 'Already owned' };
      if (s.money < UP_DRILL.price) { MH.audio.play('error'); return { ok: false, msg: 'Not enough money' }; }
      s.money -= UP_DRILL.price; s.upDrill = true;
      MH.audio.play('buy');
      return { ok: true, msg: 'Upward Drill fitted! Hold Up against rock to drill it' };
    }

    buyTripComp() {
      const s = this.state;
      if (s.tripComp) return { ok: false, msg: 'Already owned' };
      if (s.money < TRIP_COMP.price) { MH.audio.play('error'); return { ok: false, msg: 'Not enough money' }; }
      s.money -= TRIP_COMP.price; s.tripComp = true;
      MH.audio.play('buy');
      return { ok: true, msg: 'Trip Computer fitted! It shows the fuel you need to get home' };
    }

    // Trip Computer: every 0.4s work out the fuel needed to reach the surface.
    updateTrip(dt) {
      const m = this.miner;
      if (!this.state.tripComp) { this.trip = null; return; }
      if (m.depth === 0) { this.trip = { cost: 0 }; this.tripWarned = false; return; }
      this.tripT = (this.tripT || 0) - dt;
      if (this.tripT > 0 && this.trip) return;
      this.tripT = 0.4;
      const r = m.routeHome(20000);
      let trip;
      if (r.found) trip = { cost: r.cost };
      else if (this.state.upDrill && m.drillHomeCost() !== null) trip = { cost: m.drillHomeCost(), drill: true };
      else trip = { cost: null, unknown: !!r.unknown };
      this.trip = trip;
      // One warning per trip when fuel gets close to what's needed.
      if (trip.cost !== null && trip.cost > 0 && m.fuel < trip.cost * 1.25 + 1) {
        if (!this.tripWarned) {
          this.tripWarned = true;
          this.notify('tripfuel', 'Only just enough fuel to get home!', 'warn');
          MH.audio.play('warn');
        }
      }
    }

    buyVehicle(i) {
      const s = this.state, v = VEHICLES[i];
      if (i <= s.vehicle) return { ok: false, msg: 'Already owned' };
      if (s.money < v.price) { MH.audio.play('error'); return { ok: false, msg: 'Not enough money' }; }
      const oldHull = this.stats().hullMax;
      s.money -= v.price; s.vehicle = i;
      this.miner.hull += this.stats().hullMax - oldHull;
      MH.audio.play('buy');
      this.award('vehicle');
      return { ok: true, msg: `You now drive the ${v.name}!` };
    }

    buyItem(id, n) {
      const s = this.state, it = ITEMS.find(x => x.id === id), cost = it.price * n;
      if (s.money < cost) { MH.audio.play('error'); return { ok: false, msg: 'Not enough money' }; }
      s.money -= cost; s.items[id] += n;
      MH.audio.play('buy');
      return { ok: true, msg: `Bought ${n} ${it.name}${n > 1 ? 's' : ''}` };
    }

    dropCargo(id, n) {
      const m = this.miner;
      if (!m.cargo[id]) return;
      m.cargo[id] = Math.max(0, m.cargo[id] - n);
      if (!m.cargo[id]) delete m.cargo[id];
    }

    // ---------- Consumables ----------
    useItem(id) {
      const s = this.state, m = this.miner, st = this.stats(), it = ITEMS.find(x => x.id === id);
      if (!s.items[id]) {
        this.notify('noitem' + id, `No ${it.name.toLowerCase()}s left. Buy more at the shop`);
        MH.audio.play('error');
        return;
      }
      switch (id) {
        case 'explosive':
          this.explode(m.x, m.y, 'explosive');
          break;
        case 'teleport':
          if (m.depth === 0) { this.notify('tele', 'You are already on the surface'); return; }
          m.stopMining(); m.anim = null; m.fallSpeed = 0;
          this.fx.sparkle(m.x, m.y);
          m.x = C.START_X; m.y = C.SURFACE_Y - 1; m.px = m.x; m.py = m.y;
          this.strandedT = null;
          this.fx.sparkle(m.x, m.y);
          this.updateCamera(0, true);
          MH.audio.play('teleport');
          break;
        case 'fuelcan':
          if (m.fuel >= st.fuelMax - 0.01) { this.notify('fullfuel', 'Fuel tank is already full'); return; }
          m.fuel = Math.min(st.fuelMax, m.fuel + st.fuelMax * 0.4);
          this.strandedT = null;
          MH.audio.play('buy');
          break;
        case 'repair':
          if (m.hull >= st.hullMax - 0.01) { this.notify('fullhull', 'Hull is already perfect'); return; }
          m.hull = Math.min(st.hullMax, m.hull + st.hullMax * 0.4);
          MH.audio.play('buy');
          break;
        case 'support': {
          if (m.anim) { this.notify('placemove', "Can't place a block while moving"); return; }
          const w = this.world, spots = [];
          if (m.facing === 'left') spots.push([m.x - 1, m.y]);
          if (m.facing === 'right') spots.push([m.x + 1, m.y]);
          spots.push([m.x, m.y + 1], [m.x - 1, m.y], [m.x + 1, m.y]);
          const spot = spots.find(([x, y]) => w.inBounds(x, y) && y >= C.SURFACE_Y - 1 && !w.solid(x, y));
          if (!spot) { this.notify('noroom', 'No room to place a block'); MH.audio.play('error'); return; }
          w.set(spot[0], spot[1], T.SUPPORT);
          MH.audio.play('place');
          break;
        }
      }
      s.items[id]--;
    }

    // ---------- Effects ----------
    makeFx() {
      const g = this;
      const add = (x, y, vx, vy, life, color, size, grav) =>
        g.particles.push({ x, y, vx, vy, life, max: life, color, size: size || 1, grav: grav === undefined ? 200 : grav });
      const rnd = (a, b) => a + Math.random() * (b - a);
      return {
        debris(tx, ty, color) {
          for (let i = 0; i < 8; i++) add(tx * TS + rnd(2, 14), ty * TS + rnd(2, 14), rnd(-50, 50), rnd(-80, 10), rnd(0.3, 0.6), color, rnd(1, 3) | 0);
        },
        dust(tx, ty, color, mx, my) {
          const x = (tx + mx) / 2 * TS + TS / 2, y = (ty + my) / 2 * TS + TS / 2;
          add(x + rnd(-3, 3), y + rnd(-3, 3), rnd(-40, 40), rnd(-60, 0), rnd(0.2, 0.4), color, 1);
        },
        explosion(tx, ty) {
          const cols = ['#ffe060', '#ffa030', '#ff6020', '#888', '#555'];
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, sp = rnd(30, 140);
            add(tx * TS + 8, ty * TS + 8, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.3, 0.8), cols[(Math.random() * cols.length) | 0], rnd(1, 4) | 0, 60);
          }
        },
        shatter(tx, ty) {
          for (let i = 0; i < 12; i++) add(tx * TS + rnd(2, 14), ty * TS + rnd(4, 14), rnd(-70, 70), rnd(-90, -10), rnd(0.4, 0.8), i % 2 ? '#8a8a8a' : '#5e5e5e', rnd(1, 3) | 0);
          MH.audio.play('break');
          g.shake(0.15);
        },
        steam(tx, ty) {
          for (let i = 0; i < 8; i++) add(tx * TS + rnd(2, 14), ty * TS + rnd(2, 14), rnd(-15, 15), rnd(-50, -20), rnd(0.5, 1), '#e0e0e0', 2, -20);
        },
        sparkle(tx, ty) {
          for (let i = 0; i < 16; i++) add(tx * TS + 8, ty * TS + 8, rnd(-60, 60), rnd(-60, 60), rnd(0.3, 0.7), i % 2 ? '#a0f0ff' : '#ffffff', 1, 0);
        },
        ember(px, py) {
          add(px * TS + rnd(2, 14), py * TS + rnd(6, 14), rnd(-10, 10), rnd(-40, -15), rnd(0.3, 0.6), Math.random() < 0.5 ? '#ff8030' : '#ffd040', 1, -10);
        },
      };
    }

    floater(tx, ty, text, color) {
      this.floaters.push({ x: tx * TS + 8, y: ty * TS, text, color, t: 0 });
    }

    shake(amount) { this.shakeAmt = Math.max(this.shakeAmt, amount); this.shakeT = 0.3; }

    updateFx(dt) {
      for (const p of this.particles) {
        p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const f of this.floaters) { f.t += dt; f.y -= 14 * dt; }
      this.floaters = this.floaters.filter(f => f.t < 1.2);
      if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeAmt = 0; }
    }

    // ---------- Camera ----------
    clampCamera() {
      const w = this.world, ww = w.w * TS, wh = w.h * TS;
      if (this.viewW >= ww) this.cam.x = (ww - this.viewW) / 2;
      else this.cam.x = Math.max(0, Math.min(ww - this.viewW, this.cam.x));
      this.cam.y = Math.max(0, Math.min(wh - this.viewH, this.cam.y));
    }
    updateCamera(dt, snap) {
      const m = this.miner;
      if (!m) return;
      const tx = m.px * TS + TS / 2 - this.viewW / 2;
      const ty = m.py * TS + TS / 2 - this.viewH / 2;
      const k = snap ? 1 : Math.min(1, dt * 8);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
      this.clampCamera();
    }
    menuCamera() {
      const top = C.SURFACE_Y * TS - this.viewH * 0.55;
      this.cam.x = 0;
      this.cam.y = top + (1 - Math.cos(this.time * 0.06)) * 0.5 * 70 * TS;
      this.clampCamera();
    }

    // ---------- Rendering ----------
    darkness(x, y, mx, my, light) {
      const d = y - C.SURFACE_Y;
      if (d < 1) return 0;
      const base = Math.min(0.95, (d - 1) / 40 * 0.95);
      if (mx === null) return base * 0.55;
      const dist = Math.hypot(x + 0.5 - mx, y + 0.5 - my);
      const f = Math.max(0, Math.min(1, (dist - light * 0.55) / (light * 0.45 + 2)));
      return base * f;
    }

    render() {
      const ctx = this.ctx, sc = this.scale, w = this.world;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const sky = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      sky.addColorStop(0, '#5aa8e0'); sky.addColorStop(1, '#bfe6fa');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      if (!w) return;

      let sx = 0, sy = 0;
      if (this.shakeT > 0) { sx = (Math.random() - 0.5) * this.shakeAmt * 12; sy = (Math.random() - 0.5) * this.shakeAmt * 12; }
      const cx = Math.round(this.cam.x + sx), cy = Math.round(this.cam.y + sy);
      ctx.setTransform(sc, 0, 0, sc, -cx * sc, -cy * sc);

      const SY = C.SURFACE_Y;
      this.drawSkyDecor(ctx, cx, cy);
      ctx.fillStyle = '#0c0c10';
      ctx.fillRect(cx - 4, SY * TS, this.viewW + 8, w.h * TS);

      const x0 = Math.max(0, Math.floor(cx / TS)), x1 = Math.min(w.w - 1, Math.floor((cx + this.viewW) / TS));
      const y0 = Math.max(0, Math.floor(cy / TS)), y1 = Math.min(w.h - 1, Math.floor((cy + this.viewH) / TS));
      const tex = MH.tex;
      const waterF = (this.time * 2) | 0, lavaF = (this.time * 1.5) | 0;

      for (let y = y0; y <= y1; y++) {
        const d = y - SY;
        for (let x = x0; x <= x1; x++) {
          const id = w.get(x, y), td = TILES[id], X = x * TS, Y = y * TS;
          if (!td.solid) {
            if (d >= 0) {
              ctx.drawImage(tex.background(d, x, y), X, Y);
              if (d > 0 && w.solid(x, y - 1)) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X, Y, TS, 2); }
            }
            if (id === T.WATER) {
              ctx.drawImage(tex.water[(waterF + x + y) % 2], X, Y);
              if (w.get(x, y - 1) !== T.WATER) { ctx.fillStyle = 'rgba(170,215,255,0.75)'; ctx.fillRect(X, Y, TS, 1); }
            } else if (id === T.LAVA) {
              ctx.drawImage(tex.lava[(lavaF + x * 3 + y) % 2], X, Y);
            }
            continue;
          }
          let ox = 0;
          if (id === T.BOULDER && w.shaking.has(y * w.w + x)) ox = Math.random() < 0.5 ? -1 : 1;
          ctx.drawImage(tex.tile(id, x, y), X + ox, Y);
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          if (y - 1 >= SY && !w.solid(x, y - 1)) ctx.fillRect(X, Y, TS, 1);
          if (!w.solid(x, y + 1)) ctx.fillRect(X, Y + TS - 1, TS, 1);
          if (y >= SY) {
            if (!w.solid(x - 1, y)) ctx.fillRect(X, Y, 1, TS);
            if (!w.solid(x + 1, y)) ctx.fillRect(X + TS - 1, Y, 1, TS);
          }
        }
      }

      this.drawShop(ctx);

      const m = this.miner;
      if (m) {
        if (m.mining) {
          const stage = Math.min(3, Math.floor(m.mining.p / m.mining.need * 4));
          ctx.drawImage(tex.cracks[stage], m.mining.x * TS, m.mining.y * TS);
        }
        const st = this.stats();
        const img = tex.miner(st.color, m.facing, m.frame);
        let jx = 0, jy = 0;
        if (m.mining) { jx = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0; jy = Math.random() < 0.3 ? 1 : 0; }
        ctx.drawImage(img, Math.round(m.px * TS) + jx, Math.round(m.py * TS) + jy);
      }

      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // Darkness
      const st = m ? this.stats() : null;
      const mx = m ? m.px + 0.5 : null, my = m ? m.py + 0.5 : null, light = st ? st.light : 0;
      for (let y = Math.max(y0, SY + 1); y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          let a = this.darkness(x, y, mx, my, light);
          if (w.get(x, y) === T.LAVA) a *= 0.3;
          const k = Math.round(a * 20);
          if (k > 0) { ctx.fillStyle = this.alphaStr[k]; ctx.fillRect(x * TS, y * TS, TS, TS); }
        }
      }

      if (m && this.worms && this.mode !== 'menu') this.worms.draw(ctx, x0, x1);

      // Scanner
      if (m && st.scan > 0) this.drawScanner(ctx, m, st, x0, x1, y0, y1);

      // Floating text
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      for (const f of this.floaters) {
        ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
        ctx.fillStyle = '#000';
        ctx.fillText(f.text, Math.round(f.x) + 1, Math.round(f.y) + 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, Math.round(f.x), Math.round(f.y));
      }
      ctx.globalAlpha = 1;

      // Heat tint
      if (m && m.burning) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgba(255,60,0,${0.1 + 0.06 * Math.sin(this.time * 10)})`;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    drawScanner(ctx, m, st, x0, x1, y0, y1) {
      const w = this.world, r = st.scan, blink = 0.5 + 0.5 * Math.sin(this.time * 5);
      const mx = m.px + 0.5, my = m.py + 0.5;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (Math.hypot(x + 0.5 - mx, y + 0.5 - my) > r) continue;
          const id = w.get(x, y);
          let outline = null;
          if (TILES[id].collect || id === T.FOSSIL) {
            if (this.darkness(x, y, mx, my, st.light) > 0.3) {
              ctx.globalAlpha = 0.55;
              ctx.drawImage(MH.tex.tile(id, x, y), x * TS, y * TS);
              ctx.globalAlpha = 1;
            }
            outline = `rgba(255,255,255,${0.25 + 0.35 * blink})`;
          } else if (id === T.GAS && st.scanTier >= 2) outline = `rgba(120,255,80,${0.4 + 0.5 * blink})`;
          else if (id === T.BOULDER && st.scanTier >= 3) outline = `rgba(255,150,40,${0.4 + 0.5 * blink})`;
          if (outline) {
            ctx.strokeStyle = outline; ctx.lineWidth = 1;
            ctx.strokeRect(x * TS + 0.5, y * TS + 0.5, TS - 1, TS - 1);
          }
        }
      }
    }

    drawSkyDecor(ctx, cx, cy) {
      const SY = C.SURFACE_Y * TS;
      if (cy > SY) return;
      // clouds
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 6; i++) {
        const span = this.world.w * TS + 200;
        const x = ((i * 173 + this.time * (4 + i)) % span) - 100;
        const y = 12 + ((i * 37) % 60);
        ctx.fillRect(Math.round(x), y, 28, 6);
        ctx.fillRect(Math.round(x) + 6, y - 4, 14, 4);
        ctx.fillRect(Math.round(x) + 4, y + 6, 22, 2);
      }
      // hills
      for (let X = Math.floor(cx / 2) * 2; X < cx + this.viewW; X += 2) {
        const h1 = 26 + 10 * Math.sin(X * 0.011) + 6 * Math.sin(X * 0.037 + 2);
        ctx.fillStyle = '#8cc878'; ctx.fillRect(X, SY - h1, 2, h1);
        const h2 = 14 + 6 * Math.sin(X * 0.02 + 1) + 4 * Math.sin(X * 0.053);
        ctx.fillStyle = '#5e9e4e'; ctx.fillRect(X, SY - h2, 2, h2);
      }
    }

    drawShop(ctx) {
      const Y = C.SURFACE_Y * TS, x0 = C.SHOP_X * TS;
      const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
      // walls
      r(x0 + 2, Y - 40, 76, 40, '#b07040');
      for (let y = Y - 38; y < Y; y += 4) r(x0 + 2, y, 76, 1, '#9a6034');
      // roof
      for (let i = 0; i < 7; i++) {
        const w = 86 - i * 10;
        r(x0 + 40 - w / 2, Y - 42 - i * 2, w, 2, i % 2 ? '#a03028' : '#c04034');
      }
      // windows
      for (const wx of [x0 + 8, x0 + 58]) {
        r(wx - 1, Y - 31, 16, 12, '#5a3a20');
        r(wx, Y - 30, 14, 10, '#9fe0ff');
        r(wx + 6, Y - 30, 2, 10, '#5a3a20');
        r(wx + 1, Y - 29, 3, 2, '#e8fbff');
      }
      // door
      r(x0 + 33, Y - 23, 14, 23, '#5a3a20');
      r(x0 + 34, Y - 22, 12, 22, '#7a4a24');
      r(x0 + 43, Y - 12, 2, 2, '#f0d060');
      // sign
      r(x0 + 26, Y - 39, 28, 9, '#5a3a20');
      r(x0 + 27, Y - 38, 26, 7, '#f0d890');
      pixelText(ctx, 'SHOP', x0 + 32, Y - 37, '#7a2a10');
      // fuel pump
      const px = C.PUMP_X * TS;
      r(px + 3, Y - 22, 10, 22, '#c83030');
      r(px + 2, Y - 24, 12, 3, '#9a2020');
      r(px + 5, Y - 19, 6, 4, '#203820');
      r(px + 6, Y - 18, 3, 1, '#60ff60');
      r(px + 13, Y - 16, 2, 9, '#222');
      r(px + 12, Y - 8, 3, 2, '#444');
    }
  }

  MH.Game = Game;
})(window.MH);
