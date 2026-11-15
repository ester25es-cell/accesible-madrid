(function () {
  'use strict';
  var E = {
    COLS: COLS, ROWS: ROWS, BARRIERS: BARRIERS, INTERVENTIONS: INTERVENTIONS, PROFILES: PROFILES,
    DESTS: DESTS, VECINOS: VECINOS, initialState: initialState, edgeName: edgeName, route: route,
    tryTrip: tryTrip, iaFor: iaFor, iaGlobal: iaGlobal, participacion: participacion,
    simulateDay: simulateDay, canBuild: canBuild, build: build, avisar: avisar
  };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var state, sel = null, filterInt = '', overlay = null, focusKey = null;

  var DEST_OFF = { junta: [12, 14], emt: [12, 14], salud: [-84, 14], mercado: [12, -48], cultural: [12, -48] };
  var HOME_OFF = { julian: [-28, -28], lucia: [28, -28], andres: [-28, 28], marta: [28, 28], sara: [-28, -28], nadia: [28, -28] };
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
      var n = xy(E.DESTS[id].node), o = DEST_OFF[id];
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
      var n = xy(E.DESTS[id].node), o = DEST_OFF[id], x = n[0] + o[0], y = n[1] + o[1], k = itemKey('dest', id);
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
      var n = xy(v.home), o = HOME_OFF[v.id];
      h += '<g class="home"><circle cx="' + (n[0] + o[0]) + '" cy="' + (n[1] + o[1]) + '" r="14"/><text x="' + (n[0] + o[0]) + '" y="' + (n[1] + o[1] + 5) + '" text-anchor="middle">' + v.name[0] + '</text></g>';
    });
    h += '</g>';
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
        h += '<li><strong>' + esc(barrierName(b)) + '</strong>' + (parts.length ? ': ' + esc(parts.join('; ')) : ': no afecta a los vecinos de este escenario') + '.</li>';
      });
      h += '</ul>';
      var fixes = bs.map(function (b) { return E.BARRIERS[b].fix; }).filter(function (f, i, a) { return f && a.indexOf(f) === i; });
      if (fixes.length) h += '<p style="margin:0 0 6px;font-weight:700">Construir aquí</p>';
      fixes.forEach(function (f) {
        var it = E.INTERVENTIONS.find(function (i) { return i.id === f; });
        var ok = state.budget >= it.cost && !state.won && !state.lost;
        var why = state.won || state.lost ? 'La partida ha terminado.' : 'Faltan ' + (it.cost - state.budget) + ' créditos.';
        h += '<div class="fix"><button type="button" class="btn ' + (ok ? 'primary' : '') + '" data-build="' + f + '"' + (ok ? '' : ' aria-disabled="true" aria-describedby="why-' + f + '"') + '>' + esc(it.name) + ' · ' + it.cost + (it.weekly ? ' + ' + it.weekly + '/semana' : '') + '</button>' + (ok ? '' : '<div class="hint" id="why-' + f + '">' + esc(why) + '</div>') + '</div>';
      });
      if (bs.indexOf('pendiente') !== -1) h += '<p class="hint">La cuesta no se puede quitar. Mejorar los tramos de alrededor da rutas alternativas.</p>';
    }
    body.innerHTML = h;
  }

  function doBuild(f) {
    if (!sel) return;
    var res = E.build(state, f, sel.id);
    if (!res.ok) { announce(res.why); return; }
    var msg = res.it.name + ' construido en ' + placeName(sel.type, sel.id) + '. Quedan ' + state.budget + ' créditos.';
    renderAll();
    $('detalle').focus();
    announce(msg);
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
    E.INTERVENTIONS.forEach(function (it) {
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
      h += '<tr><th scope="row" style="font-weight:400"><strong>' + esc(v.name) + '</strong>, ' + v.age + '<br><span class="hint" style="margin:0">' + esc(E.PROFILES[v.profile].label) + '</span></th>';
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
    if (rep.income !== undefined) h += '<div class="aviso"><span class="tag">Fin de semana</span><p>Ingresos: +' + rep.income + '. Mantenimiento: −' + rep.upkeep + '.</p></div>';
    rep.trips.forEach(function (t) {
      if (t.result === 'ok' || t.result === 'abandonado') return;
      var v = vecino(t.vecino), f = t.result === 'fallido', r = t.reason, where = '';
      if (r && r.edge) where = barrierName(r.barrier) + ' en ' + E.edgeName(state.edges[r.edge]) + '.';
      else if (r && r.dest) where = barrierName(r.barrier) + ' en ' + E.DESTS[r.dest].name + '.';
      else where = 'Tuvo que dar un gran rodeo.';
      h += '<div class="aviso' + (f ? ' f' : '') + '"><span class="tag">' + (f ? 'Viaje fallido' : 'Con dificultad') + ' · ' + esc(v.name) + '</span>';
      h += '<p>Hacia ' + esc(E.DESTS[t.dest].name) + '. ' + esc(where) + (t.abandonsNow ? ' <strong>Ha dejado de intentarlo.</strong>' : '') + '</p>';
      h += '<button type="button" class="btn" data-trip="' + t.vecino + ':' + t.dest + '">Ver en el mapa</button></div>';
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
    if (state.won || state.lost) endGame();
  }

  function endGame() {
    var ia = E.iaGlobal(state);
    if (state.won) {
      $('h-fin').textContent = 'Escenario superado el día ' + (state.day - 1);
      $('fin-body').innerHTML = '<p>Índice de Autonomía: <strong>' + ia + '</strong>. Ningún vecino está por debajo de 50.</p><p>Has hecho ' + state.built.length + ' mejoras y te quedan ' + state.budget + ' créditos.</p><p>Julián: «Ya voy solo al médico.»</p>';
    } else {
      $('h-fin').textContent = 'Se acabaron los 30 días';
      var lows = E.VECINOS.filter(function (v) { return E.iaFor(state, v.id) < 50; }).map(function (v) { return v.name; });
      $('fin-body').innerHTML = '<p>Índice de Autonomía: <strong>' + ia + '</strong> (objetivo 70).' + (lows.length ? ' Por debajo de 50: ' + esc(listNames(lows)) + '.' : '') + '</p><p>No pasa nada: prueba otra estrategia. Mira primero qué barreras bloquean a más vecinos.</p>';
    }
    openDialog($('d-fin'));
  }

  function renderStats() {
    var ia = E.iaGlobal(state);
    $('s-dia').textContent = Math.min(state.day, 30) + ' de 30';
    $('s-ia').textContent = ia === null ? 'Sin datos' : ia;
    $('s-iabar').style.width = (ia || 0) + '%';
    $('s-pres').textContent = state.budget + ' créditos';
    $('s-part').textContent = E.participacion(state);
    $('s-mant').textContent = state.weekly + ' / semana';
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
  }
  function readSettings() { try { return JSON.parse(localStorage.getItem('am-ajustes') || '{}'); } catch (e) { return {}; } }
  function saveSettings(s) { try { localStorage.setItem('am-ajustes', JSON.stringify(s)); } catch (e) { } }
  var settings = readSettings();
  applySettings(settings);
  document.querySelectorAll('input[name=tam]').forEach(function (r) { r.checked = (settings.tam || 't100') === r.value; });
  $('o-hc').checked = !!settings.hc; $('o-rm').checked = !!settings.rm;
  $('d-ajustes').addEventListener('change', function () {
    var t = document.querySelector('input[name=tam]:checked');
    settings = { tam: t ? t.value : 't100', hc: $('o-hc').checked, rm: $('o-rm').checked };
    applySettings(settings); saveSettings(settings);
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
  $('b-empezar').addEventListener('click', function () { closeDialog($('d-intro')); $('b-dia').focus(); });
  $('b-intro-ajustes').addEventListener('click', function () { closeDialog($('d-intro')); openDialog($('d-ajustes'), $('b-dia')); });
  $('b-reiniciar').addEventListener('click', function () {
    closeDialog($('d-fin'));
    state = E.initialState(); sel = null; overlay = null; filterInt = '';
    $('h-det').textContent = 'Selecciona un lugar';
    $('det-body').innerHTML = '<p class="hint" style="margin:0">Pulsa un tramo o un destino del mapa, o muévete con las flechas y pulsa Intro.</p>';
    $('avisos').innerHTML = '<p class="hint" style="margin:0">Pulsa «Pasar al día siguiente» para que los vecinos salgan a la calle.</p>';
    renderCatalog(); renderAll(); updateSheet(); $('b-dia').focus();
    announce('Partida nueva. Día 1, 250 créditos.');
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

  state = E.initialState();
  renderCatalog();
  renderAll();
  openDialog($('d-intro'), $('b-dia'));
})();
