// Hazmat raiders: rigged characters, waves, chase AI, melee attacks, hitboxes.
import * as THREE from 'three';
import { A, loadGLTF, characterInstance } from './assets.js';
import { rand, makeBar, resolveCircle, clamp } from './util.js';
import { SFX } from './audio.js';
import { MAP_HALF } from './world.js';

const TYPES = {
  hazmat: { url: A.character('Character_Hazmat'), hp: 100, speed: 3.9, dmg: 12, reward: 25, weapon: 'Shovel', height: 1.9 },
  brute: { url: A.character('Character_Enemy'), hp: 340, speed: 3.0, dmg: 26, reward: 90, weapon: 'Knife_1', height: 2.15 },
};
const WEAPON_NODES = ['AK', 'GrenadeLauncher', 'Knife_1', 'Knife_2', 'Pistol', 'Revolver', 'Revolver_Small', 'RocketLauncher', 'ShortCannon', 'Shotgun', 'Shovel', 'SMG', 'Sniper', 'Sniper_2'];
const FACING = 0; // model already faces +Z, the direction of its yaw

export class Enemies {
  constructor({ scene, player, world, particles, floaters, hud, onKill }) {
    Object.assign(this, { scene, player, world, particles, floaters, hud, onKill });
    this.list = [];
    this.hitboxes = [];
    this.wave = 0;
    this.countdown = 30;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.waveActive = false;
    this.scale = {};
    this.paused = false;
    this.pending = 0; // spawns whose model is still being cloned
  }

  async preload(onProgress) {
    let n = 0;
    for (const [key, t] of Object.entries(TYPES)) {
      await loadGLTF(t.url);
      // measure natural height once so we can scale to the design height
      const { obj } = await characterInstance(t.url);
      obj.traverse((o) => { if (WEAPON_NODES.includes(o.name)) o.visible = false; });
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj, true);
      const h = box.max.y - box.min.y || 1;
      this.scale[key] = { s: t.height / h, minY: box.min.y };
      onProgress?.(++n, 2);
    }
  }

  get alive() { return this.list.filter((e) => !e.dead).length; }

  async spawn(typeKey, pos) {
    const t = TYPES[typeKey];
    this.pending++;
    let inst;
    try { inst = await characterInstance(t.url); } finally { this.pending--; }
    const { obj, clips } = inst;
    const sc = this.scale[typeKey];
    const root = new THREE.Group();
    obj.scale.setScalar(sc.s);
    obj.position.y = -sc.minY * sc.s;
    obj.rotation.y = FACING;
    obj.traverse((o) => { if (WEAPON_NODES.includes(o.name)) o.visible = o.name === t.weapon; });
    root.add(obj);
    root.position.copy(pos);
    const mixer = new THREE.AnimationMixer(obj);
    const actions = {};
    for (const c of clips) actions[c.name] = mixer.clipAction(c);
    for (const n of ['Death', 'Punch', 'HitReact']) if (actions[n]) { actions[n].setLoop(THREE.LoopOnce); actions[n].clampWhenFinished = true; }
    const hpMul = 1 + 0.14 * Math.max(0, this.wave - 1);
    const e = {
      type: typeKey, def: t, root, obj, mixer, actions, current: null,
      hp: t.hp * hpMul, maxHp: t.hp * hpMul, dead: false, deadTime: 0,
      yaw: 0, attackCd: rand(0, 0.6), attackT: -1, speed: t.speed * rand(0.9, 1.15),
      reward: Math.round(t.reward * (1 + 0.1 * Math.max(0, this.wave - 1))), flinch: 0, detour: 0, detourSide: 1,
    };
    // hitboxes (invisible, still raycastable)
    const bodyH = t.height * 0.75;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, bodyH, 0.7), new THREE.MeshBasicMaterial());
    body.position.y = bodyH / 2;
    body.visible = false;
    body.userData = { enemy: e, part: 'body' };
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), new THREE.MeshBasicMaterial());
    head.position.y = t.height * 0.87;
    head.visible = false;
    head.userData = { enemy: e, part: 'head' };
    root.add(body, head);
    e.boxes = [body, head];
    this.hitboxes.push(body, head);
    const bar = makeBar(1.3);
    bar.position.y = t.height + 0.35;
    bar.visible = false;
    root.add(bar);
    e.bar = bar;
    this.scene.add(root);
    this.list.push(e);
    this.play(e, 'Run');
    return e;
  }

  play(e, name, fade = 0.15) {
    const a = e.actions[name];
    if (!a || e.current === a) return;
    if (e.current) e.current.fadeOut(fade);
    a.reset().fadeIn(fade).play();
    e.current = a;
  }

  startWave() {
    this.wave++;
    this.waveActive = true;
    this.toSpawn = Math.min(40, 4 + this.wave * 2);
    this.spawnTimer = 0;
    this.spawned = 0;
    this.hud.log(`Wave ${this.wave} incoming!`, 'bad');
    SFX.wave();
  }

  spawnPoint() {
    for (let i = 0; i < 20; i++) {
      const a = rand(0, Math.PI * 2), r = rand(58, 78);
      const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      if (p.z > -44 && Math.abs(p.x) < MAP_HALF - 6 && Math.abs(p.z) < MAP_HALF - 6) return p;
    }
    return new THREE.Vector3(60, 0, 30);
  }

  hit(e, dmg, point) {
    if (e.dead) return { killed: false };
    e.hp -= dmg;
    e.flinch = 0.25;
    e.bar.visible = true;
    e.bar.userData.set(e.hp / e.maxHp);
    if (e.hp <= 0) { this.kill(e); return { killed: true }; }
    return { killed: false };
  }

  damageArea(center, radius, dmg) {
    const out = [];
    for (const e of this.list) {
      if (e.dead) continue;
      const p = e.root.position.clone(); p.y += 1;
      const d = p.distanceTo(center);
      if (d > radius) continue;
      const amount = dmg * (1 - 0.7 * (d / radius));
      const res = this.hit(e, amount, p);
      out.push({ pos: e.root.position, dmg: amount, killed: res.killed });
    }
    return out;
  }

  kill(e) {
    e.dead = true;
    e.deadTime = 0;
    e.bar.visible = false;
    for (const b of e.boxes) { const i = this.hitboxes.indexOf(b); if (i >= 0) this.hitboxes.splice(i, 1); }
    this.play(e, 'Death', 0.08);
    this.particles.emit(e.root.position.clone().add(new THREE.Vector3(0, 1, 0)), { count: 25, color: 0x8b0f0f, speed: 4, life: 0.8 });
    SFX.kill();
    this.onKill?.(e);
  }

  update(dt) {
    if (this.paused) return;
    // waves
    if (!this.waveActive) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startWave();
    } else {
      if (this.spawned < this.toSpawn) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = 0.9;
          const brute = this.wave >= 3 && this.spawned % 4 === 3;
          this.spawn(brute ? 'brute' : 'hazmat', this.spawnPoint());
          this.spawned++;
        }
      } else if (this.alive === 0 && this.pending === 0) {
        this.waveActive = false;
        this.countdown = 22;
        this.hud.log(`Wave ${this.wave} cleared! Bonus $${100 * this.wave}`, 'good');
        this.onWaveClear?.(this.wave);
      }
    }
    this.hud.setWave(this.wave, this.alive, this.waveActive ? null : this.countdown);

    const pp = this.player.pos;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.mixer.update(dt);
      if (e.dead) {
        e.deadTime += dt;
        if (e.deadTime > 1.6) e.root.position.y -= dt * 0.8;
        if (e.deadTime > 3.2) { this.scene.remove(e.root); this.list.splice(i, 1); }
        continue;
      }
      const to = new THREE.Vector3(pp.x - e.root.position.x, 0, pp.z - e.root.position.z);
      const dist = to.length();
      const targetYaw = Math.atan2(to.x, to.z);
      let dy = targetYaw - e.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.yaw += clamp(dy, -6 * dt, 6 * dt);
      e.root.rotation.y = e.yaw;
      e.attackCd -= dt;
      e.flinch = Math.max(0, e.flinch - dt);

      if (e.attackT >= 0) {
        e.attackT += dt;
        if (e.attackT > 0.38 && !e.attackHitDone) {
          e.attackHitDone = true;
          if (dist < 2.6 && !this.player.dead) this.player.damage(e.def.dmg, e.root.position);
        }
        if (e.attackT > 0.85) { e.attackT = -1; e.attackCd = 1.1; }
        continue;
      }
      if (this.player.dead) { this.play(e, 'Idle'); continue; }
      if (dist < 2.0) {
        if (e.attackCd <= 0) { e.attackT = 0; e.attackHitDone = false; this.play(e, 'Punch', 0.08); }
        else this.play(e, 'Idle');
        continue;
      }
      // chase with separation from other enemies
      const dir = to.normalize();
      for (const o of this.list) {
        if (o === e || o.dead) continue;
        const dx = e.root.position.x - o.root.position.x, dz = e.root.position.z - o.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.3 && d > 1e-3) { dir.x += (dx / d) * (1.3 - d) * 1.5; dir.z += (dz / d) * (1.3 - d) * 1.5; }
      }
      dir.normalize();
      // Unstick: if we've barely moved for half a second, sidestep along the obstacle for a while.
      e.stuckCheck = (e.stuckCheck || 0) + dt;
      if (e.stuckCheck > 0.5) {
        e.stuckCheck = 0;
        const moved = e.lastPos ? e.lastPos.distanceTo(e.root.position) : 1;
        e.lastPos = e.root.position.clone();
        if (moved < 0.35 && e.detour <= 0) { e.detour = 1.6; e.detourSide = Math.random() < 0.5 ? -1 : 1; }
      }
      if (e.detour > 0) { e.detour -= dt; const px = -dir.z * e.detourSide, pz = dir.x * e.detourSide; dir.set(px * 0.85 + dir.x * 0.15, 0, pz * 0.85 + dir.z * 0.15).normalize(); }
      const sp = e.speed * (e.flinch > 0 ? 0.55 : 1);
      e.root.position.x += dir.x * sp * dt;
      e.root.position.z += dir.z * sp * dt;
      resolveCircle(e.root.position, 0.45, this.world.blockers);
      this.play(e, 'Run');
      e.current.timeScale = sp / 3.6;
    }
  }

  serialize() { return { wave: this.wave }; }
  restore(s) { if (s?.wave) { this.wave = s.wave; this.countdown = 30; } }
}
