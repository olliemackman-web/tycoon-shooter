// First-person controller: pointer lock, WASD, sprint, jump, collisions, health.
import * as THREE from 'three';
import { clamp, resolveCircle } from './util.js';
import { MAP_HALF } from './world.js';
import { SFX } from './audio.js';

export class Player {
  constructor(camera, dom, world) {
    this.camera = camera;
    this.dom = dom;
    this.world = world;
    this.pos = new THREE.Vector3(0, 0, 2);
    this.vel = new THREE.Vector3();
    this.yaw = 0; // yaw 0 looks down -Z, toward the plot
    this.pitch = 0;
    this.height = 1.7;
    this.radius = 0.45;
    this.onGround = true;
    this.keys = {};
    this.locked = false;
    this.maxHp = 100;
    this.hp = 100;
    this.dead = false;
    this.regenDelay = 0;
    this.fire = false;
    this.aim = false;
    this.sensitivity = 0.0022;
    this.bob = 0;
    this.recoil = 0;
    this.shake = 0;
    this.onDeath = null;

    dom.addEventListener('click', () => { if (!this.locked && !this.dead) dom.requestPointerLock(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; if (!this.locked) { this.keys = {}; this.fire = false; } });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = this.sensitivity * (this.aim ? 0.5 : 1);
      this.yaw -= e.movementX * s;
      this.pitch = clamp(this.pitch - e.movementY * s, -1.5, 1.5);
    });
    document.addEventListener('keydown', (e) => { if (this.locked) this.keys[e.code] = true; if (e.code === 'Space' && this.locked) e.preventDefault(); });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    dom.addEventListener('mousedown', (e) => { if (!this.locked) return; if (e.button === 0) this.fire = true; if (e.button === 2) this.aim = true; });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; if (e.button === 2) this.aim = false; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.height, this.pos.z); }

  update(dt) {
    const k = this.keys;
    const move = new THREE.Vector3();
    if (!this.dead) {
      if (k.KeyW) move.add(this.forward);
      if (k.KeyS) move.sub(this.forward);
      if (k.KeyD) move.add(this.right);
      if (k.KeyA) move.sub(this.right);
    }
    const sprint = k.ShiftLeft && !this.aim;
    const speed = (sprint ? 9 : 5.8) * (this.aim ? 0.6 : 1);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    // smooth horizontal velocity
    const accel = this.onGround ? 14 : 4;
    this.vel.x += (move.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (move.z - this.vel.z) * Math.min(1, accel * dt);
    if (k.Space && this.onGround && !this.dead) { this.vel.y = 6.5; this.onGround = false; }
    this.vel.y -= 18 * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }
    resolveCircle(this.pos, this.radius, this.world.blockers);
    this.pos.x = clamp(this.pos.x, -MAP_HALF + 1, MAP_HALF - 1);
    this.pos.z = clamp(this.pos.z, -MAP_HALF + 1, MAP_HALF - 1);

    // camera
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bob += dt * (moving > 0.5 ? (sprint ? 13 : 9) : 0);
    const bobY = this.onGround ? Math.sin(this.bob) * 0.03 * Math.min(1, moving / 4) : 0;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.shake = Math.max(0, this.shake - dt * 4);
    const sh = this.shake * 0.03;
    this.camera.position.set(this.pos.x + (Math.random() - 0.5) * sh, this.pos.y + this.height + bobY + (Math.random() - 0.5) * sh, this.pos.z);
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.recoil * 0.05;
    this.camera.rotation.z = Math.sin(this.bob * 0.5) * 0.004 * Math.min(1, moving / 4);

    if (this.regenDelay > 0) this.regenDelay -= dt;
    else if (this.hp < this.maxHp && !this.dead) this.hp = Math.min(this.maxHp, this.hp + 6 * dt);
  }

  damage(amount, fromPos) {
    if (this.dead) return;
    this.hp -= amount;
    this.regenDelay = 5;
    this.shake = Math.min(3, this.shake + 1.2);
    SFX.hurt();
    const flash = document.getElementById('damageflash');
    flash.style.opacity = '1';
    setTimeout(() => (flash.style.opacity = '0'), 120);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.onDeath?.();
    }
  }

  respawn() {
    this.hp = this.maxHp;
    this.dead = false;
    this.pos.set(0, 0, 2);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
  }
}
