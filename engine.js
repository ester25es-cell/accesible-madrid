// Motor de simulación de Accesible Madrid (prototipo Lavapiés)
const COLS = 5, ROWS = 4;
const COL_NAMES = ['Embajadores', 'Mesón de Paredes', 'Lavapiés', 'Ave María', 'Valencia'];
const ROW_NAMES = ['la Fe', 'Argumosa', 'Doctor Fourquet', 'Santa Isabel'];

const BARRIERS = {
  bordillo:   { name: 'Bordillo sin rebaje', fix: 'rebaje' },
  escalon:    { name: 'Escalón sin alternativa', fix: 'rampa' },
  estrecha:   { name: 'Acera estrecha (menos de 1,80 m)', fix: 'acera' },
  pendiente:  { name: 'Cuesta de más del 6 %', fix: null },
  semaforo:   { name: 'Cruce sin semáforo acústico', fix: 'semaforo' },
  podotactil: { name: 'Sin pavimento podotáctil', fix: 'podotactil' },
  bancos:     { name: 'Sin bancos en más de 50 m', fix: 'banco' },
  ruido:      { name: 'Ruido y tráfico intenso', fix: 'calmar' },
  senaletica: { name: 'Señales confusas, sin pictogramas', fix: 'senales' },
  atencionOral: { name: 'Atención solo oral', fix: 'lse' },
  tramite:    { name: 'Trámites sin lectura fácil', fix: 'lecturafacil' },
  averia:     { name: 'Ascensor averiado', fix: 'ascensor' }
};

const INTERVENTIONS = [
  { id: 'rebaje', name: 'Rebaje de bordillo', cost: 10, target: 'tramo', removes: 'bordillo' },
  { id: 'rampa', name: 'Rampa', cost: 25, target: 'tramo', removes: 'escalon' },
  { id: 'acera', name: 'Ensanchar acera', cost: 40, target: 'tramo', removes: 'estrecha' },
  { id: 'semaforo', name: 'Semáforo acústico', cost: 20, target: 'tramo', removes: 'semaforo' },
  { id: 'podotactil', name: 'Pavimento podotáctil', cost: 15, target: 'tramo', removes: 'podotactil' },
  { id: 'banco', name: 'Banco', cost: 8, target: 'tramo', removes: 'bancos' },
  { id: 'calmar', name: 'Calmar el tráfico', cost: 20, target: 'tramo', removes: 'ruido' },
  { id: 'senales', name: 'Señales con pictogramas', cost: 10, target: 'tramo', removes: 'senaletica' },
  { id: 'lse', name: 'Lengua de signos por vídeo', cost: 30, target: 'destino', removes: 'atencionOral' },
  { id: 'lecturafacil', name: 'Trámites en lectura fácil', cost: 15, target: 'destino', removes: 'tramite' },
  { id: 'ascensor', name: 'Reparar ascensor y contratar mantenimiento', cost: 20, target: 'destino', removes: 'averia', weekly: 4 }
];

const B = Infinity;
// Penalización k por barrera y perfil (B = bloquea)
const PROFILES = {
  silla:    { label: 'silla de ruedas', k: { bordillo: B, escalon: B, estrecha: 2, pendiente: 3, averia: B } },
  ciego:    { label: 'ciego', k: { escalon: 0.5, estrecha: 2, semaforo: 3, podotactil: 1, ruido: 1, senaletica: 1 }, semaforoAncha: B },
  sorda:    { label: 'sorda signante', k: { atencionOral: B } },
  andador:  { label: 'andador', k: { bordillo: B, escalon: 3, estrecha: 1, pendiente: 3, bancos: 2, averia: B } },
  intelect: { label: 'discapacidad intelectual', k: { ruido: 1, senaletica: 2, tramite: B } },
  carrito:  { label: 'carrito de gemelos', k: { bordillo: B, escalon: B, estrecha: 2, pendiente: 1, ruido: 1, averia: B } }
};

const DESTS = {
  junta:   { name: 'Junta Municipal de Centro', short: 'Junta', node: [0, 0] },
  emt:     { name: 'Parada de autobús EMT', short: 'EMT', node: [2, 0] },
  salud:   { name: 'Centro de salud', short: 'Salud', node: [4, 1] },
  mercado: { name: 'Mercado', short: 'Mercado', node: [1, 3] },
  cultural:{ name: 'Centro cultural', short: 'Cultural', node: [3, 3] }
};

const VECINOS = [
  { id: 'julian', name: 'Julián', age: 82, profile: 'andador', home: [1, 1], agenda: ['salud', 'mercado'] },
  { id: 'lucia', name: 'Lucía', age: 34, profile: 'silla', home: [0, 2], agenda: ['cultural', 'emt', 'mercado'] },
  { id: 'andres', name: 'Andrés', age: 51, profile: 'ciego', home: [3, 0], agenda: ['salud', 'junta'] },
  { id: 'marta', name: 'Marta', age: 28, profile: 'sorda', home: [2, 2], agenda: ['junta', 'cultural'] },
  { id: 'sara', name: 'Sara', age: 24, profile: 'intelect', home: [4, 3], agenda: ['junta', 'mercado'] },
  { id: 'nadia', name: 'Nadia', age: 38, profile: 'carrito', home: [0, 3], agenda: ['emt', 'salud', 'mercado'] }
];

function edgeId(kind, c, r) { return kind + '-' + c + '-' + r; }

function initialState() {
  const edges = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) {
    const id = edgeId('h', c, r);
    edges[id] = { id, kind: 'h', c, r, a: [c, r], b: [c + 1, r], barriers: [], ancha: false };
  }
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS - 1; r++) {
    const id = edgeId('v', c, r);
    edges[id] = { id, kind: 'v', c, r, a: [c, r], b: [c, r + 1], barriers: [], ancha: false };
  }
  const set = (id, list, ancha) => { edges[id].barriers = list.slice(); if (ancha) edges[id].ancha = true; };
  // Barreras iniciales
  set('h-0-0', ['senaletica', 'podotactil']);
  set('h-1-0', ['estrecha']);
  set('h-3-0', ['bordillo', 'semaforo'], true);
  set('h-0-1', ['ruido']);
  set('h-1-1', ['senaletica']);
  set('h-2-1', ['bordillo', 'semaforo']);
  set('h-3-1', ['bordillo', 'semaforo'], true);
  set('h-0-2', ['bordillo']);
  set('h-1-2', ['estrecha', 'pendiente']);
  set('h-2-2', ['senaletica']);
  set('h-3-2', ['escalon']);
  set('h-0-3', ['estrecha']);
  set('h-2-0', ['semaforo'], true);
  set('h-2-3', ['bordillo']);
  set('h-3-3', ['pendiente', 'bancos']);
  set('v-0-0', ['escalon']);
  set('v-1-0', ['bordillo']);
  set('v-3-0', ['bordillo']);
  set('h-1-3', ['bordillo']);
  set('v-0-1', ['bancos', 'pendiente']);
  set('v-0-2', ['bordillo']);
  set('v-1-1', ['pendiente', 'bancos']);
  set('v-1-2', ['bordillo', 'estrecha']);
  set('v-2-0', ['semaforo'], true);
  set('v-2-1', ['ruido', 'escalon']);
  set('v-2-2', ['estrecha']);
  set('v-3-1', ['bordillo']);
  set('v-3-2', ['escalon']);
  set('v-4-0', ['escalon']);
  set('v-4-1', ['bordillo', 'semaforo'], true);
  set('v-4-2', ['senaletica', 'podotactil']);
  const dests = {};
  for (const id in DESTS) dests[id] = { barriers: [] };
  dests.junta.barriers = ['atencionOral', 'tramite'];
  dests.cultural.barriers = ['averia', 'atencionOral'];
  const vecinos = {};
  VECINOS.forEach(v => {
    vecinos[v.id] = { history: [], abandoned: {}, fails: {} };
    v.agenda.forEach(d => { vecinos[v.id].fails[d] = []; });
  });
  return { day: 1, budget: 250, weekly: 0, edges, dests, vecinos, log: [], built: [], won: false, lost: false, lastReport: null };
}

function edgeName(e) {
  if (e.kind === 'h') return 'Calle de ' + ROW_NAMES[e.r] + ', entre ' + COL_NAMES[e.c] + ' y ' + COL_NAMES[e.c + 1];
  return 'Calle de ' + COL_NAMES[e.c] + ', entre ' + ROW_NAMES[e.r] + ' y ' + ROW_NAMES[e.r + 1];
}

function edgeCost(e, profKey) {
  const p = PROFILES[profKey];
  let k = 0;
  for (const b of e.barriers) {
    let v = p.k[b] || 0;
    if (b === 'semaforo' && e.ancha && p.semaforoAncha) v = p.semaforoAncha;
    if (v === B) return { cost: B, blocker: b };
    k += v;
  }
  return { cost: 1 + k, blocker: null };
}

const key = n => n[0] + ',' + n[1];

function neighbors(state, n) {
  const out = [];
  for (const id in state.edges) {
    const e = state.edges[id];
    if (key(e.a) === key(n)) out.push([e, e.b]);
    else if (key(e.b) === key(n)) out.push([e, e.a]);
  }
  return out;
}

// Dijkstra con costes por perfil. Devuelve {cost, path(edges)} o null
function route(state, from, to, profKey, ignoreBarriers) {
  const dist = {}, prev = {}, done = {};
  dist[key(from)] = 0;
  while (true) {
    let best = null, bd = Infinity;
    for (const k in dist) if (!done[k] && dist[k] < bd) { bd = dist[k]; best = k; }
    if (best === null) return null;
    if (best === key(to)) break;
    done[best] = true;
    const node = best.split(',').map(Number);
    for (const [e, nb] of neighbors(state, node)) {
      const c = ignoreBarriers ? 1 : edgeCost(e, profKey).cost;
      if (c === B) continue;
      const nk = key(nb);
      if (dist[nk] === undefined || dist[best] + c < dist[nk]) { dist[nk] = dist[best] + c; prev[nk] = [best, e]; }
    }
  }
  const path = [];
  let cur = key(to);
  while (prev[cur]) { path.unshift(prev[cur][1]); cur = prev[cur][0]; }
  return { cost: dist[key(to)], path };
}

// Primera barrera bloqueante en la ruta "ideal" (sin barreras), para explicar el fallo
function firstBlocker(state, from, to, profKey) {
  const r = route(state, from, to, profKey, true);
  if (!r) return null;
  for (const e of r.path) {
    const ec = edgeCost(e, profKey);
    if (ec.cost === B) return { edge: e, barrier: ec.blocker };
  }
  return null;
}

function tryTrip(state, v, destId) {
  const prof = PROFILES[v.profile];
  const dest = DESTS[destId];
  for (const b of state.dests[destId].barriers) {
    if (prof.k[b] === B) return { result: 'fallido', reason: { dest: destId, barrier: b } };
  }
  const ideal = route(state, v.home, dest.node, v.profile, true);
  const r = route(state, v.home, dest.node, v.profile, false);
  if (!r) {
    const fb = firstBlocker(state, v.home, dest.node, v.profile);
    return { result: 'fallido', reason: fb ? { edge: fb.edge.id, barrier: fb.barrier } : null };
  }
  const steps = ideal.path.length;
  if (r.cost > 2 * steps) {
    // la penalización más alta de la ruta elegida, para explicar la dificultad
    let worst = null, wv = 0;
    for (const e of r.path) for (const b of e.barriers) {
      let k = prof.k[b] || 0;
      if (k > wv) { wv = k; worst = { edge: e.id, barrier: b }; }
    }
    return { result: 'dificultad', reason: worst, path: r.path.map(e => e.id) };
  }
  return { result: 'ok', path: r.path.map(e => e.id) };
}

// IA por vecino (perfil) sobre los últimos 7 días
function iaFor(state, vid) {
  const h = state.vecinos[vid].history.slice(-7);
  if (!h.length) return null;
  let ok = 0, tot = 0;
  h.forEach(day => { day.forEach(t => { tot++; if (t.result === 'ok') ok++; else if (t.result === 'dificultad') ok += 0.5; }); });
  return Math.round(ok / tot * 100);
}
function iaGlobal(state) {
  const vals = VECINOS.map(v => iaFor(state, v.id)).filter(x => x !== null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
function participacion(state) {
  let tot = 0, act = 0;
  VECINOS.forEach(v => v.agenda.forEach(d => { tot++; if (!state.vecinos[v.id].abandoned[d]) act++; }));
  return Math.round(act / tot * 100);
}

function simulateDay(state) {
  const report = { day: state.day, trips: [] };
  VECINOS.forEach(v => {
    const vs = state.vecinos[v.id];
    const dayRes = [];
    v.agenda.forEach(d => {
      if (vs.abandoned[d]) { dayRes.push({ dest: d, result: 'abandonado' }); report.trips.push({ vecino: v.id, dest: d, result: 'abandonado' }); return; }
      const t = tryTrip(state, v, d);
      dayRes.push({ dest: d, result: t.result });
      report.trips.push(Object.assign({ vecino: v.id, dest: d }, t));
      vs.fails[d] = vs.fails[d].filter(x => x > state.day - 7);
      if (t.result === 'fallido') {
        vs.fails[d].push(state.day);
        if (vs.fails[d].length >= 5) { vs.abandoned[d] = true; report.trips[report.trips.length - 1].abandonsNow = true; }
      }
    });
    vs.history.push(dayRes);
  });
  // ingresos y mantenimiento semanales
  if (state.day % 7 === 0) {
    const inc = 10 + Math.round(participacion(state) / 10);
    report.income = inc; report.upkeep = state.weekly;
    state.budget += inc - state.weekly;
  }
  report.ia = iaGlobal(state);
  report.part = participacion(state);
  state.lastReport = report;
  // victoria / derrota
  const ias = VECINOS.map(v => iaFor(state, v.id));
  if (state.day >= 7 && report.ia >= 70 && ias.every(x => x >= 50)) state.won = true;
  state.day++;
  if (!state.won && state.day > 30) state.lost = true;
  return report;
}

function canBuild(state, intId, targetId) {
  const it = INTERVENTIONS.find(i => i.id === intId);
  if (!it) return { ok: false, why: 'Intervención desconocida' };
  if (state.budget < it.cost) return { ok: false, why: 'No hay presupuesto suficiente: cuesta ' + it.cost + ' y quedan ' + state.budget + '.' };
  const list = it.target === 'tramo' ? (state.edges[targetId] && state.edges[targetId].barriers) : (state.dests[targetId] && state.dests[targetId].barriers);
  if (!list) return { ok: false, why: it.target === 'tramo' ? 'Esta intervención se coloca en un tramo de calle.' : 'Esta intervención se coloca en un destino.' };
  if (list.indexOf(it.removes) === -1) return { ok: false, why: 'Aquí no hay ' + BARRIERS[it.removes].name.toLowerCase() + '.' };
  return { ok: true, it };
}

function build(state, intId, targetId) {
  const chk = canBuild(state, intId, targetId);
  if (!chk.ok) return chk;
  const it = chk.it;
  const list = it.target === 'tramo' ? state.edges[targetId].barriers : state.dests[targetId].barriers;
  list.splice(list.indexOf(it.removes), 1);
  state.budget -= it.cost;
  if (it.weekly) state.weekly += it.weekly;
  state.built.push({ day: state.day, id: it.id, target: targetId });
  return { ok: true, it };
}

function avisar(state) {
  if (state.budget < 2) return { ok: false, why: 'Cuesta 2 créditos.' };
  state.budget -= 2;
  const back = [];
  VECINOS.forEach(v => {
    const vs = state.vecinos[v.id];
    for (const d in vs.abandoned) {
      if (!vs.abandoned[d]) continue;
      const t = tryTrip(state, v, d);
      if (t.result !== 'fallido') { vs.abandoned[d] = false; vs.fails[d] = []; back.push({ vecino: v.id, dest: d }); }
    }
  });
  return { ok: true, back };
}

if (typeof module !== 'undefined') module.exports = { COLS, ROWS, COL_NAMES, ROW_NAMES, BARRIERS, INTERVENTIONS, PROFILES, DESTS, VECINOS, initialState, edgeName, edgeCost, route, tryTrip, iaFor, iaGlobal, participacion, simulateDay, canBuild, build, avisar };
