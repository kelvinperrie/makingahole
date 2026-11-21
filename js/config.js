// All tunable game data lives here.
window.MH = window.MH || {};
(function (MH) {
  'use strict';

  const T = {
    EMPTY: 0, GRASS: 1, DIRT: 2, SAND: 3, MUD: 4, STONE: 5, GRANITE: 6, OBSIDIAN: 7,
    COAL: 8, COPPER: 9, IRON: 10, SILVER: 11, GOLD: 12, GEM: 13,
    GAS: 14, BOULDER: 15, WATER: 16, LAVA: 17, BEDROCK: 18, CONCRETE: 19, SUPPORT: 20, RELIC: 21,
    FOSSIL: 22,
  };

  const TILES = [];
  function def(id, o) {
    TILES[id] = Object.assign({
      id, name: '?', solid: true, breakable: true, hardness: 1, minTier: 0,
      value: 0, collect: false, fluid: false, color: '#888',
    }, o);
  }
  def(T.EMPTY,    { name: 'Empty', solid: false, breakable: false });
  def(T.GRASS,    { name: 'Grass', hardness: 0.8, color: '#5ab048' });
  def(T.DIRT,     { name: 'Dirt', hardness: 1, color: '#8a5a32' });
  def(T.SAND,     { name: 'Sand', hardness: 0.7, color: '#d8c27a' });
  def(T.MUD,      { name: 'Mud', hardness: 1.3, color: '#5a3d26' });
  def(T.STONE,    { name: 'Stone', hardness: 2.5, minTier: 1, color: '#7d7d7d' });
  def(T.GRANITE,  { name: 'Granite', hardness: 4, minTier: 2, color: '#9a7f7a' });
  def(T.OBSIDIAN, { name: 'Obsidian', hardness: 6, minTier: 3, color: '#2e2238' });
  def(T.COAL,     { name: 'Coal', hardness: 1.5, collect: true, value: 10, color: '#2a2a2a' });
  def(T.COPPER,   { name: 'Copper', hardness: 2, collect: true, value: 25, color: '#e08a4a' });
  def(T.IRON,     { name: 'Iron', hardness: 2.5, collect: true, value: 50, color: '#c9a088' });
  def(T.SILVER,   { name: 'Silver', hardness: 3, minTier: 1, collect: true, value: 110, color: '#e0e4f0' });
  def(T.GOLD,     { name: 'Gold', hardness: 3.5, minTier: 2, collect: true, value: 250, color: '#f8d040' });
  def(T.GEM,      { name: 'Gem', hardness: 5, minTier: 3, collect: true, value: 700, color: '#60f0ff' });
  def(T.GAS,      { name: 'Rock', hardness: 1.5, color: '#6e7a5a' }); // disguised
  def(T.BOULDER,  { name: 'Boulder', hardness: 3, color: '#8a8a8a' });
  def(T.WATER,    { name: 'Water', solid: false, breakable: false, fluid: true, color: '#2a5fb0' });
  def(T.LAVA,     { name: 'Lava', solid: false, breakable: false, fluid: true, color: '#f06018' });
  def(T.BEDROCK,  { name: 'Bedrock', breakable: false, color: '#2f2f35' });
  def(T.CONCRETE, { name: 'Foundation', breakable: false, color: '#a0a0a0' });
  def(T.SUPPORT,  { name: 'Support block', hardness: 0.5, color: '#a0703a' });
  def(T.RELIC,    { name: 'Ancient Core', hardness: 8, minTier: 4, collect: true, value: 100000, color: '#40ffd0' });
  // Fossils pay cash on the spot instead of going into cargo (see FOSSIL_* below).
  def(T.FOSSIL,   { name: 'Fossil', hardness: 2, color: '#e8dcc0' });

  const CONFIG = {
    TILE: 16,
    WORLD_W: 48,
    WORLD_DEPTH: 400,
    SURFACE_Y: 10,          // row index of the ground surface; rows above are sky
    SHOP_X: 3, SHOP_W: 5,   // shop building, in tiles
    PUMP_X: 9,
    START_X: 11,            // landing pad where the miner starts and is recovered to

    MINE_BASE: 0.45,        // seconds per hardness point at drill power 1
    CLIMB_FACTOR: 0.6,
    WATER_FACTOR: 0.5,
    FALL_START: 6, FALL_ACCEL: 30, FALL_MAX: 24, FALL_WATER: 4,

    FUEL_MOVE: 0.12, FUEL_CLIMB: 0.2, FUEL_DRILL: 0.5,
    FUEL_PRICE: 1, REPAIR_PRICE: 2,
    LOW_FUEL: 0.2, LOW_HULL: 0.25,

    RECOVERY_BASE: 50, RECOVERY_PER_M: 3, STRANDED_DELAY: 4,

    GAS_DAMAGE: 25, BOULDER_DAMAGE: 15, BOULDER_SHAKE: 0.6,
    LAVA_DPS: 12, LAVA_COOL_REDUCE: 2.5, LAVA_MIN_DPS: 2,
    HEAT_START: 220, HEAT_STEP: 45, HEAT_DPS: 1.5,

    SIM_STEP: 0.1,          // fluid/boulder simulation tick (seconds)
    LAVA_EVERY: 3,          // lava flows once every N ticks

    WIN_VALUE: 100000,

    // Giant worm: tunnels across the world, filling holes with soft earth and leaving ore.
    WORM_FIRST: [150, 240],   // seconds of play before the first worm (random in range)
    WORM_EVERY: [240, 420],   // seconds between worms after that
    WORM_WARNING: 60,         // warning time before it arrives
    WORM_MIN_DEPTH: 15,       // never tunnels shallower than this
    WORM_SPEED: 3.5,          // tiles per second
    WORM_LENGTH: 14,          // body segments
    WORM_ORE_CHANCE: 0.14,    // chance each tile it passes through becomes ore
    WORM_DAMAGE: 20,

    // Fossils: rare, pay instant cash = (BASE + PER_M * depth) * random 0.7–1.3.
    FOSSIL_CHANCE: 0.0028,    // per underground filler tile, from FOSSIL_MIN_DEPTH down
    FOSSIL_MIN_DEPTH: 8,
    FOSSIL_BASE: 60, FOSSIL_PER_M: 4,
    FOSSIL_BLAST: 0.25,       // share of the value you get if an explosion smashes it
  };

  // Ore veins: count is veins per 100 rows of depth range.
  const ORE_GEN = [
    { tile: T.COAL,   min: 2,   max: 90,  veins: 90, size: [4, 8] },
    { tile: T.COPPER, min: 5,   max: 140, veins: 77, size: [3, 7] },
    { tile: T.IRON,   min: 40,  max: 200, veins: 68, size: [3, 7] },
    { tile: T.SILVER, min: 90,  max: 260, veins: 59, size: [3, 6] },
    { tile: T.GOLD,   min: 150, max: 340, veins: 50, size: [2, 5] },
    { tile: T.GEM,    min: 250, max: 398, veins: 36, size: [2, 4] },
  ];

  const TIER_NAMES = ['Mk1', 'Mk2', 'Mk3', 'Mk4', 'Mk5'];

  const PARTS = {
    drill:   { name: 'Drill',     desc: 'Mines faster and breaks harder rock', values: [1, 1.6, 2.5, 3.8, 5.5], prices: [0, 300, 1500, 6000, 20000], fmt: v => 'x' + v },
    cargo:   { name: 'Cargo bay', desc: 'Carry more ore',                      values: [8, 14, 22, 32, 45],      prices: [0, 250, 1000, 4000, 12000], fmt: v => v + ' units' },
    fuel:    { name: 'Fuel tank', desc: 'Stay underground longer',             values: [30, 50, 80, 120, 170],   prices: [0, 200, 900, 3500, 11000],  fmt: v => v + ' fuel' },
    engine:  { name: 'Engine',    desc: 'Drive and climb faster',              values: [4, 5, 6, 7, 8.5],        prices: [0, 250, 1100, 4500, 14000], fmt: v => v + ' tiles/s' },
    hull:    { name: 'Hull',      desc: 'Survive more damage',                 values: [50, 80, 120, 170, 240],  prices: [0, 300, 1200, 4500, 14000], fmt: v => v + ' hull' },
    cooling: { name: 'Cooling',   desc: 'Protects against deep heat and lava', values: [0, 1, 2, 3, 4],          prices: [0, 800, 3000, 9000, 22000], fmt: v => 'level ' + v },
    light:   { name: 'Headlight', desc: 'See further in the dark',             values: [3.5, 5, 6.5, 8.5, 11],   prices: [0, 150, 600, 2500, 8000],   fmt: v => v + ' tiles' },
    scanner: { name: 'Scanner',   desc: 'Reveals ore through rock. Mk3: gas. Mk4: boulders', values: [0, 5, 7, 10, 14], prices: [0, 500, 2000, 7000, 18000], fmt: v => v ? 'radius ' + v : 'off' },
  };
  const PART_ORDER = ['drill', 'cargo', 'fuel', 'engine', 'hull', 'cooling', 'light', 'scanner'];

  const UP_DRILL = { name: 'Upward Drill', desc: 'Drill solid tiles above you', price: 3000 };
  const TRIP_COMP = { name: 'Trip Computer', desc: 'Shows the fuel needed to get back to the surface', price: 150 };

  const VEHICLES = [
    { name: 'Rustbucket', price: 0,     maxTier: 1, hullBonus: 0,   color: '#d0a040' },
    { name: 'Digger',     price: 2500,  maxTier: 2, hullBonus: 20,  color: '#d05030' },
    { name: 'Excavator',  price: 12000, maxTier: 3, hullBonus: 50,  color: '#3a88d8' },
    { name: 'Titan',      price: 45000, maxTier: 4, hullBonus: 100, color: '#9a48c8' },
  ];

  const ITEMS = [
    { id: 'explosive', name: 'Explosive',          short: 'TNT',  price: 150, desc: 'Blasts the 3x3 area around you. Ore is collected half the time.' },
    { id: 'teleport',  name: 'Emergency teleport', short: 'TELE', price: 400, desc: 'Return to the surface, keeping your cargo.' },
    { id: 'fuelcan',   name: 'Fuel canister',      short: 'FUEL', price: 100, desc: 'Refill 40% of your fuel tank.' },
    { id: 'repair',    name: 'Repair kit',         short: 'FIX',  price: 120, desc: 'Repair 40% of your hull.' },
    { id: 'support',   name: 'Support block',      short: 'BLK',  price: 25,  desc: 'Place a block beside (or below) you to climb or stand on.' },
  ];

  const ACHIEVEMENTS = [
    { id: 'first_ore', name: 'Strike!',             desc: 'Collect your first ore' },
    { id: 'silver',    name: 'Silver Lining',       desc: 'Collect silver' },
    { id: 'gold',      name: 'Gold Rush',           desc: 'Collect gold' },
    { id: 'gem',       name: 'Shiny!',              desc: 'Collect a gem' },
    { id: 'fossil',    name: 'Dig Site',            desc: 'Find a fossil' },
    { id: 'd50',       name: 'Going Down',          desc: 'Reach 50m' },
    { id: 'd100',      name: 'Deep Dweller',        desc: 'Reach 100m' },
    { id: 'd200',      name: 'Into the Dark',       desc: 'Reach 200m' },
    { id: 'd300',      name: 'Hot Under the Hull',  desc: 'Reach 300m' },
    { id: 'e1k',       name: 'First Thousand',      desc: 'Earn $1,000 in total' },
    { id: 'e10k',      name: 'Mining Magnate',      desc: 'Earn $10,000 in total' },
    { id: 'e100k',     name: 'Tycoon',              desc: 'Earn $100,000 in total' },
    { id: 'vehicle',   name: 'New Wheels',          desc: 'Buy a new vehicle' },
    { id: 'core',      name: 'Heart of the World',  desc: 'Find the Ancient Core' },
  ];

  const DEFAULT_BINDINGS = {
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    interact: ['KeyE', 'Enter'], cargo: ['KeyC'], pause: ['Escape', 'KeyP'], recover: ['KeyR'],
    item1: ['Digit1'], item2: ['Digit2'], item3: ['Digit3'], item4: ['Digit4'], item5: ['Digit5'],
  };
  const ACTION_NAMES = {
    up: 'Up / climb', down: 'Down / drill', left: 'Left', right: 'Right', interact: 'Open shop',
    cargo: 'Cargo', pause: 'Pause', recover: 'Call recovery',
    item1: 'Explosive', item2: 'Teleport', item3: 'Fuel canister', item4: 'Repair kit', item5: 'Support block',
  };

  const MOVE_RULES = {
    corner: 'Corner (original): sideways moves allowed if the target touches rock below, beyond, or at any corner',
    noCeiling: 'No ceiling: like Corner, but rock above the target does not count',
    ledge: 'Ledge only: sideways moves need rock directly below the target',
  };

  Object.assign(MH, {
    T, TILES, CONFIG, ORE_GEN, TIER_NAMES, PARTS, PART_ORDER, UP_DRILL, TRIP_COMP, VEHICLES, ITEMS,
    ACHIEVEMENTS, DEFAULT_BINDINGS, ACTION_NAMES, MOVE_RULES,
  });
})(window.MH);
