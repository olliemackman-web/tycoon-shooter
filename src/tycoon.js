// The money machine: droppers, conveyor, refiners, collector, upgrade pads, armory, sentries, walls, allies.
import * as THREE from 'three';
import { A, propInstance, loadGLTF } from './assets.js';
import { makeLabel, fmt, rand } from './util.js';
import { SFX } from './audio.js';
import { WEAPONS } from './weapons.js';
import { UPGRADES, CATS, DROPPER_VALUE } from './upgrades.js';

const BELT_Z = -22, BELT_Y = 0.9, BELT_X0 = -20, BELT_X1 = 14.2;
const DROPPER_X = Array.from({ length: 8 }, (_, i) => -18 + i * 3.5);
const REFINER_X = [9, 11, 13];
const REFINER_BASE = [2, 2, 3];
const REFINER_COLOR = [0x4fc3f7, 0xffd54a, 0xff7043];
const TURRET_POSTS = [[-15, -8.5], [15, -8.5], [-15, -32], [15, -32]];
const PAD_SLOTS = [];
for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) PAD_SLOTS.push([-16 + i * 4, -16 + r * 3.5]);
const MAX_WEAPON_LEVEL = 10;

export class Tycoon {
  constructor({ scene, player, hud, floaters, particles, enemies, weapons, walls, allies }) {
    Object.assign(this, { scene, player, hud, floaters, particles, enemies, weapons, walls, allies });
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
    this.bankTimer = 0;
    document.addEventListener('keydown', (e) => { if (e.code === 'KeyE' && this.player.locked) this.tryCollect(); });
  }

  // number of purchased upgrades in a chain, e.g. level('sp') for Dropper Speed
  level(prefix) { let n = 0; for (const id of this.purchased) if (id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length))) n++; return n; }
  get dropInterval() { return 3.2 * Math.pow(0.75, this.level('sp')); }
  get valueMult() { return Math.pow(1.6, this.level('v')); }
  get beltSpeed() { return 2.6 * Math.pow(1.3, this.level('bs')); }
  refinerMult(i) { return REFINER_BASE[i] + this.level('rb'); }

  async build() {
    const g = this.group;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(46, 0.12, 28), new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.95 }));
    slab.position.set(0, 0.06, -20);
    slab.receiveShadow = true;
    g.add(slab);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(46, 0.13, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd54a }));
    stripe.position.set(0, 0.07, -6.2); g.add(stripe);

    const beltTex = makeBeltTexture();
    beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
    beltTex.repeat.set(18, 1);
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
    const hopper = new THREE.Group();
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.8, 1.6, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }));
    funnel.position.y = BELT_Y + 0.6;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0x1f5a38, roughness: 0.6, metalness: 0.3 }));
    tank.position.y = 0.8;
    hopper.add(funnel, tank);
    hopper.position.set(BELT_X1 + 1.5, 0, BELT_Z);
    hopper.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(hopper);
    this.vaultLabel = makeLabel(['VAULT', '$0'], { accent: '#6cf28a', size: 44, scale: 0.55 });
    this.vaultLabel.position.set(BELT_X1 + 1.5, 4.2, BELT_Z);
    g.add(this.vaultLabel);
    this.collectPad = this.makePad(BELT_X1 + 1.5, BELT_Z + 4, 0x6cf28a);
    this.collectLabel = makeLabel(['COLLECT', 'Press E'], { accent: '#6cf28a', size: 40, scale: 0.45 });
    this.collectLabel.position.set(BELT_X1 + 1.5, 2.2, BELT_Z + 4);
    g.add(this.collectLabel);
    // repair pad next to the collector
    this.repairPad = this.makePad(BELT_X1 + 5.5, BELT_Z + 4, 0x4fc3f7);
    this.repairLabel = makeLabel(['REPAIR WALLS', '$0'], { accent: '#4fc3f7', size: 40, scale: 0.45 });
    this.repairLabel.position.set(BELT_X1 + 5.5, 2.2, BELT_Z + 4);
    g.add(this.repairLabel);
    this.repairPad.visible = false; this.repairLabel.visible = false;
    this.blockers = [{ type: 'box', x: (BELT_X0 + BELT_X1) / 2, z: BELT_Z, hx: (BELT_X1 - BELT_X0) / 2 + 0.5, hz: 0.9 }, { type: 'circle', x: BELT_X1 + 1.5, z: BELT_Z, r: 1.5 }];

    for (let i = 0; i < DROPPER_X.length; i++) {
      const d = this.makeDropper(DROPPER_X[i], i);
      d.visible = false;
      g.add(d);
      this.droppers.push({ mesh: d, active: false, timer: rand(0, 2), value: DROPPER_VALUE[i], index: i });
    }
    for (let i = 0; i < REFINER_X.length; i++) {
      const r = this.makeRefiner(REFINER_X[i], REFINER_COLOR[i], REFINER_BASE[i]);
      r.visible = false;
      g.add(r);
      this.refiners.push({ mesh: r, active: false, x: REFINER_X[i], index: i, color: REFINER_COLOR[i], label: r.userData.label });
    }
    const sign = makeLabel(['ARMORY', 'step on a pad to buy or upgrade'], { accent: '#ff5252', size: 44, scale: 0.6 });
    sign.position.set(27, 5, -19);
    g.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.5), new THREE.MeshStandardMaterial({ color: 0x555 }));
    pole.position.set(27, 2.25, -19); g.add(pole);
    const buyable = WEAPONS.filter((w) => w.price > 0 || w.id === 'pistol');
    buyable.forEach((w, i) => {
      const x = 27, z = -6 - i * 3.6;
      const pad = this.makePad(x, z, 0xff5252);
      const label = makeLabel([w.name, `$${fmt(w.price)}`, w.desc], { accent: '#ff5252', size: 36, scale: 0.55 });
      label.position.set(x, 2.4, z);
      g.add(label);
      this.pads.push({ kind: 'weapon', weapon: w, pad, label, x, z, r: 1.4 });
    });
    const st = await propInstance(A.prop('Structure_2'));
    st.position.set(34, 0, -19); st.rotation.y = -Math.PI / 2; st.scale.setScalar(1.4); g.add(st);
    this.blockers.push({ type: 'box', x: 34, z: -19, hx: 4, hz: 4 });
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
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.16, 28), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.4 }));
    pad.position.set(x, 0.2, z);
    pad.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.06, 8, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 1.2 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.09;
    pad.add(ring);
    this.group.add(pad);
    return pad;
  }

  makeDropper(x, i) {
    const grp = new THREE.Group();
    const hue = [0x9e9e9e, 0x64b5f6, 0x81c784, 0xffb74d, 0xba68c8, 0x4dd0e1, 0xf06292, 0xffd54a][i];
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.8), new THREE.MeshStandardMaterial({ color: hue, roughness: 0.45, metalness: 0.5 }));
    body.position.y = BELT_Y + 2.4;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.6, metalness: 0.5 }));
    spout.position.y = BELT_Y + 1.3;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00e676, emissiveIntensity: 2.5 }));
    light.position.set(0.7, BELT_Y + 3.0, 0.95);
    grp.add(body, spout, light);
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, BELT_Y + 1.7, 0.14), new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.5 }));
      leg.position.set(dx, (BELT_Y + 1.7) / 2, dz * 1.6);
      grp.add(leg);
    }
    const label = makeLabel([`DROPPER ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][i]}`, `$${DROPPER_VALUE[i]} ore`], { size: 36, scale: 0.35, accent: '#ffd54a' });
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
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 1.9), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.0, transparent: true, opacity: 0.5 }));
    beam.position.y = BELT_Y + 1.2;
    grp.add(top, beam);
    const label = makeLabel([`REFINER ×${mult}`], { size: 36, scale: 0.32, accent: '#' + new THREE.Color(color).getHexString() });
    label.position.y = BELT_Y + 3.1;
    grp.add(label);
    grp.userData.label = label;
    grp.userData.beam = beam;
    grp.position.set(x, 0, BELT_Z);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return grp;
  }

  async makeTurret(x, z) {
    const slot = { grp: null, head: null, cd: 0, x, z, building: true };
    this.turrets.push(slot); // reserve synchronously; applyPurchases can run again before the models load
    const grp = new THREE.Group();
    const base = await propInstance(A.prop('Crate'));
    base.scale.setScalar(1.3);
    const head = new THREE.Group();
    const cannon = (await loadGLTF(A.weapon('ShortCannon'))).scene.clone(true);
    cannon.scale.setScalar(1.8);
    cannon.rotation.y = Math.PI / 2;
    head.add(cannon);
    head.position.y = 1.35;
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.5 }));
    mount.position.y = 1.15;
    grp.add(base, mount, head);
    grp.position.set(x, 0, z);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(grp);
    this.blockers.push({ type: 'box', x, z, hx: 0.7, hz: 0.7 });
    Object.assign(slot, { grp, head, building: false });
  }

  refreshPads() {
    for (const p of this.pads.filter((p) => p.kind === 'upgrade')) { this.group.remove(p.pad); this.group.remove(p.label); }
    this.pads = this.pads.filter((p) => p.kind !== 'upgrade');
    let slot = 0;
    for (const u of UPGRADES) {
      if (this.purchased.has(u.id)) continue;
      if (u.req && !this.purchased.has(u.req)) continue;
      if (slot >= PAD_SLOTS.length) break;
      const [x, z] = PAD_SLOTS[slot++];
      const cat = CATS[u.cat];
      const pad = this.makePad(x, z, new THREE.Color(cat.color).getHex());
      const label = makeLabel([u.name, u.price ? `$${fmt(u.price)}` : 'FREE', u.desc], { accent: cat.color, size: 36, scale: 0.55 });
      label.position.set(x, 2.4, z);
      this.group.add(label);
      this.pads.push({ kind: 'upgrade', upgrade: u, pad, label, x, z, r: 1.4 });
    }
    for (const p of this.pads.filter((p) => p.kind === 'weapon')) {
      const owned = this.weapons.owned.includes(p.weapon.id);
      const lvl = this.weapons.levels[p.weapon.id] || 0;
      let lines, accent;
      if (!owned) { lines = [p.weapon.name, `$${fmt(p.weapon.price)}`, p.weapon.desc]; accent = '#ff5252'; }
      else if (lvl >= MAX_WEAPON_LEVEL) { lines = [p.weapon.name, 'MAX LEVEL', p.weapon.desc]; accent = '#6cf28a'; }
      else { lines = [`${p.weapon.name} Lv${lvl + 1}`, `$${fmt(this.weapons.upgradeCost(p.weapon.id))}`, '+damage, +ammo, faster reload']; accent = '#ffb74d'; }
      p.label.userData.redraw(lines, { accent });
      p.pad.material.color.set(accent); p.pad.material.emissive.set(accent);
    }
  }

  applyPurchases() {
    this.droppers.forEach((d, i) => { d.active = this.purchased.has(`d${i + 1}`); d.mesh.visible = d.active; });
    this.refiners.forEach((r, i) => {
      r.active = this.purchased.has(`r${i + 1}`); r.mesh.visible = r.active;
      r.label.userData.redraw([`REFINER ×${this.refinerMult(i)}`], { accent: '#' + new THREE.Color(r.color).getHexString() });
    });
    this.player.maxHp = 100 + 50 * this.level('armor');
    this.player.regenRate = 6 * (1 + this.level('regen'));
    this.player.speedMult = this.purchased.has('boots1') ? 1.22 : 1;
    this.weapons.damageMult = Math.pow(1.25, this.level('hp'));
    this.enemies.rewardMult = Math.pow(1.3, this.level('bounty'));
    this.enemies.headshotBonus = 1 + this.level('lucky');
    const sentries = this.level('sentry');
    for (let i = this.turrets.length; i < sentries; i++) this.makeTurret(...TURRET_POSTS[i]);
    this.sentryDamage = 16 * Math.pow(1.4, this.level('sd'));
    this.sentryRange = 32 + 8 * this.level('sr');
    this.walls.setLevel(this.level('wall'), Math.pow(1.6, this.level('wallhp')));
    for (const key of ['sam', 'shaun', 'pug', 'matt', 'shepherd', 'lis']) if (this.purchased.has(`ally_${key}`)) this.allies.hire(key);
    this.allies.dmgMult = Math.pow(1.35, this.level('gt'));
    this.allies.dogMult = Math.pow(1.3, this.level('dog'));
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
    if (this.weapons.owned.includes(w.id)) {
      const lvl = this.weapons.levels[w.id] || 0;
      if (lvl >= MAX_WEAPON_LEVEL) { this.weapons.equip(w.id); return; }
      const cost = this.weapons.upgradeCost(w.id);
      if (this.wallet < cost) { this.hud.log(`Need $${fmt(cost - this.wallet)} more to upgrade ${w.name}`, 'bad'); SFX.deny(); return; }
      this.wallet -= cost;
      this.weapons.upgrade(w.id);
      this.hud.log(`${w.name} upgraded to level ${lvl + 1}!`, 'good');
    } else {
      if (this.wallet < w.price) { this.hud.log(`Need $${fmt(w.price - this.wallet)} more for ${w.name}`, 'bad'); SFX.deny(); return; }
      this.wallet -= w.price;
      this.weapons.own(w.id);
      this.hud.log(`Bought ${w.name}!`, 'good');
    }
    this.refreshPads();
    SFX.buy();
    this.hud.setMoney(this);
    this.onChange?.();
  }

  get repairCost() { return Math.ceil(this.walls.totalDamage * 1.5); }

  tryRepair() {
    const cost = this.repairCost;
    if (cost <= 0) return;
    if (this.wallet < cost) { this.hud.log(`Need $${fmt(cost - this.wallet)} more to repair the walls`, 'bad'); SFX.deny(); return; }
    this.wallet -= cost;
    this.walls.repairAll();
    this.hud.log('Walls repaired!', 'good');
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
    if (this.purchased.has('auto1')) { this.wallet += v; SFX.coin(); }
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
    if (this.ores.length > 120) return;
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
    const beltSpeed = this.beltSpeed;
    this.beltTex.offset.x -= dt * beltSpeed / 2.2;
    for (const d of this.droppers) {
      if (!d.active) continue;
      d.timer -= dt;
      if (d.timer <= 0) { d.timer = this.dropInterval * rand(0.9, 1.1); this.spawnOre(d); }
    }
    for (const r of this.refiners) if (r.active) r.mesh.userData.beam.material.opacity = 0.4 + Math.sin(this.time * 6) * 0.12;
    for (let i = this.ores.length - 1; i >= 0; i--) {
      const o = this.ores[i];
      const m = o.mesh;
      if (m.position.y > BELT_Y + 0.25) { o.vy -= 12 * dt; m.position.y = Math.max(BELT_Y + 0.25, m.position.y + o.vy * dt); }
      else {
        m.position.x += beltSpeed * dt;
        for (const r of this.refiners) {
          if (r.active && !o.refined.has(r) && m.position.x >= r.x) {
            o.refined.add(r);
            o.value *= this.refinerMult(r.index);
            m.material.color.set(r.color); m.material.emissive.set(r.color); m.material.emissiveIntensity = 0.8; m.material.metalness = 0.6; m.material.roughness = 0.3;
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
    // bank interest
    const bank = this.level('bank');
    if (bank > 0) { this.bankTimer += dt; if (this.bankTimer >= 5) { this.bankTimer -= 5; const gain = this.wallet * 0.01 * bank * (5 / 60); if (gain >= 1) this.wallet += gain; } }

    let prompt = null;
    for (const p of this.pads) {
      const d = Math.hypot(this.player.pos.x - p.x, this.player.pos.z - p.z);
      p.pad.rotation.y += dt * 0.5;
      p.label.position.y = 2.4 + Math.sin(this.time * 2 + p.x) * 0.08;
      if (d < p.r) {
        if (p.kind === 'upgrade') prompt = `${p.upgrade.name} — ${p.upgrade.desc} (${p.upgrade.price ? '$' + fmt(p.upgrade.price) : 'free'})`;
        else {
          const owned = this.weapons.owned.includes(p.weapon.id);
          const lvl = this.weapons.levels[p.weapon.id] || 0;
          prompt = !owned ? `${p.weapon.name} — $${fmt(p.weapon.price)}` : lvl >= MAX_WEAPON_LEVEL ? `${p.weapon.name} — max level` : `Upgrade ${p.weapon.name} to Lv${lvl + 1} — $${fmt(this.weapons.upgradeCost(p.weapon.id))}`;
        }
        if (!p.inside && this.padCooldown <= 0) {
          p.inside = true;
          this.padCooldown = 0.3;
          if (p.kind === 'upgrade') { if (this.buy(p.upgrade)) break; }
          else this.buyWeapon(p.weapon);
        }
      } else p.inside = false;
    }
    const dc = Math.hypot(this.player.pos.x - this.collectPad.position.x, this.player.pos.z - this.collectPad.position.z);
    if (dc < 1.6) prompt = this.purchased.has('auto1') ? 'Auto collector active — vault pays you directly' : this.vault > 0 ? `Press E to collect $${fmt(this.vault)}` : 'Vault is empty — buy droppers!';
    // repair pad
    const damaged = this.walls.level > 0 && this.walls.totalDamage > 0;
    this.repairPad.visible = this.repairLabel.visible = damaged;
    if (damaged) {
      if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.repairLabel.userData.redraw(['REPAIR WALLS', `$${fmt(this.repairCost)}`], { accent: '#4fc3f7' });
      const dr = Math.hypot(this.player.pos.x - this.repairPad.position.x, this.player.pos.z - this.repairPad.position.z);
      if (dr < 1.6) {
        prompt = `Repair all walls — $${fmt(this.repairCost)}`;
        if (!this.repairInside && this.padCooldown <= 0) { this.repairInside = true; this.padCooldown = 0.3; this.tryRepair(); }
      } else this.repairInside = false;
    }
    this.hud.prompt(prompt);
    this.updateTurrets(dt);
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) this.hud.setMoney(this);
  }

  updateTurrets(dt) {
    for (const t of this.turrets) {
      if (t.building) continue;
      t.cd -= dt;
      let best = null, bd = this.sentryRange || 32;
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
        const res = this.enemies.hit(best, (this.sentryDamage || 16) * this.weapons.damageMult, target);
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
    // migrate v1 ids
    const map = { auto: 'auto1', speed1: 'sp1', speed2: 'sp2', value1: 'v1', value2: 'v2', turret1: 'sentry1', turret2: 'sentry2', armor: 'armor1', dmg: 'hp1' };
    this.purchased = new Set((s.purchased || []).map((id) => map[id] || id));
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
