// Playtest statistics harness: node sim.js [games] [seed0] [out.json]
const B = require('./engine.js');
const N = parseInt(process.argv[2] || '300', 10), SEED0 = parseInt(process.argv[3] || '70000', 10);
const OUT = process.argv[4] || '/tmp/sim_out.json';
const PERS = ['warlord', 'builder', 'schemer'], LEVELS = ['easy', 'normal', 'hard'];
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const inc = (o, k, d = 1) => { o[k] = (o[k] || 0) + d; };
const R = { games: 0, bySize: {}, turns: [], reasons: {}, winP: {}, partP: {}, winL: {}, partL: {}, winSeat: {}, partSeat: {}, orders: {}, orderGames: 0, pact: { formed: {}, broken: {}, betray: 0, proposed: 0, accepted: 0, declined: 0, lapsed: 0, expired: 0, ransoms: 0 }, byP: {}, leader: { n: 0, win: 0, byTurn: {} }, endings: {}, allyGames: 0, pactGames: 0, betrayGames: 0, lenBySize: {}, firstPactTurn: [], dipOrders: {}, wars: 0, elim: 0, winnersAlly: 0, comeback: 0, humanless: 0, wlen: [], counties: [], rep: [] };
for (let i = 0; i < N; i++) {
  const rnd = lcg(SEED0 + i * 7);
  const n = [2, 3, 3, 4, 4, 5, 6, 4][i % 8];
  const fixedP = i % 6 === 0;
  const specs = []; for (let k = 0; k < n; k++) specs.push({ ai: { personality: fixedP ? PERS[k % 3] : PERS[Math.floor(rnd() * 3)], level: LEVELS[Math.floor(rnd() * 3)] } });
  const S = B.newGame(SEED0 + i, { players: specs });
  let turns = 0, leaders = {}, firstPact = null;
  while (!S.over) {
    const orders = S.players.map(p => {
      if (!p.alive) return [];
      const o = B.aiOrders(S, p.id);
      for (const x of o) { inc(R.orders, x.type); if (x.type === 'dip') inc(R.dipOrders, x.act + (x.kind ? ':' + x.kind : '') + (x.act === 'respond' ? ':' + (x.accept ? 'yes' : 'no') : '')); }
      return o;
    });
    B.runTurn(S, orders, (S2, info) => info.options[Math.floor(rnd() * info.options.length)]);
    turns++;
    if (firstPact == null && S.dip.stats.accepted > 0) firstPact = turns;
    if ([10, 15, 20, 30].includes(turns) && !S.over) {
      const cnt = S.players.map(p => B.countiesOf(S, p.id).length), mx = Math.max(...cnt);
      if (cnt.filter(c => c === mx).length === 1) leaders[turns] = cnt.indexOf(mx);
    }
  }
  R.games++; R.orderGames++;
  inc(R.bySize, n); R.turns.push(turns); (R.lenBySize[n] = R.lenBySize[n] || []).push(turns);
  const w = S.over.winner, reason = S.over.reason; inc(R.reasons, reason);
  R.endings[n + ':' + reason] = (R.endings[n + ':' + reason] || 0) + 1;
  for (let k = 0; k < n; k++) { inc(R.partP, specs[k].ai.personality); inc(R.partL, specs[k].ai.level); inc(R.partSeat, n + ':' + k); }
  const wins = S.over.winners || (w == null ? [] : [w]);
  for (const k of wins) { inc(R.winP, specs[k].ai.personality, 1 / wins.length); inc(R.winL, specs[k].ai.level, 1 / wins.length); inc(R.winSeat, n + ':' + k, 1 / wins.length); }
  if (reason === 'alliance') { R.allyGames++; }
  for (const t of [10, 15, 20, 30]) if (leaders[t] != null) { R.leader.byTurn[t] = R.leader.byTurn[t] || { n: 0, win: 0 }; R.leader.byTurn[t].n++; if (wins.includes(leaders[t])) R.leader.byTurn[t].win++; }
  const st = S.dip.stats;
  for (const k in st.formed) inc(R.pact.formed, k, st.formed[k]);
  for (const k in st.broken) inc(R.pact.broken, k, st.broken[k]);
  for (const k of ['betrayals', 'proposed', 'accepted', 'declined', 'lapsed', 'expired', 'ransoms']) inc(R.pact, k === 'betrayals' ? 'betray' : k, st[k]);
  if (st.accepted) R.pactGames++; if (st.betrayals) R.betrayGames++;
  if (firstPact != null) R.firstPactTurn.push(firstPact);
  for (let k = 0; k < n; k++) { const P = specs[k].ai.personality; R.byP[P] = R.byP[P] || { betray: 0, proposed: 0, accepted: 0, declined: 0, denounced: 0, seats: 0 }; R.byP[P].seats++; for (const f in st.by[k]) R.byP[P][f] += st.by[k][f]; R.rep.push([P, S.players[k].rep]); }
  inc(R, 'wars', Object.keys(S.dip.war).length);
  R.elim += S.players.filter(p => !p.alive).length;
}
const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rate = (w, p) => Object.keys(p).sort().map(k => `${k} ${(100 * (w[k] || 0) / p[k]).toFixed(1)}% (${p[k]} seats)`).join(', ');
const out = [];
out.push(`GAMES ${R.games}  sizes ${JSON.stringify(R.bySize)}`);
out.push(`LENGTH avg ${avg(R.turns).toFixed(1)} median ${q(R.turns, .5)} p10 ${q(R.turns, .1)} p90 ${q(R.turns, .9)} min ${Math.min(...R.turns)} max ${Math.max(...R.turns)}`);
out.push('LENGTH by size ' + Object.keys(R.lenBySize).map(k => `${k}p:${avg(R.lenBySize[k]).toFixed(1)}`).join(' '));
const buckets = {}; for (const t of R.turns) inc(buckets, Math.min(100, Math.floor(t / 10) * 10)); out.push('LENGTH histogram ' + JSON.stringify(buckets));
out.push('ENDINGS ' + JSON.stringify(R.reasons) + ' | by size ' + JSON.stringify(R.endings));
out.push('WIN RATE by personality (per seat): ' + rate(R.winP, R.partP));
out.push('WIN RATE by level: ' + rate(R.winL, R.partL));
out.push('WIN RATE by seat: ' + rate(R.winSeat, R.partSeat));
out.push(`PACTS games with any pact ${R.pactGames}/${R.games}, with a betrayal ${R.betrayGames}/${R.games}; proposed ${R.pact.proposed} accepted ${R.pact.accepted} declined ${R.pact.declined} lapsed ${R.pact.lapsed} expired ${R.pact.expired} betrayals ${R.pact.betray} ransoms ${R.pact.ransoms}; per game: formed ${(R.pact.accepted / R.games).toFixed(1)}, betrayals ${(R.pact.betray / R.games).toFixed(2)}`);
out.push('PACTS formed ' + JSON.stringify(R.pact.formed) + ' broken ' + JSON.stringify(R.pact.broken));
out.push('first pact avg season ' + avg(R.firstPactTurn).toFixed(1));
for (const P in R.byP) { const b = R.byP[P]; out.push(`PERS ${P}: per seat proposed ${(b.proposed / b.seats).toFixed(2)} accepted-as-target ${(b.accepted / b.seats).toFixed(2)} declined ${(b.declined / b.seats).toFixed(2)} betrayals ${(b.betray / b.seats).toFixed(2)} denounced ${(b.denounced / b.seats).toFixed(2)}; avg final rep ${avg(R.rep.filter(r => r[0] === P).map(r => r[1])).toFixed(0)}`); }
for (const t in R.leader.byTurn) { const l = R.leader.byTurn[t]; out.push(`SNOWBALL sole county leader at season ${t} wins ${(100 * l.win / l.n).toFixed(0)}% (${l.win}/${l.n})`); }
const ot = Object.keys(R.orders).sort((a, b) => R.orders[b] - R.orders[a]); out.push('ORDERS per game: ' + ot.map(k => `${k} ${(R.orders[k] / R.games).toFixed(1)}`).join(', '));
out.push('DIP ORDERS per game: ' + Object.keys(R.dipOrders).sort().map(k => `${k} ${(R.dipOrders[k] / R.games).toFixed(2)}`).join(', '));
out.push(`ELIMINATED per game ${(R.elim / R.games).toFixed(2)}, wars recorded per game ${(R.wars / R.games).toFixed(1)}`);
console.log(out.join('\n'));
require('fs').writeFileSync(OUT, JSON.stringify(R));
