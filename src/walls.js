// Base walls: tiered prop segments around the plot that enemies must break through.
import * as THREE from 'three';
import { A, propInstance } from './assets.js';
import { makeBar } from './util.js';

const TIERS = [
  null,
  { prop: 'SackTrench', scale: [1.35, 1.35, 1.35], hp: 400, hz: 0.6, name: 'Sandbags' },
  { prop: 'MetalFence', scale: [1.28, 1.28, 1.28], hp: 1000, hz: 0.25, name: 'Steel fence' },
  { prop: 'Barrier_Fixed', scale: [1.18, 1.18, 1.18], hp: 2500, hz: 0.45, name: 'Blast barrier' },
  { prop: 'Container_Long', scale: [1.05, 1.05, 1.05], hp: 6000, hz: 1.1, name: 'Container' },
];
const PITCH = 4.6;

export class Walls {
  constructor({ scene, world }) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.segments = [];
    this.level = 0;
    this.hpMult = 1;
    // perimeter of the plot slab (x -23..23, z -34..-6) with a gate in the front centre
    this.layout = [];
    for (let x = -20.7; x <= 20.71; x += PITCH) {
      this.layout.push({ x, z: -34.2, ry: 0 });
      if (Math.abs(x) > 5) this.layout.push({ x, z: -5.8, ry: 0 });
    }
    for (let z = -29.6; z <= -10.4; z += PITCH) {
      this.layout.push({ x: -23.2, z, ry: Math.PI / 2 });
      this.layout.push({ x: 23.2, z, ry: Math.PI / 2 });
    }
  }

  get tier() { return TIERS[this.level]; }
  get totalDamage() { return this.segments.reduce((a, s) => a + (s.maxHp - s.hp), 0); }

  async setLevel(level, hpMult = this.hpMult) {
    this.hpMult = hpMult;
    if (level === this.level) { this.reinforce(); return; }
    this.level = level;
    const gen = (this.gen = (this.gen || 0) + 1);
    for (const s of this.segments) this.removeSegment(s, true);
    this.segments = [];
    const t = TIERS[level];
    if (!t) return;
    await Promise.all(this.layout.map(async (l) => {
      const obj = await propInstance(A.prop(t.prop));
      if (gen !== this.gen) return; // a newer tier was requested while this one was loading
      obj.scale.set(...t.scale);
      obj.position.set(l.x, 0, l.z);
      obj.rotation.y = l.ry;
      this.group.add(obj);
      const swap = l.ry !== 0;
      const blocker = { type: 'box', x: l.x, z: l.z, hx: swap ? t.hz : PITCH / 2, hz: swap ? PITCH / 2 : t.hz, wall: true };
      this.world.blockers.push(blocker);
      const meshes = [];
      obj.traverse((o) => { if (o.isMesh) { meshes.push(o); this.world.raycastTargets.push(o); } });
      const bar = makeBar(2.2);
      bar.position.set(l.x, 3.4, l.z);
      bar.visible = false;
      this.group.add(bar);
      this.segments.push({ obj, blocker, meshes, bar, hp: t.hp * hpMult, maxHp: t.hp * hpMult, x: l.x, z: l.z, dead: false });
    }));
  }

  reinforce() {
    for (const s of this.segments) {
      const ratio = s.hp / s.maxHp;
      s.maxHp = this.tier.hp * this.hpMult;
      s.hp = s.maxHp * ratio;
    }
  }

  removeSegment(s, dispose = false) {
    const i = this.world.blockers.indexOf(s.blocker);
    if (i >= 0) this.world.blockers.splice(i, 1);
    for (const m of s.meshes) { const j = this.world.raycastTargets.indexOf(m); if (j >= 0) this.world.raycastTargets.splice(j, 1); }
    s.obj.visible = false;
    if (dispose) { this.group.remove(s.obj); this.group.remove(s.bar); }
  }

  nearest(pos, r) {
    let best = null, bd = r;
    for (const s of this.segments) {
      if (s.dead) continue;
      const d = Math.hypot(pos.x - s.x, pos.z - s.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  damage(s, amount) {
    if (s.dead) return;
    s.hp -= amount;
    s.bar.visible = true;
    s.bar.userData.set(s.hp / s.maxHp);
    if (s.hp <= 0) { s.hp = 0; s.dead = true; s.bar.visible = false; this.removeSegment(s); }
  }

  repairAll() {
    for (const s of this.segments) {
      if (s.dead) {
        s.dead = false;
        s.obj.visible = true;
        this.world.blockers.push(s.blocker);
        this.world.raycastTargets.push(...s.meshes);
      }
      s.hp = s.maxHp;
      s.bar.visible = false;
    }
  }
}
