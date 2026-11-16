/* =====================================================================
 *  KB TTS - 貼文朗讀(給眼睛不好、需要靠聽覺輔助的同學)
 *
 *  只用 AI 人聲: 透過 /api/tts 呼叫 Gemini 語音, 有 8 個女聲人設可以挑, 並依貼文內容「自動判斷語氣」.
 *  老師要在設定中心「AI 設定」開啟「貼文朗讀」並把 Gemini 金鑰存到雲端; 沒開就不會出現朗讀鈕.
 *  同一段文字、同一種聲音和語氣只合成一次, 結果存在這台電腦(IndexedDB), 重聽不再花錢.
 *  貼文詳情有三顆鈕: 朗讀標題(類型+標題)、朗讀內容(內文)、朗讀全部回應(最下方).
 *
 *  自動語氣: 依「貼文類型」(提問/延伸/改進/反例/昇華)+ 文字內容(問號、驚嘆號、因為所以、轉折詞、長度、專有名詞...)組出語氣,
 *  用 speech_metadata.style 送給 AI 人聲; 固定不變的音色、年齡感、腔調由「聲音人設」決定.
 * ===================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;

  /* ---------- 聲音人設(全女聲):def = 預設的 Google 現成聲音;老師可在設定中心換成自己設計的聲音編號(voice_…) ---------- */
  var PERSONAS = [
    { id: 'p1', name: '明亮甜美・鄰家姐姐', def: 'Zephyr', hint: '年輕、明亮甜美;短貼文、活潑的內容', design: '一位年輕女性,聲音明亮甜美、親切自然,像鄰家姐姐,講清楚的台灣國語。' },
    { id: 'p2', name: '柔和溫暖・耐心老師', def: 'Sulafat', hint: '成熟、柔和溫暖;大部分貼文(預設)', design: '一位成熟女性,聲音柔和溫暖,像耐心的老師,講清楚的台灣國語。' },
    { id: 'p3', name: '溫暖沙啞・說故事', def: 'Gacrux', hint: '帶一點沙啞、溫暖;長貼文', design: '一位成熟女性,聲音帶一點沙啞,溫暖,像在說故事,講清楚的台灣國語。' },
    { id: 'p4', name: '輕快帶笑・同學分享', def: 'Laomedeia', hint: '年輕、清脆輕快;延伸、分享', design: '一位年輕女性,聲音清脆輕快、帶著笑意,像同學在分享想法,講清楚的台灣國語。' },
    { id: 'p5', name: '清楚穩重・認真學姐', def: 'Erinome', hint: '清楚穩重;改進、反例這類說理的貼文', design: '一位成熟女性,聲音清楚穩重,條理分明,像認真的學姐,講清楚的台灣國語。' },
    { id: 'p6', name: '開心肯定・溫柔鼓勵(Lumi)', def: 'Lumi', hint: '開心、肯定、溫柔鼓勵;給同學回饋、延伸與分享;中英文夾雜也順', design: '一位年輕女性,聲音開心明亮,語氣肯定、溫柔鼓勵,像貼心的學習教練,中英文自然切換,講清楚的台灣國語。' },
    // 下面兩個是依「參考音檔」量出來的數據去模仿(語速約每秒 5 個音節、逗號停約 0.3~0.4 秒、句號停約 0.7~1 秒、音高與句尾下降程度);style = 這個人設自己的說話方式(會取代通用的「像真人說話」)
    { id: 'p7', name: '平穩清晰・仿曉臻', def: 'Erinome', hint: '仿 Edge 的「曉臻」: 中低音、平穩清楚、句尾輕輕下降, 適合長時間聆聽', design: '一位女性,中低音,平穩清晰,標準的台灣國語,語速穩定,句尾輕輕下降。',
      style: 'Calm, steady Taiwanese Mandarin female voice in a mid-low pitch, clear and neutral like a friendly announcer. Pace about 5 syllables per second. A brief pause (about 0.3 s) at commas and a longer pause (about 1 s) after each sentence. Gentle pitch movement, softly falling at the end of each phrase. Natural and fluid, never robotic.' },
    { id: 'p8', name: '明亮清脆・仿 TTSMaker', def: 'Zephyr', hint: '仿 TTSMaker 的聲音: 音調較高、明亮有活力、抑揚明顯、句尾下降較明顯', design: '一位年輕女性,聲音明亮清脆,音調偏高,抑揚頓挫明顯,標準的台灣國語。',
      style: 'Bright, higher-pitched young Taiwanese Mandarin female voice, lively and expressive. Pace about 5 syllables per second. Short pauses (about 0.4 s) at commas and about 0.7 s after each sentence. Wide pitch variation with a clear falling intonation at the end of each phrase. Natural and fluid, never robotic.' }
  ];
  var TYPE_ZH = { question: '提問', extend: '延伸', improve: '改進', counter: '反例', riseabove: '昇華' };
  var H = {};   // 測試用:可換掉 fetch / 音訊
  var PREF_KEY = 'kb_tts_prefs';

  /* ---------- 小工具 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hash(s) { var h1 = 2166136261, h2 = 5381; s = String(s); for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 ^= c; h1 = Math.imul(h1, 16777619); h2 = ((h2 << 5) + h2 + c) | 0; } return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36); }
  function cfg() { try { var v = global.KB && global.KB.settings && global.KB.settings.get().tts; return v || { ai: { enabled: false } }; } catch (e) { return { ai: { enabled: false } }; } }
  function personaVoice(id) { var c = cfg(), v = c.ai && c.ai.voices && c.ai.voices[id], p = PERSONAS.filter(function (x) { return x.id === id; })[0]; return (v && String(v).trim()) || (p && p.def) || 'Sulafat'; }
  function personaStyle(id) { var p = PERSONAS.filter(function (x) { return x.id === id; })[0]; return (p && p.style) || ''; }
  function loadPrefs() { try { return JSON.parse(global.localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function savePrefs(p) { try { global.localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {} }

  /* ---------- 文字整理 ---------- */
  // 朗讀前的整理:拿掉網址、表情符號、多餘空白(網址念出來沒有意義)
  function forSpeech(s) {
    return String(s == null ? '' : s).replace(/https?:\/\/\S+/g, '(連結)').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/[ \t　]+/g, ' ').trim();
  }
  // 依句號、問號、驚嘆號、分號、換行切成句子(標點留在句尾);太短的句子併到前一句,讓朗讀不要斷得太碎
  function splitSentences(text) {
    var src = String(text == null ? '' : text), out = [], re = /[^\u3002!?;\n\uFF01\uFF1F\uFF1B]+[\u3002!?;\uFF01\uFF1F\uFF1B]*|[\u3002!?;\uFF01\uFF1F\uFF1B]+/g, m;
    while ((m = re.exec(src))) {
      var raw = m[0], t = raw.trim(); if (!t) continue;
      var prev = out[out.length - 1];
      if (prev && t.replace(/[\u3002!?;,.\u3001\s\uFF01\uFF1F\uFF1B\uFF0C]/g, '').length < 4 && /[,\u3001\uFF0C]$/.test(prev.text) === false) { prev.text += t; prev.end = m.index + raw.length; continue; }
      out.push({ text: t, start: m.index, end: m.index + raw.length });
    }
    return out;
  }
  // 給 AI 人聲:把幾個句子合成一段(一次合成多一點字,呼叫次數少、語氣也比較連貫);每段不超過 max 個字
  function groupSentences(sents, max) {
    var out = [], cur = null;
    sents.forEach(function (s) {
      if (cur && (cur.text + s.text).length <= max) { cur.text += s.text; cur.end = s.end; cur.n++; }
      else { cur = { text: s.text, start: s.start, end: s.end, n: 1 }; out.push(cur); }
    });
    out.forEach(function (c) { if (c.text.length > 600) c.text = c.text.slice(0, 600); });
    return out;
  }

  /* ---------- 自動判斷語氣 ---------- */
  var TONES = {
    question: { zh: '好奇、句尾自然上揚、語速稍慢', en: 'curious, gentle rising intonation, slightly slow' },
    extend: { zh: '溫暖、輕快、帶著笑意', en: 'warm, light and smiling' },
    improve: { zh: '認真清楚、有條理', en: 'earnest, clear and well organized' },
    counter: { zh: '沉穩、堅定但不凶', en: 'calm and firm, gentle emphasis on key words' },
    riseabove: { zh: '平靜、有深度、慢慢說', en: 'calm, thoughtful, slow and patient' },
    plain: { zh: '自然、清楚', en: 'natural and clear' }
  };
  // 手動選擇語氣(朗讀列的「語氣」選單):蓋過自動判斷。第一項是你在 AI Studio 用的語氣描述。
  var STYLES = [
    { id: 'cheer', zh: '開心肯定・溫柔鼓勵', en: 'Delighted, affirming, and gentle coaching with seamless bilingual switching' },
    { id: 'curious', zh: '好奇探問', en: 'curious, gentle rising intonation, slightly slow' },
    { id: 'clear', zh: '認真清楚', en: 'earnest, clear and well organized' },
    { id: 'calm', zh: '平靜沉穩', en: 'calm and firm, gentle emphasis on key words' },
    { id: 'story', zh: '溫暖說故事', en: 'warm storytelling, expressive, with natural pauses' },
    { id: 'slow', zh: '慢慢說・有耐心', en: 'calm, thoughtful, slow and patient' }
  ];
  // 貼文裡可以自己加的「表情標記」,例如 [笑]、[咳嗽]、【停頓】, 轉成 Gemini 的表情標籤(AI Studio「+ Expression」的 <laugh>、<cough> 這種寫法)。
  // 標籤名稱集中在這張表,若 AI Studio 的 + Expression 清單用別的寫法,只要改這裡。
  var EXPR = [
    [['笑', '輕笑', '笑聲'], '<laugh>'], [['咳嗽', '咳'], '<cough>'], [['嘆氣', '嘆息'], '<sigh>'],
    [['停頓', '稍停'], '<short pause>'], [['長停頓'], '<long pause>']
  ];
  var EXPR_RE = /[\[\u3010\uFF3B]\s*([^\[\]\u3010\u3011\uFF3B\uFF3D\s]{1,6})\s*[\]\u3011\uFF3D]/g;
  function exprTag(name) { for (var i = 0; i < EXPR.length; i++) if (EXPR[i][0].indexOf(name) >= 0) return EXPR[i][1]; return null; }
  function exprText(t) {
    return String(t == null ? '' : t).replace(EXPR_RE, function (m, name) { var tag = exprTag(name); return tag ? tag + ' ' : m; });
  }
  // post = { type, title, content };回傳 { key, label, style(給 AI 人聲的英文語氣), rate, reasons[] }
  function fitStyle(en) { var a = en.slice(), t = a.join(', '); while (t.length > 100 && a.length > 1) { a.pop(); t = a.join(', '); } return t.slice(0, 100); }
  function analyze(post) {
    var type = post && post.type, base = TONES[type] || TONES.plain, text = String((post && ((post.title || '') + '\u3002' + (post.content || ''))) || '');
    var label = [base.zh], en = [base.en], reasons = [TYPE_ZH[type] ? '這是一則「' + TYPE_ZH[type] + '」' : '一般貼文'];
    if (type !== 'question' && /[?\uFF1F]/.test(text)) { label.push('帶疑問語氣'); en.push('a questioning tone'); reasons.push('內容有問號'); }
    if (/[!\uFF01]/.test(text) || /太棒|好棒|終於|成功了|太好了|耶/.test(text)) { label.push('開心有活力'); en.push('cheerful and energetic'); reasons.push('有驚嘆或開心的字'); }
    if (/因為|所以|因此|如果.+就/.test(text)) { label.push('說理的地方放慢'); en.push('measured pace when reasoning'); reasons.push('有「因為…所以」'); }
    if (/但是|可是|不過|然而|卻/.test(text)) { label.push('轉折前稍停'); reasons.push('有轉折詞'); }
    var tech = (text.match(/[A-Za-z]{2,}\d*|\d+(\.\d+)?/g) || []).length;
    if (tech >= 3) { label.push('專有名詞、數字放慢'); en.push('clearly articulate technical terms'); reasons.push('有 ' + tech + ' 個英文縮寫或數字'); }
    if (/[A-Za-z]{2,}/.test(text)) en.push('seamless bilingual switching');
    if (text.length > 150) { label.push('內容較長,段落間停頓'); reasons.push('內容超過 150 字'); }
    return { key: TONES[type] ? type : 'plain', label: label.join('、'), style: fitStyle(en), reasons: reasons, pauseBefore: /但是|可是|不過|然而/.test(text) };
  }
  // AI 人聲的逐字稿:在轉折詞前加 <short pause>(Gemini 的英文標籤,中文逐字稿也用英文標籤)
  function withPauses(t) { return t.replace(/([^\s\u3002!?,;\u3001\uFF0C\uFF01\uFF1F\uFF1B])(但是|可是|不過|然而)/g, '$1<short pause>$2').replace(/([,\u3001\uFF0C])(但是|可是|不過|然而)/g, '$1<short pause>$2'); }

  // 說話方式(speech_metadata.style): 一般人設只送「這則貼文的語氣」(短短一句英文), 保留各人設原本的聲音特色; 只有「仿曉臻/仿 TTSMaker」這類有自己 style 的人設, 才在前面加上它的說話方式
  function styleFor(personaId, toneStyle) { var ps = personaStyle(personaId); return ps ? ps + (toneStyle ? ' Tone: ' + toneStyle : '') : (toneStyle || ''); }
  // 這台電腦存的「Gemini 金鑰」(設定中心 AI 設定頁第一張卡, 存在瀏覽器 localStorage kb_ai_key): 伺服器沒有金鑰時, 老師自己的瀏覽器改用它直接向 Google 合成.
  // 只有存了金鑰的那台電腦聽得到; 學生要聽, 還是要在雲端(或 Vercel 環境變數)存金鑰.
  function localKey() { try { return String(global.localStorage.getItem('kb_ai_key') || '').trim(); } catch (e) { return ''; } }
  var GEM = 'https://generativelanguage.googleapis.com/v1beta/', TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
  function upMsg(st) { return st === 400 ? '這段文字或這個聲音,語音模型不接受。' : (st === 401 || st === 403) ? '語音服務拒絕了這把金鑰(請確認金鑰可以使用語音功能)。' : st === 404 ? '找不到這個語音模型或聲音。' : st === 429 ? '語音服務的使用量暫時用完了,請稍後再試。' : '語音服務暫時無法使用,請稍後再試。'; }
  function cleanDetail(m) { return String(m == null ? '' : m).replace(/AIza[0-9A-Za-z_\-]{20,}/g, '***').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220); }
  function failFrom(r) { return r.json().catch(function () { return null; }).then(function (j) { var d = cleanDetail(j && j.error && j.error.message), e = new Error(upMsg(r.status) + (d && r.status !== 429 ? ' (Google 說: ' + d + ')' : '')); e.status = r.status; e.direct = true; throw e; }); }
  function pcmToWav(b64) {   // Google 回的如果是沒有檔頭的 PCM(24kHz、單聲道、16-bit), 補上 WAV 檔頭
    var bin = global.atob(b64), n = bin.length, u8 = new Uint8Array(44 + n), dv = new DataView(u8.buffer), i;
    function w(o, s) { for (var k = 0; k < s.length; k++) u8[o + k] = s.charCodeAt(k); }
    w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 24000, true); dv.setUint32(28, 48000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n, true);
    for (i = 0; i < n; i++) u8[44 + i] = bin.charCodeAt(i);
    var out = '', CH = 0x8000; for (i = 0; i < u8.length; i += CH) out += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return global.btoa(out);
  }
  function directClip(text, voice, style, model, key) {   // 用這台電腦的金鑰直接向 Google 合成(和 api/tts.js 送的內容一樣)
    var f = H.fetch || global.fetch; if (typeof f !== 'function') return Promise.reject(new Error('這個瀏覽器不能向 Google 要資料'));
    var st = String(style == null ? '' : style).replace(/[\u0000-\u001f\u007f<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600), part = { text: String(text) };
    if (st) part.speech_metadata = { style: st };
    var m = TTS_MODELS.indexOf(model) >= 0 ? model : 'gemini-3.8-flash-tts';
    return f(GEM + 'models/' + m + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [part] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice: String(voice).slice(0, 120) } } } }) }).then(function (r) {
      if (!r.ok) return failFrom(r);
      return r.json().catch(function () { return null; }).then(function (j) {
        var parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || [], a = null;
        parts.forEach(function (p) { var d = p.inlineData || p.inline_data; if (d && d.data && !a) a = d; });
        if (!a) { var e = new Error('語音模型沒有回傳聲音,請換一段文字再試。'); e.direct = true; throw e; }
        var mime = String(a.mimeType || a.mime_type || 'audio/wav');
        return { audio: /wav|wave/i.test(mime) ? a.data : pcmToWav(a.data), mime: 'audio/wav' };
      });
    });
  }
  function fallbackOk(e) { return !!localKey() && !(e && e.direct) && (!e || !e.status || e.status === 503 || e.status === 404 || e.status === 0); }   // 伺服器沒金鑰/找不到/連不上, 而且這台電腦有存金鑰
  function aiState() {   // 老師有沒有開 AI 人聲; 伺服器(雲端)有金鑰, 或這台電腦存了 Gemini 金鑰, 都算可以用(伺服器的結果只查一次, 5 分鐘內重複使用)
    var c = cfg(); if (!(c.ai && c.ai.enabled)) return Promise.resolve(false);
    if (!(aiState.v && Date.now() - aiState.t < 300000)) {
      var f = H.fetch || global.fetch; aiState.t = Date.now();
      aiState.v = typeof f !== 'function' ? Promise.resolve(false) : f('/api/tts').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return !!(j && j.configured); }, function () { return false; });
    }
    return aiState.v.then(function (ok) { aiState.src = ok ? 'cloud' : localKey() ? 'local' : ''; return ok || !!localKey(); });
  }

  /* ---------- AI 人聲:合成 + 快取 ---------- */
  var mem = {}, idbP = null;
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise(function (res) {
      try { if (!global.indexedDB) return res(null); var rq = global.indexedDB.open('kb_tts_v1', 1); rq.onupgradeneeded = function () { try { rq.result.createObjectStore('a'); } catch (e) {} }; rq.onsuccess = function () { res(rq.result); }; rq.onerror = rq.onblocked = function () { res(null); }; } catch (e) { res(null); }
    });
    return idbP;
  }
  function cacheGet(k) {
    if (mem[k]) return Promise.resolve(mem[k]);
    return idb().then(function (db) { if (!db) return null; return new Promise(function (res) { try { var rq = db.transaction('a').objectStore('a').get(k); rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { res(null); }; } catch (e) { res(null); } }); }).then(function (v) { if (v) mem[k] = v; return v; });
  }
  function cachePut(k, v) { mem[k] = v; return idb().then(function (db) { if (db) try { db.transaction('a', 'readwrite').objectStore('a').put(v, k); } catch (e) {} }); }
  function b64ToUrl(b64, mime) {
    var bin = global.atob(b64), n = bin.length, u8 = new Uint8Array(n); for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    var blob = new global.Blob([u8], { type: mime || 'audio/wav' }); return global.URL.createObjectURL(blob);
  }
  // 回傳 Promise<{ url, cached }>
  // 聲音清單(含男女): 向伺服器要(伺服器再向 Google 讀); 讀到就記住, 失敗可以再試
  var vlist = null, vP = null;
  function directVoices(key) {   // 用這台電腦的金鑰直接向 Google 讀聲音清單(含男女)
    var f = H.fetch || global.fetch, out = [];
    function page(tok, n) {
      return f(GEM + 'voices?page_size=1000' + (tok ? '&page_token=' + encodeURIComponent(tok) : ''), { headers: { 'x-goog-api-key': key } }).then(function (r) {
        if (!r.ok) return failFrom(r);
        return r.json().catch(function () { return {}; }).then(function (j) {
          (j.voices || []).forEach(function (v) { if (v && (v.id || v.name)) out.push({ id: String(v.id || String(v.name).replace(/^voices\//, '')), name: String(v.display_name || v.displayName || v.id || ''), gender: String(v.gender || '').toLowerCase(), type: String(v.type || ''), description: String(v.description || '').slice(0, 120) }); });
          var next = j.next_page_token || j.nextPageToken || ''; return next && n < 4 && out.length < 800 ? page(next, n + 1) : out.slice(0, 800);
        });
      });
    }
    return page('', 0);
  }
  function voiceList() {
    if (vlist) return Promise.resolve(vlist); if (vP) return vP;
    var f = H.fetch || global.fetch; if (typeof f !== 'function') return Promise.reject(new Error('這個瀏覽器不能向伺服器要資料'));
    vP = f('/api/tts?voices=1').then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok || !j || !Array.isArray(j.voices)) { var e = new Error((j && j.error && j.error.message) || '讀不到聲音清單'); e.status = r.status; throw e; }
        vlist = j.voices; return vlist;
      });
    }).then(null, function (e) { if (!fallbackOk(e)) throw e; return directVoices(localKey()).then(function (l) { vlist = l; return l; }); });
    vP.then(null, function () { vP = null; });
    return vP;
  }
  var inflight = {};
  function aiClip(text, voice, style, model) {
    var key = 'v1|' + (model || '') + '|' + voice + '|' + style + '|' + hash(text);
    if (inflight[key]) return inflight[key];
    var pr = aiClip1(key, text, voice, style, model); inflight[key] = pr;
    var clear = function () { delete inflight[key]; }; pr.then(clear, clear);
    return pr;
  }
  function aiClip1(key, text, voice, style, model) {
    return cacheGet(key).then(function (hit) {
      if (hit && hit.b64) return { url: b64ToUrl(hit.b64, hit.mime), cached: true };
      var f = H.fetch || global.fetch;
      return f('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, voice: voice, style: style, model: model || undefined }) }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok || !j || !j.audio) { var e = new Error((j && j.error && j.error.message) || '語音服務暫時無法使用'); e.status = r.status; throw e; }
          return j;
        });
      }).then(null, function (e) {   // 伺服器沒金鑰/找不到/連不上: 這台電腦有存 Gemini 金鑰就改用它(只有這台電腦聽得到)
        if (!fallbackOk(e)) throw e;
        return directClip(text, voice, style, model, localKey());
      }).then(function (j) {
        cachePut(key, { b64: j.audio, mime: j.mime || 'audio/wav' });
        return { url: b64ToUrl(j.audio, j.mime), cached: false };
      });
    });
  }

  /* ---------- 朗讀控制: 一段一段讀, 可暫停/繼續/停止 ----------
   * opts = { chunks:[{ text, start, end }], voice(聲音名), style, rate, model, onChunk(i,chunk), onState(state), onNote(msg) } */
  function Reader(o) {
    var self = this; this.o = o; this.i = 0; this.state = 'idle'; this.token = 0; this.audio = null; this.pre = {};
    function set(s) { self.state = s; if (o.onState) o.onState(s); }
    function say(m) { if (o.onNote) o.onNote(m); }
    function done() { set('idle'); if (o.onChunk) o.onChunk(-1); }
    function fail(err, tok) { if (tok !== self.token) return; clearWait(); say('朗讀失敗: ' + (err && err.message || '請稍後再試')); done(); }
    function clipFor(i) {
      if (self.pre[i]) return self.pre[i];
      var c = o.chunks[i]; if (!c) return null;
      return (self.pre[i] = aiClip(withPauses(exprText(forSpeech(c.speak || c.text))), o.voice, c.style || o.style, o.model));
    }
    var AHEAD = 3;   // 播這一段時, 同時先把後面 3 段準備好(不然每一段都要等合成, 聲音就會斷斷續續)
    var waitT = null;
    function clearWait() { if (waitT) { clearTimeout(waitT); waitT = null; } if (self.waiting) { self.waiting = false; say(''); } }
    function speak(c, tok) {
      waitT = setTimeout(function () { if (tok === self.token && self.state === 'playing') { self.waiting = true; say('正在準備下一段聲音...'); } }, 600);
      var now = clipFor(self.i);   // 先要這一段, 再同時準備後面的
      for (var k = 1; k <= AHEAD; k++) { if (self.i + k < o.chunks.length) { var pf = clipFor(self.i + k); if (pf && pf.catch) pf.catch(function () {}); } }
      now.then(function (clip) {
        clearWait();
        if (tok !== self.token || self.state !== 'playing') return;
        var a = H.Audio ? new H.Audio(clip.url) : new global.Audio(clip.url); self.audio = a;
        try { a.playbackRate = Math.max(0.5, Math.min(2, o.rate || 1)); } catch (e) {}
        a.onended = function () { if (tok === self.token && self.state === 'playing') { self.i++; run(tok); } };
        a.onerror = function () { fail(new Error('聲音檔播放失敗'), tok); };
        var p = a.play(); if (p && p.catch) p.catch(function (e) { if (tok === self.token && !(e && e.name === 'AbortError')) fail(e, tok); });
      }, function (err) { fail(err, tok); });
    }
    function run(tok) {
      if (tok !== self.token || self.state !== 'playing') return;
      if (self.i >= o.chunks.length) return done();
      var c = o.chunks[self.i]; if (o.onChunk) o.onChunk(self.i, c);
      speak(c, tok);
    }
    this.play = function () { if (self.state === 'playing') return; self.token++; self.i = self.state === 'paused' ? self.i : 0; set('playing'); run(self.token); };
    this.pause = function () {
      if (self.state !== 'playing') return; set('paused'); self.token++; clearWait();
      if (self.audio) { try { self.audio.pause(); } catch (e) {} }
    };
    this.resume = function () {
      if (self.state !== 'paused') return; set('playing'); var tok = ++self.token;
      if (self.audio && !self.audio.ended && self.audio.currentTime > 0) { var a = self.audio; a.onended = function () { if (tok === self.token && self.state === 'playing') { self.i++; run(tok); } }; var p = a.play(); if (p && p.catch) p.catch(function () { run(tok); }); }
      else run(tok);
    };
    this.stop = function () {
      if (self.state === 'idle') return; self.token++; clearWait(); set('idle');
      if (self.audio) { try { self.audio.pause(); } catch (e) {} self.audio = null; }
      if (o.onChunk) o.onChunk(-1);
    };
  }

  /* ---------- 在內文上標出「正在讀的這一句」(CSS Custom Highlight API;不支援的瀏覽器只顯示字幕) ---------- */
  function textMap(el) {   // 內文裡每個「非空白字」在哪個文字節點的哪個位置
    var map = [], w = doc.createTreeWalker(el, 4 /* SHOW_TEXT */), n;
    while ((n = w.nextNode())) { var t = n.nodeValue; for (var i = 0; i < t.length; i++) if (!/\s/.test(t.charAt(i))) map.push({ n: n, o: i }); }
    return map;
  }
  function compactIndex(text, pos) { return String(text).slice(0, pos).replace(/\s/g, '').length; }
  function setHighlight(el, text, start, end) {
    var hl = global.CSS && global.CSS.highlights && global.Highlight; if (!hl) return false;
    if (!el) { global.CSS.highlights.delete('kb-tts'); return false; }
    var map = textMap(el), a = compactIndex(text, start), b = compactIndex(text, end) - 1;
    if (a < 0 || b < a || !map[a] || !map[b]) { global.CSS.highlights.delete('kb-tts'); return false; }
    var r = doc.createRange(); r.setStart(map[a].n, map[a].o); r.setEnd(map[b].n, map[b].o + 1);
    global.CSS.highlights.set('kb-tts', new global.Highlight(r)); return true;
  }
  function clearHighlight() { try { if (global.CSS && global.CSS.highlights) global.CSS.highlights.delete('kb-tts'); } catch (e) {} }

  /* ---------- 朗讀列(畫面) ---------- */
  function css() {
    if (doc.getElementById('kbt-style')) return;
    var s = doc.createElement('style'); s.id = 'kbt-style';
    s.textContent = '.kbt{margin:0 0 14px;padding:10px 12px;border:1.5px solid #e0e7ff;background:#f5f7ff;border-radius:14px}.kbt-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.kbt-btn{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:8px 16px;border-radius:12px;border:2px solid #4f46e5;background:#4f46e5;color:#fff;font-weight:800;font-size:15px;cursor:pointer}.kbt-btn.alt{background:#fff;color:#4f46e5}.kbt-btn[hidden]{display:none}.kbt-btn:focus-visible,.kbt select:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}' +
      '.kbt select{min-height:44px;padding:6px 10px;border-radius:12px;border:2px solid #c7d2fe;background:#fff;font-size:14px;max-width:100%}.kbt label{display:inline-flex;align-items:center;gap:6px;font-size:14px;min-height:44px;cursor:pointer}' +
      '.kbt-info{font-size:12.5px;color:#4b5563;margin-top:6px;line-height:1.6}.kbt-cap{font-size:15px;color:#1e1b4b;margin-top:6px;min-height:0;font-weight:700;line-height:1.6}.kbt-cap:empty{display:none}.kbt-note{font-size:12.5px;color:#b45309;margin-top:4px}.kbt-note:empty{display:none}' +
      '::highlight(kb-tts){background-color:#fde68a;color:#111827}';
    (doc.head || doc.documentElement).appendChild(s);
  }
  var cur = null;   // 目前這個畫面上的朗讀列(同時只會有一個在讀)
  function stop() { if (cur) cur.stop(); clearHighlight(); }

  // 切成一段一段的朗讀單位. 三顆按鈕各讀一部分:
  //  part='title': 「類型。標題。」(例如「提問。空氣裡的一粒灰塵。」); part='body': 下方的內文.
  // 為了「流暢自然」, 內文的段落要夠長(句子之間不要每句都停頓重新開口):
  //  由短到長: 第 1 段約 50 字內(最快開始播)、第 2 段約 100 字、第 3 段約 200 字、之後每段最多 300 字. 播前一段的時候, 後一段正好合成好, 不用等.
  var LIMITS = [50, 100, 200];
  function chunksFor(pst, part, lead, progressive) {
    var out = [];
    if (part === 'title') {
      var intro = forSpeech((lead || '') + (TYPE_ZH[pst.type] ? TYPE_ZH[pst.type] + '。' : '') + (pst.title ? pst.title + '。' : ''));
      if (intro) out.push({ text: intro, start: 0, end: 0, title: true });
      return out;
    }
    var rest = splitSentences(pst.content);
    while (rest.length) {
      var lim = (progressive !== false && LIMITS[out.length] !== undefined) ? LIMITS[out.length] : 300, fs = [], len = 0;
      while (rest.length && (!fs.length || len + rest[0].text.length <= lim)) { var x = rest.shift(); fs.push(x); len += x.text.length; }
      out.push({ text: fs.map(function (q) { return q.text; }).join('').slice(0, 600), start: fs[0].start, end: fs[fs.length - 1].end, n: fs.length });
    }
    return out;
  }
  // 其他同學的回應(最下面那顆鈕): 依時間順序一則一則讀, 每則「第 N 則回應。類型。標題。內文」; 不唸姓名(姓名不送到 Google)
  function replyChunks(list, autoTone, pid) {
    var out = [];
    list.forEach(function (r, i) {
      var rp = { type: r.type, title: r.title || '', content: r.content || '' }, lead = '第' + (i + 1) + '則回應。';
      var tc = chunksFor(rp, 'title', lead), bc = chunksFor(rp, 'body', '', i === 0), cs;
      if (tc.length && bc.length) { bc[0].text = tc[0].text + bc[0].text; cs = bc; }   // 標題和內文第一段一起合成, 更連貫
      else cs = tc.concat(bc);
      var st = autoTone ? styleFor(pid, analyze(rp).style) : null;
      cs.forEach(function (c) { c.noHl = true; c.reply = i + 1; if (st) c.style = st; out.push(c); });
    });
    return out;
  }

  // ctx = { getPost(): { type, title, content }, titleHost(選配: 放「朗讀標題」鈕的位置, 通常在標題旁), repliesHost(選配: 放「朗讀全部回應」鈕的位置, 通常在最下方), getReplies(): [{ type, title, content }](選配: 其他人的回應), contentEl }
  // 只有老師在設定中心(AI 設定)開啟「貼文朗讀」才會出現; 沒開就整個不顯示.
  function mount(host, ctx) {
    if (!host) return null; css(); stop(); host.innerHTML = '';
    if (ctx.titleHost) ctx.titleHost.innerHTML = ''; if (ctx.repliesHost) ctx.repliesHost.innerHTML = '';
    var c0 = cfg(); if (!(c0.ai && c0.ai.enabled)) { host.style.display = 'none'; return null; }
    host.style.display = '';
    var prefs = loadPrefs(), reader = null, mode = 'body';
    host.innerHTML = '<div class="kbt" role="group" aria-label="朗讀這則貼文"><div class="kbt-row"><button type="button" class="kbt-btn" data-k="play" aria-label="朗讀內容">🔊 朗讀內容</button><button type="button" class="kbt-btn alt" data-k="stop" hidden aria-label="停止朗讀">⏹ 停止</button>' +
      '<select data-k="voice" aria-label="選擇聲音">' + PERSONAS.map(function (p) { return '<option value="ai:' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</select><select data-k="rate" aria-label="朗讀速度"><option value="0.8">慢一點</option><option value="0.9">稍慢(預設)</option><option value="1">正常</option><option value="1.15">稍快</option><option value="1.3">快</option></select>' +
      '<select data-k="tone" aria-label="語氣"><option value="auto">語氣:自動判斷</option>' + STYLES.map(function (x) { return '<option value="' + x.id + '">' + esc(x.zh) + '</option>'; }).join('') + '</select><label><input type="checkbox" data-k="auto" checked> 自動語氣</label></div><div class="kbt-info" data-k="info"></div><div class="kbt-cap" data-k="cap" aria-live="polite"></div><div class="kbt-note" data-k="note" role="status"></div></div>';
    var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
    var tb = doc.createElement('button'); tb.type = 'button'; tb.className = 'kbt-btn kbt-title'; tb.setAttribute('data-k', 'playt'); tb.setAttribute('aria-label', '朗讀類型與標題'); tb.textContent = '🔊 朗讀標題';
    var rb = doc.createElement('button'); rb.type = 'button'; rb.className = 'kbt-btn kbt-replies'; rb.setAttribute('data-k', 'playr'); rb.setAttribute('aria-label', '朗讀其他人的全部回應'); rb.textContent = '🔊 朗讀全部回應(0)';
    if (ctx.repliesHost) { ctx.repliesHost.style.display = ''; ctx.repliesHost.appendChild(rb); } else host.querySelector('.kbt-row').appendChild(rb);
    if (ctx.titleHost) { ctx.titleHost.style.display = ''; ctx.titleHost.appendChild(tb); } else { var rowEl = host.querySelector('.kbt-row'); rowEl.insertBefore(tb, rowEl.firstChild); }
    var play = $('play'), playt = tb, playr = rb, stopB = $('stop'), vs = $('voice'), rs = $('rate'), au = $('auto'), tn = $('tone'), info = $('info'), cap = $('cap'), note = $('note');
    rs.value = prefs.rate || '0.9'; if (prefs.tone && tn.querySelector('option[value="' + prefs.tone + '"]')) tn.value = prefs.tone;
    au.checked = prefs.auto !== false;
    vs.value = prefs.voice && vs.querySelector('option[value="' + String(prefs.voice).replace(/"/g, '') + '"]') ? prefs.voice : 'ai:p2';   // 以前存過瀏覽器聲音的人, 換成預設的 AI 人聲
    function preset() { return STYLES.filter(function (x) { return x.id === tn.value; })[0] || null; }
    function post() { var p = ctx.getPost() || {}; return { type: p.type, title: p.title || '', content: p.content || '' }; }
    function replies() { try { var l = ctx.getReplies && ctx.getReplies(); return Array.isArray(l) ? l.filter(function (r) { return r && (String(r.content || '').trim() || String(r.title || '').trim()); }) : []; } catch (e) { return []; } }
    function showInfo() {
      var t = analyze(post()), pr = preset();
      info.textContent = pr ? '語氣(手動選擇): ' + pr.zh : au.checked ? '語氣(依這則貼文自動判斷): ' + t.label : '語氣: 自然、清楚(已關閉自動語氣)';
      info.title = pr ? '' : au.checked ? t.reasons.join(', ') : '';
    }
    // 把「這顆鈕要讀的內容」整理成要合成的段落與設定(按下播放和事先準備都用它)
    function plan(m) {
      var md = m === 'title' ? 'title' : m === 'replies' ? 'replies' : 'body', pst = post(), rl = md === 'replies' ? replies() : [];
      var personaId = vs.value.replace(/^ai:/, ''), pr = preset(), tone = pr ? { style: pr.en } : au.checked && md !== 'replies' ? analyze(pst) : { style: '' };
      var chunks = md === 'replies' ? replyChunks(rl, au.checked && !pr, personaId) : chunksFor(pst, md);
      return { mode: md, pst: pst, rl: rl, personaId: personaId, pr: pr, chunks: chunks, voice: personaVoice(personaId), style: styleFor(personaId, tone.style), model: (cfg().ai && cfg().ai.model) || undefined };
    }
    var warmKey = '';
    function warm(m) {   // 事先合成第一段(和第二段): 使用者按下去時多半已經好了, 幾乎不用等. 同一段只會合成一次, 之後重聽也用存起來的
      try {
        if (reader && reader.state === 'playing') return;
        var pl = plan(m); if (!pl.chunks.length || (pl.mode === 'replies' && !pl.rl.length)) return;
        var k = pl.mode + '|' + pl.voice + '|' + pl.style + '|' + pl.chunks[0].text; if (k === warmKey) return; warmKey = k;
        pl.chunks.slice(0, 2).forEach(function (c) { var pr2 = aiClip(withPauses(exprText(forSpeech(c.speak || c.text))), pl.voice, c.style || pl.style, pl.model); if (pr2 && pr2.catch) pr2.catch(function () {}); });
      } catch (e) {}
    }
    function start(m) {
      mode = m === 'title' ? 'title' : m === 'replies' ? 'replies' : 'body';
      stop();
      var pst = post(), rl = mode === 'replies' ? replies() : [];
      if (mode === 'replies' && !rl.length) { note.textContent = '這則貼文還沒有其他人的回應。'; return; }
      if (mode === 'body' && !String(pst.content).trim()) { note.textContent = '這則貼文沒有內文可以朗讀。'; return; }
      if (mode === 'title' && !String(pst.title).trim() && !TYPE_ZH[pst.type]) { note.textContent = '這則貼文沒有標題可以朗讀。'; return; }
      var pl = plan(mode), chunks = pl.chunks, userRate = parseFloat(rs.value) || 1;
      prefs.voice = vs.value; prefs.rate = rs.value; prefs.auto = au.checked; prefs.tone = tn.value; savePrefs(prefs);
      note.textContent = ''; cap.textContent = '';
      reader = new Reader({
        chunks: chunks, voice: pl.voice, style: pl.style, model: pl.model, rate: userRate,
        onChunk: function (i, c) {
          if (i < 0) { cap.textContent = ''; clearHighlight(); return; }
          cap.textContent = (c.reply ? '(回應 ' + c.reply + ')' : '') + c.text; if (c.title || c.noHl) clearHighlight(); else setHighlight(ctx.contentEl, pst.content, c.start, c.end);
        },
        onState: function (s) { setButtons(s); stopB.hidden = s === 'idle'; if (s === 'idle') cap.textContent = ''; },
        onNote: function (m2) { note.textContent = m2; }
      });
      cur = reader; reader.play();
    }
    function setButtons(s) {   // 目前在讀的那顆按鈕變「暫停/繼續」, 其他兩顆維持原樣
      play.textContent = '🔊 朗讀內容'; play.setAttribute('aria-label', '朗讀內容'); playt.textContent = '🔊 朗讀標題'; playt.setAttribute('aria-label', '朗讀類型與標題');
      playr.textContent = '🔊 朗讀全部回應(' + replies().length + ')'; playr.setAttribute('aria-label', '朗讀其他人的全部回應');
      if (s === 'playing' || s === 'paused') { var pb = mode === 'title' ? playt : mode === 'replies' ? playr : play; pb.textContent = s === 'playing' ? '⏸ 暫停' : '▶ 繼續'; pb.setAttribute('aria-label', s === 'playing' ? '暫停朗讀' : '繼續朗讀'); }
    }
    function toggle(m) { if (reader && reader.state !== 'idle' && mode === m) { if (reader.state === 'playing') reader.pause(); else reader.resume(); } else start(m); }
    play.onclick = function () { toggle('body'); };
    playt.onclick = function () { toggle('title'); };
    playr.onclick = function () { toggle('replies'); };
    [[play, 'body'], [playt, 'title'], [playr, 'replies']].forEach(function (x) {   // 還沒按下去, 就先開始合成第一段
      ['mouseenter', 'focus', 'touchstart'].forEach(function (ev) { x[0].addEventListener(ev, function () { if (!x[0].disabled) warm(x[1]); }, { passive: true }); });
    });
    stopB.onclick = function () { if (reader) reader.stop(); };
    [vs, au, tn].forEach(function (e) { e.onchange = function () { showInfo(); if (reader && reader.state !== 'idle') { var was = reader.state; reader.stop(); if (was === 'playing') start(mode); } }; });
    rs.onchange = function () { if (reader && reader.state === 'playing') { reader.stop(); start(mode); } };
    showInfo();
    (function () { var p0 = post(); tb.hidden = !String(p0.title).trim() && !TYPE_ZH[p0.type]; play.hidden = !String(p0.content).trim(); var rn = replies().length; playr.hidden = !rn; playr.textContent = '🔊 朗讀全部回應(' + rn + ')'; })();
    aiState().then(function (ok) {   // 伺服器和這台電腦都沒有 Gemini 金鑰: 說明原因, 鈕先停用
      if (ok && aiState.src === 'local' && !note.textContent) note.textContent = '目前用的是這台電腦存的 Gemini 金鑰, 只有這台電腦聽得到; 要讓學生也能聽, 請在雲端存金鑰。';
      if (ok) return;
      note.textContent = '朗讀功能暫時不能用: 老師還沒有把 Gemini 金鑰存到雲端(設定中心 > AI 設定)。';
      [play, playt, playr].forEach(function (b) { b.disabled = true; });
    });
    return { stop: stop, state: function () { return reader ? reader.state : 'idle'; }, destroy: function () { stop(); host.innerHTML = ''; if (ctx.titleHost) ctx.titleHost.innerHTML = ''; if (ctx.repliesHost) ctx.repliesHost.innerHTML = ''; } };
  }

  global.KBTts = {
    PERSONAS: PERSONAS, TONES: TONES, STYLES: STYLES, EXPR: EXPR, exprText: exprText, analyze: analyze, splitSentences: splitSentences, groupSentences: groupSentences, forSpeech: forSpeech, withPauses: withPauses,
    mount: mount, stop: stop, personaVoice: personaVoice, personaStyle: personaStyle, aiClip: aiClip, voiceList: voiceList, localKey: localKey, Reader: Reader, aiState: aiState,
    _t: { H: H, mem: mem, setHighlight: setHighlight, textMap: textMap, hash: hash, resetAi: function () { aiState.v = null; vlist = null; vP = null; } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
