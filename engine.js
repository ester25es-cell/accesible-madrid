// Motor de simulación de Accesible Madrid
const COLS = 5, ROWS = 4;
// Datos del barrio en juego (cambian con setScenario)
let COL_NAMES = [], ROW_NAMES = [], COL_FULL = [], ROW_FULL = [];
let DESTS = {}, VECINOS = [], SCENARIO = null;

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
  averia:     { name: 'Ascensor averiado', fix: 'ascensor' },
  // Imprevistos (aparecen solos durante la partida)
  obra:       { name: 'Obra sin desvío accesible', fix: 'desvio', imprevisto: true },
  terraza:    { name: 'Terraza que ocupa la acera', fix: 'terraza', imprevisto: true },
  coche:      { name: 'Coche aparcado sobre el rebaje', fix: 'grua', imprevisto: true },
  patinetes:  { name: 'Patinetes tirados en la acera', fix: 'patinetes', imprevisto: true }
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
  { id: 'ascensor', name: 'Reparar ascensor y contratar mantenimiento', cost: 20, target: 'destino', removes: 'averia', weekly: 4 },
  // Respuestas a imprevistos: la multa devuelve créditos
  { id: 'desvio', name: 'Exigir desvío accesible a la obra', cost: 5, target: 'tramo', removes: 'obra', fine: 10, imprevisto: true },
  { id: 'terraza', name: 'Inspección y retirada de la terraza', cost: 3, target: 'tramo', removes: 'terraza', fine: 12, imprevisto: true },
  { id: 'grua', name: 'Llamar a la grúa municipal', cost: 4, target: 'tramo', removes: 'coche', fine: 15, imprevisto: true },
  { id: 'patinetes', name: 'Retirar patinetes y avisar a la empresa', cost: 2, target: 'tramo', removes: 'patinetes', fine: 6, imprevisto: true }
];

// Imprevistos: cuánto duran si no se actúa (días; 0 = hasta que actúes)
const IMPREVISTOS = [
  { b: 'obra', dias: 6, peso: 3, texto: 'Ha empezado una obra sin desvío accesible' },
  { b: 'terraza', dias: 0, peso: 3, texto: 'Un bar ha sacado una terraza que ocupa la acera' },
  { b: 'coche', dias: 3, peso: 2, texto: 'Hay un coche aparcado sobre el rebaje' },
  { b: 'patinetes', dias: 2, peso: 2, texto: 'Hay patinetes tirados en mitad de la acera' }
];
const FONDOS = { amount: 60, delay: 3 };

const B = Infinity;
// Penalización k por barrera y perfil (B = bloquea)
const PROFILES = {
  silla:    { label: 'silla de ruedas', k: { bordillo: B, escalon: B, estrecha: 2, pendiente: 3, averia: B, obra: B, terraza: 2, coche: B, patinetes: 1 } },
  ciego:    { label: 'discapacidad visual', k: { escalon: 0.5, estrecha: 2, semaforo: 3, podotactil: 1, ruido: 1, senaletica: 1, obra: B, terraza: 2, patinetes: B }, semaforoAncha: B },
  sorda:    { label: 'sordera, lengua de signos', k: { atencionOral: B } },
  andador:  { label: 'andador', k: { bordillo: B, escalon: 3, estrecha: 1, pendiente: 3, bancos: 2, averia: B, obra: B, terraza: 1, coche: B, patinetes: 1 } },
  intelect: { label: 'discapacidad intelectual', k: { ruido: 1, senaletica: 2, tramite: B, obra: 1 } },
  carrito:  { label: 'carrito de gemelos', k: { bordillo: B, escalon: B, estrecha: 2, pendiente: 1, ruido: 1, averia: B, obra: B, terraza: 2, coche: B, patinetes: 1 } }
};

function edgeId(kind, c, r) { return kind + '-' + c + '-' + r; }

function initialState(scId) {
  if (scId || !SCENARIO) setScenario(scId || SCENARIOS[0].id);
  const edges = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) {
    const id = edgeId('h', c, r);
    edges[id] = { id, kind: 'h', c, r, a: [c, r], b: [c + 1, r], barriers: [], ancha: false };
  }
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS - 1; r++) {
    const id = edgeId('v', c, r);
    edges[id] = { id, kind: 'v', c, r, a: [c, r], b: [c, r + 1], barriers: [], ancha: false };
  }
  for (const id in SCENARIO.edges) {
    const def = SCENARIO.edges[id];
    edges[id].barriers = def.b.slice();
    if (def.ancha) edges[id].ancha = true;
  }
  const dests = {};
  for (const id in DESTS) dests[id] = { barriers: (DESTS[id].barriers || []).slice() };
  const vecinos = {};
  VECINOS.forEach(v => {
    vecinos[v.id] = { history: [], abandoned: {}, fails: {} };
    v.agenda.forEach(d => { vecinos[v.id].fails[d] = []; });
  });
  return { scenario: SCENARIO.id, seed: (Math.random() * 1e9) >>> 0, temp: {}, pending: [], fondosUsados: false, premiados: {}, day: 1, budget: SCENARIO.budget, weekly: 0, edges, dests, vecinos, log: [], built: [], won: false, lost: false, lastReport: null };
}

function edgeName(e) {
  if (e.kind === 'h') return ROW_FULL[e.r] + ', entre ' + COL_NAMES[e.c] + ' y ' + COL_NAMES[e.c + 1];
  return COL_FULL[e.c] + ', entre ' + ROW_NAMES[e.r] + ' y ' + ROW_NAMES[e.r + 1];
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

function rand(state) {
  // Generador reproducible (mulberry32) para que cada partida tenga sus propios imprevistos
  let t = (state.seed = (state.seed + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function proximoIngreso(state) {
  const d = Math.ceil(state.day / 7) * 7;
  return { day: d, amount: 10 + Math.round(participacion(state) / 10) - state.weekly };
}

function imprevistosDelDia(state, report) {
  // Caducan los imprevistos temporales
  for (const k in state.temp) {
    const [eid, b] = k.split('|'), until = state.temp[k];
    if (until && state.day >= until) {
      const list = state.edges[eid].barriers, i = list.indexOf(b);
      if (i !== -1) list.splice(i, 1);
      delete state.temp[k];
      report.events.push({ kind: 'fin', edge: eid, barrier: b });
    }
  }
  if (state.day < 3 || rand(state) > 0.45) return;
  const total = IMPREVISTOS.reduce((a, x) => a + x.peso, 0);
  let r = rand(state) * total, imp = IMPREVISTOS[0];
  for (const x of IMPREVISTOS) { if ((r -= x.peso) < 0) { imp = x; break; } }
  let cands = Object.keys(state.edges).filter(id => state.edges[id].barriers.indexOf(imp.b) === -1);
  if (imp.b === 'coche') cands = cands.filter(id => state.edges[id].barriers.indexOf('bordillo') === -1);
  if (!cands.length) return;
  const eid = cands[Math.floor(rand(state) * cands.length)];
  state.edges[eid].barriers.push(imp.b);
  state.temp[eid + '|' + imp.b] = imp.dias ? state.day + imp.dias : 0;
  report.events.push({ kind: 'nuevo', edge: eid, barrier: imp.b, texto: imp.texto, dias: imp.dias });
}

function cobrosDelDia(state, report) {
  state.pending = state.pending.filter(p => {
    if (p.day > state.day) return true;
    state.budget += p.amount;
    report.money.push({ label: p.label, amount: p.amount });
    return false;
  });
}

function simulateDay(state) {
  const report = { day: state.day, trips: [], events: [], money: [] };
  imprevistosDelDia(state, report);
  cobrosDelDia(state, report);
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
        if (vs.fails[d].length >= 5 && state.day >= 8) { vs.abandoned[d] = true; report.trips[report.trips.length - 1].abandonsNow = true; }
      }
    });
    vs.history.push(dayRes);
  });
  // ingresos y mantenimiento semanales
  if (state.day % 7 === 0) {
    const inc = 10 + Math.round(participacion(state) / 10);
    report.income = inc; report.upkeep = state.weekly;
    state.budget += inc - state.weekly;
    report.money.push({ label: 'Ingreso semanal del distrito (menos mantenimiento)', amount: inc - state.weekly });
  }
  // Premio cuando un vecino alcanza su autonomía (70) por primera vez
  VECINOS.forEach(v => {
    const ia = iaFor(state, v.id);
    if (ia !== null && ia >= 70 && !state.premiados[v.id] && state.day >= 2) {
      state.premiados[v.id] = true; state.budget += 10;
      report.money.push({ label: 'Premio vecinal: ' + v.name + ' ya es autónomo', amount: 10 });
    }
  });
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
  if (it.fine) state.budget += it.fine;
  if (it.imprevisto) delete state.temp[targetId + '|' + it.removes];
  state.built.push({ day: state.day, id: it.id, target: targetId });
  return { ok: true, it };
}

function pedirFondos(state) {
  if (state.fondosUsados) return { ok: false, why: 'Ya pediste los fondos europeos en esta partida.' };
  state.fondosUsados = true;
  state.pending.push({ day: state.day + FONDOS.delay, amount: FONDOS.amount, label: 'Fondos europeos para accesibilidad' });
  return { ok: true, day: state.day + FONDOS.delay, amount: FONDOS.amount };
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

// ---------- Barrios jugables ----------
// Calles: [nombre corto para el mapa, nombre completo]. Tramos: 'h-col-fila' (horizontal) y 'v-col-fila' (vertical).
const SCENARIOS = [
  {
    id: 'lavapies', name: 'Lavapiés para todos', distrito: 'Centro', barrio: 'Embajadores (Lavapiés)', budget: 250,
    intro: 'Calles estrechas, cuestas y mucha vida. Seis vecinos necesitan llegar a la Junta, al centro de salud, al mercado y al centro cultural.',
    cols: [['Embajadores', 'Calle de Embajadores'], ['Mesón de Paredes', 'Calle de Mesón de Paredes'], ['Lavapiés', 'Calle de Lavapiés'], ['Ave María', 'Calle del Ave María'], ['Valencia', 'Calle de Valencia']],
    rows: [['la Fe', 'Calle de la Fe'], ['Argumosa', 'Calle de Argumosa'], ['Doctor Fourquet', 'Calle del Doctor Fourquet'], ['Santa Isabel', 'Calle de Santa Isabel']],
    dests: {
      junta: { name: 'Junta Municipal de Centro', short: 'Junta', node: [0, 0], barriers: ['atencionOral', 'tramite'] },
      emt: { name: 'Parada de autobús EMT', short: 'EMT', node: [2, 0] },
      salud: { name: 'Centro de salud', short: 'Salud', node: [4, 1] },
      mercado: { name: 'Mercado', short: 'Mercado', node: [1, 3] },
      cultural: { name: 'Centro cultural', short: 'Cultural', node: [3, 3], barriers: ['averia', 'atencionOral'] }
    },
    vecinos: [
      { id: 'julian', name: 'Julián', age: 82, profile: 'andador', home: [1, 1], agenda: ['salud', 'mercado'] },
      { id: 'lucia', name: 'Lucía', age: 34, profile: 'silla', home: [0, 2], agenda: ['cultural', 'emt', 'mercado'] },
      { id: 'andres', name: 'Andrés', age: 51, profile: 'ciego', home: [3, 0], agenda: ['salud', 'junta'] },
      { id: 'marta', name: 'Marta', age: 28, profile: 'sorda', home: [2, 2], agenda: ['junta', 'cultural'] },
      { id: 'sara', name: 'Sara', age: 24, profile: 'intelect', home: [4, 3], agenda: ['junta', 'mercado'] },
      { id: 'nadia', name: 'Nadia', age: 38, profile: 'carrito', home: [0, 3], agenda: ['emt', 'salud', 'mercado'] }
    ],
    edges: {
      'h-0-0': { b: ['senaletica', 'podotactil'] }, 'h-1-0': { b: ['estrecha'] }, 'h-3-0': { b: ['bordillo', 'semaforo'], ancha: true },
      'h-0-1': { b: ['ruido'] }, 'h-1-1': { b: ['senaletica'] }, 'h-2-1': { b: ['bordillo', 'semaforo'] }, 'h-3-1': { b: ['bordillo', 'semaforo'], ancha: true },
      'h-0-2': { b: ['bordillo'] }, 'h-1-2': { b: ['estrecha', 'pendiente'] }, 'h-2-2': { b: ['senaletica'] }, 'h-3-2': { b: ['escalon'] },
      'h-0-3': { b: ['estrecha'] }, 'h-2-0': { b: ['semaforo'], ancha: true }, 'h-2-3': { b: ['bordillo'] }, 'h-3-3': { b: ['pendiente', 'bancos'] },
      'v-0-0': { b: ['escalon'] }, 'v-1-0': { b: ['bordillo'] }, 'v-3-0': { b: ['bordillo'] }, 'h-1-3': { b: ['bordillo'] },
      'v-0-1': { b: ['bancos', 'pendiente'] }, 'v-0-2': { b: ['bordillo'] }, 'v-1-1': { b: ['pendiente', 'bancos'] }, 'v-1-2': { b: ['bordillo', 'estrecha'] },
      'v-2-0': { b: ['semaforo'], ancha: true }, 'v-2-1': { b: ['ruido', 'escalon'] }, 'v-2-2': { b: ['estrecha'] }, 'v-3-1': { b: ['bordillo'] },
      'v-3-2': { b: ['escalon'] }, 'v-4-0': { b: ['escalon'] }, 'v-4-1': { b: ['bordillo', 'semaforo'], ancha: true }, 'v-4-2': { b: ['senaletica', 'podotactil'] }
    }
  },
  {
    id: 'legazpi', name: 'El río es de todos', distrito: 'Arganzuela', barrio: 'Legazpi', budget: 250,
    intro: 'Madrid Río y Matadero están al lado, pero las avenidas anchas, las pasarelas con escalones y la falta de bancos dejan a muchos vecinos en casa.',
    cols: [['Delicias', 'Paseo de las Delicias'], ['Bolívar', 'Calle de Bolívar'], ['Antracita', 'Calle de Antracita'], ['Chopera', 'Paseo de la Chopera'], ['Manzanares', 'Avenida del Manzanares']],
    rows: [['Maestro Arbós', 'Calle del Maestro Arbós'], ['Bustamante', 'Calle de Bustamante'], ['Áncora', 'Calle del Áncora'], ['Yeserías', 'Paseo de Yeserías']],
    dests: {
      junta: { name: 'Junta Municipal de Arganzuela', short: 'Junta', node: [3, 0], barriers: ['tramite', 'atencionOral'] },
      salud: { name: 'Centro de salud', short: 'Salud', node: [0, 1] },
      cultural: { name: 'Matadero Madrid', short: 'Matadero', node: [3, 2], barriers: ['atencionOral'] },
      parque: { name: 'Parque Madrid Río', short: 'Madrid Río', node: [4, 3], barriers: ['averia'] },
      emt: { name: 'Parada de autobús EMT', short: 'EMT', node: [1, 3] }
    },
    vecinos: [
      { id: 'carmen', name: 'Carmen', age: 79, profile: 'andador', home: [1, 0], agenda: ['parque', 'salud'] },
      { id: 'javier', name: 'Javier', age: 41, profile: 'silla', home: [2, 2], agenda: ['parque', 'cultural', 'emt'] },
      { id: 'lola', name: 'Lola', age: 63, profile: 'ciego', home: [0, 3], agenda: ['salud', 'junta'] },
      { id: 'ivan', name: 'Iván', age: 30, profile: 'sorda', home: [4, 1], agenda: ['cultural', 'junta'] },
      { id: 'pablo', name: 'Pablo', age: 27, profile: 'intelect', home: [2, 0], agenda: ['junta', 'parque'] },
      { id: 'aisha', name: 'Aisha', age: 33, profile: 'carrito', home: [0, 2], agenda: ['parque', 'salud', 'emt'] }
    ],
    edges: {
      'v-0-0': { b: ['semaforo'], ancha: true }, 'v-0-1': { b: ['semaforo', 'ruido'], ancha: true }, 'v-0-2': { b: ['semaforo'], ancha: true },
      'h-0-0': { b: ['bordillo'] }, 'h-1-0': { b: ['estrecha'] }, 'h-2-0': { b: ['bordillo'] },
      'h-0-1': { b: ['bordillo', 'semaforo'], ancha: true }, 'h-1-1': { b: ['senaletica'] }, 'h-2-1': { b: ['bancos', 'bordillo'] }, 'h-3-1': { b: ['escalon', 'senaletica'] },
      'h-0-2': { b: ['estrecha'] }, 'h-1-2': { b: ['bordillo'] }, 'h-2-2': { b: ['bancos'] }, 'h-3-2': { b: ['escalon'] },
      'h-0-3': { b: ['ruido', 'bordillo'] }, 'h-1-3': { b: ['bordillo'] }, 'h-2-3': { b: ['pendiente', 'bancos', 'bordillo'] }, 'h-3-3': { b: ['escalon', 'bancos'] },
      'v-1-0': { b: ['bordillo'] }, 'v-1-1': { b: ['pendiente'] }, 'v-1-2': { b: ['bordillo'] },
      'v-2-0': { b: ['senaletica'] }, 'v-2-1': { b: ['bordillo'] }, 'v-2-2': { b: ['estrecha'] },
      'v-3-0': { b: ['bordillo'] }, 'v-3-1': { b: ['semaforo'], ancha: true }, 'v-3-2': { b: ['pendiente', 'bancos'] },
      'v-4-0': { b: ['podotactil'] }, 'v-4-1': { b: ['escalon'] }, 'v-4-2': { b: ['escalon', 'bancos'] }
    }
  },
  {
    id: 'trafalgar', name: 'Portales de Chamberí', distrito: 'Chamberí', barrio: 'Trafalgar', budget: 250,
    intro: 'Edificios antiguos, aceras estrechas y portales con escalones. Muchos vecinos llevan meses sin salir a la plaza ni a la biblioteca.',
    cols: [['Fuencarral', 'Calle de Fuencarral'], ['Trafalgar', 'Calle de Trafalgar'], ['Olid', 'Calle de Olid'], ['Santa Feliciana', 'Calle de Santa Feliciana'], ['Raimundo Lulio', 'Calle de Raimundo Lulio']],
    rows: [['Eloy Gonzalo', 'Calle de Eloy Gonzalo'], ['Sagunto', 'Calle de Sagunto'], ['Luchana', 'Calle de Luchana'], ['Palafox', 'Calle de Palafox']],
    dests: {
      junta: { name: 'Junta Municipal de Chamberí', short: 'Junta', node: [4, 0], barriers: ['tramite', 'atencionOral'] },
      biblio: { name: 'Biblioteca municipal', short: 'Biblioteca', node: [0, 0], barriers: ['averia', 'atencionOral'] },
      mercado: { name: 'Mercado municipal', short: 'Mercado', node: [2, 3] },
      salud: { name: 'Centro de salud', short: 'Salud', node: [4, 3] },
      plaza: { name: 'Plaza de Olavide', short: 'Olavide', node: [2, 1] }
    },
    vecinos: [
      { id: 'rosario', name: 'Rosario', age: 85, profile: 'andador', home: [0, 2], agenda: ['plaza', 'salud'] },
      { id: 'daniel', name: 'Daniel', age: 29, profile: 'silla', home: [3, 2], agenda: ['biblio', 'mercado'] },
      { id: 'mercedes', name: 'Mercedes', age: 70, profile: 'ciego', home: [1, 3], agenda: ['salud', 'junta'] },
      { id: 'hugo', name: 'Hugo', age: 45, profile: 'sorda', home: [3, 0], agenda: ['junta', 'biblio'] },
      { id: 'marina', name: 'Marina', age: 31, profile: 'intelect', home: [1, 0], agenda: ['junta', 'plaza'] },
      { id: 'elena', name: 'Elena', age: 36, profile: 'carrito', home: [4, 2], agenda: ['plaza', 'mercado', 'salud'] }
    ],
    edges: {
      'h-0-0': { b: ['estrecha'] }, 'h-1-0': { b: ['estrecha', 'bordillo'] }, 'h-2-0': { b: ['estrecha'] }, 'h-3-0': { b: ['bordillo', 'semaforo'] },
      'h-0-1': { b: ['bordillo'] }, 'h-1-1': { b: ['escalon'] }, 'h-2-1': { b: ['escalon'] }, 'h-3-1': { b: ['estrecha'] },
      'h-0-2': { b: ['estrecha', 'bancos'] }, 'h-1-2': { b: ['bordillo'] }, 'h-2-2': { b: ['senaletica'] }, 'h-3-2': { b: ['bordillo'] },
      'h-0-3': { b: ['bordillo'] }, 'h-1-3': { b: ['estrecha', 'bordillo'] }, 'h-2-3': { b: ['bordillo', 'semaforo'], ancha: true }, 'h-3-3': { b: ['escalon', 'semaforo'], ancha: true },
      'v-0-0': { b: ['semaforo', 'ruido'], ancha: true }, 'v-0-1': { b: ['bordillo', 'ruido'] }, 'v-0-2': { b: ['escalon'] },
      'v-1-0': { b: ['bancos', 'pendiente'] }, 'v-1-1': { b: ['bordillo'] }, 'v-1-2': { b: ['senaletica'] },
      'v-2-0': { b: ['escalon'] }, 'v-2-1': { b: ['bordillo', 'senaletica'] }, 'v-2-2': { b: ['estrecha', 'bordillo'] },
      'v-3-0': { b: ['bordillo'] }, 'v-3-1': { b: ['senaletica', 'pendiente'] }, 'v-3-2': { b: ['bordillo'] },
      'v-4-0': { b: ['semaforo'], ancha: true }, 'v-4-1': { b: ['estrecha'] }, 'v-4-2': { b: ['bordillo', 'semaforo'], ancha: true }
    }
  },
  {
    id: 'sandiego', name: 'Cuesta arriba en Vallecas', distrito: 'Puente de Vallecas', barrio: 'San Diego', budget: 250,
    intro: 'Cuestas fuertes, la avenida de la Albufera llena de tráfico y servicios repartidos por el barrio. Hay que elegir bien dónde invertir.',
    cols: [['Peña Prieta', 'Calle de Peña Prieta'], ['Monte Igueldo', 'Avenida de Monte Igueldo'], ['Martínez de la Riva', 'Calle de Martínez de la Riva'], ['Javier de Miguel', 'Calle de Javier de Miguel'], ['Puerto de Canfranc', 'Calle del Puerto de Canfranc']],
    rows: [['Albufera', 'Avenida de la Albufera'], ['Arroyo del Olivar', 'Calle del Arroyo del Olivar'], ['Sierra Carbonera', 'Calle de la Sierra Carbonera'], ['Sierra Gorda', 'Calle de Sierra Gorda']],
    dests: {
      emt: { name: 'Parada de autobús EMT', short: 'EMT', node: [2, 0] },
      junta: { name: 'Junta Municipal de Puente de Vallecas', short: 'Junta', node: [0, 0], barriers: ['atencionOral'] },
      salud: { name: 'Centro de salud', short: 'Salud', node: [4, 2] },
      mercado: { name: 'Mercado municipal', short: 'Mercado', node: [1, 2], barriers: ['tramite', 'atencionOral'] },
      polideportivo: { name: 'Polideportivo municipal', short: 'Polidep.', node: [3, 3], barriers: ['averia'] }
    },
    vecinos: [
      { id: 'antonio', name: 'Antonio', age: 77, profile: 'andador', home: [2, 3], agenda: ['salud', 'mercado'] },
      { id: 'fatima', name: 'Fátima', age: 22, profile: 'silla', home: [4, 0], agenda: ['polideportivo', 'emt'] },
      { id: 'roberto', name: 'Roberto', age: 48, profile: 'ciego', home: [3, 1], agenda: ['emt', 'junta'] },
      { id: 'nuria', name: 'Nuria', age: 35, profile: 'sorda', home: [0, 3], agenda: ['junta', 'salud'] },
      { id: 'kevin', name: 'Kevin', age: 19, profile: 'intelect', home: [1, 1], agenda: ['mercado', 'polideportivo'] },
      { id: 'yolanda', name: 'Yolanda', age: 40, profile: 'carrito', home: [0, 1], agenda: ['salud', 'emt', 'mercado'] }
    ],
    edges: {
      'h-0-0': { b: ['semaforo', 'ruido'], ancha: true }, 'h-1-0': { b: ['semaforo', 'ruido', 'bordillo'], ancha: true }, 'h-2-0': { b: ['semaforo', 'bordillo'], ancha: true }, 'h-3-0': { b: ['ruido'] },
      'h-0-1': { b: ['pendiente', 'bancos'] }, 'h-1-1': { b: ['pendiente'] }, 'h-2-1': { b: ['bordillo'] }, 'h-3-1': { b: ['pendiente', 'bancos'] },
      'h-0-2': { b: ['bordillo'] }, 'h-1-2': { b: ['escalon'] }, 'h-2-2': { b: ['pendiente', 'bancos'] }, 'h-3-2': { b: ['bordillo', 'pendiente'] },
      'h-0-3': { b: ['estrecha', 'bordillo'] }, 'h-1-3': { b: ['pendiente'] }, 'h-2-3': { b: ['bordillo', 'senaletica'] }, 'h-3-3': { b: ['estrecha', 'senaletica'] },
      'v-0-0': { b: ['escalon'] }, 'v-0-1': { b: ['pendiente', 'bancos'] }, 'v-0-2': { b: ['bordillo'] },
      'v-1-0': { b: ['bordillo', 'pendiente'] }, 'v-1-1': { b: ['senaletica'] }, 'v-1-2': { b: ['pendiente'] },
      'v-2-0': { b: ['escalon', 'semaforo'], ancha: true }, 'v-2-1': { b: ['bordillo'] }, 'v-2-2': { b: ['escalon'] },
      'v-3-0': { b: ['semaforo'] }, 'v-3-1': { b: ['pendiente', 'bancos'] }, 'v-3-2': { b: ['senaletica'] },
      'v-4-0': { b: ['pendiente'] }, 'v-4-1': { b: ['bordillo'] }, 'v-4-2': { b: ['escalon'] }
    }
  },
  {
    id: 'sanisidro', name: 'Fiesta en la pradera', distrito: 'Carabanchel', barrio: 'San Isidro', budget: 250,
    intro: 'Se acerca San Isidro y todo el barrio quiere subir al parque. Pero la pradera tiene cuestas y escaleras, y la calle del General Ricardos es ancha y ruidosa.',
    cols: [['General Ricardos', 'Calle del General Ricardos'], ['Antonio Leyva', 'Calle de Antonio Leyva'], ['Oca', 'Calle de Oca'], ['Eduardo Morales', 'Calle de Eduardo Morales'], ['Algodonales', 'Calle de Algodonales']],
    rows: [['Ermita del Santo', 'Paseo de la Ermita del Santo'], ['Toboso', 'Calle del Toboso'], ['Nuestra Señora de la Luz', 'Calle de Nuestra Señora de la Luz'], ['Camino Viejo de Leganés', 'Camino Viejo de Leganés']],
    dests: {
      parque: { name: 'Parque de San Isidro', short: 'Parque', node: [4, 0], barriers: ['averia'] },
      junta: { name: 'Junta Municipal de Carabanchel', short: 'Junta', node: [0, 3], barriers: ['tramite', 'atencionOral'] },
      mayores: { name: 'Centro municipal de mayores', short: 'Mayores', node: [2, 1], barriers: ['atencionOral'] },
      salud: { name: 'Centro de salud', short: 'Salud', node: [1, 2] },
      emt: { name: 'Parada de autobús EMT', short: 'EMT', node: [0, 1] }
    },
    vecinos: [
      { id: 'pilar', name: 'Pilar', age: 88, profile: 'andador', home: [3, 2], agenda: ['mayores', 'salud', 'parque'] },
      { id: 'mario', name: 'Mario', age: 52, profile: 'silla', home: [2, 3], agenda: ['parque', 'emt'] },
      { id: 'ana', name: 'Ana', age: 44, profile: 'ciego', home: [3, 0], agenda: ['emt', 'salud'] },
      { id: 'tomasa', name: 'Tomasa', age: 67, profile: 'sorda', home: [4, 2], agenda: ['mayores', 'junta'] },
      { id: 'raul', name: 'Raúl', age: 23, profile: 'intelect', home: [1, 0], agenda: ['junta', 'parque'] },
      { id: 'cristina', name: 'Cristina', age: 34, profile: 'carrito', home: [4, 3], agenda: ['parque', 'salud', 'emt'] }
    ],
    edges: {
      'v-0-0': { b: ['semaforo', 'ruido'], ancha: true }, 'v-0-1': { b: ['semaforo', 'ruido'], ancha: true }, 'v-0-2': { b: ['semaforo', 'bordillo'], ancha: true },
      'h-0-0': { b: ['bordillo'] }, 'h-1-0': { b: ['estrecha'] }, 'h-2-0': { b: ['pendiente', 'bancos'] }, 'h-3-0': { b: ['escalon', 'pendiente'] },
      'h-0-1': { b: ['bordillo', 'semaforo'], ancha: true }, 'h-1-1': { b: ['senaletica'] }, 'h-2-1': { b: ['bordillo'] }, 'h-3-1': { b: ['pendiente', 'bancos'] },
      'h-0-2': { b: ['bordillo'] }, 'h-1-2': { b: ['estrecha', 'bordillo'] }, 'h-2-2': { b: ['senaletica'] }, 'h-3-2': { b: ['bordillo'] },
      'h-0-3': { b: ['ruido', 'bordillo'] }, 'h-1-3': { b: ['estrecha'] }, 'h-2-3': { b: ['bordillo'] }, 'h-3-3': { b: ['bancos'] },
      'v-1-0': { b: ['bordillo'] }, 'v-1-1': { b: ['bordillo'] }, 'v-1-2': { b: ['senaletica'] },
      'v-2-0': { b: ['pendiente'] }, 'v-2-1': { b: ['estrecha'] }, 'v-2-2': { b: ['bordillo'] },
      'v-3-0': { b: ['escalon'] }, 'v-3-1': { b: ['bordillo', 'pendiente'] }, 'v-3-2': { b: ['estrecha'] },
      'v-4-0': { b: ['escalon', 'pendiente', 'bancos'] }, 'v-4-1': { b: ['pendiente', 'bancos'] }, 'v-4-2': { b: ['bordillo'] }
    }
  }
];

function setScenario(id) {
  const sc = SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
  SCENARIO = sc;
  COL_NAMES = sc.cols.map(c => c[0]); COL_FULL = sc.cols.map(c => c[1]);
  ROW_NAMES = sc.rows.map(r => r[0]); ROW_FULL = sc.rows.map(r => r[1]);
  DESTS = sc.dests; VECINOS = sc.vecinos;
  return sc;
}

if (typeof module !== 'undefined') module.exports = { COLS, ROWS, SCENARIOS, setScenario, getScenario: () => SCENARIO, getDests: () => DESTS, getVecinos: () => VECINOS, BARRIERS, INTERVENTIONS, PROFILES, initialState, edgeName, edgeCost, route, tryTrip, iaFor, iaGlobal, participacion, simulateDay, canBuild, build, avisar, pedirFondos, proximoIngreso, IMPREVISTOS, FONDOS };
