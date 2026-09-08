// The upgrade ladder. Effects are derived from how many of each chain have been bought (see Tycoon.level()).
export const CATS = {
  plant: { color: '#ffd54a', name: 'PLANT' },
  combat: { color: '#ff8a65', name: 'COMBAT' },
  base: { color: '#4fc3f7', name: 'BASE' },
  allies: { color: '#ce93d8', name: 'ALLIES' },
};

const list = [];
function chain(prefix, cat, names, prices, desc, firstReq = null) {
  names.forEach((name, i) => {
    list.push({ id: `${prefix}${i + 1}`, name, price: prices[i], req: i === 0 ? firstReq : `${prefix}${i}`, desc: typeof desc === 'function' ? desc(i) : desc, cat, prefix });
  });
}
const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const tiers = (label, n, start = 1) => Array.from({ length: n }, (_, i) => `${label} ${roman[i + start - 1]}`);

// --- plant ---
export const DROPPER_VALUE = [5, 9, 14, 20, 30, 45, 70, 100];
chain('d', 'plant', tiers('Dropper', 8), [0, 200, 900, 3600, 9500, 25000, 60000, 150000], (i) => `Drops $${DROPPER_VALUE[i]} ore`);
chain('r', 'plant', ['Refiner I', 'Refiner II', 'Refiner III'], [500, 2800, 20000], (i) => `Ore value ×${[2, 2, 3][i]} on the belt`, 'd2');
list.find((u) => u.id === 'r2').req = 'd4';
list.find((u) => u.id === 'r3').req = 'd6';
chain('rb', 'plant', tiers('Refiner Boost', 5), [8000, 30000, 90000, 250000, 700000], '+1 to every refiner multiplier', 'r2');
chain('sp', 'plant', tiers('Dropper Speed', 6), [1400, 6000, 18000, 50000, 140000, 400000], 'Droppers drop 25% faster', 'd3');
chain('v', 'plant', ['Rich Ore', 'Purified Ore', 'Silver Ore', 'Gold Ore', 'Platinum Ore', 'Uranium Ore', 'Plutonium Ore', 'Antimatter Ore'], [6000, 15000, 40000, 100000, 260000, 650000, 1600000, 4000000], 'All ore worth ×1.6', 'd4');
chain('auto', 'plant', ['Auto Collector'], [1800], 'Vault pays straight to your wallet', 'd2');
chain('bs', 'plant', tiers('Belt Speed', 3), [4000, 20000, 80000], 'Conveyor runs 30% faster', 'auto1');
chain('bank', 'plant', tiers('Bank Interest', 4), [12000, 50000, 200000, 800000], 'Wallet earns +1% per minute', 'auto1');

// --- combat ---
chain('armor', 'combat', tiers('Body Armor', 5), [4500, 12000, 30000, 80000, 200000], '+50 max health', 'd2');
chain('regen', 'combat', tiers('Field Medic', 3), [7000, 25000, 90000], 'Health regenerates faster', 'armor1');
chain('hp', 'combat', tiers('Hollow Points', 6), [11000, 30000, 80000, 200000, 500000, 1200000], '+25% damage on every weapon', 'armor1');
chain('bounty', 'combat', tiers('Bounty Hunter', 6), [3000, 9000, 27000, 80000, 240000, 700000], 'Kills pay +30% more', 'd2');
chain('boots', 'combat', ['Combat Boots'], [5000], 'Run and sprint faster', 'd3');
chain('lucky', 'combat', tiers('Lucky Shot', 3), [40000, 150000, 500000], 'Headshots pay double coins', 'bounty2');

// --- base ---
chain('wall', 'base', ['Sandbag Walls', 'Steel Fences', 'Blast Barriers', 'Container Walls'], [2500, 9000, 30000, 100000], (i) => ['Ring the base with sandbags', 'Tall steel fencing', 'Concrete blast barriers', 'Stacked shipping containers'][i], 'd2');
chain('wallhp', 'base', tiers('Reinforced Walls', 5), [15000, 45000, 130000, 400000, 1200000], 'Walls take 60% more punishment', 'wall2');
chain('sentry', 'base', tiers('Sentry Turret', 4), [7500, 26000, 80000, 250000], 'A turret that shoots raiders on its own', 'd3');
chain('sd', 'base', tiers('Sentry Ammo', 5), [12000, 35000, 100000, 300000, 900000], 'Sentries hit 40% harder', 'sentry1');
chain('sr', 'base', tiers('Sentry Optics', 3), [20000, 70000, 250000], 'Sentries see and fire further', 'sentry2');

// --- allies ---
list.push(
  { id: 'ally_sam', name: 'Hire Sam', price: 6000, req: 'd3', desc: 'Pistol guard on the east post', cat: 'allies', prefix: 'ally' },
  { id: 'ally_shaun', name: 'Hire Shaun', price: 14000, req: 'ally_sam', desc: 'SMG guard on the west post', cat: 'allies', prefix: 'ally' },
  { id: 'ally_pug', name: 'Adopt the Pug', price: 9000, req: 'ally_sam', desc: 'Small, fast and very angry', cat: 'allies', prefix: 'ally' },
  { id: 'ally_matt', name: 'Hire Matt', price: 25000, req: 'ally_shaun', desc: 'Melee brawler who charges raiders', cat: 'allies', prefix: 'ally' },
  { id: 'ally_shepherd', name: 'German Shepherd', price: 30000, req: 'ally_pug', desc: 'A proper attack dog', cat: 'allies', prefix: 'ally' },
  { id: 'ally_lis', name: 'Hire Lis', price: 45000, req: 'ally_matt', desc: 'Rifle guard on the north post', cat: 'allies', prefix: 'ally' },
);
chain('gt', 'allies', tiers('Guard Training', 6), [20000, 60000, 180000, 500000, 1500000, 4000000], 'Allies deal 35% more damage', 'ally_shaun');
chain('dog', 'allies', tiers('Dog Treats', 4), [15000, 50000, 160000, 500000], 'Dogs bite harder and run faster', 'ally_pug');

export const UPGRADES = list;
export const UPGRADE_BY_ID = Object.fromEntries(list.map((u) => [u.id, u]));
