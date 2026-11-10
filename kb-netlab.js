/* =====================================================================
 *  KB NetLab — 教師端「網絡實驗室」:真實回覆網絡(誰回應了誰),每個圓圈和每條線都能回到原始貼文
 *  計算在 kb-netlab-core.js(去重、橋接度、接近度)。這個畫面只在老師的瀏覽器裡計算,不送出任何資料。
 *  用法:KBNetLab.render(root, { nodes, topics, userList })
 *  需要先載入: kb-netlab-core.js(kb-asra-core.js 有的話會顯示貼文類型色塊)
 * ===================================================================== */
(function (global) {
  'use strict';
  var W = 760, H = 500;
  var UI = { topic: 'all', dayIdx: null, minW: 1, metric: 'between', ex: 'none', sel: null, sort: 'between', dir: -1, limit: 8, ctx: null, root: null, timer: null, layoutKey: '', pos: null, logKey: '', logRows: null, ai: null };
  var SPEEDS = [0.5, 1, 2, 4];
  function clampPos(p) { p.x = Math.max(24, Math.min(W - 24, p.x)); p.y = Math.max(24, Math.min(H - 34, p.y)); }
  function clonePos(o) { var c = {}; Object.keys(o || {}).forEach(function (k) { c[k] = { x: o[k].x, y: o[k].y }; }); return c; }
  function radii(D) {
    var maxv = 0; D.g.nodes.forEach(function (u) { maxv = Math.max(maxv, metricVal(D, u)); });
    var r = {}; D.g.nodes.forEach(function (u) { r[u] = 11 + (maxv > 0 ? 13 * metricVal(D, u) / maxv : 0); }); return r;
  }
  // 圓球不要疊在一起:太近的兩顆互相推開
  function separate(D, pinned, rounds) {
    var ids = D.g.nodes.filter(function (u) { return D.pos[u]; }), r = radii(D), i, j, it;
    for (it = 0; it < (rounds || 2); it++) for (i = 0; i < ids.length; i++) for (j = i + 1; j < ids.length; j++) {
      var a = ids[i], b = ids[j], pa = D.pos[a], pb = D.pos[b], dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, min = r[a] + r[b] + 8;
      if (d >= min) continue;
      var push = (min - d) / 2, ux = dx / d, uy = dy / d;
      if (a === pinned) { pb.x += ux * push * 2; pb.y += uy * push * 2; }
      else if (b === pinned) { pa.x -= ux * push * 2; pa.y -= uy * push * 2; }
      else { pa.x -= ux * push; pa.y -= uy * push; pb.x += ux * push; pb.y += uy * push; }
      clampPos(pa); clampPos(pb);
    }
  }
  function neighborsOf(D, id) { var s = {}; D.g.edges.forEach(function (e) { if (e.a === id) s[e.b] = 1; else if (e.b === id) s[e.a] = 1; }); return s; }
  function paintGraph() {
    var box = UI.root && UI.root.querySelector('#nl-graph > div'); if (!box || !UI.D) return;
    var sc = box.parentNode.scrollLeft; box.innerHTML = graphSVG(UI.D); box.parentNode.scrollLeft = sc;
  }
  // 讓圓球「慢慢移到」目標位置(散開、還原都用它)
  var anim = null;
  function glideTo(targets, pinned, frames, done) {
    if (anim) cancelAnimationFrame(anim); var n = 0;
    (function tick() {
      anim = null; if (!UI.D || !UI.root || !UI.root.isConnected) return;
      Object.keys(targets).forEach(function (u) { var p = UI.D.pos[u]; if (!p || u === pinned) return; p.x += (targets[u].x - p.x) * 0.16; p.y += (targets[u].y - p.y) * 0.16; });
      separate(UI.D, pinned, 1); paintGraph();
      if (++n < frames) anim = requestAnimationFrame(tick); else if (done) done();
    })();
  }
  // 拖動圓球:
  //  浮動 = 其他圓球像被橡皮筋拉過來(有連線的拉得多、其他的拉得少),放開後再散開到各自相對的位置;
  //  固定 = 只有被拖的圓球動。圓球永遠不會疊在一起。「還原位置」可以回到最初的排列。
  var DRAG = null;
  function onDown(ev) {
    var g = ev.target.closest ? ev.target.closest('#nl-svg g[data-act="node"]') : null; if (!g || !UI.root.contains(g) || (ev.button != null && ev.button !== 0)) return;
    var id = g.getAttribute('data-id'), p = UI.D && UI.D.pos[id]; if (!p) return;
    if (anim) { cancelAnimationFrame(anim); anim = null; }
    DRAG = { id: id, x: ev.clientX, y: ev.clientY, moved: false, start: { x: p.x, y: p.y }, home: clonePos(UI.D.pos), nb: neighborsOf(UI.D, id), shift: { x: 0, y: 0 } };
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
  }
  function onMove(ev) {
    if (!DRAG || !UI.D) return;
    if (!DRAG.moved && Math.abs(ev.clientX - DRAG.x) + Math.abs(ev.clientY - DRAG.y) < 5) return;
    DRAG.moved = true; ev.preventDefault();
    var svg = UI.root.querySelector('#nl-svg'); if (!svg) return;
    var m = svg.getScreenCTM(); if (!m) return; var inv = m.inverse(), pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; var q = pt.matrixTransform(inv);
    var p = UI.D.pos[DRAG.id]; if (!p) return; p.x = q.x; p.y = q.y; clampPos(p);
    DRAG.shift = { x: p.x - DRAG.start.x, y: p.y - DRAG.start.y };
    if ((global.kbMove ? global.kbMove.get() : 'float') === 'float') {
      Object.keys(DRAG.home).forEach(function (u) {
        if (u === DRAG.id || !UI.D.pos[u]) return;
        var w = DRAG.nb[u] ? 0.5 : 0.18, t = { x: DRAG.home[u].x + DRAG.shift.x * w, y: DRAG.home[u].y + DRAG.shift.y * w }, c = UI.D.pos[u];
        c.x += (t.x - c.x) * 0.4; c.y += (t.y - c.y) * 0.4; clampPos(c);
      });
    }
    separate(UI.D, DRAG.id, 2); paintGraph();
  }
  function onUp() {
    document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp);
    var d = DRAG; DRAG = null; if (!d || !d.moved) return;
    UI.suppressClick = true; setTimeout(function () { UI.suppressClick = false; }, 60);
    if ((global.kbMove ? global.kbMove.get() : 'float') === 'float') {
      // 放開後:被拉過來的圓球散開,回到各自「相對」的位置(有連線的稍微靠近被拖的那顆)
      var tg = {}; Object.keys(d.home).forEach(function (u) { if (u === d.id) return; var w = d.nb[u] ? 0.12 : 0.03; tg[u] = { x: d.home[u].x + d.shift.x * w, y: d.home[u].y + d.shift.y * w }; clampPos(tg[u]); });
      glideTo(tg, d.id, 60);
    }
  }
  function resetPos() {
    if (!UI.D || !UI.base) return;
    if (anim) cancelAnimationFrame(anim);
    glideTo(clonePos(UI.base), null, 50, function () { Object.keys(UI.base).forEach(function (u) { if (UI.pos[u]) { UI.pos[u].x = UI.base[u].x; UI.pos[u].y = UI.base[u].y; } }); paintGraph(); });
  }
  function getSpeed() { var v = 1; try { v = Number(global.localStorage.getItem('kb_net_speed')) || 1; } catch (e) {} return SPEEDS.indexOf(v) >= 0 ? v : 1; }
  var METRICS = {
    between: ['橋接度', '最短路徑經過這個人的比例。高 = 把不同同學接在一起的橋。'],
    degree: ['連結度', '互動過的夥伴數 ÷ (全班人數 − 1)。1 = 跟每個人都互動過。'],
    close: ['接近度', '到其他人有多近(1 ÷ 距離 的平均)。高 = 很快能接觸到全班。'],
    'in': ['被回應次數', '同學回應他的貼文的次數。'],
    out: ['回應別人次數', '他回應同學貼文的次數。']
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cut(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(ts) { if (!ts) return '日期不詳'; var d = new Date(ts); return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function link(n) { return 'Knowledge Building Forum.html?topic=' + encodeURIComponent(n.topicId) + '&node=' + encodeURIComponent(n.id); }

  /* ---------- 計算 ---------- */
  function students(ctx) {
    var ul = ctx.userList || {};
    return Object.keys(ul).map(function (k) { return ul[k]; }).filter(function (u) { return u && u.role !== 'teacher' && u.role !== 'master'; });
  }
  function compute() {
    var ctx = UI.ctx, nodes = ctx.nodes || [], topics = ctx.topics || [], stu = students(ctx), info = {}, ids = [], tname = {};
    stu.forEach(function (u) { info[u.id] = u; ids.push(u.id); });
    topics.forEach(function (t) { tname[t.id] = t.title || t.name || t.id; });
    if (UI.topic !== 'all' && !tname[UI.topic]) UI.topic = 'all';
    if (UI.ex !== 'none' && !info[UI.ex]) UI.ex = 'none';
    var days = KBNet.days(nodes, { topicId: UI.topic });
    if (UI.dayIdx != null && (UI.dayIdx < 0 || UI.dayIdx >= days.length)) UI.dayIdx = null;
    var until = UI.dayIdx != null ? days[UI.dayIdx].end : null;
    var ex = UI.ex !== 'none' ? [UI.ex] : [];
    var g = KBNet.buildReply(nodes, { topicId: UI.topic, until: until, exclude: ex, uids: ids, minWeight: UI.minW });
    var m = KBNet.metrics(g);
    // 版面位置:用「這個討論區、整段時間」的完整網絡算一次,回放時圓圈不會跳來跳去
    var gFull = KBNet.buildReply(nodes, { topicId: UI.topic, exclude: ex, uids: ids, minWeight: 1 });
    var key = UI.topic + '|' + ex.join(',') + '|' + gFull.nodes.join(',') + '|' + gFull.edges.length + '|' + gFull.replies;
    if (UI.layoutKey !== key || !UI.pos) { UI.pos = layout(gFull.nodes, KBNet.undirected(gFull)); UI.layoutKey = key; UI.base = clonePos(UI.pos); }
    var posts = {}; var cnt = 0;
    nodes.forEach(function (n) { if ((UI.topic === 'all' || n.topicId === UI.topic) && (!until || (n.date || 0) <= until)) { cnt++; posts[n.author] = (posts[n.author] || 0) + 1; } });
    return { ids: ids, info: info, tname: tname, topics: topics, days: days, until: until, ex: ex, g: g, m: m, pos: UI.pos, posts: posts, postCount: cnt };
  }

  /* ---------- 版面(力導向,固定亂數,每次結果一樣) ---------- */
  function layout(ids, pairs) {
    var n = ids.length, pos = {}; if (!n) return pos;
    var cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.34, x = [], y = [], idx = {};
    ids.forEach(function (u, i) { idx[u] = i; var a = -Math.PI / 2 + 2 * Math.PI * i / n; x[i] = cx + R * Math.cos(a); y[i] = cy + R * Math.sin(a); });
    var k = Math.sqrt((W - 140) * (H - 120) / Math.max(n, 1)) * 0.75;
    var es = pairs.map(function (p) { return [idx[p.a], idx[p.b], 1 + Math.log(1 + p.w)]; }).filter(function (e) { return e[0] !== undefined && e[1] !== undefined; });
    var T = W / 8, i, j, it;
    for (it = 0; it < 260; it++) {
      var dx = [], dy = []; for (i = 0; i < n; i++) { dx[i] = 0; dy[i] = 0; }
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        var ax = x[i] - x[j], ay = y[i] - y[j], d = Math.sqrt(ax * ax + ay * ay); if (d < 0.01) { ax = 0.01 * (i + 1); ay = 0.01 * (j + 1); d = 0.02; }
        var f = k * k / d; dx[i] += ax / d * f; dy[i] += ay / d * f; dx[j] -= ax / d * f; dy[j] -= ay / d * f;
      }
      es.forEach(function (e) { var ax = x[e[0]] - x[e[1]], ay = y[e[0]] - y[e[1]], d = Math.sqrt(ax * ax + ay * ay) || 0.01, f = d * d / k * e[2] * 0.5; dx[e[0]] -= ax / d * f; dy[e[0]] -= ay / d * f; dx[e[1]] += ax / d * f; dy[e[1]] += ay / d * f; });
      for (i = 0; i < n; i++) {
        dx[i] += (cx - x[i]) * 0.06; dy[i] += (cy - y[i]) * 0.06;
        var disp = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01, lim = Math.min(disp, T);
        x[i] += dx[i] / disp * lim; y[i] += dy[i] / disp * lim;
      }
      T *= 0.985;
    }
    var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (i = 0; i < n; i++) { minx = Math.min(minx, x[i]); maxx = Math.max(maxx, x[i]); miny = Math.min(miny, y[i]); maxy = Math.max(maxy, y[i]); }
    // 左右、上下各自拉開到畫面可用範圍(圖通常比較寬,不要只用中間一小塊)
    var sx = (maxx - minx) > 1 ? Math.min((W - 120) / (maxx - minx), 3) : 1, sy = (maxy - miny) > 1 ? Math.min((H - 110) / (maxy - miny), 3) : 1;
    if (n < 4) { sx = sy = Math.min(sx, sy); }
    var ox = W / 2 - (minx + maxx) / 2 * sx, oy = H / 2 - (miny + maxy) / 2 * sy - 6;
    ids.forEach(function (u, i2) { pos[u] = { x: x[i2] * sx + ox, y: y[i2] * sy + oy }; });
    return pos;
  }

  /* ---------- 小元件 ---------- */
  function nm(D, id) { var u = D.info[id]; return u ? u.name || id : id; }
  function tile(n, label, sub) { return '<div class="rounded-xl border border-slate-200 bg-white p-3"><div class="text-2xl font-black text-slate-800">' + n + '</div><div class="text-xs font-bold text-slate-600">' + label + '</div><div class="text-[11px] text-slate-400 mt-0.5 leading-snug">' + sub + '</div></div>'; }
  function typePill(n) {
    var A = global.ASRA; if (!A || !A.TNAME[n.type]) return '';
    return '<span class="inline-block text-[11px] font-black px-2 py-0.5 rounded-full text-white" style="background:' + A.TCOLOR[n.type] + '">' + A.TNAME[n.type] + '</span>';
  }
  function metricVal(D, u) { var p = D.m.per[u]; if (!p) return 0; return UI.metric === 'in' ? p['in'] : UI.metric === 'out' ? p.out : p[UI.metric]; }


  /* ---------- 歷程記錄 + 白話解說 ---------- */
  function dayRows(D) {
    var ctx = UI.ctx, ex = D.ex, key = [UI.topic, ex.join(','), UI.minW, (ctx.nodes || []).length, D.days.length].join('|');
    if (UI.logKey === key && UI.logRows) return UI.logRows;
    var rows = [], prev = null;
    D.days.forEach(function (d, i) {
      var g = KBNet.buildReply(ctx.nodes || [], { topicId: UI.topic, until: d.end, exclude: ex, uids: D.ids, minWeight: UI.minW }), m = KBNet.metrics(g);
      var seen = {}; if (prev) prev.g.edges.forEach(function (e) { seen[e.a + '>' + e.b] = 1; });
      var fresh = g.edges.filter(function (e) { return !seen[e.a + '>' + e.b]; });
      var best = null; Object.keys(m.per).forEach(function (u) { if (!best || m.per[u].between > m.per[best].between) best = u; });
      rows.push({ i: i, label: d.label, replies: m.replies, newReplies: m.replies - (prev ? prev.replies : 0), fresh: fresh, edges: g.edges.length, density: m.density, pairs: m.pairs, comps: m.components, bridge: best && m.per[best].between > 0 ? best : null });
      prev = { g: g, replies: m.replies };
    });
    UI.logKey = key; UI.logRows = rows; return rows;
  }
  function rowText(D, r) {
    var fr = r.fresh.slice(0, 3).map(function (e) { return nm(D, e.a) + ' → ' + nm(D, e.b); }).join('、');
    return r.label + ':新增 ' + r.newReplies + ' 次回應' + (r.fresh.length ? ',長出 ' + r.fresh.length + ' 條新的連線(' + fr + (r.fresh.length > 3 ? ' 等' : '') + ')' : (r.newReplies ? ',都是在已經有連線的人之間再回應' : ',沒有新的回覆關係')) +
      ';累計互動密度 ' + pct(r.density) + (r.bridge ? ',目前最像橋的是 ' + nm(D, r.bridge) : '') + '。';
  }
  function storyHtml(D) {
    var m = D.m, n = m.n, q = function (u) { return '<b>' + esc(nm(D, u)) + '</b>'; }, scope = (UI.ctx.scope || '');
    if (!n) return '<p>' + (scope ? esc(scope) + ' ' : '') + '這個範圍還沒有學生。先到設定中心把學生加進班級,有人在論壇發言後,這裡就會長出「誰回應了誰」。</p>';
    if (!D.postCount) return '<p>🌱 ' + (scope ? esc(scope) + ' ' : '') + '這個範圍的 ' + n + ' 位學生<b>還沒有人發言</b>,所以還沒有任何回覆關係。有人在論壇發言、回應同學後,圓圈之間就會長出線。</p>';
    var per = m.per, ids = D.g.nodes, top = ids.slice().sort(function (a, b) { return per[b].partners - per[a].partners; })[0], bridge = ids.slice().sort(function (a, b) { return per[b].between - per[a].between; })[0];
    var out = [];
    out.push('<p><b>🔑 一句話重點:</b> ' + (scope ? esc(scope) + ' ' : '') + n + ' 位同學共有 <b>' + m.replies + ' 次</b>回應,形成 <b>' + m.pairs + '</b> 組互動;互動密度 <b>' + pct(m.density) + '</b>,' +
      (m.density >= 0.5 ? '幾乎每兩個人之間都說過話。' : (m.density >= 0.25 ? '一半左右的同學之間有直接對話。' : '同學之間的直接對話還不多,多半是少數人在互動。')) + '</p>');
    out.push('<p><b>🧭 現在的樣子:</b> ' + (top && per[top].partners ? '夥伴最多的是 ' + q(top) + '(' + per[top].partners + ' 位);' : '') + (bridge && per[bridge].between > 0 ? q(bridge) + ' 的橋接度最高,像一座橋,把不同的同學接在一起;' : '') + '有來有往(雙方都回應過對方)的比例是 <b>' + (m.pairs ? pct(m.reciprocity) : '—') + '</b>。</p>');
    var iso = m.isolates || [];
    out.push('<p><b>🚧 要留意:</b> ' + (iso.length ? iso.slice(0, 4).map(q).join('、') + (iso.length > 4 ? ' 等 ' + iso.length + ' 位' : '') + ' 目前沒有回覆關係(可能還沒發言,或發言還沒被回應),不等於沒學習。' : '每位同學都至少跟一位同學有回覆關係。') + (m.components > 1 ? ' 全班分成 ' + m.components + ' 個互相連不到的小圈。' : '') + '</p>');
    out.push('<p><b>🌱 接下來可以怎麼做:</b> ' + (iso.length ? '請同學去回應 ' + q(iso[0]) + ' 的想法,或請 ' + q(iso[0]) + ' 去接別人的話;' : '') + '想知道某兩個人說了什麼,在<b>連線上點兩下</b>就能看到他們的回應內容。</p>');
    return out.join('');
  }
  function logHtml(D) {
    var rows = dayRows(D); if (!rows.length) return '';
    var cur = UI.dayIdx != null ? UI.dayIdx : rows.length - 1;
    return '<section class="rounded-xl bg-white border border-slate-200 p-3 mt-4" id="nl-log"><h3 class="font-black text-slate-800 mb-1">歷程說明 <span class="text-xs font-bold text-slate-400">看過的會留著,點一天就跳到那天</span></h3><ol class="space-y-1.5 max-h-[320px] overflow-y-auto pr-1" id="nl-log-list">' +
      rows.map(function (r) {
        var on = r.i <= cur, now = r.i === cur;
        return '<li><button type="button" data-act="jumpday" data-i="' + r.i + '" class="w-full text-left rounded-lg border px-3 py-1.5 text-[13px] leading-relaxed ' + (now ? 'border-teal-400 bg-teal-50 text-slate-800 font-bold' : (on ? 'border-slate-200 bg-white text-slate-700' : 'border-dashed border-slate-200 bg-slate-50 text-slate-400')) + '"' + (now ? ' aria-current="step"' : '') + '>' +
          (on ? esc(rowText(D, r)) : esc(r.label) + ':還沒播到這一天') + '</button></li>';
      }).join('') + '</ol></section>';
  }
  function aiTable() {
    var D = UI.D; if (!D) return '';
    var rows = dayRows(D), cur = UI.dayIdx != null ? UI.dayIdx : rows.length - 1;
    var t = '範圍:' + (UI.ctx.scope || '全部') + ';學生 ' + D.m.n + ' 位;每一天結束時累計的回覆網絡(從最初到' + (rows[cur] ? rows[cur].label : '最後') + ')\n' + rows.slice(0, cur + 1).map(function (r) { return rowText(D, r); }).join('\n') +
      '\n目前:回應 ' + D.m.replies + ' 次、互動組合 ' + D.m.pairs + '、互動密度 ' + pct(D.m.density) + '、有來有往 ' + (D.m.pairs ? pct(D.m.reciprocity) : '無') + '、互相連得起來的群 ' + D.m.components + ';沒有回覆關係的學生 ' + D.m.isolates.length + ' 位';
    return global.kbAiScrub ? global.kbAiScrub(t) : t;
  }
  function mountAI() {
    var slot = UI.root && UI.root.querySelector('#nl-ai-slot'); if (!slot || !global.kbAddExplain) return;
    if (!UI.ai) {
      var wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px';
      var ex = global.kbAddExplain(wrap, { title: '網絡實驗室:全班「誰回應了誰」的形成過程', label: '🤖 AI 解說歷程', table: aiTable }, 'netlab');
      UI.ai = ex ? { wrap: wrap, panel: ex.panel } : null;
    }
    if (UI.ai) { slot.appendChild(UI.ai.wrap); slot.appendChild(UI.ai.panel); }
  }

  /* ---------- 圖 ---------- */
  function graphSVG(D) {
    var g = D.g, m = D.m, pos = D.pos, ids = g.nodes, sel = UI.sel;
    var maxv = 0; ids.forEach(function (u) { maxv = Math.max(maxv, metricVal(D, u)); });
    var rad = {}; ids.forEach(function (u) { rad[u] = 11 + (maxv > 0 ? 13 * metricVal(D, u) / maxv : 0); });
    var maxw = 1; g.edges.forEach(function (e) { maxw = Math.max(maxw, e.w); });
    var focus = sel && sel.kind === 'node' ? sel.id : null;
    var out = '<svg id="nl-svg" viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-auto block" role="img" aria-label="全班回覆關係網絡圖:圓圈是學生,箭頭從回應的人指向被回應的人">' +
      '<defs><marker id="nl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L10 5L0 10z" fill="#64748b"/></marker>' +
      '<marker id="nl-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L10 5L0 10z" fill="#d97706"/></marker></defs>';
    var lines = '', hits = '';
    g.edges.forEach(function (e) {
      var p1 = pos[e.a], p2 = pos[e.b]; if (!p1 || !p2) return;
      var dx = p2.x - p1.x, dy = p2.y - p1.y, L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, off = Math.min(34, L * 0.18);
      var sx = p1.x + ux * rad[e.a], sy = p1.y + uy * rad[e.a], tx = p2.x - ux * (rad[e.b] + 6), ty = p2.y - uy * (rad[e.b] + 6);
      var cx = (p1.x + p2.x) / 2 + nx * off, cy = (p1.y + p2.y) / 2 + ny * off;
      var d = 'M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + tx.toFixed(1) + ' ' + ty.toFixed(1);
      var isSel = sel && sel.kind === 'edge' && sel.a === e.a && sel.b === e.b;
      var near = focus && (e.a === focus || e.b === focus);
      var ne = g.edges.length, base = ne <= 40 ? 0.55 : (ne <= 100 ? 0.36 : 0.22);   // 線很多時畫淡一點,才看得出疏密
      var op = isSel ? 1 : (focus ? (near ? 0.9 : 0.08) : base);
      lines += '<path d="' + d + '" fill="none" stroke="' + (isSel || near ? '#d97706' : '#64748b') + '" stroke-opacity="' + op + '" stroke-width="' + ((ne > 100 ? 0.8 : 1.2) + 3.6 * e.w / maxw).toFixed(1) + '" marker-end="url(#' + (isSel || near ? 'nl-arrow-sel' : 'nl-arrow') + ')"/>';
      hits += '<path d="' + d + '" fill="none" stroke="transparent" stroke-width="14" style="cursor:pointer" data-act="edge" data-a="' + esc(e.a) + '" data-b="' + esc(e.b) + '" tabindex="0" role="button" aria-label="' + esc(nm(D, e.a) + ' 回應 ' + nm(D, e.b) + ' ' + e.w + ' 次') + '"><title>' + esc(nm(D, e.a) + ' → ' + nm(D, e.b) + ':' + e.w + ' 次(點一下看原文、點兩下看回應內容)') + '</title></path>';
    });
    out += lines + hits;
    ids.forEach(function (u) {
      var p = pos[u]; if (!p) return;
      var per = m.per[u], iso = per.partners === 0, isSel = sel && sel.kind === 'node' && sel.id === u;
      var dim = focus && focus !== u && !g.edges.some(function (e) { return (e.a === focus && e.b === u) || (e.b === focus && e.a === u); });
      out += '<g data-act="node" data-id="' + esc(u) + '" tabindex="0" role="button" style="cursor:grab;touch-action:none" opacity="' + (dim ? 0.35 : 1) + '" aria-label="' + esc(nm(D, u)) + '">' +
        '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + rad[u].toFixed(1) + '" fill="' + (iso ? '#e2e8f0' : '#0f766e') + '" stroke="' + (isSel ? '#d97706' : (iso ? '#94a3b8' : '#fff')) + '" stroke-width="' + (isSel ? 4 : 2) + '"' + (iso ? ' stroke-dasharray="4 3"' : '') + '/>' +
        '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + rad[u] + 13).toFixed(1) + '" font-size="11" font-weight="700" text-anchor="middle" fill="#334155">' + esc(cut(nm(D, u), 6)) + '</text>' +
        '<title>' + esc(nm(D, u) + '|回應別人 ' + per.out + ' 次、被回應 ' + per['in'] + ' 次、夥伴 ' + per.partners + ' 位(點一下看原文、點兩下看說明)') + '</title></g>';
    });
    if (!ids.length) out += '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" fill="#94a3b8" font-size="14">這個範圍還沒有學生</text>';
    else if (!D.postCount) out += '<g><text x="' + W / 2 + '" y="' + (H / 2 - 6) + '" text-anchor="middle" font-size="46">🌱</text><text x="' + W / 2 + '" y="' + (H / 2 + 34) + '" text-anchor="middle" fill="#64748b" font-size="14" font-weight="700">還沒有人發言,有人回應同學後,這裡就會長出線</text></g>';
    else if (!g.edges.length) out += '<text x="' + W / 2 + '" y="28" text-anchor="middle" fill="#94a3b8" font-size="13">目前這個範圍還沒有任何「回應別人」的關係</text>';
    return out + '</svg>';
  }

  /* ---------- 右側:原始貼文 ---------- */
  function itemCard(D, it) {
    var r = it.reply, p = it.parent;
    return '<div class="rounded-lg border border-slate-200 bg-white p-2.5 mb-2" data-item="' + esc(r.id) + '">' +
      '<div class="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mb-1"><span>' + fmt(r.date) + '</span>' + typePill(r) + '<span>' + esc(D.tname[r.topicId] || '') + '</span></div>' +
      '<div class="text-xs text-slate-500"><b class="text-slate-800">' + esc(nm(D, r.author)) + '</b> 回應 <b class="text-slate-800">' + esc(nm(D, p.author)) + '</b></div>' +
      '<div class="text-sm text-slate-800 mt-1 border-l-4 border-teal-400 pl-2">' + esc(cut((r.title ? r.title + ' — ' : '') + (r.content || ''), 120)) + '</div>' +
      '<div class="text-xs text-slate-500 mt-1 border-l-4 border-slate-200 pl-2">原貼文(' + esc(nm(D, p.author)) + '):' + esc(cut((p.title ? p.title + ' — ' : '') + (p.content || ''), 90)) + '</div>' +
      '<button type="button" class="inline-block mt-1.5 text-xs font-bold text-indigo-600 hover:underline" data-pv="' + esc(r.id) + '" data-kbhref="' + esc(link(r)) + '">看原文 →</button></div>';
  }
  function list(D, items, empty) {
    if (!items.length) return '<p class="text-xs text-slate-400 py-2">' + empty + '</p>';
    var shown = items.slice(0, UI.limit);
    return shown.map(function (it) { return itemCard(D, it); }).join('') + (items.length > shown.length ? '<button type="button" data-act="more" class="w-full text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg py-1.5">再看 ' + Math.min(8, items.length - shown.length) + ' 則(共 ' + items.length + ' 則)</button>' : '');
  }
  function inspector(D) {
    var sel = UI.sel, g = D.g;
    if (sel && sel.kind === 'node') {
      if (g.nodes.indexOf(sel.id) < 0) { UI.sel = sel = null; }
    }
    if (sel && sel.kind === 'edge') {
      if (!g.edges.some(function (e) { return e.a === sel.a && e.b === sel.b; })) { UI.sel = sel = null; }
    }
    var head = '<div class="flex items-center justify-between mb-2"><h3 class="font-black text-slate-800">來源:原始貼文</h3><span class="text-[11px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">可追溯</span></div>';
    if (!sel) {
      var iso = D.m.isolates;
      return head + '<p class="text-sm text-slate-500 leading-relaxed">點一個<b>圓圈</b>(學生)看他回應了誰、誰回應了他;點一條<b>線</b>看這條關係是哪幾則貼文。<b>點兩下</b>會跳出說明視窗(線:誰回給誰、內容是什麼)。這裡列出的是原始貼文,不是分析結果。</p>' +
        (iso.length ? '<div class="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800"><b>目前' + (UI.minW > 1 ? '沒有達到門檻(回應至少 ' + UI.minW + ' 次)的關係' : '沒有任何回覆關係') + '的學生(' + iso.length + ' 位):</b><br>' + iso.map(function (u) { return '<a href="#" data-act="node" data-id="' + esc(u) + '" class="underline">' + esc(nm(D, u)) + '</a>'; }).join('、') + '<br><span class="text-amber-700">沒有關係不等於沒學習,可能是還沒發言、發言沒被回應、或被排除在這個範圍外。</span></div>' : '');
    }
    if (sel.kind === 'node') {
      var u = sel.id, per = D.m.per[u], det = KBNet.detailOf(g, u), info = D.info[u] || {};
      var mini = function (a, b) { return '<div class="rounded-lg bg-slate-50 border border-slate-200 p-2"><div class="text-[11px] text-slate-500">' + a + '</div><div class="text-sm font-black text-slate-800">' + b + '</div></div>'; };
      return head + '<div class="rounded-xl bg-teal-50 border border-teal-200 p-3 mb-3"><div class="font-black text-teal-900 text-lg">' + esc(nm(D, u)) + (info.className ? ' <span class="text-xs font-bold text-teal-700">' + esc(info.className) + '</span>' : '') + '</div>' +
        '<div class="text-xs text-teal-800">在這個範圍發了 ' + (D.posts[u] || 0) + ' 則貼文</div></div>' +
        '<div class="grid grid-cols-2 gap-2 mb-3">' + mini('回應別人', per.out + ' 次(' + per.outDeg + ' 位)') + mini('被回應', per['in'] + ' 次(' + per.inDeg + ' 位)') + mini('互動夥伴', per.partners + ' 位') + mini('連結度', f2(per.degree)) + mini('橋接度', f2(per.between)) + mini('接近度', f2(per.close)) + '</div>' +
        '<h4 class="text-sm font-black text-slate-700 mb-1">他回應了誰(' + det.sent.length + ')</h4>' + list(D, det.sent, '這個範圍裡他還沒回應過同學。') +
        '<h4 class="text-sm font-black text-slate-700 mt-3 mb-1">誰回應了他(' + det.got.length + ')</h4>' + list(D, det.got, '這個範圍裡還沒有同學回應他。');
    }
    var e = g.edges.filter(function (x) { return x.a === sel.a && x.b === sel.b; })[0];
    var rev = g.edges.filter(function (x) { return x.a === sel.b && x.b === sel.a; })[0];
    return head + '<div class="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-3"><div class="font-black text-amber-900"><span data-nm="' + esc(sel.a) + '">' + esc(nm(D, sel.a)) + '</span> → <span>' + esc(nm(D, sel.b)) + '</span></div><div class="text-xs text-amber-800">回應了 ' + e.w + ' 次</div>' +
      (rev ? '<div class="text-xs text-amber-800 mt-1">反方向(' + esc(nm(D, sel.b)) + ' → ' + esc(nm(D, sel.a)) + ')也有 ' + rev.w + ' 次 <a href="#" data-act="edge" data-a="' + esc(rev.a) + '" data-b="' + esc(rev.b) + '" class="underline font-bold">看反方向</a></div>' : '<div class="text-xs text-amber-700 mt-1">只有單方向,對方沒有回應回來。</div>') + '</div>' +
      list(D, e.posts.map(function (p) { return { reply: p.reply, parent: p.parent }; }).reverse(), '');
  }

  /* ---------- 表格 ---------- */
  function sortVal(D, u, key) { var p = D.m.per[u]; if (key === 'name') return nm(D, u); if (key === 'in') return p['in']; return p[key]; }
  function table(D) {
    var ids = D.g.nodes.slice(), key = UI.sort, dir = UI.dir;
    ids.sort(function (a, b) { var x = sortVal(D, a, key), y = sortVal(D, b, key); if (x < y) return -dir; if (x > y) return dir; return nm(D, a) < nm(D, b) ? -1 : 1; });
    var cols = [['name', '學生'], ['out', '回應別人'], ['in', '被回應'], ['partners', '夥伴'], ['degree', '連結度'], ['between', '橋接度'], ['close', '接近度']];
    var mx = {}; cols.forEach(function (c) { if (c[0] !== 'name') mx[c[0]] = Math.max.apply(null, ids.map(function (u) { return sortVal(D, u, c[0]); }).concat([0])); });
    var head = cols.map(function (c) { var on = key === c[0]; return '<th class="py-2 px-2 text-left"><button type="button" data-act="sort" data-key="' + c[0] + '" class="font-black ' + (on ? 'text-teal-700' : 'text-slate-500') + '">' + c[1] + (on ? (dir < 0 ? ' ▼' : ' ▲') : '') + '</button></th>'; }).join('') + '<th class="py-2 px-2 text-left text-slate-500 font-black">備註</th>';
    var rows = ids.map(function (u) {
      var p = D.m.per[u], notes = [];
      if (p.partners === 0) notes.push(UI.minW > 1 ? '沒有達門檻的關係' : '沒有回覆關係');
      else if (p['in'] === 0) notes.push('沒人回應他');
      else if (p.out === 0) notes.push('沒回應過同學');
      var cell = function (k, v, txt) { var share = mx[k] > 0 ? v / mx[k] : 0; return '<td class="py-1.5 px-2"><span class="inline-block rounded px-1.5" style="background:rgba(15,118,110,' + (0.04 + share * 0.28).toFixed(2) + ')">' + txt + '</span></td>'; };
      return '<tr class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" data-act="node" data-id="' + esc(u) + '"><td class="py-1.5 px-2 font-bold text-slate-800 whitespace-nowrap">' + esc(nm(D, u)) + '</td>' + cell('out', p.out, p.out) + cell('in', p['in'], p['in']) + cell('partners', p.partners, p.partners) + cell('degree', p.degree, f2(p.degree)) + cell('between', p.between, f2(p.between)) + cell('close', p.close, f2(p.close)) + '<td class="py-1.5 px-2 text-xs text-slate-500">' + notes.join('、') + '</td></tr>';
    }).join('');
    return '<div class="overflow-x-auto"><table class="w-full text-sm min-w-[540px]" id="nl-table"><thead><tr class="text-xs">' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- 說明 ---------- */
  function method(D) {
    var topicLabel = UI.topic === 'all' ? '全部討論區' : (D.tname[UI.topic] || UI.topic);
    var until = UI.dayIdx != null ? '到 ' + D.days[UI.dayIdx].label : '全部日期';
    var snap = '版本 ' + KBNet.VERSION + ' · ' + topicLabel + ' · ' + until + ' · 最少回應 ' + UI.minW + ' 次 · 排除:' + (D.ex.length ? nm(D, D.ex[0]) : '無') + ' · 貼文 ' + D.postCount + ' 則 · 回應關係 ' + D.m.replies + ' 次';
    return '<details class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><summary class="font-black text-slate-800 cursor-pointer">這些數字怎麼算?限制是什麼?</summary>' +
      '<div class="text-sm text-slate-600 leading-relaxed mt-3 space-y-2">' +
      '<p><b>連線怎麼來:</b>學生 A 的貼文是回應學生 B 的貼文(貼文的「回應對象」欄位),就有一條 A → B 的連線,權重 = 次數。自己回自己不算。這是真實的回覆紀錄,不是用詞彙推測的。</p>' +
      '<p><b>夥伴與連結度:</b>兩個人只要有任一方向的回應,就算一位夥伴。<u>互相回應只算一位夥伴、一對連線</u>,不會重複算。</p>' +
      '<p><b>橋接度與接近度:</b>把回覆關係當成「不分方向、不看次數」的圖,算最短路徑。橋接度用 Brandes 演算法;接近度用調和平均(不連通的人貢獻 0)。數字只在目前選到的範圍內算,換討論區或日期會改變。</p>' +
      '<p class="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-800"><b>請注意:</b>這是「誰回應了誰」,不是「想法好不好」。回應很多不等於貢獻大,橋接度低也不等於不重要。解讀時請回到原始貼文(點圓圈或線)。小班級的數字波動很大,不要過度解釋。</p>' +
      '<p><b>名稱:</b>這個畫面的做法參考 KBDeX 一類的社會網絡分析,但不是它的複製;目前只做「回覆網絡」,尚未做詞彙共現網絡。</p></div>' +
      '<p class="mt-3 text-[11px] text-slate-400 break-all" id="nl-snap">' + esc(snap) + '</p></details>';
  }

  /* ---------- 組合 ---------- */
  function draw() {
    if (!UI.root || !UI.ctx) return;
    var D = UI.D = compute(), m = D.m, days = D.days;
    var topicOpts = '<option value="all">全部討論區</option>' + D.topics.map(function (t) { return '<option value="' + esc(t.id) + '"' + (UI.topic === t.id ? ' selected' : '') + '>' + esc(t.title || t.name || t.id) + '</option>'; }).join('');
    var metricOpts = Object.keys(METRICS).map(function (k) { return '<option value="' + k + '"' + (UI.metric === k ? ' selected' : '') + '>' + METRICS[k][0] + '</option>'; }).join('');
    var minOpts = [1, 2, 3, 5].map(function (v) { return '<option value="' + v + '"' + (UI.minW === v ? ' selected' : '') + '>至少 ' + v + ' 次</option>'; }).join('');
    var exOpts = '<option value="none">不排除</option>' + D.ids.map(function (u) { return '<option value="' + esc(u) + '"' + (UI.ex === u ? ' selected' : '') + '>' + esc(nm(D, u)) + '</option>'; }).join('');
    var idx = UI.dayIdx != null ? UI.dayIdx : days.length - 1, dayLabel = !days.length ? '沒有貼文' : (UI.dayIdx != null ? '到 ' + days[UI.dayIdx].label + '(第 ' + (UI.dayIdx + 1) + ' / ' + days.length + ' 天)' : '全部日期(共 ' + days.length + ' 天)');
    var sel = 'border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white';
    var controls = '<div class="flex flex-wrap items-end gap-3 mb-3">' +
      '<label class="text-xs font-bold text-slate-500">討論區<br><select data-act="topic" class="' + sel + '">' + topicOpts + '</select></label>' +
      '<label class="text-xs font-bold text-slate-500">圓圈大小看<br><select data-act="metric" class="' + sel + '">' + metricOpts + '</select></label>' +
      '<label class="text-xs font-bold text-slate-500">只畫回應<br><select data-act="minw" class="' + sel + '">' + minOpts + '</select></label>' +
      '<label class="text-xs font-bold text-slate-500" title="看看拿掉一位同學之後,結論會不會改變">排除一位學生<br><select data-act="ex" class="' + sel + '">' + exOpts + '</select></label></div>';
    var replay = '<div class="rounded-xl bg-slate-50 border border-slate-200 p-3 mb-3"><div class="flex flex-wrap items-center gap-2"><button type="button" data-act="prev" class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-sm font-bold" ' + (days.length ? '' : 'disabled') + '>◀ 上一天</button>' +
      '<button type="button" data-act="play" class="px-3 py-1 rounded-lg bg-teal-600 text-white text-sm font-bold" ' + (days.length ? '' : 'disabled') + '>' + (UI.timer ? '❚❚ 暫停' : '▶ 播放') + '</button>' +
      '<button type="button" data-act="next" class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-sm font-bold" ' + (days.length ? '' : 'disabled') + '>下一天 ▶</button>' +
      '<button type="button" data-act="all" class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-sm font-bold">看全部</button>' +
      '<label class="text-xs font-bold text-slate-500 flex items-center gap-1 ml-auto">速度 <select data-act="speed" class="border border-slate-300 rounded px-1 py-0.5 text-xs bg-white">' + SPEEDS.map(function (v) { return '<option value="' + v + '"' + (getSpeed() === v ? ' selected' : '') + '>' + v + 'x</option>'; }).join('') + '</select></label>' +
      '<span id="nl-day-label" class="text-sm font-bold text-slate-700 ml-1 w-full md:w-auto">' + esc(dayLabel) + '</span></div>' +
      '<input id="nl-slider" data-act="slider" type="range" min="0" max="' + Math.max(0, days.length - 1) + '" step="1" value="' + Math.max(0, idx) + '" class="w-full mt-2" aria-label="逐日回放" ' + (days.length ? '' : 'disabled') + '></div>';
    var cards = '<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">' +
      tile(m.n, '學生', '在這個範圍裡的學生人數') + tile(m.replies, '回應次數', '回應「別的同學」貼文的次數(自己回自己不算:' + D.g.selfReplies + ' 次)') +
      tile(m.pairs, '互動的兩人組合', '至少有一方回應過另一方,每一對只算一次') + tile(m.n > 1 ? pct(m.density) : '—', '互動密度', '100% = 每兩個人之間都有互動') +
      tile(m.pairs ? pct(m.reciprocity) : '—', '有來有往', '互動的組合中,雙方都回應過對方的比例') + tile(m.isolates.length, UI.minW > 1 ? '沒有達門檻的關係' : '沒有回覆關係', UI.minW > 1 ? '沒有任何一條回應 ≥ ' + UI.minW + ' 次的關係(不代表完全沒互動)' : '沒回應過人、也沒被回應過') +
      tile(m.n ? m.components : '—', '互相連得起來的群', '1 = 全班連在一起;越多代表越分散') + tile(D.postCount, '貼文', '在這個討論區與日期範圍內') + '</div>';
    var banner = '<div class="rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-sm px-4 py-2.5 mb-3 leading-relaxed"><b>這張圖呈現「誰回應了誰」。</b>透過動態社會網絡分析,呈現全班學生的互動關係、社群連結與參與歷程,並能追溯每一項互動的原始發言證據。每個圓圈和每條線都可以點開看原始貼文,<b>點兩下</b>會跳出說明;圓球也可以拖動。箭頭從「回應的人」指向「被回應的人」。<span class="block text-[12px] text-teal-800/80 mt-1">提醒:光看這張圖只知道「誰跟誰互動」,<b>不能</b>判斷某個想法是不是真的被改進、被證據檢驗或被別人採用,要點開線看原始發言才知道。</span></div>';
    var legend = '<div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-2"><span><i class="inline-block w-3 h-3 rounded-full align-middle" style="background:#0f766e"></i> 有回覆關係</span><span><i class="inline-block w-3 h-3 rounded-full align-middle border border-dashed border-slate-400 bg-slate-200"></i> 沒有回覆關係</span><span>圓圈大小 = ' + METRICS[UI.metric][0] + '(' + esc(METRICS[UI.metric][1]) + ')</span><span>線越粗 = 回應越多次</span>' + (D.g.edges.length > 80 ? '<span class="text-teal-700 font-bold">線很多時,把「只畫回應」調成至少 2、3 次,比較看得出主要的關係。</span>' : '') + (D.g.hiddenEdges ? '<span class="text-amber-700 font-bold">已隱藏 ' + D.g.hiddenEdges + ' 條少於 ' + UI.minW + ' 次的線</span>' : '') + '</div>';
    UI.root.innerHTML = '<header class="mb-3"><h2 class="text-xl md:text-2xl font-bold text-slate-800">網絡實驗室 <span class="text-sm font-bold text-slate-400">Network Lab</span>' + (UI.ctx.scope ? ' <span class="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 align-middle">' + esc(UI.ctx.scope.replace(/^\(|\)$/g, '')) + '</span>' : '') + '</h2><p class="text-sm text-slate-500">看全班「誰回應了誰」,並隨時回到原始貼文查證。</p></header>' + banner + controls +
      '<div class="grid grid-cols-1 lg:grid-cols-5 gap-4"><section class="lg:col-span-3 rounded-xl bg-white border border-slate-200 p-3"><div class="rounded-lg bg-slate-50 overflow-x-auto" id="nl-graph"><div style="min-width:600px">' + graphSVG(D) + '</div></div><p class="text-[11px] text-slate-400 mt-1 md:hidden">圖比較寬,可以左右滑動看全圖</p>' +
      '<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 mt-2"><span class="font-bold">👆 拖拖看圓球・點兩下看說明</span><span id="nl-move-slot" class="flex items-center gap-1"></span><button type="button" data-act="resetpos" class="px-2 py-0.5 rounded-full border border-slate-300 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-100" title="把圓球移回最初的排列">↺ 還原位置</button></div>' + legend + '</section>' +
      '<aside class="lg:col-span-2 rounded-xl bg-white border border-slate-200 p-3 max-h-[640px] overflow-y-auto" id="nl-inspector">' + inspector(D) + '</aside></div>' +
      '<div class="mt-3">' + replay + '</div>' +
      '<div class="kb-ai-body rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 mb-3" id="nl-story" style="font-size:13px">' + storyHtml(D) + '</div><div id="nl-ai-slot" class="mb-3"></div>' + cards +
      logHtml(D) + '<section class="rounded-xl bg-white border border-slate-200 p-3 mt-4"><h3 class="font-black text-slate-800 mb-1">每位學生的回覆關係</h3><p class="text-xs text-slate-500 mb-2">點表頭排序,點一列看他的原始貼文,點兩下看說明。顏色越深 = 在全班越高。</p>' + table(D) + '</section>' + method(D);
    mountAI();
    var ms = UI.root.querySelector('#nl-move-slot'); if (ms && global.kbMove && global.kbMove.ctl) ms.appendChild(global.kbMove.ctl());
  }

  /* ---------- 互動 ---------- */
  function stopPlay() { if (UI.timer) { clearInterval(UI.timer); UI.timer = null; } }
  function step(delta) {
    var days = KBNet.days(UI.ctx.nodes || [], { topicId: UI.topic }); if (!days.length) return false;
    var cur = UI.dayIdx != null ? UI.dayIdx : days.length - 1, nxt = cur + delta;
    if (nxt < 0) nxt = 0; if (nxt > days.length - 1) nxt = days.length - 1;
    UI.dayIdx = nxt; UI.limit = 8; return nxt < days.length - 1 || delta < 0;
  }
  function play() {
    if (UI.timer) { stopPlay(); draw(); return; }
    var days = KBNet.days(UI.ctx.nodes || [], { topicId: UI.topic }); if (!days.length) return;
    if (UI.dayIdx == null || UI.dayIdx >= days.length - 1) UI.dayIdx = 0;
    UI.timer = setInterval(function () {
      var v = UI.root && UI.root.closest ? UI.root.closest('.section-view') : null;
      if (!UI.root || !UI.root.isConnected || (v && !v.classList.contains('active'))) { stopPlay(); return; }
      var more = step(1); if (!more) { stopPlay(); }
      draw();
    }, 1000 / getSpeed());
    draw();
  }
  function onClick(ev) {
    if (UI.suppressClick) { ev.preventDefault(); return; }
    var pv = ev.target.closest ? ev.target.closest('[data-pv]') : null;
    if (pv && UI.root.contains(pv)) { ev.preventDefault(); if (global.KBUI && global.KBUI.postViewer) global.KBUI.postViewer.open(pv.getAttribute('data-pv'), { nodes: UI.ctx.nodes, topics: UI.ctx.topics, nameOf: function (u) { var x = (UI.ctx.userList || {})[u]; return x ? x.name : '同學'; } }); return; }
    var el = ev.target.closest ? ev.target.closest('[data-act]') : null; if (!el || !UI.root.contains(el)) return;
    var a = el.getAttribute('data-act');
    // 第一下點擊就會重畫整個畫面,真正的 dblclick 會落在已被換掉的元素上收不到,所以自己判斷:同一個圓圈/連線在 0.6 秒內被點第二下
    if (a === 'node' || a === 'edge') {
      var key = a + '|' + (el.getAttribute('data-id') || '') + '|' + (el.getAttribute('data-a') || '') + '|' + (el.getAttribute('data-b') || ''), now = Date.now();
      if (ev.detail === 2 || (UI.lastClick && UI.lastClick.k === key && now - UI.lastClick.t < 600)) { UI.lastClick = null; ev.preventDefault(); onDbl(ev); return; }
      UI.lastClick = { k: key, t: now };
    }
    if (a === 'node') { ev.preventDefault(); UI.sel = { kind: 'node', id: el.getAttribute('data-id') }; UI.limit = 8; draw(); }
    else if (a === 'edge') { ev.preventDefault(); UI.sel = { kind: 'edge', a: el.getAttribute('data-a'), b: el.getAttribute('data-b') }; UI.limit = 8; draw(); }
    else if (a === 'more') { UI.limit += 8; draw(); }
    else if (a === 'sort') { var k = el.getAttribute('data-key'); if (UI.sort === k) UI.dir = -UI.dir; else { UI.sort = k; UI.dir = k === 'name' ? 1 : -1; } draw(); }
    else if (a === 'prev') { stopPlay(); step(-1); draw(); }
    else if (a === 'next') { stopPlay(); step(1); draw(); }
    else if (a === 'all') { stopPlay(); UI.dayIdx = null; draw(); }
    else if (a === 'play') { play(); }
    else if (a === 'resetpos') { ev.preventDefault(); resetPos(); }
    else if (a === 'jumpday') { stopPlay(); UI.dayIdx = Number(el.getAttribute('data-i')); UI.limit = 8; draw(); }
  }
  // 點兩下:圓圈 → 這位學生的說明;連線 → 誰回給誰、內容是什麼
  function onDbl(ev) {
    var el = ev.target.closest ? ev.target.closest('[data-act="node"],[data-act="edge"]') : null; if (!el || !UI.root.contains(el) || !global.kbEgoInfo || !global.kbEgoDialog) return;
    try {
      var ctx = UI.ctx, tl = function (t) { var A = global.ASRA; return (A && A.TNAME && A.TNAME[t]) || ''; };
      var info = global.kbEgoInfo({ me: el.getAttribute('data-act') === 'node' ? el.getAttribute('data-id') : '', noCenter: true, nodes: ctx.nodes || [], userList: ctx.userList || {}, typeLabel: tl });
      var r = el.getAttribute('data-act') === 'node' ? info.nodeInfo(el.getAttribute('data-id')) : info.edgeInfo(el.getAttribute('data-a'), el.getAttribute('data-b'));
      global.kbEgoDialog(r.title, r.sub, r.html);
    } catch (e) { if (global.console) console.error(e); }
  }
  function onChange(ev) {
    var el = ev.target, a = el.getAttribute && el.getAttribute('data-act'); if (!a) return;
    if (a === 'topic') { stopPlay(); UI.topic = el.value; UI.dayIdx = null; UI.sel = null; draw(); }
    else if (a === 'metric') { UI.metric = el.value; draw(); }
    else if (a === 'minw') { UI.minW = Number(el.value) || 1; draw(); }
    else if (a === 'ex') { UI.ex = el.value; draw(); }
    else if (a === 'slider') { stopPlay(); UI.dayIdx = Number(el.value); draw(); }
    else if (a === 'speed') { try { global.localStorage.setItem('kb_net_speed', String(el.value)); } catch (e) {} if (UI.timer) { stopPlay(); play(); } }
  }
  function onInput(ev) {
    var el = ev.target; if (!el.getAttribute || el.getAttribute('data-act') !== 'slider') return;
    var days = KBNet.days(UI.ctx.nodes || [], { topicId: UI.topic }), i = Number(el.value), lab = UI.root.querySelector('#nl-day-label');
    if (lab && days[i]) lab.textContent = '到 ' + days[i].label + '(第 ' + (i + 1) + ' / ' + days.length + ' 天)';
  }
  function onKey(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var el = ev.target.closest ? ev.target.closest('[data-act="node"],[data-act="edge"]') : null; if (!el || el.tagName === 'TR') return;
    ev.preventDefault(); el.dispatchEvent(new global.MouseEvent('click', { bubbles: true }));
  }

  var bound = false;
  function render(root, ctx) {
    stopPlay();
    UI.root = root; UI.ctx = ctx;
    if (!bound) { bound = true; root.addEventListener('click', onClick); root.addEventListener('pointerdown', onDown); root.addEventListener('dblclick', onDbl); root.addEventListener('change', onChange); root.addEventListener('input', onInput); root.addEventListener('keydown', onKey); }
    draw();
  }
  global.KBNetLab = { render: render, compute: compute, layout: layout, state: function () { return UI; } };
})(window);
