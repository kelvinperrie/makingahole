// Procedurally generated pixel art. Nothing is loaded from image files.
(function (MH) {
  'use strict';
  const { T, CONFIG: C } = MH;
  const S = C.TILE;
  const VARIANTS = 4;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, f) {
    let [r, g, b] = rgb(hex);
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
  function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  const PAL = {
    dirt:     ['#8a5a32', '#7a4e2b', '#9a6a3c', '#6b4224'],
    sand:     ['#d8c27a', '#cbb36a', '#e3cf8c', '#bfa65e'],
    mud:      ['#5a3d26', '#4e3420', '#654630', '#3f2a1a'],
    stone:    ['#7d7d7d', '#6e6e6e', '#8a8a8a', '#5f5f5f'],
    granite:  ['#9a7f7a', '#8a706c', '#b09590', '#6e5a57'],
    obsidian: ['#241a2e', '#1c1424', '#2e2238', '#140e1a'],
    bedrock:  ['#2f2f35', '#26262b', '#3a3a40', '#1d1d22'],
    gas:      ['#7a6a4e', '#6e5e44', '#857558', '#5e503a'],
    bgShallow: ['#3a2616', '#33210f', '#41301e', '#2c1c0e'],
    bgMid:     ['#2e2e33', '#28282c', '#34343a', '#222226'],
    bgDeep:    ['#2a1820', '#22141a', '#321e28', '#1a0e14'],
  };

  // Base noise fill: first palette colour dominates.
  function fillNoise(ctx, rnd, pal) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const r = rnd();
        const c = r < 0.45 ? pal[0] : r < 0.7 ? pal[1] : r < 0.88 ? pal[2] : pal[3];
        px(ctx, x, y, c);
      }
    }
  }
  function blobs(ctx, rnd, n, color, size) {
    for (let i = 0; i < n; i++) {
      const x = (rnd() * (S - size)) | 0, y = (rnd() * (S - size)) | 0;
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++)
          if (rnd() < 0.8) px(ctx, x + dx, y + dy, color);
    }
  }
  function walkLine(ctx, rnd, len, color) {
    let x = (rnd() * S) | 0, y = (rnd() * S) | 0;
    for (let i = 0; i < len; i++) {
      px(ctx, x, y, color);
      x = Math.max(0, Math.min(S - 1, x + ((rnd() * 3) | 0) - 1));
      y = Math.max(0, Math.min(S - 1, y + ((rnd() * 3) | 0) - 1));
    }
  }
  function bevel(ctx, strength) {
    ctx.fillStyle = `rgba(255,255,255,${0.08 * strength})`;
    ctx.fillRect(0, 0, S, 1); ctx.fillRect(0, 1, 1, S - 1);
    ctx.fillStyle = `rgba(0,0,0,${0.18 * strength})`;
    ctx.fillRect(0, S - 1, S, 1); ctx.fillRect(S - 1, 0, 1, S - 1);
  }

  function rockBase(ctx, rnd, kind) {
    const pal = PAL[kind];
    fillNoise(ctx, rnd, pal);
    switch (kind) {
      case 'dirt':
        blobs(ctx, rnd, 4, pal[3], 2);
        blobs(ctx, rnd, 2, pal[2], 2);
        break;
      case 'sand':
        for (let i = 0; i < 10; i++) px(ctx, (rnd() * S) | 0, (rnd() * S) | 0, '#efe0a8');
        break;
      case 'mud':
        blobs(ctx, rnd, 3, pal[3], 3);
        for (let i = 0; i < 4; i++) { const x = (rnd() * 14) | 0, y = (rnd() * S) | 0; rect(ctx, x, y, 2, 1, '#7a5a40'); }
        break;
      case 'stone':
        blobs(ctx, rnd, 3, pal[3], 2);
        walkLine(ctx, rnd, 6, '#4e4e4e');
        break;
      case 'granite':
        for (let i = 0; i < 10; i++) px(ctx, (rnd() * S) | 0, (rnd() * S) | 0, '#2a2020');
        for (let i = 0; i < 8; i++) px(ctx, (rnd() * S) | 0, (rnd() * S) | 0, '#e8dcd8');
        break;
      case 'obsidian':
        for (let i = 0; i < 3; i++) {
          let x = (rnd() * S) | 0, y = (rnd() * S) | 0;
          for (let k = 0; k < 4; k++) { px(ctx, x, y, '#5a4a7a'); x++; y--; if (x >= S || y < 0) break; }
        }
        break;
      case 'bedrock':
        rect(ctx, 0, 7, S, 1, '#18181c');
        rect(ctx, (rnd() * 12 + 2) | 0, 0, 1, 7, '#18181c');
        rect(ctx, (rnd() * 12 + 2) | 0, 8, 1, 8, '#18181c');
        break;
      case 'gas':
        blobs(ctx, rnd, 3, pal[3], 2);
        for (let i = 0; i < 5; i++) px(ctx, (rnd() * S) | 0, (rnd() * S) | 0, '#8fae6a');
        break;
    }
  }

  // Host rock for each ore.
  const ORE_STYLE = {
    [T.COAL]:   { host: 'dirt',    cols: ['#1e1e1e', '#2e2e2e'], hl: '#5a5a5a', n: 5 },
    [T.COPPER]: { host: 'dirt',    cols: ['#d87a3a', '#f09a50'], hl: '#ffc890', n: 5 },
    [T.IRON]:   { host: 'stone',   cols: ['#b08a70', '#c9a088'], hl: '#ead0c0', n: 4 },
    [T.SILVER]: { host: 'stone',   cols: ['#b8bcc8', '#e0e4f0'], hl: '#ffffff', n: 4 },
    [T.GOLD]:   { host: 'granite', cols: ['#e0b020', '#f8d040'], hl: '#fff0a0', n: 4 },
  };
  const GEM_COLS = [
    ['#30d0e0', '#60f0ff', '#e0ffff'],
    ['#d040c0', '#f070e0', '#ffe0ff'],
    ['#30c050', '#60f080', '#e0ffe0'],
    ['#e04040', '#ff7070', '#ffe0e0'],
  ];

  function oreTile(ctx, rnd, style) {
    rockBase(ctx, rnd, style.host);
    for (let i = 0; i < style.n; i++) {
      const cx = 2 + ((rnd() * 10) | 0), cy = 2 + ((rnd() * 10) | 0);
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
      for (const [dx, dy] of pts) {
        if (rnd() < 0.75) px(ctx, cx + dx, cy + dy, style.cols[(rnd() * 2) | 0]);
      }
      px(ctx, cx + 2, cy + 2, 'rgba(0,0,0,0.35)');
      px(ctx, cx, cy, style.hl);
    }
  }

  function gemTile(ctx, rnd, v) {
    rockBase(ctx, rnd, 'obsidian');
    const [c0, c1, hl] = GEM_COLS[v % GEM_COLS.length];
    const gems = 1 + ((rnd() * 2) | 0);
    for (let i = 0; i < gems; i++) {
      const cx = 4 + ((rnd() * 8) | 0), cy = 4 + ((rnd() * 8) | 0);
      px(ctx, cx, cy - 2, c1);
      rect(ctx, cx - 1, cy - 1, 3, 1, c1);
      rect(ctx, cx - 2, cy, 5, 1, c0);
      rect(ctx, cx - 1, cy + 1, 3, 1, c0);
      px(ctx, cx, cy + 2, c0);
      px(ctx, cx - 1, cy - 1, hl);
    }
  }

  function grassTile(ctx, rnd) {
    rockBase(ctx, rnd, 'dirt');
    const greens = ['#4a9a3a', '#5ab048', '#3a8030', '#6ac058'];
    for (let x = 0; x < S; x++) {
      const h = 3 + (rnd() < 0.4 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0);
      for (let y = 0; y < h; y++) px(ctx, x, y, greens[(rnd() * greens.length) | 0]);
      px(ctx, x, h, '#2e6a24');
    }
  }

  function concreteTile(ctx, rnd) {
    rect(ctx, 0, 0, S, S, '#9a9a9a');
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      rect(ctx, 0, y + 3, S, 1, '#727272');
      const off = row % 2 ? 4 : 0;
      for (let x = off; x < S + 8; x += 8) rect(ctx, x % S, y, 1, 3, '#727272');
    }
    for (let i = 0; i < 12; i++) px(ctx, (rnd() * S) | 0, (rnd() * S) | 0, '#aaaaaa');
  }

  function boulderTile(ctx, rnd) {
    fillNoise(ctx, rnd, PAL.dirt.map(c => shade(c, -0.25)));
    const cx = 7.5, cy = 8.5, r = 6.8;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        let c;
        if (d > r - 1) c = '#3a3a3a';
        else if (dx + dy < -4) c = '#b0b0b0';
        else if (dx + dy < 3) c = '#8a8a8a';
        else c = '#5e5e5e';
        if (rnd() < 0.1) c = '#707070';
        px(ctx, x, y, c);
      }
    }
  }

  function supportTile(ctx) {
    rect(ctx, 0, 0, S, S, '#a0703a');
    rect(ctx, 0, 5, S, 1, '#7a5228');
    rect(ctx, 0, 10, S, 1, '#7a5228');
    for (let i = 1; i < S - 1; i++) px(ctx, i, S - 1 - i, '#8a5e2e');
    ctx.strokeStyle = '#5a3818'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(ctx, x, y, '#3a3a3a');
  }

  function relicTile(ctx, rnd) {
    rockBase(ctx, rnd, 'obsidian');
    const rows = [[7, 2], [6, 4], [5, 6], [4, 8], [4, 8], [5, 6], [5, 6], [6, 4], [6, 4], [7, 2]];
    rows.forEach(([x, w], i) => {
      rect(ctx, x, 3 + i, w, 1, '#40ffd0');
      px(ctx, x, 3 + i, '#a0fff0');
      px(ctx, x + w - 1, 3 + i, '#20b090');
    });
    rect(ctx, 7, 6, 1, 3, '#ffffff');
  }

  // Fossil in rock: even variants are ammonite spirals, odd ones fish skeletons.
  function fossilTile(ctx, rnd, v) {
    rockBase(ctx, rnd, v < 2 ? 'stone' : 'dirt');
    const bone = '#efe6cc', mid = '#cfc2a0', dark = '#8a7c60';
    if (v % 2 === 0) {
      // Ammonite: a spiral of bone with ribs
      const cx = 7.5, cy = 8;
      for (let t = 0; t < 4.2 * Math.PI; t += 0.12) {
        const r = 0.6 + t * 0.42;
        const x = Math.round(cx + Math.cos(t) * r), y = Math.round(cy + Math.sin(t) * r);
        px(ctx, x, y, t > 9 ? bone : mid);
        if (t > 6 && Math.round(t * 3) % 4 === 0) px(ctx, Math.round(cx + Math.cos(t) * (r - 1)), Math.round(cy + Math.sin(t) * (r - 1)), dark);
      }
      px(ctx, 8, 8, dark);
    } else {
      // Fish skeleton: skull, spine, ribs, tail
      rect(ctx, 2, 6, 3, 4, bone); px(ctx, 3, 7, dark);         // skull + eye
      rect(ctx, 5, 8, 7, 1, bone);                                // spine
      for (let x = 6; x <= 11; x += 2) {
        const h = x < 10 ? 3 : 2;
        rect(ctx, x, 8 - h, 1, h, mid); rect(ctx, x, 9, 1, h, mid); // ribs
      }
      px(ctx, 12, 7, bone); px(ctx, 13, 6, bone); px(ctx, 14, 5, bone); // tail
      px(ctx, 12, 9, bone); px(ctx, 13, 10, bone); px(ctx, 14, 11, bone);
      rect(ctx, 2, 10, 3, 1, 'rgba(0,0,0,0.3)');
    }
  }

  function fluidFrame(kind, rnd) {
    const c = makeCanvas(S, S), ctx = c.getContext('2d');
    if (kind === 'water') {
      rect(ctx, 0, 0, S, S, 'rgba(42,95,176,0.68)');
      for (let i = 0; i < 14; i++) {
        const x = (rnd() * 14) | 0, y = (rnd() * S) | 0;
        rect(ctx, x, y, 2 + ((rnd() * 2) | 0), 1, 'rgba(110,170,240,0.55)');
      }
    } else {
      const pal = ['#d84010', '#f06018', '#ff7a20', '#c03008'];
      fillNoise(ctx, rnd, pal);
      blobs(ctx, rnd, 3, '#ffb030', 2);
      for (let i = 0; i < 4; i++) px(ctx, (rnd() * S) | 0, (rnd() * S) | 0, '#ffe060');
    }
    return c;
  }

  function crackStages(rnd) {
    const stages = [];
    const c = makeCanvas(S, S), ctx = c.getContext('2d');
    for (let k = 0; k < 4; k++) {
      const lines = 2 + k;
      for (let i = 0; i < lines; i++) {
        let x = 5 + ((rnd() * 6) | 0), y = 5 + ((rnd() * 6) | 0);
        const len = 4 + k * 2;
        const dx = rnd() < 0.5 ? -1 : 1, dy = rnd() < 0.5 ? -1 : 1;
        for (let j = 0; j < len; j++) {
          px(ctx, x, y, 'rgba(0,0,0,0.6)');
          if (rnd() < 0.5) x += dx; else y += dy;
          if (rnd() < 0.2) { x -= dx; y += dy; }
          x = Math.max(0, Math.min(S - 1, x)); y = Math.max(0, Math.min(S - 1, y));
        }
      }
      const snap = makeCanvas(S, S);
      snap.getContext('2d').drawImage(c, 0, 0);
      stages.push(snap);
    }
    return stages;
  }

  // ---------- Miner sprites ----------
  function drillPx(ctx, x, y, frame) {
    px(ctx, x, y, (x + y + frame) % 2 ? '#d0d0d0' : '#808080');
  }
  function drawMinerRight(ctx, color, frame) {
    const light = shade(color, 0.3), dark = shade(color, -0.35);
    // exhaust
    rect(ctx, 2, 1, 1, 3, '#555'); px(ctx, 2, 0, '#777');
    // cabin
    rect(ctx, 3, 3, 6, 3, color); rect(ctx, 3, 3, 6, 1, light);
    rect(ctx, 5, 4, 3, 2, '#9fe0ff'); px(ctx, 5, 4, '#e8fbff');
    // body
    rect(ctx, 1, 6, 11, 7, color); rect(ctx, 1, 6, 11, 1, light);
    rect(ctx, 1, 9, 11, 1, dark); rect(ctx, 1, 12, 11, 1, dark); rect(ctx, 11, 6, 1, 7, dark);
    px(ctx, 3, 10, '#333'); px(ctx, 5, 10, '#333');
    // tracks
    rect(ctx, 1, 13, 11, 3, '#2a2a2a'); rect(ctx, 1, 13, 11, 1, '#444');
    for (let x = 2; x < 11; x += 3) px(ctx, x + frame, 14, '#888');
    // drill
    for (let y = 7; y <= 12; y++) drillPx(ctx, 12, y, frame);
    for (let y = 8; y <= 11; y++) drillPx(ctx, 13, y, frame);
    for (let y = 9; y <= 10; y++) drillPx(ctx, 14, y, frame);
    px(ctx, 15, 9, '#666'); px(ctx, 15, 10, '#555');
  }
  function drawMinerDown(ctx, color, frame) {
    const light = shade(color, 0.3), dark = shade(color, -0.35);
    rect(ctx, 2, 1, 12, 8, color); rect(ctx, 2, 1, 12, 1, light); rect(ctx, 2, 8, 12, 1, dark);
    rect(ctx, 6, 3, 4, 2, '#9fe0ff'); px(ctx, 6, 3, '#e8fbff');
    rect(ctx, 1, 9, 14, 3, '#2a2a2a'); rect(ctx, 1, 9, 14, 1, '#444');
    for (let x = 2; x < 14; x += 3) px(ctx, x + frame, 10, '#888');
    for (let x = 4; x <= 11; x++) drillPx(ctx, x, 12, frame);
    for (let x = 5; x <= 10; x++) drillPx(ctx, x, 13, frame);
    for (let x = 6; x <= 9; x++) drillPx(ctx, x, 14, frame);
    px(ctx, 7, 15, '#666'); px(ctx, 8, 15, '#555');
  }
  function drawMinerUp(ctx, color, frame) {
    const light = shade(color, 0.3), dark = shade(color, -0.35);
    px(ctx, 7, 0, '#666'); px(ctx, 8, 0, '#555');
    for (let x = 6; x <= 9; x++) drillPx(ctx, x, 1, frame);
    for (let x = 5; x <= 10; x++) drillPx(ctx, x, 2, frame);
    for (let x = 4; x <= 11; x++) drillPx(ctx, x, 3, frame);
    rect(ctx, 2, 4, 12, 9, color); rect(ctx, 2, 4, 12, 1, light); rect(ctx, 2, 12, 12, 1, dark);
    rect(ctx, 6, 7, 4, 2, '#9fe0ff'); px(ctx, 6, 7, '#e8fbff');
    rect(ctx, 1, 13, 14, 3, '#2a2a2a'); rect(ctx, 1, 13, 14, 1, '#444');
    for (let x = 2; x < 14; x += 3) px(ctx, x + frame, 14, '#888');
  }

  const tex = {
    tiles: [], bg: {}, water: [], lava: [], cracks: [], minerCache: {},

    init() {
      const rnd = MH.rng.mulberry32(424242);
      const simple = {
        [T.DIRT]: 'dirt', [T.SAND]: 'sand', [T.MUD]: 'mud', [T.STONE]: 'stone',
        [T.GRANITE]: 'granite', [T.OBSIDIAN]: 'obsidian', [T.BEDROCK]: 'bedrock', [T.GAS]: 'gas',
      };
      for (let id = 0; id < MH.TILES.length; id++) {
        const list = [];
        for (let v = 0; v < VARIANTS; v++) {
          const c = makeCanvas(S, S), ctx = c.getContext('2d');
          let doBevel = true;
          if (simple[id]) rockBase(ctx, rnd, simple[id]);
          else if (ORE_STYLE[id]) oreTile(ctx, rnd, ORE_STYLE[id]);
          else if (id === T.GEM) gemTile(ctx, rnd, v);
          else if (id === T.GRASS) grassTile(ctx, rnd);
          else if (id === T.CONCRETE) concreteTile(ctx, rnd);
          else if (id === T.BOULDER) { boulderTile(ctx, rnd); doBevel = false; }
          else if (id === T.SUPPORT) { supportTile(ctx); doBevel = false; }
          else if (id === T.RELIC) relicTile(ctx, rnd);
          else if (id === T.FOSSIL) fossilTile(ctx, rnd, v);
          else doBevel = false;
          if (doBevel) bevel(ctx, id === T.BEDROCK ? 0.5 : 1);
          list.push(c);
        }
        this.tiles[id] = list;
      }
      for (const key of ['bgShallow', 'bgMid', 'bgDeep']) {
        this.bg[key] = [];
        for (let v = 0; v < VARIANTS; v++) {
          const c = makeCanvas(S, S), ctx = c.getContext('2d');
          fillNoise(ctx, rnd, PAL[key]);
          blobs(ctx, rnd, 3, PAL[key][3], 2);
          this.bg[key].push(c);
        }
      }
      for (let f = 0; f < 2; f++) {
        this.water.push(fluidFrame('water', rnd));
        this.lava.push(fluidFrame('lava', rnd));
      }
      this.cracks = crackStages(rnd);
    },

    variant(x, y) { return (MH.rng.hash2(x, y, 1234) * VARIANTS) | 0; },
    tile(id, x, y) { return this.tiles[id][this.variant(x, y)]; },
    background(depth, x, y) {
      const key = depth < 90 ? 'bgShallow' : depth < 220 ? 'bgMid' : 'bgDeep';
      return this.bg[key][this.variant(x, y)];
    },

    miner(color, facing, frame) {
      const key = color + facing + frame;
      if (this.minerCache[key]) return this.minerCache[key];
      const c = makeCanvas(S, S), ctx = c.getContext('2d');
      if (facing === 'down') drawMinerDown(ctx, color, frame);
      else if (facing === 'up') drawMinerUp(ctx, color, frame);
      else if (facing === 'left') {
        ctx.translate(S, 0); ctx.scale(-1, 1);
        drawMinerRight(ctx, color, frame);
      } else drawMinerRight(ctx, color, frame);
      this.minerCache[key] = c;
      return c;
    },

    shade,
  };

  MH.tex = tex;
})(window.MH);
