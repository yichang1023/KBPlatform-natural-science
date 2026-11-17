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
      style: 'Bright, higher-pitched young Taiwanese Mandarin female voice, lively and expressive. Pace about 5 syllables per second. Short pauses (about 0.4 s) at commas and about 0.7 s after each sentence. Wide pitch variation with a clear falling intonation at the end of each phrase. Natural and fluid, never robotic.' },
    // 說書人: 男聲、沙啞有勁; rich=true 表示「自動語氣」最豐富(每一小段都依情節與情緒變化, 也切得比較短、變化更細)
    { id: 'p9', name: '天橋下說書人', def: 'Algenib', rich: true, hint: '像在天橋下說書的老藝人: 沙啞有勁、抑揚頓挫; 武俠、浪漫、抒情、懸疑的故事特別有戲, 自動語氣最豐富(每一小段都依情節與情緒變化)', design: '一位中年到年長的男性說書人,聲音沙啞有勁、有磁性,像在台灣天橋下說書的老藝人,抑揚頓挫、戲劇感強,講台灣國語。',
      style: 'A veteran Taiwanese street storyteller under a pedestrian overpass: gravelly, charismatic, theatrical Taiwanese Mandarin with old-school teahouse flavor. Huge dynamic range: thunderous in fights and heroic vows, a hushed creeping whisper in suspense, slow breathy tenderness in romance, wry and sly for jokes and ironic asides, trembling and sorrowful in grief. Clipped rhythm in action, rolling cadence in grand scenes, dramatic pauses before reveals, a distinct voice for every character. Rich emotion, never flat.' }
  ];
  // 瀏覽器聲音版的人設: 用「語速、音高」把各個人設區分開(瀏覽器聲音沒有語氣描述可以送); prefer = 優先挑名字符合的聲音; male = 說書人優先用男聲
  var BR = {
    p1: { rate: 1.02, pitch: 1.1 }, p2: { rate: 0.97, pitch: 1.0 }, p3: { rate: 0.93, pitch: 0.9 }, p4: { rate: 1.06, pitch: 1.12 }, p5: { rate: 0.98, pitch: 0.96 }, p6: { rate: 1.03, pitch: 1.07 },
    p7: { rate: 1.0, pitch: 0.95, prefer: /hsiao-?chen|曉臻/i }, p8: { rate: 1.05, pitch: 1.13, prefer: /hsiao-?yu|曉雨|han-?han|涵涵/i }, p9: { rate: 0.96, pitch: 0.82, male: true }
  };
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
    var src = String(text == null ? '' : text), out = [], re = /[^\u3002!?;\n\uFF01\uFF1F\uFF1B]+[\u3002!?;\uFF01\uFF1F\uFF1B]*[\u300D\u300F\u201D]*|[\u3002!?;\uFF01\uFF1F\uFF1B]+/g, m;
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
    question: { zh: '好奇、句尾自然上揚、語速稍慢', en: 'genuinely curious, leaning in, rising intonation, unhurried' },
    extend: { zh: '溫暖、輕快、帶著笑意', en: 'warm, bright and smiling, energy building as the idea grows' },
    improve: { zh: '認真清楚、有條理', en: 'earnest, clear and well organized, confident emphasis on the fix' },
    counter: { zh: '沉穩、堅定但不凶', en: 'calm but firm, pointed emphasis on the counterexample, a beat before the point' },
    riseabove: { zh: '平靜、有深度、慢慢說', en: 'reflective and profound, slow and resonant, letting key ideas land' },
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
  function fitStyle(en, max) { max = max || 130; var a = en.slice(), t = a.join(', '); while (t.length > max && a.length > 1) { a.pop(); t = a.join(', '); } return t.slice(0, max); }
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
    var g = genreOf(post && post.content);   // 小說情節: 武俠、浪漫、抒情、懸疑、奇幻、搞笑、說故事
    if (g) { label.push(g.zh + '風格'); en.unshift(g.en); reasons.push('內容像「' + g.zh + '」故事(' + g.hits + ' 個相關詞)'); }
    return { key: TONES[type] ? type : 'plain', label: label.join('、'), style: fitStyle(en), reasons: reasons, pauseBefore: /但是|可是|不過|然而/.test(text), genre: g ? g.key : '' };
  }

  /* ---------- 小說情節的語氣: 先判斷整篇是什麼類型(武俠、浪漫、抒情、懸疑…), 再每一小段依情緒微調 ---------- */
  // 每個詞表是「這類故事常出現的字詞」; 命中不同的詞越多, 越像這個類型(門檻避免一般文章被誤判)
  var GENRES = {
    wuxia: { zh: '武俠', min: 2, en: 'wuxia storyteller delivery: heroic rolling cadence, ringing emphasis on every martial move', open: '各位看倌, 且聽我說一段江湖恩怨。', close: '欲知後事如何, 且聽下回分解。', re: /劍|刀光|刀鋒|江湖|內力|掌門|武林|輕功|少俠|大俠|俠客|拔劍|出鞘|門派|高手|招式|真氣|暗器|拳風|比武|決戰|過招|師父|少林|武當|丐幫|魔教|客棧|蒙面|鏢局|點穴|劍氣|殺氣|不敗|殺手|刺客|一掌|掌風|恩怨|俠義|劍法|刀法|酒|俠|幫主|絕招|奇功|傳人|掌門人/g },
    romance: { zh: '浪漫', min: 2, en: 'intimate romantic storytelling, breathy and lingering, every word caressed', open: '各位看倌, 今天這一段, 說的是一個情字。', close: '情之一字, 且聽下回分解。', re: /愛情|愛上|喜歡你|心跳|親吻|吻|擁抱|思念|溫柔|臉紅|牽手|約定|永遠|告白|眼眸|心動|凝視|懷裡|依偎|想你|深情|情話|戀人|戀愛|初戀|相愛|臉頰|耳邊|低語|愛意|相思|心上人|佳人/g },
    suspense: { zh: '懸疑', min: 2, en: 'creeping suspense, hushed and slow, dread building under every pause', open: '各位看倌, 可要豎起耳朵, 這一段, 有點嚇人。', close: '真相如何, 且聽下回分解。', re: /突然|黑暗|腳步聲|陰影|屏住呼吸|秘密|不對勁|冷汗|門縫|神秘|詭異|恐怖|血跡|失蹤|線索|兇手|背後|寒意|毛骨悚然|門外|無聲|鬼|深夜|漆黑|嘎吱|窸窣/g },
    fantasy: { zh: '奇幻', min: 2, en: 'wondrous fantasy adventure, vivid and animated, awe in the big moments', open: '話說在那遙遠的地方, 有一段奇妙的故事。', close: '後來如何, 且聽下回分解。', re: /魔法|龍|勇者|冒險|精靈|魔王|咒語|王國|公主|騎士|巫師|神殿|寶劍|傳說|法術|仙|妖|飛天|神獸|結界/g },
    comedy: { zh: '搞笑', min: 2, en: 'playful comic storytelling, sly timing, mock-serious asides and delighted laughter', open: '各位看倌, 這一段可有趣了, 先說好, 不准笑。', close: '笑完了沒有? 且聽下回分解。', re: /哈哈|搞笑|笑死|糗|滑稽|烏龍|尷尬|噗|好笑|耍寶|嘻嘻|呆呆|逗|整人|出糗|鬧笑話/g },
    lyrical: { zh: '抒情', min: 3, en: 'lyrical and poetic, slow flowing breath, wistful sighs at line ends', open: '夜深了, 各位看倌, 聽我慢慢說來。', close: '餘韻悠悠, 且聽下回分解。', re: /微風|月光|月色|雲|夢|詩|淚|秋|落葉|靜靜|遠方|回憶|記憶|歲月|黃昏|孤獨|嘆息|流淌|輕輕|晚霞|星空|漫步|故鄉|思緒|悠悠|寂靜|惆悵|飄|霧|細雨/g },
    story: { zh: '說故事', min: 3, en: 'warm old-fashioned storytelling, natural pauses, drawing the listener in', open: '各位看倌, 且聽我說來。', close: '且聽下回分解。', re: /從前|很久以前|有一天|故事|傳說|後來|於是|從此|過了很久|話說/g }
  };
  var GENRE_ORDER = ['wuxia', 'romance', 'suspense', 'fantasy', 'comedy', 'lyrical', 'story'];
  function distinctHits(re, t) { var m = String(t || '').match(re) || [], seen = {}, d = 0; m.forEach(function (x) { if (!seen[x]) { seen[x] = 1; d++; } }); return d; }
  function genreOf(text) {   // 回傳 { key, zh, en, hits, open, close } 或 null
    var t = String(text || ''), best = null;
    GENRE_ORDER.forEach(function (k) { var g = GENRES[k], d = distinctHits(g.re, t); if (d >= g.min && (!best || d > best.hits)) best = { key: k, zh: g.zh, en: g.en, hits: d, open: g.open, close: g.close }; });
    return best;
  }
  // 情緒: 每一種有「強、更強、最強」三級描述(命中的情緒詞越多、驚嘆號越多、有「極、猛然、狂」這類加強詞, 級數越高); dr/dp/dv = 瀏覽器聲音用的語速/音高/音量調整(隨級數放大)
  var INTENS = /極|非常|無比|狠狠|猛然|怒不可遏|萬分|拼命|撕心裂肺|放聲|歇斯底里|滔天|徹底|震天|驚天|拼死|瘋狂|狂/;
  var EMOS = {
    anger: { zh: '憤怒', dr: 0.06, dp: 0.02, dv: 0, lv: ['tense and edged, firm clipped stress', 'angry and forceful, sharp stress on key words', 'furious, thundering and explosive, shouting with raw force'], re: /怒|憤|恨|可惡|混帳|該死|滾|咬牙|拍桌|暴怒|喝道|怒吼|怒斥|瞪|氣得|惱|火大/g },
    joy: { zh: '開心', dr: 0.05, dp: 0.06, dv: 0, lv: ['warm and smiling', 'joyful and bright, bouncing energy', 'exuberant, bursting with delight, laughing through the words'], re: /開心|高興|歡喜|笑|太棒|好棒|歡呼|快樂|喜悅|雀躍|哈哈|嘻嘻|幸福|大喜|痛快|興奮/g },
    sad: { zh: '悲傷', dr: -0.08, dp: -0.04, dv: -0.12, lv: ['gently sorrowful, soft and slow', 'deeply sorrowful, voice trembling, heavy pauses', 'heartbroken, choked up, breaking on the words'], re: /哭|淚|悲|傷心|心碎|難過|失去|離別|永別|嘆|哀|痛苦|悲痛|嗚咽|哽咽|淒|訣別|死去|逝|孤單/g },
    fear: { zh: '緊張害怕', dr: -0.02, dp: 0.03, dv: -0.3, lv: ['uneasy and hushed', 'afraid and tense, breathy, hushed whisper', 'terrified, trembling breath, panicked and rushed'], re: /怕|恐懼|驚|顫抖|發抖|冷汗|屏息|屏住|心驚|膽寒|毛骨悚然|嚇|慌|不安|惶恐/g },
    tender: { zh: '溫柔', dr: -0.06, dp: 0.01, dv: -0.2, lv: ['soft and gentle', 'tender and warm, close to the microphone, breathy', 'intimate, whispering with aching tenderness'], re: /溫柔|輕聲|柔聲|低語|輕撫|微笑|凝視|依偎|擁|吻|憐惜|呵護|柔情|耳邊|輕輕地/g },
    shy: { zh: '害羞', dr: -0.04, dp: 0.04, dv: -0.2, lv: ['a little shy', 'shy and flustered, soft and halting', 'blushing, bashful and stammering, barely audible'], re: /害羞|羞澀|臉紅|低下頭|不好意思|扭捏|結結巴巴|耳根|紅暈|羞|心慌意亂/g },
    cold: { zh: '冷峻', dr: -0.03, dp: -0.06, dv: -0.1, lv: ['cool and dry, understated', 'cold, terse and menacing, each word clipped', 'icy and lethal, slow deliberate menace, almost a whisper'], re: /冷笑|冷冷|淡淡|不屑|冷哼|殺氣|面無表情|冷峻|一字一句|寒光|漠然|冷眼|寒聲/g },
    mock: { zh: '嘲諷', dr: 0.02, dp: 0.03, dv: 0, lv: ['dry and wry', 'sarcastic, teasing and sly', 'openly mocking, drawn-out scornful emphasis'], re: /嘲笑|譏諷|諷刺|冷嘲|揶揄|不過如此|可笑|癡人說夢|也配|自不量力|何足道哉|笑話/g },
    pride: { zh: '霸氣', dr: 0.0, dp: -0.03, dv: 0, lv: ['confident and commanding', 'bold, swaggering, commanding', 'domineering, booming and arrogant, towering presence'], re: /霸氣|狂傲|傲然|睥睨|天下第一|豪氣沖天|不可一世|誰敢|孤傲|氣吞山河|唯我獨尊|傲視/g },
    resolve: { zh: '堅定', dr: 0.02, dp: -0.02, dv: 0, lv: ['steady and resolute', 'resolute and heroic, strong projection', 'a thunderous heroic vow, ringing and resonant'], re: /堅定|決心|誓|絕不|一定要|拚|挺身|無所畏懼|義無反顧|不退|寧死|大義|豪氣|豪邁|縱使|縱然|決不/g },
    solemn: { zh: '悲壯', dr: -0.06, dp: -0.05, dv: 0, lv: ['solemn and weighty', 'tragic and heroic, solemn, resonant', 'sweeping tragic grandeur, voice breaking with pride and grief'], re: /悲壯|壯烈|犧牲|殉|以身殉|血染|英魂|蒼涼|慷慨|赴死|義士|最後一戰|戰死|埋骨/g },
    surprise: { zh: '驚訝', dr: 0.05, dp: 0.07, dv: 0, lv: ['a little startled', 'startled and surprised, quick rising pitch', 'shocked, gasping, pitch jumping up'], re: /驚訝|吃驚|愣住|竟然|居然|怎麼會|不敢相信|大吃一驚|難道|愕然|瞪大|震驚/g },
    longing: { zh: '惆悵思念', dr: -0.08, dp: -0.03, dv: -0.15, lv: ['wistful', 'wistful and longing, soft sighing delivery', 'aching with longing, lingering sighs, fading at line ends'], re: /思念|想念|惆悵|嘆息|遙望|懷念|牽掛|回首|悵然|悠悠|漫漫|何時|相思/g },
    mystery: { zh: '神祕', dr: -0.04, dp: -0.02, dv: -0.3, lv: ['low and secretive', 'mysterious, low, conspiratorial hush', 'eerie, whispering, drawing the listener into the dark'], re: /神秘|詭祕|不為人知|傳說中|暗處|低聲說|悄悄|竊竊私語|謎團|隱約|若隱若現|蹊蹺/g },
    urgent: { zh: '緊迫', dr: 0.08, dp: 0.02, dv: 0, min: 2, lv: ['hurried', 'urgent, hurried and clipped', 'frantic, breathless, racing against time'], re: /快|趕緊|來不及|立刻|馬上|危急|刻不容緩|千鈞一髮|火速|急忙|迫在眉睫|快跑/g },
    action: { zh: '緊湊動作', dr: 0.09, dp: 0.02, dv: 0, min: 2, lv: ['brisk and punchy', 'fast, breathless action pacing, punchy delivery', 'explosive rapid-fire action, thrilling and relentless'], re: /衝|奔|躍|劈|砍|刺|揮|撞|追|逃|飛身|掠|閃|一擊|轟|爆|砰|殺|交手|過招|疾|電光/g },
    carefree: { zh: '灑脫', dr: 0.02, dp: 0.01, dv: 0, lv: ['easygoing and breezy', 'carefree and swaggering, laughing easily', 'wildly free, hearty laughter and sweeping gestures'], re: /灑脫|瀟灑|縱酒|大笑|浪跡|仰天|不羈|逍遙|無拘無束|一笑置之|飲酒|乾杯/g },
    awe: { zh: '壯闊讚嘆', dr: -0.05, dp: -0.02, dv: 0, lv: ['impressed, slow', 'awed and grand, slow and resonant', 'majestic and sweeping, vast and resonant'], re: /壯闊|宏偉|浩瀚|雄偉|巍峨|震撼|萬丈|磅礴|蒼穹|氣勢|天地/g }
  };
  var EMO_ORDER = ['anger', 'fear', 'solemn', 'sad', 'longing', 'tender', 'shy', 'joy', 'surprise', 'pride', 'mock', 'cold', 'resolve', 'mystery', 'urgent', 'action', 'carefree', 'awe'];
  var LV_K = [0.6, 1, 1.5];
  function bangs(t) { return (String(t || '').match(/[!\uFF01]/g) || []).length; }
  function emoOut(k, lvl) { var e = EMOS[k], f = LV_K[lvl - 1]; return { key: k, zh: e.zh, level: lvl, en: e.lv[lvl - 1], dr: Math.round(e.dr * f * 1000) / 1000, dp: Math.round(e.dp * f * 1000) / 1000, dv: Math.round((e.dv || 0) * f * 1000) / 1000 }; }
  function emotionOf(text) {   // 回傳 { key, zh, level(1~3), en, dr, dp, dv } 或 null
    var t = String(text || ''), best = null, sc = 0;
    EMO_ORDER.forEach(function (k) { var e = EMOS[k], d = distinctHits(e.re, t); if (d >= (e.min || 1) && d > sc) { sc = d; best = k; } });
    if (best) {
      var strength = sc + (bangs(t) >= 2 ? 1 : bangs(t) === 1 ? 0.5 : 0) + (INTENS.test(t) ? 1 : 0) + ((t.match(EMOS[best].re) || []).length >= sc + 2 ? 1 : 0);
      return emoOut(best, strength >= 3 ? 3 : strength >= 1.5 ? 2 : 1);
    }
    if (/[?\uFF1F][!\uFF01]|[!\uFF01][?\uFF1F]/.test(t)) return emoOut('surprise', 2);
    if (/[!\uFF01]\s*[\u300D\u300F\u201D"]?\s*$/.test(t)) return { key: 'excited', zh: '激動', level: bangs(t) >= 2 ? 3 : 2, en: bangs(t) >= 2 ? 'wildly excited, shouting with energy, strong emphasis' : 'excited and energetic, strong emphasis', dr: 0.05, dp: 0.04, dv: 0 };
    if (/\u2026\s*[\u300D\u300F\u201D"]?\s*$|\.{3}\s*$/.test(t)) return { key: 'trail', zh: '欲言又止', level: 1, en: 'hesitant, trailing off softly', dr: -0.05, dp: -0.02, dv: -0.1 };
    return null;
  }
  function uniq(a) { var seen = {}; return a.filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; }); }
  // 節奏: 短句連發 = 短促有力; 一句很長 = 一口氣說下去
  function rhythmOf(text) {
    var ss = splitSentences(text), n = ss.length; if (!n) return null;
    var avg = ss.reduce(function (a, q) { return a + q.text.length; }, 0) / n;
    if (n >= 3 && avg <= 9) return { key: 'staccato', zh: '短句連發', en: 'short clipped sentences, punchy staccato rhythm' };
    if (avg >= 36) return { key: 'flow', zh: '長句一氣呵成', en: 'long flowing phrases carried on one breath' };
    return null;
  }
  // 這一小段的語氣: 情緒(分級)+ 對話(「」裡的話要有角色感)+ 節奏 + 故事類型 + 整則貼文的基本語氣; rich(說書人)描述更長、起伏更大
  function toneForChunk(text, genre, baseEn, rich) {
    var emo = emotionOf(text), rh = rhythmOf(text), en = [], zh = [], dr = 0, dp = 0, dv = 0, dia = /[\u300C\u300E\u201C"]/.test(String(text || '')), k = rich ? 1.6 : 1;
    if (emo) { en.push(emo.en); zh.push(emo.zh + (emo.level >= 3 ? '(強烈)' : emo.level === 2 ? '' : '(淡淡的)')); dr += emo.dr * k; dp += emo.dp * k; dv += emo.dv * k; }
    if (dia) { en.push(rich ? 'voice the quoted lines in character, clearly different from the narration' : 'a bit more animated in quoted lines'); zh.push('對話有角色感'); dp += 0.02 * k; }
    if (rh) { en.push(rh.en); zh.push(rh.zh); dr += rh.key === 'staccato' ? 0.04 : -0.02; }
    var changed = !!(emo || dia || rh);
    if (genre) en.push(genre.en);
    if (baseEn) String(baseEn).split(', ').forEach(function (x) { en.push(x); });
    return { style: fitStyle(uniq(en), rich ? 260 : 130), label: zh.join('、'), dr: Math.round(dr * 1000) / 1000, dp: Math.round(dp * 1000) / 1000, dv: Math.round(dv * 1000) / 1000, emotion: emo ? emo.key : '', level: emo ? emo.level : 0, dialogue: dia, rhythm: rh ? rh.key : '', changed: changed };
  }
  // 切段時: 情緒換了、或對話與旁白交替, 就另起一段(每一段的語氣才能乾淨俐落, 不會一段裡混兩種情緒)
  function emoShift(fs, nx) {
    var DIA = /[\u300C\u300E\u201C"]/, last = fs[fs.length - 1].text;
    if (DIA.test(last) !== DIA.test(nx.text)) return true;
    var a = emotionOf(fs.map(function (q) { return q.text; }).join('')), b = emotionOf(nx.text);
    return !!(a && b && a.key !== b.key);
  }
  // 笑聲、咳嗽: 轉成 Gemini 的表情標籤(<laugh>、<cough>), 比照字面念「哈哈」更像真的笑
  function laughTags(t) { return String(t == null ? '' : t).replace(/(?:哈哈+|嘻嘻+|呵呵+|嘿嘿+)/g, '<laugh> ').replace(/咳咳+/g, '<cough> '); }
  // 說書人的戲劇停頓: 刪節號、破折號後停一拍; 旁白轉到對話(「」)前停一拍
  function richPauses(t, notFirst) { t = String(t == null ? '' : t); if (notFirst && /^[\u300C\u300E]/.test(t)) t = '<short pause>' + t; return t.replace(/(\u2026\u2026|\u2014\u2014)(?!<)/g, '$1<short pause>').replace(/([\u3002!?\uFF01\uFF1F])([\u300C\u300E])/g, '$1<short pause>$2'); }
  // 說書人的開場與收場(只在「朗讀內容」且內容像故事時加; 朗讀列有開關)
  function flourishChunks(genre, srcLen) {
    if (!genre || !genre.open) return null;
    return { open: { text: genre.open, start: 0, end: 0, title: true, extra: true }, close: { text: genre.close, start: srcLen + 1e9, end: srcLen + 1e9 + 1, title: true, extra: true } };
  }

  /* ---------- 瀏覽器聲音(不用金鑰、不耗額度): 盡量做得和 AI 人聲一樣 ----------
   * 做法: 和 AI 人聲用同一套人設、同一套「自動語氣」; 逐句、逐分句念, 每一小段依語氣調整語速與音高(句首稍高、句尾下降、問句尾音上揚、驚嘆加強),
   * 標點與段落之間停頓, 說書人用更大的起伏. 瀏覽器聲音沒有「語氣描述」可以送, 所以用語速、音高、停頓來模擬. */
  function synth() { return H.synth || global.speechSynthesis || null; }
  function Utter(t) { return H.Utter ? new H.Utter(t) : new global.SpeechSynthesisUtterance(t); }
  var MALE_RE = /zhiwei|danny|kangkang|yunjhe|yunxi|yunyang|yunjian|yunhao|ichiro|\bmale\b|\u7537/i;
  var TW_RE = /zh[-_]TW|zh[-_]Hant[-_]TW|Taiwan|\u81fa\u7063|\u53f0\u7063/i, NOT_TW_RE = /zh[-_]HK|zh[-_]CN|zh[-_]SG|yue|cantonese|Hong\s*Kong|Mainland|China|tracy|\u7ca4|\u9999\u6e2f|\u666e\u901a\u8bdd|\u666e\u901a\u8a71|\u4e2d\u56fd|\u4e2d\u570b|\u5927\u9678/i;
  function twVoices() {   // 台灣國語的聲音(男女都列, 依品質排序); 完全沒有台灣聲音才退而求其次用其他中文聲音
    var s = synth(), list = [];
    try { list = s && s.getVoices ? s.getVoices() : []; } catch (e) {}
    var zh = list.filter(function (v) { return /^zh/i.test(v.lang || '') || /chinese|\u570b\u8a9e|\u4e2d\u6587|\u83ef\u8a9e|\u81fa\u7063|\u53f0\u7063/i.test(v.name || ''); });
    var tw = zh.filter(function (v) { return TW_RE.test((v.lang || '') + ' ' + (v.name || '')); });
    if (!tw.length) tw = zh.filter(function (v) { return !NOT_TW_RE.test((v.lang || '') + ' ' + (v.name || '')); });
    if (!tw.length) tw = zh;
    function score(v) { var n = String(v.name || ''), l = String(v.lang || ''); return (/zh[-_]TW|zh[-_]Hant/i.test(l) ? 100 : 0) + (/natural|online/i.test(n) ? 30 : 0) + (v.localService ? 0 : 1); }
    return tw.slice().sort(function (a, b) { return score(b) - score(a); });
  }
  var BR_SLOT = { p2: 0, p5: 0, p7: 0, p3: 1, p1: 1, p6: 1, p4: 2, p8: 2, p9: 0 };
  function brParams(pid) {   // { voice, rate, pitch }: 挑哪個瀏覽器聲音, 以及這個人設的基本語速與音高
    var b = BR[pid] || BR.p2, all = twVoices(), male = all.filter(function (v) { return MALE_RE.test(v.name || ''); }), fem = all.filter(function (v) { return !MALE_RE.test(v.name || ''); });
    var pool = b.male ? (male.length ? male : fem) : (fem.length ? fem : all), v = null;
    if (b.prefer) v = pool.filter(function (x) { return b.prefer.test(x.name || ''); })[0] || null;
    if (!v && pool.length) v = pool[(BR_SLOT[pid] || 0) % pool.length];
    var isMale = !!(v && MALE_RE.test(v.name || '')), pitch = b.pitch;
    if (b.male) pitch = isMale ? 0.9 : 0.78; else if (isMale) pitch = Math.min(1.3, pitch + 0.2);   // 說書人沒有男聲就把女聲壓低; 其他人設只有男聲時把音高提高一點
    return { voice: v, rate: b.rate, pitch: pitch };
  }
  // 瀏覽器念不出「表情標記」, 用接近的字代替
  function exprBrowser(t) {
    return String(t == null ? '' : t).replace(EXPR_RE, function (m, name) {
      var tag = exprTag(name); if (!tag) return m;
      return /laugh/.test(tag) ? '哈哈, ' : /cough/.test(tag) ? '咳咳, ' : /sigh/.test(tag) ? '唉, ' : /long pause/.test(tag) ? '\u2026\u2026 ' : ', ';
    });
  }
  // 把一個小段拆成「分句」(逗號分開), 每個分句各自設語速/音高/停頓; c = { text, dr, dp, rich, par }
  function browserUnits(c, baseRate) {
    var sents = splitSentences(exprBrowser(forSpeech(c.speak || c.text))), out = [], k = c.rich ? 2 : 1;
    if (!sents.length) sents = [{ text: exprBrowser(forSpeech(c.text)) }];
    sents.forEach(function (sn, si) {
      var parts = String(sn.text).match(/[^,;:\u3001\uFF0C\uFF1B\uFF1A]+[,;:\u3001\uFF0C\uFF1B\uFF1A]*/g) || [sn.text], q = /[?\uFF1F]\s*[\u300D\u300F\u201D"]?$/.test(sn.text), ex = /[!\uFF01]\s*[\u300D\u300F\u201D"]?$/.test(sn.text), trail = /\u2026\s*[\u300D\u300F\u201D"]?$/.test(sn.text);
      parts.forEach(function (p, j) {
        var last = j === parts.length - 1, dr = c.dr || 0, dp = c.dp || 0;
        if (j === 0) dp += 0.03 * k; if (last) { dp -= 0.04 * k; dr -= 0.03 * k; }   // 句首稍高、句尾下降變慢
        if (last && q) { dp += 0.11 * k; dr += 0.01; }   // 問句: 尾音上揚
        if (last && ex) { dp += 0.08 * k; dr += 0.06 * k; }   // 驚嘆: 加強
        var gap;
        if (!last) gap = /[,\uFF0C]$/.test(p) ? 150 : /[\u3001]$/.test(p) ? 90 : 230;
        else gap = trail ? 650 : /[\u3002.]$/.test(p) ? 420 : (q || ex) ? 380 : 340;
        if (last && si === sents.length - 1 && c.par) gap += 380;   // 段落之間多停一下
        out.push({ text: p, dr: dr, dp: dp, dv: c.dv || 0, gap: Math.round(gap / Math.max(0.6, baseRate || 1) * (H.gapScale == null ? 1 : H.gapScale)) });
      });
    });
    return out;
  }
  // AI 人聲的逐字稿:在轉折詞前加 <short pause>(Gemini 的英文標籤,中文逐字稿也用英文標籤)
  function withPauses(t) { return t.replace(/([^\s\u3002!?,;\u3001\uFF0C\uFF01\uFF1F\uFF1B])(但是|可是|不過|然而)/g, '$1<short pause>$2').replace(/([,\u3001\uFF0C])(但是|可是|不過|然而)/g, '$1<short pause>$2'); }

  // 說話方式(speech_metadata.style): 一般人設只送「這則貼文的語氣」(短短一句英文), 保留各人設原本的聲音特色; 只有「仿曉臻/仿 TTSMaker」這類有自己 style 的人設, 才在前面加上它的說話方式
  function styleFor(personaId, toneStyle) { var ps = personaStyle(personaId); return ps ? ps + (toneStyle ? ' Tone: ' + toneStyle : '') : (toneStyle || ''); }
  // 這台電腦存的「Gemini 金鑰」(設定中心 AI 設定頁第一張卡, 存在瀏覽器 localStorage kb_ai_key): 伺服器沒有金鑰時, 老師自己的瀏覽器改用它直接向 Google 合成.
  // 只有存了金鑰的那台電腦聽得到; 學生要聽, 還是要在雲端(或 Vercel 環境變數)存金鑰.
  function localKey() { try { return String(global.localStorage.getItem('kb_ai_key') || '').trim(); } catch (e) { return ''; } }
  var GEM = 'https://generativelanguage.googleapis.com/v1beta/', TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
// 額度用完(HTTP 429)時, 給學生看得懂的說明. raw = Google 回的原始說明(含「Free Tier」「per day」「Please retry in 16h7m20s」這類字樣); 沒有就用一般說法
  function quotaMessage(raw) {
    var d = String(raw == null ? '' : raw), free = /free.?tier/i.test(d), perMin = /per.?minute/i.test(d) && !/per.?day/i.test(d);
    var m = /retry in\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i.exec(d); var wait = '';
    if (m && (m[1] || m[2] || m[3])) { var h = +m[1] || 0, mi = +m[2] || 0, s = Math.ceil(+m[3] || 0); wait = h ? '約 ' + (h + (mi >= 30 ? 1 : 0)) + ' 小時後' : mi ? '約 ' + (mi + (s > 0 ? 1 : 0)) + ' 分鐘後' : '約 ' + Math.max(1, s) + ' 秒後'; }
    if (perMin) return '現在同時合成語音的人太多了(Gemini 每分鐘有次數限制),請等' + (wait ? wait.replace(/後$/, '') : '一分鐘') + '再試。聽過的內容仍可重複播放。';
    return '今天的語音額度用完了' + (free ? '。因為目前使用的是免費版的 Gemini API 金鑰,每天能合成的次數很少' : '(已超過目前 Gemini 方案的語音上限)') + '。' + (wait ? wait + '會恢復; ' : '') + '請明天再試,或請老師在 Google AI Studio 開啟計費(升級付費)。聽過的內容仍可重複播放。';
  }
  function upMsg(st, raw) { return st === 400 ? '這段文字或這個聲音,語音模型不接受。' : (st === 401 || st === 403) ? '語音服務拒絕了這把金鑰(請確認金鑰可以使用語音功能)。' : st === 404 ? '找不到這個語音模型或聲音。' : st === 429 ? quotaMessage(raw) : '語音服務暫時無法使用,請稍後再試。'; }
  function cleanDetail(m) { return String(m == null ? '' : m).replace(/(?:AIza|AQ\.)[0-9A-Za-z_.\-]{20,}/g, '***').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220); }
  function failFrom(r) { return r.json().catch(function () { return null; }).then(function (j) { var raw = j && j.error && j.error.message, d = cleanDetail(raw), e = new Error(upMsg(r.status, raw) + (d && r.status !== 429 ? ' (Google 說: ' + d + ')' : '')); e.status = r.status; e.direct = true; throw e; }); }
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
    var st = String(style == null ? '' : style).replace(/[\u0000-\u001f\u007f<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800), part = { text: String(text) };
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
    var self = this; this.o = o; this.i = o.from || 0; this.state = 'idle'; this.token = 0; this.audio = null; this.pre = {}; this.engine = o.engine === 'browser' ? 'browser' : 'ai'; this.gapT = null;
    function set(s) { self.state = s; if (o.onState) o.onState(s); }
    function say(m) { if (o.onNote) o.onNote(m); }
    function done() { set('idle'); if (o.onChunk) o.onChunk(-1); }
    function clearGap() { if (self.gapT) { clearTimeout(self.gapT); self.gapT = null; } }
    function fail(err, tok) {
      if (tok !== self.token) return; clearWait();
      if (self.engine === 'ai' && o.onAiFail) { var h = false; try { h = o.onAiFail(err, self.i); } catch (e) {} if (h) return; }   // AI 人聲出問題(額度用完等): 讓朗讀列改用瀏覽器聲音接著念
      say((err && err.status === 429 ? '' : '朗讀失敗: ') + (err && err.message || '請稍後再試')); done();   // 額度用完(429)不是壞掉, 直接顯示說明
    }
    function clipFor(i) {
      if (self.pre[i]) return self.pre[i];
      var c = o.chunks[i]; if (!c) return null;
      var script = laughTags(exprText(forSpeech(c.speak || c.text))); if (c.rich) script = richPauses(script, i > 0);
      return (self.pre[i] = aiClip(withPauses(script), o.voice, c.style || o.style, o.model));
    }
    var AHEAD = 3;   // 播這一段時, 同時先把後面 3 段準備好(不然每一段都要等合成, 聲音就會斷斷續續)
    var waitT = null;
    function clearWait() { if (waitT) { clearTimeout(waitT); waitT = null; } if (self.waiting) { self.waiting = false; say(''); } }
    function speakAi(c, tok) {
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
    // 瀏覽器聲音: 一句一句、一個分句一個分句念; 每個分句依語氣調整語速與音高, 分句之間依標點停頓(和 AI 人聲同一套人設與語氣)
    function speakBrowser(c, tok) {
      var s = synth(); if (!s) { say('這個瀏覽器不支援朗讀。'); return done(); }
      var br = o.br || {}, units = browserUnits(c, o.rate), k = 0;
      function next() {
        if (tok !== self.token || self.state !== 'playing') return;
        if (k >= units.length) { self.i++; run(tok); return; }
        var un = units[k++], u = Utter(un.text), v = br.voice;
        if (v) { u.voice = v; u.lang = v.lang || 'zh-TW'; } else u.lang = 'zh-TW';
        u.rate = Math.max(0.5, Math.min(2, (o.rate || 1) * (br.rate || 1) * (1 + un.dr)));
        var pt = Math.max(0.1, Math.min(2, (br.pitch || 1) + un.dp)); if (Math.abs(pt - 1) > 0.005) u.pitch = pt;
        if (un.dv) u.volume = Math.max(0.25, Math.min(1, 1 + un.dv));   // 耳語、低沉的地方小聲一點(大聲的地方維持最大)
        var finished = false, wd = null;
        function ended() { if (finished) return; finished = true; if (wd) { clearTimeout(wd); wd = null; } if (tok !== self.token || self.state !== 'playing') return; clearGap(); self.gapT = setTimeout(function () { self.gapT = null; next(); }, un.gap); }
        u.onend = ended;
        u.onerror = function (e) { if (tok !== self.token) return; if (e && (e.error === 'interrupted' || e.error === 'canceled')) return; if (wd) { clearTimeout(wd); wd = null; } finished = true; say('朗讀失敗: ' + (e && e.error || '瀏覽器聲音無法播放')); done(); };
        self.u = u;   // 留著參照: Chrome 會把沒人參照的語音物件回收掉, onend 就永遠不會來
        wd = setTimeout(function () { if (finished || tok !== self.token) return; try { s.cancel(); } catch (e) {} ended(); }, Math.round(un.text.length * 450 / Math.max(0.5, u.rate || 1)) + 5000);   // 保險: 有些瀏覽器的 onend 不會來, 超過預估時間就接著念下一個
        s.speak(u);
      }
      next();
    }
    function run(tok) {
      if (tok !== self.token || self.state !== 'playing') return;
      if (self.i >= o.chunks.length) return done();
      var c = o.chunks[self.i]; if (o.onChunk) o.onChunk(self.i, c);
      if (self.engine === 'browser') speakBrowser(c, tok); else speakAi(c, tok);
    }
    function cancelBrowser() { var s = synth(); if (s && s.cancel) { try { s.cancel(); } catch (e) {} } }
    this.play = function () { if (self.state === 'playing') return; self.token++; self.i = self.state === 'paused' ? self.i : (o.from || 0); set('playing'); run(self.token); };
    this.pause = function () {
      if (self.state !== 'playing') return; set('paused'); self.token++; clearWait(); clearGap();
      if (self.audio) { try { self.audio.pause(); } catch (e) {} }
      if (self.engine === 'browser') cancelBrowser();
    };
    this.resume = function () {
      if (self.state !== 'paused') return; set('playing'); var tok = ++self.token;
      if (self.engine === 'ai' && self.audio && !self.audio.ended && self.audio.currentTime > 0) { var a = self.audio; a.onended = function () { if (tok === self.token && self.state === 'playing') { self.i++; run(tok); } }; var p = a.play(); if (p && p.catch) p.catch(function () { run(tok); }); }
      else run(tok);   // 瀏覽器聲音: 從這一句開頭再念(句子都不長)
    };
    this.stop = function () {
      if (self.state === 'idle') return; self.token++; clearWait(); clearGap(); set('idle');
      if (self.audio) { try { self.audio.pause(); } catch (e) {} self.audio = null; }
      if (self.engine === 'browser') cancelBrowser();
      if (o.onChunk) o.onChunk(-1);
    };
    // 目前讀到哪: 第幾段, 以及這一段播了幾成(只有 AI 人聲知道; 用來換聲音時從差不多的地方接著念)
    this.position = function () {
      var f = 0, a = self.audio;
      if (self.engine === 'ai' && a && a.duration > 0 && isFinite(a.duration)) f = Math.max(0, Math.min(1, (a.currentTime || 0) / a.duration));
      return { i: self.i, frac: f, engine: self.engine };
    };
    this.setRate = function (r) { o.rate = r; if (self.audio) { try { self.audio.playbackRate = Math.max(0.5, Math.min(2, r)); } catch (e) {} } };   // 改速度: 不用重頭, 馬上套用到正在播的和後面的
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
    return setHighlightC(el, compactIndex(text, start), compactIndex(text, end) - 1);
  }
  function setHighlightC(el, a, b) {   // a、b = 第幾個「非空白字」(從 0 算, b 含)
    var hl = global.CSS && global.CSS.highlights && global.Highlight; if (!hl) return false;
    var map = el ? textMap(el) : [];
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
      '.kbt label[hidden]{display:none}.kbt select{min-height:44px;padding:6px 10px;border-radius:12px;border:2px solid #c7d2fe;background:#fff;font-size:14px;max-width:100%}.kbt label{display:inline-flex;align-items:center;gap:6px;font-size:14px;min-height:44px;cursor:pointer}' +
      '.kbt-info{font-size:12.5px;color:#4b5563;margin-top:6px;line-height:1.6}.kbt-cap{font-size:15px;color:#1e1b4b;margin-top:6px;min-height:0;font-weight:700;line-height:1.6}.kbt-cap:empty{display:none}.kbt-note{font-size:12.5px;color:#b45309;margin-top:4px}.kbt-note:empty{display:none}' +
      '::highlight(kb-tts){background-color:#fde68a;color:#111827}' +
      '.kbt-sel{position:fixed;z-index:2000;display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:calc(100vw - 16px);padding:8px;border-radius:16px;background:#1e1b4b;box-shadow:0 8px 24px rgba(0,0,0,.35)}.kbt-sel[hidden]{display:none}' +
      '.kbt-sel .kbt-btn{min-height:44px;border-color:#fff;background:#4f46e5;color:#fff}.kbt-sel .kbt-btn.alt{background:#fff;color:#1e1b4b;border-color:#fff}.kbt-sel .kbt-btn[hidden]{display:none}.kbt-sel-note{flex-basis:100%;font-size:12.5px;color:#fde68a;line-height:1.5}.kbt-sel-note:empty{display:none}';
    (doc.head || doc.documentElement).appendChild(s);
  }
  var cur = null;   // 目前這個畫面上的朗讀列(同時只會有一個在讀)
  var aiCool = 0;   // 最近一次 AI 人聲出問題(額度用完等)的時間: 30 分鐘內開新的貼文, 先用瀏覽器聲音, 不再一直撞牆
  var selCleanup = null;   // 「播放選取內容」浮動列的收尾(拿掉浮動列和監聽); 關閉貼文或重新載入貼文時才呼叫
  function stop(keepSel) { if (cur) cur.stop(); clearHighlight(); if (keepSel !== true && selCleanup) selCleanup(); }

  // 切成一段一段的朗讀單位. 三顆按鈕各讀一部分:
  //  part='title': 「類型。標題。」(例如「提問。空氣裡的一粒灰塵。」); part='body': 下方的內文.
  // 為了「流暢自然」, 內文的段落要夠長(句子之間不要每句都停頓重新開口):
  //  由短到長: 第 1 段約 50 字內(最快開始播)、第 2 段約 100 字、第 3 段約 200 字、之後每段最多 300 字. 播前一段的時候, 後一段正好合成好, 不用等.
  var LIMITS = [50, 100, 200], LIMITS_RICH = [50, 100, 160];   // 說書人切得比較短(每一小段各有自己的情緒, 變化更細)
  // opt = { sentence: 一句一段(瀏覽器聲音用: 每句各自調語速音高), rich: 說書人 }
  function chunksFor(pst, part, lead, progressive, opt) {
    opt = opt || {};
    var out = [];
    if (part === 'title') {
      var intro = forSpeech((lead || '') + (TYPE_ZH[pst.type] ? TYPE_ZH[pst.type] + '。' : '') + (pst.title ? pst.title + '。' : ''));
      if (intro) out.push({ text: intro, start: 0, end: 0, title: true });
      return out;
    }
    var src = String(pst.content == null ? '' : pst.content), rest = splitSentences(src), lims = opt.rich ? LIMITS_RICH : LIMITS, dflt = opt.rich ? 220 : 300;
    while (rest.length) {
      var lim = (progressive !== false && lims[out.length] !== undefined) ? lims[out.length] : dflt, fs = [], len = 0;
      if (opt.sentence) fs.push(rest.shift());
      else while (rest.length && (!fs.length || len + rest[0].text.length <= lim)) { if (opt.emo && fs.length && len >= (opt.rich ? 18 : 36) && emoShift(fs, rest[0])) break; var x = rest.shift(); fs.push(x); len += x.text.length; }
      var ck = { text: fs.map(function (q) { return q.text; }).join('').slice(0, 600), start: fs[0].start, end: fs[fs.length - 1].end, n: fs.length };
      if (opt.sentence) ck.par = rest.length > 0 && /\n/.test(src.slice(fs[fs.length - 1].end, rest[0].start));   // 這句後面是換行(段落)
      out.push(ck);
    }
    return out;
  }
  // 其他同學的回應(最下面那顆鈕): 依時間順序一則一則讀, 每則「第 N 則回應。類型。標題。內文」; 不唸姓名(姓名不送到 Google)
  function replyChunks(list, autoTone, pid, sent) {
    var out = [];
    list.forEach(function (r, i) {
      var rp = { type: r.type, title: r.title || '', content: r.content || '' }, lead = '第' + (i + 1) + '則回應。';
      var tc = chunksFor(rp, 'title', lead), bc = chunksFor(rp, 'body', '', i === 0, { sentence: !!sent }), cs;
      if (tc.length && bc.length && !sent) { bc[0].text = tc[0].text + bc[0].text; cs = bc; }   // 標題和內文第一段一起合成, 更連貫
      else cs = tc.concat(bc);
      var st = autoTone ? styleFor(pid, analyze(rp).style) : null;
      cs.forEach(function (c) { c.noHl = true; c.reply = i + 1; if (st) c.style = st; out.push(c); });
    });
    return out;
  }

  // 換聲音、換語氣、換語音來源時「接著讀」: pos = { reply, off(原文的第幾個字) }; 在新的段落清單裡找到包含這個位置的段, 並從這一句開頭讀起(已經讀完的不再重讀)
  // srcOf(chunk) = 這一段來自哪段原文(用來把一段切成句子)
  function resumeAt(chunks, pos, srcOf) {
    var i = 0;
    for (; i < chunks.length; i++) { var c = chunks[i], r = c.reply || 0; if (r > pos.reply || (r === pos.reply && ((c.title && pos.off <= 0) || c.end > pos.off))) break; }
    if (i >= chunks.length) return { chunks: chunks, from: chunks.length };
    var c2 = chunks[i], src = srcOf ? srcOf(c2) : '';
    if (!c2.title && src && c2.start < pos.off && c2.end > c2.start) {
      var ss = splitSentences(src.slice(c2.start, c2.end)), k = 0, j;
      for (j = 0; j < ss.length; j++) if (c2.start + ss[j].start <= pos.off) k = j;
      if (k > 0) { var nc = {}, key; for (key in c2) nc[key] = c2[key]; nc.text = ss.slice(k).map(function (q) { return q.text; }).join(''); nc.start = c2.start + ss[k].start; nc.n = ss.length - k; chunks = chunks.slice(); chunks[i] = nc; }
    }
    return { chunks: chunks, from: i };
  }

  // ctx = { getPost(): { type, title, content }, titleHost(選配: 放「朗讀標題」鈕的位置, 通常在標題旁), repliesHost(選配: 放「朗讀全部回應」鈕的位置, 通常在最下方), getReplies(): [{ type, title, content }](選配: 其他人的回應), contentEl }
  // 只有老師在設定中心(AI 設定)開啟「貼文朗讀」才會出現; 沒開就整個不顯示.
  function mount(host, ctx) {
    if (!host) return null; css(); stop(); host.innerHTML = '';
    if (ctx.titleHost) ctx.titleHost.innerHTML = ''; if (ctx.repliesHost) ctx.repliesHost.innerHTML = '';
    var c0 = cfg(); if (!(c0.ai && c0.ai.enabled)) { host.style.display = 'none'; return null; }
    host.style.display = '';
    var prefs = loadPrefs(), reader = null, mode = 'body', curPlan = null, aiOk = false, engAuto = false;   // engAuto: 語音來源是自動切換的(不是使用者自己選的), 不存成偏好
    host.innerHTML = '<div class="kbt" role="group" aria-label="朗讀這則貼文"><div class="kbt-row"><button type="button" class="kbt-btn" data-k="play" aria-label="朗讀內容">🔊 朗讀內容</button><button type="button" class="kbt-btn alt" data-k="stop" hidden aria-label="停止朗讀">⏹ 停止</button>' +
      '<select data-k="engine" aria-label="語音來源"><option value="ai">AI 人聲(較自然)</option><option value="browser">瀏覽器語音(免費、不耗額度)</option></select><select data-k="voice" aria-label="選擇聲音">' + PERSONAS.map(function (p) { return '<option value="ai:' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</select><select data-k="rate" aria-label="朗讀速度"><option value="0.8">慢一點</option><option value="0.9">稍慢(預設)</option><option value="1">正常</option><option value="1.15">稍快</option><option value="1.3">快</option></select>' +
      '<select data-k="tone" aria-label="語氣"><option value="auto">語氣:自動判斷</option>' + STYLES.map(function (x) { return '<option value="' + x.id + '">' + esc(x.zh) + '</option>'; }).join('') + '</select><label><input type="checkbox" data-k="auto" checked> 自動語氣</label><label data-k="flourL" hidden><input type="checkbox" data-k="flour" checked> 說書開場與收場</label></div><div class="kbt-info" data-k="info"></div><div class="kbt-cap" data-k="cap" aria-live="polite"></div><div class="kbt-note" data-k="note" role="status"></div></div>';
    var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
    var tb = doc.createElement('button'); tb.type = 'button'; tb.className = 'kbt-btn kbt-title'; tb.setAttribute('data-k', 'playt'); tb.setAttribute('aria-label', '朗讀類型與標題'); tb.textContent = '🔊 朗讀標題';
    var rb = doc.createElement('button'); rb.type = 'button'; rb.className = 'kbt-btn kbt-replies'; rb.setAttribute('data-k', 'playr'); rb.setAttribute('aria-label', '朗讀其他人的全部回應'); rb.textContent = '🔊 朗讀全部回應(0)';
    if (ctx.repliesHost) { ctx.repliesHost.style.display = ''; ctx.repliesHost.appendChild(rb); } else host.querySelector('.kbt-row').appendChild(rb);
    if (ctx.titleHost) { ctx.titleHost.style.display = ''; ctx.titleHost.appendChild(tb); } else { var rowEl = host.querySelector('.kbt-row'); rowEl.insertBefore(tb, rowEl.firstChild); }
    var play = $('play'), playt = tb, playr = rb, stopB = $('stop'), eng = $('engine'), vs = $('voice'), rs = $('rate'), au = $('auto'), fl = $('flour'), flL = $('flourL'), tn = $('tone'), info = $('info'), cap = $('cap'), note = $('note');
    rs.value = prefs.rate || '0.9'; if (prefs.tone && tn.querySelector('option[value="' + prefs.tone + '"]')) tn.value = prefs.tone;
    au.checked = prefs.auto !== false; fl.checked = prefs.flour !== false;
    eng.value = prefs.engine === 'browser' || Date.now() - aiCool < 1800000 ? 'browser' : 'ai';
    if (!synth()) eng.querySelector('option[value="browser"]').disabled = true;
    vs.value = prefs.voice && vs.querySelector('option[value="' + String(prefs.voice).replace(/"/g, '') + '"]') ? prefs.voice : 'ai:p2';   // 以前存過瀏覽器聲音的人, 換成預設的 AI 人聲
    function preset() { return STYLES.filter(function (x) { return x.id === tn.value; })[0] || null; }
    function post() { var p = ctx.getPost() || {}; return { type: p.type, title: p.title || '', content: p.content || '' }; }
    function replies() { try { var l = ctx.getReplies && ctx.getReplies(); return Array.isArray(l) ? l.filter(function (r) { return r && (String(r.content || '').trim() || String(r.title || '').trim()); }) : []; } catch (e) { return []; } }
    function showInfo() {
      flL.hidden = vs.value !== 'ai:p9';
      var t = analyze(post()), pr = preset(), pdef = PERSONAS.filter(function (x) { return x.id === vs.value.replace(/^ai:/, ''); })[0] || {};
      info.textContent = (pr ? '語氣(手動選擇): ' + pr.zh : au.checked ? '語氣(依這則貼文自動判斷): ' + t.label + (pdef.rich ? '; 說書人會每一小段依情節與情緒再變化' : '; 每一小段也會依自己的情緒、對話再微調') : '語氣: 自然、清楚(已關閉自動語氣)') + (eng.value === 'browser' ? ' ‧ 瀏覽器語音: 用語速、音高和停頓模擬語氣' : '');
      info.title = pr ? '' : au.checked ? t.reasons.join(', ') : '';
    }
    // 把「這顆鈕要讀的內容」整理成要合成的段落與設定(按下播放和事先準備都用它)
    function plan(m, useRead) {
      var md = m === 'title' ? 'title' : m === 'replies' ? 'replies' : m === 'sel' ? 'sel' : 'body', pst = post(), rl = md === 'replies' ? replies() : [];
      if (md === 'sel') pst = { type: pst.type, title: '', content: useRead && sel.read ? sel.read.text : sel.text };   // 只讀使用者圈起來的那一段
      var personaId = vs.value.replace(/^ai:/, ''), pr = preset(), isBr = eng.value === 'browser', pdef = PERSONAS.filter(function (x) { return x.id === personaId; })[0] || {}, rich = !!pdef.rich;
      var tone = pr ? { style: pr.en } : au.checked && md !== 'replies' ? analyze(pst) : { style: '' };
      var chunks = md === 'replies' ? replyChunks(rl, au.checked && !pr, personaId, isBr) : chunksFor(pst, md === 'sel' ? 'body' : md, '', true, { sentence: isBr, rich: rich && !isBr, emo: au.checked && !pr && !isBr });
      if ((md === 'body' || md === 'sel') && au.checked && !pr) {   // 每一小段依自己的情緒、對話、故事類型調整語氣(AI 人聲送語氣描述; 瀏覽器聲音調語速與音高)
        var genre = genreOf(pst.content);
        chunks.forEach(function (c) { var t = toneForChunk(c.text, genre, tone.style, rich); c.dr = t.dr; c.dp = t.dp; c.dv = t.dv; c.rich = rich; c.label = t.label; if (t.changed) c.style = styleFor(personaId, t.style); });
        var fo = md === 'body' && rich && fl.checked ? flourishChunks(genre, pst.content.length) : null;   // 說書人: 故事前面加開場、後面加收場
        if (fo) { [fo.open, fo.close].forEach(function (c) { c.rich = true; c.dr = 0; c.dp = 0; c.style = styleFor(personaId, fitStyle(uniq([genre.en, 'a showman\'s flourish, theatrical and inviting']), 260)); }); chunks = [fo.open].concat(chunks, [fo.close]); }
      } else if (rich) chunks.forEach(function (c) { c.rich = true; });
      return { mode: md, pst: pst, rl: rl, personaId: personaId, pr: pr, chunks: chunks, voice: personaVoice(personaId), style: styleFor(personaId, tone.style), model: (cfg().ai && cfg().ai.model) || undefined, engine: isBr ? 'browser' : 'ai', br: isBr ? brParams(personaId) : null };
    }
    /* ---- 圈選內文 → 浮動「播放選取內容」列(播放/暫停/停止) ---- */
    var sel = { text: '', base: 0, range: null, read: null, press: 0, off: true, timer: null, bar: null, onSel: null, onPos: null };   // off: 還沒確定能用 AI 人聲之前先不顯示
    function selNote(m2) { if (sel.bar) { var n = sel.bar.querySelector('.kbt-sel-note'); if (n) n.textContent = m2 || ''; } }
    function selRead() {   // 目前選取的範圍(只認落在這則貼文內文裡的); 回傳 { text, base(第幾個非空白字開始), range } 或 null
      try {
        var s = doc.getSelection ? doc.getSelection() : null, el = ctx.contentEl;
        if (!s || !el || s.rangeCount < 1 || s.isCollapsed) return null;
        var r = s.getRangeAt(0); if (!el.contains(r.commonAncestorContainer)) return null;
        var t = r.toString().replace(/^\s+|\s+$/g, ''); if (!t) return null;
        var map = textMap(el), a = -1;
        for (var i = 0; i < map.length; i++) { if (r.comparePoint(map[i].n, map[i].o) >= 0) { a = i; break; } }
        if (a < 0) return null;
        return { text: t.slice(0, 4000), base: a, range: r.cloneRange() };
      } catch (e) { return null; }
    }
    function selActive() { return !!(reader && reader.state !== 'idle' && mode === 'sel' && sel.read && sel.read.text === sel.text && sel.read.base === sel.base); }
    function selLabels() {
      var b = sel.bar; if (!b) return; var pb = b.querySelector('[data-s="play"]'), sb = b.querySelector('[data-s="stop"]'), st = selActive() ? reader.state : 'idle';
      pb.textContent = st === 'playing' ? '⏸ 暫停' : st === 'paused' ? '▶ 繼續' : '🔊 播放選取內容';
      pb.setAttribute('aria-label', st === 'playing' ? '暫停朗讀選取內容' : st === 'paused' ? '繼續朗讀選取內容' : '播放選取內容');
      sb.hidden = !(reader && reader.state !== 'idle' && mode === 'sel');
      selPlace();
    }
    function selPlace() {
      var b = sel.bar; if (!b || b.hidden) return;
      var vw = global.innerWidth || 360, vh = global.innerHeight || 640, coarse = false;
      try { coarse = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches); } catch (e) {}
      var rects = null; try { rects = sel.range && sel.range.getClientRects(); } catch (e) {}
      if (coarse || !rects || !rects.length) {   // 手機: 手指和系統的選取選單會蓋住選取處, 所以固定放在畫面下方中間
        b.style.left = '50%'; b.style.top = 'auto'; b.style.bottom = 'calc(16px + env(safe-area-inset-bottom, 0px))'; b.style.transform = 'translateX(-50%)'; return;
      }
      var last = rects[rects.length - 1], first = rects[0], w = b.offsetWidth || 260, h = b.offsetHeight || 60;
      var top = last.bottom + 8; if (top + h > vh - 8) top = Math.max(8, first.top - h - 8);
      b.style.transform = ''; b.style.bottom = 'auto'; b.style.top = Math.round(Math.min(Math.max(top, 8), vh - h - 8)) + 'px'; b.style.left = Math.round(Math.min(Math.max(last.left, 8), Math.max(8, vw - w - 8))) + 'px';
    }
    function selBuild() {
      if (sel.bar) return sel.bar;
      var b = doc.createElement('div'); b.className = 'kbt-sel'; b.hidden = true; b.setAttribute('role', 'toolbar'); b.setAttribute('aria-label', '朗讀選取的內容');
      b.innerHTML = '<button type="button" class="kbt-btn" data-s="play">🔊 播放選取內容</button><button type="button" class="kbt-btn alt" data-s="stop" hidden aria-label="停止朗讀選取內容">⏹ 停止</button><div class="kbt-sel-note" role="status"></div>';
      ['mousedown', 'touchstart', 'pointerdown'].forEach(function (ev) { b.addEventListener(ev, function (e) { sel.press = Date.now(); if (ev === 'mousedown') e.preventDefault(); }, { passive: ev !== 'mousedown' }); });   // 按浮動列時不要讓選取消失
      b.querySelector('[data-s="play"]').onclick = function () { if (selActive()) { if (reader.state === 'playing') reader.pause(); else reader.resume(); } else start('sel'); };
      b.querySelector('[data-s="stop"]').onclick = function () { if (reader) reader.stop(); };
      ['mouseenter', 'focus', 'touchstart'].forEach(function (ev) { b.querySelector('[data-s="play"]').addEventListener(ev, function () { if (sel.text && !selActive()) warm('sel'); }, { passive: true }); });   // 還沒按下去就先合成第一段
      (doc.body || doc.documentElement).appendChild(b); sel.bar = b; return b;
    }
    function selHide() { if (sel.bar) sel.bar.hidden = true; }
    function selUpdate() {
      if (sel.off) return;
      var v = selRead();
      if (v) { sel.text = v.text; sel.base = v.base; sel.range = v.range; var b = selBuild(); b.hidden = false; selLabels(); selPlace(); return; }
      if (Date.now() - sel.press < 1500) return;   // 剛按過浮動列(手機點按鈕時選取可能先消失), 先不要收起來
      if (reader && reader.state !== 'idle' && mode === 'sel') return;   // 正在讀的時候, 選取消失也要留著停止/暫停鈕
      selHide();
    }
    sel.onSel = function () { if (sel.timer) clearTimeout(sel.timer); sel.timer = setTimeout(selUpdate, 200); };   // 手機拖選取把手時會一直觸發, 稍等一下再顯示
    sel.onPos = function () { selPlace(); };
    doc.addEventListener('selectionchange', sel.onSel); global.addEventListener('resize', sel.onPos); doc.addEventListener('scroll', sel.onPos, true);
    selCleanup = function () {
      doc.removeEventListener('selectionchange', sel.onSel); global.removeEventListener('resize', sel.onPos); doc.removeEventListener('scroll', sel.onPos, true);
      if (sel.timer) clearTimeout(sel.timer); if (sel.bar && sel.bar.parentNode) sel.bar.parentNode.removeChild(sel.bar); sel.bar = null; sel.off = true; sel.dead = true; selCleanup = null;
    };
    var warmKey = '';
    function warm(m) {   // 事先合成第一段(和第二段): 使用者按下去時多半已經好了, 幾乎不用等. 同一段只會合成一次, 之後重聽也用存起來的
      try {
        if (reader && reader.state === 'playing') return;
        if (eng.value === 'browser') return;
        var pl = plan(m); if (!pl.chunks.length || (pl.mode === 'replies' && !pl.rl.length)) return;
        var k = pl.mode + '|' + pl.voice + '|' + pl.style + '|' + pl.chunks[0].text; if (k === warmKey) return; warmKey = k;
        pl.chunks.slice(0, 2).forEach(function (c) { var sc2 = laughTags(exprText(forSpeech(c.speak || c.text))); if (c.rich) sc2 = richPauses(sc2, false); var pr2 = aiClip(withPauses(sc2), pl.voice, c.style || pl.style, pl.model); if (pr2 && pr2.catch) pr2.catch(function () {}); });
      } catch (e) {}
    }
    function srcOf(pl) { return function (c) { if (pl.mode === 'sel') return sel.read ? sel.read.text : ''; if (pl.mode === 'body') return pl.pst.content; if (pl.mode === 'replies' && c.reply) return (pl.rl[c.reply - 1] || {}).content || ''; return ''; }; }
    function posNow() {   // 現在讀到原文的哪裡(AI 人聲會依這一段播了幾成, 找到正在讀的那一句)
      var rd = reader, p = rd.position(), cs = rd.o.chunks, c = cs[p.i] || cs[cs.length - 1];
      if (!c) return { reply: 0, off: 0 };
      var off = c.start || 0, src = curPlan ? srcOf(curPlan)(c) : '';
      if (p.frac > 0.05 && src && !c.title && c.end > c.start) {
        var ss = splitSentences(src.slice(c.start, c.end)), tot = 0, acc = 0, k = 0, j;
        ss.forEach(function (q) { tot += q.text.length; });
        for (j = 0; j < ss.length; j++) { if (acc <= p.frac * tot) k = j; acc += ss[j].text.length; }
        off = c.start + (ss[k] ? ss[k].start : 0);
      }
      return { reply: c.reply || 0, off: off };
    }
    // 換聲音、語氣、語音來源時: 從現在讀到的地方接著讀(不重頭); 暫停中就維持暫停, 按「繼續」才用新的設定接著讀
    function retune(msg) {
      if (!reader || reader.state === 'idle') return false;
      var was = reader.state, pos = posNow();
      start(mode, { pos: pos, paused: was === 'paused', keepSel: true, note: msg });
      return true;
    }
    // AI 人聲出問題(額度用完、連不上…)而且這個瀏覽器有聲音: 自動改用瀏覽器聲音, 從同一個地方接著念
    function aiFail(err) {
      if (!synth()) return false;
      aiCool = Date.now(); engAuto = true; eng.value = 'browser';
      return retune((err && err.status === 429 ? '今天的 AI 語音額度用完了(免費版 Gemini API 金鑰每天次數很少), ' : 'AI 語音暫時無法使用, ') + '已自動改用瀏覽器語音, 從剛才的地方接著念。想換回 AI 人聲, 可以在「語音來源」選擇。');
    }
    function start(m, opt) {
      opt = opt || {};
      mode = m === 'title' ? 'title' : m === 'replies' ? 'replies' : m === 'sel' ? 'sel' : 'body';
      stop(true);
      if (mode === 'sel') { if (!opt.keepSel) { if (!sel.text) { selNote('請先用手指或滑鼠圈選要聽的文字。'); return; } sel.read = { text: sel.text, base: sel.base }; } if (!sel.read) return; }
      var pst = post(), rl = mode === 'replies' ? replies() : [];
      if (mode === 'replies' && !rl.length) { note.textContent = '這則貼文還沒有其他人的回應。'; return; }
      if (mode === 'body' && !String(pst.content).trim()) { note.textContent = '這則貼文沒有內文可以朗讀。'; return; }
      if (mode === 'title' && !String(pst.title).trim() && !TYPE_ZH[pst.type]) { note.textContent = '這則貼文沒有標題可以朗讀。'; return; }
      var pl = plan(mode, true), chunks = pl.chunks, from = 0, userRate = parseFloat(rs.value) || 1;
      if (opt.pos) { var rr = resumeAt(chunks, opt.pos, srcOf(pl)); chunks = rr.chunks; from = rr.from; }
      curPlan = pl;
      prefs.voice = vs.value; prefs.rate = rs.value; prefs.auto = au.checked; prefs.tone = tn.value; if (!engAuto) prefs.engine = eng.value; savePrefs(prefs);
      note.textContent = opt.note || ''; cap.textContent = ''; selNote(opt.note || '');
      var rd = sel.read, rmode = mode;
      reader = new Reader({
        chunks: chunks, from: from, engine: pl.engine, br: pl.br, voice: pl.voice, style: pl.style, model: pl.model, rate: userRate, onAiFail: aiFail,
        onChunk: function (i, c) {
          if (i < 0) { cap.textContent = ''; clearHighlight(); return; }
          cap.textContent = (c.reply ? '(回應 ' + c.reply + ')' : '') + c.text; if (rmode === 'sel') setTimeout(selPlace, 0);   // 字幕出現會把內文往下推, 浮動列跟著移
          if (rmode === 'sel') setHighlightC(ctx.contentEl, rd.base + compactIndex(rd.text, c.start), rd.base + compactIndex(rd.text, c.end) - 1);   // 在內文上標出正在讀的位置(位置 = 圈選的起點 + 這段在圈選文字裡的位置)
          else if (c.title || c.noHl) clearHighlight(); else setHighlight(ctx.contentEl, pst.content, c.start, c.end);
        },
        onState: function (s) { setButtons(s); stopB.hidden = s === 'idle'; if (s === 'idle') { cap.textContent = ''; if (rmode === 'sel' && !selRead()) selHide(); } selLabels(); },
        onNote: function (m2) { note.textContent = m2; if (rmode === 'sel') selNote(m2); }
      });
      cur = reader;
      if (opt.paused) { reader.state = 'paused'; reader.i = from; setButtons('paused'); stopB.hidden = false; } else reader.play();
      selLabels();
    }
    function setButtons(s) {   // 目前在讀的那顆按鈕變「暫停/繼續」, 其他兩顆維持原樣
      play.textContent = '🔊 朗讀內容'; play.setAttribute('aria-label', '朗讀內容'); playt.textContent = '🔊 朗讀標題'; playt.setAttribute('aria-label', '朗讀類型與標題');
      playr.textContent = '🔊 朗讀全部回應(' + replies().length + ')'; playr.setAttribute('aria-label', '朗讀其他人的全部回應');
      if ((s === 'playing' || s === 'paused') && mode !== 'sel') { var pb = mode === 'title' ? playt : mode === 'replies' ? playr : play; pb.textContent = s === 'playing' ? '⏸ 暫停' : '▶ 繼續'; pb.setAttribute('aria-label', s === 'playing' ? '暫停朗讀' : '繼續朗讀'); }
    }
    function toggle(m) { if (reader && reader.state !== 'idle' && mode === m) { if (reader.state === 'playing') reader.pause(); else reader.resume(); } else start(m); }
    play.onclick = function () { toggle('body'); };
    playt.onclick = function () { toggle('title'); };
    playr.onclick = function () { toggle('replies'); };
    [[play, 'body'], [playt, 'title'], [playr, 'replies']].forEach(function (x) {   // 還沒按下去, 就先開始合成第一段
      ['mouseenter', 'focus', 'touchstart'].forEach(function (ev) { x[0].addEventListener(ev, function () { if (!x[0].disabled) warm(x[1]); }, { passive: true }); });
    });
    stopB.onclick = function () { if (reader) reader.stop(); };
    [vs, au, tn].forEach(function (e) { e.onchange = function () { showInfo(); retune(); }; });
    fl.onchange = function () { prefs.flour = fl.checked; savePrefs(prefs); retune(); };   // 讀到一半換聲音/語氣: 從現在讀到的地方接著讀
    eng.onchange = function () { engAuto = false; prefs.engine = eng.value; savePrefs(prefs); showInfo(); retune(); };
    rs.onchange = function () { prefs.rate = rs.value; savePrefs(prefs); if (reader && reader.state !== 'idle') reader.setRate(parseFloat(rs.value) || 1); };   // 改速度馬上生效, 不用重頭
    showInfo();
    (function () { var p0 = post(); tb.hidden = !String(p0.title).trim() && !TYPE_ZH[p0.type]; play.hidden = !String(p0.content).trim(); var rn = replies().length; playr.hidden = !rn; playr.textContent = '🔊 朗讀全部回應(' + rn + ')'; })();
    aiState().then(function (ok) {   // 沒有 Gemini 金鑰: AI 人聲不能選, 改用瀏覽器語音; 兩個都不行才停用
      aiOk = ok; var brOk = !!synth();
      if (sel.dead) return;
      sel.off = !(ok || brOk); if (sel.off) selHide(); else selUpdate();   // 有任何一種聲音可用, 圈選文字才會出現「播放選取內容」
      var aiOpt = eng.querySelector('option[value="ai"]');
      if (!brOk && eng.value === 'browser') eng.value = 'ai';
      if (!ok) {
        aiOpt.disabled = true;
        if (brOk) { engAuto = true; eng.value = 'browser'; if (!note.textContent) note.textContent = 'AI 人聲目前不能用(老師還沒有把 Gemini 金鑰存到雲端), 先用瀏覽器語音朗讀。'; showInfo(); return; }
        note.textContent = '朗讀功能暫時不能用: 老師還沒有把 Gemini 金鑰存到雲端(設定中心 > AI 設定), 這個瀏覽器也沒有可用的語音。';
        [play, playt, playr].forEach(function (b) { b.disabled = true; });
        return;
      }
      if (aiState.src === 'local' && !note.textContent) note.textContent = '目前用的是這台電腦存的 Gemini 金鑰, 只有這台電腦聽得到; 要讓學生也能聽, 請在雲端存金鑰。';
      if (eng.value === 'browser' && Date.now() - aiCool < 1800000 && !note.textContent) { engAuto = true; note.textContent = '剛才 AI 語音額度用完了, 先用瀏覽器語音; 想換回 AI 人聲, 可以在「語音來源」選擇。'; }
      showInfo();
    });
    return { stop: stop, state: function () { return reader ? reader.state : 'idle'; }, destroy: function () { stop(); host.innerHTML = ''; if (ctx.titleHost) ctx.titleHost.innerHTML = ''; if (ctx.repliesHost) ctx.repliesHost.innerHTML = ''; } };
  }

  global.KBTts = {
    PERSONAS: PERSONAS, TONES: TONES, STYLES: STYLES, EXPR: EXPR, exprText: exprText, analyze: analyze, splitSentences: splitSentences, groupSentences: groupSentences, forSpeech: forSpeech, withPauses: withPauses,
    mount: mount, stop: stop, genreOf: genreOf, emotionOf: emotionOf, toneForChunk: toneForChunk, browserUnits: browserUnits, brParams: brParams, twVoices: twVoices, exprBrowser: exprBrowser, chunksFor: chunksFor, replyChunks: replyChunks, resumeAt: resumeAt, personaVoice: personaVoice, personaStyle: personaStyle, aiClip: aiClip, voiceList: voiceList, localKey: localKey, Reader: Reader, aiState: aiState,
    _t: { H: H, mem: mem, setHighlight: setHighlight, textMap: textMap, hash: hash, resetAi: function () { aiState.v = null; vlist = null; vP = null; } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
