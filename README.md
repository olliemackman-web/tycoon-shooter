# Hazmat Siege Tycoon

A browser tycoon shooter built with Three.js. Build a conveyor plant (droppers → refiners → collector) to earn coins, and fight off waves of hazmat raiders with an armory of guns bought from the same coins.

## Play

```bash
npm install
npm run dev
```

Open http://localhost:5173, click **PLAY** (the browser locks the mouse). `npm run build` writes a static bundle to `dist/` that can be dropped on any static host.

## Mobile

Touch devices get a virtual joystick (left), drag-to-look (right half), and FIRE / AIM / JUMP / RELOAD / SWAP / USE buttons. Play in landscape; a rotate prompt covers the screen in portrait, and PLAY requests fullscreen. Shadows and pixel ratio are reduced on touch devices. To try it on your phone, run `npm run dev` (it listens on the LAN) and open the `Network:` address Vite prints. Append `?touch=1` to force the touch layout on a desktop browser.

## How it works

- **Tycoon** (`src/tycoon.js`): walk onto a gold pad to buy it. The first dropper is free. Droppers drop ore onto the conveyor, refiners multiply it as it passes, the collector at the end deposits into the vault. Press **E** at the green pad to collect, or buy the Auto Collector. Later pads add sentry turrets, body armor and weapon damage.
- **Armory** (red pads, right of the plot): buy weapons with coins. Number keys / scroll switch, **R** reloads, right-click aims (the sniper scopes).
- **Enemies** (`src/enemies.js`): waves of hazmat raiders (and red brutes from wave 3) run at you and punch. Kills pay coins, wave clears pay a bonus, dying costs 10% of your wallet.
- **Weapons** (`src/weapons.js`): hitscan guns with headshot crits, plus a bouncing grenade launcher and a rocket launcher with splash damage.
- Progress saves to `localStorage` every few seconds and on every purchase. **Reset save** is on the start screen.

## Assets

- `public/assets/weapons`, `props`, `characters` — the low-poly war pack (Blender glTF exports). The characters are rigged with Idle/Run/Punch/Death clips and carry every weapon as a child node; the game shows only the one each enemy holds.
- `public/assets/tycoon` — "Tycoon Asset Pack #1" by Jay_Foo (CC-BY-4.0, see `license.txt`), used scaled down as the factory backdrop behind the plot.

## Debugging

`window.__game` exposes the live objects; `__game.start()` runs without pointer lock and `__game.step(seconds)` advances the simulation, which is how the automated checks drive it.
