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
  // 雲朵外觀的總開關:false=只顯示文字(目前使用),true=水墨/立體雲朵(之後慢慢調整)
  var CLOUDS = false;
  // 單一大雲:只有一朵雲(依參考圖的藍色層層雲團),所有文字都在裡面,文字越多雲越大
  var ONE_CLOUD = true;
  var CLOUD_IMG = 'kb-cloud.png', CLOUD_ASP = 1395 / 808;   // 參考圖(去背的 PNG,檔案載入失敗時改用手繪的雲)
  // 要包住 bw×bh 的文字,雲(保持原圖比例)需要多大
  function cloudBox(bw, bh) { var w = Math.max(bw / .82 + 30, (bh / .64 + 26) * CLOUD_ASP, 250); return { w: w, h: w / CLOUD_ASP }; }
  function chipFont(count) { return 14 + Math.min(count, 4) * 4; }
  // 每個詞是一朵雲:寬 = 字數 + 3 個字寬,高 = 2.7 個字高(單位是 em,字越大雲越大)
  function cloudDim(t) { return CLOUDS ? { w: t.length + 3.2, h: 2.8 } : { w: t.length + 1.5, h: 1.7 }; }
  function chipBox(c) { var f = chipFont(c.count); return CLOUDS ? { w: (c.t.length + 1.9) * f, h: f * 1.75 } : { w: cloudDim(c.t).w * f, h: cloudDim(c.t).h * f }; }   // 只算文字的位置:小雲可以互相重疊,但字不能疊在一起
  // 不規則的雲朵:一個扁平的雲底 + 幾個大小不一、位置有點偏的凸起;同一個詞永遠長一樣,不同的詞長不一樣
  function cloudShapes(seed, W, H, big) {
    var r = rng(hash(seed)), sh = [], i, kind = Math.floor(r() * 4);   // 0 一般 1 高塔 2 雙峰 3 扁長
    var lean = (r() - .5) * .5;                                        // 整朵雲往左或往右歪一點
    var nb = clamp(Math.round(W / (kind === 3 ? 1.0 : 1.35)), 3, big ? 8 : 7);
    // 雲腳:一排大小不一、高低不同的圓,擠成圓滾滾的底
    for (i = 0; i < nb; i++) {
      var t = nb === 1 ? .5 : i / (nb - 1), e = Math.sin(Math.PI * t);
      sh.push({ cx: -W * .4 + t * W * .8 + (r() - .5) * W * .05, cy: H * (.1 + .08 * r()) - H * .04 * e, r: H * (.2 + .1 * r() + .07 * e) });
    }
    // 雲頂:大小與位置每朵都不一樣
    var peaks = kind === 1 ? 1 : kind === 2 ? 2 : kind === 3 ? 2 : 3, p;
    for (p = 0; p < peaks; p++) {
      var px = kind === 1 ? (r() - .5) * W * .5 : -W * .3 + (p + .5) / peaks * W * .6 + (r() - .5) * W * .12;
      var pr = H * (kind === 1 ? .36 + .1 * r() : kind === 3 ? .22 + .08 * r() : .26 + .14 * r());
      sh.push({ cx: px + lean * W * .15, cy: -H * (kind === 1 ? .22 : kind === 3 ? .08 : .1 + .12 * r()), r: pr });
      if (r() > .35) sh.push({ cx: px + (r() - .5) * W * .25, cy: -H * (.02 + .12 * r()), r: H * (.18 + .1 * r()) });   // 旁邊再冒出一團小的
    }
    // 兩端的小圓角
    sh.push({ cx: -W * (.43 + .03 * r()), cy: H * (.12 + .06 * r()), r: H * (.15 + .07 * r()) });
    sh.push({ cx: W * (.43 + .03 * r()), cy: H * (.12 + .06 * r()), r: H * (.15 + .07 * r()) });
    // 平平的雲底
    sh.push({ cx: 0, cy: H * .2, rx: W * (.42 + .04 * r()), ry: H * (.17 + .04 * r()) });
    sh.sort(function (a, b) { return a.cy - b.cy; });   // 高的先畫(在後面),低的後畫(在前面),重疊處才有前後
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    sh.forEach(function (q) { var rx = q.rx || q.r, ry = q.ry || q.r; x0 = Math.min(x0, q.cx - rx); x1 = Math.max(x1, q.cx + rx); y0 = Math.min(y0, q.cy - ry); y1 = Math.max(y1, q.cy + ry); });
    return { sh: sh, x0: x0, x1: x1, y0: y0, y1: y1, seed: hash(seed) % 997 };
  }
  // ---------- 水墨潑畫的大雲(單位是 px):多團雲疊成一整朵,深藍墨在邊緣與底部暈開,外圍有潑濺的墨點與墨痕 ----------
  function inkMass(A, B, seedStr) {
    var r = rng(hash(seedStr)), L = [], i, n, t, e;
    L.push({ cx: 0, cy: 0, rx: A * .82, ry: B * .62 });
    n = Math.max(4, Math.round(A * 2 / (B * .9)));
    for (i = 0; i < n; i++) { t = i / (n - 1); e = Math.sin(Math.PI * t); L.push({ cx: -A * .86 + t * A * 1.72 + (r() - .5) * A * .06, cy: B * (.5 + .06 * r()) - B * .08 * e, r: B * (.3 + .1 * r() + .08 * e) }); }   // 底部大小不一的雲腳
    n = Math.max(3, Math.round(A * 2 / (B * 1.2)));
    for (i = 0; i < n; i++) { t = (i + .5) / n; e = Math.sin(Math.PI * t); L.push({ cx: -A * .75 + t * A * 1.5 + (r() - .5) * A * .1, cy: -B * (.18 + .3 * e * (.6 + .6 * r())), r: B * (.3 + .22 * e * (.7 + .5 * r())) }); }   // 高高低低的雲頂
    for (i = 0; i < 10; i++) L.push({ cx: (r() - .5) * A * 1.5, cy: (r() - .5) * B * .95, r: B * (.2 + .16 * r()) });   // 大雲裡面再疊起來的小雲團
    L.push({ cx: -A * .95, cy: B * .35, r: B * .28 }, { cx: A * .95, cy: B * .35, r: B * .28 });
    L = L.map(function (o) { return o.rx ? o : { cx: o.cx, cy: o.cy, rx: o.r, ry: o.r }; });
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    L.forEach(function (o) { x0 = Math.min(x0, o.cx - o.rx); x1 = Math.max(x1, o.cx + o.rx); y0 = Math.min(y0, o.cy - o.ry); y1 = Math.max(y1, o.cy + o.ry); });
    var sx = 2 * A / (x1 - x0), sy = 2 * B / (y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    L = L.map(function (o) { return { cx: (o.cx - mx) * sx, cy: (o.cy - my) * sy, rx: o.rx * sx, ry: o.ry * sy }; });
    L.sort(function (a, b) { return a.cy - b.cy; });
    function el(o, grow) { return '<ellipse cx="' + o.cx.toFixed(1) + '" cy="' + o.cy.toFixed(1) + '" rx="' + (o.rx + (grow || 0)).toFixed(1) + '" ry="' + (o.ry + (grow || 0)).toFixed(1) + '"/>'; }
    var id = 'kbcm' + (++cloudId), sd = hash(seedStr) % 991, pad = 80, W = 2 * A + pad * 2, H = 2 * B + pad * 2 + 30;
    var defs = '<defs>' +
      '<filter id="' + id + 'w" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".014" numOctaves="3" seed="' + sd + '" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="34" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="3"/></filter>' +
      '<filter id="' + id + 'r" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="' + (sd + 7) + '" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G"/></filter>' +
      '<filter id="' + id + 'b" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006 .07" numOctaves="3" seed="' + (sd + 3) + '"/><feColorMatrix values="0 0 0 0 .13  0 0 0 0 .36  0 0 0 0 .62  2.6 0 0 0 -1.05"/></filter>' +
      '<filter id="' + id + 's" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>' +
      '<filter id="' + id + 'p" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".8"/></filter>' +
      '<radialGradient id="' + id + 'g" cx=".45" cy=".28" fx=".35" fy=".2" r=".9"><stop offset="0" stop-color="#eaf7ff"/><stop offset=".32" stop-color="#b4dcfa"/><stop offset=".68" stop-color="#5fb0ee"/><stop offset="1" stop-color="#2f79c4"/></radialGradient>' +
      '<linearGradient id="' + id + 'v" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="' + (-B).toFixed(0) + '" y2="' + B.toFixed(0) + '"><stop offset="0" stop-color="#9fd2f4"/><stop offset="1" stop-color="#2b74bb"/></linearGradient>' +
      '<clipPath id="' + id + 'c">' + L.map(function (o) { return el(o); }).join('') + '</clipPath></defs>';
    var wash = '<g class="mw" filter="url(#' + id + 'w)" fill="url(#' + id + 'v)" opacity=".82">' + L.map(function (o) { return el(o, 9); }).join('') + '</g>';
    var body = '<g class="mb" filter="url(#' + id + 'r)" fill="url(#' + id + 'g)" stroke="#1d5a9c" stroke-opacity=".5" stroke-width="2.4">' + L.map(function (o) { return el(o); }).join('') + '</g>';
    var brush = '<g clip-path="url(#' + id + 'c)"><rect class="mk" x="' + (-A - 20) + '" y="' + (-B - 20) + '" width="' + (2 * A + 40) + '" height="' + (2 * B + 40) + '" filter="url(#' + id + 'b)" opacity=".2"/></g>';
    var lite = '<g class="mh" filter="url(#' + id + 's)" fill="#fff" opacity=".5"><ellipse cx="' + (-A * .35).toFixed(0) + '" cy="' + (-B * .45).toFixed(0) + '" rx="' + (A * .3).toFixed(0) + '" ry="' + (B * .18).toFixed(0) + '"/><ellipse cx="' + (A * .28).toFixed(0) + '" cy="' + (-B * .28).toFixed(0) + '" rx="' + (A * .2).toFixed(0) + '" ry="' + (B * .12).toFixed(0) + '"/><ellipse cx="' + (-A * .1).toFixed(0) + '" cy="' + (B * .02).toFixed(0) + '" rx="' + (A * .34).toFixed(0) + '" ry="' + (B * .1).toFixed(0) + '" opacity=".6"/></g>';
    var spl = '<g class="ms" filter="url(#' + id + 'p)" fill="#24609f">';
    for (i = 0; i < 24; i++) { var an = r() * Math.PI * 2, d = 1.03 + r() * .3, rr = 1.5 + r() * r() * 9; spl += '<circle cx="' + (Math.cos(an) * A * d).toFixed(1) + '" cy="' + (Math.sin(an) * B * d).toFixed(1) + '" r="' + rr.toFixed(1) + '" opacity="' + (.25 + r() * .4).toFixed(2) + '"/>'; }
    for (i = 0; i < 4; i++) { var dx = (r() - .5) * A * 1.4, dl = 10 + r() * 20; spl += '<rect x="' + (dx - 2).toFixed(1) + '" y="' + (B * .88).toFixed(1) + '" width="4.4" height="' + dl.toFixed(1) + '" rx="2.2" opacity=".38"/><circle cx="' + dx.toFixed(1) + '" cy="' + (B * .88 + dl + 3).toFixed(1) + '" r="3.6" opacity=".4"/>'; }
    spl += '</g>';
    return { w: W, h: H, svg: '<svg class="kbc-mass-svg" viewBox="' + (-W / 2).toFixed(0) + ' ' + (-H / 2 + 12).toFixed(0) + ' ' + W.toFixed(0) + ' ' + H.toFixed(0) + '" width="' + W.toFixed(0) + '" height="' + H.toFixed(0) + '" aria-hidden="true">' + defs + wash + body + brush + lite + spl + '</svg>' };
  }
  // ---------- 單一大雲:照參考圖畫的藍色層層雲團(viewBox 480x300),後面深藍的大團、中間淺一點的小雲團、前面兩朵亮亮的小雲 ----------
  function oneCloud() {
    var id = 'kbc1' + (++cloudId);
    function circ(o) { return o.length === 4 ? '<ellipse cx="' + o[0] + '" cy="' + o[1] + '" rx="' + o[2] + '" ry="' + o[3] + '"/>' : '<circle cx="' + o[0] + '" cy="' + o[1] + '" r="' + o[2] + '"/>'; }
    function layer(list, grad, rim) { return '<g fill="url(#' + id + grad + ')" stroke="' + rim + '" stroke-opacity=".62" stroke-width="2.4" vector-effect="non-scaling-stroke">' + list.map(circ).join('') + '</g>'; }
    function hi(list) {   // 每個雲團上緣一道亮光
      return '<g fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3.2" stroke-linecap="round" vector-effect="non-scaling-stroke">' + list.filter(function (o) { return o.length === 3; }).map(function (o) {
        var r = o[2] * .8, a1 = 200 * Math.PI / 180, a2 = 292 * Math.PI / 180;
        return '<path d="M' + (o[0] + r * Math.cos(a1)).toFixed(1) + ' ' + (o[1] + r * Math.sin(a1)).toFixed(1) + ' A' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 1 ' + (o[0] + r * Math.cos(a2)).toFixed(1) + ' ' + (o[1] + r * Math.sin(a2)).toFixed(1) + '"/>';
      }).join('') + '</g>';
    }
    var back = [[240, 214, 218, 60], [205, 112, 92], [300, 76, 52], [335, 128, 76], [128, 138, 66], [255, 148, 92], [412, 160, 48], [58, 205, 46], [108, 222, 42], [172, 236, 40], [245, 240, 42], [318, 236, 44], [390, 224, 44], [440, 202, 36]];
    var mid = [[212, 92, 58], [276, 112, 44], [100, 160, 30], [166, 150, 52], [218, 142, 60], [90, 190, 34], [56, 205, 28], [128, 205, 36], [236, 182, 46]];
    var fr = [[352, 206, 92, 30], [305, 190, 26], [335, 172, 34], [378, 176, 30], [408, 198, 24], [318, 208, 22]];
    var fl = [[152, 240, 64, 20], [122, 230, 20], [152, 216, 27], [184, 230, 22]];
    function grad(g, a, b, c) { return '<radialGradient id="' + id + g + '" cx=".4" cy=".28" fx=".32" fy=".2" r=".88"><stop offset="0" stop-color="' + a + '"/><stop offset=".52" stop-color="' + b + '"/><stop offset="1" stop-color="' + c + '"/></radialGradient>'; }
    return '<svg viewBox="0 0 480 300" preserveAspectRatio="none" aria-hidden="true"><defs>' + grad('b', '#a6e0f9', '#6fc3f1', '#2d8ae0') + grad('m', '#d3f2fd', '#98d8f8', '#4ea9ec') + grad('f', '#f1fbff', '#bbe8fb', '#5fb8ee') +
      '<filter id="' + id + 's" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="7"/></filter></defs>' +
      '<ellipse cx="240" cy="284" rx="190" ry="10" fill="#4d7fb0" opacity=".28" filter="url(#' + id + 's)"/>' +
      layer(back, 'b', '#1f78cc') + layer(mid, 'm', '#2f8fdc') + hi(mid) + layer(fr, 'f', '#2f8fdc') + hi(fr) + layer(fl, 'f', '#2f8fdc') + hi(fl) + '</svg>';
  }
  var cloudId = 0;
  function cloudSVG(cs, cls, stroke) {
    function one(p) { return p.rx ? '<ellipse cx="' + p.cx.toFixed(3) + '" cy="' + p.cy.toFixed(3) + '" rx="' + p.rx.toFixed(3) + '" ry="' + p.ry.toFixed(3) + '"/>' : '<circle cx="' + p.cx.toFixed(3) + '" cy="' + p.cy.toFixed(3) + '" r="' + p.r.toFixed(3) + '"/>'; }
    var id = 'kbcg' + (++cloudId), m = stroke ? stroke + .3 : .25, vw = cs.x1 - cs.x0 + m * 2, vh = cs.y1 - cs.y0 + m * 2;
    var all = cs.sh.map(one).join('');
    var defs = '<defs>' +
      // 每一團的光影:亮光在左上,往右下慢慢變成藍色的陰影(底部帶這個詞的狀態色)
      '<radialGradient id="' + id + '" cx=".42" cy=".3" fx=".34" fy=".24" r=".86"><stop offset="0" stop-color="#ffffff"/><stop offset=".42" stop-color="#ffffff"/><stop offset=".72" stop-color="#e3f0fc"/><stop offset=".9" stop-color="#b9d9f6"/><stop offset="1" stop-color="#8fc0ef" class="kbc-gb"/></radialGradient>' +
      // 整朵雲底部再壓一層藍,上面保持亮白
      '<linearGradient id="' + id + 'b" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="' + (cs.y0 + (cs.y1 - cs.y0) * .45).toFixed(3) + '" y2="' + cs.y1.toFixed(3) + '"><stop offset="0" stop-color="#7fb6ec" stop-opacity="0"/><stop offset="1" stop-color="#6aa6e6" stop-opacity=".5" class="kbc-gb2"/></linearGradient>' +
      '<clipPath id="' + id + 'c">' + all + '</clipPath>' +
      // 邊緣像真的雲一樣被撕得毛毛的、每朵不同
      '<filter id="' + id + 'n" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="2" seed="' + (cs.seed || 1) + '" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="' + (stroke ? .2 : .32) + '" xChannelSelector="R" yChannelSelector="G"/></filter>' +
      (stroke ? '<filter id="' + id + 'g" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation=".09"/></filter>' : '') +
      '</defs>';
    var halo = stroke ? '<g class="o" stroke-width="' + (stroke * 2).toFixed(3) + '" filter="url(#' + id + 'g)">' + all + '</g>' : '';
    var body = '<g class="f" fill="url(#' + id + ')" filter="url(#' + id + 'n)">' + all + '</g>';
    var belly = '<g clip-path="url(#' + id + 'c)" filter="url(#' + id + 'n)" class="h"><rect x="' + (cs.x0 - 1).toFixed(3) + '" y="' + cs.y0.toFixed(3) + '" width="' + (cs.x1 - cs.x0 + 2).toFixed(3) + '" height="' + (cs.y1 - cs.y0).toFixed(3) + '" fill="url(#' + id + 'b)"/></g>';
    return '<svg class="' + cls + '" viewBox="' + (cs.x0 - m).toFixed(3) + ' ' + (cs.y0 - m).toFixed(3) + ' ' + vw.toFixed(3) + ' ' + vh.toFixed(3) + '" style="width:' + vw.toFixed(3) + 'em;height:' + vh.toFixed(3) + 'em" aria-hidden="true">' + defs + halo + body + belly + '</svg>';
  }

  function layout(model) {
    var order = model.concepts.slice().sort(function (a, b) { return (a.first - b.first) || (b.count - a.count); }), placed = [], pos = {}, boxes = {};   // 早出現的詞在中心,新長出來的詞在外圍
    model.concepts.forEach(function (c) { boxes[c.t] = chipBox(c); });
    function free(x, y, b) { return !placed.some(function (p) { return Math.abs(x - p.x) < (b.w + p.w) / 2 + 12 && Math.abs(y - p.y) < (b.h + p.h) / 2 + 10; }); }
    function linkedTo(c) { var best = null, bw = 0; model.links.forEach(function (l) { var o = l.a === c.t ? l.b : (l.b === c.t ? l.a : null); if (o && pos[o] && l.posts.length > bw) { bw = l.posts.length; best = o; } }); return best; }
    order.forEach(function (c, idx) {
      var b = boxes[c.t], x = 0, y = 0, found = false, t, near = linkedTo(c);
      // 先試著放在「常一起出現的詞」旁邊,不行再從中心往外找空位(橢圓形螺旋,一定找得到)
      if (near) { for (t = 0; t < 400 && !found; t++) { var a = t * 2.399963 + idx, r = 50 + t * 1.1; x = pos[near].x + Math.cos(a) * r * 1.35; y = pos[near].y + Math.sin(a) * r * 0.7; if (Math.abs(x) < 520 && Math.abs(y) < 200 && free(x, y, b)) found = true; } }
      for (t = 0; t < 6000 && !found; t++) { var a2 = t * 2.399963 + idx * 0.7, r2 = 6 + Math.sqrt(t) * 10; x = Math.cos(a2) * r2 * 1.7; y = Math.sin(a2) * r2 * 0.75; if (free(x, y, b)) found = true; }
      pos[c.t] = { x: x, y: y, w: b.w, h: b.h }; placed.push(pos[c.t]);
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
      '.kbc{--q:#3b8df0;--e:#f2b01e;--i:#27b97a;--c:#ef5b5b;--r:#9a6cf0;--ink:#16315a;--sub:#4b6a97;--line:rgba(60,110,190,.2);font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;color:var(--ink)}',
      '.kbc-stage{position:relative;height:440px;border-radius:20px;overflow:hidden;border:1px solid rgba(80,130,200,.28);background:radial-gradient(ellipse at 50% 40%,#ffffff,#f3f8fd 66%,#e8f1fa);box-shadow:0 18px 40px -22px rgba(40,90,180,.5),inset 0 0 50px rgba(120,170,240,.15);touch-action:pan-x pan-y;cursor:grab;user-select:none;-webkit-user-select:none;outline:none}',
      '.kbc-stage.drag{cursor:grabbing}.kbc-stage:focus-visible{box-shadow:0 0 0 3px rgba(59,141,240,.45)}',
      '.kbc-grid{opacity:0;position:absolute;left:-10%;right:-10%;bottom:-30px;height:190px;transform:perspective(500px) rotateX(62deg);transform-origin:bottom;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:linear-gradient(0deg,#000 10%,transparent 95%);mask-image:linear-gradient(0deg,#000 10%,transparent 95%);pointer-events:none}',
      '.kbc-view{position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0;will-change:transform}',
      '.kbc-view.anim{transition:transform .32s cubic-bezier(.2,.9,.3,1)}',
      '.kbc-lines{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}',
      '.kbc-lines path{fill:none;stroke:rgba(20,60,120,.55);stroke-linecap:round;stroke-dasharray:6 7;animation:kbc-flow 1.6s linear infinite;transition:stroke-width .4s,opacity .3s}',
      '.kbc-lines path.hot{stroke:#2b7fff;opacity:1}.kbc-lines path.dim{opacity:.12}',
      '@keyframes kbc-flow{to{stroke-dashoffset:-26}}',
      '.kbc-w{position:absolute;left:0;top:0;opacity:0;pointer-events:none;transition:transform .7s cubic-bezier(.2,1.1,.3,1),opacity .4s}',
      '.kbc-w.on{opacity:1;pointer-events:auto}',
      '.kbc-w.dim{opacity:.28}',
      '.kbc-dot{width:.55em;height:.55em;border-radius:50%;background:var(--cc);box-shadow:0 0 6px var(--cc)}',
      '.kbc-star{color:#f5a300}',
      '.kbc-chip{position:relative;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);cursor:pointer;transition:transform .22s,font-size .5s;line-height:1}',
      '.kbc-cs{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);overflow:visible;pointer-events:none;filter:drop-shadow(0 .3em .32em rgba(50,100,190,.3));transition:filter .22s}',
      '.kbc-gb{stop-color:color-mix(in srgb,var(--cc,#5aa0e8) 30%,#8fc0ef)}.kbc-gb2{stop-color:color-mix(in srgb,var(--cc,#5aa0e8) 38%,#6aa6e6)}',
      '.kbc-cs .o{fill:var(--cc);stroke:var(--cc);stroke-linejoin:round;opacity:.55}',
      '.kbc-w[data-d="1"] .kbc-cs{opacity:.86;filter:drop-shadow(0 .16em .2em rgba(50,100,190,.18)) blur(.35px)}.kbc-w[data-d="3"] .kbc-cs{filter:drop-shadow(0 .42em .42em rgba(40,90,190,.36))}',
      '.kbc-ct{position:relative;display:flex;align-items:center;gap:.28em;font-weight:800;color:#0a2243;white-space:nowrap;padding-top:.12em;text-shadow:0 0 .1em #fff,0 0 .16em #fff,0 0 .26em #fff,0 0 .4em rgba(255,255,255,.95)}',
      '.kbc-plain{padding:.12em .25em}.kbc-w.sel .kbc-plain .kbc-txt{text-decoration:underline;text-decoration-color:var(--cc);text-decoration-thickness:.14em;text-underline-offset:.18em}',
      '.kbc-one{position:absolute;pointer-events:none;transition:left .9s cubic-bezier(.2,.9,.3,1),top .9s cubic-bezier(.2,.9,.3,1),width .9s cubic-bezier(.2,.9,.3,1),height .9s cubic-bezier(.2,.9,.3,1)}.kbc-one svg{width:100%;height:100%;display:block;overflow:visible}.kbc-one img{width:100%;height:100%;display:block;-webkit-user-drag:none;user-select:none;filter:drop-shadow(0 14px 16px rgba(40,100,170,.22))}',
      '.kbc-mass{position:absolute;pointer-events:none;transform-origin:50% 50%;transition:transform .9s cubic-bezier(.2,.9,.3,1)}.kbc-mass-svg{display:block;overflow:visible}',
      '.kbc-cs .f circle,.kbc-cs .f ellipse{stroke:#2a68a8;stroke-opacity:.42;stroke-width:.05}',
      '.kbc-w:hover .kbc-chip{transform:translate(-50%,-50%) scale(1.08)}',
      '.kbc-w.sel .kbc-cs{filter:drop-shadow(0 0 .3em var(--cc)) drop-shadow(0 .3em .32em rgba(50,100,190,.34))}',
      '.kbc-pulse{position:absolute;left:50%;top:50%;width:140%;height:140%;margin:-70% 0 0 -70%;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--cc) 38%,transparent),transparent 68%);animation:kbc-pl 1.8s ease-out infinite;pointer-events:none}',
      '@keyframes kbc-pl{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(1.5)}}',
      '.kbc-tip{position:absolute;left:0;top:0;z-index:30;width:250px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.97);border:1px solid rgba(80,130,210,.35);box-shadow:0 14px 34px -10px rgba(30,70,150,.5);opacity:0;pointer-events:none;transition:opacity .16s;font-size:13px;line-height:1.55;color:var(--sub)}',
      '.kbc-tip.show{opacity:1}.kbc-tip.pin{pointer-events:auto}',
      '.kbc-tip h4{margin:0 0 4px;font-size:18px;color:var(--ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.kbc-tip .msg{color:var(--ink);font-size:14px;margin:6px 0}',
      '.kbc-tip button{width:100%;margin-top:8px;padding:7px 10px;border-radius:999px;border:none;background:linear-gradient(135deg,#2b7fff,#35c6ff);color:#fff;font-weight:700;font-size:14px;cursor:pointer}',
      '.kbc-hud{position:absolute;z-index:5;font-size:12px;letter-spacing:.06em;color:var(--sub);pointer-events:none}.kbc-hud b{color:var(--ink);font-size:20px;letter-spacing:0}',
      '.kbc-hud.tl{left:14px;top:10px}.kbc-hud.tr{right:14px;top:10px;text-align:right}',
      '.kbc-hint{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:6;font-size:12px;color:var(--sub);background:rgba(255,255,255,.85);border:1px solid rgba(80,130,210,.25);border-radius:999px;padding:3px 12px;white-space:nowrap;pointer-events:none}',
      '.kbc-cap{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:6;max-width:62%;font-size:13px;color:var(--ink);background:rgba(255,255,255,.92);border:1px solid rgba(80,130,210,.3);border-radius:999px;padding:4px 14px;text-align:center;pointer-events:none}',
      '.kbc-cap:empty{display:none}',
      '.kbc-tools{position:absolute;right:10px;bottom:10px;z-index:8;display:flex;flex-direction:column;gap:6px}',
      '.kbc-tools button{width:38px;height:38px;border-radius:12px;border:1px solid rgba(80,130,210,.35);background:rgba(255,255,255,.95);color:var(--ink);font-size:18px;font-weight:700;cursor:pointer;line-height:1;box-shadow:0 4px 12px -6px rgba(30,70,150,.5)}',
      '.kbc-tools button:hover{border-color:var(--q);background:#eef6ff}.kbc-tools .z{font-size:11px;color:var(--sub);text-align:center}',
      '.kbc-toast{position:absolute;left:50%;top:50px;transform:translate(-50%,-12px);z-index:45;padding:7px 16px;border-radius:999px;background:linear-gradient(135deg,#2b7fff,#35c6ff);color:#fff;font-weight:700;font-size:13px;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;white-space:nowrap}',
      '.kbc-toast.show{opacity:1;transform:translate(-50%,0)}',
      '.kbc-legend{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0;font-size:12.5px;color:var(--sub)}',
      '.kbc-main{display:flex;flex-direction:column}.kbc-mode{order:-1;display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 8px;font-size:13px;color:var(--sub);min-height:32px}',
      '.kbc-mt{font-size:15px;color:var(--ink);padding:3px 12px;border-radius:999px;background:#eaf2ff;border:1px solid rgba(80,130,210,.35)}.kbc.tm .kbc-mt{background:#fff1e0;border-color:rgba(196,100,40,.45)}',
      '.kbc-dual{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}.kbc-dual .kbc-stage{height:400px}',
      '@media (max-width:860px){.kbc-dual{grid-template-columns:minmax(0,1fr)}}',
      '.kbc-seg{display:inline-flex;border:1px solid rgba(80,130,210,.4);border-radius:999px;overflow:hidden;background:#fff}',
      '.kbc-seg button{border:0;background:transparent;padding:5px 14px;font:inherit;font-weight:700;color:var(--sub);cursor:pointer;min-height:32px}',
      '.kbc-seg button+button{border-left:1px solid rgba(80,130,210,.3)}',
      '.kbc-seg button[aria-pressed=true]{background:#2b6fe0;color:#fff}',
      '.kbc-seg button:focus-visible{outline:3px solid rgba(59,141,240,.5);outline-offset:-3px}',
      '.kbc-ramp{display:inline-flex;align-items:center;gap:8px;font-weight:700;color:var(--ink)}',
      '.kbc-ramp i{display:inline-block;width:150px;height:14px;border-radius:999px;border:1px solid rgba(120,60,20,.35);background:linear-gradient(90deg,#ffe8b8,#f5a25a 55%,#c4471c)}',
      '.kbc.tm .kbc-dot{box-shadow:0 0 0 1.6px rgba(110,50,15,.65)}',
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
      '@media (max-width:640px){.kbc-stage{height:360px}.kbc-cap{max-width:86%;top:34px}.kbc-hint{font-size:11px}}',
      '@media (prefers-reduced-motion:reduce){.kbc-lines path,.kbc-pulse,.kbc-one,.kbc-w{animation:none!important;transition:none!important}}'
    ].join('\n');
    (doc.head || doc.documentElement).appendChild(s); cssDone = true;
  }

  /* ---------- 顏色模式 ---------- */
  // 模式 A:顏色 = 想法現在的狀態(提問/延伸/改進/質疑/整合)。模式 B:顏色 = 時間,較早的淡米色 → 較晚的深橘紅(本平台自己的色階)
  var RAMP = [[255, 232, 184], [245, 162, 90], [196, 71, 28]];
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t)); var seg = t < .55 ? 0 : 1, a = RAMP[seg], b = RAMP[seg + 1], u = seg ? (t - .55) / .45 : t / .55;
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
    var L = layout(model), r = rng(hash(model.userId)), K = model.K;
    var cmKey = 'kb_cc_cmode'; inst.cmode = opts.colorMode === 'b' ? 'b' : 'a'; inst.csub = 'f'; try { var sv0 = global.localStorage.getItem(cmKey) || ''; if (sv0 === 'bl') inst.csub = 'l'; } catch (e) {}
    var root = doc.createElement('div'); root.className = 'kbc';
    root.innerHTML = '<div class="kbc-main"><div class="kbc-stage" tabindex="0" role="application" aria-label="我的概念雲:滾輪或按鈕放大縮小,拖曳移動,點詞看故事">' +
      '<div class="kbc-grid"></div><div class="kbc-hud tl">第<br><b data-k="day">0</b> 天</div><div class="kbc-hud tr">概念<br><b data-k="n">0</b> 個</div><div class="kbc-cap" data-k="cap" aria-live="polite"></div>' +
      '<div class="kbc-view" data-k="view"><div class="kbc-cloud" data-k="cloud"></div><svg class="kbc-lines" data-k="lines" width="1" height="1"></svg><div class="kbc-words" data-k="words"></div><div class="kbc-tip" data-k="tip"></div></div>' +
      '<div class="kbc-hint" data-k="hint">點一個詞看它的故事 · 滾輪縮放 · 拖曳移動</div><div class="kbc-toast" data-k="toast"></div>' +
      '<div class="kbc-tools"><button type="button" data-z="in" title="放大" aria-label="放大">＋</button><div class="z" data-k="zl">100%</div><button type="button" data-z="out" title="縮小" aria-label="縮小">－</button><button type="button" data-z="reset" title="還原" aria-label="還原" style="font-size:15px">⟲</button></div></div>' +
      '<div class="kbc-mode" data-k="mode"><b class="kbc-mt" data-k="mtitle"></b><span class="kbc-seg kbc-sub" role="group" aria-label="時間要看哪一天" data-k="sub" hidden><button type="button" data-cs="f" aria-pressed="true">第一次出現</button><button type="button" data-cs="l" aria-pressed="false">最近一次用到</button></span></div>' +
      '<div class="kbc-legend" data-k="legend"></div></div>' +
      '';
    host.appendChild(root);
    var cardWrap = doc.createElement('div'); cardWrap.className = 'kbc'; cardWrap.innerHTML = '<div class="kbc-card" data-k="card"></div>'; if (!opts.noCard) host.appendChild(cardWrap);
    inst.cardWrap = cardWrap;
    var q = function (k) { return root.querySelector('[data-k=' + k + ']') || cardWrap.querySelector('[data-k=' + k + ']'); };
    var stage = root.querySelector('.kbc-stage'), view = q('view'), cloud = q('cloud'), words = q('words'), lines = q('lines'), tip = q('tip'), card = q('card');
    inst.root = root; inst.stage = stage; inst.card = card; inst.main = root.querySelector('.kbc-main');

    // 雲與詞的基準尺寸(讓整朵雲剛好放進舞台)
    var fullBox = cloudBox(L.maxx - L.minx, L.maxy - L.miny), extW = ONE_CLOUD ? fullBox.w : (L.maxx - L.minx) + 180, extH = ONE_CLOUD ? fullBox.h : (L.maxy - L.miny) + 150, cx0 = (L.minx + L.maxx) / 2, cy0 = (L.miny + L.maxy) / 2;
    function fit() { var w = stage.clientWidth || 700, h = stage.clientHeight || 440; return clamp(Math.min(w / ((extW + 16) * 1.05), h / ((extH + 16) * 1.06)), 0.5, 1.4); }
    var base = fit();   // 整體縮放比例:讓整朵雲剛好放進舞台(詞與位置一起縮放,不會重疊)
    // 水墨潑畫的大雲:所有的小雲(詞)都在這一整朵大雲裡面;大雲會隨著想法變多慢慢長大
    var mass = null, one = null;
    if (ONE_CLOUD) { one = doc.createElement('div'); one.className = 'kbc-one'; var cimg = doc.createElement('img'); cimg.src = CLOUD_IMG; cimg.alt = ''; cimg.draggable = false; cimg.onerror = function () { one.innerHTML = oneCloud(); }; one.appendChild(cimg); cloud.appendChild(one); }
    if (CLOUDS) { var mk = inkMass(extW / 2 - 28, extH / 2 - 22, model.userId + '|ink'); mass = doc.createElement('div'); mass.className = 'kbc-mass';
    mass.style.cssText = 'left:' + (-mk.w / 2) + 'px;top:' + (-mk.h / 2 + 12) + 'px;width:' + mk.w + 'px;height:' + mk.h + 'px'; mass.innerHTML = mk.svg; cloud.appendChild(mass); }
    // 詞
    var wEl = {}, lEl = {};
    function dayName(s) { return opts.labels && opts.labels[s] ? opts.labels[s] : '第 ' + s + ' 天'; }
    // 這個詞在第 k 天的「時間」位置:0 = 最早、1 = 最晚(用整段時間的長度算,播放時顏色不會跳)
    function timeT(c, k) {
      var ps = model.postsAt(c, k); if (!ps.length) return 0; var s = inst.csub === 'l' ? ps[ps.length - 1].step : ps[0].step;
      return K <= 1 ? .5 : (s - 1) / (K - 1);
    }
    function colorOf(c, k, st) { return inst.cmode === 'b' ? rampColor(timeT(c, k)) : 'var(--' + st + ')'; }
    function drawLegend() {
      var lg = q('legend'); if (!lg) return;
      lg.innerHTML = inst.cmode === 'b'
        ? '<span class="kbc-ramp">較早 <i role="img" aria-label="顏色從淡米色到深橘紅,代表從較早到較晚"></i> 較晚</span><span>' + (inst.csub === 'l' ? '這個詞最近一次出現的時間' : '這個詞第一次出現的時間') + '(' + esc(dayName(1)) + ' → ' + esc(dayName(K)) + ')</span>'
        : '<span>顏色 = 這個想法現在的狀態:</span><span class="kbc-tg" style="--cc:var(--q)">提問中</span><span class="kbc-tg" style="--cc:var(--e)">被延伸</span><span class="kbc-tg" style="--cc:var(--i)">改進中</span><span class="kbc-tg" style="--cc:var(--c)">被質疑</span><span class="kbc-tg" style="--cc:var(--r)">已整合</span>';
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
      var dm = cloudDim(c.t), shp = CLOUDS ? cloudShapes(c.t, dm.w, dm.h, false) : null;
      w.innerHTML = '<div class="kbc-chip' + (CLOUDS ? '' : ' kbc-plain') + '">' + (CLOUDS ? cloudSVG(shp, 'kbc-cs', 0.075) : '') + '<span class="kbc-ct"><span class="kbc-dot"></span><span class="kbc-txt">' + esc(c.t) + '</span></span></div>';
      words.appendChild(w); wEl[c.t] = w;
    });
    model.links.forEach(function (l, idx) { var p = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('data-a', l.a); p.setAttribute('data-b', l.b); lines.appendChild(p); lEl[idx] = p; });

    // 詞(每個詞一朵雲)的位置固定不動,新的詞會一朵一朵飄進來
    var HA = Math.max(extW / 2, 50), HB = Math.max(extH / 2, 40);
    function posOf(c, k) { var p = L.pos[c.t]; return { x: p.x - cx0, y: p.y - cy0 }; }
    function related(t) { var out = {}; model.links.forEach(function (l) { if (l.a === t) out[l.b] = 1; if (l.b === t) out[l.a] = 1; }); return out; }

    /* ---- 放大縮小/移動 ---- */
    function applyView(anim) { view.classList.toggle('anim', !!anim); view.style.transform = 'translate(' + inst.x + 'px,' + inst.y + 'px) scale(' + (inst.z * base) + ')'; q('zl').textContent = Math.round(inst.z * 100) + '%'; }
    function zoomAt(f, px, py, anim) {
      var nz = clamp(inst.z * f, 0.5, 4), k = nz / inst.z;
      inst.x = px - (px - inst.x) * k; inst.y = py - (py - inst.y) * k; inst.z = nz; applyView(anim);
    }
    function stagePt(e) { var rc = stage.getBoundingClientRect(); return { x: e.clientX - rc.left - rc.width / 2, y: e.clientY - rc.top - rc.height / 2 }; }
    inst.zoomIn = function () { zoomAt(1.25, 0, 0, true); }; inst.zoomOut = function () { zoomAt(0.8, 0, 0, true); };
    inst.reset = function () { inst.z = 1; inst.x = 0; inst.y = 0; applyView(true); };
    q('zl').parentNode.querySelectorAll('[data-z]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); var z = b.getAttribute('data-z'); if (z === 'in') inst.zoomIn(); else if (z === 'out') inst.zoomOut(); else inst.reset(); }); });
    stage.addEventListener('wheel', function (e) { e.preventDefault(); var p = stagePt(e); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y, false); }, { passive: false });
    stage.addEventListener('dblclick', function (e) { if (!e.target.closest('.kbc-w') && !e.target.closest('.kbc-tip') && !e.target.closest('.kbc-tools')) inst.reset(); });
    stage.addEventListener('keydown', function (e) {
      var k = e.key; if (k === '+' || k === '=') { inst.zoomIn(); e.preventDefault(); } else if (k === '-' || k === '_') { inst.zoomOut(); e.preventDefault(); } else if (k === '0') { inst.reset(); e.preventDefault(); }
      else if (k.indexOf('Arrow') === 0) { var d = 40; if (k === 'ArrowLeft') inst.x += d; if (k === 'ArrowRight') inst.x -= d; if (k === 'ArrowUp') inst.y += d; if (k === 'ArrowDown') inst.y -= d; applyView(true); e.preventDefault(); }
      else if (k === 'Escape') { hideTip(true); }
    });
    var ptrs = {}, drag = null, moved = false, pinch0 = null;
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.kbc-tools') || e.target.closest('.kbc-tip')) return;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(ptrs);
      if (ids.length === 2) { var a1 = ptrs[ids[0]], a2 = ptrs[ids[1]]; pinch0 = { d: Math.hypot(a1.x - a2.x, a1.y - a2.y), z: inst.z }; drag = null; return; }
      if (e.pointerType === 'touch') return;   // 手機單指留給頁面捲動,兩指才縮放
      drag = { x: e.clientX, y: e.clientY, ox: inst.x, oy: inst.y }; moved = false;
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    });
    stage.addEventListener('pointermove', function (e) {
      if (ptrs[e.pointerId]) { ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY; }
      var ids = Object.keys(ptrs);
      if (pinch0 && ids.length === 2) { var a1 = ptrs[ids[0]], a2 = ptrs[ids[1]], d = Math.hypot(a1.x - a2.x, a1.y - a2.y), rc = stage.getBoundingClientRect(); var mx = (a1.x + a2.x) / 2 - rc.left - rc.width / 2, my = (a1.y + a2.y) / 2 - rc.top - rc.height / 2; zoomAt(clamp(pinch0.z * d / pinch0.d, 0.5, 4) / inst.z, mx, my, false); return; }
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 4) { moved = true; stage.classList.add('drag'); }
      if (moved) { inst.x = drag.ox + dx; inst.y = drag.oy + dy; applyView(false); }
    });
    function endPtr(e) { delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch0 = null; if (drag) { drag = null; stage.classList.remove('drag'); setTimeout(function () { moved = false; }, 0); } }
    stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
    stage.addEventListener('click', function (e) { if (!e.target.closest('.kbc-w') && !e.target.closest('.kbc-tip') && !moved) hideTip(true); });

    /* ---- 提示泡泡(在 view 裡面,所以會跟著一起放大) ---- */
    function toast(msg) { var t = q('toast'); t.textContent = msg; t.className = 'kbc-toast show'; clearTimeout(inst._tt); inst._tt = setTimeout(function () { t.className = 'kbc-toast'; }, 2600); }
    function conceptOf(t) { return model.concepts.filter(function (c) { return c.t === t; })[0]; }
    function stTag(st) { return '<span class="kbc-tg" style="--cc:var(--' + st + ')">' + STATE_NAME[st] + '</span>'; }
    function showTip(t, pin) {
      var c = conceptOf(t); if (!c) return; var ps = model.postsAt(c, inst.k); if (!ps.length) return;
      var st = model.stateAt(c, inst.k), rc = 0; ps.forEach(function (p) { p.rep.forEach(function (rp) { if (rp.step <= inst.k) rc++; }); });
      var rel = model.related(c, inst.k).slice(0, 3).map(function (x) { return x.t; });
      tip.innerHTML = '<h4>' + esc(t) + (inst.cmode === 'b' ? '<span class="kbc-tg" style="--cc:' + colorOf(c, inst.k, st) + '">' + (inst.csub === 'l' ? '最近用在 ' + esc(dayName(ps[ps.length - 1].step)) : '最早出現在 ' + esc(dayName(ps[0].step))) + '</span>' : stTag(st)) + (model.turningAt(c, inst.k) ? '<span class="kbc-star">★</span>' : '') + '</h4><div>第 ' + ps[0].step + ' 天出現 · 你的貼文 ' + ps.length + ' 則 · 同學回應 ' + rc + ' 則</div><div class="msg">' + STATE_MSG[st] + '</div>' + (rel.length ? '<div>常一起出現:' + rel.map(esc).join('、') + '</div>' : '') + (pin ? '<button type="button" data-k="see">看完整故事 ↓</button>' : '<div>點一下看完整故事</div>');
      tip.className = 'kbc-tip show' + (pin ? ' pin' : '');
      var p = posOf(c, inst.k), f = chipFont(ps.length), ch = f * cloudDim(c.t).h, th = tip.offsetHeight || 150, tw = 250;
      var sc = inst.z * base, vTop = (-stage.clientHeight / 2 - inst.y) / sc, vL = (-stage.clientWidth / 2 - inst.x) / sc, vR = (stage.clientWidth / 2 - inst.x) / sc;
      var top = p.y - ch / 2 - 14 - th, below = false; if (top < vTop + 8) { top = p.y + ch / 2 + 14; below = true; }
      var left = clamp(p.x - tw / 2, vL + 8, vR - tw - 8);
      tip.style.left = left + 'px'; tip.style.top = top + 'px'; tip.setAttribute('data-below', below ? '1' : '0');
      var sb = tip.querySelector('[data-k=see]'); if (sb) sb.onclick = function (e) { e.stopPropagation(); inst.goCard(); };
    }
    function hideTip(force) { if (inst.pinned && !force) return; tip.className = 'kbc-tip'; inst.pinned = false; applyDim(null); }
    function applyDim(t) {
      var rel = t ? related(t) : null;
      Object.keys(wEl).forEach(function (k) { wEl[k].classList.toggle('dim', !!t && k !== t && !rel[k]); });
      Object.keys(lEl).forEach(function (i) { var l = model.links[i], hot = !!t && (l.a === t || l.b === t); lEl[i].classList.toggle('hot', hot); lEl[i].classList.toggle('dim', !!t && !hot); });
    }
    inst.goCard = function () { if (!cardOpen) inst.setCardOpen(true); try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { card.scrollIntoView(); } card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); };

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
    inst.render = function (k) {
      k = clamp(Math.round(k), 0, K); inst.k = k;
      var n = 0, pos = {};
      model.concepts.forEach(function (c) {
        var el = wEl[c.t], ps = model.postsAt(c, k), vis = ps.length > 0;
        el.classList.toggle('on', vis); el.classList.toggle('sel', vis && inst.sel === c.t);
        var p = posOf(c, k); pos[c.t] = p; el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
        if (!vis) return; n++;
        var st = model.stateAt(c, k), f = chipFont(ps.length), chip = el.firstChild, ct = chip.querySelector('.kbc-ct');
        el.style.setProperty('--cc', colorOf(c, k, st)); chip.style.fontSize = f + 'px'; el.style.zIndex = String(ps.length); el.setAttribute('data-d', ps.length >= 3 ? '3' : String(ps.length));
        var old = chip.querySelector('.kbc-star'); if (old) old.remove(); var op = chip.querySelector('.kbc-pulse'); if (op) op.remove();
        if (model.turningAt(c, k)) { var sp = doc.createElement('span'); sp.className = 'kbc-star'; sp.textContent = '★'; ct.appendChild(sp); }
        if (k > 0 && ps[0].step === k) { var pu = doc.createElement('span'); pu.className = 'kbc-pulse'; chip.insertBefore(pu, chip.firstChild); }
      });
      if (one) { var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9; model.concepts.forEach(function (c) { if (!model.postsAt(c, k).length) return; var pp = pos[c.t], bb = chipBox(c); bx0 = Math.min(bx0, pp.x - bb.w / 2); bx1 = Math.max(bx1, pp.x + bb.w / 2); by0 = Math.min(by0, pp.y - bb.h / 2); by1 = Math.max(by1, pp.y + bb.h / 2); });
        if (bx0 > bx1) { bx0 = -50; bx1 = 50; by0 = -22; by1 = 22; }
        var cb = cloudBox(bx1 - bx0, by1 - by0), ow = cb.w, oh = cb.h, ocx = (bx0 + bx1) / 2, ocy = (by0 + by1) / 2;
        one.style.width = ow.toFixed(0) + 'px'; one.style.height = oh.toFixed(0) + 'px'; one.style.left = (ocx - ow * .5).toFixed(0) + 'px'; one.style.top = (ocy - oh * .52).toFixed(0) + 'px'; }
      var Nn = model.concepts.length || 1; if (mass) mass.style.transform = 'scale(' + clamp(.6 + .4 * Math.sqrt(n / Nn), .6, 1).toFixed(3) + ')';
      model.links.forEach(function (l, i) {
        var a = conceptOf(l.a), b = conceptOf(l.b), w = model.linkWeight(l, k), pa = pos[l.a], pb = pos[l.b], el = lEl[i];
        if (!w || !model.visible(a, k) || !model.visible(b, k)) { el.setAttribute('d', ''); el.style.opacity = 0; return; }
        var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.sqrt(dx * dx + dy * dy) || 1, off = Math.min(40, len * 0.18);
        el.setAttribute('d', 'M' + pa.x.toFixed(1) + ' ' + pa.y.toFixed(1) + ' Q' + (mx - dy / len * off).toFixed(1) + ' ' + (my + dx / len * off).toFixed(1) + ' ' + pb.x.toFixed(1) + ' ' + pb.y.toFixed(1));
        el.setAttribute('stroke-width', (1.2 + Math.min(w, 4) * 0.9).toFixed(1)); el.style.opacity = '';
      });
      q('day').textContent = k; q('n').textContent = n;
      var chg = k > 0 ? model.changes(k) : ''; q('cap').innerHTML = chg ? chg : (k === 0 ? '起點:雲還沒長出來' : '');
      if (inst.sel && !conceptOf(inst.sel)) inst.sel = null;
      drawCard();
      if (inst.pinned) { if (inst.sel && model.postsAt(conceptOf(inst.sel), k).length) showTip(inst.sel, true); else hideTip(true); }
      applyDim(inst.pinned ? inst.sel : null);
    };
    inst.select = function (t, pin) { inst.sel = t; if (pin) inst.pinned = true; inst.render(inst.k); if (pin) { showTip(t, true); } if (opts.onPick) opts.onPick(t); };
    // 詞的互動:移上去有提示,點一下釘住並說明
    Object.keys(wEl).forEach(function (t) {
      var w = wEl[t];
      w.addEventListener('mouseenter', function () { if (!inst.pinned) { showTip(t, false); applyDim(t); } });
      w.addEventListener('mouseleave', function () { if (!inst.pinned) hideTip(false); });
      w.addEventListener('click', function (e) {
        e.stopPropagation(); if (moved) return;
        inst.sel = t; inst.pinned = true; inst.render(inst.k); showTip(t, true); toast('已選擇「' + t + '」,它的故事在下面 ↓'); if (opts.onPick) opts.onPick(t); var h = q('hint'); if (h) h.style.display = 'none';
      });
    });
    // 預設選一個:用最多次的詞
    var top = model.concepts.slice().sort(function (a, b) { return b.count - a.count; })[0]; inst.sel = top ? top.t : null;
    inst.fit = function () { base = fit(); applyView(false); inst.render(inst.k); };
    if (global.ResizeObserver) { try { new global.ResizeObserver(function () { var nb = fit(); if (Math.abs(nb - base) > 0.02) { base = nb; applyView(false); inst.render(inst.k); } }).observe(stage); } catch (e) {} }
    root.querySelectorAll('[data-cs]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); inst.setColorMode('b', b.getAttribute('data-cs')); }); });
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
    var a, b;
    function sub(extra) { var x = {}; for (var k in opts) x[k] = opts[k]; for (var e in extra) x[e] = extra[e]; return x; }
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
