// HUD, menus, shop and other screens (HTML overlays).
(function (MH) {
  'use strict';
  const { T, TILES, CONFIG: C, PARTS, PART_ORDER, VEHICLES, ITEMS, ACHIEVEMENTS, TIER_NAMES, UP_DRILL, TRIP_COMP, ACTION_NAMES, MOVE_RULES } = MH;

  const $ = id => document.getElementById(id);
  const money = n => '$' + Math.floor(n).toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmtTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }
  function swatch(color) { return `<span class="swatch" style="background:${color}"></span>`; }

  const ui = {
    game: null, current: null, closable: true, handlers: {}, hudCache: {},
    shopTab: 'sell', shopMsg: '', settingsReturn: null,

    init(game) {
      this.game = game;
      this.modal = $('modal'); this.panel = $('modal-panel');
      this.panel.addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (!btn || btn.disabled) return;
        MH.audio.ensure();
        MH.audio.play('click');
        const fn = this.handlers[btn.dataset.act];
        if (fn) fn(btn.dataset.arg, btn);
      });
      this.panel.addEventListener('input', e => {
        const el = e.target;
        if (el.dataset.setting) {
          MH.settings[el.dataset.setting] = el.type === 'range' ? +el.value : el.value;
          MH.saveSettings();
          MH.audio.applyVolumes();
        }
      });
      window.addEventListener('keydown', e => {
        if (e._mhRebind || !this.current) return;
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' && e.code !== 'Escape') return;
        const b = MH.settings.bindings;
        const isPause = e.code === 'Escape' || b.pause.includes(e.code);
        const isShopKey = this.current === 'shop' && b.interact.includes(e.code);
        const isCargoKey = this.current === 'cargo' && b.cargo.includes(e.code);
        if (isPause || isShopKey || isCargoKey) {
          e.preventDefault();
          MH.input.swallow(e.code);
          this.escape();
        }
      });
      this.buildHUD();
    },

    // ---------- Modal plumbing ----------
    openModal(html, opts) {
      opts = opts || {};
      this.current = opts.name || 'modal';
      this.closable = opts.closable !== false;
      this.handlers = Object.assign({ close: () => this.escape() }, opts.handlers || {});
      this.panel.className = 'panel modal-panel' + (opts.wide ? ' wide' : '');
      this.panel.innerHTML = html;
      this.modal.classList.remove('hidden');
      this.game.pause();
    },
    closeModal() {
      this.modal.classList.add('hidden');
      this.panel.innerHTML = '';
      this.current = null;
      MH.input.rebindCallback = null;
      this.game.resume();
    },
    escape() {
      if (!this.current) return;
      if (this.current === 'settings' || this.current === 'help') { this.goBack(); return; }
      if (this.closable) this.closeModal();
    },
    goBack() {
      MH.input.rebindCallback = null;
      if (this.settingsReturn === 'pause') this.showPause();
      else this.showMainMenu();
    },

    // ---------- Toasts / prompt ----------
    toast(text, kind) {
      const box = $('toasts');
      const el = document.createElement('div');
      el.className = 'toast ' + (kind || 'info');
      el.textContent = text;
      box.appendChild(el);
      while (box.children.length > 5) box.removeChild(box.firstChild);
      setTimeout(() => el.classList.add('fade'), 3200);
      setTimeout(() => el.remove(), 3800);
    },
    setPrompt(text, kind) {
      const el = $('prompt');
      if (!text) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
      if (el.textContent !== text) el.textContent = text;
      el.className = kind === 'warn' ? 'warn' : '';
    },
    keyLabel(action) {
      const code = (MH.settings.bindings[action] || [])[0];
      return this.codeLabel(code);
    },
    codeLabel(code) {
      if (!code) return '—';
      const map = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', Space: 'Space', Enter: 'Enter', ShiftLeft: 'LShift', ShiftRight: 'RShift', ControlLeft: 'LCtrl', ControlRight: 'RCtrl' };
      if (map[code]) return map[code];
      if (code.startsWith('Key')) return code.slice(3);
      if (code.startsWith('Digit')) return code.slice(5);
      if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
      return code;
    },

    // ---------- HUD ----------
    buildHUD() {
      const items = $('hud-items');
      items.innerHTML = ITEMS.map((it, i) =>
        `<div class="item" title="${esc(it.name)}: ${esc(it.desc)}"><span class="key" id="item-key-${i}"></span><span class="name">${it.short}</span><span class="count" id="item-count-${i}">0</span></div>`).join('');
    },
    showHUD(on) {
      $('hud').classList.toggle('hidden', !on);
      $('hud-items').classList.toggle('hidden', !on);
      this.hudCache = {};
    },
    setText(id, text) {
      if (this.hudCache[id] === text) return;
      this.hudCache[id] = text;
      $(id).textContent = text;
    },
    setBar(id, frac, text, low) {
      const key = id + frac.toFixed(3) + text + low;
      if (this.hudCache[id] === key) return;
      this.hudCache[id] = key;
      const bar = $(id);
      bar.querySelector('.fill').style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
      bar.querySelector('.txt').textContent = text;
      bar.classList.toggle('low', !!low);
    },
    updateHUD(game) {
      const s = game.state, m = game.miner, st = game.stats();
      this.setText('hud-money', money(s.money));
      this.setText('hud-depth', m.depth + 'm');
      const cc = m.cargoCount;
      this.setBar('bar-cargo', cc / st.cargoCap, `Cargo ${cc}/${st.cargoCap}`, cc >= st.cargoCap);
      this.setBar('bar-fuel', m.fuel / st.fuelMax, `Fuel ${Math.ceil(m.fuel)}/${st.fuelMax}`, m.fuel / st.fuelMax < C.LOW_FUEL);
      this.setBar('bar-hull', m.hull / st.hullMax, `Hull ${Math.ceil(m.hull)}/${st.hullMax}`, m.hull / st.hullMax < C.LOW_HULL);
      // Trip Computer: fuel needed to reach the surface, plus a marker on the fuel bar.
      const trip = game.trip, mark = $('fuel-mark'), tripEl = $('hud-trip');
      if (!trip) {
        mark.classList.add('hidden'); tripEl.classList.add('hidden');
      } else {
        tripEl.classList.remove('hidden');
        let text, cls;
        if (trip.cost === null) {
          text = trip.unknown ? 'To surface: ?' : 'To surface: NO WAY UP';
          cls = trip.unknown ? 'tight' : 'bad';
          mark.classList.add('hidden');
        } else {
          const need = Math.ceil(trip.cost * 10) / 10;
          text = `To surface: ${need.toFixed(1)} fuel${trip.drill ? ' (drilling)' : ''}`;
          cls = m.fuel >= trip.cost * 1.5 + 1 ? 'ok' : m.fuel >= trip.cost ? 'tight' : 'bad';
          mark.classList.toggle('hidden', trip.cost <= 0);
          mark.style.left = (Math.min(1, trip.cost / st.fuelMax) * 100).toFixed(1) + '%';
        }
        this.setText('hud-trip', text);
        tripEl.className = cls;
      }
      const heat = game.heatLevel(m.depth);
      const heatText = heat ? (heat > st.cooling ? `HEAT ${heat} > COOLING ${st.cooling}!` : `Heat ${heat} (cooled)`) : '';
      this.setText('hud-heat', heatText);
      $('hud-heat').className = heat > st.cooling ? 'warn' : 'ok';
      ITEMS.forEach((it, i) => {
        this.setText('item-key-' + i, this.keyLabel('item' + (i + 1)));
        this.setText('item-count-' + i, String(s.items[it.id]));
      });
    },

    // ---------- Main menu ----------
    showMainMenu() {
      const hasSave = MH.save.exists();
      this.settingsReturn = 'menu';
      this.openModal(`
        <h1 class="title">MAKING<br>A HOLE</h1>
        <p class="subtitle">Dig deep. Get rich. Find the Ancient Core.</p>
        <div class="menu">
          <button data-act="continue" ${hasSave ? '' : 'disabled'}>Continue</button>
          <button data-act="new" class="primary">New game</button>
          <label class="seed">Seed (optional) <input id="seed-input" type="text" maxlength="24" placeholder="random"></label>
          <button data-act="help">How to play</button>
          <button data-act="settings">Settings</button>
        </div>`, {
        name: 'main', closable: false,
        handlers: {
          continue: () => { if (!this.game.loadGame()) this.toast('Save could not be loaded', 'warn'); },
          new: () => {
            const seed = $('seed-input').value;
            if (hasSave) {
              this.showConfirm('Start a new game?', 'This replaces your current save.', () => this.game.newGame(seed), () => this.showMainMenu());
            } else this.game.newGame(seed);
          },
          help: () => this.showHelp(),
          settings: () => this.showSettings(),
        },
      });
    },

    showHelp() {
      const k = a => `<span class="k">${esc(this.keyLabel(a))}</span>`;
      this.current = 'help';
      this.openModal(`
        <h2>How to play</h2>
        <div class="help">
          <p>${k('left')} ${k('right')} drive, and drill into rock beside you. ${k('down')} drills downwards.</p>
          <p>Hold ${k('up')} to climb. You need a wall touching your left or right side. Let go and you fall (falling never hurts).</p>
          <p>Ore is collected automatically. Dirt and rock are not. Watch your cargo space!</p>
          <p>Drive back to the shop and press ${k('interact')} to sell ore, refuel, repair and upgrade.</p>
          <p>Fuel runs out as you drive and drill. If it hits zero you get towed home, but you lose your cargo and pay a fee. ${k('recover')} calls the tow truck any time.</p>
          <p>Some rock needs a better drill. Look out for gas pockets, falling boulders, water, and deep heat and lava.</p>
          <p>Items: ${ITEMS.map((it, i) => `${k('item' + (i + 1))} ${esc(it.name)}`).join(', ')}.</p>
          <p>${k('cargo')} cargo &nbsp; ${k('pause')} pause</p>
          <p>Somewhere at the very bottom lies the <b>Ancient Core</b>...</p>
        </div>
        <div class="actions"><button data-act="back" class="primary">Back</button></div>`,
        { name: 'help', closable: false, handlers: { back: () => this.goBack() } });
    },

    // ---------- Pause ----------
    showPause() {
      const g = this.game, s = g.state;
      this.settingsReturn = 'pause';
      const got = ACHIEVEMENTS.filter(a => s.achievements[a.id]).length;
      const ach = ACHIEVEMENTS.map(a => `<li class="${s.achievements[a.id] ? 'got' : ''}" title="${esc(a.desc)}">${s.achievements[a.id] ? '★' : '☆'} ${esc(a.name)}<small>${esc(a.desc)}</small></li>`).join('');
      this.openModal(`
        <h2>Paused</h2>
        <div class="cols">
          <div class="menu">
            <button data-act="close" class="primary">Resume</button>
            <button data-act="save">Save game</button>
            <button data-act="help">How to play</button>
            <button data-act="settings">Settings</button>
            <button data-act="quit">Save &amp; quit to menu</button>
          </div>
          <div>
            <table class="stats">
              <tr><td>Deepest</td><td>${s.stats.deepest}m</td></tr>
              <tr><td>Total earned</td><td>${money(s.stats.earned)}</td></tr>
              <tr><td>Tiles mined</td><td>${s.stats.mined.toLocaleString('en-US')}</td></tr>
              <tr><td>Fossils found</td><td>${s.stats.fossils || 0}</td></tr>
              <tr><td>Play time</td><td>${fmtTime(s.stats.playTime)}</td></tr>
              <tr><td>Seed</td><td>${esc(s.seed)}</td></tr>
            </table>
            <h3>Achievements ${got}/${ACHIEVEMENTS.length}</h3>
            <ul class="ach">${ach}</ul>
          </div>
        </div>`, {
        name: 'pause', wide: true,
        handlers: {
          save: () => { if (g.save()) this.toast('Game saved', 'info'); },
          help: () => this.showHelp(),
          settings: () => this.showSettings(),
          quit: () => g.quitToMenu(),
        },
      });
    },

    // ---------- Settings ----------
    showSettings() {
      const s = MH.settings;
      const slider = (key, label) =>
        `<label class="slider">${label}<input type="range" min="0" max="1" step="0.05" value="${s[key]}" data-setting="${key}"></label>`;
      const rules = Object.keys(MOVE_RULES).map(k =>
        `<option value="${k}" ${s.moveRule === k ? 'selected' : ''}>${esc(MOVE_RULES[k])}</option>`).join('');
      const keys = Object.keys(ACTION_NAMES).map(a =>
        `<tr><td>${esc(ACTION_NAMES[a])}</td><td><span class="k">${esc(this.codeLabel(s.bindings[a][0]))}</span>${s.bindings[a][1] ? ` <span class="k alt">${esc(this.codeLabel(s.bindings[a][1]))}</span>` : ''}</td><td><button class="small" data-act="rebind" data-arg="${a}">Change</button></td></tr>`).join('');
      this.openModal(`
        <h2>Settings</h2>
        <div class="cols">
          <div>
            <h3>Sound</h3>
            ${slider('master', 'Master')}
            ${slider('sfx', 'Effects')}
            ${slider('music', 'Music')}
            <h3>Movement rule (for playtesting)</h3>
            <select data-setting="moveRule" class="rule">${rules}</select>
          </div>
          <div>
            <h3>Keys</h3>
            <table class="keys">${keys}</table>
            <button class="small" data-act="resetkeys">Reset keys</button>          </div>
        </div>
        <div class="actions"><button data-act="back" class="primary">Back</button></div>`, {
        name: 'settings', wide: true, closable: false,
        handlers: {
          back: () => this.goBack(),
          resetkeys: () => { MH.resetBindings(); MH.saveSettings(); this.showSettings(); },          rebind: (action, btn) => {
            btn.textContent = 'Press a key...';
            MH.input.rebindCallback = code => {
              if (code !== 'Escape') {
                const b = MH.settings.bindings;
                for (const a in b) b[a] = b[a].filter(c => c !== code || a === action);
                if (b[action][0] !== code) b[action] = [code].concat(b[action].slice(1).filter(c => c !== code));
                MH.saveSettings();
              }
              this.showSettings();
            };
          },
        },
      });
      this.current = 'settings';
    },

    // ---------- Generic dialogs ----------
    showMessage(title, html, buttons, closable) {
      const handlers = {};
      const btns = buttons.map((b, i) => { handlers['b' + i] = b.action; return `<button data-act="b${i}" class="${b.primary ? 'primary' : ''}">${esc(b.label)}</button>`; }).join('');
      this.openModal(`<h2>${esc(title)}</h2><div class="msgbody">${html}</div><div class="actions">${btns}</div>`,
        { name: 'message', closable: closable !== false, handlers });
    },
    showConfirm(title, html, onYes, onNo) {
      this.showMessage(title, html, [
        { label: 'Yes', primary: true, action: () => { this.closeModal(); onYes(); } },
        { label: 'Cancel', action: () => { if (onNo) onNo(); else this.closeModal(); } },
      ], !onNo);
    },
    showWin() {
      const s = this.game.state;
      this.showMessage('You found the Ancient Core!',
        `<p class="big">★ ★ ★</p>
         <p>Deep beneath the world, your drill breaks through to a glowing core of pure crystal. It is worth <b>${money(C.WIN_VALUE)}</b> at the shop.</p>
         <table class="stats">
           <tr><td>Play time</td><td>${fmtTime(s.stats.playTime)}</td></tr>
           <tr><td>Total earned</td><td>${money(s.stats.earned)}</td></tr>
           <tr><td>Tiles mined</td><td>${s.stats.mined.toLocaleString('en-US')}</td></tr>
         </table>
         <p>You can keep digging as long as you like.</p>`,
        [{ label: 'Keep digging', primary: true, action: () => this.closeModal() }]);
    },

    // ---------- Cargo ----------
    showCargo() {
      const g = this.game, m = g.miner, st = g.stats();
      const ids = Object.keys(m.cargo).filter(id => m.cargo[id] > 0);
      let total = 0;
      const rows = ids.map(id => {
        const td = TILES[id], q = m.cargo[id]; total += td.value * q;
        return `<tr><td>${swatch(td.color)}${esc(td.name)}</td><td>${q}</td><td>${money(td.value * q)}</td>
          <td><button class="small" data-act="drop" data-arg="${id}-1">Drop 1</button> <button class="small" data-act="drop" data-arg="${id}-all">Drop all</button></td></tr>`;
      }).join('');
      this.openModal(`
        <h2>Cargo ${m.cargoCount}/${st.cargoCap}</h2>
        ${ids.length ? `<table class="list"><tr><th>Ore</th><th>Qty</th><th>Value</th><th></th></tr>${rows}
          <tr class="total"><td>Total</td><td></td><td>${money(total)}</td><td></td></tr></table>`
          : '<p>Your cargo bay is empty.</p>'}
        <div class="actions"><button data-act="close" class="primary">Close</button></div>`, {
        name: 'cargo',
        handlers: {
          drop: arg => {
            const [id, n] = arg.split('-');
            g.dropCargo(id, n === 'all' ? Infinity : 1);
            this.showCargo();
          },
        },
      });
    },

    // ---------- Shop ----------
    showShop(tab) {
      if (tab) this.shopTab = tab;
      this.shopMsg = '';
      this.game.save();
      this.renderShop();
    },
    shopResult(r) {
      this.shopMsg = `<span class="${r.ok ? 'ok' : 'bad'}">${esc(r.msg)}</span>`;
      this.renderShop();
    },
    renderShop() {
      const g = this.game, s = g.state, m = g.miner, st = g.stats();
      const tabs = [['sell', 'Sell'], ['services', 'Fuel & repair'], ['upgrades', 'Upgrades'], ['vehicles', 'Vehicles'], ['items', 'Items']]
        .map(([k, n]) => `<button class="tab ${this.shopTab === k ? 'active' : ''}" data-act="tab" data-arg="${k}">${n}</button>`).join('');
      // Quick action above the tabs: always visible.
      let cargoValue = 0;
      for (const id in m.cargo) cargoValue += TILES[id].value * m.cargo[id];
      const fuelGap = st.fuelMax - m.fuel;
      const fuelCost = Math.min(Math.ceil(fuelGap * C.FUEL_PRICE), s.money + cargoValue);
      const quickBits = [];
      if (cargoValue) quickBits.push(`+${money(cargoValue)}`);
      if (fuelGap >= 0.01 && fuelCost > 0) quickBits.push(`fuel -${money(fuelCost)}`);
      const quick = `<div class="quick"><button class="primary" data-act="sellrefuel" ${quickBits.length ? '' : 'disabled'}>Sell all &amp; refuel${quickBits.length ? ` <small>(${quickBits.join(', ')})</small>` : ''}</button></div>`;
      let body = '';
      if (this.shopTab === 'sell') {
        const ids = Object.keys(m.cargo).filter(id => m.cargo[id] > 0);
        let total = 0;
        const rows = ids.map(id => {
          const td = TILES[id], q = m.cargo[id]; total += td.value * q;
          return `<tr><td>${swatch(td.color)}${esc(td.name)}</td><td>${q}</td><td>${money(td.value)}</td><td>${money(td.value * q)}</td></tr>`;
        }).join('');
        body = ids.length
          ? `<table class="list"><tr><th>Ore</th><th>Qty</th><th>Each</th><th>Total</th></tr>${rows}</table>
             <button class="primary" data-act="sell">Sell everything for ${money(total)}</button>`
          : '<p>Your cargo bay is empty. Go dig!</p>';
      } else if (this.shopTab === 'services') {
        const fuelNeed = st.fuelMax - m.fuel, hullNeed = st.hullMax - m.hull;
        const fuelCost = Math.ceil(fuelNeed * C.FUEL_PRICE), hullCost = Math.ceil(hullNeed * C.REPAIR_PRICE);
        body = `<table class="list">
          <tr><td>Fuel</td><td>${Math.ceil(m.fuel)}/${st.fuelMax}</td><td>${money(C.FUEL_PRICE)} per unit</td>
            <td><button data-act="fuel" ${fuelNeed < 0.01 ? 'disabled' : ''}>${fuelNeed < 0.01 ? 'Full' : 'Refuel ' + money(fuelCost)}</button></td></tr>
          <tr><td>Hull</td><td>${Math.ceil(m.hull)}/${st.hullMax}</td><td>${money(C.REPAIR_PRICE)} per point</td>
            <td><button data-act="repair" ${hullNeed < 0.01 ? 'disabled' : ''}>${hullNeed < 0.01 ? 'Perfect' : 'Repair ' + money(hullCost)}</button></td></tr>
          </table><p class="hint">Short of money? You'll get as much as you can afford.</p>`;
      } else if (this.shopTab === 'upgrades') {
        const rows = PART_ORDER.map(key => {
          const p = PARTS[key], tier = s.parts[key], ps = g.partStatus(key);
          let action;
          if (ps.state === 'max') action = '<span class="tag">MAX</span>';
          else if (ps.state === 'vehicle') action = `<span class="tag">Needs ${esc(ps.vehicle)}</span>`;
          else action = `<button data-act="part" data-arg="${key}" ${s.money < ps.price ? 'disabled' : ''}>Buy ${money(ps.price)}</button>`;
          const next = ps.state === 'max' ? '' : ` &gt; <b>${TIER_NAMES[tier + 1]}</b> ${esc(p.fmt(p.values[tier + 1]))}`;
          return `<tr><td><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></td><td>${TIER_NAMES[tier]} ${esc(p.fmt(p.values[tier]))}${next}</td><td>${action}</td></tr>`;
        }).join('');
        const up = s.upDrill ? '<span class="tag">Owned</span>'
          : `<button data-act="updrill" ${s.money < UP_DRILL.price ? 'disabled' : ''}>Buy ${money(UP_DRILL.price)}</button>`;
        const trip = s.tripComp ? '<span class="tag">Owned</span>'
          : `<button data-act="tripcomp" ${s.money < TRIP_COMP.price ? 'disabled' : ''}>Buy ${money(TRIP_COMP.price)}</button>`;
        body = `<p class="hint">Your ${esc(VEHICLES[s.vehicle].name)} takes parts up to ${TIER_NAMES[st.maxTier]}.</p>
          <table class="list">${rows}
            <tr><td><b>${esc(TRIP_COMP.name)}</b><small>${esc(TRIP_COMP.desc)}</small></td><td>${s.tripComp ? 'Fitted' : 'Not fitted'}</td><td>${trip}</td></tr>
            <tr><td><b>${esc(UP_DRILL.name)}</b><small>${esc(UP_DRILL.desc)}</small></td><td>${s.upDrill ? 'Fitted' : 'Not fitted'}</td><td>${up}</td></tr></table>`;
      } else if (this.shopTab === 'vehicles') {
        const rows = VEHICLES.map((v, i) => {
          let action;
          if (i === s.vehicle) action = '<span class="tag">Driving</span>';
          else if (i < s.vehicle) action = '<span class="tag">Traded in</span>';
          else action = `<button data-act="vehicle" data-arg="${i}" ${s.money < v.price ? 'disabled' : ''}>Buy ${money(v.price)}</button>`;
          return `<tr><td>${swatch(v.color)}<b>${esc(v.name)}</b></td><td>Parts up to ${TIER_NAMES[v.maxTier]}</td><td>+${v.hullBonus} hull</td><td>${action}</td></tr>`;
        }).join('');
        body = `<p class="hint">A better vehicle lets you fit better parts. Your upgrades move across.</p><table class="list">${rows}</table>`;
      } else if (this.shopTab === 'items') {
        const rows = ITEMS.map((it, i) => `<tr><td><span class="k">${esc(this.keyLabel('item' + (i + 1)))}</span> <b>${esc(it.name)}</b><small>${esc(it.desc)}</small></td>
          <td>Own ${s.items[it.id]}</td><td>${money(it.price)}</td>
          <td><button data-act="item" data-arg="${it.id}-1" ${s.money < it.price ? 'disabled' : ''}>Buy 1</button>
              <button data-act="item" data-arg="${it.id}-5" ${s.money < it.price * 5 ? 'disabled' : ''}>Buy 5</button></td></tr>`).join('');
        body = `<table class="list">${rows}</table>`;
      }
      this.openModal(`
        <h2>Shop <span class="money">${money(s.money)}</span></h2>
        ${quick}
        <div class="tabs">${tabs}</div>
        <div class="tab-body">${body}</div>
        <div class="shopmsg">${this.shopMsg}</div>
        <div class="actions"><button data-act="close">Leave shop</button></div>`, {
        name: 'shop', wide: true,
        handlers: {
          tab: k => { this.shopTab = k; this.shopMsg = ''; this.renderShop(); },
          sell: () => {
            const r = g.sellAll();
            if (!r.ok) return this.shopResult(r);
            this.shopMsg = `<span class="ok">Sold ${r.lines.map(l => `${l.qty} ${esc(l.name)} (${money(l.val)})`).join(', ')}. Total <b>${money(r.total)}</b></span>`;
            this.renderShop();
          },
          sellrefuel: () => this.shopResult(g.sellAndRefuel()),
          fuel: () => this.shopResult(g.buyService('fuel')),
          repair: () => this.shopResult(g.buyService('repair')),
          part: key => this.shopResult(g.buyPart(key)),
          updrill: () => this.shopResult(g.buyUpDrill()),
          tripcomp: () => this.shopResult(g.buyTripComp()),
          vehicle: i => this.shopResult(g.buyVehicle(+i)),
          item: arg => { const [id, n] = arg.split('-'); this.shopResult(g.buyItem(id, +n)); },
        },
      });
    },
  };

  MH.ui = ui;
})(window.MH);
