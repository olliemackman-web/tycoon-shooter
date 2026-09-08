import { fmt } from './util.js';
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      wallet: $('wallet'), vault: $('vault'), autoc: $('autoc'), income: $('income'), wave: $('wave'), alive: $('alive'), countdown: $('countdown'), nextwave: $('nextwave'),
      hp: $('hp'), fill: $('healthfill'), wname: $('wname'), mag: $('mag'), reloading: $('reloading'), slots: $('slots'), hit: $('hitmarker'), prompt: $('prompt'), log: $('log'), scope: $('zoomvignette'), crosshair: $('crosshair'),
    };
    this.hitTimer = null;
  }
  setMoney(t) {
    this.el.wallet.textContent = fmt(t.wallet);
    this.el.vault.textContent = fmt(t.vault);
    this.el.autoc.textContent = t.purchased.has('auto') ? '(auto)' : '';
    this.el.income.textContent = fmt(t.incomePerMin);
  }
  setWave(wave, alive, countdown) {
    this.el.wave.textContent = wave;
    this.el.alive.textContent = alive;
    if (countdown == null) { this.el.nextwave.innerHTML = '<span class="warn">WAVE IN PROGRESS</span>'; }
    else this.el.nextwave.innerHTML = `Next wave in <span id="countdown">${Math.ceil(countdown)}</span>s`;
  }
  setHealth(hp, max) { this.el.hp.textContent = `${Math.ceil(hp)} / ${max}`; this.el.fill.style.width = `${(100 * hp) / max}%`; }
  setWeapon(w, st) {
    this.el.wname.textContent = w.name;
    if (w.kind === 'melee') { this.el.mag.textContent = '—'; this.el.mag.className = ''; }
    else { this.el.mag.textContent = st.mag; this.el.mag.className = st.mag <= Math.max(1, w.mag * 0.25) ? 'low' : ''; }
  }
  setReloading(b) { this.el.reloading.style.display = b ? 'block' : 'none'; }
  refreshSlots(weapons) {
    this.el.slots.innerHTML = '';
    weapons.owned.forEach((id, i) => {
      const d = document.createElement('div');
      d.className = 'slot' + (id === weapons.currentId ? ' active' : '');
      d.textContent = `${i + 1}  ${weaponName(id)}`;
      this.el.slots.appendChild(d);
    });
  }
  hitmarker(kill) {
    const h = this.el.hit;
    h.className = 'show' + (kill ? ' kill' : '');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => { h.className = 'fade' + (kill ? ' kill' : ''); }, 60);
  }
  prompt(text) { this.el.prompt.style.display = text ? 'block' : 'none'; if (text && this.el.prompt.textContent !== text) this.el.prompt.textContent = text; }
  log(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'logline ' + cls;
    d.textContent = text;
    this.el.log.appendChild(d);
    setTimeout(() => d.remove(), 3600);
    while (this.el.log.children.length > 5) this.el.log.firstChild.remove();
  }
  setScope(b) { this.el.scope.style.display = b ? 'block' : 'none'; this.el.crosshair.style.display = b ? 'none' : 'block'; }
}
import { WEAPON_BY_ID } from './weapons.js';
function weaponName(id) { return WEAPON_BY_ID[id]?.name || id; }
