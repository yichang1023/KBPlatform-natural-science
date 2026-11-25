/* =====================================================================
 *  KB Layout — 論壇畫布的三個小工具(純函式, 不碰畫面, 方便測試)
 *   1. arrange(nodes, dir)      最佳化排版: 依「回應關係」排成樹狀, 同一層依發言時間由先到後;
 *                               dir = 'LR'(從左到右: 想法在左, 回應往右展開) 或 'TB'(從上到下: 想法在上, 回應往下展開)
 *   2. heat(nodes)              潛力熱點: 依「有沒有帶動討論」算分(回應數、回應的人數、延伸幾層、後續有沒有改進/反例/昇華、內容有沒有推理或證據)
 *   3. clusterTopics(nodes)     語意聚類(依內容主題): 用貼文裡的詞彙相似度分成幾群, 每群用最常見的詞當名字
 *      clusterTypes(nodes)      語意聚類(依想法類型): 提問 / 延伸 / 改進 / 反例 / 昇華 各一區
 *      placeZones(groups, opts) 把分好的群排成一區一區(給畫面畫虛線框與標題)
 *  全部在本機計算, 不呼叫 AI、不耗額度; 同樣的貼文一定得到同樣的結果。
 * ===================================================================== */
(function (g) {
  'use strict';
  var TYPES = ['question', 'extend', 'improve', 'counter', 'riseabove'];
  var TYPE_ZH = { question: '提問', extend: '延伸', improve: '改進', counter: '反例', riseabove: '昇華' };
  var TYPE_EN = { question: 'Question', extend: 'Build on', improve: 'Improve', counter: 'Counter', riseabove: 'Rise Above' };
  var TYPE_COLOR = { question: '#3b82f6', extend: '#eab308', improve: '#22c55e', counter: '#ef4444', riseabove: '#a855f7' };

  function byTime(a, b) { return (a.date || 0) - (b.date || 0) || String(a.id).localeCompare(String(b.id)); }
  function text(n) { return String((n.title || '') + ' ' + (n.content || '')); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- 回應關係(森林): 沒有上一層的想法是樹根; 上一層找不到或繞圈圈的也當樹根 ---------- */
  function forest(nodes, order) {
    var byId = {}, kids = {}, roots = [], reach = {};
    nodes.forEach(function (n) { byId[n.id] = n; kids[n.id] = []; });
    nodes.forEach(function (n) { if (n.parentId && n.parentId !== n.id && byId[n.parentId]) kids[n.parentId].push(n); else roots.push(n); });
    function walk(n) { if (reach[n.id]) return; reach[n.id] = 1; kids[n.id].forEach(walk); }
    roots.forEach(walk);
    nodes.slice().sort(byTime).forEach(function (n) {   // 繞圈圈的(甲回應乙、乙又回應甲): 最早的那則剪斷它和上一層的連結, 當樹根
      if (reach[n.id]) return;
      var p = byId[n.parentId]; if (p) kids[p.id] = kids[p.id].filter(function (c) { return c !== n; });
      roots.push(n); walk(n);
    });
    roots.sort(byTime); Object.keys(kids).forEach(function (k) { kids[k].sort(byTime); });
    if (order) Object.keys(order).forEach(function (pid) {   // 指定的回應順序(規則算的或 AI 建議的)蓋過時間順序; 沒被指定到的排在後面, 仍依時間
      var want = order[pid], idx = {}; if (!kids[pid] || !Array.isArray(want)) return;
      want.forEach(function (id, i) { if (idx[id] === undefined) idx[id] = i; });
      kids[pid] = kids[pid].filter(function (c) { return idx[c.id] !== undefined; }).sort(function (a, b) { return idx[a.id] - idx[b.id]; }).concat(kids[pid].filter(function (c) { return idx[c.id] === undefined; }));
    });
    return { byId: byId, kids: kids, roots: roots };
  }

  /* ---------- 1. 最佳化排版(脈絡式泳道) ----------
   * 參考第一到第五組現有的「從左到右」: 一條討論像一條脈絡, 每回應一層就往右一格;
   *  - 一則想法的「第一則回應」(最早的那則)接在自己的同一排後面, 脈絡才連得起來、箭頭是一條直線;
   *  - 其他的回應(分支)才拉到上方或下方另一排, 每一排只要中間有空位就重複使用, 所以整張圖很緊湊;
   *  - 同一排裡不同的脈絡中間至少空一格, 不會看起來像接在一起.
   * 同一層依發言時間排, 越早的分支越靠近它的上一則. 和現有排法的差別: 卡片之間留足間距(不重疊), 箭頭不會穿過卡片.
   * dir = 'LR'(從左到右: 層往右、排往下) 或 'TB'(從上到下: 層往下、排往右, 同樣的邏輯轉個方向)
   * opts = { w, h, x0, y0, gapAlong(層與層的空隙), gapAcross(排與排的空隙) }; 回傳 { targets, width, height, dir, trees, lanes } */
  // 想法牆: 一則想法底下有 WALL.min 則以上「只有一則、沒人再回應」的回應時, 把它們收成一個整齊的方格(小卡 + 外框), 不要各占一排
  var WALL = { w: 208, h: 84, gap: 10, pad: 14, head: 30, min: 5 };
  // n 張小卡要排成幾欄才最省位置(以排版格子數計); 回傳 { cols, rows, bw, bh, ca(沿著走向佔幾格), cx(橫跨幾格) }
  function wallShape(n, dir, alongStep, acrossStep, gapAlong, gapAcross) {
    var best = null;
    for (var c = 1; c <= Math.min(8, n); c++) {
      var r = Math.ceil(n / c), bw = c * WALL.w + (c - 1) * WALL.gap + WALL.pad * 2, bh = r * WALL.h + (r - 1) * WALL.gap + WALL.pad + WALL.head;
      var L = dir === 'LR' ? bw : bh, T = dir === 'LR' ? bh : bw;
      var ca = Math.max(1, Math.ceil((L + gapAlong) / alongStep)), cx = Math.max(1, Math.ceil((T + gapAcross) / acrossStep));
      var score = ca * alongStep * cx * acrossStep * (1 + 0.6 * Math.abs(Math.log(bw / bh / 1.6)));   // 佔的面積越小越好, 形狀越接近 1.6:1 的橫式越好
      if (!best || score < best.score) best = { score: score, cols: c, rows: r, bw: bw, bh: bh, ca: ca, cx: cx };
    }
    return best;
  }
  function arrange(nodes, dir, opts) {
    opts = opts || {}; dir = dir === 'TB' ? 'TB' : 'LR';
    var w = opts.w || 288, h = opts.h || 182, x0 = opts.x0 == null ? 80 : opts.x0, y0 = opts.y0 == null ? 80 : opts.y0;
    var gapAlong = opts.gapAlong == null ? 64 : opts.gapAlong, gapAcross = opts.gapAcross == null ? 44 : opts.gapAcross;
    var alongStep = (dir === 'LR' ? w : h) + gapAlong, acrossStep = (dir === 'LR' ? h : w) + gapAcross;
    var f = forest(nodes, opts.order), depth = {}, rowOf = {}, bands = [], i;
    // 想法牆: 先把「只有一則、沒人再回應」的回應從樹裡拿出來(依原本是不是葉子判斷, 不受拿出來之後的影響)
    var wallOf = {}, wallKey = {}, orphan = [], isLeaf = {};
    Object.keys(f.kids).forEach(function (k) { isLeaf[k] = f.kids[k].length === 0; });
    if (opts.wall !== false) {
      Object.keys(f.kids).forEach(function (pid) {
        var leaves = f.kids[pid].filter(function (c) { return isLeaf[c.id]; });
        if (leaves.length >= WALL.min) { wallOf[pid] = leaves; leaves.forEach(function (l) { wallKey[l.id] = pid; }); f.kids[pid] = f.kids[pid].filter(function (c) { return !isLeaf[c.id]; }); }
      });
      var lone = f.roots.filter(function (r) { return isLeaf[r.id]; });   // 沒有人回應的獨立想法
      if (lone.length >= WALL.min) { orphan = lone; lone.forEach(function (l) { wallKey[l.id] = '_orphans'; }); f.roots = f.roots.filter(function (r) { return !wallKey[r.id]; }); }
    }
    // 每個節點的層(深度): 由樹根往下, 不用遞迴(脈絡可能有上百層)
    f.roots.forEach(function (r) { var st = [[r, 0]]; while (st.length) { var it = st.pop(); depth[it[0].id] = it[1]; f.kids[it[0].id].forEach(function (c) { st.push([c, it[1] + 1]); }); } });
    function chainEnd(n) { var d = depth[n.id], cur = n; while (f.kids[cur.id].length) { cur = f.kids[cur.id][0]; d = depth[cur.id]; } return d; }   // 沿著「第一則回應」走到底
    var shapeCache = {};
    function shapeFor(n) { return shapeCache[n] || (shapeCache[n] = wallShape(n, dir, alongStep, acrossStep, gapAlong, gapAcross)); }
    f.roots.forEach(function (root) {
      // 這棵樹裡所有「脈絡的起點」: 樹根, 加上每個節點的第二則(含)以後的回應; 由淺到深、同層依時間處理; 想法牆排在同一層的最後
      var starts = [{ n: root, parent: null, sib: 0 }], st2 = [root], wallsHere = [];
      while (st2.length) {
        var p = st2.pop();
        f.kids[p.id].forEach(function (c, k) { if (k > 0) starts.push({ n: c, parent: p, sib: k - 1 }); st2.push(c); });
        if (wallOf[p.id]) starts.push({ wall: true, p: p, a: depth[p.id] + 1 });
      }
      starts.sort(function (a, b) { var da = a.wall ? a.a : depth[a.n.id], db = b.wall ? b.a : depth[b.n.id]; return da - db || (a.wall ? 1 : 0) - (b.wall ? 1 : 0) || (a.wall || b.wall ? 0 : byTime(a.n, b.n)); });
      var occ = {};   // row → [[from, to], ...] 這一排已被占用的層範圍
      function free(row, a, b) { var list = occ[row] || []; for (var q = 0; q < list.length; q++) if (a <= list[q][1] + 1 && list[q][0] <= b + 1) return false; return true; }   // 前後各留一格空隙
      function freeStrict(row, a, b) { var list = occ[row] || []; for (var q = 0; q < list.length; q++) if (a <= list[q][1] && list[q][0] <= b) return false; return true; }   // 想法牆: 可以緊接在來源想法後面
      var minRow = 0, maxRow = 0, wallAlong = 0;
      starts.forEach(function (s) {
        if (s.wall) {
          var shp = shapeFor(wallOf[s.p.id].length), a0 = s.a, b0 = a0 + shp.ca - 1, k = shp.cx, t = rowOf[s.p.id] - Math.floor((k - 1) / 2), r0 = null;
          function okAt(r) { for (var q = 0; q < k; q++) if (!freeStrict(r + q, a0, b0)) return false; return true; }
          for (var d = 0; r0 === null; d++) { if (okAt(t + d)) r0 = t + d; else if (d && okAt(t - d)) r0 = t - d; }   // 先放在來源想法旁邊(置中), 被占了就往下、往上找最近的空位
          for (var q = 0; q < k; q++) (occ[r0 + q] = occ[r0 + q] || []).push([a0, b0]);
          wallsHere.push({ key: s.p.id, a: a0, row: r0, members: wallOf[s.p.id], shp: shp });
          minRow = Math.min(minRow, r0); maxRow = Math.max(maxRow, r0 + k - 1); wallAlong = Math.max(wallAlong, b0);
          return;
        }
        var a = depth[s.n.id], b = chainEnd(s.n), row;
        if (!s.parent) row = 0;
        else {
          var base = rowOf[s.parent.id], pref = s.sib % 2 === 0 ? 1 : -1;   // 第二則回應優先放下方, 第三則放上方, 依序交替; 離上一則最近的空排
          for (var k2 = 1; ; k2++) {
            var c1 = base + pref * k2, c2 = base - pref * k2;
            if (free(c1, a, b)) { row = c1; break; }
            if (free(c2, a, b)) { row = c2; break; }
          }
        }
        (occ[row] = occ[row] || []).push([a, b]);
        var cur = s.n; while (cur) { rowOf[cur.id] = row; cur = f.kids[cur.id][0]; }
        minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
      });
      bands.push({ root: root, minRow: minRow, maxRow: maxRow, wallAlong: wallAlong, walls: wallsHere });
    });
    if (orphan.length) {   // 沒人回應的獨立想法: 自己一個區塊(一面想法牆), 排在最後
      var os = shapeFor(orphan.length);
      bands.push({ root: null, minRow: 0, maxRow: os.cx - 1, wallAlong: os.ca - 1, walls: [{ key: '_orphans', a: 0, row: 0, members: orphan, shp: os }] });
    }
    // 每棵樹各佔一個「區塊」; 再把所有區塊像拼圖一樣折行排進一個接近畫面比例的長方形(不要全部串成一長條, 才不用一直往右或往下拉)
    var bandOf = {};
    bands.forEach(function (bd) {
      bd.maxAlong = bd.wallAlong || 0;
      if (bd.root) { var st = [bd.root]; while (st.length) { var n = st.pop(); bd.maxAlong = Math.max(bd.maxAlong, depth[n.id]); bandOf[n.id] = bd; f.kids[n.id].forEach(function (c) { st.push(c); }); } }
      bd.rows = bd.maxRow - bd.minRow + 1;
      var a = bd.maxAlong * alongStep, c2 = (bd.rows - 1) * acrossStep;
      bd.bw = dir === 'LR' ? a + w : c2 + w; bd.bh = dir === 'LR' ? c2 + h : a + h;
    });
    var gx = opts.blockGapX == null ? 72 : opts.blockGapX, gy = opts.blockGapY == null ? 52 : opts.blockGapY, aspect = opts.aspect > 0 ? opts.aspect : 1.6;
    // 排版的「走向」要和名稱一致: 從左到右 = 一路往右排滿一行再換下一行(像文字); 從上到下 = 一路往下排滿一欄再換到右邊的下一欄
    var LRd = dir === 'LR', gFlow = LRd ? gx : gy, gAcross = LRd ? gy : gx, aspF = LRd ? aspect : 1 / aspect;
    bands.forEach(function (bd) { bd.fl = LRd ? bd.bw : bd.bh; bd.th = LRd ? bd.bh : bd.bw; });
    function pack(limit) {
      var a = 0, b = 0, lineT = 0, F = 0, pos = [];
      bands.forEach(function (bd) { if (a > 0 && a + bd.fl > limit) { b += lineT + gAcross; a = 0; lineT = 0; } pos.push({ a: a, b: b }); a += bd.fl + gFlow; lineT = Math.max(lineT, bd.th); F = Math.max(F, a - gFlow); });
      return { pos: pos, F: F, T: b + lineT };
    }
    var best = null, areaSum = 0, minW = 0, sumW = 0;
    bands.forEach(function (bd) { areaSum += bd.fl * bd.th; minW = Math.max(minW, bd.fl); sumW += bd.fl + gFlow; });
    for (var s = 0; s <= 48; s++) {   // 試 49 種折行長度, 挑「形狀最像畫面、浪費空白最少」的
      var lim = minW * Math.pow(Math.max(1, sumW / minW), s / 48), pk = pack(lim);
      var score = Math.pow(Math.log(pk.F / pk.T) - Math.log(aspF), 2) + 0.5 * (pk.F * pk.T / Math.max(1, areaSum) - 1);
      if (!best || score < best.score - 1e-9) best = { score: score, pk: pk };
    }
    var pkd = best ? best.pk : { pos: [], F: 0, T: 0 }, maxLanes = 1;
    bands.forEach(function (bd, bi) { var q = pkd.pos[bi]; bd.px = LRd ? q.a : q.b; bd.py = LRd ? q.b : q.a; maxLanes = Math.max(maxLanes, bd.rows); });
    var pkW = LRd ? pkd.F : pkd.T, pkH = LRd ? pkd.T : pkd.F;
    var targets = [], wallFrames = [];
    nodes.forEach(function (n) {
      if (wallKey[n.id]) return;
      var bd = bandOf[n.id], along = depth[n.id], across = rowOf[n.id] - bd.minRow;
      targets.push(dir === 'LR' ? { id: n.id, x: Math.round(x0 + bd.px + along * alongStep), y: Math.round(y0 + bd.py + across * acrossStep) } : { id: n.id, x: Math.round(x0 + bd.px + across * acrossStep), y: Math.round(y0 + bd.py + along * alongStep) });
    });
    bands.forEach(function (bd) {
      bd.walls.forEach(function (wl) {
        var cx = dir === 'LR' ? x0 + bd.px + wl.a * alongStep : x0 + bd.px + (wl.row - bd.minRow) * acrossStep, cy = dir === 'LR' ? y0 + bd.py + (wl.row - bd.minRow) * acrossStep : y0 + bd.py + wl.a * alongStep;
        wl.members.slice().sort(byTime).forEach(function (m, i) {
          var cc = i % wl.shp.cols, rr = Math.floor(i / wl.shp.cols);
          targets.push({ id: m.id, x: Math.round(cx + WALL.pad + cc * (WALL.w + WALL.gap)), y: Math.round(cy + WALL.head + rr * (WALL.h + WALL.gap)), wall: wl.key });
        });
        wallFrames.push({ key: wl.key, x: Math.round(cx), y: Math.round(cy), w: wl.shp.bw, h: wl.shp.bh, count: wl.members.length });
      });
    });
    return { targets: targets, width: x0 * 2 + pkW, height: y0 * 2 + pkH, dir: dir, trees: f.roots.length, lanes: maxLanes, alongStep: alongStep, acrossStep: acrossStep, walls: wallFrames, wallIds: Object.keys(wallKey) };
  }
  function subtreeSizes(f) {
    var size = {}, order = [], st = f.roots.slice();
    while (st.length) { var n = st.pop(); order.push(n); f.kids[n.id].forEach(function (c) { st.push(c); }); }
    for (var i = order.length - 1; i >= 0; i--) { var n2 = order[i], sum = 1; f.kids[n2.id].forEach(function (c) { sum += size[c.id] || 1; }); size[n2.id] = sum; }
    return size;
  }
  function rankChildren(nodes) {
    var f = forest(nodes), size = subtreeSizes(f), order = {};
    Object.keys(f.kids).forEach(function (pid) { var ks = f.kids[pid]; if (ks.length > 1) order[pid] = ks.slice().sort(function (a, b) { return size[b.id] - size[a.id] || byTime(a, b); }).map(function (c) { return c.id; }); });
    return order;
  }
  function mainLine(nodes, order) {   // 每棵樹各一條: 從樹根一路走「第一則回應」
    var f = forest(nodes, order), out = [];
    f.roots.forEach(function (r) { var cur = r; while (cur) { out.push(cur.id); cur = f.kids[cur.id][0]; } });
    return out;
  }
  function sanitizeAi(nodes, ai, base) {
    var f = forest(nodes), order = {}, main = [], labels = [], k;
    Object.keys(base || {}).forEach(function (pid) { order[pid] = base[pid].slice(); });
    ai = ai && typeof ai === 'object' ? ai : {};
    if (ai.order && typeof ai.order === 'object') Object.keys(ai.order).forEach(function (pid) {
      if (!f.kids[pid] || !Array.isArray(ai.order[pid])) return;
      var ok = {}; f.kids[pid].forEach(function (c) { ok[c.id] = 1; });
      var seen = {}, list = ai.order[pid].filter(function (id) { if (!ok[id] || seen[id]) return false; seen[id] = 1; return true; });
      if (list.length) order[pid] = list;
    });
    if (Array.isArray(ai.main) && ai.main.length && f.byId[ai.main[0]] && f.roots.indexOf(f.byId[ai.main[0]]) >= 0) {   // 主脈絡必須從樹根出發、每一步都是上一則的回應
      main.push(ai.main[0]);
      for (k = 1; k < ai.main.length; k++) { var prev = f.byId[main[main.length - 1]], cur = f.byId[ai.main[k]]; if (!cur || !prev || cur.parentId !== prev.id || main.indexOf(cur.id) >= 0) break; main.push(cur.id); }
      for (k = 1; k < main.length; k++) { var pid2 = main[k - 1], rest = (order[pid2] || f.kids[pid2].map(function (c) { return c.id; })).filter(function (id) { return id !== main[k]; }); order[pid2] = [main[k]].concat(rest); }   // 主脈絡的每一步排在第一個(留在同一排)
    }
    if (Array.isArray(ai.labels)) ai.labels.forEach(function (x) {
      if (!x || !f.byId[x.id] || labels.length >= 10) return;
      var tx = String(x.text == null ? '' : x.text).replace(/答案/g, '想法').replace(/\s+/g, '').slice(0, 10); if (tx.length < 2) return;
      if (labels.some(function (y) { return y.id === x.id; })) return; labels.push({ id: x.id, text: tx });
    });
    return { order: order, main: main, labels: labels };
  }

  /* ---------- 2. 潛力熱點 ---------- */
  var CUE = [/因為/, /所以/, /如果|假如/, /那麼|就會/, /例如|比如|像是/, /證據|資料|數據/, /實驗|觀察|測量|實測/, /我認為|我覺得|我猜|我想/, /可能|推測|猜測/, /原因|理由/, /假設/, /不同|相反|但是|不過/];
  function descendants(id, kids) { var out = [], st = (kids[id] || []).slice(), seen = {}; while (st.length) { var n = st.pop(); if (seen[n.id]) continue; seen[n.id] = 1; out.push(n); (kids[n.id] || []).forEach(function (c) { st.push(c); }); } return out; }
  function depthBelow(id, kids, guard) { guard = guard || {}; if (guard[id]) return 0; guard[id] = 1; var m = 0; (kids[id] || []).forEach(function (c) { m = Math.max(m, 1 + depthBelow(c.id, kids, guard)); }); guard[id] = 0; return m; }
  function effLen(t) { return String(t || '').replace(/[\s,.;:!?、-〃，！？；：「-』"'()]/g, '').length; }
  // 回傳 { scores: { id: { score(0~100), hot(true/false), reasons[] } }, hotIds[] }
  function heat(nodes, opts) {
    opts = opts || {}; var f = forest(nodes), scores = {}, list = [];
    nodes.forEach(function (n) {
      var ds = descendants(n.id, f.kids), direct = f.kids[n.id].length, people = {}, types = {}, reasons = [];
      ds.forEach(function (d) { if (d.author && d.author !== n.author) people[d.author] = 1; types[d.type] = 1; });
      var np = Object.keys(people).length, dep = depthBelow(n.id, f.kids), deep = ['improve', 'counter', 'riseabove'].filter(function (t) { return types[t]; });
      var sc = Math.min(30, direct * 12) + Math.min(20, np * 8) + Math.min(15, dep * 7) + Math.min(12, deep.length * 4);
      var t = text(n), cues = CUE.filter(function (re) { return re.test(t); }).length, len = effLen(t);
      sc += Math.min(10, Math.floor(len / 12)) + Math.min(8, cues * 2);
      if (n.type === 'riseabove') sc += 8; else if (n.type === 'improve') sc += 5;
      if (n.parentId && direct > 0) sc += 5;   // 既回應別人、又被別人回應: 銜接討論的橋
      sc = clamp(Math.round(sc), 0, 100);
      if (direct) reasons.push('有 ' + direct + ' 則直接回應');
      if (np >= 2) reasons.push('共 ' + np + ' 位同學回應'); else if (np === 1) reasons.push('有同學回應');
      if (dep >= 2) reasons.push('一路延伸了 ' + dep + ' 層');
      if (deep.length) reasons.push('後續出現' + deep.map(function (k) { return TYPE_ZH[k]; }).join('、'));
      if (cues >= 2 || len >= 60) reasons.push('內容有想法的依據或推理');
      if (n.type === 'riseabove') reasons.push('整合了大家的討論');
      scores[n.id] = { score: sc, hot: false, reasons: reasons, direct: direct, people: np, depth: dep };
      list.push({ id: n.id, score: sc, date: n.date || 0 });
    });
    return { scores: scores, hotIds: pickHot(scores, nodes, opts) };
  }
  // 熱點 = 分數不低(≥45) 而且排在前 30%; 篩選條件只用這一條(條件多了容易誤判), 並把原因列出來讓人檢查. AI 複核後改了分數, 也用同一條重新挑.
  function pickHot(scores, nodes, opts) {
    opts = opts || {}; var dates = {}, hotIds = [];
    nodes.forEach(function (n) { dates[n.id] = n.date || 0; });
    var list = Object.keys(scores).map(function (id) { scores[id].hot = false; return { id: id, score: scores[id].score, date: dates[id] || 0 }; });
    list.sort(function (a, b) { return b.score - a.score || a.date - b.date; });
    var cap = Math.max(1, Math.ceil(list.length * (opts.top || 0.3)));
    list.forEach(function (x, i) { if (i < cap && x.score >= (opts.min == null ? 45 : opts.min)) { scores[x.id].hot = true; hotIds.push(x.id); } });
    return hotIds;
  }

  /* ---------- 3. 語意聚類 ---------- */
  var STOP = {};
  ('我們,你們,他們,她們,這個,那個,什麼,為什麼,因為,所以,但是,可是,如果,覺得,可以,一個,就是,還有,已經,沒有,不是,知道,怎麼,自己,大家,同學,然後,而且,或是,或者,還是,可能,應該,比較,非常,真的,一些,這樣,那樣,這些,那些,有些,以及,關於,所有,其實,另外,而是,不過,只是,不會,不能,會不會,是不是,的話,時候,現在,之後,之前,這麼,那麼,為了,由於,能夠,需要,認為,我認為,我覺得,想要,想到,看到,以後,後來,例如,比如,像是,不同,同樣,而已,我想,我猜,請問,請問大家,謝謝,哈哈,但是我,所以我,因為我,如果我,我會,我們的,他的,她的,它的,你的,我的,一下,一樣,有的,是因為,還要,就會,就能,也是,也會,也有,也不,都是,都會,都有,只有,只要,不要,不過是').split(',').forEach(function (w) { STOP[w] = 1; });
  var SEG = null; try { if (g.Intl && g.Intl.Segmenter) SEG = new g.Intl.Segmenter('zh', { granularity: 'word' }); } catch (e) { SEG = null; }
  function words(t) {
    t = String(t || '').toLowerCase(); var out = [], m;
    if (SEG) { try { var it = SEG.segment(t); for (var s of it) { if (s.isWordLike && /^[一-鿿a-z0-9]{2,8}$/.test(s.segment) && !STOP[s.segment]) out.push(s.segment); } } catch (e) {} }
    if (!out.length) { var runs = t.match(/[一-鿿]+/g) || []; runs.forEach(function (r) { for (var i = 0; i + 2 <= r.length; i++) { var b = r.slice(i, i + 2); if (!STOP[b]) out.push(b); } }); (t.match(/[a-z]{3,}/g) || []).forEach(function (e) { out.push(e); }); }
    return out;
  }
  function model(nodes) {
    var docs = nodes.map(function (n) { var tf = {}; words(text(n)).forEach(function (w) { tf[w] = (tf[w] || 0) + 1; }); return tf; }), df = {}, N = nodes.length;
    docs.forEach(function (tf) { Object.keys(tf).forEach(function (w) { df[w] = (df[w] || 0) + 1; }); });
    var vecs = docs.map(function (tf) { var v = {}, norm = 0; Object.keys(tf).forEach(function (w) { if (N >= 6 && df[w] > N * 0.7) return; var x = (1 + Math.log(tf[w])) * (Math.log((N + 1) / (df[w] + 1)) + 1); v[w] = x; norm += x * x; }); norm = Math.sqrt(norm) || 1; Object.keys(v).forEach(function (w) { v[w] /= norm; }); return v; });
    return { vecs: vecs, df: df, N: N };
  }
  function dot(a, b) { var s = 0, k; for (k in a) if (b[k]) s += a[k] * b[k]; return s; }
  function centroid(members, vecs) { var c = {}, k; members.forEach(function (i) { for (k in vecs[i]) c[k] = (c[k] || 0) + vecs[i][k]; }); var norm = 0; for (k in c) norm += c[k] * c[k]; norm = Math.sqrt(norm) || 1; for (k in c) c[k] /= norm; return c; }
  function topWords(members, vecs, n) {
    var sc = {}, k; members.forEach(function (i) { for (k in vecs[i]) sc[k] = (sc[k] || 0) + vecs[i][k]; });
    var ws = Object.keys(sc).sort(function (a, b) { return sc[b] - sc[a] || a.localeCompare(b); }), out = [];
    ws.forEach(function (w) { if (out.length >= n) return; if (out.some(function (o) { return o.indexOf(w) >= 0 || w.indexOf(o) >= 0; })) return; out.push(w); });
    return out;
  }
  // 依內容主題分群: nodes 少於 4 則就全部放一區; 回傳 { groups:[{ key, title, keywords[], ids[] }] }
  function clusterTopics(nodes, opts) {
    opts = opts || {}; var N = nodes.length;
    if (N < 4) return { groups: [{ key: 't0', title: '全部想法', keywords: [], ids: nodes.slice().sort(byTime).map(function (n) { return n.id; }) }] };
    var m = model(nodes), k = opts.k || clamp(Math.round(Math.sqrt(N / 1.5)), 2, 6), cl = nodes.map(function (n, i) { return [i]; });
    // 同一串討論(同一個樹根底下)的想法通常談同一件事: 貼文都很短, 光看用詞會不準, 所以相似度再加上「是不是同一串」
    var fr = forest(nodes), rootOf = {}; fr.roots.forEach(function (r) { (function mk(n) { rootOf[n.id] = r.id; fr.kids[n.id].forEach(mk); })(r); });
    function sim(a, b) { var s = 0, c = 0, same = 0; a.forEach(function (i) { b.forEach(function (j) { s += dot(m.vecs[i], m.vecs[j]); if (rootOf[nodes[i].id] === rootOf[nodes[j].id]) same++; c++; }); }); return c ? s / c + 0.4 * (same / c) : 0; }   // 平均連結
    while (cl.length > k) {
      var bi = 0, bj = 1, best = -1;
      for (var i = 0; i < cl.length; i++) for (var j = i + 1; j < cl.length; j++) { var s = sim(cl[i], cl[j]) + (cl[i].length + cl[j].length) * 1e-4 * -1; if (s > best) { best = s; bi = i; bj = j; } }
      cl[bi] = cl[bi].concat(cl[bj]); cl.splice(bj, 1);
    }
    // 只有 1 則的小群併到最像它的那群(不要留一堆孤單的框)
    var again = true;
    while (again && cl.length > 2) {
      again = false;
      for (var q = 0; q < cl.length; q++) if (cl[q].length === 1) {
        var bestJ = -1, bs = -1; for (var r = 0; r < cl.length; r++) if (r !== q) { var ss = sim(cl[q], cl[r]); if (ss > bs) { bs = ss; bestJ = r; } }
        if (bestJ >= 0) { cl[bestJ] = cl[bestJ].concat(cl[q]); cl.splice(q, 1); again = true; break; }
      }
    }
    var groups = cl.map(function (mem, gi) {
      var kw = topWords(mem, m.vecs, 3), ids = mem.map(function (i) { return nodes[i]; }).sort(byTime).map(function (n) { return n.id; });
      return { key: 't' + gi, title: kw.length ? kw.join('・') : '其他想法', keywords: kw, ids: ids };
    });
    groups.sort(function (a, b) { return b.ids.length - a.ids.length || a.title.localeCompare(b.title); });
    groups.forEach(function (gr, i) { gr.key = 't' + i; });
    return { groups: groups };
  }
  // 依想法類型分區(提問、延伸、改進、反例、昇華); 沒有貼文的類型也留一區(空的), 方便看出哪一類還沒有人寫
  function clusterTypes(nodes) {
    var groups = TYPES.map(function (t) { return { key: t, type: t, title: TYPE_ZH[t] + ' ' + TYPE_EN[t], keywords: [], color: TYPE_COLOR[t], ids: nodes.filter(function (n) { return n.type === t; }).sort(byTime).map(function (n) { return n.id; }) }; });
    var known = {}; TYPES.forEach(function (t) { known[t] = 1; });
    var other = nodes.filter(function (n) { return !known[n.type]; }).sort(byTime).map(function (n) { return n.id; });
    if (other.length) groups.push({ key: 'other', title: '其他', keywords: [], color: '#64748b', ids: other });
    return { groups: groups };
  }
  // 把一區一區排開: type 分區 = 一排由左到右(一類一欄); 主題分區 = 每排最多 3 區. 回傳 { targets, zones:[{x,y,width,height,title,color,count}], width, height }
  function placeZones(groups, opts) {
    opts = opts || {}; var w = opts.w || 288, h = opts.h || 170, gx = opts.gapX == null ? 36 : opts.gapX, gy = opts.gapY == null ? 36 : opts.gapY, pad = 40, head = 76, x0 = opts.x0 == null ? 80 : opts.x0, y0 = opts.y0 == null ? 80 : opts.y0;
    var perRow = opts.perRow || 3, targets = [], zones = [], maxColsPer = opts.maxCols || 2, rowsOut = [], cur = [];
    groups.forEach(function (gr) { var cols = Math.max(1, Math.min(maxColsPer, Math.ceil(Math.sqrt(Math.max(1, gr.ids.length)))) ); gr._cols = cols; gr._rows = Math.max(1, Math.ceil(gr.ids.length / cols)); });
    if (opts.oneRow) rowsOut = [groups.slice()]; else groups.forEach(function (gr) { cur.push(gr); if (cur.length === perRow) { rowsOut.push(cur); cur = []; } }); if (cur.length) rowsOut.push(cur);
    var y = y0, totalW = 0;
    rowsOut.forEach(function (row) {
      var x = x0, rowH = 0;
      row.forEach(function (gr) {
        var zw = gr._cols * w + (gr._cols - 1) * gx + pad * 2, zh = head + gr._rows * h + (gr._rows - 1) * gy + pad;
        gr.ids.forEach(function (id, i) { targets.push({ id: id, x: Math.round(x + pad + (i % gr._cols) * (w + gx)), y: Math.round(y + head + Math.floor(i / gr._cols) * (h + gy)) }); });
        zones.push({ key: gr.key, x: x, y: y, width: zw, height: zh, title: gr.title, color: gr.color || '', count: gr.ids.length });
        x += zw + 60; rowH = Math.max(rowH, zh);
      });
      totalW = Math.max(totalW, x); y += rowH + 60;
    });
    return { targets: targets, zones: zones, width: totalW, height: y };
  }

  // 新貼文要放的位置: 從想放的地方(x, y)開始, 如果那裡已經有別張卡片(或太靠近), 就依序往旁邊、往下找最近的空位, 不會疊在一起
  function freeSpot(nodes, x, y, opts) {
    opts = opts || {}; var sx = (opts.w || 288) + (opts.gapX == null ? 28 : opts.gapX), sy = (opts.h || 182) + (opts.gapY == null ? 28 : opts.gapY);
    var list = (nodes || []).filter(function (n) { return n && isFinite(n.x) && isFinite(n.y); });
    function free(cx, cy) { for (var i = 0; i < list.length; i++) { if (Math.abs(list[i].x - cx) < sx && Math.abs(list[i].y - cy) < sy) return false; } return true; }
    if (free(x, y)) return { x: x, y: y, moved: false };
    var cand = [];
    for (var r = 0; r <= 10; r++) for (var c = -10; c <= 10; c++) cand.push({ c: c, r: r, d: Math.pow(c * sx, 2) + Math.pow(r * sy, 2) });
    cand.sort(function (a, b) { return a.d - b.d || b.c - a.c || a.r - b.r; });   // 一樣近時, 先往右、再往下
    for (var k = 0; k < cand.length; k++) { var px = x + cand[k].c * sx, py = y + cand[k].r * sy; if (free(px, py)) return { x: px, y: py, moved: true }; }
    return { x: x, y: y + (list.length + 1) * sy, moved: true };
  }

  g.KBLayout = { rankChildren: rankChildren, mainLine: mainLine, sanitizeAi: sanitizeAi, subtreeSizes: function (nodes) { return subtreeSizes(forest(nodes)); }, arrange: arrange, WALL: WALL, heat: heat, pickHot: pickHot, clusterTopics: clusterTopics, clusterTypes: clusterTypes, placeZones: placeZones, freeSpot: freeSpot, forest: forest, TYPES: TYPES, TYPE_ZH: TYPE_ZH, words: words };
})(typeof window !== 'undefined' ? window : globalThis);
