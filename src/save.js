const KEY = 'hazmat-siege-tycoon-v1';
export function loadSave() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
export function clearSave() { localStorage.removeItem(KEY); }
