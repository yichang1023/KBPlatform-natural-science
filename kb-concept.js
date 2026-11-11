/* =====================================================================
 *  KB Concept — 我的概念雲演化(學生分析頁)
 *  把學生說過的想法,變成一朵「看得見成長」的雲:
 *    - 雲會隨日子長大;詞越大 = 用越多次;詞的顏色 = 這個想法現在的狀態(提問中/被延伸/改進中/被質疑/已整合)
 *    - 常一起出現的詞用「資料線」連起來;滑鼠移上去/點一下,會出現訊息泡泡,點「看完整故事」到故事卡
 *    - 故事卡:這個詞怎麼一路變過來(每則貼文、同學的回應、證據、下一步),每一則都能回到原貼文
 *    - 可以用滾輪、按鈕放大縮小,拖曳移動,按「還原」回到原來的樣子
 *  資料全部來自論壇貼文,不需要 AI。
 *  用法:KBConcept.build(opts) 產生模型;KBConcept.create(host, model, opts) 畫出來,回傳 { render(step), select(詞), ... }
 * ===================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;

  /* ---------- 詞庫(國小自然/社會議題)與停用詞 ---------- */
  var LEX = ['光', '光線', '直線前進', '反射', '折射', '鏡子', '平面鏡', '凸透鏡', '凹透鏡', '放大鏡', '影子', '太陽', '太陽能', '光源', '透明', '彩虹', '三稜鏡', '光合作用',
    '能源', '能量', '能量轉換', '電能', '熱能', '動能', '風力', '水力發電', '火力發電', '核能', '再生能源', '節能', '省電', '發電', '燃料', '石油', '煤炭', '天然氣',
    '水循環', '蒸發', '凝結', '降雨', '下雨', '雲', '露水', '冰', '水蒸氣', '溫度', '溫度計', '氣溫', '氣壓', '颱風', '鋒面', '天氣', '季節', '濕度', '溫室效應', '全球暖化', '氣候變遷', '乾旱', '水庫',
    '電', '電流', '電路', '串聯', '並聯', '電池', '燈泡', '開關', '導線', '導體', '絕緣體', '電壓', '電阻', '磁鐵', '磁力', '磁場', '磁極', '電磁鐵', '指北針', '磁性', '靜電', '閃電', '馬達', '發電機',
    '減塑', '塑膠', '塑膠袋', '吸管', '寶特瓶', '回收', '資源回收', '垃圾分類', '廚餘', '環保', '海洋', '微塑膠', '分解', '永續', '減量', '重複使用', '垃圾', '污染', '汙染',
    '3C', '手機', '平板', '電腦', '螢幕', '網路', '上網', '遊戲', '近視', '視力', '用眼', '沉迷', '網路安全', '隱私', '詐騙', '社群', '影片', '睡眠', '運動',
    '空氣', '速度', '水', '實驗', '觀察', '證據', '假設', '原因', '結果'];
  var LEXSET = {}; LEX.forEach(function (w) { LEXSET[w] = 1; });
  var STOP = {};
  ('我們,你們,他們,她們,這個,那個,什麼,為什麼,因為,所以,但是,可是,如果,覺得,可以,一個,就是,還有,已經,沒有,不是,知道,怎麼,自己,大家,同學,然後,而且,不過,其實,可能,應該,需要,比較,真的,非常,很多,一些,這樣,那樣,這些,那些,如何,是否,還是,或是,以及,關於,對於,現在,以前,之後,之前,時候,地方,問題,想法,觀點,我的,你的,他的,同意,不同意,補充,改進,反駁,整合,提問,延伸,昇華,一下,有些,有的,每個,所有,今天,昨天,老師,因此,另外,例如,比如,雖然,不會,會不會,是不是,有沒有,能不能,我想,我覺得,我認為,我發現,我會,他會,它會,也是,也會,都是,都會,還可以,可是我,這麼,那麼,一樣,一直,一起,一定,不能,不要,不同,等等,的話,的時候,看到,看起來,變成,出來,起來,下來,上面,下面,裡面,外面,後面,前面,什麼樣,怎樣,多少,幾個,第一,第二,首先,其次,最後,因為所以,學生,回應,我是,他是,你是,這是,那是,也是,而是,即是,有人,別人,其他,其它,對方,部分,方面,情況,時間,東西,事情,人家,每天,以後,之間,之中,認為,表示,提到,討論,分享,參考,提出,說明,告訴,希望,喜歡,討厭,開始,結束,繼續,必須,常常,經常,通常,也許,或許,大概,當然,於是,並且,及其,此外,同時,總之,以為,其中,一種,這種,那種,有些人,很好,很大,很小,不過我,我想要,他說,她說,我說,你說,大家都,看看,想想,說說,做做').split(',').forEach(function (w) { STOP[w] = 1; });
  var SEG = null; try { if (global.Intl && global.Intl.Segmenter) SEG = new global.Intl.Segmenter('zh', { granularity: 'word' }); } catch (e) { SEG = null; }
  var EVID_RE = /(實驗|觀察|實測|測量|量到|量了|資料|查到|查了|書上|網站|數據|證據|紀錄|記錄|研究|報告|做了|測試)/;
  var TYPE_NAME = { question: '提問', extend: '延伸', improve: '改進', counter: '反例', riseabove: '昇華' };
  var TYPE_KEY = { question: 'q', extend: 'e', improve: 'i', counter: 'c', riseabove: 'r' };
  var STATE_NAME = { q: '提問中', e: '被延伸', i: '改進中', c: '被質疑', r: '已整合' };
  var STATE_MSG = { q: '這是你提出的問題,等同學來回應。', e: '有人接續你的想法了!', i: '你用實驗或資料把想法改進了。', c: '同學提出不同的看法,正等你回應。', r: '你把它整合成更大的結論了!' };
  var STATE_NEXT = { q: '試著寫一則「延伸」:說說你的想法或猜測。', e: '試著用「改進」讓想法更準確:做一個小實驗,或找一份資料來支持。', i: '試著用「昇華」:把它和其他詞連起來,寫成一個更大的結論。', c: '同學提出了不同的看法,先回應他:你同意嗎?用實驗或資料說明。', r: '你已經把它整合起來了!可以去看看同學的想法,幫他們檢查。' };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ---------- 從貼文找出概念詞 ---------- */
  var TERM_OK = /^[㐀-鿿A-Za-z0-9]{2,6}$/;
  function tokens(text) {
    var out = [];
    if (SEG) { for (var s of SEG.segment(String(text))) { if (s.isWordLike && TERM_OK.test(s.segment) && !/^[0-9]+$/.test(s.segment)) out.push(s.segment); } }
    else { (String(text).match(/[㐀-鿿]{2,4}/g) || []).forEach(function (w) { out.push(w); }); }
    return out;
  }
  function snippetOf(post, term) {
    var text = String(post.content || ''), sents = text.split(/[。!?!?\n]/), pick = '';
    for (var i = 0; i < sents.length; i++) { if (sents[i].indexOf(term) >= 0 && sents[i].trim()) { pick = sents[i].trim(); break; } }
    if (!pick) pick = String(post.title || text).trim();
    return pick.length > 60 ? pick.slice(0, 58) + '…' : pick;
  }

  /* build(opts):opts = { nodes:[{id,topicId,type,title,content,author,parentId,date}], userId, step(date)→1..K, name(authorId)→顯示名稱, topics:[{id,name,desc}], max }
     回傳模型:{ concepts:[{t,posts:[{id,topicId,step,ty,text,evid,rep:[{id,step,ty,by,text}]}],first,count}], links:[{a,b,posts:[{step}]}], K, stateAt, turningAt, ... } */
  function build(o) {
    var nodes = o.nodes || [], uid = String(o.userId), K = 0, stepMap = {};
    function stepOf(n) { if (stepMap[n.id] === undefined) stepMap[n.id] = o.step ? o.step(n.date) : 1; return stepMap[n.id]; }
    var mine = nodes.filter(function (n) { return String(n.author) === uid; }).sort(function (a, b) { return (new Date(a.date) - new Date(b.date)) || (String(a.id) < String(b.id) ? -1 : 1); });
    nodes.forEach(function (n) { var s = stepOf(n); if (s > K) K = s; });
    var topicWords = {};
    (o.topics || []).forEach(function (t) { tokens((t.name || '') + ' ' + (t.desc || '')).forEach(function (w) { topicWords[w] = 1; }); });
    var df = {}, firstStep = {}, postsOf = {};
    mine.forEach(function (n) {
      var text = String(n.title || '') + ' ' + String(n.content || ''), seen = {};
      tokens(text).forEach(function (w) { if (!STOP[w]) seen[w] = 1; });
      LEX.forEach(function (w) { if (w.length >= 1 && text.indexOf(w) >= 0 && (w.length >= 2 || /[光水電雲]/.test(w))) seen[w] = 1; });
      Object.keys(seen).forEach(function (w) { df[w] = (df[w] || 0) + 1; (postsOf[w] = postsOf[w] || []).push(n); if (firstStep[w] === undefined) firstStep[w] = stepOf(n); });
    });
    var cand = Object.keys(df).filter(function (w) { return !STOP[w] && !/^[我你他她它]/.test(w) && (LEXSET[w] || topicWords[w] || df[w] >= 3); });
    cand.sort(function (a, b) { var sa = df[a] * (LEXSET[a] ? 3 : 1) + (topicWords[a] ? 2 : 0), sb = df[b] * (LEXSET[b] ? 3 : 1) + (topicWords[b] ? 2 : 0); return (sb - sa) || (firstStep[a] - firstStep[b]) || (a < b ? -1 : 1); });
    var picked = [], freeN = 0;
    cand.forEach(function (w) {
      if (picked.length >= (o.max || 12)) return;
      if (!LEXSET[w] && !topicWords[w] && freeN >= 4) return;   // 詞庫以外的詞最多 4 個,避免一堆沒意義的字
      // 太像的詞只留一個:一個詞完全包含在另一個詞裡、而且出現的貼文一樣多
      if (picked.some(function (p) { return (p.indexOf(w) >= 0 || w.indexOf(p) >= 0) && df[p] === df[w]; })) return;
      if (!LEXSET[w] && !topicWords[w]) freeN++;
      picked.push(w);
    });
    var concepts = picked.map(function (w) {
      var posts = postsOf[w].map(function (n) {
        var reps = nodes.filter(function (r) { return r.parentId === n.id && String(r.author) !== uid; }).map(function (r) { return { id: r.id, step: stepOf(r), ty: TYPE_KEY[r.type] || 'e', by: o.name ? o.name(r.author) : '同學', text: snippetOf(r, w) }; }).sort(function (a, b) { return a.step - b.step; });
        return { id: n.id, topicId: n.topicId, step: stepOf(n), ty: TYPE_KEY[n.type] || 'e', text: snippetOf(n, w), evid: EVID_RE.test(String(n.title || '') + ' ' + String(n.content || '')), rep: reps };
      }).sort(function (a, b) { return a.step - b.step; });
      return { t: w, posts: posts, first: posts[0].step, count: posts.length, lex: !!LEXSET[w] };
    });
    var links = [];
    for (var i = 0; i < concepts.length; i++) for (var j = i + 1; j < concepts.length; j++) {
      var ids = {}; concepts[i].posts.forEach(function (p) { ids[p.id] = p.step; });
      var shared = concepts[j].posts.filter(function (p) { return ids[p.id] !== undefined; });
      if (shared.length) links.push({ a: concepts[i].t, b: concepts[j].t, posts: shared.map(function (p) { return { step: p.step }; }) });
    }
    var m = { concepts: concepts, links: links, K: Math.max(K, 1), userId: uid, totalPosts: mine.length };
    m.visible = function (c, k) { return c.posts.some(function (p) { return p.step <= k; }); };
    m.postsAt = function (c, k) { return c.posts.filter(function (p) { return p.step <= k; }); };
    m.stateAt = function (c, k) {
      var ps = m.postsAt(c, k); if (!ps.length) return null;
      var has = function (t) { return ps.some(function (p) { return p.ty === t; }); }, un = false;
      ps.forEach(function (p) { p.rep.forEach(function (r) { if (r.step <= k && r.ty === 'c' && !ps.some(function (q) { return q.step > r.step && (q.ty === 'i' || q.ty === 'r'); })) un = true; }); });
      return has('r') ? 'r' : un ? 'c' : has('i') ? 'i' : has('e') ? 'e' : 'q';
    };
    m.turningAt = function (c, k) {
      var ps = m.postsAt(c, k);
      return ps.some(function (p) { return p.rep.some(function (r) { return r.step <= k && r.ty === 'c'; }) && ps.some(function (q) { return q.step > p.step && q.step <= k && (q.ty === 'i' || q.ty === 'r'); }); });
    };
    m.linkWeight = function (l, k) { return l.posts.filter(function (p) { return p.step <= k; }).length; };
    /* 核心 / 邊緣:只看「這一天為止、已經出現」的詞,依「連到幾個其他的詞」判斷(簡單規則,不是統計檢定)
     *  - 雲裡要有 5 個以上的詞才判斷
     *  - 核心:連到的詞數排在前 25%(含並列),而且至少連到 3 個詞
     *  - 邊緣:只連到 0~1 個詞
     *  - 其他:中間偏外 */
    m.roleAt = function (c, k) {
      var vis = concepts.filter(function (x) { return m.visible(x, k); });
      if (vis.length < 5 || !m.visible(c, k)) return null;
      var deg = {}, w = {}; vis.forEach(function (x) { deg[x.t] = 0; w[x.t] = 0; });
      links.forEach(function (l) { var wt = m.linkWeight(l, k); if (!wt || deg[l.a] === undefined || deg[l.b] === undefined) return; deg[l.a]++; deg[l.b]++; w[l.a] += wt; w[l.b] += wt; });
      var sorted = vis.map(function (x) { return x.t; }).sort(function (a, b) { return (deg[b] - deg[a]) || (w[b] - w[a]) || (a < b ? -1 : 1); });
      var nCore = Math.max(1, Math.ceil(vis.length * 0.25)), thr = deg[sorted[nCore - 1]];
      var role = (deg[c.t] >= 3 && deg[c.t] >= thr) ? 'core' : (deg[c.t] <= 1 ? 'edge' : 'mid');
      return { role: role, degree: deg[c.t], weight: w[c.t], n: vis.length };
    };
    m.rolesAt = function (k) { var out = { core: [], edge: [], mid: [], n: 0 }; concepts.forEach(function (c) { if (!m.visible(c, k)) return; out.n++; var r = m.roleAt(c, k); if (r) out[r.role].push(c.t); }); return out; };
    m.related = function (c, k) {
      var out = []; links.forEach(function (l) { var w = m.linkWeight(l, k); if (!w) return; var other = l.a === c.t ? l.b : (l.b === c.t ? l.a : null); if (!other) return; var oc = concepts.filter(function (x) { return x.t === other; })[0]; if (oc && m.visible(oc, k)) out.push({ t: other, w: w }); });
      return out.sort(function (a, b) { return b.w - a.w; });
    };
    // 這一步的變化(給播放說明用)
    m.changes = function (k) {
      var parts = [], news = [], shifts = [];
      concepts.forEach(function (c) {
        if (!m.visible(c, k)) return;
        if (!m.visible(c, k - 1)) { news.push(c.t); return; }
        var a = m.stateAt(c, k - 1), b = m.stateAt(c, k);
        if (a !== b) shifts.push('「' + c.t + '」' + STATE_NAME[a] + ' → <b>' + STATE_NAME[b] + '</b>');
      });
      if (news.length) parts.push('雲裡長出新詞:<b>' + news.map(function (t) { return '「' + esc(t) + '」'; }).join('') + '</b>');
      if (shifts.length) parts.push(shifts.join(';'));
      return parts.join(';');
    };
    m.summaryText = function (k) {
      k = k == null ? m.K : k; var vis = concepts.filter(function (c) { return m.visible(c, k); });
      return vis.map(function (c) { return c.t + '(' + STATE_NAME[m.stateAt(c, k)] + ',' + m.postsAt(c, k).length + ' 則)'; }).join('、');
    };
    return m;
  }

  /* ---------- 版面:詞擺在雲裡,不重疊;常一起出現的詞放近一點 ---------- */
  // 字的大小:用越多次越大(單位 px)。每個詞佔的格子 = 字寬 + 留白,字不會疊在一起;外圍的光暈與緞帶可以互相疊
  var CH = 1.5, uidN = 0;
  function chipFont(count) { return 30 + Math.min(count, 6) * 8; }
  function chipBox(c, mode) { var f = chipFont(c.count); return mode === 'b' ? { w: (c.t.length * 1.45 + 2.6) * f * .76, h: 2.4 * f } : { w: (c.t.length + 1.3) * f, h: CH * f }; }   // 模式 B 的格子 = 漣漪光暈的大小
  // 模式 B「漣漪擴散雲」:每個詞底下一圈淡紫色的橢圓,外面再往外擴散兩圈細環(單位是 em,跟著字一起放大縮小)
  function rippleSVG(len) {
    var id = 'kbrp' + (++uidN), w = len * 1.45 + 2.6;
    function ring(cls, rx, ry, extra) { return '<ellipse class="' + cls + '" cx="50" cy="30" rx="' + rx + '" ry="' + ry + '" ' + extra + ' vector-effect="non-scaling-stroke"/>'; }
    return '<svg class="kbc-rip" viewBox="0 0 100 60" preserveAspectRatio="none" style="width:' + w.toFixed(2) + 'em;height:3.5em" aria-hidden="true"><defs><radialGradient id="' + id + '" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f9f8ff"/><stop offset=".55" stop-color="#eeedfc"/><stop offset=".86" stop-color="#e0def8"/><stop offset="1" stop-color="#d0cef2"/></radialGradient></defs>' +
      ring('r3', 49, 29, 'fill="none" stroke="#c3bdf0" stroke-width="1" stroke-opacity=".7"') + ring('r2', 41.5, 24.5, 'fill="none" stroke="#bdb7ee" stroke-width="1" stroke-opacity=".85"') + ring('r1', 34, 20, 'fill="url(#' + id + ')" stroke="#bcb7ee" stroke-width="1.2" stroke-opacity=".9"') + '</svg>';
  }

  function layout(model, mode) {
    mode = mode === 'b' ? 'b' : 'a'; var gx = mode === 'b' ? 6 : 40, gy = mode === 'b' ? 4 : 26;   // 模式 A 字與字之間留大空隙(緞帶要從中間穿過);模式 B 光暈可以稍微疊在一起
    // 照示意圖:用得最多的詞(字最大)在正中央,其餘的圍成一圈(詞多的話再圍第二圈),大字分散在不同方向
    var order = model.concepts.slice().sort(function (a, b) { return (b.count - a.count) || (a.first - b.first) || (a.t < b.t ? -1 : 1); }), placed = [], pos = {}, boxes = {};
    model.concepts.forEach(function (c) { boxes[c.t] = chipBox(c, mode); });
    function free(x, y, b) { return !placed.some(function (p) { return Math.abs(x - p.x) < (b.w + p.w) / 2 + gx && Math.abs(y - p.y) < (b.h + p.h) / 2 + gy; }); }
    function put(c, x, y) { var b = boxes[c.t]; pos[c.t] = { x: x, y: y, w: b.w, h: b.h }; placed.push(pos[c.t]); }
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    if (order.length) put(order[0], 0, 0);
    var rest = order.slice(1), n1 = Math.min(rest.length, 7), rings = [rest.slice(0, n1), rest.slice(n1)], rx0 = 0, ry0 = 0;
    var cw = order.length ? boxes[order[0].t].w : 0, ch = order.length ? boxes[order[0].t].h : 0;
    rings.forEach(function (ring, ri) {
      var n = ring.length; if (!n) return;
      var mw = 0, mh = 0; ring.forEach(function (c) { mw = Math.max(mw, boxes[c.t].w); mh = Math.max(mh, boxes[c.t].h); });
      var stride = 1; for (var s2 = Math.max(2, Math.round(n * .4)); s2 < n; s2++) if (gcd(s2, n) === 1) { stride = s2; break; }
      var a0 = -Math.PI / 2 + (ri ? Math.PI / n : .55), RX = ri ? rx0 + mw * .7 + gx : (cw / 2 + mw / 2 + gx) * 1.05, RY = ri ? ry0 + mh + gy : (ch / 2 + mh / 2 + gy) * 1.15, sc = 1, mark = placed.length, ok = false, tries = 0;
      while (!ok && tries++ < 160) {
        placed.length = mark; ok = true;
        for (var k = 0; k < n && ok; k++) {
          var c = ring[k], slot = (k * stride) % n, an = a0 + slot / n * Math.PI * 2, x = Math.cos(an) * RX * sc, y = Math.sin(an) * RY * sc;
          if (free(x, y, boxes[c.t])) put(c, x, y); else ok = false;
        }
        if (!ok) sc *= 1.035;
      }
      rx0 = RX * sc; ry0 = RY * sc;
    });
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    placed.forEach(function (p) { minx = Math.min(minx, p.x - p.w / 2); maxx = Math.max(maxx, p.x + p.w / 2); miny = Math.min(miny, p.y - p.h / 2); maxy = Math.max(maxy, p.y + p.h / 2); });
    if (!placed.length) { minx = -100; maxx = 100; miny = -50; maxy = 50; }
    return { pos: pos, minx: minx, maxx: maxx, miny: miny, maxy: maxy };
  }

  /* ---------- 樣式 ---------- */
  var cssDone = false;
  function injectCSS() {
    if (cssDone || doc.getElementById('kbc-style')) { cssDone = true; return; }
    var s = doc.createElement('style'); s.id = 'kbc-style';
    s.textContent = [
      '.kbc{--q:#2a6fd6;--e:#12aebf;--i:#8a45b8;--c:#f08a1f;--r:#2f9e48;--ink:#16315a;--sub:#4b6a97;--line:rgba(60,110,190,.2);font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;color:var(--ink)}',
      '.kbc-stage{position:relative;height:460px;border-radius:20px;overflow:hidden;border:1px solid rgba(110,140,200,.28);background:linear-gradient(160deg,#fafcff,#f1f6fe 55%,#e8f0fb);box-shadow:0 10px 30px -22px rgba(40,90,180,.45);touch-action:pan-x pan-y;cursor:grab;user-select:none;-webkit-user-select:none;outline:none}',
      '.kbc.tm .kbc-stage{background:radial-gradient(ellipse at 50% 58%,#ffffff,#fcfbff 55%,#f5f3fe)}',
      '.kbc-stage.drag{cursor:grabbing}.kbc-stage:focus-visible{box-shadow:0 0 0 3px rgba(59,141,240,.45)}',
      '.kbc-grid{opacity:0;position:absolute;left:-10%;right:-10%;bottom:-30px;height:190px;transform:perspective(500px) rotateX(62deg);transform-origin:bottom;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:linear-gradient(0deg,#000 10%,transparent 95%);mask-image:linear-gradient(0deg,#000 10%,transparent 95%);pointer-events:none}',
      '.kbc-view{position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0;will-change:transform}',
      '.kbc-view.anim{transition:transform .32s cubic-bezier(.2,.9,.3,1)}',
      '.kbc-lines{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}',
      '.kbc-lines path{fill:none;stroke:rgba(105,115,135,.6);stroke-linecap:round;stroke-dasharray:5 4;transition:stroke-width .4s,opacity .3s}.kbc.tm .kbc-lines path{stroke:rgba(125,122,168,.75);stroke-dasharray:3 4}',
      '.kbc-lines path.weak{opacity:.28}.kbc-lines path.hot{stroke:#2b7fff;opacity:1}.kbc-lines path.dim{opacity:.12}',
      '.kbc-w{position:absolute;left:0;top:0;opacity:0;pointer-events:none;transition:transform .7s cubic-bezier(.2,1.1,.3,1),opacity .4s}',
      '.kbc-w.on{opacity:1}.kbc-w.on .kbc-chip{pointer-events:auto}',   // 只有字的方塊能點(外層的空盒子會蓋住隔壁的字)
      '.kbc-w.dim{opacity:.28}',
      '.kbc-dot{display:none}',
      '.kbc-star{color:#f5a300}',
      '.kbc-chip{position:relative;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);cursor:grab;transition:transform .22s,font-size .5s;line-height:1}',
      '.kbc-ct{position:relative;display:flex;align-items:center;gap:.28em;font-weight:700;color:var(--cc,#0a2243);white-space:nowrap;padding-top:.06em;letter-spacing:.03em}',
      '.kbc-txt{color:var(--cc,#0a2243);background:linear-gradient(180deg,color-mix(in srgb,var(--cc,#0a2243) 84%,#fff) 0%,var(--cc,#0a2243) 50%,color-mix(in srgb,var(--cc,#0a2243) 94%,#000) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 .03em 0 rgba(255,255,255,.9)) drop-shadow(0 .06em .12em color-mix(in srgb,var(--cc,#456) 30%,transparent))}',
      '.kbc.tm .kbc-txt{filter:drop-shadow(0 0 .22em color-mix(in srgb,var(--cc,#456) 38%,transparent))}',
      '.kbc-plain{padding:.12em .24em;border:.05em solid transparent;border-radius:.2em;transition:transform .22s,font-size .5s,background .25s,border-color .25s,box-shadow .25s}',
      '.kbc-w.sel .kbc-plain{border-color:color-mix(in srgb,var(--cc) 70%,#fff);background:linear-gradient(180deg,color-mix(in srgb,var(--cc) 6%,rgba(255,255,255,.92)),color-mix(in srgb,var(--cc) 15%,rgba(255,255,255,.7)));box-shadow:0 0 .5em color-mix(in srgb,var(--cc) 38%,transparent),inset 0 0 .35em rgba(255,255,255,.9)}',
      '.kbc.tm .kbc-w.sel .kbc-plain{border-color:transparent;background:none;box-shadow:none}',
      '.kbc-rib{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}.kbc-rb{transition:opacity .3s}.kbc-rb path:first-child{fill-opacity:.74;filter:blur(.6px)}.kbc-rb path+path{fill-opacity:.42;filter:blur(1px)}.kbc-fib{stroke:#fff;stroke-opacity:.5;stroke-width:1.1px;stroke-linecap:round}.kbc-rb.dim{opacity:.1}.kbc.tm .kbc-rib{display:none}',
      '.kbc-halos{position:absolute;left:0;top:0;width:0;height:0}',
      '.kbc-hw{position:absolute;left:0;top:0;display:none;opacity:0;pointer-events:none;transition:transform .7s cubic-bezier(.2,1.1,.3,1),opacity .4s}.kbc.tm .kbc-hw{display:block}.kbc.tm .kbc-hw.on{opacity:1}.kbc-hw.dim{opacity:.2!important}',
      '.kbc-hw .kbc-rip{position:absolute;left:0;top:0;transform:translate(-50%,-50%);overflow:visible;filter:drop-shadow(0 .1em .2em rgba(90,90,190,.16))}.kbc-hw.sel .kbc-rip .r1{stroke:#7b72e4;stroke-opacity:1;stroke-width:2}.kbc-hw.top .kbc-rip .r1{fill:none;stroke-opacity:0}.kbc-hw.top .kbc-rip .r2{stroke-opacity:.35}.kbc-hw.top.sel .kbc-rip .r1{stroke-opacity:.9}',
      '.kbc.tm .kbc-rip .r2,.kbc.tm .kbc-rip .r3{transform-box:fill-box;transform-origin:center;animation:kbc-rp 4.4s ease-in-out infinite}.kbc.tm .kbc-rip .r3{animation-delay:-2.2s}@keyframes kbc-rp{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.05);opacity:.5}}',
      '.kbc-w:hover .kbc-chip{transform:translate(-50%,-50%) scale(1.08)}',
      '.kbc-stage.drag .kbc-chip{cursor:grabbing}.kbc-dragging .kbc-w,.kbc-dragging .kbc-hw,.kbc-dragging .kbc-chip{transition:none!important}',
      '.kbc-lines path.kbc-hit,.kbc.tm .kbc-lines path.kbc-hit{fill:none;stroke:transparent;stroke-width:16px;stroke-dasharray:none;opacity:1;vector-effect:non-scaling-stroke;pointer-events:stroke;cursor:help}.kbc-rb{pointer-events:visiblePainted;cursor:help}',
      '.kbc-ctl{display:inline-flex;align-items:center;margin-left:auto;flex-wrap:wrap;gap:4px}.kbc-ctl .kb-drag-ctl{font-size:12.5px!important}',
      '.kbc-dual.kbc-zoomed .kbc-stage{height:var(--kbc-zh,70vh)}.kbc-dual.kbc-zoomed .kbc-mode{min-height:74px;align-content:flex-start}',
      '.kbc-pulse{position:absolute;left:-14%;right:-14%;top:-34%;bottom:-34%;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--cc) 34%,transparent),transparent 68%);animation:kbc-pl 1.8s ease-out 2 both;pointer-events:none}',
      '@keyframes kbc-pl{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(1.5)}}',
      '.kbc-tip{position:absolute;left:0;top:0;z-index:30;width:330px;max-width:calc(100% - 16px);box-sizing:border-box;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.98);border:1px solid rgba(80,130,210,.4);box-shadow:0 16px 38px -10px rgba(30,70,150,.55);opacity:0;pointer-events:none;transition:opacity .16s;font-size:16px;line-height:1.65;color:#33415c;cursor:default}',
      '.kbc-tip.show{opacity:1}.kbc-tip.pin{pointer-events:auto}',
      '.kbc-tip h4{margin:0 0 6px;font-size:22px;line-height:1.3;color:var(--ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap}.kbc-tip h4 .kbc-tg{font-size:14px;padding:2px 10px}',
      '.kbc-tip .msg{color:var(--ink);font-size:16.5px;font-weight:600;margin:8px 0}.kbc-tip .kbc-ex{margin-top:8px;padding:8px 10px;border-radius:10px;background:#f1f6ff;font-size:15px}',
      '.kbc-tip button{width:100%;margin-top:10px;padding:10px 12px;min-height:42px;border-radius:999px;border:none;background:linear-gradient(135deg,#2b7fff,#35c6ff);color:#fff;font-weight:700;font-size:16px;cursor:pointer}.kbc-tip .kbc-ex button{width:auto;display:inline-block;margin:0 0 0 6px;padding:2px 12px;min-height:0;font-size:14px}',
      '.kbc-hud{position:absolute;z-index:5;font-size:12px;letter-spacing:.06em;color:var(--sub);pointer-events:none}.kbc-hud b{color:var(--ink);font-size:20px;letter-spacing:0}',
      '.kbc-hud.tl{left:14px;bottom:10px}.kbc-hud.tr{left:72px;bottom:10px}',
      '.kbc-hint{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:6;font-size:12px;color:var(--sub);background:rgba(255,255,255,.85);border:1px solid rgba(80,130,210,.25);border-radius:999px;padding:3px 12px;white-space:nowrap;pointer-events:none}',
      '.kbc-cap{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);z-index:6;max-width:62%;font-size:13px;color:var(--ink);background:rgba(255,255,255,.92);border:1px solid rgba(80,130,210,.3);border-radius:999px;padding:4px 14px;text-align:center;pointer-events:none}',
      '.kbc-cap:empty{display:none}',
      '.kbc-tools{position:absolute;right:12px;bottom:12px;z-index:8;display:flex;flex-direction:column;background:#fff;border:1px solid rgba(120,140,190,.32);border-radius:12px;box-shadow:0 6px 16px -8px rgba(30,60,130,.5);overflow:hidden}',
      '.kbc-zcap{position:absolute;right:64px;bottom:50px;z-index:7;font-size:13px;color:#4b5565;pointer-events:none}',
      '.kbc-tools button{width:38px;height:34px;border:0;border-radius:0;background:transparent;color:var(--ink);font-size:20px;font-weight:600;cursor:pointer;line-height:1}',
      '.kbc-tools button:hover{background:#eef4ff}.kbc-tools .z{font-size:10.5px;color:var(--sub);text-align:center;padding:2px 0;border-top:1px solid #e3e8f4}.kbc-tools button[data-z=out],.kbc-tools button[data-z=reset]{border-top:1px solid #e3e8f4}',
      '.kbc-toast{position:absolute;left:50%;bottom:78px;transform:translate(-50%,12px);z-index:45;padding:7px 16px;border-radius:999px;background:linear-gradient(135deg,#2b7fff,#35c6ff);color:#fff;font-weight:700;font-size:13px;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;white-space:nowrap}',
      '.kbc-toast.show{opacity:1;transform:translate(-50%,0)}',
      '.kbc-hd{position:absolute;left:0;right:0;top:0;z-index:7;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:6px 18px;padding:12px 16px 4px;pointer-events:none}',
      '.kbc-ttl{font-size:21px;font-weight:800;color:#111c33;line-height:1.25;letter-spacing:.01em}.kbc-sttl{font-size:14px;color:#33415c;margin-top:2px}.kbc-sttl:empty{display:none}',
      '.kbc-legend{display:flex;flex-direction:column;gap:3px;margin:0;font-size:12.5px;color:#26344f;line-height:1.5}.kbc-lg1{display:flex;gap:4px 14px;flex-wrap:wrap}.kbc-lg2{display:flex;gap:2px 8px;flex-wrap:wrap}',
      '.kbc.tm .kbc-legend{flex-direction:row;flex-wrap:wrap;gap:4px 20px;align-items:flex-start}.kbc.tm .kbc-lg1{flex-direction:column;gap:1px}.kbc-lgb{display:flex;flex-direction:column;gap:3px}',
      '.kbc-legend .kbc-tg{padding:0;border:0;background:none;color:var(--cc);font-weight:700;font-size:12.5px;gap:0;border-radius:0}.kbc-legend .kbc-tg:before{content:none}.kbc-legend .kbc-tg+.kbc-tg:before{content:"|";display:inline;width:auto;height:auto;background:none;border-radius:0;color:#7a869f;margin-right:8px;font-weight:400}',
      '.kbc-main{display:flex;flex-direction:column}.kbc-mode{order:-1;display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 8px;font-size:13px;color:var(--sub);min-height:32px}',
      '.kbc-mt{font-size:15px;color:var(--ink);padding:3px 12px;border-radius:999px;background:#eaf2ff;border:1px solid rgba(80,130,210,.35)}.kbc.tm .kbc-mt{background:#fff1e0;border-color:rgba(196,100,40,.45)}',
      '.kbc-dual{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}.kbc-dual .kbc-stage{height:470px}',
      '@media (max-width:860px){.kbc-dual{grid-template-columns:minmax(0,1fr)}}',
      '.kbc-seg{display:inline-flex;border:1px solid rgba(80,130,210,.4);border-radius:999px;overflow:hidden;background:#fff}',
      '.kbc-seg button{border:0;background:transparent;padding:5px 14px;font:inherit;font-weight:700;color:var(--sub);cursor:pointer;min-height:32px}',
      '.kbc-seg button+button{border-left:1px solid rgba(80,130,210,.3)}',
      '.kbc-seg button[aria-pressed=true]{background:#2b6fe0;color:#fff}',
      '.kbc-seg button:focus-visible{outline:3px solid rgba(59,141,240,.5);outline-offset:-3px}',
      '.kbc-ramp{display:flex;flex-direction:column;gap:3px;width:150px;font-weight:600;color:#33415c}',
      '.kbc-ramp i{display:block;height:10px;border-radius:999px;background:linear-gradient(90deg,#1b4a8e,#804ab2 50%,#f48638)}.kbc-rl{display:flex;justify-content:space-between;font-size:12px}.kbc-rl u{text-decoration:none}',
      '.kbc-seg[hidden]{display:none}.kbc-sub{margin-left:4px}.kbc-sub button{padding:3px 11px;min-height:28px;font-size:12px}',
      '.kbc-tg{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid var(--cc);color:var(--ink);background:color-mix(in srgb,var(--cc) 14%,#fff)}',
      '.kbc-tg:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--cc)}',
      '.kbc-card{margin-top:12px;background:#fff;border:1px solid rgba(80,130,210,.3);border-radius:18px;padding:16px 18px;box-shadow:0 12px 34px -20px rgba(30,70,150,.45);font-size:var(--kbc-fs,15px)}',
      '.kbc-card.flash{animation:kbc-fl 1.1s ease-out 2}@keyframes kbc-fl{0%{box-shadow:0 0 0 0 rgba(53,198,255,.9)}100%{box-shadow:0 0 0 22px rgba(53,198,255,0)}}',
      '.kbc-card h3{margin:0;font-size:1.6em}.kbc-card .sub{color:var(--sub);font-size:.86em;margin:4px 0}',
      '.kbc-pr{margin-top:12px;padding:12px 14px;border:1.5px dashed #9cc0f2;border-radius:14px;background:#f5f9ff;font-size:.95em;line-height:1.7}.kbc-pr h4{margin:0 0 4px;font-size:1em}.kbc-pr label.o{display:block;margin:4px 0;cursor:pointer}.kbc-pr textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:8px;font:inherit;margin-top:6px}.kbc-pr button.sv{margin-top:8px;padding:6px 14px;border-radius:10px;border:0;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer}.kbc-pr .hist{margin-top:8px;font-size:.88em;color:#475569}.kbc-pr .note{font-size:.8em;color:#64748b;margin-top:6px}.kbc-role{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.8em;font-weight:700}.kbc-rp{display:inline-block;margin:2px 4px 2px 0;padding:2px 10px;border-radius:99px;border:1px solid #bcd3f5;background:#fff;color:#1d4ed8;font-weight:700;cursor:pointer}',
      '.kbc-card.collapsed .kbc-body{display:none}.kbc-tog{margin-left:6px;font-weight:700}',
      '.kbc-fs{margin-left:auto;display:flex;gap:4px;align-items:center;font-size:12px;color:var(--sub)}.kbc-fs button{border:1px solid rgba(80,130,210,.35);background:#fff;border-radius:8px;padding:1px 9px;cursor:pointer;font-weight:700;color:var(--ink)}',
      '.kbc-path{margin:10px 0 0;position:relative;padding-left:22px}.kbc-path:before{content:"";position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:linear-gradient(180deg,var(--q),var(--r));opacity:.55;border-radius:2px}',
      '.kbc-step{position:relative;padding:6px 0;line-height:1.65}.kbc-step:before{content:"";position:absolute;left:-21px;top:12px;width:12px;height:12px;border-radius:50%;background:var(--cc);border:2px solid #fff;box-shadow:0 0 0 1px var(--cc)}',
      '.kbc-step small{color:var(--sub);margin-right:6px}.kbc-rep{margin-left:8px;color:var(--sub);font-size:.88em;padding:2px 0}',
      '.kbc-lk{font-size:12px;border:1px solid var(--q);color:var(--q);border-radius:999px;padding:1px 10px;margin-left:8px;background:#fff;cursor:pointer}.kbc-lk:hover{background:#eef6ff}',
      '.kbc-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px}',
      '.kbc-box{border-radius:12px;padding:10px 14px;font-size:.92em;background:#f3f8ff;border:1px solid rgba(80,130,210,.25)}',
      '.kbc-box.next{background:linear-gradient(135deg,#e6f1ff,#dff7ff);border-color:rgba(60,150,230,.5)}',
      '.kbc-empty{padding:26px 14px;text-align:center;color:var(--sub);font-size:14px}',
      '@media (max-width:640px){.kbc-stage{height:440px}.kbc-cap{max-width:86%}.kbc-hint{display:none}.kbc-zcap{display:none}}',
      '@media (prefers-reduced-motion:reduce){.kbc-rip *,.kbc-pulse,.kbc-w,.kbc-hw{animation:none!important;transition:none!important}}'
    ].join('\n');
    (doc.head || doc.documentElement).appendChild(s); cssDone = true;
  }

  /* ---------- 顏色模式 ---------- */
  // 模式 A:顏色 = 想法現在的狀態(提問/延伸/改進/質疑/整合)。模式 B:顏色 = 時間,早期深藍 → 中期紫 → 近期橘(照示意圖的色條)
  var RAMP = [[27, 74, 142], [128, 74, 178], [244, 134, 56]];   // 早期深藍 → 中期紫 → 近期橘(照示意圖的色條)
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t)); var seg = t < .5 ? 0 : 1, a = RAMP[seg], b = RAMP[seg + 1], u = seg ? (t - .5) / .5 : t / .5;
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * u); }).join(',') + ')';
  }

  /* ---------- 畫出來 ---------- */
  function create(host, model, opts) {
    opts = opts || {}; injectCSS();
    var inst = { model: model, k: model.K, sel: null, pinned: false, z: 1, x: 0, y: 0 };
    host.innerHTML = '';
    if (!model.concepts.length) {
      host.innerHTML = '<div class="kbc kbc-empty">' + (model.totalPosts < 2 ? '再多發幾則想法,你的概念雲就會長出來囉!' : '這幾則貼文裡還沒有找到常用的詞,多寫一些內容試試看。') + '</div>';
      inst.render = function () {}; inst.select = function () {}; inst.empty = true; return inst;
    }
    var L = layout(model, opts.colorMode === 'b' ? 'b' : 'a'), r = rng(hash(model.userId)), K = model.K;
    var cmKey = 'kb_cc_cmode'; inst.cmode = opts.colorMode === 'b' ? 'b' : 'a'; inst.csub = 'f'; try { var sv0 = global.localStorage.getItem(cmKey) || ''; if (sv0 === 'bl') inst.csub = 'l'; } catch (e) {}
    var root = doc.createElement('div'); root.className = 'kbc';
    root.innerHTML = '<div class="kbc-main"><div class="kbc-stage" tabindex="0" role="application" aria-label="我的概念雲:滾輪或按鈕放大縮小,拖曳移動,點詞看故事">' +
      '<div class="kbc-grid"></div><div class="kbc-hud tl">第<br><b data-k="day">0</b> 天</div><div class="kbc-hud tr">概念<br><b data-k="n">0</b> 個</div><div class="kbc-cap" data-k="cap" aria-live="polite"></div>' +
      '<div class="kbc-hd"><div class="kbc-hl"><div class="kbc-ttl" data-k="ttl"></div><div class="kbc-sttl" data-k="sttl"></div></div><div class="kbc-legend" data-k="legend"></div></div>' +
      '<div class="kbc-view" data-k="view"><div class="kbc-halos" data-k="halos"></div><svg class="kbc-rib" data-k="rib" width="1" height="1"><defs data-k="ribdefs"></defs></svg><svg class="kbc-lines" data-k="lines" width="1" height="1"></svg><div class="kbc-words" data-k="words"></div></div><div class="kbc-tip" data-k="tip"></div>' +
      '<div class="kbc-hint" data-k="hint">點一個詞看它的故事 · 可以拖動文字 · 滾輪縮放</div><div class="kbc-toast" data-k="toast"></div>' +
      '<div class="kbc-tools"><button type="button" data-z="in" title="放大" aria-label="放大">＋</button><div class="z" data-k="zl">100%</div><button type="button" data-z="out" title="縮小" aria-label="縮小">－</button><button type="button" data-z="reset" title="還原" aria-label="還原" style="font-size:15px">⟲</button></div><div class="kbc-zcap">滾輪縮放</div></div>' +
      '<div class="kbc-mode" data-k="mode"><b class="kbc-mt" data-k="mtitle"></b><span class="kbc-seg kbc-sub" role="group" aria-label="時間要看哪一天" data-k="sub" hidden><button type="button" data-cs="f" aria-pressed="true">第一次出現</button><button type="button" data-cs="l" aria-pressed="false">最近一次用到</button></span><span class="kbc-ctl" data-k="ctl"></span></div></div>' +
      '';
    host.appendChild(root);
    var cardWrap = doc.createElement('div'); cardWrap.className = 'kbc'; cardWrap.innerHTML = '<div class="kbc-card" data-k="card"></div>'; if (!opts.noCard) host.appendChild(cardWrap);
    inst.cardWrap = cardWrap;
    var q = function (k) { return root.querySelector('[data-k=' + k + ']') || cardWrap.querySelector('[data-k=' + k + ']'); };
    var stage = root.querySelector('.kbc-stage'), hd = root.querySelector('.kbc-hd'), view = q('view'), halos = q('halos'), rib = q('rib'), words = q('words'), lines = q('lines'), tip = q('tip'), card = q('card');
    inst.root = root; inst.stage = stage; inst.card = card; inst.main = root.querySelector('.kbc-main');

    // 雲與詞的基準尺寸(讓整朵雲剛好放進舞台)
    var extW = (L.maxx - L.minx) + 90, extH = (L.maxy - L.miny) + 70, cx0 = (L.minx + L.maxx) / 2, cy0 = (L.miny + L.maxy) / 2;
    // 舞台上方有標題與圖例(約 90px),雲放在剩下的空間正中央
    var voff = 46;
    function fit() {
      var w = stage.clientWidth || 700, h = stage.clientHeight || 460, hh = hd && hd.offsetHeight ? hd.offsetHeight : 92;
      voff = Math.round(hh / 2) - 22; view.style.top = 'calc(50% + ' + voff + 'px)';
      return clamp(Math.min(w / ((extW + 16) * 1.05), (h - hh - 44) / ((extH + 16) * 1.06)), 0.25, 1.7);
    }
    var rig = global.KB3D ? new global.KB3D.Rig({ cx: 0, cy: 0, ext: Math.max(extW, extH) / 2 }) : null; inst.rig = rig; inst.off = {};   // rig = 3D 旋轉;off = 使用者拖動過的字的位置
    var base = fit();   // 整體縮放比例:讓整朵雲剛好放進舞台(詞與位置一起縮放,不會重疊)
    // 詞
    var biggest = model.concepts.slice().sort(function (a, b) { return (b.count - a.count) || (a.first - b.first); })[0];
    var wEl = {}, lEl = {}, hEl = {}, rEl = {}, hitEl = {};
    function dayName(s) { return opts.labels && opts.labels[s] ? opts.labels[s] : '第 ' + s + ' 天'; }
    // 這個詞在第 k 天的「時間」位置:0 = 最早、1 = 最晚(用整段時間的長度算,播放時顏色不會跳)
    function timeT(c, k) {
      var ps = model.postsAt(c, k); if (!ps.length) return 0; var s = inst.csub === 'l' ? ps[ps.length - 1].step : ps[0].step;
      return K <= 1 ? .5 : (s - 1) / (K - 1);
    }
    function colorOf(c, k, st) { return inst.cmode === 'b' ? rampColor(timeT(c, k)) : 'var(--' + st + ')'; }
    function drawLegend() {
      var lg = q('legend'); if (!lg) return;
      // 圖例照示意圖:模式 B = 顏色色條(早期 → 近期)+ 字大/虛線說明;模式 A = 字大/虛線說明 + 五種狀態色
      lg.innerHTML = inst.cmode === 'b'
        ? '<div class="kbc-lgb"><div class="kbc-lg2">' + (inst.csub === 'l' ? '顏色＝最近一次用到的時間' : '顏色＝首次出現時間') + '</div><span class="kbc-ramp"><i role="img" aria-label="顏色從深藍到紫色再到橘色,代表從早期到近期" title="' + esc(dayName(1)) + ' → ' + esc(dayName(K)) + '"></i><span class="kbc-rl"><u>早期</u><u>中期</u><u>近期</u></span></span></div><div class="kbc-lg1"><div>字大＝使用較多</div><div>虛線＝常一起出現</div></div>'
        : '<div class="kbc-lg1"><span>字大＝使用較多</span><span>虛線＝常一起出現,非因果或先後</span></div><div class="kbc-lg2"><span class="kbc-tg" style="--cc:var(--q)">藍＝提問中</span><span class="kbc-tg" style="--cc:var(--e)">青＝被延伸</span><span class="kbc-tg" style="--cc:var(--i)">紫＝改進中</span><span class="kbc-tg" style="--cc:var(--r)">綠＝已整合</span><span class="kbc-tg" style="--cc:var(--c)">橘＝被質疑</span></div>';
      var tt = q('ttl'); if (tt) tt.textContent = inst.cmode === 'b' ? '漣漪擴散雲｜我的概念雲' : '對話編織雲｜我的概念雲';
      var st2 = q('sttl'); if (st2) st2.textContent = inst.cmode === 'b' ? '' : '模式 A｜想法狀態';
      var mt = q('mtitle'); if (mt) mt.textContent = inst.cmode === 'b' ? '模式 B:顏色看「什麼時候出現」' : '模式 A:顏色看「想法的狀態」';
      var sb = root.querySelectorAll('[data-cs]'); for (var j = 0; j < sb.length; j++) sb[j].setAttribute('aria-pressed', sb[j].getAttribute('data-cs') === inst.csub ? 'true' : 'false');
      root.classList.toggle('tm', inst.cmode === 'b');
      var sub = q('sub'); if (sub) { if (inst.cmode === 'b') sub.removeAttribute('hidden'); else sub.setAttribute('hidden', ''); }
    }
    inst.setColorMode = function (m, sub) {
      inst.cmode = m === 'b' ? 'b' : 'a'; if (sub) inst.csub = sub === 'l' ? 'l' : 'f';
      if (inst.cmode === 'b') { try { global.localStorage.setItem(cmKey, inst.csub === 'l' ? 'bl' : 'bf'); } catch (e) {} }
      drawLegend(); inst.render(inst.k);
    };
    model.concepts.forEach(function (c) {
      var w = doc.createElement('div'); w.className = 'kbc-w'; w.setAttribute('data-t', c.t);
      w.innerHTML = '<div class="kbc-chip kbc-plain"><span class="kbc-ct"><span class="kbc-dot"></span><span class="kbc-txt">' + esc(c.t) + '</span></span></div>';
      words.appendChild(w); wEl[c.t] = w;
      // 模式 B 的漣漪光暈放在另一層,所有的字都在光暈上面(光暈疊在一起也不會蓋住隔壁的字)
      var h = doc.createElement('div'); h.className = 'kbc-hw' + (c === biggest ? ' top' : ''); h.innerHTML = rippleSVG(c.t.length); halos.appendChild(h); hEl[c.t] = h;
    });
    var SVGNS = 'http://www.w3.org/2000/svg', ribDefs = q('ribdefs');
    function svgEl(n, at) { var e = doc.createElementNS(SVGNS, n); for (var k in at) e.setAttribute(k, at[k]); return e; }
    model.links.forEach(function (l, idx) {
      var p = svgEl('path', { 'data-a': l.a, 'data-b': l.b }); lines.appendChild(p); lEl[idx] = p;
      var hit = svgEl('path', { 'class': 'kbc-hit', 'data-i': String(idx) }); lines.appendChild(hit); hitEl[idx] = hit;
      // 模式 A 的緞帶:兩個詞之間一條半透明、從一個詞的顏色漸層到另一個詞的顏色的彩帶(只畫常一起出現最多次的幾條)
      var gid = 'kbrb' + (++uidN), g = svgEl('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse' }), sts = [['0', '.0'], ['.22', '1'], ['.78', '1'], ['1', '.0']].map(function (o) { var st = svgEl('stop', { offset: o[0], 'stop-opacity': o[1] }); g.appendChild(st); return st; });
      ribDefs.appendChild(g);
      var grp = svgEl('g', { 'class': 'kbc-rb' }), body = svgEl('path', { fill: 'url(#' + gid + ')' }), sheen = svgEl('path', { fill: '#fff' }), fibs = [0, 1, 2].map(function () { return svgEl('path', { 'class': 'kbc-fib', fill: 'none' }); });
      grp.appendChild(body); grp.appendChild(sheen); fibs.forEach(function (f) { grp.appendChild(f); }); rib.appendChild(grp); rEl[idx] = { g: grp, body: body, sheen: sheen, fibs: fibs, grad: g, sts: sts };
    });

    // 詞(每個詞一朵雲)的位置固定不動,新的詞會一朵一朵飄進來
    var HA = Math.max(extW / 2, 50), HB = Math.max(extH / 2, 40);
    function flatOf(c) { var p = L.pos[c.t], o = inst.off[c.t]; return { x: p.x - cx0 + (o ? o.x : 0), y: p.y - cy0 + (o ? o.y : 0) }; }
    function posOf(c, k) { var f = flatOf(c); if (!rig || !rig.active()) return { x: f.x, y: f.y, f: 1, z: 0 }; var P = rig.project(f.x, f.y, c.t); return { x: P.x, y: P.y, f: P.f, z: P.z }; }
    function related(t) { var out = {}; model.links.forEach(function (l) { if (l.a === t) out[l.b] = 1; if (l.b === t) out[l.a] = 1; }); return out; }

    /* ---- 放大縮小/移動 ---- */
    function applyView(anim) { view.classList.toggle('anim', !!anim); view.style.transform = 'translate(' + inst.x + 'px,' + inst.y + 'px) scale(' + (inst.z * base) + ')'; q('zl').textContent = Math.round(inst.z * 100) + '%'; }
    function zoomAt(f, px, py, anim) {
      var nz = clamp(inst.z * f, 0.5, 4), k = nz / inst.z;
      inst.x = px - (px - inst.x) * k; inst.y = py - (py - inst.y) * k; inst.z = nz; applyView(anim);
    }
    function stagePt(e) { var rc = stage.getBoundingClientRect(); return { x: e.clientX - rc.left - rc.width / 2, y: e.clientY - rc.top - rc.height / 2 - voff }; }
    inst.zoomIn = function () { zoomAt(1.25, 0, 0, true); }; inst.zoomOut = function () { zoomAt(0.8, 0, 0, true); };
    // 位置變動時不要慢慢滑過去(資料線與緞帶是立刻跟著動的)
    function instant(fn) { stage.classList.add('kbc-dragging'); fn(); clearTimeout(inst._ti); inst._ti = setTimeout(function () { stage.classList.remove('kbc-dragging'); }, 80); }
    // ↺ 回正:只把旋轉轉回平面(字的位置、縮放、平移都不變)
    inst.level = function () { if (rig) rig.reset(); instant(function () { inst.render(inst.k, true); }); };
    // ⟲ 還原:拖動過的字、旋轉、縮放、平移全部回到最初
    inst.reset = function () { if (rig) rig.reset(); inst.off = {}; inst.z = 1; inst.x = 0; inst.y = 0; applyView(true); instant(function () { inst.render(inst.k, true); }); };
    q('zl').parentNode.querySelectorAll('[data-z]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); var z = b.getAttribute('data-z'); if (z === 'in') inst.zoomIn(); else if (z === 'out') inst.zoomOut(); else inst.reset(); }); });
    stage.addEventListener('wheel', function (e) { e.preventDefault(); var p = stagePt(e); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y, false); }, { passive: false });
    stage.addEventListener('keydown', function (e) {
      var k = e.key; if (k === '+' || k === '=') { inst.zoomIn(); e.preventDefault(); } else if (k === '-' || k === '_') { inst.zoomOut(); e.preventDefault(); } else if (k === '0') { inst.reset(); e.preventDefault(); }
      else if (k.indexOf('Arrow') === 0) { var d = 40; if (k === 'ArrowLeft') inst.x += d; if (k === 'ArrowRight') inst.x -= d; if (k === 'ArrowUp') inst.y += d; if (k === 'ArrowDown') inst.y -= d; applyView(true); e.preventDefault(); }
      else if (k === 'Escape') { hideTip(true); }
    });
    var ptrs = {}, drag = null, wdrag = null, moved = false, pinch0 = null, DM = global.KB3D ? global.KB3D.dragMode : null;
    function isPanEv(e) { return DM ? DM.isPan(e) : true; }
    stage.addEventListener('contextmenu', function (e) { if (DM) e.preventDefault(); });   // 右鍵拖曳 = 平移,不要跳出瀏覽器選單
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.kbc-tools') || e.target.closest('.kbc-tip')) return;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(ptrs);
      if (ids.length === 2) { var a1 = ptrs[ids[0]], a2 = ptrs[ids[1]]; pinch0 = { d: Math.hypot(a1.x - a2.x, a1.y - a2.y), z: inst.z }; drag = null; wdrag = null; return; }
      if (e.pointerType === 'touch') return;   // 手機單指留給頁面捲動,兩指才縮放
      var wc = e.target.closest ? e.target.closest('.kbc-w.on') : null, left = (e.button === 0 || e.button == null);
      moved = false;
      if (wc && left && !e.shiftKey) {   // 按住字拖曳 = 把這個字拖到別的地方(只動畫面,不改資料)
        var tt = wc.getAttribute('data-t'), cc = conceptOf(tt), pp = posOf(cc, inst.k); wdrag = { t: tt, x: e.clientX, y: e.clientY, sx: pp.x, sy: pp.y, z: pp.z }; return;
      }
      var onLine = !!(e.target.closest && (e.target.closest('.kbc-hit') || e.target.closest('.kbc-rb')));
      drag = { x: e.clientX, y: e.clientY, ox: inst.x, oy: inst.y, pan: isPanEv(e), start: rig ? rig.snap() : null, tap: left && !e.shiftKey && !wc && !onLine, ev: { clientX: e.clientX, clientY: e.clientY } };   // 真的拖動了才抓住滑鼠;一按下就抓,Chrome 會把「點詞」的 click 送給舞台
    });
    stage.addEventListener('pointermove', function (e) {
      if (ptrs[e.pointerId]) { ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY; }
      var ids = Object.keys(ptrs);
      if (pinch0 && ids.length === 2) { var a1 = ptrs[ids[0]], a2 = ptrs[ids[1]], d = Math.hypot(a1.x - a2.x, a1.y - a2.y), rc = stage.getBoundingClientRect(); var mx = (a1.x + a2.x) / 2 - rc.left - rc.width / 2, my = (a1.y + a2.y) / 2 - rc.top - rc.height / 2 - voff; zoomAt(clamp(pinch0.z * d / pinch0.d, 0.5, 4) / inst.z, mx, my, false); return; }
      if (wdrag) {
        var wx = e.clientX - wdrag.x, wy = e.clientY - wdrag.y;
        if (!moved && Math.abs(wx) + Math.abs(wy) > 4) { moved = true; stage.classList.add('drag', 'kbc-dragging'); try { stage.setPointerCapture(e.pointerId); } catch (x) {} }
        if (moved) {
          var sc = inst.z * base, nx = wdrag.sx + wx / sc, ny = wdrag.sy + wy / sc, fl = (rig && rig.active()) ? rig.unproject(nx, ny, wdrag.z) : { x: nx, y: ny }, bp = L.pos[wdrag.t];
          inst.off[wdrag.t] = { x: fl.x - (bp.x - cx0), y: fl.y - (bp.y - cy0) }; inst.render(inst.k, true);
        }
        return;
      }
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 4) { moved = true; stage.classList.add('drag'); if (!drag.pan && rig) stage.classList.add('kbc-dragging'); try { stage.setPointerCapture(e.pointerId); } catch (x) {} }
      if (moved) { if (drag.pan || !rig) { inst.x = drag.ox + dx; inst.y = drag.oy + dy; applyView(false); } else { rig.drag(drag.start, dx, dy); inst.render(inst.k, true); } }
    });
    function endPtr(e) {
      delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch0 = null;
      if (wdrag) { wdrag = null; stage.classList.remove('drag', 'kbc-dragging'); setTimeout(function () { moved = false; }, 0); return; }
      if (drag) {
        var g = drag; drag = null; stage.classList.remove('drag', 'kbc-dragging');
        if (!moved && g.tap && DM && e.type === 'pointerup') DM.tap(g.ev, stage, inst.level);   // 空白處點一下:連點 2 下換「旋轉/平移」、3 下回正
        setTimeout(function () { moved = false; }, 0);
      }
    }
    stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
    stage.addEventListener('click', function (e) { if (!e.target.closest('.kbc-w') && !e.target.closest('.kbc-tip') && !e.target.closest('.kbc-hit') && !e.target.closest('.kbc-rb') && !moved) hideTip(true); });

    /* ---- 說明泡泡:放在舞台上(不跟著圖縮放),字夠大、位置會避開標題和邊邊 ---- */
    function toast(msg) { var t = q('toast'); t.textContent = msg; t.className = 'kbc-toast show'; clearTimeout(inst._tt); inst._tt = setTimeout(function () { t.className = 'kbc-toast'; }, 2600); }
    function conceptOf(t) { return model.concepts.filter(function (c) { return c.t === t; })[0]; }
    function stTag(st) { return '<span class="kbc-tg" style="--cc:var(--' + st + ')">' + STATE_NAME[st] + '</span>'; }
    function toStage(x, y) { var sc = inst.z * base; return { x: (stage.clientWidth || 700) / 2 + inst.x + x * sc, y: (stage.clientHeight || 460) / 2 + voff + inst.y + y * sc, sc: sc }; }
    function putTip(sx, sy, halfH) {   // 以舞台上的位置為準:放得下就放上面,不行放下面;不會蓋到標題、也不會超出邊邊
      var W = stage.clientWidth || 700, H = stage.clientHeight || 460, tw = Math.min(330, W - 16);
      tip.style.width = tw + 'px'; var th = tip.offsetHeight || 190, hb = (hd && hd.offsetHeight) || 0;
      var top = sy - halfH - 12 - th, below = false; if (top < hb + 4) { top = sy + halfH + 12; below = true; }
      if (top + th > H - 6) top = Math.max(hb + 4, H - th - 6);
      tip.style.left = clamp(sx - tw / 2, 8, W - tw - 8) + 'px'; tip.style.top = top + 'px'; tip.setAttribute('data-below', below ? '1' : '0');
    }
    function showTip(t, pin) {
      var c = conceptOf(t); if (!c) return; var ps = model.postsAt(c, inst.k); if (!ps.length) return;
      var st = model.stateAt(c, inst.k), rc = 0; ps.forEach(function (p) { p.rep.forEach(function (rp) { if (rp.step <= inst.k) rc++; }); });
      var rel = model.related(c, inst.k).slice(0, 3).map(function (x) { return x.t; });
      tip.innerHTML = '<h4>' + esc(t) + (inst.cmode === 'b' ? '<span class="kbc-tg" style="--cc:' + colorOf(c, inst.k, st) + '">' + (inst.csub === 'l' ? '最近用在 ' + esc(dayName(ps[ps.length - 1].step)) : '最早出現在 ' + esc(dayName(ps[0].step))) + '</span>' : stTag(st)) + (model.turningAt(c, inst.k) ? '<span class="kbc-star">★</span>' : '') + '</h4><div>第 ' + ps[0].step + ' 天出現 · 你的貼文 ' + ps.length + ' 則 · 同學回應 ' + rc + ' 則</div><div class="msg">' + STATE_MSG[st] + '</div>' + (rel.length ? '<div>常一起出現:' + rel.map(esc).join('、') + '</div>' : '') + (pin ? '<button type="button" data-k="see">看完整故事 ↓</button>' : '<div>點一下看完整故事</div>');
      tip.className = 'kbc-tip show' + (pin ? ' pin' : ''); inst.tipKind = 'word';
      var p = posOf(c, inst.k), s = toStage(p.x, p.y), f = chipFont(ps.length) * (p.f || 1);
      putTip(s.x, s.y, f * CH / 2 * s.sc);
      var sb = tip.querySelector('[data-k=see]'); if (sb) sb.onclick = function (e) { e.stopPropagation(); inst.goCard(); };
    }
    // 滑鼠移到「資料線 / 緞帶」上:說明這兩個詞為什麼連在一起,並列出同時提到它們的貼文
    function sharedPosts(l, k) { var a = conceptOf(l.a), b = conceptOf(l.b), ids = {}; model.postsAt(a, k).forEach(function (p) { ids[p.id] = p; }); return model.postsAt(b, k).filter(function (p) { return ids[p.id]; }).map(function (p) { return ids[p.id]; }); }
    function showLineTip(i, pin, ev) {
      var l = model.links[i]; if (!l) return; var k = inst.k, sh = sharedPosts(l, k); if (!sh.length) return;
      var ex = sh.slice(0, 2).map(function (p) { return '<div class="kbc-ex">' + esc(dayName(p.step)) + ':「' + esc(p.text) + '」' + (pin ? '<button type="button" data-go="' + esc(p.id) + '" data-topic="' + esc(p.topicId) + '">看原文</button>' : '') + '</div>'; }).join('');
      tip.innerHTML = '<h4>「' + esc(l.a) + '」＋「' + esc(l.b) + '」<span class="kbc-tg" style="--cc:var(--q)">常一起出現</span></h4><div>你有 ' + sh.length + ' 則貼文同時提到這兩個詞(第 ' + sh[0].step + ' 天起)</div><div class="msg">這條線只代表「常寫在同一則貼文裡」,不代表因果,也不代表誰先誰後。</div>' + ex + (pin ? '' : '<div style="margin-top:8px">點一下固定這個說明</div>');
      tip.className = 'kbc-tip show' + (pin ? ' pin' : ''); inst.tipKind = 'line';
      var sx, sy, rc = stage.getBoundingClientRect();
      if (ev && ev.clientX != null) { sx = ev.clientX - rc.left; sy = ev.clientY - rc.top; inst.lineAt = { x: sx, y: sy }; }
      else if (inst.lineAt) { sx = inst.lineAt.x; sy = inst.lineAt.y; }
      else { var qa = posOf(conceptOf(l.a), k), qb = posOf(conceptOf(l.b), k), pa = toStage(qa.x, qa.y), pb = toStage(qb.x, qb.y); sx = (pa.x + pb.x) / 2; sy = (pa.y + pb.y) / 2; }
      putTip(sx, sy, 10);
      Array.prototype.forEach.call(tip.querySelectorAll('[data-go]'), function (b) { b.onclick = function (e) { e.stopPropagation(); if (opts.onGoPost) opts.onGoPost(b.getAttribute('data-go'), b.getAttribute('data-topic')); }; });
      applyDimLine(i);
    }
    function applyDimLine(i) {
      var l = model.links[i];
      Object.keys(wEl).forEach(function (k) { var dm = k !== l.a && k !== l.b; wEl[k].classList.toggle('dim', dm); hEl[k].classList.toggle('dim', dm); });
      Object.keys(lEl).forEach(function (j) { var hot = Number(j) === Number(i); lEl[j].classList.toggle('hot', hot); lEl[j].classList.toggle('dim', !hot); rEl[j].g.classList.toggle('dim', !hot); });
    }
    function bindLink(node, i) {
      node.addEventListener('mouseenter', function (e) { if (!inst.pinned && !moved) showLineTip(i, false, e); });
      node.addEventListener('mousemove', function (e) { if (!inst.pinned && inst.tipKind === 'line' && tip.classList.contains('show')) showLineTip(i, false, e); });
      node.addEventListener('mouseleave', function () { if (!inst.pinned) hideTip(false); });
      node.addEventListener('click', function (e) { e.stopPropagation(); if (moved) return; inst.pinned = true; inst.pinLine = i; showLineTip(i, true, e); });
    }
    Object.keys(hitEl).forEach(function (i) { bindLink(hitEl[i], Number(i)); bindLink(rEl[i].g, Number(i)); });
    function hideTip(force) { if (inst.pinned && !force) return; tip.className = 'kbc-tip'; inst.pinned = false; inst.pinLine = null; applyDim(null); }
    function applyDim(t) {
      var rel = t ? related(t) : null;
      Object.keys(wEl).forEach(function (k) { var dm = !!t && k !== t && !rel[k]; wEl[k].classList.toggle('dim', dm); hEl[k].classList.toggle('dim', dm); });
      Object.keys(lEl).forEach(function (i) { var l = model.links[i], hot = !!t && (l.a === t || l.b === t); lEl[i].classList.toggle('hot', hot); lEl[i].classList.toggle('dim', !!t && !hot); rEl[i].g.classList.toggle('dim', !!t && !hot); });
    }
    inst.goCard = function () { if (global.KB3D && global.KB3D.zoomOpen && global.KB3D.zoomOpen()) global.KB3D.zoomClose(); if (!cardOpen) inst.setCardOpen(true); try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { card.scrollIntoView(); } card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); };

    /* ---- 故事卡 ---- */
    var fsKey = 'kb_cc_fs', fsList = [14, 16, 19, 23], fsIdx = 1; try { var sv = Number(global.localStorage.getItem(fsKey)); if (sv >= 0 && sv < fsList.length) fsIdx = sv; } catch (e) {}
    function applyFs() { card.style.setProperty('--kbc-fs', fsList[fsIdx] + 'px'); }
    var openKey = 'kb_cc_card_open', cardOpen = true; try { cardOpen = global.localStorage.getItem(openKey) !== '0'; } catch (e) {}
    function applyOpen() { card.classList.toggle('collapsed', !cardOpen); var b = card.querySelector('[data-tog]'); if (b) { b.textContent = cardOpen ? '▾ 收合' : '▸ 展開'; b.setAttribute('aria-expanded', cardOpen ? 'true' : 'false'); } }
    inst.setCardOpen = function (v) { cardOpen = !!v; try { global.localStorage.setItem(openKey, cardOpen ? '1' : '0'); } catch (e) {} applyOpen(); };
    inst.isCardOpen = function () { return cardOpen; };
    function bindTog() { var b = card.querySelector('[data-tog]'); if (b) b.onclick = function () { inst.setCardOpen(!cardOpen); }; applyOpen(); }
    /* ---- 核心 / 邊緣概念追問(由頁面提供 opts.probe = { readonly, history(term), save(record) }) ---- */
    function rolesSummary() {
      if (!opts.probe) return '';
      var r = model.rolesAt(inst.k);
      if (r.n < 5) return '<div class="sub" style="margin-top:8px">雲裡有 5 個以上的詞,就能看出哪些詞在中間、哪些在邊邊。</div>';
      var chips = function (arr) { return arr.map(function (t) { return '<button type="button" class="kbc-rp" data-rp="' + esc(t) + '">' + esc(t) + '</button>'; }).join(''); };
      if (!r.core.length && !r.edge.length) return '<div class="sub" style="margin-top:8px">目前的詞都差不多連在一起,還看不出中間和邊邊。</div>';
      return '<div class="sub" style="margin-top:10px"><b>在中間的詞(核心)</b>:' + (chips(r.core) || '還沒有') + '</div><div class="sub"><b>在邊邊的詞(邊緣)</b>:' + (chips(r.edge) || '還沒有') + '</div><div class="sub">點一個詞,回答它為什麼在中間或邊邊。</div>';
    }
    function bindRoles() { card.querySelectorAll('[data-rp]').forEach(function (b) { b.onclick = function () { inst.select(b.getAttribute('data-rp'), false); }; }); }
    function probeHtml(c) {
      var P = opts.probe; if (!P) return '';
      var rl = model.roleAt(c, inst.k);
      if (!rl) return '<div class="kbc-pr"><div class="note">雲裡的詞還不夠多(要 5 個以上),多發幾則貼文,就能看出哪些詞在中間、哪些在邊邊。</div></div>';
      var tag = rl.role === 'core' ? '<span class="kbc-role" style="background:#dbeafe;color:#1d4ed8">核心概念(在中間)</span>' : rl.role === 'edge' ? '<span class="kbc-role" style="background:#f1f5f9;color:#475569">邊緣概念(在邊邊)</span>' : '<span class="kbc-role" style="background:#ecfdf5;color:#047857">中間偏外</span>';
      var h = '<div class="kbc-pr" data-k="probe"><h4>' + tag + ' 「' + esc(c.t) + '」連到 ' + rl.degree + ' 個詞</h4>';
      if (rl.role === 'mid') return h + '<div class="note">它和幾個詞一起出現,不是最中間,也不是最邊邊。</div></div>';
      var dis = P.readonly ? ' disabled' : '';
      if (rl.role === 'core') h += '<div>想一想:<b>為什麼「' + esc(c.t) + '」會在中間?</b>它和你正在想的問題有什麼關係?</div>';
      else h += '<div>想一想:<b>「' + esc(c.t) + '」為什麼在邊邊?</b>你覺得比較像哪一種?</div>' + [['ignored', '被忽略了:很重要,但還沒有人討論'], ['undeveloped', '還沒發展:我有想法,但還沒說清楚'], ['weak', '關係不大:跟我的主題沒有很相關'], ['unsure', '我還不確定']].map(function (o) { return '<label class="o"><input type="radio" name="kbc-pr-ch" value="' + o[0] + '"' + dis + '> ' + o[1] + '</label>'; }).join('');
      h += '<textarea data-k="pr-text" rows="2" maxlength="300" placeholder="' + (rl.role === 'core' ? '例如:因為我每次都在講它,而且和很多想法有關。' : '例如:我還沒有做實驗,所以還沒說清楚。') + '"' + dis + '></textarea>';
      h += P.readonly ? '<div class="note">老師檢視模式:只能看,不能代學生回答。</div>' : '<button type="button" class="sv" data-k="pr-save">存下我的想法</button>';
      var hist = P.history ? P.history(c.t) : [];
      if (hist.length) h += '<div class="hist"><b>我之前的回答</b>' + hist.slice(0, 3).map(function (x) { return '<div>' + esc(x.time) + ' ' + (x.choice ? '〔' + esc(x.choice) + '〕' : '') + esc(x.text) + '</div>'; }).join('') + '</div>';
      return h + '<div class="note">「在中間」只代表它和很多詞一起出現,不代表比較重要或比較正確;「在邊邊」也不一定不好,可能只是還沒被討論到。</div></div>';
    }
    function bindProbe(c) {
      var P = opts.probe; if (!P || P.readonly) return;
      var sv = card.querySelector('[data-k=pr-save]'); if (!sv) return;
      sv.onclick = function () {
        var rl = model.roleAt(c, inst.k); if (!rl) return;
        var tx = card.querySelector('[data-k=pr-text]'), ch = card.querySelector('input[name=kbc-pr-ch]:checked'), box = card.querySelector('.kbc-pr');
        var text = tx ? tx.value.trim() : '', choice = ch ? ch.value : '';
        function say(msg, col) { var n = box.querySelector('[data-k=pr-msg]'); if (!n) { n = doc.createElement('div'); n.className = 'note'; n.setAttribute('data-k', 'pr-msg'); box.appendChild(n); } n.style.color = col; n.textContent = msg; }
        if (rl.role === 'edge' && !choice) { say('先選一個你覺得最像的喔 👆', '#be123c'); return; }
        if (!text && !choice) { say('寫一點想法再存喔 ✏️', '#be123c'); if (tx) tx.focus(); return; }
        var ok = P.save({ term: c.t, role: rl.role, degree: rl.degree, weight: rl.weight, n: rl.n, choice: choice || undefined, text: text, step: inst.k });
        if (ok === false) { say('這次沒有存成功', '#be123c'); return; }
        drawCard(); var b2 = card.querySelector('.kbc-pr'); if (b2) { var d2 = doc.createElement('div'); d2.className = 'note'; d2.setAttribute('data-k', 'pr-msg'); d2.style.color = '#047857'; d2.textContent = '已存下 ✓ 老師也能在 ASRA 紀錄看到。'; b2.appendChild(d2); }
      };
    }
    function drawCard() {
      applyFs(); var c = conceptOf(inst.sel); if (!c) { card.innerHTML = '<div class="kbc-empty">點雲裡的一個詞,看它的故事。</div>' + rolesSummary(); bindRoles(); return; }
      var ps = model.postsAt(c, inst.k);
      var fsBar = '<div class="kbc-fs">字大小 <button type="button" data-fs="-1" aria-label="縮小字">A−</button><button type="button" data-fs="1" aria-label="放大字">A＋</button><button type="button" data-tog class="kbc-tog" title="展開或收合故事卡">▾ 收合</button></div>';
      if (!ps.length) { card.innerHTML = '<div style="display:flex;align-items:center"><h3>' + esc(c.t) + '</h3>' + fsBar + '</div><div class="kbc-body"><div class="kbc-empty">第 ' + inst.k + ' 天,「' + esc(c.t) + '」還沒有出現。把進度往後拉看看。</div></div>'; bindFs(); bindTog(); return; }
      var st = model.stateAt(c, inst.k), ev = ps.filter(function (p) { return p.evid; }).length, rc = 0; ps.forEach(function (p) { p.rep.forEach(function (rp) { if (rp.step <= inst.k) rc++; }); });
      var rel = model.related(c, inst.k).slice(0, 4);
      var h = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3>' + esc(c.t) + '</h3>' + stTag(st) + (model.turningAt(c, inst.k) ? '<span class="kbc-tg" style="--cc:#f5a300"><span class="kbc-star">★</span> 這是你的轉折點</span>' : '') + fsBar + '</div>';
      h += '<div class="sub">第 ' + ps[0].step + ' 天出現 · 你的貼文 ' + ps.length + ' 則 · 同學回應 ' + rc + ' 則' + (rel.length ? ' · 常和「' + rel.map(function (x) { return esc(x.t); }).join('、') + '」一起出現' : '') + '</div>';
      h += '<div class="kbc-body"><div class="sub" style="margin-top:8px">這個想法是怎麼一路變過來的:</div><div class="kbc-path">';
      ps.forEach(function (p) {
        h += '<div class="kbc-step" style="--cc:var(--' + p.ty + ')"><small>' + esc(opts.labels ? opts.labels[p.step] : '第 ' + p.step + ' 天') + '</small><span class="kbc-tg" style="--cc:var(--' + p.ty + ')">' + esc(STATE_TYPE(p.ty)) + '</span>「' + esc(p.text) + '」<button type="button" class="kbc-lk" data-go="' + esc(p.id) + '" data-topic="' + esc(p.topicId) + '">看原文</button></div>';
        p.rep.forEach(function (rp) { if (rp.step <= inst.k) h += '<div class="kbc-rep">' + esc(opts.labels ? opts.labels[rp.step] : '第 ' + rp.step + ' 天') + ' ' + esc(rp.by) + ' 回應 <span class="kbc-tg" style="--cc:var(--' + rp.ty + ')">' + esc(STATE_TYPE(rp.ty)) + '</span>' + (rp.text ? '「' + esc(rp.text) + '」' : '') + '</div>'; });
      });
      h += '</div><div class="kbc-two"><div class="kbc-box"><div class="sub" style="margin:0">證據</div>' + (ev ? '已經有 ' + ev + ' 則貼文提到實驗、觀察或資料' : '還沒有提到實驗或資料來支持') + '</div><div class="kbc-box next"><div class="sub" style="margin:0;font-weight:700">下一步可以做什麼</div>' + STATE_NEXT[st] + (ev ? '' : ' 也可以找一個實驗或資料。') + '</div></div>';
      h += probeHtml(c) + '</div>'; card.innerHTML = h; bindFs(); bindTog(); bindProbe(c);
      card.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { if (opts.onGoPost) opts.onGoPost(b.getAttribute('data-go'), b.getAttribute('data-topic')); }; });
    }
    function STATE_TYPE(k) { return { q: '提問', e: '延伸', i: '改進', c: '反例', r: '昇華' }[k] || k; }
    function bindFs() { card.querySelectorAll('[data-fs]').forEach(function (b) { b.onclick = function () { fsIdx = clamp(fsIdx + Number(b.getAttribute('data-fs')), 0, fsList.length - 1); try { global.localStorage.setItem(fsKey, String(fsIdx)); } catch (e) {} applyFs(); }; }); }

    /* ---- 逐步畫面 ---- */
    inst.render = function (k, light) {
      k = clamp(Math.round(k), 0, K); inst.k = k;
      var n = 0, pos = {};
      model.concepts.forEach(function (c) {
        var el = wEl[c.t], ps = model.postsAt(c, k), vis = ps.length > 0;
        el.classList.toggle('on', vis); el.classList.toggle('sel', vis && inst.sel === c.t);
        var p = posOf(c, k); pos[c.t] = p; el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
        var hw = hEl[c.t]; hw.style.transform = el.style.transform; hw.classList.toggle('on', vis); hw.classList.toggle('sel', vis && inst.sel === c.t);
        if (!vis) return; n++;
        var st = model.stateAt(c, k), f = chipFont(ps.length) * (p.f || 1), chip = el.firstChild, ct = chip.querySelector('.kbc-ct');
        hw.style.fontSize = f + 'px';
        el.style.setProperty('--cc', colorOf(c, k, st)); chip.style.fontSize = f + 'px'; el.style.zIndex = rig && rig.active() ? String(Math.round(500 + p.z)) : String(ps.length); el.setAttribute('data-d', ps.length >= 3 ? '3' : String(ps.length));
        var old = chip.querySelector('.kbc-star'); if (old) old.remove(); var op = chip.querySelector('.kbc-pulse'); if (op) op.remove();
        if (model.turningAt(c, k)) { var sp = doc.createElement('span'); sp.className = 'kbc-star'; sp.textContent = '★'; ct.appendChild(sp); }
        if (k > 0 && ps[0].step === k) { var pu = doc.createElement('span'); pu.className = 'kbc-pulse'; chip.insertBefore(pu, chip.firstChild); }
      });
      // ---- 資料線與緞帶(照示意圖):都從「字(或光暈)的邊緣」出發,不穿過字;緞帶只畫一起出現最多次的前 6 條 ----
      var shown = [];
      model.links.forEach(function (l, i) { var w = model.linkWeight(l, k); if (w && model.visible(conceptOf(l.a), k) && model.visible(conceptOf(l.b), k)) shown.push({ i: i, w: w }); });
      shown.sort(function (x, y) { return (y.w - x.w) || (x.i - y.i); });
      var ribTop = {};
      if (inst.cmode === 'a') {   // 緞帶優先連「外圍的詞」彼此(繞著中間那個大字畫圈圈),不夠 3 條才補上連到中間大字的
        var outer = shown.filter(function (s2) { var l2 = model.links[s2.i]; return l2.a !== biggest.t && l2.b !== biggest.t; }), pick = outer.slice(0, 6);
        shown.forEach(function (s2) { if (pick.length < 3 && pick.indexOf(s2) < 0) pick.push(s2); });
        pick.forEach(function (s2) { ribTop[s2.i] = s2.w; });
      }
      function edgeOf(c, p, ux, uy) {   // 從詞的中心朝 (ux,uy) 走到字(模式 A)或光暈(模式 B)邊緣的那一點
        var f = chipFont(model.postsAt(c, k).length || 1) * (p.f || 1), ln = c.t.length, sc;
        if (inst.cmode === 'b') { var rx = .34 * (ln * 1.45 + 2.6) * f, ry = (20 / 60) * 3.5 * f; sc = 1 / Math.sqrt(ux * ux / (rx * rx) + uy * uy / (ry * ry)) + 2; }
        else { var hx = (ln + 1) * f / 2 + 6, hy = .75 * f + 5; sc = Math.min(hx / (Math.abs(ux) || 1e-6), hy / (Math.abs(uy) || 1e-6)); }
        return { x: p.x + ux * sc, y: p.y + uy * sc };
      }
      // 資料線太多會眼花:只有「一起出現最多次」的前幾條畫清楚,其餘的淡淡的;點一個詞時,和它有關的線全部變清楚
      var strong = {}; shown.slice(0, Math.max(7, n)).forEach(function (s2) { strong[s2.i] = 1; });
      var f1 = function (v) { return v.toFixed(1); };
      model.links.forEach(function (l, i) {
        var a = conceptOf(l.a), b = conceptOf(l.b), w = model.linkWeight(l, k), el = lEl[i], R = rEl[i], hp = hitEl[i];
        if (!w || !model.visible(a, k) || !model.visible(b, k)) { el.setAttribute('d', ''); hp.setAttribute('d', ''); el.style.opacity = 0; R.g.style.display = 'none'; return; }
        var pa0 = pos[l.a], pb0 = pos[l.b], dx0 = pb0.x - pa0.x, dy0 = pb0.y - pa0.y, len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1, ux = dx0 / len0, uy = dy0 / len0, nx = -uy, ny = ux;
        var ea = edgeOf(a, pa0, ux, uy), eb = edgeOf(b, pb0, -ux, -uy), elen = (eb.x - ea.x) * ux + (eb.y - ea.y) * uy;
        if (elen < 10) { el.setAttribute('d', ''); hp.setAttribute('d', ''); el.style.opacity = 0; R.g.style.display = 'none'; return; }   // 兩個詞靠太近,不畫線
        var off = Math.min(36, elen * 0.16), mx = (ea.x + eb.x) / 2, my = (ea.y + eb.y) / 2;
        el.setAttribute('d', 'M' + f1(ea.x) + ' ' + f1(ea.y) + ' Q' + f1(mx + nx * off) + ' ' + f1(my + ny * off) + ' ' + f1(eb.x) + ' ' + f1(eb.y)); hp.setAttribute('d', el.getAttribute('d'));
        el.setAttribute('stroke-width', '1.2'); el.style.opacity = ''; el.classList.toggle('weak', !strong[i]);
        if (!ribTop[i]) { R.g.style.display = 'none'; return; }
        // 緞帶:半透明的玻璃彩帶,兩端尖、中間寬。有的繞成弧形(大圈圈),有的扭成 S 形;每一條的形狀由兩個詞決定,不會每次不一樣
        var ea = pa0, eb = pb0; elen = len0;   // 緞帶從字的後面穿過去(兩端尖尖的藏在字下面);虛線才從邊緣出發
        var hh = hash(l.a + '|' + l.b), arc = hh % 3 !== 0, side = ((hh >> 3) & 1) ? 1 : -1, bulge = elen * (arc ? .4 : .27) * side, wd = 14 + Math.min(w, 4) * 4;
        var c1 = { x: ea.x + ux * elen * .3 + nx * bulge, y: ea.y + uy * elen * .3 + ny * bulge }, c2 = { x: ea.x + ux * elen * .7 + nx * (arc ? bulge : -bulge), y: ea.y + uy * elen * .7 + ny * (arc ? bulge : -bulge) };
        function band(lo, hi) {
          function C(c, o) { return f1(c.x + nx * o) + ' ' + f1(c.y + ny * o); }
          return 'M' + f1(ea.x) + ' ' + f1(ea.y) + ' C' + C(c1, hi) + ' ' + C(c2, hi) + ' ' + f1(eb.x) + ' ' + f1(eb.y) + ' C' + C(c2, lo) + ' ' + C(c1, lo) + ' ' + f1(ea.x) + ' ' + f1(ea.y) + 'Z';
        }
        function strand(o) { function C(c) { return f1(c.x + nx * o) + ' ' + f1(c.y + ny * o); } return 'M' + f1(ea.x) + ' ' + f1(ea.y) + ' C' + C(c1) + ' ' + C(c2) + ' ' + f1(eb.x) + ' ' + f1(eb.y); }
        R.g.style.display = ''; R.body.setAttribute('d', band(-wd, wd)); R.sheen.setAttribute('d', band(wd * .12, wd * .72));
        R.fibs[0].setAttribute('d', strand(-wd * .55)); R.fibs[1].setAttribute('d', strand(wd * .05)); R.fibs[2].setAttribute('d', strand(wd * .6));
        R.grad.setAttribute('x1', f1(ea.x)); R.grad.setAttribute('y1', f1(ea.y)); R.grad.setAttribute('x2', f1(eb.x)); R.grad.setAttribute('y2', f1(eb.y));
        var ca = 'color-mix(in srgb,' + colorOf(a, k, model.stateAt(a, k)) + ' 78%,#fff)', cb = 'color-mix(in srgb,' + colorOf(b, k, model.stateAt(b, k)) + ' 78%,#fff)';
        R.sts[0].style.stopColor = ca; R.sts[1].style.stopColor = ca; R.sts[2].style.stopColor = cb; R.sts[3].style.stopColor = cb;
      });
      if (!light) { q('day').textContent = k; q('n').textContent = n; var chg = k > 0 ? model.changes(k) : ''; q('cap').innerHTML = chg ? chg : (k === 0 ? '起點:雲還沒長出來' : ''); }
      if (inst.sel && !conceptOf(inst.sel)) inst.sel = null;
      if (!light) drawCard();
      if (inst.pinned) { if (inst.pinLine != null) showLineTip(inst.pinLine, true); else if (inst.sel && model.postsAt(conceptOf(inst.sel), k).length) showTip(inst.sel, true); else hideTip(true); }
      if (inst.pinLine != null && inst.pinned) applyDimLine(inst.pinLine); else applyDim(inst.pinned ? inst.sel : null);
    };
    inst.select = function (t, pin) { inst.pinLine = null; inst.sel = t; if (pin) inst.pinned = true; inst.render(inst.k); if (pin) { showTip(t, true); } if (opts.onPick) opts.onPick(t); };
    // 詞的互動:移上去有提示,點一下釘住並說明
    Object.keys(wEl).forEach(function (t) {
      var w = wEl[t];
      w.addEventListener('mouseenter', function () { if (!inst.pinned) { showTip(t, false); applyDim(t); } });
      w.addEventListener('mouseleave', function () { if (!inst.pinned) hideTip(false); });
      w.addEventListener('click', function (e) {
        e.stopPropagation(); if (moved) return;
        inst.pinLine = null; inst.sel = t; inst.pinned = true; inst.render(inst.k); showTip(t, true); toast('已選擇「' + t + '」,它的故事在下面 ↓'); if (opts.onPick) opts.onPick(t); var h = q('hint'); if (h) h.style.display = 'none';
      });
    });
    // 預設選一個:用最多次的詞
    var top = model.concepts.slice().sort(function (a, b) { return b.count - a.count; })[0]; inst.sel = top ? top.t : null;
    inst.fit = function () { base = fit(); applyView(false); inst.render(inst.k); };
    if (global.ResizeObserver) { try { new global.ResizeObserver(function () { var nb = fit(); if (Math.abs(nb - base) > 0.02) { base = nb; applyView(false); inst.render(inst.k); } }).observe(stage); } catch (e) {} }
    root.querySelectorAll('[data-cs]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); inst.setColorMode('b', b.getAttribute('data-cs')); }); });
    // 「拖空白處:🔄 旋轉 ✋ 平移 ↺ 回正 ⟲ 還原」與「⤢ 放大」(和其他關聯圖一樣;需要 kb-3d.js)
    var zoomedSingle = false;
    function paintZoom() { if (inst.zoomBtn) { var on = opts.zoomState ? opts.zoomState() : zoomedSingle; inst.zoomBtn.textContent = on ? '✕ 縮回' : '⤢ 放大'; inst.zoomBtn.title = on ? '關閉放大視窗(ESC)' : '放大視窗:整個視窗放大來看,操作和原本一樣'; inst.zoomBtn.setAttribute('aria-label', inst.zoomBtn.title); } }
    inst.paintZoom = paintZoom;
    inst.toggleZoom = function () {
      if (opts.zoomHost) return opts.zoomHost();
      var KB = global.KB3D; if (!KB) return;
      if (zoomedSingle) { KB.zoomClose(); return; }
      zoomedSingle = true; paintZoom();
      KB.zoom({ title: '我的概念雲', els: [root], pad: '8px', opener: inst.zoomBtn,
        onOpen: function (body) { stage.style.height = Math.max(300, body.clientHeight - 80) + 'px'; [30, 250].forEach(function (ms) { setTimeout(function () { if (zoomedSingle) inst.fit(); }, ms); }); },
        onClose: function () { zoomedSingle = false; stage.style.height = ''; paintZoom(); },
        after: function () { setTimeout(inst.fit, 30); } });
    };
    var slot = q('ctl');
    if (slot && global.KB3D) {
      slot.appendChild(global.KB3D.dragMode.ctl(inst.level, inst.reset));
      var zb = doc.createElement('button'); zb.type = 'button'; zb.className = 'kb-3d-btn kb-zoom-btn kbc-zoombtn';
      zb.style.cssText = 'padding:1px 10px;border-radius:999px;border:1px solid #4f46e5;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:800;cursor:pointer;line-height:1.6;margin-left:6px';
      zb.addEventListener('click', function (e) { e.stopPropagation(); inst.toggleZoom(); });
      slot.appendChild(zb); inst.zoomBtn = zb; paintZoom();
    }
    drawLegend();
    applyView(false); inst.render(K);
    return inst;
  }

  /* ---------- 左右並排:模式 A(狀態色)在左、模式 B(時間色)在右,同一個進度、同一個選取 ---------- */
  function createDual(host, model, opts) {
    opts = opts || {}; injectCSS();
    if (!model.concepts.length) return create(host, model, opts);
    host.innerHTML = '';
    var grid = doc.createElement('div'); grid.className = 'kbc-dual';
    var ha = doc.createElement('div'), hb = doc.createElement('div'); ha.className = 'kbc-col'; hb.className = 'kbc-col';
    grid.appendChild(ha); grid.appendChild(hb); host.appendChild(grid);
    var a, b, zoomed = false;
    function sub(extra) { var x = {}; for (var k in opts) x[k] = opts[k]; for (var e in extra) x[e] = extra[e]; return x; }
    function paintZ() { [a, b].forEach(function (i) { if (i && i.paintZoom) i.paintZoom(); }); }
    function sizeStages(body) { var mh = 0; Array.prototype.forEach.call(grid.querySelectorAll('.kbc-mode'), function (m) { mh = Math.max(mh, m.offsetHeight); }); grid.style.setProperty('--kbc-zh', Math.max(300, body.clientHeight - 16 - mh - 14) + 'px'); }
    function toggleZoom() {
      var KB = global.KB3D; if (!KB) return;
      if (zoomed) { KB.zoomClose(); return; }
      zoomed = true; paintZ();
      KB.zoom({ title: '我的概念雲(左:想法狀態　右:首次出現時間)', els: [grid], pad: '8px', opener: a && a.zoomBtn,
        onOpen: function (body) { grid.classList.add('kbc-zoomed'); sizeStages(body); [30, 250].forEach(function (ms) { setTimeout(function () { if (zoomed) { sizeStages(body); a.fit(); } }, ms); }); },
        onClose: function () { zoomed = false; grid.classList.remove('kbc-zoomed'); grid.style.removeProperty('--kbc-zh'); paintZ(); },
        after: function () { setTimeout(function () { a.fit(); }, 30); } });
    }
    opts.zoomHost = toggleZoom; opts.zoomState = function () { return zoomed; };
    a = create(ha, model, sub({ colorMode: 'a', noCard: true, onPick: function (t) { if (b) { b.sel = t; b.pinned = false; b.render(b.k); } } }));
    b = create(hb, model, sub({ colorMode: 'b', noCard: true, probe: null, onPick: function (t) { a.sel = t; a.pinned = false; a.render(a.k); } }));
    host.appendChild(a.cardWrap);            // 故事卡放在兩張圖下面(整排寬)
    var ra = a.render, rf = a.fit;
    a.render = function (k) { ra(k); b.render(k); };
    a.fit = function () { rf(); b.fit(); };
    b.goCard = function () { a.goCard(); };
    a.b = b; a.dual = true; a.main = grid;
    return a;
  }

  global.KBConcept = { build: build, create: create, createDual: createDual, layout: layout, tokens: tokens, LEX: LEX, _STATE_NAME: STATE_NAME };
})(typeof window !== 'undefined' ? window : globalThis);
