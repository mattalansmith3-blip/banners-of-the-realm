/* Banners of the Realm - browser UI */
(function () {
'use strict';
const B = window.BOTR;
const { MAP, MAP_DEF, UNITS, STANCES, STANCE_INFO, TAX, TERRAIN, SEASONS } = B;
const ME = 0, FOE = 1;
const SEASON_ICON = ['🌱', '☀️', '🍂', '❄️'];
const $ = s => document.querySelector(s);
const SAVE_KEY = 'botr_save_v1';

let S, orders = [], sel = null, selUnits = new Set(), selFor = null, marchStance = 'charge';
let phase = 'plan';                 // plan | reveal | over
let gen = null, answer, fast = false, timer = null;
let curArrow = null, flashC = null, uiMsg = '';
const lastSig = {};

/* ---------------------------------------------------------------- helpers */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cn = i => MAP_DEF[i].name;
const pl = i => i < 0 ? { short: 'Garrison', color: '#8b7a52' } : S.players[i];
const ownerClass = o => o === 0 ? 'p0' : o === 1 ? 'p1' : 'n';
const f1 = x => (Math.round(x * 10) / 10).toString();

function ctx() { return B.ctxFromOrders(S, ME, orders); }
function freeUnits(cid) { const c = ctx(); return S.units.filter(u => u.owner === ME && u.county === cid && !c.used.has(u.id)); }
function happyInfo(h) {
  if (h >= 75) return { t: 'Joyful', e: '😄', c: '#4c8a3a' };
  if (h >= 50) return { t: 'Content', e: '🙂', c: '#7a9a3a' };
  if (h >= 30) return { t: 'Uneasy', e: '😐', c: '#c9a227' };
  if (h >= 20) return { t: 'Grumbling', e: '😟', c: '#c9762a' };
  return { t: 'Unrest (no taxes)', e: '😠', c: '#a6302b' };
}

/* ---------------------------------------------------------------- map geometry */
const hullTest = p => Math.pow((p[0] - 500) / 492, 2) + Math.pow((p[1] - 350) / 338, 2) > 0.995;
function hash(a, b) { const x = Math.sin(a[0] * 12.9898 + a[1] * 78.233 + b[0] * 37.719 + b[1] * 4.581) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
function cellPath(i) {
  const poly = MAP.cells[i]; let d = 'M' + poly[0][0].toFixed(1) + ' ' + poly[0][1].toFixed(1);
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length];
    if (hullTest(p) && hullTest(q)) { d += 'L' + q[0].toFixed(1) + ' ' + q[1].toFixed(1); continue; }
    const rp = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10], rq = [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10];
    const fw = rp[0] < rq[0] || (rp[0] === rq[0] && rp[1] < rq[1]);
    const a = fw ? p : q, b = fw ? q : p, ra = fw ? rp : rq, rb = fw ? rq : rp;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
    const off = hash(ra, rb) * len * 0.13;
    const cx = (a[0] + b[0]) / 2 + nx * off, cy = (a[1] + b[1]) / 2 + ny * off;
    d += 'Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + q[0].toFixed(1) + ' ' + q[1].toFixed(1);
  }
  return d + 'Z';
}
const PATHS = MAP_DEF.map((_, i) => cellPath(i));
const HULL = 'M' + Array.from({ length: 32 }, (_, i) => { const a = i / 32 * Math.PI * 2; return (500 + 492 * Math.cos(a)).toFixed(1) + ' ' + (350 + 338 * Math.sin(a)).toFixed(1); }).join('L') + 'Z';
const DEFS = `
<defs>
 <pattern id="p-forest" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="7" cy="9" r="5" fill="#2f5a2a" opacity=".5"/><circle cx="19" cy="19" r="5" fill="#2f5a2a" opacity=".5"/><circle cx="21" cy="6" r="3" fill="#3d6d33" opacity=".45"/></pattern>
 <pattern id="p-hills" width="30" height="22" patternUnits="userSpaceOnUse"><path d="M2 18 q7 -13 14 0 M16 10 q6 -9 12 0" stroke="#6b5530" stroke-width="2" fill="none" opacity=".55"/></pattern>
 <pattern id="p-mountains" width="30" height="26" patternUnits="userSpaceOnUse"><path d="M3 23 l8 -17 l8 17z" fill="#6d6559" opacity=".6"/><path d="M8 12 l3 -6 l3 6z" fill="#fff" opacity=".7"/><path d="M19 23 l5 -10 l5 10z" fill="#7a7266" opacity=".55"/></pattern>
 <pattern id="p-marsh" width="28" height="20" patternUnits="userSpaceOnUse"><path d="M3 7 h8 M15 15 h9 M8 14 v-5 M20 7 v-4" stroke="#2f5f66" stroke-width="2" fill="none" opacity=".55"/></pattern>
 <pattern id="p-plains" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="1.4" fill="#8f7f3f" opacity=".5"/><circle cx="15" cy="12" r="1.4" fill="#8f7f3f" opacity=".5"/><circle cx="8" cy="18" r="1.2" fill="#8f7f3f" opacity=".4"/></pattern>
 <marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#ffd34d" stroke="#000" stroke-width="1"/></marker>
 <marker id="ah0" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#2f5f9e"/></marker>
 <marker id="ah1" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#a6302b"/></marker>
</defs>`;
const SHIELD = 'M-21 -13 h42 v15 q0 11 -21 17 q-21 -6 -21 -17z';

function renderMap() {
  const narrow = window.innerWidth < 700, K = narrow ? 1.55 : 1;
  document.body.classList.toggle('narrow', narrow);
  const parts = [DEFS, `<path d="${HULL}" fill="#e9dcae" stroke="#e9dcae" stroke-width="22" stroke-linejoin="round" opacity=".9"/>`];
  const adj = sel != null ? MAP.adj[sel] : [];
  const order = MAP_DEF.map((_, i) => i).sort((a, b) => (a === sel) - (b === sel));
  const tokens = [];
  for (const i of order) {
    const c = S.counties[i], d = MAP_DEF[i], cen = MAP.centroid[i];
    const owner = c.owner;
    const cls = ['cg'];
    if (i === sel) cls.push('sel'); else if (adj.includes(i)) cls.push('adj');
    if (flashC && flashC.id === i) cls.push(flashC.bad ? 'flashbad' : 'flash');
    parts.push(`<g class="${cls.join(' ')}" data-c="${i}">
      <path class="cell" d="${PATHS[i]}" fill="${TERRAIN[d.terrain].color}"/>
      ${owner >= 0 ? `<path d="${PATHS[i]}" fill="${S.players[owner].color}" opacity=".42" pointer-events="none"/>` : ''}
      <path d="${PATHS[i]}" fill="url(#p-${d.terrain})" pointer-events="none"/>
    </g>`);
  }
  // labels, castles, tokens on top (non-interactive except via delegate on tokens)
  for (let i = 0; i < MAP.n; i++) {
    const c = S.counties[i], d = MAP_DEF[i], cen = MAP.centroid[i];
    const cx = cen[0], cy = cen[1];
    const isCap = d.capital !== undefined;
    let g = `<g data-c="${i}" style="cursor:pointer">`;
    if (isCap) {
      const pcol = S.players[d.capital].color;
      g += `<text x="${cx}" y="${cy - 36}" font-size="30" text-anchor="middle" style="pointer-events:none">🏰</text>`;
      g += `<path d="M${cx + 10} ${cy - 62} v-14 l16 5 l-16 5" fill="${pcol}" stroke="#222" stroke-width="1" pointer-events="none"/>`;
      if (c.occ) g += `<circle class="siege" cx="${cx}" cy="${cy - 30}" r="26"/>`;
    }
    g += `<text class="cname" x="${cx}" y="${cy - (isCap ? 3 : 14)}">${esc(d.name)}</text>`;
    const hi = happyInfo(c.happiness);
    if (c.owner >= 0) g += `<text class="csub" x="${cx}" y="${cy + (isCap ? 10 : -1)}">${hi.e} ${c.tax !== 'normal' ? (c.tax === 'high' ? '💰↑' : '💰↓') : ''}</text>`;
    else if (!narrow) g += `<text class="csub" x="${cx}" y="${cy - 1}">${TERRAIN[d.terrain].name}</text>`;
    const owners = [...new Set(S.units.filter(u => u.county === i).map(u => u.owner))].sort((a, b) => a - b);
    const w = 48 * K, startX = cx - (owners.length * w) / 2 + w / 2;
    owners.forEach((o, k) => {
      const us = S.units.filter(u => u.county === i && u.owner === o);
      const pw = B.sumStr(us), hasB = us.some(u => u.banner);
      const sig = i + ':' + o + ':' + us.length + ':' + Math.round(pw);
      const x = startX + k * w, y = cy + (isCap ? 26 : 16) * (narrow ? 1.5 : 1);
      const key = i + '_' + o;
      const pop = phase === 'reveal' && lastSig[key] !== sig && lastSig[key] !== undefined ? ' pop' : '';
      lastSig[key] = sig;
      const col = o < 0 ? '#7d6e48' : S.players[o].color;
      g += `<g class="tok${pop}" transform="translate(${x} ${y}) scale(${K})"><path d="${SHIELD}" fill="${col}" stroke="${hasB ? '#ffd34d' : '#1b1208'}" stroke-width="${hasB ? 3 : 2}"/>
        <text class="n" y="3">${Math.round(pw)}</text><text class="u" y="14">${us.length}u${hasB ? '★' : ''}</text></g>`;
    });
    g += '</g>';
    parts.push(g);
  }
  // cleanup stale lastSig for emptied counties
  for (const k of Object.keys(lastSig)) { const [ci, o] = k.split('_').map(Number); if (!S.units.some(u => u.county === ci && u.owner === o)) delete lastSig[k]; }
  // planned arrows
  for (const o of orders) if (o.type === 'march') {
    const a = MAP.centroid[o.from], b = MAP.centroid[o.to];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const x1 = a[0] + dx / L * 28, y1 = a[1] + dy / L * 28, x2 = b[0] - dx / L * 40, y2 = b[1] - dy / L * 40;
    parts.push(`<path class="arrow plan" d="M${x1} ${y1} L${x2} ${y2}" marker-end="url(#ah)"/>`);
    parts.push(`<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 6}" font-size="20" text-anchor="middle" style="pointer-events:none">${STANCE_INFO[o.stance].icon}</text>`);
  }
  for (const o of orders) if (o.type !== 'march') {
    const cen = MAP.centroid[o.county];
    parts.push(`<text x="${cen[0] + 34}" y="${cen[1] - 4}" font-size="18" style="pointer-events:none">${o.type === 'recruit' ? '➕' : o.type === 'merge' ? '⚜️' : '💰'}</text>`);
  }
  if (curArrow) {
    const a = MAP.centroid[curArrow.from], b = MAP.centroid[curArrow.to];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    parts.push(`<path class="arrow ev" d="M${a[0] + dx / L * 20} ${a[1] + dy / L * 20} L${b[0] - dx / L * 34} ${b[1] - dy / L * 34}" stroke="${S.players[curArrow.owner].color}" marker-end="url(#ah${curArrow.owner})"/>`);
  }
  if (flashC && flashC.bad) {
    const cen = MAP.centroid[flashC.id];
    parts.push(`<text x="${cen[0]}" y="${cen[1] + 4}" font-size="46" text-anchor="middle" class="pulse" style="pointer-events:none">⚔️</text>`);
  }
  $('#map').innerHTML = parts.join('');
}

/* ---------------------------------------------------------------- header */
function chip(html, cls) { return `<span class="chip ${cls || ''}">${html}</span>`; }
function renderHeader() {
  const me = S.players[ME], foe = S.players[FOE];
  const inc = B.incomeFor(S, ME), wages = B.wagesFor(S, ME), harv = B.harvestFor(S, ME), need = B.foodNeedFor(S, ME);
  const myUnits = S.units.filter(u => u.owner === ME), fUnits = S.units.filter(u => u.owner === FOE);
  const netG = inc - wages, netF = harv - need;
  const badge = $('#seasonBadge');
  badge.textContent = `${SEASON_ICON[S.season]} ${SEASONS[S.season]} · Year ${S.year}`;
  badge.className = 'season' + (S.season === 3 ? ' winter' : '');
  let h = '';
  h += chip(`🪙 <b>${me.gold}</b> <span class="sub">${netG >= 0 ? '+' : ''}${netG}/season (${inc} tax − ${wages} wages)</span>`, me.gold + netG < 0 ? 'bad' : '');
  h += chip(`🌾 <b>${Math.round(me.grain)}</b> <span class="sub">${netF >= 0 ? '+' : ''}${netF} this season${harv ? ' (harvest!)' : ''} (−${need} food)</span>`, me.grain + netF < 0 ? 'bad' : '');
  h += chip(`🏰 <b>${B.countiesOf(S, ME).length}</b>/${MAP.n} counties`);
  h += chip(`⚔️ <b>${myUnits.length}</b> units · power <b>${Math.round(B.sumStr(myUnits))}</b>`);
  h += chip(`📜 <b>${orders.length}</b>/${B.MAX_ORDERS} orders`);
  h += chip(`${esc(foe.short)}: 🏰 ${B.countiesOf(S, FOE).length} · ⚔️ ${fUnits.length} units · power ${Math.round(B.sumStr(fUnits))}`, 'rival');
  if (S.season === 3) h += chip('❄️ Winter: double food, snow may block marches', 'winter');
  if (S.season === 2) h += chip('🍂 Autumn: harvest comes in');
  const occ = S.counties[me.capital].occ;
  if (occ) h += chip('🚩 YOUR BANNER IS UNDER SIEGE!', 'bad');
  const focc = S.counties[foe.capital].occ;
  if (focc) h += chip('🚩 You hold their capital: hold one more season to win!', '');
  $('#resbar').innerHTML = h;
  $('#maphead').innerHTML = phase === 'reveal' ? '<b>The orders are revealed…</b> watch the map and the Chronicle.' :
    `Goal: seize <b>${esc(cn(foe.capital))}</b> with infantry and hold it a full season. Protect <b>${esc(cn(me.capital))}</b>.`;
}

/* ---------------------------------------------------------------- county panel */
function powerNote(cid) {
  const us = S.units.filter(u => u.county === cid && u.owner !== ME);
  if (!us.length) return { txt: 'undefended', p: 0 };
  const bonus = 1 + B.terrainDef(cid) + (MAP_DEF[cid].capital !== undefined ? 0.3 : 0);
  const p = B.sumStr(us) * bonus;
  return { txt: `${B.describeUnits(us)} ≈ ${f1(p)} power`, p };
}
function renderCounty() {
  const el = $('#countyPanel');
  if (sel == null) {
    el.innerHTML = `<h2>County</h2><p class="muted">Tap a county on the map to see it, then give orders to your armies there. You get up to <b>${B.MAX_ORDERS}</b> secret orders per season, so choose wisely.</p>${uiMsg ? `<p class="muted"><b>${esc(uiMsg)}</b></p>` : ''}`;
    return;
  }
  const c = S.counties[sel], d = MAP_DEF[sel], t = TERRAIN[d.terrain];
  const hi = happyInfo(c.happiness);
  const mine = c.owner === ME;
  const ownerTag = c.owner < 0 ? '<span class="tag n">Unclaimed</span>' : `<span class="tag ${ownerClass(c.owner)}">${esc(S.players[c.owner].name)}</span>`;
  let h = `<div class="panelhead"><h2>${esc(d.name)} ${d.capital !== undefined ? '🏰' : ''}</h2>${ownerTag}</div>`;
  if (uiMsg) h += `<div class="ev warn" style="margin:6px 0">${esc(uiMsg)}</div>`;
  const defb = Math.round((t.def + (d.capital !== undefined ? 0.3 : 0)) * 100);
  h += `<div class="kv"><span>Terrain</span><span>${t.name} (+${defb}% to defenders${d.capital !== undefined ? ', incl. castle' : ''})</span>
    <span>Peasants</span><span>${c.pop}</span>
    <span>Fields</span><span>${d.fert >= 1 ? 'Rich' : d.fert >= 0.8 ? 'Fair' : d.fert >= 0.6 ? 'Poor' : 'Barren'} (harvest ≈ ${Math.round(c.pop * d.fert * 0.7)})</span>`;
  if (c.owner >= 0) h += `<span>Mood</span><span>${hi.e} ${hi.t} (${Math.round(c.happiness)})</span>`;
  h += '</div>';
  if (c.owner >= 0) h += `<div class="bar"><i style="width:${c.happiness}%;background:${hi.c}"></i></div>`;
  if (c.occ) h += `<div class="ev alarm">🚩 Banner siege: ${esc(S.players[c.occ.by].short)}'s infantry hold this castle (${c.occ.count}/2 seasons).</div>`;
  if (c.owner >= 0 && c.resent > 0) h += `<div class="muted">Recently conquered: the people resent their new lord (${c.resent} more seasons).</div>`;
  if (mine) {
    const pend = orders.find(o => o.type === 'tax' && o.county === sel);
    h += `<h3>Taxes ${pend ? '(order set)' : ''}</h3><div class="seg">`;
    for (const r of ['low', 'normal', 'high']) {
      const shown = pend ? pend.rate : c.tax;
      const inc = Math.round(c.pop * 0.15 * TAX[r].mult);
      h += `<button class="btn ${shown === r ? 'on' : ''}" data-tax="${r}" ${phase !== 'plan' ? 'disabled' : ''}>${TAX[r].name}<br><small>${inc}g · ${TAX[r].happy > 0 ? '+' : ''}${TAX[r].happy} mood</small></button>`;
    }
    h += `</div><div class="muted">Changing a county's tax costs one order. Below mood 20 the people pay nothing.</div>`;
  }
  // units
  const here = S.units.filter(u => u.county === sel);
  const free = freeUnits(sel);
  const freeIds = new Set(free.map(u => u.id));
  if (selFor !== sel) { selFor = sel; selUnits = new Set(free.map(u => u.id)); }
  for (const id of [...selUnits]) if (!freeIds.has(id)) selUnits.delete(id);
  h += '<h3>Troops here</h3>';
  if (!here.length) h += '<div class="muted">No troops.</div>';
  for (const o of [ME, FOE, -1]) {
    const us = here.filter(u => u.owner === o);
    if (!us.length) continue;
    h += `<div class="muted"><span class="tag ${ownerClass(o)}">${esc(pl(o).short)}</span> power ${f1(B.sumStr(us))}</div>`;
    for (const u of us) {
      const isFree = o === ME && freeIds.has(u.id);
      if (o === ME) {
        h += `<div class="unit ${isFree ? '' : 'used'}"><label><input type="checkbox" data-unit="${u.id}" ${selUnits.has(u.id) ? 'checked' : ''} ${isFree && phase === 'plan' ? '' : 'disabled'}> ${UNITS[u.type].icon} ${esc(B.ulabel(u))}${u.pressed ? ' <i>(pressed)</i>' : ''}${isFree ? '' : ' <i>(ordered)</i>'}</label><span class="str">${f1(B.ustr(u))}</span></div>`;
      } else {
        h += `<div class="unit foe"><span>${UNITS[u.type].icon} ${esc(B.ulabel(u))}</span><span class="str">${f1(B.ustr(u))}</span></div>`;
      }
    }
  }
  if (here.some(u => u.owner === ME)) {
    const g = S.players[ME].garrison[sel] || 'hold';
    h += `<h3>Garrison stance <span class="muted" style="text-transform:none;letter-spacing:0">(free · secret · used when troops here are attacked)</span></h3><div class="seg">`;
    for (const s of STANCES) h += `<button class="btn ${g === s ? 'on' : ''}" data-gar="${s}">${STANCE_INFO[s].icon} ${STANCE_INFO[s].name}</button>`;
    h += '</div>';
  }
  if (phase === 'plan') {
    // march
    if (free.length) {
      h += `<h3>March</h3>`;
      h += `<div class="muted">Selected: <b>${selUnits.size}</b> unit(s), power <b>${f1(B.sumStr(free.filter(u => selUnits.has(u.id))))}</b>. Choose a secret stance:</div><div class="seg" style="margin:4px 0">`;
      for (const s of STANCES) h += `<button class="btn ${marchStance === s ? 'on' : ''}" data-stance="${s}">${STANCE_INFO[s].icon} ${STANCE_INFO[s].name}</button>`;
      h += `</div><div class="muted">⚔️ Charge beats Flank · 🛡️ Hold beats Charge · 🏹 Flank beats Hold (+40% power)</div>`;
      const selPower = B.sumStr(free.filter(u => selUnits.has(u.id)));
      for (const n of MAP.adj[sel]) {
        const nc = S.counties[n];
        const pn = powerNote(n);
        let cls = 'own', desc = 'friendly county';
        if (nc.owner !== ME) {
          const ratio = pn.p === 0 ? 9 : selPower / pn.p;
          cls = ratio >= 1.5 ? 'good' : ratio >= 0.9 ? 'even' : 'bad';
          desc = (nc.owner < 0 ? 'unclaimed' : esc(S.players[nc.owner].short)) + ': ' + (pn.p === 0 ? 'undefended' : pn.txt);
        } else if (pn.p) { desc = 'friendly county · enemy here: ' + pn.txt; }
        const snow = S.season === 3 && nc.owner !== ME ? ' · ❄️ 50% snowbound' : '';
        h += `<button class="dest ${cls}" data-dest="${n}" ${selUnits.size ? '' : 'disabled'}>→ <b>${esc(cn(n))}</b> <small>${desc}${snow}</small></button>`;
      }
    }
    // recruit
    if (mine) {
      const hostile = B.hostileAt(S, sel, ME);
      h += '<h3>Recruit</h3><div class="seg">';
      for (const ut of B.UNIT_TYPES) {
        const u = UNITS[ut];
        const err = B.checkNewOrder(S, ME, { type: 'recruit', unit: ut, county: sel }, orders);
        h += `<button class="btn" data-rec="${ut}" ${err ? 'disabled' : ''} title="${esc(err || '')}">${u.icon} ${u.name}<br><small>${u.cost}g · pow ${u.str}${u.capitalOnly ? ' · capital' : ''}</small></button>`;
      }
      h += '</div>';
      if (hostile) h += '<div class="muted">Enemies occupy this county: no recruiting.</div>';
      const merges = B.UNIT_TYPES.filter(ut => !B.checkNewOrder(S, ME, { type: 'merge', unit: ut, county: sel }, orders));
      h += '<h3>Banners</h3>';
      if (merges.length) for (const ut of merges) h += `<button class="btn opt" data-merge="${ut}">⚜️ Merge 3 ${UNITS[ut].plural} → Banner of ${UNITS[ut].plural} <small>(power ${3 * UNITS[ut].str} → ${f1(9 * UNITS[ut].str / 2)}; lost whole if beaten)</small></button>`;
      else h += `<div class="muted">Three free, identical units in one county can merge into a Banner worth 1.5× their sum.</div>`;
    }
  }
  el.innerHTML = h;
}

/* ---------------------------------------------------------------- orders panel */
function renderOrders() {
  const el = $('#ordersPanel');
  let h = `<div class="panelhead"><h2>Secret Orders</h2><span class="chip">${orders.length}/${B.MAX_ORDERS}</span></div>`;
  if (!orders.length) h += `<p class="muted">No orders yet: your armies will hold their ground. Rivals' orders stay hidden until you seal yours.</p>`;
  else {
    h += '<ul class="orderlist">';
    orders.forEach((o, i) => { h += `<li class="${o.type}"><span>${esc(B.describeOrder(S, o))}</span><button class="x" data-rm="${i}" title="Remove" ${phase !== 'plan' ? 'disabled' : ''}>✕</button></li>`; });
    h += '</ul>';
  }
  const label = phase === 'plan' ? `📜 Seal Orders (${orders.length}/${B.MAX_ORDERS})` : phase === 'reveal' ? 'Revealing…' : 'Game over';
  h += `<div class="sealmain"><button class="btn primary" data-seal ${phase !== 'plan' ? 'disabled' : ''}>${label}</button></div>`;
  el.innerHTML = h;
  $('#sealbar').innerHTML = `<button class="btn primary" data-seal ${phase !== 'plan' ? 'disabled' : ''}>${label}</button>`;
}

/* ---------------------------------------------------------------- log */
function appendLog(ev, isNew) {
  const log = $('#log');
  const div = document.createElement('div');
  div.className = 'ev ' + ev.kind + (isNew ? ' new' : '');
  if (ev.battle) {
    const b = ev.battle, sn = s => STANCE_INFO[s].icon + ' ' + STANCE_INFO[s].name;
    const side = (x, win) => `<div class="s ${win ? 'win' : ''}"><b>${esc(pl(x.owner).short)} · ${sn(x.stance)}</b>power ${f1(x.power)}<br><small>${esc(x.units)}</small></div>`;
    div.innerHTML = `<b>⚔ Clash ${esc(b.label || '')}</b><div class="bcard">${side(b.a, b.winner === b.a.owner)}<div class="vs">VS</div>${side(b.b, b.winner === b.b.owner)}</div><div class="bnote">${esc(b.note)}. ${esc(b.outcome)}</div>`;
  } else div.textContent = ev.text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}
function rebuildLog() { $('#log').innerHTML = ''; for (const ev of S.log.slice(-40)) appendLog(ev, false); }

/* ---------------------------------------------------------------- modal */
function showModal(html) { $('#modalbox').innerHTML = html; $('#modal').hidden = false; }
function hideModal() { $('#modal').hidden = true; }
function helpHtml() {
  return `<h2>How to Play</h2>
  <p>You are <b>House Aldric</b> (blue). Rival <b>House Valmoor</b> (red) rules the east. Each of you keeps a <b>Royal Banner</b> in a capital castle 🏰.</p>
  <h3>Win</h3><p>March <b>infantry</b> (not knights) into <b>Ironhold</b> and hold it, with no defenders left, through a <b>full season</b> to capture the Royal Banner. Lose Highmere the same way and you lose. After 20 years the player with most land is crowned.</p>
  <h3>Each season</h3>
  <ul><li><b>Plan:</b> give up to <b>5 secret orders</b>: <i>march</i> troops to an adjacent county with a secret stance, <i>recruit</i> a unit, <i>merge</i> three identical units into a Banner, or change a county's <i>tax</i>. Garrison stance (how defenders brace) is free.</li>
  <li><b>Seal Orders:</b> the AI has already sealed its own. Everything resolves <b>at once</b>: decrees, recruits, movement, clashes, then the economy. Watch the Chronicle; use Skip to speed it up.</li></ul>
  <h3>Battles</h3>
  <ul><li>Stances: ⚔️ Charge beats 🏹 Flank, 🛡️ Hold beats ⚔️ Charge, 🏹 Flank beats 🛡️ Hold: the winner gets <b>+40% power</b>.</li>
  <li>Defenders get terrain bonus (hills +20%, forest/marsh +10%, mountains +30%, castle +30%). Unit counters add up to +50%: Archers vs Levies (and Knights when defending), Men-at-arms vs Archers, Knights vs Men-at-arms &amp; Levies.</li>
  <li>If the winner has 1.3× the loser's power, the loser is <b>captured</b> and you choose to <b>ransom</b> (gold), <b>press into service</b> (they join you, weaker, and desert if beaten) or <b>release</b> (+mood, they go home). Narrow wins just rout the loser.</li>
  <li>Armies that pass each other in opposite directions fight on the road. A <b>Banner</b> unit (3 identical units) is worth 1.5× the sum but is captured whole if it loses.</li></ul>
  <table><tr><th>Unit</th><th>Power</th><th>Cost</th><th>Wage</th><th>Food</th><th>Beats</th></tr>
  <tr><td>🔱 Levy</td><td>1</td><td>8g</td><td>1</td><td>1</td><td>-</td></tr>
  <tr><td>🏹 Archers</td><td>2</td><td>20g</td><td>1</td><td>1</td><td>Levy (Knights on defense)</td></tr>
  <tr><td>🗡️ Men-at-arms</td><td>3</td><td>35g</td><td>2</td><td>2</td><td>Archers</td></tr>
  <tr><td>🐴 Knights</td><td>5</td><td>70g (capital only)</td><td>3</td><td>3</td><td>Men-at-arms, Levy</td></tr></table>
  <h3>Economy</h3>
  <ul><li><b>Gold</b> comes from taxes (Low/Normal/High) and ransoms; troops draw wages each season.</li>
  <li><b>Grain</b>: the harvest arrives in <b>Autumn</b>; every season peasants and troops eat. <b>Winter doubles food use</b> and each march into land you don't own has a 50% chance of being snowed in. Starvation or unpaid wages make troops desert.</li>
  <li><b>Mood</b>: high taxes and recent conquest sour it; low taxes and mercy sweeten it. Below 20 a county pays no tax.</li>
  <li>Take unclaimed counties early for more gold and grain, but keep your capital defended!</li></ul>
  <p class="muted">Tip: the rival can't see your garrison stances or your orders either; mix up your stances.</p>
  <button class="btn primary" id="closeHelp">To arms!</button>`;
}
function choiceModal(info, cb) {
  const loser = info.loser >= 0 ? S.players[info.loser].short : 'the garrison';
  showModal(`<h2>Prisoners taken!</h2>
   <p>Your victory at <b>${esc(cn(info.county))}</b> leaves <b>${esc(info.desc)}</b> of ${esc(loser)} in your hands. What is your decree?</p>
   <button class="btn opt" data-choice="ransom">💰 <b>Ransom</b> for <b>${info.value} gold</b><br><small>${info.loser >= 0 ? esc(loser) + ' pays (what they can) and the men go home to their capital.' : 'Local lords pay for the garrison.'}</small></button>
   <button class="btn opt" data-choice="press">⚔️ <b>Press into service</b><br><small>They join your army at 85% strength, cost upkeep, and desert if their new army is beaten.</small></button>
   <button class="btn opt" data-choice="release">🕊️ <b>Release</b><br><small>+3 mood in all your counties; the men return home.</small></button>`);
  $('#modalbox').onclick = e => { const b = e.target.closest('[data-choice]'); if (b) { $('#modalbox').onclick = null; hideModal(); cb(b.dataset.choice); } };
}
function gameOverModal() {
  const o = S.over;
  let title, text, icon;
  if (o.winner === null) { title = 'A Draw'; icon = '⚖️'; text = 'Both banners fell in the same season. The realm dissolves in chaos.'; }
  else if (o.winner === ME) { title = 'Victory!'; icon = '👑'; text = o.reason === 'banner' ? `Your infantry held ${cn(S.players[FOE].capital)} and the Royal Banner of ${S.players[FOE].name} is yours. The kingdom kneels.` : 'After twenty years of war, you hold the most land and are crowned.'; }
  else { title = 'Defeat'; icon = '💀'; text = o.reason === 'banner' ? `${S.players[FOE].name} has taken your Royal Banner at ${cn(S.players[ME].capital)}. Your line ends here.` : 'After twenty years of war, the rival holds more land and takes the crown.'; }
  showModal(`<div class="big">${icon}</div><h2 style="text-align:center">${title}</h2><p style="text-align:center">${esc(text)}</p>
    <p class="muted" style="text-align:center">${SEASONS[S.season]}, Year ${S.year} · you hold ${B.countiesOf(S, ME).length} counties, the rival ${B.countiesOf(S, FOE).length}.</p>
    <button class="btn primary" id="again">Play again</button>`);
}

/* ---------------------------------------------------------------- game flow */
function save() { try { if (S && !S.over) localStorage.setItem(SAVE_KEY, JSON.stringify(S)); else localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
function newGame(seed) {
  S = B.newGame(seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed, { humans: [ME] });
  orders = []; sel = S.players[ME].capital; selFor = null; phase = 'plan'; curArrow = null; flashC = null; uiMsg = '';
  S.log.push({ text: 'Spring of Year 1. Your lords await your commands, my liege.', kind: 'phase', season: 0, year: 1 });
  rebuildLog(); render(); save();
}
function render() { renderHeader(); renderMap(); renderCounty(); renderOrders(); }

function addOrder(o) {
  uiMsg = '';
  const err = B.checkNewOrder(S, ME, o, orders);
  if (err) { uiMsg = err; render(); return; }
  orders.push(o); render();
}
function seal() {
  if (phase !== 'plan') return;
  const mine = B.sanitizeOrders(S, ME, orders);
  const aiO = B.aiOrders(S, FOE);
  phase = 'reveal'; fast = false; uiMsg = '';
  $('#btnSkip').hidden = false;
  gen = B.resolveTurn(S, [mine, aiO]);
  answer = undefined;
  orders = [];
  render();
  schedule(300);
}
function schedule(ms) { clearTimeout(timer); timer = setTimeout(step, fast ? 0 : ms); }
function evDelay(ev) { return ev.kind === 'phase' ? 450 : ev.kind === 'battle' ? 1500 : ev.kind === 'move' ? 800 : ev.kind === 'econ' ? 500 : 750; }
function step() {
  if (phase !== 'reveal') return;
  let r;
  try { r = gen.next(answer); } catch (e) { console.error(e); phase = 'plan'; uiMsg = 'Internal error: ' + e.message; render(); return; }
  answer = undefined;
  if (r.done) return finishTurn();
  const ev = r.value;
  if (ev.kind === 'choice') {
    appendLog({ text: ev.text, kind: 'capture' }, !fast);
    if (ev.player === ME) {
      flashC = { id: ev.county, bad: false }; render();
      choiceModal(ev, c => { answer = c; schedule(100); });
    } else { answer = B.defaultChoice(S, ev); schedule(fast ? 0 : 350); }
    return;
  }
  appendLog(ev, !fast);
  curArrow = ev.arrow || null;
  flashC = ev.county != null && ev.kind !== 'phase' && ev.kind !== 'econ' ? { id: ev.county, bad: ev.kind === 'battle' } : null;
  if (ev.kind === 'alarm' || ev.kind === 'win') flashC = { id: ev.county, bad: true };
  render();
  if (fast) step(); else schedule(evDelay(ev));
}
function finishTurn() {
  clearTimeout(timer);
  curArrow = null; flashC = null; gen = null;
  $('#btnSkip').hidden = true;
  if (S.over) { phase = 'over'; render(); save(); gameOverModal(); return; }
  phase = 'plan'; uiMsg = '';
  if (sel != null) selFor = null;
  const alert = S.counties[S.players[ME].capital].occ;
  if (alert) uiMsg = 'Your capital is besieged! Retake Highmere or lose the banner.';
  render(); save();
}

/* ---------------------------------------------------------------- events */
document.addEventListener('click', e => {
  const t = e.target;
  const cg = t.closest && t.closest('#map [data-c]');
  if (cg) { sel = +cg.dataset.c; selFor = null; uiMsg = ''; render(); return; }
  const q = (a) => t.closest && t.closest(a);
  let b;
  if ((b = q('[data-seal]'))) { seal(); return; }
  if ((b = q('[data-rm]'))) { if (phase === 'plan') { orders.splice(+b.dataset.rm, 1); selFor = null; uiMsg = ''; render(); } return; }
  if ((b = q('[data-tax]'))) { const c = S.counties[sel]; const ex = orders.findIndex(o => o.type === 'tax' && o.county === sel); if (ex >= 0) orders.splice(ex, 1); if (b.dataset.tax !== c.tax) addOrder({ type: 'tax', county: sel, rate: b.dataset.tax }); else render(); return; }
  if ((b = q('[data-gar]'))) { S.players[ME].garrison[sel] = b.dataset.gar; save(); render(); return; }
  if ((b = q('[data-stance]'))) { marchStance = b.dataset.stance; render(); return; }
  if ((b = q('[data-dest]'))) {
    const units = freeUnits(sel).filter(u => selUnits.has(u.id)).map(u => u.id);
    const before = orders.length;
    addOrder({ type: 'march', from: sel, to: +b.dataset.dest, units, stance: marchStance });
    if (orders.length > before) { selFor = null; render(); }
    return;
  }
  if ((b = q('[data-rec]'))) { addOrder({ type: 'recruit', unit: b.dataset.rec, county: sel }); return; }
  if ((b = q('[data-merge]'))) { addOrder({ type: 'merge', unit: b.dataset.merge, county: sel }); selFor = null; render(); return; }
  if (t.id === 'closeHelp') { try { localStorage.setItem('botr_seen', '1'); } catch (er) { } hideModal(); return; }
  if (t.id === 'again') { hideModal(); newGame(); return; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.unit) { const id = +t.dataset.unit; if (t.checked) selUnits.add(id); else selUnits.delete(id); render(); }
});
$('#btnHelp').onclick = () => showModal(helpHtml());
$('#btnNew').onclick = () => {
  showModal(`<h2>New Game?</h2><p>Abandon this campaign and start a fresh one?</p><div class="row"><button class="btn primary" id="yesNew" style="width:auto;flex:1">Yes, new game</button><button class="btn" id="noNew" style="flex:1">Keep playing</button></div>`);
  $('#yesNew').onclick = () => { clearTimeout(timer); hideModal(); $('#btnSkip').hidden = true; newGame(); };
  $('#noNew').onclick = hideModal;
};
$('#btnSkip').onclick = () => { fast = true; clearTimeout(timer); step(); };
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && phase !== 'over' && !$('#modalbox').querySelector('[data-choice]')) hideModal(); });

/* ---------------------------------------------------------------- boot */
(function boot() {
  let restored = false;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.v === 1 && !s.over && s.players && s.counties.length === MAP.n) { S = s; restored = true; } }
  } catch (e) { /* ignore */ }
  if (restored) { orders = []; sel = S.players[ME].capital; phase = 'plan'; rebuildLog(); render(); }
  else newGame();
  let seen = false; try { seen = !!localStorage.getItem('botr_seen'); } catch (e) { }
  if (!seen) showModal(helpHtml());
  // test hooks
  window.addEventListener('resize', () => { if (S && (window.innerWidth < 700) !== document.body.classList.contains('narrow')) render(); });
  window.__botr = { get S() { return S; }, get orders() { return orders; }, seal, newGame, select: i => { sel = i; selFor = null; render(); }, addOrder, skip: () => { fast = true; step(); }, get phase() { return phase; }, setFast: v => { fast = v; } };
})();
})();
