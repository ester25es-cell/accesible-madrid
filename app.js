(function () {
  'use strict';
  var E = {
    COLS: COLS, ROWS: ROWS, BARRIERS: BARRIERS, INTERVENTIONS: INTERVENTIONS, PROFILES: PROFILES,
    get DESTS() { return DESTS; }, get VECINOS() { return VECINOS; }, get SC() { return SCENARIO; },
    SCENARIOS: SCENARIOS, initialState: initialState, edgeName: edgeName, route: route,
    tryTrip: tryTrip, iaFor: iaFor, iaGlobal: iaGlobal, participacion: participacion,
    simulateDay: simulateDay, canBuild: canBuild, build: build, avisar: avisar,
    pedirFondos: pedirFondos, proximoIngreso: proximoIngreso, FONDOS: FONDOS
  };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var state, sel = null, filterInt = '', overlay = null, focusKey = null;

  // Posición de las cajas de destino y de las casas respecto a su cruce
  function destOff(id) { var n = E.DESTS[id].node; return [n[0] < E.COLS - 1 ? 12 : -84, n[1] < E.ROWS - 1 ? 14 : -48]; }
  function homeOff(v) { return [v.home[0] > 0 ? -28 : 28, v.home[1] > 0 ? -28 : 28]; }
  var RES_TXT = { ok: 'llegó', dificultad: 'con dificultad', fallido: 'falló', abandonado: 'ya no lo intenta' };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function xy(n) { return [70 + n[0] * 150, 60 + n[1] * 130]; }
  function vecino(id) { for (var i = 0; i < E.VECINOS.length; i++) if (E.VECINOS[i].id === id) return E.VECINOS[i]; }
  function itemKey(type, id) { return type + ':' + id; }
  function barrierName(b) { return E.BARRIERS[b].name; }
  function placeName(type, id) { return type === 'edge' ? E.edgeName(state.edges[id]) : E.DESTS[id].name; }
  function barriersOf(type, id) { return type === 'edge' ? state.edges[id].barriers : state.dests[id].barriers; }

  function announce(msg) {
    var a = $('anuncio');
    a.textContent = '';
    setTimeout(function () { a.textContent = msg; }, 60);
  }

  // Efecto de una barrera sobre los vecinos
  function effect(b, edge) {
    var blocks = [], hinders = [];
    E.VECINOS.forEach(function (v) {
      var p = E.PROFILES[v.profile];
      var k = p.k[b] || 0;
      if (b === 'semaforo' && edge && edge.ancha && p.semaforoAncha) k = p.semaforoAncha;
      if (k === Infinity) blocks.push(v.name); else if (k > 0) hinders.push(v.name);
    });
    return { blocks: blocks, hinders: hinders };
  }
  function listNames(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]; }

  // ---------- Mapa ----------
  function mapItems() {
    var items = [];
    Object.keys(state.edges).forEach(function (id) {
      var e = state.edges[id], a = xy(e.a), b = xy(e.b);
      items.push({ type: 'edge', id: id, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 });
    });
    Object.keys(E.DESTS).forEach(function (id) {
      var n = xy(E.DESTS[id].node), o = destOff(id);
      items.push({ type: 'dest', id: id, cx: n[0] + o[0] + 36, cy: n[1] + o[1] + 17 });
    });
    items.sort(function (p, q) { return (p.cy - q.cy) || (p.cx - q.cx); });
    return items;
  }

  function applies(type, id) {
    if (!filterInt) return false;
    var it = E.INTERVENTIONS.find(function (i) { return i.id === filterInt; });
    if ((it.target === 'tramo') !== (type === 'edge')) return false;
    return barriersOf(type, id).indexOf(it.removes) !== -1;
  }

  function labelFor(type, id) {
    var bs = barriersOf(type, id);
    var t = placeName(type, id) + (type === 'dest' ? ', destino' : '') + '. ';
    t += bs.length ? 'Barreras: ' + bs.map(barrierName).join('; ') + '.' : 'Sin barreras.';
    if (applies(type, id)) t += ' Aquí sirve la mejora elegida.';
    return t;
  }

  function renderMap() {
    var svg = $('mapa');
    var active = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-key');
    var h = '';
    // manzanas
    for (var c = 0; c < E.COLS - 1; c++) for (var r = 0; r < E.ROWS - 1; r++) {
      var p = xy([c, r]);
      h += '<rect x="' + (p[0] + 18) + '" y="' + (p[1] + 18) + '" width="114" height="94" rx="6" fill="var(--block)" stroke="var(--block-line)" aria-hidden="true"/>';
    }
    // nombres de calles
    h += '<g aria-hidden="true">';
    ROW_NAMES.forEach(function (n, r) { h += '<text class="street-label" x="686" y="' + (60 + r * 130 + 4) + '" text-anchor="start">' + esc(n) + '</text>'; });
    COL_NAMES.forEach(function (n, c) { h += '<text class="street-label" x="' + (70 + c * 150) + '" y="490" text-anchor="middle">' + esc(n) + '</text>'; });
    h += '</g>';
    var items = mapItems();
    if (!focusKey) focusKey = itemKey(items[0].type, items[0].id);
    // tramos
    Object.keys(state.edges).forEach(function (id) {
      var e = state.edges[id], a = xy(e.a), b = xy(e.b), k = itemKey('edge', id);
      var bs = e.barriers, cls = 'edge ' + (bs.length ? 'bar' : 'okk');
      if (sel && sel.type === 'edge' && sel.id === id) cls += ' sel';
      if (applies('edge', id)) cls += ' applies';
      var d = 'M' + a[0] + ' ' + a[1] + 'L' + b[0] + ' ' + b[1];
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      var rx = e.kind === 'h' ? (mx - 70) : (mx - 16), ry = e.kind === 'h' ? (my - 16) : (my - 60);
      var rw = e.kind === 'h' ? 140 : 32, rh = e.kind === 'h' ? 32 : 120;
      h += '<g class="' + cls + '" data-key="' + k + '" role="button" tabindex="' + (k === focusKey ? 0 : -1) + '" aria-label="' + esc(labelFor('edge', id)) + '"' + (sel && sel.type === 'edge' && sel.id === id ? ' aria-current="true"' : '') + '>';
      h += '<path class="halo" d="' + d + '"/><path class="hit" d="' + d + '"/><path class="vis" d="' + d + '"/>';
      h += '<rect class="selring" x="' + rx + '" y="' + ry + '" width="' + rw + '" height="' + rh + '" rx="10"/>';
      h += '<rect class="ring" x="' + (rx - 5) + '" y="' + (ry - 5) + '" width="' + (rw + 10) + '" height="' + (rh + 10) + '" rx="12"/>';
      if (bs.length) h += '<g class="badge"><circle cx="' + mx + '" cy="' + my + '" r="11"/><text x="' + mx + '" y="' + (my + 4) + '" text-anchor="middle">' + bs.length + '</text></g>';
      h += '</g>';
    });
    // destinos
    Object.keys(E.DESTS).forEach(function (id) {
      var n = xy(E.DESTS[id].node), o = destOff(id), x = n[0] + o[0], y = n[1] + o[1], k = itemKey('dest', id);
      var bs = state.dests[id].barriers;
      var cls = 'dest' + (bs.length ? ' hasbar' : '') + (sel && sel.type === 'dest' && sel.id === id ? ' sel' : '');
      h += '<g class="' + cls + '" data-key="' + k + '" role="button" tabindex="' + (k === focusKey ? 0 : -1) + '" aria-label="' + esc(labelFor('dest', id)) + '"' + (sel && sel.type === 'dest' && sel.id === id ? ' aria-current="true"' : '') + '>';
      if (applies('dest', id)) h += '<rect x="' + (x - 6) + '" y="' + (y - 6) + '" width="84" height="46" rx="10" fill="var(--accent)" fill-opacity=".3"/>';
      h += '<rect class="box" x="' + x + '" y="' + y + '" width="72" height="34" rx="6"/>';
      h += '<text x="' + (x + 36) + '" y="' + (y + 22) + '" text-anchor="middle">' + esc(E.DESTS[id].short) + (bs.length ? ' (' + bs.length + ')' : '') + '</text>';
      h += '<rect class="selring" x="' + (x - 4) + '" y="' + (y - 4) + '" width="80" height="42" rx="8"/>';
      h += '<rect class="ring" x="' + (x - 9) + '" y="' + (y - 9) + '" width="90" height="52" rx="10"/>';
      h += '</g>';
    });
    // casas
    h += '<g aria-hidden="true">';
    E.VECINOS.forEach(function (v) {
      var n = xy(v.home), o = homeOff(v), hx = n[0] + o[0], hy = n[1] + o[1];
      h += '<g class="home"><path d="M' + (hx - 15) + ' ' + (hy - 1) + 'L' + hx + ' ' + (hy - 16) + 'L' + (hx + 15) + ' ' + (hy - 1) + 'V' + (hy + 14) + 'H' + (hx - 15) + 'Z"/><text x="' + hx + '" y="' + (hy + 10) + '" text-anchor="middle">' + esc(v.name[0]) + '</text></g>';
    });
    h += '</g>';
    h += walkersSVG();
    // ruta consultada
    if (overlay && overlay.points.length > 1) {
      h += '<polyline class="route" aria-hidden="true" points="' + overlay.points.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '"/>';
    }
    svg.innerHTML = h;
    if (active) { var el = svg.querySelector('[data-key="' + active + '"]'); if (el) el.focus(); }
  }

  function focusItem(key) {
    var svg = $('mapa');
    svg.querySelectorAll('[data-key]').forEach(function (el) { el.setAttribute('tabindex', el.getAttribute('data-key') === key ? '0' : '-1'); });
    focusKey = key;
    var el = svg.querySelector('[data-key="' + key + '"]');
    if (el) el.focus();
  }

  function moveFocus(dir) {
    var items = mapItems(), cur = null;
    items.forEach(function (it) { if (itemKey(it.type, it.id) === focusKey) cur = it; });
    if (!cur) return;
    var best = null, bs = Infinity;
    items.forEach(function (it) {
      if (it === cur) return;
      var dx = it.cx - cur.cx, dy = it.cy - cur.cy, main, side;
      if (dir === 'ArrowRight') { main = dx; side = dy; } else if (dir === 'ArrowLeft') { main = -dx; side = dy; }
      else if (dir === 'ArrowDown') { main = dy; side = dx; } else { main = -dy; side = dx; }
      if (main <= 4) return;
      var score = main + 2 * Math.abs(side);
      if (score < bs) { bs = score; best = it; }
    });
    if (best) focusItem(itemKey(best.type, best.id));
  }

  function select(type, id, opts) {
    sel = { type: type, id: id };
    focusKey = itemKey(type, id);
    renderMap(); renderDetail(); renderList(); updateSheet();
    if (opts && opts.focusMap) focusItem(focusKey);
    if (opts && opts.focusDetail) $('detalle').focus();
  }

  // ---------- Detalle ----------
  function renderDetail() {
    var body = $('det-body');
    if (!sel) return;
    var type = sel.type, id = sel.id, bs = barriersOf(type, id);
    $('h-det').textContent = placeName(type, id);
    var h = '';
    if (!bs.length) {
      h += '<p style="margin:0">Sin barreras. Todo el mundo puede pasar por aquí.</p>';
    } else {
      h += '<p style="margin:0;font-weight:700">Barreras</p><ul class="barlist">';
      bs.forEach(function (b) {
        var ef = effect(b, type === 'edge' ? state.edges[id] : null), parts = [];
        if (ef.blocks.length) parts.push('bloquea a ' + listNames(ef.blocks));
        if (ef.hinders.length) parts.push('dificulta a ' + listNames(ef.hinders));
        var tk = state.temp[id + '|' + b], extra = '';
        if (E.BARRIERS[b].imprevisto) extra = tk ? ' (imprevisto: se irá solo dentro de ' + (tk - state.day) + ' días)' : ' (imprevisto: sigue hasta que actúes)';
        h += '<li><strong>' + esc(barrierName(b)) + '</strong>' + esc(extra) + (parts.length ? ': ' + esc(parts.join('; ')) : ': no afecta a los vecinos de este escenario') + '.</li>';
      });
      h += '</ul>';
      var fixes = bs.map(function (b) { return E.BARRIERS[b].fix; }).filter(function (f, i, a) { return f && a.indexOf(f) === i; });
      if (fixes.length) h += '<p style="margin:0 0 6px;font-weight:700">Construir aquí</p>';
      fixes.forEach(function (f) {
        var it = E.INTERVENTIONS.find(function (i) { return i.id === f; });
        var ok = state.budget >= it.cost && !state.won && !state.lost;
        var why = state.won || state.lost ? 'La partida ha terminado.' : 'Faltan ' + (it.cost - state.budget) + ' créditos.';
        h += '<div class="fix"><button type="button" class="btn ' + (ok ? 'primary' : '') + '" data-build="' + f + '"' + (ok ? '' : ' aria-disabled="true" aria-describedby="why-' + f + '"') + '>' + esc(it.name) + ' · ' + it.cost + (it.weekly ? ' + ' + it.weekly + '/semana' : '') + (it.fine ? ' (multa: +' + it.fine + ')' : '') + '</button>' + (ok ? '' : '<div class="hint" id="why-' + f + '">' + esc(why) + ' <button type="button" class="btn small" data-open="creditos">¿Cómo consigo créditos?</button></div>') + '</div>';
      });
      if (bs.indexOf('pendiente') !== -1) h += '<p class="hint">La cuesta no se puede quitar. Mejorar los tramos de alrededor da rutas alternativas.</p>';
    }
    h += '<div class="row" style="margin-top:8px"><button type="button" class="btn" data-say="lugar">Escuchar este lugar</button></div>';
    body.innerHTML = h;
  }

  function doBuild(f) {
    if (!sel) return;
    var res = E.build(state, f, sel.id);
    if (!res.ok) { announce(res.why); return; }
    var msg = (res.it.imprevisto ? res.it.name + ' hecho en ' : res.it.name + ' construido en ') + placeName(sel.type, sel.id) + '.' + (res.it.fine ? ' Multa cobrada: ' + res.it.fine + ' créditos.' : '') + ' Quedan ' + state.budget + ' créditos.';
    renderAll();
    $('detalle').focus();
    announce(msg);
    sound('construir');
    if (settings.voz) say('Rosa', msg);
  }

  // ---------- Lista ----------
  function renderList() {
    var rows = '';
    var places = [];
    Object.keys(E.DESTS).forEach(function (id) { places.push(['dest', id]); });
    Object.keys(state.edges).forEach(function (id) { places.push(['edge', id]); });
    places.forEach(function (p) {
      var bs = barriersOf(p[0], p[1]);
      if (!bs.length) return;
      if (filterInt && !applies(p[0], p[1])) return;
      var isSel = sel && sel.type === p[0] && sel.id === p[1];
      rows += '<tr' + (isSel ? ' aria-current="true" style="background:var(--accent-tint)"' : '') + '><th scope="row" style="font-weight:400">' + esc(placeName(p[0], p[1])) + '</th><td>' + esc(bs.map(barrierName).join('; ')) + '</td><td><button type="button" class="btn" data-pick="' + p[0] + ':' + p[1] + '">Ver y construir<span class="sr-only"> en ' + esc(placeName(p[0], p[1])) + '</span></button></td></tr>';
    });
    if (!rows) rows = '<tr><td colspan="3">' + (filterInt ? 'Esta mejora ya no hace falta en ningún sitio.' : 'No quedan barreras. ¡Enhorabuena!') + '</td></tr>';
    $('lista-body').innerHTML = rows;
  }

  // ---------- Catálogo ----------
  function renderCatalog() {
    var h = '<label class="opt' + (filterInt === '' ? ' on' : '') + '"><input type="radio" name="int" value=""' + (filterInt === '' ? ' checked' : '') + '><span class="name">Ninguna</span></label>';
    E.INTERVENTIONS.filter(function (it) { return !it.imprevisto; }).forEach(function (it) {
      var on = filterInt === it.id;
      h += '<label class="opt' + (on ? ' on' : '') + '"><input type="radio" name="int" value="' + it.id + '"' + (on ? ' checked' : '') + '><span class="name">' + esc(it.name) + '</span><span>' + it.cost + '</span></label>';
    });
    $('catalogo').innerHTML = h;
  }

  // ---------- Vecinos ----------
  function renderVecinos() {
    var rep = state.lastReport, h = '';
    E.VECINOS.forEach(function (v) {
      var ia = E.iaFor(state, v.id), low = ia !== null && ia < 50;
      h += '<tr><th scope="row" style="font-weight:400"><strong>' + esc(v.name) + '</strong>, ' + v.age + '<br><span class="hint" style="margin:0">' + esc(E.PROFILES[v.profile].label) + '</span><br><button type="button" class="btn small" data-say="vecino:' + v.id + '">Escuchar a ' + esc(v.name) + '</button></th>';
      h += '<td><span class="ia' + (low ? ' low' : '') + '">' + (ia === null ? 'Sin datos' : ia + (low ? ' · bajo el mínimo' : '')) + '</span>';
      if (ia !== null) h += '<div class="minibar" aria-hidden="true"><span class="' + (low ? 'low' : '') + '" style="width:' + ia + '%"></span></div>';
      h += '</td><td>';
      if (!rep) h += '<span class="hint">Aún no ha salido</span>';
      else rep.trips.filter(function (t) { return t.vecino === v.id; }).forEach(function (t, i) {
        h += '<button type="button" class="chip ' + t.result + '" data-trip="' + v.id + ':' + t.dest + '">' + esc(E.DESTS[t.dest].short) + ': ' + RES_TXT[t.result] + '</button>';
      });
      h += '</td></tr>';
    });
    $('vecinos-body').innerHTML = h;
  }

  function pathPoints(start, edgeIds) {
    var pts = [xy(start)], cur = start;
    edgeIds.forEach(function (id) {
      var e = state.edges[id];
      var nxt = (e.a[0] === cur[0] && e.a[1] === cur[1]) ? e.b : e.a;
      pts.push(xy(nxt)); cur = nxt;
    });
    return pts;
  }

  function showTrip(vid, dest) {
    var v = vecino(vid), t = state.lastReport.trips.find(function (x) { return x.vecino === vid && x.dest === dest; });
    var full = E.tryTrip(state, v, dest);
    var ideal = E.route(state, v.home, E.DESTS[dest].node, v.profile, true);
    var ids = full.path || (ideal ? ideal.path.map(function (e) { return e.id; }) : []);
    overlay = { points: pathPoints(v.home, ids) };
    var where = full.reason;
    var msg = v.name + ' hacia ' + E.DESTS[dest].name + ': ' + RES_TXT[t.result] + ' el último día. ';
    if (full.result === 'ok') msg += 'Hoy podría llegar sin problemas.';
    else if (where && where.edge) msg += (full.result === 'fallido' ? 'Le bloquea ' : 'Le cuesta ') + barrierName(where.barrier).toLowerCase() + ' en ' + E.edgeName(state.edges[where.edge]) + '.';
    else if (where && where.dest) msg += 'Le bloquea ' + barrierName(where.barrier).toLowerCase() + ' en ' + E.DESTS[where.dest].name + '.';
    else if (full.result === 'dificultad') msg += 'Tiene que dar un gran rodeo.';
    if (where && where.edge) select('edge', where.edge, { focusMap: true });
    else if (where && where.dest) select('dest', where.dest, { focusMap: true });
    else { renderMap(); }
    showTab('mapa', false);
    announce(msg + ' La ruta se muestra en el mapa.');
  }

  // ---------- Avisos y día ----------
  function renderAvisos(rep) {
    var c = { ok: 0, dificultad: 0, fallido: 0, abandonado: 0 };
    rep.trips.forEach(function (t) { c[t.result]++; });
    var h = '<p style="margin:0 0 8px"><strong>Día ' + rep.day + ':</strong> ' + c.ok + ' viajes sin problema, ' + c.dificultad + ' con dificultad, ' + c.fallido + ' fallidos' + (c.abandonado ? ', ' + c.abandonado + ' ya no se intentan' : '') + '.</p>';
    h += '<p style="margin:0 0 10px"><button type="button" class="btn" data-say="resumen">Escuchar el resumen del día</button></p>';
    rep.money.forEach(function (m) {
      h += '<div class="aviso dinero"><span class="tag">Créditos ' + (m.amount >= 0 ? '+' : '') + m.amount + '</span><p>' + esc(m.label) + '.</p></div>';
    });
    rep.events.forEach(function (ev) {
      var e = state.edges[ev.edge], ef = effect(ev.barrier, e);
      if (ev.kind === 'fin') { h += '<div class="aviso"><span class="tag">Imprevisto resuelto</span><p>' + esc(barrierName(ev.barrier)) + ' en ' + esc(E.edgeName(e)) + ': ya no está.</p></div>'; return; }
      var inter = E.INTERVENTIONS.find(function (i) { return i.removes === ev.barrier; });
      h += '<div class="aviso imp"><span class="tag">Imprevisto</span><p>' + esc(ev.texto) + ' en ' + esc(E.edgeName(e)) + '.' + (ef.blocks.length ? ' Bloquea a ' + esc(listNames(ef.blocks)) + '.' : '') + (ev.dias ? ' Si no actúas, durará ' + ev.dias + ' días.' : ' Seguirá ahí hasta que actúes.') + ' Puedes: ' + esc(lower(inter.name)) + ' (cuesta ' + inter.cost + ', multa +' + inter.fine + ').</p>';
      h += '<div class="row"><button type="button" class="btn primary" data-pick="edge:' + ev.edge + '">Ver y actuar</button><button type="button" class="btn" data-say="imp:' + ev.edge + ':' + ev.barrier + '">Escuchar</button></div></div>';
    });
    rep.trips.forEach(function (t) {
      if (t.result === 'ok' || t.result === 'abandonado') return;
      var v = vecino(t.vecino), f = t.result === 'fallido', r = t.reason, where = '';
      if (r && r.edge) where = barrierName(r.barrier) + ' en ' + E.edgeName(state.edges[r.edge]) + '.';
      else if (r && r.dest) where = barrierName(r.barrier) + ' en ' + E.DESTS[r.dest].name + '.';
      else where = 'Tuvo que dar un gran rodeo.';
      h += '<div class="aviso' + (f ? ' f' : '') + '"><span class="tag">' + (f ? 'Viaje fallido' : 'Con dificultad') + ' · ' + esc(v.name) + '</span>';
      h += '<p>Hacia ' + esc(E.DESTS[t.dest].name) + '. ' + esc(where) + (t.abandonsNow ? ' <strong>Ha dejado de intentarlo.</strong>' : '') + '</p>';
      h += '<div class="row"><button type="button" class="btn" data-trip="' + t.vecino + ':' + t.dest + '">Ver en el mapa</button><button type="button" class="btn" data-say="trip:' + t.vecino + ':' + t.dest + '">Escuchar a ' + esc(v.name) + '</button></div></div>';
    });
    $('avisos').innerHTML = h;
    return c;
  }

  function nextDay() {
    if (state.won || state.lost) { openDialog($('d-fin')); return; }
    var rep = E.simulateDay(state);
    overlay = null;
    var c = renderAvisos(rep);
    renderAll();
    announce('Día ' + rep.day + '. ' + c.ok + ' viajes sin problema, ' + c.dificultad + ' con dificultad, ' + c.fallido + ' fallidos. Índice de Autonomía ' + rep.ia + '.');
    if (state.won) sound('exito'); else sound(c.fallido ? 'aviso' : 'construir');
    if (settings.voz && !state.won && !state.lost) say('Rosa', resumenTexto());
    if (state.won || state.lost) endGame();
  }

  function endGame() {
    var ia = E.iaGlobal(state);
    if (state.won) {
      $('h-fin').textContent = 'Escenario superado el día ' + (state.day - 1);
      $('fin-body').innerHTML = '<p>Índice de Autonomía: <strong>' + ia + '</strong>. Ningún vecino está por debajo de 50.</p><p>Has hecho ' + state.built.length + ' mejoras y te quedan ' + state.budget + ' créditos.</p><p>' + esc(E.VECINOS[0].name) + ': «Hoy he llegado a todos mis sitios sin ayuda.»</p><p><button type="button" class="btn" data-say="fin">Escuchar</button></p>';
    } else {
      $('h-fin').textContent = 'Se acabaron los 30 días';
      var lows = E.VECINOS.filter(function (v) { return E.iaFor(state, v.id) < 50; }).map(function (v) { return v.name; });
      $('fin-body').innerHTML = '<p>Índice de Autonomía: <strong>' + ia + '</strong> (objetivo 70).' + (lows.length ? ' Por debajo de 50: ' + esc(listNames(lows)) + '.' : '') + '</p><p>No pasa nada: prueba otra estrategia. Mira primero qué barreras bloquean a más vecinos.</p><p><button type="button" class="btn" data-say="fin">Escuchar</button></p>';
    }
    openDialog($('d-fin'));
    if (settings.voz) say('Rosa', $('h-fin').textContent + '. ' + $('fin-body').textContent.replace('Escuchar', ''));
  }

  function renderStats() {
    var ia = E.iaGlobal(state);
    $('s-dia').textContent = Math.min(state.day, 30) + ' de 30';
    $('s-ia').textContent = ia === null ? 'Sin datos' : ia;
    $('s-iabar').style.width = (ia || 0) + '%';
    $('s-pres').textContent = state.budget + ' créditos';
    $('s-part').textContent = E.participacion(state);
    $('s-mant').textContent = state.weekly + ' / semana';
    var pi = E.proximoIngreso(state);
    $('s-ingreso').textContent = state.day > 30 ? '—' : 'Día ' + Math.min(pi.day, 30) + ' (+' + pi.amount + ')';
    var bd = $('b-dia');
    bd.textContent = (state.won || state.lost) ? 'Ver resultado' : 'Pasar al día siguiente';
  }

  function renderAll() { renderStats(); renderMap(); renderDetail(); renderList(); renderVecinos(); }

  // ---------- Pestañas ----------
  function showTab(which, focus) {
    var m = which === 'mapa';
    $('tab-mapa').setAttribute('aria-selected', m); $('tab-lista').setAttribute('aria-selected', !m);
    $('tab-mapa').tabIndex = m ? 0 : -1; $('tab-lista').tabIndex = m ? -1 : 0;
    $('panel-mapa').hidden = !m; $('panel-lista').hidden = m;
    if (focus) (m ? $('tab-mapa') : $('tab-lista')).focus();
  }

  // ---------- Diálogos ----------
  function openDialog(d, returnTo) {
    d._returnTo = returnTo || document.activeElement;
    if (typeof d.showModal === 'function') { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } } else d.setAttribute('open', '');
    var f = d.querySelector('button, input'); if (f) f.focus();
  }
  function closeDialog(d) {
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  }
  document.querySelectorAll('dialog').forEach(function (d) {
    d.addEventListener('close', function () {
      var r = d._returnTo;
      if (!r || !r.focus || r.closest('dialog')) r = $('b-dia');
      if (!document.querySelector('dialog[open]')) r.focus();
    });
    d.addEventListener('click', function (ev) { if (ev.target.hasAttribute && ev.target.hasAttribute('data-close')) closeDialog(d); });
  });

  // ---------- Ajustes ----------
  function applySettings(s) {
    var root = document.documentElement;
    root.classList.remove('t125', 't150', 't200');
    if (s.tam && s.tam !== 't100') root.classList.add(s.tam);
    root.classList.toggle('hc', !!s.hc);
    root.classList.toggle('rm', !!s.rm);
    if (typeof renderMap === 'function' && state) renderMap();
  }
  function readSettings() { try { return JSON.parse(localStorage.getItem('am-ajustes') || '{}'); } catch (e) { return {}; } }
  function saveSettings(s) { try { localStorage.setItem('am-ajustes', JSON.stringify(s)); } catch (e) { } }
  var settings = readSettings();
  applySettings(settings);
  document.querySelectorAll('input[name=tam]').forEach(function (r) { r.checked = (settings.tam || 't100') === r.value; });
  if (settings.subs === undefined) settings.subs = true;
  if (settings.sfx === undefined) settings.sfx = true;
  $('o-hc').checked = !!settings.hc; $('o-rm').checked = !!settings.rm;
  $('o-voz').checked = !!settings.voz; $('o-subs').checked = !!settings.subs; $('o-sfx').checked = !!settings.sfx; $('o-lenta').checked = !!settings.lenta;
  $('d-ajustes').addEventListener('change', function () {
    var t = document.querySelector('input[name=tam]:checked');
    settings = { tam: t ? t.value : 't100', hc: $('o-hc').checked, rm: $('o-rm').checked, voz: $('o-voz').checked, subs: $('o-subs').checked, sfx: $('o-sfx').checked, lenta: $('o-lenta').checked, barrio: settings.barrio };
    applySettings(settings); saveSettings(settings); updateAnimButton();
  });

  // ---------- Eventos ----------
  $('mapa').addEventListener('click', function (ev) {
    var g = ev.target.closest && ev.target.closest('[data-key]');
    if (!g) return;
    var k = g.getAttribute('data-key').split(':');
    select(k[0], k[1], { focusMap: true });
  });
  $('mapa').addEventListener('keydown', function (ev) {
    var g = ev.target.closest && ev.target.closest('[data-key]');
    if (!g) return;
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].indexOf(ev.key) !== -1) { ev.preventDefault(); moveFocus(ev.key); }
    else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      var k = g.getAttribute('data-key').split(':');
      select(k[0], k[1], { focusMap: true });
      announce('Seleccionado: ' + labelFor(k[0], k[1]) + ' Las opciones para construir están en el panel de detalle.');
    }
  });
  $('mapa').addEventListener('focusin', function (ev) {
    var g = ev.target.closest && ev.target.closest('[data-key]');
    if (g) focusKey = g.getAttribute('data-key');
  });
  $('det-body').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-build]');
    if (!b) return;
    if (b.getAttribute('aria-disabled') === 'true') { announce(b.getAttribute('aria-describedby') ? $(b.getAttribute('aria-describedby')).textContent : 'No disponible.'); return; }
    doBuild(b.getAttribute('data-build'));
  });
  $('catalogo').addEventListener('change', function (ev) {
    filterInt = ev.target.value;
    renderCatalog(); renderMap(); renderList();
    var r = document.querySelector('input[name=int][value="' + filterInt + '"]'); if (r) r.focus();
    if (filterInt) {
      var it = E.INTERVENTIONS.find(function (i) { return i.id === filterInt; });
      var n = document.querySelectorAll('#lista-body [data-pick]').length;
      announce(it.name + ': sirve en ' + n + (n === 1 ? ' sitio' : ' sitios') + ', resaltados en el mapa y en la lista.');
    }
  });
  $('lista-body').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-pick]');
    if (!b) return;
    var k = b.getAttribute('data-pick').split(':');
    select(k[0], k[1], { focusDetail: true });
  });
  document.body.addEventListener('click', function (ev) {
    var pk = ev.target.closest && ev.target.closest('#avisos [data-pick]');
    if (pk) { var kk = pk.getAttribute('data-pick').split(':'); showTab('mapa', false); select(kk[0], kk[1], { focusMap: true }); announce('Seleccionado: ' + labelFor(kk[0], kk[1]) + ' Las opciones están en el panel de detalle.'); return; }
    var op = ev.target.closest && ev.target.closest('[data-open="creditos"]');
    if (op) { openCreditos(); return; }
    var t = ev.target.closest && ev.target.closest('[data-trip]');
    if (!t) return;
    var k = t.getAttribute('data-trip').split(':');
    showTrip(k[0], k[1]);
  });
  $('tab-mapa').addEventListener('click', function () { showTab('mapa', true); });
  $('tab-lista').addEventListener('click', function () { showTab('lista', true); });
  document.querySelector('[role=tablist]').addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); showTab($('tab-mapa').getAttribute('aria-selected') === 'true' ? 'lista' : 'mapa', true); }
  });
  $('b-dia').addEventListener('click', nextDay);
  $('b-avisar').addEventListener('click', function () {
    var r = E.avisar(state);
    if (!r.ok) { announce(r.why); return; }
    renderAll();
    announce(r.back.length ? 'Han vuelto a intentarlo: ' + listNames(r.back.map(function (x) { return vecino(x.vecino).name + ' (' + E.DESTS[x.dest].short + ')'; })) + '. Quedan ' + state.budget + ' créditos.' : 'Aviso enviado, pero nadie puede volver todavía: sus barreras siguen ahí. Quedan ' + state.budget + ' créditos.');
  });
  $('b-ayuda').addEventListener('click', function () { openDialog($('d-ayuda')); });
  $('b-ajustes').addEventListener('click', function () { openDialog($('d-ajustes')); });
  $('b-empezar').addEventListener('click', function () {
    var r = document.querySelector('input[name=barrio]:checked');
    var id = r ? r.value : E.SCENARIOS[0].id;
    closeDialog($('d-intro'));
    if (!state || id !== E.SC.id || state.day > 1 || state.built.length) startScenario(id);
    $('b-dia').focus();
  });
  $('b-intro-ajustes').addEventListener('click', function () { closeDialog($('d-intro')); openDialog($('d-ajustes'), $('b-dia')); });
  $('b-reiniciar').addEventListener('click', function () {
    closeDialog($('d-fin'));
    state = E.initialState(E.SC.id); sel = null; overlay = null; filterInt = '';
    $('h-det').textContent = 'Selecciona un lugar';
    $('det-body').innerHTML = '<p class="hint" style="margin:0">Pulsa un tramo o un destino del mapa, o muévete con las flechas y pulsa Intro.</p>';
    $('avisos').innerHTML = '<p class="hint" style="margin:0">Pulsa «Pasar al día siguiente» para que los vecinos salgan a la calle.</p>';
    renderCatalog(); renderAll(); updateSheet(); $('b-dia').focus();
    announce('Partida nueva en ' + E.SC.barrio + '. Día 1, ' + state.budget + ' créditos.');
  });


  // ---------- Barrios ----------
  function renderHeader() {
    var sc = E.SC;
    $('titulo').textContent = 'Accesible Madrid · ' + sc.name;
    $('subtitulo').textContent = 'Distrito ' + sc.distrito + ', barrio de ' + sc.barrio;
    document.title = 'Accesible Madrid · ' + sc.name;
  }
  function renderBarrios() {
    var h = '';
    E.SCENARIOS.forEach(function (sc) {
      var on = sc.id === E.SC.id;
      h += '<label class="opt barrio' + (on ? ' on' : '') + '"><input type="radio" name="barrio" value="' + sc.id + '"' + (on ? ' checked' : '') + '><span class="name"><strong>' + esc(sc.distrito) + ' · ' + esc(sc.barrio) + '</strong><br><span class="hint" style="margin:0">' + esc(sc.name) + '. ' + esc(sc.intro) + '</span></span></label>';
    });
    $('lista-barrios').innerHTML = h;
  }
  function openIntro(first) {
    $('h-intro').textContent = first ? 'Hola. Soy Rosa, de la Oficina de Accesibilidad.' : 'Elige barrio';
    $('intro-texto').hidden = !first;
    $('intro-aviso').hidden = first;
    $('b-empezar').textContent = first ? 'Empezar' : 'Jugar en este barrio';
    renderBarrios();
    openDialog($('d-intro'), $('b-dia'));
  }
  $('lista-barrios').addEventListener('change', function () {
    document.querySelectorAll('#lista-barrios .opt').forEach(function (l) { l.classList.toggle('on', l.querySelector('input').checked); });
  });
  function startScenario(id) {
    state = E.initialState(id); sel = null; overlay = null; filterInt = ''; focusKey = null;
    settings.barrio = id; saveSettings(settings);
    $('h-det').textContent = 'Selecciona un lugar';
    $('det-body').innerHTML = '<p class="hint" style="margin:0">Pulsa un tramo o un destino del mapa, o muévete con las flechas y pulsa Intro.</p>';
    $('avisos').innerHTML = '<p class="hint" style="margin:0">Pulsa «Pasar al día siguiente» para que los vecinos salgan a la calle.</p>';
    renderHeader(); renderCatalog(); renderAll(); updateSheet();
    announce('Barrio de ' + E.SC.barrio + ', distrito ' + E.SC.distrito + '. Día 1, ' + state.budget + ' créditos.');
  }
  $('b-barrio').addEventListener('click', function () { openIntro(false); });

  // ---------- Vecinos en movimiento ----------
  var animPaused = false;
  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function animOn() { return !animPaused && !settings.rm && !reduceQuery.matches; }
  function updateAnimButton() {
    var b = $('b-anim'), blocked = settings.rm || reduceQuery.matches;
    b.setAttribute('aria-pressed', animOn() ? 'true' : 'false');
    b.textContent = animOn() ? 'Pausar vecinos' : 'Mover vecinos';
    b.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    $('anim-hint').hidden = !blocked;
  }
  $('b-anim').addEventListener('click', function () {
    if (settings.rm || reduceQuery.matches) { announce('El movimiento está desactivado en Accesibilidad.'); return; }
    animPaused = !animPaused; updateAnimButton(); renderMap();
    announce(animPaused ? 'Vecinos en pausa.' : 'Los vecinos se mueven por sus rutas.');
  });
  function walkerPoints(v) {
    var rep = state.lastReport;
    if (!rep) return null;
    var trips = rep.trips.filter(function (t) { return t.vecino === v.id && t.result !== 'abandonado'; });
    if (!trips.length) return null;
    var order = { fallido: 0, dificultad: 1, ok: 2 };
    trips.sort(function (a, b) { return order[a.result] - order[b.result]; });
    var t = trips[0], pts, stuck = t.result === 'fallido';
    if (t.path) pts = pathPoints(v.home, t.path);
    else {
      var ideal = E.route(state, v.home, E.DESTS[t.dest].node, v.profile, true);
      if (!ideal) return null;
      var ids = [], stopAt = null;
      for (var i = 0; i < ideal.path.length; i++) {
        if (t.reason && t.reason.edge === ideal.path[i].id) { stopAt = ideal.path[i]; break; }
        ids.push(ideal.path[i].id);
      }
      pts = pathPoints(v.home, ids);
      if (stopAt) { var a = xy(stopAt.a), b = xy(stopAt.b), last = pts[pts.length - 1]; var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; pts.push([(last[0] * 0.3 + m[0] * 0.7), (last[1] * 0.3 + m[1] * 0.7)]); }
    }
    return { pts: pts, stuck: stuck };
  }
  function walkersSVG() {
    if (!animOn() || !state.lastReport) return '';
    var h = '<g aria-hidden="true">';
    E.VECINOS.forEach(function (v, i) {
      var w = walkerPoints(v);
      if (!w || w.pts.length < 2) return;
      var d = 'M' + w.pts.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L');
      var segs = w.pts.length - 1, move = segs * 1.1, dur = move + 1.6, f = (move / dur).toFixed(3);
      h += '<g class="walker' + (w.stuck ? ' stuck' : '') + '"><circle r="13"/><text y="5" text-anchor="middle">' + esc(v.name[0]) + '</text>';
      h += '<animateMotion dur="' + dur.toFixed(1) + 's" begin="' + (i * 0.25).toFixed(2) + 's" repeatCount="indefinite" path="' + d + '" keyPoints="0;1;1" keyTimes="0;' + f + ';1" calcMode="linear"/></g>';
    });
    return h + '</g>';
  }

  // ---------- Voz, subtítulos y sonidos ----------
  var synth = window.speechSynthesis || null, capTimer = null, voiceES = null;
  function pickVoice() {
    if (!synth) return;
    var vs = synth.getVoices() || [];
    voiceES = vs.find(function (v) { return /^es[-_]ES/i.test(v.lang); }) || vs.find(function (v) { return /^es/i.test(v.lang); }) || null;
  }
  if (synth) { pickVoice(); if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice); }
  function hideCaption() { $('subtitulos').hidden = true; }
  function say(who, text) {
    clearTimeout(capTimer);
    if (settings.subs) {
      $('sub-quien').textContent = who + ':';
      $('sub-texto').textContent = text;
      $('subtitulos').hidden = false;
    }
    var spoke = false;
    if (synth) {
      try {
        synth.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'es-ES'; if (voiceES) u.voice = voiceES;
        u.rate = settings.lenta ? 0.8 : 1;
        u.onend = function () { capTimer = setTimeout(hideCaption, 1500); };
        synth.speak(u); spoke = true;
      } catch (e) { spoke = false; }
    }
    if (!spoke) {
      if (!settings.subs) announce(who + ': ' + text);
      capTimer = setTimeout(hideCaption, Math.max(4000, text.length * 80));
    } else {
      capTimer = setTimeout(hideCaption, Math.max(6000, text.length * 110));
    }
  }
  $('sub-parar').addEventListener('click', function () { try { synth && synth.cancel(); } catch (e) {} hideCaption(); });
  var audioCtx = null, toastTimer = null;
  function sound(kind) {
    if (!settings.sfx) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      audioCtx = audioCtx || new C();
      var t0 = audioCtx.currentTime;
      var notes = kind === 'aviso' ? [660, 440] : kind === 'construir' ? [523, 659, 784] : [523, 659, 784, 1047];
      notes.forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.14);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.14 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.14 + 0.3);
        o.connect(g); g.connect(audioCtx.destination); o.start(t0 + i * 0.14); o.stop(t0 + i * 0.14 + 0.32);
      });
    } catch (e) {}
    clearTimeout(toastTimer);
    $('toast').textContent = kind === 'aviso' ? 'Sonido: aviso de problemas' : kind === 'construir' ? 'Sonido: obra terminada' : 'Sonido: ¡conseguido!';
    $('toast').hidden = false;
    toastTimer = setTimeout(function () { $('toast').hidden = true; }, 2200);
  }

  function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  var INTRO_PERFIL = { andador: 'camino con andador', silla: 'voy en silla de ruedas', ciego: 'tengo discapacidad visual y me oriento con bastón', sorda: 'soy una persona sorda y hablo en lengua de signos', intelect: 'tengo discapacidad intelectual', carrito: 'llevo a mis gemelos en un carrito doble' };
  // «al centro de salud», «a la Junta Municipal de Centro»...
  function aDest(name) {
    var propio = /Junta|Madrid|San Isidro|Olavide/.test(name);
    var n = propio ? name : lower(name);
    return (/^(Centro|Mercado|Parque|Polideportivo|Matadero)/.test(name) ? 'al ' : 'a la ') + n.replace(/^(el|la) /i, '');
  }
  function tripQuote(t) {
    var dest = E.DESTS[t.dest].name, r = t.reason;
    if (t.result === 'ok') return 'Hoy he llegado ' + aDest(dest) + ' sin ayuda.';
    if (t.result === 'abandonado') return 'Ya no intento ir ' + aDest(dest) + '. Siempre me encuentro el mismo problema.';
    var where = r && r.edge ? lower(barrierName(r.barrier)) + ' en ' + E.edgeName(state.edges[r.edge]) : r && r.dest ? lower(barrierName(r.barrier)) + ' en ' + dest : 'tuve que dar un rodeo enorme';
    if (t.result === 'dificultad') return 'He llegado ' + aDest(dest) + ', pero me ha costado mucho: ' + where + '.';
    return 'No he podido llegar ' + aDest(dest) + ': ' + where + '. Me he vuelto a casa.';
  }
  function vecinoTexto(v) {
    var t = 'Soy ' + v.name + ', tengo ' + v.age + ' años y ' + INTRO_PERFIL[v.profile] + '. ';
    var rep = state.lastReport;
    if (!rep) return t + 'Todavía no he salido de casa hoy. Pasa al día siguiente y te cuento cómo me va.';
    rep.trips.filter(function (x) { return x.vecino === v.id; }).forEach(function (x) { t += tripQuote(x) + ' '; });
    return t;
  }
  function resumenTexto() {
    var rep = state.lastReport;
    if (!rep) return 'Todavía no ha pasado ningún día.';
    var c = { ok: 0, dificultad: 0, fallido: 0, abandonado: 0 };
    rep.trips.forEach(function (t) { c[t.result]++; });
    var txt = 'Día ' + rep.day + '. ' + c.ok + ' viajes sin problema, ' + c.dificultad + ' con dificultad y ' + c.fallido + ' fallidos. El Índice de Autonomía es ' + rep.ia + '. ';
    var lows = E.VECINOS.filter(function (v) { var ia = E.iaFor(state, v.id); return ia !== null && ia < 50; }).map(function (v) { return v.name; });
    if (lows.length) txt += 'Necesitan ayuda urgente: ' + listNames(lows) + '. ';
    rep.events.filter(function (e) { return e.kind === 'nuevo'; }).forEach(function (e) { txt += 'Imprevisto: ' + lower(e.texto) + ' en ' + E.edgeName(state.edges[e.edge]) + '. '; });
    rep.money.forEach(function (m) { txt += 'Has recibido ' + m.amount + ' créditos: ' + lower(m.label) + '. '; });
    return txt;
  }
  function lugarTexto() {
    if (!sel) return 'No hay ningún lugar seleccionado.';
    var bs = barriersOf(sel.type, sel.id), txt = placeName(sel.type, sel.id) + '. ';
    if (!bs.length) return txt + 'Sin barreras. Todo el mundo puede pasar.';
    bs.forEach(function (b) {
      var ef = effect(b, sel.type === 'edge' ? state.edges[sel.id] : null);
      txt += barrierName(b) + '. ';
      if (ef.blocks.length) txt += 'Bloquea a ' + listNames(ef.blocks) + '. ';
      if (ef.hinders.length) txt += 'Dificulta a ' + listNames(ef.hinders) + '. ';
    });
    return txt;
  }
  document.body.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-say]');
    if (!b) return;
    var k = b.getAttribute('data-say').split(':');
    if (k[0] === 'trip') { var t = state.lastReport && state.lastReport.trips.find(function (x) { return x.vecino === k[1] && x.dest === k[2]; }); if (t) say(vecino(k[1]).name, tripQuote(t)); }
    else if (k[0] === 'vecino') say(vecino(k[1]).name, vecinoTexto(vecino(k[1])));
    else if (k[0] === 'resumen') say('Rosa', resumenTexto());
    else if (k[0] === 'lugar') say('Rosa', lugarTexto());
    else if (k[0] === 'rosa') say('Rosa', 'Hola. Soy Rosa, de la Oficina de Accesibilidad del Ayuntamiento de Madrid. Tú eres concejal de Accesibilidad. Elige un barrio. Cada día, los vecinos intentan ir a sus sitios. Si algo les para, te avisan. Tú quitas las barreras con tu presupuesto. Tu objetivo: en 30 días, un Índice de Autonomía de 70 o más, y ningún vecino por debajo de 50.');
    else if (k[0] === 'imp') {
      var ed = state.edges[k[1]], efx = effect(k[2], ed), inter = E.INTERVENTIONS.find(function (i) { return i.removes === k[2]; });
      say('Rosa', barrierName(k[2]) + ' en ' + E.edgeName(ed) + '. ' + (efx.blocks.length ? 'Bloquea a ' + listNames(efx.blocks) + '. ' : '') + 'Puedes ' + lower(inter.name) + '. Cuesta ' + inter.cost + ' créditos, pero la multa te devuelve ' + inter.fine + '.');
    }
    else if (k[0] === 'creditos') say('Rosa', $('creditos-texto').textContent);
    else if (k[0] === 'fin') say('Rosa', $('h-fin').textContent + '. ' + $('fin-body').textContent.replace('Escuchar', ''));
  });


  // ---------- Créditos ----------
  function renderCreditos() {
    var pi = E.proximoIngreso(state), b = $('b-fondos');
    $('cr-ingreso').textContent = 'Próximo ingreso: día ' + Math.min(pi.day, 30) + ', unos ' + pi.amount + ' créditos (sube con la Participación y baja con el mantenimiento).';
    if (state.fondosUsados) {
      var p = state.pending.find(function (x) { return /Fondos/.test(x.label); });
      b.setAttribute('aria-disabled', 'true');
      $('cr-fondos').textContent = p ? 'Fondos pedidos: llegarán el día ' + p.day + ' (+' + p.amount + ').' : 'Ya recibiste los fondos europeos en esta partida.';
    } else {
      b.setAttribute('aria-disabled', 'false');
      $('cr-fondos').textContent = 'Una vez por partida: ' + E.FONDOS.amount + ' créditos que llegan ' + E.FONDOS.delay + ' días después de pedirlos.';
    }
  }
  function openCreditos() { renderCreditos(); openDialog($('d-creditos')); }
  $('b-creditos').addEventListener('click', openCreditos);
  $('b-fondos').addEventListener('click', function () {
    var r = E.pedirFondos(state);
    if (!r.ok) { announce(r.why); return; }
    renderCreditos(); renderStats();
    var msg = 'Fondos europeos solicitados. Llegarán el día ' + r.day + ': ' + r.amount + ' créditos.';
    announce(msg); sound('construir');
    if (settings.voz) say('Rosa', msg);
  });
  // ---------- Zoom del mapa y panel inferior en móvil ----------
  var ZOOMS = ['fit', 1, 1.3, 1.6], zi = 0;
  var narrow = window.matchMedia ? window.matchMedia('(max-width: 760px)') : { matches: false, addEventListener: function () {} };
  function applyZoom() {
    var z = ZOOMS[zi], svg = $('mapa');
    svg.style.width = z === 'fit' ? '100%' : (800 * z) + 'px';
    svg.style.maxWidth = z === 'fit' ? '100%' : 'none';
    $('z-valor').textContent = z === 'fit' ? 'Ajustado a la pantalla' : 'Tamaño ' + Math.round(z * 100) + ' %';
    $('z-menos').setAttribute('aria-disabled', zi === 0 ? 'true' : 'false');
    $('z-mas').setAttribute('aria-disabled', zi === ZOOMS.length - 1 ? 'true' : 'false');
    $('z-hint').hidden = z === 'fit';
  }
  $('z-mas').addEventListener('click', function () { if (zi < ZOOMS.length - 1) { zi++; applyZoom(); } });
  $('z-menos').addEventListener('click', function () { if (zi > 0) { zi--; applyZoom(); } });
  zi = narrow.matches ? 1 : 0;
  applyZoom();
  function updateSheet() {
    var on = narrow.matches && !!sel;
    $('detalle').classList.toggle('sheet', on);
    document.body.classList.toggle('has-sheet', on);
  }
  if (narrow.addEventListener) narrow.addEventListener('change', updateSheet);
  $('det-cerrar').addEventListener('click', function () {
    var back = sel ? itemKey(sel.type, sel.id) : null;
    sel = null; overlay = null;
    $('h-det').textContent = 'Selecciona un lugar';
    $('det-body').innerHTML = '<p class="hint" style="margin:0">Pulsa un tramo o un destino del mapa, o muévete con las flechas y pulsa Intro.</p>';
    renderMap(); renderList(); updateSheet();
    if (back) focusItem(back);
  });

  state = E.initialState(settings.barrio || E.SCENARIOS[0].id);
  renderHeader();
  renderCatalog();
  renderAll();
  updateAnimButton();
  openIntro(true);
})();
