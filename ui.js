/* Banners of the Realm - browser UI v2 */
(function () {
'use strict';
const B = window.BOTR, NET = window.BOTRNET;
const { UNITS, STANCES, STANCE_INFO, TAX, TERRAIN, SEASONS, CASTLE, TRAITS, PERSONALITIES, DIFFICULTY, PLAYER_DEF } = B;
const SEASON_ICON = ['🌱', '☀️', '🍂', '❄️'];
const $ = s => document.querySelector(s);
const SAVE_KEY = 'botr_save_v3', ASYNC_KEY = 'botr_async_v3', MUTE_KEY = 'botr_mute';
const ART = window.BANNERS_ART || {};

/* ------------------------------------------------------------ game / ui state */
let S = null, MAP = null, MAP_DEF = null;
let G = null;            // { mode:'solo'|'hotseat'|'async', setup, humans:[seats], orders:{seat:[]}, sealed:{seat:true}, idx, rec? }
let phase = 'menu';      // menu | pass | plan | reveal | wait | over
let V = null;            // seat currently looking at the map while planning (null during public reveal)
let sel = null, selUnits = new Set(), selFor = null, marchStance = 'charge', marchStorm = false;
let gen = null, answer, fast = false, timer = null, resolving = null;
let flashC = null, uiMsg = '', movingIds = null, tokenSigs = {}, planRev = 0;
let pickMode = null;     // {type:'scout'|'feint'} waiting for a map tap

/* ------------------------------------------------------------ helpers */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cn = i => MAP_DEF[i].name;
const f1 = x => (Math.round(x * 10) / 10).toString();
const pl = i => i < 0 ? { short: 'Neutral', name: 'Neutral', color: '#7d6e48', light: '#b3a574' } : S.players[i];
const lordName = i => i < 0 ? 'Neutral' : (S.players[i].lord ? S.players[i].lord + ' of ' + S.players[i].short : 'House ' + S.players[i].short);
const humans = () => S.players.filter(p => p.human);
const viewers = () => V != null ? [V] : (G && G.mode === 'async' && G.rec && G.rec.local.seat != null ? [G.rec.local.seat] : humans().filter(p => p.alive || true).map(p => p.id));
function visNow() { const v = new Set(); for (const s of viewers()) for (const c of B.visSet(S, s)) v.add(c); return v; }
function unitsSeen() {
  const out = [], seen = new Set();
  for (const s of viewers()) for (const u of B.viewUnits(S, s)) { const k = u.fake ? 'f' + u.id : u.id; if (!seen.has(k)) { seen.add(k); out.push(u); } }
  return out;
}
function evVisible(ev) { if (ev.vis === 'all' || !ev.vis) return true; const vs = viewers(); return ev.vis.some(p => vs.includes(p)); }
const rid = () => Math.floor(Math.random() * 4294967296) >>> 0;

/* ------------------------------------------------------------ art (optional, graceful) */
function artPath(group, key) { const g = ART[group]; return g && g[key] ? g[key] : null; }
const UNIT_ART = { levy: 'levy', archers: 'archers', maa: 'menAtArms', knights: 'knights', scout: 'scouts', engine: 'siege' };
function unitArt(u) { if (u.rebel || u.raider) return artPath('units', 'rebels'); return artPath('units', UNIT_ART[u.type]); }
function heroArt(h) { const a = ART.heroes; return a && a.length && h ? a[Math.abs(h.id) % a.length] : null; }
function terrainArt(i) { const d = MAP_DEF[i]; if (d.capital !== undefined || d.role === 'cap') return artPath('terrain', 'town'); return artPath('terrain', d.terrain === 'plains' ? 'farmland' : d.terrain); }
function castleArt(l) { return l > 0 ? artPath('castles', ['', 'palisade', 'keep', 'fortress'][l]) : null; }
const EVENT_ART = { plague: 'plague', bumper_harvest: 'harvest', drought: 'fire', festival: 'festival', tournament: 'festival', bandits: 'bandits', mercenaries: 'mercenary', harsh_winter: 'winter', rebellion: 'rebellion' };
function eventArt(key) { if (EVENT_ART[key]) return artPath('events', EVENT_ART[key]); return null; }
function lordArt(p) { return p && p.ai ? artPath('lords', p.ai.personality) : null; }
function crestArt(seat) { return artPath('crests', ['aldric', 'valmoor', 'green', null, 'gold', null][seat]); }
const img = (src, cls, alt) => src ? `<img class="${cls || ''}" src="${esc(src)}" alt="${esc(alt || '')}" onerror="this.remove()">` : '';
let mapArtOK = false;
(function preloadMapArt() { if (!ART.map) return; const im = new Image(); im.onload = () => { mapArtOK = true; if (S) renderMap(); }; im.src = ART.map; })();

/* ------------------------------------------------------------ sound (WebAudio synth, no files) */
const sfx = {
  ctx: null, muted: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) { this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination); } } catch (e) { this.ctx = null; }
  },
  ok() { return this.ctx && !this.muted && !fast; },
  noise(dur) { const n = Math.floor(this.ctx.sampleRate * dur), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; return s; },
  drum(at, vel, pitch) {
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(pitch || 120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4);
    const n = this.noise(0.08), f = c.createBiquadFilter(), ng = c.createGain(); f.type = 'lowpass'; f.frequency.value = 600; ng.gain.setValueAtTime(vel * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(f); f.connect(ng); ng.connect(this.master); n.start(t); n.stop(t + 0.1);
  },
  drums(beats) { if (!this.ok()) return; const pat = [1, 0.5, 0.8, 0.5, 1, 0.6, 0.9, 0.7]; for (let i = 0; i < (beats || 6); i++) this.drum(i * 0.2, 0.55 * pat[i % pat.length], i % 4 === 0 ? 95 : 130); },
  clash() {
    if (!this.ok()) return; const c = this.ctx, t = c.currentTime;
    const n = this.noise(0.5), hp = c.createBiquadFilter(), g = c.createGain(); hp.type = 'highpass'; hp.frequency.value = 1400;
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45); n.connect(hp); hp.connect(g); g.connect(this.master); n.start(t); n.stop(t + 0.5);
    [1870, 2630, 3480].forEach((fq, k) => { const o = c.createOscillator(), og = c.createGain(); o.type = 'square'; o.frequency.value = fq * (1 + Math.random() * 0.02); og.gain.setValueAtTime(0.07, t + k * 0.02); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + k * 0.05); o.connect(og); og.connect(this.master); o.start(t + k * 0.02); o.stop(t + 0.6); });
    this.drum(0.02, 0.8, 80);
  },
  horn(win) {
    if (!this.ok()) return; const c = this.ctx, t = c.currentTime, notes = win ? [262, 330, 392, 523] : [196, 185, 165, 131];
    notes.forEach((fq, k) => { const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = fq; f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(0.0001, t + k * 0.22); g.gain.exponentialRampToValueAtTime(0.18, t + k * 0.22 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.22 + 0.4); o.connect(f); f.connect(g); g.connect(this.master); o.start(t + k * 0.22); o.stop(t + k * 0.22 + 0.45); });
  },
  coin() { if (!this.ok()) return; const c = this.ctx, t = c.currentTime; [1318, 1760].forEach((fq, k) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = fq; g.gain.setValueAtTime(0.12, t + k * 0.07); g.gain.exponentialRampToValueAtTime(0.001, t + k * 0.07 + 0.2); o.connect(g); g.connect(this.master); o.start(t + k * 0.07); o.stop(t + k * 0.07 + 0.25); }); }
};
try { sfx.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* ignore */ }
function setMute(m) { sfx.muted = m; try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) { /* ignore */ } const b = $('#btnMute'); if (b) { b.textContent = m ? '🔇' : '🔊'; b.setAttribute('aria-pressed', m ? 'true' : 'false'); b.title = m ? 'Sound off (click to turn on)' : 'Sound on (click to mute)'; } }

/* ------------------------------------------------------------ map geometry */
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
    d += 'Q' + ((a[0] + b[0]) / 2 + nx * off).toFixed(1) + ' ' + ((a[1] + b[1]) / 2 + ny * off).toFixed(1) + ' ' + q[0].toFixed(1) + ' ' + q[1].toFixed(1);
  }
  return d + 'Z';
}
const PATHS_CACHE = {};
function paths() { if (!PATHS_CACHE[MAP.id]) PATHS_CACHE[MAP.id] = MAP_DEF.map((_, i) => cellPath(i)); return PATHS_CACHE[MAP.id]; }
const HULL = 'M' + Array.from({ length: 32 }, (_, i) => { const a = i / 32 * Math.PI * 2; return (500 + 492 * Math.cos(a)).toFixed(1) + ' ' + (350 + 338 * Math.sin(a)).toFixed(1); }).join('L') + 'Z';
const DEFS = `
<defs>
 <pattern id="p-forest" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="7" cy="9" r="5" fill="#2f5a2a" opacity=".5"/><circle cx="19" cy="19" r="5" fill="#2f5a2a" opacity=".5"/><circle cx="21" cy="6" r="3" fill="#3d6d33" opacity=".45"/></pattern>
 <pattern id="p-hills" width="30" height="22" patternUnits="userSpaceOnUse"><path d="M2 18 q7 -13 14 0 M16 10 q6 -9 12 0" stroke="#6b5530" stroke-width="2" fill="none" opacity=".55"/></pattern>
 <pattern id="p-mountains" width="30" height="26" patternUnits="userSpaceOnUse"><path d="M3 23 l8 -17 l8 17z" fill="#6d6559" opacity=".6"/><path d="M8 12 l3 -6 l3 6z" fill="#fff" opacity=".7"/><path d="M19 23 l5 -10 l5 10z" fill="#7a7266" opacity=".55"/></pattern>
 <pattern id="p-marsh" width="28" height="20" patternUnits="userSpaceOnUse"><path d="M3 7 h8 M15 15 h9 M8 14 v-5 M20 7 v-4" stroke="#2f5f66" stroke-width="2" fill="none" opacity=".55"/></pattern>
 <pattern id="p-plains" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="1.4" fill="#8f7f3f" opacity=".5"/><circle cx="15" cy="12" r="1.4" fill="#8f7f3f" opacity=".5"/><circle cx="8" cy="18" r="1.2" fill="#8f7f3f" opacity=".4"/></pattern>
 <pattern id="p-fog" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="16" height="16" fill="#1d2230" opacity=".5"/><path d="M0 8 h16" stroke="#8c97b8" stroke-width="1.5" opacity=".28"/></pattern>
 <marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#ffd34d" stroke="#000" stroke-width="1"/></marker>
</defs>`;
const SHIELD = 'M-21 -13 h42 v15 q0 11 -21 17 q-21 -6 -21 -17z';

/* zoom + pan */
const view = { x: 0, y: 0, w: 1000, h: 700 };
function applyView() { const vb = `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`; $('#map').setAttribute('viewBox', vb); $('#anim').setAttribute('viewBox', vb); $('#zoomlvl').textContent = Math.round(1000 / view.w * 100) + '%'; }
function zoomBy(f, cx, cy) {
  const nw = Math.max(250, Math.min(1000, view.w / f)), nh = nw * 0.7;
  if (cx == null) { cx = view.x + view.w / 2; cy = view.y + view.h / 2; }
  const rx = (cx - view.x) / view.w, ry = (cy - view.y) / view.h;
  view.x = cx - rx * nw; view.y = cy - ry * nh; view.w = nw; view.h = nh; clampView(); applyView();
}
function clampView() { view.x = Math.max(-40, Math.min(1040 - view.w, view.x)); view.y = Math.max(-30, Math.min(730 - view.h, view.y)); }
function resetView() { view.x = 0; view.y = 0; view.w = 1000; view.h = 700; applyView(); }
function focusOn(cid) { const c = MAP.centroid[cid]; if (view.w < 1000) { view.x = c[0] - view.w / 2; view.y = c[1] - view.h / 2; clampView(); applyView(); } }

/* ------------------------------------------------------------ map rendering */
function narrow() { return window.innerWidth < 700; }
function renderMap() {
  if (!S) return;
  MAP = B.getMap(S); MAP_DEF = MAP.defs;
  const nar = narrow(), K = nar ? 1.5 : 1;
  document.body.classList.toggle('narrow', nar);
  const vis = visNow(), fogOn = true, PATHS = paths();
  const useArt = mapArtOK && ART.map;
  const parts = [DEFS];
  if (useArt) parts.push(`<image href="${esc(ART.map)}" x="-40" y="-30" width="1080" height="760" preserveAspectRatio="none"/>`);
  else parts.push(`<path d="${HULL}" fill="#e9dcae" stroke="#e9dcae" stroke-width="22" stroke-linejoin="round" opacity=".9"/>`);
  const adj = sel != null ? MAP.adj[sel] : [];
  const order = MAP_DEF.map((_, i) => i).sort((a, b) => (a === sel) - (b === sel));
  const sc = (V != null ? S.players[V].scouted : {});
  for (const i of order) {
    const c = S.counties[i], d = MAP_DEF[i];
    const cls = ['cg'];
    if (i === sel) cls.push('sel'); else if (adj.includes(i)) cls.push('adj');
    if (pickMode && pickTargetOK(i)) cls.push('pickable');
    if (flashC && flashC.id === i) cls.push(flashC.bad ? 'flashbad' : 'flash');
    const terrOp = useArt ? 0.34 : 1, ownOp = useArt ? 0.46 : 0.42;
    parts.push(`<g class="${cls.join(' ')}" data-c="${i}">
      <path class="cell" d="${PATHS[i]}" fill="${TERRAIN[d.terrain].color}" fill-opacity="${terrOp}"/>
      ${c.owner >= 0 ? `<path d="${PATHS[i]}" fill="${S.players[c.owner].color}" opacity="${ownOp}" pointer-events="none"/>` : ''}
      <path d="${PATHS[i]}" fill="url(#p-${d.terrain})" pointer-events="none" opacity="${useArt ? 0.6 : 1}"/>
      ${fogOn && !vis.has(i) ? `<path d="${PATHS[i]}" fill="url(#p-fog)" pointer-events="none" class="fog"/>` : ''}
    </g>`);
  }
  const seen = unitsSeen();
  for (let i = 0; i < MAP.n; i++) {
    const c = S.counties[i], d = MAP_DEF[i], cen = MAP.centroid[i], cx = cen[0], cy = cen[1];
    const isCap = c.cap != null;
    let g = `<g data-c="${i}" style="cursor:pointer">`;
    if (c.castle > 0) {
      const size = 24 + c.castle * 3;
      g += `<text x="${cx}" y="${cy - 30}" font-size="${size}" text-anchor="middle" class="castle c${c.castle}" style="pointer-events:none">${c.castle === 3 ? '🏰' : c.castle === 2 ? '🏯' : '🛖'}</text>`;
      if (c.owner >= 0) g += `<path d="M${cx + 12} ${cy - 56 - c.castle * 3} v-13 l15 4.5 l-15 4.5" fill="${S.players[c.owner].color}" stroke="#222" stroke-width="1" pointer-events="none"/>`;
      if (c.build) g += `<text x="${cx + 26}" y="${cy - 28}" font-size="16" style="pointer-events:none">🔨</text>`;
    }
    if (c.siege || c.occ) g += `<circle class="siege" cx="${cx}" cy="${cy - 26}" r="${28 + c.castle * 2}"/>`;
    g += `<text class="cname" x="${cx}" y="${cy - (c.castle > 0 ? 3 : 14)}">${esc(d.name)}</text>`;
    if (c.owner >= 0) {
      const hi = happyInfo(c.happiness);
      const known = vis.has(i) || viewers().includes(c.owner);
      g += `<text class="csub" x="${cx}" y="${cy + (c.castle > 0 ? 10 : -1)}">${known ? hi.e : '❔'}${c.tax !== 'normal' && known ? (c.tax === 'high' ? ' 💰↑' : ' 💰↓') : ''}${c.cap != null ? ' ⚜' : ''}</text>`;
    } else if (!nar) g += `<text class="csub" x="${cx}" y="${cy - 1}">${TERRAIN[d.terrain].name}</text>`;
    // tokens (units the viewer may see)
    const here = seen.filter(u => u.county === i && !(movingIds && movingIds.has(u.id)));
    const owners = [...new Set(here.map(u => u.owner))].sort((a, b) => a - b);
    const w = 48 * K, startX = cx - (owners.length * w) / 2 + w / 2;
    owners.forEach((o, k) => {
      const us = here.filter(u => u.owner === o);
      const pw = B.sumStr(us), hasB = us.some(u => u.banner), hasH = us.some(u => u.type === 'hero'), hasS = us.some(u => u.type === 'scout'), rebel = us.some(u => u.rebel || u.raider);
      const sig = i + ':' + o + ':' + us.length + ':' + Math.round(pw);
      const x = startX + k * w, y = cy + (c.castle > 0 ? 28 : 18) * (nar ? 1.4 : 1);
      const key = i + '_' + o, pop = phase === 'reveal' && tokenSigs[key] !== undefined && tokenSigs[key] !== sig ? ' pop' : '';
      tokenSigs[key] = sig;
      const col = o < 0 ? (rebel ? '#7a2a1c' : '#7d6e48') : S.players[o].color;
      g += `<g class="tok${pop}" transform="translate(${x} ${y}) scale(${K})"><path d="${SHIELD}" fill="${col}" stroke="${hasB ? '#ffd34d' : '#1b1208'}" stroke-width="${hasB ? 3 : 2}"/>
        <text class="n" y="3">${Math.round(pw)}</text><text class="u" y="14">${us.length}u${hasB ? '★' : ''}${hasH ? '👑' : ''}${hasS ? '🔭' : ''}${rebel ? '🔥' : ''}</text></g>`;
    });
    // fog memory ghost: last seen enemy force here
    const me = V != null ? S.players[V] : null;
    if (me && !vis.has(i) && me.mem[i]) {
      const m = me.mem[i], x = cx, y = cy + 24 * (nar ? 1.4 : 1);
      g += `<g class="ghost" transform="translate(${x} ${y}) scale(${K * 0.85})"><path d="${SHIELD}" fill="none" stroke="#c9d2ee" stroke-width="2" stroke-dasharray="4 3"/><text class="n" y="3" style="fill:#e8ecfa">~${Math.round(m.pow)}</text><text class="u" y="14" style="fill:#c9d2ee">${Math.max(0, S.turn - m.turn)}s ago</text></g>`;
    }
    if (V != null && sc[i] != null && sc[i] >= S.turn) g += `<text x="${cx - 34}" y="${cy - 4}" font-size="18" style="pointer-events:none">👁</text>`;
    g += '</g>';
    parts.push(g);
  }
  // planned orders markers
  const ords = V != null && G && G.orders[V] ? G.orders[V] : [];
  for (const o of ords) {
    if (o.type === 'march') {
      const a = MAP.centroid[o.from], b = MAP.centroid[o.to];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const x1 = a[0] + dx / L * 28, y1 = a[1] + dy / L * 28, x2 = b[0] - dx / L * 40, y2 = b[1] - dy / L * 40;
      parts.push(`<path class="arrow plan" d="M${x1} ${y1} L${x2} ${y2}" marker-end="url(#ah)"/>`);
      parts.push(`<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 6}" font-size="20" text-anchor="middle" style="pointer-events:none">${STANCE_INFO[o.stance].icon}${o.storm ? '💥' : ''}</text>`);
    } else if (o.type === 'scout') {
      const t = MAP.centroid[o.target]; parts.push(`<text x="${t[0]}" y="${t[1] - 22}" font-size="26" text-anchor="middle" style="pointer-events:none">🔭</text>`);
    } else if (o.type === 'feint') {
      const t = MAP.centroid[o.to]; parts.push(`<text x="${t[0] + 30}" y="${t[1] - 6}" font-size="22" style="pointer-events:none">🎭</text>`);
    } else if (o.county != null) {
      const cen = MAP.centroid[o.county];
      parts.push(`<text x="${cen[0] + 34}" y="${cen[1] - 4}" font-size="18" style="pointer-events:none">${{ recruit: '➕', merge: '⚜️', tax: '💰', build: '🔨', storm: '💥', sally: '⚔️' }[o.type] || '•'}</text>`);
    }
  }
  if (flashC && flashC.bad) { const cen = MAP.centroid[flashC.id]; parts.push(`<text x="${cen[0]}" y="${cen[1] + 4}" font-size="46" text-anchor="middle" class="pulse" style="pointer-events:none">⚔️</text>`); }
  for (const k of Object.keys(tokenSigs)) { const [ci, o] = k.split('_').map(Number); if (!seen.some(u => u.county === ci && u.owner === o)) delete tokenSigs[k]; }
  $('#map').innerHTML = parts.join('');
}
function pickTargetOK(i) {
  if (!pickMode || V == null) return false;
  if (pickMode.type === 'scout') return !B.checkNewOrder(S, V, { type: 'scout', from: pickMode.from, target: i }, G.orders[V]);
  if (pickMode.type === 'feint') return !B.checkNewOrder(S, V, { type: 'feint', to: i }, G.orders[V]);
  return false;
}

/* ------------------------------------------------------------ panels */
function happyInfo(h) {
  if (h >= 75) return { t: 'Joyful', e: '😄', c: '#4c8a3a' };
  if (h >= 50) return { t: 'Content', e: '🙂', c: '#7a9a3a' };
  if (h >= 30) return { t: 'Uneasy', e: '😐', c: '#c9a227' };
  if (h >= 20) return { t: 'Grumbling', e: '😟', c: '#c9762a' };
  return { t: 'Unrest (no taxes)', e: '😠', c: '#a6302b' };
}
const chip = (html, cls) => `<span class="chip ${cls || ''}">${html}</span>`;
const hv = () => V != null ? V : (viewers()[0] != null ? viewers()[0] : 0);
const ordersOf = seat => (G && G.orders[seat]) || [];
function ctxFor(seat) { return B.ctxFromOrders(S, seat, ordersOf(seat)); }
function freeUnits(cid, seat) { const c = ctxFor(seat); return S.units.filter(u => u.owner === seat && u.county === cid && !c.used.has(u.id)); }
const tag = o => `<span class="tag" style="background:${pl(o).color}">${esc(pl(o).short)}</span>`;

function renderHeader() {
  const me = S.players[hv()];
  const inc = B.incomeFor(S, me.id), wages = B.wagesFor(S, me.id), harv = B.harvestFor(S, me.id), need = B.foodNeedFor(S, me.id);
  const myUnits = S.units.filter(u => u.owner === me.id), netG = inc - wages, netF = harv - need;
  const badge = $('#seasonBadge');
  badge.textContent = `${SEASON_ICON[S.season]} ${SEASONS[S.season]} · Year ${S.year}`;
  badge.className = 'season' + (S.season === 3 ? ' winter' : '');
  const nIn = B.incoming(S, me.id).length;
  $('#btnDip').hidden = phase === 'menu' || phase === 'pass';
  $('#btnDip').innerHTML = '🤝 Diplomacy' + (nIn ? ` <b class="badge">${nIn}</b>` : '');
  let h = '';
  if (G && G.mode !== 'solo') h += chip(`${crestArt(me.id) ? img(crestArt(me.id), 'mini', '') : '⚜'} <b>${esc(me.lord || me.short)}</b>`, 'who');
  h += chip(`🪙 <b>${me.gold}</b> <span class="sub">${netG >= 0 ? '+' : ''}${netG}/season (${inc} tax − ${wages} wages)</span>`, me.gold + netG < 0 ? 'bad' : '');
  h += chip(`🌾 <b>${Math.round(me.grain)}</b> <span class="sub">${netF >= 0 ? '+' : ''}${netF} this season${harv ? ' (harvest!)' : ''} (−${need} food)</span>`, me.grain + netF < 0 ? 'bad' : '');
  h += chip(`🏰 <b>${B.countiesOf(S, me.id).length}</b>/${MAP.n}`);
  h += chip(`⚔️ <b>${myUnits.length}</b> units · power <b>${Math.round(B.sumStr(myUnits))}</b>`);
  const nOrd = milCount(me.id), nDip = dipCount(me.id);
  h += chip(`📜 <b>${nOrd}</b>/${B.MAX_ORDERS} orders${nDip ? ` · ✉ <b>${nDip}</b> envoy${nDip > 1 ? 's' : ''}` : ''}`);
  const nInc = B.incoming(S, me.id).filter(p => !ordersOf(me.id).some(o => o.type === 'dip' && o.act === 'respond' && o.pid === p.id)).length;
  if (nInc && phase === 'plan') h += `<span class="chip warnchip" data-dipopen>✉ <b>${nInc}</b> proposal${nInc > 1 ? 's' : ''} await your answer</span>`;
  for (const p of S.players) if (p.id !== me.id) {
    const cs = B.countiesOf(S, p.id).length;
    const rl = p.alive ? B.relation(S, me.id, p.id) : 'neutral';
    h += `<span class="chip rival${p.alive ? '' : ' dead'}" data-dipopen title="${esc(B.REL_NAMES[rl])}"><i class="sw" style="background:${p.color}"></i>${esc(p.short)}${p.ai ? ' ' + PERSONALITIES[p.ai.personality].icon : ' 👤'}: ${p.alive ? '🏰 ' + cs + (rl !== 'neutral' ? ' <span class="rl ' + rl + '">' + REL_ICON[rl] + '</span>' : '') : '☠ fallen'}</span>`;
  }
  if (S.season === 3) h += chip('❄️ Winter: more food, snow may block marches' + (S.mods.harsh ? ' · HARSH' : ''), 'winter');
  if (S.season === 2) h += chip('🍂 Autumn: harvest comes in');
  const capc = S.counties[me.capital];
  if (capc && capc.occ) h += chip('🚩 YOUR BANNER IS UNDER SIEGE!', 'bad');
  if (capc && capc.siege) h += chip('🏰 Your capital is besieged!', 'bad');
  for (const p of S.players) if (p.id !== me.id && p.alive && S.counties[p.capital].occ && S.counties[p.capital].occ.by === me.id) h += chip(`🚩 You hold ${esc(cn(p.capital))}: hold it one more season!`);
  $('#resbar').innerHTML = h;
  const foes = S.players.filter(p => p.id !== me.id && p.alive);
  $('#maphead').innerHTML = phase === 'reveal' ? '<b>The orders are revealed…</b> armies march, clash, and the Chronicle records it. <span class="muted">(Fog: you only see what your lands and scouts can see.)</span>' :
    pickMode ? `<b>${pickMode.type === 'scout' ? '🔭 Tap a county up to 3 away to scout it' : '🎭 Tap an enemy-facing county to feint toward it'}</b> <button class="btn tiny" data-cancelpick>Cancel</button>` :
    `Goal: seize ${foes.length === 1 ? `<b>${esc(cn(foes[0].capital))}</b>` : 'rival capitals'} with infantry and hold one full season. Protect <b>${esc(cn(me.capital))}</b>.`;
}

function unitRow(u, seat, isFree, canSel) {
  const h = B.heroOfUnit(S, u);
  const nm = h ? `${esc(h.name)}` : esc(B.ulabel(u) + (u.rebel ? ' (rebel)' : u.raider ? ' (bandit)' : ''));
  const art = h ? heroArt(h) : unitArt(u);
  const tr = h ? h.traits.map(t => `<span title="${esc(TRAITS[t].name + ': ' + TRAITS[t].desc)}">${TRAITS[t].icon}</span>`).join('') : '';
  const sub = h ? `<small class="muted">deeds ${h.deeds}${h.traits.length ? '' : ' · no traits yet'}</small>` : '';
  const mid = `${img(art, 'uthumb', '')}<span class="uname">${UNITS[u.type].icon} ${nm} ${tr}${u.pressed ? ' <i>(pressed)</i>' : ''}${sub ? '<br>' + sub : ''}</span>`;
  if (seat != null) return `<div class="unit ${isFree ? '' : 'used'}"><label>${canSel ? `<input type="checkbox" data-unit="${u.id}" ${selUnits.has(u.id) ? 'checked' : ''} ${isFree ? '' : 'disabled'}>` : ''}${mid}${isFree ? '' : ' <i>(ordered)</i>'}</label><span class="str">${f1(B.ustr(u))}</span></div>`;
  return `<div class="unit foe">${mid}<span class="str">${f1(B.ustr(u))}</span></div>`;
}
function knownEnemy(cid, seat, seen, vis) {
  if (vis.has(cid)) { const us = seen.filter(u => u.county === cid && u.owner !== seat); return { known: true, us, p: B.sumStr(us) }; }
  const m = S.players[seat].mem[cid];
  return { known: false, mem: m || null, p: m ? m.pow : null };
}

function renderCounty() {
  const el = $('#countyPanel');
  if (phase === 'pass' || phase === 'menu') { el.innerHTML = ''; return; }
  const seat = hv();
  if (sel == null) {
    el.innerHTML = `<h2>County</h2><p class="muted">Tap a county on the map to see it, then give orders to your armies there. You get up to <b>${B.MAX_ORDERS}</b> secret orders per season. Counties under the grey mist are <b>fogged</b>: you cannot see armies there unless your land or troops are next to them, or you send a scout.</p>${uiMsg ? `<p class="muted"><b>${esc(uiMsg)}</b></p>` : ''}`;
    return;
  }
  const c = S.counties[sel], d = MAP_DEF[sel], t = TERRAIN[d.terrain];
  const vis = visNow(), seen = unitsSeen(), mine = c.owner === seat, visible = vis.has(sel) || mine;
  const canPlan = phase === 'plan' && V != null && seat === V;
  const orders = ordersOf(seat);
  const ownerTag = c.owner < 0 ? '<span class="tag n">Unclaimed</span>' : `<span class="tag" style="background:${pl(c.owner).color}">${esc(lordName(c.owner))}</span>`;
  let h = `<div class="cbanner">${img(terrainArt(sel), 'cart', '')}${img(castleArt(c.castle), 'cart2', CASTLE[c.castle].name)}</div>`;
  h += `<div class="panelhead"><h2>${esc(d.name)} ${c.cap != null ? '⚜' : ''}</h2>${ownerTag}</div>`;
  if (uiMsg) h += `<div class="ev warn" style="margin:6px 0">${esc(uiMsg)}</div>`;
  const defb = Math.round((t.def + CASTLE[c.castle].def) * 100);
  h += `<div class="kv"><span>Terrain</span><span>${t.name} (+${defb}% to defenders${c.castle ? ', incl. ' + CASTLE[c.castle].name : ''})</span>`;
  h += `<span>Castle</span><span>${CASTLE[c.castle].name}${c.build ? ` · building ${CASTLE[c.build.level].name} (${c.build.left} season${c.build.left === 1 ? '' : 's'})` : ''}${c.castle ? ` · stores ${visible ? Math.round(c.stores) : '?'}/${CASTLE[c.castle].cap}` : ''}</span>`;
  h += `<span>Peasants</span><span>${visible ? c.pop : '?'}</span><span>Fields</span><span>${d.fert >= 1 ? 'Rich' : d.fert >= 0.8 ? 'Fair' : d.fert >= 0.6 ? 'Poor' : 'Barren'}</span>`;
  if (c.owner >= 0 && (mine || visible)) { const hi = happyInfo(c.happiness); h += `<span>Mood</span><span>${hi.e} ${hi.t} (${Math.round(c.happiness)})</span>`; }
  h += '</div>';
  if (c.owner >= 0 && (mine || visible)) { const hi = happyInfo(c.happiness); h += `<div class="bar"><i style="width:${c.happiness}%;background:${hi.c}"></i></div>`; }
  if (!visible) {
    const m = S.players[seat].mem[sel];
    h += `<div class="ev fogmsg">🌫 <b>Fogged.</b> You cannot see the armies here. ${m ? `Last seen ${Math.max(0, S.turn - m.turn)} season(s) ago: about ${m.n} unit(s), power ~${f1(m.pow)}.` : 'Nothing is known. Send a scout (🔭) or move next to it.'}</div>`;
  }
  if (c.siege && c.owner >= 0) h += `<div class="ev alarm">🏰 Besieged by ${esc(pl(c.siege.by).short)} since season ${c.siege.since + 1}. The garrison's stores: ${visible ? Math.round(c.stores) : '?'}. They starve out unless relieved or the walls are stormed.</div>`;
  if (c.occ) h += `<div class="ev alarm">🚩 Banner siege: ${esc(pl(c.occ.by).short)}'s infantry hold this castle (${c.occ.count}/2 seasons).</div>`;
  if (c.owner >= 0 && c.resent > 0 && visible) h += `<div class="muted">Recently conquered: the people resent their new lord (${c.resent} more seasons).</div>`;
  if (mine && c.happiness < 28) h += `<div class="ev warn">⚠ The mood is dangerously low: rebels may rise here. Lower the taxes or keep troops in the county.</div>`;
  if (mine) {
    const pend = orders.find(o => o.type === 'tax' && o.county === sel);
    h += `<h3>Taxes ${pend ? '(order set)' : ''}</h3><div class="seg">`;
    for (const r of ['low', 'normal', 'high']) {
      const shown = pend ? pend.rate : c.tax, inc = Math.round(c.pop * 0.15 * TAX[r].mult);
      h += `<button class="btn ${shown === r ? 'on' : ''}" data-tax="${r}" ${canPlan ? '' : 'disabled'}>${TAX[r].name}<br><small>${inc}g · ${TAX[r].happy > 0 ? '+' : ''}${TAX[r].happy} mood</small></button>`;
    }
    h += '</div>';
  }
  // units
  const here = seen.filter(u => u.county === sel);
  const free = canPlan ? freeUnits(sel, seat) : [];
  const freeIds = new Set(free.map(u => u.id));
  if (selFor !== sel) { selFor = sel; selUnits = new Set(free.map(u => u.id)); }
  for (const id of [...selUnits]) if (!freeIds.has(id)) selUnits.delete(id);
  h += '<h3>Troops here</h3>';
  if (!visible) h += '<div class="muted">Unknown (fog).</div>';
  else if (!here.length) h += '<div class="muted">No troops.</div>';
  const ownersHere = [...new Set(here.map(u => u.owner))].sort((a, b) => (a === seat ? -1 : b === seat ? 1 : a - b));
  for (const o of ownersHere) {
    const us = here.filter(u => u.owner === o);
    h += `<div class="muted">${tag(o)} ${o === seat ? 'yours' : ''} power ${f1(B.sumStr(us))}</div>`;
    for (const u of us) h += o === seat ? unitRow(u, seat, freeIds.has(u.id), canPlan) : unitRow(u, null);
  }
  if (here.some(u => u.owner === seat) && canPlan) {
    const g = S.players[seat].garrison[sel] || 'hold';
    h += `<h3>Garrison stance <span class="muted" style="text-transform:none;letter-spacing:0">(free · secret · when attacked here)</span></h3><div class="seg">`;
    for (const s of STANCES) h += `<button class="btn ${g === s ? 'on' : ''}" data-gar="${s}">${STANCE_INFO[s].icon} ${STANCE_INFO[s].name}</button>`;
    h += '</div>';
  }
  if (canPlan) {
    // castle siege options
    if (c.castle > 0 && c.owner === seat && (c.siege || here.some(u => u.owner >= 0 && u.owner !== seat))) {
      const hasSally = orders.some(o => o.type === 'sally' && o.county === sel);
      h += `<h3>Under siege</h3><button class="btn opt" data-sally ${hasSally ? 'disabled' : ''}>⚔️ <b>Sally out</b> against the besiegers<br><small>The garrison fights outside the walls (no castle bonus, +10% for the surprise). Costs one order.</small></button>`;
    }
    if (c.castle > 0 && c.owner >= 0 && c.owner !== seat && B.stormCandidates(S, seat, sel)) {
      const mineHere = here.filter(u => u.owner === seat);
      const pen = B.stormPenalty(S, sel, { units: mineHere });
      const eng = mineHere.filter(u => u.type === 'engine').length;
      const need = c.castle >= 2 && !eng ? ' <b>(no siege engines: ×0.40, very bad!)</b>' : '';
      h += `<h3>Siege</h3><div class="muted">Your troops besiege the ${CASTLE[c.castle].name}: starve the garrison over seasons (stores ${visible ? Math.round(c.stores) : '?'}), or storm now.</div>
        <button class="btn opt" data-storm>💥 <b>Storm the walls</b> this season<br><small>Your power ×${pen.toFixed(2)}${need}; the defenders keep the castle's +${Math.round(CASTLE[c.castle].def * 100)}%. Costs one order.</small></button>`;
    }
    if (free.length) {
      h += `<h3>March</h3>`;
      const selArr = free.filter(u => selUnits.has(u.id)), selPower = B.sumStr(selArr);
      h += `<div class="muted">Selected: <b>${selUnits.size}</b> unit(s), power <b>${f1(selPower)}</b>. Secret stance:</div><div class="seg" style="margin:4px 0">`;
      for (const s of STANCES) h += `<button class="btn ${marchStance === s ? 'on' : ''}" data-stance="${s}">${STANCE_INFO[s].icon} ${STANCE_INFO[s].name}</button>`;
      h += `</div><div class="muted">⚔️ Charge beats Flank · 🛡️ Hold beats Charge · 🏹 Flank beats Hold (+40%)</div>`;
      const castleFoe = MAP.adj[sel].some(n => S.counties[n].castle > 0 && S.counties[n].owner !== seat && S.counties[n].owner >= 0);
      if (castleFoe) h += `<label class="stormtoggle"><input type="checkbox" data-stormtoggle ${marchStorm ? 'checked' : ''}> 💥 Storm walls on arrival <small>(otherwise you besiege)</small></label>`;
      for (const n of MAP.adj[sel]) {
        const nc = S.counties[n], ke = knownEnemy(n, seat, seen, vis);
        const bonus = 1 + B.terrainDef(n) + CASTLE[nc.castle].def;
        let cls = 'own', desc = 'friendly county';
        const pactH = nc.owner >= 0 && nc.owner !== seat ? B.protectivePact(S, seat, nc.owner) : null;
        if (pactH && pactH.type === 'alliance') { desc = `⚜️ ${esc(pl(nc.owner).short)}'s land: allied, free passage`; }
        else if (nc.owner !== seat) {
          if (ke.p == null) { cls = 'even'; desc = (nc.owner < 0 ? 'unclaimed' : esc(pl(nc.owner).short)) + ': 🌫 unknown defenders (scout it!)'; }
          else {
            const p = ke.p * bonus, ratio = p === 0 ? 9 : selPower / p;
            cls = ratio >= 1.5 ? 'good' : ratio >= 0.9 ? 'even' : 'bad';
            desc = (nc.owner < 0 ? 'unclaimed' : esc(pl(nc.owner).short)) + ': ' + (ke.known ? (ke.us.length ? `${B.describeUnits(ke.us)} ≈ ${f1(p)} power` : 'undefended') : `🌫 last seen ~${f1(p)} power`);
          }
          if (nc.castle > 0 && nc.owner >= 0) desc += ` · 🏰 ${CASTLE[nc.castle].name}`;
          if (pactH) { cls = 'bad'; desc += ` · ⚠ BREAKS your ${esc(PACT[pactH.type].name.toLowerCase())} with ${esc(pl(nc.owner).short)}`; }
        } else if (ke.known && ke.us.length) desc = 'friendly county · enemy here: ' + B.describeUnits(ke.us);
        const snow = S.season === 3 && nc.owner !== seat ? ' · ❄️ may be snowbound' : '';
        h += `<button class="dest ${cls}" data-dest="${n}" ${pactH && pactH.type !== 'alliance' ? 'data-pactwarn="1"' : ''} ${selUnits.size ? '' : 'disabled'}>→ <b>${esc(cn(n))}</b> <small>${desc}${snow}</small></button>`;
        if (pactH && pactH.type === 'alliance') h += `<button class="dest bad" data-dest="${n}" data-betray="1" ${selUnits.size ? '' : 'disabled'}>🗡️ <b>Betray ${esc(pl(nc.owner).short)}</b> and attack ${esc(cn(n))} <small>· breaks the alliance, heavy reputation loss</small></button>`;
      }
      if (free.some(u => u.type === 'scout')) h += `<button class="btn opt" data-scoutpick>🔭 <b>Send a scout…</b><br><small>Reveals a county up to 3 away (and its neighbours) for the coming season.</small></button>`;
    }
    if (mine) {
      const hostile = B.hostileAt(S, sel, seat);
      h += '<h3>Recruit</h3><div class="recgrid">';
      for (const ut of B.UNIT_TYPES) {
        const u = UNITS[ut], err = B.checkNewOrder(S, seat, { type: 'recruit', unit: ut, county: sel }, orders);
        h += `<button class="btn rec" data-rec="${ut}" ${err ? 'disabled' : ''} title="${esc(err || '')}">${img(unitArt({ type: ut }), 'rthumb', '')}<span>${u.icon} ${u.name}<br><small>${u.cost}g · pow ${u.str}${u.capitalOnly ? ' · capital' : ''}${u.needCastle ? ' · castle' : ''}</small></span></button>`;
      }
      h += '</div>';
      if (hostile) h += '<div class="muted">Enemies occupy this county: no recruiting.</div>';
      const merges = B.UNIT_TYPES.filter(ut => !B.checkNewOrder(S, seat, { type: 'merge', unit: ut, county: sel }, orders));
      h += '<h3>Banners</h3>';
      if (merges.length) for (const ut of merges) h += `<button class="btn opt" data-merge="${ut}">⚜️ Merge 3 ${UNITS[ut].plural} → Banner <small>(power ${3 * UNITS[ut].str} → ${f1(4.5 * UNITS[ut].str)}; lost whole if beaten)</small></button>`;
      else h += `<div class="muted">Three free identical units in one county can merge into a Banner worth 1.5× their sum.</div>`;
      if (c.castle < 3 && !c.build) {
        const nl = CASTLE[c.castle + 1], err = B.checkNewOrder(S, seat, { type: 'build', county: sel }, orders);
        h += `<h3>Fortify</h3><button class="btn opt" data-build ${err ? 'disabled' : ''} title="${esc(err || '')}">🔨 Build <b>${nl.name}</b> · ${nl.cost}g · ${nl.time} season${nl.time > 1 ? 's' : ''}<br><small>Defence +${Math.round(nl.def * 100)}%, food stores ${nl.cap}${c.castle + 1 >= 2 ? ', attackers need siege engines to storm' : ''}.</small></button>`;
      }
    }
  }
  el.innerHTML = h;
}

/* ------------------------------------------------------------ orders panel */
function renderOrders() {
  const el = $('#ordersPanel');
  if (phase === 'pass' || phase === 'menu') { el.innerHTML = ''; $('#sealbar').innerHTML = ''; return; }
  const seat = hv(), orders = ordersOf(seat), mode = G ? G.mode : 'solo';
  let h = `<div class="panelhead"><h2>Secret Orders</h2><span class="chip">${orders.filter(o => o.type !== 'dip').length}/${B.MAX_ORDERS}${orders.some(o => o.type === 'dip') ? ' + ✉ ' + orders.filter(o => o.type === 'dip').length : ''}</span></div>`;
  if (!orders.length) h += `<p class="muted">No orders yet: your armies will hold their ground. Rivals' orders stay hidden until everyone has sealed.</p>`;
  else {
    h += '<ul class="orderlist">';
    orders.forEach((o, i) => { h += `<li class="${o.type}"><span>${esc(B.describeOrder(S, o))}</span><button class="x" data-rm="${i}" title="Remove" ${phase !== 'plan' ? 'disabled' : ''}>✕</button></li>`; });
    h += '</ul>';
  }
  const me = S.players[seat], fcost = B.FEINT_COST;
  const canPlan = phase === 'plan';
  const nInc2 = B.incoming(S, seat).filter(p => !orders.some(o => o.type === 'dip' && o.act === 'respond' && o.pid === p.id)).length;
  h += `<div class="row"><button class="btn small" data-dipopen>🤝 Envoys & diplomacy${nInc2 ? ` <b class="badge">${nInc2}</b>` : ''}</button><span class="muted">Pacts, trade, tribute, ransom. Free: ${B.DIP_MAX} a season.</span></div>`;
  h += `<div class="row"><button class="btn small" data-feintpick ${canPlan && !B.checkNewOrder(S, seat, { type: 'feint', to: firstFeintTarget(seat) }, orders) ? '' : 'disabled'} title="Show a fake army near a county. Rivals who can see it will believe it.">🎭 Feint (${fcost}g)…</button>
    <span class="muted">Fake army shown to rivals who can see the county.</span></div>`;
  let label;
  if (phase === 'plan') label = mode === 'hotseat' ? `🔒 Seal & pass device (${orders.filter(o => o.type !== 'dip').length}/${B.MAX_ORDERS})` : mode === 'async' ? `🔒 Seal orders (${orders.filter(o => o.type !== 'dip').length}/${B.MAX_ORDERS})` : `📜 Seal Orders (${orders.filter(o => o.type !== 'dip').length}/${B.MAX_ORDERS})`;
  else label = phase === 'reveal' ? 'Revealing…' : phase === 'wait' ? 'Waiting for others…' : 'Game over';
  h += `<div class="sealmain"><button class="btn primary" data-seal ${phase !== 'plan' ? 'disabled' : ''}>${label}</button></div>`;
  el.innerHTML = h;
  $('#sealbar').innerHTML = `<button class="btn primary" data-seal ${phase !== 'plan' ? 'disabled' : ''}>${label}</button>`;
}
function firstFeintTarget(seat) { for (const c of S.counties) if (c.owner !== seat && !B.checkNewOrder(S, seat, { type: 'feint', to: c.id }, ordersOf(seat))) return c.id; return 0; }

/* ------------------------------------------------------------ chronicle + cards */
function appendLog(ev, isNew) {
  if (!evVisible(ev)) return;
  const log = $('#log'), div = document.createElement('div');
  div.className = 'ev ' + ev.kind + (isNew ? ' new' : '');
  if (ev.battle) {
    const b = ev.battle, sn = s => STANCE_INFO[s].icon + ' ' + STANCE_INFO[s].name;
    const side = (x, win) => `<div class="s ${win ? 'win' : ''}"><b>${esc(pl(x.owner).short)} · ${sn(x.stance)}</b>power ${f1(x.power)}<br><small>${esc(x.units)}</small></div>`;
    div.innerHTML = `<b>⚔ Clash ${esc(b.label || '')}</b><div class="bcard">${side(b.a, b.winner === b.a.owner)}<div class="vs">VS</div>${side(b.b, b.winner === b.b.owner)}</div><div class="bnote">${esc(b.note)}. ${esc(b.outcome)}</div>`;
  } else div.textContent = ev.text;
  log.appendChild(div); log.scrollTop = log.scrollHeight;
}
function rebuildLog() { $('#log').innerHTML = ''; for (const ev of S.log.slice(-40)) appendLog(ev, false); }
let cardTimer = null;
function showCard(card, ev) {
  if (fast) return;
  const art = eventArt(card.key) || (/^hero_/.test(card.key) ? heroArt({ id: (card.hero || card.title || '').length * 7 + 3 }) : null);
  const el = $('#cardlayer');
  el.innerHTML = `<div class="evcard ${esc(card.key)}">${card.a != null ? `<div class="evcrests">${portrait(S.players[card.a])}<span>${card.key === 'betrayal' ? '🗡️' : '🤝'}</span>${portrait(S.players[card.b])}</div>` : img(art, 'evart', '')}<div class="evbody"><div class="evtitle">${esc(card.icon)} ${esc(card.title)}</div><div>${esc(card.text)}</div></div></div>`;
  el.classList.add('show'); clearTimeout(cardTimer); cardTimer = setTimeout(() => el.classList.remove('show'), 3300);
  el.onclick = () => { el.classList.remove('show'); };
}

/* ------------------------------------------------------------ modals */
function showModal(html, cls) { dipOpen = false; const m = $('#modalbox'); m.className = 'modalbox ' + (cls || ''); m.innerHTML = html; $('#modal').hidden = false; }
function hideModal() { dipOpen = false; $('#modal').hidden = true; const m = $('#modalbox'); m.onclick = null; m.oninput = null; m.onchange = null; m.innerHTML = ''; }
const modalOpen = () => !$('#modal').hidden;


/* ------------------------------------------------------------ diplomacy */
let dipOpen = false, dipAmt = 20, betrayArm = null;
const PACT = B.PACT, REL_ICON = { war: '⚔️', neutral: '·', nap: '🤝', alliance: '⚜️', peace: '🕊️', tribute: '💰' };
const milCount = seat => ordersOf(seat).filter(o => o.type !== 'dip').length;
const dipCount = seat => ordersOf(seat).filter(o => o.type === 'dip').length;
const repLabel = r => r >= 85 ? 'Honoured' : r >= 60 ? 'Trusted' : r >= 40 ? 'Doubtful' : r >= 25 ? 'Distrusted' : 'Oathbreaker';
const repEffect = r => r >= 85 ? 'Counties are +1 happier each season; rivals trust your word.' : r >= 40 ? 'No effect on your people. Honour your pacts to grow it; breaking them costs dearly.' : r >= 25 ? 'Your counties grow restless (−1 mood a season) and rivals hesitate to sign.' : 'Your counties seethe (−2 mood a season) and few will sign anything with you.';
function portrait(p) {
  const art = lordArt(p) || crestArt(p.id);
  return art ? img(art, 'dipface', '') : `<span class="dipface fallback" style="background:${p.color}">⚜</span>`;
}
function pactLeft(k) { return k.until == null ? 'until broken' : Math.max(0, k.until - S.turn) + ' seasons left'; }
function pactTerms(k) {
  const n = i => S.players[i].short;
  if (k.type === 'trade') return `${n(k.terms.goldFrom)} pays 10g ⇄ ${n(k.terms.grainFrom)} sends 14 grain`;
  if (k.type === 'tribute') return `${n(k.terms.payer)} pays ${n(k.terms.payee)} ${k.terms.amt}g`;
  return PACT[k.type].blurb;
}
function propText(p) {
  const f = S.players[p.from].short, t = p.terms || {};
  if (p.kind === 'ransom') { const h = S.heroes.find(x => x.id === t.hid); const nm = h ? h.name : 'a hero'; return h && h.owner === p.to ? `${f} holds <b>${esc(nm)}</b> captive and asks <b>${t.price} gold</b> from you to free them.` : `${f} offers <b>${t.price} gold</b> to ransom <b>${esc(nm)}</b>, whom you hold.`; }
  if (p.kind === 'tribute') return t.dir === 'demand' ? `${f} <b>DEMANDS ${t.amount} gold</b> every season for ${PACT.tribute.dur} seasons. Accept and you are left in peace; refuse and they may come for you.` : `${f} offers you <b>${t.amount} gold</b> every season for ${PACT.tribute.dur} seasons, in return for peace.`;
  if (p.kind === 'trade') return t.dir === 'buy' ? `${f} wants to buy <b>14 grain</b> for <b>10 gold</b> from you every season (${PACT.trade.dur} seasons).` : `${f} wants to sell you <b>14 grain</b> for <b>10 gold</b> every season (${PACT.trade.dur} seasons).`;
  return `${f} proposes a <b>${PACT[p.kind].name.toLowerCase()}</b>. ${PACT[p.kind].blurb}`;
}
function dipHtml() {
  const seat = hv(), me = S.players[seat], orders = ordersOf(seat), canAct = phase === 'plan' && V != null && seat === V;
  let h = `<h2>🤝 Diplomacy</h2>`;
  if (uiMsg) h += `<div class="ev warn" id="dipmsg">${esc(uiMsg)}</div>`;
  h += `<div class="dipme">${portrait(me)}<div><b>${esc(lordName(seat))}</b><br>Reputation <b>${Math.round(me.rep)}</b> · ${repLabel(me.rep)}<div class="bar"><i style="width:${Math.round(me.rep)}%"></i></div><small class="muted">${repEffect(me.rep)}</small></div></div>`;
  h += `<details class="dipinfo"><summary>How diplomacy works</summary><p class="muted small">Envoys are <b>free</b> (up to ${B.DIP_MAX} a season, on top of your 5 orders) and sealed with your orders. A proposal reaches its target when the season resolves; they answer in the next planning phase and a signed pact takes effect when that season resolves. Marching into a partner's land <b>breaks the pact</b> (betrayal) at the same moment, and every house remembers.</p></details>`;
  if (!canAct) h += `<div class="ev info">Browsing only: envoys can be sent during your planning phase.</div>`;
  // incoming
  const inc = B.incoming(S, seat);
  h += `<h3>✉ Proposals to you (${inc.length})</h3>`;
  if (!inc.length) h += `<div class="muted">No house has written to you this season.</div>`;
  for (const p of inc) {
    const ans = orders.findIndex(o => o.type === 'dip' && o.act === 'respond' && o.pid === p.id);
    const mine = ans >= 0 ? orders[ans] : null;
    h += `<div class="dipcard prop" data-prop="${p.id}">${portrait(S.players[p.from])}<div class="grow"><div>${propText(p)}</div>`;
    if (mine) h += `<div class="answered">You will <b>${mine.accept ? 'ACCEPT' : 'decline'}</b>. <button class="btn tiny" data-rm="${ans}" ${canAct ? '' : 'disabled'}>Change</button></div>`;
    else h += `<div class="row"><button class="btn primary small" data-dipresp="${p.id}" data-acc="1" ${canAct ? '' : 'disabled'}>✔ Accept</button><button class="btn small" data-dipresp="${p.id}" data-acc="0" ${canAct ? '' : 'disabled'}>✖ Decline</button></div>`;
    h += `</div></div>`;
  }
  const out = B.outgoing(S, seat);
  if (out.length) h += `<div class="muted small">Awaiting answers to your offers: ${out.map(p => `${esc(S.players[p.to].short)} (${p.kind === 'ransom' ? 'ransom' : esc(PACT[p.kind].name.toLowerCase())})`).join(', ')}.</div>`;
  const alive = S.players.filter(p => p.alive);
  // houses
  h += `<h3>Houses</h3>`;
  const act = (o, label, cls) => { const err = B.checkNewOrder(S, seat, o, orders); return `<button class="btn small ${cls || ''}" data-dipord='${esc(JSON.stringify(o))}' ${canAct && !err ? '' : 'disabled'} title="${esc(err || '')}">${label}</button>`; };
  for (const p of alive) if (p.id !== seat) {
    const rel = B.relation(S, seat, p.id), pacts = S.dip.pacts.filter(k => (k.a === seat && k.b === p.id) || (k.b === seat && k.a === p.id));
    const trust = Math.round(S.dip.trust[p.id][seat]), cs = B.countiesOf(S, p.id).length;
    h += `<div class="dipcard house" data-house="${p.id}">${portrait(p)}<div class="grow">
      <div class="dhead"><b style="color:${p.light}">${esc(lordName(p.id))}</b> ${p.ai ? `<span title="${esc(PERSONALITIES[p.ai.personality].name)}">${PERSONALITIES[p.ai.personality].icon}</span>` : '👤'} <span class="relchip ${rel}">${REL_ICON[rel]} ${B.REL_NAMES[rel]}</span> <span class="muted small">🏰 ${cs}</span></div>
      <div class="dmeters"><span title="How much they trust you">Trust in you <b>${trust}</b><span class="bar sm"><i style="width:${trust}%"></i></span></span><span title="Their reputation among all houses">Reputation <b>${Math.round(p.rep)}</b> · ${repLabel(p.rep)}<span class="bar sm"><i style="width:${Math.round(p.rep)}%"></i></span></span></div>`;
    for (const k of pacts) h += `<div class="deal">${PACT[k.type].icon} <b>${PACT[k.type].name}</b> <span class="muted small">${esc(pactTerms(k))} · ${pactLeft(k)}</span> <button class="btn tiny" data-dipord='${esc(JSON.stringify({ type: 'dip', act: 'break', pact: k.id }))}' ${canAct && !B.checkNewOrder(S, seat, { type: 'dip', act: 'break', pact: k.id }, orders) ? '' : 'disabled'} title="Denounce: ends the deal without war; −reputation">Denounce</button></div>`;
    if (canAct || true) {
      h += `<div class="dacts">`;
      h += act({ type: 'dip', act: 'propose', kind: 'nap', to: p.id }, '🤝 Non-aggression');
      h += act({ type: 'dip', act: 'propose', kind: 'alliance', to: p.id }, '⚜️ Alliance');
      if (rel === 'war') h += act({ type: 'dip', act: 'propose', kind: 'peace', to: p.id }, '🕊️ Peace', 'good');
      h += act({ type: 'dip', act: 'propose', kind: 'trade', to: p.id, dir: 'buy' }, '⚖️ Buy grain');
      h += act({ type: 'dip', act: 'propose', kind: 'trade', to: p.id, dir: 'sell' }, '⚖️ Sell grain');
      h += act({ type: 'dip', act: 'propose', kind: 'tribute', to: p.id, dir: 'demand', amount: dipAmt }, `💰 Demand ${dipAmt}g`, 'warn');
      h += act({ type: 'dip', act: 'propose', kind: 'tribute', to: p.id, dir: 'offer', amount: dipAmt }, `🎁 Offer ${dipAmt}g`);
      for (const hh of B.heldHeroes(S)) if ((hh.owner === seat && hh.heldBy === p.id) || (hh.owner === p.id && hh.heldBy === seat)) h += act({ type: 'dip', act: 'propose', kind: 'ransom', to: p.id, hid: hh.id }, hh.owner === seat ? `⛓ Ransom ${esc(hh.name)} (${B.heroValue(hh)}g)` : `⛓ Sell back ${esc(hh.name)} (${B.heroValue(hh)}g)`, 'good');
      h += `</div>`;
    }
    h += `</div></div>`;
  }
  // matrix
    if (S.players.length > 2) {
    h += `<h3>Relations</h3><table class="relmx"><tr><th></th>${S.players.map(p => `<th><i class="sw" style="background:${p.color}"></i>${esc(p.short)}</th>`).join('')}</tr>`;
    for (const a of S.players) { h += `<tr><th><i class="sw" style="background:${a.color}"></i>${esc(a.short)}${a.alive ? '' : ' ☠'}</th>`; for (const b of S.players) { if (a.id === b.id) h += '<td class="self">—</td>'; else if (!a.alive || !b.alive) h += '<td class="dead">·</td>'; else { const r = B.relation(S, a.id, b.id); h += `<td class="rel ${r}" title="${esc(a.short + ' / ' + b.short + ': ' + B.REL_NAMES[r])}">${REL_ICON[r]}</td>`; } } h += '</tr>'; }
    h += '</table><div class="muted small">⚔️ war · 🤝 non-aggression · ⚜️ alliance · 🕊️ peace · 💰 tribute · · no pact. Trade deals do not protect.</div>';
  }
  const dead = S.players.filter(p => !p.alive);
  if (dead.length) h += `<div class="muted small">Fallen houses: ${dead.map(p => esc(p.short)).join(', ')}.</div>`;
  // held heroes
  const held = B.heldHeroes(S).filter(x => x.owner === seat || x.heldBy === seat);
  if (held.length) h += `<h3>⛓ Captive heroes</h3>` + held.map(x => `<div class="deal">${x.heldBy === seat ? 'You hold' : 'Held by ' + esc(S.players[x.heldBy].short) + ':'} <b>${esc(x.name)}</b> <span class="muted small">(worth ${B.heroValue(x)}g; escapes after ${B.HELD_TURNS} seasons)</span></div>`).join('');
  // this season's envoys
  const dl = orders.map((o, i) => [o, i]).filter(x => x[0].type === 'dip');
  h += `<h3>Your envoys this season <span class="chip">${dl.length}/${B.DIP_MAX}</span></h3>`;
  if (!dl.length) h += `<div class="muted">None yet.</div>`;
  else h += '<ul class="orderlist">' + dl.map(([o, i]) => `<li class="dip"><span>${esc(B.describeOrder(S, o))}</span><button class="x" data-rm="${i}" ${canAct ? '' : 'disabled'} title="Remove">✕</button></li>`).join('') + '</ul>';
  h += `<div class="row" style="margin-top:8px"><label class="muted small">Tribute amount <select data-dipamt><option ${dipAmt === 10 ? 'selected' : ''}>10</option><option ${dipAmt === 20 ? 'selected' : ''}>20</option><option ${dipAmt === 30 ? 'selected' : ''}>30</option></select> gold/season</label><button class="btn primary" id="closeDip" style="margin-left:auto">Done</button></div>`;
  return h;
}
function showDip() {
  if (!S || phase === 'menu' || phase === 'pass') return;
  const mb = $('#modalbox'), st = dipOpen ? mb.scrollTop : 0;
  showModal(dipHtml(), 'wide dip'); dipOpen = true; $('#modalbox').scrollTop = st;
}

function helpHtml() {
  return `<h2>How to Play</h2>
  <p>Rule a house of the realm. Each house keeps a <b>Royal Banner</b> in a capital castle ⚜. Every season all lords plan <b>secret orders at the same time</b>, then everything is revealed at once.</p>
  <h3>Winning</h3><p>March <b>infantry</b> (not knights) into a rival capital and hold it, with no defenders left, through a <b>full season</b> to capture its Royal Banner: that house is <b>captured and absorbed</b> (its counties and soldiers become yours). Be the last house standing. After 25 years the house with the most land is crowned.</p>
  <h3>Each season</h3>
  <ul><li><b>Plan</b> up to <b>5 secret orders</b> (plus up to 4 free diplomatic <b>envoys</b>, see 🤝 below): <i>march</i> (with a secret stance), <i>recruit</i>, <i>merge</i> three identical units into a Banner, set <i>taxes</i>, <i>build</i> a castle, <i>scout</i>, <i>feint</i>, <i>storm</i> or <i>sally</i>. Garrison stance is free.</li>
  <li><b>Seal</b> your orders. Armies then <b>march simultaneously on the map</b> (drums!), clash with a flash and a shake, and the Chronicle records the results. <b>Skip ⏩</b> jumps to the end; 🔊/🔇 mutes the sound.</li></ul>
  <h3>Battles</h3>
  <ul><li>Stances: ⚔️ Charge beats 🏹 Flank, 🛡️ Hold beats ⚔️ Charge, 🏹 Flank beats 🛡️ Hold (+40% power).</li>
  <li>Terrain (hills +20%, mountains +30%, forest/marsh +10%) and <b>castles</b> help defenders. Unit counters add up to +50%.</li>
  <li>A winner with 1.3× the loser's power <b>captures</b> the beaten army: <b>ransom</b>, <b>press into service</b>, or <b>release</b>. Narrow wins just rout the loser. A <b>Banner</b> unit is worth 1.5× its three units but is captured whole if it loses.</li></ul>
  <h3>🌫 Fog of war, scouts & feints</h3>
  <ul><li>You see armies only in counties you own or occupy, next to them, or scouted. Foggy counties show the <b>last seen</b> force (a ghost shield). The AI rivals are under the same fog: they cannot see your armies either.</li>
  <li>A <b>🔭 Scout</b> (14g) sent with a scout order reveals a county up to 3 away (and its neighbours) for the coming season.</li>
  <li>A <b>🎭 Feint</b> (6g) puts a fake army near a county: rivals who can see it will count it as real. The fake vanishes after one season.</li></ul>
  <h3>🏰 Sieges & castles</h3>
  <ul><li>Counties can have a <b>Palisade → Keep → Fortress</b> (build for gold and seasons). Capitals start fortified.</li>
  <li>Marching onto an enemy castle makes you <b>besiege</b> it: no clash, but the garrison <b>starves</b> as its food stores run out, and the county pays you nothing. Or <b>storm</b> the walls: the attacker suffers a penalty, and against a Keep or Fortress <b>siege engines 🪵</b> are needed. The garrison can <b>sally out</b> to fight in the open. Starved garrisons surrender and are captured.</li></ul>
  <h3>🔥 Rebellions</h3><p>Counties whose mood stays very low <b>revolt</b>: neutral rebel armies spawn there. Conquered counties start unhappy, so keep troops there and tax lightly. Raise taxes too far and you will have a rebellion on your hands.</p>
  <h3>👑 Heroes</h3><p>Every house has a named knight. A hero marches with a stack and boosts it. Deeds earn <b>traits</b> (😈 Feared, 🧠 Tactician, 🏗️ Siege Master, 💨 Swift, 🛡️ Stalwart, ❤️ Beloved, 💬 Silver Tongue). A hero on a beaten stack is <b>captured</b>: ransom or release.</p>
  <h3>🎲 Seasonal events</h3><p>Plague, bumper harvests, droughts, festivals, tournaments, bandits, harsh winters, hired mercenary companies and famed knights arrive as <b>event cards</b>.</p>
  <h3>🧙 Rival lords</h3>
  <ul><li><b>⚔️ Warlord</b>: aggressive, hits early with knights. <b>🏰 Builder</b>: turtles and fortifies, strikes only when overwhelming. <b>🎭 Schemer</b>: feints, waits, backstabs the weak.</li>
  <li>New Game: choose 1–5 rivals (3 or more houses use the bigger map; your starting corner is drawn by lot) and <b>Easy / Normal / Hard</b>.</li></ul>
  <h3>🤝 Diplomacy</h3>
  <ul><li>Open <b>🤝 Diplomacy</b> (top bar, or tap a rival chip). Envoys are <b>free</b>: up to 4 a season, sealed with your orders. A proposal reaches its target when the season resolves; they answer in <i>their</i> next planning phase and the pact begins as that season resolves. Two identical offers that cross on the road are signed at once.</li>
  <li><b>🤝 Non-aggression</b> (8 seasons): neither side may enter the other's land. <b>⚜️ Alliance</b>: shared vision, free passage, armies fight side by side, and if <i>every</i> surviving house is allied with every other for 4 seasons, they <b>share the victory</b>. <b>🕊️ Peace</b> ends a war and lifts sieges. <b>⚖️ Trade</b>: 10 gold for 14 grain each season. <b>💰 Tribute</b>: demand (or offer) 10-30 gold a season for 4 seasons. <b>⛓ Ransom</b>: hold a captured hero and trade them back.</li>
  <li><b>Betrayal</b>: marching into a partner's land (an ally needs the explicit 🗡️ <i>Betray</i> button) breaks the pact in the same instant the season resolves: war, heavy <b>reputation</b> loss and restless counties. Reputation and each house's <b>trust</b> in you decide who will sign with you. A pact signed this season halts an army that was already ordered across the border.</li>
  <li>Rivals decide by character: <b>🏰 Builders</b> are the most loyal and sign readily, <b>🎭 Schemers</b> sign too and are the likeliest to stab you in the back once you look weak, <b>⚔️ Warlords</b> demand tribute from weaker neighbours. Pacts and betrayals are public in the Chronicle; proposals are private.</li></ul>
  <h3>👥 Hotseat</h3><p>2–4 humans on one device (plus any AI rivals). Each lord gets a <b>pass-the-device</b> screen that hides the map and orders. When everyone has sealed, the reveal is public (everyone sees what any human can see).</p>
  <h3>🔗 Play by link (no server)</h3>
  <ol><li>One player picks <b>Play by link</b>, names the players and presses Create. The <b>game code</b> is shown: send it to the others (chat, email).</li>
  <li>Others choose <b>Join a game</b>, paste the code and pick their seat.</li>
  <li>Everyone plans, then presses <b>Seal orders</b>. That publishes only a <b>hashed commitment</b>. Send your new code to everyone; paste the codes you receive.</li>
  <li>When all commitments are in, press <b>Reveal my orders</b> and exchange codes again. Revealed orders must match each commitment's hash, or they are rejected. When everyone's orders are in, every device plays the season identically (same seed, same rules).</li>
  <li>Codes are compressed base64 with an integrity checksum; altered or truncated codes are refused, and a state check warns if two devices drift apart. Codes also carry the game history, so a late or lagging player can catch up from any newer code. Your game saves automatically in the browser.</li></ol>
  <p class="muted">In link games, prisoner/hero decisions follow your <i>standing decrees</i> (chosen at creation). Everything is client-side: nothing is uploaded.</p>
  <table><tr><th>Unit</th><th>Power</th><th>Cost</th><th>Wage</th><th>Food</th><th>Notes</th></tr>
  <tr><td>🔱 Levy</td><td>1</td><td>8g</td><td>1</td><td>1</td><td>cheap</td></tr>
  <tr><td>🏹 Archers</td><td>2</td><td>20g</td><td>1</td><td>1</td><td>beat Levy</td></tr>
  <tr><td>🗡️ Men-at-arms</td><td>3</td><td>35g</td><td>2</td><td>2</td><td>beat Archers</td></tr>
  <tr><td>🐴 Knights</td><td>5</td><td>70g</td><td>3</td><td>3</td><td>capital only; cannot take a capital</td></tr>
  <tr><td>🔭 Scout</td><td>0.5</td><td>14g</td><td>1</td><td>1</td><td>reveals the fog</td></tr>
  <tr><td>🪵 Siege engine</td><td>1</td><td>45g</td><td>1</td><td>2</td><td>needs a castle to build; storms keeps</td></tr></table>
  <p class="muted">Economy: gold from taxes and ransoms, wages every season. Grain: harvest in Autumn; Winter raises food use and may snow in marches. Starvation or unpaid wages make troops desert.</p>
  <button class="btn primary" id="closeHelp">To arms!</button>`;
}

function choiceModal(info, cb) {
  const loser = info.loser != null && info.loser >= 0 ? S.players[info.loser].short : 'the garrison';
  const who = S.players[info.player];
  const head = G && G.mode === 'hotseat' ? `<div class="muted">${esc(lordName(info.player))} decides.</div>` : '';
  let html;
  if (info.ctype === 'prisoners') html = `<h2>Prisoners taken!</h2>${head}<p>Your victory at <b>${esc(cn(info.county))}</b> leaves <b>${esc(info.desc)}</b> of ${esc(loser)} in your hands. What is your decree?</p>
   <button class="btn opt" data-choice="ransom">💰 <b>Ransom</b> for <b>${info.value} gold</b><br><small>The men go home (or disband if home is lost).</small></button>
   <button class="btn opt" data-choice="press">⚔️ <b>Press into service</b><br><small>They join you at 85% strength, cost upkeep, and desert if beaten.</small></button>
   <button class="btn opt" data-choice="release">🕊️ <b>Release</b><br><small>+3 mood in all your counties; the men return home.</small></button>`;
  else if (info.ctype === 'hero') {
    const hh = S.heroes.find(x => x.name === info.hero.name);
    html = `<h2>A hero captured!</h2>${head}<div class="herocap">${img(heroArt(hh), 'hportrait', '')}<div><b>${esc(info.hero.name)}</b><br><span class="muted">${info.hero.traits.map(t => TRAITS[t].icon + ' ' + TRAITS[t].name).join(', ') || 'no traits yet'} · ${info.hero.deeds} deeds</span></div></div>
   <button class="btn opt" data-choice="ransom">💰 <b>Ransom</b> for <b>${info.value} gold</b><br><small>The hero returns to their house.</small></button>
   <button class="btn opt" data-choice="release">🕊️ <b>Release with honour</b><br><small>+3 mood in all your counties.</small></button>${info.options.includes('hold') ? `<button class="btn opt" data-choice="hold">⛓ <b>Hold captive</b><br><small>Keep the hero. Negotiate a ransom in Diplomacy (they escape after ${B.HELD_TURNS} seasons).</small></button>` : ''}`;
  } else if (info.ctype === 'merc') html = `<h2>Mercenaries for hire</h2>${head}<div class="herocap">${img(eventArt('mercenaries'), 'evart sm', '')}<div>The Iron Wolves offer <b>${esc(info.desc)}</b> for <b>${info.price} gold</b> (they must be paid wages after).</div></div>
   <button class="btn opt" data-choice="hire" ${who.gold < info.price ? 'disabled' : ''}>⚔️ <b>Hire</b> them (${info.price}g)</button><button class="btn opt" data-choice="decline">🚪 Send them away</button>`;
  else html = `<h2>${info.ctype === 'heroOffer' ? 'A famed knight arrives' : 'Decision'}</h2>${head}<p>${esc(info.text)}</p>${info.options.map(o => `<button class="btn opt" data-choice="${esc(o)}">${esc(o[0].toUpperCase() + o.slice(1))}</button>`).join('')}`;
  showModal(html);
  $('#modalbox').onclick = e => { const b = e.target.closest('[data-choice]'); if (b && !b.disabled) { $('#modalbox').onclick = null; hideModal(); cb(b.dataset.choice); } };
}

function gameOverModal() {
  const o = S.over; sfx.horn(o.winner != null && humans().some(h => h.id === o.winner));
  let title, text, icon;
  const hs = humans().map(h => h.id);
  if (o.winner === null || o.winner === undefined) { title = 'A Draw'; icon = '⚖️'; text = 'The realm dissolves in chaos.'; }
  else {
    const w = S.players[o.winner];
    const mineWin = G && G.mode === 'solo' ? (o.winners || [o.winner]).includes(0) : (o.winners || [o.winner]).some(x => hs.includes(x));
    const winners = o.winners || [o.winner];
    title = G && G.mode === 'solo' ? (mineWin ? 'Victory!' : 'Defeat') : o.reason === 'alliance' ? 'A grand alliance wins!' : `${esc(lordName(o.winner))} wins!`;
    icon = mineWin ? '👑' : '💀';
    text = o.reason === 'alliance' ? `Every house that remains has sworn the same oath. ${(o.winners || []).map(i => S.players[i].short).join(', ')} share the victory, and ${w.name} holds the most land.` : o.reason === 'banner' ? `${w.name} holds the last Royal Banner. ${mineWin ? 'The kingdom kneels.' : 'Your line ends here.'}` : `After 25 years, ${w.name} holds the most land and is crowned.`;
  }
  const rows = S.players.map(p => `<li>${tag(p.id)} ${esc(p.lord || p.short)}${p.ai ? ' ' + PERSONALITIES[p.ai.personality].icon : ''}: ${p.alive ? B.countiesOf(S, p.id).length + ' counties' : 'fallen'} · reputation ${Math.round(p.rep)}${(S.over.winners || [S.over.winner]).includes(p.id) ? ' 👑' : ''}</li>`).join('');
  showModal(`<div class="big">${icon}</div><h2 style="text-align:center">${title}</h2><p style="text-align:center">${esc(text)}</p>
    <p class="muted" style="text-align:center">${SEASONS[S.season]}, Year ${S.year}</p><ul>${rows}</ul><button class="btn primary" id="again">New game</button>`);
}

/* ------------------------------------------------------------ new game dialog */
const LORD_NAMES = ['Aldric', 'Valmoor', 'Thorne', 'Ravenscar', 'Stormvale', 'Blackwood'];
function newGameHtml() {
  const pers = Object.keys(PERSONALITIES);
  return `<div class="splash">${img(ART.splash, 'splashimg', '')}<div class="splashtitle">⚜ Banners of the Realm</div></div>
  <h2>New Game</h2>
  <div class="ngrid">
    <label>Mode</label><div class="seg" id="ngMode"><button class="btn on" data-v="solo">Solo vs rivals</button><button class="btn" data-v="hotseat">Hotseat</button><button class="btn" data-v="async">Play by link</button></div>
    <label id="lblHumans">Human lords</label><div class="seg" id="ngHumans"><button class="btn on" data-v="1">1</button></div>
    <label>Rival AI lords</label><div class="seg" id="ngRivals"></div>
    <label>Difficulty</label><div class="seg" id="ngLevel">${Object.keys(DIFFICULTY).map(k => `<button class="btn ${k === 'normal' ? 'on' : ''}" data-v="${k}">${DIFFICULTY[k].name}</button>`).join('')}</div>
    <label>Map</label><div id="ngMap" class="muted"></div>
  </div>
  <div id="ngNames"></div>
  <h3>Rival personalities</h3><div id="ngPers" class="persgrid"></div>
  <div class="ngrid"><label>Seed <small>(optional)</small></label><input id="ngSeed" class="inp" placeholder="random" inputmode="numeric"></div>
  <div class="row" style="margin-top:10px"><button class="btn primary" id="ngStart" style="flex:2">Begin the campaign</button><button class="btn" id="ngJoin" style="flex:1">Join a link game…</button><button class="btn" id="ngCancel" style="flex:0 0 auto">Cancel</button></div>`;
}
const NG = { mode: 'solo', humans: 1, rivals: 1, level: 'normal', pers: [] };
function ngRefresh() {
  const solo = NG.mode === 'solo';
  const hmin = solo ? 1 : 2, hmax = solo ? 1 : 4;
  NG.humans = Math.max(hmin, Math.min(hmax, NG.humans));
  const rmin = NG.humans === 1 ? 1 : 0, rmax = Math.min(5, 6 - NG.humans);
  NG.rivals = Math.max(rmin, Math.min(rmax, NG.rivals));
  $('#ngHumans').innerHTML = Array.from({ length: hmax - hmin + 1 }, (_, k) => hmin + k).map(n => `<button class="btn ${n === NG.humans ? 'on' : ''}" data-v="${n}">${n}</button>`).join('');
  $('#lblHumans').textContent = solo ? 'You' : 'Human lords';
  $('#ngRivals').innerHTML = Array.from({ length: rmax - rmin + 1 }, (_, k) => rmin + k).map(n => `<button class="btn ${n === NG.rivals ? 'on' : ''}" data-v="${n}">${n}</button>`).join('');
  const total = NG.humans + NG.rivals;
  $('#ngMap').textContent = total <= 2 ? 'Small realm (15 counties)' : `Great realm (28 counties), ${total} houses; starting corners drawn by lot`;
  document.querySelectorAll('#ngMode .btn').forEach(b => b.classList.toggle('on', b.dataset.v === NG.mode));
  document.querySelectorAll('#ngLevel .btn').forEach(b => b.classList.toggle('on', b.dataset.v === NG.level));
  const names = $('#ngNames');
  if (!solo) {
    const old = [...names.querySelectorAll('input')].map(i => i.value);
    names.innerHTML = '<h3>Players</h3><div class="ngrid">' + Array.from({ length: NG.humans }, (_, i) => `<label>Lord ${i + 1}</label><input class="inp" data-name="${i}" maxlength="20" value="${esc(old[i] || '')}" placeholder="${LORD_NAMES[i] ? 'Lord of ' + LORD_NAMES[i] : 'Name'}">`).join('') + '</div>' +
      (NG.mode === 'async' ? '<div class="muted">Standing decrees for captured prisoners/heroes (async games resolve these automatically):</div><div class="ngrid"><label>Prisoners</label><select class="inp" id="ngPris"><option value="press">Press into service</option><option value="ransom">Ransom</option><option value="release">Release</option></select><label>Heroes</label><select class="inp" id="ngHero"><option value="ransom">Ransom</option><option value="release">Release</option></select></div>' : '');
  } else names.innerHTML = '';
  const oldp = [...document.querySelectorAll('#ngPers select')].map(s => s.value);
  $('#ngPers').innerHTML = Array.from({ length: NG.rivals }, (_, i) => {
    const sel = oldp[i] || 'random';
    const pp = Object.keys(PERSONALITIES), cur = sel === 'random' ? null : sel;
    return `<div class="pcard">${img(cur ? artPath('lords', cur) : null, 'lordimg', '')}<b>Rival ${i + 1}</b><select class="inp" data-pers="${i}"><option value="random">🎲 Random</option>${pp.map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${PERSONALITIES[k].icon} ${PERSONALITIES[k].name}</option>`).join('')}</select><small class="muted">${cur ? esc(PERSONALITIES[cur].blurb) : 'Warlord, Builder or Schemer: a surprise.'}</small></div>`;
  }).join('') || '<div class="muted">No AI rivals: humans only.</div>';
}
function openNewGame() {
  showModal(newGameHtml(), 'wide');
  NG.mode = 'solo'; NG.humans = 1; NG.rivals = 1; NG.level = 'normal';
  ngRefresh();
  const box = $('#modalbox');
  box.onclick = e => {
    const t = e.target, seg = t.closest('.seg .btn');
    if (seg) {
      const id = seg.parentElement.id, v = seg.dataset.v;
      if (id === 'ngMode') { NG.mode = v; if (v === 'solo') NG.humans = 1; else if (NG.humans < 2) NG.humans = 2; if (NG.humans === 1 && NG.rivals < 1) NG.rivals = 1; }
      if (id === 'ngHumans') NG.humans = +v;
      if (id === 'ngRivals') NG.rivals = +v;
      if (id === 'ngLevel') NG.level = v;
      ngRefresh(); return;
    }
    if (t.id === 'ngCancel') { hideModal(); if (!S) openNewGame(); return; }
    if (t.id === 'ngJoin') { openJoin(); return; }
    if (t.id === 'ngStart') startFromDialog();
  };
  box.onchange = e => { if (e.target.dataset && e.target.dataset.pers != null) ngRefresh(); };
}
function startFromDialog() {
  const personalities = [...document.querySelectorAll('#ngPers select')].map(s => s.value);
  const pk = Object.keys(PERSONALITIES);
  const rnd = () => Math.floor(Math.random() * pk.length);
  const players = [];
  const names = [...document.querySelectorAll('#ngNames input')].map(i => i.value.trim());
  const policy = NG.mode === 'async' ? { prisoners: ($('#ngPris') || {}).value || 'press', hero: ($('#ngHero') || {}).value || 'ransom' } : null;
  for (let i = 0; i < NG.humans; i++) players.push(NG.mode === 'solo' ? { name: '' } : { name: names[i] || LORD_NAMES[i], policy });
  for (let i = 0; i < NG.rivals; i++) players.push({ ai: { personality: personalities[i] && personalities[i] !== 'random' ? personalities[i] : pk[rnd()], level: NG.level } });
  const seedTxt = ($('#ngSeed').value || '').trim();
  const seed = seedTxt ? (parseInt(seedTxt, 10) >>> 0) : rid();
  hideModal(); $('#modalbox').onchange = null;
  startGame(NG.mode, NET.makeSetup(seed, players));
}

/* ------------------------------------------------------------ persistence */
function save() {
  try {
    if (!G) return;
    if (G.mode === 'async') { localStorage.setItem(ASYNC_KEY, JSON.stringify({ rec: G.rec })); localStorage.setItem('botr_active', 'async'); return; }
    if (S.over) { localStorage.removeItem(SAVE_KEY); return; }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ mode: G.mode, setup: G.setup, S, orders: G.orders, sealed: G.sealed, idx: G.idx, v: 3 }));
    localStorage.setItem('botr_active', 'local');
  } catch (e) { /* storage full or blocked */ }
}

/* ------------------------------------------------------------ game flow */
function startGame(mode, setup) {
  clearTimeout(timer); gen = null; resolving = null; pickMode = null; flashC = null; movingIds = null; tokenSigs = {}; fast = false;
  $('#btnSkip').hidden = true;
  G = { mode, setup, orders: {}, sealed: {}, idx: 0 };
  if (mode === 'async') { G.rec = NET.newRecord(setup, 0); S = NET.stateOf(G.rec); }
  else S = NET.initState(setup, { autoChoose: false });
  MAP = B.getMap(S); MAP_DEF = MAP.defs;
  S.log.push({ text: 'Spring of Year 1. Your lords await your commands.', kind: 'phase', season: 0, year: 1, vis: 'all' });
  resetView(); sel = null; selFor = null; uiMsg = '';
  rebuildLog();
  beginPlanning(true);
  if (mode === 'async') { setTimeout(() => openAsync(), 150); }
}
function aliveHumanSeats() { return humans().filter(p => p.alive).map(p => p.id); }
function beginPlanning(first) {
  if (!S) return;
  MAP = B.getMap(S); MAP_DEF = MAP.defs;
  G.orders = {}; G.sealed = {}; G.idx = 0; pickMode = null; selFor = null; uiMsg = '';
  const hs = aliveHumanSeats();
  if (!hs.length) { V = null; phase = 'over'; if (!S.over) S.over = { winner: null, reason: 'crown' }; render(); return; }
  if (G.mode === 'async') {
    const seat = G.rec.local.seat;
    V = seat; phase = (G.rec.commits[seat] ? 'wait' : 'plan');
    if (!S.players[seat].alive) { phase = 'wait'; }
    G.orders[seat] = (G.rec.local && G.rec.local.orders && G.rec.local.turn === S.turn) ? G.rec.local.orders.slice() : [];
    sel = S.players[seat].capital; focusOn(sel); render(); save(); return;
  }
  hs.forEach(s => { G.orders[s] = []; });
  if (G.mode === 'hotseat') { startPass(0); }
  else { V = hs[0]; phase = 'plan'; sel = S.players[V].capital; render(); save(); }
}
function startPass(i) {
  const hs = aliveHumanSeats();
  G.idx = i; V = null; phase = 'pass'; selFor = null; hideModal();
  const seat = hs[i], p = S.players[seat];
  $('#pass').hidden = false;
  $('#pass').innerHTML = `<div class="passbox"><div class="passcrest" style="border-color:${p.color}">${crestArt(seat) ? img(crestArt(seat), 'crestimg', '') : '⚜'}</div>
    <h2>Pass the device to</h2><div class="passname" style="color:${p.light}">${esc(lordName(seat))}</div>
    <p class="muted">${SEASON_ICON[S.season]} ${SEASONS[S.season]} of Year ${S.year}. Everyone else look away: the map and orders are hidden until ${esc(p.lord || p.short)} taps below.</p>
    <button class="btn primary" id="passGo">I am ${esc(p.lord || p.short)}: show my realm</button></div>`;
  render();
}
function passGo() {
  const hs = aliveHumanSeats(), seat = hs[G.idx];
  $('#pass').hidden = true; $('#pass').innerHTML = '';
  V = seat; phase = 'plan'; sel = S.players[seat].capital; selFor = null; uiMsg = ''; focusOn(sel); sfx.init(); render(); save();
}
function render() {
  if (!S) return;
  MAP = B.getMap(S); MAP_DEF = MAP.defs;
  const hidden = phase === 'pass' || phase === 'menu';
  $('#app').classList.toggle('veiled', hidden);
  renderHeader(); renderMap(); renderCounty(); renderOrders(); applyView();
  if (dipOpen && modalOpen()) showDip();
  $('#btnLink').hidden = !(G && G.mode === 'async');
}

function addOrder(o) {
  uiMsg = '';
  const err = B.checkNewOrder(S, V, o, G.orders[V]);
  if (err) { uiMsg = err; render(); return false; }
  G.orders[V].push(o); pickMode = null; sfx.init(); render(); save(); return true;
}
function seal() {
  if (phase !== 'plan' || V == null) return;
  sfx.init();
  const seat = V, mine = B.sanitizeOrders(S, seat, G.orders[seat]);
  G.orders[seat] = mine; pickMode = null;
  if (G.mode === 'async') {
    try { NET.commit(G.rec, S, seat, mine); } catch (e) { uiMsg = e.message; render(); return; }
    phase = 'wait'; render(); save(); sfx.coin(); openAsync(); return;
  }
  G.sealed[seat] = true;
  if (G.mode === 'hotseat') {
    const hs = aliveHumanSeats();
    if (G.idx + 1 < hs.length) { startPass(G.idx + 1); save(); return; }
  }
  startReveal(null);
}
function startReveal(rs) {
  phase = 'reveal'; V = null; fast = false; uiMsg = ''; flashC = null; movingIds = null;
  $('#btnSkip').hidden = false; $('#pass').hidden = true; hideModal();
  if (rs) { resolving = rs; gen = rs.gen; }
  else { resolving = null; gen = B.resolveTurn(S, NET.collectOrders(S, G.orders)); }
  answer = undefined; G.orders = {};
  sfx.init(); sfx.drums(8);
  render(); schedule(900);
}
function schedule(ms) { clearTimeout(timer); timer = setTimeout(step, fast ? 0 : ms); }
function evDelay(ev) { return ev.kind === 'phase' ? 450 : ev.kind === 'battle' ? 1900 : ev.kind === 'event' ? 3000 : ev.kind === 'movement' ? 200 : ev.kind === 'econ' ? 450 : 800; }
function step() {
  if (phase !== 'reveal') return;
  for (let guard = 0; guard < 5000; guard++) {
    let r;
    try { r = gen.next(answer); } catch (e) { console.error(e); phase = 'plan'; uiMsg = 'Internal error: ' + e.message; V = viewers()[0]; render(); return; }
    answer = undefined;
    if (movingIds) movingIds = null;
    if (r.done) return finishTurn();
    const ev = r.value;
    if (ev.kind === 'choice') {
      appendLog({ text: ev.text, kind: 'capture', vis: 'all' }, !fast);
      flashC = { id: ev.county, bad: false }; render();
      choiceModal(ev, c => { answer = c; schedule(100); });
      return;
    }
    const vis = evVisible(ev);
    if (ev.card && vis) showCard(ev.card, ev);
    if (!vis) { if (fast) continue; render(); continue; }
    appendLog(ev, !fast);
    if (ev.kind === 'movement' && ev.moves && !fast) {
      render(); animateMoves(ev, () => schedule(250)); return;
    }
    flashC = ev.county != null && !['phase', 'econ', 'event'].includes(ev.kind) ? { id: ev.county, bad: ev.kind === 'battle' } : null;
    if (ev.kind === 'alarm' || ev.kind === 'win') flashC = { id: ev.county, bad: true };
    if (ev.kind === 'battle' && !fast) clashFx(ev);
    if (ev.kind === 'alarm' || ev.kind === 'capture') sfx.drum(0, 0.5, 90);
    if (ev.kind === 'econ' || ev.kind === 'recruit') { /* quiet */ }
    render();
    if (fast) continue;
    schedule(evDelay(ev)); return;
  }
  finishTurn();
}
function clashFx(ev) {
  sfx.clash();
  const wrap = $('#mapwrap'); wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake');
  setTimeout(() => wrap.classList.remove('shake'), 650);
  const cid = ev.battle && ev.battle.cid != null ? ev.battle.cid : ev.county;
  const cen = cid != null ? MAP.centroid[cid] : null;
  if (cen) {
    const layer = $('#anim'); const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${cen[0]} ${cen[1]})`);
    g.innerHTML = '<circle class="burst" r="10"/><circle class="burst b2" r="10"/><text class="burstx" y="14" text-anchor="middle">⚔️</text>';
    layer.appendChild(g); setTimeout(() => g.remove(), 1300);
  }
}
function animateMoves(ev, done) {
  const vs = viewers(), mv = ev.moves.filter(m => m.vis.some(p => vs.includes(p)));
  const layer = $('#anim');
  if (!mv.length) { done(); return; }
  movingIds = new Set(); mv.forEach(m => m.ids.forEach(id => movingIds.add(id)));
  renderMap();
  const K = narrow() ? 1.5 : 1, svgNS = 'http://www.w3.org/2000/svg';
  const toks = mv.map((m, k) => {
    const a = MAP.centroid[m.from], b = MAP.centroid[m.to];
    const g = document.createElementNS(svgNS, 'g'); g.setAttribute('class', 'mvtok');
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, off = ((k % 3) - 1) * 9;
    const A = [a[0] - dy / L * off, a[1] + dx / L * off + 18], Bp = [b[0] - dy / L * off, b[1] + dx / L * off + 18];
    g.innerHTML = `<path d="${SHIELD}" fill="${pl(m.owner).color}" stroke="#ffd34d" stroke-width="3"/><text class="n" y="3">${m.pow}</text><text class="u" y="14">${m.n}u</text>`;
    layer.appendChild(g); return { g, A, Bp };
  });
  const dur = 1300, t0 = performance.now();
  (function frame(now) {
    if (fast || phase !== 'reveal') { toks.forEach(t => t.g.remove()); movingIds = null; done(); return; }
    const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    toks.forEach(t => { const x = t.A[0] + (t.Bp[0] - t.A[0]) * e, y = t.A[1] + (t.Bp[1] - t.A[1]) * e; t.g.setAttribute('transform', `translate(${x} ${y}) scale(${K})`); });
    if (k < 1) requestAnimationFrame(frame); else { setTimeout(() => { toks.forEach(t => t.g.remove()); done(); }, 180); }
  })(t0);
}
function finishTurn() {
  clearTimeout(timer); flashC = null; gen = null; movingIds = null;
  $('#anim').innerHTML = ''; $('#btnSkip').hidden = true;
  if (resolving) { resolving.finish(); resolving = null; }
  tokenSigs = {};
  if (S.over) { phase = 'over'; V = null; render(); save(); setTimeout(gameOverModal, fast ? 0 : 600); return; }
  beginPlanning(false);
  const me = S.players[hv()]; const capc = S.counties[me.capital];
  if (capc && (capc.occ || capc.siege)) uiMsg = 'Your capital is under attack! Relieve it or lose the banner.';
  render(); save();
}

/* ------------------------------------------------------------ async (play by link) panel */
let asyncMsg = [];
async function openAsync(msgs) {
  if (!G || G.mode !== 'async') return;
  if (msgs) asyncMsg = msgs;
  const rec = G.rec, seat = rec.local.seat, st = NET.pending(rec, S);
  let code = ''; try { code = await NET.pack(NET.exportSync(rec, S)); } catch (e) { code = 'Could not build code: ' + e.message; }
  const mine = S.players[seat];
  const rows = st.humans.map(s => `<li>${tag(s)} ${esc(S.players[s].lord || S.players[s].short)}${s === seat ? ' (you)' : ''}: ${rec.reveals[s] ? '👁 revealed' : rec.commits[s] ? '🔒 sealed' : '⏳ planning'}</li>`).join('');
  const sealed = !!rec.commits[seat], revealed = !!rec.reveals[seat], canRev = sealed && NET.canReveal(rec, S) && !revealed;
  let step1;
  if (!mine.alive) step1 = 'Your house has fallen. You can still follow the game by importing codes.';
  else if (!sealed) step1 = '1️⃣ Plan your orders on the map, then press <b>Seal orders</b>.';
  else if (!NET.canReveal(rec, S)) step1 = '2️⃣ <b>Send your code</b> to the other players and paste theirs below. Reveal opens once every commitment is in.';
  else if (!revealed) step1 = '3️⃣ Everyone has sealed. Press <b>Reveal my orders</b>, then send your new code around.';
  else step1 = '4️⃣ Orders revealed. Send your code and paste the others\'; the season plays as soon as everyone\'s orders are in.';
  const warns = asyncMsg.map(m => `<div class="ev ${/REJECT|Warning|fail|not|cannot|different|damaged/i.test(m) ? 'warn' : 'info'}">${esc(m)}</div>`).join('');
  showModal(`<h2>🔗 Play by link</h2><p class="muted">Season ${S.turn + 1}: ${SEASONS[S.season]}, Year ${S.year} · you are ${tag(seat)} <b>${esc(mine.lord || mine.short)}</b></p>
    <ul class="statuslist">${rows}</ul><p>${step1}</p>${warns}
    <h3>Your code (send to the others)</h3><textarea id="asyncOut" class="code" readonly rows="4">${esc(code)}</textarea>
    <div class="row"><button class="btn small" id="asyncCopy">📋 Copy code</button>${canRev ? '<button class="btn small gold" id="asyncReveal">👁 Reveal my orders</button>' : ''}<span class="muted">${code.length} characters</span></div>
    <h3>Paste a code from another player</h3><textarea id="asyncIn" class="code" rows="3" placeholder="BOTR1…"></textarea>
    <div class="row"><button class="btn small" id="asyncImport">⬇ Import code</button><button class="btn small" id="asyncClose">Close</button></div>`, 'wide');
  asyncMsg = [];
  $('#modalbox').onclick = async e => {
    const t = e.target;
    if (t.id === 'asyncClose') { hideModal(); return; }
    if (t.id === 'asyncCopy') { const ta = $('#asyncOut'); ta.select(); try { await navigator.clipboard.writeText(ta.value); t.textContent = '✔ Copied'; } catch (er) { document.execCommand('copy'); t.textContent = '✔ Copied'; } return; }
    if (t.id === 'asyncReveal') { try { NET.reveal(rec, S); save(); } catch (er) { asyncMsg = [er.message]; } return afterAsync([]); }
    if (t.id === 'asyncImport') {
      const txt = $('#asyncIn').value;
      let msgs = [];
      try {
        const obj = await NET.unpack(txt);
        const before = S.turn, r = NET.importSync(rec, S, obj);
        S = r.S; msgs = r.warns.concat(r.notes);
        if (S.turn !== before) { beginPlanning(false); }
        save();
      } catch (er) { msgs = [er.message]; }
      return afterAsync(msgs);
    }
  };
}
function afterAsync(msgs) {
  const rs = NET.beginResolve(G.rec, S);
  if (rs) { hideModal(); save(); startReveal(rs); return; }
  render(); save(); openAsync(msgs);
}
function openJoin() {
  showModal(`<h2>🔗 Join a link game</h2><p>Paste the game code your host sent you.</p><textarea id="joinIn" class="code" rows="4" placeholder="BOTR1…"></textarea><div id="joinSeat"></div><div id="joinMsg" class="muted"></div>
    <div class="row"><button class="btn primary" id="joinGo" style="flex:2">Join</button><button class="btn" id="joinCancel">Back</button></div>`, 'wide');
  let parsed = null;
  const box = $('#modalbox');
  box.oninput = async e => {
    if (e.target.id !== 'joinIn') return;
    try {
      parsed = await NET.unpack(e.target.value);
      if (!parsed.setup || !parsed.setup.players) throw new Error('That code is not a game code.');
      const hs = parsed.setup.players.map((p, i) => ({ p, i })).filter(x => x.p.human);
      $('#joinSeat').innerHTML = '<h3>Which lord are you?</h3>' + hs.map((x, k) => `<label class="seatopt"><input type="radio" name="seat" value="${x.i}" ${k === 1 || (hs.length === 1) ? 'checked' : ''}> <span class="tag" style="background:${PLAYER_DEF[x.i].color}">${esc(PLAYER_DEF[x.i].short)}</span> ${esc(x.p.name)}</label>`).join('');
      $('#joinMsg').textContent = `Game with ${parsed.setup.players.length} houses, ${parsed.hist.length} seasons played.`;
    } catch (er) { parsed = null; $('#joinSeat').innerHTML = ''; $('#joinMsg').textContent = e.target.value.trim() ? er.message : ''; }
  };
  box.onclick = async e => {
    if (e.target.id === 'joinCancel') { openNewGame(); return; }
    if (e.target.id === 'joinGo') {
      if (!parsed) { $('#joinMsg').textContent = 'Paste a valid game code first.'; return; }
      const seatEl = document.querySelector('input[name=seat]:checked'); if (!seatEl) { $('#joinMsg').textContent = 'Pick your seat.'; return; }
      try {
        const rec = NET.recordFromSync(parsed, +seatEl.value);
        let st = NET.stateOf(rec); const r = NET.importSync(rec, st, parsed); st = r.S;
        G = { mode: 'async', setup: rec.setup, orders: {}, sealed: {}, idx: 0, rec }; S = st;
        clearTimeout(timer); gen = null; resolving = null; tokenSigs = {}; resetView(); sel = null; selFor = null;
        box.oninput = null; hideModal(); rebuildLog(); beginPlanning(true); asyncMsg = r.warns.concat(r.notes);
        setTimeout(() => openAsync(asyncMsg), 100);
      } catch (er) { $('#joinMsg').textContent = er.message; }
    }
  };
}

/* ------------------------------------------------------------ events */
let drag = null, suppressClick = false;
const mapEl = () => $('#map');
document.addEventListener('click', e => {
  if (suppressClick) { suppressClick = false; return; }
  const t = e.target, q = a => t.closest && t.closest(a);
  const cg = q('#map [data-c]');
  if (cg) {
    const id = +cg.dataset.c;
    if (pickMode && phase === 'plan') {
      const o = pickMode.type === 'scout' ? { type: 'scout', from: pickMode.from, target: id } : { type: 'feint', to: id };
      if (!pickTargetOK(id)) { uiMsg = B.checkNewOrder(S, V, o, G.orders[V]) || 'Not a valid target.'; render(); return; }
      addOrder(o); return;
    }
    sel = id; selFor = null; uiMsg = ''; render(); return;
  }
  let b;
  if ((b = q('[data-cancelpick]'))) { pickMode = null; render(); return; }
  if ((b = q('[data-seal]'))) { seal(); return; }
  if ((b = q('[data-rm]'))) { if (phase === 'plan') { G.orders[V].splice(+b.dataset.rm, 1); selFor = null; uiMsg = ''; render(); save(); } return; }
  if (phase === 'plan' && V != null) {
    if ((b = q('[data-tax]'))) { const c = S.counties[sel], arr = G.orders[V], ex = arr.findIndex(o => o.type === 'tax' && o.county === sel); if (ex >= 0) arr.splice(ex, 1); if (b.dataset.tax !== c.tax) addOrder({ type: 'tax', county: sel, rate: b.dataset.tax }); else render(); return; }
    if ((b = q('[data-gar]'))) { S.players[V].garrison[sel] = b.dataset.gar; save(); render(); return; }
    if ((b = q('[data-stance]'))) { marchStance = b.dataset.stance; render(); return; }
    if ((b = q('[data-dest]'))) {
      const units = freeUnits(sel, V).filter(u => selUnits.has(u.id)).map(u => u.id), to = +b.dataset.dest;
      const nc = S.counties[to], o = { type: 'march', from: sel, to, units, stance: marchStance };
      if (b.dataset.betray || b.dataset.pactwarn) {
        const key = sel + '>' + to + (b.dataset.betray ? 'b' : 'w');
        if (betrayArm !== key) { betrayArm = key; const pk = B.protectivePact(S, V, nc.owner); uiMsg = `⚠ This breaks your ${pk ? PACT[pk.type].name.toLowerCase() : 'pact'} with ${pl(nc.owner).short}: heavy reputation loss, and war. Tap again to confirm.`; render(); return; }
        betrayArm = null; o.betray = true;
      }
      if (marchStorm && nc.castle > 0 && nc.owner >= 0 && nc.owner !== V) o.storm = true;
      const before = G.orders[V].length; addOrder(o);
      if (G.orders[V].length > before) { selFor = null; render(); }
      return;
    }
    if ((b = q('[data-dipord]'))) { addOrder(JSON.parse(b.dataset.dipord)); return; }
    if ((b = q('[data-dipresp]'))) { const id = +b.dataset.dipresp; const ex = G.orders[V].findIndex(o => o.type === 'dip' && o.act === 'respond' && o.pid === id); if (ex >= 0) G.orders[V].splice(ex, 1); addOrder({ type: 'dip', act: 'respond', pid: id, accept: b.dataset.acc === '1' }); return; }
    if ((b = q('[data-rec]'))) { addOrder({ type: 'recruit', unit: b.dataset.rec, county: sel }); return; }
    if ((b = q('[data-merge]'))) { addOrder({ type: 'merge', unit: b.dataset.merge, county: sel }); selFor = null; render(); return; }
    if ((b = q('[data-build]'))) { addOrder({ type: 'build', county: sel }); return; }
    if ((b = q('[data-storm]'))) { addOrder({ type: 'storm', county: sel }); return; }
    if ((b = q('[data-sally]'))) { addOrder({ type: 'sally', county: sel }); return; }
    if ((b = q('[data-scoutpick]'))) { pickMode = { type: 'scout', from: sel }; uiMsg = ''; render(); return; }
    if ((b = q('[data-feintpick]'))) { pickMode = { type: 'feint' }; uiMsg = ''; render(); return; }
  }
  if ((b = q('[data-dipopen]'))) { showDip(); return; }
  if (t.id === 'closeDip') { hideModal(); return; }
  if (t.id === 'closeHelp') { try { localStorage.setItem('botr_seen', '1'); } catch (er) { /* ignore */ } hideModal(); if (!S) openNewGame(); return; }
  if (t.id === 'again') { hideModal(); openNewGame(); return; }
  if (t.id === 'passGo') { passGo(); return; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.unit) { const id = +t.dataset.unit; if (t.checked) selUnits.add(id); else selUnits.delete(id); renderCounty(); }
  if (t.dataset && t.dataset.stormtoggle !== undefined) { marchStorm = t.checked; renderCounty(); }
  if (t.dataset && t.dataset.dipamt !== undefined) { dipAmt = +t.value; showDip(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && pickMode) { pickMode = null; render(); } });
$('#btnDip').onclick = () => showDip();
$('#btnHelp').onclick = () => showModal(helpHtml(), 'wide');
$('#btnNew').onclick = () => {
  showModal(`<h2>New Game?</h2><p>Leave this campaign and set up another?</p><div class="row"><button class="btn primary" id="yesNew" style="width:auto;flex:1">Yes, new game</button><button class="btn" id="noNew" style="flex:1">Keep playing</button></div>`);
  $('#yesNew').onclick = () => { clearTimeout(timer); hideModal(); $('#btnSkip').hidden = true; openNewGame(); };
  $('#noNew').onclick = hideModal;
};
$('#btnSkip').onclick = () => { fast = true; clearTimeout(timer); $('#anim').innerHTML = ''; $('#cardlayer').classList.remove('show'); step(); };
$('#btnMute').onclick = () => { sfx.init(); setMute(!sfx.muted); if (!sfx.muted) sfx.coin(); };
$('#btnLink').onclick = () => openAsync();
$('#zoomIn').onclick = () => zoomBy(1.4); $('#zoomOut').onclick = () => zoomBy(1 / 1.4); $('#zoomReset').onclick = resetView;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && phase !== 'over' && !$('#modalbox').querySelector('[data-choice]') && !$('#modalbox').querySelector('#ngStart')) hideModal(); });
// pan + wheel zoom on the map
(function () {
  const wrap = $('#mapstage');
  const toSvg = (cx, cy) => { const r = $('#map').getBoundingClientRect(); return [view.x + (cx - r.left) / r.width * view.w, view.y + (cy - r.top) / r.height * view.h]; };
  wrap.addEventListener('wheel', e => { e.preventDefault(); const p = toSvg(e.clientX, e.clientY); zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, p[0], p[1]); }, { passive: false });
  const pts = new Map(); let pinch = null;
  wrap.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), w: view.w }; } });
  wrap.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); const c = toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); const target = Math.max(250, Math.min(1000, pinch.w * pinch.d / d)); zoomBy(view.w / target, c[0], c[1]); suppressClick = true; return; }
    if (!drag || view.w >= 999) return;
    const r = $('#map').getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true; view.x = drag.vx - dx / r.width * view.w; view.y = drag.vy - dy / r.height * view.h; clampView(); applyView();
  });
  const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (drag && drag.moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 60); } if (!pts.size) drag = null; };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
})();
window.addEventListener('resize', () => { if (S && (window.innerWidth < 700) !== document.body.classList.contains('narrow')) renderMap(); });

/* ------------------------------------------------------------ boot */
(function boot() {
  setMute(sfx.muted);
  let restored = false;
  try {
    const active = localStorage.getItem('botr_active');
    if (active === 'async') {
      const raw = JSON.parse(localStorage.getItem(ASYNC_KEY) || 'null');
      if (raw && raw.rec && raw.rec.setup) { const rec = raw.rec; G = { mode: 'async', setup: rec.setup, orders: {}, sealed: {}, idx: 0, rec }; S = NET.stateOf(rec); restored = true; }
    } else if (active === 'local') {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (raw && raw.v === 3 && raw.S && !raw.S.over) { G = { mode: raw.mode, setup: raw.setup, orders: raw.orders || {}, sealed: raw.sealed || {}, idx: raw.idx || 0 }; S = raw.S; restored = true; }
    }
  } catch (e) { restored = false; G = null; S = null; }
  if (restored) {
    MAP = B.getMap(S); MAP_DEF = MAP.defs; rebuildLog(); resetView();
    if (G.mode === 'hotseat') { const saved = G.orders; beginPlanning(false); if (saved) for (const k of Object.keys(saved)) if (G.orders[k]) G.orders[k] = saved[k]; }
    else beginPlanning(false);
  } else {
    // a backdrop so the page is not empty behind the dialog
    S = NET.initState(NET.makeSetup(1, [{ name: '' }, { ai: { personality: 'warlord', level: 'normal' } }]), {}); MAP = B.getMap(S); MAP_DEF = MAP.defs; V = 0; phase = 'menu'; G = null; render();
    S = null; phase = 'menu';
  }
  let seen = false; try { seen = !!localStorage.getItem('botr_seen'); } catch (e) { /* ignore */ }
  if (!restored) { if (!seen) { showModal(helpHtml(), 'wide'); } else openNewGame(); }
  window.__botr = {
    get S() { return S; }, get G() { return G; }, get phase() { return phase; }, get V() { return V; },
    seal, startGame, addOrder, select: i => { sel = i; selFor = null; render(); }, skip: () => { fast = true; step(); }, setFast: v => { fast = v; },
    NET, B, openNewGame, step, passGo
  };
})();
})();
