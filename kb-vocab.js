/* =====================================================================
 *  KB Vocab — 專業詞彙指標(老師分析、學生分析共用)
 *  把「學生實際用到幾種專業詞」算出來,取代只看字數:
 *    - 內建單元詞庫(國小自然與社會議題,與「我的概念雲」同一份詞庫);老師可在設定中心補充自訂詞
 *    - 比對時「長詞優先」:寫「光線」只算「光線」,不會同時算「光」;單字詞(光、電、水…)太容易誤判,不列入
 *    - 全班:每天新出現幾種詞、累積幾種;每人:各自用過幾種(不重複)
 *  這是「詞庫比對」,不是詞彙測驗:沒在詞庫裡的好詞不會被算到,詞庫裡的詞用得對不對也不判斷。
 *  純函式,不需要 AI,也不會把學生姓名送到任何地方。
 *  用法:var M = KBVocab.matcher(extraStr); M.find(text) -> [詞…](不重複);KBVocab.series(notes, M, opts)
 * ===================================================================== */
(function (global) {
  'use strict';
  var BASE = [
    '光線', '直線前進', '反射', '折射', '鏡子', '平面鏡', '凸透鏡', '凹透鏡', '放大鏡', '影子', '太陽', '太陽能', '光源', '透明', '彩虹', '三稜鏡', '光合作用', '能源', '能量', '能量轉換', '電能', '熱能',
    '動能', '風力', '水力發電', '火力發電', '核能', '再生能源', '節能', '省電', '發電', '燃料', '石油', '煤炭', '天然氣', '水循環', '蒸發', '凝結', '降雨', '下雨', '露水', '水蒸氣', '溫度', '溫度計',
    '氣溫', '氣壓', '颱風', '鋒面', '天氣', '季節', '濕度', '溫室效應', '全球暖化', '氣候變遷', '乾旱', '水庫', '電流', '電路', '串聯', '並聯', '電池', '燈泡', '開關', '導線', '導體', '絕緣體', '電壓',
    '電阻', '磁鐵', '磁力', '磁場', '磁極', '電磁鐵', '指北針', '磁性', '靜電', '閃電', '馬達', '發電機', '減塑', '塑膠', '塑膠袋', '吸管', '寶特瓶', '回收', '資源回收', '垃圾分類', '廚餘', '環保', '海洋',
    '微塑膠', '分解', '永續', '減量', '重複使用', '垃圾', '污染', '汙染', '3C', '手機', '平板', '電腦', '螢幕', '網路', '上網', '遊戲', '近視', '視力', '用眼', '沉迷', '網路安全', '隱私', '詐騙',
    '社群', '影片', '睡眠', '運動', '空氣', '速度', '實驗', '觀察', '證據', '假設', '原因', '結果',
  ];
  function splitExtra(s) {
    if (Array.isArray(s)) s = s.join(',');
    return String(s == null ? '' : s).split(/[,，、;；\s]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 2 && x.length <= 12; });
  }
  function termList(extra) {
    var seen = {}, out = [];
    BASE.concat(splitExtra(extra)).forEach(function (w) { if (!seen[w]) { seen[w] = 1; out.push(w); } });
    return out;
  }
  /* 比對器:長詞優先、已被長詞蓋住的位置不再重複算 */
  function matcher(extra) {
    var list = termList(extra).sort(function (a, b) { return b.length - a.length; });
    var extraSet = {}; splitExtra(extra).forEach(function (w) { extraSet[w] = 1; });
    function find(text) {
      text = String(text == null ? '' : text).toLowerCase();
      var covered = new Array(text.length), found = [], seen = {};
      for (var i = 0; i < list.length; i++) {
        var w = list[i], lw = w.toLowerCase(), at = text.indexOf(lw);
        while (at !== -1) {
          var free = true; for (var k = at; k < at + lw.length; k++) { if (covered[k]) { free = false; break; } }
          if (free) { for (var k2 = at; k2 < at + lw.length; k2++) covered[k2] = 1; if (!seen[w]) { seen[w] = 1; found.push({ w: w, at: at }); } }
          at = text.indexOf(lw, at + lw.length);
        }
      }
      return found.sort(function (a, b) { return a.at - b.at; }).map(function (x) { return x.w; });   // 依在文字中出現的先後
    }
    // covers(w):詞庫裡是否已有這個詞,或這個詞只是某個已有詞的一部分(例如「光合作」已被「光合作用」涵蓋)
    function covers(w) { for (var i = 0; i < list.length; i++) { if (list[i].toLowerCase().indexOf(String(w).toLowerCase()) !== -1) return true; } return false; }
    return { find: find, covers: covers, size: list.length, baseSize: BASE.length, extraSize: Object.keys(extraSet).length };
  }
  /* ---- 詞庫建議器:從班上自己的貼文找「大家常用、但詞庫還沒有」的詞 ----
   * 不用 AI、不用斷詞套件:把連續中文切成 2~5 字片段,數「出現在幾篇貼文、幾位同學」。
   * 要同時滿足「至少 minPosts 篇、至少 minAuthors 位不同同學」才建議(只有一個人反覆講的口頭禪不算)。
   * 去掉:含「我覺得、因為、所以…」等虛詞的片段、頭尾是虛字的片段、詞庫已有的詞、
   *       以及「只是某個更長詞的一部分」的片段(例如「光合作」會被「光合作用」取代)。
   * notes: [{author, title, content}];opts: { minPosts, minAuthors, limit, ignore:[詞…] }
   * 回傳 [{w, posts, authors, sample}] 依「同學數、貼文數」由多到少;sample 是其中一句,方便老師判斷。 */
  var STOP_SUB = ['我覺得', '我認為', '我們', '你們', '他們', '什麼', '為什麼', '怎麼', '如何', '因為', '所以', '可以', '可能', '應該', '還是', '或是', '如果', '但是', '可是', '而且', '然後', '就是', '不是', '是不是', '有沒有', '沒有', '已經', '一個', '這個', '那個', '這樣', '那樣', '自己', '大家', '同學', '老師', '還有', '以及', '對於', '關於', '其實', '比較', '非常', '真的', '一些', '一樣', '不會', '不能', '需要', '知道', '覺得', '認為', '而是', '或者', '並且', '雖然', '因此', '另外', '最後', '首先', '例如', '的話', '時候', '清楚', '容易', '開始', '直接', '發現', '後面', '前面', '變成', '決定', '出來', '起來', '下來', '看起', '同一', '不同', '更多', '重要', '其他', '這些', '那些', '目前', '之後', '之前', '現在', '以後', '部分', '一直', '一定', '一起', '一點', '一開', '一下', '可是', '好像', '似乎', '通常', '常常', '有些', '有時', '大概', '各自', '每個', '每一', '某些', '某個', '東西', '事情', '地方', '方式', '方法', '情況', '結果是', '能只', '以先', '只看', '只用', '只要', '每次', '真正', '感覺', '同意', '討論', '建立', '確認', '整理', '提醒'];
  var STOP_END = '的了是我你他她它也都就在有和與跟但因所這那不會可要很嗎呢吧啊著過把被讓給對從到個些等又再還將其之為來去';
  function suggest(notes, M, opts) {
    opts = opts || {};
    var list = (notes || []).filter(function (n) { return n && (n.title || n.content); });
    var N = list.length; if (!N) return [];
    var minPosts = opts.minPosts || Math.max(3, Math.ceil(N * 0.01));
    var minAuthors = opts.minAuthors || (N >= 100 ? 3 : 2);
    var ignore = {}; (opts.ignore || []).forEach(function (w) { ignore[w] = 1; });
    var df = {}, who = {}, sample = {};
    list.forEach(function (n, idx) {
      var text = String(n.title || '') + '\n' + String(n.content || ''), au = String(n.author == null ? idx : n.author), seen = {};
      var runs = text.match(/[一-鿿]+/g) || [];
      runs.forEach(function (run) {
        for (var len = 2; len <= 5; len++) for (var i = 0; i + len <= run.length; i++) {
          var g = run.substr(i, len);
          if (seen[g]) continue; seen[g] = 1;
          df[g] = (df[g] || 0) + 1; (who[g] = who[g] || {})[au] = 1;
          if (!sample[g]) { var at = text.indexOf(g); sample[g] = text.slice(Math.max(0, at - 8), at + g.length + 10).replace(/\s+/g, ' '); }
        }
      });
    });
    var cand = [];
    Object.keys(df).forEach(function (g) {
      if (df[g] < minPosts || ignore[g]) return;
      var au = Object.keys(who[g]).length; if (au < minAuthors) return;
      if (g.charAt(0) === '一' || STOP_END.indexOf(g.charAt(0)) !== -1 || STOP_END.indexOf(g.charAt(g.length - 1)) !== -1) return;
      for (var s = 0; s < STOP_SUB.length; s++) if (g.indexOf(STOP_SUB[s]) !== -1) return;
      if (M && M.covers && M.covers(g)) return;
      cand.push({ w: g, posts: df[g], authors: au, sample: sample[g] });
    });
    // 只留「最完整」的詞:更長的片段出現次數差不多(≥ 70%)時,短的就是它的一部分
    cand.sort(function (a, b) { return b.w.length - a.w.length || b.posts - a.posts; });
    var kept = [];
    cand.forEach(function (c) {
      for (var k = 0; k < kept.length; k++) { if (kept[k].w.indexOf(c.w) !== -1 && kept[k].posts >= c.posts * 0.7) return; }
      kept.push(c);
    });
    // 反過來:長片段若只比短詞少很多(<50%),且短詞本身已在建議裡,長的多半是「短詞+贅字」,也丟掉
    var byW = {}; kept.forEach(function (c) { byW[c.w] = c; });
    kept = kept.filter(function (c) {
      for (var len = 2; len < c.w.length; len++) for (var i = 0; i + len <= c.w.length; i++) { var sub = byW[c.w.substr(i, len)]; if (sub && c.posts < sub.posts * 0.5) return false; }
      return true;
    });
    kept.sort(function (a, b) { return b.authors - a.authors || b.posts - a.posts || a.w.length - b.w.length; });
    return kept.slice(0, opts.limit || 30);
  }
  function textOf(n) { return String(n.title || '') + ' ' + String(n.content || ''); }
  /* 全班逐日:newTerms=當天第一次出現的詞;classCum=累積不重複詞數;avgCum=每人平均累積不重複詞數
   * notes: [{author, dateTime(ms), title, content}];opts: { uids:[學生id…], dayKey:function(ms)->字串 } */
  function series(notes, M, opts) {
    opts = opts || {};
    var dayKey = opts.dayKey || function (ms) { var d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
    var uids = (opts.uids || []).map(String), uset = {}; uids.forEach(function (u) { uset[u] = 1; });
    var sorted = (notes || []).slice().sort(function (a, b) { return a.dateTime - b.dateTime; });
    var classSeen = {}, per = {}, order = [], byDay = {};
    var classCount = 0, sumPer = 0;
    sorted.forEach(function (n) {
      var key = dayKey(n.dateTime), d = byDay[key];
      if (!d) { d = byDay[key] = { key: key, newTerms: [], classCum: 0, avgCum: 0 }; order.push(d); }
      var au = String(n.author); per[au] = per[au] || {};
      M.find(textOf(n)).forEach(function (w) {
        if (!classSeen[w]) { classSeen[w] = 1; classCount++; d.newTerms.push(w); }
        if (!per[au][w]) { per[au][w] = 1; if (!uids.length || uset[au]) sumPer++; }
      });
      d.classCum = classCount;
      var denom = uids.length || Object.keys(per).length || 1;
      d.avgCum = sumPer / denom;
    });
    var people = Object.keys(per).filter(function (u) { return !uids.length || uset[u]; }).map(function (u) { return { uid: u, terms: Object.keys(per[u]), count: Object.keys(per[u]).length }; }).sort(function (a, b) { return b.count - a.count; });
    return { days: order, total: classCount, people: people, avgPerStudent: order.length ? order[order.length - 1].avgCum : 0, terms: Object.keys(classSeen) };
  }
  /* 單一學生:用過哪些詞(依出現順序),notes 為該學生的貼文 */
  function forStudent(notes, M) {
    var seen = {}, out = [];
    (notes || []).slice().sort(function (a, b) { return a.dateTime - b.dateTime; }).forEach(function (n) { M.find(textOf(n)).forEach(function (w) { if (!seen[w]) { seen[w] = 1; out.push(w); } }); });
    return out;
  }
  global.KBVocab = { BASE: BASE, matcher: matcher, series: series, forStudent: forStudent, splitExtra: splitExtra, suggest: suggest };
})(typeof window !== 'undefined' ? window : this);
