/* =====================================================================
 *  KB Why — 歷程說明的「可能原因」
 *  歷程說明原本只告訴使用者「數字從多少變成多少」,看不出為什麼會變。這支檔把「這一天新增了哪些貼文」
 *  和「這個數字怎麼算出來的」對起來,產生一句白話的可能原因,例如:
 *    提問 → 延伸 41% → 47%
 *    💭 可能原因:這天新增 3 則回應「提問」的貼文,其中 2 則是「延伸」(67%,比原本累計的 41% 高),把比例拉高。
 *  全部都是純函式(輸入是貼文清單,輸出是 HTML 字串),不碰畫面,方便測試。
 *  貼文欄位:{ id, type, author, parentId, title? };A = 到這一步為止的全部貼文,P = 前一步為止,added = A 比 P 多的貼文。
 *  這些是「從資料推出來的可能原因」,不是已經證實的因果;文字一律用「可能」「這天新增」這類說法。
 * ===================================================================== */
(function (global) {
  'use strict';
  var TN = { question: '提問', extend: '延伸', improve: '改進', counter: '反例', riseabove: '整合' };
  var KEYS5 = ['question', 'extend', 'improve', 'counter', 'riseabove'];
  var T4 = ['question', 'extend', 'improve', 'riseabove'];
  var namer = function (id) { return String(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nm(id) { return esc(namer(id)); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function dl(d) { d = Math.round(d); return '<span class="kbg-d ' + (d > 0 ? 'kbg-up' : 'kbg-dn') + '">(' + (d > 0 ? '▲' : '▼') + Math.abs(d) + ')</span>'; }
  function list(a, max) { max = max || 3; var s = a.slice(0, max).join('、'); return s + (a.length > max ? ' 等 ' + a.length + ' 位' : ''); }
  function short(t, n) { t = String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); n = n || 12; return t.length > n ? t.slice(0, n) + '…' : (t || '(無標題)'); }
  function mapById(notes) { var m = {}; notes.forEach(function (n) { m[n.id] = n; }); return m; }
  function idSet(notes) { var s = {}; notes.forEach(function (n) { s[n.id] = 1; }); return s; }
  function minus(A, P) { var s = idSet(P); return A.filter(function (n) { return !s[n.id]; }); }
  function key4(t) { return t === 'counter' ? 'improve' : t; }
  function mixBy(notes, keys, merge) { var c = {}; keys.forEach(function (k) { c[k] = 0; }); notes.forEach(function (n) { var t = merge ? key4(n.type) : n.type; if (c[t] !== undefined) c[t]++; }); return c; }
  function depthOf(n, byId) { var d = 0, cur = n, g = 0; while (cur && cur.parentId && byId[cur.parentId] && g++ < 300) { d++; cur = byId[cur.parentId]; } return d; }
  function rootOf(n, byId) { var cur = n, g = 0; while (cur && cur.parentId && byId[cur.parentId] && g++ < 300) cur = byId[cur.parentId]; return cur; }

  /* 通用:這一天新增了什麼 */
  function addedSummary(added) {
    if (!added || !added.length) return '';
    var c = mixBy(added, KEYS5), parts = [];
    KEYS5.forEach(function (k) { if (c[k]) parts.push(TN[k] + ' ' + c[k]); });
    var au = {}; added.forEach(function (n) { au[n.author] = 1; });
    var rep = added.filter(function (n) { return n.parentId; }).length;
    return '這一天新增 ' + added.length + ' 則貼文(' + parts.join('、') + '),來自 ' + Object.keys(au).length + ' 位同學' + (rep ? ';其中 ' + rep + ' 則是回應別人的貼文' : '') + '。';
  }

  /* ---------- 言談序列轉移 / 鷹架回應模式:「前一則是 A 時,下一則接 B」的百分比 ---------- */
  function transMat(notes) {
    var byId = mapById(notes), m = {};
    T4.forEach(function (a) { m[a] = {}; T4.forEach(function (b) { m[a][b] = 0; }); });
    notes.forEach(function (n) {
      var p = n.parentId && byId[n.parentId]; if (!p) return;
      var a = key4(p.type), b = key4(n.type); if (m[a] && m[a][b] !== undefined) m[a][b]++;
    });
    return m;
  }
  function rowSum(m, a) { return T4.reduce(function (s, b) { return s + m[a][b]; }, 0); }
  function trans(A, P, added) {
    var mA = transMat(A), mP = transMat(P), out = [];
    T4.forEach(function (a) {
      var tA = rowSum(mA, a), tP = rowSum(mP, a); if (!tA) return;
      T4.forEach(function (b) {
        var cA = mA[a][b], cP = mP[a][b], pA = cA / tA * 100, pP = tP ? cP / tP * 100 : null;
        if (pP === null) { if (cA) out.push({ a: a, b: b, cA: cA, tA: tA, cP: cP, tP: tP, pA: pA, pP: null, d: null, w: 100 }); }
        else if (Math.abs(pA - pP) >= 1) out.push({ a: a, b: b, cA: cA, tA: tA, cP: cP, tP: tP, pA: pA, pP: pP, d: pA - pP, w: Math.abs(pA - pP) });
      });
    });
    out.sort(function (x, y) { return y.w - x.w; });
    var top = out.slice(0, 2); if (!top.length) return null;
    var byId = mapById(A), ex = {};
    (added || minus(A, P)).forEach(function (n) { var p = n.parentId && byId[n.parentId]; if (!p) return; var kk = key4(p.type) + '>' + key4(n.type); if (!ex[kk]) ex[kk] = { u: n.author, v: p.author }; });
    var say = top.map(function (x) {
      return '<b>' + TN[x.a] + ' → ' + TN[x.b] + '</b> ' + (x.pP === null ? '第一次出現 <b>' + Math.round(x.pA) + '%</b>(' + x.cA + '/' + x.tA + ')' : Math.round(x.pP) + '% → <b>' + Math.round(x.pA) + '%</b>' + dl(x.d));
    }).join(';');
    var why = top.map(function (x) {
      var n = x.tA - x.tP, m = x.cA - x.cP, s;
      if (x.pP === null) s = '這是第一次有人回應「' + TN[x.a] + '」(這天 ' + n + ' 則),其中 ' + m + ' 則是「' + TN[x.b] + '」。';
      else if (n <= 0) s = '這天回應「' + TN[x.a] + '」的貼文沒有增加,比例的變化來自整體的重新計算。';
      else if (x.d > 0) s = '這天新增 ' + n + ' 則回應「' + TN[x.a] + '」的貼文,其中 ' + m + ' 則是「' + TN[x.b] + '」(' + pct(m, n) + '%,比原本累計的 ' + Math.round(x.pP) + '% 高),把比例拉高。';
      else s = '這天新增 ' + n + ' 則回應「' + TN[x.a] + '」的貼文,' + (m === 0 ? '但沒有一則是「' + TN[x.b] + '」' : '只有 ' + m + ' 則是「' + TN[x.b] + '」(' + pct(m, n) + '%,比原本累計的 ' + Math.round(x.pP) + '% 低)') + ',其他回應走向別類,把比例拉低。';
      var e = ex[x.a + '>' + x.b]; if (m > 0 && e) s += e.u === e.v ? ' 例如 ' + nm(e.u) + ' 接著自己的「' + TN[x.a] + '」又寫了「' + TN[x.b] + '」。' : ' 例如 ' + nm(e.u) + ' 回應了 ' + nm(e.v) + ' 的「' + TN[x.a] + '」。';
      return s;
    });
    var small = {}; top.forEach(function (x) { if (x.tA < 10 && !small[x.a]) { small[x.a] = 1; why.push('累計回應「' + TN[x.a] + '」的貼文才 ' + x.tA + ' 則,樣本很少,一兩則就會讓比例大幅跳動,先別急著下結論。'); } });
    why = why.join('<br>');
    return { say: say, why: why };
  }

  /* ---------- 各類型占比(鷹架指紋、前中後期比例):新增貼文的類型組成,拉高或稀釋了誰 ---------- */
  function shares(A, P, added, o) {
    o = o || {}; var keys = o.keys || KEYS5, merge = !!o.merge, who = o.who || '全班';
    var okAuthor = o.authors ? function (n) { return o.authors[n.author]; } : function () { return true; };
    A = A.filter(okAuthor); P = P.filter(okAuthor); added = (added || minus(A, P)).filter(okAuthor);
    if (!A.length) return null;
    var cA = mixBy(A, keys, merge), cP = mixBy(P, keys, merge), cN = mixBy(added, keys, merge), tag = merge ? { question: '提問', extend: '延伸', improve: '改進(含反例)', riseabove: '整合' } : TN;
    var out = [];
    keys.forEach(function (k) {
      var sA = cA[k] / A.length * 100, sP = P.length ? cP[k] / P.length * 100 : null;
      if (sP === null) { if (cA[k]) out.push({ k: k, sA: sA, sP: null, d: null, w: sA }); }
      else if (Math.abs(sA - sP) >= 1) out.push({ k: k, sA: sA, sP: sP, d: sA - sP, w: Math.abs(sA - sP) });
    });
    out.sort(function (x, y) { return y.w - x.w; });
    var top = out.slice(0, 2); if (!top.length) return null;
    var say = top.map(function (x) { return who + '「' + tag[x.k] + '」' + (x.sP === null ? '占 <b>' + Math.round(x.sA) + '%</b>' : Math.round(x.sP) + '% → <b>' + Math.round(x.sA) + '%</b>' + dl(x.d)); }).join(';');
    var n = added.length;
    if (!P.length) {
      var firstParts = []; keys.forEach(function (k) { if (cN[k]) firstParts.push('「' + tag[k] + '」' + cN[k] + ' 則'); });
      return { say: say, why: '這是' + who + '的第一批貼文(' + n + ' 則):' + firstParts.join('、') + ',所以一開始的占比就是這樣。' };
    }
    var why = top.map(function (x) {
      if (x.sP === null) return '這是' + who + '的第一批貼文(' + n + ' 則),其中 ' + cN[x.k] + ' 則是「' + tag[x.k] + '」,所以一開始就占 ' + Math.round(x.sA) + '%。';
      if (!n) return '';
      var m = cN[x.k], mp = pct(m, n);
      if (x.d > 0) return '這天新增 ' + n + ' 則貼文,其中 ' + m + ' 則是「' + tag[x.k] + '」(' + mp + '%,比原本累計的 ' + Math.round(x.sP) + '% 高),所以占比上升。';
      return '這天新增 ' + n + ' 則貼文,' + (m === 0 ? '裡面沒有「' + tag[x.k] + '」' : '只有 ' + m + ' 則是「' + tag[x.k] + '」(' + mp + '%,比原本累計的 ' + Math.round(x.sP) + '% 低)') + ',其他類型變多,把它的占比稀釋了。';
    }).filter(Boolean).join('<br>');
    return { say: say, why: why };
  }

  /* ---------- 班級脈動:密度、昇華率、發言吉尼係數、討論串深度 ---------- */
  function kpi(A, P, added, ctx) {
    var a = ctx.calc(A), p = ctx.calc(P), parts = [];
    added = added || minus(A, P);
    if (+a.dens !== +p.dens) {
      var eA = ctx.edges(A), eP = ctx.edges(P), news = [];
      Object.keys(eA).forEach(function (e) { if (!eP[e]) news.push(e); });
      var txt = news.map(function (e) { var s = e.split('>'); return nm(s[0]) + ' 回應了 ' + nm(s[1]); });
      parts.push('網路密度 ' + p.dens + ' → ' + a.dens + ':這天新連起 ' + news.length + ' 組同學之間的互動' + (news.length ? '(' + list(txt, 3) + ')' : '') + ',同學之間的連線變' + (+a.dens > +p.dens ? '多' : '少') + '了。');
    }
    if (a.ra !== p.ra) {
      var r = added.filter(function (n) { return n.type === 'riseabove'; }).length, R = A.filter(function (n) { return n.type === 'riseabove'; }).length;
      parts.push('昇華率 ' + p.ra + '% → ' + a.ra + '%:' + (a.ra > p.ra ? '這天新增 ' + r + ' 則整合貼文(累計整合 ' + R + ' 則 / 共 ' + A.length + ' 則),占比上升。' : '這天新增 ' + added.length + ' 則貼文,其中只有 ' + r + ' 則是整合,比例被稀釋了(累計整合 ' + R + ' 則 / 共 ' + A.length + ' 則)。'));
    }
    if (+a.gini !== +p.gini) {
      var seen = {}; P.forEach(function (n) { seen[n.author] = 1; });
      var cnt = {}; added.forEach(function (n) { cnt[n.author] = (cnt[n.author] || 0) + 1; });
      var first = Object.keys(cnt).filter(function (u) { return !seen[u]; });
      var topA = Object.keys(cnt).sort(function (x, y) { return cnt[y] - cnt[x]; })[0];
      var s = '發言吉尼係數 ' + p.gini + ' → ' + a.gini + ':這天有 ' + Object.keys(cnt).length + ' 位同學發言' + (first.length ? ',其中 ' + first.length + ' 位是第一次發言(' + list(first.map(nm), 3) + ')' : '');
      s += (+a.gini < +p.gini) ? ',發言變得比較平均。' : (topA ? ',發言又更集中在少數人身上(' + nm(topA) + ' 這天發了 ' + cnt[topA] + ' 則)。' : '。');
      parts.push(s);
    }
    if (+a.depth !== +p.depth) {
      var byId = mapById(A), md = 0; added.forEach(function (n) { md = Math.max(md, depthOf(n, byId)); });
      parts.push('平均討論串深度 ' + p.depth + ' → ' + a.depth + ':' + (+a.depth > +p.depth ? '這天最深的回應接到第 ' + md + ' 層,討論串往下長了。' : '這天新增的多半是新的主貼文或第 1 層的回應(最深第 ' + md + ' 層),把平均拉低了。'));
    }
    return parts.join('<br>');
  }

  /* ---------- 關鍵知識經紀人(中介中心性) ---------- */
  function adjOf(notes, ids) {
    var adj = {}, byId = mapById(notes); ids.forEach(function (id) { adj[id] = {}; });
    notes.forEach(function (n) {
      var p = n.parentId && byId[n.parentId]; if (!p) return;
      var a1 = String(n.author), a2 = String(p.author); if (a1 === a2 || !adj[a1] || !adj[a2]) return;
      adj[a1][a2] = 1; adj[a2][a1] = 1;
    });
    return adj;
  }
  function betweenness(adj, ids) {
    var CB = {}; ids.forEach(function (id) { CB[id] = 0; });
    ids.forEach(function (s) {
      var S = [], P = {}, sigma = {}, d = {}, Q = [s];
      ids.forEach(function (v) { P[v] = []; sigma[v] = 0; d[v] = -1; });
      sigma[s] = 1; d[s] = 0;
      while (Q.length) {
        var v = Q.shift(); S.push(v);
        Object.keys(adj[v] || {}).forEach(function (w) { if (d[w] < 0) { Q.push(w); d[w] = d[v] + 1; } if (d[w] === d[v] + 1) { sigma[w] += sigma[v]; P[w].push(v); } });
      }
      var delta = {}; ids.forEach(function (v) { delta[v] = 0; });
      while (S.length) { var w = S.pop(); P[w].forEach(function (v) { delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]); }); if (w !== s) CB[w] += delta[w]; }
    });
    ids.forEach(function (id) { CB[id] = CB[id] / 2; });
    return CB;
  }
  function bridgePairs(adj, x) {   // x 的鄰居裡,彼此沒有直接互動的有幾組(都要經過 x 才連得起來)
    var nb = Object.keys(adj[x] || {}), c = 0;
    for (var i = 0; i < nb.length; i++) for (var j = i + 1; j < nb.length; j++) if (!(adj[nb[i]] && adj[nb[i]][nb[j]])) c++;
    return c;
  }
  function brokers(A, P, ids) {
    ids = ids.map(String);
    var aA = adjOf(A, ids), aP = adjOf(P, ids), cA = betweenness(aA, ids), cP = betweenness(aP, ids);
    function top3(c) { return Object.keys(c).sort(function (x, y) { return (c[y] - c[x]) || (x < y ? -1 : 1); }).slice(0, 3); }
    var tA = top3(cA), tP = top3(cP), same = tA.join() === tP.join();
    var moved = ids.filter(function (id) { return Math.abs(cA[id] - cP[id]) >= 0.05; });
    if (same && !moved.some(function (id) { return tA.indexOf(id) >= 0; })) return null;
    var say = '<b>前三名</b>:' + tA.map(function (id) { return nm(id) + ' ' + r1(cA[id]); }).join('、') + (same ? '' : '(名次有變動)');
    var up = moved.filter(function (id) { return cA[id] > cP[id]; }).sort(function (x, y) { return (cA[y] - cP[y]) - (cA[x] - cP[x]); }).slice(0, 2);
    var down = moved.filter(function (id) { return cA[id] < cP[id]; }).sort(function (x, y) { return (cP[y] - cA[y]) - (cP[x] - cA[x]); })[0];
    var why = up.map(function (x) {
      var nw = Object.keys(aA[x]).filter(function (y) { return !aP[x][y]; }), dBr = bridgePairs(aA, x) - bridgePairs(aP, x);
      if (nw.length) return nm(x) + ' 的中介分數 ' + r1(cP[x]) + ' → ' + r1(cA[x]) + ':這天他新連上 ' + list(nw.map(nm), 3) + (dBr > 0 ? ',讓原本不直接互動的同學之間多了 ' + dBr + ' 組要經過 ' + nm(x) + ' 才連得起來(橋樑變多)。' : '。');
      return nm(x) + ' 的中介分數 ' + r1(cP[x]) + ' → ' + r1(cA[x]) + ':他自己沒有新連線,是別人之間新增的互動改變了「誰是必經之路」。';
    });
    if (down) why.push(nm(down) + ' 的中介分數 ' + r1(cP[down]) + ' → ' + r1(cA[down]) + ':同學之間新連上了其他互動,不必再經過他轉接,他的橋樑角色變小。');
    return { say: say, why: why.join('<br>') };
  }

  /* ---------- 互動影響力矩陣:誰換了象限 ---------- */
  var QN = { q1: '核心領袖', q2: '高效影響', q3: '獨立貢獻', q4: '邊緣參與' };
  function quadStats(notes, ids) {
    var created = {}, recv = {}, byId = mapById(notes); ids.forEach(function (id) { created[id] = 0; recv[id] = 0; });
    notes.forEach(function (n) {
      var a = String(n.author); if (created[a] !== undefined) created[a]++;
      var p = n.parentId && byId[n.parentId]; if (p && String(p.author) !== a && recv[String(p.author)] !== undefined) recv[String(p.author)]++;
    });
    var ax = ids.length ? ids.reduce(function (s, i) { return s + created[i]; }, 0) / ids.length : 0, ay = ids.length ? ids.reduce(function (s, i) { return s + recv[i]; }, 0) / ids.length : 0, q = {};
    ids.forEach(function (i) { var hx = created[i] >= ax, hy = recv[i] >= ay; q[i] = hx && hy ? 'q1' : (!hx && hy ? 'q2' : (hx && !hy ? 'q3' : 'q4')); });
    return { created: created, recv: recv, ax: ax, ay: ay, q: q };
  }
  function quad(A, P, ids) {
    ids = ids.map(String);
    var sA = quadStats(A, ids), sP = quadStats(P, ids);
    var mv = ids.filter(function (i) { return sA.q[i] !== sP.q[i]; });
    if (!mv.length) return null;
    var say = '<b>' + mv.length + ' 位同學換了位置</b>:' + mv.slice(0, 3).map(function (i) { return nm(i) + ' ' + QN[sP.q[i]] + ' → ' + QN[sA.q[i]]; }).join('、') + (mv.length > 3 ? ' 等' : '');
    var why = mv.slice(0, 2).map(function (i) {
      var dx = sA.created[i] - sP.created[i], dy = sA.recv[i] - sP.recv[i];
      var s = nm(i) + ' 從「' + QN[sP.q[i]] + '」移到「' + QN[sA.q[i]] + '」:';
      if (dx || dy) s += '這天他' + (dx ? '多發了 ' + dx + ' 則' : '') + (dx && dy ? '、' : '') + (dy ? '多被回應 ' + dy + ' 次' : '') + '(累計發文 ' + sA.created[i] + '、被回應 ' + sA.recv[i] + ';全班平均 ' + r1(sA.ax) + ' 和 ' + r1(sA.ay) + ')。';
      else s += '他自己這天沒有新的變化,是全班平均變動(發文 ' + r1(sP.ax) + ' → ' + r1(sA.ax) + '、被回應 ' + r1(sP.ay) + ' → ' + r1(sA.ay) + ')讓他跨過了平均線。';
      return s;
    }).join('<br>');
    return { say: say, why: why };
  }

  /* ---------- 觀點潛力熱點圖:誰被回應變多、往右移 ---------- */
  function promising(A, P, added) {
    added = added || minus(A, P); if (!added.length) return null;
    var inP = idSet(P), cnt = {}, byId = mapById(A);
    added.forEach(function (n) { if (n.parentId && inP[n.parentId]) cnt[n.parentId] = (cnt[n.parentId] || 0) + 1; });
    var ids = Object.keys(cnt).sort(function (x, y) { return cnt[y] - cnt[x]; });
    var say = '新增 <b>' + added.length + '</b> 個點' + (ids.length ? ';<b>' + ids.length + '</b> 個原有的點因為被回應變多而往右移' : '');
    var why = ids.slice(0, 2).map(function (id) {
      var tot = A.filter(function (n) { return n.parentId === id; }).length;
      return '「' + esc(short(byId[id].title)) + '」這天多了 ' + cnt[id] + ' 則回應(累計 ' + tot + ' 則),被回應越多關注度越高,所以點往右移。';
    });
    var q = added.filter(function (n) { return n.type === 'question'; }).length;
    if (q) why.push('新增的 ' + q + ' 則提問會落在比較上面(提問帶來的認知落差高);剛發的貼文還沒有人回應,所以先停在左邊。');
    else if (!why.length) why.push('這天新增的貼文都還沒有人回應,所以都落在最左邊。');
    return { say: say, why: why.join('<br>') };
  }

  /* ---------- 觀點演化路徑:哪幾條討論串長出新貼文 ---------- */
  function evolution(A, P, added) {
    added = added || minus(A, P); if (!added.length) return null;
    var byId = mapById(A), th = {};
    added.forEach(function (n) { var r = rootOf(n, byId); if (!r) return; var t = th[r.id] || (th[r.id] = { root: r, add: 0, deep: 0 }); t.add++; t.deep = Math.max(t.deep, depthOf(n, byId)); });
    var ids = Object.keys(th).sort(function (x, y) { return th[y].add - th[x].add; });
    var say = '新長出 <b>' + added.length + '</b> 則,接在 <b>' + ids.length + '</b> 條討論串裡';
    var why = ids.slice(0, 2).map(function (id) {
      var size = A.filter(function (n) { var r = rootOf(n, byId); return r && r.id === id; }).length, t = th[id];
      var au = {}; added.forEach(function (n) { var r = rootOf(n, byId); if (r && r.id === id) au[n.author] = 1; });
      return '討論串「' + esc(short(t.root.title)) + '」長到 ' + size + ' 則(這天 +' + t.add + ',' + list(Object.keys(au).map(nm), 2) + ' 接著發言,最深到第 ' + t.deep + ' 層)。';
    });
    why.push('每則新貼文都是接在某則舊貼文後面,所以討論串一則一則往下長;新的主貼文則開出新的討論串。');
    return { say: say, why: why.join('<br>') };
  }

  /* ---------- KB 12 原則:是哪些底層比例在動 ---------- */
  function drivers(A, P, added, o) {
    o = o || {}; added = added || minus(A, P); if (!added.length) return '';
    var sa = function (notes, ty) { return notes.filter(function (n) { return ty.indexOf(n.type) >= 0; }).length; };
    var rows = [['提問', ['question']], ['改進/反例', ['improve', 'counter']], ['整合', ['riseabove']]], parts = [];
    rows.forEach(function (r) {
      var a = pct(sa(A, r[1]), A.length), p = P.length ? pct(sa(P, r[1]), P.length) : null;
      if (p !== null && a !== p) parts.push(r[0] + '類貼文占比 ' + p + '% → ' + a + '%(這天新增的 ' + added.length + ' 則裡有 ' + sa(added, r[1]) + ' 則)');
    });
    var au = {}, auP = {}; A.forEach(function (n) { au[n.author] = 1; }); P.forEach(function (n) { auP[n.author] = 1; });
    var nA = Object.keys(au).length, nP = Object.keys(auP).length;
    if (nA !== nP) parts.push('發過言的同學 ' + nP + ' → ' + nA + ' 位(參與的人變多,「參與率」跟著上升)');
    if (!parts.length) return addedSummary(added);
    return '這些指標是由比例算出來的,這天主要變動的是:' + parts.join(';') + '。';
  }

  /* ---------- 個別學生(學生頁、老師頁的個別學生):這一天他/你做了什麼、誰回應了他/你 ---------- */
  function studentDay(o) {
    o = o || {}; var who = o.who || '你', added = o.added || [], inbound = o.inbound || [], byId = o.byId || {}, parts = [];
    if (added.length) {
      var c = mixBy(added, KEYS5), mp = []; KEYS5.forEach(function (k) { if (c[k]) mp.push(TN[k] + ' ' + c[k]); });
      var resp = added.filter(function (n) { var p = n.parentId && byId[n.parentId]; return p && String(p.author) !== String(n.author); }), tg = {};
      resp.forEach(function (n) { tg[String(byId[n.parentId].author)] = 1; });
      var s = '這天' + esc(who) + '發了 ' + added.length + ' 則貼文(' + mp.join('、') + ')';
      if (resp.length) s += ',其中 ' + resp.length + ' 則是回應同學(' + list(Object.keys(tg).map(nm), 3) + ')';
      parts.push(s);
    } else parts.push('這天' + esc(who) + '沒有發新貼文');
    if (inbound.length) { var au = {}; inbound.forEach(function (n) { au[String(n.author)] = 1; }); parts.push('同學回應了' + esc(who) + ' ' + inbound.length + ' 次(' + list(Object.keys(au).map(nm), 3) + ')'); }
    return parts.join(';') + '。';
  }

  global.KBWhy = {
    TN: TN, esc: esc, setNamer: function (f) { if (typeof f === 'function') namer = f; },
    addedSummary: addedSummary, studentDay: studentDay, trans: trans, shares: shares, kpi: kpi, brokers: brokers, quad: quad, promising: promising, evolution: evolution, drivers: drivers,
    minus: minus,
    _t: { transMat: transMat, betweenness: betweenness, adjOf: adjOf, quadStats: quadStats, bridgePairs: bridgePairs }
  };
})(typeof window !== 'undefined' ? window : globalThis);
