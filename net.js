/* Banners of the Realm - net.js: replay records, integrity codes, commit/reveal async play. No server, no deps. */
(function (root) {
'use strict';
const B = root.BOTR || (typeof require !== 'undefined' ? require('./engine.js') : null);

/* ---------------------------------------------------------------- SHA-256 (pure JS: crypto.subtle is missing on file://) */
const K256 = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function utf8(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  const s = unescape(encodeURIComponent(str)); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a;
}
function fromUtf8(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return decodeURIComponent(escape(s));
}
function sha256bytes(bytes) {
  const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(nb);
  m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(nb - 8, Math.floor((l * 8) / 4294967296)); dv.setUint32(nb - 4, (l * 8) >>> 0);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w = new Uint32Array(64);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < nb; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rr(b, 17) ^ rr(b, 19) ^ (b >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  let out = ''; for (let i = 0; i < 8; i++) out += ('00000000' + H[i].toString(16)).slice(-8);
  return out;
}
const sha256 = str => sha256bytes(utf8(str));

/* ---------------------------------------------------------------- base64url + optional compression */
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64enc(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63] + (i + 1 < bytes.length ? ALPHA[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? ALPHA[n & 63] : '');
  }
  return s;
}
function b64dec(str) {
  const map = {}; for (let i = 0; i < 64; i++) map[ALPHA[i]] = i;
  const out = []; let buf = 0, bits = 0;
  for (const ch of str) {
    if (!(ch in map)) throw new Error('The code contains a character that is not allowed. It may have been cut or changed in transit.');
    buf = (buf << 6) | map[ch]; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); buf &= (1 << bits) - 1; }
  }
  return new Uint8Array(out);
}
async function streamBytes(bytes, Ctor, fmt) {
  const cs = new Ctor(fmt); const w = cs.writable.getWriter(); w.write(bytes); w.close();
  const chunks = []; const r = cs.readable.getReader(); let tot = 0;
  for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); tot += value.length; }
  const out = new Uint8Array(tot); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
const PREFIX = 'BOTR1';
async function pack(obj) {
  const raw = utf8(JSON.stringify(obj)); let mode = 'p', bytes = raw;
  if (typeof CompressionStream !== 'undefined') { try { bytes = await streamBytes(raw, CompressionStream, 'deflate-raw'); mode = 'z'; if (bytes.length >= raw.length) { bytes = raw; mode = 'p'; } } catch (e) { bytes = raw; mode = 'p'; } }
  const body = PREFIX + mode + b64enc(bytes);
  return body + '.' + sha256(body).slice(0, 8);
}
async function unpack(code) {
  code = String(code || '').replace(/\s+/g, '');
  const i = code.lastIndexOf('.');
  if (i < 0 || !code.startsWith(PREFIX)) throw new Error('That is not a Banners of the Realm code.');
  const body = code.slice(0, i), chk = code.slice(i + 1);
  if (sha256(body).slice(0, 8) !== chk) throw new Error('Integrity check failed: the code was cut short or altered. Copy it again in full.');
  const mode = body[PREFIX.length]; let bytes = b64dec(body.slice(PREFIX.length + 1));
  if (mode === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed codes. Open the game in a current Chrome, Edge, Firefox or Safari.');
    bytes = await streamBytes(bytes, DecompressionStream, 'deflate-raw');
  } else if (mode !== 'p') throw new Error('Unknown code format.');
  let obj; try { obj = JSON.parse(fromUtf8(bytes)); } catch (e) { throw new Error('The code is damaged.'); }
  if (!obj || typeof obj !== 'object') throw new Error('The code is damaged.');
  return obj;
}

/* ---------------------------------------------------------------- game records (deterministic replay) */
/** setup = { seed, players: [ {human:true,name} | {ai:{personality,level}} ], policy? } */
function makeSetup(seed, players, extra) {
  return Object.assign({ v: 3, seed: seed >>> 0, players: players.map((p, i) => p.ai ? { ai: { personality: p.ai.personality, level: p.ai.level } } : { human: true, name: p.name === '' ? '' : String(p.name || ('Player ' + (i + 1))).slice(0, 24), policy: p.policy ? { prisoners: p.policy.prisoners, hero: p.policy.hero } : undefined, style: ['warlord', 'builder', 'schemer'].includes(p.style) ? p.style : 'builder' }) }, extra && extra.scn ? { scn: String(extra.scn), legacy: (extra.legacy || []).slice(0, 4) } : {});
}
function initState(setup, opts) {
  opts = opts || {};
  const specs = setup.players.map(p => p.ai ? { ai: p.ai } : { human: true, autoChoose: !!opts.autoChoose, style: p.style });
  const S = B.newGame(setup.seed, { players: specs, scenario: setup.scn, legacy: setup.legacy });
  setup.players.forEach((p, i) => { if (p.name) S.players[i].lord = p.name; if (p.policy) Object.assign(S.players[i].policy, p.policy); });
  return S;
}
function collectOrders(S, humanOrders) {
  return S.players.map(p => !p.alive ? [] : (p.human ? B.sanitizeOrders(S, p.id, (humanOrders && humanOrders[p.id]) || []) : B.aiOrders(S, p.id)));
}
function advance(S, humanOrders, chooser) { return B.runTurn(S, collectOrders(S, humanOrders), chooser); }
function replay(setup, hist) {
  const S = initState(setup, { autoChoose: true });
  for (const h of hist) { if (S.over) break; advance(S, h); }
  return S;
}
const setupId = setup => sha256(JSON.stringify(setup)).slice(0, 12);

/* ---------------------------------------------------------------- async (play-by-link) protocol */
function newRecord(setup, seat) {
  return { v: 1, gid: setupId(setup), setup, hist: [], commits: {}, reveals: {}, local: { seat: seat == null ? null : seat, salt: null, orders: null } };
}
const humanSeats = S => S.players.filter(p => p.human && p.alive).map(p => p.id);
const commitHash = (rec, turn, seat, salt, orders) => sha256([rec.gid, turn, seat, salt, JSON.stringify(orders)].join('|'));
function randHex(n) {
  let s = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) { const a = new Uint8Array(n); crypto.getRandomValues(a); for (const x of a) s += ('0' + x.toString(16)).slice(-2); }
  else for (let i = 0; i < n; i++) s += ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
  return s;
}
function commit(rec, S, seat, orders) {
  const v = B.validateOrders(S, seat, orders);
  if (!v.ok) throw new Error('Your orders are not legal: ' + v.errors[0]);
  if (rec.reveals[seat]) throw new Error('You have already revealed your orders this season.');
  const salt = randHex(12);
  rec.commits[seat] = commitHash(rec, S.turn, seat, salt, orders);
  rec.local = { seat, salt, orders: JSON.parse(JSON.stringify(orders)), turn: S.turn };
  return rec.commits[seat];
}
function canReveal(rec, S) { const hs = humanSeats(S); return hs.length > 0 && hs.every(s => rec.commits[s]); }
function reveal(rec, S) {
  const L = rec.local;
  if (!L || L.seat == null || !L.orders || L.turn !== S.turn) throw new Error('Seal your orders first.');
  if (!canReveal(rec, S)) throw new Error('Wait until every player has sealed their orders.');
  rec.reveals[L.seat] = { o: L.orders, salt: L.salt };
}
function exportSync(rec, S) {
  return { k: 'sync', gid: rec.gid, setup: rec.setup, hist: rec.hist, turn: S.turn, commits: rec.commits, reveals: rec.reveals, sig: B.stateSignature(S) };
}
/** Merge a received sync object into rec. Returns { S, notes[], warns[] }; S is the (possibly advanced) state. */
function importSync(rec, S, obj) {
  const notes = [], warns = [];
  if (!obj || obj.k !== 'sync' || !obj.setup || !Array.isArray(obj.hist)) throw new Error('That code is not a game-sync code.');
  if (setupId(obj.setup) !== rec.gid || obj.gid !== rec.gid) throw new Error('That code belongs to a different game.');
  if (obj.hist.length > 400) throw new Error('That code is too large to be valid.');
  if (obj.hist.length > rec.hist.length) {
    let S2; try { S2 = replay(rec.setup, obj.hist); } catch (e) { throw new Error('The game history in that code cannot be replayed.'); }
    if (B.stateSignature(S2) !== obj.sig) throw new Error('Integrity check failed: that history does not reproduce the sender\'s game.');
    rec.hist = obj.hist.slice(); S = S2; rec.commits = {}; rec.reveals = {};
    if (rec.local) rec.local = { seat: rec.local.seat, salt: null, orders: null };
    notes.push('Caught up to ' + S.turn + ' seasons played.');
  } else if (obj.hist.length < rec.hist.length) {
    notes.push('That code is older than your game: nothing new in it.'); return { S, notes, warns };
  } else if (obj.sig !== B.stateSignature(S)) {
    warns.push('Warning: the sender\'s game state differs from yours at this turn. One of you has diverged: ask them to re-send a fresh code.');
  }
  // same turn: merge commits then reveals
  for (const k of Object.keys(obj.commits || {})) {
    const seat = +k, h = obj.commits[k];
    if (!(seat >= 0 && seat < S.players.length) || !S.players[seat].human || !S.players[seat].alive || !/^[0-9a-f]{64}$/.test(String(h))) { warns.push('Ignored a bad commitment.'); continue; }
    if (!rec.commits[seat]) { rec.commits[seat] = h; notes.push(S.players[seat].lord + ' has sealed orders.'); }
    else if (rec.commits[seat] !== h && !(rec.local && rec.local.seat === seat)) warns.push('Conflicting commitment from ' + S.players[seat].lord + ': keeping the first one.');
  }
  for (const k of Object.keys(obj.reveals || {})) {
    const seat = +k, r = obj.reveals[k];
    if (rec.reveals[seat]) continue;
    if (!rec.commits[seat] || !r || !Array.isArray(r.o) || typeof r.salt !== 'string') { warns.push('Ignored a reveal with no matching commitment.'); continue; }
    if (commitHash(rec, S.turn, seat, r.salt, r.o) !== rec.commits[seat]) { warns.push('REJECTED: ' + S.players[seat].lord + '\'s revealed orders do not match their sealed commitment (tampered or from another season).'); continue; }
    const v = B.validateOrders(S, seat, r.o);
    if (!v.ok) { warns.push('REJECTED: ' + S.players[seat].lord + '\'s orders are not legal here (' + v.errors[0] + ').'); continue; }
    rec.reveals[seat] = { o: r.o, salt: r.salt }; notes.push(S.players[seat].lord + ' revealed their orders.');
  }
  return { S, notes, warns };
}
function pending(rec, S) {
  const hs = humanSeats(S);
  return { sealed: hs.filter(s => rec.commits[s]), revealed: hs.filter(s => rec.reveals[s]), humans: hs };
}
/** If every living human has revealed, begin the season: returns { gen, finish } (step gen, then call finish) or null. */
function beginResolve(rec, S) {
  if (S.over) return null;
  const hs = humanSeats(S);
  if (!hs.length || !hs.every(s => rec.reveals[s])) return null;
  const orders = {}; for (const s of hs) orders[s] = rec.reveals[s].o;
  const gen = B.resolveTurn(S, collectOrders(S, orders));
  const finish = () => { rec.hist.push(orders); rec.commits = {}; rec.reveals = {}; if (rec.local) rec.local = { seat: rec.local.seat, salt: null, orders: null }; };
  return { gen, finish };
}
function tryResolve(rec, S) {
  const r = beginResolve(rec, S); if (!r) return null;
  let x = r.gen.next(); while (!x.done) x = r.gen.next();
  r.finish(); return S.turnLog;
}
function recordFromSync(obj, seat) {
  if (!obj || obj.k !== 'sync' || !obj.setup) throw new Error('That code is not a game-sync code.');
  const rec = newRecord(obj.setup, seat);
  if (rec.gid !== obj.gid) throw new Error('Integrity check failed: the game setup does not match its id.');
  return rec;
}
function stateOf(rec) { return replay(rec.setup, rec.hist); }

const NET = { sha256, pack, unpack, makeSetup, initState, collectOrders, advance, replay, setupId, newRecord, commit, canReveal, reveal, exportSync, importSync, pending, tryResolve, beginResolve, recordFromSync, stateOf, humanSeats, b64enc, b64dec };
if (typeof module !== 'undefined' && module.exports) module.exports = NET;
root.BOTRNET = NET;
})(typeof window !== 'undefined' ? window : globalThis);
