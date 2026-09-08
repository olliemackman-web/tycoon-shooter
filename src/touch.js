// Touch controls for phones: left joystick to move, drag on the right to look, buttons for the rest.
export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');

export function setupTouch({ player, weapons, tycoon }) {
  if (!isTouch) return;
  document.body.classList.add('touch');
  const hud = document.getElementById('hud');
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div id="stick"><div id="knob"></div></div>
    <div id="lookzone"></div>
    <div class="tbtn" id="tb-fire">FIRE</div>
    <div class="tbtn small" id="tb-aim">AIM</div>
    <div class="tbtn small" id="tb-jump">JUMP</div>
    <div class="tbtn small" id="tb-reload">RELOAD</div>
    <div class="tbtn small" id="tb-swap">SWAP</div>
    <div class="tbtn small" id="tb-use">USE</div>`;
  hud.appendChild(root);
  const $ = (id) => document.getElementById(id);
  const stick = $('stick'), knob = $('knob'), look = $('lookzone');

  // --- joystick ---
  let stickId = null, origin = null;
  const R = 46;
  stick.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    stickId = e.pointerId;
    const r = stick.getBoundingClientRect();
    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    try { stick.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    moveStick(e);
  });
  const moveStick = (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    player.touchMove.x = dx / R;
    player.touchMove.y = dy / R;
  };
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = '';
    player.touchMove.x = 0; player.touchMove.y = 0;
  };
  stick.addEventListener('pointermove', moveStick);
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  // --- look ---
  let lookId = null, last = null;
  look.addEventListener('pointerdown', (e) => {
    if (lookId !== null) return;
    lookId = e.pointerId; last = { x: e.clientX, y: e.clientY };
    try { look.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
  });
  look.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    const s = 0.0045 * (player.aim ? 0.5 : 1);
    player.yaw -= (e.clientX - last.x) * s;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - (e.clientY - last.y) * s));
    last = { x: e.clientX, y: e.clientY };
  });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
  look.addEventListener('pointerup', endLook);
  look.addEventListener('pointercancel', endLook);

  // --- buttons ---
  const hold = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); on(); });
    const up = () => { el.classList.remove('down'); off?.(); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  };
  hold($('tb-fire'), () => { player.fire = true; }, () => { player.fire = false; });
  $('tb-aim').addEventListener('pointerdown', (e) => { e.preventDefault(); player.aim = !player.aim; $('tb-aim').classList.toggle('down', player.aim); });
  hold($('tb-jump'), () => { player.keys.Space = true; }, () => { player.keys.Space = false; });
  $('tb-reload').addEventListener('pointerdown', (e) => { e.preventDefault(); weapons.reload(); });
  $('tb-swap').addEventListener('pointerdown', (e) => { e.preventDefault(); weapons.cycle(1); });
  $('tb-use').addEventListener('pointerdown', (e) => { e.preventDefault(); tycoon.tryCollect(); });
  for (const el of root.querySelectorAll('.tbtn, #stick, #lookzone')) el.addEventListener('contextmenu', (e) => e.preventDefault());
}

export async function enterFullscreenLandscape() {
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* not allowed on iOS Safari */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* unsupported */ }
}
