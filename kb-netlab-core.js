/* =====================================================================
 *  KB NetLab Core — 網絡實驗室的計算(純函式,不碰畫面;可在瀏覽器或 Node 使用)
 *
 *  只做「真實回覆網絡」:學生 A 回應了學生 B 的貼文(貼文的 parentId),就有一條 A → B 的有向連線,
 *  權重 = 回應的次數。自己回自己不算。
 *
 *  重要:同一對學生互相回應(A→B 與 B→A)在「不分方向」的計算裡只算一位夥伴、一條連線,
 *  不會被算成兩條(這是之前原型裡會高估連結度與密度的地方)。
 *
 *  指標(都只描述「回覆關係」,不代表想法品質或學習表現):
 *    out / in            回應別人的次數 / 被回應的次數(有向,算次數)
 *    outDeg / inDeg      回應過幾位不同的人 / 被幾位不同的人回應過
 *    partners            互動夥伴數(不分方向、不重複)
 *    degree              連結度 = partners / (n-1)
 *    between             橋接度(Betweenness):最短路徑經過他的比例;Brandes 演算法,不分方向,不看權重
 *    close               接近度(Harmonic Closeness):對其他人 1/距離 的平均;不連通的人距離視為無窮(貢獻 0)
 * ===================================================================== */
(function (global) {
  'use strict';
  var VERSION = 'netlab-1.0';
  var DAY = 86400000;

  function asSet(x) {
    var s = {};
    if (!x) return s;
    if (Array.isArray(x)) x.forEach(function (k) { s[k] = 1; });
    else Object.keys(x).forEach(function (k) { if (x[k]) s[k] = 1; });
    return s;
  }
  function dayStart(ts) { var d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayLabel(ts) { var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); }

  /* 貼文裡有出現的「發文日」(依討論區篩選),由早到晚;until 用「當天結束」 */
  function days(nodes, opts) {
    opts = opts || {};
    var seen = {}, out = [];
    (nodes || []).forEach(function (n) {
      if (!n || !n.date) return;
      if (opts.topicId && opts.topicId !== 'all' && n.topicId !== opts.topicId) return;
      var s = dayStart(n.date);
      if (!seen[s]) { seen[s] = 1; out.push({ start: s, end: s + DAY - 1, label: dayLabel(s), key: pad(new Date(s).getMonth() + 1) + '-' + pad(new Date(s).getDate()) }); }
    });
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  /* 真實回覆網絡
     opts: { topicId:'all'|id, until:ts|null, exclude:[uid]|{uid:1}, uids:[uid](節點名單;沒給就用有發過文的人), minWeight:1 } */
  function buildReply(nodes, opts) {
    opts = opts || {};
    nodes = nodes || [];
    var ex = asSet(opts.exclude), inc = opts.uids ? asSet(opts.uids) : null;
    var minW = Math.max(1, opts.minWeight || 1);
    var posts = nodes.filter(function (n) {
      if (!n) return false;
      if (opts.topicId && opts.topicId !== 'all' && n.topicId !== opts.topicId) return false;
      if (opts.until && (n.date || 0) > opts.until) return false;
      return true;
    });
    var byId = {};
    posts.forEach(function (n) { byId[n.id] = n; });
    var members = {}, list = [];
    function add(u) { if (u == null || ex[u] || members[u]) return; if (inc && !inc[u]) return; members[u] = 1; list.push(u); }
    if (inc) Object.keys(inc).forEach(add);
    posts.forEach(function (n) { add(n.author); });
    var map = {}, selfReplies = 0, orphan = 0;
    posts.forEach(function (n) {
      if (!n.parentId) return;
      var p = byId[n.parentId];
      if (!p) { orphan++; return; }
      if (n.author === p.author) { selfReplies++; return; }
      if (!members[n.author] || !members[p.author]) return;
      var key = n.author + '\u0001' + p.author;
      var e = map[key] || (map[key] = { a: n.author, b: p.author, w: 0, posts: [] });
      e.w++; e.posts.push({ reply: n, parent: p });
    });
    var edges = Object.keys(map).map(function (k) { return map[k]; });
    edges.forEach(function (e) { e.posts.sort(function (x, y) { return (x.reply.date || 0) - (y.reply.date || 0); }); });
    var hidden = edges.filter(function (e) { return e.w < minW; }).length;
    edges = edges.filter(function (e) { return e.w >= minW; });
    edges.sort(function (x, y) { return (y.w - x.w) || (x.a < y.a ? -1 : x.a > y.a ? 1 : (x.b < y.b ? -1 : 1)); });
    return { nodes: list, edges: edges, selfReplies: selfReplies, orphan: orphan, hiddenEdges: hidden, postCount: posts.length };
  }

  /* 不分方向:每一對學生只留一條(兩個方向的權重分開記) */
  function undirected(g) {
    var m = {};
    g.edges.forEach(function (e) {
      var s = e.a < e.b ? e.a : e.b, t = e.a < e.b ? e.b : e.a, k = s + '\u0001' + t;
      var p = m[k] || (m[k] = { a: s, b: t, ab: 0, ba: 0, w: 0 });
      if (e.a === s) p.ab += e.w; else p.ba += e.w;
      p.w += e.w;
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  }

  function metrics(g) {
    var ids = g.nodes, n = ids.length, pairs = undirected(g), per = {};
    ids.forEach(function (u) { per[u] = { out: 0, in: 0, outDeg: 0, inDeg: 0, partners: 0, degree: 0, between: 0, close: 0, comp: -1 }; });
    g.edges.forEach(function (e) { per[e.a].out += e.w; per[e.a].outDeg++; per[e.b].in += e.w; per[e.b].inDeg++; });
    var adj = {}; ids.forEach(function (u) { adj[u] = []; });
    pairs.forEach(function (p) { adj[p.a].push(p.b); adj[p.b].push(p.a); });
    ids.forEach(function (u) { per[u].partners = adj[u].length; per[u].degree = n > 1 ? adj[u].length / (n - 1) : 0; });
    // 距離(BFS)→ 接近度、連通群
    var comps = 0;
    ids.forEach(function (s) {
      var dist = {}; dist[s] = 0; var q = [s];
      for (var i = 0; i < q.length; i++) { var v = q[i]; adj[v].forEach(function (w) { if (dist[w] === undefined) { dist[w] = dist[v] + 1; q.push(w); } }); }
      var sum = 0; q.forEach(function (v) { if (v !== s) sum += 1 / dist[v]; });
      per[s].close = n > 1 ? sum / (n - 1) : 0;
      if (per[s].comp < 0) { q.forEach(function (v) { per[v].comp = comps; }); comps++; }
    });
    // Brandes(不分方向、不看權重):每個無序點對算兩次,所以最後除以 (n-1)(n-2)
    var bt = {}; ids.forEach(function (u) { bt[u] = 0; });
    ids.forEach(function (s) {
      var stack = [], pred = {}, sigma = {}, dist = {}, q = [s];
      ids.forEach(function (u) { pred[u] = []; sigma[u] = 0; dist[u] = -1; });
      sigma[s] = 1; dist[s] = 0;
      for (var i = 0; i < q.length; i++) {
        var v = q[i]; stack.push(v);
        adj[v].forEach(function (w) {
          if (dist[w] < 0) { dist[w] = dist[v] + 1; q.push(w); }
          if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; pred[w].push(v); }
        });
      }
      var delta = {}; ids.forEach(function (u) { delta[u] = 0; });
      while (stack.length) { var w2 = stack.pop(); pred[w2].forEach(function (v2) { delta[v2] += (sigma[v2] / sigma[w2]) * (1 + delta[w2]); }); if (w2 !== s) bt[w2] += delta[w2]; }
    });
    ids.forEach(function (u) { per[u].between = n > 2 ? bt[u] / ((n - 1) * (n - 2)) : 0; });
    var both = pairs.filter(function (p) { return p.ab > 0 && p.ba > 0; }).length;
    return {
      version: VERSION, n: n, directedEdges: g.edges.length, pairs: pairs.length, replies: g.edges.reduce(function (a, e) { return a + e.w; }, 0),
      densityDirected: n > 1 ? g.edges.length / (n * (n - 1)) : 0,
      density: n > 1 ? pairs.length / (n * (n - 1) / 2) : 0,
      reciprocity: pairs.length ? both / pairs.length : 0,
      isolates: ids.filter(function (u) { return per[u].partners === 0; }),
      components: comps, per: per
    };
  }

  /* 一位學生的回覆明細(給「點節點追溯原文」用) */
  function detailOf(g, uid) {
    var sent = [], got = [];
    g.edges.forEach(function (e) {
      if (e.a === uid) e.posts.forEach(function (p) { sent.push({ with: e.b, reply: p.reply, parent: p.parent }); });
      if (e.b === uid) e.posts.forEach(function (p) { got.push({ with: e.a, reply: p.reply, parent: p.parent }); });
    });
    var cmp = function (x, y) { return (y.reply.date || 0) - (x.reply.date || 0); };
    sent.sort(cmp); got.sort(cmp);
    return { sent: sent, got: got };
  }

  var api = { VERSION: VERSION, days: days, buildReply: buildReply, undirected: undirected, metrics: metrics, detailOf: detailOf };
  global.KBNet = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
