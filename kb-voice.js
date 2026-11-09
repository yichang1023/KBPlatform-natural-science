/* =====================================================================
 *  KB Voice — 語音輸入(給還不太會打字的小朋友用「說的」發言)
 *  在發言視窗的「標題」「內容」旁邊加上「🎤 用說的」,原本的打字輸入完全不變、隨時可以接著手動修改。
 *
 *  為了讓小朋友的話盡量被正確聽懂,這裡用了這些方法:
 *   1. 收音:要求瀏覽器開「降噪、回音消除、自動音量」,並回報裝置「實際」有沒有開(沒開會提醒)
 *   2. 語音活動偵測(VAD):量音量、校準環境底噪、判斷「開始說/說完了」,孩子停頓想事情不會被很快切掉
 *   3. 收音品質提醒:太小聲、太大聲、環境太吵、沒聽到聲音,都用白話告訴孩子怎麼做
 *   4. 辨識:瀏覽器內建語音辨識(繁體中文),要回 5 個候選說法,用科學/主題詞彙從中挑最合理的一個
 *   5. 詞彙強化:內建國小自然/社會議題詞庫 + 這個討論區已經出現的詞,當成「提示詞」給辨識器(瀏覽器支援才會生效)
 *   6. 修正:常見的同音聽錯字自動改回來(例如 這射→折射);說「逗號、句號、問號」會變成標點
 *   7. 確認與修正:說完後每一句都列出來,聽不太確定的標黃色,點一下可以換成別的說法、重說這一句或刪掉;也能「聽我剛剛說的」
 *   8. 補救:辨識不好時提示「再說一次/靠近一點/一句一句說/改用打字」,不會卡住;任何時候都可以直接打字
 *   9. 忠實保存:記下語音辨識的原始文字,以及學生有沒有再修改(發文時存在 voice 欄位)
 *
 *  注意:瀏覽器內建的語音辨識(Chrome、Edge)需要連上網路,語音會送到瀏覽器的語音服務轉成文字。
 *  錄下來的聲音只留在這台電腦的記憶體,只用來「聽我剛剛說的」,不會上傳、關掉視窗就消失。
 * ===================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;

  /* ---------- 詞庫:國小自然科學 + 社會議題 + 討論用語 ---------- */
  var LEXICON = [
    '光', '光線', '直線前進', '反射', '折射', '鏡子', '平面鏡', '凸透鏡', '凹透鏡', '放大鏡', '影子', '太陽', '太陽能', '太陽能板', '光源', '透明', '半透明', '不透明', '彩虹', '三稜鏡', '光合作用',
    '能源', '能量', '能量轉換', '電能', '熱能', '化學能', '動能', '位能', '風力', '風力發電', '水力發電', '火力發電', '核能', '再生能源', '節能', '省電', '發電', '燃料', '石油', '煤炭', '天然氣',
    '水循環', '蒸發', '凝結', '降雨', '下雨', '雲', '露水', '霧', '冰', '水蒸氣', '溫度', '溫度計', '氣溫', '氣壓', '颱風', '鋒面', '天氣', '季節', '濕度', '溫室效應', '全球暖化', '氣候變遷', '乾旱', '洪水', '水庫',
    '電', '電流', '電路', '串聯', '並聯', '電池', '燈泡', '開關', '導線', '導體', '絕緣體', '電壓', '電阻', '磁鐵', '磁力', '磁場', '磁極', '電磁鐵', '指北針', '磁性', '靜電', '閃電', '馬達', '發電機', '通路', '斷路', '短路',
    '減塑', '塑膠', '塑膠袋', '吸管', '寶特瓶', '回收', '資源回收', '垃圾分類', '廚餘', '環保', '海洋', '微塑膠', '分解', '永續', '減量', '重複使用', '垃圾', '焚化爐', '掩埋', '汙染', '污染',
    '3C', '手機', '平板', '電腦', '螢幕', '網路', '上網', '遊戲', '近視', '視力', '用眼', '自制力', '沉迷', '網路安全', '隱私', '詐騙', '社群', '影片', '時間管理', '睡眠', '運動',
    '我覺得', '我認為', '因為', '所以', '如果', '可能', '實驗', '觀察', '發現', '假設', '證據', '同意', '不同意', '補充', '改進', '反駁', '整合', '為什麼', '怎麼', '原因', '結果', '比較', '例如', '但是', '雖然', '我的想法', '我的理論'
  ];

  /* ---------- 常見聽錯的同音/近音字(只收「幾乎不可能是正確說法」的錯字,避免誤改) ---------- */
  var FIX = {
    '折射': ['摺射', '者射', '哲射'], '反射': ['翻射'], '光合作用': ['光和作用', '光河作用', '光合坐用'],
    '凸透鏡': ['突透鏡', '禿透鏡'], '凹透鏡': ['凹透境'], '三稜鏡': ['三陵鏡', '三凌鏡'],
    '蒸發': ['整發', '爭發'], '凝結': ['寧結', '凝節'], '水蒸氣': ['水正氣', '水整氣', '水蒸器'], '水循環': ['水尋環', '水巡環'],
    '電磁鐵': ['店磁鐵', '電詞鐵'], '磁鐵': ['詞鐵', '次鐵'], '磁力': ['詞力'], '磁場': ['詞場'], '磁極': ['詞極'], '指北針': ['指北珍', '指北真'],
    '串聯': ['穿聯'], '絕緣體': ['決緣體', '絕圓體'], '電壓': ['店壓'], '電阻': ['店阻'], '靜電': ['淨電'],
    '簡塑': [], '垃圾分類': ['拉圾分類', '辣雞分類', '垃圾分累'], '資源回收': ['資源回受', '自源回收'], '廚餘': ['廚魚'], '微塑膠': ['微速膠', '微塑交'],
    '寶特瓶': ['保特瓶', '寶特平', '包特瓶'], '永續': ['永序', '永緒'], '溫室效應': ['溫室效映', '溫室笑應'], '全球暖化': ['全球暖話', '全球暖花'], '氣候變遷': ['氣候變千', '氣候變牽'],
    '再生能源': ['在生能源', '再升能源'], '能量轉換': ['能量轉還', '能量轉煥'], '颱風': ['台風', '臺風'], '鋒面': ['烽面'],
    '近視': ['進視'], '沉迷': ['沈迷', '陳迷'], '詐騙': ['炸騙', '乍騙'], '隱私': ['隱思', '引私'],
    '3C': ['三C', '3 C', '三 C', '三c', '3c'], '二氧化碳': ['二氧化炭', '兒氧化碳']
  };

  /* ---------- 小工具 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var CJK = '\\u3400-\\u9fff\\uff0c\\u3002\\uff1f\\uff01\\u3001\\uff1a\\uff1b';
  function squeezeSpaces(s) {
    // 辨識器有時會在中文字之間插空白,把它拿掉(英數字旁邊的空白保留)
    var re = new RegExp('([' + CJK + '])\\s+(?=[' + CJK + '])', 'g');
    return String(s || '').replace(re, '$1').replace(/\s+([，。？！、：；,.?!])/g, '$1');
  }
  function countHits(text, vocab) { var n = 0; for (var i = 0; i < vocab.length; i++) { if (vocab[i].length > 1 && text.indexOf(vocab[i]) >= 0) n++; } return n; }

  // 口說標點(像 iPhone 的聽寫):說出標點的名字就打出標點。也收錄辨識器常聽錯的說法(例如「豆號」「巨號」)
  var SPOKEN = [
    [['逗號', '逗點', '豆號', '斗號', '逗好', '兜號'], '，'],
    [['句號', '句點', '巨號', '據號', '拒號'], '。'],
    [['問號', '聞號', '文號'], '？'],
    [['驚嘆號', '驚歎號', '感嘆號', '感歎號', '驚嘆好', '經嘆號', '驚談號'], '！'],
    [['冒號', '帽號', '貿號'], '：'],
    [['分號'], '；'],
    [['頓號', '鈍號'], '、'],
    [['刪節號', '省略號'], '……'],
    [['破折號'], '——'],
    [['左引號', '上引號', '前引號'], '「'], [['右引號', '下引號', '後引號'], '」'],
    [['左括號', '前括號'], '（'], [['右括號', '後括號'], '）'],
    [['左書名號'], '《'], [['右書名號'], '》']
  ];
  var SPOKEN_BREAKS = [['新段落', '換段落'], ['換一行', '換行', '新的一行', '下一行']];   // 內容欄才有;標題欄忽略
  var SPOKEN_WORDS = [];
  SPOKEN.forEach(function (x) { x[0].forEach(function (w) { SPOKEN_WORDS.push(w); }); });
  SPOKEN_BREAKS.forEach(function (x) { x.forEach(function (w) { SPOKEN_WORDS.push(w); }); });
  function escRe(w) { return w.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&'); }
  var SPOKEN_RE = SPOKEN.map(function (x) { return [new RegExp(x[0].map(escRe).join('|'), 'g'), x[1]]; });
  var BREAK_RE = SPOKEN_BREAKS.map(function (x) { return new RegExp(x.map(escRe).join('|'), 'g'); });
  function spokenPunct(text, multiline) {
    var t = String(text || '');
    BREAK_RE[0].lastIndex = 0; BREAK_RE[1].lastIndex = 0;
    t = t.replace(BREAK_RE[0], multiline ? '\n\n' : '').replace(BREAK_RE[1], multiline ? '\n' : '');
    SPOKEN_RE.forEach(function (r) { r[0].lastIndex = 0; t = t.replace(r[0], r[1]); });
    return tidyPunct(t);
  }
  // 整理:說出來的標點優先,前面自動補的較弱標點拿掉(「，」後面又出現「。」只留「。」);重複的標點合併;標點旁邊的空白拿掉
  function tidyPunct(t) {
    return String(t || '')
      .replace(/[，、；：。]+(?=[，、；：。？！…])/g, '')
      .replace(/([？！])\1+/g, '$1')
      .replace(/[ \t]+([，。、？！：；…」）》])/g, '$1').replace(/([「（《，。、？！：；…])[ \t]+/g, '$1');
  }
  function cmdSpans(text) {
    var sp = [];
    SPOKEN_WORDS.forEach(function (w) { var p = text.indexOf(w); while (p >= 0) { sp.push([p, p + w.length]); p = text.indexOf(w, p + 1); } });
    return sp;
  }
  function applyFixes(text, extraFix) {
    var out = String(text || ''), changes = [], table = Object.assign({}, FIX, extraFix || {});
    Object.keys(table).forEach(function (right) {
      table[right].forEach(function (wrong) {
        if (!wrong || wrong === right) return;
        if (out.indexOf(wrong) >= 0) { out = out.split(wrong).join(right); changes.push({ from: wrong, to: right }); }
      });
    });
    return { text: out, changes: changes };
  }

  /* ---------- 自然標點 ----------
   *  停頓 → 逗號:收音時量到「說話中途停了約半秒以上」,就在當時辨識到的字後面記一個標記,辨識完成後補上逗號(停很久補句號)
   *  說完 → 句號/問號/驚嘆號:依句子內容判斷
   *  沒有停頓資訊時(例如沒有音量偵測),用連接詞補逗號:「因為…所以…」「…然後…」「…但是…」
   *  口說標點(說「逗號」「句號」「問號」)優先;自己打字隨時可以改。  */
  var PUNCT_RE = /[，。、？！：；,.?!:;…\n]/;
  var CONJ = ['所以', '但是', '可是', '不過', '然後', '而且', '因此', '另外', '或是', '也就是說', '雖然', '如果', '因為', '例如', '比如說', '比方說', '不然', '否則'];
  var OPENERS = ['首先', '其次', '舉例來說', '比如說', '比方說', '也就是說', '總之', '接下來'];
  var END_PARTICLE = /(了|的|啊|喔|哦|啦|吧|呀|耶|喔|囉|嘛)$/;
  function isQuestionText(t) {
    t = String(t || '').replace(/[，。、？！：；,.?!:;…\s]+$/, '');
    return /(嗎|呢)$/.test(t) || /(什麼|為什麼|為何|怎麼|怎樣|如何|是不是|有沒有|會不會|能不能|可不可以|對不對|好不好|行不行|要不要|想不想|哪裡|哪個|哪一|哪些|誰|多少|幾個|幾次|幾天|幾歲)/.test(t) || /是.{1,8}還是/.test(t);
  }
  function isExclaimText(t) {
    t = String(t || '').replace(/[，。、？！：；,.?!:;…\s]+$/, '');
    return /^(哇|耶|好棒|好厲害|好酷|好漂亮|好好玩|好有趣|好神奇|太神奇|真厲害)/.test(t) || /太.{1,6}了$/.test(t) || /(哈哈|好棒啊|真棒)$/.test(t);
  }
  function enderFor(t) { return isQuestionText(t) ? '？' : (isExclaimText(t) ? '！' : '。'); }
  function lexSpans(text, vocab) {
    var sp = [], v = vocab || LEXICON;
    for (var i = 0; i < v.length; i++) { var w = v[i]; if (w.length < 2) continue; var p = text.indexOf(w); while (p >= 0) { sp.push([p, p + w.length]); p = text.indexOf(w, p + 1); } }
    return sp;
  }
  function safeIndex(idx, spans) {   // 標點不能切在一個詞中間(例如「折|射」):移到最近的詞邊界
    for (var i = 0; i < spans.length; i++) { if (idx > spans[i][0] && idx < spans[i][1]) return (idx - spans[i][0] < spans[i][1] - idx) ? spans[i][0] : spans[i][1]; }
    return idx;
  }
  // text 已去掉空白;marks:[{len:停頓當時已辨識的字數, ms:停了多久}];回傳加了「句中標點」的文字(不含句尾標點)
  function punctuate(text, marks, vocab) {
    text = String(text || '');
    if (!cfgAuto()) return text;
    var spans = lexSpans(text, vocab).concat(cmdSpans(text)), ins = {};   // 位置 -> 標點(詞庫的詞與口說標點的字不被切開)
    (marks || []).forEach(function (m) {
      var idx = safeIndex(Math.min(m.len || 0, text.length), spans);
      if (idx < 2 || idx >= text.length) return;
      if (PUNCT_RE.test(text.charAt(idx - 1)) || PUNCT_RE.test(text.charAt(idx))) return;
      var left = text.slice(0, idx).split(/[，。、？！：；,.?!:;…\n]/).pop();
      ins[idx] = (m.ms >= 1600 && left.length >= 6) ? (isQuestionText(left) ? '？' : '。') : '，';
    });
    // 一口氣說了好幾句(中間沒有停頓):句尾語氣詞後面接著新句子,補句號或問號;「如果…的話」後面補逗號
    function nearIns(p) { for (var d = -2; d <= 2; d++) if (ins[p + d]) return true; return false; }
    var SE = /(嗎|呢|啦|吧|喔|哦|耶|啊|呀|囉|嘛)(?=(我們|你們|他們|大家|老師|我|你|他|她|它|牠|那|這|因為|所以|但是|可是|不過|然後|還有|另外|首先|其次|最後|如果|雖然))/g, sm;
    while ((sm = SE.exec(text)) !== null) {
      var at = sm.index + sm[1].length, cl = text.slice(0, at).split(/[，。、？！：；,.?!:;…\n]/).pop();
      var isQ = /^(嗎|呢)$/.test(sm[1]);   // 問句結尾很明確,前半句 3 個字就夠;其他語氣詞要 5 個字以上才當作一句話
      if (cl.length >= (isQ ? 3 : 5) && !PUNCT_RE.test(text.charAt(at)) && !ins[at] && !nearIns(at) && safeIndex(at, spans) === at) ins[at] = isQ ? '？' : '。';
    }
    var IFR = /的話(?=[^，。？！、：；,.?!:;…\s])/g, im;
    while ((im = IFR.exec(text)) !== null) {
      var at2 = im.index + 2, cl2 = text.slice(0, im.index).split(/[，。、？！：；,.?!:;…\n]/).pop();
      if (/(如果|假如|要是|若是|萬一)/.test(cl2) && !ins[at2] && !nearIns(at2) && safeIndex(at2, spans) === at2) ins[at2] = '，';
    }
    // 連接詞前面補逗號(離上一個標點至少 4 個字,而且附近沒有已經補的標點)
    CONJ.forEach(function (c) {
      var p = text.indexOf(c);
      while (p >= 0) {
        var prev = text.charAt(p - 1), clause = text.slice(0, p).split(/[，。、？！：；,.?!:;…\n]/).pop();
        var near = false; for (var d = -2; d <= 2; d++) if (ins[p + d]) near = true;
        if (p >= 4 && clause.length >= 4 && !PUNCT_RE.test(prev) && !/[是為由於]/.test(prev) && !near && !ins[p] && safeIndex(p, spans) === p) ins[p] = '，';
        p = text.indexOf(c, p + 1);
      }
    });
    OPENERS.forEach(function (o) {
      var p = text.indexOf(o);
      if (p >= 0 && p + o.length + 2 <= text.length && !PUNCT_RE.test(text.charAt(p + o.length)) && !ins[p + o.length]) ins[p + o.length] = '，';
    });
    var out = '';
    for (var i = 0; i < text.length; i++) { if (ins[i]) out += ins[i]; out += text.charAt(i); }
    return out;
  }
  function cfgAuto() { return cfg.autoPunct !== false; }
  function processSegmentText(raw, multiline, marks) {
    var t = squeezeSpaces(String(raw || '').trim());
    t = applyFixes(t).text;
    if (multiline) t = punctuate(t, marks);   // 先依停頓與連接詞補逗號(位置依原始辨識文字)
    t = spokenPunct(t, multiline);            // 再把口說的標點名稱換成符號(說出來的優先,自動補的較弱標點會被整理掉)
    return t.trim();
  }
  function looksLikeQuestion(t) { return isQuestionText(t); }
  // 把幾句話接成最後的文字
  //  內容欄:句中依停頓補逗號;兩句之間停很久補句號(問句補問號),停得短補逗號;最後一句依內容補句號/問號/驚嘆號
  //  標題欄:不加逗號句號,問句才在結尾補問號
  /* ---------- 抑揚頓挫:句尾音調上揚 → 可能是問句 ----------
   *  detectPitch:用自相關法從麥克風的一小段聲音算出基頻(Hz);算不出來(沒有清楚的音高)回傳 0
   *  pitchRise:最近幾個有聲音的框,最後 3 個框的平均音高比前面 5 個框高出 25% 以上 → 上揚
   *  很保守:框數不夠、音高跳來跳去(可能抓錯一倍)都不算上揚;只有句子後面有停頓時才會用到 */
  function detectPitch(buf, fs) {
    var n = buf ? buf.length : 0; if (n < 256 || !fs) return 0;
    var x = new Array(n), mean = 0, i, lag;
    for (i = 0; i < n; i++) { x[i] = (buf[i] - 128) / 128; mean += x[i]; }
    mean /= n;
    var sq = new Array(n + 1); sq[0] = 0;
    for (i = 0; i < n; i++) { x[i] -= mean; sq[i + 1] = sq[i] + x[i] * x[i]; }
    if (sq[n] < 1e-4) return 0;
    var minLag = Math.floor(fs / 500), maxLag = Math.min(Math.floor(fs / 90), (n >> 1) - 1), rs = [];
    for (lag = minLag; lag <= maxLag + 1; lag++) {
      var sum = 0; for (i = 0; i + lag < n; i++) sum += x[i] * x[i + lag];
      var e1 = sq[n - lag], e2 = sq[n] - sq[lag], den = Math.sqrt(e1 * e2);
      rs[lag] = den > 1e-9 ? sum / den : 0;
    }
    for (lag = minLag + 1; lag <= maxLag; lag++) {   // 第一個夠高的峰值(才不會抓到兩倍、三倍的週期)
      if (rs[lag] > 0.6 && rs[lag] >= rs[lag - 1] && rs[lag] >= rs[lag + 1]) return fs / lag;
    }
    return 0;
  }
  function pitchRise(freqs) {
    var v = (freqs || []).filter(function (x) { return x > 0; }).slice(-8);
    if (v.length < 8) return false;
    for (var i = 1; i < v.length; i++) { if (v[i] / v[i - 1] > 1.6 || v[i - 1] / v[i] > 1.6) return false; }
    var avg = function (a) { return a.reduce(function (p, q) { return p + q; }, 0) / a.length; };
    return avg(v.slice(-3)) / avg(v.slice(0, 5)) >= 1.25;
  }
  function riseOK(p) { p = String(p || '').replace(/[，。、？！：；,.?!:;…\s]+$/, ''); return p.length >= 3 && !isExclaimText(p); }
  var SUBJ_START = /^(我們|你們|他們|大家|老師|我|你|他|她|它|牠)/;
  function joinerFor(p, nxt, gap, rise) {
    if (isQuestionText(p) && /(嗎|呢)$/.test(p)) return '？';
    if (rise && riseOK(p)) return '？';   // 句尾音調上揚,後面又停了一下:當作問句
    var ends = END_PARTICLE.test(p) && p.length >= 6;
    if (gap >= 1500) return enderFor(p);
    if (gap >= 1100 && ends) return enderFor(p);
    if (gap < 0 && ends) return enderFor(p);
    if (nxt && SUBJ_START.test(nxt) && p.length >= 8 && gap >= 700) return enderFor(p);   // 停了一下,下一句換了主詞:應該是新的一句
    return '，';
  }
  // closing === false:這段話是插在別的文字中間,最後一句不要自己補句號(後面的字還接著)
  function composeText(segs, multiline, closing) {
    var list = segs.filter(function (x) { return !x.deleted && x.text; });
    if (!list.length) return '';
    var auto = cfgAuto(), wantEnd = closing !== false;
    if (!multiline) {
      var title = list.map(function (x) { return x.text; }).join('').replace(/[。，、.,]+$/, '');
      var q = (isQuestionText(title) || (list[list.length - 1].rise && riseOK(title))) && !/[？?！!]$/.test(title);
      return auto && q && wantEnd ? title + '？' : title;
    }
    var out = '';
    list.forEach(function (s, i) {
      var p = s.text, last = i === list.length - 1;
      if (/[。？?！!…\n，、；：,;:)）」』》]$/.test(p)) { out += p; return; }
      if (!auto) { out += p; return; }
      if (last) { out += wantEnd ? p + ((s.rise && riseOK(p)) ? '？' : enderFor(p)) : p; return; }
      out += p + joinerFor(p, list[i + 1].text, typeof s.gap === 'number' ? s.gap : -1, s.rise);
    });
    return out;
  }
  // 從候選說法中挑最合理的:信心分數 + 命中詞庫的加分(分數差距很小時,偏向有科學詞彙的說法)
  function pickBest(alts, vocab) {
    var best = 0, bestScore = -1;
    for (var i = 0; i < alts.length; i++) {
      var c = typeof alts[i].c === 'number' ? alts[i].c : 0.5;
      var fixed = applyFixes(squeezeSpaces(alts[i].t)).text;
      var score = c + 0.12 * Math.min(3, countHits(fixed, vocab)) - i * 0.005;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }
  // 這個討論區已經出現的詞(用瀏覽器的斷詞;沒有就只用內建詞庫)
  var STOP = /^(我們|你們|他們|這個|那個|什麼|因為|所以|但是|可是|如果|覺得|可以|一個|就是|還有|已經|沒有|不是|知道|怎麼|為什麼|自己|大家|同學)$/;
  function buildVocab(ctx) {
    var set = {}, list = [];
    function add(w) { w = String(w || '').trim(); if (w.length >= 1 && w.length <= 10 && !set[w]) { set[w] = 1; list.push(w); } }
    LEXICON.forEach(add);
    ctx = ctx || {};
    String((ctx.topicName || '') + ' ' + (ctx.topicDesc || '')).split(/[\s,，。:：、\-—()（）「」『』!?！？]+/).forEach(function (w) { if (w.length >= 2 && w.length <= 10) add(w); });
    try {
      if (ctx.texts && ctx.texts.length && global.Intl && global.Intl.Segmenter) {
        var seg = new global.Intl.Segmenter('zh', { granularity: 'word' }), freq = {};
        ctx.texts.slice(0, 400).forEach(function (t) { var it = seg.segment(String(t)); for (var s of it) { if (s.isWordLike && s.segment.length >= 2 && s.segment.length <= 8 && !STOP.test(s.segment)) freq[s.segment] = (freq[s.segment] || 0) + 1; } });
        Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 80).forEach(add);
      }
    } catch (e) {}
    return list;
  }

  /* ---------- 樣式 ---------- */
  var cssDone = false;
  function injectCSS() {
    if (cssDone || doc.getElementById('kbv-style')) { cssDone = true; return; }
    var s = doc.createElement('style'); s.id = 'kbv-style';
    s.textContent = [
      '.kbv-wrap{position:relative}',
      '.kbv-btn{position:absolute;right:8px;bottom:8px;display:inline-flex;align-items:center;gap:6px;border:0;border-radius:999px;padding:8px 14px;background:linear-gradient(135deg,#f43f5e,#ec4899);color:#fff;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 6px 14px -6px rgba(225,29,72,.7);z-index:2;min-height:40px}',
      '.kbv-btn.kbv-in{bottom:auto;top:50%;transform:translateY(-50%)}',
      '.kbv-btn:disabled{background:#cbd5e1;box-shadow:none;cursor:not-allowed}',
      '.kbv-btn.on{background:#be123c;animation:kbv-pulse 1.2s ease-in-out infinite}',
      '@keyframes kbv-pulse{0%,100%{box-shadow:0 0 0 0 rgba(225,29,72,.5)}50%{box-shadow:0 0 0 9px rgba(225,29,72,0)}}',
      '.kbv-panel{margin:8px 0 10px;border:2px solid #fda4af;background:#fff1f2;border-radius:14px;padding:10px 12px;font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;color:#4c0519}',
      '.kbv-panel.hidden{display:none}',
      '.kbv-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.kbv-state{font-weight:800;font-size:15px;flex:1;min-width:150px}',
      '.kbv-meter{display:flex;gap:3px;align-items:flex-end;height:26px}',
      '.kbv-meter i{display:block;width:7px;border-radius:3px;background:#fecdd3;height:6px;transition:height .08s,background .08s}',
      '.kbv-meter i.on{background:#e11d48}',
      '.kbv-live{margin-top:6px;min-height:22px;font-size:16px;color:#9f1239;line-height:1.5}',
      '.kbv-live em{color:#9ca3af;font-style:normal}',
      '.kbv-hint{margin-top:6px;padding:7px 10px;border-radius:10px;background:#fffbeb;border:1px solid #fcd34d;color:#78350f;font-size:13.5px;line-height:1.6}',
      '.kbv-hint.bad{background:#fef2f2;border-color:#fca5a5;color:#7f1d1d}',
      '.kbv-hint.ok{background:#ecfdf5;border-color:#6ee7b7;color:#065f46}',
      '.kbv-chips{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}',
      '.kbv-chip{border:1px solid #fecdd3;background:#fff;border-radius:10px;padding:5px 10px;font-size:15px;cursor:pointer;line-height:1.5}',
      '.kbv-chip.low{background:#fef9c3;border-color:#facc15;text-decoration:underline wavy #ca8a04}',
      '.kbv-chip.del{text-decoration:line-through;opacity:.5}',
      '.kbv-chip.sel{outline:2px solid #e11d48}',
      '.kbv-alts{margin-top:6px;padding:8px;background:#fff;border:1px solid #fecdd3;border-radius:10px;font-size:14px}',
      '.kbv-alts b{display:block;margin-bottom:4px;color:#9f1239}',
      '.kbv-alt{display:block;width:100%;text-align:left;border:1px solid #fecdd3;background:#fff7f8;border-radius:8px;padding:5px 9px;margin:3px 0;cursor:pointer;font-size:15px}',
      '.kbv-alt.cur{background:#ffe4e6;font-weight:800}',
      '.kbv-acts{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}',
      '.kbv-act{border:0;border-radius:10px;padding:7px 12px;font-weight:800;font-size:14px;cursor:pointer;background:#fff;color:#9f1239;border:1px solid #fda4af;min-height:38px}',
      '.kbv-act.main{background:#e11d48;color:#fff;border-color:#e11d48}',
      '.kbv-act:disabled{opacity:.4;cursor:not-allowed}',
      '.kbv-tags{margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;font-size:11.5px}',
      '.kbv-tag{padding:2px 8px;border-radius:99px;background:#fff;border:1px solid #fecdd3;color:#7c5a69}',
      '.kbv-tag.ok{background:#ecfdf5;border-color:#6ee7b7;color:#065f46}',
      '.kbv-tag.no{background:#fff7ed;border-color:#fdba74;color:#9a3412}',
      '.kbv-diag{margin-top:6px;font-size:11px;color:#9a7b86}.kbv-diag summary{cursor:pointer}.kbv-diag pre{white-space:pre-wrap;margin:4px 0 0;padding:6px;background:#fff;border:1px solid #fecdd3;border-radius:8px;max-height:140px;overflow:auto;font-size:10.5px;line-height:1.45}',
      '.kbv-cmds{margin-top:6px;font-size:12px;color:#7c5a69;line-height:1.7}.kbv-cmds summary{cursor:pointer;font-weight:700}',
      '.kbv-pt{display:block;margin-top:8px;font-size:12.5px;color:#7c5a69;cursor:pointer}.kbv-pt input{margin-right:5px;vertical-align:-2px}',
      '.kbv-note{margin-top:6px;font-size:11.5px;color:#9a7b86;line-height:1.5}',
      '@media (max-width:480px){.kbv-btn{padding:8px 11px}}'
    ].join('\n');
    (doc.head || doc.documentElement).appendChild(s); cssDone = true;
  }

  /* ---------- 狀態 ---------- */
  var cfg = { getContext: null, silenceMs: 30000, noSpeechMs: 30000, useTrack: false, usePhrases: false, proto: '', autoPunct: lsGetP() };
  function lsGetP() { try { return global.localStorage.getItem('kb_voice_punct') !== '0'; } catch (e) { return true; } }
  function isFile() { return (cfg.proto || (global.location && global.location.protocol)) === 'file:'; }
  var FILE_TIP = '你現在是用「檔案」方式(file://)開啟網頁,Chrome 在這種方式下不會記住麥克風權限,所以才會一直問。請雙擊資料夾裡的「<b>啟動測試版.bat</b>」,改用 localhost 開啟,只會問一次,也才有音量條和錄音。';
  var fields = {};            // id -> { el, multiline, btn, meta:{used,raw,auto,confSum,confN,rawParts[]}, segs:[], base:'' }
  var panel = null, P = {};   // 面板各部分的參照
  var A = null;               // 目前進行中的收音階段

  function enabled() { try { var v = global.KB && KB.settings && KB.settings.get().voice; return !v || v.enabled !== false; } catch (e) { return true; } }
  function getSR() { return global.SpeechRecognition || global.webkitSpeechRecognition || null; }
  function supported() { return !!(getSR() && global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia); }

  /* ---------- 診斷記錄(出問題時可以截圖給開發者看) ---------- */
  var diagLog = [], diagT0 = 0;
  function browserName() {
    var ua = String((global.navigator && global.navigator.userAgent) || ''), m;
    if ((m = ua.match(/Edg\/([\d.]+)/))) return 'Edge ' + m[1];
    if ((m = ua.match(/Chrome\/([\d.]+)/))) return 'Chrome ' + m[1];
    if ((m = ua.match(/Firefox\/([\d.]+)/))) return 'Firefox ' + m[1];
    if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return 'Safari ' + m[1];
    return ua.slice(0, 40);
  }
  function dlog(msg) { diagLog.push('+' + ((Date.now() - diagT0) / 1000).toFixed(1) + 's ' + msg); if (diagLog.length > 60) diagLog.shift(); if (P.diag) P.diag.textContent = diagLog.join('\n'); }

  /* ---------- 面板 ---------- */
  function ensurePanel() {
    if (panel) return panel;
    injectCSS();
    panel = doc.createElement('div'); panel.id = 'kbv-panel'; panel.className = 'kbv-panel hidden'; panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = '<div class="kbv-top"><div class="kbv-state" data-k="state"></div><div class="kbv-meter" data-k="meter" aria-hidden="true"></div></div>' +
      '<div class="kbv-live" data-k="live"></div><div data-k="hint"></div><div class="kbv-chips" data-k="chips"></div><div data-k="alts"></div>' +
      '<div class="kbv-acts" data-k="acts"></div><div class="kbv-tags" data-k="tags"></div><label class="kbv-pt"><input type="checkbox" data-k="punct"> 自動加標點(說話停頓補逗號、說完補句號,語氣上揚或問句補問號)</label><details class="kbv-cmds"><summary>口說標點(像 iPhone 一樣:說出名字就打出符號)</summary>說「逗號」→ ，　「句號」→ 。　「問號」→ ？　「驚嘆號」→ ！　「冒號」→ ：　「分號」→ ；　「頓號」→ 、　「刪節號」→ ……　「破折號」→ ——　「左引號」「右引號」→ 「 」　「左括號」「右括號」→ （ ）　「換行」→ 換一行　「新段落」→ 空一行</details><div class="kbv-note" data-k="note"></div>' +
      '<details class="kbv-diag"><summary>診斷資訊(出問題時請截圖給老師)</summary><pre data-k="diag"></pre></details>';
    ['state', 'meter', 'live', 'hint', 'chips', 'alts', 'acts', 'tags', 'punct', 'note', 'diag'].forEach(function (k) { P[k] = panel.querySelector('[data-k=' + k + ']'); });
    var m = ''; for (var i = 0; i < 12; i++) m += '<i></i>'; P.meter.innerHTML = m;
    P.punct.checked = cfg.autoPunct !== false;
    P.punct.onchange = function () {
      cfg.autoPunct = P.punct.checked; try { global.localStorage.setItem('kb_voice_punct', P.punct.checked ? '1' : '0'); } catch (e) {}
      var f = curField; if (!f) return;
      f.segs.forEach(function (sg) { sg.text = processSegmentText(sg.alts[sg.chosen].t, f.multiline, sg.marks); });
      if (!A) { if (f.segs.length) writeField(f); } else if (A.f === f) showInterim(A);
      renderChips(f);
    };
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    return panel;
  }
  var curField = null;
  function placePanel(f) { ensurePanel(); curField = f; var host = f.wrap.parentNode; if (panel.parentNode !== host || panel.previousSibling !== f.wrap) f.wrap.insertAdjacentElement('afterend', panel); panel.classList.remove('hidden'); }
  function hidePanel() { if (panel) panel.classList.add('hidden'); }
  function setState(t) { if (P.state) P.state.textContent = t; }
  function setHint(t, kind) { if (!P.hint) return; P.hint.innerHTML = t ? '<div class="kbv-hint' + (kind ? ' ' + kind : '') + '">' + t + '</div>' : ''; }
  function addHint(a, t) { a.hints = a.hints || []; if (a.hints.indexOf(t) < 0) a.hints.push(t); setHint(a.hints.join('<br>')); }
  function setLive(txt, interim) { if (!P.live) return; P.live.innerHTML = (txt ? esc(txt) : '') + (interim ? '<em>' + esc(interim) + '</em>' : ''); }
  function setMeter(level) { if (!P.meter) return; var bars = P.meter.children, on = Math.round(Math.min(1, level) * bars.length); for (var i = 0; i < bars.length; i++) { bars[i].className = i < on ? 'on' : ''; bars[i].style.height = (6 + i * 1.6) + 'px'; } }
  function actions(list) {
    P.acts.innerHTML = list.map(function (a, i) { return '<button type="button" class="kbv-act' + (a.main ? ' main' : '') + '" data-i="' + i + '"' + (a.disabled ? ' disabled' : '') + '>' + a.label + '</button>'; }).join('');
    Array.prototype.forEach.call(P.acts.querySelectorAll('button'), function (b) { b.onclick = function () { list[Number(b.getAttribute('data-i'))].fn(); }; });
  }
  function tagsFor(settings) {
    if (!P.tags) return;
    if (!settings) { P.tags.innerHTML = ''; return; }
    var t = [['降噪', settings.noiseSuppression], ['回音消除', settings.echoCancellation], ['自動音量', settings.autoGainControl]];
    P.tags.innerHTML = t.map(function (x) { return '<span class="kbv-tag ' + (x[1] === true ? 'ok' : (x[1] === false ? 'no' : '')) + '">' + x[0] + (x[1] === true ? ' ✓' : (x[1] === false ? ' ✗(這台裝置沒開)' : ' ?')) + '</span>'; }).join('');
  }

  /* ---------- 欄位 ---------- */
  // 輸入欄的文字 = 游標前面的字(f.base)+ 這次說的句子 + 游標後面的字(f.after)。
  // 所以在文字中間點一下再說話,新的字和標點就會出現在那個位置,不會跑到最後面;你自己打的標點也不會被蓋掉。
  var PUCH = '，。、？！：；…,.?!:;';
  function isPunct(c) { return !!c && PUCH.indexOf(c) >= 0; }
  function closingOK(f) {   // 這段話的最後要不要自動補句號:後面沒有字、或是插在兩個句子之間才補
    var b = f.base || '', a = f.after || '';
    if (!a) return true;
    if (a.charAt(0) === '\n') return true;
    if (isPunct(a.charAt(0)) || /^[」』）》]/.test(a)) return false;
    return !b || /[。？！…\n.?!]$/.test(b);
  }
  function seam(f, text) {   // 接縫處不要出現重複的標點
    var b = f.base || '', a = f.after || '';
    if (!text) return text;
    if (b && isPunct(text.charAt(0)) && b.charAt(b.length - 1) === text.charAt(0)) text = text.slice(1);
    if (a && isPunct(a.charAt(0))) { var k = text.length; while (k > 0 && isPunct(text.charAt(k - 1))) k--; text = text.slice(0, k); }
    return text;
  }
  function composedFor(f) { return seam(f, composeText(f.segs, f.multiline, closingOK(f))); }
  function fieldValueFor(f) { return (f.base || '') + composedFor(f) + (f.after || ''); }
  function setCaret(f, pos) { try { if (f.el.setSelectionRange) f.el.setSelectionRange(pos, pos); } catch (e) {} }
  function setVal(f, v, caret) { f.el.value = v; f.lastShown = v; f.caret = caret; setCaret(f, caret); }
  function insertionRange(f) {   // 游標在哪裡(有選取一段字就是取代那段字);沒有游標資訊就接在最後
    var v = String(f.el.value || ''), s = v.length, e = v.length;
    try { if (typeof f.el.selectionStart === 'number' && typeof f.el.selectionEnd === 'number') { s = Math.min(f.el.selectionStart, v.length); e = Math.min(f.el.selectionEnd, v.length); } } catch (x) {}
    return [s, Math.max(s, e)];
  }
  function writeField(f) {
    var comp = composedFor(f), v = (f.base || '') + comp + (f.after || '');
    setVal(f, v, (f.base || '').length + comp.length); f.auto = v;
    if (A && A.f === f) A.shownLen = 0;
    f.writing = true;
    try { f.el.dispatchEvent(new global.Event('input', { bubbles: true })); } catch (e) {}
    f.writing = false;
  }
  // 收音中你自己動了輸入欄(打字、點到別的位置):把目前的字都當成普通文字留下來,之後的話接在新的游標位置
  function rebase(f) {
    var el = f.el, a = (A && A.f === f) ? A : null, v = String(el.value || ''), s = v.length, e = v.length;
    try { if (typeof el.selectionStart === 'number') { s = el.selectionStart; e = el.selectionEnd; } } catch (x) {}
    var ilen = a ? (a.shownLen || 0) : 0, last = f.lastShown;
    if (ilen > 0 && typeof last === 'string') {   // 把「還沒確定的暫時文字」從新的文字裡拿掉(它之後會重新顯示在新位置)
      var p = 0; while (p < last.length && p < v.length && last.charAt(p) === v.charAt(p)) p++;
      var q = 0; while (q < last.length - p && q < v.length - p && last.charAt(last.length - 1 - q) === v.charAt(v.length - 1 - q)) q++;
      var i0 = (f.base || '').length + composedFor(f).length, i1 = i0 + ilen, delta = v.length - last.length, ns = -1, ne = -1;
      if (last.length - q <= i0) { ns = i0 + delta; ne = i1 + delta; } else if (p >= i1) { ns = i0; ne = i1; }
      if (ns >= 0 && ne <= v.length && ns <= ne) {
        v = v.slice(0, ns) + v.slice(ne);
        var cutc = function (c) { return c >= ne ? c - ilen : (c > ns ? ns : c); };
        s = cutc(s); e = cutc(e);
      }
    }
    f.base = v.slice(0, s); f.after = v.slice(Math.max(s, e)); f.segs = [];
    f.meta.manual = true;
    setVal(f, v, s); f.auto = v;
    if (a) a.shownLen = 0;
    if (P.chips && panel && !panel.classList.contains('hidden')) { P.chips.innerHTML = ''; P.alts.innerHTML = ''; }
    if (a && a.active) showInterim(a);
  }
  function onCaretMove(f) {
    var a = A; if (!a || a.f !== f || !a.active || a.replaceIdx !== undefined || f.writing) return;
    var s, e; try { s = f.el.selectionStart; e = f.el.selectionEnd; } catch (x) { return; }
    if (typeof s !== 'number') return;
    if (s === e && s === f.caret) return;   // 還在程式放的位置:沒有動
    rebase(f);
  }
  function segConf(f) { var arr = f.segs.filter(function (s) { return !s.deleted; }); if (!arr.length) return 0; return arr.reduce(function (a, s) { return a + (s.conf || 0); }, 0) / arr.length; }
  function renderChips(f, selIdx) {
    var html = '';
    f.segs.forEach(function (s, i) { html += '<span class="kbv-chip' + (s.deleted ? ' del' : (s.conf < 0.6 && !s.userPicked ? ' low' : '')) + (i === selIdx ? ' sel' : '') + '" data-i="' + i + '" tabindex="0" role="button" title="點一下可以換成別的說法">' + esc(s.text || '(空白)') + '</span>'; });
    P.chips.innerHTML = html;
    Array.prototype.forEach.call(P.chips.querySelectorAll('.kbv-chip'), function (c) { c.onclick = function () { openAlts(f, Number(c.getAttribute('data-i'))); }; c.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } }; });
    if (selIdx === undefined) P.alts.innerHTML = '';
  }
  function openAlts(f, i) {
    var s = f.segs[i]; if (!s) return;
    renderChips(f, i);
    var html = '<div class="kbv-alts"><b>我是不是說了…(點一個換掉)</b>';
    s.alts.forEach(function (a, k) { var txt = processSegmentText(a.t, f.multiline, s.marks); html += '<button type="button" class="kbv-alt' + (k === s.chosen && !s.deleted ? ' cur' : '') + '" data-k="' + k + '">' + esc(txt) + '</button>'; });
    html += '<div class="kbv-acts"><button type="button" class="kbv-act" data-do="redo">🔁 重說這一句</button><button type="button" class="kbv-act" data-do="del">🗑 刪掉這句</button><button type="button" class="kbv-act" data-do="type">⌨️ 我自己打</button></div></div>';
    P.alts.innerHTML = html;
    Array.prototype.forEach.call(P.alts.querySelectorAll('.kbv-alt'), function (b) {
      b.onclick = function () { var k = Number(b.getAttribute('data-k')); s.chosen = k; s.deleted = false; s.userPicked = true; s.text = processSegmentText(s.alts[k].t, f.multiline, s.marks); writeField(f); renderChips(f); showDone(f, '已換成你選的說法。'); };
    });
    P.alts.querySelector('[data-do=redo]').onclick = function () { start(f, { replaceIdx: i }); };
    P.alts.querySelector('[data-do=del]').onclick = function () { s.deleted = true; writeField(f); renderChips(f); showDone(f, '已刪掉這一句。'); };
    P.alts.querySelector('[data-do=type]').onclick = function () { P.alts.innerHTML = ''; f.el.focus(); };
  }
  function showDone(f, msg) {
    if (!f.segs.length) { setState('沒有聽到內容'); }
    else setState('✅ 好了!檢查一下有沒有聽錯(黃色的字比較不確定)');
    renderChips(f);
    var low = f.segs.filter(function (s) { return !s.deleted && s.conf < 0.6 && !s.userPicked; }).length;
    var avg = segConf(f);
    var hint = msg || '';
    if (f.segs.length && (avg < 0.5 || low >= Math.ceil(f.segs.length / 2))) {
      f.badStreak = (f.badStreak || 0) + 1;
      hint = '我可能有聽錯。你可以:<b>點黃色的字換說法</b>、<b>再說一次</b>(離麥克風近一點、慢慢說、一句一句說),或<b>直接用打字</b>。' + (f.badStreak >= 2 ? '<br>如果一直聽不準,改用打字也很好喔!' : '');
      setHint(hint, 'bad');
    } else { f.badStreak = 0; setHint(hint, hint ? 'ok' : ''); }
    var acts = [
      { label: '🎤 繼續說(從游標位置接著說)', main: true, fn: function () { start(f, { append: true }); } },
      { label: '🔁 整段重說', fn: function () { f.base = ''; f.after = ''; f.el.value = ''; f.segs = []; start(f, {}); } },
      { label: '▶ 聽我剛剛說的', disabled: !f.clipUrl, fn: function () { playClip(f); } },
      { label: '⌨️ 我自己改', fn: function () { f.el.focus(); } },
      { label: '✖ 關掉', fn: function () { hidePanel(); } }
    ];
    actions(acts);
  }
  var player = null;
  function playClip(f) { try { if (player) player.pause(); player = new global.Audio(f.clipUrl); player.play(); } catch (e) { setHint('這台裝置無法播放錄音。', 'bad'); } }

  /* ---------- 收音階段 ---------- */
  var ERR = {
    'not-allowed': '麥克風被擋住了。請按網址列左邊的「🔒」→ 允許「麥克風」,再按一次「🎤 用說的」。',
    'service-not-allowed': '這個瀏覽器不允許語音輸入。請改用 Chrome 或 Edge,或用打字。',
    'audio-capture': '找不到可以用的麥克風。請確認耳機麥克風有插好,或換一個麥克風。',
    'network': '語音辨識需要連上網路,現在好像連不上。請檢查網路後再試,或先用打字。',
    'language-not-supported': '這個瀏覽器不支援中文語音辨識,請改用 Chrome 或 Edge,或用打字。'
  };
  function msgFor(code) { return (ERR[code] || ('語音辨識出了問題,請再試一次或改用打字。')) + ((code === 'not-allowed' || code === 'service-not-allowed') && isFile() ? '<br>' + FILE_TIP : '') + '<br><small style="opacity:.6">(代碼:' + esc(code || '未知') + ')</small>'; }
  function stopStream(a) {
    try { if (a.timer) clearInterval(a.timer); } catch (e) {}
    try { if (a.rec) { a.rec.onend = null; a.rec.onerror = null; a.rec.onresult = null; a.rec.stop(); } } catch (e) {}
    try { if (a.mr && a.mr.state !== 'inactive') a.mr.stop(); } catch (e) {}
    try { if (a.src) a.src.disconnect(); } catch (e) {}
    try { if (a.ctx && a.ctx.close) a.ctx.close(); } catch (e) {}
    try { if (a.stream) a.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
  }

  function start(f, opts) {
    opts = opts || {};
    if (!enabled()) return;
    if (!supported()) { placePanel(f); setState('這個瀏覽器不能用說的'); setHint('語音輸入要用 <b>Chrome</b> 或 <b>Edge</b> 瀏覽器,而且要有麥克風。沒關係,你還是可以用打字喔!', 'bad'); P.live.innerHTML = ''; P.chips.innerHTML = ''; P.alts.innerHTML = ''; actions([{ label: '✖ 關掉', fn: hidePanel }]); tagsFor(null); return; }
    if (A) abortSession(A);
    placePanel(f);
    var ctx = {}; try { ctx = (cfg.getContext && cfg.getContext()) || {}; } catch (e) {}
    var vocab = buildVocab(ctx);
    if (opts.replaceIdx === undefined) {   // 新的一段:從游標的位置開始(游標沒動過就是接在最後)
      var rg = insertionRange(f), cur0 = String(f.el.value || '');
      f.base = cur0.slice(0, rg[0]); f.after = cur0.slice(rg[1]); f.segs = []; f.lastShown = cur0; f.caret = rg[0];
    }
    f.meta.used = true;
    A = { f: f, vocab: vocab, active: true, stopping: false, speechFrames: 0, maxRms: 0, clip: 0, silentSince: 0, startedAt: Date.now(), lastVoice: 0, hadSpeech: false, replaceIdx: opts.replaceIdx, restarts: 0, errs: 0, noSpeechErrs: 0, interim: '', interimLen: 0, marks: [], silentSince: 0, curMark: null, lastSeg: null, lastSegPending: false, useTrack: true, gotAudio: false, noise: [], nf: 0.01, frames: 0, chunks: [] };
    var a = A;
    diagLog = []; diagT0 = Date.now();
    dlog('開始 欄位=' + f.id + ' 通訊協定=' + (global.location && global.location.protocol) + ' 瀏覽器=' + browserName());
    f.btn.classList.add('on'); f.btn.setAttribute('aria-pressed', 'true');
    setState('🎤 準備麥克風…'); setHint(''); setLive('', ''); P.chips.innerHTML = ''; P.alts.innerHTML = ''; tagsFor(null); setMeter(0);
    actions([{ label: '✅ 說完了', main: true, fn: function () { endSession('manual'); } }, { label: '✖ 取消這次', fn: function () { cancelSession(); } }]);
    P.note.textContent = '語音會送到瀏覽器的語音服務轉成文字;錄音只留在這台電腦,不會上傳。';
    var md = global.navigator.mediaDevices;
    var permQ = (global.navigator.permissions && global.navigator.permissions.query) ? global.navigator.permissions.query({ name: 'microphone' }).then(function (r) { return r.state; }).catch(function () { return 'unknown'; }) : Promise.resolve('unknown');
    permQ.then(function (perm) {
      dlog('麥克風權限狀態=' + perm);
      if (A !== a || !a.active) return;
      // 用「檔案」方式開啟時,Chrome 每次要麥克風都會問;為了只問一次,先不另外開麥克風(沒有音量條和錄音),直接讓語音辨識自己去問
      if (isFile() && perm !== 'granted') {
        a.lite = true; a.startedAt = Date.now();
        addHint(a, FILE_TIP);
        a.timer = setInterval(function () { liteTick(a); }, 1000);
        return setupRecognition(a);
      }
      setState('🎤 請在網址列旁邊按「允許」使用麥克風…');
      return md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }).then(function (stream) {
        if (A !== a || !a.active) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} return; }
        dlog('麥克風已開啟 降噪=' + (a.track && a.track.getSettings ? a.track.getSettings().noiseSuppression : '?'));
        a.startedAt = Date.now();   // 從麥克風真的準備好才開始算等待時間(不把「等你按允許」的時間算進去)
        a.stream = stream; a.track = (stream.getAudioTracks && stream.getAudioTracks()[0]) || null;
        var st = {}; try { st = a.track && a.track.getSettings ? a.track.getSettings() : {}; } catch (e) {}
        a.settings = st; tagsFor(st);
        var off = []; if (st.noiseSuppression === false) off.push('降噪'); if (st.echoCancellation === false) off.push('回音消除'); if (st.autoGainControl === false) off.push('自動音量');
        if (off.length) addHint(a, '這台電腦的麥克風沒有開「' + off.join('、') + '」,環境吵的時候可能比較聽不準,請離麥克風近一點。');
        setupMeter(a); setupRecorder(a); setupRecognition(a);
      });
    }).catch(function (e) {
      var name = e && e.name; dlog('開麥克風失敗 ' + name);
      var msg = (name === 'NotAllowedError' || name === 'SecurityError') ? msgFor('not-allowed') : (name === 'NotFoundError' || name === 'OverconstrainedError') ? msgFor('audio-capture') : (name === 'NotReadableError' ? '麥克風正在被別的程式使用,請關掉再試一次。' : '麥克風打不開:' + esc(name || e));
      failSession(a, msg);
    });
  }
  // 沒有音量偵測時(檔案方式):太久都沒有任何辨識結果才自動收起
  function liteTick(a) {
    if (A !== a || !a.active || a.finishing) return;
    var idle = Date.now() - (a.lastResultAt || a.startedAt);
    if (idle > cfg.noSpeechMs) endSession(a.f.segs.length ? 'silence' : 'nospeech');
  }

  function setupMeter(a) {
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    try {
      a.ctx = new AC(); a.src = a.ctx.createMediaStreamSource(a.stream); a.an = a.ctx.createAnalyser(); a.an.fftSize = 1024; a.src.connect(a.an);
      var buf = new Uint8Array(a.an.fftSize);
      a.timer = setInterval(function () { if (A !== a || !a.active) return; tick(a, buf); }, 50);
    } catch (e) { a.an = null; }
  }
  function tick(a, buf) {
    a.an.getByteTimeDomainData(buf);
    var sum = 0, clipped = 0; for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; if (buf[i] <= 1 || buf[i] >= 254) clipped++; }
    var rms = Math.sqrt(sum / buf.length), now = Date.now();
    a.frames++;
    if (a.frames <= 10) { a.noise.push(rms); if (a.frames === 10) { a.nf = Math.max(0.004, a.noise.reduce(function (x, y) { return x + y; }, 0) / a.noise.length); } }
    var thr = Math.max(0.02, a.nf * 3);
    var speaking = a.frames > 10 && rms > thr;
    setMeter(rms / 0.25);
    if (speaking) {
      if (a.silentSince) {   // 剛從停頓回到說話:記下這次停頓有多久
        var gap = now - a.silentSince;
        if (a.curMark) { a.curMark.ms = gap; a.curMark = null; }
        if (a.lastSeg && a.lastSegPending) { a.lastSeg.gap = gap; a.lastSegPending = false; }
        a.silentSince = 0; a.pitchBuf = [];
      }
      a.lastVoice = now; a.hadSpeech = true; a.speechFrames++; a.maxRms = Math.max(a.maxRms, rms); if (clipped > buf.length * 0.02) a.clip++;
      if (a.ctx && a.ctx.sampleRate) { var f0 = detectPitch(buf, a.ctx.sampleRate); (a.pitchBuf = a.pitchBuf || []).push(f0); if (a.pitchBuf.length > 30) a.pitchBuf.shift(); }
    } else if (a.hadSpeech) {
      if (!a.silentSince) a.silentSince = a.lastVoice;
      var sil = now - a.silentSince;
      if (sil > 550 && a.interimLen > 0) {   // 說話中途停了半秒以上:在目前的字後面記一個標記(之後補逗號)
        if (!a.curMark) { a.curMark = { len: a.interimLen, ms: sil, idx: a.curIdx, rise: pitchRise(a.pitchBuf) }; a.marks.push(a.curMark); showInterim(a); }
        else { var nl = Math.max(a.curMark.len, a.interimLen); if (nl !== a.curMark.len) { a.curMark.len = nl; showInterim(a); } a.curMark.ms = sil; }
      }
    }
    // 狀態文字
    if (a.finishing) return;
    var sinceVoice = a.hadSpeech ? now - a.lastVoice : now - a.startedAt;
    if (!a.hadSpeech) {
      setState(a.gotAudio ? '🎤 我在聽,請開始說話…' : '🎤 準備好了,請開始說話…');
      if (now - a.startedAt > cfg.noSpeechMs) { endSession('nospeech'); }
    } else if (speaking) setState('👂 聽到了!慢慢說,說完再按「說完了」');
    else {
      var left = Math.ceil((cfg.silenceMs - sinceVoice) / 1000);
      setState(left <= 5 ? '🎤 還在嗎?' + left + ' 秒後我會先收起來' : '🎤 想一想也沒關係,想好了繼續說,說完請按「說完了」');
      if (sinceVoice > cfg.silenceMs) endSession('silence');
    }
    if (a.frames === 30 && a.nf > 0.035) addHint(a, '這裡有點吵。請離麥克風近一點,旁邊的同學先小聲一下,會聽得比較準。');
  }
  function setupRecorder(a) {
    try {
      if (!global.MediaRecorder) return;
      a.mr = new global.MediaRecorder(a.stream); a.chunks = [];
      a.mr.ondataavailable = function (e) { if (e.data && e.data.size) a.chunks.push(e.data); };
      a.mr.onstop = function () { try { if (a.chunks.length) { var b = new global.Blob(a.chunks, { type: (a.mr.mimeType || 'audio/webm') }); if (a.f.clipUrl && global.URL.revokeObjectURL) global.URL.revokeObjectURL(a.f.clipUrl); a.f.clipUrl = global.URL.createObjectURL(b); if (A === null || A === a) { var ac = P.acts && P.acts.querySelector && P.acts.querySelectorAll('button')[2]; if (ac && /聽我剛剛說的/.test(ac.textContent)) ac.disabled = false; } } } catch (e) {} };
      a.mr.start();
    } catch (e) { a.mr = null; }
  }

  function setupRecognition(a) {
    var SR = getSR(), f = a.f, rec;
    try { rec = new SR(); } catch (e) { return failSession(a, ERR['service-not-allowed']); }
    a.rec = rec;
    rec.lang = 'zh-TW'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 5;
    // 提示詞(rec.phrases)只有「在這台電腦上辨識」才支援;一般的網路辨識會直接報 phrases-not-supported,所以預設不用。
    // 詞彙強化改用「從 5 個候選說法挑有科學詞彙的」與「同音錯字修正」,不依賴這個功能。
    if (cfg.usePhrases) { try { if (global.SpeechRecognitionPhrase && ('phrases' in rec)) a.vocab.slice(0, 100).forEach(function (t) { rec.phrases.push(new global.SpeechRecognitionPhrase(t, 5.0)); }); } catch (e) {} }
    rec.onstart = function () { dlog('辨識器 start'); };
    rec.onaudiostart = function () { a.gotAudio = true; dlog('audiostart(開始收音)'); };
    rec.onsoundstart = function () { dlog('soundstart(聽到聲音)'); };
    rec.onspeechstart = function () { dlog('speechstart(聽到說話)'); };
    rec.onspeechend = function () { dlog('speechend'); };
    rec.onresult = function (e) {
      var interim = '', now = Date.now(); a.rt = a.rt || {};
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i], txt = r[0] ? r[0].transcript : '';
        if (r.isFinal) commit(a, r, i);
        else { var rt = a.rt[i] || (a.rt[i] = { t0: now, t1: now, txt: '', interim: true }); if (txt !== rt.txt) { rt.txt = txt; rt.t1 = now; } a.curIdx = i; interim += txt; }
      }
      a.interim = interim; a.interimLen = squeezeSpaces(interim).length; showInterim(a);
    };
    rec.onerror = function (e) {
      var code = e && e.error; a.errs++; dlog('錯誤 ' + code);
      if (code === 'no-speech') { a.noSpeechErrs++; return; }
      if (code === 'aborted') return;
      if (code === 'phrases-not-supported') { cfg.usePhrases = false; try { rec.phrases = []; } catch (x) {} return; }   // 防萬一:不要因為提示詞而失敗
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'language-not-supported') return failSession(a, msgFor(code));   // 權限被擋:直接告訴孩子怎麼辦
      // 網路、收音暫時出問題:先自動重試(最多 2 次),真的不行才說
      a.softErrs = (a.softErrs || 0) + 1;
      if (a.softErrs > 2) failSession(a, msgFor(code));
    };
    rec.onend = function () {
      dlog('辨識器 end' + (A === a && a.active && !a.stopping ? '(會自動重開)' : ''));
      if (A !== a || !a.active || a.stopping) return;
      if (a.replaceIdx !== undefined && a.replaced) return endSession('replaced');
      // 一開始就立刻結束好幾次:通常是麥克風權限沒被允許(或被瀏覽器收回)
      if (a.recStartedAt && Date.now() - a.recStartedAt < 1200) { a.rapidEnds = (a.rapidEnds || 0) + 1; if (a.rapidEnds >= 3) return failSession(a, msgFor('not-allowed')); } else a.rapidEnds = 0;
      a.restarts++;
      if (a.restarts > 60) return endSession('toomany');
      setTimeout(function () { if (A === a && a.active && !a.stopping) startRec(a); }, 150);
    };
    actions([{ label: '✅ 說完了', main: true, fn: function () { endSession('manual'); } }, { label: '✖ 取消這次', fn: function () { cancelSession(); } }]);
    setState('🎤 準備好了,請開始說話…');
    startRec(a);
  }
  // 一邊說一邊讓文字直接出現在輸入欄裡(停頓處會先出現逗號;還沒確定的部分,收尾時整理成正式文字)
  function marksFor(a) { return a.marks.filter(function (m) { return m.idx === undefined || a.curIdx === undefined || m.idx === a.curIdx; }); }
  function showInterim(a) {
    var f = a.f, raw = squeezeSpaces(a.interim || ''), shown = spokenPunct(f.multiline ? punctuate(raw, marksFor(a)) : raw, f.multiline);
    setLive(composeText(f.segs, f.multiline), shown);
    if (a.replaceIdx === undefined) {
      var comp = composedFor(f);
      setVal(f, (f.base || '') + comp + shown + (f.after || ''), (f.base || '').length + comp.length + shown.length);
      a.shownLen = shown.length;
    }
  }
  function startRec(a) {
    try {
      a.usedTrack = false; a.recStartedAt = Date.now(); a.rt = {}; a.curIdx = undefined; if (a.restarts > 0) { a.marks = []; a.curMark = null; }
      if (cfg.useTrack && a.track && a.restarts === 0) { try { a.rec.start(a.track); a.usedTrack = true; return; } catch (e) {} }
      a.rec.start();
    } catch (e) { /* 已在收音中 */ }
  }
  // 一句話辨識完成
  function commit(a, r, idx) {
    dlog('收到一句 信心=' + (r[0] && r[0].confidence) + ' 「' + String(r[0] && r[0].transcript).slice(0, 12) + '」');
    var f = a.f, alts = []; a.lastResultAt = Date.now();
    for (var k = 0; k < r.length; k++) alts.push({ t: String(r[k].transcript || ''), c: typeof r[k].confidence === 'number' ? r[k].confidence : 0 });
    if (!alts.length || !alts[0].t.trim()) return;
    var chosen = pickBest(alts, a.vocab);
    var mine = function (m) { return m.idx === undefined || idx === undefined || m.idx === idx; };
    var marks = a.marks.filter(function (m) { return m.len > 0 && mine(m); });   // 只拿「這一句」的停頓標記
    a.marks = a.marks.filter(function (m) { return !mine(m); });
    if (a.curMark && mine(a.curMark)) a.curMark = null;
    if (idx === undefined || idx === a.curIdx) a.interimLen = 0;
    var rt = (idx !== undefined && a.rt) ? a.rt[idx] : null; if (idx !== undefined && a.rt) delete a.rt[idx];
    var seg = { alts: alts, chosen: chosen, raw: alts[0].t.trim(), conf: alts[chosen].c, marks: marks, text: processSegmentText(alts[chosen].t, f.multiline, marks), userPicked: false, deleted: false };
    var endMark = marks.filter(function (m) { return m.len >= squeezeSpaces(alts[chosen].t).length * 0.8; }).pop();   // 這一句結尾的停頓
    if (endMark && endMark.rise) seg.rise = true;
    if (rt && rt.interim) { seg.t0 = rt.t0; seg.t1 = rt.t1; }   // 這一句開始說、說完的時間
    if (seg.conf === 0 && alts.length === 1) seg.conf = 0.7;   // 有些瀏覽器不回信心分數
    if (a.replaceIdx !== undefined && f.segs[a.replaceIdx]) { f.segs[a.replaceIdx] = seg; a.replaced = true; }
    else {
      var prevSeg = f.segs.filter(function (x) { return !x.deleted; }).pop();   // 上一句和這一句之間停了多久(收音時沒量到的才用辨識時間推算)
      if (prevSeg && prevSeg.gap === undefined && prevSeg.t1 && seg.t0) prevSeg.gap = Math.max(0, seg.t0 - prevSeg.t1);
      f.segs.push(seg);
    }
    a.lastSeg = seg; a.lastSegPending = true;   // 下一次開口時,量出兩句之間停了多久
    f.meta.rawParts.push(seg.raw); f.meta.confSum += seg.conf; f.meta.confN++;
    if (a.replaceIdx !== undefined) { try { a.rec.stop(); } catch (e) {} }
    writeField(f); setLive(composedFor(f), '');
  }

  function failSession(a, msg) {
    if (A !== a) return; dlog('失敗結束');
    a.active = false; stopStream(a); A = null;
    var f = a.f; f.btn.classList.remove('on'); f.btn.setAttribute('aria-pressed', 'false'); setMeter(0);
    setState('😢 沒辦法用說的'); setHint(msg, 'bad'); setLive('', '');
    if (f.segs.length) renderChips(f);
    actions([{ label: '🎤 再試一次', main: true, fn: function () { start(f, { append: true }); } }, { label: '⌨️ 改用打字', fn: function () { hidePanel(); f.el.focus(); } }]);
  }
  // 換到另一個欄位/重新開始時,安靜地收掉上一段(已經辨識出來的句子保留在欄位裡)
  function abortSession(a) {
    a.active = false; a.stopping = true; a.done = true; stopStream(a); if (A === a) A = null;
    a.f.btn.classList.remove('on'); a.f.btn.setAttribute('aria-pressed', 'false'); setMeter(0);
  }
  function cancelSession() {
    var a = A; if (!a) return;
    var f = a.f; a.active = false; stopStream(a); A = null;
    f.btn.classList.remove('on'); f.btn.setAttribute('aria-pressed', 'false');
    if (a.replaceIdx === undefined) { f.segs = []; f.el.value = (f.base || '') + (f.after || ''); f.auto = f.el.value; try { f.el.dispatchEvent(new global.Event('input', { bubbles: true })); } catch (e) {} }
    hidePanel();
  }
  function endSession(reason) {
    var a = A; if (!a) return; dlog('結束原因=' + reason);
    var f = a.f; a.stopping = true; a.finishing = true; a.active = false;
    try { if (a.rec) a.rec.stop(); } catch (e) {}
    // 讓辨識器把最後一句送回來(約 0.6 秒),再收尾
    setState('⏳ 整理中…');
    var finish = function () {
      if (a.done) return; a.done = true; stopStream(a); if (A === a) A = null;
      f.btn.classList.remove('on'); f.btn.setAttribute('aria-pressed', 'false'); setMeter(0); setLive('', '');
      qualityAdvice(a);
      if (a.replaceIdx === undefined) writeField(f);   // 把還沒確定的暫時文字換成整理好的正式文字
      showDone(f, a.advice || '');
      if (reason === 'nospeech' && !f.segs.length) { setState('😶 沒有聽到聲音'); setHint('我沒有聽到聲音。請確認麥克風沒有靜音、離近一點,再按「🎤 再試一次」,或改用打字。', 'bad'); actions([{ label: '🎤 再試一次', main: true, fn: function () { start(f, {}); } }, { label: '⌨️ 改用打字', fn: function () { hidePanel(); f.el.focus(); } }]); }
      else if (!f.segs.length && a.hadSpeech) { setState('🤔 我聽不出你說什麼'); setHint('聽到你有說話,但是聽不清楚內容。請<b>慢一點、一句一句說</b>,離麥克風近一點;或改用打字。', 'bad'); actions([{ label: '🎤 再說一次', main: true, fn: function () { start(f, {}); } }, { label: '⌨️ 改用打字', fn: function () { hidePanel(); f.el.focus(); } }]); }
      else if (reason === 'toomany') setHint('已經聽很久了,先幫你收起來。要繼續請再按「繼續說」。', '');
    };
    setTimeout(finish, a.rec ? 650 : 0);
  }
  function qualityAdvice(a) {
    var adv = [];
    if (a.hadSpeech && a.speechFrames > 10 && a.maxRms < 0.045) adv.push('聲音有點小,下次離麥克風近一點、說大聲一點。');
    if (a.clip > 8) adv.push('有點太大聲了,離麥克風遠一點會更清楚。');
    if (a.nf > 0.035) adv.push('環境有點吵,安靜的地方會聽得更準。');
    a.advice = adv.join('');
  }

  /* ---------- 掛到欄位上 ---------- */
  function attach(el, o) {
    o = o || {}; if (!el || el.__kbv) return;
    injectCSS();
    var wrap = el.parentNode;
    if (!wrap.classList.contains('kbv-wrap')) { var w = doc.createElement('div'); w.className = 'kbv-wrap'; el.parentNode.insertBefore(w, el); w.appendChild(el); wrap = w; }
    var multiline = el.tagName === 'TEXTAREA';
    var btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'kbv-btn' + (multiline ? '' : ' kbv-in'); btn.setAttribute('aria-label', '用說的輸入' + (o.label || '')); btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<span aria-hidden="true">🎤</span><span>用說的</span>'; btn.title = '按一下開始說話,說完再按「說完了」';
    wrap.appendChild(btn);
    if (!multiline) el.style.paddingRight = '112px'; else el.style.paddingBottom = '52px';
    var f = { id: o.id || el.id, el: el, wrap: wrap, btn: btn, multiline: multiline, label: o.label || '', segs: [], base: '', after: '', meta: { used: false, rawParts: [], confSum: 0, confN: 0 } };
    fields[f.id] = f; el.__kbv = f;
    btn.onclick = function () { if (A && A.f === f && A.active) endSession('manual'); else start(f, {}); };
    el.addEventListener('input', function () {
      if (f.writing) return;
      if (A && A.f === f && A.active && A.replaceIdx === undefined) { if (el.value !== f.lastShown) rebase(f); return; }   // 收音中自己打字:字和標點都留著,之後的話接在游標後面
      // 學生手動修改了文字:記下「有修改過」,確認區的句子與文字不一致就不再顯示
      if (!A && f.auto !== undefined && el.value !== f.auto) { f.meta.manual = true; f.segs = []; f.auto = el.value; if (P.chips && panel && !panel.classList.contains('hidden') && f.wrap.nextSibling === panel) { P.chips.innerHTML = ''; P.alts.innerHTML = ''; } }
    });
    ['click', 'keyup', 'mouseup', 'touchend'].forEach(function (ev) { el.addEventListener(ev, function () { onCaretMove(f); }); });   // 收音中點到別的位置:之後的話接在那裡
    applyEnabled(f);
  }
  function applyEnabled(f) { f.wrap.classList.toggle('kbv-off', !enabled()); f.btn.style.display = enabled() ? '' : 'none'; if (f.multiline) f.el.style.paddingBottom = enabled() ? '52px' : ''; else f.el.style.paddingRight = enabled() ? '112px' : ''; }
  function refresh() { Object.keys(fields).forEach(function (id) { applyEnabled(fields[id]); }); if (!enabled()) { cancelAll(); } }
  function cancelAll() { if (A) cancelSession(); hidePanel(); }
  function reset() { cancelAll(); Object.keys(fields).forEach(function (id) { var f = fields[id]; f.segs = []; f.base = ''; f.after = ''; f.auto = undefined; f.meta = { used: false, rawParts: [], confSum: 0, confN: 0, manual: false }; if (f.clipUrl) { try { global.URL.revokeObjectURL(f.clipUrl); } catch (e) {} f.clipUrl = null; } }); if (P.chips) P.chips.innerHTML = ''; if (P.alts) P.alts.innerHTML = ''; }
  // 發文時帶走的紀錄:語音辨識原始文字 + 學生有沒有再修改
  function collect() {
    var out = null;
    Object.keys(fields).forEach(function (id) {
      var f = fields[id]; if (!f.meta.used || !f.meta.rawParts.length) return;
      var final = String(f.el.value || '');
      var key = id.replace(/^node-/, '');
      out = out || {};
      out[key] = { raw: f.meta.rawParts.join(' | ').slice(0, 600), edited: !!f.meta.manual || final !== (f.auto === undefined ? '' : f.auto), conf: f.meta.confN ? Math.round(f.meta.confSum / f.meta.confN * 100) / 100 : 0 };
    });
    return out;
  }

  global.KBVoice = {
    init: function (o) { o = o || {}; cfg.getContext = o.getContext || null; if (o.silenceMs) cfg.silenceMs = o.silenceMs; if (o.noSpeechMs) cfg.noSpeechMs = o.noSpeechMs; (o.fields || []).forEach(function (x) { attach(x.el, x); }); },
    attach: attach, refresh: refresh, stop: cancelAll, reset: reset, collect: collect, enabled: enabled, supported: supported,
    _t: { tidyPunct: tidyPunct, SPOKEN_WORDS: SPOKEN_WORDS, punctuate: punctuate, enderFor: enderFor, isQuestionText: isQuestionText, setAuto: function (v) { cfg.autoPunct = v; }, setProto: function (p) { cfg.proto = p; }, cfg: cfg, pickBest: pickBest, applyFixes: applyFixes, spokenPunct: spokenPunct, composeText: composeText, joinerFor: joinerFor, detectPitch: detectPitch, pitchRise: pitchRise, composedFor: composedFor, rebase: rebase, squeezeSpaces: squeezeSpaces, processSegmentText: processSegmentText, buildVocab: buildVocab, looksLikeQuestion: looksLikeQuestion, state: function () { return { A: A, fields: fields }; }, LEXICON: LEXICON, FIX: FIX }
  };
})(typeof window !== 'undefined' ? window : globalThis);
