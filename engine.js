/* Banners of the Realm - game engine (pure logic, no DOM). Works in browser (global BOTR) and node (module.exports). */
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
const TURN_LIMIT = 80;          // seasons (20 years) before a "crown" decision
const STANCE_BONUS = 1.4;
const COUNTER_BONUS = 0.5;
const DECISIVE = 1.3;
const BANNER_MULT = 1.5;        // banner (3 units) = 3 * 1.5 * base
const PRESSED_MULT = 0.85;
const PEASANT_FOOD = 0.06;
const HARVEST_K = 0.7;
const TAX_BASE = 0.15;

const UNITS = {
  levy:    { name: 'Levy',        plural: 'Levies',       str: 1, cost: 8,  wage: 1, food: 1, pop: 3, icon: '🔱', infantry: true,  counters: [] },
  archers: { name: 'Archers',     plural: 'Archers',      str: 2, cost: 20, wage: 1, food: 1, pop: 1, icon: '🏹', infantry: true,  counters: ['levy'] },
  maa:     { name: 'Men-at-arms', plural: 'Men-at-arms',  str: 3, cost: 35, wage: 2, food: 2, pop: 1, icon: '🗡️', infantry: true,  counters: ['archers'] },
  knights: { name: 'Knights',     plural: 'Knights',      str: 5, cost: 70, wage: 3, food: 3, pop: 1, icon: '🐴', infantry: false, counters: ['maa', 'levy'], capitalOnly: true }
};
const UNIT_TYPES = Object.keys(UNITS);

const TAX = {
  low:    { name: 'Low',    mult: 0.5, happy: 5 },
  normal: { name: 'Normal', mult: 1.0, happy: 0 },
  high:   { name: 'High',   mult: 1.7, happy: -6 }
};
const TERRAIN = {
  plains:    { name: 'Plains',    def: 0.0,  color: '#cdbf86' },
  forest:    { name: 'Forest',    def: 0.1,  color: '#8fa56b' },
  hills:     { name: 'Hills',     def: 0.2,  color: '#b8a477' },
  marsh:     { name: 'Marsh',     def: 0.1,  color: '#8fa08a' },
  mountains: { name: 'Mountains', def: 0.3,  color: '#a39a8c' }
};

/* ------------------------------------------------------------------ MAP */
const MAP_DEF = [
  { name: 'Highmere',   x: 100, y: 340, terrain: 'plains',    pop: 120, fert: 1.0, owner: 0, capital: 0, units: ['levy','levy','levy','archers','archers','maa'] },
  { name: 'Oakvale',    x: 205, y: 165, terrain: 'forest',    pop: 70,  fert: 0.8, owner: 0, units: ['levy','levy','archers'] },
  { name: 'Ravenfell',  x: 205, y: 525, terrain: 'plains',    pop: 80,  fert: 1.1, owner: 0, units: ['levy','levy','archers'] },
  { name: 'Thornwick',  x: 325, y: 345, terrain: 'plains',    pop: 70,  fert: 1.0, owner: -1, units: ['levy','levy'] },
  { name: 'Greywater',  x: 365, y: 130, terrain: 'hills',     pop: 70,  fert: 0.8, owner: -1, units: ['levy','archers'] },
  { name: 'Stonebridge',x: 355, y: 585, terrain: 'forest',    pop: 70,  fert: 0.8, owner: -1, units: ['levy','archers'] },
  { name: 'Ashdown',    x: 500, y: 335, terrain: 'hills',     pop: 80,  fert: 0.9, owner: -1, units: ['maa','archers'] },
  { name: 'Greyfang Pass', x: 500, y: 185, terrain: 'mountains', pop: 40, fert: 0.4, owner: -1, units: ['archers','archers','levy'] },
  { name: 'Mistfen',    x: 500, y: 485, terrain: 'marsh',     pop: 60,  fert: 0.7, owner: -1, units: ['levy','levy','archers'] },
  { name: 'Marrowgate', x: 635, y: 130, terrain: 'hills',     pop: 70,  fert: 0.8, owner: -1, units: ['levy','archers'] },
  { name: 'Wolfsmere',  x: 645, y: 585, terrain: 'forest',    pop: 70,  fert: 0.8, owner: -1, units: ['levy','archers'] },
  { name: 'Dunmore',    x: 675, y: 345, terrain: 'plains',    pop: 70,  fert: 1.0, owner: -1, units: ['levy','levy'] },
  { name: 'Fenwick',    x: 795, y: 165, terrain: 'forest',    pop: 70,  fert: 0.8, owner: 1, units: ['levy','levy','archers'] },
  { name: 'Kingsford',  x: 795, y: 525, terrain: 'plains',    pop: 80,  fert: 1.1, owner: 1, units: ['levy','levy','archers'] },
  { name: 'Ironhold',   x: 900, y: 340, terrain: 'plains',    pop: 120, fert: 1.0, owner: 1, capital: 1, units: ['levy','levy','levy','archers','archers','maa'] }
];
const PLAYER_DEF = [
  { id: 0, name: 'House Aldric',  short: 'Aldric',  color: '#2f5f9e', light: '#7fa6d8' },
  { id: 1, name: 'House Valmoor', short: 'Valmoor', color: '#a6302b', light: '#e08a82' }
];

function buildMap() {
  const N = MAP_DEF.length;
  const hull = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    hull.push([500 + 492 * Math.cos(a), 350 + 338 * Math.sin(a)]);
  }
  function clip(poly, a, b) {
    // keep points closer to a than b
    const g = (p) => (b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1]) - 2 * (p[0] * (b[0] - a[0]) + p[1] * (b[1] - a[1]));
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const gp = g(p), gq = g(q);
      if (gp >= 0) out.push(p);
      if ((gp >= 0) !== (gq >= 0)) {
        const t = gp / (gp - gq);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    return out;
  }
  const seeds = MAP_DEF.map(d => [d.x, d.y]);
  const cells = seeds.map((s, i) => {
    let poly = hull.slice();
    for (let j = 0; j < N; j++) if (j !== i) poly = clip(poly, s, seeds[j]);
    return poly;
  });
  const adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = seeds[i], b = seeds[j];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dist = (p) => Math.abs((b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1]) - 2 * (p[0] * (b[0] - a[0]) + p[1] * (b[1] - a[1]))) / (2 * len);
      const poly = cells[i];
      let shared = 0;
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], q = poly[(k + 1) % poly.length];
        if (dist(p) < 0.05 && dist(q) < 0.05) shared += Math.hypot(q[0] - p[0], q[1] - p[1]);
      }
      if (shared > 14) { adj[i].push(j); adj[j].push(i); }
    }
  }
  const centroid = cells.map(poly => {
    let A = 0, cx = 0, cy = 0;
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length];
      const cr = p[0] * q[1] - q[0] * p[1];
      A += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr;
    }
    A /= 2;
    return [cx / (6 * A), cy / (6 * A)];
  });
  // all-pairs distance (BFS)
  const dist = Array.from({ length: N }, () => new Array(N).fill(99));
  for (let s = 0; s < N; s++) {
    dist[s][s] = 0; const q = [s];
    while (q.length) { const c = q.shift(); for (const n of adj[c]) if (dist[s][n] === 99) { dist[s][n] = dist[s][c] + 1; q.push(n); } }
  }
  return { n: N, defs: MAP_DEF, cells, adj, centroid, dist };
}
const MAP = buildMap();
MAP.capitals = [0, 1].map(p => MAP_DEF.findIndex(d => d.capital === p));

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
function ustr(u) { return UNITS[u.type].str * (u.banner ? 3 * BANNER_MULT : 1) * (u.pressed ? PRESSED_MULT : 1); }
function ucost(u) { return UNITS[u.type].cost * (u.banner ? 3 : 1); }
function uwage(u) { return UNITS[u.type].wage * (u.banner ? 2 : 1); }
function ufood(u) { return UNITS[u.type].food * (u.banner ? 2 : 1); }
function ulabel(u) { return u.banner ? 'Banner of ' + UNITS[u.type].plural : UNITS[u.type].name; }
function sumStr(arr) { let t = 0; for (const u of arr) t += ustr(u); return t; }
function describeUnits(units) {
  const m = new Map();
  for (const u of units) {
    const k = u.banner ? 'B:' + u.type : u.type;
    m.set(k, (m.get(k) || 0) + 1);
  }
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
function hostileAt(S, cid, owner) { return S.units.some(u => u.county === cid && u.owner !== owner); }
function counterOfStance(s) { return STANCES.find(x => BEATS[x] === s); }
function terrainDef(cid) { return TERRAIN[MAP_DEF[cid].terrain].def; }

/* ------------------------------------------------------------------ new game */
function newGame(seed, opts) {
  opts = opts || {};
  const S = {
    v: 1, seed: seed >>> 0, rng: (seed >>> 0) ^ 0x9E3779B9, turn: 0, season: 0, year: 1,
    players: PLAYER_DEF.map(p => ({
      id: p.id, name: p.name, short: p.short, color: p.color, light: p.light,
      human: !!(opts.humans && opts.humans.includes(p.id)),
      gold: 70, grain: 130, renown: 0, garrison: {}, lastEnemyStance: null,
      capital: MAP.capitals[p.id]
    })),
    counties: [], units: [], nextId: 1, log: [], turnLog: [], over: null
  };
  MAP_DEF.forEach((d, i) => {
    S.counties.push({ id: i, owner: d.owner, pop: d.pop, maxPop: Math.round(d.pop * 1.25), happiness: d.owner >= 0 ? 60 : 50, tax: 'normal', resent: 0, occ: null, unrest: false });
    for (const t of d.units) S.units.push({ id: S.nextId++, type: t, owner: d.owner, county: i, banner: false, pressed: false });
  });
  return S;
}

/* ------------------------------------------------------------------ orders */
function newCtx() { return { used: new Set(), gold: 0, tax: new Set() }; }
function pickMerge(S, pid, cid, type, used) {
  const av = S.units.filter(u => u.owner === pid && u.county === cid && u.type === type && !u.banner && !u.pressed && !used.has(u.id));
  av.sort((a, b) => a.id - b.id);
  return av.length >= 3 ? av.slice(0, 3) : null;
}
function checkOrder(S, pid, o, ctx) {
  const me = S.players[pid];
  if (!o || typeof o !== 'object') return 'Bad order';
  switch (o.type) {
    case 'march': {
      if (!Array.isArray(o.units) || !o.units.length) return 'Select at least one unit.';
      if (!STANCES.includes(o.stance)) return 'Choose a stance.';
      if (!(MAP.adj[o.from] || []).includes(o.to)) return 'You can only march to an adjacent county.';
      const seen = new Set();
      for (const id of o.units) {
        const u = unitById(S, id);
        if (!u || u.owner !== pid || u.county !== o.from) return 'Unit is not in that county.';
        if (ctx.used.has(id) || seen.has(id)) return 'Unit already has an order.';
        seen.add(id);
      }
      return null;
    }
    case 'recruit': {
      const d = UNITS[o.unit]; if (!d) return 'Unknown unit.';
      const c = S.counties[o.county]; if (!c || c.owner !== pid) return 'You can only recruit in your own counties.';
      if (d.capitalOnly && o.county !== me.capital) return d.name + ' can only be raised in your capital.';
      if (hostileAt(S, o.county, pid)) return 'Enemy troops occupy that county.';
      if (me.gold - ctx.gold < d.cost) return 'Not enough gold.';
      if (c.pop < d.pop + 10) return 'Too few peasants.';
      return null;
    }
    case 'merge': {
      if (!UNITS[o.unit]) return 'Unknown unit.';
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
  }
  return 'Unknown order.';
}
function commitOrder(S, pid, o, ctx) {
  if (o.type === 'march') for (const id of o.units) ctx.used.add(id);
  else if (o.type === 'recruit') ctx.gold += UNITS[o.unit].cost;
  else if (o.type === 'merge') for (const u of pickMerge(S, pid, o.county, o.unit, ctx.used)) ctx.used.add(u.id);
  else if (o.type === 'tax') ctx.tax.add(o.county);
}
function ctxFromOrders(S, pid, orders) {
  const ctx = newCtx();
  for (const o of orders) { if (!checkOrder(S, pid, o, ctx)) commitOrder(S, pid, o, ctx); }
  return ctx;
}
/** Check a candidate order against the already-queued list. Returns error string or null. */
function checkNewOrder(S, pid, o, orders) {
  if (orders.length >= MAX_ORDERS) return 'You have already given ' + MAX_ORDERS + ' orders.';
  return checkOrder(S, pid, o, ctxFromOrders(S, pid, orders));
}
function sanitizeOrders(S, pid, orders) {
  const ctx = newCtx(), out = [];
  for (const o of orders || []) {
    if (out.length >= MAX_ORDERS) break;
    if (!checkOrder(S, pid, o, ctx)) { commitOrder(S, pid, o, ctx); out.push(o); }
  }
  return out;
}
function validateOrders(S, pid, orders) {
  const errors = []; const ctx = newCtx();
  if (orders.length > MAX_ORDERS) errors.push('Too many orders');
  for (const o of orders) { const e = checkOrder(S, pid, o, ctx); if (e) errors.push(e); else commitOrder(S, pid, o, ctx); }
  return { ok: !errors.length, errors };
}
function describeOrder(S, o) {
  const cn = i => MAP_DEF[i].name;
  switch (o.type) {
    case 'march': {
      const us = o.units.map(id => unitById(S, id)).filter(Boolean);
      return `March ${describeUnits(us)} ${cn(o.from)} → ${cn(o.to)} (${STANCE_INFO[o.stance].icon} ${STANCE_INFO[o.stance].name})`;
    }
    case 'recruit': return `Recruit ${UNITS[o.unit].name} in ${cn(o.county)} (${UNITS[o.unit].cost}g)`;
    case 'merge': return `Merge 3 ${UNITS[o.unit].plural} into a Banner in ${cn(o.county)}`;
    case 'tax': return `Set tax in ${cn(o.county)} to ${TAX[o.rate].name}`;
  }
  return '?';
}

/* ------------------------------------------------------------------ economy previews */
function occupied(S, cid, pid) { return hostileAt(S, cid, pid) && !S.units.some(u => u.county === cid && u.owner === pid); }
function countyIncome(S, c) {
  if (c.owner < 0 || c.happiness < 20 || occupied(S, c.id, c.owner)) return 0;
  return Math.round(c.pop * TAX_BASE * TAX[c.tax].mult);
}
function wagesFor(S, pid) { let t = 0; for (const u of S.units) if (u.owner === pid) t += uwage(u); return t; }
function incomeFor(S, pid) { let t = 0; for (const c of S.counties) if (c.owner === pid) t += countyIncome(S, c); return t; }
function harvestFor(S, pid) {
  if (S.season !== 2) return 0;
  let t = 0;
  for (const c of S.counties) if (c.owner === pid && !occupied(S, c.id, pid)) t += Math.round(c.pop * MAP_DEF[c.id].fert * HARVEST_K * (c.happiness >= 20 ? 1 : 0.6));
  return t;
}
function foodNeedFor(S, pid, season) {
  const mult = (season === undefined ? S.season : season) === 3 ? 2 : 1;
  let n = 0;
  for (const u of S.units) if (u.owner === pid) n += ufood(u);
  for (const c of S.counties) if (c.owner === pid) n += Math.round(c.pop * PEASANT_FOOD);
  return n * mult;
}
function yearlyBalance(S, pid) {
  let h = 0;
  for (const c of S.counties) if (c.owner === pid) h += Math.round(c.pop * MAP_DEF[c.id].fert * HARVEST_K);
  return h - foodNeedFor(S, pid, 0) * 5;
}
function countiesOf(S, pid) { return S.counties.filter(c => c.owner === pid); }
function armyStrength(S, pid) { return sumStr(S.units.filter(u => u.owner === pid)); }

/* ------------------------------------------------------------------ resolution */
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
    if (u.type === 'archers' && side.defending && ctx.castle) s *= 1.25;
    total += s;
  }
  if (side.defending) total *= 1 + ctx.defBonus;
  return total;
}
function dominantStance(S, units, cid, defending) {
  const sums = { charge: 0, hold: 0, flank: 0 };
  for (const u of units) sums[unitStance(S, u, cid)] += ustr(u);
  let best = null;
  for (const s of STANCES) if (best === null || sums[s] > sums[best]) best = s;
  return best;
}
function unitStance(S, u, cid) {
  if (u.moved && u.stance) return u.stance;
  if (u.owner < 0) return u._nst || (u._nst = pickWeighted(S, STANCES, [1, 1, 1]));
  const g = S.players[u.owner].garrison[cid];
  return STANCES.includes(g) ? g : 'hold';
}
function removeUnits(S, units) { const set = new Set(units); S.units = S.units.filter(u => !set.has(u)); }
function safeFor(S, cid, owner) { return !S.units.some(u => u.county === cid && u.owner !== owner); }
function homeFor(S, owner) {
  if (owner < 0) return null;
  const cap = S.players[owner].capital;
  return safeFor(S, cap, owner) ? cap : null;
}

function* resolveTurn(S, ordersByPlayer) {
  S.turnLog = [];
  const E = (text, kind, county, extra) => {
    const ev = { text, kind: kind || 'info', county: county == null ? null : county, season: S.season, year: S.year };
    if (extra) Object.assign(ev, extra);
    S.log.push(ev); S.turnLog.push(ev); return ev;
  };
  const cname = i => MAP_DEF[i].name;
  const orders = [0, 1].map(p => sanitizeOrders(S, p, ordersByPlayer[p] || []));
  yield E(`${SEASONS[S.season]} of Year ${S.year}: the sealed orders are opened!`, 'phase');

  /* ---- decrees */
  for (let p = 0; p < 2; p++) for (const o of orders[p]) if (o.type === 'tax') {
    S.counties[o.county].tax = o.rate;
    yield E(`${S.players[p].short} sets taxes in ${cname(o.county)} to ${TAX[o.rate].name}.`, 'decree', o.county);
  }

  /* ---- recruit & merge */
  const marching = new Set();
  for (let p = 0; p < 2; p++) for (const o of orders[p]) if (o.type === 'march') for (const id of o.units) marching.add(id);
  for (let p = 0; p < 2; p++) {
    for (const o of orders[p]) if (o.type === 'recruit') {
      const d = UNITS[o.unit], me = S.players[p], c = S.counties[o.county];
      if (c.owner !== p || me.gold < d.cost || hostileAt(S, o.county, p)) { yield E(`${me.short}'s recruits at ${cname(o.county)} are turned away.`, 'warn', o.county); continue; }
      me.gold -= d.cost; c.pop = Math.max(5, c.pop - d.pop);
      S.units.push({ id: S.nextId++, type: o.unit, owner: p, county: o.county, banner: false, pressed: false });
      yield E(`${me.short} musters ${d.name} at ${cname(o.county)}.`, 'recruit', o.county);
    }
    for (const o of orders[p]) if (o.type === 'merge') {
      const three = pickMerge(S, p, o.county, o.unit, marching);
      if (!three) { yield E(`${S.players[p].short}'s banner-raising at ${cname(o.county)} fails: not enough troops.`, 'warn', o.county); continue; }
      three[0].banner = true; removeUnits(S, [three[1], three[2]]);
      yield E(`${S.players[p].short} raises a Banner of ${UNITS[o.unit].plural} at ${cname(o.county)}!`, 'recruit', o.county);
    }
  }

  /* ---- movement */
  for (const u of S.units) { u.moved = false; u.from = null; u.stance = null; delete u._nst; }
  const groups = [];
  for (let p = 0; p < 2; p++) for (const o of orders[p]) if (o.type === 'march') {
    const units = o.units.map(id => unitById(S, id)).filter(Boolean);
    if (!units.length) continue;
    if (S.season === 3 && S.counties[o.to].owner !== p && rnd(S) < 0.5) {
      yield E(`❄ Snow blocks the road: ${S.players[p].short}'s army cannot leave ${cname(o.from)} for ${cname(o.to)}.`, 'warn', o.from);
      continue;
    }
    groups.push({ owner: p, from: o.from, to: o.to, units, stance: o.stance, alive: true });
  }
  for (const g of groups) for (const u of g.units) { u.moved = true; u.from = g.from; u.stance = g.stance; }
  // swaps: hostile armies passing each other meet in the open
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const a = groups[i], b = groups[j];
    if (!a.alive || !b.alive || a.owner === b.owner) continue;
    if (a.from === b.to && a.to === b.from) {
      yield E(`Armies meet on the road between ${cname(a.from)} and ${cname(a.to)}!`, 'move', a.from);
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
    const kind = S.counties[g.to].owner === g.owner ? 'move' : 'move';
    yield E(`${S.players[g.owner].short} marches ${describeUnits(g.units)} from ${cname(g.from)} to ${cname(g.to)}.`, kind, g.to, { arrow: { from: g.from, to: g.to, owner: g.owner } });
  }

  /* ---- clashes */
  for (let pass = 0; pass < 4; pass++) {
    let any = false;
    for (let cid = 0; cid < MAP.n; cid++) {
      const here = unitsAt(S, cid);
      const owners = [...new Set(here.map(u => u.owner))];
      if (owners.length < 2) continue;
      any = true;
      const sides = owners.map(o => {
        const us = here.filter(u => u.owner === o);
        const defending = us.some(u => !u.moved);
        return { owner: o, units: us, stance: dominantStance(S, us, cid), defending };
      });
      yield* fightCounty(S, E, cid, sides, { field: false, label: `at ${cname(cid)}`, hint: cid });
    }
    if (!any) break;
  }
  for (const u of S.units) { u.moved = false; u.from = null; u.stance = null; delete u._nst; }

  /* ---- ownership changes */
  for (const c of S.counties) {
    const present = [...new Set(unitsAt(S, c.id).map(u => u.owner))];
    if (present.length === 1 && present[0] >= 0 && present[0] !== c.owner && !(MAP_DEF[c.id].capital !== undefined)) {
      const p = present[0], prev = c.owner;
      c.owner = p;
      if (prev >= 0) { c.happiness = Math.min(c.happiness, 35) - 10; c.resent = 3; } else { c.happiness = 45; c.resent = 2; }
      c.happiness = Math.max(5, c.happiness);
      c.tax = 'normal';
      yield E(`${cname(c.id)} falls to ${S.players[p].short}${prev >= 0 ? ' (taken from ' + S.players[prev].short + ')' : ''}. The people are uneasy.`, 'capture', c.id);
    }
  }

  /* ---- banner occupation */
  let winner = null, draw = false;
  for (let q = 0; q < 2; q++) {
    const capId = S.players[q].capital, cc = S.counties[capId];
    const r = 1 - q;
    const mine = unitsAt(S, capId, q).length, theirs = unitsAt(S, capId, r);
    const inf = theirs.filter(u => UNITS[u.type].infantry);
    if (!mine && inf.length) {
      if (cc.occ && cc.occ.by === r) cc.occ.count++; else cc.occ = { by: r, count: 1 };
      if (cc.occ.count >= 2) {
        if (winner !== null) draw = true;
        winner = r;
        yield E(`${S.players[r].short}'s infantry have held ${cname(capId)} for a full season. The Royal Banner of ${S.players[q].short} is captured!`, 'win', capId);
      } else {
        yield E(`🚩 ${S.players[r].short}'s infantry occupy ${cname(capId)}! If they hold it through next season, the Royal Banner of ${S.players[q].short} is lost.`, 'alarm', capId);
      }
    } else {
      if (!mine && theirs.length) yield E(`${S.players[r].short}'s cavalry ride through ${cname(capId)}, but only infantry can seize a banner.`, 'info', capId);
      cc.occ = null;
    }
  }
  if (winner !== null) {
    S.over = draw ? { winner: null, reason: 'banner' } : { winner, reason: 'banner' };
    if (draw) yield E('Both Royal Banners fall in the same season. The realm collapses into chaos: a draw.', 'win');
    return;
  }

  /* ---- seasonal economy */
  for (let p = 0; p < 2; p++) {
    const me = S.players[p];
    const harvest = harvestFor(S, p);
    const income = incomeFor(S, p);
    const need = foodNeedFor(S, p);
    const wages = wagesFor(S, p);
    me.grain += harvest - need; me.gold += income - wages;
    let starving = false;
    if (me.gold < 0) {
      me.gold = 0;
      const mine = S.units.filter(u => u.owner === p).sort((a, b) => ustr(a) - ustr(b));
      const lose = mine.slice(0, Math.max(1, Math.floor(mine.length * 0.15)));
      removeUnits(S, lose);
      yield E(`💰 ${me.short} cannot pay the wages! ${lose.length} unpaid unit(s) desert.`, 'warn', null);
    }
    if (me.grain < 0) {
      me.grain = 0; starving = true;
      const mine = S.units.filter(u => u.owner === p).sort((a, b) => ustr(a) - ustr(b));
      const lose = mine.slice(0, Math.max(1, Math.floor(mine.length * 0.2)));
      removeUnits(S, lose);
      yield E(`🌾 ${me.short}'s granaries are empty! Famine: ${lose.length} unit(s) desert.`, 'warn', null);
    }
    for (const c of S.counties) if (c.owner === p) {
      let d = TAX[c.tax].happy + Math.round((55 - c.happiness) * 0.1);
      if (c.resent > 0) { d -= 3; c.resent--; }
      if (starving) { d -= 10; c.pop = Math.max(10, Math.round(c.pop * 0.96)); }
      const before = c.happiness;
      c.happiness = Math.max(0, Math.min(100, c.happiness + d));
      if (!starving && c.happiness >= 30 && c.pop < c.maxPop) c.pop = Math.min(c.maxPop, Math.round(c.pop * 1.02) + 1);
      const un = c.happiness < 20;
      if (un && !c.unrest) yield E(`😠 ${cname(c.id)} is in unrest and stops paying taxes!`, 'warn', c.id);
      else if (!un && c.unrest) yield E(`🙂 ${cname(c.id)} has calmed and pays taxes again.`, 'info', c.id);
      c.unrest = un;
    }
    yield E(`${me.short}'s treasury: +${income} taxes, −${wages} wages${harvest ? ', harvest +' + harvest + ' grain' : ''}, food consumed −${need}. Stores: ${me.gold}g, ${Math.round(me.grain)} grain.`, 'econ', null);
  }

  /* ---- next season */
  S.turn++;
  S.season = (S.season + 1) % 4;
  if (S.season === 0) S.year++;
  if (S.turn >= TURN_LIMIT) {
    const a = countiesOf(S, 0).length, b = countiesOf(S, 1).length;
    let w = a > b ? 0 : b > a ? 1 : (armyStrength(S, 0) >= armyStrength(S, 1) ? 0 : 1);
    S.over = { winner: w, reason: 'crown' };
    yield E(`The long war ends. ${S.players[w].name} holds the most land and is crowned.`, 'win');
  }
}

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
  const castle = cid != null && MAP_DEF[cid].capital !== undefined;
  const ctx = { castle, defBonus: (!field && cid != null) ? terrainDef(cid) + (castle ? 0.3 : 0) : 0 };
  let ta = sideStrength(a, b, ctx), tb = sideStrength(b, a, ctx);
  const aw = BEATS[a.stance] === b.stance, bw = BEATS[b.stance] === a.stance;
  if (aw) ta *= STANCE_BONUS; if (bw) tb *= STANCE_BONUS;
  let winner, loser, wt, lt;
  if (ta > tb) { winner = a; loser = b; wt = ta; lt = tb; }
  else if (tb > ta) { winner = b; loser = a; wt = tb; lt = ta; }
  else if (a.defending !== b.defending) { winner = a.defending ? a : b; loser = winner === a ? b : a; wt = lt = ta; }
  else if (rnd(S) < 0.5) { winner = a; loser = b; wt = ta; lt = tb; } else { winner = b; loser = a; wt = tb; lt = ta; }
  const ratio = lt > 0 ? wt / lt : 99;
  const decisive = field || (winner.owner >= 0 && ratio >= DECISIVE);
  // remember stances for AI learning
  if (a.owner >= 0 && b.owner >= 0) { S.players[a.owner].lastEnemyStance = b.stance; S.players[b.owner].lastEnemyStance = a.stance; }
  const sn = s => STANCE_INFO[s].icon + ' ' + STANCE_INFO[s].name;
  const stanceNote = aw ? `${sn(a.stance)} beats ${sn(b.stance)}` : bw ? `${sn(b.stance)} beats ${sn(a.stance)}` : `both ${sn(a.stance)}`;
  const side = (s, t) => `${pname(S, s.owner)} [${describeUnits(s.units)}; ${sn(s.stance)}${s.defending && !field ? ', defending' : ''}; power ${t.toFixed(1)}]`;
  const outcome = decisive ? `${pname(S, winner.owner)} wins decisively.` : `${pname(S, winner.owner)} prevails; the beaten force is routed.`;
  yield E(`⚔ Clash ${opts.label}: ${side(a, ta)} vs ${side(b, tb)}. ${stanceNote}. ${outcome}`, 'battle', opts.hint,
    { battle: { a: { owner: a.owner, stance: a.stance, power: ta, units: describeUnits(a.units) }, b: { owner: b.owner, stance: b.stance, power: tb, units: describeUnits(b.units) }, winner: winner.owner, decisive, label: opts.label, note: stanceNote, outcome, ratio } });

  const lus = loser.units.filter(u => S.units.includes(u));
  let captured = [];
  const desert = lus.filter(u => u.pressed);
  if (desert.length) {
    removeUnits(S, desert);
    yield E(`${desert.length} pressed soldier(s) of ${pname(S, loser.owner)} throw down their arms and desert.`, 'info', opts.hint);
  }
  const rest = lus.filter(u => !u.pressed);
  if (decisive) {
    removeUnits(S, rest); captured = rest;
  } else {
    // rout: retreat
    const cut = [];
    const dest = new Map();
    for (const u of rest) {
      let t = null;
      if (u.owner >= 0) {
        if (u.moved && u.from != null && u.from !== cid && safeFor(S, u.from, u.owner)) t = u.from;
        else {
          const opts2 = (MAP.adj[cid] || []).filter(n => S.counties[n].owner === u.owner && safeFor(S, n, u.owner));
          opts2.sort((x, y) => MAP.dist[x][S.players[u.owner].capital] - MAP.dist[y][S.players[u.owner].capital]);
          if (opts2.length) t = opts2[0];
        }
      }
      if (t == null) cut.push(u); else { u.county = t; u.moved = false; dest.set(t, (dest.get(t) || 0) + 1); }
    }
    if (dest.size) {
      const names = [...dest.keys()].map(cname).join(', ');
      yield E(`${pname(S, loser.owner)}'s routed troops fall back to ${names}.`, 'move', opts.hint);
    }
    if (loser.owner < 0 && rest.length) {
      removeUnits(S, rest); // neutral garrison scatters
      yield E(`The garrison scatters into the hills.`, 'info', opts.hint);
    } else if (cut.length) {
      if (winner.owner >= 0) { removeUnits(S, cut); captured = cut; }
      else {
        const home = homeFor(S, loser.owner);
        if (home != null) for (const u of cut) { u.county = home; u.moved = false; } else removeUnits(S, cut);
      }
    }
  }
  if (captured.length && winner.owner >= 0) {
    const value = Math.round(captured.reduce((t, u) => t + ucost(u), 0) * 0.6);
    const land = field ? opts.landing[winner.owner] : cid;
    const info = {
      kind: 'choice', player: winner.owner, county: land, loser: loser.owner, count: captured.length,
      desc: describeUnits(captured), value,
      text: `${pname(S, winner.owner)} captures ${describeUnits(captured)}! Ransom, press into service, or release?`
    };
    E(info.text, 'capture', opts.hint);
    const ans = yield info;
    const choice = ['ransom', 'press', 'release'].includes(ans) ? ans : defaultChoice(S, info);
    applyChoice(S, E, choice, winner.owner, loser.owner, captured, land, value, info);
    yield S.turnLog[S.turnLog.length - 1];
  }
  return { winner, loser, decisive };
}

function defaultChoice(S, info) {
  const me = S.players[info.player];
  if (me.gold < 45 || me.grain < 40) return 'ransom';
  if (info.loser < 0) return 'press';
  return rnd(S) < 0.12 ? 'release' : 'press';
}
function applyChoice(S, E, choice, winnerOwner, loserOwner, units, landing, value, info) {
  const wn = S.players[winnerOwner].short;
  const sendHome = () => {
    const home = homeFor(S, loserOwner);
    if (home != null) for (const u of units) { u.owner = loserOwner; u.county = home; u.pressed = false; u.moved = false; S.units.push(u); }
    return home;
  };
  if (choice === 'press') {
    for (const u of units) { u.owner = winnerOwner; u.county = landing; u.pressed = true; u.moved = false; S.units.push(u); }
    E(`${wn} presses ${describeUnits(units)} into service (they fight at ${Math.round(PRESSED_MULT * 100)}% and may desert if beaten).`, 'capture', landing);
  } else if (choice === 'ransom') {
    S.players[winnerOwner].gold += value;
    if (loserOwner >= 0) S.players[loserOwner].gold = Math.max(0, S.players[loserOwner].gold - value);
    const home = sendHome();
    E(`${wn} ransoms the prisoners for ${value} gold${loserOwner >= 0 ? (home != null ? '; they march home to ' + MAP_DEF[home].name : '; their home is occupied, so they disband') : ''}.`, 'econ', landing);
  } else {
    S.players[winnerOwner].renown++;
    for (const c of S.counties) if (c.owner === winnerOwner) c.happiness = Math.min(100, c.happiness + 3);
    const home = sendHome();
    E(`${wn} releases the prisoners. Word of this mercy spreads: +3 happiness across ${wn}'s realm${loserOwner >= 0 && home == null ? '; the freed men disband' : ''}.`, 'info', landing);
  }
}

/** Drive a whole turn synchronously. chooser(S, info) -> 'ransom'|'press'|'release'. */
function runTurn(S, ordersByPlayer, chooser) {
  const g = resolveTurn(S, ordersByPlayer);
  let r = g.next();
  while (!r.done) {
    let ans;
    if (r.value && r.value.kind === 'choice') ans = chooser ? chooser(S, r.value) : defaultChoice(S, r.value);
    r = g.next(ans);
  }
  return S.turnLog;
}

/* ------------------------------------------------------------------ AI */
function aiOrders(S, pid) {
  const me = S.players[pid], fid = 1 - pid, foe = S.players[fid];
  const cap = me.capital, fcap = foe.capital;
  const winter = S.season === 3;
  const cands = [];
  const mine = c => S.units.filter(u => u.owner === pid && u.county === c);
  const strAt = (c, o) => sumStr(S.units.filter(u => u.owner === o && u.county === c));
  const threat = c => { let t = strAt(c, fid); for (const n of MAP.adj[c]) t += 0.9 * strAt(n, fid); return t; };
  const defEstimate = t => {
    const us = S.units.filter(u => u.county === t && u.owner !== pid);
    return sumStr(us) * (1 + terrainDef(t) + (MAP_DEF[t].capital !== undefined ? 0.3 : 0)) * 1.15;
  };
  const pickStance = () => {
    if (me.lastEnemyStance && rnd(S) < 0.3) return counterOfStance(me.lastEnemyStance);
    return pickWeighted(S, STANCES, [1.1, 1, 1]);
  };
  const jitter = () => 0.85 + rnd(S) * 0.3;

  const idle = me.idle || 0;                      // consecutive turns without a march
  const bold = Math.min(1.6, idle / 4);               // grows while stalemated
  // reserves
  const reserved = new Set();
  const reserveAt = (c, want) => {
    const us = mine(c).sort((a, b) => ustr(b) - ustr(a));
    let got = 0;
    for (const u of us) { if (got >= want) break; reserved.add(u.id); got += ustr(u); }
  };
  const capThreat = threat(cap);
  reserveAt(cap, Math.max(4, 1.4 * capThreat));
  for (const c of S.counties) if (c.owner === pid && c.id !== cap) {
    const t = threat(c.id);
    if (t > 0) reserveAt(c.id, t * (1.1 - 0.5 * bold));
  }
  const free = c => mine(c).filter(u => !reserved.has(u.id));

  // 1. capital defence
  const capStr = strAt(cap, pid);
  if (capStr < 1.4 * capThreat) {
    for (const n of MAP.adj[cap]) {
      const us = mine(n);
      if (!us.length || S.counties[n].owner !== pid) continue;
      const nt = threat(n);
      const give = us.filter(u => !reserved.has(u.id) || nt < capThreat * 0.5);
      if (give.length) cands.push({ score: 150 + rnd(S), order: { type: 'march', from: n, to: cap, units: give.map(u => u.id), stance: 'hold' } });
    }
    cands.push({ score: 140, order: { type: 'recruit', unit: 'maa', county: cap } });
    cands.push({ score: 139, order: { type: 'recruit', unit: 'archers', county: cap } });
  }

  // 2. attacks / grabs
  const myTotal = armyStrength(S, pid), foeTotal = armyStrength(S, fid);
  for (const c of S.counties) {
    const sendable = free(c.id);
    if (!sendable.length || c.owner !== pid && !hostileAt(S, c.id, pid) && false) continue;
    sendable.sort((x, y) => ustr(y) - ustr(x));
    for (const t of MAP.adj[c.id]) {
      const tc = S.counties[t];
      if (tc.owner === pid && !hostileAt(S, t, pid)) continue;
      const defStr = defEstimate(t);
      const isFoeCap = t === fcap;
      const ratioNeed = (tc.owner < 0 ? 1.25 : 1.35) - 0.3 * bold;
      let group = [];
      if (defStr === 0) {
        const infantry = sendable.filter(u => UNITS[u.type].infantry).sort((x, y) => ustr(x) - ustr(y));
        const pool = isFoeCap ? infantry : sendable.slice().sort((x, y) => ustr(x) - ustr(y));
        if (pool.length) group = [pool[0]];
      } else {
        let got = 0;
        for (const u of sendable) { group.push(u); got += ustr(u); if (got >= defStr * ratioNeed * 1.15) break; }
        if (sumStr(group) < defStr * ratioNeed) group = [];
      }
      if (!group.length) continue;
      if (isFoeCap && !group.some(u => UNITS[u.type].infantry)) continue;
      const margin = defStr === 0 ? 2 : sumStr(group) / defStr;
      let value = isFoeCap ? 220 : tc.owner === fid ? 45 + tc.pop / 5 : 28 + tc.pop / 5;
      value *= (1 + Math.min(2, margin - 1) * 0.3) * jitter();
      if (winter) value *= 0.6;
      cands.push({ score: value, order: { type: 'march', from: c.id, to: t, units: group.map(u => u.id), stance: pickStance() } });
    }
  }

  // 3. advance toward the enemy capital
  if (myTotal >= foeTotal * 0.9 && !winter) {
    for (const c of S.counties) {
      const sendable = free(c.id);
      if (sendable.length < 2 || c.id === cap) continue;
      let best = null;
      for (const n of MAP.adj[c.id]) if (MAP.dist[n][fcap] < MAP.dist[c.id][fcap] && S.counties[n].owner === pid) best = n;
      if (best == null) continue;
      cands.push({ score: 30 * jitter(), order: { type: 'march', from: c.id, to: best, units: sendable.map(u => u.id), stance: 'hold' } });
    }
  }

  // 3b. rally free units toward the nearest worthwhile target (neutral or enemy county)
  if (!winter) {
    for (const c of S.counties) {
      if (c.owner !== pid) continue;
      const sendable = free(c.id);
      if (!sendable.length) continue;
      const sstr = sumStr(sendable);
      let bestT = null, bestV = 0;
      for (const t of S.counties) {
        if (t.owner === pid) continue;
        const d = MAP.dist[c.id][t.id];
        if (d < 2 || d > 4) continue;
        const need = defEstimate(t.id) * 1.3;
        if (sstr < need) continue;
        const v = (t.owner === fid ? 40 : 25) / d;
        if (v > bestV) { bestV = v; bestT = t; }
      }
      if (!bestT) continue;
      const hop = MAP.adj[c.id].find(n => MAP.dist[n][bestT.id] === MAP.dist[c.id][bestT.id] - 1 && S.counties[n].owner === pid);
      if (hop == null) continue;
      cands.push({ score: 33 * jitter(), order: { type: 'march', from: c.id, to: hop, units: sendable.map(u => u.id), stance: 'hold' } });
    }
  }

  // 4. merges
  for (const c of S.counties) if (c.owner === pid) {
    for (const t of UNIT_TYPES) {
      const n = mine(c.id).filter(u => u.type === t && !u.banner && !u.pressed).length;
      if (n >= 3) cands.push({ score: 75 + UNITS[t].str * 2, order: { type: 'merge', county: c.id, unit: t } });
    }
  }

  // 5. recruits
  const bal = yearlyBalance(S, pid);
  const netGold = incomeFor(S, pid) - wagesFor(S, pid);
  const canFeed = unit => (me.grain > 180 || bal - UNITS[unit].food * 5 >= -25) && netGold - UNITS[unit].wage >= 3;
  const foeUnits = S.units.filter(u => u.owner === fid);
  const fshare = t => sumStr(foeUnits.filter(u => u.type === t)) / (sumStr(foeUnits) || 1);
  let want;
  const capUnits = mine(cap).filter(u => !u.banner && !u.pressed);
  const cnt = t => capUnits.filter(u => u.type === t).length;
  const partial = ['maa', 'archers', 'knights', 'levy'].find(t => cnt(t) % 3 !== 0 && cnt(t) > 0 && (t !== 'levy' || rnd(S) < 0.3));
  if (partial && me.gold >= UNITS[partial].cost) want = partial;
  else if (fshare('knights') > 0.3) want = 'archers';
  else if (fshare('archers') > 0.35) want = 'maa';
  else if (me.gold >= 70 && rnd(S) < 0.4) want = 'knights';
  else want = pickWeighted(S, ['archers', 'maa', 'levy'], [2, 2, 0.6]);
  // location: capital by default; threatened county if it needs help
  let where = cap;
  if (UNITS[want].capitalOnly === undefined) {
    let bt = capThreat;
    for (const c of S.counties) if (c.owner === pid && threat(c.id) > bt * 1.5 && c.pop > 40) { bt = threat(c.id); where = c.id; }
  }
  if (canFeed(want)) {
    cands.push({ score: 62 + rnd(S) * 3, order: { type: 'recruit', unit: want, county: where } });
    cands.push({ score: 58, order: { type: 'recruit', unit: want, county: where } });
    cands.push({ score: 50, order: { type: 'recruit', unit: 'archers', county: cap } });
  }

  // 6. taxes
  let taxBest = null;
  for (const c of S.counties) if (c.owner === pid) {
    if (c.happiness < 32 && c.tax !== 'low') { taxBest = { score: 90, order: { type: 'tax', county: c.id, rate: 'low' } }; break; }
  }
  if (!taxBest) {
    for (const c of S.counties) if (c.owner === pid && c.happiness > 70 && c.tax !== 'high' && (me.gold < 60 || c.tax === 'low')) { taxBest = { score: 55, order: { type: 'tax', county: c.id, rate: c.tax === 'low' ? 'normal' : 'high' } }; break; }
  }
  if (!taxBest) {
    for (const c of S.counties) if (c.owner === pid && c.tax === 'high' && c.happiness < 45) { taxBest = { score: 70, order: { type: 'tax', county: c.id, rate: 'normal' } }; break; }
  }
  if (taxBest) cands.push(taxBest);

  cands.sort((x, y) => y.score - x.score);
  const out = []; const ctx = newCtx();
  for (const cd of cands) {
    if (out.length >= MAX_ORDERS) break;
    if (!checkOrder(S, pid, cd.order, ctx)) { commitOrder(S, pid, cd.order, ctx); out.push(cd.order); }
  }
  me.idle = out.some(o => o.type === 'march' && S.counties[o.to].owner !== pid) ? 0 : idle + 1;
  // garrison stances (free, secret)
  for (const c of S.counties) {
    if (S.units.some(u => u.owner === pid && u.county === c.id)) {
      me.garrison[c.id] = (me.lastEnemyStance && rnd(S) < 0.3) ? counterOfStance(me.lastEnemyStance) : pickWeighted(S, STANCES, [1, 1.3, 1]);
    }
  }
  return out;
}

const BOTR = {
  SEASONS, STANCES, STANCE_INFO, BEATS, MAX_ORDERS, UNITS, UNIT_TYPES, TAX, TERRAIN, MAP, MAP_DEF, PLAYER_DEF, TURN_LIMIT,
  STANCE_BONUS, DECISIVE, BANNER_MULT,
  newGame, resolveTurn, runTurn, aiOrders, defaultChoice,
  checkOrder, checkNewOrder, validateOrders, sanitizeOrders, ctxFromOrders, describeOrder, pickMerge,
  ustr, ucost, ufood, uwage, wagesFor, ulabel, sumStr, describeUnits, unitById, unitsAt, armyStrength, countiesOf,
  incomeFor, harvestFor, foodNeedFor, countyIncome, occupied, terrainDef, sideStrength, hostileAt
};
if (typeof module !== 'undefined' && module.exports) module.exports = BOTR;
root.BOTR = BOTR;
})(typeof window !== 'undefined' ? window : globalThis);
