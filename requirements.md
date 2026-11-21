# Making a Hole — Game Requirements

## 1. Overview

A 2D, pixel-art mining game. The player drives a mining vehicle down from the surface, digging through a grid-based underground world to collect valuable resources. Resources are carried back to the surface and sold, and the money buys better vehicles and upgrades so the player can dig deeper.

**Core loop:** dig down → collect resources → return to surface → sell → upgrade → dig deeper.

Requirements are tagged:
- **[Core]** — required.
- **[Open]** — undecided; needs a decision before (or after) implementation.

All numbers below are starting values for balancing. They live in `js/config.js`, not in the game logic.

---

## 2. Visual Style

- **[Core]** 2D, side-on view, pixel-art style.
- **[Core]** Fixed tile size of 16×16 pixels, with integer scaling to the window so pixels stay crisp.
- **[Core]** The camera follows the miner and stays inside the world bounds.
- **[Core]** Underground gets darker with depth. The miner has a limited light radius that the headlight upgrade increases.
- **[Core]** Visible cracking on a tile while it is being mined, so the player can see progress.
- **[Core]** Each resource has a distinct look so the player can tell ore apart before mining it.
- **[Core]** All art is generated in code (no image files needed).

---

## 3. World

### 3.1 Structure
- **[Core]** The world is a grid of square tiles.
- **[Core]** The surface level holds the player's base/shop. The player starts here.
- **[Core]** Everything below the surface is mineable tiles.
- **[Core]** The world is 48 tiles wide, with unbreakable bedrock at the left and right edges.
- **[Core]** The world is 400 tiles deep, with unbreakable bedrock at the bottom. The Ancient Core sits just above it (see §10).
- **[Core]** 1 tile = 1 metre of depth.

### 3.2 Tile Types
- **[Core]** Each tile has a type. The type decides how long the tile takes to break and whether mining it gives a resource.
- **[Core]** Filler tiles are not collected (dirt, sand, mud, stone, granite, obsidian).
- **[Core]** Resource tiles are collected (coal, copper, iron, silver, gold, gems).
- **[Core]** Tile list:

| Tile     | Collected | Hardness    | Value ($) | Min drill | Typical depth |
|----------|-----------|-------------|-----------|-----------|---------------|
| Grass    | No        | 0.8         | —         | Mk1       | Surface row   |
| Dirt     | No        | 1           | —         | Mk1       | 0–160         |
| Sand     | No        | 0.7         | —         | Mk1       | 0–30          |
| Mud      | No        | 1.3         | —         | Mk1       | 30–160        |
| Stone    | No        | 2.5         | —         | Mk2       | Patches from 5, mostly 90+ |
| Granite  | No        | 4           | —         | Mk3       | 160+          |
| Obsidian | No        | 6           | —         | Mk4       | 280+          |
| Coal     | Yes       | 1.5         | 10        | Mk1       | 2–90          |
| Copper   | Yes       | 2           | 25        | Mk1       | 5–140         |
| Iron     | Yes       | 2.5         | 50        | Mk1       | 40–200        |
| Silver   | Yes       | 3           | 110       | Mk2       | 90–260        |
| Gold     | Yes       | 3.5         | 250       | Mk3       | 150–340       |
| Gem      | Yes       | 5           | 700       | Mk4       | 250–400       |
| Fossil   | Instant cash | 2        | 60 + 4/m  | Mk1       | 8–400, rare   |
| Bedrock  | No        | Unbreakable | —         | —         | Edges/bottom  |

- **[Core]** **Fossils:** about 34 per world, scattered on their own (not in veins) and a little more common deeper down. They show as an ammonite spiral or a fish skeleton in the rock.
  - Breaking one pays cash immediately ("Fossil found! Sold to a museum for $X") instead of going into cargo, so a full hold doesn't matter.
  - Value is $60 + $4 per metre of depth, varied by ±30% (about $130–240 at 30 m, $600–1,100 at 200 m).
  - An explosion smashes a fossil and pays only 25% of its value.
  - The scanner highlights fossils like ore, and the worm leaves them alone.
  - "Fossils found" is shown in the pause menu stats, and finding the first one earns the "Dig Site" achievement.

- **[Core]** Some tiles cannot be mined until the drill reaches a certain level ("Min drill" above). This gates progress without needing invisible walls.

### 3.3 Generation
- **[Core]** The world is procedurally generated from a seed, so each new game is different and a world can be reproduced from its seed.
- **[Core]** How common each resource is depends on depth: cheap ores near the top, valuable ores deeper.
- **[Core]** Ore forms small clusters/veins rather than single scattered tiles.
- **[Core]** Ore should be plentiful: about 1,640 ore tiles per world (roughly 330 each of coal, copper and iron, 290 silver, 230 gold and 120 gems). Vein counts and sizes are in `ORE_GEN` in `js/config.js`.
- **[Core]** Natural empty pockets (caves) give variety and test the movement rules. There are no caves in the top 12 rows.

---

## 4. Mining Vehicle (the Miner)

### 4.1 Movement
- **[Core]** The miner moves one tile at a time on the grid, animated smoothly between tiles.
- **[Core]** The miner cannot travel through empty space. If the tile below it is empty, it falls.
- **[Core]** There is no fall damage.
- **[Core]** To move **up**, at least one side (left or right) of the miner must be touching a solid tile. The player holds Up to climb, or to cling to a wall in place. Letting go of Up while not standing on anything makes the miner fall.
- **[Core]** **Reaching up:** the miner can also climb if the empty tile above it has a solid tile beside it. It reaches up and grabs that wall. This means you can still climb back up a shaft after digging out both sides at its bottom.
- **[Core]** A falling miner can grab a wall by holding Up whenever a side is touching a solid tile.
- **[Core]** **Hanging on the lip:** when a climb takes the miner above the top of a wall (so nothing touches its sides), it can keep holding Up to hang on, as long as solid rock touches one of its lower corners. From there it can step sideways onto the ledge. Without this the miner could never climb out of a hole. This applies under every movement rule below.
- **[Core]** Teleport and recovery put the miner on a concrete landing pad next to the shop, so it can't drop back into a shaft dug at the start position.
- **[Core]** Horizontal movement on solid ground is always allowed. Driving off a ledge or over a hole makes the miner fall.
- **[Core]** **Corner movement:** while clinging to a wall (not standing), the miner may move sideways into an empty tile only if that tile is "attached". The rule is a setting so it can be playtested:
  1. **Corner (default, original rule):** the target tile has a solid tile below it, beside it on the far side, or at any of its corners.
  2. **No ceiling:** same as Corner, but the corners above the target don't count.
  3. **Ledge only:** the target tile must have a solid tile directly below it.
- **[Core]** The miner can drill left, right and down. Drilling up needs the **Upward Drill** upgrade, so going down stays a commitment.
  - "Drilling up" means breaking a **solid** tile above the miner. **Climbing** means moving up into an **empty** tile, and it is always allowed when the climbing rule is met. These are different actions.
  - **Getting back to the surface:** the miner climbs back up through empty space that already exists, either tunnels it dug on the way down or natural caves. A one-tile-wide vertical shaft always has walls on both sides, so the miner can always climb it.
  - Wider holes can only be climbed along their side walls. That means digging with the return trip in mind is part of the strategy.
  - Backup ways out: support blocks (§5.2), emergency teleport (§5.2) and recovery (§4.6).
- **[Core]** Drilling sideways is allowed while standing or while clinging to a wall.

### 4.2 Mining
- **[Core]** Mining a tile takes time based on its type (hardness).
- **[Core]** Mining time = hardness × 0.45 s ÷ drill power. Drill upgrades reduce mining time.
- **[Core]** The player mines by holding a direction into a solid tile. Letting go or changing direction cancels mining, and progress resets.
- **[Core]** Once a tile is broken, the miner moves into it if the player keeps holding that direction (or falls into it, if it was below).

### 4.3 Cargo
- **[Core]** The miner has limited cargo capacity.
- **[Core]** Only useful resources are collected. Filler is not.
- **[Core]** Capacity is counted in units (1 ore tile = 1 unit).
- **[Core]** When cargo is full, new resources are not collected (the tile is still destroyed). The player is warned on screen.
- **[Core]** The player can drop cargo from the cargo screen to make room for more valuable finds.

### 4.4 Fuel
- **[Core]** The miner uses fuel when it moves (0.12 per tile), climbs (0.2 per tile) and drills (0.5 per second). Falling uses no fuel.
- **[Core]** Fuel is refilled at the surface shop ($1 per unit).
- **[Core]** If fuel runs out, the miner is stranded (see §4.6). Gravity still works without fuel.
- **[Core]** A warning appears when fuel drops below 20%.

### 4.5 Hull / Health
- **[Core]** The miner has hull points. Hull damage comes only from hazards (§6), never from falling.
- **[Core]** If hull reaches zero, the miner is destroyed (see §4.6).
- **[Core]** Hull is repaired at the surface shop ($2 per point).

### 4.6 Failure and Recovery
- **[Core]** If the miner is stranded (out of fuel) or destroyed, it is recovered to the surface.
- **[Core]** Penalty: all cargo is lost, plus a recovery fee of $50 + $3 per metre of depth (capped at the player's money). Upgrades are kept. Fuel and hull are restored after recovery.
- **[Core]** This also covers soft-locks, where the player traps themselves somewhere they cannot climb out of.
- **[Core]** **Stuck check:** while the miner is idle underground, the game checks every half second whether it could drive back to the surface through open tiles without digging. If it can't, a prompt says "No way up from here" and shows the recovery key and fee. The prompt is only a hint: the player can keep digging. It is skipped once the Upward Drill is owned.
- **[Core]** A manual "call for recovery" key (R) with the same penalty, so the player can never be permanently stuck. It asks for confirmation first.

---

## 5. Surface / Base

- **[Core]** The surface has the player's base/shop. It sits on unbreakable foundations.
- **[Core]** The player sells collected resources at the shop for money.
- **[Core]** Money buys a better mining vehicle or other upgrades.
- **[Core]** One shop with tabs: Sell, Services (fuel & repair), Upgrades, Vehicles, Items.
- **[Core]** The shop opens when the miner is parked at the shop and the player presses the interact key (E).
- **[Core]** Selling shows a summary (items, quantities, total earned).
- **[Core]** **Sell all & refuel:** a large button at the top of the shop, above the tabs, that stays visible on every tab and while the list scrolls. It sells all cargo, then fills the tank (or buys as much fuel as the money allows). The label previews the result, for example "(+$470, fuel -$18)", and the button is greyed out when there is nothing to sell and the tank is full.

### 5.1 Upgrades
Each part has five levels (Mk1–Mk5). Prices go up with each level:

| Upgrade   | Effect by level (Mk1 → Mk5)                       | Prices (Mk2 → Mk5)          |
|-----------|---------------------------------------------------|-----------------------------|
| Drill     | Power ×1, ×1.6, ×2.5, ×3.8, ×5.5. Also sets which tiles can be mined | 300 / 1,500 / 6,000 / 20,000 |
| Cargo bay | 8, 14, 22, 32, 45 units                           | 250 / 1,000 / 4,000 / 12,000 |
| Fuel tank | 30, 50, 80, 120, 170 fuel                         | 200 / 900 / 3,500 / 11,000   |
| Engine    | 4, 5, 6, 7, 8.5 tiles per second                  | 250 / 1,100 / 4,500 / 14,000 |
| Hull      | 50, 80, 120, 170, 240 hull                        | 300 / 1,200 / 4,500 / 14,000 |
| Cooling   | Heat protection level 0, 1, 2, 3, 4               | 800 / 3,000 / 9,000 / 22,000 |
| Headlight | Light radius 3.5, 5, 6.5, 8.5, 11 tiles           | 150 / 600 / 2,500 / 8,000    |
| Scanner   | Off, then radius 5, 7, 10, 14. Mk3+ also shows gas, Mk4+ shows boulders | 500 / 2,000 / 7,000 / 18,000 |

- **[Core]** **Upward Drill** (one-off, $3,000): lets the miner drill solid tiles above it.
- **[Core]** **Trip Computer** (one-off, $150): shows "To surface: X fuel" under the fuel bar, with a white marker on the bar at that amount.
  - The figure is the cheapest route home through open tiles, using the normal movement rules and fuel costs (falling is free). It updates every 0.4 s.
  - The text is green when there's plenty of fuel (1.5 × the need + 1), yellow when there's only just enough, and red and flashing when there isn't enough.
  - Once per trip, a warning appears when fuel drops below 1.25 × the need + 1: "Only just enough fuel to get home!"
  - If there's no open route it shows "NO WAY UP". With the Upward Drill it shows an estimate for drilling straight up instead, marked "(drilling)".
  - Depth is always shown on the HUD, with or without the Trip Computer.
- **[Core]** **Vehicles and parts both exist.** Each vehicle sets the highest level its parts can be upgraded to, and adds bonus hull:

| Vehicle    | Price   | Max part level | Bonus hull |
|------------|---------|----------------|------------|
| Rustbucket | (start) | Mk2            | 0          |
| Digger     | 2,500   | Mk3            | +20        |
| Excavator  | 12,000  | Mk4            | +50        |
| Titan      | 45,000  | Mk5            | +100       |

### 5.2 Consumables
Bought at the shop and used with number keys 1–5:

| Key | Item               | Price | Effect |
|-----|--------------------|-------|--------|
| 1   | Explosive          | 150   | Destroys the 3×3 area around the miner. Only affects tiles up to one drill level above yours. Ore caught in it is collected 50% of the time. Does not hurt the miner. |
| 2   | Emergency teleport | 400   | Returns the miner to the surface. Cargo is kept. |
| 3   | Fuel canister      | 100   | Refills 40% of the fuel tank. |
| 4   | Repair kit         | 120   | Repairs 40% of the hull. |
| 5   | Support block      | 25    | Places a solid block on the side the miner is facing (or below it). Gives something to climb or stand on. The player starts with 3. |

---

## 6. Hazards

- **[Core]** **Gas pockets** (from 35 m): look almost like normal rock. Breaking one causes an explosion that clears the area around it and does 25 hull damage. Nearby gas pockets set each other off.
- **[Core]** **Lava** (from 240 m): a liquid found in deep caves. Does 12 hull damage per second while the miner is in it, reduced by 2.5 per cooling level (minimum 2).
- **[Core]** **Heat zones** (from 220 m): heat level rises by 1 every 45 m, up to 4. The miner takes 1.5 damage per second for each heat level above its cooling level.
- **[Core]** **Falling boulders** (from 20 m): when the tile below a boulder is removed, it shakes for 0.6 s and then falls. It shatters when it lands. If it lands on the miner it does 15 hull damage.
- **[Core]** **Water** (lakes at 50–230 m): flows down and spreads into dug areas. The miner moves at half speed in water.
- **[Core]** Water touching lava turns the lava into stone.
- **[Core]** **Giant worm:** the first one comes after 2.5–4 minutes of play, then one every 4–7 minutes. It only starts once the player has been deeper than 20 m.
  - **Depth:** chosen near where the player is digging, between 8 m above and 20 m below their current depth (never shallower than 15 m and never more than 25 m below their deepest point).
  - **Warning:** 60 seconds before it arrives, a toast says "Worm detected at 100m deep!" with an alarm sound. A countdown stays on screen and a pulsing red band shows exactly where it will pass. A second warning comes 10 seconds before.
  - **Passing:** it travels from one side of the world to the other at 3.5 tiles per second, wiggling up and down. Its body is 3 tiles tall. The screen shakes and rumbles when it's close.
  - **Effect:** every tile it passes through becomes soft earth (dirt above 90 m, mud below), filling tunnels, caves, water and lava. About 1 in 7 tiles becomes ore suited to that depth instead. Existing ore, bedrock, foundations and the Ancient Core are left alone. It also removes gas pockets and boulders in its path.
  - **Danger:** a miner below the worm's path gets sealed in, because it can't dig up without the Upward Drill, and the stuck check then offers recovery. A miner in its path takes 20 hull damage and is left in a pocket in the fresh earth.
  - Worm timers aren't saved. Loading a game starts the countdown to the next worm again.

---

## 7. User Interface / HUD

- **[Core]** Always visible: money, depth, cargo (used/maximum), fuel bar, hull bar, heat warning, consumables bar.
- **[Core]** A cargo screen (C) that lists the resources carried, with buttons to drop them.
- **[Core]** Warnings for low fuel, low hull, full cargo, and drill too weak.
- **[Core]** Shop screen (sell / services / upgrades / vehicles / items).
- **[Core]** Pause menu (resume, settings, save, quit to menu) with current stats.
- **[Core]** A main menu (new game with an optional seed, continue, settings).

---

## 8. Controls

| Action          | Keyboard              | Gamepad          |
|-----------------|-----------------------|------------------|
| Move / drill    | Arrow keys or WASD    | D-pad / left stick |
| Open shop       | E or Enter            | A                |
| Cargo screen    | C                     | B                |
| Use item 1–5    | 1–5                   | X, Y, LB, RB, LT |
| Call recovery   | R                     | Back/Select      |
| Pause           | Esc or P              | Start            |

- **[Core]** The main keyboard key for each action can be rebound in Settings.
- **[Open]** Menus can't be navigated with a gamepad yet.

---

## 9. Persistence

- **[Core]** Save and load: world seed, all tiles (including dug tiles and water), miner position, money, vehicle, upgrades, items, cargo, fuel, hull, stats and achievements.
- **[Core]** Autosave whenever the player opens the shop. Manual save from the pause menu.
- **[Core]** Settings (volumes, movement rule, key bindings) are saved separately.
- **[Core]** Data is saved in the browser's local storage. One save slot.
---

## 10. Progression and Goals

- **[Core]** **Goal at the bottom:** the Ancient Core is buried just above the bedrock at the bottom of the world, wrapped in obsidian. It needs a Mk5 drill. Mining it wins the game and is worth $100,000. The player can keep playing afterwards.
- **[Core]** Stats tracked: deepest depth, total earned, tiles mined, play time.
- **[Core]** Achievements: first ore, first silver, first gold, first gem, reaching 50/100/200/300 m, earning $1k/$10k/$100k, buying a new vehicle, finding the Ancient Core.

---

## 11. Audio

- **[Core]** Sound effects generated in code: drilling (pitch changes with tile hardness), breaking a tile, collecting ore, landing, purchase, warnings, explosions, damage.
- **[Core]** Background music generated in code that gets lower and slower with depth.
- **[Core]** Master, effects and music volume settings.

---

## 12. Technical

- **[Core]** Runs in a desktop web browser. No install or build step: open `index.html`.
- **[Core]** Built with plain JavaScript and HTML5 canvas, with no frameworks or libraries.
- **[Core]** Targets 60 FPS.
- **[Core]** Data-driven design: tile types, upgrade levels, prices, hazards and generation settings live in `js/config.js`.

### File layout
| File | Purpose |
|------|---------|
| `index.html`      | Page, HUD and modal containers |
| `css/style.css`   | HUD and menu styling |
| `js/config.js`    | All tunable data (tiles, upgrades, vehicles, items, prices, constants) |
| `js/rng.js`       | Seeded random numbers and noise |
| `js/textures.js`  | Generates the pixel art |
| `js/world.js`     | World generation, water/lava flow, falling boulders |
| `js/miner.js`     | Miner movement, mining, fuel, hull |
| `js/audio.js`     | Generated sound effects and music |
| `js/input.js`     | Keyboard, gamepad and key bindings |
| `js/save.js`      | Saving and loading game and settings |
| `js/ui.js`        | HUD, shop, menus |
| `js/worm.js`      | Giant worm event: warning, path, filling and drawing |
| `js/game.js`      | Game state, rules, camera, rendering |
| `js/main.js`      | Start-up and main loop |

---

## 13. Build Order

1. Grid world with a few tile types, rendered with a camera.
2. Miner movement: falling, horizontal movement, climbing rule, mining with hardness-based time.
3. Cargo collection and limits.
4. Surface shop: selling, plus upgrades.
5. Fuel and the stranded/recovery rule.
6. Procedural generation with depth-based ore spread.
7. HUD and menus.
8. Saving/loading.
9. More upgrades, consumables, hazards, audio, polish.

(First version builds all of these.)

---

## 14. Open Questions

1. Which corner-movement rule feels best after playtesting? (§4.1)
2. Balancing: prices, ore values, fuel use and hardness all need playtesting.
3. Gamepad navigation of menus. (§8)
