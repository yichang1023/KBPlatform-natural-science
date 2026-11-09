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
    return { find: find, size: list.length, baseSize: BASE.length, extraSize: Object.keys(extraSet).length };
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
  global.KBVocab = { BASE: BASE, matcher: matcher, series: series, forStudent: forStudent, splitExtra: splitExtra };
})(typeof window !== 'undefined' ? window : this);
