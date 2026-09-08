// The money machine: droppers, conveyor, refiners, collector, upgrade pads, armory, sentries.
import * as THREE from 'three';
import { A, propInstance, loadGLTF } from './assets.js';
import { makeLabel, fmt, rand } from './util.js';
import { SFX } from './audio.js';
import { WEAPONS } from './weapons.js';

const BELT_Z = -22, BELT_Y = 0.9, BELT_X0 = -13, BELT_X1 = 14.2, BELT_SPEED = 2.6;
const DROPPER_X = [-11, -7.5, -4, -0.5, 3];
const DROPPER_VALUE = [5, 9, 14, 20, 30];
const REFINER_X = [6.5, 9, 11.5];
const REFINER_MULT = [2, 2, 3];
const REFINER_COLOR = [0x4fc3f7, 0xffd54a, 0xff7043];

export const UPGRADES = [
  { id: 'd1', name: 'Dropper I', price: 0, req: null, desc: 'Drops $5 ore' },
  { id: 'd2', name: 'Dropper II', price: 200, req: 'd1', desc: 'Drops $9 ore' },
  { id: 'r1', name: 'Refiner I', price: 500, req: 'd2', desc: 'Ore value ×2' },
  { id: 'd3', name: 'Dropper III', price: 900, req: 'r1', desc: 'Drops $14 ore' },
  { id: 'speed1', name: 'Fast Droppers', price: 1400, req: 'd3', desc: 'Drop rate +40%' },
  { id: 'auto', name: 'Auto Collector', price: 1800, req: 'speed1', desc: 'Vault pays straight to you' },
  { id: 'r2', name: 'Refiner II', price: 2800, req: 'auto', desc: 'Ore value ×2 again' },
  { id: 'd4', name: 'Dropper IV', price: 3600, req: 'r2', desc: 'Drops $20 ore' },
  { id: 'armor', name: 'Body Armor', price: 4500, req: 'auto', desc: '+50 max health' },
  { id: 'value1', name: 'Rich Ore', price: 6000, req: 'd4', desc: 'All ore ×2' },
  { id: 'turret1', name: 'Sentry Turret', price: 7500, req: 'value1', desc: 'Auto-shoots raiders' },
  { id: 'd5', name: 'Dropper V', price: 9500, req: 'turret1', desc: 'Drops $30 ore' },
  { id: 'dmg', name: 'Hollow Points', price: 11000, req: 'armor', desc: '+30% weapon damage' },
  { id: 'speed2', name: 'Turbo Droppers', price: 14000, req: 'd5', desc: 'Drop rate +60%' },
  { id: 'r3', name: 'Refiner III', price: 20000, req: 'speed2', desc: 'Ore value ×3' },
  { id: 'turret2', name: 'Sentry Turret II', price: 26000, req: 'r3', desc: 'Second sentry' },
  { id: 'value2', name: 'Plutonium Ore', price: 40000, req: 'value2req', desc: 'All ore ×3' },
];
UPGRADES.find((u) => u.id === 'value2').req = 'turret2';

const PAD_SLOTS = [];
for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) PAD_SLOTS.push([-16 + i * 4, -15 + r * 4]);

export class Tycoon {
  constructor({ scene, player, hud, floaters, particles, enemies, weapons }) {
    Object.assign(this, { scene, player, hud, floaters, particles, enemies, weapons });
    this.wallet = 0;
    this.vault = 0;
    this.purchased = new Set();
    this.ores = [];
    this.droppers = [];
    this.refiners = [];
    this.pads = [];
    this.turrets = [];
    this.incomeLog = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.padCooldown = 0;
    this.time = 0;
    this.prompt = null;
    document.addEventListener('keydown', (e) => { if (e.code === 'KeyE' && this.player.locked) this.tryCollect(); });
  }

  get dropInterval() { return 3.2 * (this.purchased.has('speed1') ? 0.7 : 1) * (this.purchased.has('speed2') ? 0.62 : 1); }
  get valueMult() { return (this.purchased.has('value1') ? 2 : 1) * (this.purchased.has('value2') ? 3 : 1); }

  async build() {
    const g = this.group;
    // Concrete slab for the plot.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(46, 0.12, 28), new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.95 }));
    slab.position.set(0, 0.06, -20);
    slab.receiveShadow = true;
    g.add(slab);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(46, 0.13, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd54a }));
    stripe.position.set(0, 0.07, -6.2); g.add(stripe);

    // Conveyor belt with animated stripes.
    const beltTex = makeBeltTexture();
    beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
    beltTex.repeat.set(14, 1);
    this.beltTex = beltTex;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(BELT_X1 - BELT_X0 + 1, 0.25, 1.5), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.8 }));
    belt.position.set((BELT_X0 + BELT_X1) / 2, BELT_Y - 0.125, BELT_Z);
    belt.castShadow = belt.receiveShadow = true;
    g.add(belt);
    const railMat = new THREE.MeshStandardMaterial({ color: 0xffb300, roughness: 0.5, metalness: 0.3 });
    for (const dz of [-0.85, 0.85]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(BELT_X1 - BELT_X0 + 1, 0.5, 0.12), railMat);
      rail.position.set((BELT_X0 + BELT_X1) / 2, BELT_Y + 0.05, BELT_Z + dz);
      rail.castShadow = true;
      g.add(rail);
    }
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.7, metalness: 0.4 });
    for (let x = BELT_X0; x <= BELT_X1; x += 3) for (const dz of [-0.6, 0.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, BELT_Y - 0.25, 0.15), legMat);
      leg.position.set(x, (BELT_Y - 0.25) / 2, BELT_Z + dz);
      g.add(leg);
    }
    // Collector hopper at the end of the belt.
    const hopper = new THREE.Group();
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.8, 1.6, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }));
    funnel.position.y = BELT_Y + 0.6;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0x1f5a38, roughness: 0.6, metalness: 0.3 }));
    tank.position.y = 0.8;
    hopper.add(funnel, tank);
    hopper.position.set(BELT_X1 + 1.5, 0, BELT_Z);
    hopper.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(hopper);
    this.hopper = hopper;
    this.vaultLabel = makeLabel(['VAULT', '$0'], { accent: '#6cf28a', size: 44, scale: 0.55 });
    this.vaultLabel.position.set(BELT_X1 + 1.5, 4.2, BELT_Z);
    g.add(this.vaultLabel);
    // Collect pad in front of the hopper.
    this.collectPad = this.makePad(BELT_X1 + 1.5, BELT_Z + 4, 0x6cf28a);
    this.collectLabel = makeLabel(['COLLECT', 'Press E'], { accent: '#6cf28a', size: 40, scale: 0.45 });
    this.collectLabel.position.set(BELT_X1 + 1.5, 2.2, BELT_Z + 4);
    g.add(this.collectLabel);
    this.blockers = [{ type: 'box', x: (BELT_X0 + BELT_X1) / 2, z: BELT_Z, hx: (BELT_X1 - BELT_X0) / 2 + 0.5, hz: 0.9 }, { type: 'circle', x: BELT_X1 + 1.5, z: BELT_Z, r: 1.5 }];

    // Dropper machines (hidden until bought).
    for (let i = 0; i < DROPPER_X.length; i++) {
      const d = this.makeDropper(DROPPER_X[i], i);
      d.visible = false;
      g.add(d);
      this.droppers.push({ mesh: d, active: false, timer: rand(0, 2), value: DROPPER_VALUE[i], index: i });
    }
    for (let i = 0; i < REFINER_X.length; i++) {
      const r = this.makeRefiner(REFINER_X[i], REFINER_COLOR[i], REFINER_MULT[i]);
      r.visible = false;
      g.add(r);
      this.refiners.push({ mesh: r, active: false, x: REFINER_X[i], mult: REFINER_MULT[i], color: REFINER_COLOR[i] });
    }
    // Armory pads.
    const sign = makeLabel(['ARMORY', 'walk onto a pad to buy'], { accent: '#ff5252', size: 44, scale: 0.6 });
    sign.position.set(27, 5, -19);
    g.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.5), new THREE.MeshStandardMaterial({ color: 0x555 }));
    pole.position.set(27, 2.25, -19); g.add(pole);
    const buyable = WEAPONS.filter((w) => w.price > 0);
    buyable.forEach((w, i) => {
      const x = 27, z = -8 - i * 3.6;
      const pad = this.makePad(x, z, 0xff5252);
      const label = makeLabel([w.name, `$${fmt(w.price)}`, w.desc], { accent: '#ff5252', size: 36, scale: 0.55 });
      label.position.set(x, 2.4, z);
      g.add(label);
      this.pads.push({ kind: 'weapon', weapon: w, pad, label, x, z, r: 1.4 });
    });
    const st = await propInstance(A.prop('Structure_2'));
    st.position.set(34, 0, -19); st.rotation.y = -Math.PI / 2; st.scale.setScalar(1.4); g.add(st);
    this.blockers.push({ type: 'box', x: 34, z: -19, hx: 4, hz: 4 });
    // Display weapons on crates around the armory.
    for (let i = 0; i < 3; i++) {
      const crate = await propInstance(A.prop('Crate'));
      crate.position.set(30.5, 0, -10 - i * 8); crate.scale.setScalar(1.3); g.add(crate);
      this.blockers.push({ type: 'box', x: 30.5, z: -10 - i * 8, hx: 0.7, hz: 0.7 });
    }
    this.refreshPads();
    this.applyPurchases();
    this.hud.setMoney(this);
  }

  makePad(x, z, color) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.16, 28), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }));
    pad.position.set(x, 0.2, z);
    pad.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.06, 8, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.8 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.09;
    pad.add(ring);
    this.group.add(pad);
    return pad;
  }

  makeDropper(x, i) {
    const grp = new THREE.Group();
    const hue = [0x9e9e9e, 0x64b5f6, 0x81c784, 0xffb74d, 0xba68c8][i];
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.8), new THREE.MeshStandardMaterial({ color: hue, roughness: 0.5, metalness: 0.4 }));
    body.position.y = BELT_Y + 2.4;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.6, metalness: 0.5 }));
    spout.position.y = BELT_Y + 1.3;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00e676, emissiveIntensity: 2 }));
    light.position.set(0.7, BELT_Y + 3.0, 0.95);
    grp.add(body, spout, light);
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, BELT_Y + 1.7, 0.14), new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.5 }));
      leg.position.set(dx, (BELT_Y + 1.7) / 2, dz * 1.6);
      grp.add(leg);
    }
    const label = makeLabel([`DROPPER ${['I', 'II', 'III', 'IV', 'V'][i]}`, `$${DROPPER_VALUE[i]} ore`], { size: 36, scale: 0.35, accent: '#ffd54a' });
    label.position.y = BELT_Y + 3.8;
    grp.add(label);
    grp.position.set(x, 0, BELT_Z);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return grp;
  }

  makeRefiner(x, color, mult) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.5, metalness: 0.5 });
    for (const dz of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 0.4), mat);
      post.position.set(0, BELT_Y + 1.0, dz);
      grp.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 2.6), mat);
    top.position.y = BELT_Y + 2.2;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 1.9), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, transparent: true, opacity: 0.45 }));
    beam.position.y = BELT_Y + 1.2;
    grp.add(top, beam);
    const label = makeLabel([`REFINER ×${mult}`], { size: 36, scale: 0.32, accent: '#' + new THREE.Color(color).getHexString() });
    label.position.y = BELT_Y + 3.1;
    grp.add(label);
    grp.position.set(x, 0, BELT_Z);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return grp;
  }

  async makeTurret(x, z) {
    const grp = new THREE.Group();
    const base = await propInstance(A.prop('Crate'));
    base.scale.setScalar(1.3);
    const head = new THREE.Group();
    const cannon = (await loadGLTF(A.weapon('ShortCannon'))).scene.clone(true);
    cannon.scale.setScalar(1.8);
    cannon.rotation.y = Math.PI / 2; // muzzle (-X) now points +Z... rotate so barrel points -Z of head
    head.add(cannon);
    head.position.y = 1.35;
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.5 }));
    mount.position.y = 1.15;
    grp.add(base, mount, head);
    grp.position.set(x, 0, z);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(grp);
    this.blockers.push({ type: 'box', x, z, hx: 0.7, hz: 0.7 });
    this.turrets.push({ grp, head, cd: 0, x, z });
  }

  refreshPads() {
    for (const p of this.pads.filter((p) => p.kind === 'upgrade')) { this.group.remove(p.pad); this.group.remove(p.label); }
    this.pads = this.pads.filter((p) => p.kind !== 'upgrade');
    let slot = 0;
    for (const u of UPGRADES) {
      if (this.purchased.has(u.id)) continue;
      if (u.req && !this.purchased.has(u.req)) continue;
      const [x, z] = PAD_SLOTS[slot++];
      const pad = this.makePad(x, z, 0xffd54a);
      const label = makeLabel([u.name, u.price ? `$${fmt(u.price)}` : 'FREE', u.desc], { accent: '#ffd54a', size: 36, scale: 0.55 });
      label.position.set(x, 2.4, z);
      this.group.add(label);
      this.pads.push({ kind: 'upgrade', upgrade: u, pad, label, x, z, r: 1.4 });
    }
    for (const p of this.pads.filter((p) => p.kind === 'weapon')) {
      const owned = this.weapons.owned.includes(p.weapon.id);
      p.label.userData.redraw([p.weapon.name, owned ? 'OWNED' : `$${fmt(p.weapon.price)}`, p.weapon.desc], { accent: owned ? '#6cf28a' : '#ff5252' });
      p.pad.material.color.set(owned ? 0x6cf28a : 0xff5252);
      p.pad.material.emissive.set(owned ? 0x6cf28a : 0xff5252);
    }
  }

  applyPurchases() {
    this.droppers.forEach((d, i) => { d.active = this.purchased.has(`d${i + 1}`); d.mesh.visible = d.active; });
    this.refiners.forEach((r, i) => { r.active = this.purchased.has(`r${i + 1}`); r.mesh.visible = r.active; });
    this.player.maxHp = this.purchased.has('armor') ? 150 : 100;
    this.weapons.damageMult = this.purchased.has('dmg') ? 1.3 : 1;
    if (this.purchased.has('turret1') && this.turrets.length < 1) this.makeTurret(-17, -8.5);
    if (this.purchased.has('turret2') && this.turrets.length < 2) this.makeTurret(17, -8.5);
  }

  buy(u) {
    if (this.wallet < u.price) { this.hud.log(`Need $${fmt(u.price - this.wallet)} more for ${u.name}`, 'bad'); SFX.deny(); return false; }
    this.wallet -= u.price;
    this.purchased.add(u.id);
    this.applyPurchases();
    this.refreshPads();
    this.hud.log(`Bought ${u.name}!`, 'good');
    SFX.buy();
    this.particles.emit(this.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 40, color: 0xffd54a, speed: 4, life: 0.9, gravity: 3 });
    this.hud.setMoney(this);
    this.onChange?.();
    return true;
  }

  buyWeapon(w) {
    if (this.weapons.owned.includes(w.id)) { this.weapons.equip(w.id); return; }
    if (this.wallet < w.price) { this.hud.log(`Need $${fmt(w.price - this.wallet)} more for ${w.name}`, 'bad'); SFX.deny(); return; }
    this.wallet -= w.price;
    this.weapons.own(w.id);
    this.refreshPads();
    this.hud.log(`Bought ${w.name}!`, 'good');
    SFX.buy();
    this.hud.setMoney(this);
    this.onChange?.();
  }

  addMoney(n, at) {
    this.wallet += n;
    this.hud.setMoney(this);
    if (at) this.floaters.add(at, `+$${fmt(n)}`);
  }

  tryCollect() {
    const dx = this.player.pos.x - this.collectPad.position.x, dz = this.player.pos.z - this.collectPad.position.z;
    if (Math.hypot(dx, dz) > 1.6 || this.vault <= 0) return;
    const n = this.vault;
    this.vault = 0;
    this.addMoney(n, this.player.eye.add(this.player.forward.multiplyScalar(2)));
    SFX.coin();
    this.updateVaultLabel();
    this.onChange?.();
  }

  updateVaultLabel() { this.vaultLabel.userData.redraw(['VAULT', `$${fmt(this.vault)}`], { accent: '#6cf28a' }); }

  deposit(v) {
    this.incomeLog.push([this.time, v]);
    if (this.purchased.has('auto')) { this.wallet += v; SFX.coin(); }
    else this.vault += v;
    this.updateVaultLabel();
    this.hud.setMoney(this);
  }

  get incomePerMin() {
    const cutoff = this.time - 60;
    this.incomeLog = this.incomeLog.filter((e) => e[0] >= cutoff);
    const span = Math.max(15, Math.min(60, this.time));
    return this.incomeLog.reduce((a, e) => a + e[1], 0) * (60 / span);
  }

  spawnOre(d) {
    if (this.ores.length > 80) return;
    const v = d.value * this.valueMult;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.7, metalness: 0.2, emissive: 0x000000 }));
    mesh.castShadow = true;
    mesh.position.set(d.mesh.position.x, BELT_Y + 1.0, BELT_Z + rand(-0.25, 0.25));
    mesh.rotation.y = rand(0, Math.PI);
    this.group.add(mesh);
    this.ores.push({ mesh, value: v, refined: new Set(), vy: 0 });
    SFX.drop();
  }

  update(dt) {
    this.time += dt;
    this.padCooldown -= dt;
    this.beltTex.offset.x -= dt * BELT_SPEED / 2.2;
    for (const d of this.droppers) {
      if (!d.active) continue;
      d.timer -= dt;
      if (d.timer <= 0) { d.timer = this.dropInterval * rand(0.9, 1.1); this.spawnOre(d); }
    }
    for (const r of this.refiners) if (r.active) r.mesh.children[3].material.opacity = 0.35 + Math.sin(this.time * 6) * 0.12;
    for (let i = this.ores.length - 1; i >= 0; i--) {
      const o = this.ores[i];
      const m = o.mesh;
      if (m.position.y > BELT_Y + 0.25) { o.vy -= 12 * dt; m.position.y = Math.max(BELT_Y + 0.25, m.position.y + o.vy * dt); }
      else {
        m.position.x += BELT_SPEED * dt;
        for (const r of this.refiners) {
          if (r.active && !o.refined.has(r) && m.position.x >= r.x) {
            o.refined.add(r);
            o.value *= r.mult;
            m.material.color.set(r.color); m.material.emissive.set(r.color); m.material.emissiveIntensity = 0.6; m.material.metalness = 0.6; m.material.roughness = 0.3;
            m.scale.multiplyScalar(1.12);
            this.particles.emit(m.position, { count: 12, color: r.color, speed: 2, life: 0.5, gravity: 2 });
          }
        }
        if (m.position.x >= BELT_X1) {
          this.group.remove(m); m.geometry.dispose(); m.material.dispose();
          this.ores.splice(i, 1);
          this.deposit(o.value);
          this.floaters.add(new THREE.Vector3(BELT_X1 + 1.5, BELT_Y + 2, BELT_Z), `+$${fmt(o.value)}`);
          this.particles.emit(new THREE.Vector3(BELT_X1 + 1.5, BELT_Y + 1.2, BELT_Z), { count: 8, color: 0x6cf28a, speed: 2, life: 0.4, gravity: 2 });
          continue;
        }
      }
      m.rotation.y += dt * 0.6;
    }
    // Pads: step on to buy.
    let prompt = null;
    for (const p of this.pads) {
      const d = Math.hypot(this.player.pos.x - p.x, this.player.pos.z - p.z);
      p.pad.rotation.y += dt * 0.5;
      p.label.position.y = 2.4 + Math.sin(this.time * 2 + p.x) * 0.08;
      if (d < p.r) {
        if (p.kind === 'upgrade') prompt = `${p.upgrade.name} — ${p.upgrade.desc} (${p.upgrade.price ? '$' + fmt(p.upgrade.price) : 'free'})`;
        else prompt = this.weapons.owned.includes(p.weapon.id) ? `${p.weapon.name} — owned (step on to equip)` : `${p.weapon.name} — $${fmt(p.weapon.price)}`;
        if (!p.inside && this.padCooldown <= 0) {
          p.inside = true;
          this.padCooldown = 0.3;
          if (p.kind === 'upgrade') { if (this.buy(p.upgrade)) break; }
          else this.buyWeapon(p.weapon);
        }
      } else p.inside = false;
    }
    const dc = Math.hypot(this.player.pos.x - this.collectPad.position.x, this.player.pos.z - this.collectPad.position.z);
    if (dc < 1.6) prompt = this.purchased.has('auto') ? 'Auto collector active — vault pays you directly' : this.vault > 0 ? `Press E to collect $${fmt(this.vault)}` : 'Vault is empty — buy droppers!';
    this.hud.prompt(prompt);
    this.updateTurrets(dt);
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) this.hud.setMoney(this);
  }

  updateTurrets(dt) {
    for (const t of this.turrets) {
      t.cd -= dt;
      let best = null, bd = 32;
      for (const e of this.enemies.list) {
        if (e.dead) continue;
        const d = Math.hypot(e.root.position.x - t.x, e.root.position.z - t.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) continue;
      const target = best.root.position.clone(); target.y = 1.0;
      const headWorld = new THREE.Vector3(t.x, 1.35, t.z);
      t.head.lookAt(target.x, 1.35, target.z);
      if (t.cd <= 0) {
        t.cd = 0.4;
        const from = headWorld.clone().add(target.clone().sub(headWorld).normalize().multiplyScalar(1.2));
        this.weapons.tracer(from, target);
        const res = this.enemies.hit(best, 16 * this.weapons.damageMult, target);
        this.particles.emit(target, { count: 5, color: 0x9b1111, speed: 2, life: 0.4 });
        if (res.killed) this.hud.hitmarker(true);
        SFX.shot('smg');
      }
    }
  }

  serialize() { return { wallet: this.wallet, vault: this.vault, purchased: [...this.purchased] }; }
  restore(s) {
    if (!s) return;
    this.wallet = s.wallet || 0;
    this.vault = s.vault || 0;
    this.purchased = new Set(s.purchased || []);
  }
}

function makeBeltTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#23272b'; g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#3a4046'; g.fillRect(0, 0, 8, 32); g.fillRect(32, 0, 8, 32);
  g.fillStyle = '#ffb300'; g.fillRect(28, 12, 12, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
