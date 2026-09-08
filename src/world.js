// Scene, lighting, terrain and the decorative props from the war pack.
import * as THREE from 'three';
import { A, propInstance, loadGLTF } from './assets.js';
import { rand } from './util.js';

export const MAP_HALF = 110;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.blockers = [];        // collision volumes for player + enemies
    this.raycastTargets = [];  // meshes bullets can hit
    this.time = 0;
  }

  async build(onProgress) {
    const scene = this.scene;
    scene.background = new THREE.Color(0x8fb6d8);
    scene.fog = new THREE.Fog(0x8fb6d8, this.mobile ? 40 : 60, this.mobile ? 160 : 220);

    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a4a32, 1.1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 200;
    const s = 70;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s; sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    this.sun = sun;

    // Ground: big dirt plane with a faint grid texture so movement reads.
    const gtex = makeGroundTexture();
    gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
    gtex.repeat.set(60, 60);
    gtex.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF * 2 + 40, MAP_HALF * 2 + 40), new THREE.MeshStandardMaterial({ map: gtex, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    scene.add(ground);
    this.ground = ground;
    this.raycastTargets.push(ground);

    // Perimeter fence so the map edge reads as a wall.
    const fenceGeo = new THREE.BoxGeometry(MAP_HALF * 2, 4, 0.4);
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.9 });
    for (const [x, z, rot] of [[0, -MAP_HALF, 0], [0, MAP_HALF, 0], [-MAP_HALF, 0, Math.PI / 2], [MAP_HALF, 0, Math.PI / 2]]) {
      const f = new THREE.Mesh(fenceGeo, fenceMat);
      f.position.set(x, 2, z);
      f.rotation.y = rot;
      f.castShadow = true;
      scene.add(f);
      this.raycastTargets.push(f);
    }

    await this.placeProps(onProgress);
    await this.placeFactoryBackdrop();
  }

  addProp(obj, x, z, { ry = 0, scale = 1, collide = null } = {}) {
    obj.position.set(x, 0, z);
    obj.rotation.y = ry;
    obj.scale.setScalar(scale);
    this.scene.add(obj);
    obj.traverse((o) => { if (o.isMesh) this.raycastTargets.push(o); });
    if (collide) {
      if (collide.r) this.blockers.push({ type: 'circle', x, z, r: collide.r * scale });
      else {
        // rotate half extents for 90 degree turns
        const swap = Math.abs(Math.sin(ry)) > 0.7;
        this.blockers.push({ type: 'box', x, z, hx: (swap ? collide.hz : collide.hx) * scale, hz: (swap ? collide.hx : collide.hz) * scale });
      }
    }
    return obj;
  }

  async placeProps(onProgress) {
    const P = (n) => propInstance(A.prop(n));
    const jobs = [];
    const q = (n, x, z, opts) => jobs.push(P(n).then((o) => this.addProp(o, x, z, opts)));

    // Keep the tycoon plot (x -22..22, z -34..-6) and spawn (0,0) clear; decorate the rest.
    // Trees around the edges of the play field.
    for (let i = 0; i < 46; i++) {
      const ang = (i / 46) * Math.PI * 2 + rand(-0.08, 0.08);
      const r = rand(72, 100);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      q(`Tree_${1 + (i % 4)}`, x, z, { ry: rand(0, Math.PI * 2), scale: rand(1.6, 2.4), collide: { r: 0.9 } });
    }
    for (let i = 0; i < 14; i++) {
      const ang = rand(0, Math.PI * 2), r = rand(38, 66);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (z < -2 && Math.abs(x) < 30) continue;
      q(`Tree_${1 + (i % 4)}`, x, z, { ry: rand(0, Math.PI * 2), scale: rand(1.5, 2.2), collide: { r: 0.8 } });
    }
    // Ruined structures as cover in the fighting field (in front of the plot, z > 0).
    q('Structure_1', 30, 26, { ry: 0.3, scale: 1.4, collide: { hx: 4, hz: 4 } });
    q('Structure_2', -32, 30, { ry: -0.6, scale: 1.4, collide: { hx: 4, hz: 4 } });
    q('Structure_3', 6, 52, { ry: 2.4, scale: 1.4, collide: { hx: 4, hz: 4 } });
    q('Structure_4', -48, -20, { ry: 1.2, scale: 1.4, collide: { hx: 4, hz: 4 } });
    q('Tank', 44, -30, { ry: 2.6, scale: 1.3, collide: { hx: 3.5, hz: 4.5 } });
    q('Debris_BrokenCar', -14, 24, { ry: 1.1, scale: 1.3, collide: { hx: 2.2, hz: 1.2 } });
    q('Container_Long', 26, 8, { ry: 0.2, scale: 1.3, collide: { hx: 4.5, hz: 1.6 } });
    q('Container_Small', -28, 10, { ry: 1.4, scale: 1.3, collide: { hx: 1.6, hz: 1.6 } });
    q('Container_Small', 52, 22, { ry: 0.4, scale: 1.3, collide: { hx: 1.6, hz: 1.6 } });
    q('WaterTank_Platform', -60, 40, { ry: 0.5, scale: 1.4, collide: { r: 3 } });
    q('WaterTank_Floor', 62, -6, { ry: 0.5, scale: 1.4, collide: { r: 2 } });
    // Sandbag lines and barriers in front of the plot: cover for the player.
    q('SackTrench', -8, 2, { ry: 0, scale: 1.3, collide: { hx: 2.2, hz: 0.6 } });
    q('SackTrench', 8, 2, { ry: 0, scale: 1.3, collide: { hx: 2.2, hz: 0.6 } });
    q('SackTrench_Small', -18, 6, { ry: 0.5, scale: 1.3, collide: { hx: 1.6, hz: 0.6 } });
    q('SackTrench_Small', 18, 6, { ry: -0.5, scale: 1.3, collide: { hx: 1.6, hz: 0.6 } });
    q('Barrier_Large', 0, 14, { ry: 0, scale: 1.3, collide: { hx: 3, hz: 0.8 } });
    q('Barrier_Single', -24, 18, { ry: 0.7, scale: 1.3, collide: { hx: 1, hz: 0.6 } });
    q('Barrier_Single', 24, 18, { ry: -0.7, scale: 1.3, collide: { hx: 1, hz: 0.6 } });
    q('MetalFence', -40, 0, { ry: Math.PI / 2, scale: 1.3, collide: { hx: 0.3, hz: 3 } });
    q('MetalFence', 40, 0, { ry: Math.PI / 2, scale: 1.3, collide: { hx: 0.3, hz: 3 } });
    for (let i = 0; i < 6; i++) q('Fence_Long', -30 + i * 6, -40, { scale: 1.3 });
    for (let i = 0; i < 6; i++) q('Fence_Long', -30 + i * 6, 44, { scale: 1.3 });
    // Clutter.
    q('Crate', -20, -4, { ry: 0.3, scale: 1.3, collide: { hx: 0.6, hz: 0.6 } });
    q('Crate', 22, -3, { ry: 0.9, scale: 1.3, collide: { hx: 0.6, hz: 0.6 } });
    q('CardboardBoxes_3', 14, 9, { ry: 0.5, scale: 1.3 });
    q('CardboardBoxes_4', -12, 10, { ry: 1.5, scale: 1.3 });
    q('Pallet', 30, -2, { ry: 0.1, scale: 1.3 });
    q('Pallet_Broken', -34, -6, { ry: 0.8, scale: 1.3 });
    q('TrashContainer', 34, 14, { ry: 1.6, scale: 1.3, collide: { hx: 1.4, hz: 0.8 } });
    q('TrashContainer_Open', -36, 20, { ry: -0.3, scale: 1.3, collide: { hx: 1.4, hz: 0.8 } });
    q('Debris_Tires', 20, 30, { ry: 0.2, scale: 1.3 });
    q('Debris_Pile', -22, 36, { ry: 1.2, scale: 1.3 });
    q('ExplodingBarrel', 16, 20, { scale: 1.3, collide: { r: 0.5 } });
    q('ExplodingBarrel', -30, 16, { scale: 1.3, collide: { r: 0.5 } });
    q('GasTank', 38, 30, { scale: 1.3, collide: { r: 0.8 } });
    for (let i = 0; i < 8; i++) q('TrafficCone', rand(-40, 40), rand(20, 60), { scale: 1.3 });
    for (let i = 0; i < 4; i++) q(`Debris_Papers_${1 + (i % 3)}`, rand(-30, 30), rand(4, 40), { scale: 1.3 });
    for (let i = 0; i < 6; i++) q('StreetLight', -50 + i * 20, 70, { ry: Math.PI, scale: 1.3, collide: { r: 0.3 } });
    for (let i = 0; i < 4; i++) q('StreetLight', -60 + i * 40, -60, { scale: 1.3, collide: { r: 0.3 } });
    q('Sign', 4, 6, { ry: -0.3, scale: 1.3 });
    q('Sofa', -44, 30, { ry: 2.2, scale: 1.3 });
    q('WoodPlanks', 36, 40, { ry: 0.4, scale: 1.3 });
    q('BrickWall_1', -26, 50, { ry: 0.3, scale: 1.3, collide: { hx: 2, hz: 0.3 } });
    q('BrickWall_2', 30, 56, { ry: -0.9, scale: 1.3, collide: { hx: 2, hz: 0.3 } });
    q('Pipes', 50, 46, { scale: 1.3 });

    let done = 0;
    await Promise.all(jobs.map((j) => j.then(() => onProgress?.(++done, jobs.length))));
  }

  // The Sketchfab tycoon pack is a factory showcase in centimetres; shrink it and park it behind the plot.
  async placeFactoryBackdrop() {
    const gltf = await loadGLTF(A.tycoon);
    const obj = gltf.scene.clone(true);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    obj.scale.setScalar(0.022);
    obj.position.set(6, 0, -72);
    obj.rotation.y = Math.PI * 0.5;
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    // Rough collision so nobody walks into the silos.
    this.blockers.push({ type: 'box', x: 6, z: -72, hx: 24, hz: 16 });
    obj.traverse((o) => { if (o.isMesh) this.raycastTargets.push(o); });
    this.factory = obj;
  }

  update(dt) { this.time += dt; }
}

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#6b5f47';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${40 + Math.random() * 60}, ${35 + Math.random() * 50}, ${20 + Math.random() * 30}, ${0.15 + Math.random() * 0.3})`;
    const s = 1 + Math.random() * 4;
    g.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(90, 110, 50, ${0.15 + Math.random() * 0.25})`;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 10, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}
