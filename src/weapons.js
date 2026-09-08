// Weapon definitions, first-person view model, hitscan + projectile firing, effects.
import * as THREE from 'three';
import { A, loadGLTF } from './assets.js';
import { SFX } from './audio.js';
import { rand } from './util.js';

// Models point down -X with the grip at the origin; knives point +Y. RocketLauncher.gltf carries a baked 180° turn, hence rotY.
export const WEAPONS = [
  { id: 'knife', name: 'Combat Knife', model: 'Knife_1', kind: 'melee', sfx: 'melee', damage: 45, rpm: 150, range: 2.6, price: 0, view: [0.3, -0.3, -0.5], scale: 0.5, desc: 'Free · melee' },
  { id: 'pistol', name: 'Pistol', model: 'Pistol', kind: 'hitscan', sfx: 'pistol', damage: 22, rpm: 320, auto: false, mag: 12, reload: 1.1, spread: 0.012, pellets: 1, price: 0, view: [0.3, -0.28, -0.55], scale: 0.42, desc: 'Free · starter sidearm' },
  { id: 'smg', name: 'SMG', model: 'SMG', kind: 'hitscan', sfx: 'smg', damage: 13, rpm: 850, auto: true, mag: 32, reload: 1.5, spread: 0.03, pellets: 1, price: 400, view: [0.3, -0.27, -0.5], scale: 0.42, desc: 'Fast · spray and pray' },
  { id: 'shotgun', name: 'Shotgun', model: 'Shotgun', kind: 'hitscan', sfx: 'shotgun', damage: 14, rpm: 75, auto: false, mag: 6, reload: 2.2, spread: 0.07, pellets: 9, price: 900, view: [0.28, -0.26, -0.5], scale: 0.4, desc: '9 pellets · devastating up close' },
  { id: 'ak', name: 'AK Rifle', model: 'AK', kind: 'hitscan', sfx: 'ak', damage: 28, rpm: 600, auto: true, mag: 30, reload: 1.9, spread: 0.02, pellets: 1, price: 1800, view: [0.3, -0.26, -0.5], scale: 0.42, desc: 'All-rounder · full auto' },
  { id: 'revolver', name: 'Revolver', model: 'Revolver', kind: 'hitscan', sfx: 'revolver', damage: 70, rpm: 160, auto: false, mag: 6, reload: 1.8, spread: 0.008, pellets: 1, price: 1500, view: [0.3, -0.28, -0.55], scale: 0.42, desc: 'Hand cannon · big damage' },
  { id: 'sniper', name: 'Sniper Rifle', model: 'Sniper', kind: 'hitscan', sfx: 'sniper', damage: 220, rpm: 45, auto: false, mag: 5, reload: 2.6, spread: 0.002, pellets: 1, price: 4000, view: [0.28, -0.24, -0.5], scale: 0.36, zoom: 22, desc: 'Right click to scope · one-shot heads' },
  { id: 'gl', name: 'Grenade Launcher', model: 'GrenadeLauncher', kind: 'projectile', sfx: 'launcher', damage: 110, radius: 4.5, speed: 26, gravity: 12, fuse: 2.5, rpm: 70, auto: false, mag: 4, reload: 2.8, price: 6500, view: [0.3, -0.28, -0.5], scale: 0.42, ammoModel: 'Grenade', desc: 'Bouncing grenades · splash damage' },
  { id: 'rocket', name: 'Rocket Launcher', model: 'RocketLauncher', kind: 'projectile', sfx: 'launcher', damage: 320, radius: 6.5, speed: 34, gravity: 0, fuse: 4, rpm: 35, auto: false, mag: 1, reload: 2.4, price: 12000, view: [0.3, -0.3, -0.6], scale: 0.34, rotY: 0, ammoModel: null, desc: 'Massive splash · clears crowds' },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

export class Weapons {
  constructor({ scene, camera, player, world, enemies, particles, floaters, hud }) {
    Object.assign(this, { scene, camera, player, world, enemies, particles, floaters, hud });
    this.owned = ['knife', 'pistol'];
    this.currentId = 'pistol';
    this.state = {}; // per weapon: mag
    this.levels = {}; // per weapon upgrade level (0-10)
    for (const w of WEAPONS) this.state[w.id] = { mag: w.mag || 0 };
    this.cooldown = 0;
    this.reloading = 0;
    this.triggerHeld = false;
    this.models = {};
    this.viewRoot = new THREE.Group();
    camera.add(this.viewRoot);
    this.viewModel = null;
    this.projectiles = [];
    this.tracers = [];
    this.flash = new THREE.PointLight(0xffc266, 0, 12, 2);
    scene.add(this.flash);
    this.muzzleSprite = makeFlashSprite();
    this.viewRoot.add(this.muzzleSprite);
    this.kick = new THREE.Vector3();
    this.swayTarget = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.baseFov = 75;
    this.damageMult = 1;
    this.setupInput();
  }

  async preload(onProgress) {
    const names = new Set(WEAPONS.map((w) => w.model).concat(WEAPONS.map((w) => w.ammoModel).filter(Boolean)));
    let n = 0;
    await Promise.all([...names].map(async (m) => { await loadGLTF(A.weapon(m)); onProgress?.(++n, names.size); }));
    this.equip(this.currentId, true);
  }

  setupInput() {
    document.addEventListener('keydown', (e) => {
      if (!this.player.locked) return;
      if (e.code === 'KeyR') this.reload();
      if (e.code.startsWith('Digit')) {
        const i = parseInt(e.code.slice(5), 10) - 1;
        if (this.owned[i]) this.equip(this.owned[i]);
      }
    });
    document.addEventListener('wheel', (e) => { if (this.player.locked) this.cycle(e.deltaY > 0 ? 1 : -1); });
  }

  cycle(dir) {
    const i = this.owned.indexOf(this.currentId);
    this.equip(this.owned[(i + dir + this.owned.length) % this.owned.length]);
  }

  get current() { return WEAPON_BY_ID[this.currentId]; }

  // Effective stats after upgrade levels: +18% damage, +8% magazine, -4% reload per level.
  stats(id) {
    const w = WEAPON_BY_ID[id];
    const l = this.levels[id] || 0;
    return { damage: w.damage * (1 + 0.18 * l), mag: w.mag ? Math.round(w.mag * (1 + 0.08 * l)) : 0, reload: w.reload ? w.reload * (1 - 0.04 * l) : 0 };
  }
  upgradeCost(id) { const w = WEAPON_BY_ID[id]; const base = Math.max(300, w.price * 0.4); return Math.round(base * Math.pow(1.45, this.levels[id] || 0)); }
  upgrade(id) {
    this.levels[id] = (this.levels[id] || 0) + 1;
    this.state[id].mag = this.stats(id).mag;
    if (this.currentId === id) this.hud.setWeapon(this.current, this.state[id], this.stats(id));
  }

  own(id) {
    if (this.owned.includes(id)) return;
    // keep the canonical order so number keys stay predictable
    this.owned = WEAPONS.filter((w) => this.owned.includes(w.id) || w.id === id).map((w) => w.id);
    this.state[id].mag = this.stats(id).mag;
    this.equip(id);
    this.hud.refreshSlots(this);
  }

  async equip(id, silent = false) {
    if (!this.owned.includes(id)) return;
    this.currentId = id;
    this.reloading = 0;
    this.cooldown = Math.max(this.cooldown, 0.25);
    if (this.viewModel) this.viewRoot.remove(this.viewModel);
    const w = this.current;
    if (!this.models[id]) {
      const gltf = await loadGLTF(A.weapon(w.model));
      const m = gltf.scene.clone(true);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
      const holder = new THREE.Group();
      if (w.kind === 'melee') { m.rotation.x = -Math.PI / 2; m.rotation.z = 0.35; } else m.rotation.y = w.rotY ?? -Math.PI / 2;
      m.scale.setScalar(w.scale);
      holder.add(m);
      this.models[id] = holder;
    }
    this.viewModel = this.models[id];
    this.viewRoot.add(this.viewModel);
    this.viewModel.position.set(...w.view).add(new THREE.Vector3(0, -0.3, 0)); // raise-in animation
    this.hud.refreshSlots(this);
    this.hud.setWeapon(w, this.state[id], this.stats(id));
    if (!silent) SFX.reload();
  }

  reload() {
    const w = this.current;
    if (w.kind === 'melee' || this.reloading > 0) return;
    const st = this.stats(w.id);
    if (this.state[w.id].mag >= st.mag) return;
    this.reloading = st.reload;
    SFX.reload();
    this.hud.setReloading(true);
  }

  update(dt) {
    const w = this.current;
    const st = this.state[w.id];
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { st.mag = this.stats(w.id).mag; this.hud.setReloading(false); this.hud.setWeapon(w, st, this.stats(w.id)); }
    }
    const aiming = this.player.aim && w.kind !== 'melee';
    // view model placement: base position, ADS lerp, sway, kick
    const target = new THREE.Vector3(...w.view);
    if (aiming) target.set(0, -0.19 + (w.zoom ? -0.02 : 0), -0.42);
    if (this.reloading > 0) target.y -= 0.18 + Math.sin(this.reloading * 6) * 0.03;
    if (this.viewModel) {
      this.viewModel.position.lerp(target, Math.min(1, dt * 12));
      const p = this.player;
      const mv = Math.hypot(p.vel.x, p.vel.z);
      const sway = aiming ? 0.15 : 1;
      this.viewModel.position.x += Math.sin(p.bob) * 0.01 * Math.min(1, mv / 4) * sway;
      this.viewModel.position.y += Math.abs(Math.cos(p.bob)) * 0.008 * Math.min(1, mv / 4) * sway;
      this.viewModel.position.add(this.kick);
      this.viewModel.rotation.set(this.kick.z * -2.5, 0, 0);
      this.viewModel.visible = !(aiming && w.zoom);
    }
    this.kick.multiplyScalar(Math.max(0, 1 - dt * 14));
    // FOV zoom
    const fov = aiming ? (w.zoom || 52) : this.baseFov;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 12); this.camera.updateProjectionMatrix(); }
    this.hud.setScope(aiming && !!w.zoom);
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 120);
    this.muzzleSprite.material.opacity = Math.max(0, this.muzzleSprite.material.opacity - dt * 22);

    // firing
    const wantFire = this.player.fire && this.player.locked && !this.player.dead;
    if (wantFire && (w.auto || w.kind === 'melee' || !this.triggerHeld) && this.cooldown <= 0 && this.reloading <= 0) {
      if (w.kind !== 'melee' && st.mag <= 0) { this.reload(); }
      else this.fire();
    }
    this.triggerHeld = wantFire;

    // tracers fade
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07);
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); this.tracers.splice(i, 1); }
    }
    this.updateProjectiles(dt);
  }

  muzzleWorld() {
    const cam = this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const aiming = this.player.aim;
    return cam.position.clone().addScaledVector(fwd, 0.9).addScaledVector(right, aiming ? 0 : 0.28).addScaledVector(up, aiming ? -0.12 : -0.2);
  }

  fire() {
    const w = this.current;
    const st = this.state[w.id];
    const dmg = this.stats(w.id).damage;
    this.cooldown = 60 / w.rpm;
    SFX.shot(w.sfx);
    const cam = this.camera;
    const origin = cam.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    if (w.kind === 'melee') {
      this.kick.set(0.04, -0.05, 0.12);
      this.raycaster.set(origin, fwd);
      this.raycaster.far = w.range;
      const hits = this.raycaster.intersectObjects(this.enemies.hitboxes, false);
      if (hits.length) { this.applyHit(hits[0], dmg * this.damageMult, hits[0].object.userData.part === 'head'); return; }
      const hw = this.raycaster.intersectObjects(this.world.raycastTargets, false);
      if (hw.length) this.particles.emit(hw[0].point, { count: 6, color: 0xffcc66, speed: 3, life: 0.3 });
      return;
    }
    st.mag--;
    this.hud.setWeapon(w, st, this.stats(w.id));
    this.kick.set(rand(-0.01, 0.01), 0.01, 0.03 + (w.damage / 400));
    this.player.recoil += 0.3 + w.damage / 200;
    this.player.pitch += (0.004 + w.damage / 12000) * (this.player.aim ? 0.5 : 1);
    this.flash.position.copy(this.muzzleWorld());
    this.flash.intensity = 6;
    this.muzzleSprite.position.copy(this.viewModel ? this.viewModel.position.clone().add(new THREE.Vector3(this.player.aim ? 0 : 0.02, 0.05, -0.75)) : new THREE.Vector3(0, 0, -1));
    this.muzzleSprite.material.opacity = 1;
    this.muzzleSprite.material.rotation = Math.random() * Math.PI * 2;

    if (w.kind === 'projectile') { this.launch(w, origin, fwd, dmg); return; }

    const spread = w.spread * (this.player.aim ? 0.35 : 1) * (Math.hypot(this.player.vel.x, this.player.vel.z) > 4 ? 1.6 : 1);
    for (let p = 0; p < w.pellets; p++) {
      const dir = fwd.clone();
      dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread);
      dir.normalize();
      this.raycaster.set(origin, dir);
      this.raycaster.far = 200;
      const eh = this.raycaster.intersectObjects(this.enemies.hitboxes, false);
      const wh = this.raycaster.intersectObjects(this.world.raycastTargets, false);
      let end = origin.clone().addScaledVector(dir, 200);
      if (eh.length && (!wh.length || eh[0].distance < wh[0].distance)) {
        end = eh[0].point;
        this.applyHit(eh[0], dmg * this.damageMult, eh[0].object.userData.part === 'head');
      } else if (wh.length) {
        end = wh[0].point;
        this.particles.emit(end, { count: 5, color: 0xffd28a, speed: 4, life: 0.35, spread: 1 });
      }
      this.tracer(this.muzzleWorld(), end);
    }
  }

  applyHit(hit, dmg, crit) {
    const enemy = hit.object.userData.enemy;
    const res = this.enemies.hit(enemy, crit ? dmg * 2.2 : dmg, hit.point, { headshot: crit });
    this.particles.emit(hit.point, { count: 10, color: 0x9b1111, speed: 3, life: 0.5, spread: 1 });
    this.floaters.add(hit.point.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 0.3, 0)), Math.round(crit ? dmg * 2.2 : dmg).toString(), crit ? 'crit' : 'dmg');
    this.hud.hitmarker(res.killed);
    SFX.hit();
  }

  tracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }

  async launch(w, origin, dir, dmg) {
    let mesh;
    if (w.ammoModel) {
      const gltf = await loadGLTF(A.weapon(w.ammoModel));
      mesh = gltf.scene.clone(true);
      mesh.scale.setScalar(0.6);
    } else {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.6 }));
      body.rotation.x = Math.PI / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0xcc3333 }));
      tip.rotation.x = -Math.PI / 2; tip.position.z = -0.4;
      mesh.add(body, tip);
      const glow = new THREE.PointLight(0xffaa44, 3, 6);
      glow.position.z = 0.35;
      mesh.add(glow);
    }
    mesh.position.copy(this.muzzleWorld());
    this.scene.add(mesh);
    const vel = dir.clone().multiplyScalar(w.speed);
    this.projectiles.push({ mesh, vel, life: w.fuse, w, dmg, prev: mesh.position.clone(), bounces: 0 });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vel.y -= p.w.gravity * dt;
      p.prev.copy(p.mesh.position);
      const step = p.vel.clone().multiplyScalar(dt);
      const len = step.length();
      this.raycaster.set(p.prev, step.clone().normalize());
      this.raycaster.far = len + 0.2;
      const eh = this.raycaster.intersectObjects(this.enemies.hitboxes, false);
      const wh = this.raycaster.intersectObjects(this.world.raycastTargets, false);
      let hitPoint = null;
      if (eh.length) hitPoint = eh[0].point;
      else if (wh.length) {
        if (p.w.gravity > 0 && p.bounces < 2 && p.life > 0.4) {
          // grenade: bounce off surfaces
          const n = wh[0].face ? wh[0].face.normal.clone().transformDirection(wh[0].object.matrixWorld) : new THREE.Vector3(0, 1, 0);
          p.vel.reflect(n).multiplyScalar(0.45);
          p.mesh.position.copy(wh[0].point).addScaledVector(n, 0.15);
          p.bounces++;
          SFX.drop();
          continue;
        }
        hitPoint = wh[0].point;
      }
      if (hitPoint) { this.explode(hitPoint, p.w, p.dmg); this.removeProjectile(i); continue; }
      p.mesh.position.add(step);
      p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
      if (p.w.gravity === 0) this.particles.emit(p.mesh.position, { count: 2, color: 0xbbbbbb, speed: 0.5, life: 0.6, gravity: -0.5, spread: 0.3 });
      if (p.life <= 0) { this.explode(p.mesh.position.clone(), p.w, p.dmg); this.removeProjectile(i); }
    }
  }

  removeProjectile(i) {
    const p = this.projectiles[i];
    this.scene.remove(p.mesh);
    this.projectiles.splice(i, 1);
  }

  explode(center, w, dmg = w.damage) {
    SFX.explosion();
    this.particles.emit(center, { count: 90, color: 0xff8a2a, speed: 9, life: 0.7, spread: 1, gravity: 5 });
    this.particles.emit(center, { count: 60, color: 0x333333, speed: 4, life: 1.4, spread: 1, gravity: -1.5 });
    this.particles.emit(center, { count: 30, color: 0xffe6a0, speed: 14, life: 0.35, spread: 1, gravity: 12 });
    const light = new THREE.PointLight(0xffa040, 40, w.radius * 4, 2);
    light.position.copy(center).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(light);
    let t = 0;
    const fade = () => { t += 0.016; light.intensity = Math.max(0, 40 * (1 - t / 0.35)); if (t < 0.35) requestAnimationFrame(fade); else this.scene.remove(light); };
    fade();
    const results = this.enemies.damageArea(center, w.radius, dmg * this.damageMult);
    for (const r of results) {
      this.floaters.add(r.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), Math.round(r.dmg).toString(), 'dmg');
      this.hud.hitmarker(r.killed);
    }
    const dp = this.player.eye.distanceTo(center);
    if (dp < w.radius) this.player.damage(Math.round(dmg * 0.3 * (1 - dp / w.radius)), center);
    this.player.shake = Math.min(4, this.player.shake + 3 * Math.max(0.2, 1 - dp / 30));
  }
}

function makeFlashSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  grad.addColorStop(0.6, 'rgba(255,120,30,0.35)');
  grad.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(0.35, 0.35, 1);
  s.renderOrder = 999;
  return s;
}
