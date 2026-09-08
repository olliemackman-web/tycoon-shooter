import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = (n) => Math.floor(n).toLocaleString('en-US');

// Canvas text sprite used for pad labels, vault readouts and enemy health bars.
export function makeLabel(lines, { size = 40, color = '#fff', bg = 'rgba(0,0,0,0.55)', accent = null, width = 512, scale = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const lineH = size * 1.25;
  canvas.width = width;
  canvas.height = Math.ceil(lineH * lines.length + size * 0.8);
  const c = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const draw = (ls, opts = {}) => {
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = opts.bg ?? bg;
    roundRect(c, 4, 4, canvas.width - 8, canvas.height - 8, 18);
    c.fill();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    ls.forEach((t, i) => {
      c.font = `${i === 0 ? '800' : '600'} ${size}px system-ui, sans-serif`;
      c.fillStyle = i === 0 ? (opts.accent ?? accent ?? color) : color;
      c.fillText(t, canvas.width / 2, size * 0.4 + lineH * (i + 0.5));
    });
    tex.needsUpdate = true;
  };
  draw(lines);
  sprite.scale.set((canvas.width / 128) * scale, (canvas.height / 128) * scale, 1);
  sprite.userData.redraw = draw;
  return sprite;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Health bar sprite: a small canvas bar redrawn on damage.
export function makeBar(w = 1.2) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 20;
  const c = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(w, w * 20 / 128, 1);
  sprite.userData.set = (f) => {
    c.clearRect(0, 0, 128, 20);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(0, 0, 128, 20);
    c.fillStyle = f > 0.5 ? '#6cf28a' : f > 0.25 ? '#ffb74d' : '#ff5252';
    c.fillRect(3, 3, 122 * Math.max(0, f), 14);
    tex.needsUpdate = true;
  };
  sprite.userData.set(1);
  return sprite;
}

// GPU points particle system for sparks, blood, smoke and explosions.
export class Particles {
  constructor(scene, max = 3000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.next = 0;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -1000;
  }
  emit(p, { count = 10, speed = 3, color = 0xffaa33, life = 0.5, gravity = 9, spread = 1, dir = null, colorVar = 0.2 } = {}) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      let vx = rand(-1, 1) * spread, vy = rand(-1, 1) * spread, vz = rand(-1, 1) * spread;
      if (dir) { vx += dir.x; vy += dir.y; vz += dir.z; }
      const s = speed * rand(0.3, 1);
      this.vel[i * 3] = vx * s; this.vel[i * 3 + 1] = vy * s; this.vel[i * 3 + 2] = vz * s;
      const v = 1 + rand(-colorVar, colorVar);
      this.col[i * 3] = clamp(c.r * v, 0, 1); this.col[i * 3 + 1] = clamp(c.g * v, 0, 1); this.col[i * 3 + 2] = clamp(c.b * v, 0, 1);
      this.life[i] = this.maxLife[i] = life * rand(0.6, 1.2);
      this.grav[i] = gravity;
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1000; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; this.vel[i * 3] *= 0.7; this.vel[i * 3 + 2] *= 0.7; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// Floating DOM text (damage numbers, +$ coins) projected from world space.
export class Floaters {
  constructor(camera) {
    this.camera = camera;
    this.root = document.getElementById('floaters');
    this.items = [];
  }
  add(worldPos, text, cls = '') {
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = text;
    this.root.appendChild(el);
    this.items.push({ el, pos: worldPos.clone(), t: 0 });
  }
  update(dt) {
    const v = new THREE.Vector3();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t > 1) { it.el.remove(); this.items.splice(i, 1); continue; }
      v.copy(it.pos).project(this.camera);
      if (v.z > 1) { it.el.style.display = 'none'; continue; }
      it.el.style.display = '';
      it.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      it.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    }
  }
}

// Collision: circles (player/enemies) against static circle + box blockers.
export function resolveCircle(pos, r, blockers) {
  for (const b of blockers) {
    if (b.type === 'circle') {
      const dx = pos.x - b.x, dz = pos.z - b.z;
      const d = Math.hypot(dx, dz);
      const min = r + b.r;
      if (d < min && d > 1e-4) { pos.x += (dx / d) * (min - d); pos.z += (dz / d) * (min - d); }
    } else {
      // axis-aligned box: hx/hz half extents
      const cx = clamp(pos.x, b.x - b.hx, b.x + b.hx);
      const cz = clamp(pos.z, b.z - b.hz, b.z + b.hz);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-4) { pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d); }
        else {
          // inside the box: push out along the smallest axis
          const px = b.hx - Math.abs(pos.x - b.x), pz = b.hz - Math.abs(pos.z - b.z);
          if (px < pz) pos.x += Math.sign(pos.x - b.x || 1) * (px + r); else pos.z += Math.sign(pos.z - b.z || 1) * (pz + r);
        }
      }
    }
  }
}
