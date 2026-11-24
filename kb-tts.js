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
    { id: 'p9', name: '天橋下說書人-大師兄', def: 'Algenib', rich: true, lean: ['anger', 'action', 'pride', 'resolve', 'solemn', 'urgent'], hint: '像在天橋下說書的大師兄: 沙啞有勁、豪邁、抑揚頓挫; 武俠、歷史戰爭的打鬥與英雄場面特別有氣勢; 自動語氣最豐富(每一小段依情節與情緒變化、愈打愈緊、高潮後收放自如), 會替不同角色換聲線, 故事前後有說書開場與收場', design: '一位中年到年長的男性說書人,聲音沙啞有勁、有磁性,像在台灣天橋下說書的老藝人,抑揚頓挫、戲劇感強,講台灣國語。',
      style: 'A veteran Taiwanese street storyteller under an overpass, the big brother of the trade: gravelly, charismatic, theatrical Taiwanese Mandarin, old teahouse flavor. Immersive master: listeners see, hear and feel the scene. Never one loudness: thunderous in fights and vows, slow like flowing water in grief, hushed whispers in dread, silence as a weapon, stress on key lines. Build suspense, escalate, then release; pause before reveals; a distinct voice per character; wry for jokes. Leave a lingering afterglow. Rich emotion, never flat.' },
    // 女聲說書人: 和大師兄同一套「說書」(開場收場、逐段情緒), 聲音換成成熟有氣勢的女聲
    { id: 'p10', name: '天橋下說書人-大師姊', def: 'Kore', rich: true, lean: ['tender', 'longing', 'sad', 'mystery', 'shy', 'fear'], hint: '像在天橋下說書的大師姊: 成熟有氣勢、煙嗓帶魅力、俐落帶點機靈; 愛情、懸疑、抒情的細膩情感與內心世界特別動人; 自動語氣最豐富(每一小段依情節與情緒變化、懸念步步加深), 會替不同角色換聲線, 故事前後有說書開場與收場', design: '一位成熟的女性說書人,聲音帶一點煙嗓、有氣勢也有魅力,像在台灣天橋下說書的大師姊,抑揚頓挫、戲劇感強,俐落又帶點機靈,講台灣國語。',
      style: 'A charismatic Taiwanese female street storyteller under an overpass, the senior sister: smoky, commanding yet alluring, theatrical Taiwanese Mandarin. Immersive master: inner worlds, a glance, a hesitation, the unspoken word. Never one loudness: crisp in fights, slow like flowing water in grief, hushed whispers in dread, silence as a weapon, stress on key lines. Build suspense, escalate, then release; pause before reveals; a distinct voice per character; sly for jokes. Leave a lingering afterglow. Rich emotion, never flat.' }
,
    // 測試用: 和大師姊同一個聲音(Kore), 只改「口語節奏」—— 依一般口語特徵(說話段短、逗號處常有 0.3 秒左右的短停頓、音高起伏可到一個八度、句尾不一定下降)調整, 方便 A/B 比較. 不複製任何真人的音色.
    { id: 'p11', name: '天橋下說書人-大師姊(改版測試)', def: 'Kore', rich: true, live: true, lean: ['tender', 'longing', 'sad', 'mystery', 'shy', 'fear'], hint: '測試用: 和大師姊同一個聲音, 改成口語節奏——一口氣短、逗號處常有短停頓、音高起伏更寬、句尾不一定下降; 拿來和原本的大師姊比較', design: '一位成熟的女性說書人,聲音帶一點煙嗓、有氣勢也有魅力,像在電台裡現場說故事的大師姊,口語自然、節奏明快,講台灣國語。',
      style: 'A charismatic Taiwanese female street storyteller, live and conversational: smoky, commanding yet warm, theatrical Taiwanese Mandarin. Short breath groups of five to seven syllables with frequent brief pauses at clause boundaries, wide pitch swings up to an octave, sentence endings sometimes rising or level and not always falling, clear loudness changes between phrases, a hushed whisper in dread, crisp in fights. Build suspense, then release; pause before reveals; a distinct voice per character. Rich emotion, never flat.' }
  ];
  // 瀏覽器聲音版的人設: 用「語速、音高」把各個人設區分開(瀏覽器聲音沒有語氣描述可以送); prefer = 優先挑名字符合的聲音; male = 說書人優先用男聲
  var BR = {
    p1: { rate: 1.02, pitch: 1.1 }, p2: { rate: 0.97, pitch: 1.0 }, p3: { rate: 0.93, pitch: 0.9 }, p4: { rate: 1.06, pitch: 1.12 }, p5: { rate: 0.98, pitch: 0.96 }, p6: { rate: 1.03, pitch: 1.07 },
    p7: { rate: 1.0, pitch: 0.95, prefer: /hsiao-?chen|曉臻/i }, p8: { rate: 1.05, pitch: 1.13, prefer: /hsiao-?yu|曉雨|han-?han|涵涵/i }, p9: { rate: 0.96, pitch: 0.82, male: true }, p10: { rate: 0.97, pitch: 0.95 }, p11: { rate: 1.0, pitch: 0.97 }
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
    wuxia: { zh: '武俠', min: 2, en: 'wuxia epic: bold, heroic, every move clear with its cause', open: '各位看倌, 且聽我說一段江湖恩怨。', close: '欲知後事如何, 且聽下回分解。', re: /劍|刀光|刀鋒|江湖|內力|掌門|武林|輕功|少俠|大俠|俠客|拔劍|出鞘|門派|高手|招式|真氣|暗器|拳風|比武|決戰|過招|師父|少林|武當|丐幫|魔教|客棧|蒙面|鏢局|點穴|劍氣|殺氣|不敗|殺手|刺客|一掌|掌風|恩怨|俠義|劍法|刀法|酒|俠|幫主|絕招|奇功|傳人|掌門人|降龍|蛤蟆功|絕學/g },
    romance: { zh: '浪漫', min: 2, en: 'understated romance: feeling in the glance and the unsaid word, breathy', open: '各位看倌, 今天這一段, 說的是一個情字。', close: '情之一字, 且聽下回分解。', re: /愛情|愛上|喜歡你|心跳|親吻|吻|擁抱|思念|溫柔|臉紅|牽手|約定|永遠|告白|眼眸|心動|凝視|懷裡|依偎|想你|深情|情話|戀人|戀愛|初戀|相愛|臉頰|耳邊|低語|愛意|相思|心上人|佳人|言不由衷/g },
    detective: { zh: '推理', min: 2, en: 'detective: peeling back layers step by step, then one detail overturns all', open: '各位看倌, 這一樁案子, 可得仔細聽。', close: '真相究竟如何, 且聽下回分解。', re: /線索|推理|嫌犯|兇手|案發|現場|證據|不在場|動機|破綻|真相|偵探|死者|兇器|凶手|密室|指紋|供詞|案件|疑點|誤導/g },
    suspense: { zh: '懸疑', min: 2, en: 'creeping suspense, hushed and slow, dread building under every pause', open: '各位看倌, 可要豎起耳朵, 這一段, 有點嚇人。', close: '後事如何, 且聽下回分解。', re: /突然|黑暗|腳步聲|陰影|屏住呼吸|秘密|不對勁|冷汗|門縫|神秘|詭異|血跡|失蹤|背後|寒意|毛骨悚然|門外|無聲|深夜|漆黑|嘎吱|窸窣/g },
    horror: { zh: '恐怖', min: 2, en: 'horror: dread through silence, shadows and long hushed pauses', open: '各位看倌, 夜深人靜, 這一段, 膽小的人別聽。', close: '那是什麼, 且聽下回分解。', re: /恐怖|鬼|幽靈|屍體|血腥|陰森|慘叫|詛咒|亡魂|墳|棺材|怨靈|惡靈|陰魂|冤魂|鬼影|詭祕|驚悚/g },
    war: { zh: '歷史戰爭', min: 2, en: 'war epic: vast battlefield grandeur, commanding and resonant', open: '各位看倌, 且聽我說一段金戈鐵馬的往事。', close: '天下大勢, 且聽下回分解。', re: /戰場|千軍萬馬|將軍|軍隊|士兵|兵馬|城池|號角|軍令|出征|統帥|戰鼓|攻城|守城|王朝|皇帝|大軍|陣營|烽火|旌旗|疆場|將帥|謀略|戰略/g },
    scifi: { zh: '科幻玄幻', min: 2, en: 'sci-fi wonder: awe at a vast believable unknown', open: '各位看倌, 這一段, 要請你放開想像。', close: '未知的盡頭, 且聽下回分解。', re: /星艦|太空|外星|機器人|人工智慧|量子|時空|穿越|星球|宇宙|基因|科技|飛船|平行世界|魔法|龍|勇者|冒險|精靈|魔王|咒語|王國|公主|騎士|巫師|神殿|寶劍|法術|仙|妖|飛天|神獸|結界/g },
    comedy: { zh: '搞笑', min: 2, en: 'playful comic timing, sly asides, delighted laughter', open: '各位看倌, 這一段可有趣了, 先說好, 不准笑。', close: '笑完了沒有? 且聽下回分解。', re: /哈哈|搞笑|笑死|糗|滑稽|烏龍|尷尬|噗|好笑|耍寶|嘻嘻|呆呆|逗|整人|出糗|鬧笑話/g },
    lyrical: { zh: '抒情', min: 3, en: 'lyrical and poetic, slow flowing breath, wistful sighs at line ends', open: '夜深了, 各位看倌, 聽我慢慢說來。', close: '餘韻悠悠, 且聽下回分解。', re: /微風|月光|月色|雲|夢|詩|淚|秋|落葉|靜靜|遠方|回憶|記憶|歲月|黃昏|孤獨|嘆息|流淌|輕輕|晚霞|星空|漫步|故鄉|思緒|悠悠|寂靜|惆悵|飄|霧|細雨/g },
    story: { zh: '說故事', min: 3, en: 'warm old-fashioned storytelling, natural pauses, drawing the listener in', open: '各位看倌, 且聽我說來。', close: '且聽下回分解。', re: /從前|很久以前|有一天|故事|傳說|後來|於是|從此|過了很久|話說/g }
  };
  var GENRE_ORDER = ['wuxia', 'romance', 'detective', 'horror', 'suspense', 'war', 'scifi', 'comedy', 'lyrical', 'story'];
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
    tender: { zh: '溫柔', dr: -0.06, dp: 0.01, dv: -0.2, lv: ['soft and gentle', 'tender and warm, close to the microphone, breathy', 'intimate, whispering with aching tenderness'], re: /溫柔|輕聲|柔聲|低語|輕撫|微笑|凝視|依偎|擁|吻|憐惜|呵護|柔情|耳邊|輕輕地|相守|與君|共白頭|白頭偕老|一生一世|執子之手|相伴|廝守/g },
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
  function emotionOf(text, lean) {   // lean: 這個人設偏重的情緒(強度加一點); 回傳 { key, zh, level(1~3), en, dr, dp, dv } 或 null
    var t = String(text || ''), best = null, sc = 0;
    var lastAt = 0;   // 同分時, 最後面出現的情緒優先(一段話的結尾情緒決定怎麼收)
    EMO_ORDER.forEach(function (k) { var e = EMOS[k], d = distinctHits(e.re, t); if (d >= (e.min || 1)) { var at = 0, mm, re2 = new RegExp(e.re.source, 'g'); while ((mm = re2.exec(t))) at = mm.index; if (d > sc || (d === sc && at > lastAt)) { sc = d; best = k; lastAt = at; } } });
    if (best) {
      var strength = sc + (bangs(t) >= 2 ? 1 : bangs(t) === 1 ? 0.5 : 0) + (INTENS.test(t) ? 1 : 0) + ((t.match(EMOS[best].re) || []).length >= sc + 2 ? 1 : 0) + (lean && lean.indexOf(best) >= 0 ? 0.6 : 0);
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
  // 說書的戲劇手法(每一項都是「聲音上做得到」的): 倒數式的短句、拉長音的招式喊聲、擬聲字、突然的一震、真相揭曉、角色聲線
  var HIGH = { anger: 1, action: 1, urgent: 1, resolve: 1, pride: 1, surprise: 1, excited: 1, fear: 1 };
  var SPEAKERS = [
    [/老婦|婆婆|老太|老奶奶|老嫗/, 'an elderly woman voice, warm and cracked with age'],
    [/老者|老人|老頭|老爺爺|老翁|師父|掌門|長老|宗師|老和尚|老道/, 'an elderly man voice, gravelly and weathered'],
    [/少女|姑娘|小姐|女子|婦人|夫人|公主|丫鬟|女俠|女孩/, 'a young woman voice, clear and light'],
    [/少年|少俠|公子|書生|小子|青年|小夥子|男孩/, 'a young man voice, bright and impulsive'],
    [/大漢|壯漢|惡徒|山賊|莽漢|強盜|惡霸|賊人/, 'a deep rough burly voice'],
    [/孩子|小孩|孩童|小女孩|小男孩|娃娃/, 'a child voice, high and innocent'],
    [/皇帝|將軍|元帥|主公|大王|國王|統帥/, 'a commanding authoritative voice']
  ];
  function speakerOf(text) { for (var i = 0; i < SPEAKERS.length; i++) if (SPEAKERS[i][0].test(text)) return SPEAKERS[i][1]; return ''; }
  function devicesOf(text, rich) {   // 回傳 { en[], zh[], dr, dp, dv }
    var t = String(text || ''), en = [], zh = [], dr = 0, dp = 0, dv = 0;
    if (/(?:[^\s\u3002!?\uFF01\uFF1F]{1,4}[!\uFF01]\s*){3,}/.test(t)) { en.push('rapid accelerating countdown, tighter and louder'); zh.push('倒數式加速'); dr += 0.07; dp += 0.02; }
    if (/[\u300C\u300E][^\u300D\u300F]*?[\u4E00-\u9FFF]\u2014\u2014[\u4E00-\u9FFF]/.test(t)) { en.push('stretch each syllable of the battle cry, ringing'); zh.push('拉長音的喊聲'); dr -= 0.05; dp += 0.03; }
    if (/轟|砰|嘩啦|咕嚕|呼嘯|嗖|啪|咚|鏘|嘶|隆隆|喀嚓|咕\u2026/.test(t)) { en.push('sound-effect words hit with punch'); zh.push('擬聲字有力'); dr += 0.02; }
    if (/^\s*(?:突然|忽然|就在這時|說時遲)/.test(t)) { en.push('a sudden jolt, sharp and startled'); zh.push('突然一震'); dr += 0.04; dp += 0.03; }
    if (/原來|竟然是|真相|其實|沒想到/.test(t)) { en.push('a dramatic reveal, voice lowered and slowed'); zh.push('真相揭曉'); dr -= 0.05; dp -= 0.03; dv -= 0.05; }
    return { en: en, zh: zh, dr: dr, dp: dp, dv: dv };
  }

  // 說書的「手藝」(只給說書人): 把關鍵句說出份量、沉住氣的重、慢動作、特寫與遠景(鏡頭感)、把懸念吊著、天氣與氛圍活在聲音裡、吊聽眾胃口
  // 每一段最多挑 3 項(依序), 一項約 20~40 字; 位置排在情緒與基本手法之後、類型與基本語氣之前, 所以字數不夠時先被修掉的是類型與基本語氣
  var CRAFT = [
    ['keyline', '力道關鍵句', 'land the key line with weight, a beat of silence first', 0.0, -0.02, 0, function (t) { return /絕不|一定要|賭上|一生|永遠|從今以後|此生|不惜|寧可|唯一|最後一|只剩下|這一掌|這一劍|這一戰/.test(t) || keyShort(t); }],
    ['slowmo', '慢動作', 'slow motion, every word weighty', -0.07, -0.01, 0, function (t) { return /緩緩|慢慢地|剎那|一瞬間|時間彷彿|時間凝結|慢鏡頭|凝固/.test(t); }],
    ['cliff', '懸念吊著', 'hold the suspense hanging', -0.04, 0.0, -0.03, function (t) { return /(?:\u2014\u2014|\u2026\u2026|\u2026)\s*[\u300D\u300F\u201D"]?\s*$/.test(t); }],
    ['quiet', '沉住氣', 'restrained, quiet but heavy', -0.04, -0.02, -0.06, function (t, emo) { return !!emo && emo.level >= 2 && /^(?:tender|sad|longing|cold|fear|mystery|solemn)$/.test(emo.key) && !/[!\uFF01]/.test(t); }],
    ['close', '特寫', 'close-up detail, intimate and low', -0.03, -0.02, -0.08, function (t) { return /只見他|只見她|眼神|眼眸|指尖|喉間|額頭|冷汗|嘴角|瞳孔|掌心|睫毛|呼吸/.test(t); }],
    ['wide', '遠景', 'wide expansive view, open and broad', 0.0, 0.0, 0, function (t) { return /絕頂|山巔|千里|蒼穹|遠方|天際|大地|萬里|城牆|曠野|海面|群山|江湖/.test(t); }],
    ['mood', '氛圍', 'let the weather and mood live in the voice', -0.02, 0.0, -0.03, function (t) { return /狂風|呼嘯|寒風|暴雨|雷聲|血腥|霧氣|月色|夜色|硝煙|烈日|飄雪|細雨|風雪|殘陽/.test(t); }],
    ['tease', '吊胃口', 'a teasing beat that makes listeners wonder', 0.0, 0.02, 0, function (t) { return /(?:[^\u300C\u300E\u201C"]*)[?\uFF1F]\s*$/.test(t) && !/[\u300C\u300E\u201C"]/.test(t); }]
  ];
  function keyShort(t) {   // 一長句後面接一句很短的(「郭靖竟然沒有退!」)通常就是關鍵句
    var ss = splitSentences(String(t || '')), i; for (i = 1; i < ss.length; i++) if (effLen(ss[i].text) <= 9 && effLen(ss[i - 1].text) >= 16) return true;
    return false;
  }
  function craftOf(text, emo) {   // 回傳 { en[], zh[], dr, dp, dv } 或 null
    var t = String(text || ''), en = [], zh = [], dr = 0, dp = 0, dv = 0, i, c;
    for (i = 0; i < CRAFT.length && en.length < 3; i++) { c = CRAFT[i]; if (c[6](t, emo)) { en.push(c[2]); zh.push(c[1]); dr += c[3]; dp += c[4]; dv += c[5]; } }
    return en.length ? { en: en, zh: zh, dr: dr, dp: dp, dv: dv } : null;
  }
  // 關鍵句前面停一拍: 一長句後面接一句很短的, 在短句前加 <short pause>(只有說書人)
  function keyLinePause(t) {
    var ss = splitSentences(String(t || '')); if (ss.length < 2) return t;
    var out = '', i; for (i = 0; i < ss.length; i++) { out += (i > 0 && effLen(ss[i].text) <= 9 && effLen(ss[i - 1].text) >= 16 && !/^<short pause>/.test(ss[i].text) ? '<short pause>' : '') + ss[i].text; }
    return out.length >= t.length * 0.5 ? out : t;
  }
  /* ---------- 結尾語句分析 ----------
   * 一則貼文(或一段)的最後一句, 常是整篇的「神韻」所在(例如「若能與君長相守, 縱使散盡畢生武功, 又有何妨?」). 這裡分析最後一句:
   *   類型: 反問 / 誓言 / 道別 / 真的在問 / 驚嘆 / 平實收束; 再依整體情緒分成 浪漫、壯闊、悲傷、懼怕、平實.
   * 收法: 先停一拍、放慢、帶著情感與決心把話收住 —— 不是單純加大音量; 反問句尾音不上揚, 說完留一點餘韻. */
  var END_RHET = /何妨|何嘗|何必|何懼|何苦|何須|何不|豈|難道|怎能|怎會|怎麼不|怎麼能|又何|又有何|有何不可|不是嗎|不就是|誰說|哪有|莫非|焉能|安能|能不|又如何|又怎樣|又怎麼樣/;
  var END_VOW = /永遠|一生|此生|終生|生生世世|不離不棄|相守|廝守|相伴|我願|願意|發誓|誓|絕不|決不|一定會|我會|必定|縱使|縱然|只要|白頭|至死|到老|不悔|無悔|義無反顧/;
  var END_FARE = /再見|保重|珍重|永別|告辭|後會有期|訣別|別了|告別|就此別過|再會|一路平安/;
  var END_CUE = {
    rhetorical: 'last line a rhetorical question: pause, slow, deep feeling and resolve, no rising tone, hold',
    vow: 'last line a vow: slow, sincere, deep feeling and resolve, hold',
    farewell: 'last line a farewell: softer, slower, lingering',
    question: 'last line a real question: rising, left hanging',
    exclaim: 'last line lands firmly, not just louder',
    plain: 'last line settles slowly with weight',
    trail: 'last line trails off softly'
  };
  var END_MOOD = { romantic: 'tender, warm breath', majestic: 'resonant and steady, never shouting', sorrow: 'trembling, heavy with grief', dread: 'low, hushed, ominous', plain: '' };
  var END_ZH = { rhetorical: '反問', vow: '誓言', farewell: '道別', question: '提問', exclaim: '驚嘆', plain: '平實', trail: '欲言又止' };
  var MOOD_ZH = { romantic: '浪漫', majestic: '壯闊', sorrow: '悲傷', dread: '懼怕', plain: '' };
  function endingOf(text) {   // 回傳 { type, sentence, clause(最後一小句), multi(最後一句有幾個小句) } 或 null
    var ss = splitSentences(String(text == null ? '' : text)); if (!ss.length) return null;
    var s0 = ss[ss.length - 1].text, body = s0.replace(/[\u300D\u300F\u201D"'\s]+$/, ''), cl = body.match(/[^,\uFF0C;\uFF1B:\uFF1A\u3001]+[,\uFF0C;\uFF1B:\uFF1A\u3001]*/g) || [body], clause = cl[cl.length - 1];
    var q = /[?\uFF1F]$/.test(body), ex = /[!\uFF01]$/.test(body), tr = /(?:\u2026|\.\.\.|\u2014\u2014)$/.test(body), type;
    if (tr) type = 'trail'; else if (q && END_RHET.test(s0)) type = 'rhetorical'; else if (q) type = 'question'; else if (END_FARE.test(s0)) type = 'farewell'; else if (END_VOW.test(s0)) type = 'vow'; else if (ex) type = 'exclaim'; else type = 'plain';
    return { type: type, sentence: s0, clause: clause, multi: cl.length > 1 };
  }
  function endMood(emoKey, genreKey) {   // 先看這一段(或整篇)的情緒; 沒有明確情緒才看故事類型
    var k = emoKey || '';
    if (k) {
      if (k === 'sad') return 'sorrow';
      if (k === 'fear' || k === 'mystery') return 'dread';
      if (k === 'tender' || k === 'longing' || k === 'shy') return 'romantic';
      if (k === 'pride' || k === 'resolve' || k === 'awe' || k === 'solemn') return 'majestic';
      return 'plain';
    }
    if (genreKey === 'horror' || genreKey === 'suspense') return 'dread';
    if (genreKey === 'romance') return 'romantic';
    if (genreKey === 'war') return 'majestic';
    return 'plain';
  }
  // 最後一句是反問/誓言/道別時, 在最後一個小句前留一拍(<short pause>)
  function endPause(t) {
    t = String(t == null ? '' : t);
    var e = endingOf(t); if (!e || !/^(rhetorical|vow|farewell)$/.test(e.type)) return t;
    var pos = t.lastIndexOf(e.clause); if (pos <= 0 || /^<short pause>/.test(e.clause)) return t;
    if (e.multi) { if (!/[,\uFF0C;\uFF1B:\uFF1A\u3001]/.test(t.charAt(pos - 1))) return t; }
    else if (effLen(e.sentence) > 8) return t;
    if (t.slice(Math.max(0, pos - 13), pos) === '<short pause>') return t;
    return t.slice(0, pos) + '<short pause>' + t.slice(pos);
  }
  // 最後一段若以反問/誓言/道別收尾, 把最後一句獨立成一小段(AI 人聲專用), 讓它有完整、專屬的語氣; 一長串話的尾端不會被稀釋掉
  function tailSplit(chunks, src) {
    var n = chunks.length; if (!n) return chunks;
    var c = chunks[n - 1], ed = endingOf(c.text);
    if (c.title || !ed || !/^(rhetorical|vow|farewell)$/.test(ed.type)) return chunks;
    var ss = splitSentences(c.text); if (ss.length < 2) return chunks;
    var sub = splitSentences(String(src || '').slice(c.start, c.end)); if (sub.length !== ss.length) return chunks;
    var tail = ss[ss.length - 1], head = ss.slice(0, -1).map(function (q) { return q.text; }).join('');
    if (effLen(tail.text) > 70 || effLen(head) < 12) return chunks;
    var h = {}, t = {}, key; for (key in c) { h[key] = c[key]; t[key] = c[key]; }
    var hs = sub[sub.length - 2], ts = sub[sub.length - 1];
    h.text = head; h.end = c.start + hs.end; h.n = ss.length - 1; h.par = /\n/.test(String(src).slice(c.start + hs.end, c.start + ts.start));
    t.text = tail.text; t.start = c.start + ts.start; t.n = 1; t.tail = true;
    return chunks.slice(0, n - 1).concat([h, t]);
  }

  /* ---------- 詩詞 ----------
   * 偵測五言、七言(絕句、律詩、古詩)與詞(長短句、逐行換行): 依「意象」(月、霜、雁、江水、酒…)分析整首詩的情緒, 兩句一聯為一小段,
   * 依起、承、轉、合安排情緒的起伏(開頭含蓄、轉折處往內收、結尾最深), 句與句之間留出換氣, 沒有標點的詩自動補上標點. */
  var POEM_BASE = 'classical poem: even measured rhythm, a breath between lines', POEM_SOFT = { sad: 1, longing: 1, tender: 1, shy: 1, cold: 1, mystery: 1, fear: 1 };
  var POEM_ROLE_EN = { open: 'opening couplet: quiet, setting the scene', dev: 'develop the image, steady and flowing', turn: 'the turn: feeling deepens, lower, inward', close: 'closing couplet: gather the feeling, slow, last word lingering' };
  var POEM_ROLE_ZH = { open: '起', dev: '承', turn: '轉', close: '合' };
  var POEM_IMAGERY = [
    [/月|嬋娟/, '月', '思念、團圓、清冷', 'longing'], [/霜|寒|冷|冰/, '寒霜', '寒涼、孤寂', 'sad'], [/雪/, '雪', '清寒、孤高', 'cold'],
    [/雨|淚|泣/, '雨與淚', '愁緒、哀傷', 'sad'], [/愁|憂|悲|斷腸|腸斷|恨|苦/, '愁', '愁苦、遺憾', 'sad'], [/孤|獨|寂|蕭|空山/, '孤', '孤寂、清冷', 'sad'],
    [/雁|鴻|猿|啼|鴉|鵑/, '雁與啼聲', '羈旅、悲鳴', 'sad'], [/落花|殘花|凋|謝|零落|飄零/, '落花', '傷春、時光流逝', 'sad'],
    [/舟|帆|江|河|水|流/, '江水', '流逝、漂泊', 'longing'], [/故人|友|朋|送|別|離|辭/, '離別', '離別、友情', 'longing'],
    [/思|憶|念|夢|紅豆/, '思念', '思念、夢境', 'longing'], [/鄉|歸|家|客|遊子/, '故鄉', '思鄉、漂泊', 'longing'],
    [/秋|黃昏|夕陽|暮|殘陽|斜陽/, '暮秋', '暮色、遲暮之感', 'longing'], [/燈|燭|夜半|夜深|更漏/, '夜燈', '夜深、孤寂', 'longing'],
    [/山|嶽|峰|岳/, '山', '雄渾、高遠', 'awe'], [/天地|萬里|千里|長江|黃河|大江|滄海|蒼穹|乾坤/, '天地', '壯闊、胸襟', 'awe'],
    [/戰|沙場|烽|征|戍|胡馬|將軍|劍|刀/, '沙場', '邊塞、豪壯悲壯', 'solemn'], [/酒|醉|杯|歌|狂|俠/, '酒', '豪放、灑脫', 'carefree'],
    [/春|花|柳|燕|鶯|桃|杏|芳/, '春花', '春意、生機', 'joy'], [/情|君|郎|妾|相守|相伴|鴛鴦|結髮|白頭|眷|相見/, '情', '深情、相思', 'tender'],
    [/梅|竹|松|菊|蘭/, '梅竹', '高潔、風骨', 'resolve'], [/志|壯|豪|功名|英雄|丈夫|蒼生/, '壯志', '壯志、豪情', 'resolve']
  ];
  function poemImagery(text) {   // [{ ch(出現的字), label, note, emo }]
    var t = String(text || ''), out = [];
    POEM_IMAGERY.forEach(function (x) { var m = t.match(x[0]); if (m) out.push({ ch: m[0], label: x[1], note: x[2], emo: x[3] }); });
    return out;
  }
  var POEM_PUNCT = /[\uFF0C\u3002\uFF1F\uFF01\u3001\uFF1B\uFF1A,.?!;:]/, PURE_ZH = /^[\u4E00-\u9FFF]+$/;
  function normPunct(p) { return ({ ',': '\uFF0C', '.': '\u3002', '?': '\uFF1F', '!': '\uFF01', ';': '\uFF1B', ':': '\uFF1A' })[p] || p; }
  function poemTokens(src) {
    var re = /[^\uFF0C\u3002\uFF1F\uFF01\u3001\uFF1B\uFF1A,.?!;:\s\u3000]+/g, toks = [], m, i;
    while ((m = re.exec(src))) toks.push({ t: m[0], start: m.index, end: m.index + m[0].length, len: m[0].length });
    for (i = 0; i < toks.length; i++) { var nx = i + 1 < toks.length ? toks[i + 1].start : src.length, sep = src.slice(toks[i].end, nx), pm = sep.match(POEM_PUNCT); toks[i].p = pm ? normPunct(pm[0]) : ''; toks[i].nl = /\n/.test(sep); }
    return toks;
  }
  function poemForm(body) {   // 'wu' | 'qi' | 'ci' | ''
    var n = body.length, cnt = {}, best = 0, bl = 0, sum = 0, mid = 0, nl = 0, i;
    if (n < 4 || n > 40) return '';
    for (i = 0; i < n; i++) { var x = body[i]; if (!PURE_ZH.test(x.t)) return ''; cnt[x.len] = (cnt[x.len] || 0) + 1; if (cnt[x.len] > best) { best = cnt[x.len]; bl = x.len; } sum += x.len; if (x.len >= 3 && x.len <= 9) mid++; if (x.nl) nl++; if (x.len < 2 || x.len > 11) return ''; }
    if ((bl === 5 || bl === 7) && best >= Math.ceil(n * 0.85)) return bl === 5 ? 'wu' : 'qi';
    if (n >= 6 && nl >= 2 && body.filter(function (q) { return q.p; }).length >= n * 0.7 && mid >= n * 0.7 && sum / n <= 8 && sum <= 320 && best < n && poemImagery(body.map(function (q) { return q.t; }).join('')).length >= (body.filter(function (q) { return q.p; }).length >= n * 0.9 ? 2 : 3)) return 'ci';
    return '';
  }
  function poemOf(text) {   // 不是詩詞就回 null; 否則 { form, formZh, title, couplets[{ text, start, end, n, role, lines[] }], mood, moodZh, imagery[] }
    var src = String(text == null ? '' : text); if (src.length < 16 || src.length > 700) return null;
    var all = poemTokens(src), skip = 0, form = '', body = null, i;
    [false, true].forEach(function (ci) {   // 先找五言、七言(可以跳過前面的標題、作者行), 找不到才試詞(長短句)
      for (var sk = 0; sk <= 2 && !form; sk++) {
        if (sk > 0 && !(all[sk - 1] && all[sk - 1].nl && !all[sk - 1].p)) break;
        var bd = all.slice(sk), f = poemForm(bd); if (f && (f === 'ci') === ci) { form = f; body = bd; skip = sk; }
      }
    });
    if (!form) return null;
    var groups = [], cur = [];
    if (form === 'ci' && body.some(function (x) { return /[\u3002\uFF1F\uFF01]/.test(x.p); })) {
      body.forEach(function (x) { cur.push(x); if (/[\u3002\uFF1F\uFF01]/.test(x.p)) { groups.push(cur); cur = []; } });
      if (cur.length) groups.push(cur);
      groups = groups.reduce(function (a, g) { if (g.length > 4) { for (var k = 0; k < g.length; k += 2) a.push(g.slice(k, k + 2)); } else a.push(g); return a; }, []);
    } else for (i = 0; i < body.length; i += 2) groups.push(body.slice(i, i + 2));
    var m = groups.length;
    var couplets = groups.map(function (g, gi) {
      var txt = g.map(function (x, j) { var p = x.p; if (!p) p = j === g.length - 1 ? (/何|誰|幾|安|豈|怎|嗎|呢/.test(x.t) ? '\uFF1F' : '\u3002') : '\uFF0C'; return x.t + p; }).join('');
      var role = m === 1 ? 'close' : gi === 0 ? 'open' : gi === m - 1 ? 'close' : (m >= 3 && gi === m - 2) ? 'turn' : 'dev';
      return { text: txt, start: g[0].start, end: g[g.length - 1].end, n: g.length, role: role, lines: g.map(function (x) { return x.t; }) };
    });
    var all2 = body.map(function (q) { return q.t; }).join(''), img = poemImagery(all2), score = {}, best = '', bs = 0, emo = emotionOf(all2);
    img.forEach(function (x) { score[x.emo] = (score[x.emo] || 0) + 1; });
    if (emo) score[emo.key] = (score[emo.key] || 0) + 2;
    Object.keys(score).forEach(function (k) { if (score[k] > bs && EMOS[k]) { bs = score[k]; best = k; } });
    var n = body.length, formZh = form === 'ci' ? '詞(長短句)' : (form === 'wu' ? '五言' : '七言') + (n === 4 ? '絕句' : n === 8 ? '律詩' : '古詩');
    return { form: form, formZh: formZh, title: all.slice(0, skip).map(function (x) { return x.t; }).join(' '), couplets: couplets, mood: best, moodZh: best ? EMOS[best].zh : '', imagery: img };
  }
  function poemChunks(poem) {   // 一聯(兩句)為一小段; 標點用補好的
    var m = poem.couplets.length;
    return poem.couplets.map(function (cp, i) { return { text: cp.text, start: cp.start, end: cp.end, n: cp.n, par: false, poem: { role: cp.role, mood: poem.mood, form: poem.form, i: i, m: m } }; });
  }

  // ctx = { first, last, prev(上一段的語氣結果), streak(連續幾段高能量) }; lean = 人設偏重的情緒
  function toneForChunk(text, genre, baseEn, rich, ctx, lean) {
    ctx = ctx || {};
    var emo = emotionOf(text, lean), rh = rhythmOf(text), dv0 = devicesOf(text, rich), en = [], zh = [], dr = 0, dp = 0, dv = 0, dia = /[\u300C\u300E\u201C"]/.test(String(text || '')), k = rich ? 1.6 : 1;
    if (emo && HIGH[emo.key] && ctx.streak >= 1 && emo.key !== 'excited' && EMOS[emo.key]) emo = emoOut(emo.key, Math.min(3, emo.level + 1));
    var pm = ctx.poem || null;   // 詩詞: 開頭含蓄、轉折往內收、結尾最深
    if (pm) { var plv = pm.role === 'close' ? 3 : pm.role === 'open' ? 1 : 2, pk0 = emo && EMOS[emo.key] ? emo.key : pm.mood; if (pk0 && EMOS[pk0]) { if (!POEM_SOFT[pk0]) plv = Math.min(plv, 2); emo = emoOut(pk0, emo && EMOS[emo.key] ? Math.max(Math.min(emo.level, POEM_SOFT[pk0] ? 3 : 2), plv) : plv); } }   // 詩詞的情緒靠深淺不靠音量: 豪壯的詩最多到第 2 級, 柔的情緒才到第 3 級
    var ed = endingOf(text), ending = ed && (ctx.last && !pm ? ed.type !== 'trail' : /^(rhetorical|vow|farewell)$/.test(ed.type)) && !(pm && !ctx.last) ? ed : null;   // 結尾語句: 最後一段看所有類型; 其他段(與詩詞)只在反問、誓言、道別時   // 愈打愈緊: 連續高能量的段落, 一段比一段更強
    if (emo) { en.push(emo.en); zh.push(emo.zh + (emo.level >= 3 ? '(強烈)' : emo.level === 2 ? '' : '(淡淡的)')); dr += emo.dr * k; dp += emo.dp * k; dv += emo.dv * k; }
    dv0.en.forEach(function (x, i) { en.push(x); zh.push(dv0.zh[i]); });
    dr += dv0.dr * k; dp += dv0.dp * k; dv += dv0.dv * k;
    if (ctx.prosody === 1) { en.push('expressive intonation with clear pitch rises and falls'); zh.push('抑揚頓挫(加強)'); }
    else if (ctx.prosody === 2) { en.push('dramatic intonation, wide pitch rises and falls, firm stress on key words'); zh.push('抑揚頓挫(戲劇)'); }
    if (pm) { if (!ending) en.push(POEM_BASE); zh.push('詩詞吟誦'); en.push(POEM_ROLE_EN[pm.role]); zh.push('詩詞·' + POEM_ROLE_ZH[pm.role]); dr -= 0.07 * k; if (pm.role === 'close') { dr -= 0.04 * k; dv -= 0.05; } }
    if (ctx.open) { en.push('open with a flourish, same voice and volume'); zh.push('說書開場'); }
    if (ctx.close) { en.push('close with a flourish, lingering, same volume'); zh.push('說書收場'); }
    if (dia) { var who = rich ? speakerOf(text) : ''; en.push(rich ? (who ? 'quoted lines in ' + who + ', distinct from the narration' : 'quoted lines in character, distinct from narration') : 'a bit more animated in quoted lines'); zh.push(who ? '對話換聲線' : '對話有角色感'); dp += 0.02 * k; }
    if (rh) { en.push(rh.en); zh.push(rh.zh); dr += rh.key === 'staccato' ? 0.04 : -0.02; }
    if (ending) {
      var emd = endMood(emo ? emo.key : ctx.endEmo, genre && genre.key); if (emd === 'plain' && ending.type === 'farewell') emd = 'sorrow'; en.push(END_CUE[ending.type]); if (END_MOOD[emd]) en.push(END_MOOD[emd]); zh.push('結尾語句(' + END_ZH[ending.type] + (emd !== 'plain' ? '·' + MOOD_ZH[emd] : '') + ')');
      if (/^(rhetorical|vow|farewell)$/.test(ending.type)) { dr -= 0.06 * k; dp -= 0.02 * k; dv -= emd === 'dread' ? 0.08 : 0.04; } else if (ending.type === 'exclaim') dr -= 0.02 * k; else if (ending.type === 'plain') dr -= 0.03 * k;   // 放慢、收住, 音量只會更輕不會更大
    }
    var calmAfter = !emo && ctx.prev && ctx.prev.level >= 3 && HIGH[ctx.prev.emotion];
    if (calmAfter) { en.push('ease off after the climax, quieter and slower'); zh.push('高潮後收斂'); dr -= 0.06 * k; dv -= 0.08; }   // 張弛有度: 不能整篇都一個音量
    if (rich && ctx.first && !emo && !ctx.open && !pm) { en.push('open like a film: wide establishing shot, atmosphere first'); zh.push('場景鋪陳'); }
    if (rich && ctx.last) { en.push('lingering afterglow, slowing and fading'); zh.push('餘韻'); dr -= 0.05; dv -= 0.05; }
    var craft = rich ? craftOf(text, emo) : null;
    var changed = !!(emo || dia || rh || dv0.en.length || calmAfter || (rich && (ctx.first || ctx.last)) || (rich && ctx.n > 1 && !ctx.last) || craft || ctx.prosody > 0 || ctx.open || ctx.close || ending || pm);
    if (rich && ctx.n > 1 && !ctx.last) { en.push('flowing on, not concluding'); zh.push('接著講'); }   // 不是結尾: 語調不要每一段都往下掉
    if (craft) { craft.en.forEach(function (x, i) { en.push(x); zh.push(craft.zh[i]); }); dr += craft.dr * k; dp += craft.dp * k; dv += craft.dv * k; }
    if (genre) en.push(genre.en);
    if (baseEn && !pm && !(ending && /^(rhetorical|vow|farewell)$/.test(ending.type))) String(baseEn).split(', ').forEach(function (x) { en.push(x); });
    return { style: fitStyle(uniq(en), rich ? 255 : (pm || ending) ? 230 : 130), ending: ending ? ending.type : '', poem: !!pm, label: zh.join('、'), dr: Math.round(dr * 1000) / 1000, dp: Math.round(dp * 1000) / 1000, dv: Math.round(dv * 1000) / 1000, emotion: emo ? emo.key : '', level: emo ? emo.level : 0, dialogue: dia, rhythm: rh ? rh.key : '', changed: changed };
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
  function richPauses(t, notFirst) { t = String(t == null ? '' : t); if (notFirst && /^[\u300C\u300E]/.test(t)) t = '<short pause>' + t; else if (notFirst && /^(?:突然|忽然|就在這時|說時遲|原來)/.test(t)) t = '<short pause>' + t; t = t.replace(/([\u3002!?\uFF01\uFF1F])(突然|忽然|就在這時|說時遲|原來)/g, '$1<short pause>$2'); return t.replace(/(\u2026\u2026|\u2014\u2014)(?!<)/g, '$1<short pause>').replace(/([\u3002!?\uFF01\uFF1F])([\u300C\u300E])/g, '$1<short pause>$2'); }
  /* ---------- 說書開場與收場 ----------
   * 依這篇故事現場「分析」出: 類型(武俠、浪漫、懸疑…)、整體情緒(有氣勢 / 浪漫唯美 / 悲傷 / 緊張)、故事裡出現的地點、時間氛圍(夜色、月色、風雪…)、主角(少年、姑娘、老者…),
   * 再從對應的一組開場白、收場白裡挑一句(同一篇每次挑到同一句, 不同篇不一樣), 把地點、氛圍、主角填進去. 不用另外呼叫 AI, 所以沒有等待、不耗額度.
   * 開場白、收場白是和第一段、最後一段「一起」送去合成的(不是獨立的一段), 所以聲音、音調、音量會自然接續. */
  var PLACE_RE = /華山|泰山|嵩山|少林寺|少林|武當山|武當|峨嵋|崑崙|江南|塞外|大漠|草原|東海|西湖|洞庭湖|長安|洛陽|金陵|蘇州|杭州|揚州|京城|皇城|小鎮|山谷|山巔|絕頂|竹林|客棧|茶棚|古寺|荒廟|城牆|碼頭|渡口|江邊|湖畔|海邊|森林|沙漠|雪山|星空|宇宙|太空|星艦|校園|教室|老宅|古宅|村莊|小村|海島|王府|皇宮|戰場|邊關|關外|北國|南國/;
  var TIME_RE = /深夜|午夜|夜|黃昏|夕陽|清晨|早晨|黎明|月|雨|雪|霧|星|風/, TIME_MAP = { '深夜': '夜色', '午夜': '夜色', '夜': '夜色', '黃昏': '黃昏', '夕陽': '夕陽', '清晨': '晨光', '早晨': '晨光', '黎明': '黎明', '月': '月色', '雨': '雨聲', '雪': '風雪', '霧': '霧色', '星': '星光', '風': '風聲' };
  var WHO_RE = /少年|少女|少俠|女俠|老人|老者|書生|劍客|俠客|姑娘|公子|將軍|公主|騎士|偵探|小女孩|小男孩|孩子|母親|父親|少爺|小姐|店小二|掌櫃/;
  var MOOD_GROUPS = { majestic: ['anger', 'resolve', 'pride', 'action', 'awe', 'solemn', 'urgent', 'carefree'], romantic: ['tender', 'shy'], sorrow: ['sad', 'longing'], dread: ['fear', 'mystery'] };
  var FLOURISH = {
    wuxia: {
      open: { plain: ['各位看倌, 且聽我說一段江湖恩怨。刀光劍影之中, 自有英雄氣概。', '話說這江湖, 從來不缺風雨。今天這一段, 說的是發生在{place}的一場大事。', '各位看倌, 茶續上, 耳朵豎起來。{time}之下, 一場好戲, 這就要開場了。', '俠骨柔腸, 恩怨情仇, 盡在這一段。且聽我慢慢道來。'],
        majestic: ['各位看倌, 把驚堂木拍響! {place}, 一場驚天動地的對決, 這就要開場了!', '天下武林, 風起雲湧。這一段, 說的是英雄氣概, 說的是一諾千金!', '劍氣縱橫三萬里, 一劍光寒十九州。各位看倌, 且聽這一段!'],
        romantic: ['各位看倌, 江湖再大, 也大不過一個情字。這一段, 說的是{who}心裡的那份牽掛。', '刀劍無情, 人有情。{time}裡, 有一句話, 藏了很多年。'],
        sorrow: ['各位看倌, 有些故事, 說著說著, 心就沉了。這一段, 請你靜靜地聽。'], dread: ['各位看倌, 江湖路上, 最怕的不是刀, 是看不見的影子。這一段, 請屏住呼吸。'] },
      close: { plain: ['這一戰, 勝負未分, 恩怨未了。欲知後事如何, 且聽下回分解。', '江湖路遠, 後會有期。欲知後事如何, 且聽下回分解。'], majestic: ['豪氣干雲, 俠義長存! 欲知後事如何, 且聽下回分解!', '一劍霜寒, 天下皆驚。後事如何, 且聽下回分解!'],
        romantic: ['刀光劍影散去, 留下的, 只有一個情字。後來如何, 且聽下回分解。'], sorrow: ['風過無痕, 人去樓空。故事說到這裡, 且聽下回分解。'], dread: ['那究竟是誰? 要知真相, 且聽下回分解。'] } },
    romance: {
      open: { plain: ['各位看倌, 今天這一段, 說的是一個情字。', '{time}, 有一個{who}, 心裡藏著一句沒說出口的話。各位看倌, 請聽。', '世間情事, 最是纏綿。這一段, 請你輕輕地聽。'],
        romantic: ['各位看倌, 今夜不說刀劍, 只說兩顆心, 如何慢慢靠近。', '月色溫柔, 心事如水。這一段, 說給有情人聽。'], sorrow: ['有些人, 遇見了, 卻留不住。這一段, 請你靜靜地聽。'] },
      close: { plain: ['情之一字, 最是難解。後來如何, 且聽下回分解。', '話還沒說完, 心卻已經遠了。且聽下回分解。'], romantic: ['故事停在這裡, 心卻還在原地。且聽下回分解。'], sorrow: ['緣來緣去, 終是一場夢。且聽下回分解。'] } },
    detective: {
      open: { plain: ['各位看倌, 這一樁案子, 可得仔細聽。每一個細節, 都不能放過。', '{place}發生了一件怪事。各位看倌, 請把耳朵借我, 聽我一步一步說來。'], dread: ['各位看倌, 真相往往藏在最不起眼的地方。這一段, 請你仔細聽。'] },
      close: { plain: ['真相是否如你所想? 且聽下回分解。', '線索都擺在眼前, 你看出來了嗎? 且聽下回分解。'] } },
    suspense: {
      open: { plain: ['各位看倌, 可要豎起耳朵, 這一段, 有點嚇人。', '{time}, 一切看似平靜, 卻有什麼事, 正悄悄靠近。各位看倌, 請聽。'], dread: ['各位看倌, 夜深了, 這一段, 請你屏住呼吸。'] },
      close: { plain: ['後事如何? 且聽下回分解。', '門外的, 究竟是誰? 且聽下回分解。'] } },
    horror: {
      open: { plain: ['各位看倌, 夜深人靜, 這一段, 膽小的人別聽。', '{place}的傳聞, 說了幾十年。今天, 就說給你聽。'] },
      close: { plain: ['那是什麼? 且聽下回分解。', '別回頭。且聽下回分解。'] } },
    war: {
      open: { plain: ['各位看倌, 且聽我說一段金戈鐵馬的往事。', '{place}, 號角連天, 千軍萬馬, 風雲變色。各位看倌, 請聽。'], majestic: ['烽火連天, 旌旗蔽日! 各位看倌, 這一段, 說的是氣壯山河的一戰!'], sorrow: ['戰場之上, 沒有人是贏家。這一段, 請你靜靜地聽。'] },
      close: { plain: ['天下大勢, 且聽下回分解。', '一將功成萬骨枯。且聽下回分解。'], majestic: ['鐵騎踏破山河, 大旗獵獵作響! 且聽下回分解!'] } },
    scifi: {
      open: { plain: ['各位看倌, 這一段, 要請你放開想像。', '各位看倌, 故事要從{place}開始說起, 請放開你的想像。'] },
      close: { plain: ['未知的盡頭, 且聽下回分解。', '答案, 也許比想像更遠。且聽下回分解。'] } },
    comedy: {
      open: { plain: ['各位看倌, 這一段可有趣了, 先說好, 不准笑。', '話說有這麼一個{who}, 做了一件讓人哭笑不得的事。'] },
      close: { plain: ['笑完了沒有? 且聽下回分解。', '你說, 這是不是個活寶? 且聽下回分解。'] } },
    lyrical: {
      open: { plain: ['夜深了, 各位看倌, 聽我慢慢說來。', '{time}, 悠悠地落下。這一段, 不急, 慢慢聽。'], romantic: ['月色如水, 心事輕輕。各位看倌, 這一段, 說給安靜的人聽。'], sorrow: ['有些話, 不必說太大聲。這一段, 請你靜靜地聽。'] },
      close: { plain: ['餘韻悠悠, 且聽下回分解。', '{time}還在, 故事, 卻先走遠了。且聽下回分解。'], sorrow: ['人散了, 夢還在。且聽下回分解。'] } },
    story: {
      open: { plain: ['各位看倌, 且聽我說來。', '話說很久以前, 在{place}, 有這麼一段故事。'] },
      close: { plain: ['且聽下回分解。', '故事說到這裡, 且聽下回分解。'] } }
  };
  function factsOf(text) {   // 從故事裡找出地點、時間氛圍、主角; 找不到的留空
    var t = String(text || ''), p = PLACE_RE.exec(t), tm = TIME_RE.exec(t), w = WHO_RE.exec(t);
    return { place: p ? p[0] : '', time: tm ? TIME_MAP[tm[0]] || '' : '', who: w ? w[0] : '' };
  }
  function moodOf(text) {   // 整篇的情緒: majestic(有氣勢)、romantic(浪漫唯美)、sorrow(悲傷)、dread(緊張害怕), 都不明顯就 plain
    var t = String(text || ''), best = 'plain', sc = 1, k;
    ['majestic', 'romantic', 'sorrow', 'dread'].forEach(function (m) { var n = 0; MOOD_GROUPS[m].forEach(function (e) { n += distinctHits(EMOS[e].re, t); }); if (n > sc) { sc = n; best = m; } });
    return best;
  }
  function pickIdx(content, salt, n) { var h = parseInt(hash(String(content) + '|' + salt).slice(0, 6), 36) || 0; return h % n; }
  function fillTpl(tpl, f) { return tpl.replace(/\{(place|time|who)\}/g, function (m, k) { return f[k]; }); }
  function usable(tpl, f) { var need = tpl.match(/\{(place|time|who)\}/g) || []; return need.every(function (m) { return !!f[m.slice(1, -1)]; }); }
  function flourishFor(content, genre) {   // → { open, close, mood, facts } 或 null(沒有故事類型就不加)
    if (!genre || !FLOURISH[genre.key]) return null;
    var F = FLOURISH[genre.key], f = factsOf(content), mood = moodOf(content);
    function choose(side, salt) {
      var pools = F[side], list = (pools[mood] || pools.plain).filter(function (x) { return usable(x, f); });
      if (!list.length) list = pools.plain.filter(function (x) { return usable(x, f); });
      if (!list.length) list = pools.plain.filter(function (x) { return !/\{/.test(x); });
      if (!list.length) return '';
      return fillTpl(list[pickIdx(content, salt + genre.key + mood, list.length)], f);
    }
    var open = choose('open', 'o'), close = choose('close', 'c');
    return open || close ? { open: open, close: close, mood: mood, facts: f } : null;
  }
  // 這一段實際要念的文字(含合併進來的開場白、收場白); 開場白、收場白和故事之間停一拍
  function speechOf(c) { return (c.open ? c.open + ' ' : '') + String(c.speak || c.text || '') + (c.close ? ' ' + c.close : ''); }

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
    return tw.slice().sort(function (a, b) { return voiceScore(b) - voiceScore(a); });
  }
  // 聲音的自然程度(愈高愈像真人): 微軟雲端「自然人聲」(曉臻、曉雨、雲哲) > Apple 進階/優化版 > Google 國語(臺灣) > Apple 美佳 > 其他雲端聲音 > 一般內建 > 舊式內建(涵涵、雅婷、志偉: 比較機械)
  function voiceTier(v) {
    var n = String(v && v.name || '');
    if (/natural|online|neural|multilingual/i.test(n)) return 300;
    if (/premium|enhanced|\u9032\u968e|\u512a\u5316|\u9ad8\u54c1\u8cea/i.test(n)) return 250;
    if (/google/i.test(n)) return 200;
    if (/mei-?jia|\u7f8e\u4f73/i.test(n)) return 150;
    if (v && v.localService === false) return 120;
    if (/hanhan|yating|zhiwei|desktop/i.test(n)) return 20;
    return 60;
  }
  function voiceScore(v) { return voiceTier(v) + (/zh[-_]TW|zh[-_]Hant/i.test(String(v && v.lang || '')) ? 100 : 0); }
  var brPick = '';   // 使用者自己挑的瀏覽器聲音(名字); 空的 = 自動挑最自然的
  var BR_SLOT = { p2: 0, p5: 0, p7: 0, p3: 1, p1: 1, p6: 1, p4: 2, p8: 2, p9: 0, p10: 1, p11: 1 };
  function brParams(pid) {   // { voice, rate, pitch }: 挑哪個瀏覽器聲音, 以及這個人設的基本語速與音高
    var b = BR[pid] || BR.p2, all = twVoices(), male = all.filter(function (v) { return MALE_RE.test(v.name || ''); }), fem = all.filter(function (v) { return !MALE_RE.test(v.name || ''); });
    var top0 = all.length ? voiceScore(all[0]) : 0;   // 這台電腦上最自然的聲音的分數; 比它差太多的(機械的舊式聲音)不採用
    var pool = b.male ? (male.length && voiceScore(male[0]) >= top0 - 100 ? male : (fem.length ? fem : all)) : (fem.length ? fem : all), v = null;
    if (b.prefer) v = pool.filter(function (x) { return b.prefer.test(x.name || '') && voiceScore(x) >= top0 - 40; })[0] || null;
    if (!v && pool.length) { var best = voiceScore(pool[0]), top = pool.filter(function (x) { return voiceScore(x) >= best - 40; }); v = top[(BR_SLOT[pid] || 0) % top.length]; }   // 只在「最自然的那一群」裡輪流, 不會落到機械的舊式聲音
    if (brPick) { var pv = all.filter(function (x) { return x.name === brPick; })[0]; if (pv) v = pv; }
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

  /* ---------- 接續更順(自然人聲): 整句、多句一起念 ----------
   * 自然人聲(微軟自然人聲、Google 國語、Apple 進階/美佳)自己會處理逗號與句號的停頓、語調與問句上揚;
   * 把句子切成小句各念一次, 每個小句的尾音都會「落下去」, 聽起來像一小段一小段背稿, 還要多等一次啟動時間.
   * 做法: 同一段敘述的句子合成一次念(最多約 60 字, 避免瀏覽器念太久被中斷), 句與句之間的短停頓留給標點;
   * 只有「需要真的停一下」的地方才分開念, 停多久看前後文: 問句與驚嘆之後、說話與旁白交界、換人說話、刪節號、開場收場與結尾句、段落結束. */
  var brFlow = false;   // 預設「一個小句一個小句念」(每句語調起伏較清楚); 在面板勾「接續更順(整句念)」才整句念
  var brGap = 1;        // 停頓長短的倍率: 0.8 緊湊 / 1 標準 / 1.3 從容(面板可選)
  var brSwing = 1;      // 語速起伏的倍率: 0.5 平穩 / 1 標準 / 1.8 明顯(面板可選)
  var BR_MUL = 0.1, BR_SLEW0 = 0.05;   // 瀏覽器語音語速的相對起伏範圍(標準 ±10%)與相鄰兩次的最大變化(標準 5%); 乘上 brSwing
  function brMulRange() { var d = BR_MUL * brSwing; return { min: 1 - d, max: 1 + d, slew: BR_SLEW0 * brSwing }; }
  var BR_PITCH_MAX = 0.07, BR_PITCH_SLEW = 0.035, BR_VOL_MIN = 0.8, BR_VOL_SLEW = 0.1;   // 瀏覽器語音音高/音量的起伏範圍與相鄰小句最大變化: 聽起來要像「同一個人」在說話
  var BR_PRE_GAP = 120, brLatMs = 0;   // 停頓 ≤ BR_PRE_GAP 毫秒的小句提前排隊; brLatMs = 這個聲音從「叫它念」到「真的出聲」大約多久(念的時候邊量邊更新)
  function noteBrLat(ms) { if (!(ms >= 0) || ms > 3000) return; brLatMs = brLatMs ? brLatMs * 0.6 + ms * 0.4 : ms; }
  function brLat() { return Math.min(600, Math.round(brLatMs)); }   // 自然人聲要不要用「整句念」(可在面板關掉, 回到逐小句念)
  function flowCut(text, max) {   // 單句太長(> max 字)時在逗號處對半切, 兩半各自再檢查
    var t = String(text), n = t.replace(/\s/g, '').length;
    if (n <= max) return [t];
    var best = -1, mid = t.length / 2, re = /[,\u3001\uFF0C;\uFF1B:\uFF1A]/g, m;
    while ((m = re.exec(t))) { if (m.index >= 6 && t.length - m.index >= 6 && (best < 0 || Math.abs(m.index - mid) < Math.abs(best - mid))) best = m.index; }
    if (best < 0) return [t];
    return flowCut(t.slice(0, best + 1), max).concat(flowCut(t.slice(best + 1), max));
  }
  function flowUnits(sents, c, baseRate, k, endIdx, endSp, closeN, opt) {
    var CAP = 60, DLG = /[\u300C\u300E\u201C\u300D\u300F\u201D]/, Q = /[?\uFF1F]\s*[\u300D\u300F\u201D"]?$/, EX = /[!\uFF01]\s*[\u300D\u300F\u201D"]?$/, TR = /\u2026\s*[\u300D\u300F\u201D"]?$/;
    var openN = c.open ? splitSentences(exprBrowser(pronounce(forSpeech(c.open)))).length : 0, closeStart = c.close ? sents.length - closeN : -1;
    var scale = function (g) { return Math.round(g / Math.max(0.6, baseRate || 1) * (H.gapScale == null ? 1 : H.gapScale) * brGap); };
    // 先把每個句子(太長的在逗號處對半切)排成一串「句子片段」, 記下每一片段後面接下來要停多久(null = 不停, 和下一片段併在同一次念)
    var pieces = [];
    sents.forEach(function (sn, si) { flowCut(sn.text, 70).forEach(function (txt, pj, arr) { pieces.push({ si: si, text: txt, whole: pj === arr.length - 1 }); }); });
    pieces.forEach(function (p, i) {
      var nxt = pieces[i + 1], t = p.text; p.q = Q.test(t); p.ex = EX.test(t); p.trail = TR.test(t); p.dlg = DLG.test(t); p.gap = null;
      if (!nxt) return;
      if (!p.whole) { p.gap = 40; return; }   // 一個長句被切成兩半: 只換一口氣
      if (openN && p.si === openN - 1) p.gap = 250;   // 開場白和故事之間
      else if (c.close && nxt.si === closeStart) p.gap = 250;   // 故事和收場白之間
      else if (c.ending && nxt.si === endIdx) p.gap = endSp ? 320 : 200;   // 結尾句前面停一拍
      else if (c.ending && p.si === endIdx) p.gap = endSp ? 420 : 260;
      else if (p.trail) p.gap = 420;
      else if (p.q) p.gap = 200;   // 問句之後給聽的人一拍
      else if (p.ex) p.gap = 180;
      else if (p.dlg !== DLG.test(nxt.text)) p.gap = 120;   // 旁白 ⇄ 對白的交界
      else if (p.dlg && /[\u300D\u300F\u201D][\u3002.!?\uFF01\uFF1F\u2026,\uFF0C]*\s*$/.test(t) && /^[\u300C\u300E\u201C]/.test(nxt.text)) p.gap = 160;   // 一人說完、換另一人
    });
    var out = [], cur = null, idx = 0;
    function flush(gap) {
      if (!cur) return;
      var last = cur.last, dr = c.dr || 0, dp = c.dp || 0, dvu = c.dv || 0, isEnd = c.ending && cur.si0 === endIdx && cur.si1 === endIdx;
      if (idx === 0) dp += 0.02 * k;
      if (last.q) { dp += 0.05 * k; dr += 0.01; } if (last.ex) { dp += 0.04 * k; dr += 0.04 * k; }
      if (isEnd) { dr -= (endSp ? 0.06 : 0.03) * k; if (endSp) { dp -= 0.02 * k; dvu -= 0.04; if (c.ending === 'rhetorical' && last.q) dp -= 0.05 * k; } }
      var jt = jitter(cur.text); dp += jt[0] * 0.012; dr += jt[1] * 0.02;
      out.push({ text: cur.text, dr: dr, dp: dp, dv: dvu, gap: scale(gap) }); idx++; cur = null;
    }
    pieces.forEach(function (p, i) {
      var nxt = pieces[i + 1], t = p.text;
      if (cur && (cur.len + t.length > CAP)) flush(60);   // 太長就先念一段, 接著念下一段(只換一口氣)
      if (!cur) cur = { text: '', len: 0, last: p, si0: p.si, si1: p.si };
      if (cur.text && !/[,.;:!?\u3002\uFF0C\uFF01\uFF1F\uFF1B\uFF1A\u3001\u2026\u300D\u300F\u201D]$/.test(cur.text)) cur.text += '\uFF0C';   // 句子結尾沒標點: 補個逗號, 才不會和下一句黏在一起
      cur.text += t; cur.len += t.length; cur.last = p; cur.si1 = p.si;
      if (!nxt) return;
      if (p.gap !== null) flush(p.gap);
    });
    // 最後一組: 一個小段結束的停頓(段落結束停久一點; 段落中間切開的小段只停一下; 下一小段是對白時更緊)
    if (cur) {
      var lastP = cur.last, gapEnd = lastP.trail ? 450 : (lastP.q || lastP.ex) ? 240 : 300;
      if (!c.par) gapEnd = lastP.trail ? 400 : (lastP.q || lastP.ex) ? 160 : 120;
      if (c.par) gapEnd += 150;
      if (opt.next && lastP.dlg && /^[\s]*[\u300C\u300E\u201C]/.test(String(opt.next.text || ''))) gapEnd = Math.min(gapEnd, 140);
      if (c.ending) gapEnd += c.ending && /^(rhetorical|vow|farewell)$/.test(c.ending) ? 280 : 140;
      flush(gapEnd);
    }
    return out;
  }
  // 很長的小句(超過 14 個字)在連接詞前斷成兩半: 兩邊各至少 4 個字, 找最靠近中間的連接詞
  var SOFT_RE = /\u4f46\u662f|\u53ef\u662f|\u4e0d\u904e|\u7136\u800c|\u56e0\u70ba|\u6240\u4ee5|\u5982\u679c|\u5047\u5982|\u800c\u4e14|\u4e26\u4e14|\u7136\u5f8c|\u6216\u8005|\u9084\u662f|\u96d6\u7136|\u56e0\u6b64|\u65bc\u662f|\u63a5\u8457|\u540c\u6642|\u4f8b\u5982/g;
  function softSplit(p, depth) {
    var m = /^([\s\S]*?)([,;:\u3001\uFF0C\uFF1B\uFF1A]*)$/.exec(p), body = m ? m[1] : p, tail = m ? m[2] : '';
    if (body.length <= 14 || (depth || 0) >= 2) return [p];
    var best = -1, mid = body.length / 2, hit;
    SOFT_RE.lastIndex = 0;
    while ((hit = SOFT_RE.exec(body))) { if (hit.index >= 4 && body.length - hit.index >= 4 && (best < 0 || Math.abs(hit.index - mid) < Math.abs(best - mid))) best = hit.index; }
    if (best < 0) return [p];
    return softSplit(body.slice(0, best), (depth || 0) + 1).concat(softSplit(body.slice(best) + tail, (depth || 0) + 1));
  }
  function jitter(t) { var h = 7, i, s = String(t); for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return [((h % 201) - 100) / 100, (((h * 7) % 201) - 100) / 100]; }   // 兩個 -1~1 之間、依文字固定的數
  // 把一個小段拆成「分句」(逗號分開), 每個分句各自設語速/音高/停頓; c = { text, dr, dp, rich, par }
  function browserUnits(c, baseRate, opt) {
    var sents = splitSentences(exprBrowser(pronounce(forSpeech((c.open ? c.open + '\n' : '') + String(c.speak || c.text || '') + (c.close ? '\n' + c.close : ''))))), out = [], k = (c.rich ? 2 : 1) * (c.live ? 1.3 : 1) * (c.poem ? 1.3 : 1) * (c.pk === 2 ? 1.8 : c.pk === 1 ? 1.35 : 1);
    if (!sents.length) sents = [{ text: exprBrowser(pronounce(forSpeech(c.text))) }];
    var closeN = c.close ? splitSentences(exprBrowser(pronounce(forSpeech(c.close)))).length : 0, endIdx = Math.max(0, sents.length - 1 - closeN), endSp = /^(rhetorical|vow|farewell)$/.test(c.ending || '');
    if (opt && opt.flow && opt.natural && !c.poem) return flowUnits(sents, c, baseRate, k, endIdx, endSp, closeN, opt);   // 自然人聲: 整句念(詩詞、機械聲音仍逐小句)
    sents.forEach(function (sn, si) {
      var parts0 = String(sn.text).match(/[^,;:\u3001\uFF0C\uFF1B\uFF1A]+[,;:\u3001\uFF0C\uFF1B\uFF1A]*/g) || [sn.text], parts = [], soft = [];
      parts0.forEach(function (p0) { var pcs = c.poem ? [p0] : softSplit(p0); pcs.forEach(function (x, xi) { parts.push(x); soft.push(xi < pcs.length - 1); }); });   // 很長的小句在連接詞處斷開, 讓音高重新起頭, 不會一路平平念到底
      var q = /[?\uFF1F]\s*[\u300D\u300F\u201D"]?$/.test(sn.text), ex = /[!\uFF01]\s*[\u300D\u300F\u201D"]?$/.test(sn.text), trail = /\u2026\s*[\u300D\u300F\u201D"]?$/.test(sn.text);
      parts.forEach(function (p, j) {
        var last = j === parts.length - 1, dr = c.dr || 0, dp = c.dp || 0, dvu = c.dv || 0;
        if (j === 0) dp += 0.03 * k; if (last) { dp -= 0.04 * k; dr -= 0.03 * k; }   // 句首稍高、句尾下降變慢
        if (!last && j > 0) dp += 0.015 * k;   // 句子中間的小句尾音微微上揚(話還沒說完的語感)
        var jt = jitter(p); dp += jt[0] * 0.012; dr += jt[1] * 0.02;   // 每個小句有一點點不同(依文字固定, 同一句每次念都一樣), 聽起來不像機器重複同一個模子
        if (last && q) { dp += 0.11 * k; dr += 0.01; }   // 問句: 尾音上揚
        if (last && ex) { dp += 0.08 * k; dr += 0.06 * k; }   // 驚嘆: 加強
        if (c.ending && si === endIdx && last) { dr -= (endSp ? 0.06 : 0.03) * k; if (endSp) { dp -= 0.02 * k; dvu -= 0.04; if (c.ending === 'rhetorical' && q) dp -= 0.11 * k; } }   // 結尾: 放慢收住; 反問的尾音不上揚, 音量不加大
        var gap;
        if (soft[j]) gap = c.live ? 120 : 80;   // 斷在連接詞前: 只換一口氣, 不是真的停
        else if (!last) gap = /[,\uFF0C]$/.test(p) ? (c.live ? 290 : 150) : /[\u3001]$/.test(p) ? (c.live ? 160 : 90) : 230;   // live(口語節奏): 逗號處約 0.3 秒
        else gap = trail ? 650 : /[\u3002.]$/.test(p) ? 420 : (q || ex) ? 380 : 340;
        if (c.poem) gap = last ? (/[\u3002.]$/.test(p) ? 900 : 650) : 460;   // 詩詞: 句與句之間多停
        if (endSp && si === endIdx && j === parts.length - 2) gap += 260;   // 最後一小句前停一拍
        if (c.ending && si === endIdx && last) gap += endSp ? 420 : 200;   // 說完多留一點餘韻
        if (last && si === sents.length - 1 && c.par) gap += 380;   // 段落之間多停一下
        out.push({ text: p, dr: dr, dp: dp, dv: dvu, gap: Math.round(gap / Math.max(0.6, baseRate || 1) * (H.gapScale == null ? 1 : H.gapScale) * brGap) });
      });
    });
    return out;
  }

  /* ---------- 發音修正: 一字多音、阿拉伯數字 ----------
   * AI 語音和瀏覽器語音都分不清一字多音(例如「降龍十八掌」的「降」要念ㄒㄧㄤˊ, 卻被念成ㄐㄧㄤˋ)。
   * 做法: 朗讀前把「容易念錯的詞」換成「念法相同、不會念錯的字」(降龍→翔龍), 只換送去念的文字, 畫面上顯示的原文不變。
   * 格式「原詞>替代字」; 優先序: 老師在設定中心填的發音修正表 > 內建對照表 > 數字念法. 內建表依台灣教育部讀音, 可再補充。 */
  var PRON_TXT = [
    // 武俠: 招式、人名
    '降龍>翔龍 降魔>翔魔 降妖>翔妖 降服>翔服 降伏>翔伏 投降>投翔 受降>受翔 歸降>歸翔 招降>招翔 勸降>勸翔 迎降>迎翔',
    '令狐>另狐 令尊>另尊 令堂>另堂 令郎>另郎 令嬡>另嬡 令愛>另愛 令兄>另兄 華山論劍>畫山論劍 華山派>畫山派 華山劍宗>畫山劍宗 華山氣宗>畫山氣宗 任我行>人我行 任盈盈>人盈盈 任大小姐>人大小姐 任教主>人教主 單雄信>善雄信 單于>蟬于 尉遲>鬱遲 長孫>掌孫 曾國藩>增國藩 曾祖>增祖 曾孫>增孫 查良鏞>扎良鏞',
    '英雄傳>英雄撰 外傳>外撰 正傳>正撰 前傳>前撰 本傳>本撰 別傳>別撰 傳記>撰記 自傳>自撰 評傳>評撰 列傳>列撰 水滸傳>水滸撰',
    // 詩詞常見讀音(台灣): 思量(ㄌㄧㄤˊ)、應(ㄧㄥ)、衰(ㄘㄨㄟ)、行(ㄏㄤˊ)、朝(ㄓㄠ)、重陽(ㄔㄨㄥˊ)、數(ㄕㄨˇ)
    '思量>思良 應不識>英不識 鬢毛衰>鬢毛催 淚千行>淚千航 一行白鷺>一航白鷺 朝辭>招辭 重陽>崇陽 數風流>鼠風流',
    // 行(ㄏㄤˊ)
    '行業>航業 行情>航情 行家>航家 內行>內航 外行>外航 銀行>銀航 排行>排航 行列>航列 各行各業>各航各業 行當>航當',
    // 長(ㄓㄤˇ)
    '長大>掌大 成長>成掌 生長>生掌 滋長>滋掌 增長>增掌 長輩>掌輩 長者>掌者 長子>掌子 長女>掌女 長兄>掌兄 長姊>掌姊 長姐>掌姐 長老>掌老 長進>掌進 年長>年掌',
    '校長>校掌 班長>班掌 組長>組掌 隊長>隊掌 船長>船掌 村長>村掌 市長>市掌 縣長>縣掌 部長>部掌 院長>院掌 社長>社掌 會長>會掌 首長>首掌 族長>族掌 家長>家掌 師長>師掌 長官>掌官',
    '艦長>艦掌 機長>機掌 廠長>廠掌 局長>局掌 處長>處掌 科長>科掌 課長>課掌 館長>館掌 所長>所掌 站長>站掌 董事長>董事掌 總長>總掌 議長>議掌 酋長>酋掌',
    // 了(ㄌㄧㄠˇ)
    '了解>瞭解 了結>瞭結 不得了>不得瞭 了不起>瞭不起 了卻>瞭卻 了然>瞭然 了得>瞭得',
    // 樂(ㄩㄝˋ)
    '音樂>音悅 樂器>悅器 樂曲>悅曲 樂團>悅團 樂章>悅章 國樂>國悅 聲樂>聲悅 樂隊>悅隊 樂譜>悅譜 樂師>悅師 樂府>悅府 管弦樂>管弦悅 交響樂>交響悅 配樂>配悅 古樂>古悅 樂壇>悅壇 樂迷>悅迷 樂風>悅風 樂手>悅手 民樂>民悅',
    // 重(ㄔㄨㄥˊ)
    '重新>崇新 重複>崇複 重逢>崇逢 重來>崇來 重疊>崇疊 重建>崇建 重演>崇演 重返>崇返 重現>崇現 重生>崇生 重溫>崇溫 重寫>崇寫 重做>崇做 重回>崇回 重聚>崇聚 重遊>崇遊 重蹈覆轍>崇蹈覆轍 重整>崇整 重組>崇組 重修>崇修 重振>崇振 重燃>崇燃 重拾>崇拾 重唱>崇唱 重播>崇播 重審>崇審 重考>崇考 重開>崇開 重啟>崇啟',
    // 還(ㄏㄨㄢˊ)
    '歸還>歸環 償還>償環 還錢>環錢 還債>環債 還原>環原 還給>環給 還手>環手 還擊>環擊 還俗>環俗 還魂>環魂 還鄉>環鄉 還禮>環禮 還款>環款 還書>環書 退還>退環 奉還>奉環 交還>交環 返還>返環 還願>環願 還清>環清 還陽>環陽 以牙還牙>以牙環牙 以眼還眼>以眼環眼',
    // 背(ㄅㄟ)
    '背包>揹包 背負>揹負 背起>揹起 背著>揹著 背囊>揹囊 背簍>揹簍 背黑鍋>揹黑鍋 背債>揹債 背劍>揹劍 背刀>揹刀 背弓>揹弓',
    // 著(ㄓㄨˋ)、數(ㄕㄨˇ)
    '著名>注名 著作>注作 顯著>顯注 卓著>卓注 著稱>注稱 著述>注述 數一數>鼠一鼠 數數看>鼠數看 數不清>鼠不清 數不勝數>鼠不勝鼠 屈指可數>屈指可鼠 數得清>鼠得清 數一數二>鼠一鼠二 數落>鼠落 數來數去>鼠來鼠去 數九寒天>鼠九寒天',
    // 假(ㄐㄧㄚˋ)、空(ㄎㄨㄥˋ)、差(ㄔㄞ)、處(ㄔㄨˋ)
    '放假>放架 請假>請架 休假>休架 暑假>暑架 寒假>寒架 病假>病架 度假>度架 假日>架日 假期>架期 假單>架單 年假>年架 事假>事架 婚假>婚架 產假>產架 補假>補架 連假>連架 告假>告架',
    '空閒>控閒 有空>有控 沒空>沒控 抽空>抽控 空檔>控檔 空地>控地 空位>控位 空格>控格 空暇>控暇',
    '出差>出拆 差事>拆事 差遣>拆遣 差役>拆役 差使>拆使 公差>公拆 朝氣>招氣',
    '到處>到觸 好處>好觸 壞處>壞觸 益處>益觸 用處>用觸 處處>觸觸 住處>住觸 去處>去觸 長處>長觸 短處>短觸 難處>難觸 苦處>苦觸 痛處>痛觸 妙處>妙觸 深處>深觸 高處>高觸 低處>低觸 遠處>遠觸 近處>近觸 暗處>暗觸 何處>何觸 某處>某觸 別處>別觸 各處>各觸 四處>四觸 出處>出觸',
    // 載、藏、乘、解、盛、卷、參
    '記載>記宰 刊載>刊宰 轉載>轉宰 登載>登宰 連載>連宰 千載難逢>千宰難逢 千載>千宰',
    '寶藏>寶葬 西藏>西葬 藏經>葬經 藏文>葬文 藏傳>葬傳 藏族>葬族 大藏經>大葬經 道藏>道葬',
    '大乘>大剩 小乘>小剩 上乘>上剩 佛乘>佛剩 千乘>千剩 萬乘>萬剩 押解>押借 解送>借送 起解>起借',
    '盛飯>成飯 盛湯>成湯 盛菜>成菜 盛水>成水 盛酒>成酒 盛滿>成滿 盛粥>成粥',
    '考卷>考倦 試卷>試倦 卷宗>倦宗 書卷>書倦 畫卷>畫倦 卷軸>倦軸 長卷>長倦 上卷>上倦 下卷>下倦 手卷>手倦 答卷>答倦 案卷>案倦 卷帙>倦帙',
    '人參>人深 丹參>丹深 黨參>黨深 海參>海深',
    // 好(ㄏㄠˋ)、惡(ㄨˋ)、調(ㄉㄧㄠˋ)、分(ㄈㄣˋ)
    '好學>耗學 好奇>耗奇 好客>耗客 好色>耗色 好勝>耗勝 愛好>愛耗 嗜好>嗜耗 好強>耗強 好戰>耗戰 好勇鬥狠>耗勇鬥狠 好高騖遠>耗高騖遠 好大喜功>耗大喜功 好為人師>耗為人師 好吃懶做>耗吃懶做 好逸惡勞>耗逸惡勞 好事者>耗事者 好管閒事>耗管閒事',
    '厭惡>厭誤 憎惡>憎誤 可惡>可誤 好惡>耗誤 深惡痛絕>深誤痛絕 嫉惡如仇>嫉誤如仇 惡心>噁心',
    '調查>掉查 調動>掉動 強調>強掉 聲調>聲掉 語調>語掉 曲調>曲掉 腔調>腔掉 調度>掉度 調派>掉派 調換>掉換 調職>掉職 調任>掉任 調兵>掉兵 調遣>掉遣 調虎離山>掉虎離山 調走>掉走 調集>掉集 調閱>掉閱 格調>格掉 論調>論掉 低調>低掉 高調>高掉 基調>基掉 色調>色掉 音調>音掉 步調>步掉 調頭>掉頭',
    '身分>身奮 部分>部奮 成分>成奮 緣分>緣奮 本分>本奮 過分>過奮 安分>安奮 福分>福奮 天分>天奮 名分>名奮 養分>養奮 水分>水奮 充分>充奮 鹽分>鹽奮 糖分>糖奮',
    // 屏、咽、累、露
    '屏息>餅息 屏氣>餅氣 屏住>餅住 屏除>餅除 哽咽>哽夜 嗚咽>嗚夜 吞咽>吞燕 咽下>燕下 咽氣>燕氣',
    '累積>壘積 累計>壘計 連累>連壘 累贅>壘贅 積累>積壘 牽累>牽壘 拖累>拖壘 累犯>壘犯 累月>壘月 累世>壘世 累卵>壘卵',
    '露出>漏出 露面>漏面 露臉>漏臉 露餡>漏餡 露馬腳>漏馬腳 露一手>漏一手 露骨>漏骨 露富>漏富 露怯>漏怯 露相>漏相',
    // 當(ㄉㄤˋ)、將(ㄐㄧㄤˋ)、率(ㄕㄨㄞˋ / ㄌㄩˋ)、給(ㄐㄧˇ)、說(ㄕㄨㄟˋ)
    '當天>檔天 當作>檔作 當成>檔成 適當>適檔 恰當>恰檔 妥當>妥檔 穩當>穩檔 上當>上檔 當真>檔真 當舖>檔舖 當鋪>檔鋪 典當>典檔',
    '大將>大匠 老將>老匠 名將>名匠 上將>上匠 將領>匠領 將士>匠士 武將>武匠 猛將>猛匠 良將>良匠 兵將>兵匠 敗將>敗匠 戰將>戰匠 悍將>悍匠 將帥>匠帥 將相>匠相 將門>匠門',
    '率領>帥領 草率>草帥 輕率>輕帥 直率>直帥 坦率>坦帥 率先>帥先 統率>統帥 表率>表帥 率兵>帥兵 率眾>帥眾 率隊>帥隊',
    '效率>效律 比率>比律 機率>機律 概率>概律 頻率>頻律 利率>利律 速率>速律 匯率>匯律 稅率>稅律 成功率>成功律 失敗率>失敗律 死亡率>死亡律 出生率>出生律 命中率>眾律',
    '供給>供己 補給>補己 給予>己予 自給>自己 配給>配己 遊說>遊稅 說客>稅客',
    // 種(ㄓㄨㄥˋ)、中(ㄓㄨㄥˋ)
    '種田>眾田 種花>眾花 種樹>眾樹 種菜>眾菜 種下>眾下 種植>眾植 播種>播眾 栽種>栽眾 種地>眾地 種麥>眾麥 種瓜>眾瓜 種豆>眾豆 種稻>眾稻 種草>眾草 耕種>耕眾',
    '命中>命眾 擊中>擊眾 射中>射眾 猜中>猜眾 刺中>刺眾 砍中>砍眾 劈中>劈眾 擲中>擲眾 砸中>砸眾 踢中>踢眾',
    '中箭>眾箭 中毒>眾毒 中彈>眾彈 中獎>眾獎 中計>眾計 中邪>眾邪 中暑>眾暑 中風>眾風 中招>眾招 中掌>眾掌 中劍>眾劍 中刀>眾刀 中針>眾針 中蠱>眾蠱 中標>眾標 中意>眾意 中暗算>眾暗算 中埋伏>眾埋伏 中圈套>眾圈套 中頭獎>眾頭獎 中樂透>眾樂透 中拳>眾拳 中槍>眾槍'
  ].join(' ');
  var pronTab = null;
  function pronBuiltin() {   // 內建對照表: 長的詞排前面(先換長詞, 例如「命中率」要比「命中」先換)
    if (pronTab) return pronTab;
    pronTab = PRON_TXT.split(/\s+/).map(function (x) { var i = x.indexOf('>'); return i > 0 ? [x.slice(0, i), x.slice(i + 1)] : null; }).filter(Boolean).sort(function (a, b) { return b[0].length - a[0].length; });
    return pronTab;
  }
  function pronUser() {   // 老師在設定中心填的發音修正表: 每行「原詞=念法」(也接受 > 或 →), 最多 200 行
    var raw = ''; try { raw = String((cfg() || {}).pron || ''); } catch (e) {}
    return raw.split(/\r?\n/).slice(0, 200).map(function (ln) { var m = /^\s*([^=>\uFF1D\u2192\s][^=>\uFF1D\u2192]{0,19}?)\s*(?:=|>|\uFF1D|\u2192)\s*(\S.{0,39}?)\s*$/.exec(ln); return m ? [m[1], m[2]] : null; }).filter(Boolean).sort(function (a, b) { return b[0].length - a[0].length; });
  }
  var ZD = '零一二三四五六七八九';
  function digitsZh(x) { return String(x).replace(/\d/g, function (d) { return ZD.charAt(+d); }); }
  function grpZh(g) {   // 1~9999 → 中文數字
    var d = [Math.floor(g / 1000) % 10, Math.floor(g / 100) % 10, Math.floor(g / 10) % 10, g % 10], U = ['千', '百', '十', ''], s = '', z = false, k;
    for (k = 0; k < 4; k++) { if (d[k] === 0) { if (s && k < 3) z = true; } else { if (z) { s += '零'; z = false; } s += ZD.charAt(d[k]) + U[k]; } }
    return s;
  }
  function cardinalZh(n) {   // 0 ~ 99999999 → 十八、一百一十、一千零一、一萬二千…
    if (n === 0) return '零';
    var parts = [], B = ['', '萬', '億'], res = '', i;
    while (n > 0) { parts.push(n % 10000); n = Math.floor(n / 10000); }
    for (i = parts.length - 1; i >= 0; i--) { var g = parts[i]; if (g === 0) continue; if (res && (parts[i + 1] === 0 || g < 1000)) res += '零'; res += grpZh(g) + B[i]; }
    return res.replace(/^一十/, '十');
  }
  // 阿拉伯數字念成中文: 18→十八、2歲→兩歲、3.14→三點一四、50%→百分之五十; 年份(2024年)、電話/編號(5 位以上、0 開頭)逐字念; 和英文字母相連的(ESP32、3D、v1.2)不動
  function numbersZh(t) {
    t = String(t == null ? '' : t).replace(/(\d{1,3})((?:,\d{3})+)(?!\d)/g, function (m, a, b) { return a + b.replace(/,/g, ''); });
    return t.replace(/(^|[^A-Za-z0-9._\-\/:#@])(\d+(?:\.\d+)?)(%?)(?![A-Za-z0-9:]|\.\d)(?=(.?))/g, function (m, pre, num, pct, nx) {
      if (num.indexOf('.') >= 0) { var a = num.split('.'); return pre + (/^0\d/.test(a[0]) ? digitsZh(a[0]) : cardinalZh(+a[0])) + '點' + digitsZh(a[1]) + (pct ? '' : ''); }
      var len = num.length, v = parseInt(num, 10), z;
      if (pct) return pre + '百分之' + (len >= 9 ? digitsZh(num) : cardinalZh(v));
      if (/^0\d/.test(num) || len >= 9) return pre + digitsZh(num);
      if (len === 4 && /^(19|20)\d\d$/.test(num) && /^[\u5E74\-\/.]/.test(nx)) return pre + digitsZh(num);
      if (len >= 5 && v % 1000 !== 0 && !/[\u5143\u4EBA\u500B\u516C\u65A4\u514B\u6B21\u540D\u5F35\u689D\u96BB\u4EF6\u7B46\u9801\u5B57\u842C\u5206\u79D2\u7C73\u5EA6\u584A]/.test(nx)) return pre + digitsZh(num);
      z = cardinalZh(v);
      if (v === 2 && /[\u500B\u4F4D\u6B21\u96BB\u689D\u5F35\u4EF6\u4EBA\u5929\u540D\u9593\u8F1B\u672C\u9846\u7247\u9053\u652F\u5834\u5957\u7A2E\u96D9\u5C0D\u7D44\u6B72]/.test(nx)) z = '\u5169';
      return pre + z;
    });
  }
  function pronounce(t) {   // 朗讀用的文字: 套用老師的修正表 → 內建對照表 → 數字念法(畫面上的原文不變)
    t = String(t == null ? '' : t);
    var user = pronUser(), keep = [], i, j, tab = pronBuiltin();
    for (i = 0; i < user.length; i++) if (t.indexOf(user[i][0]) >= 0) { keep.push(user[i][1]); t = t.split(user[i][0]).join('' + String.fromCharCode(0xE100 + keep.length - 1) + ''); }
    for (j = 0; j < tab.length; j++) if (t.indexOf(tab[j][0]) >= 0) t = t.split(tab[j][0]).join(tab[j][1]);
    t = numbersZh(t);
    return keep.length ? t.replace(/([-])/g, function (m, c) { return keep[c.charCodeAt(0) - 0xE100]; }) : t;
  }
  // AI 人聲的逐字稿:在轉折詞前加 <short pause>(Gemini 的英文標籤,中文逐字稿也用英文標籤)
  function aiScript(c) {   // 送給 AI 人聲的逐字稿(念法修正、表情標籤、說書人的停頓、轉折前停頓); 合成、預先準備、算聲音長度都用它, 才會對得上同一個快取
    var sp = (c.open ? c.open + ' <short pause> ' : '') + (c.poem ? String(c.speak || c.text || '') : endPause(String(c.speak || c.text || ''))) + (c.close ? ' <short pause> ' + c.close : '');   // 開場白、收場白和故事之間停一拍
    var sc = laughTags(exprText(pronounce(forSpeech(sp)))); if (c.rich) sc = richPauses(keyLinePause(sc), !c.first);
    if (c.poem) sc = sc.replace(/([\uFF0C\u3001\uFF1B,;])(?=[^\s<])/g, '$1<short pause>');   // 詩詞: 每一句之間換一口氣
    if (c.live) sc = sc.replace(/([^\s,\uFF0C<>]{3,}[,\uFF0C])(?=[^\s<])/g, '$1<short pause>');   // 口語節奏: 逗號處留一拍(一口氣短、短停頓多)
    return withPauses(sc);
  }
  function withPauses(t) { return t.replace(/([^\s\u3002!?,;\u3001\uFF0C\uFF01\uFF1F\uFF1B])(但是|可是|不過|然而)/g, '$1<short pause>$2').replace(/([,\u3001\uFF0C])(但是|可是|不過|然而)/g, '$1<short pause>$2'); }

  // 說話方式(speech_metadata.style): 一般人設只送「這則貼文的語氣」(短短一句英文), 保留各人設原本的聲音特色; 只有「仿曉臻/仿 TTSMaker」這類有自己 style 的人設, 才在前面加上它的說話方式
  function clipStyle(str, max) { str = String(str || ''); if (str.length <= max) return str; var cut = str.slice(0, max), i = cut.lastIndexOf(', '); return (i > max * 0.5 ? cut.slice(0, i) : cut).replace(/[,\s]+$/, ''); }
  function styleFor(personaId, toneStyle) {
    var ps = personaStyle(personaId); if (!ps) return toneStyle || '';
    if (!toneStyle) return ps;
    var room = 800 - ps.length - 7;   // 送給 Gemini 的語氣描述最多 800 字: 人設的說話方式佔掉的以外, 才是這一段的語氣
    return room >= 30 ? ps + ' Tone: ' + clipStyle(toneStyle, room) : ps;
  }
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
  // 每一段聲音檔的長度(秒): 由 WAV 檔大小直接算(24kHz、單聲道、16-bit: 每秒 48000 位元組); 合成完或從存起來的取出時就知道, 用來顯示「分:秒」和進度

  /* ---------- 段與段的銜接 ----------
   * 每一段都是各自合成的聲音檔, 直接接起來常有問題: 前後有長短不一的靜音(接縫忽快忽慢)、尾巴被切得很硬或有爆音、兩段音量不一樣、每段結尾都像「講完了」。
   * 做法: (1) 每段聲音檔去掉多餘的頭尾靜音、音量調成一致、加上極短的淡入淡出(合成後只做一次, 存起來);
   *       (2) 段與段之間的停頓由我們決定: 看前一段結尾的標點與有沒有換段, 句號、驚嘆號、段落、說書人各有不同的長度;
   *       (3) 該換氣的地方(換段、前一段很長)補一聲輕輕的吸氣聲(可在朗讀列關閉);
   *       (4) 送給 AI 的語氣描述會註明「這一段不是結尾、接著還有」, 結尾的語調才不會每段都往下掉。 */
  var stats = { breath: 0, processed: 0 };
  function wavParse(b64) {   // → { sr, pcm: Int16Array } 或 null(不是 16-bit 單聲道 PCM WAV 就不處理)
    try {
      var bin = global.atob(String(b64 || '')), n = bin.length; if (n < 64) return null;
      var u8 = new Uint8Array(n), i; for (i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
      var dv = new DataView(u8.buffer);
      if (bin.substr(0, 4) !== 'RIFF' || bin.substr(8, 4) !== 'WAVE') return null;
      var pos = 12, sr = 0, bits = 0, ch = 0, fmt = 0, off = -1, len = 0;
      while (pos + 8 <= n) {
        var id = bin.substr(pos, 4), sz = dv.getUint32(pos + 4, true);
        if (id === 'fmt ') { fmt = dv.getUint16(pos + 8, true); ch = dv.getUint16(pos + 10, true); sr = dv.getUint32(pos + 12, true); bits = dv.getUint16(pos + 22, true); }
        else if (id === 'data') { off = pos + 8; len = Math.min(sz, n - off); break; }
        pos += 8 + sz + (sz % 2);
      }
      if (off < 0 || fmt !== 1 || ch !== 1 || bits !== 16 || !sr) return null;
      var cnt = len >> 1, pcm = new Int16Array(cnt); for (i = 0; i < cnt; i++) pcm[i] = dv.getInt16(off + i * 2, true);
      return { sr: sr, pcm: pcm };
    } catch (e) { return null; }
  }
  function wavBuild(pcm, sr) {
    var n = pcm.length, u8 = new Uint8Array(44 + n * 2), dv = new DataView(u8.buffer), i;
    function w(o, t) { for (var k = 0; k < t.length; k++) u8[o + k] = t.charCodeAt(k); }
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
    for (i = 0; i < n; i++) dv.setInt16(44 + i * 2, pcm[i], true);
    var out = '', CH = 0x8000; for (i = 0; i < u8.length; i += CH) out += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return global.btoa(out);
  }
  function trimNormalize(pcm, sr) {   // 去頭尾靜音(頭留 30 毫秒、尾留 60 毫秒)、音量只修正太小或太大的極端值(目標的 ±6 dB 內不動, 保留耳語與吶喊的對比)、淡入 8 毫秒、淡出 30 毫秒
    var n = pcm.length, win = Math.max(1, Math.round(sr * 0.01)), thr = 0.012 * 32768, first = -1, last = -1, w, i, j;
    for (w = 0; w * win < n; w++) { var s0 = w * win, e0 = Math.min(n, s0 + win), acc = 0; for (j = s0; j < e0; j++) acc += pcm[j] * pcm[j]; if (Math.sqrt(acc / (e0 - s0)) > thr) { if (first < 0) first = w; last = w; } }
    if (first < 0) return pcm;   // 整段都很安靜: 不動
    var a = Math.max(0, first * win - Math.round(sr * 0.03)), b = Math.min(n, (last + 1) * win + Math.round(sr * 0.06));
    if (b - a < sr * 0.2) return pcm;
    var out = new Int16Array(b - a), sum = 0, cnt = 0, v;
    for (i = a; i < b; i++) { v = pcm[i]; if (Math.abs(v) > thr * 0.5) { sum += v * v; cnt++; } }
    var rms = cnt ? Math.sqrt(sum / cnt) : 0, g = rms <= 0 ? 1 : rms < 0.05 * 32768 ? Math.min(2.5, (0.05 * 32768) / rms) : rms > 0.2 * 32768 ? Math.max(0.4, (0.2 * 32768) / rms) : 1, fi = Math.round(sr * 0.008), fo = Math.round(sr * 0.03), m = out.length;
    for (i = 0; i < m; i++) {
      v = pcm[a + i] * g; if (i < fi) v *= 0.5 - 0.5 * Math.cos(Math.PI * i / fi); if (i >= m - fo) v *= 0.5 - 0.5 * Math.cos(Math.PI * (m - 1 - i) / fo);
      out[i] = Math.max(-31800, Math.min(31800, Math.round(v)));
    }
    return out;
  }
  function processWav(b64) { try { var wv = wavParse(b64); if (!wv) return b64; stats.processed++; return wavBuild(trimNormalize(wv.pcm, wv.sr), wv.sr); } catch (e) { return b64; } }
  // 輕輕的吸氣聲: 柔和的氣流雜音(固定的亂數種子, 每次一樣), 慢慢變大再收掉, 音量很小(約 -27 dBFS)
  function breathPcm(ms, sr) {
    var n = Math.max(1, Math.round(sr * ms / 1000)), out = new Int16Array(n), seed = 12345, lp = 0, slow = 0, i;
    for (i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff; var x = (seed / 0x3fffffff) - 1;
      lp += 0.32 * (x - lp); slow += 0.02 * (lp - slow);
      var t = i / n, env = t < 0.6 ? Math.pow(t / 0.6, 1.6) : Math.pow((1 - t) / 0.4, 1.3);
      out[i] = Math.round((lp - slow) * env * 0.05 * 32768 * 2.2);
    }
    return out;
  }
  function withBreathWav(b64, ms) {   // 在這段聲音前面接上吸氣聲(再留 25 毫秒的空檔)
    try {
      var wv = wavParse(b64); if (!wv) return b64;
      var br = breathPcm(ms, wv.sr), gap = Math.round(wv.sr * 0.025), out = new Int16Array(br.length + gap + wv.pcm.length);
      out.set(br, 0); out.set(wv.pcm, br.length + gap); stats.breath++;
      return wavBuild(out, wv.sr);
    } catch (e) { return b64; }
  }
  // 段與段之間要停多久(毫秒): 依前一段結尾的標點; 換段、對話與旁白交替、說書人較長; breath = 要不要補吸氣聲(毫秒, 0 = 不補)
  function joinGapMs(prev, next, rich) {
    if (!prev || !next) return { gap: 0, breath: 0 };
    var t = String(prev.text || '').replace(/[\s\u300D\u300F\u201D"')\uFF09]+$/, ''), end = t.slice(-1), g = 150;
    if (/\u2026$/.test(t) || /\u2014$/.test(t)) g = 300; else if (/[\u3002.]/.test(end)) g = 170; else if (/[!?\uFF01\uFF1F]/.test(end)) g = 200; else if (/[,;\uFF0C\uFF1B\u3001]/.test(end)) g = 120;
    var DIA = /[\u300C\u300E\u201C"]/;
    if (DIA.test(String(prev.text || '')) !== DIA.test(String(next.text || ''))) g += 60;
    if (prev.par) g += 200;
    if (prev.poem) g = prev.poem.role === 'turn' ? 650 : 520;   // 詩詞: 一聯與一聯之間多留氣
    if (next.tail) g += 160;   // 最後一句(反問、誓言)前留一拍
    if (rich) g = Math.round(g * (prev.live ? 1.45 : 1.25));
    var len = effLen(prev.text), br = 0;
    if (prev.par || len >= 50 || (rich && len >= 30)) br = prev.par ? 220 : 170;
    return { gap: g, breath: br };
  }
  var durMem = {}, durVer = 0;
  function secOfWav(b64) { var n = String(b64 || '').length; if (n < 200) return 0; return Math.max(0, (n * 0.75 - 44) / 48000); }
  function secOfClip(b64) { return H.secOf ? H.secOf(b64) : secOfWav(b64); }
  function noteDur(key, sec) { if (sec > 0 && durMem[key] !== sec) { durMem[key] = sec; durVer++; } }
  function clipKey(text, voice, style, model) { return 'v1|' + (model || '') + '|' + voice + '|' + style + '|' + hash(text); }
  var inflight = {};
  function aiClip(text, voice, style, model) {
    var key = clipKey(text, voice, style, model);
    if (inflight[key]) return inflight[key];
    var pr = aiClip1(key, text, voice, style, model); inflight[key] = pr;
    var clear = function () { delete inflight[key]; }; pr.then(clear, clear);
    return pr;
  }
  function aiClip1(key, text, voice, style, model) {
    return cacheGet(key).then(function (hit) {
      if (hit && hit.b64) {
        var hb = hit.b64; if (!hit.p) { hb = processWav(hit.b64); cachePut(key, { b64: hb, mime: hit.mime || 'audio/wav', p: 1 }); }   // 舊的存檔也補做一次修整
        var s0 = secOfClip(hb); noteDur(key, s0); return { url: b64ToUrl(hb, hit.mime), cached: true, sec: s0, b64: hb };
      }
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
        var pb = processWav(j.audio);   // 去頭尾靜音、音量一致、淡入淡出(只做一次, 存起來的就是修整過的)
        cachePut(key, { b64: pb, mime: j.mime || 'audio/wav', p: 1 });
        var s1 = secOfClip(pb); noteDur(key, s1);
        return { url: b64ToUrl(pb, j.mime), cached: false, sec: s1, b64: pb };
      });
    });
  }

  /* ---------- 朗讀控制: 一段一段讀, 可暫停/繼續/停止 ----------
   * opts = { chunks:[{ text, start, end }], voice(聲音名), style, rate, model, onChunk(i,chunk), onState(state), onNote(msg) } */
  function Reader(o) {
    o.chunks = o.chunks.slice();   // 自己留一份(失敗時會把一段切成兩段, 不能動到外面的清單)
    var self = this; this.o = o; this.i = o.from || 0; this.state = 'idle'; this.token = 0; this.audio = null; this.pre = {}; this.engine = o.engine === 'browser' ? 'browser' : 'ai'; this.gapT = null; this.retries = {}; this.pend = 0; this.lastErr = null; this.seekFrac = o.fromFrac || 0; this.chunkT0 = 0; this.pausedAt = 0;
    function set(s) { self.state = s; if (o.onState) o.onState(s); }
    function say(m) { if (o.onNote) o.onNote(m); }
    function done() { set('idle'); if (o.onChunk) o.onChunk(-1); }
    function clearGap() { if (self.gapT) { clearTimeout(self.gapT); self.gapT = null; } }
    function fail(err, tok) {
      self.lastErr = err;
      if (tok !== self.token) return; clearWait();
      if (self.engine === 'ai' && (tooBig(err) || netFail(err) || (err && err.media)) && splitCurrent()) { run(tok); return; }   // 這一段太大、太久、連線中斷或聲音檔壞掉: 切成兩段再合成(比較小, 手機的網路也撐得住)
      if (self.engine === 'ai' && retryable(err) && retryLater(tok)) return;   // 暫時性的問題(網路不穩、每分鐘限流): 自動等一下再試, 先不要換成瀏覽器語音
      if (self.engine === 'ai' && o.onAiFail) { var h = false; try { h = o.onAiFail(err, self.i); } catch (e) {} if (h) return; }   // AI 人聲出問題(額度用完等): 讓朗讀列改用瀏覽器聲音接著念
      say((err && err.status === 429 ? '' : '朗讀失敗: ') + (err && err.message || '請稍後再試')); done();   // 額度用完(429)不是壞掉, 直接顯示說明
    }
    function tooBig(err) { var st = err && err.status; return st === 413 || st === 504 || st === 500 || st === 502; }
    function netFail(err) { var st = err && err.status; return !st || st === 408; }   // 沒有狀態碼 = 連線中斷、逾時
    function waitErr(err) { return !!err && err.status === 429 && /每分鐘|太頻繁|per.?minute/i.test(String(err.message || '')); }   // 每分鐘限流: 等幾秒就好, 不是今天額度用完
    function retryable(err) { var st = err && err.status; return netFail(err) || st >= 500 || waitErr(err) || !!(err && err.media); }
    function retryLater(tok) {   // 同一段最多自動重試 2 次; 回傳 true = 已排好重試
      var n = self.retries[self.i] || 0; if (n >= 2) return false;
      var w = (self.lastErr && waitErr(self.lastErr)) ? [7000, 14000][n] : [1200, 3500][n], sc = H.retryScale == null ? 1 : H.retryScale;
      self.retries[self.i] = n + 1; delete self.pre[self.i]; clearGap();
      say(self.lastErr && waitErr(self.lastErr) ? '現在同時合成語音的人比較多, 稍等幾秒再試…' : '網路不太穩, 正在重新連線…');
      self.gapT = setTimeout(function () { self.gapT = null; if (tok === self.token && self.state === 'playing') { say(''); run(tok); } }, Math.round(w * sc));
      return true;
    }
    function splitCurrent() {   // 把正在合成的這一段從句子中間對半切成兩段(至少 200 字、至少 2 句才切), 並把這台電腦的每段上限調小
      var c = o.chunks[self.i]; if (!c || String(c.text).length < 200) return false;
      var ss = splitSentences(c.text); if (ss.length < 2) return false;
      var total = 0, acc = 0, k = 0, i2, key; ss.forEach(function (q) { total += q.text.length; });
      for (i2 = 0; i2 < ss.length - 1; i2++) { acc += ss[i2].text.length; k = i2; if (acc >= total / 2) break; }
      var t1 = ss.slice(0, k + 1).map(function (q) { return q.text; }).join(''), t2 = ss.slice(k + 1).map(function (q) { return q.text; }).join('');
      if (!t1 || !t2) return false;
      var span = Math.max(0, (c.end || 0) - (c.start || 0)), mid = (c.start || 0) + Math.round(span * t1.length / (t1.length + t2.length)), c1 = {}, c2 = {};
      for (key in c) { c1[key] = c[key]; c2[key] = c[key]; }
      c1.text = t1; c1.end = mid; c1.par = false; c1.close = ''; c2.text = t2; c2.start = mid; c2.first = false; c2.open = '';   // 對半切: 開場白留在前半、收場白留在後半
      o.chunks.splice(self.i, 1, c1, c2); self.pre = {};
      try { global.localStorage.setItem('kb_tts_cap', String(Math.max(150, Math.floor(String(c.text).length / 2)))); } catch (e) {}
      say('這一段太長了, 自動切成兩段再合成…'); return true;
    }
    function clipFor(i) {
      if (self.pre[i]) return self.pre[i];
      var c = o.chunks[i]; if (!c) return null;
      var p = aiClip(aiScript(c), o.voice, c.style || o.style, o.model), tk = self.token; self.pre[i] = p; self.pend++;
      var settle = function () { self.pend = Math.max(0, self.pend - 1); if (tk === self.token && self.state === 'playing' && self.engine === 'ai') pump(); };   // 一個合成完, 就補上下一個(滾動式)
      p.then(settle, function () { if (self.pre[i] === p) delete self.pre[i]; self.pend = Math.max(0, self.pend - 1); });   // 失敗的不要記住(也不馬上再要, 免得一直失敗一直重試), 輪到那一段、或下一段開始時重新要
      return p;
    }
    // 滾動式預先合成: 播到第 i 段時, 先把後面最多 4 段準備好, 但同時進行的合成最多 3 個(免費版每分鐘有次數限制, 一次丟太多反而被擋); 每完成一個就補下一個
    var AHEAD = 4, MAXPAR = 3;
    function pump() {
      for (var k = 1; k <= AHEAD; k++) {
        var j = self.i + k; if (j >= o.chunks.length) break;
        if (self.pre[j]) continue;
        if (self.pend >= MAXPAR) break;
        var pf = clipFor(j); if (pf && pf.catch) pf.catch(function () {});
      }
    }
    // 這一段播完了: 依標點與段落停一下(必要時補吸氣聲), 再接下一段; 停頓期間可以暫停/停止
    function advance(tok) {
      var prev = o.chunks[self.i], nxt = o.chunks[self.i + 1]; self.i++;
      if (!nxt) return run(tok);
      var jg = joinGapMs(prev, nxt, !!prev.rich), rate = Math.max(0.5, Math.min(2, o.rate || 1)), sc = H.aiGap == null ? 1 : H.aiGap;
      self.breathMs = o.breath !== false && jg.breath ? jg.breath : 0;
      var ms = Math.round(jg.gap * sc / rate);
      if (ms <= 0) return run(tok);
      clearGap(); self.gapT = setTimeout(function () { self.gapT = null; run(tok); }, ms);
    }
    var waitT = null;
    function clearWait() { if (waitT) { clearTimeout(waitT); waitT = null; } if (self.waiting) { self.waiting = false; say(''); } }
    function speakAi(c, tok) {
      waitT = setTimeout(function () { if (tok === self.token && self.state === 'playing') { self.waiting = true; say('正在準備下一段聲音...'); } }, 600);
      var now = clipFor(self.i);   // 先要這一段, 再同時準備後面的
      pump();
      now.then(function (clip) {
        clearWait();
        if (tok !== self.token || self.state !== 'playing') return;
        var url = clip.url;
        if (self.breathMs && clip.b64) { try { url = b64ToUrl(withBreathWav(clip.b64, self.breathMs), 'audio/wav'); } catch (e) {} }   // 換氣的地方: 先一聲輕輕的吸氣, 再接這段
        self.breathMs = 0;
        var a = H.Audio ? new H.Audio(url) : new global.Audio(url); self.audio = a;
        if (self.seekFrac > 0) { var sf = self.seekFrac; self.seekFrac = 0; var setT = function () { if (a.duration > 0 && isFinite(a.duration)) { try { a.currentTime = Math.min(a.duration - 0.05, sf * a.duration); } catch (e) {} } }; a.onloadedmetadata = setT; setT(); }   // 拖到這一段中間: 從這段聲音的那個位置開始播
        try { a.playbackRate = Math.max(0.5, Math.min(2, o.rate || 1)); } catch (e) {}
        a.onended = function () { if (tok === self.token && self.state === 'playing') advance(tok); };
        a.onerror = function () { var me = new Error('聲音檔播放失敗'); me.media = true; fail(me, tok); };
        var p = a.play(); if (p && p.catch) p.catch(function (e) {
          if (tok !== self.token || (e && e.name === 'AbortError')) return;
          if (e && e.name === 'NotAllowedError') { self.token++; clearWait(); set('paused'); say('手機的瀏覽器擋住了自動播放, 請按一下「繼續」就會出聲。'); return; }   // 不是 AI 壞掉, 不要換成瀏覽器語音
          fail(e, tok);
        });
      }, function (err) { fail(err, tok); });
    }
    // 瀏覽器聲音: 一句一句、一個分句一個分句念; 每個分句依語氣調整語速與音高, 分句之間依標點停頓(和 AI 人聲同一套人設與語氣)
    function speakBrowser(c, tok) {
      var s = synth(); if (!s) { say('這個瀏覽器不支援朗讀。'); return done(); }
      var br = o.br || {}, units = browserUnits(c, o.rate, { flow: brFlow, natural: !!br.voice && voiceTier(br.voice) >= 150, next: o.chunks[self.i + 1] }), fired = [], us = [];
      function live() { return tok === self.token && self.state === 'playing'; }
      // 把第 i 個小句交給瀏覽器. 停頓很短(≤ 0.12 秒)的小句會在「前一個還在念」的時候就先排進瀏覽器的佇列, 瀏覽器念完上一句會馬上接著念, 沒有空白;
      // 需要停的地方用計時器, 並扣掉這個聲音「叫它念 → 真的出聲」的啟動延遲(雲端聲音常要 0.2~0.8 秒), 實際聽到的空白才會接近我們要的長度
      function fire(i, queuedBehind) {
        if (i >= units.length || fired[i] || !live()) return;
        fired[i] = true;
        var un = units[i], u = Utter(un.text), v = br.voice, t0 = Date.now(), finished = false, wd = null;
        if (v) { u.voice = v; u.lang = v.lang || 'zh-TW'; } else u.lang = 'zh-TW';
        // 語速: 情緒造成的起伏(憤怒、緊迫加快; 悲傷、溫柔放慢)標準只留 ±10%, 而且和上一個小句比最多差 5%(以前最多差一倍, 聽起來忽快忽慢); 面板的「語速變化」可選平穩/標準/明顯; 情緒主要靠音高、停頓、音量表現
        var rg = brMulRange(), mul = Math.max(rg.min, Math.min(rg.max, 1 + un.dr)), prevMul = self.brMul == null ? 1 : self.brMul;
        mul = prevMul + Math.max(-rg.slew, Math.min(rg.slew, mul - prevMul)); self.brMul = mul;
        u.rate = Math.max(0.5, Math.min(2, (o.rate || 1) * (br.rate || 1) * mul));
        // 音高、音量: 同一個人說話, 相鄰小句不能差太多(以前音高最多差 ±0.2、音量最低降到 0.25, 聽起來像換了一個人說話) —— 音高只在基準上下 BR_PITCH_MAX 內, 和上一個小句比最多差 BR_PITCH_SLEW; 音量不低於 BR_VOL_MIN, 相鄰最多差 BR_VOL_SLEW
        var bp = br.pitch || 1, pdv = Math.max(-BR_PITCH_MAX, Math.min(BR_PITCH_MAX, un.dp)), pPrev = self.brPd == null ? 0 : self.brPd;
        pdv = pPrev + Math.max(-BR_PITCH_SLEW, Math.min(BR_PITCH_SLEW, pdv - pPrev)); self.brPd = pdv;
        var pt = Math.max(0.1, Math.min(2, bp + pdv)); if (Math.abs(pt - 1) > 0.005) u.pitch = pt;
        var vv = Math.max(BR_VOL_MIN, Math.min(1, 1 + (un.dv || 0))), vPrev = self.brVol == null ? 1 : self.brVol;
        vv = vPrev + Math.max(-BR_VOL_SLEW, Math.min(BR_VOL_SLEW, vv - vPrev)); self.brVol = vv;
        if (vv < 0.995) u.volume = vv;   // 耳語、低沉的地方只小聲一點點
        function after(gap, fn) { clearGap(); self.gapT = setTimeout(function () { self.gapT = null; if (live()) fn(); }, Math.max(0, gap - brLat())); }
        function ended() {
          if (finished) return; finished = true; if (wd) { clearTimeout(wd); wd = null; }
          if (!live()) return;
          if (i + 1 >= units.length) { after(un.gap, function () { self.i++; run(tok); }); return; }
          if (fired[i + 1]) return;   // 下一句已經排在佇列裡, 瀏覽器會自己接著念
          after(un.gap, function () { fire(i + 1); });
        }
        u.onstart = function () { if (!queuedBehind) noteBrLat(Date.now() - t0); if (un.gap <= BR_PRE_GAP) fire(i + 1, true); };
        u.onend = ended;
        u.onerror = function (e) { if (tok !== self.token) return; if (e && (e.error === 'interrupted' || e.error === 'canceled')) return; if (wd) { clearTimeout(wd); wd = null; } finished = true; say('朗讀失敗: ' + (e && e.error || '瀏覽器聲音無法播放')); done(); };
        us.push(u); self.u = us;   // 留著參照: Chrome 會把沒人參照的語音物件回收掉, onend 就永遠不會來
        var est = Math.round(un.text.length * 450 / Math.max(0.5, u.rate || 1)) + 5000;   // 保險: 有些瀏覽器的 onend 不會來, 超過預估時間就接著念下一個(排在別人後面的要多等前面那一句)
        wd = setTimeout(function () { if (finished || tok !== self.token) return; try { s.cancel(); } catch (e) {} for (var j = i + 1; j < units.length; j++) fired[j] = false; ended(); }, queuedBehind ? est + 20000 : est);
        s.speak(u);
      }
      fire(0, false);
    }
    function run(tok) {
      if (tok !== self.token || self.state !== 'playing') return;
      if (self.i >= o.chunks.length) return done();
      var c = o.chunks[self.i]; if (o.onChunk) o.onChunk(self.i, c);
      self.audio = null; self.chunkT0 = Date.now(); self.pausedAt = 0;
      if (self.engine === 'browser') speakBrowser(c, tok); else speakAi(c, tok);
    }
    function cancelBrowser() { var s = synth(); if (s && s.cancel) { try { s.cancel(); } catch (e) {} } }
    this.play = function () { if (self.state === 'playing') return; self.token++; self.i = self.state === 'paused' ? self.i : (o.from || 0); set('playing'); run(self.token); };
    this.pause = function () {
      if (self.state !== 'playing') return; self.pausedAt = Date.now(); set('paused'); self.token++; clearWait(); clearGap();
      if (self.audio) { try { self.audio.pause(); } catch (e) {} }
      if (self.engine === 'browser') cancelBrowser();
    };
    this.resume = function () {
      if (self.state !== 'paused') return; set('playing'); var tok = ++self.token;
      if (self.engine === 'ai' && self.audio && !self.audio.ended && self.audio.currentTime > 0) { var a = self.audio; a.onended = function () { if (tok === self.token && self.state === 'playing') advance(tok); }; var p = a.play(); if (p && p.catch) p.catch(function () { run(tok); }); }
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
    this.elapsed = function () {   // 這一段已經念了幾秒(真實秒數, 已含速度)
      var r = Math.max(0.5, Math.min(2, o.rate || 1));
      if (self.engine === 'ai') { var a = self.audio; return a && a.currentTime ? a.currentTime / r : 0; }
      var now = self.state === 'playing' ? Date.now() : (self.pausedAt || self.chunkT0 || Date.now());
      return Math.max(0, (now - (self.chunkT0 || now)) / 1000);
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
      '.kbt-prog{display:flex;align-items:center;gap:8px;margin-top:10px}.kbt-prog[hidden]{display:none}.kbt-prog input[type=range]{flex:1;min-width:60px;height:34px;accent-color:#4f46e5;cursor:pointer}.kbt-t{font-variant-numeric:tabular-nums;font-size:13px;color:#312e81;min-width:42px;text-align:center;font-weight:700}' +
      '.kbt-mini{min-height:38px;padding:4px 10px;border-radius:10px;border:2px solid #c7d2fe;background:#fff;color:#4f46e5;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap}.kbt-mini:focus-visible,.kbt-prog input:focus-visible,.kbt-tl summary:focus-visible,.kbt-tl [data-ti]:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}' +
      '.kbt-tl{margin-top:6px;font-size:13px}.kbt-tl[hidden]{display:none}.kbt-tl summary{cursor:pointer;color:#4338ca;font-weight:700;min-height:34px;display:flex;align-items:center}.kbt-tl [data-k=tlist]{max-height:220px;overflow:auto;border:1px solid #e0e7ff;border-radius:10px;background:#fff;padding:4px}' +
      '.kbt-tl [data-ti]{display:flex;gap:8px;width:100%;text-align:left;padding:6px 8px;border:0;border-radius:8px;background:transparent;cursor:pointer;font-size:13px;color:#1e1b4b}.kbt-tl [data-ti].on{background:#e0e7ff;font-weight:700}.kbt-tl [data-ti] .t{color:#4f46e5;min-width:42px;font-variant-numeric:tabular-nums;font-weight:700}' +
      '.kbt label[hidden]{display:none}.kbt select{min-height:44px;padding:6px 10px;border-radius:12px;border:2px solid #c7d2fe;background:#fff;font-size:14px;max-width:100%}.kbt label{display:inline-flex;align-items:center;gap:6px;font-size:14px;min-height:44px;cursor:pointer}' +
      '.kbt-info{font-size:12.5px;color:#4b5563;margin-top:6px;line-height:1.6}.kbt-cap{font-size:15px;color:#1e1b4b;margin-top:6px;min-height:0;font-weight:700;line-height:1.6}.kbt-cap:empty{display:none}.kbt-note{font-size:12.5px;color:#b45309;margin-top:4px}.kbt-note:empty{display:none}' +
      '::highlight(kb-tts){background-color:#fde68a;color:#111827}' +
      '.kbt-sel{position:fixed;z-index:2000;display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:calc(100vw - 16px);padding:8px;border-radius:16px;background:#1e1b4b;box-shadow:0 8px 24px rgba(0,0,0,.35)}.kbt-sel[hidden]{display:none}' +
      '.kbt-sel .kbt-btn{min-height:44px;border-color:#fff;background:#4f46e5;color:#fff}.kbt-sel .kbt-btn.alt{background:#fff;color:#1e1b4b;border-color:#fff}.kbt-sel .kbt-btn[hidden]{display:none}.kbt-sel-note{flex-basis:100%;font-size:12.5px;color:#fde68a;line-height:1.5}.kbt-sel-note:empty{display:none}';
    (doc.head || doc.documentElement).appendChild(s);
  }
  function fmtT(sec) { sec = Math.max(0, Math.round(sec || 0)); var m = Math.floor(sec / 60), r = sec % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
  function effLen(t) {   // 「念起來有多長」的字數: 中文字算 1、英文字母 0.45、數字 0.6, 標點與空白不算
    var n = 0, x = String(t == null ? '' : t).replace(/<[^>]*>/g, ''), i, ch;
    for (i = 0; i < x.length; i++) { ch = x.charAt(i); if (/[A-Za-z]/.test(ch)) n += 0.45; else if (/\d/.test(ch)) n += 0.6; else if (/[\s,.;:!?\u3001-\u3003\uFF0C\uFF01\uFF1F\uFF1B\uFF1A\u300C-\u300F\u201C\u201D'"()\u2026\-]/.test(ch)) continue; else n += 1; }
    return n;
  }
  function cpsLoad() { try { return JSON.parse(global.localStorage.getItem('kb_tts_cps') || '{}') || {}; } catch (e) { return {}; } }
  function cpsNote(key, v) { try { var o = cpsLoad(); o[key] = o[key] ? Math.round((o[key] * 0.7 + v * 0.3) * 100) / 100 : Math.round(v * 100) / 100; global.localStorage.setItem('kb_tts_cps', JSON.stringify(o)); } catch (e) {} }
  var SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
  var audioUnlocked = false;
  function unlockAudio() {   // 要在「按下播放」的那一刻(使用者手勢中)呼叫; 只做一次
    if (audioUnlocked || H.Audio || typeof global.Audio !== 'function') return;
    try { if (/jsdom/i.test((global.navigator && global.navigator.userAgent) || '')) return; var a = new global.Audio(SILENT_WAV); a.volume = 0; var p = a.play(); audioUnlocked = true; if (p && p.catch) p.catch(function () { audioUnlocked = false; }); } catch (e) {}
  }
  var cur = null;   // 目前這個畫面上的朗讀列(同時只會有一個在讀)
  var aiCool = 0;   // 最近一次 AI 人聲出問題(額度用完等)的時間: 30 分鐘內開新的貼文, 先用瀏覽器聲音, 不再一直撞牆
  var selCleanup = null;   // 「播放選取內容」浮動列的收尾(拿掉浮動列和監聽); 關閉貼文或重新載入貼文時才呼叫
  function stop(keepSel) { if (cur) cur.stop(); clearHighlight(); if (keepSel !== true && selCleanup) selCleanup(); }

  // 切成一段一段的朗讀單位. 三顆按鈕各讀一部分:
  //  part='title': 「類型。標題。」(例如「提問。空氣裡的一粒灰塵。」); part='body': 下方的內文.
  // 為了「流暢自然」, 內文的段落要夠長(句子之間不要每句都停頓重新開口):
  //  由短到長: 第 1 段約 50 字內(最快開始播)、第 2 段約 100 字、第 3 段約 200 字、之後每段最多 300 字. 播前一段的時候, 後一段正好合成好, 不用等.
  // 每一段最多幾個字: 前面幾段由短到長(最快開始播); 之後一般人設 600 字、說書人 400 字(說書人每一小段各有自己的情緒, 留短一點).
  // 實測(2026-11): 約 300 字 = 72 秒聲音、回來要 19 秒; 600 字 = 147 秒、36 秒; 一次念太長 Google 沒有截斷. 線上版的伺服器用串流回傳(不受 4.5MB 限制), 執行時間上限 60 秒.
  // 如果某一段因為太大、太久失敗, 會自動對半切再試, 並把上限記在這台電腦(kb_tts_cap)調小.
  function chunkCap(rich) { var c = rich ? 400 : 600, v = 0; try { v = parseInt(global.localStorage.getItem('kb_tts_cap') || '0', 10) || 0; } catch (e) {} return v >= 120 && v < c ? v : c; }
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
    var src = String(pst.content == null ? '' : pst.content), rest = splitSentences(src), lims = opt.rich ? LIMITS_RICH : LIMITS, dflt = chunkCap(opt.rich);
    while (rest.length) {
      var lim = (progressive !== false && lims[out.length] !== undefined) ? lims[out.length] : dflt, fs = [], len = 0;
      if (opt.sentence) fs.push(rest.shift());
      else while (rest.length && (!fs.length || len + rest[0].text.length <= lim)) { if (opt.emo && fs.length && len >= (opt.rich ? 18 : 36) && emoShift(fs, rest[0])) break; var x = rest.shift(); fs.push(x); len += x.text.length; }
      var ck = { text: fs.map(function (q) { return q.text; }).join('').slice(0, dflt + 100), start: fs[0].start, end: fs[fs.length - 1].end, n: fs.length };
      ck.par = rest.length > 0 && /\n/.test(src.slice(fs[fs.length - 1].end, rest[0].start));   // 這一段後面是換行(換段): 瀏覽器語音多停一下, AI 人聲多停一下並補吸氣聲
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
      if (k > 0) { var nc = {}, key; for (key in c2) nc[key] = c2[key]; nc.text = ss.slice(k).map(function (q) { return q.text; }).join(''); nc.start = c2.start + ss[k].start; nc.n = ss.length - k; nc.open = ''; chunks = chunks.slice(); chunks[i] = nc; }
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
      '<select data-k="engine" aria-label="語音來源"><option value="ai">AI 人聲(較自然)</option><option value="browser">瀏覽器語音(免費、不耗額度)</option></select><select data-k="voice" aria-label="選擇聲音">' + PERSONAS.map(function (p) { return '<option value="ai:' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</select><select data-k="brvoice" aria-label="瀏覽器聲音(台灣中文)" hidden></select><select data-k="rate" aria-label="朗讀速度"><option value="0.8">慢一點</option><option value="0.9">稍慢(預設)</option><option value="1">正常</option><option value="1.15">稍快</option><option value="1.3">快</option></select>' +
      '<select data-k="prosody" aria-label="抑揚頓挫"><option value="0">抑揚頓挫:標準</option><option value="1">抑揚頓挫:加強</option><option value="2">抑揚頓挫:戲劇</option></select><select data-k="tone" aria-label="語氣"><option value="auto">語氣:自動判斷</option>' + STYLES.map(function (x) { return '<option value="' + x.id + '">' + esc(x.zh) + '</option>'; }).join('') + '</select><label><input type="checkbox" data-k="auto" checked> 自動語氣</label><label data-k="flourL" hidden><input type="checkbox" data-k="flour" checked> 說書開場與收場</label><label data-k="brflowL" title="自然人聲一次念整句(最多約 60 字), 句與句的停頓交給標點和前後文, 接續比較順; 關掉就回到一個小句一個小句念" hidden><input type="checkbox" data-k="brflow"> 接續更順(整句念)</label><select data-k="brgap" aria-label="停頓長短" title="句與句、段與段之間停多久; 聽讀時覺得趕就選「從容」, 覺得拖就選「緊湊」" hidden><option value="0.8">停頓:緊湊</option><option value="1">停頓:標準</option><option value="1.3">停頓:從容</option></select><select data-k="brswing" aria-label="語速變化" title="情緒造成的語速快慢起伏: 平穩 ±5%、標準 ±10%、明顯 ±18%" hidden><option value="0.5">語速變化:平穩</option><option value="1">語速變化:標準</option><option value="1.8">語速變化:明顯</option></select><label data-k="breathL" title="段與段之間的換氣: 輕輕的一聲吸氣, 聽起來像真人在說話"><input type="checkbox" data-k="breath" checked> 自然換氣</label></div>' +
      '<div class="kbt-prog" data-k="prog" role="group" aria-label="朗讀進度"><button type="button" class="kbt-mini" data-k="back" aria-label="倒退 10 秒">&#9194; 10</button><span class="kbt-t" data-k="tcur" aria-hidden="true">0:00</span><input type="range" data-k="seek" min="0" max="1" value="0" step="1" aria-label="朗讀進度,可拖曳到想聽的地方"><span class="kbt-t" data-k="ttot" aria-hidden="true">0:00</span><button type="button" class="kbt-mini" data-k="fwd" aria-label="快轉 10 秒">10 &#9193;</button></div>' +
      '<details class="kbt-tl" data-k="tl"><summary>時間表(每一句在幾分幾秒; 點一句就從那裡開始念)</summary><div data-k="tlist"></div></details><div class="kbt-info" data-k="info"></div><div class="kbt-cap" data-k="cap" aria-live="polite"></div><div class="kbt-note" data-k="note" role="status"></div></div>';
    var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
    var tb = doc.createElement('button'); tb.type = 'button'; tb.className = 'kbt-btn kbt-title'; tb.setAttribute('data-k', 'playt'); tb.setAttribute('aria-label', '朗讀類型與標題'); tb.textContent = '🔊 朗讀標題';
    var rb = doc.createElement('button'); rb.type = 'button'; rb.className = 'kbt-btn kbt-replies'; rb.setAttribute('data-k', 'playr'); rb.setAttribute('aria-label', '朗讀其他人的全部回應'); rb.textContent = '🔊 朗讀全部回應(0)';
    if (ctx.repliesHost) { ctx.repliesHost.style.display = ''; ctx.repliesHost.appendChild(rb); } else host.querySelector('.kbt-row').appendChild(rb);
    if (ctx.titleHost) { ctx.titleHost.style.display = ''; ctx.titleHost.appendChild(tb); } else { var rowEl = host.querySelector('.kbt-row'); rowEl.insertBefore(tb, rowEl.firstChild); }
    var play = $('play'), playt = tb, playr = rb, stopB = $('stop'), eng = $('engine'), vs = $('voice'), rs = $('rate'), au = $('auto'), fl = $('flour'), flL = $('flourL'), bk = $('breath'), bkL = $('breathL'), tn = $('tone'), ps = $('prosody'), bv = $('brvoice'), bfL = $('brflowL'), bf = $('brflow'), bg = $('brgap'), bs = $('brswing'), prog = $('prog'), seek = $('seek'), tcur = $('tcur'), ttot = $('ttot'), backB = $('back'), fwdB = $('fwd'), tlBox = $('tl'), tlist = $('tlist'), info = $('info'), cap = $('cap'), note = $('note');
    rs.value = prefs.rate || '0.9'; if (prefs.tone && tn.querySelector('option[value="' + prefs.tone + '"]')) tn.value = prefs.tone;
    au.checked = prefs.auto !== false; fl.checked = prefs.flour !== false; bk.checked = prefs.breath !== false; ps.value = prefs.prosody != null && ps.querySelector('option[value="' + String(prefs.prosody).replace(/"/g, '') + '"]') ? String(prefs.prosody) : '1';
    eng.value = prefs.engine === 'browser' || Date.now() - aiCool < 1800000 ? 'browser' : 'ai';
    if (!synth()) eng.querySelector('option[value="browser"]').disabled = true;
    vs.value = prefs.voice && vs.querySelector('option[value="' + String(prefs.voice).replace(/"/g, '') + '"]') ? prefs.voice : 'ai:p2';   // 以前存過瀏覽器聲音的人, 換成預設的 AI 人聲
    function preset() { return STYLES.filter(function (x) { return x.id === tn.value; })[0] || null; }
    function post() { var p = ctx.getPost() || {}; return { type: p.type, title: p.title || '', content: p.content || '' }; }
    function replies() { try { var l = ctx.getReplies && ctx.getReplies(); return Array.isArray(l) ? l.filter(function (r) { return r && (String(r.content || '').trim() || String(r.title || '').trim()); }) : []; } catch (e) { return []; } }
    brPick = prefs.brVoice || ''; brFlow = prefs.brFlow === true; bf.checked = brFlow;   // 整句念預設關閉(沒存過偏好的人 = 逐小句念)
    function pickNum(el, v, def) { var s = v == null ? '' : String(v).replace(/"/g, ''); el.value = s && el.querySelector('option[value="' + s + '"]') ? s : def; return parseFloat(el.value) || 1; }
    brGap = pickNum(bg, prefs.brGap, '1'); brSwing = pickNum(bs, prefs.brSwing, '1');
    function brLabel(v) { return String(v.name || '').replace(/^Microsoft\s+/i, '').replace(/\s*-\s*Chinese.*$/i, '') + (voiceTier(v) >= 250 ? '(自然人聲)' : ''); }
    function fillBrVoices() {   // 列出這台電腦上所有台灣中文聲音, 讓使用者挑最順耳的; 預設「自動」= 挑最自然的
      var list = twVoices(), cur = prefs.brVoice || '';
      bv.innerHTML = '<option value="">瀏覽器聲音:自動挑最自然的</option>' + list.map(function (v) { return '<option value="' + esc(v.name) + '">' + esc(brLabel(v)) + '</option>'; }).join('');
      bv.value = cur && list.some(function (v) { return v.name === cur; }) ? cur : '';
      bv.hidden = eng.value !== 'browser' || !list.length;
    }
    function showInfo() {
      bkL.hidden = eng.value === 'browser';   // 吸氣聲只有 AI 人聲有
      bv.hidden = eng.value !== 'browser' || bv.options.length < 2;
      bfL.hidden = eng.value !== 'browser';
      bg.hidden = bs.hidden = eng.value !== 'browser';   // 停頓長短、語速變化只影響瀏覽器語音
      flL.hidden = !(PERSONAS.filter(function (x) { return x.id === vs.value.replace(/^ai:/, ''); })[0] || {}).rich;
      var t = analyze(post()), pr = preset(), pdef = PERSONAS.filter(function (x) { return x.id === vs.value.replace(/^ai:/, ''); })[0] || {};
      info.textContent = (pr ? '語氣(手動選擇): ' + pr.zh : au.checked ? '語氣(依這則貼文自動判斷): ' + t.label + (pdef.rich ? '; 說書人會每一小段依情節與情緒再變化' : '; 每一小段也會依自己的情緒、對話再微調') : '語氣: 自然、清楚(已關閉自動語氣)') + (eng.value === 'browser' ? ' ‧ 瀏覽器語音: 用語速、音高和停頓模擬語氣' + (function () { var bp = brParams(vs.value.replace(/^ai:/, '')); return bp.voice && voiceTier(bp.voice) < 250 ? '。這台電腦上的瀏覽器聲音比較機械; 用 Microsoft Edge 開啟會有更自然的台灣中文聲音(曉臻、曉雨、雲哲), 或改選「AI 人聲」' : ''; })() : '');
      info.title = pr ? '' : au.checked ? t.reasons.join(', ') : '';
    }
    // 把「這顆鈕要讀的內容」整理成要合成的段落與設定(按下播放和事先準備都用它)
    function plan(m, useRead) {
      var md = m === 'title' ? 'title' : m === 'replies' ? 'replies' : m === 'sel' ? 'sel' : 'body', pst = post(), rl = md === 'replies' ? replies() : [];
      if (md === 'sel') pst = { type: pst.type, title: '', content: useRead && sel.read ? sel.read.text : sel.text };   // 只讀使用者圈起來的那一段
      var personaId = vs.value.replace(/^ai:/, ''), pr = preset(), isBr = eng.value === 'browser', pdef = PERSONAS.filter(function (x) { return x.id === personaId; })[0] || {}, rich = !!pdef.rich;
      var tone = pr ? { style: pr.en } : au.checked && md !== 'replies' ? analyze(pst) : { style: '' }, pro = parseInt(ps.value, 10) || 0;
      var poem = md === 'body' || md === 'sel' ? poemOf(pst.content) : null;   // 詩詞: 兩句一聯為一小段, 不加說書開收場
      var chunks = poem ? poemChunks(poem) : md === 'replies' ? replyChunks(rl, au.checked && !pr, personaId, isBr) : chunksFor(pst, md === 'sel' ? 'body' : md, '', true, { sentence: isBr, rich: rich && !isBr, emo: au.checked && !pr && !isBr });
      if (!poem && !isBr && (md === 'body' || md === 'sel') && au.checked && !pr) chunks = tailSplit(chunks, pst.content);   // 反問、誓言收尾: 最後一句獨立成一小段
      if ((md === 'body' || md === 'sel') && au.checked && !pr) {   // 每一小段依自己的情緒、對話、故事類型調整語氣(AI 人聲送語氣描述; 瀏覽器聲音調語速與音高)
        var genre = genreOf(pst.content), prev = null, streak = 0, n = chunks.length, endEmo = (emotionOf(String(pst.content).slice(-400), pdef.lean) || {}).key || '';
        var fo = md === 'body' && rich && fl.checked && n && !poem ? flourishFor(pst.content, genre) : null;   // 說書人: 依這篇故事組出開場白與收場白, 併進第一段與最後一段一起合成(聲音音量自然接續)
        chunks.forEach(function (c, idx) {
          var t = toneForChunk(c.text, genre, tone.style, rich, { first: idx === 0, last: idx === n - 1, n: n, prev: prev, streak: streak, open: !!(fo && fo.open && idx === 0), close: !!(fo && fo.close && idx === n - 1), prosody: pro, poem: c.poem || null, endEmo: endEmo }, pdef.lean);
          c.dr = t.dr; c.dp = t.dp; c.dv = t.dv; c.rich = rich; c.live = !!pdef.live; c.pk = pro; c.label = t.label; c.ending = t.ending; c.level = t.level; if (t.changed) c.style = styleFor(personaId, t.style);
          streak = t.emotion && HIGH[t.emotion] ? streak + 1 : 0; prev = t;
        });
        if (fo) { if (fo.open) chunks[0].open = fo.open; if (fo.close) chunks[n - 1].close = fo.close; }
      } else if (rich) chunks.forEach(function (c) { c.rich = true; c.live = !!pdef.live; c.pk = pro; });
      if (chunks.length) chunks[0].first = true;
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
      if (tickT) { clearInterval(tickT); tickT = null; }
      if (sel.timer) clearTimeout(sel.timer); if (sel.bar && sel.bar.parentNode) sel.bar.parentNode.removeChild(sel.bar); sel.bar = null; sel.off = true; sel.dead = true; selCleanup = null;
    };
    /* ---- 進度: 時間軸(每一句在第幾秒)、拖曳、快轉倒退、時間表 ----
     * AI 人聲: 合成好的聲音檔長度是準的(由檔案大小算), 還沒合成的段落用「每秒念幾個字」估(念過會記住, 越來越準); 瀏覽器語音只能估.
     * 所以時間前面有「約」表示還有估的部分; 整則都合成過就是準的. */
    var lastHl = -1;
    var tl = null, startPos = null, dragging = false, inStart = false, tickT = null, durSeen = 0, calSeen = {};
    function secOfChunk(c, pl) { return pl.engine === 'ai' ? (durMem[clipKey(aiScript(c), pl.voice, c.style || pl.style, pl.model)] || 0) : 0; }
    function gapEst(c) { var t = String(c.text || ''), commas = (t.match(/[,\u3001\uFF0C]/g) || []).length, ends = (t.match(/[\u3002!?\uFF01\uFF1F]/g) || []).length; return commas * 0.15 + (ends || 1) * 0.42 + (c.par ? 0.38 : 0); }
    function cpsKey(pl) { return pl.engine === 'browser' ? 'b' : 'a:' + pl.voice; }
    function chunkSec(c, pl, nxt) {
      var rate = parseFloat(rs.value) || 1, sc = secOfChunk(c, pl);
      if (sc > 0) { var gap0 = nxt ? joinGapMs(c, nxt, !!c.rich).gap / 1000 : 0; var n0 = effLen(pronounce(forSpeech(speechOf(c)))), k0 = cpsKey(pl) + '|' + sc; if (n0 > 3 && !calSeen[k0]) { calSeen[k0] = 1; cpsNote(cpsKey(pl), n0 / sc); } return sc / rate + gap0 / rate; }   // 量到的長度(加上段與段的停頓); 順便記下這個聲音每秒念幾個字
      var n = effLen(pronounce(forSpeech(speechOf(c)))), cps = cpsLoad()[cpsKey(pl)] || (pl.engine === 'browser' ? 4.0 : 4.4);
      if (pl.engine === 'browser') return n / (cps * rate * ((pl.br && pl.br.rate) || 1)) + gapEst(c) / rate;
      return n / (cps * rate) + (nxt ? joinGapMs(c, nxt, !!c.rich).gap / 1000 / rate : 0);
    }
    function tlBuild(pl, m) {   // 結構(每一句的位置與字數)只建一次; 時間另外算
      var src = srcOf(pl), ents = [];
      pl.chunks.forEach(function (c, ci) {
        var raw = src(c), list = [];
        if (raw && !c.title && c.end > c.start) splitSentences(raw.slice(c.start, c.end)).forEach(function (q) { list.push({ text: q.text, off: c.start + q.start }); });
        if (!list.length) list.push({ text: c.text, off: c.start || 0 });
        list.forEach(function (e) { e.ci = ci; e.reply = c.reply || 0; e.w = Math.max(1, effLen(e.text)); ents.push(e); });
      });
      tl = ents.length ? { pl: pl, mode: m, ents: ents, total: 0, exact: false } : null;
      tlCompute(); tlRender();
    }
    function tlCompute() {
      if (!tl) return;
      var pl = tl.pl, t = 0, exact = pl.engine === 'ai', by = {};
      tl.ents.forEach(function (e) { (by[e.ci] = by[e.ci] || []).push(e); });
      pl.chunks.forEach(function (c, ci) {
        var d = chunkSec(c, pl, pl.chunks[ci + 1]), list = by[ci] || [], tw = 0, acc = t;
        if (exact && !secOfChunk(c, pl)) exact = false;
        list.forEach(function (e) { tw += e.w; });
        list.forEach(function (e) { e.t0 = acc; acc += d * (e.w / (tw || 1)); e.t1 = acc; });
        c._t0 = t; c._d = d; t += d;
      });
      tl.total = t; tl.exact = exact;
    }
    function tlRender() {
      if (!tl) { tlBox.hidden = true; seek.max = 1; ttot.textContent = '0:00'; tlist.innerHTML = ''; return; }
      tlBox.hidden = false; seek.max = Math.max(1, Math.ceil(tl.total));
      tlist.innerHTML = tl.ents.slice(0, 300).map(function (e, i) { return '<button type="button" data-ti="' + i + '"><span class="t">' + fmtT(e.t0) + '</span><span>' + esc(String(e.text).replace(/\s+/g, ' ').slice(0, 28)) + '</span></button>'; }).join('');
      tlLabels();
    }
    function tlLabels() {   // 時間重算後只更新數字, 不重畫整個清單
      if (!tl) return;
      seek.max = Math.max(1, Math.ceil(tl.total)); ttot.textContent = (tl.exact ? '' : '約') + fmtT(tl.total);
      Array.prototype.forEach.call(tlist.querySelectorAll('[data-ti]'), function (b) { var e = tl.ents[+b.getAttribute('data-ti')]; if (e) b.firstChild.textContent = fmtT(e.t0); });
    }
    function entryOf(c) {   // 正在讀的這一段對應到哪一句(時間軸上的位置)
      var ci = tl.pl.chunks.indexOf(c), i, e = null;
      if (ci >= 0) { for (i = 0; i < tl.ents.length; i++) if (tl.ents[i].ci === ci) return tl.ents[i]; }
      for (i = 0; i < tl.ents.length; i++) { var x = tl.ents[i]; if (x.reply === (c.reply || 0) && x.off <= (c.start || 0)) e = x; }
      return e;
    }
    function curT() {
      if (!tl) return 0;
      if (reader && reader.state !== 'idle' && curPlan === tl.pl) { var c = reader.o.chunks[reader.i]; if (!c) return tl.total; var e = entryOf(c), cc = tl.pl.chunks.indexOf(c) >= 0 ? c : null, extra = reader.seekFrac > 0 && cc && cc._d ? reader.seekFrac * cc._d : 0; return Math.min(tl.total, (e ? e.t0 : 0) + extra + reader.elapsed()); }   // extra: 拖到這一段中間、聲音還沒開始播(例如暫停中)時, 先算上要跳過的部分
      return startPos && startPos.mode === tl.mode ? startPos.t : 0;
    }
    function markList(t) {
      if (!tl) return; var cur2 = -1, i; for (i = 0; i < tl.ents.length; i++) if (tl.ents[i].t0 <= t + 0.001) cur2 = i;
      Array.prototype.forEach.call(tlist.querySelectorAll('[data-ti]'), function (b) { b.classList.toggle('on', +b.getAttribute('data-ti') === cur2); });
    }
    function tlTick() {
      if (!tl) return;
      if (durVer !== durSeen) { durSeen = durVer; tlCompute(); tlLabels(); }
      var t = dragging ? Number(seek.value) : curT();
      if (!dragging) seek.value = String(Math.round(t));
      tcur.textContent = fmtT(t); markList(t);
      followHl();
      seek.setAttribute('aria-valuetext', '目前 ' + fmtT(t) + ',全長' + (tl.exact ? '' : '約') + fmtT(tl.total));
    }
    function followHl() {   // 一段有好幾句(600 字)時, 內文標記跟著念到的那一句走, 不是整段都亮著
      if (!reader || reader.state !== 'playing' || reader.engine !== 'ai' || !tl || curPlan !== tl.pl || (mode !== 'body' && mode !== 'sel')) return;
      var c = reader.o.chunks[reader.i]; if (!c || c.title || c.noHl || (c.end - c.start) < 60) return;
      var t = curT(), e = null, i; for (i = 0; i < tl.ents.length; i++) if (tl.ents[i].t0 <= t + 0.001) e = tl.ents[i];
      if (!e || e.off === lastHl) return; lastHl = e.off;
      if (mode === 'sel') { var rd = sel.read; if (rd) setHighlightC(ctx.contentEl, rd.base + compactIndex(rd.text, e.off), rd.base + compactIndex(rd.text, e.off + e.text.length) - 1); }
      else setHighlight(ctx.contentEl, curPlan.pst.content, e.off, e.off + e.text.length);
    }
    function tlRefresh() {   // 設定改了(聲音、速度、語氣、語音來源…): 沒在讀的時候, 重算「朗讀內容」的時間軸
      if (reader && reader.state !== 'idle') { tlCompute(); tlLabels(); return; }
      if (play.hidden) { tl = null; tlRender(); return; }
      var pl = plan('body'); tlBuild(pl, 'body');
      if (startPos && startPos.mode === 'body' && tl) { var e = tl.ents.filter(function (x) { return x.reply === startPos.pos.reply && x.off <= startPos.pos.off; }).pop() || tl.ents[0]; startPos.ent = e; startPos.t = e.t0; }
      tlTick();
    }
    function seekTo(sec, ent) {   // 拖到某個時間(或某一句): 在讀的時候馬上從那裡讀; 還沒讀(或讀完了)就先記住, 按「朗讀內容」從那裡開始
      if (!tl || !tl.ents.length) return;
      sec = Math.max(0, Math.min(tl.total, sec));
      var e = ent || null; if (!e) tl.ents.forEach(function (x) { if (x.t0 <= sec + 0.001) e = x; }); if (!e) e = tl.ents[0];
      if (reader && reader.state !== 'idle' && curPlan === tl.pl) start(mode, { ent: e, paused: reader.state === 'paused', keepSel: true });
      else startPos = { mode: tl.mode, pos: { reply: e.reply, off: e.off }, ent: e, t: e.t0 };
      tlTick();
    }
    seek.oninput = function () { dragging = true; tcur.textContent = fmtT(Number(seek.value)); markList(Number(seek.value)); };
    seek.onchange = function () { dragging = false; seekTo(Number(seek.value)); };
    ['pointerdown', 'touchstart', 'mousedown'].forEach(function (ev) { seek.addEventListener(ev, function () { dragging = true; }, { passive: true }); });
    ['pointerup', 'touchend', 'mouseup', 'blur'].forEach(function (ev) { seek.addEventListener(ev, function () { setTimeout(function () { dragging = false; }, 60); }, { passive: true }); });
    backB.onclick = function () { seekTo(curT() - 10); };
    fwdB.onclick = function () { seekTo(curT() + 10); };
    tlist.onclick = function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest('[data-ti]') : null; if (!b || !tl) return; var e = tl.ents[+b.getAttribute('data-ti')]; if (e) start(tl.mode, { ent: e, keepSel: true }); };   // 點時間表的一句: 直接從那裡開始念
    var warmKey = '';
    function warm(m) {   // 事先合成第一段(和第二段): 使用者按下去時多半已經好了, 幾乎不用等. 同一段只會合成一次, 之後重聽也用存起來的
      try {
        if (reader && reader.state === 'playing') return;
        if (eng.value === 'browser') return;
        var pl = plan(m); if (!pl.chunks.length || (pl.mode === 'replies' && !pl.rl.length)) return;
        var k = pl.mode + '|' + pl.voice + '|' + pl.style + '|' + pl.chunks[0].text; if (k === warmKey) return; warmKey = k;
        pl.chunks.slice(0, 2).forEach(function (c) { var pr2 = aiClip(aiScript(c), pl.voice, c.style || pl.style, pl.model); if (pr2 && pr2.catch) pr2.catch(function () {}); });
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
      var st = err && err.status, permanent = st === 429 || st === 401 || st === 403 || st === 404 || st === 400 || st === 503;   // 額度用完、金鑰不行: 之後 30 分鐘開新貼文先用瀏覽器語音; 網路不穩這類暫時的問題不記, 下一則貼文還是用 AI 人聲
      if (permanent) aiCool = Date.now(); engAuto = true; eng.value = 'browser';
      return retune((err && err.status === 429 ? '今天的 AI 語音額度用完了(免費版 Gemini API 金鑰每天次數很少), ' : 'AI 語音暫時無法使用, ') + '已自動改用瀏覽器語音, 從剛才的地方接著念。想換回 AI 人聲, 可以在「語音來源」選擇。');
    }
    function start(m, opt) {
      opt = opt || {}; unlockAudio();
      mode = m === 'title' ? 'title' : m === 'replies' ? 'replies' : m === 'sel' ? 'sel' : 'body';
      inStart = true; stop(true); inStart = false;
      if (mode === 'sel') { if (!opt.keepSel) { if (!sel.text) { selNote('請先用手指或滑鼠圈選要聽的文字。'); return; } sel.read = { text: sel.text, base: sel.base }; } if (!sel.read) return; }
      var pst = post(), rl = mode === 'replies' ? replies() : [];
      if (mode === 'replies' && !rl.length) { note.textContent = '這則貼文還沒有其他人的回應。'; return; }
      if (mode === 'body' && !String(pst.content).trim()) { note.textContent = '這則貼文沒有內文可以朗讀。'; return; }
      if (mode === 'title' && !String(pst.title).trim() && !TYPE_ZH[pst.type]) { note.textContent = '這則貼文沒有標題可以朗讀。'; return; }
      var pl = plan(mode, true), chunks = pl.chunks, from = 0, frac = 0, userRate = parseFloat(rs.value) || 1;
      if (opt.ent) {   // 拖到時間軸上的某一句: 從那一句開始。這一段的聲音已經合成好 → 整段拿來播並跳到那個位置; 還沒合成 → 只合成那一句之後的, 比較省
        var en = opt.ent, ci = Math.max(0, Math.min(en.ci, chunks.length - 1)), c3 = chunks[ci], old = tl && tl.pl.chunks[en.ci];
        from = ci;
        if (c3 && !c3.title && en.off > (c3.start || 0)) {
          var sc3 = secOfChunk(c3, pl);
          if (sc3 > 0 && old && old._d > 0) frac = Math.max(0, Math.min(0.97, (en.t0 - old._t0) / old._d));
          else { var rr2 = resumeAt(chunks, { reply: en.reply, off: en.off }, srcOf(pl)); chunks = rr2.chunks; from = rr2.from; }
        }
      } else if (opt.pos) { var rr = resumeAt(chunks, opt.pos, srcOf(pl)); chunks = rr.chunks; from = rr.from; }
      curPlan = pl; startPos = null; tlBuild(pl, mode);
      prefs.voice = vs.value; prefs.prosody = ps.value; prefs.rate = rs.value; prefs.auto = au.checked; prefs.tone = tn.value; if (!engAuto) prefs.engine = eng.value; savePrefs(prefs);
      note.textContent = opt.note || ''; cap.textContent = ''; selNote(opt.note || '');
      var rd = sel.read, rmode = mode;
      reader = new Reader({
        chunks: chunks, from: from, fromFrac: frac, breath: bk.checked, engine: pl.engine, br: pl.br, voice: pl.voice, style: pl.style, model: pl.model, rate: userRate, onAiFail: aiFail,
        onChunk: function (i, c) {
          if (i < 0) { cap.textContent = ''; clearHighlight(); lastHl = -1; return; }
          lastHl = -1;
          cap.textContent = (c.reply ? '(回應 ' + c.reply + ')' : '') + c.text; if (rmode === 'sel') setTimeout(selPlace, 0);   // 字幕出現會把內文往下推, 浮動列跟著移
          if (rmode === 'sel') setHighlightC(ctx.contentEl, rd.base + compactIndex(rd.text, c.start), rd.base + compactIndex(rd.text, c.end) - 1);   // 在內文上標出正在讀的位置(位置 = 圈選的起點 + 這段在圈選文字裡的位置)
          else if (c.title || c.noHl) clearHighlight(); else setHighlight(ctx.contentEl, pst.content, c.start, c.end);
        },
        onState: function (s) { setButtons(s); stopB.hidden = s === 'idle'; if (s === 'idle') { cap.textContent = ''; if (rmode === 'sel' && !selRead()) selHide(); if (!inStart) { startPos = null; tlRefresh(); } } selLabels(); },
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
    function toggle(m) { if (reader && reader.state !== 'idle' && mode === m) { if (reader.state === 'playing') reader.pause(); else reader.resume(); } else start(m, startPos && startPos.mode === m && startPos.ent ? { ent: startPos.ent } : undefined); }
    play.onclick = function () { toggle('body'); };
    playt.onclick = function () { toggle('title'); };
    playr.onclick = function () { toggle('replies'); };
    [[play, 'body'], [playt, 'title'], [playr, 'replies']].forEach(function (x) {   // 還沒按下去, 就先開始合成第一段
      ['mouseenter', 'focus', 'touchstart'].forEach(function (ev) { x[0].addEventListener(ev, function () { if (!x[0].disabled) warm(x[1]); }, { passive: true }); });
    });
    stopB.onclick = function () { if (reader) reader.stop(); };
    ps.onchange = function () { prefs.prosody = ps.value; savePrefs(prefs); showInfo(); if (!retune()) tlRefresh(); };
    [vs, au, tn].forEach(function (e) { e.onchange = function () { showInfo(); if (!retune()) tlRefresh(); }; });
    bk.onchange = function () { prefs.breath = bk.checked; savePrefs(prefs); if (reader) reader.o.breath = bk.checked; tlRefresh(); };
    fl.onchange = function () { prefs.flour = fl.checked; savePrefs(prefs); if (!retune()) tlRefresh(); };   // 讀到一半換聲音/語氣: 從現在讀到的地方接著讀
    eng.onchange = function () { engAuto = false; prefs.engine = eng.value; savePrefs(prefs); showInfo(); if (!retune()) tlRefresh(); };
    bf.onchange = function () { prefs.brFlow = bf.checked; brFlow = bf.checked; savePrefs(prefs); tlRefresh(); };   // 下一小段開始套用
    bg.onchange = function () { prefs.brGap = bg.value; brGap = parseFloat(bg.value) || 1; savePrefs(prefs); tlRefresh(); };     // 停頓長短: 下一小段開始套用
    bs.onchange = function () { prefs.brSwing = bs.value; brSwing = parseFloat(bs.value) || 1; savePrefs(prefs); tlRefresh(); }; // 語速變化: 下一小句開始套用
    bv.onchange = function () { prefs.brVoice = bv.value; brPick = bv.value; savePrefs(prefs); showInfo(); if (!retune()) tlRefresh(); };
    fillBrVoices();
    (function () { var s0 = synth(); if (s0) { try { s0.onvoiceschanged = function () { fillBrVoices(); showInfo(); }; } catch (e) {} } })();   // 瀏覽器常常晚一點才載入聲音清單
    rs.onchange = function () { prefs.rate = rs.value; savePrefs(prefs); if (reader && reader.state !== 'idle') reader.setRate(parseFloat(rs.value) || 1); tlCompute(); tlLabels(); tlTick(); };   // 改速度馬上生效, 不用重頭
    showInfo();
    (function () { var p0 = post(); tb.hidden = !String(p0.title).trim() && !TYPE_ZH[p0.type]; play.hidden = !String(p0.content).trim(); var rn = replies().length; playr.hidden = !rn; playr.textContent = '🔊 朗讀全部回應(' + rn + ')'; })();
    prog.hidden = play.hidden; tlRefresh(); tickT = setInterval(tlTick, 300);
    aiState().then(function (ok) {   // 沒有 Gemini 金鑰: AI 人聲不能選, 改用瀏覽器語音; 兩個都不行才停用
      aiOk = ok; var brOk = !!synth();
      if (sel.dead) return;
      sel.off = !(ok || brOk); if (sel.off) selHide(); else selUpdate();   // 有任何一種聲音可用, 圈選文字才會出現「播放選取內容」
      var aiOpt = eng.querySelector('option[value="ai"]');
      if (!brOk && eng.value === 'browser') eng.value = 'ai';
      if (!ok) {
        aiOpt.disabled = true;
        if (brOk) { engAuto = true; eng.value = 'browser'; if (!note.textContent) note.textContent = 'AI 人聲目前不能用(老師還沒有把 Gemini 金鑰存到雲端), 先用瀏覽器語音朗讀。'; showInfo(); tlRefresh(); return; }
        note.textContent = '朗讀功能暫時不能用: 老師還沒有把 Gemini 金鑰存到雲端(設定中心 > AI 設定), 這個瀏覽器也沒有可用的語音。';
        [play, playt, playr].forEach(function (b) { b.disabled = true; });
        return;
      }
      if (aiState.src === 'local' && !note.textContent) note.textContent = '目前用的是這台電腦存的 Gemini 金鑰, 只有這台電腦聽得到; 要讓學生也能聽, 請在雲端存金鑰。';
      if (eng.value === 'browser' && Date.now() - aiCool < 1800000 && !note.textContent) { engAuto = true; note.textContent = '剛才 AI 語音額度用完了, 先用瀏覽器語音; 想換回 AI 人聲, 可以在「語音來源」選擇。'; }
      showInfo(); tlRefresh();
    });
    return { stop: stop, state: function () { return reader ? reader.state : 'idle'; }, destroy: function () { stop(); host.innerHTML = ''; if (ctx.titleHost) ctx.titleHost.innerHTML = ''; if (ctx.repliesHost) ctx.repliesHost.innerHTML = ''; } };
  }

  global.KBTts = {
    PERSONAS: PERSONAS, TONES: TONES, STYLES: STYLES, EXPR: EXPR, exprText: exprText, analyze: analyze, splitSentences: splitSentences, groupSentences: groupSentences, forSpeech: forSpeech, withPauses: withPauses,
    mount: mount, stop: stop, pronounce: pronounce, numbersZh: numbersZh, cardinalZh: cardinalZh, genreOf: genreOf, emotionOf: emotionOf, toneForChunk: toneForChunk, endingOf: endingOf, endMood: endMood, poemOf: poemOf, poemChunks: poemChunks, poemImagery: poemImagery, browserUnits: browserUnits, brParams: brParams, twVoices: twVoices, voiceTier: voiceTier, setBrowserVoice: function (n) { brPick = String(n || ''); }, setBrowserFlow: function (b) { brFlow = !!b; }, setBrowserGap: function (g) { brGap = parseFloat(g) || 1; }, setBrowserSwing: function (s) { brSwing = parseFloat(s) || 1; }, brMulRange: brMulRange, exprBrowser: exprBrowser, chunksFor: chunksFor, replyChunks: replyChunks, resumeAt: resumeAt, personaVoice: personaVoice, personaStyle: personaStyle, aiClip: aiClip, voiceList: voiceList, localKey: localKey, Reader: Reader, aiState: aiState,
    _t: { tailSplit: tailSplit, endPause: endPause, flourishFor: flourishFor, factsOf: factsOf, moodOf: moodOf, speechOf: speechOf, chunkCap: chunkCap, craftOf: craftOf, keyLinePause: keyLinePause, stats: stats, processWav: processWav, withBreathWav: withBreathWav, wavParse: wavParse, wavBuild: wavBuild, joinGapMs: joinGapMs, durMem: durMem, fmtT: fmtT, effLen: effLen, aiScript: aiScript, H: H, mem: mem, setHighlight: setHighlight, textMap: textMap, hash: hash, resetAi: function () { aiState.v = null; vlist = null; vP = null; } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
