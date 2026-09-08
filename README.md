# Hazmat Siege Tycoon

A browser tycoon shooter built with Three.js. Build a conveyor plant (droppers → refiners → collector) to earn coins, and fight off waves of hazmat raiders with an armory of guns bought from the same coins.

## Play

```bash
npm install
npm run dev
```

Open http://localhost:5173, click **PLAY** (the browser locks the mouse). `npm run build` writes a static bundle to `dist/`; `npm run deploy` builds and pushes it to the `gh-pages` branch, which GitHub Pages serves at https://olliemackman-web.github.io/tycoon-shooter/.

## Mobile

Touch devices get a virtual joystick (left), drag-to-look (right half), and FIRE / AIM / JUMP / RELOAD / SWAP / USE buttons. Play in landscape; a rotate prompt covers the screen in portrait, and PLAY requests fullscreen. Shadows and pixel ratio are reduced on touch devices. To try it on your phone, run `npm run dev` (it listens on the LAN) and open the `Network:` address Vite prints. Append `?touch=1` to force the touch layout on a desktop browser.

## How it works

- **Tycoon** (`src/tycoon.js`): walk onto a gold pad to buy it. The first dropper is free. Droppers drop ore onto the conveyor, refiners multiply it as it passes, the collector at the end deposits into the vault. Press **E** at the green pad to collect, or buy the Auto Collector. Later pads add sentry turrets, body armor and weapon damage.
- **Armory** (red pads, right of the plot): buy weapons with coins. Number keys / scroll switch, **R** reloads, right-click aims (the sniper scopes).
- **Upgrades** (`src/upgrades.js`): ~100 upgrades in chains. Each chain shows its next pad once the previous one is bought, so the pad grid stays readable. Effects are derived from how many of each chain you own (`Tycoon.level(prefix)`), which is why the save only stores ids.
- **Enemies** (`src/enemies.js`): waves of hazmat raiders (red brutes from wave 3, zombies mixed in from wave 4) run at you. **Every 5th wave is a horde**: 2.5× the numbers, 1.6× the health, doubled bounties, and a giant boss zombie. Kills pay coins, wave clears pay a bonus, dying costs 10% of your wallet.
- **Walls** (`src/walls.js`): four tiers ring the plot with a gate at the front. Enemies that get stuck on a segment attack it; the blue repair pad by the collector fixes everything for 1.5× the damage taken.
- **Allies** (`src/allies.js`): hire Sam, Shaun and Lis as gun guards on fixed posts, Matt as a melee brawler, and the pug and German shepherd as attack dogs that chase anything near the base.
- **Weapon levels**: after buying a gun, its armory pad upgrades it (10 levels: +18% damage, +8% magazine, -4% reload each).
- **Weapons** (`src/weapons.js`): hitscan guns with headshot crits, plus a bouncing grenade launcher and a rocket launcher with splash damage.
- Progress saves to `localStorage` every few seconds and on every purchase. **Reset save** is on the start screen.

## Assets

- `public/assets/weapons`, `props`, `characters` — the low-poly war pack plus the zombie/survivor pack (Blender glTF exports). The characters are rigged with Idle/Run/Punch/Death clips (dogs: Idle/Run/Attack) and carry weapons as child nodes; the game shows only the one each character holds.
- `public/assets/tycoon` — "Tycoon Asset Pack #1" by Jay_Foo (CC-BY-4.0, see `license.txt`), used scaled down as the factory backdrop behind the plot.

## Graphics

Desktop renders through an `EffectComposer` with a 4× MSAA target, a light bloom on emissive parts and an `OutputPass`; an atmospheric `Sky`, a room environment map for reflections, 4096 shadow maps and a bump-mapped ground. Touch devices skip the composer and use 1024 shadow maps.

## Debugging

`window.__game` exposes the live objects; `__game.start()` runs without pointer lock and `__game.step(seconds)` advances the simulation, which is how the automated checks drive it.
