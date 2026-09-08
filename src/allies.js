// Hired survivors and dogs that defend the base.
import * as THREE from 'three';
import { A, loadGLTF, characterInstance } from './assets.js';
import { rand, resolveCircle, clamp } from './util.js';
import { SFX } from './audio.js';

const DEFS = {
  sam: { url: A.character('Characters_Sam_SingleWeapon'), kind: 'ranged', dmg: 22, rate: 0.55, range: 30, post: [21, -8.5], height: 1.85, anims: { idle: 'Idle_Gun', run: 'Run_Gun', attack: 'Idle_Gun' } },
  shaun: { url: A.character('Characters_Shaun_SingleWeapon'), kind: 'ranged', dmg: 12, rate: 0.16, range: 28, post: [-21, -8.5], height: 1.85, anims: { idle: 'Idle_Gun', run: 'Run_Gun', attack: 'Idle_Gun' } },
  lis: { url: A.character('Characters_Lis_SingleWeapon'), kind: 'ranged', dmg: 45, rate: 0.9, range: 45, post: [0, -33], height: 1.85, anims: { idle: 'Idle_Gun', run: 'Run_Gun', attack: 'Idle_Gun' } },
  matt: { url: A.character('Characters_Matt_SingleWeapon'), kind: 'melee', dmg: 40, rate: 0.8, range: 2.0, speed: 5.5, leash: 40, post: [0, -10], height: 1.85, anims: { idle: 'Idle', run: 'Run', attack: 'Stab' } },
  pug: { url: A.character('Characters_Pug'), kind: 'melee', dmg: 14, rate: 0.5, range: 1.4, speed: 7, leash: 45, post: [8, -12], height: 0.6, anims: { idle: 'Idle', run: 'Run', attack: 'Attack' } },
  shepherd: { url: A.character('Characters_GermanShepherd'), kind: 'melee', dmg: 30, rate: 0.6, range: 1.7, speed: 8, leash: 50, post: [-8, -12], height: 1.0, anims: { idle: 'Idle', run: 'Run', attack: 'Attack' } },
};

export class Allies {
  constructor({ scene, world, enemies, weapons, particles, hud }) {
    Object.assign(this, { scene, world, enemies, weapons, particles, hud });
    this.list = [];
    this.scale = {};
    this.dmgMult = 1;
    this.dogMult = 1;
    this.hiring = new Set();
  }

  has(key) { return this.hiring.has(key) || this.list.some((a) => a.key === key); }

  async hire(key) {
    if (this.has(key)) return;
    this.hiring.add(key); // reserve synchronously so a second call during the async load can't double-hire
    const d = DEFS[key];
    const { obj, clips } = await characterInstance(d.url);
    if (!this.scale[key]) {
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj, true);
      this.scale[key] = { s: d.height / ((box.max.y - box.min.y) || 1), minY: box.min.y };
    }
    const sc = this.scale[key];
    const root = new THREE.Group();
    obj.scale.setScalar(sc.s);
    obj.position.y = -sc.minY * sc.s;
    root.add(obj);
    root.position.set(d.post[0], 0, d.post[1]);
    this.scene.add(root);
    const mixer = new THREE.AnimationMixer(obj);
    const actions = {};
    for (const c of clips) actions[c.name] = mixer.clipAction(c);
    const a = { key, def: d, root, obj, mixer, actions, current: null, cd: rand(0, 0.5), yaw: 0, attackT: -1, target: null };
    this.list.push(a);
    this.play(a, d.anims.idle);
    return a;
  }

  play(a, name, fade = 0.15, once = false) {
    const act = a.actions[name];
    if (!act || a.current === act) return;
    if (a.current) a.current.fadeOut(fade);
    act.reset().fadeIn(fade);
    if (once) { act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; }
    act.play();
    a.current = act;
  }

  nearestEnemy(pos, range) {
    let best = null, bd = range;
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const dd = Math.hypot(e.root.position.x - pos.x, e.root.position.z - pos.z);
      if (dd < bd) { bd = dd; best = e; }
    }
    return best;
  }

  face(a, x, z, dt) {
    const target = Math.atan2(x - a.root.position.x, z - a.root.position.z);
    let dy = target - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    a.yaw += clamp(dy, -8 * dt, 8 * dt);
    a.root.rotation.y = a.yaw;
  }

  update(dt) {
    for (const a of this.list) {
      a.mixer.update(dt);
      a.cd -= dt;
      const d = a.def;
      const p = a.root.position;
      if (d.kind === 'ranged') {
        const e = this.nearestEnemy(p, d.range);
        if (!e) { this.play(a, d.anims.idle); continue; }
        this.face(a, e.root.position.x, e.root.position.z, dt);
        if (a.cd <= 0) {
          a.cd = d.rate;
          const from = new THREE.Vector3(p.x, 1.4, p.z).add(new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)).multiplyScalar(0.6));
          const to = e.root.position.clone(); to.y = 1.1;
          this.weapons.tracer(from, to);
          const res = this.enemies.hit(e, d.dmg * this.dmgMult, to);
          this.particles.emit(to, { count: 4, color: 0x9b1111, speed: 2, life: 0.4 });
          if (res.killed) this.hud.hitmarker(true);
          SFX.shot(d.dmg > 30 ? 'revolver' : 'smg');
        }
        continue;
      }
      // melee: chase enemies near the post, return when far
      const post = new THREE.Vector3(d.post[0], 0, d.post[1]);
      const isDog = a.key === 'pug' || a.key === 'shepherd';
      const speed = d.speed * (isDog ? this.dogMult : 1);
      if (a.attackT >= 0) {
        a.attackT += dt;
        if (a.attackT > 0.35 && !a.hitDone) {
          a.hitDone = true;
          if (a.target && !a.target.dead && a.target.root.position.distanceTo(p) < d.range + 0.8) {
            const res = this.enemies.hit(a.target, d.dmg * this.dmgMult * (isDog ? this.dogMult : 1), a.target.root.position);
            this.particles.emit(a.target.root.position.clone().add(new THREE.Vector3(0, 1, 0)), { count: 8, color: 0x9b1111, speed: 3, life: 0.5 });
            if (res.killed) this.hud.hitmarker(true);
          }
        }
        if (a.attackT > 0.75) { a.attackT = -1; a.cd = d.rate; }
        continue;
      }
      const e = this.nearestEnemy(post, d.leash);
      a.target = e;
      if (e) {
        const dist = e.root.position.distanceTo(p);
        this.face(a, e.root.position.x, e.root.position.z, dt);
        if (dist < d.range) {
          if (a.cd <= 0) { a.attackT = 0; a.hitDone = false; this.play(a, d.anims.attack, 0.08, true); }
          else this.play(a, d.anims.idle);
        } else {
          const dir = new THREE.Vector3().subVectors(e.root.position, p).setY(0).normalize();
          p.addScaledVector(dir, speed * dt);
          resolveCircle(p, 0.4, this.world.blockers);
          this.play(a, d.anims.run);
        }
      } else if (p.distanceTo(post) > 1.5) {
        this.face(a, post.x, post.z, dt);
        const dir = new THREE.Vector3().subVectors(post, p).setY(0).normalize();
        p.addScaledVector(dir, speed * 0.7 * dt);
        resolveCircle(p, 0.4, this.world.blockers);
        this.play(a, d.anims.run);
      } else this.play(a, d.anims.idle);
    }
  }
}
