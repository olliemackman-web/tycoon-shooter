// Raiders and zombies: rigged characters, wave composition, horde waves, chase AI, wall attacks.
import * as THREE from 'three';
import { A, loadGLTF, characterInstance } from './assets.js';
import { rand, makeBar, resolveCircle, clamp } from './util.js';
import { SFX } from './audio.js';
import { MAP_HALF } from './world.js';

const HUMAN = { run: 'Run', attack: 'Punch', idle: 'Idle', death: 'Death' };
const ZOMBIE = { run: 'Run_Arms', attack: 'Punch', idle: 'Idle', death: 'Death' };
export const TYPES = {
  hazmat: { url: A.character('Character_Hazmat'), hp: 100, speed: 3.9, dmg: 12, reward: 25, weapon: 'Shovel', height: 1.9, anims: HUMAN, label: 'Raider' },
  brute: { url: A.character('Character_Enemy'), hp: 340, speed: 3.0, dmg: 26, reward: 90, weapon: 'Knife_1', height: 2.15, anims: HUMAN, label: 'Brute' },
  zombie: { url: A.character('Zombie_Basic'), hp: 220, speed: 3.3, dmg: 18, reward: 45, height: 1.9, anims: ZOMBIE, label: 'Zombie' },
  runner: { url: A.character('Zombie_Arm'), hp: 130, speed: 5.2, dmg: 12, reward: 50, height: 1.85, anims: { run: 'Run_Arms', attack: 'Punch', idle: 'Idle', death: 'Death' }, label: 'Runner' },
  crawler: { url: A.character('Zombie_Ribcage'), hp: 90, speed: 4.4, dmg: 10, reward: 40, height: 1.7, anims: { run: 'Run', attack: 'Jump', idle: 'Idle', death: 'Death' }, label: 'Crawler' },
  chubby: { url: A.character('Zombie_Chubby'), hp: 700, speed: 2.4, dmg: 32, reward: 170, height: 2.1, anims: ZOMBIE, label: 'Bloater' },
  boss: { url: A.character('Zombie_Chubby'), hp: 6000, speed: 2.1, dmg: 70, reward: 3000, height: 3.6, width: 1.7, anims: ZOMBIE, label: 'HORDE BOSS', boss: true },
};
const WEAPON_NODES = ['AK', 'GrenadeLauncher', 'Knife_1', 'Knife_2', 'Pistol', 'Revolver', 'Revolver_Small', 'RocketLauncher', 'ShortCannon', 'Shotgun', 'Shovel', 'SMG', 'Sniper', 'Sniper_2'];
export const HORDE_EVERY = 5;
export const isHorde = (wave) => wave > 0 && wave % HORDE_EVERY === 0;

export class Enemies {
  constructor({ scene, player, world, particles, floaters, hud, onKill }) {
    Object.assign(this, { scene, player, world, particles, floaters, hud, onKill });
    this.list = [];
    this.hitboxes = [];
    this.wave = 0;
    this.countdown = 30;
    this.queue = [];
    this.spawnTimer = 0;
    this.waveActive = false;
    this.scale = {};
    this.paused = false;
    this.pending = 0;
    this.rewardMult = 1;
    this.headshotBonus = 1;
    this.walls = null;
  }

  async preload(onProgress) {
    const urls = [...new Set(Object.values(TYPES).map((t) => t.url))];
    let n = 0;
    await Promise.all(urls.map(async (u) => { await loadGLTF(u); onProgress?.(++n, urls.length); }));
    for (const [key, t] of Object.entries(TYPES)) {
      const { obj } = await characterInstance(t.url);
      obj.traverse((o) => { if (WEAPON_NODES.includes(o.name)) o.visible = false; });
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj, true);
      const h = box.max.y - box.min.y || 1;
      this.scale[key] = { s: t.height / h, minY: box.min.y };
    }
  }

  get alive() { return this.list.filter((e) => !e.dead).length; }
  get horde() { return isHorde(this.wave) && this.waveActive; }

  hpMult(wave) { const w = Math.max(0, wave - 1); return 1 + 0.16 * w + 0.012 * w * w; }
  rewardScale(wave) { return (1 + 0.12 * Math.max(0, wave - 1)) * this.rewardMult; }

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
    obj.traverse((o) => { if (WEAPON_NODES.includes(o.name)) o.visible = o.name === t.weapon; });
    root.add(obj);
    root.position.copy(pos);
    const mixer = new THREE.AnimationMixer(obj);
    const actions = {};
    for (const c of clips) actions[c.name] = mixer.clipAction(c);
    for (const n of [t.anims.death, t.anims.attack]) if (actions[n]) { actions[n].setLoop(THREE.LoopOnce); actions[n].clampWhenFinished = true; }
    const horde = isHorde(this.wave);
    const hpMul = this.hpMult(this.wave) * (horde ? 1.6 : 1);
    const e = {
      type: typeKey, def: t, root, obj, mixer, actions, current: null,
      hp: t.hp * hpMul, maxHp: t.hp * hpMul, dead: false, deadTime: 0,
      yaw: 0, attackCd: rand(0, 0.6), attackT: -1, speed: t.speed * rand(0.9, 1.15),
      reward: Math.round(t.reward * this.rewardScale(this.wave) * (horde ? 2 : 1)), flinch: 0, detour: 0, detourSide: 1, wallTarget: null,
      radius: t.boss ? 1.1 : 0.45,
    };
    const w = (t.width || 1);
    const bodyH = t.height * 0.75;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85 * w, bodyH, 0.7 * w), new THREE.MeshBasicMaterial());
    body.position.y = bodyH / 2;
    body.visible = false;
    body.userData = { enemy: e, part: 'body' };
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55 * w, 0.5 * w, 0.55 * w), new THREE.MeshBasicMaterial());
    head.position.y = t.height * 0.87;
    head.visible = false;
    head.userData = { enemy: e, part: 'head' };
    root.add(body, head);
    e.boxes = [body, head];
    this.hitboxes.push(body, head);
    const bar = makeBar(t.boss ? 3 : 1.3);
    bar.position.y = t.height + 0.35;
    bar.visible = !!t.boss;
    root.add(bar);
    e.bar = bar;
    this.scene.add(root);
    this.list.push(e);
    this.play(e, t.anims.run);
    return e;
  }

  play(e, name, fade = 0.15) {
    const a = e.actions[name] || e.actions.Idle;
    if (!a || e.current === a) return;
    if (e.current) e.current.fadeOut(fade);
    a.reset().fadeIn(fade).play();
    e.current = a;
  }

  composeWave(wave) {
    const q = [];
    const n = Math.min(45, 4 + wave * 2);
    if (isHorde(wave)) {
      const count = Math.min(80, Math.round(n * 2.5));
      for (let i = 0; i < count; i++) {
        const r = Math.random();
        q.push(r < 0.45 ? 'zombie' : r < 0.7 ? 'runner' : r < 0.88 ? 'crawler' : 'chubby');
      }
      for (let b = 0; b < 1 + Math.floor(wave / 10); b++) q.splice(Math.floor(count * 0.3 * (b + 1)), 0, 'boss');
      return q;
    }
    for (let i = 0; i < n; i++) {
      if (wave >= 3 && i % 4 === 3) { q.push('brute'); continue; }
      if (wave >= 4 && Math.random() < Math.min(0.5, 0.15 + wave * 0.03)) {
        const r = Math.random();
        q.push(wave >= 7 && r < 0.15 ? 'chubby' : r < 0.5 ? 'zombie' : r < 0.8 ? 'runner' : 'crawler');
        continue;
      }
      q.push('hazmat');
    }
    return q;
  }

  startWave() {
    this.wave++;
    this.waveActive = true;
    this.queue = this.composeWave(this.wave);
    this.spawnTimer = 0;
    if (isHorde(this.wave)) { this.hud.banner(`HORDE WAVE ${this.wave}`, 'Zombies are tough. Bounties are doubled.'); SFX.wave(); setTimeout(() => SFX.wave(), 400); }
    else { this.hud.log(`Wave ${this.wave} incoming!`, 'bad'); SFX.wave(); }
    this.onWaveStart?.(this.wave);
  }

  spawnPoint() {
    for (let i = 0; i < 20; i++) {
      const a = rand(0, Math.PI * 2), r = rand(58, 78);
      const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      if (p.z > -44 && Math.abs(p.x) < MAP_HALF - 6 && Math.abs(p.z) < MAP_HALF - 6) return p;
    }
    return new THREE.Vector3(60, 0, 30);
  }

  hit(e, dmg, point, opts = {}) {
    if (e.dead) return { killed: false };
    e.hp -= dmg;
    e.flinch = 0.25;
    e.bar.visible = true;
    e.bar.userData.set(e.hp / e.maxHp);
    if (e.hp <= 0) { this.kill(e, opts.headshot); return { killed: true }; }
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

  kill(e, headshot = false) {
    e.dead = true;
    e.deadTime = 0;
    e.bar.visible = false;
    for (const b of e.boxes) { const i = this.hitboxes.indexOf(b); if (i >= 0) this.hitboxes.splice(i, 1); }
    this.play(e, e.def.anims.death, 0.08);
    this.particles.emit(e.root.position.clone().add(new THREE.Vector3(0, 1, 0)), { count: e.def.boss ? 120 : 25, color: 0x8b0f0f, speed: 4, life: 0.8 });
    SFX.kill();
    if (e.def.boss) this.hud.banner('BOSS DOWN', `+$${e.reward * (headshot ? this.headshotBonus : 1)}`);
    this.onKill?.(e, headshot ? this.headshotBonus : 1);
  }

  update(dt) {
    if (this.paused) return;
    if (!this.waveActive) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startWave();
    } else {
      if (this.queue.length) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = isHorde(this.wave) ? 0.4 : 0.9;
          this.spawn(this.queue.shift(), this.spawnPoint());
        }
      } else if (this.alive === 0 && this.pending === 0) {
        this.waveActive = false;
        this.countdown = isHorde(this.wave) ? 35 : 22;
        const bonus = (isHorde(this.wave) ? 500 : 100) * this.wave;
        this.hud.log(`Wave ${this.wave} cleared! Bonus $${bonus}`, 'good');
        this.onWaveClear?.(this.wave, bonus);
      }
    }
    this.hud.setWave(this.wave, this.alive + this.queue.length, this.waveActive ? null : this.countdown, isHorde(this.wave + (this.waveActive ? 0 : 1)));

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
      const A = e.def.anims;
      const to = new THREE.Vector3(pp.x - e.root.position.x, 0, pp.z - e.root.position.z);
      const dist = to.length();
      // wall attack in progress?
      const target = e.wallTarget && !e.wallTarget.dead ? new THREE.Vector3(e.wallTarget.x, 0, e.wallTarget.z) : null;
      const aim = target ? target.clone().sub(e.root.position) : to;
      const targetYaw = Math.atan2(aim.x, aim.z);
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
          if (e.wallTarget && !e.wallTarget.dead) this.walls?.damage(e.wallTarget, e.def.dmg * 4);
          else if (dist < 2.6 + e.radius && !this.player.dead) this.player.damage(e.def.dmg, e.root.position);
        }
        if (e.attackT > 0.85) { e.attackT = -1; e.attackCd = 1.1; if (e.wallTarget?.dead) e.wallTarget = null; }
        continue;
      }
      if (e.wallTarget && !e.wallTarget.dead) {
        if (e.attackCd <= 0) { e.attackT = 0; e.attackHitDone = false; this.play(e, A.attack, 0.08); }
        else this.play(e, A.idle);
        continue;
      }
      if (this.player.dead) { this.play(e, A.idle); continue; }
      if (dist < 2.0 + e.radius) {
        if (e.attackCd <= 0) { e.attackT = 0; e.attackHitDone = false; this.play(e, A.attack, 0.08); }
        else this.play(e, A.idle);
        continue;
      }
      const dir = to.normalize();
      for (const o of this.list) {
        if (o === e || o.dead) continue;
        const dx = e.root.position.x - o.root.position.x, dz = e.root.position.z - o.root.position.z;
        const d = Math.hypot(dx, dz);
        const min = e.radius + o.radius + 0.4;
        if (d < min && d > 1e-3) { dir.x += (dx / d) * (min - d) * 1.5; dir.z += (dz / d) * (min - d) * 1.5; }
      }
      dir.normalize();
      e.stuckCheck = (e.stuckCheck || 0) + dt;
      if (e.stuckCheck > 0.5) {
        e.stuckCheck = 0;
        const moved = e.lastPos ? e.lastPos.distanceTo(e.root.position) : 1;
        e.lastPos = e.root.position.clone();
        if (moved < 0.35) {
          // blocked: attack a wall if one is in the way, otherwise sidestep
          const w = this.walls?.nearest(e.root.position, 3.2 + e.radius);
          if (w) e.wallTarget = w;
          else if (e.detour <= 0) { e.detour = 1.6; e.detourSide = Math.random() < 0.5 ? -1 : 1; }
        }
      }
      if (e.detour > 0) { e.detour -= dt; const px = -dir.z * e.detourSide, pz = dir.x * e.detourSide; dir.set(px * 0.85 + dir.x * 0.15, 0, pz * 0.85 + dir.z * 0.15).normalize(); }
      const sp = e.speed * (e.flinch > 0 ? 0.55 : 1);
      e.root.position.x += dir.x * sp * dt;
      e.root.position.z += dir.z * sp * dt;
      resolveCircle(e.root.position, e.radius, this.world.blockers);
      this.play(e, A.run);
      e.current.timeScale = clamp(sp / 3.6, 0.6, 1.6);
    }
  }

  serialize() { return { wave: this.wave }; }
  restore(s) { if (s?.wave) { this.wave = s.wave; this.countdown = 30; } }
}
