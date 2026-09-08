// Tiny synthesised sound effects so no audio files are needed.
let ctx = null;
let master = null;
function ensure() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}
export function unlockAudio() {
  ensure();
  if (ctx.state === 'suspended') ctx.resume();
}
function noise(duration, { freq = 1200, q = 0.7, gain = 1, decay = duration, type = 'lowpass' } = {}) {
  ensure();
  const n = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);
  src.connect(filt).connect(g).connect(master);
  src.start();
  src.stop(ctx.currentTime + duration);
}
function tone(freq, duration, { type = 'sine', gain = 0.3, slide = 0 } = {}) {
  ensure();
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ctx.currentTime + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  o.connect(g).connect(master);
  o.start();
  o.stop(ctx.currentTime + duration);
}
export const SFX = {
  shot(kind = 'pistol') {
    if (!ctx) return;
    const map = {
      pistol: [0.18, 900, 0.9], smg: [0.12, 1400, 0.6], ak: [0.2, 1000, 1], shotgun: [0.35, 500, 1.3],
      revolver: [0.3, 700, 1.2], sniper: [0.45, 600, 1.4], launcher: [0.3, 300, 0.9], melee: [0.08, 2500, 0.4],
    };
    const [d, f, g] = map[kind] || map.pistol;
    noise(d, { freq: f, gain: g, decay: d });
    if (kind !== 'melee') tone(120, 0.08, { type: 'square', gain: 0.15, slide: -80 });
  },
  explosion() { if (!ctx) return; noise(0.9, { freq: 220, gain: 1.6, decay: 0.9 }); tone(60, 0.5, { type: 'sine', gain: 0.5, slide: -40 }); },
  hit() { if (!ctx) return; tone(880, 0.05, { type: 'square', gain: 0.12 }); },
  kill() { if (!ctx) return; tone(660, 0.08, { type: 'square', gain: 0.15 }); setTimeout(() => tone(990, 0.1, { type: 'square', gain: 0.15 }), 60); },
  coin() { if (!ctx) return; tone(1320, 0.07, { gain: 0.2 }); setTimeout(() => tone(1760, 0.12, { gain: 0.2 }), 50); },
  buy() { if (!ctx) return; [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.12, { gain: 0.18 }), i * 60)); },
  deny() { if (!ctx) return; tone(200, 0.15, { type: 'sawtooth', gain: 0.15, slide: -100 }); },
  reload() { if (!ctx) return; noise(0.05, { freq: 3000, gain: 0.4 }); setTimeout(() => noise(0.06, { freq: 2200, gain: 0.5 }), 250); },
  hurt() { if (!ctx) return; noise(0.2, { freq: 400, gain: 0.8 }); tone(150, 0.2, { type: 'sawtooth', gain: 0.2, slide: -60 }); },
  drop() { if (!ctx) return; tone(300, 0.06, { type: 'triangle', gain: 0.08, slide: -100 }); },
  wave() { if (!ctx) return; [220, 220, 330].forEach((f, i) => setTimeout(() => tone(f, 0.25, { type: 'sawtooth', gain: 0.18 }), i * 220)); },
};
