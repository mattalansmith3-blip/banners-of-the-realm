/* Banners of the Realm - game engine v2 (pure logic, no DOM). Browser global BOTR / node module. */
(function (root) {
'use strict';

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const STANCES = ['charge', 'hold', 'flank'];
const STANCE_INFO = {
  charge: { name: 'Charge', icon: '⚔️', beats: 'flank' },
  hold:   { name: 'Hold',   icon: '🛡️', beats: 'charge' },
  flank:  { name: 'Flank',  icon: '🏹', beats: 'hold' }
};
const BEATS = { charge: 'flank', hold: 'charge', flank: 'hold' };
const MAX_ORDERS = 5;
const TURN_LIMIT = 100;         // seasons before a "crown" decision
const STANCE_BONUS = 1.4;
const COUNTER_BONUS = 0.5;
const DECISIVE = 1.3;
const BANNER_MULT = 1.5;
const PRESSED_MULT = 0.85;
const PEASANT_FOOD = 0.06;
const HARVEST_K = 0.7;
const TAX_BASE = 0.15;
const FEINT_COST = 6, SPY_COST = 12;

const UNITS = {
  levy:    { name: 'Levy',        plural: 'Levies',      str: 1,   cost: 8,  wage: 1, food: 1, pop: 3, icon: '🔱', infantry: true,  counters: [] },
  archers: { name: 'Archers',     plural: 'Archers',     str: 2,   cost: 20, wage: 1, food: 1, pop: 1, icon: '🏹', infantry: true,  counters: ['levy'] },
  maa:     { name: 'Men-at-arms', plural: 'Men-at-arms', str: 3,   cost: 35, wage: 2, food: 2, pop: 1, icon: '🗡️', infantry: true,  counters: ['archers'] },
  knights: { name: 'Knights',     plural: 'Knights',     str: 5,   cost: 70, wage: 3, food: 3, pop: 1, icon: '🐴', infantry: false, counters: ['maa', 'levy'], capitalOnly: true },
  scout:   { name: 'Scout',       plural: 'Scouts',      str: 0.5, cost: 14, wage: 1, food: 1, pop: 1, icon: '🔭', infantry: false, counters: [], nomerge: true },
  engine:  { name: 'Siege engine',plural: 'Siege engines', str: 1, cost: 45, wage: 1, food: 2, pop: 2, icon: '🪵', infantry: false, counters: [], nomerge: true, needCastle: true },
  hero:    { name: 'Hero',        plural: 'Heroes',      str: 2,   cost: 0,  wage: 2, food: 1, pop: 0, icon: '👑', infantry: false, counters: [], nomerge: true, norecruit: true }
};
const UNIT_TYPES = ['levy', 'archers', 'maa', 'knights', 'scout', 'engine'];
const MERGE_TYPES = ['levy', 'archers', 'maa', 'knights'];

const TAX = {
  low:    { name: 'Low',    mult: 0.5, happy: 5 },
  normal: { name: 'Normal', mult: 1.0, happy: 0 },
  high:   { name: 'High',   mult: 1.7, happy: -6 }
};
const TERRAIN = {
  plains:    { name: 'Plains',    def: 0.0, color: '#cdbf86' },
  forest:    { name: 'Forest',    def: 0.1, color: '#8fa56b' },
  hills:     { name: 'Hills',     def: 0.2, color: '#b8a477' },
  marsh:     { name: 'Marsh',     def: 0.1, color: '#8fa08a' },
  mountains: { name: 'Mountains', def: 0.3, color: '#a39a8c' }
};
const CASTLE = [
  { name: 'No castle', cost: 0,   time: 0, def: 0,    pen: 1,    cap: 0 },
  { name: 'Palisade',  cost: 40,  time: 1, def: 0.15, pen: 0.85, cap: 20 },
  { name: 'Keep',      cost: 90,  time: 2, def: 0.30, pen: 0.60, cap: 40 },
  { name: 'Fortress',  cost: 180, time: 3, def: 0.50, pen: 0.45, cap: 70 }
];
const TRAITS = {
  feared:      { name: 'Feared',       icon: '😈', desc: 'Enemies facing this hero fight at −7% power.' },
  tactician:   { name: 'Tactician',    icon: '🧠', desc: 'Winning stance bonus is +55% instead of +40%.' },
  stalwart:    { name: 'Stalwart',     icon: '🛡️', desc: '+10% power when defending.' },
  swift:       { name: 'Swift',        icon: '💨', desc: 'The stack ignores snow and harsh winter on marches.' },
  siegemaster: { name: 'Siege Master', icon: '🏗️', desc: 'Storming castles: attacker penalty reduced a lot.' },
  beloved:     { name: 'Beloved',      icon: '❤️', desc: '+2 mood a season in the county where the hero stays.' },
  silver:      { name: 'Silver Tongue',icon: '💬', desc: 'Ransoms worth +50%.' },
  diplomat:    { name: 'Diplomat',     icon: '🕊️', desc: '+1 influence a season and pact offers from this house are easier to win.' },
  spymaster:   { name: 'Spymaster',    icon: '🕵️', desc: 'Your spies cost 4 gold less.' },
  quartermaster:{ name: 'Quartermaster',icon: '📦', desc: '+8 grain a season from foraging while the hero is free.' }
};
const TRAIT_KEYS = Object.keys(TRAITS);
const HERO_NAMES = ['Sir Edric the Bold', 'Lady Maren Ashford', 'Sir Godwin Redhand', 'Dame Isolde Fenn', 'Sir Cedric Oakheart', 'Lord Balthus Crane', 'Sir Alaric Stone', 'Lady Rowena Vale',
  'Sir Tristan Marsh', 'Dame Elspeth Rook', 'Sir Hugh Blackthorn', 'Lady Brisa Wren', 'Sir Osric Dunmere', 'Sir Leofric Hale', 'Dame Matilda Gray', 'Sir Wystan Holt',
  'Lord Percival Dane', 'Lady Aveline Rose', 'Sir Baldric Thorn', 'Dame Hild Ironwood', 'Sir Roland Fairwind', 'Lord Garrick Pyke', 'Lady Sibyl Moor', 'Sir Aldous Penn'];

const PERSONALITIES = {
  warlord: { name: 'Warlord', icon: '⚔️', blurb: 'Aggressive: hits early, hits hard, loves knights.',
    dip: { loyal: 0.55, stab: 0.045, nap: 0.12, alli: 0.05, trade: 0.1, demand: 0.35, soft: 0.1 }, ratioFoe: 1.3, ratioNeutral: 1.2, boldRate: 1.4, rivalValue: 1.5, neutralValue: 0.9, reserve: 1.0, build: 0.15, scout: 0.4, feint: 0.1, stormRatio: 1.1, restraint: 4, buildCap: false },
  builder: { name: 'Builder', icon: '🏰', blurb: 'Turtle & economy: fortifies, farms, strikes only when overwhelming.',
    dip: { loyal: 0.97, stab: 0.0, nap: 0.35, alli: 0.25, trade: 0.3, demand: 0.0, soft: 0.45 }, ratioFoe: 1.7, ratioNeutral: 1.3, boldRate: 0.5, rivalValue: 0.6, neutralValue: 1.3, reserve: 1.3, build: 1.0, scout: 0.3, feint: 0, stormRatio: 1.6, restraint: 14, buildCap: true },
  schemer: { name: 'Schemer', icon: '🎭', blurb: 'Feints, bides its time, then backstabs the weak.',
    dip: { loyal: 0.2, stab: 0.1, nap: 0.3, alli: 0.2, trade: 0.15, demand: 0.1, soft: 0.2 }, ratioFoe: 1.25, ratioNeutral: 1.25, boldRate: 1.0, rivalValue: 1.1, neutralValue: 1.0, reserve: 1.0, build: 0.3, scout: 1.0, feint: 1.0, stormRatio: 1.3, restraint: 8, buildCap: false }
};
const DIFFICULTY = {
  easy:   { name: 'Easy',   maxOrders: 3, ratioAdd: 0.35, jitter: 0.5, mistake: 0.25, storm: false, smart: 0.3 },
  normal: { name: 'Normal', maxOrders: 5, ratioAdd: 0.0,  jitter: 0.3, mistake: 0.05, storm: true,  smart: 0.7 },
  hard:   { name: 'Hard',   maxOrders: 5, ratioAdd: -0.1, jitter: 0.15, mistake: 0,   storm: true,  smart: 1.0 }
};

const PLAYER_DEF = [
  { id: 0, name: 'House Aldric',    short: 'Aldric',    color: '#2f5f9e', light: '#7fa6d8' },
  { id: 1, name: 'House Valmoor',   short: 'Valmoor',   color: '#a6302b', light: '#e08a82' },
  { id: 2, name: 'House Thorne',    short: 'Thorne',    color: '#3c7a3a', light: '#8fc98a' },
  { id: 3, name: 'House Ravenscar', short: 'Ravenscar', color: '#7a3c8a', light: '#c08ad0' },
  { id: 4, name: 'House Stormvale', short: 'Stormvale', color: '#c9762a', light: '#efb67a' },
  { id: 5, name: 'House Blackwood', short: 'Blackwood', color: '#2a7f84', light: '#7fcfd3' }
];

/* ------------------------------------------------------------------ diplomacy constants */
const PACT = {
  nap:      { name: 'Non-aggression pact', icon: '🤝', dur: 8,    blurb: 'Neither house may enter the other\'s land or attack its troops for 8 seasons.' },
  alliance: { name: 'Alliance',            icon: '⚜️', dur: null, blurb: 'Shared vision, free passage, armies fight side by side, and a shared victory if every house left is allied.' },
  peace:    { name: 'Peace treaty',        icon: '🕊️', dur: 6,    blurb: 'Ends the war. Sieges are lifted and neither side may attack for 6 seasons.' },
  trade:    { name: 'Trade deal',          icon: '⚖️', dur: 8,    blurb: 'Each season one house pays 10 gold and the other sends 14 grain.' },
  tribute:  { name: 'Tribute',             icon: '💰', dur: 4,    blurb: 'One house pays gold every season for 4 seasons, and is left in peace.' }
};
const PROTECTIVE = ['nap', 'alliance', 'peace', 'tribute'];
const DIP_MAX = 4;                // diplomatic actions per season (separate from the 5 military orders)
const TRUST_START = 50, REP_START = 60, ALLY_WIN_AGE = 8, HELD_TURNS = 6;
const REL_NAMES = { war: 'At war', neutral: 'No pact', nap: 'Non-aggression', alliance: 'Allied', peace: 'Peace treaty', tribute: 'Tribute' };

/* ------------------------------------------------------------------ MAPS */
const SMALL_DEFS = [
  { name: 'Highmere',   x: 100, y: 340, terrain: 'plains',    pop: 120, fert: 1.0, owner: 0, capital: 0, castle: 2, units: ['levy','levy','levy','archers','archers','maa'] },
  { name: 'Oakvale',    x: 205, y: 165, terrain: 'forest',    pop: 70,  fert: 0.8, owner: 0, units: ['levy','levy','archers'] },
  { name: 'Ravenfell',  x: 205, y: 525, terrain: 'plains',    pop: 80,  fert: 1.1, owner: 0, units: ['levy','levy','archers'] },
  { name: 'Thornwick',  x: 325, y: 345, terrain: 'plains',    pop: 70,  fert: 1.0, owner: -1, units: ['levy','levy'] },
  { name: 'Greywater',  x: 365, y: 130, terrain: 'hills',     pop: 70,  fert: 0.8, owner: -1, units: ['levy','archers'] },
  { name: 'Stonebridge',x: 355, y: 585, terrain: 'forest',    pop: 70,  fert: 0.8, owner: -1, units: ['levy','archers'] },
  { name: 'Ashdown',    x: 500, y: 335, terrain: 'hills',     pop: 80,  fert: 0.9, owner: -1, castle: 1, units: ['maa','archers'] },
  { name: 'Greyfang Pass', x: 500, y: 185, terrain: 'mountains', pop: 40, fert: 0.4, owner: -1, units: ['archers','archers','levy'] },
  { name: 'Mistfen',    x: 500, y: 485, terrain: 'marsh',     pop: 60,  fert: 0.7, owner: -1, units: ['levy','levy','archers'] },
  { name: 'Marrowgate', x: 635, y: 130, terrain: 'hills',     pop: 70,  fert: 0.8, owner: -1, units: ['levy','archers'] },
  { name: 'Wolfsmere',  x: 645, y: 585, terrain: 'forest',    pop: 70,  fert: 0.8, owner: -1, units: ['levy','archers'] },
  { name: 'Dunmore',    x: 675, y: 345, terrain: 'plains',    pop: 70,  fert: 1.0, owner: -1, units: ['levy','levy'] },
  { name: 'Fenwick',    x: 795, y: 165, terrain: 'forest',    pop: 70,  fert: 0.8, owner: 1, units: ['levy','levy','archers'] },
  { name: 'Kingsford',  x: 795, y: 525, terrain: 'plains',    pop: 80,  fert: 1.1, owner: 1, units: ['levy','levy','archers'] },
  { name: 'Ironhold',   x: 900, y: 340, terrain: 'plains',    pop: 120, fert: 1.0, owner: 1, capital: 1, castle: 2, units: ['levy','levy','levy','archers','archers','maa'] }
];

const LARGE_NAMES = {
  cap: ['Highmere', 'Ironhold', 'Stormhaven', 'Ravenscar', 'Oakenkeep', 'Blackwater'],
  sat: [['Oakvale', 'Ravenfell'], ['Fenwick', 'Kingsford'], ['Thornfield', 'Gullcrest'], ['Crowmere', 'Nightbloom'], ['Emberdown', 'Saltmarsh'], ['Pinewatch', 'Coldharbour']],
  outer: ['Thornwick', 'Greywater', 'Stonebridge', 'Marrowgate', 'Wolfsmere', 'Dunmore'],
  inner: ['Ashdown', 'Mistfen', 'Greyfang Pass', 'Hollowdeep']
};
function largeDefs() {
  const defs = []; const cx = 500, cy = 350, rad = Math.PI / 180;
  const pos = (ang, rf) => [Math.round(cx + rf * 480 * Math.cos(ang * rad)), Math.round(cy + rf * 330 * Math.sin(ang * rad))];
  const slots = [];
  for (let s = 0; s < 6; s++) {
    const ang = 180 + 60 * s;
    const cp = pos(ang, 0.84), sa = pos(ang - 17, 0.76), sb = pos(ang + 17, 0.76);
    const ci = defs.length;
    defs.push({ name: LARGE_NAMES.cap[s], x: cp[0], y: cp[1], terrain: 'plains', pop: 120, fert: 1.0, owner: -1, castle: 2, capSlot: s, role: 'cap', units: ['maa', 'maa', 'archers', 'archers', 'levy'] });
    const a = defs.length; defs.push({ name: LARGE_NAMES.sat[s][0], x: sa[0], y: sa[1], terrain: 'forest', pop: 70, fert: 0.8, owner: -1, role: 'sat', slot: s, units: ['levy', 'levy', 'archers'] });
    const b = defs.length; defs.push({ name: LARGE_NAMES.sat[s][1], x: sb[0], y: sb[1], terrain: 'plains', pop: 80, fert: 1.1, owner: -1, role: 'sat', slot: s, units: ['levy', 'levy', 'archers'] });
    slots.push({ cap: ci, sats: [a, b] });
  }
  const outerT = ['plains', 'hills', 'forest', 'hills', 'forest', 'plains'];
  for (let s = 0; s < 6; s++) {
    const p = pos(180 + 60 * s + 30, 0.9);
    defs.push({ name: LARGE_NAMES.outer[s], x: p[0], y: p[1], terrain: outerT[s], pop: 70, fert: 0.9, owner: -1, role: 'outer', units: s % 2 ? ['levy', 'archers'] : ['levy', 'levy', 'archers'] });
  }
  const innerT = ['hills', 'marsh', 'mountains', 'marsh'];
  const innerA = [45, 135, 225, 315];
  for (let k = 0; k < 4; k++) {
    const p = pos(innerA[k], 0.38);
    defs.push({ name: LARGE_NAMES.inner[k], x: p[0], y: p[1], terrain: innerT[k], pop: 60, fert: 0.6, owner: -1, role: 'inner', castle: k === 0 ? 1 : 0, units: ['maa', 'archers', 'archers'] });
  }
  defs.slots = slots;
  return defs;
}
const SLOTS_BY_N = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };

function buildMap(id, defs) {
  const N = defs.length;
  const hull = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    hull.push([500 + 492 * Math.cos(a), 350 + 338 * Math.sin(a)]);
  }
  function clip(poly, a, b) {
    const g = (p) => (b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1]) - 2 * (p[0] * (b[0] - a[0]) + p[1] * (b[1] - a[1]));
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const gp = g(p), gq = g(q);
      if (gp >= 0) out.push(p);
      if ((gp >= 0) !== (gq >= 0)) { const t = gp / (gp - gq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
    return out;
  }
  const seeds = defs.map(d => [d.x, d.y]);
  const cells = seeds.map((s, i) => { let poly = hull.slice(); for (let j = 0; j < N; j++) if (j !== i) poly = clip(poly, s, seeds[j]); return poly; });
  const adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const a = seeds[i], b = seeds[j];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dist = (p) => Math.abs((b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1]) - 2 * (p[0] * (b[0] - a[0]) + p[1] * (b[1] - a[1]))) / (2 * len);
    const poly = cells[i]; let shared = 0;
    for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; if (dist(p) < 0.05 && dist(q) < 0.05) shared += Math.hypot(q[0] - p[0], q[1] - p[1]); }
    if (shared > 14) { adj[i].push(j); adj[j].push(i); }
  }
  const centroid = cells.map(poly => {
    let A = 0, cx = 0, cy = 0;
    for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; const cr = p[0] * q[1] - q[0] * p[1]; A += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr; }
    A /= 2; return [cx / (6 * A), cy / (6 * A)];
  });
  const dist = Array.from({ length: N }, () => new Array(N).fill(99));
  for (let s = 0; s < N; s++) { dist[s][s] = 0; const q = [s]; while (q.length) { const c = q.shift(); for (const n of adj[c]) if (dist[s][n] === 99) { dist[s][n] = dist[s][c] + 1; q.push(n); } } }
  return { id, n: N, defs, cells, adj, centroid, dist, slots: defs.slots || null };
}
const MAPS = { small: buildMap('small', SMALL_DEFS), large: buildMap('large', largeDefs()) };
let MAP = MAPS.small, MAP_DEF = MAP.defs;
function bind(S) { if (MAP.id !== S.mapId) { MAP = MAPS[S.mapId]; MAP_DEF = MAP.defs; BOTR.MAP = MAP; BOTR.MAP_DEF = MAP_DEF; } }

/* ------------------------------------------------------------------ helpers */
function rnd(S) {
  S.rng = (S.rng + 0x6D2B79F5) | 0;
  let t = S.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pickWeighted(S, items, weights) {
  let tot = 0; for (const w of weights) tot += w;
  let r = rnd(S) * tot;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
function shuffle(S, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(S) * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function heroOfUnit(S, u) { return u.type === 'hero' ? S.heroes.find(h => h.id === u.hid) || null : null; }
function ustr(u) { return UNITS[u.type].str * (u.banner ? 3 * BANNER_MULT : 1) * (u.pressed ? PRESSED_MULT : 1); }
function ucost(u) { return UNITS[u.type].cost * (u.banner ? 3 : 1); }
function uwage(u) { return UNITS[u.type].wage * (u.banner ? 2 : 1); }
function ufood(u) { return UNITS[u.type].food * (u.banner ? 2 : 1); }
function ulabel(u) { return u.banner ? 'Banner of ' + UNITS[u.type].plural : UNITS[u.type].name; }
function sumStr(arr) { let t = 0; for (const u of arr) t += ustr(u); return t; }
function describeUnits(units) {
  const m = new Map();
  for (const u of units) { const k = u.banner ? 'B:' + u.type : u.type; m.set(k, (m.get(k) || 0) + 1); }
  const parts = [];
  for (const [k, n] of m) {
    if (k.startsWith('B:')) parts.push((n > 1 ? n + '× ' : '') + 'Banner of ' + UNITS[k.slice(2)].plural);
    else parts.push(n + '× ' + (n === 1 ? UNITS[k].name : UNITS[k].plural));
  }
  return parts.join(', ') || 'no units';
}
function unitById(S, id) { for (const u of S.units) if (u.id === id) return u; return null; }
function unitsAt(S, cid, owner) { return S.units.filter(u => u.county === cid && (owner === undefined || u.owner === owner)); }
function cname(i) { return MAP_DEF[i].name; }
function pname(S, o) { return o < 0 ? 'the garrison' : S.players[o].short; }

/* ------------------------------------------------------------------ realm dynamics, house styles, perks */
const TUNE = { fair: 1.0, over: 3.5, mood: 1.2, ldAtk: 1.8, ldNeed: 0.4, ldVs: 0.6 };
if (typeof process !== 'undefined' && process.env && process.env.BOTR_TUNE) Object.assign(TUNE, JSON.parse(process.env.BOTR_TUNE));
function styleOf(S, p) { return p >= 0 && S.players[p] ? S.players[p].style : null; }
function rcost(S, p, type) {
  const base = UNITS[type].cost, st = styleOf(S, p);
  if (st === 'warlord' && type === 'knights') return Math.round(base * 0.85);
  if (st === 'schemer' && type === 'scout') return Math.ceil(base * 0.5);
  if (st === 'builder' && type === 'engine') return Math.round(base * 0.6);
  return base;
}
function feintCost(S, p) { return styleOf(S, p) === 'schemer' ? 3 : FEINT_COST; }
function freeHeroWith(S, p, t) { return S.heroes.some(h => h.owner === p && h.heldBy == null && h.traits.includes(t)); }
function spyCost(S, p) { return Math.max(2, (styleOf(S, p) === 'schemer' ? 6 : SPY_COST) - (freeHeroWith(S, p, 'spymaster') ? 4 : 0)); }
function buildCost(S, p, lvl) { return Math.round(CASTLE[lvl].cost * (styleOf(S, p) === 'builder' ? 0.75 : 1)); }
function limitFor(S) { const n = S.settings.n; return n <= 2 ? 60 : n <= 3 ? 80 : 90; }
function fairShare(S) { return S.counties.length / Math.max(1, alivePlayers(S).length); }
function cnt(S, p) { let n = 0; for (const c of S.counties) if (c.owner === p) n++; return n; }
function leaderOf(S) {
  const al = alivePlayers(S); if (al.length < 3) { if (al.length < 2) return null; }
  const rows = al.map(p => [p.id, cnt(S, p.id)]).sort((a, b) => b[1] - a[1]);
  const fair = fairShare(S);
  if (rows[0][1] < Math.ceil(fair * 1.2) || rows[0][1] < rows[1][1] + 1) return null;
  return rows[0][0];
}
function strainExcess(S, p) { return Math.max(0, cnt(S, p) - fairShare(S) * TUNE.fair); }
function overheadFor(S, p) { return Math.floor(strainExcess(S, p) * TUNE.over); }
function strainMood(S, p) { return Math.min(4, Math.floor(strainExcess(S, p) / TUNE.mood)); }
function weariness(S, p) { const w = Math.min(3, Math.max(0, Math.floor((S.turn - 30) / 10))); return (w && S.players[p].lastFight != null && S.turn - S.players[p].lastFight <= 2) ? w : 0; }
function trailing(S, p) { return S.players[p].alive && cnt(S, p) <= fairShare(S) * 0.8; }
function claimInfo(S) {
  const n = S.settings.n; return { start: n <= 2 ? 20 : 30, hold: n <= 2 ? 7 : 10 };
}
function* updateClaim(S, E) {
  if (S.over) return;
  const al = alivePlayers(S); if (al.length < 2) return;
  const ci = claimInfo(S); if (S.turn < ci.start) return;
  const N = S.counties.length, n = S.settings.n;
  const rows = al.map(p => [p.id, cnt(S, p.id)]).sort((a, b) => b[1] - a[1]);
  const late = S.turn >= (ci.start + limitFor(S)) / 2;
  const need = Math.ceil((n <= 2 ? 0.5 : late ? 0.3 : 0.34) * N);
  const ok = rows[0][1] > rows[1][1] && rows[0][1] >= need;
  const cl = S.claim, lid = rows[0][0];
  if (ok && cl.holder === lid) {
    cl.n++;
    if (cl.n >= ci.hold) { S.over = { winner: lid, reason: 'claim' }; yield E(`👑 ${S.players[lid].name} has held the lead for ${ci.hold} seasons: the nobles acclaim a new sovereign!`, 'win', null, { vis: 'all', card: { icon: '👑', title: 'The crown is claimed', key: 'claim', text: `${S.players[lid].name} is acclaimed king.`, a: lid, b: lid } }); return; }
    if (cl.n === Math.ceil(ci.hold / 2)) yield E(`👑 ${S.players[lid].short}'s claim to the crown grows: ${ci.hold - cl.n} more seasons in the lead and the nobles will acclaim them.`, 'alarm', null, { vis: 'all' });
  } else if (ok) {
    if (cl.holder >= 0) yield E(`👑 ${S.players[cl.holder].short} loses the lead; ${S.players[lid].short} is now the claimant.`, 'alarm', null, { vis: 'all' });
    else yield E(`👑 ${S.players[lid].short} stands first among the houses and claims the crown: hold the lead ${ci.hold} seasons!`, 'alarm', null, { vis: 'all' });
    cl.holder = lid; cl.n = 1;
  } else if (cl.holder >= 0) {
    yield E(`👑 No house holds a clear lead any more: the claim to the crown lapses.`, 'info', null, { vis: 'all' });
    cl.holder = -1; cl.n = 0;
  }
}
function pairKey(a, b) { return a < b ? a + '-' + b : b + '-' + a; }
function protectivePact(S, a, b) { if (!S.dip || a < 0 || b < 0 || a === b) return null; for (const p of S.dip.pacts) if (PROTECTIVE.includes(p.type) && ((p.a === a && p.b === b) || (p.a === b && p.b === a))) return p; return null; }
function pactBetween(S, a, b, type) { if (!S.dip) return null; for (const p of S.dip.pacts) if (p.type === type && ((p.a === a && p.b === b) || (p.a === b && p.b === a))) return p; return null; }
function allied(S, a, b) { return a !== b && !!pactBetween(S, a, b, 'alliance'); }
/** friendly = same house or bound by a pact: they never fight each other (until one breaks the pact) */
function friendly(S, a, b) { return a === b || (a >= 0 && b >= 0 && !!protectivePact(S, a, b)); }
function atWar(S, a, b) { return !!(S.dip && a >= 0 && b >= 0 && a !== b && S.dip.war[pairKey(a, b)] != null && !protectivePact(S, a, b)); }
function relation(S, a, b) { const p = protectivePact(S, a, b); if (p) return p.type; return atWar(S, a, b) ? 'war' : 'neutral'; }
function alliesOf(S, p) { const out = []; if (!S.dip) return out; for (const k of S.dip.pacts) if (k.type === 'alliance' && (k.a === p || k.b === p)) out.push(k.a === p ? k.b : k.a); return out; }
function trustOf(S, a, b) { return S.dip ? S.dip.trust[a][b] : TRUST_START; }
function hostileAt(S, cid, owner) { return S.units.some(u => u.county === cid && u.owner !== owner && !friendly(S, u.owner, owner)); }
function counterOfStance(s) { return STANCES.find(x => BEATS[x] === s); }
function terrainDef(cid) { return TERRAIN[MAP_DEF[cid].terrain].def; }
function alivePlayers(S) { return S.players.filter(p => p.alive); }
function isAI(p) { return !!p.ai; }
function castleDef(S, cid) { return CASTLE[S.counties[cid].castle]; }

/* ------------------------------------------------------------------ new game */
/** opts.players = [{human:true,name?} | {ai:{personality,level}}] ; 2 players => small map, else large map. */
function newGame(seed, opts) {
  opts = opts || {};
  let specs = opts.players;
  if (!specs) {
    specs = [{ human: !!(opts.humans && opts.humans.includes(0)) }, { human: !!(opts.humans && opts.humans.includes(1)) }];
    specs.forEach(s => { if (!s.human) s.ai = { personality: 'warlord', level: 'normal' }; });
  }
  const N = specs.length;
  const mapId = N <= 2 ? 'small' : 'large';
  const map = MAPS[mapId];
  const S = {
    v: 2, mapId, seed: seed >>> 0, rng: (seed >>> 0) ^ 0x9E3779B9, turn: 0, season: 0, year: 1,
    players: [], counties: [], units: [], heroes: [], feints: [], mods: { harsh: false, harvest: {} },
    nextId: 1, log: [], turnLog: [], over: null, claim: { holder: -1, n: 0 }, cnt: { merc: 0, sally: 0, sallyWin: 0, siegeBroken: 0, sieges: 0, stormed: 0, starved: 0 }, bloc: { key: '', n: 0 }, lastCrisis: 0, settings: { n: N },
    dip: { trust: Array.from({ length: N }, () => new Array(N).fill(TRUST_START)), war: {}, ended: {}, cool: {}, pacts: [], props: [], stats: { proposed: 0, accepted: 0, declined: 0, lapsed: 0, formed: {}, broken: {}, betrayals: 0, expired: 0, ransoms: 0, by: Array.from({ length: N }, () => ({ betray: 0, proposed: 0, accepted: 0, declined: 0, denounced: 0 })) } }
  };
  bind(S);
  let slots = (SLOTS_BY_N[N] || SLOTS_BY_N[6]).slice();
  if (mapId === 'large') slots = shuffle(S, slots);   // starting corners are drawn by lot, so no seat is favoured
  const ownerOfCounty = new Array(map.n).fill(-1), capOf = new Array(map.n).fill(null);
  if (mapId === 'small') {
    map.defs.forEach((d, i) => { ownerOfCounty[i] = d.owner; if (d.capital !== undefined) capOf[i] = d.capital; });
  } else {
    specs.forEach((sp, k) => { const sl = map.slots[slots[k]]; ownerOfCounty[sl.cap] = k; capOf[sl.cap] = k; for (const s of sl.sats) ownerOfCounty[s] = k; });
  }
  const capitals = new Array(N);
  capOf.forEach((p, i) => { if (p != null) capitals[p] = i; });
  specs.forEach((sp, k) => {
    const pd = PLAYER_DEF[k];
    const ai = sp.ai ? { personality: sp.ai.personality || 'warlord', level: sp.ai.level || 'normal' } : null;
    S.players.push({
      id: k, name: pd.name, short: pd.short, color: pd.color, light: pd.light,
      human: !sp.ai, autoChoose: !!sp.autoChoose, ai, style: ai ? ai.personality : (sp.style || 'builder'), infl: 4, loan: null, lastLoan: -99, lastFight: null, spied: {}, alive: true, policy: { prisoners: 'press', hero: 'ransom', merc: 'hire', heroOffer: 'accept' },
      gold: 70, grain: 130, renown: 0, rep: REP_START, garrison: {}, lastEnemyStance: null, idle: 0, capital: capitals[k], scouted: {}, mem: {}, stats: { battles: 0, wins: 0 }
    });
  });
  map.defs.forEach((d, i) => {
    const own = ownerOfCounty[i];
    const castle = (d.castle || 0);
    const c = { id: i, owner: own, pop: d.pop, maxPop: Math.round(d.pop * 1.25), happiness: own >= 0 ? 60 : 50, tax: 'normal', resent: 0, occ: null, unrest: false,
      castle, build: null, stores: CASTLE[castle].cap, siege: null, sally: false, lowTurns: 0, cap: capOf[i] };
    // large-map capitals of absent players keep a Palisade only
    if (mapId === 'large' && d.role === 'cap' && own < 0) c.castle = 1, c.stores = CASTLE[1].cap;
    S.counties.push(c);
    let list = d.units;
    if (own >= 0 && mapId === 'large') list = d.role === 'cap' ? ['levy', 'levy', 'levy', 'archers', 'archers', 'maa'] : d.units;
    for (const t of list) S.units.push({ id: S.nextId++, type: t, owner: own, county: i, banner: false, pressed: false });
  });
  // starting heroes
  const names = shuffle(S, HERO_NAMES.slice());
  S.players.forEach((p, k) => addHero(S, k, p.capital, names[k % names.length]));
  if (opts.scenario) applyScenario(S, opts);
  return S;
}
function addHero(S, owner, county, name) {
  const h = { id: S.nextId++, name: name || HERO_NAMES[Math.floor(rnd(S) * HERO_NAMES.length)], owner, traits: [], deeds: 0, captured: false };
  S.heroes.push(h);
  S.units.push({ id: S.nextId++, type: 'hero', hid: h.id, owner, county, banner: false, pressed: false });
  return h;
}

/* ------------------------------------------------------------------ fog of war */
function visSet(S, p) {
  const pl = S.players[p], v = new Set();
  if (!pl || !pl.alive) return v;
  const base = new Set();
  const circle = [p].concat(alliesOf(S, p).filter(q => S.players[q] && S.players[q].alive));
  for (const c of S.counties) if (circle.includes(c.owner)) base.add(c.id);
  for (const u of S.units) if (circle.includes(u.owner)) base.add(u.county);
  for (const b of base) { v.add(b); for (const n of MAP.adj[b]) v.add(n); }
  for (const k in pl.scouted) if (pl.scouted[k] >= S.turn) { v.add(+k); for (const n of MAP.adj[+k]) v.add(n); }
  return v;
}
function fakeUnits(S, forPlayer) {
  const out = [];
  const vis = forPlayer == null ? null : visSet(S, forPlayer);
  for (const f of S.feints) {
    if (f.until !== S.turn || f.owner === forPlayer) continue;
    if (forPlayer != null && S.players[forPlayer].spied && S.players[forPlayer].spied[f.county] >= S.turn) continue;   // exposed by a spy
    if (vis && !vis.has(f.county)) continue;
    const n = Math.max(2, Math.min(6, Math.round(f.power / 3)));
    for (let k = 0; k < n; k++) out.push({ id: -(f.id * 10 + k), type: 'maa', owner: f.owner, county: f.county, banner: false, pressed: false, fake: true });
  }
  return out;
}
/** Units the given player can see (own + visible others + enemy feints). */
function viewUnits(S, p) {
  const vis = visSet(S, p);
  const out = S.units.filter(u => u.owner === p || vis.has(u.county));
  return out.concat(fakeUnits(S, p));
}
let VIS = null;
function refreshVis(S) { VIS = S.players.map(p => visSet(S, p.id)); }
function updateMemory(S) {
  for (const p of S.players) {
    if (!p.alive) continue;
    const vis = visSet(S, p.id);
    for (const c of vis) {
      const us = S.units.filter(u => u.county === c && u.owner !== p.id);
      if (us.length) p.mem[c] = { turn: S.turn, n: us.length, pow: Math.round(sumStr(us) * 10) / 10, owner: us[0].owner };
      else delete p.mem[c];
    }
  }
}

/* ------------------------------------------------------------------ orders */
function newCtx() { return { used: new Set(), gold: 0, tax: new Set(), build: new Set(), storm: new Set(), feint: new Set(), spy: new Set(), dip: 0, infl: 0, dipKeys: new Set() }; }
const mil = orders => orders.filter(o => o && o.type !== 'dip');
function pickMerge(S, pid, cid, type, used) {
  const av = S.units.filter(u => u.owner === pid && u.county === cid && u.type === type && !u.banner && !u.pressed && !used.has(u.id));
  av.sort((a, b) => a.id - b.id);
  return av.length >= 3 ? av.slice(0, 3) : null;
}
function stormCandidates(S, pid, cid) {
  const c = S.counties[cid];
  return c.castle > 0 && c.owner >= 0 && c.owner !== pid && !friendly(S, c.owner, pid) && S.units.some(u => u.county === cid && u.owner === c.owner) && S.units.some(u => u.county === cid && u.owner === pid);
}
function checkOrder(S, pid, o, ctx) {
  bind(S);
  const me = S.players[pid];
  if (!me || !me.alive) return 'You have been eliminated.';
  if (!o || typeof o !== 'object') return 'Bad order';
  switch (o.type) {
    case 'march': {
      if (!Array.isArray(o.units) || !o.units.length) return 'Select at least one unit.';
      if (!STANCES.includes(o.stance)) return 'Choose a stance.';
      if (!(MAP.adj[o.from] || []).includes(o.to)) return 'You can only march to an adjacent county.';
      const seen = new Set(); let escort = false;
      for (const id of o.units) {
        const u = unitById(S, id);
        if (!u || u.owner !== pid || u.county !== o.from) return 'Unit is not in that county.';
        if (ctx.used.has(id) || seen.has(id)) return 'Unit already has an order.';
        seen.add(id); if (u.type !== 'engine') escort = true;
      }
      if (!escort) return 'Siege engines need an escort.';
      return null;
    }
    case 'recruit': {
      const d = UNITS[o.unit]; if (!d || d.norecruit) return 'Unknown unit.';
      const c = S.counties[o.county]; if (!c || c.owner !== pid) return 'You can only recruit in your own counties.';
      if (d.capitalOnly && o.county !== me.capital && !(me.style === 'warlord' && c.castle >= 2)) return d.name + ' can only be raised in your capital.';
      if (d.needCastle && c.castle < 1) return d.name + ' need a castle in the county.';
      if (hostileAt(S, o.county, pid)) return 'Enemy troops occupy that county.';
      if (me.gold - ctx.gold < rcost(S, pid, o.unit)) return 'Not enough gold.';
      if (c.pop < d.pop + 10) return 'Too few peasants.';
      return null;
    }
    case 'merge': {
      if (!MERGE_TYPES.includes(o.unit)) return 'That unit cannot merge.';
      const c = S.counties[o.county]; if (!c || c.owner !== pid) return 'Merge in your own county.';
      if (!pickMerge(S, pid, o.county, o.unit, ctx.used)) return 'Need 3 free identical units.';
      return null;
    }
    case 'tax': {
      const c = S.counties[o.county]; if (!c || c.owner !== pid) return 'Not your county.';
      if (!TAX[o.rate]) return 'Bad rate.';
      if (ctx.tax.has(o.county)) return 'Already a tax order for that county.';
      return null;
    }
    case 'scout': {
      const t = o.target; if (t == null || t < 0 || t >= MAP.n) return 'Bad scouting target.';
      if (!S.units.some(u => u.owner === pid && u.county === o.from && u.type === 'scout' && !ctx.used.has(u.id))) return 'No free scout in that county.';
      if (MAP.dist[o.from][t] > 3) return 'Scouts can only look three counties away.';
      return null;
    }
    case 'spy': {
      const t = o.target; if (t == null || t < 0 || t >= MAP.n) return 'Bad spying target.';
      if (ctx.spy.has(t)) return 'Already spying there.';
      if (!S.counties.some(c => c.owner === pid && MAP.dist[c.id][t] <= 3)) return 'Spies can only work three counties from your land.';
      if (me.gold - ctx.gold < spyCost(S, pid)) return 'Not enough gold.';
      return null;
    }
    case 'feint': {
      const t = o.to; if (t == null || t < 0 || t >= MAP.n) return 'Bad feint target.';
      const reach = MAP.adj[t].some(n => S.counties[n].owner === pid || S.units.some(u => u.owner === pid && u.county === n));
      if (!reach && S.counties[t].owner !== pid) return 'A feint must come from land or troops next to the target.';
      if (ctx.feint.has(t)) return 'Already feinting there.';
      if (me.gold - ctx.gold < feintCost(S, pid)) return 'Not enough gold.';
      return null;
    }
    case 'build': {
      const c = S.counties[o.county]; if (!c || c.owner !== pid) return 'Build in your own county.';
      if (c.castle >= 3) return 'Already a Fortress.';
      if (c.build) return 'Already under construction.';
      if (ctx.build.has(o.county)) return 'Already building there.';
      if (hostileAt(S, o.county, pid)) return 'Enemy troops occupy that county.';
      const cost = buildCost(S, pid, c.castle + 1);
      if (me.gold - ctx.gold < cost) return 'Not enough gold (' + cost + ').';
      return null;
    }
    case 'sally': {
      const c = S.counties[o.county]; if (!c || c.owner !== pid) return 'Sally from your own castle.';
      if (c.castle < 1) return 'Only a castle garrison can sally.';
      if (!S.units.some(u => u.county === o.county && u.owner === pid && u.type !== 'hero' && u.type !== 'scout')) return 'No garrison to sally.';
      if (ctx.sally && ctx.sally.has(o.county)) return 'Already sallying there.';
      return null;
    }
    case 'storm': {
      if (!stormCandidates(S, pid, o.county)) return 'No besieged castle to storm here.';
      if (ctx.storm.has(o.county)) return 'Already storming there.';
      return null;
    }
  }
  if (o.type === 'dip') return checkDip(S, pid, o, ctx);
  return 'Unknown order.';
}
function commitOrder(S, pid, o, ctx) {
  if (o.type === 'march') for (const id of o.units) ctx.used.add(id);
  else if (o.type === 'recruit') ctx.gold += rcost(S, pid, o.unit);
  else if (o.type === 'merge') for (const u of pickMerge(S, pid, o.county, o.unit, ctx.used)) ctx.used.add(u.id);
  else if (o.type === 'tax') ctx.tax.add(o.county);
  else if (o.type === 'scout') { const u = S.units.find(x => x.owner === pid && x.county === o.from && x.type === 'scout' && !ctx.used.has(x.id)); ctx.used.add(u.id); }
  else if (o.type === 'feint') { ctx.gold += feintCost(S, pid); ctx.feint.add(o.to); }
  else if (o.type === 'build') { ctx.gold += buildCost(S, pid, S.counties[o.county].castle + 1); ctx.build.add(o.county); }
  else if (o.type === 'spy') { ctx.gold += spyCost(S, pid); ctx.spy.add(o.target); }
  else if (o.type === 'dip') { ctx.dip++; ctx.dipKeys.add(dipKey(o)); if (o.act === 'propose' && o.kind !== 'ransom') ctx.infl++; }
  else if (o.type === 'storm') ctx.storm.add(o.county);
  else if (o.type === 'sally') (ctx.sally = ctx.sally || new Set()).add(o.county);
}
function ctxFromOrders(S, pid, orders) {
  const ctx = newCtx();
  for (const o of orders) { if (!checkOrder(S, pid, o, ctx)) commitOrder(S, pid, o, ctx); }
  return ctx;
}
function checkNewOrder(S, pid, o, orders) {
  if (o && o.type !== 'dip' && mil(orders).length >= MAX_ORDERS) return 'You have already given ' + MAX_ORDERS + ' orders.';
  return checkOrder(S, pid, o, ctxFromOrders(S, pid, orders));
}
function sanitizeOrders(S, pid, orders, max) {
  const ctx = newCtx(), out = [];
  for (const o of orders || []) {
    if (o && o.type !== 'dip' && mil(out).length >= (max || MAX_ORDERS)) continue;
    if (!checkOrder(S, pid, o, ctx)) { commitOrder(S, pid, o, ctx); out.push(o); }
  }
  return out;
}
function validateOrders(S, pid, orders) {
  const errors = []; const ctx = newCtx();
  if (mil(orders).length > MAX_ORDERS) errors.push('Too many orders');
  for (const o of orders) { const e = checkOrder(S, pid, o, ctx); if (e) errors.push(e); else commitOrder(S, pid, o, ctx); }
  return { ok: !errors.length, errors };
}
function describeOrder(S, o) {
  bind(S);
  switch (o.type) {
    case 'march': {
      const us = o.units.map(id => unitById(S, id)).filter(Boolean);
      return `March ${describeUnits(us)} ${cname(o.from)} → ${cname(o.to)} (${STANCE_INFO[o.stance].icon} ${STANCE_INFO[o.stance].name}${o.storm ? ', storm!' : ''}${o.betray ? ', BREAKING the pact!' : ''})`;
    }
    case 'recruit': return `Recruit ${UNITS[o.unit].name} in ${cname(o.county)} (${rcost(S, S.counties[o.county].owner, o.unit)}g)`;
    case 'spy': return `Spy on ${cname(o.target)}: reveal it and expose feints`;
    case 'merge': return `Merge 3 ${UNITS[o.unit].plural} into a Banner in ${cname(o.county)}`;
    case 'tax': return `Set tax in ${cname(o.county)} to ${TAX[o.rate].name}`;
    case 'scout': return `Scout ${cname(o.target)} from ${cname(o.from)}`;
    case 'feint': return `Feint toward ${cname(o.to)}`;
    case 'build': return `Build ${CASTLE[S.counties[o.county].castle + 1].name} in ${cname(o.county)} `;
    case 'storm': return `Storm the walls of ${cname(o.county)}`;
    case 'dip': return describeDip(S, o);
    case 'sally': return `Garrison of ${cname(o.county)} sallies out against any besiegers`;
  }
  return '?';
}

/* ------------------------------------------------------------------ economy previews */
function besieged(S, cid) { const c = S.counties[cid]; return !!c.siege && c.owner >= 0; }
function occupied(S, cid, pid) { return (hostileAt(S, cid, pid) && !S.units.some(u => u.county === cid && (u.owner === pid || friendly(S, u.owner, pid)))) || besieged(S, cid); }
function countyIncome(S, c) {
  if (c.owner < 0 || c.happiness < 20 || occupied(S, c.id, c.owner)) return 0;
  return Math.round(c.pop * TAX_BASE * TAX[c.tax].mult * (styleOf(S, c.owner) === 'builder' ? 1.08 : 1));
}
function wagesFor(S, pid) { let t = 0; for (const u of S.units) if (u.owner === pid) t += uwage(u); return t; }
function incomeFor(S, pid) { let t = 0; for (const c of S.counties) if (c.owner === pid) t += countyIncome(S, c); return Math.max(0, t - overheadFor(S, pid)); }
function harvestFor(S, pid) {
  if (S.season !== 2) return 0;
  const m = (S.mods.harvest && S.mods.harvest[pid]) || 1;
  let t = 0;
  for (const c of S.counties) if (c.owner === pid && !occupied(S, c.id, pid)) t += Math.round(c.pop * MAP_DEF[c.id].fert * HARVEST_K * (c.happiness >= 20 ? 1 : 0.6) * m);
  return t;
}
function winterMult(S, season) { const s = season === undefined ? S.season : season; return s === 3 ? (S.mods.harsh ? 2.5 : 2) : 1; }
function foodNeedFor(S, pid, season) {
  let n = 0;
  for (const u of S.units) if (u.owner === pid && !(S.counties[u.county].siege && S.counties[u.county].owner === pid)) n += ufood(u);
  for (const c of S.counties) if (c.owner === pid) n += Math.round(c.pop * PEASANT_FOOD);
  return n * winterMult(S, season);
}
function yearlyBalance(S, pid) {
  let h = 0;
  for (const c of S.counties) if (c.owner === pid) h += Math.round(c.pop * MAP_DEF[c.id].fert * HARVEST_K);
  return h - foodNeedFor(S, pid, 0) * 5;
}
/** projection used by the UI warnings: gold after this season's economy, and the first season (0 = this one) in which the granary would run dry */
function forecast(S, pid) {
  const me = S.players[pid];
  const goldNext = me.gold + incomeFor(S, pid) - wagesFor(S, pid) - (me.loan ? me.loan.pay : 0);
  let h = 0; for (const c of S.counties) if (c.owner === pid && !occupied(S, c.id, pid)) h += Math.round(c.pop * MAP_DEF[c.id].fert * HARVEST_K * (c.happiness >= 20 ? 1 : 0.6));
  let g = me.grain, dry = null;
  for (let k = 0; k < 4; k++) { const sn = (S.season + k) % 4; g += (sn === 2 ? h : 0) - foodNeedFor(S, pid, sn); if (g < 0 && dry == null) dry = k; }
  const g0 = me.grain + (S.season === 2 ? harvestFor(S, pid) : 0) - foodNeedFor(S, pid, S.season);
  return { goldNext, grainNext: Math.round(g0), dryIn: dry, bankrupt: goldNext < 0, famine: dry === 0 };
}
function countiesOf(S, pid) { return S.counties.filter(c => c.owner === pid); }
function armyStrength(S, pid) { return sumStr(S.units.filter(u => u.owner === pid)); }

/* ------------------------------------------------------------------ battle maths */
function bestHero(S, side) {
  let best = null;
  for (const u of side.units) if (u.type === 'hero') { const h = heroOfUnit(S, u); if (h && (!best || h.deeds > best.deeds)) best = h; }
  return best;
}
function anyTrait(S, side, t) { return side.units.some(u => { const h = u.type === 'hero' ? heroOfUnit(S, u) : null; return h && h.traits.includes(t); }); }
function sideStrength(side, foe, ctx) {
  const foeTotal = sumStr(foe.units) || 1;
  let total = 0;
  for (const u of side.units) {
    let s = ustr(u);
    const counters = UNITS[u.type].counters.slice();
    if (u.type === 'archers' && side.defending) counters.push('knights');
    let frac = 0;
    for (const e of foe.units) if (counters.includes(e.type)) frac += ustr(e) / foeTotal;
    s *= 1 + COUNTER_BONUS * Math.min(1, frac);
    if (u.type === 'archers' && side.defending && ctx.castleLvl > 0) s *= 1.25;
    total += s;
  }
  if (side.defending) total *= 1 + ctx.defBonus;
  return total;
}
function heroMult(S, side, foe) {
  let m = 1;
  const h = bestHero(S, side);
  if (h) m *= 1.08 + Math.min(0.1, h.deeds * 0.01);
  if (side.defending && anyTrait(S, side, 'stalwart')) m *= 1.1;
  if (side.defending && styleOf(S, side.owner) === 'builder') m *= 1.1;
  if (anyTrait(S, foe, 'feared')) m *= 0.93;
  return m;
}
function unitStance(S, u, cid) {
  if (u.moved && u.stance) return u.stance;
  if (u.owner < 0) return u._nst || (u._nst = pickWeighted(S, STANCES, [1, 1, 1]));
  const g = S.players[u.owner].garrison[cid];
  return STANCES.includes(g) ? g : 'hold';
}
function dominantStance(S, units, cid) {
  const sums = { charge: 0, hold: 0, flank: 0 };
  for (const u of units) sums[unitStance(S, u, cid)] += ustr(u) + 0.01;
  let best = null;
  for (const s of STANCES) if (best === null || sums[s] > sums[best]) best = s;
  return best;
}
function removeUnits(S, units) { const set = new Set(units); S.units = S.units.filter(u => !set.has(u)); }
function safeFor(S, cid, owner) { return !S.units.some(u => u.county === cid && u.owner !== owner && !friendly(S, u.owner, owner)); }
function homeFor(S, owner) {
  if (owner < 0) return null;
  const cap = S.players[owner].capital;
  if (safeFor(S, cap, owner) && S.counties[cap].owner === owner) return cap;
  const alt = S.counties.filter(c => c.owner === owner && safeFor(S, c.id, owner));
  return alt.length ? alt[0].id : null;
}
function stormPenalty(S, cid, att) {
  const L = S.counties[cid].castle; let M = CASTLE[L].pen;
  const E = att.units.filter(u => u.type === 'engine').length;
  if (L >= 2) M *= E > 0 ? Math.min(1.2, 0.75 + 0.1 * Math.min(E, 3)) : 0.4;
  else if (E > 0) M = Math.min(1, M + 0.1);
  if (anyTrait(S, att, 'siegemaster')) M = Math.min(1, M * 1.25 + 0.05);
  return M;
}

/* ------------------------------------------------------------------ choices */
function autoChoice(S, info) {
  const pl = S.players[info.player];
  if (pl.human) { const pol = pl.policy && pl.policy[info.ctype]; if (info.options.includes(pol)) return pol; }
  const pers = pl.ai ? pl.ai.personality : 'warlord';
  switch (info.ctype) {
    case 'prisoners':
      if (pl.gold < 45 || pl.grain < 40) return 'ransom';
      if (info.loser < 0) return 'press';
      if (pers === 'builder') return rnd(S) < 0.5 ? 'ransom' : 'press';
      return rnd(S) < 0.12 ? 'release' : 'press';
    case 'hero':
      if (pl.ai && info.options.includes('hold') && rnd(S) < (pers === 'builder' ? 0.3 : 0.6)) return 'hold';
      return (pl.gold < 260 || rnd(S) < 0.7) ? 'ransom' : 'release';
    case 'merc': return pl.gold >= info.price + 20 && (pers !== 'builder' || rnd(S) < 0.5) ? 'hire' : 'decline';
    case 'heroOffer': return S.heroes.filter(h => h.owner === info.player).length < 3 ? 'accept' : 'decline';
  }
  return info.options[0];
}
function* choose(S, info) {
  const pl = S.players[info.player];
  if (pl.human && !pl.autoChoose) {
    const ans = yield info;
    return info.options.includes(ans) ? ans : autoChoice(S, info);
  }
  return autoChoice(S, info);
}
function returnHero(S, E, unit, owner, why) {
  const home = homeFor(S, owner);
  const h = heroOfUnit(S, unit);
  if (home == null) { S.heroes = S.heroes.filter(x => x !== h); E(`${h ? h.name : 'A hero'} has nowhere to return and vanishes into legend.`, 'hero', null, { who: [owner] }); return; }
  unit.owner = owner; unit.county = home; unit.pressed = false; unit.moved = false; unit.storm = false; S.units.push(unit);
  if (h) { h.owner = owner; h.captured = false; }
}
function heroGain(S, E, h, prefer) {
  h.deeds++;
  if (![2, 4, 7].includes(h.deeds)) return;
  const have = new Set(h.traits);
  let pool = prefer.filter(t => !have.has(t));
  if (!pool.length) pool = TRAIT_KEYS.filter(t => !have.has(t));
  if (!pool.length) return;
  const t = pool[Math.floor(rnd(S) * pool.length)];
  h.traits.push(t);
  E(`⭐ ${h.name} earns a trait: ${TRAITS[t].icon} ${TRAITS[t].name}!`, 'hero', null, { who: [h.owner], card: { icon: TRAITS[t].icon, title: h.name + ': ' + TRAITS[t].name, key: 'hero_' + t, text: TRAITS[t].desc, hero: h.name } });
}
function applyChoice(S, E, info, choice, winner, loserOwner, units, landing) {
  const wn = S.players[winner].short;
  const sendHome = () => {
    const home = homeFor(S, loserOwner);
    if (home != null) for (const u of units) { u.owner = loserOwner; u.county = home; u.pressed = false; u.moved = false; u.storm = false; S.units.push(u); }
    return home;
  };
  const wh = S.heroes.filter(h => h.owner === winner);
  if (info.ctype === 'hero') {
    const hu = units[0], h = heroOfUnit(S, hu);
    if (choice === 'hold') {
      h.heldBy = winner; h.heldSince = S.turn; h.captured = true;
      E(`${wn} keeps ${h.name} as a captive (a ransom may be negotiated).`, 'hero', landing, { who: [winner, loserOwner] });
      return;
    }
    if (choice === 'ransom') {
      S.players[winner].gold += info.value;
      if (loserOwner >= 0) S.players[loserOwner].gold = Math.max(0, S.players[loserOwner].gold - info.value);
      E(`${wn} ransoms ${h.name} for ${info.value} gold. The hero returns home.`, 'hero', landing, { who: [winner, loserOwner] });
    } else {
      S.players[winner].renown++;
      for (const c of S.counties) if (c.owner === winner) c.happiness = Math.min(100, c.happiness + 3);
      E(`${wn} releases ${h.name} with honor (+3 mood). The hero returns home.`, 'hero', landing, { who: [winner, loserOwner] });
    }
    if (loserOwner >= 0) returnHero(S, E, hu, loserOwner); else S.heroes = S.heroes.filter(x => x !== h);
    return;
  }
  if (choice === 'press') {
    for (const u of units) { u.owner = winner; u.county = landing; u.pressed = true; u.moved = false; u.storm = false; u.rebel = false; u.raider = false; S.units.push(u); }
    E(`${wn} presses ${describeUnits(units)} into service (they fight at ${Math.round(PRESSED_MULT * 100)}% and may desert if beaten).`, 'capture', landing, { who: [winner], cs: [landing] });
  } else if (choice === 'ransom') {
    S.players[winner].gold += info.value;
    if (loserOwner >= 0) S.players[loserOwner].gold = Math.max(0, S.players[loserOwner].gold - info.value);
    const home = sendHome();
    E(`${wn} ransoms the prisoners for ${info.value} gold${loserOwner >= 0 ? (home != null ? '; they march home to ' + cname(home) : '; their home is occupied, so they disband') : ''}.`, 'econ', landing, { who: [winner, loserOwner] });
  } else {
    S.players[winner].renown++;
    for (const c of S.counties) if (c.owner === winner) c.happiness = Math.min(100, c.happiness + 3);
    for (const h of wh) { if (h.traits.length < 3 && rnd(S) < 0.15) heroGain(S, E, h, ['beloved']); }
    const home = sendHome();
    E(`${wn} releases the prisoners. Word of this mercy spreads: +3 mood across ${wn}'s realm${loserOwner >= 0 && home == null ? '; the freed men disband' : ''}.`, 'info', landing, { who: [winner, loserOwner] });
  }
}

/* process captured units from a decisive victory: yields choices for humans */
function* processCaptives(S, E, winner, loserOwner, captured, land, hint, label) {
  const heroes = captured.filter(u => u.type === 'hero'), rest = captured.filter(u => u.type !== 'hero');
  if (rest.length) {
    const silver = S.units.some(u => u.owner === winner && u.type === 'hero' && (heroOfUnit(S, u) || { traits: [] }).traits.includes('silver'));
    const value = Math.round(rest.reduce((t, u) => t + ucost(u), 0) * 0.6 * (silver ? 1.5 : 1));
    const info = { kind: 'choice', ctype: 'prisoners', options: ['ransom', 'press', 'release'], player: winner, county: land, loser: loserOwner, count: rest.length, desc: describeUnits(rest), value,
      text: `${pname(S, winner)} captures ${describeUnits(rest)}! Ransom, press into service, or release?` };
    E(info.text, 'capture', hint, { who: [winner, loserOwner], cs: [hint] });
    const ch = yield* choose(S, info);
    applyChoice(S, E, info, ch, winner, loserOwner, rest, land);
    yield S.turnLog[S.turnLog.length - 1];
  }
  for (const hu of heroes) {
    const h = heroOfUnit(S, hu);
    if (!h) continue;
    h.captured = true;
    const silver = S.units.some(u => u.owner === winner && u.type === 'hero' && (heroOfUnit(S, u) || { traits: [] }).traits.includes('silver'));
    const value = Math.round((70 + h.deeds * 25 + h.traits.length * 20) * (silver ? 1.5 : 1));
    const info = { kind: 'choice', ctype: 'hero', options: loserOwner >= 0 ? ['ransom', 'release', 'hold'] : ['ransom', 'release'], player: winner, county: land, loser: loserOwner, hero: { name: h.name, traits: h.traits.slice(), deeds: h.deeds }, value,
      text: `${pname(S, winner)} has captured the hero ${h.name}! Ransom (${value}g) or release?` };
    E(info.text, 'hero', hint, { who: [winner, loserOwner], cs: [hint] });
    const ch = yield* choose(S, info);
    applyChoice(S, E, info, ch, winner, loserOwner, [hu], land);
    yield S.turnLog[S.turnLog.length - 1];
  }
}

/* ------------------------------------------------------------------ duels */
function* fightCounty(S, E, cid, sides, opts) {
  sides.sort((x, y) => (Number(y.defending) - Number(x.defending)) || (x.owner - y.owner));
  let champ = sides[0];
  for (let i = 1; i < sides.length; i++) {
    const r = yield* duel(S, E, cid, champ, sides[i], opts);
    champ = r.winner;
  }
  return { winner: champ };
}

function* duel(S, E, cid, a, b, opts) {
  const field = opts.field;
  const c = cid != null ? S.counties[cid] : null;
  const lvl = (!field && c && !opts.noCastle) ? c.castle : 0;
  const ctx = { castleLvl: lvl, defBonus: (!field && cid != null) ? terrainDef(cid) + CASTLE[lvl].def : 0 };
  let ta = sideStrength(a, b, ctx) * (a.mult || 1) * heroMult(S, a, b);
  let tb = sideStrength(b, a, ctx) * (b.mult || 1) * heroMult(S, b, a);
  const aw = BEATS[a.stance] === b.stance, bw = BEATS[b.stance] === a.stance;
  const ha = bestHero(S, a), hb = bestHero(S, b);
  if (aw) ta *= (ha && ha.traits.includes('tactician')) ? 1.55 : STANCE_BONUS;
  if (bw) tb *= (hb && hb.traits.includes('tactician')) ? 1.55 : STANCE_BONUS;
  let winner, loser, wt, lt;
  if (ta > tb) { winner = a; loser = b; wt = ta; lt = tb; }
  else if (tb > ta) { winner = b; loser = a; wt = tb; lt = ta; }
  else if (a.defending !== b.defending) { winner = a.defending ? a : b; loser = winner === a ? b : a; wt = lt = ta; }
  else if (rnd(S) < 0.5) { winner = a; loser = b; wt = ta; lt = tb; } else { winner = b; loser = a; wt = tb; lt = ta; }
  if (winner.owner >= 0 && S.players[winner.owner].style === 'warlord') S.players[winner.owner].gold += Math.min(30, 4 + Math.round(lt * 0.5));   // plunder
  const ratio = lt > 0 ? wt / lt : 99;
  const decisive = field || (winner.owner >= 0 && ratio >= DECISIVE);
  for (const s of [a, b]) if (s.owner >= 0) { S.players[s.owner].stats.battles++; S.players[s.owner].lastFight = S.turn; }
  for (const x of (a.members || [a.owner])) for (const y of (b.members || [b.owner])) if (x >= 0 && y >= 0 && x !== y && !friendly(S, x, y)) { const k = pairKey(x, y); if (S.dip.war[k] == null) S.dip.war[k] = S.turn; }
  if (winner.owner >= 0) S.players[winner.owner].stats.wins++;
  if (a.owner >= 0 && b.owner >= 0) { S.players[a.owner].lastEnemyStance = b.stance; S.players[b.owner].lastEnemyStance = a.stance; }
  const sn = s => STANCE_INFO[s].icon + ' ' + STANCE_INFO[s].name;
  const stanceNote = aw ? `${sn(a.stance)} beats ${sn(b.stance)}` : bw ? `${sn(b.stance)} beats ${sn(a.stance)}` : `both ${sn(a.stance)}`;
  const side = (s, t) => `${pname(S, s.owner)} [${describeUnits(s.units)}; ${sn(s.stance)}${s.defending && !field ? ', defending' : ''}; power ${t.toFixed(1)}]`;
  const outcome = decisive ? `${pname(S, winner.owner)} wins decisively.` : `${pname(S, winner.owner)} prevails; the beaten force is routed.`;
  const who = [a.owner, b.owner].filter(o => o >= 0);
  yield E(`⚔ Clash ${opts.label}: ${side(a, ta)} vs ${side(b, tb)}. ${stanceNote}. ${outcome}`, 'battle', opts.hint,
    { who, cs: [opts.hint], battle: { cid: cid, a: { owner: a.owner, stance: a.stance, power: ta, units: describeUnits(a.units) }, b: { owner: b.owner, stance: b.stance, power: tb, units: describeUnits(b.units) }, winner: winner.owner, decisive, label: opts.label, note: stanceNote, outcome, ratio, storm: !!opts.storm } });

  // hero deeds for winner
  if (winner.owner >= 0) for (const u of winner.units) if (u.type === 'hero' && S.units.includes(u)) {
    const h = heroOfUnit(S, u); if (!h) continue;
    const prefer = opts.storm ? ['siegemaster'] : winner.defending ? ['stalwart', 'tactician'] : decisive ? ['feared', 'tactician', 'swift'] : ['swift', 'tactician'];
    heroGain(S, E, h, prefer);
  }

  const lus = loser.units.filter(u => S.units.includes(u));
  let captured = [];
  const desert = lus.filter(u => u.pressed);
  if (desert.length) {
    removeUnits(S, desert);
    yield E(`${desert.length} pressed soldier(s) of ${pname(S, loser.owner)} throw down their arms and desert.`, 'info', opts.hint, { who });
  }
  const rest = lus.filter(u => !u.pressed);
  if (decisive) { removeUnits(S, rest); captured = rest; }
  else {
    const cut = []; const dest = new Map();
    for (const u of rest) {
      let t = null;
      if (u.owner >= 0) {
        if (u.moved && u.from != null && u.from !== cid && safeFor(S, u.from, u.owner)) t = u.from;
        else {
          const o2 = (MAP.adj[cid] || []).filter(n => S.counties[n].owner === u.owner && safeFor(S, n, u.owner));
          o2.sort((x, y) => MAP.dist[x][S.players[u.owner].capital] - MAP.dist[y][S.players[u.owner].capital]);
          if (o2.length) t = o2[0];
        }
      }
      if (t == null) cut.push(u); else { u.county = t; u.moved = false; u.storm = false; dest.set(t, (dest.get(t) || 0) + 1); }
    }
    if (dest.size) yield E(`${pname(S, loser.owner)}'s routed troops fall back to ${[...dest.keys()].map(cname).join(', ')}.`, 'move', opts.hint, { who });
    if (loser.owner < 0 && rest.length) { removeUnits(S, rest); yield E('The rabble scatters.', 'info', opts.hint, { who }); }
    else if (cut.length) {
      if (winner.owner >= 0) { removeUnits(S, cut); captured = cut; }
      else {
        for (const u of cut) { const home = homeFor(S, u.owner); if (home != null) { u.county = home; u.moved = false; } else removeUnits(S, [u]); }
      }
    }
  }
  if (captured.length && winner.owner >= 0) {
    const land = field ? opts.landing[winner.owner] : cid;
    const byOwner = new Map(); for (const u of captured) { if (!byOwner.has(u.owner)) byOwner.set(u.owner, []); byOwner.get(u.owner).push(u); }
    for (const [lo, arr] of byOwner) yield* processCaptives(S, E, winner.owner, lo, arr, land, opts.hint, opts.label);
  } else if (captured.length) {
    removeUnits(S, captured);
  }
  return { winner, loser, decisive };
}

/* ------------------------------------------------------------------ events */

function dropPact(S, k) { S.dip.pacts = S.dip.pacts.filter(x => x !== k); if (PROTECTIVE.includes(k.type)) S.dip.ended[pairKey(k.a, k.b)] = S.turn; S.dip.stats.expired++; }
function forcePact(S, a, b, kind) {
  S.dip.pacts = S.dip.pacts.filter(k => !(PROTECTIVE.includes(k.type) && ((k.a === a && k.b === b) || (k.a === b && k.b === a))));
  S.dip.pacts.push({ id: S.nextId++, type: kind, a, b, since: S.turn, until: PACT[kind].dur ? S.turn + PACT[kind].dur : null, terms: {} });
  delete S.dip.war[pairKey(a, b)];
  for (const c of S.counties) if (c.siege && ((c.siege.by === a && c.owner === b) || (c.siege.by === b && c.owner === a))) c.siege = null;
  addTrust(S, a, b, 20); addTrust(S, b, a, 20);
  S.dip.stats.formed[kind] = (S.dip.stats.formed[kind] || 0) + 1;
}
/** scripted crises that reshuffle the pacts (rolled at the start of each year, at most one every 10 seasons) */
function* crises(S, E) {
  if (!S.dip || S.scn && S.scn.noCrisis || S.turn < 10 || S.season !== 0 || S.turn - S.lastCrisis < 10 || rnd(S) > 0.42) return;
  const al = alivePlayers(S).map(p => p.id); if (al.length < 2) return;
  const pairs = []; for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) pairs.push([al[i], al[j]]);
  const wars = pairs.filter(([a, b]) => atWar(S, a, b)), free = pairs.filter(([a, b]) => !protectivePact(S, a, b) && !atWar(S, a, b));
  const LD = leaderOf(S), pacted = al.filter(p => S.dip.pacts.some(k => k.type !== 'alliance' && PROTECTIVE.includes(k.type) && (k.a === p || k.b === p)));
  const kinds = []; if (wars.length) kinds.push('truce'); if (LD != null) kinds.push('interdict'); if (pacted.length) kinds.push('succession'); if (free.length) kinds.push('marriage');
  if (!kinds.length) return;
  const kind = kinds[Math.floor(rnd(S) * kinds.length)];
  const card = (icon, title, key, text, a, b) => E(`${icon} ${title}: ${text}`, 'event', null, { vis: 'all', card: { icon, title, key, text, a, b } });
  S.lastCrisis = S.turn;
  if (kind === 'truce') {
    for (const [a, b] of wars) forcePact(S, a, b, 'peace');
    yield card('🕊️', 'The Pope proclaims the Truce of God', 'crisis_truce', `Every sword is sheathed: ${wars.map(([a, b]) => S.players[a].short + ' & ' + S.players[b].short).join(', ')} are bound to a peace.`, wars[0][0], wars[0][1]);
  } else if (kind === 'interdict') {
    S.players[LD].rep = Math.max(0, S.players[LD].rep - 8);
    for (const c of S.counties) if (c.owner === LD) c.happiness = Math.max(0, c.happiness - 8);
    for (const k of S.dip.pacts.slice()) if (k.type !== 'alliance' && PROTECTIVE.includes(k.type) && (k.a === LD || k.b === LD)) dropPact(S, k);
    for (const p of al) if (p !== LD) S.players[p].infl = Math.min(6, S.players[p].infl + 1);
    yield card('⛪', `Papal interdict on ${S.players[LD].short}`, 'crisis_interdict', `The Church condemns ${S.players[LD].name}'s ambition: their counties sulk (−8 mood), they lose reputation, and neutral pacts with them lapse. The other houses gain influence.`, LD, LD);
  } else if (kind === 'succession') {
    const p = pacted[Math.floor(rnd(S) * pacted.length)];
    for (const k of S.dip.pacts.slice()) if (k.type !== 'alliance' && PROTECTIVE.includes(k.type) && (k.a === p || k.b === p)) dropPact(S, k);
    for (const c of S.counties) if (c.owner === p) c.happiness = Math.max(0, c.happiness - 5);
    yield card('👑', `Succession dispute in ${S.players[p].short}`, 'crisis_succession', `${S.players[p].name}'s heir repudiates every treaty the old court signed. Their pacts (except oaths of alliance) are void, and the realm is uneasy (−5 mood).`, p, p);
  } else {
    const [a, b] = free[Math.floor(rnd(S) * free.length)];
    forcePact(S, a, b, 'alliance');
    yield card('💍', `A royal marriage joins ${S.players[a].short} and ${S.players[b].short}`, 'crisis_marriage', `The houses are bound by blood and by alliance.`, a, b);
  }
}
function* rollEvents(S, E, seat) {
  const alive = seat.filter(p => S.players[p].alive);
  if (!alive.length) return;
  yield* crises(S, E);
  const card = (icon, title, key, text, who, county) => E(`${icon} ${title}: ${text}`, 'event', county == null ? null : county, { who: who || [], cs: county == null ? [] : [county], vis: who && who.length ? undefined : 'all', card: { icon, title, key, text } });
  if (S.season === 3 && (S.mods.alwaysWinter ? (rnd(S), true) : rnd(S) < 0.25)) {
    S.mods.harsh = true;
    yield card('🌨️', 'Harsh winter', 'harsh_winter', 'Blizzards close the passes (75% of marches into foreign land are snowed in) and food use climbs by 25%.', null);
  }
  const r = rnd(S);
  const n = r < 0.35 ? 0 : r < 0.9 ? 1 : 2;
  const table = [
    ['plague', 2, () => true], ['bumper', 2, () => S.season === 2], ['drought', 1, () => S.season === 1 || S.season === 2],
    ['merc', 2, () => S.season <= 1], ['bandits', 2, () => true], ['festival', 1.5, () => S.season === 1 || S.season === 2],
    ['knight', 1.2, () => S.season !== 3], ['tournament', 0.8, () => S.season === 0], ['quest', 1.6, () => S.season !== 3 && S.turn >= 4]
  ];
  for (let k = 0; k < n; k++) {
    const el = table.filter(t => t[2]());
    const kind = pickWeighted(S, el.map(t => t[0]), el.map(t => t[1]));
    let p = alive[Math.floor(rnd(S) * alive.length)];
    if (kind === 'merc') { const tr = alive.filter(q => trailing(S, q)); if (tr.length && rnd(S) < 0.6) p = tr[Math.floor(rnd(S) * tr.length)]; }
    const owned = S.counties.filter(c => c.owner === p);
    switch (kind) {
      case 'plague': {
        if (!owned.length) break;
        const c = pickWeighted(S, owned, owned.map(x => x.pop));
        c.pop = Math.max(10, Math.round(c.pop * 0.82)); c.happiness = Math.max(0, c.happiness - 6);
        const us = S.units.filter(u => u.county === c.id && u.owner === p && u.type !== 'hero').sort((x, y) => ustr(x) - ustr(y));
        let extra = '';
        if (us.length > 2 && rnd(S) < 0.5) { removeUnits(S, [us[0]]); extra = ' A soldier dies of the sickness.'; }
        yield card('☠️', 'Plague in ' + cname(c.id), 'plague', `Sickness sweeps ${cname(c.id)}: peasants fall by 18% and the mood sours.${extra}`, [p], c.id);
        break;
      }
      case 'bumper': S.mods.harvest[p] = 1.35; yield card('🌾', 'Bumper harvest', 'bumper_harvest', `${S.players[p].short}'s fields overflow: harvest +35% this Autumn.`, [p]); break;
      case 'drought': S.mods.harvest[p] = 0.65; if (S.season === 1) S.mods.harvest[p] = 1; else yield card('🔥', 'Drought', 'drought', `A dry year scorches ${S.players[p].short}'s fields: harvest −35% this Autumn.`, [p]); break;
      case 'festival': {
        for (const c of owned) c.happiness = Math.min(100, c.happiness + 8);
        yield card('🎉', 'Festival', 'festival', `Bonfires and dancing across ${S.players[p].short}'s lands: +8 mood everywhere.`, [p]);
        break;
      }
      case 'tournament': {
        const hs = S.heroes.filter(h => !h.captured);
        for (const h of hs) heroGain(S, E, h, ['tactician', 'beloved']);
        yield card('🏆', 'Royal tournament', 'tournament', 'Knights from every house joust for glory: every hero gains experience.', null);
        break;
      }
      case 'bandits': {
        const targets = owned.length ? owned : [];
        if (!targets.length) break;
        const c = targets[Math.floor(rnd(S) * targets.length)];
        const comp = ['levy', 'levy', 'archers', 'archers'];
        for (const t of comp) S.units.push({ id: S.nextId++, type: t, owner: -1, county: c.id, banner: false, pressed: false, raider: true });
        yield card('🗡️', 'Bandits in ' + cname(c.id), 'bandits', `A band of outlaws raids ${cname(c.id)}! Defend it or lose gold and grain.`, [p], c.id);
        break;
      }
      case 'merc': {
        if (S.players[p].capital == null || !safeFor(S, S.players[p].capital, p)) break;
        const price = trailing(S, p) ? 80 : 130;
        const info = { kind: 'choice', ctype: 'merc', options: ['hire', 'decline'], player: p, price, desc: '3× Men-at-arms and 1× Knights', county: S.players[p].capital,
          text: `A mercenary company, the Iron Wolves, offers its swords: 3× Men-at-arms and 1× Knights for ${price} gold.` };
        const ev = card('⚔️', 'Mercenaries for hire', 'mercenaries', info.text, [p], S.players[p].capital);
        yield ev;
        const ch = yield* choose(S, info);
        if (ch === 'hire' && S.players[p].gold >= price) {
          S.players[p].gold -= price;
          const cap = S.players[p].capital;
          for (const t of ['maa', 'maa', 'maa', 'knights']) S.units.push({ id: S.nextId++, type: t, owner: p, county: cap, banner: false, pressed: false });
          S.cnt.merc++;
          yield E(`${S.players[p].short} hires the Iron Wolves for ${price} gold.`, 'recruit', cap, { who: [p], cs: [cap] });
        } else yield E(`${S.players[p].short} sends the mercenaries away.`, 'info', null, { who: [p] });
        break;
      }
      case 'quest': {
        const hs = S.heroes.filter(h => h.owner === p && h.heldBy == null && !h.captured && S.units.some(u => u.type === 'hero' && u.hid === h.id));
        if (!hs.length) break;
        const h = hs[Math.floor(rnd(S) * hs.length)], hu = S.units.find(u => u.type === 'hero' && u.hid === h.id);
        const Q = [['relic', '🏺', 'Sir quest for the lost relic', 'recovers a relic from a barrow, sold for 45 gold'], ['beast', '🐗', 'the Beast of the Marches', 'hunts down the beast that terrorised the marches'],
          ['pilgrim', '⛪', 'a pilgrimage', 'escorts pilgrims to a holy shrine; the people rejoice'], ['caravan', '🌾', 'a hungry caravan', 'rescues a grain caravan from bandits']][Math.floor(rnd(S) * 4)];
        const win = rnd(S) < 0.78, pl = S.players[p], cname2 = S.counties[hu.county].name;
        let text, extra = '';
        if (!win) text = `${h.name} rides out on a quest but returns empty-handed, and weary. (${Q[3].split(',')[0].replace(/^[a-z]+s /, '')} fails.)`;
        else if (Q[0] === 'relic') { pl.gold += 45; text = `${h.name} ${Q[3]}. +45 gold.`; }
        else if (Q[0] === 'pilgrim') { pl.rep = Math.min(100, pl.rep + 5); for (const c of S.counties) if (c.owner === p) c.happiness = Math.min(100, c.happiness + 4); text = `${h.name} ${Q[3]}. +5 reputation, +4 mood.`; }
        else if (Q[0] === 'caravan') { pl.grain += 45; text = `${h.name} ${Q[3]}. +45 grain.`; }
        else { text = `${h.name} ${Q[3]}. The tale spreads.`; heroGain(S, E, h, ['feared', 'stalwart', 'diplomat', 'quartermaster']); }
        void extra; void cname2;
        yield card(Q[1], win ? 'Quest accomplished' : 'Quest abandoned', 'hero_quest', text, [p], hu.county);
        break;
      }
      case 'knight': {
        const cap = S.players[p].capital;
        if (cap == null || !safeFor(S, cap, p) || S.heroes.filter(h => h.owner === p).length >= 3) break;
        const taken = new Set(S.heroes.map(h => h.name));
        const name = HERO_NAMES.filter(x => !taken.has(x))[Math.floor(rnd(S) * Math.max(1, HERO_NAMES.filter(x => !taken.has(x)).length))] || 'Sir Wanderer';
        const info = { kind: 'choice', ctype: 'heroOffer', options: ['accept', 'decline'], player: p, name, county: cap, text: `The famed knight ${name} arrives at court offering to lead your armies (wage 2 gold a season).` };
        yield card('🛡️', 'A famed knight arrives', 'hero_arrives', info.text, [p], cap);
        const ch = yield* choose(S, info);
        if (ch === 'accept') { addHero(S, p, cap, name); yield E(`${name} swears fealty to ${S.players[p].short}.`, 'hero', cap, { who: [p], cs: [cap] }); }
        else yield E(`${name} rides on to another court.`, 'info', null, { who: [p] });
        break;
      }
    }
  }
}


/* ------------------------------------------------------------------ scenarios & campaign */
const SCENARIOS = [
  { id: 'tutorial', title: 'First Steps', icon: '🎓', n: 2, ais: [['builder', 'easy']], style: 'builder', blurb: 'A gentle lesson: take a county, recruit, seal your orders and make a pact. The rival is friendly to a first treaty.',
    goal: { kind: 'tutorial' }, limit: 24, noCrisis: true, legacy: [], reward: null },
  { id: 'c1', title: 'The Border Lords', icon: '🏰', n: 3, ais: [['builder', 'easy'], ['warlord', 'easy']], blurb: 'Two petty lords press your borders. Hold two counties in every five for six seasons.',
    goal: { kind: 'own', share: 0.4, hold: 6 }, limit: 40, noCrisis: true, legacy: [], reward: 'gold' },
  { id: 'c2', title: 'The Wolf Winter', icon: '🐺', n: 4, ais: [['warlord', 'normal'], ['schemer', 'easy'], ['builder', 'easy']], blurb: 'Harsh winters grip the land. Survive to the 24th season holding at least five counties. (Legacy: +40 gold.)',
    goal: { kind: 'survive', turns: 24, min: 5 }, limit: 24, harsh: true, noCrisis: true, legacy: ['gold'], reward: 'hero' },
  { id: 'c3', title: 'The Gathering Storm', icon: '🕊️', n: 4, ais: [['schemer', 'normal'], ['warlord', 'normal'], ['builder', 'normal']], blurb: 'The Church stirs the houses. Be part of a League that holds three quarters of the realm for six seasons. (Legacy: a famed knight.)',
    goal: { kind: 'league', share: 0.6, hold: 5 }, limit: 50, legacy: ['gold', 'hero'], reward: 'infl' },
  { id: 'c4', title: 'The Crown of the Realm', icon: '👑', n: 5, ais: [['warlord', 'hard'], ['schemer', 'normal'], ['builder', 'normal'], ['warlord', 'normal']], blurb: 'Claim the crown outright: win the realm against four houses. (Legacy of every earlier scenario.)',
    goal: { kind: 'win' }, limit: 70, legacy: ['gold', 'hero', 'infl'], reward: null }
];
function scenarioById(id) { return SCENARIOS.find(x => x.id === id) || null; }
function scenarioSpecs(sc, style) { return [{ human: true, style: sc.style || style || 'builder' }].concat(sc.ais.map(a => ({ ai: { personality: a[0], level: a[1] } }))); }
function applyScenario(S, opts) {
  const sc = scenarioById(opts.scenario); if (!sc) return;
  S.scn = { id: sc.id, goal: sc.goal, limit: sc.limit, n: 0, noCrisis: !!sc.noCrisis, start: cnt(S, 0) };
  if (sc.harsh) S.mods.alwaysWinter = true;
  const lg = new Set(opts.legacy || []), me = S.players[0];
  if (lg.has('gold')) me.gold += 40;
  if (lg.has('infl')) me.infl = 6;
  if (lg.has('hero')) { const cap = me.capital; const h = addHero(S, 0, cap, 'Sir Veteran of the Wars'); h.deeds = 2; h.traits.push('tactician'); }
}
function* scenarioCheck(S, E) {
  const g = S.scn; if (!g || S.over) return;
  const me = S.players[0], mine = cnt(S, 0), N = S.counties.length;
  const win = (text) => { S.over = { winner: 0, reason: 'scenario', scenario: g.id }; return E(`🏆 ${text}`, 'win', null, { vis: 'all' }); };
  if (!me.alive) { S.over = { winner: alivePlayers(S)[0] ? alivePlayers(S)[0].id : null, reason: 'scenario_fail', scenario: g.id }; yield E('💀 Your house has fallen: the scenario is lost.', 'win', null, { vis: 'all' }); return; }
  const k = g.goal.kind;
  if (k === 'tutorial') {
    if (mine >= g.start + 1 && S.dip.stats.formed && Object.keys(S.dip.stats.formed).length) { yield win('Lesson complete! You took a county and made a pact. Now you are ready for the realm.'); return; }
  } else if (k === 'own') {
    if (mine / N >= g.goal.share) g.n++; else g.n = 0;
    if (g.n >= g.goal.hold) { yield win(`You hold ${mine} counties and the borders are secure: the scenario is won!`); return; }
  } else if (k === 'survive') {
    if (S.turn >= g.goal.turns && mine >= g.goal.min) { yield win('You weathered the winter and your banners still fly: the scenario is won!'); return; }
  } else if (k === 'league') {
    const av = S.bloc && S.bloc.key ? S.bloc.key.split(',').map(Number) : [];
    let share = 0; const best = []; for (const p of alivePlayers(S)) if (p.id !== 0 && allied(S, 0, p.id)) best.push(p.id);
    share = (mine + best.reduce((t, x) => t + cnt(S, x), 0)) / N;
    if (best.length && share >= g.goal.share) g.n++; else g.n = 0; void av;
    if (g.n >= g.goal.hold) { yield win('Your League rules the realm: the scenario is won!'); return; }
  }
  if (S.turn >= g.limit && k !== 'win') { const rv = alivePlayers(S).filter(p => p.id !== 0).sort((a, b) => cnt(S, b.id) - cnt(S, a.id))[0]; S.over = { winner: rv ? rv.id : null, reason: 'scenario_fail', scenario: g.id }; yield E('⌛ Time has run out: the scenario is lost.', 'win', null, { vis: 'all' }); }
}

/* ------------------------------------------------------------------ elimination */
function eliminate(S, E, q, captor, disband) {
  const qp = S.players[q];
  qp.alive = false;
  for (const c of S.counties) if (c.owner === q) {
    c.owner = disband ? -1 : captor; c.happiness = Math.max(5, Math.min(c.happiness, 30) - 10); c.resent = 3; c.build = null; c.occ = null; c.tax = 'normal';
    if (!(c.siege && c.castle > 0)) { c.siege = null; c.stores = 0; }
  }
  const mine = S.units.filter(u => u.owner === q);
  if (disband) { removeUnits(S, mine); S.heroes = S.heroes.filter(h => h.owner !== q); }
  else {
    for (const u of mine) { u.owner = captor; u.pressed = u.type === 'hero' ? false : true; u.moved = false; }
    for (const h of S.heroes) if (h.owner === q) h.owner = captor;
    S.players[captor].gold += Math.floor(qp.gold / 2); S.players[captor].grain += Math.floor(qp.grain / 2);
  }
  qp.gold = 0; qp.grain = 0;
  S.dip.ended.elim = S.turn;
  S.dip.pacts = S.dip.pacts.filter(k => k.a !== q && k.b !== q); S.dip.props = S.dip.props.filter(k => k.from !== q && k.to !== q);
  for (const h of S.heroes.slice()) if (h.heldBy === q) { if (S.players[h.owner] && S.players[h.owner].alive) { freeHero(S, E, h, 'is freed as its captor falls'); } else S.heroes = S.heroes.filter(x => x !== h); }
  for (const c of S.counties) {   // a siege laid by a third party carries on against the new owner
    if (!c.siege) continue;
    const foes = S.units.filter(u => u.county === c.id && u.owner >= 0 && u.owner !== c.owner && !friendly(S, u.owner, c.owner));
    if (c.owner < 0 || !foes.length || !S.units.some(u => u.county === c.id && u.owner === c.owner)) { c.siege = null; continue; }
    c.siege = { by: foes[0].owner, since: c.siege.since };
  }
}

/* ------------------------------------------------------------------ the turn */

/* ------------------------------------------------------------------ diplomacy */
const dipKey = o => o.act + ':' + (o.kind || '') + ':' + (o.to != null ? o.to : '') + ':' + (o.pid != null ? o.pid : '') + ':' + (o.pact != null ? o.pact : '') + ':' + (o.hid != null ? o.hid : '');
function heroValue(h) { return 70 + h.deeds * 25 + h.traits.length * 20; }
function incoming(S, pid) { return S.dip.props.filter(p => p.to === pid && p.turn === S.turn - 1); }
function outgoing(S, pid) { return S.dip.props.filter(p => p.from === pid && p.turn === S.turn - 1); }
function heldHeroes(S) { return S.heroes.filter(h => h.heldBy != null); }
function dipBlock(S, kind, a, b) {   // why this proposal is not possible, or null
  const prot = protectivePact(S, a, b), war = atWar(S, a, b);
  switch (kind) {
    case 'nap': if (prot) return 'You already have a pact with them (' + PACT[prot.type].name + ').'; if (war) return 'You are at war: propose peace first.'; return null;
    case 'alliance': if (prot && prot.type === 'alliance') return 'Already allied.'; if (war) return 'You are at war: make peace first.'; return null;
    case 'peace': if (!war) return 'You are not at war.'; return null;
    case 'trade': if (pactBetween(S, a, b, 'trade')) return 'You already trade with them.'; if (war) return 'No trade during a war.'; return null;
    case 'tribute': if (prot) return 'You already have a pact with them (' + PACT[prot.type].name + ').'; return null;
  }
  return null;
}
function checkDip(S, pid, o, ctx) {
  if (!S.dip) return 'No diplomacy in this game.';
  if (ctx.dip >= DIP_MAX) return 'You can take at most ' + DIP_MAX + ' diplomatic actions a season.';
  if (ctx.dipKeys.has(dipKey(o))) return 'Already ordered.';
  if (o.act === 'propose') {
    const to = o.to; if (!Number.isInteger(to) || to < 0 || to >= S.players.length || to === pid || !S.players[to].alive) return 'Bad envoy target.';
    if (outgoing(S, pid).some(p => p.to === to && p.kind === o.kind)) return 'You already made them that offer last season.';
    const cd = S.dip.cool[pid + '>' + to + ':' + o.kind]; if (cd > S.turn) return `They will not hear that again for ${cd - S.turn} season(s).`;
    if (o.kind !== 'ransom' && (S.players[pid].infl || 0) - ctx.infl < 1) return 'Not enough influence (you earn 1 a season).';
    if (o.vs != null && (o.kind !== 'alliance' || !Number.isInteger(o.vs) || o.vs === pid || o.vs === to || !S.players[o.vs] || !S.players[o.vs].alive)) return 'Bad league target.';
    if (o.kind === 'ransom') {
      const h = S.heroes.find(x => x.id === o.hid);
      if (!h || h.heldBy == null) return 'No such captive hero.';
      if (!((h.owner === pid && h.heldBy === to) || (h.heldBy === pid && h.owner === to))) return 'That hero is not held between you.';
      if (h.owner === pid && S.players[pid].gold < heroValue(h)) return 'Not enough gold for the ransom (' + heroValue(h) + ').';
      return null;
    }
    if (!PACT[o.kind]) return 'Unknown pact.';
    if (o.kind === 'tribute') { if (o.dir !== 'demand' && o.dir !== 'offer') return 'Choose demand or offer.'; if (![10, 20, 30].includes(o.amount)) return 'Bad amount.'; }
    if (o.kind === 'trade' && o.dir !== 'buy' && o.dir !== 'sell') return 'Choose buy or sell grain.';
    return dipBlock(S, o.kind, pid, to);
  }
  if (o.act === 'respond') {
    const p = incoming(S, pid).find(x => x.id === o.pid); if (!p) return 'That proposal is no longer open.';
    return null;
  }
  if (o.act === 'break') {
    const k = S.dip.pacts.find(x => x.id === o.pact && (x.a === pid || x.b === pid));
    if (!k) return 'No such pact.';
    return null;
  }
  return 'Unknown diplomatic action.';
}
function describeDip(S, o) {
  const nm = i => S.players[i] ? S.players[i].short : '?';
  if (o.act === 'propose') {
    if (o.kind === 'ransom') { const h = S.heroes.find(x => x.id === o.hid); return `Envoy to ${nm(o.to)}: ransom ${h ? h.name : 'a hero'} (${h ? heroValue(h) : '?'}g)`; }
    if (o.kind === 'tribute') return `Envoy to ${nm(o.to)}: ${o.dir === 'demand' ? 'DEMAND' : 'offer'} tribute of ${o.amount}g/season`;
    if (o.kind === 'trade') return `Envoy to ${nm(o.to)}: trade deal (${o.dir === 'buy' ? 'we buy 14 grain for 10g' : 'we sell 14 grain for 10g'} each season)`;
    return `Envoy to ${nm(o.to)}: propose ${o.vs != null ? 'a league against ' + nm(o.vs) : PACT[o.kind].name.toLowerCase()}`;
  }
  if (o.act === 'respond') { const p = S.dip.props.find(x => x.id === o.pid); return `${o.accept ? 'ACCEPT' : 'Decline'} ${p ? nm(p.from) + '\'s ' + (p.kind === 'ransom' ? 'ransom offer' : PACT[p.kind].name.toLowerCase()) : 'a proposal'}`; }
  if (o.act === 'break') { const k = S.dip.pacts.find(x => x.id === o.pact); return k ? `Denounce the ${PACT[k.type].name.toLowerCase()} between ${nm(k.a)} and ${nm(k.b)}` : 'Denounce a pact'; }
  return 'Diplomacy';
}
function addRep(S, p, d) { const me = S.players[p]; me.rep = Math.max(0, Math.min(100, me.rep + d)); }
function addTrust(S, a, b, d) { S.dip.trust[a][b] = Math.max(0, Math.min(100, S.dip.trust[a][b] + d)); }
function repMood(S, p) { const r = S.players[p].rep; return r < 25 ? -2 : r < 40 ? -1 : r >= 85 ? 1 : 0; }
function freeHero(S, E, h, why) {
  const owner = h.owner, home = homeFor(S, owner);
  h.heldBy = null; h.captured = false;
  if (home == null || !S.players[owner] || !S.players[owner].alive) { S.heroes = S.heroes.filter(x => x !== h); E(`${h.name} has nowhere to return and vanishes into legend.`, 'hero', null, { who: [owner] }); return; }
  S.units.push({ id: S.nextId++, type: 'hero', hid: h.id, owner, county: home, banner: false, pressed: false });
  E(`${h.name} ${why} and returns to ${cname(home)}.`, 'hero', home, { who: [owner, h.heldBy], cs: [home] });
}
function* formPact(S, E, prop, accepted) {
  const st = S.dip.stats, a = prop.from, b = prop.to, A = S.players[a], Bp = S.players[b];
  if (!A.alive || !Bp.alive) return false;
  if (prop.kind === 'ransom') {
    const h = S.heroes.find(x => x.id === prop.terms.hid);
    if (!h || h.heldBy == null) return false;
    const payer = h.owner, holder = h.heldBy;
    if (S.players[payer].gold < prop.terms.price) { yield E(`The ransom for ${h.name} falls through: ${S.players[payer].short} cannot pay.`, 'warn', null, { who: [payer, holder] }); return false; }
    S.players[payer].gold -= prop.terms.price; S.players[holder].gold += prop.terms.price;
    st.ransoms++; addTrust(S, a, b, 6); addTrust(S, b, a, 6);
    yield E(`💰 ${S.players[holder].short} accepts ${prop.terms.price} gold for ${h.name}; the hero goes home.`, 'hero', null, { who: [payer, holder] });
    freeHero(S, E, h, 'is ransomed');
    return true;
  }
  const kind = prop.kind;
  if (dipBlock(S, kind, a, b)) {
    yield E(`The ${PACT[kind].name.toLowerCase()} between ${A.short} and ${Bp.short} can no longer be made: circumstances changed.`, 'info', null, { who: [a, b] }); return false;
  }
  // an alliance supersedes weaker pacts
  if (kind === 'alliance') S.dip.pacts = S.dip.pacts.filter(k => !(PROTECTIVE.includes(k.type) && ((k.a === a && k.b === b) || (k.a === b && k.b === a))));
  const pact = { id: S.nextId++, type: kind, a, b, since: S.turn, until: PACT[kind].dur ? S.turn + PACT[kind].dur : null, terms: {} };
  if (kind === 'alliance' && prop.terms && prop.terms.vs != null) pact.terms.vs = prop.terms.vs;
  if (kind === 'tribute') { pact.terms = prop.terms.dir === 'demand' ? { payer: b, payee: a, amt: prop.terms.amount } : { payer: a, payee: b, amt: prop.terms.amount }; }
  if (kind === 'trade') pact.terms = prop.terms.dir === 'buy' ? { goldFrom: a, grainFrom: b } : { goldFrom: b, grainFrom: a };
  S.dip.pacts.push(pact);
  if (PROTECTIVE.includes(kind)) {
    delete S.dip.war[pairKey(a, b)];
    for (const c of S.counties) if (c.siege && ((c.siege.by === a && c.owner === b) || (c.siege.by === b && c.owner === a))) c.siege = null;
  }
  addTrust(S, a, b, 10); addTrust(S, b, a, 10);
  st.formed[kind] = (st.formed[kind] || 0) + 1; st.accepted++; st.by[b].accepted++;
  const text = kind === 'tribute' ? `${S.players[pact.terms.payer].short} will pay ${S.players[pact.terms.payee].short} ${pact.terms.amt} gold a season for ${PACT.tribute.dur} seasons.` : kind === 'alliance' && pact.terms.vs != null ? `${A.short} and ${Bp.short} swear a league against ${S.players[pact.terms.vs].short}!` : `${A.short} and ${Bp.short} sign a ${PACT[kind].name.toLowerCase()}.`;
  yield E(`${PACT[kind].icon} ${text}`, 'pact', null, { vis: 'all', card: { icon: PACT[kind].icon, title: PACT[kind].name, key: 'pact_' + kind, text, a, b } });
  return true;
}
function* breakPact(S, E, pact, breaker, why) {   // why: 'betray' | 'denounce'
  const other = pact.a === breaker ? pact.b : pact.a, st = S.dip.stats;
  S.dip.pacts = S.dip.pacts.filter(k => k !== pact);
  if (PROTECTIVE.includes(pact.type)) S.dip.ended[pairKey(pact.a, pact.b)] = S.turn;
  st.broken[pact.type] = (st.broken[pact.type] || 0) + 1;
  if (why === 'betray') {
    st.betrayals++; st.by[breaker].betray++; S.players[other].venge = { who: breaker, until: S.turn + 12 };
    if (S.players[breaker].style === 'schemer') { /* silver tongue softens the blow */ }
    const pen = { alliance: 35, nap: 25, peace: 25, tribute: 15, trade: 5 }[pact.type] || 20;
    addRep(S, breaker, -Math.round(pen * (S.players[breaker].style === 'schemer' ? 0.7 : 1))); addTrust(S, other, breaker, -100);
    for (const p of S.players) if (p.alive && p.id !== breaker && p.id !== other) addTrust(S, p.id, breaker, -10);
    for (const c of S.counties) if (c.owner === breaker) c.happiness = Math.max(0, c.happiness - 4);
    if (PROTECTIVE.includes(pact.type)) S.dip.war[pairKey(breaker, other)] = S.turn;
    yield E(`🗡️ BETRAYAL! ${S.players[breaker].short} breaks the ${PACT[pact.type].name.toLowerCase()} with ${S.players[other].short}! Their word is worth less now (reputation ${Math.round(S.players[breaker].rep)}).`, 'alarm', null, { vis: 'all', card: { icon: '🗡️', title: 'Betrayal!', key: 'betrayal', text: `${S.players[breaker].short} has broken the ${PACT[pact.type].name.toLowerCase()} with ${S.players[other].short}. Every house will remember.`, a: breaker, b: other } });
  } else {
    st.by[breaker].denounced++;
    addRep(S, breaker, PACT[pact.type] && pact.type === 'trade' ? -2 : -8); addTrust(S, other, breaker, -15);
    yield E(`📜 ${S.players[breaker].short} denounces the ${PACT[pact.type].name.toLowerCase()} with ${S.players[other].short}.`, 'pact', null, { vis: 'all' });
  }
}
/** Decree-phase diplomacy: responses, new proposals, denunciations. */
function* diplomacyPhase(S, E, seat, orders) {
  const st = S.dip.stats;
  for (const p of seat) for (const o of orders[p]) if (o.type === 'dip' && o.act === 'respond') {
    const prop = S.dip.props.find(x => x.id === o.pid && x.to === p && x.turn === S.turn - 1); if (!prop) continue;
    if (o.accept) { const ok = yield* formPact(S, E, prop, true); if (!ok) st.lapsed++; }
    else { st.declined++; st.by[p].declined++; S.dip.cool[prop.from + '>' + prop.to + ':' + prop.kind] = S.turn + 3; addTrust(S, prop.from, prop.to, -2); yield E(`${S.players[p].short} declines ${S.players[prop.from].short}'s ${prop.kind === 'ransom' ? 'ransom offer' : PACT[prop.kind].name.toLowerCase()}.`, 'info', null, { who: [p, prop.from] }); }
    prop.done = true;
  }
  for (const pr of S.dip.props) if (!pr.done && pr.turn < S.turn) { st.lapsed++; S.dip.cool[pr.from + '>' + pr.to + ':' + pr.kind] = S.turn + 2; }
  S.dip.props = S.dip.props.filter(x => x.turn >= S.turn);
  // new proposals (crossing identical offers are struck at once)
  const fresh = [];
  for (const p of seat) for (const o of orders[p]) if (o.type === 'dip' && o.act === 'propose') {
    const terms = o.kind === 'ransom' ? { hid: o.hid, price: (S.heroes.find(h => h.id === o.hid) ? heroValue(S.heroes.find(h => h.id === o.hid)) : 0) } : o.kind === 'tribute' ? { dir: o.dir, amount: o.amount } : o.kind === 'trade' ? { dir: o.dir } : o.kind === 'alliance' && o.vs != null ? { vs: o.vs } : {};
    fresh.push({ id: S.nextId++, kind: o.kind, from: p, to: o.to, turn: S.turn, terms });
  }
  const used = new Set();
  for (const f of fresh) {
    if (used.has(f.id)) continue;
    const x = fresh.find(g => !used.has(g.id) && g !== f && g.from === f.to && g.to === f.from && g.kind === f.kind && (f.kind === 'nap' || f.kind === 'alliance' || f.kind === 'peace' || f.kind === 'ransom'));
    if (x) { used.add(f.id); used.add(x.id); st.proposed += 2; yield E(`The envoys of ${S.players[f.from].short} and ${S.players[f.to].short} cross on the road with the same offer: the deal is struck!`, 'pact', null, { who: [f.from, f.to] }); const ok = yield* formPact(S, E, f, true); if (!ok) st.lapsed++; }
  }
  for (const f of fresh) {
    if (used.has(f.id)) continue;
    S.dip.props.push(f); st.proposed++; st.by[f.from].proposed++; if (f.kind !== 'ransom') S.players[f.from].infl = Math.max(0, (S.players[f.from].infl || 0) - 1);
    yield E(`✉ An envoy of ${S.players[f.from].short} rides to ${S.players[f.to].short} with ${f.kind === 'ransom' ? 'a ransom offer' : 'a proposal'}.`, 'info', null, { who: [f.from, f.to] });
  }
  for (const p of seat) for (const o of orders[p]) if (o.type === 'dip' && o.act === 'break') {
    const pact = S.dip.pacts.find(k => k.id === o.pact && (k.a === p || k.b === p)); if (pact) yield* breakPact(S, E, pact, p, 'denounce');
  }
}
/** Betrayal: marching into a pact partner's land or onto their troops breaks the pact this season. */
function* betrayals(S, E, groups) {
  const done = new Set();
  for (const g of groups) {
    const a = g.owner, tc = S.counties[g.to];
    const victims = new Set();
    if (tc.owner >= 0 && tc.owner !== a) victims.add(tc.owner);
    if (tc.owner !== a) for (const u of S.units) if (u.county === g.to && u.owner >= 0 && u.owner !== a && !u.moved) victims.add(u.owner);
    for (const b of victims) {
      const pact = protectivePact(S, a, b); if (!pact) continue;
      if (pact.since === S.turn && !g.betray) {   // signed this very season: the army was planned before the ink dried, so it halts at the border
        for (const u of g.units) { u.moved = false; u.from = null; u.stance = null; u.storm = false; }
        g.alive = false;
        yield E(`📜 ${S.players[a].short}'s army halts at ${cname(g.from)}: the new ${PACT[pact.type].name.toLowerCase()} with ${S.players[b].short} forbids the march.`, 'pact', g.from, { who: [a, b], cs: [g.from] });
        break;
      }
      if (pact.type === 'alliance' && !g.betray) continue;
      const k = pact.id; if (done.has(k)) continue; done.add(k);
      yield* breakPact(S, E, pact, a, 'betray');
    }
  }
}
function* diplomacyUpkeep(S, E) {
  const st = S.dip.stats;
  for (const pact of S.dip.pacts.slice()) {
    if (!S.players[pact.a].alive || !S.players[pact.b].alive) { S.dip.pacts = S.dip.pacts.filter(k => k !== pact); continue; }
    if (pact.type === 'trade') {
      const g = S.players[pact.terms.goldFrom], r = S.players[pact.terms.grainFrom];
      if (g.gold >= 10 && r.grain >= 14) { g.gold -= 10; r.gold += 10; r.grain -= 14; g.grain += 14; }
    } else if (pact.type === 'tribute') {
      const pay = S.players[pact.terms.payer], rec = S.players[pact.terms.payee], amt = pact.terms.amt;
      if (pay.gold >= amt) { pay.gold -= amt; rec.gold += amt; }
      else { S.dip.pacts = S.dip.pacts.filter(k => k !== pact); S.dip.ended[pairKey(pact.a, pact.b)] = S.turn; addTrust(S, pact.terms.payee, pact.terms.payer, -15); yield E(`${pay.short} cannot pay the tribute owed to ${rec.short}: the arrangement collapses.`, 'warn', null, { vis: 'all' }); continue; }
    }
    addTrust(S, pact.a, pact.b, 1); addTrust(S, pact.b, pact.a, 1);
    if (pact.until != null && S.turn + 1 >= pact.until) {
      S.dip.pacts = S.dip.pacts.filter(k => k !== pact); st.expired++; if (PROTECTIVE.includes(pact.type)) S.dip.ended[pairKey(pact.a, pact.b)] = S.turn;
      addRep(S, pact.a, 2); addRep(S, pact.b, 2); addTrust(S, pact.a, pact.b, 4); addTrust(S, pact.b, pact.a, 4);
      yield E(`${PACT[pact.type].icon} The ${PACT[pact.type].name.toLowerCase()} between ${S.players[pact.a].short} and ${S.players[pact.b].short} runs its course and expires.`, 'pact', null, { vis: 'all' });
    }
  }
  for (const p of S.players) if (p.alive && p.rep < REP_START && S.turn % 2 === 0) addRep(S, p.id, 1);
  for (const p of S.players) if (p.alive) p.infl = Math.min(6, (p.infl || 0) + 1 + (S.heroes.some(h => h.owner === p.id && h.heldBy == null && h.traits.includes('diplomat')) ? 1 : 0));
  for (const h of heldHeroes(S)) if (S.turn - h.heldSince >= HELD_TURNS) { freeHero(S, E, h, 'escapes its captors'); yield S.turnLog[S.turnLog.length - 1]; }
}
/** a grand alliance: every surviving house is allied directly with every other, and has been for ALLY_WIN_AGE seasons */
function grandAlliance(S, extraA, extraB) {
  const alive = alivePlayers(S); if (alive.length < 2) return false;
  for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
    const x = alive[i].id, y = alive[j].id;
    if (!(allied(S, x, y) || (extraA != null && ((x === extraA && y === extraB) || (x === extraB && y === extraA))))) return false;
  }
  return true;
}
/** League victory: a clique of directly allied houses that together hold 65% of the realm (each at least 15%) for ALLY_WIN_AGE seasons shares the win. */
function allyVictory(S) {
  const alive = alivePlayers(S), N = S.counties.length;
  let best = null;
  if (alive.length >= 2 && S.turn >= 20) {
    const ids = alive.map(p => p.id);
    for (let m = 3; m < (1 << ids.length); m++) {
      const mem = ids.filter((_, i) => (m >> i) & 1); if (mem.length < 2) continue;
      let ok = true; for (let i = 0; i < mem.length && ok; i++) for (let j = i + 1; j < mem.length; j++) if (!allied(S, mem[i], mem[j])) { ok = false; break; }
      if (!ok) continue;
      const cs = mem.map(x => cnt(S, x)), share = cs.reduce((a, b) => a + b, 0) / N;
      if (share >= 0.75 && cs.every(x => x / N >= 0.18) && (!best || share > best.share)) best = { mem, share };
    }
  }
  const key = best ? best.mem.join(',') : '';
  if (best && S.bloc.key === key) S.bloc.n++; else S.bloc = { key, n: best ? 1 : 0 };
  if (best && S.bloc.n >= ALLY_WIN_AGE) {
    const top = best.mem.slice().sort((a, b) => cnt(S, b) - cnt(S, a))[0];
    return { winner: top, winners: best.mem, reason: 'alliance' };
  }
  return null;
}
function pruneHeroes(S) { S.heroes = S.heroes.filter(h => h.heldBy != null || S.units.some(u => u.type === 'hero' && u.hid === h.id)); }
function* resolveTurn(S, ordersByPlayer) {
  try { yield* resolveTurnInner(S, ordersByPlayer); } finally { pruneHeroes(S); }
}
function* resolveTurnInner(S, ordersByPlayer) {
  bind(S);
  S.turnLog = [];
  refreshVis(S);
  const E = (text, kind, county, extra) => {
    extra = extra || {};
    const ev = { text, kind: kind || 'info', county: county == null ? null : county, season: S.season, year: S.year, turn: S.turn };
    const cs = extra.cs || (county == null ? [] : [county]); const who = (extra.who || []).filter(x => x != null && x >= 0);
    let vis;
    if (extra.vis === 'all' || (!who.length && !cs.length)) vis = 'all';
    else { vis = []; for (const p of S.players) if (who.includes(p.id) || (VIS && VIS[p.id] && p.alive && cs.some(c => VIS[p.id].has(c)))) vis.push(p.id); }
    ev.vis = vis;
    for (const k in extra) if (k !== 'cs' && k !== 'who' && k !== 'vis') ev[k] = extra[k];
    S.log.push(ev); S.turnLog.push(ev);
    if (S.log.length > 500) S.log.splice(0, S.log.length - 400);
    return ev;
  };
  const NP = S.players.length;
  const seat = shuffle(S, S.players.filter(p => p.alive).map(p => p.id));
  const orders = S.players.map(p => p.alive ? sanitizeOrders(S, p.id, ordersByPlayer[p.id] || [], MAX_ORDERS) : []);
  S.feints = S.feints.filter(f => f.until > S.turn);
  yield E(`${SEASONS[S.season]} of Year ${S.year}: the sealed orders are opened!`, 'phase');

  /* ---- events */
  yield* rollEvents(S, E, seat);
  refreshVis(S);

  /* ---- decrees */
  const stormers = {};
  for (const c of S.counties) c.sally = false;
  yield* diplomacyPhase(S, E, seat, orders);
  refreshVis(S);
  for (const p of seat) for (const o of orders[p]) {
    const me = S.players[p];
    if (o.type === 'tax') { S.counties[o.county].tax = o.rate; yield E(`${me.short} sets taxes in ${cname(o.county)} to ${TAX[o.rate].name}.`, 'decree', null, { who: [p] }); }
    else if (o.type === 'build') {
      const c = S.counties[o.county], nl = CASTLE[c.castle + 1];
      if (me.gold >= buildCost(S, p, c.castle + 1) && c.owner === p && !c.build) {
        me.gold -= buildCost(S, p, c.castle + 1); c.build = { level: c.castle + 1, left: nl.time };
        yield E(`${me.short} begins building a ${nl.name} at ${cname(o.county)}.`, 'recruit', o.county, { who: [p], cs: [o.county] });
      }
    } else if (o.type === 'feint') {
      if (me.gold >= feintCost(S, p)) {
        me.gold -= feintCost(S, p);
        const power = Math.min(18, 4 + 0.5 * armyStrength(S, p));
        S.feints.push({ id: S.nextId++, owner: p, county: o.to, power, until: S.turn + 1 });
        yield E(`${me.short}'s spies spread rumours of an army massing near ${cname(o.to)}.`, 'info', null, { who: [p] });
      }
    } else if (o.type === 'spy') {
      if (me.gold >= spyCost(S, p)) {
        me.gold -= spyCost(S, p);
        me.scouted[o.target] = S.turn + 1;
        for (const k of [o.target].concat(MAP.adj[o.target])) me.spied[k] = S.turn + 2;
        yield E(`🕵️ ${me.short}'s spies slip into ${cname(o.target)}: its garrisons are laid bare, and no feint will fool them there.`, 'info', null, { who: [p] });
      }
    } else if (o.type === 'scout') {
      me.scouted[o.target] = S.turn + 1;
      yield E(`${me.short}'s scouts ride out toward ${cname(o.target)}.`, 'info', null, { who: [p] });
    } else if (o.type === 'sally') { S.counties[o.county].sally = true; }
    else if (o.type === 'storm') { (stormers[o.county] = stormers[o.county] || new Set()).add(p); }
  }
  refreshVis(S);

  /* ---- recruit & merge */
  const marching = new Set();
  for (let p = 0; p < NP; p++) for (const o of orders[p]) {
    if (o.type === 'march') for (const id of o.units) marching.add(id);
    if (o.type === 'scout') for (const u of S.units) if (u.owner === p && u.county === o.from && u.type === 'scout') { marching.add(u.id); break; }
  }
  for (const p of seat) {
    const me = S.players[p];
    for (const o of orders[p]) if (o.type === 'recruit') {
      const d = UNITS[o.unit], c = S.counties[o.county];
      if (c.owner !== p || me.gold < rcost(S, p, o.unit) || hostileAt(S, o.county, p)) { yield E(`${me.short}'s recruits at ${cname(o.county)} are turned away.`, 'warn', null, { who: [p] }); continue; }
      me.gold -= rcost(S, p, o.unit); c.pop = Math.max(5, c.pop - d.pop);
      S.units.push({ id: S.nextId++, type: o.unit, owner: p, county: o.county, banner: false, pressed: false });
      yield E(`${me.short} musters ${d.name} at ${cname(o.county)}.`, 'recruit', o.county, { who: [p], cs: [o.county] });
    }
    for (const o of orders[p]) if (o.type === 'merge') {
      const three = pickMerge(S, p, o.county, o.unit, marching);
      if (!three) { yield E(`${me.short}'s banner-raising at ${cname(o.county)} fails: not enough troops.`, 'warn', null, { who: [p] }); continue; }
      three[0].banner = true; removeUnits(S, [three[1], three[2]]);
      yield E(`${me.short} raises a Banner of ${UNITS[o.unit].plural} at ${cname(o.county)}!`, 'recruit', o.county, { who: [p], cs: [o.county] });
    }
  }
  refreshVis(S);

  /* ---- movement */
  for (const u of S.units) { u.moved = false; u.from = null; u.stance = null; u.storm = false; delete u._nst; }
  const groups = [];
  for (const p of seat) for (const o of orders[p]) if (o.type === 'march') {
    const units = o.units.map(id => unitById(S, id)).filter(Boolean);
    if (!units.length) continue;
    const swift = units.some(u => u.type === 'hero' && (heroOfUnit(S, u) || { traits: [] }).traits.includes('swift'));
    if (S.season === 3 && S.counties[o.to].owner !== p && !swift && rnd(S) < (S.mods.harsh ? 0.75 : 0.5)) {
      yield E(`❄ Snow blocks the road: ${S.players[p].short}'s army cannot leave ${cname(o.from)} for ${cname(o.to)}.`, 'warn', null, { who: [p], cs: [o.from] });
      continue;
    }
    groups.push({ owner: p, from: o.from, to: o.to, units, stance: o.stance, storm: !!o.storm, betray: !!o.betray, alive: true });
  }
  for (const g of groups) for (const u of g.units) { u.moved = true; u.from = g.from; u.stance = g.stance; u.storm = g.storm; }
  yield* betrayals(S, E, groups);
  for (let i = groups.length - 1; i >= 0; i--) if (!groups[i].alive) groups.splice(i, 1);
  if (groups.length) {
    const moves = groups.map(g => {
      const vis = []; for (const p of S.players) if (p.alive && (p.id === g.owner || (VIS[p.id] && (VIS[p.id].has(g.from) || VIS[p.id].has(g.to))))) vis.push(p.id);
      return { from: g.from, to: g.to, owner: g.owner, ids: g.units.map(u => u.id), n: g.units.length, pow: Math.round(sumStr(g.units)), vis };
    });
    yield E('The armies set out across the realm!', 'movement', null, { vis: 'all', moves });
  }
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const a = groups[i], b = groups[j];
    if (!a.alive || !b.alive || friendly(S, a.owner, b.owner)) continue;
    if (a.from === b.to && a.to === b.from) {
      yield E(`Armies meet on the road between ${cname(a.from)} and ${cname(a.to)}!`, 'move', null, { who: [a.owner, b.owner], cs: [a.from, a.to] });
      const sides = [
        { owner: a.owner, units: a.units.slice(), stance: a.stance, defending: false },
        { owner: b.owner, units: b.units.slice(), stance: b.stance, defending: false }
      ];
      const landing = {}; landing[a.owner] = a.to; landing[b.owner] = b.to;
      const r = yield* fightCounty(S, E, null, sides, { field: true, landing, label: `on the road ${cname(a.from)}–${cname(a.to)}`, hint: a.from });
      const win = r.winner.owner === a.owner ? a : b, lose = win === a ? b : a;
      lose.alive = false;
      win.units = win.units.filter(u => S.units.includes(u));
    }
  }
  for (const g of groups) {
    if (!g.alive) continue;
    g.units = g.units.filter(u => S.units.includes(u));
    if (!g.units.length) continue;
    for (const u of g.units) u.county = g.to;
    yield E(`${S.players[g.owner].short} marches ${describeUnits(g.units)} from ${cname(g.from)} to ${cname(g.to)}.`, 'move', g.to, { who: [g.owner], cs: [g.from, g.to], quick: true });
  }
  refreshVis(S);

  /* ---- clashes (incl. sieges) */
  const settled = new Set();
  for (let pass = 0; pass < 5; pass++) {
    let any = false;
    for (const cid of shuffle(S, Array.from({ length: MAP.n }, (_, i) => i))) {
      if (settled.has(cid)) continue;
      const here = unitsAt(S, cid);
      const owners = [...new Set(here.map(u => u.owner))];
      if (owners.length < 2) continue;
      const c = S.counties[cid];
      // houses bound by a pact fight side by side: group them into coalitions
      const comps = [];
      for (const o of owners.slice().sort((x, y) => (y === c.owner) - (x === c.owner) || x - y)) { const cp = comps.find(g => g.every(x => friendly(S, x, o))); if (cp) cp.push(o); else comps.push([o]); }
      if (comps.length < 2) continue;
      const mk = cp => {
        const us = here.filter(u => cp.includes(u.owner));
        const prim = cp.includes(c.owner) ? c.owner : cp.slice().sort((x, y) => us.filter(u => u.owner === y).length - us.filter(u => u.owner === x).length)[0];
        return { owner: prim, units: us, stance: dominantStance(S, us, cid), defending: us.some(u => !u.moved && !u.rebel && !u.raider), mult: 1, members: cp };
      };
      const sides = comps.map(mk);
      const castleCase = c.castle > 0 && c.owner >= 0 && sides.some(s => s.owner === c.owner) && sides.some(s => s.owner >= 0 && s.owner !== c.owner);   // coalition sides never contain the owner's foes
      if (!castleCase) { any = true; yield* fightCounty(S, E, cid, sides, { field: false, label: `at ${cname(cid)}`, hint: cid }); continue; }
      const gs = sides.find(s => s.owner === c.owner);
      const neutral = sides.filter(s => s.owner < 0);
      if (neutral.length) { any = true; yield* fightCounty(S, E, cid, [gs].concat(neutral), { field: false, label: `at ${cname(cid)}`, hint: cid }); continue; }
      const att = sides.filter(s => s.owner >= 0 && s.owner !== c.owner);
      if (att.length > 1) { any = true; yield* fightCounty(S, E, cid, att, { field: false, label: `outside ${cname(cid)}`, hint: cid }); continue; }
      const a = att[0];
      const relief = gs.units.some(u => u.moved);
      const storm = a.units.some(u => u.storm) || (stormers[cid] && stormers[cid].has(a.owner));
      if (relief || c.sally) {
        any = true;
        gs.defending = false; a.defending = false; gs.mult = relief ? 1 : 1.3;
        const rr = yield* fightCounty(S, E, cid, [gs, a], { field: false, noCastle: true, label: relief ? `relieving ${cname(cid)}` : `at ${cname(cid)} (the garrison sallies out)`, hint: cid });
        S.cnt.sally++;
        if (rr.winner === gs && c.owner >= 0) {
          S.cnt.sallyWin++;
          const eng = S.units.filter(u => u.county === cid && u.type === 'engine' && u.owner !== c.owner && !friendly(S, u.owner, c.owner));
          if (eng.length) removeUnits(S, eng);
          if (c.siege) { S.cnt.siegeBroken++; c.siege = null; c.stores = Math.min(CASTLE[c.castle].cap, c.stores + 8); yield E(`🔔 The sortie from ${cname(cid)} breaks the siege${eng.length ? ' and burns the siege engines' : ''}, and carts of grain roll in.`, 'capture', cid, { who: [c.owner], cs: [cid] }); }
        }
      } else if (storm) {
        any = true;
        gs.defending = true; a.mult = stormPenalty(S, cid, a);
        S.cnt.stormed++;
        yield* fightCounty(S, E, cid, [gs, a], { field: false, storm: true, label: `storming the ${CASTLE[c.castle].name} of ${cname(cid)}`, hint: cid });
      } else {
        settled.add(cid);
        if (!c.siege || c.siege.by !== a.owner) {
          c.siege = { by: a.owner, since: S.turn }; S.cnt.sieges++;
          yield E(`🏰 ${S.players[a.owner].short} lays siege to ${cname(cid)}! The garrison of ${S.players[c.owner].short} is shut inside (stores ${Math.round(c.stores)}).`, 'alarm', cid, { who: [a.owner, c.owner], cs: [cid] });
        }
      }
    }
    if (!any) break;
  }
  // raiders: raid or disperse
  for (const c of S.counties) {
    const rs = S.units.filter(u => u.county === c.id && u.raider);
    if (!rs.length) continue;
    if (c.owner >= 0 && !S.units.some(u => u.county === c.id && (u.owner === c.owner || friendly(S, u.owner, c.owner)))) {
      const me = S.players[c.owner]; const g = Math.min(me.gold, 20), gr = Math.min(Math.round(me.grain), 12);
      me.gold -= g; me.grain -= gr; c.happiness = Math.max(0, c.happiness - 4);
      yield E(`🗡️ Bandits plunder ${cname(c.id)}: −${g} gold, −${gr} grain.`, 'warn', c.id, { who: [c.owner], cs: [c.id] });
    }
    removeUnits(S, rs);
  }
  for (const u of S.units) { u.moved = false; u.from = null; u.stance = null; u.storm = false; delete u._nst; }
  refreshVis(S);

  /* ---- siege attrition */
  for (const c of S.counties) {
    if (!c.siege) continue;
    const inside = S.units.filter(u => u.county === c.id && (u.owner === c.owner || (c.owner >= 0 && friendly(S, u.owner, c.owner))));
    const besiegers = S.units.filter(u => u.county === c.id && u.owner >= 0 && u.owner !== c.owner && !friendly(S, u.owner, c.owner));
    if (c.owner < 0 || !inside.length || !besiegers.length) { c.siege = null; continue; }
    c.siege.by = besiegers[0].owner;
    const need = inside.reduce((t, u) => t + ufood(u), 0) * winterMult(S) * (1.6 + (besiegers.some(u => u.type === 'engine') ? 0.7 : 0));
    c.stores -= need; c.happiness = Math.max(0, c.happiness - 4);
    if (c.stores < 0) {
      c.stores = 0;
      S.cnt.starved++;
      yield E(`🍞 The besieged garrison of ${cname(c.id)} has eaten its last stores and surrenders!`, 'capture', c.id, { who: [c.owner, c.siege.by], cs: [c.id] });
      const by = c.siege.by, owner = c.owner;
      removeUnits(S, inside);
      c.siege = null;
      yield* processCaptives(S, E, by, owner, inside, c.id, c.id, 'surrender');
    } else {
      yield E(`Siege of ${cname(c.id)}: the garrison's stores fall to ${Math.round(c.stores)}.`, 'info', c.id, { who: [c.owner, c.siege.by], cs: [c.id], quick: true });
    }
  }

  /* ---- ownership changes */
  for (const c of S.counties) {
    const present = [...new Set(unitsAt(S, c.id).map(u => u.owner))];
    const coalition = present.length >= 1 && present.every(o => o >= 0 && (o === present[0] || friendly(S, present[0], o)));
    if (coalition && present[0] >= 0 && !present.includes(c.owner) && !(c.owner >= 0 && present.some(o => friendly(S, o, c.owner))) && c.cap == null) {
      const p = present.slice().sort((x, y) => unitsAt(S, c.id, y).length - unitsAt(S, c.id, x).length)[0], prev = c.owner;
      c.owner = p; c.siege = null; c.build = null; c.stores = 0; c.lowTurns = 0;
      if (prev >= 0) { c.happiness = Math.min(c.happiness, 30) - 10; c.resent = 4; } else { c.happiness = 42; c.resent = 2; }
      c.happiness = Math.max(5, c.happiness); c.tax = 'normal';
      if (c.castle > 0 && prev >= 0) c.castle--;
      yield E(`${cname(c.id)} falls to ${S.players[p].short}${prev >= 0 ? ' (taken from ' + S.players[prev].short + ')' : ''}. The people are uneasy.`, 'capture', c.id, { who: [p, prev], cs: [c.id] });
    } else if (present.length === 1 && present[0] < 0 && c.owner >= 0 && c.cap == null && S.units.some(u => u.county === c.id && u.rebel)) {
      const prev = c.owner; c.owner = -1; c.siege = null; c.build = null; c.lowTurns = 0;
      for (const u of S.units) if (u.county === c.id) u.rebel = false;
      yield E(`🔥 ${cname(c.id)} throws off ${S.players[prev].short}'s rule: the rebels hold the county!`, 'alarm', c.id, { who: [prev], cs: [c.id] });
    }
    if (c.siege && !S.units.some(u => u.county === c.id && u.owner >= 0 && u.owner !== c.owner && !friendly(S, u.owner, c.owner))) c.siege = null;
  }
  refreshVis(S);

  /* ---- banner occupation */
  const captures = [];
  for (const q of seat) {
    const capId = S.players[q].capital, cc = S.counties[capId];
    const mine = unitsAt(S, capId).filter(u => u.owner === q || friendly(S, u.owner, q)).length;
    const theirs = unitsAt(S, capId).filter(u => u.owner >= 0 && u.owner !== q && !friendly(S, u.owner, q));
    const inf = theirs.filter(u => UNITS[u.type].infantry);
    if (!mine && inf.length) {
      const r = inf[0].owner;
      if (cc.occ && cc.occ.by === r) cc.occ.count++; else cc.occ = { by: r, count: 1 };
      if (cc.occ.count >= 2) captures.push({ victim: q, captor: r });
      else yield E(`🚩 ${S.players[r].short}'s infantry occupy ${cname(capId)}! If they hold it through next season, the Royal Banner of ${S.players[q].short} is lost.`, 'alarm', capId, { who: [r, q], cs: [capId] });
    } else {
      if (!mine && theirs.length) yield E(`${S.players[theirs[0].owner].short}'s cavalry ride through ${cname(capId)}, but only infantry can seize a banner.`, 'info', capId, { who: [q], cs: [capId] });
      cc.occ = null;
    }
  }
  if (captures.length) {
    const victims = new Set(captures.map(c => c.victim));
    const aliveN = alivePlayers(S).length;
    if (victims.size >= aliveN) {
      for (const c of captures) yield E(`${S.players[c.captor].short} seizes the Royal Banner of ${S.players[c.victim].short}!`, 'win', S.players[c.victim].capital, { vis: 'all' });
      yield E('Every Royal Banner falls in the same season. The realm collapses into chaos: a draw.', 'win', null, { vis: 'all' });
      S.over = { winner: null, reason: 'banner' };
      return;
    }
    for (const c of captures) {
      const q = c.victim;
      yield E(`${S.players[c.captor].short}'s infantry have held ${cname(S.players[q].capital)} for a full season. The Royal Banner of ${S.players[q].short} is captured and ${S.players[q].name} is no more!`, 'win', S.players[q].capital, { vis: 'all' });
      eliminate(S, E, q, c.captor, victims.has(c.captor));
    }
    refreshVis(S);
    const left = alivePlayers(S);
    if (left.length === 1) { S.over = { winner: left[0].id, reason: 'banner' }; return; }
    if (!left.some(p => p.human)) {
      const best = left.slice().sort((a, b) => countiesOf(S, b.id).length - countiesOf(S, a.id).length)[0];
      S.over = { winner: best.id, reason: 'banner' };
      return;
    }
  }

  yield* diplomacyUpkeep(S, E);

  /* ---- seasonal economy */
  for (const p of seat) {
    const me = S.players[p];
    if (!me.alive) continue;
    const harvest = harvestFor(S, p);
    const income = incomeFor(S, p);
    const need = foodNeedFor(S, p);
    const wages = wagesFor(S, p);
    let repay = 0; if (me.loan) { repay = me.loan.pay; me.loan.left--; if (me.loan.left <= 0) me.loan = null; }
    me.grain += harvest - need + (freeHeroWith(S, p, 'quartermaster') ? 8 : 0); me.gold += income - wages - repay;
    let starving = false;
    if (me.gold < 0) {
      me.gold = 0;
      const mine = S.units.filter(u => u.owner === p && u.type !== 'hero').sort((a, b) => ustr(a) - ustr(b));
      const lose = mine.slice(0, Math.max(1, Math.floor(mine.length * 0.15)));
      removeUnits(S, lose);
      yield E(`💰 ${me.short} cannot pay the wages! ${lose.length} unpaid unit(s) desert.`, 'warn', null, { who: [p] });
    }
    if (me.grain < 0) {
      me.grain = 0; starving = true;
      const mine = S.units.filter(u => u.owner === p && u.type !== 'hero').sort((a, b) => ustr(a) - ustr(b));
      const lose = mine.slice(0, Math.max(1, Math.floor(mine.length * 0.2)));
      removeUnits(S, lose);
      yield E(`🌾 ${me.short}'s granaries are empty! Famine: ${lose.length} unit(s) desert.`, 'warn', null, { who: [p] });
    }
    for (const c of S.counties) if (c.owner === p) {
      let d = TAX[c.tax].happy + Math.round((55 - c.happiness) * 0.1) + repMood(S, p) - strainMood(S, p) - weariness(S, p) - (S.claim.holder === p ? 1 : 0);
      if (c.resent > 0) { d -= 3; c.resent--; }
      if (starving) { d -= 10; c.pop = Math.max(10, Math.round(c.pop * 0.96)); }
      if (S.units.some(u => u.county === c.id && u.owner === p && u.type === 'hero' && (heroOfUnit(S, u) || { traits: [] }).traits.includes('beloved'))) d += 2;
      c.happiness = Math.max(0, Math.min(100, c.happiness + d));
      if (!starving && c.happiness >= 30 && c.pop < c.maxPop && !c.siege) c.pop = Math.min(c.maxPop, Math.round(c.pop * 1.02) + 1);
      const un = c.happiness < 20;
      if (un && !c.unrest) yield E(`😠 ${cname(c.id)} is in unrest and stops paying taxes!`, 'warn', c.id, { who: [p], cs: [c.id] });
      else if (!un && c.unrest) yield E(`🙂 ${cname(c.id)} has calmed and pays taxes again.`, 'info', c.id, { who: [p], cs: [c.id] });
      c.unrest = un;
      // construction & stores
      if (c.build) { c.build.left--; if (c.build.left <= 0) { c.castle = c.build.level; c.build = null; c.stores = Math.min(CASTLE[c.castle].cap, c.stores + 10); yield E(`🏗️ The ${CASTLE[c.castle].name} of ${cname(c.id)} is complete!`, 'recruit', c.id, { who: [p], cs: [c.id] }); } }
      if (c.castle > 0 && !c.siege) c.stores = Math.min(CASTLE[c.castle].cap, c.stores + Math.ceil(CASTLE[c.castle].cap * 0.3));
      // rebellion
      if (c.happiness < 15) c.lowTurns++; else c.lowTurns = 0;
      if (c.lowTurns >= 2 && (rnd(S) < 0.6 || c.happiness <= 3)) {
        const k = Math.max(2, Math.round(c.pop / 35));
        for (let i = 0; i < k; i++) S.units.push({ id: S.nextId++, type: i % 3 === 2 ? 'archers' : 'levy', owner: -1, county: c.id, banner: false, pressed: false, rebel: true });
        c.happiness = Math.min(100, c.happiness + 12); c.lowTurns = 0;
        yield E(`🔥 Rebellion! ${k} rebels rise in ${cname(c.id)} against ${S.players[p].short}.`, 'alarm', c.id, { who: [p], cs: [c.id], card: { icon: '🔥', title: 'Rebellion in ' + cname(c.id), key: 'rebellion', text: `The people of ${cname(c.id)} have had enough: ${k} rebels take up arms against ${S.players[p].short}. Crush them, or lose the county.` } });
      }
    }
    if (!me.loan && S.turn >= 8 && me.gold < 70 && trailing(S, p) && S.turn - me.lastLoan >= 10) { me.gold += 45; me.loan = { left: 5, pay: 10 }; me.lastLoan = S.turn; yield E(`🏦 Lombard bankers lend ${me.short} 45 gold against future taxes (10 a season for 5 seasons).`, 'info', null, { who: [p] }); }
    yield E(`${me.short}'s treasury: +${income} taxes, −${wages} wages${repay ? ', −' + repay + ' loan' : ''}${harvest ? ', harvest +' + harvest + ' grain' : ''}, food −${need}. Stores: ${me.gold}g, ${Math.round(me.grain)} grain.`, 'econ', null, { who: [p] });
  }
  // neutral/unowned castles refill nothing; clear season mods
  S.mods.harsh = false; S.mods.harvest = {};
  for (const p of S.players) { for (const k of Object.keys(p.scouted)) if (p.scouted[k] < S.turn + 1) delete p.scouted[k]; }

  /* ---- next season */
  S.turn++;
  S.season = (S.season + 1) % 4;
  if (S.season === 0) S.year++;
  updateMemory(S);
  if (!S.over && !(S.scn && !['win', 'league'].includes(S.scn.goal.kind))) { const av = allyVictory(S); if (av) { S.over = av; yield E(`⚜️ The League of ${av.winners.map(i => S.players[i].short).join(' & ')} rules the realm: they share the victory!`, 'win', null, { vis: 'all' }); } }
  if (S.scn) yield* scenarioCheck(S, E); else yield* updateClaim(S, E);
  if (S.turn >= (S.scn && S.scn.goal.kind === 'win' ? S.scn.limit : limitFor(S)) && !S.over && (!S.scn || S.scn.goal.kind === 'win')) {
    const ranked = alivePlayers(S).sort((a, b) => (countiesOf(S, b.id).length - countiesOf(S, a.id).length) || (armyStrength(S, b.id) - armyStrength(S, a.id)));
    S.over = { winner: ranked[0].id, reason: 'crown' };
    yield E(`The long war ends. ${ranked[0].name} holds the most land and is crowned.`, 'win', null, { vis: 'all' });
  }
}

/** Drive a whole turn synchronously. chooser(S, info) answers human choices. */
function runTurn(S, ordersByPlayer, chooser) {
  const g = resolveTurn(S, ordersByPlayer);
  let r = g.next();
  while (!r.done) {
    let ans;
    if (r.value && r.value.kind === 'choice') ans = chooser ? chooser(S, r.value) : autoChoice(S, r.value);
    r = g.next(ans);
  }
  return S.turnLog;
}

/* ------------------------------------------------------------------ AI (fog-respecting) */
function aiOrders(S, pid) {
  const CS = shuffle(S, S.counties);   // county iteration order is randomised so ids never decide ties
  bind(S);
  const me = S.players[pid];
  if (!me.alive || !me.ai) return [];
  const prof = PERSONALITIES[me.ai.personality] || PERSONALITIES.warlord;
  const lv = DIFFICULTY[me.ai.level] || DIFFICULTY.normal;
  const view = viewUnits(S, pid);
  const vis = visSet(S, pid);
  const cap = me.capital, winter = S.season === 3;
  const rivalsAll = S.players.filter(p => p.alive && p.id !== pid);
  const bt = S.dip ? aiBetrayals(S, pid, view, me, rnd) : { betray: [], denounce: [] };
  const betrayal = new Set(bt.betray), LD = leaderOf(S), pow0 = {};   // houses whose pact we plan to break this season
  const rivals = rivalsAll.filter(p => !friendly(S, pid, p.id) || betrayal.has(p.id));
  const mineAll = view.filter(u => u.owner === pid);
  const mine = c => mineAll.filter(u => u.county === c);
  const othersAt = c => view.filter(u => u.owner !== pid && u.county === c);
  const isThreat = u => u.owner !== pid && !friendly(S, u.owner, pid) && (u.owner >= 0 || u.rebel || u.raider);
  const strRival = c => sumStr(view.filter(u => u.county === c && u.owner >= 0 && u.owner !== pid && !friendly(S, u.owner, pid)));
  const threat = c => { let t = sumStr(view.filter(u => u.county === c && isThreat(u))); for (const n of MAP.adj[c]) t += 0.9 * strRival(n); return t; };
  const jitter = () => 1 - lv.jitter / 2 + rnd(S) * lv.jitter;
  const defRaw = t => {
    if (vis.has(t)) return sumStr(othersAt(t)) * (1 + terrainDef(t)) * 1.15;
    const m = me.mem[t]; if (m) return m.pow * (1 + terrainDef(t)) * 1.2;
    return (S.counties[t].owner < 0 ? 6 : 9) * (1 + terrainDef(t));
  };
  const defEstimate = t => defRaw(t) * (1 + CASTLE[S.counties[t].castle].def * (vis.has(t) ? 1 : 0.5) / (1 + terrainDef(t)));
  const castleInside = t => { const c = S.counties[t]; return c.castle > 0 && c.owner >= 0 && c.owner !== pid && othersAt(t).some(u => u.owner === c.owner) ? c.castle : 0; };
  const pickStance = () => { if (me.lastEnemyStance && rnd(S) < 0.3 * lv.smart) return counterOfStance(me.lastEnemyStance); return pickWeighted(S, STANCES, [1.1, 1, 1]); };
  const cands = [];
  const idle = me.idle || 0;
  const bold = Math.min(1.6, (idle / 4) * prof.boldRate);
  const early = S.turn < prof.restraint;

  // reserves (units that stay home)
  const reserved = new Set();
  const reserveAt = (c, want) => {
    const us = mine(c).filter(u => u.type !== 'scout' && u.type !== 'engine').sort((a, b) => ustr(b) - ustr(a));
    let got = 0; for (const u of us) { if (got >= want) break; reserved.add(u.id); got += ustr(u); }
  };
  const capThreat = threat(cap);
  reserveAt(cap, Math.max(4, prof.reserve * 1.4 * capThreat));
  for (const c of CS) if (c.owner === pid && c.id !== cap) {
    const t = threat(c.id);
    if (t > 0) reserveAt(c.id, t * (1.1 - 0.5 * bold));
  }
  // camped besiegers stay put
  for (const c of CS) if (c.siege && c.siege.by === pid) for (const u of mine(c.id)) reserved.add(u.id);
  const free = c => mine(c).filter(u => !reserved.has(u.id) && u.type !== 'scout' && u.type !== 'engine');
  const engines = c => mine(c).filter(u => u.type === 'engine');

  // sally decisions for besieged counties
  for (const c of CS) if (c.owner === pid) {
    const besg = view.filter(u => u.county === c.id && u.owner >= 0 && u.owner !== pid);
    if (c.castle > 0 && besg.length && mine(c.id).length && (sumStr(mine(c.id)) * 1.1) / (sumStr(besg) || 1) >= (1.0 - 0.25 * bold) && rnd(S) < 0.5 + 0.5 * lv.smart) cands.push({ score: 80, order: { type: 'sally', county: c.id } });
  }

  // 1. capital defence
  const capStr = sumStr(mine(cap));
  if (capStr < prof.reserve * 1.4 * capThreat) {
    for (const n of MAP.adj[cap]) {
      const us = mine(n).filter(u => u.type !== 'scout' && u.type !== 'engine');
      if (!us.length || S.counties[n].owner !== pid) continue;
      const nt = threat(n);
      const give = us.filter(u => !reserved.has(u.id) || nt < capThreat * 0.5);
      if (give.length) cands.push({ score: 150 + rnd(S), order: { type: 'march', from: n, to: cap, units: give.map(u => u.id), stance: 'hold' } });
    }
    cands.push({ score: 140, order: { type: 'recruit', unit: 'maa', county: cap } });
    cands.push({ score: 139, order: { type: 'recruit', unit: 'archers', county: cap } });
  }

  // 1b. storm decisions for camped stacks
  for (const c of CS) if (c.siege && c.siege.by === pid && lv.storm) {
    const grp = mine(c.id).filter(u => u.type !== 'scout');
    const inside = othersAt(c.id).filter(u => u.owner === c.owner);
    if (!grp.length || !inside.length) continue;
    const M = stormPenalty(S, c.id, { units: grp });
    const dpow = sumStr(inside) * (1 + terrainDef(c.id) + CASTLE[c.castle].def) * 1.15;
    const ratio = sumStr(grp) * M / (dpow || 1);
    if (ratio >= prof.stormRatio + lv.ratioAdd * 0.5 - 0.3 * bold - 0.12 || c.stores <= 8) if (ratio > 0.9) cands.push({ score: 95 + ratio, order: { type: 'storm', county: c.id } });
  }

  // 2. attacks / grabs
  const weakRival = rivals.slice().sort((a, b) => (me.mem[a.capital] ? me.mem[a.capital].pow : 6) - (me.mem[b.capital] ? me.mem[b.capital].pow : 6))[0];
  for (const c of CS) {
    const sendable = free(c.id).sort((x, y) => ustr(y) - ustr(x));
    if (!sendable.length) continue;
    for (const t of MAP.adj[c.id]) {
      const tc = S.counties[t];
      if (tc.owner === pid && !hostileAt2(view, t, pid)) continue;
      if (tc.owner >= 0 && tc.owner !== pid && friendly(S, tc.owner, pid) && !betrayal.has(tc.owner)) continue;
      if (view.some(u => u.county === t && u.owner >= 0 && u.owner !== pid && friendly(S, u.owner, pid) && !betrayal.has(u.owner))) continue;
      const L = castleInside(t);
      const isRivalCap = tc.cap != null && tc.cap !== pid;
      const rivalTarget = tc.owner >= 0 && tc.owner !== pid;
      const defStr = defEstimate(t);
      let ratioNeed = (rivalTarget ? prof.ratioFoe : prof.ratioNeutral) + lv.ratioAdd - 0.3 * bold * (rivalTarget ? 1 : 0.6);
      if (early && rivalTarget) ratioNeed += 1.2;
      let tmult = 1;
      if (rivalTarget && LD != null && tc.owner === LD && LD !== pid) { tmult *= TUNE.ldAtk; ratioNeed -= TUNE.ldNeed; }
      if (rivalTarget && me.venge && me.venge.until > S.turn && tc.owner === me.venge.who) { tmult *= 1.4; ratioNeed -= me.ai.personality === 'builder' ? 0.55 : 0.3; early && (ratioNeed -= 0); }
      if (rivalTarget && me.vow && me.vow.until > S.turn && tc.owner === me.vow.who) { tmult *= 1.5; ratioNeed -= 0.25; }
      if (rivalTarget && me.ai.personality === 'warlord') { if (pow0[tc.owner] == null) pow0[tc.owner] = aiPow(S, view, me, tc.owner); tmult *= 1 + 0.35 * Math.max(0, 1 - pow0[tc.owner] / (sumStr(mineAll) + 4)); }
      let group = [], storm = false;
      const def0 = vis.has(t) ? othersAt(t).length === 0 : false;
      if (def0) {
        const infantry = sendable.filter(u => UNITS[u.type].infantry).sort((x, y) => ustr(x) - ustr(y));
        const pool = isRivalCap ? infantry : sendable.slice().sort((x, y) => ustr(x) - ustr(y));
        if (pool.length) group = [pool[0]];
      } else if (L > 0) {
        const grp = sendable.concat(engines(c.id));
        const M = stormPenalty(S, t, { units: grp });
        const raw = sumStr(grp);
        if (lv.storm && raw * M >= defStr * ratioNeed * 1.05 && raw * M > 0) { group = grp; storm = true; }
        else if (raw >= defRaw(t) * 0.8 && me.grain > 60 && (rivalTarget ? !early : true)) { group = grp.filter(u => u.type !== 'engine' || engines(c.id).length); }
      } else {
        let got = 0;
        for (const u of sendable) { group.push(u); got += ustr(u); if (got >= defStr * ratioNeed * 1.15) break; }
        if (sumStr(group) < defStr * ratioNeed) group = [];
      }
      if (!group.length) continue;
      if (isRivalCap && !group.some(u => UNITS[u.type].infantry)) continue;
      if (!group.some(u => u.type !== 'engine')) continue;
      const margin = def0 ? 2 : Math.max(0.5, sumStr(group) / (defStr || 1));
      let value = isRivalCap ? 220 : rivalTarget ? (45 + tc.pop / 5) * prof.rivalValue : (28 + tc.pop / 5) * prof.neutralValue;
      if (me.ai.personality === 'schemer' && weakRival && tc.owner === weakRival.id) value *= 1.4;
      value *= (1 + Math.min(2, margin - 1) * 0.3) * jitter() * tmult;
      if (winter) value *= 0.6;
      if (L > 0 && !storm) value *= 0.55;
      const bt = betrayal.has(tc.owner);
      if (bt) value *= 1.5;
      cands.push({ score: value, order: Object.assign({ type: 'march', from: c.id, to: t, units: group.map(u => u.id), stance: pickStance(), storm }, bt ? { betray: true } : {}) });
    }
  }

  // 3. advance toward a rival capital
  const myTotal = sumStr(mineAll), rivalTotal = sumStr(view.filter(u => u.owner >= 0 && u.owner !== pid)) / Math.max(1, rivals.length);
  const targetCap = rivals.length ? rivals.slice().sort((a, b) => MAP.dist[cap][a.capital] - MAP.dist[cap][b.capital] || a.id - b.id)[0].capital : null;
  if (targetCap != null && prof.rivalValue >= 0.9 && !early && myTotal >= rivalTotal * 0.9 && !winter) {
    for (const c of CS) {
      const sendable = free(c.id);
      if (sendable.length < 2 || c.id === cap) continue;
      let best = null;
      for (const n of MAP.adj[c.id]) if (MAP.dist[n][targetCap] < MAP.dist[c.id][targetCap] && S.counties[n].owner === pid) best = n;
      if (best == null) continue;
      cands.push({ score: 30 * jitter(), order: { type: 'march', from: c.id, to: best, units: sendable.map(u => u.id), stance: 'hold' } });
    }
  }
  // 3b. rally toward the nearest worthwhile target
  if (!winter) {
    for (const c of CS) {
      if (c.owner !== pid) continue;
      const sendable = free(c.id);
      if (!sendable.length) continue;
      const sstr = sumStr(sendable);
      let bestT = null, bestV = 0;
      for (const t of CS) {
        if (t.owner === pid || (t.owner >= 0 && friendly(S, pid, t.owner) && !betrayal.has(t.owner))) continue;
        const d = MAP.dist[c.id][t.id];
        if (d < 2 || d > 4) continue;
        if (t.owner >= 0 && early) continue;
        if (sstr < defEstimate(t.id) * 1.3) continue;
        const v = (t.owner >= 0 ? 40 * prof.rivalValue : 25 * prof.neutralValue) / d;
        if (v > bestV) { bestV = v; bestT = t; }
      }
      if (!bestT) continue;
      const hop = MAP.adj[c.id].find(n => MAP.dist[n][bestT.id] === MAP.dist[c.id][bestT.id] - 1 && S.counties[n].owner === pid);
      if (hop == null) continue;
      cands.push({ score: 33 * jitter(), order: { type: 'march', from: c.id, to: hop, units: sendable.map(u => u.id), stance: 'hold' } });
    }
  }

  // 4. merges
  for (const c of CS) if (c.owner === pid) for (const t of MERGE_TYPES) {
    const n = mine(c.id).filter(u => u.type === t && !u.banner && !u.pressed).length;
    if (n >= 3) cands.push({ score: 75 + UNITS[t].str * 2, order: { type: 'merge', county: c.id, unit: t } });
  }

  // 5. recruits
  const bal = yearlyBalance(S, pid);
  const netGold = incomeFor(S, pid) - wagesFor(S, pid);
  const canFeed = unit => (me.grain > 180 || bal - UNITS[unit].food * 5 >= -25) && netGold - UNITS[unit].wage >= 3;
  const foeUnits = view.filter(u => u.owner >= 0 && u.owner !== pid && !u.fake);
  const fshare = t => sumStr(foeUnits.filter(u => u.type === t)) / (sumStr(foeUnits) || 1);
  const capUnits = mine(cap).filter(u => !u.banner && !u.pressed);
  const cnt = t => capUnits.filter(u => u.type === t).length;
  let want;
  const partial = ['maa', 'archers', 'knights', 'levy'].find(t => cnt(t) % 3 !== 0 && cnt(t) > 0 && (t !== 'levy' || rnd(S) < 0.3));
  if (partial && me.gold >= UNITS[partial].cost) want = partial;
  else if (fshare('knights') > 0.3) want = 'archers';
  else if (fshare('archers') > 0.35) want = 'maa';
  else if (me.gold >= 70 && rnd(S) < (me.ai.personality === 'warlord' ? 0.6 : me.ai.personality === 'builder' ? 0.1 : 0.4)) want = 'knights';
  else if (me.ai.personality === 'builder') want = pickWeighted(S, ['archers', 'maa', 'levy'], [2.5, 1.5, 0.6]);
  else if (me.ai.personality === 'warlord') want = pickWeighted(S, ['archers', 'maa', 'levy'], [1.5, 2.5, 0.3]);
  else want = pickWeighted(S, ['archers', 'maa', 'levy'], [2, 2, 0.6]);
  let where = cap;
  if (!UNITS[want].capitalOnly) {
    let bt = capThreat;
    for (const c of CS) if (c.owner === pid && threat(c.id) > bt * 1.5 && c.pop > 40) { bt = threat(c.id); where = c.id; }
  }
  if (canFeed(want)) {
    cands.push({ score: 62 + rnd(S) * 3, order: { type: 'recruit', unit: want, county: where } });
    cands.push({ score: 58, order: { type: 'recruit', unit: want, county: where } });
    cands.push({ score: 50, order: { type: 'recruit', unit: 'archers', county: cap } });
  }
  // scouts, engines, builds, feints
  const nScouts = mineAll.filter(u => u.type === 'scout').length;
  if (nScouts < 1 && S.turn >= 1 && rnd(S) < prof.scout * lv.smart && canFeed('scout')) cands.push({ score: 47, order: { type: 'recruit', unit: 'scout', county: cap } });
  for (const u of mineAll.filter(x => x.type === 'scout')) {
    let best = null, bd = 9;
    for (const t of CS) {
      const d = MAP.dist[u.county][t.id];
      if (d < 2 || d > 3 || vis.has(t.id)) continue;
      const mdist = Math.min(...rivals.map(r => MAP.dist[t.id][r.capital]), 9);
      if (mdist < bd) { bd = mdist; best = t.id; }
    }
    if (best != null) cands.push({ score: 52, order: { type: 'scout', from: u.county, target: best } });
  }
  if (S.turn >= 4 && me.gold >= spyCost(S, pid) + 25 && rnd(S) < (me.ai.personality === 'schemer' ? 0.5 : 0.12) * lv.smart) {
    let bs = null, bdd = 9;
    for (const t of CS) { if (vis.has(t.id) || !S.counties.some(c => c.owner === pid && MAP.dist[c.id][t.id] <= 3)) continue; const md = Math.min(...rivals.map(r => MAP.dist[t.id][r.capital]), 9); if (md < bdd) { bdd = md; bs = t.id; } }
    if (bs != null) cands.push({ score: 46, order: { type: 'spy', target: bs } });
  }
  const nEng = mineAll.filter(u => u.type === 'engine').length;
  const castleTargets = CS.filter(c => c.castle >= 2 && c.owner !== pid && MAP.dist[cap][c.id] <= 4 && (c.owner >= 0));
  if (lv.storm && castleTargets.length && nEng < 2 && !early && canFeed('engine') && (prof.rivalValue >= 1 || castleTargets.some(c => c.owner >= 0 && MAP.dist[cap][c.id] <= 2))) cands.push({ score: 66, order: { type: 'recruit', unit: 'engine', county: cap } });
  if (prof.build > 0 && rnd(S) < lv.smart) {
    const cc = S.counties[cap];
    if (cc.castle < 3 && !cc.build && me.gold >= CASTLE[cc.castle + 1].cost + 25 && (prof.buildCap || cc.castle < 2)) cands.push({ score: 68 * prof.build + 5, order: { type: 'build', county: cap } });
    for (const c of CS) if (c.owner === pid && c.id !== cap && c.castle < 2 && !c.build && me.gold >= CASTLE[c.castle + 1].cost + 25) {
      const border = MAP.adj[c.id].some(n => S.counties[n].owner >= 0 && S.counties[n].owner !== pid) || threat(c.id) > 0;
      if (border) cands.push({ score: 52 * prof.build, order: { type: 'build', county: c.id } });
    }
  }
  if (prof.feint * lv.smart > rnd(S) && me.gold >= FEINT_COST + 10 && myTotal > 8 && S.turn >= 3) {
    const opts = CS.filter(c => MAP.adj[c.id].some(n => S.counties[n].owner === pid || mine(n).length) && MAP.adj[c.id].some(n => S.counties[n].owner >= 0 && S.counties[n].owner !== pid) && c.owner !== pid);
    if (opts.length) cands.push({ score: 44, order: { type: 'feint', to: opts[Math.floor(rnd(S) * opts.length)].id } });
  }

  // 6. taxes
  let taxBest = null;
  for (const c of CS) if (c.owner === pid && c.happiness < 32 && c.tax !== 'low') { taxBest = { score: 90, order: { type: 'tax', county: c.id, rate: 'low' } }; break; }
  if (!taxBest) for (const c of CS) if (c.owner === pid && c.tax === 'high' && c.happiness < 45) { taxBest = { score: 70, order: { type: 'tax', county: c.id, rate: 'normal' } }; break; }
  if (!taxBest && me.ai.personality !== 'builder') for (const c of CS) if (c.owner === pid && c.happiness > 70 && c.tax !== 'high' && (me.gold < 60 || c.tax === 'low')) { taxBest = { score: 55, order: { type: 'tax', county: c.id, rate: c.tax === 'low' ? 'normal' : 'high' } }; break; }
  if (!taxBest && me.ai.personality === 'builder') for (const c of CS) if (c.owner === pid && c.happiness > 75 && c.tax === 'low') { taxBest = { score: 40, order: { type: 'tax', county: c.id, rate: 'normal' } }; break; }
  if (taxBest) cands.push(taxBest);

  cands.sort((x, y) => y.score - x.score);
  const out = []; const ctx = newCtx();
  for (const cd of cands) {
    if (mil(out).length >= lv.maxOrders) break;
    if (lv.mistake && rnd(S) < lv.mistake && cd.score < 100) continue;
    if (!checkOrder(S, pid, cd.order, ctx)) { commitOrder(S, pid, cd.order, ctx); out.push(cd.order); }
  }
  if (S.dip) for (const o of aiDiplo(S, pid, view, me, prof, lv, rnd, betrayal, bt.denounce)) { if (!checkOrder(S, pid, o, ctx)) { commitOrder(S, pid, o, ctx); out.push(o); } }
  me.idle = out.some(o => o.type === 'march' && S.counties[o.to].owner !== pid) ? 0 : idle + 1;
  for (const c of CS) if (S.units.some(u => u.owner === pid && u.county === c.id)) {
    me.garrison[c.id] = (me.lastEnemyStance && rnd(S) < 0.3 * lv.smart) ? counterOfStance(me.lastEnemyStance) : pickWeighted(S, STANCES, [1, 1.3, 1]);
  }
  return out;
}

/* ------------------------------------------------------------------ AI diplomacy (fog-compliant: sees only its own view and memory) */
function aiPow(S, view, me, r) {
  let p = sumStr(view.filter(u => u.owner === r && !u.fake));
  for (const c of S.counties) if (c.owner === r) { const m = me.mem[c.id]; if (m && m.owner === r && !view.some(u => u.county === c.id)) p += m.pow; }
  return p + 4;
}
function aiAdjacent(S, pid, r) { for (const c of S.counties) if (c.owner === pid) for (const n of MAP.adj[c.id]) if (S.counties[n].owner === r) return true; return false; }
function aiBetrayals(S, pid, view, me, rndf) {
  const pr = (PERSONALITIES[me.ai.personality] || PERSONALITIES.warlord).dip, out = [], den = [];
  const lv = DIFFICULTY[me.ai.level] || DIFFICULTY.normal;
  const mine = aiPow(S, view, me, pid), LD = leaderOf(S), pers = me.ai.personality;
  for (const k of S.dip.pacts) {
    if (!PROTECTIVE.includes(k.type) || (k.a !== pid && k.b !== pid)) continue;
    const o = k.a === pid ? k.b : k.a; if (!S.players[o].alive) continue;
    const theirs = aiPow(S, view, me, o);
    // the honourable exits: denounce an oathbreaker, or a rising leader we can still stop
    if (k.type !== 'alliance' && !(k.type === 'tribute' && k.terms.payer === pid)) {
      if (pers === 'builder' && S.players[o].rep < 30 && rndf(S) < 0.5) { den.push(k); continue; }
      if (LD === o && LD !== pid && pers !== 'builder' && theirs < mine * 1.5 && S.turn - k.since >= 2 && rndf(S) < 0.22 * (0.5 + lv.smart)) { den.push(k); continue; }
    }
    if (S.turn - k.since < 3 || !aiAdjacent(S, pid, o)) continue;
    if (k.type === 'tribute' && k.terms.payer === pid) continue;
    let p = pr.stab * (0.5 + lv.smart * 0.5);
    if (theirs > mine * 0.9) p *= theirs > mine * 1.2 ? 0 : 0.3;     // never stab someone stronger
    if (theirs < mine * 0.6) p *= 1.6;
    if (S.players[pid].rep < 30) p *= 0.5;
    if (k.type === 'alliance') p *= alivePlayers(S).length <= 2 ? 3 : 0.6;
    if (pers === 'builder') p = 0;
    if (rndf(S) < p) {
      if (pers === 'warlord' && k.type !== 'alliance' && rndf(S) < 0.6) { den.push(k); me.vow = { who: o, until: S.turn + 4 }; }   // a warlord defies you openly first
      else out.push(o);
    }
  }
  return { betray: out, denounce: den };
}
function aiAccepts(S, pid, prop, view, me, prof, lv, rndf) {
  const pr = prof.dip, from = prop.from, F = S.players[from];
  const trust = trustOf(S, pid, from), mine = aiPow(S, view, me, pid), theirs = aiPow(S, view, me, from), ratio = theirs / mine;
  const adj = aiAdjacent(S, pid, from), fear = adj && ratio > 1.15 ? Math.min(0.35, (ratio - 1.15) * 0.4) : 0;
  const repAdj = (F.rep - 60) / 160, trustAdj = (trust - 50) / 100;
  const pers = me.ai.personality, alive = alivePlayers(S).length;
  if (S.scn && S.scn.id === 'tutorial' && prop.kind === 'nap' && from === 0) return true;
  let sc = 0;
  switch (prop.kind) {
    case 'nap': sc = 0.3 + trustAdj + repAdj + fear + (pers === 'builder' ? 0.3 : pers === 'schemer' ? 0.15 : -0.1); break;
    case 'alliance': {
      sc = 0.1 + trustAdj + repAdj + fear * 0.6 + (pers === 'builder' ? 0.25 : pers === 'schemer' ? 0.1 : -0.15);
      if (trust < 52) sc -= 0.3;
      if (prop.terms && prop.terms.vs != null) { if (prop.terms.vs === leaderOf(S)) sc += TUNE.ldVs; else if (protectivePact(S, pid, prop.terms.vs)) sc -= 0.5; }
      break;
    }
    case 'peace': {
      const losing = ratio > 1.05;
      sc = (losing ? 0.75 : 0.25) + (pers === 'builder' ? 0.3 : pers === 'warlord' ? -0.15 : 0) + repAdj * 0.5;
      break;
    }
    case 'trade': sc = 0.55 + trustAdj * 0.5 + repAdj + (pers === 'builder' ? 0.25 : 0) - (atWar(S, pid, from) ? 1 : 0); if (me.gold < 25 && prop.terms.dir === 'sell') sc = 0.2; break;
    case 'tribute': {
      if (prop.terms.dir === 'offer') sc = 0.95;
      else { sc = ratio > 1.6 && adj ? 0.55 : ratio > 1.2 && adj ? 0.15 : 0.0; if (pers === 'warlord') sc *= 0.5; if (me.gold < prop.terms.amount * 4) sc *= 0.5; }
      break;
    }
    case 'ransom': {
      const h = S.heroes.find(x => x.id === prop.terms.hid); if (!h) return false;
      if (h.heldBy === pid) sc = pers === 'warlord' ? 0.55 : 0.8;       // we are the captor: sell
      else sc = me.gold >= prop.terms.price + 50 ? 0.7 + h.deeds * 0.05 : 0;
      break;
    }
  }
  { const LDx = leaderOf(S);
    if (from === LDx && pid !== LDx && (prop.kind === 'nap' || prop.kind === 'alliance' || prop.kind === 'trade') && fear < 0.1) sc -= 0.25;
    if (LDx != null && LDx !== pid && LDx !== from && (prop.kind === 'nap' || prop.kind === 'alliance')) sc += 0.12;
    if (F.style === 'schemer') sc += 0.08;
    if (S.heroes.some(h => h.owner === from && h.heldBy == null && h.traits.includes('diplomat'))) sc += 0.1; }
  if (F.rep < 40 && prop.kind !== 'ransom' && prop.kind !== 'peace') sc -= (pers === 'builder' ? 0.5 : 0.2);   // oathbreakers are shunned, above all by the loyal
  sc = Math.max(0, Math.min(0.97, sc)) * (0.85 + 0.15 * lv.smart);
  return rndf(S) < sc;
}
function aiDiplo(S, pid, view, me, prof, lv, rndf, betrayal, denounce) {
  const out = [], pr = prof.dip, pers = me.ai.personality, LD = leaderOf(S);
  const mine = aiPow(S, view, me, pid);
  for (const k of (denounce || []).slice(0, 1)) out.push({ type: 'dip', act: 'break', pact: k.id });
  // 1. answer incoming proposals
  for (const prop of incoming(S, pid)) {
    if (out.length >= DIP_MAX) break;
    const accept = aiAccepts(S, pid, prop, view, me, prof, lv, rndf);
    out.push({ type: 'dip', act: 'respond', pid: prop.id, accept });
  }
  // 2. our own offers (at most two a season)
  let made = 0;
  const offered = o => out.some(x => x.act === 'propose' && x.to === o.to && x.kind === o.kind);
  const push = o => { if (made < 2 && out.length < DIP_MAX && !offered(o)) { out.push(o); made++; } };
  if (S.turn >= 2) {
    // ransom first
    for (const h of S.heroes) if (h.heldBy != null && (h.heldBy === pid || h.owner === pid)) {
      const other = h.heldBy === pid ? h.owner : h.heldBy;
      if (rndf(S) < 0.5 * (0.4 + lv.smart)) {
        if (h.heldBy === pid) push({ type: 'dip', act: 'propose', kind: 'ransom', to: other, hid: h.id });
        else if (me.gold >= heroValue(h) + 70) push({ type: 'dip', act: 'propose', kind: 'ransom', to: other, hid: h.id });
      }
    }
    const rivalsAll = S.players.filter(p => p.alive && p.id !== pid);
    for (const r of rivalsAll) {
      if (betrayal.has(r.id)) continue;
      const theirs = aiPow(S, view, me, r.id), ratio = theirs / mine, adj = aiAdjacent(S, pid, r.id);
      const trust = trustOf(S, pid, r.id), mood = rndf(S), pact = protectivePact(S, pid, r.id);
      if (atWar(S, pid, r.id)) {
        const want = ratio > 1.0 || pers === 'builder' || (S.turn - S.dip.war[pairKey(pid, r.id)] > 10 && rndf(S) < 0.5);
        if (want && mood < 0.45 * (0.5 + lv.smart)) push({ type: 'dip', act: 'propose', kind: 'peace', to: r.id });
        continue;
      }
      if (!pact) {
        if (r.rep < 25 && pers !== 'schemer') continue;                  // nobody trusts an oathbreaker
        if (pers === 'warlord' || pers === 'schemer') {
          if (adj && ratio < 0.6 && mood < pr.demand * lv.smart) { push({ type: 'dip', act: 'propose', kind: 'tribute', to: r.id, dir: 'demand', amount: ratio < 0.35 ? 30 : ratio < 0.5 ? 20 : 10 }); continue; }
        }
        if (adj && ratio > 1.4 && me.gold >= 160 && mood < pr.soft * 0.4 && !pactBetween(S, pid, r.id, 'tribute')) { push({ type: 'dip', act: 'propose', kind: 'tribute', to: r.id, dir: 'offer', amount: 10 }); continue; }
        if (LD != null && LD !== pid && r.id !== LD && trust >= 40 && mood < 0.45 * (0.5 + lv.smart) && !offered({ to: r.id, kind: 'alliance' })) { push({ type: 'dip', act: 'propose', kind: 'alliance', to: r.id, vs: LD }); continue; }
        const napP = pr.nap * (adj ? 1.2 : 0.5) * (0.5 + lv.smart) * (ratio > 1.2 ? 1.4 : 1) * (S.turn < 20 ? 1.2 : 0.8);
        if (mood < napP && trust >= 35) { push({ type: 'dip', act: 'propose', kind: 'nap', to: r.id }); continue; }
      } else if (pact.type !== 'alliance' && LD != null && LD !== pid && r.id !== LD && S.turn - pact.since >= 1 && trust >= 52 && mood < 0.5 * (0.5 + lv.smart)) {
        push({ type: 'dip', act: 'propose', kind: 'alliance', to: r.id, vs: LD }); continue;
      } else if (pact.type !== 'alliance' && S.turn - pact.since >= 4 && trust >= 58 && alivePlayers(S).length >= 3) {
        const wouldAll = grandAlliance(S, pid, r.id);
        if (!wouldAll && mood < pr.alli * (0.5 + lv.smart) * 0.5) { push({ type: 'dip', act: 'propose', kind: 'alliance', to: r.id }); continue; }
      }
      if (!pactBetween(S, pid, r.id, 'trade') && mood > 0.72 && rndf(S) < pr.trade * (0.4 + lv.smart) && trust >= 40 && !atWar(S, pid, r.id)) {
        if (me.grain < 130 && me.gold >= 60) push({ type: 'dip', act: 'propose', kind: 'trade', to: r.id, dir: 'buy' });
        else if (me.grain > 260) push({ type: 'dip', act: 'propose', kind: 'trade', to: r.id, dir: 'sell' });
      }
    }
  }
  return out;
}
function hostileAt2(view, cid, pid) { return view.some(u => u.county === cid && u.owner !== pid); }

/* ------------------------------------------------------------------ state fingerprint (for async play) */
function stateSignature(S) {
  // compact deterministic digest of the important state
  let h = 2166136261 >>> 0;
  const mix = n => { h ^= (n | 0) & 0xffffffff; h = Math.imul(h, 16777619) >>> 0; };
  mix(S.turn); mix(S.rng);
  for (const c of S.counties) { mix(c.owner + 3); mix(c.pop); mix(Math.round(c.happiness)); mix(c.castle); }
  for (const u of S.units) { mix(u.id); mix(u.owner + 3); mix(u.county); }
  for (const p of S.players) { mix(p.gold); mix(Math.round(p.grain)); mix(Math.round((p.rep || 0) * 10)); }
  if (S.dip) { for (const k of S.dip.pacts) { mix(k.id); mix(k.since); } mix(S.dip.props.length); mix(S.claim.holder + 2); mix(S.claim.n); mix(S.bloc.n); if (S.scn) mix(S.scn.n); for (const p of S.players) { mix(p.infl || 0); mix(p.loan ? p.loan.left : 0); } for (const row of S.dip.trust) for (const t of row) mix(t); for (const h of S.heroes) mix(h.heldBy == null ? 0 : h.heldBy + 1); }
  return (h >>> 0).toString(16);
}

const BOTR = {
  SEASONS, STANCES, STANCE_INFO, BEATS, MAX_ORDERS, UNITS, UNIT_TYPES, MERGE_TYPES, TAX, TERRAIN, CASTLE, TRAITS, PERSONALITIES, DIFFICULTY, PLAYER_DEF, TURN_LIMIT, MAPS, FEINT_COST,
  MAP, MAP_DEF, STANCE_BONUS, DECISIVE, BANNER_MULT, HERO_NAMES, SLOTS_BY_N,
  bind, getMap: S => { bind(S); return MAP; },
  newGame, resolveTurn, runTurn, aiOrders, defaultChoice: autoChoice, autoChoice,
  checkOrder, checkNewOrder, validateOrders, sanitizeOrders, ctxFromOrders, describeOrder, pickMerge,
  ustr, ucost, ufood, uwage, wagesFor, ulabel, sumStr, describeUnits, unitById, unitsAt, armyStrength, countiesOf, alivePlayers,
  incomeFor, harvestFor, foodNeedFor, countyIncome, occupied, terrainDef, sideStrength, hostileAt, stormPenalty, stormCandidates,
  visSet, viewUnits, fakeUnits, heroOfUnit, besieged, stateSignature, winterMult,
  PACT, PROTECTIVE, DIP_MAX, REL_NAMES, friendly, allied, atWar, relation, protectivePact, pactBetween, incoming, outgoing, heldHeroes, heroValue, trustOf, alliesOf, dipBlock, SCENARIOS, scenarioById, scenarioSpecs, repMood, allyVictory, freeHeroWith, pairKey, forecast, yearlyBalance, styleOf, rcost, feintCost, spyCost, buildCost, limitFor, fairShare, leaderOf, trailing, strainExcess, overheadFor, strainMood, weariness, claimInfo, SPY_COST, grandAlliance, HELD_TURNS, ALLY_WIN_AGE
};
if (typeof module !== 'undefined' && module.exports) module.exports = BOTR;
root.BOTR = BOTR;
})(typeof window !== 'undefined' ? window : globalThis);
