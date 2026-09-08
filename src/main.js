import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Weapons } from './weapons.js';
import { Enemies } from './enemies.js';
import { Tycoon } from './tycoon.js';
import { HUD } from './hud.js';
import { Particles, Floaters } from './util.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { unlockAudio } from './audio.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 400);
scene.add(camera);

const hud = new HUD();
const world = new World(scene);
const player = new Player(camera, renderer.domElement, world);
const particles = new Particles(scene);
const floaters = new Floaters(camera);
const enemies = new Enemies({ scene, player, world, particles, floaters, hud });
const weapons = new Weapons({ scene, camera, player, world, enemies, particles, floaters, hud });
const tycoon = new Tycoon({ scene, player, hud, floaters, particles, enemies, weapons });

const status = document.getElementById('status');
const playBtn = document.getElementById('play');
const overlay = document.getElementById('overlay');
const prog = { world: [0, 1], props: [0, 1], weapons: [0, 1], chars: [0, 1] };
function showProgress() {
  const done = Object.values(prog).reduce((a, p) => a + p[0], 0), total = Object.values(prog).reduce((a, p) => a + p[1], 0);
  status.textContent = `Loading assets… ${done}/${total}`;
}

async function init() {
  await Promise.all([
    world.build((d, t) => { prog.props = [d, t]; showProgress(); }),
    weapons.preload((d, t) => { prog.weapons = [d, t]; showProgress(); }),
    enemies.preload((d, t) => { prog.chars = [d, t]; showProgress(); }),
  ]);
  await tycoon.build();
  world.blockers.push(...tycoon.blockers);
  const save = loadSave();
  if (save) {
    tycoon.restore(save.tycoon);
    enemies.restore(save.enemies);
    if (save.weapons?.owned) { for (const id of save.weapons.owned) weapons.owned.includes(id) || weapons.owned.push(id); weapons.own(save.weapons.current || 'pistol'); }
    tycoon.applyPurchases();
    tycoon.refreshPads();
    tycoon.updateVaultLabel();
  }
  hud.setMoney(tycoon);
  hud.refreshSlots(weapons);
  status.textContent = save ? `Save loaded — wave ${enemies.wave}, $${Math.floor(tycoon.wallet)} in the wallet.` : 'Ready. Your first dropper is free — walk onto the gold pad.';
  playBtn.textContent = 'PLAY';
  playBtn.disabled = false;
}

let started = false;
playBtn.disabled = true;
playBtn.addEventListener('click', () => {
  if (playBtn.disabled) return;
  unlockAudio();
  overlay.classList.add('hidden');
  renderer.domElement.requestPointerLock();
  if (!started) { started = true; enemies.paused = false; }
});
document.getElementById('reset').addEventListener('click', () => { if (confirm('Delete your save and start over?')) { clearSave(); location.reload(); } });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && started && !player.dead) {
    overlay.classList.remove('hidden');
    playBtn.textContent = 'RESUME';
    status.textContent = 'Paused. Click resume to lock the mouse again.';
  }
});

enemies.onKill = (e) => {
  tycoon.addMoney(e.reward, e.root.position.clone().add(new THREE.Vector3(0, 2.2, 0)));
};
enemies.onWaveClear = (w) => { tycoon.addMoney(100 * w); saveNow(); };
tycoon.onChange = () => saveNow();
player.onDeath = () => {
  const ds = document.getElementById('deathscreen');
  ds.style.display = 'flex';
  const lost = Math.floor(tycoon.wallet * 0.1);
  if (lost > 0) { tycoon.wallet -= lost; hud.log(`Raiders looted $${lost} from your wallet`, 'bad'); hud.setMoney(tycoon); }
  let t = 3;
  const tick = () => { document.getElementById('respawn').textContent = t; if (t-- > 0) setTimeout(tick, 1000); else { ds.style.display = 'none'; player.respawn(); } };
  tick();
};

function saveNow() {
  writeSave({ tycoon: tycoon.serialize(), enemies: enemies.serialize(), weapons: { owned: weapons.owned, current: weapons.currentId }, t: Date.now() });
}
setInterval(() => { if (started) saveNow(); }, 8000);

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const running = started && overlay.classList.contains('hidden');
  if (running) {
    player.update(dt);
    weapons.update(dt);
    enemies.update(dt);
    tycoon.update(dt);
    world.update(dt);
  } else {
    // idle camera drift on the menu so the scene is visible behind the overlay
    player.update(0);
  }
  particles.update(dt);
  floaters.update(dt);
  hud.setHealth(player.hp, player.maxHp);
  renderer.render(scene, camera);
}
// Debug hook (used for automated checks): window.__game.start() runs without pointer lock.
window.__game = { player, weapons, enemies, tycoon, world, scene, camera, renderer, start() { started = true; overlay.classList.add('hidden'); player.locked = true; }, save: saveNow, step(seconds) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) { const dt = 1 / 60; player.update(dt); weapons.update(dt); enemies.update(dt); tycoon.update(dt); world.update(dt); particles.update(dt); floaters.update(dt); } } };
window.__game.ready = init().catch((err) => { status.textContent = 'Failed to load: ' + err.message; console.error(err); });
loop();
