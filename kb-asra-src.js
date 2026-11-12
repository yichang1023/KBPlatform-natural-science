/* =====================================================================
 *  KB ASRA 多來源想法 — 「必須先有一個可以被反思的想法」,而不是「必須先有論壇貼文」
 *
 *  想法可以來自:論壇貼文(原本的做法)/ 學習單(匯入的資料包)/ 學生自己新增。
 *  這支檔案負責「學習單資料包」:
 *    - 存在這台電腦的 localStorage(預設不上雲端;老師要換電腦用時,由 kb-asra-cloudpack.js 先加密再存雲端);
 *    - 依學生整理成「想法卡」(五種單位可選,見 UNITS);
 *    - 依三種時間方式(回到當時/回顧全部/前後對照)決定看得到哪些回答(見 MODES);
 *    - 題目對照:每一種題目已先對到 ASRA 的 Q3~Q6 / 想法材料 / 證據材料 / 無對應。
 *  資料包由 build_asra_pack.py 從研究資料 Excel 轉出(只含原話、題目、自評平均與前後測平均,不含質性主題編碼)。
 *  純函式 + localStorage;不碰畫面。
 * ===================================================================== */
(function (global) {
  'use strict';
  var PACK_KEY = 'kb_asra_pack_v1', MAP_KEY = 'kb_asra_packmap_v1';
  var STAGES = [];
  (function () {
    var cy = { C1: '第一循環', C2: '第二循環', C3: '第三循環' }, st = { E: '同理', D: '定義', I: '發想', P: '原型', T: '測試', RA: '分享/昇華' };
    ['C1', 'C2', 'C3'].forEach(function (c) { ['E', 'D', 'I', 'P', 'T'].concat(c === 'C3' ? ['RA'] : []).forEach(function (s) { STAGES.push({ k: c + s, cyc: c, st: s, name: cy[c] + '・' + st[s], short: c.replace('C', '') + '-' + st[s] }); }); });
  })();
  var CATS = {
    Q3: { name: 'Q3 越想越深入嗎', zh: '和「我的想法有越想越深入嗎?」有關', color: '#2563eb', bg: '#dbeafe' },
    Q4: { name: 'Q4 還要想深的地方', zh: '和「哪些地方還要再想深」有關', color: '#be123c', bg: '#ffe4e6' },
    Q5: { name: 'Q5 想深化哪裡', zh: '和「接下來想把哪一部分想得更深」有關', color: '#a16207', bg: '#fef3c7' },
    Q6: { name: 'Q6 我要怎麼做', zh: '和「我要怎麼做」有關', color: '#047857', bg: '#d1fae5' },
    evid: { name: '證據與回饋', zh: '收到的回饋、測試結果(可當證據)', color: '#0369a1', bg: '#e0f2fe' },
    idea: { name: '我做的事/成果', zh: '我當時做了什麼、提出什麼', color: '#7e22ce', bg: '#f3e8ff' },
    none: { name: '其他', zh: '和這次反思沒有直接關係', color: '#475569', bg: '#f1f5f9' }
  };
  var CAT_ORDER = ['Q3', 'Q4', 'Q5', 'Q6', 'evid', 'idea', 'none'];
  var TYPE_NAME = { AC: '成就單', FB: '回饋單', RF: '省思單', CRAC: '成就單', CRFB: '回饋單', CRRF: '省思單' };
  // 想法卡的五種單位(參考:想法是「可以被改進的對象」— Scardamalia & Bereiter;想法線 Idea Thread — Zhang et al. 2018;多層單位 — Yuan, Zhang & Chen 2022)
  var UNITS = {
    stage: { name: '小組想法版本', short: '每個階段一張', what: '每個階段(例如「第三循環・原型」)一張卡,裡面是你在那個階段所有的回答。', why: '你們小組的想法是一版一版長大的(Idea 1.0 → 2.0 → 3.0)。', next: '適合看「這一版」想得怎麼樣,再和別的階段對照。' },
    task: { name: '我的階段成果', short: '只看我做的事', what: '每個階段一張卡,只放「我做了什麼、提出什麼」的回答。', why: '想檢查的是自己的任務或成果,不是整個階段的所有回答。', next: '適合決定「我自己的成果,下一步要補什麼」。' },
    answer: { name: '單一題目的回答', short: '一題一張', what: '每一題的回答各自一張卡。', why: '想細細檢查其中一句話。', next: '卡片很多,適合已經知道要看哪一句的時候。' },
    thread: { name: '關鍵想法線', short: '一個想法跨階段', what: '把各階段提到同一個關鍵想法(例如「熱顯影」)的回答串在一起。老師可以自己列;老師沒列的話,系統會自動從回答裡找出來。', why: '想看同一個想法怎麼一路長大。', next: '適合用「前後對照」看這個想法前後有什麼不同。' },
    manual: { name: '自己新增', short: '我自己寫的想法', what: '自己寫下一個想法(來自討論、實驗、作品,或剛想到的)。', why: '想法不一定在論壇或學習單裡。', next: '寫完後可以直接拿去反思、訂計畫。' }
  };
  var UNIT_ORDER = ['stage', 'task', 'answer', 'thread'];
  // 三種時間方式:每一種都說明「做什麼、為什麼、接下來可以做什麼」
  var MODES = {
    then: { icon: 'fa-hourglass-start', name: '回到當時', pick: '站在哪個階段?', what: '只看到「選定階段以前」寫過的回答,後來的先藏起來。',
      why: '想知道「當時我是怎麼想的」,不被後來學到的東西影響。', next: '先把當時的想法寫下來,再切到「回顧全部」,看看哪裡不一樣。' },
    all: { icon: 'fa-binoculars', name: '回顧全部', pick: '從哪個階段回頭看?', what: '全部的回答都看得到,「後來才出現」的會特別標出來。',
      why: '想從頭到尾看想法是怎麼走的。', next: '找出「哪一次轉變最大」,把它寫進「越想越深入嗎」。' },
    compare: { icon: 'fa-code-compare', name: '前後對照', pick: '比較哪兩個階段?', what: '選兩個階段,左右並排,同一種問題的回答一起看。',
      why: '最適合回答「我的想法有越想越深入嗎」:把「之前」和「現在」放在一起比。', next: '圈出變深的地方;沒有變的地方,就是下一步要想深的地方。' }
  };

  /* ---------- 儲存:可以同時放好幾個資料包 ----------
   * 每一次匯入是一個資料包(用檔名當名稱;同名的會更新)。系統用的是「所有資料包合在一起」的結果:
   *   - 同一位學生出現在好幾個資料包 → 回答合併(來源碼相同的以較晚匯入的為準);自評、前後測依階段/循環合併;
   *   - 刪除時可以自己選要刪哪一個資料包,其他資料包不受影響。 */
  var PACKS_KEY = 'kb_asra_packs_v2', THR_KEY = 'kb_asra_threads_v1';
  var packsCache = null, mergedCache = null;
  function ls() { try { return global.localStorage; } catch (e) { return null; } }
  function getRaw(k) { try { var s = ls(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function setRaw(k, v) { try { var s = ls(); if (!s) return false; s.setItem(k, v); return true; } catch (e) { return false; } }
  function delRaw(k) { try { var s = ls(); if (s) s.removeItem(k); } catch (e) {} }
  function readThreads() { var t = []; try { t = JSON.parse(getRaw(THR_KEY) || '[]') || []; } catch (e) { t = []; } return Array.isArray(t) ? t : []; }
  function readPacks() {
    if (packsCache) return packsCache;
    var st = null; try { st = JSON.parse(getRaw(PACKS_KEY) || 'null'); } catch (e) { st = null; }
    if (!st || !Array.isArray(st.packs)) st = { v: 2, packs: [] };
    // 舊版(只有一個資料包)自動搬進來
    var old = null; try { old = JSON.parse(getRaw(PACK_KEY) || 'null'); } catch (e) { old = null; }
    if (old && old.kind === 'asra-pack' && old.students) {
      var thr = old.threads || []; delete old.threads;
      st.packs.push({ id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: old.name || '資料包', added: Date.now(), data: old });
      if (thr.length && !getRaw(THR_KEY)) setRaw(THR_KEY, JSON.stringify(thr));
      if (setRaw(PACKS_KEY, JSON.stringify(st))) delRaw(PACK_KEY);
    }
    packsCache = st; return st;
  }
  function writePacks(st) { var ok = setRaw(PACKS_KEY, JSON.stringify(st)); packsCache = ok ? st : null; mergedCache = null; return ok; }
  function qkey(q) { return [q.cyc, q.st, q.typ, q.no, q.q].join('|'); }
  // 所有資料包合在一起的結果(畫面與計算都用這份)
  function load() {
    if (mergedCache !== null) return mergedCache || null;
    var st = readPacks();
    if (!st.packs.length) { mergedCache = false; return null; }
    var out = { v: 1, kind: 'asra-pack', built: '', stages: STAGES.map(function (x) { return x.k; }), qs: [], students: {}, scale: {}, prepost: {}, threads: readThreads(), note: '', _packs: st.packs.length };
    var idx = {}, recIdx = {};
    st.packs.forEach(function (pk) {
      var d = pk.data, remap = {};
      (d.qs || []).forEach(function (q) { var k = qkey(q); if (idx[k] === undefined) { var n = out.qs.length; out.qs.push({ i: n, cyc: q.cyc, st: q.st, typ: q.typ, no: q.no, q: q.q, cat: q.cat, cat2: q.cat2 || '', conf: q.conf || '' }); idx[k] = n; } remap[q.i] = idx[k]; });
      Object.keys(d.students || {}).forEach(function (code) {
        var s = d.students[code], o = out.students[code] || (out.students[code] = { g: s.g, r: [] });
        if (s.g) o.g = s.g;
        var ri = recIdx[code] || (recIdx[code] = {});
        (s.r || []).forEach(function (r) { var rec = [r[0], remap[r[1]], r[2]]; if (ri[r[0]] !== undefined) o.r[ri[r[0]]] = rec; else { ri[r[0]] = o.r.length; o.r.push(rec); } });
        if (d.scale && d.scale[code]) out.scale[code] = Object.assign({}, out.scale[code] || {}, d.scale[code]);
        if (d.prepost && d.prepost[code]) out.prepost[code] = Object.assign({}, out.prepost[code] || {}, d.prepost[code]);
      });
      if (d.built && String(d.built) > out.built) out.built = d.built;
      out.note = out.note || d.note || '';
    });
    mergedCache = out; return out;
  }
  function clear() { delRaw(PACK_KEY); writePacks({ v: 2, packs: [] }); mergedCache = false; }
  function reset() { packsCache = null; mergedCache = null; }
  function mapGet() { var m = {}; try { m = JSON.parse(getRaw(MAP_KEY) || '{}') || {}; } catch (e) { m = {}; } return m; }
  function mapSet(uid, code) { var m = mapGet(); if (code) m[uid] = code; else delete m[uid]; setRaw(MAP_KEY, JSON.stringify(m)); }
  // 已匯入的資料包清單:[{ id, name, added, students, records, codes }]
  function listPacks() {
    return readPacks().packs.map(function (pk) {
      var codes = Object.keys(pk.data.students || {}), n = 0; codes.forEach(function (c) { n += (pk.data.students[c].r || []).length; });
      return { id: pk.id, name: pk.name, added: pk.added, students: codes.length, records: n, codes: codes };
    });
  }
  // 只刪掉其中一個資料包;其他資料包不受影響。回傳 { ok, name, students, records }
  function removePack(id) {
    var st = readPacks(), pk = st.packs.filter(function (p) { return p.id === id; })[0]; if (!pk) return { ok: false, error: '找不到這個資料包' };
    var info = listPacks().filter(function (p) { return p.id === id; })[0];
    st = { v: 2, packs: st.packs.filter(function (p) { return p.id !== id; }) };
    if (!writePacks(st)) return { ok: false, error: '這台電腦的儲存空間有問題,沒有刪成功。' };
    return { ok: true, name: info.name, students: info.students, records: info.records };
  }

  // 取出某個資料包的完整內容(給「加密存雲端」用);回傳 { id, name, added, data } 或 null
  function packData(id) {
    var pk = readPacks().packs.filter(function (p) { return p.id === id; })[0];
    return pk ? { id: pk.id, name: pk.name, added: pk.added, data: JSON.parse(JSON.stringify(pk.data)) } : null;
  }

  /* ---------- 匯入(每次一個資料包,可以一次匯入好幾個) ---------- */
  function validate(obj) {
    if (!obj || obj.kind !== 'asra-pack' || obj.v !== 1) return '這不是 ASRA 學習單資料包(.json)。';
    if (!obj.students || typeof obj.students !== 'object' || !Array.isArray(obj.qs)) return '資料包的內容不完整。';
    return '';
  }
  // opts.onlyCode:只保留這位學生的資料(學生自己的電腦匯入全班檔時使用);opts.name:資料包名稱(通常是檔名);opts.replace:先清掉所有資料包
  // 回傳 { ok, error, name, id, replaced, students, records }
  function importPack(obj, opts) {
    opts = opts || {};
    var err = validate(obj); if (err) return { ok: false, error: err };
    var d = { v: 1, kind: 'asra-pack', built: obj.built, stages: obj.stages || STAGES.map(function (x) { return x.k; }), qs: (obj.qs || []).map(function (q) { return { i: q.i, cyc: q.cyc, st: q.st, typ: q.typ, no: q.no, q: q.q, cat: q.cat, cat2: q.cat2 || '', conf: q.conf || '' }; }), students: {}, scale: {}, prepost: {}, note: obj.note || '' };
    Object.keys(obj.students).forEach(function (code) {
      if (opts.onlyCode && String(code).toUpperCase() !== String(opts.onlyCode).toUpperCase()) return;
      d.students[code] = { g: obj.students[code].g, r: (obj.students[code].r || []).map(function (r) { return [r[0], r[1], r[2]]; }) };
      if (obj.scale && obj.scale[code]) d.scale[code] = obj.scale[code];
      if (obj.prepost && obj.prepost[code]) d.prepost[code] = obj.prepost[code];
    });
    var codes = Object.keys(d.students);
    if (!codes.length) return { ok: false, error: opts.onlyCode ? '這個檔案裡沒有「' + opts.onlyCode + '」的資料。' : '資料包裡沒有學生。' };
    var name = String(opts.name || obj.name || (codes.length === 1 ? codes[0] : '資料包')).replace(/\.json$/i, '').trim() || '資料包';
    var st = readPacks(); if (opts.replace) st = { v: 2, packs: [] };
    var same = st.packs.filter(function (p) { return p.name === name; })[0], replaced = !!same;
    var entry = { id: same ? same.id : 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: name, added: Date.now(), data: d };
    var next = { v: 2, packs: st.packs.filter(function (p) { return p.name !== name; }).concat([entry]) };
    if (!writePacks(next)) return { ok: false, error: '這台電腦的儲存空間不夠,存不下資料包。' };
    return { ok: true, name: name, id: entry.id, replaced: replaced, students: codes.length, records: codes.reduce(function (a, c) { return a + d.students[c].r.length; }, 0) };
  }
  function exportStudent(code) {
    var p = load(); if (!p || !p.students[code]) return null;
    var s = p.students[code], used = {}, list = [];
    s.r.forEach(function (r) { if (used[r[1]] === undefined) { used[r[1]] = list.length; list.push(p.qs[r[1]]); } });
    var sub = { v: 1, kind: 'asra-pack', built: p.built, stages: p.stages, qs: list.map(function (q, i) { return { i: i, cyc: q.cyc, st: q.st, typ: q.typ, no: q.no, q: q.q, cat: q.cat, cat2: q.cat2 || '', conf: q.conf || '' }; }), students: {}, scale: {}, prepost: {}, threads: [], note: p.note || '' };
    sub.students[code] = { g: s.g, r: s.r.map(function (r) { return [r[0], used[r[1]], r[2]]; }) };
    if (p.scale && p.scale[code]) sub.scale[code] = p.scale[code];
    if (p.prepost && p.prepost[code]) sub.prepost[code] = p.prepost[code];
    return sub;
  }
  function setThreads(list) { if (!setRaw(THR_KEY, JSON.stringify(list || []))) return false; mergedCache = null; return true; }

  /* ---------- 哪位平台帳號 = 哪個資料包代碼 ---------- */
  function codeOf(uid) {
    var p = load(); if (!p || uid == null) return null;
    var m = mapGet(); if (m[uid] && p.students[m[uid]]) return m[uid];
    var u = String(uid);
    if (p.students[u]) return u;
    var hit = Object.keys(p.students).filter(function (c) { return c.toUpperCase() === u.toUpperCase(); })[0];
    return hit || null;
  }
  function has(uid) { return !!codeOf(uid); }

  /* ---------- 階段 ---------- */
  function ordOf(k) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].k === k) return i; return -1; }
  function stageName(k) { var s = STAGES[ordOf(k)]; return s ? s.name : String(k); }
  function cutText(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

  /* ---------- 這位學生所有的回答(依階段排序) ---------- */
  function records(uid) {
    var p = load(), code = codeOf(uid); if (!p || !code) return [];
    var s = p.students[code], out = s.r.map(function (r, n) {
      var q = p.qs[r[1]] || {}, k = (q.cyc || '') + (q.st || '');
      return { id: r[0], code: code, n: n, text: r[2], q: q.q || '', typ: q.typ || '', form: TYPE_NAME[q.typ] || q.typ || '', cyc: q.cyc, st: q.st, stage: k, ord: ordOf(k), cat: q.cat || 'none', cat2: q.cat2 || '', conf: q.conf || '', group: s.g };
    });
    out.sort(function (a, b) { return (a.ord - b.ord) || (a.n - b.n); });
    return out;
  }
  function latestOrd(uid) { var r = records(uid); return r.length ? r[r.length - 1].ord : -1; }
  function stagesWithData(uid) { var seen = {}, out = []; records(uid).forEach(function (r) { if (!seen[r.stage]) { seen[r.stage] = 1; out.push(r.ord); } }); return out; }
  function groupOf(uid) { var p = load(), c = codeOf(uid); return p && c ? p.students[c].g : ''; }

  /* ---------- 想法卡 ---------- */
  function firstOf(recs, cat) { for (var i = 0; i < recs.length; i++) if (recs[i].cat === cat && recs[i].text.length > 5) return recs[i]; return null; }
  function counts(recs) { var c = {}; CAT_ORDER.forEach(function (k) { c[k] = 0; }); recs.forEach(function (r) { c[r.cat] = (c[r.cat] || 0) + 1; }); return c; }
  function threadMatch(t, r) {
    var hit = false; (t.kw || []).forEach(function (w) { if (w && (r.text.indexOf(w) >= 0 || r.q.indexOf(w) >= 0)) hit = true; }); return hit;
  }
  /* ---------- 系統自動找「關鍵想法」(不需要 AI,也不需要老師先建立) ----------
   * 中文沒有空格,所以用 2~5 個字的連續字串計數;去掉虛詞開頭/結尾與「小組、階段、發現…」這類每組都會寫的通用詞;
   * 再留下「在多個階段、被多位同學提到」且「不是每一組都在講」的詞 — 通常就是那一組專題的主題(例如 濾網、跌倒、聲壓)。 */
  var FUNC = '的了是我你他她它們在和與及或也都就而但把被讓對有為以可會能要這那個些還很更最不沒到從用做';
  var GENERIC = {};
  ('小組,階段,原型,測試,同理,定義,發想,回饋,使用者,幫助,問題,想法,成果,任務,學習,我們,自己,同學,老師,因為,所以,如果,可以,需要,覺得,知道,一個,什麼,怎麼,沒有,但是,還是,之後,最後,一開始,第一,第二,第三,改進,修正,討論,分享,整理,設計,研究,資料,部分,一些,別人,大家,現在,比較,提出,決定,進行,表達,完成,希望,我認為,認為,過程,方向,不同,結果,影響,發現,清楚,完整,組員,原本,出來,理解,判斷,呈現,應該,找出,思考,提供,解決,起來,容易,實際,角度,數據,限制,參考,增加,加入,方法,方式,功能,主要,使用,製作,實驗,改善,調整,測量,資訊,甚麼,一直,看起來,心裡,說法,確認,雖然,情況,主動,意見,時間,現實,大的困難,夠完整,跟組員,出自己,組員討論,現象,價值,可能,所有,更加,同時,例如,其實,已經,透過,針對,具體,重要,目前,仍然,依據,說明,討論過,經過,更多,許多,成為,因此,不是,並且,而是,以及,另外,工作,內容,自己的,整個,每個,做出,得到,看到,想到,提到,學到,覺得自己,出自,越好,明確,講得,成比較,時候,穩定,比較好,有些,有時,有時候,常常,通常,然後,去思考,回饋轉,成比,慢慢,專題,方面,部份,地方,東西,有人,沒有人,去思,饋轉,得太,先想,想到'.split(',')).forEach(function (w) { GENERIC[w] = 1; });
  function gramsOf(txt) {
    var seen = {}, out = [];
    String(txt || '').split(/[^一-鿿]+/).forEach(function (seg) {
      for (var n = 2; n <= 5; n++) for (var i = 0; i + n <= seg.length; i++) {
        var g = seg.substr(i, n);
        if (FUNC.indexOf(g.charAt(0)) >= 0 || FUNC.indexOf(g.charAt(n - 1)) >= 0 || g.indexOf('的') >= 0 || GENERIC[g] || seen[g]) continue;
        seen[g] = 1; out.push(g);
      }
    });
    return out;
  }
  // items: [{ t:文字, s:階段, u:學生 }];回傳 { 詞: { df, st:{階段:1}, su:{學生:1} } }
  function termStats(items) {
    var m = {};
    items.forEach(function (it) { gramsOf(it.t).forEach(function (g) { var x = m[g] || (m[g] = { df: 0, st: {}, su: {} }); x.df++; x.st[it.s] = 1; x.su[it.u] = 1; }); });
    return m;
  }
  function keysN(o) { return Object.keys(o).length; }
  // 把「較短的詞」併進幾乎總是跟它一起出現的較長的詞;再依「跨幾個階段、幾位同學」排序,避開互相包含的詞
  function pickTerms(m, cand, topN) {
    var c = cand.filter(function (g) { return !cand.some(function (h) { return h !== g && h.length > g.length && h.indexOf(g) >= 0 && m[h].df >= m[g].df * 0.8; }); });
    c.sort(function (a, b) { return (keysN(m[b].st) + 0.5 * keysN(m[b].su)) - (keysN(m[a].st) + 0.5 * keysN(m[a].su)) || m[b].df - m[a].df; });
    var out = []; c.forEach(function (g) { if (out.length < topN && !out.some(function (h) { return h.indexOf(g) >= 0 || g.indexOf(h) >= 0; })) out.push(g); });
    return out;
  }
  var covCache = null;
  function coverage(p) {
    var key = (p.built || '') + '|' + p.qs.length + '|' + Object.keys(p.students).length;
    if (covCache && covCache.key === key) return covCache.v;
    var c = {};
    Object.keys(p.students).forEach(function (code) {
      var g = p.students[code].g;
      p.students[code].r.forEach(function (r) { var seen = {}; String(r[2] || '').split(/[^一-鿿]+/).forEach(function (seg) { for (var n = 2; n <= 5; n++) for (var i = 0; i + n <= seg.length; i++) seen[seg.substr(i, n)] = 1; }); Object.keys(seen).forEach(function (t) { var x = c[t] || (c[t] = {}); x[g] = (x[g] || 0) + 1; }); });
    });
    covCache = { key: key, v: c }; return c;
  }
  // 某一組的關鍵想法(自動):[{ id, group, title, kw:[詞], auto:true, df, stages, students }]
  function autoThreads(group, topN) {
    var p = load(); if (!p) return [];
    topN = topN || 4;
    var items = [], groups = {}, nStu = 0;
    Object.keys(p.students).forEach(function (code) {
      var S = p.students[code]; groups[S.g] = 1;
      if (group && S.g !== group) return; nStu++;
      S.r.forEach(function (r) { var q = p.qs[r[1]] || {}; items.push({ t: r[2], s: (q.cyc || '') + (q.st || ''), u: code }); });
    });
    if (!items.length) return [];
    var m = termStats(items), cov = keysN(groups) >= 3 ? coverage(p) : null, minStu = nStu >= 3 ? 2 : 1, minSt = 4;
    var cand = Object.keys(m).filter(function (g) {
      var x = m[g]; if (x.df < 3 || keysN(x.st) < minSt || keysN(x.su) < minStu) return false;
      if (cov) { var inGroups = Object.keys(cov[g] || {}).filter(function (k) { return cov[g][k] >= 3; }).length; if (inGroups > Math.max(2, Math.floor(keysN(groups) / 2))) return false; }
      return true;
    });
    return pickTerms(m, cand, topN).map(function (g, i) { return { id: 'a_' + (group || 'ALL') + '_' + g, group: group || 'ALL', title: g, kw: [g], auto: true, df: m[g].df, stages: keysN(m[g].st), students: keysN(m[g].su) }; });
  }
  function groupsInPack() { var p = load(), o = {}; if (p) Object.keys(p.students).forEach(function (c) { o[p.students[c].g] = 1; }); return Object.keys(o).sort(); }
  // 老師建立了就用老師的;沒有就用系統自動找的
  function threadsFor(group) { var p = load(), t = (p && p.threads) || []; return t.length ? { list: t, auto: false } : { list: autoThreads(group), auto: true }; }
  // 一位學生自己的常用詞(給「我討論了哪些方面」用;可傳入論壇貼文文字)
  function topTerms(texts, n) {
    var items = texts.map(function (t, i) { return { t: t, s: String(i), u: 'me' }; }), m = termStats(items);
    var cand = Object.keys(m).filter(function (g) { return m[g].df >= 2; });
    var c = cand.filter(function (g) { return !cand.some(function (h) { return h !== g && h.length > g.length && h.indexOf(g) >= 0 && m[h].df >= m[g].df * 0.8; }); });
    c.sort(function (a, b) { return m[b].df - m[a].df || b.length - a.length; });
    var out = []; c.forEach(function (g) { if (out.length < (n || 6) && !out.some(function (h) { return h.t.indexOf(g) >= 0 || g.indexOf(h.t) >= 0; })) out.push({ t: g, n: m[g].df }); });
    return out;
  }

  // unit: stage | task | answer | thread;回傳想法卡陣列(不含「自己新增」)
  function cards(uid, unit) {
    var recs = records(uid), out = [], p = load(), g = groupOf(uid);
    if (!recs.length) return out;
    if (unit === 'answer') {
      recs.forEach(function (r) { out.push({ id: 'ws:answer:' + r.id, src: 'ws', unit: 'answer', ord: r.ord, ordEnd: r.ord, title: cutText(r.text, 26) || '(沒有內容)', sub: stageName(r.stage) + '・' + r.form, records: [r], group: g }); });
      return out;
    }
    if (unit === 'thread') {
      var tf = threadsFor(g);
      tf.list.forEach(function (t) {
        if (t.group && t.group !== 'ALL' && t.group !== g) return;
        var rs = recs.filter(function (r) { return threadMatch(t, r); });
        if (!rs.length) return;
        out.push({ id: 'ws:thread:' + t.id, src: 'ws', unit: 'thread', ord: rs[0].ord, ordEnd: rs[rs.length - 1].ord, title: t.title, sub: '提到 ' + rs.length + ' 次・' + stageName(rs[0].stage) + ' 起' + (tf.auto ? '・系統自動找的' : ''), records: rs, group: g, auto: tf.auto });
      });
      return out;
    }
    var by = {}, order = [];
    recs.forEach(function (r) { if (unit === 'task' && r.cat !== 'idea') return; if (!by[r.stage]) { by[r.stage] = []; order.push(r.stage); } by[r.stage].push(r); });
    order.forEach(function (k) {
      var rs = by[k], f = firstOf(rs, 'idea') || firstOf(rs, 'Q3') || rs[0], o = ordOf(k);
      out.push({ id: 'ws:' + unit + ':' + k, src: 'ws', unit: unit, ord: o, ordEnd: o, title: stageName(k) + ':' + cutText(f.text, 22), sub: rs.length + ' 則回答' + (g ? '・' + g + ' 組' : ''), records: rs, group: g, stage: k });
    });
    return out;
  }
  function cardById(uid, id) {
    if (!id || String(id).indexOf('ws:') !== 0) return null;
    var unit = String(id).split(':')[1], list = cards(uid, unit);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  // 自己新增的想法(來自 KBAsra 紀錄 kind:'idea'):entry = { id, title, text, srcFrom, stageKey, ts }
  var FROM = { sheet: '學習單', talk: '小組討論', test: '實驗或測試', work: '作品', other: '其他' };
  function manualCards(list, uid) {
    var lat = latestOrd(uid);
    return (list || []).map(function (e) {
      var o = e.stageKey && ordOf(e.stageKey) >= 0 ? ordOf(e.stageKey) : (lat + 0.5);
      return { id: 'manual:' + e.id, src: 'manual', unit: 'manual', ord: o, ordEnd: o, stage: e.stageKey && ordOf(e.stageKey) >= 0 ? e.stageKey : '', title: e.title || '(沒有標題)', sub: (FROM[e.srcFrom] || '自己新增') + (e.stageKey ? '・' + stageName(e.stageKey) : '・剛剛想到'), text: e.text || '', records: [], from: e.srcFrom || 'other', ts: e.ts };
    });
  }

  /* ---------- 時間方式 ---------- */
  // view = { mode:'then'|'all'|'compare', asOf, a, b };回傳 { A:[...], B:[...], hidden:n }
  function applyView(recs, view) {
    var v = view || { mode: 'all', asOf: 999 }, asOf = v.asOf == null ? 999 : v.asOf;
    if (v.mode === 'then') {
      var vis = recs.filter(function (r) { return r.ord <= asOf; });
      return { A: vis.map(function (r) { return tag(r, false); }), B: [], hidden: recs.length - vis.length };
    }
    if (v.mode === 'compare') {
      var a = v.a == null ? 0 : v.a, b = v.b == null ? 999 : v.b;
      return { A: recs.filter(function (r) { return r.ord === a; }).map(function (r) { return tag(r, false); }), B: recs.filter(function (r) { return r.ord === b; }).map(function (r) { return tag(r, false); }), hidden: 0 };
    }
    return { A: recs.map(function (r) { return tag(r, r.ord > asOf); }), B: [], hidden: 0 };
  }
  // 前後對照最多 6 組。沒指定時,用「每個循環的開頭↔結尾(3 組)」+「跨循環同階段(測試↔測試 2 組、頭尾 1 組)」,只留下雙方都有資料的組合
  var MAX_PAIRS = 6;
  function defaultPairs(ds) {
    ds = ds || []; var has = function (o) { return o >= 0 && ds.indexOf(o) >= 0; }, out = [], seen = {};
    var add = function (a, b) { if (!has(a) || !has(b) || a === b) return; if (a > b) { var t = a; a = b; b = t; } var k = a + ':' + b; if (seen[k]) return; seen[k] = 1; out.push([a, b]); };
    [['C1E', 'C1T'], ['C2E', 'C2T'], ['C3E', 'C3T'], ['C1T', 'C2T'], ['C2T', 'C3T'], ['C1E', 'C3T']].forEach(function (p) { add(ordOf(p[0]), ordOf(p[1])); });
    for (var i = 0; i + 1 < ds.length && out.length < MAX_PAIRS; i++) add(ds[i], ds[i + 1]);   // 不夠 6 組時,補相鄰兩個有資料的階段
    if (!out.length && ds.length) out.push([ds[0], ds[ds.length - 1]]);
    return out.slice(0, MAX_PAIRS);
  }
  function tag(r, later) { var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); o.later = !!later; return o; }
  function groupByCat(recs) { var g = {}; CAT_ORDER.forEach(function (k) { g[k] = []; }); recs.forEach(function (r) { (g[r.cat] || g.none).push(r); }); return g; }
  // 這張卡在目前時間方式下看得到的筆數(用來決定列表是否顯示該卡)
  function visibleCard(card, view) {
    var v = view || { mode: 'all' }; if (v.mode !== 'then') return true;
    if (card.src === 'manual' && !card.stage) return true;       // 剛剛才想到的想法,不屬於任何階段
    return card.ord <= (v.asOf == null ? 999 : v.asOf);
  }
  function viewText(view) {
    var v = view || { mode: 'all' }, m = MODES[v.mode] || MODES.all;
    if (v.mode === 'compare') return m.name + '(' + (STAGES[v.a] ? STAGES[v.a].name : '?') + ' ↔ ' + (STAGES[v.b] ? STAGES[v.b].name : '?') + (v.pairs && v.pairs.length > 1 ? ' 等 ' + v.pairs.length + ' 組' : '') + ')';
    return m.name + (STAGES[v.asOf] ? '(' + STAGES[v.asOf].name + ')' : '');
  }

  /* ---------- 自評與前後測(整理成畫面可直接用的資料) ---------- */
  function scale(uid) {
    var p = load(), c = codeOf(uid); if (!p || !c || !p.scale || !p.scale[c]) return [];
    var s = p.scale[c], out = [];
    STAGES.forEach(function (st, i) { var v = s[st.k]; if (!v) return; var a = v.filter(function (x) { return typeof x === 'number'; }); out.push({ k: st.k, ord: i, name: st.name, FB: v[0], AC: v[1], RF: v[2], avg: a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null }); });
    return out;
  }
  function prepost(uid) {
    var p = load(), c = codeOf(uid); if (!p || !c || !p.prepost || !p.prepost[c]) return [];
    var NM = { C1: '第一循環', C2: '第二循環', C3: '第三循環' };
    return ['C1', 'C2', 'C3'].filter(function (k) { return p.prepost[c][k]; }).map(function (k) { return { k: k, name: NM[k], pre: p.prepost[c][k][0], post: p.prepost[c][k][1] }; });
  }
  // 「我給自己的評分」有哪些項目、怎麼算出來(學生頁與老師頁共用同一份說明)
  function scaleHelp(forTeacher) {
    return '<div class="text-sm text-slate-700 space-y-2 leading-relaxed">' +
      '<p><b>一共有兩類評分</b>,都是「學生自己填的問卷平均」,不是老師打的分數:</p>' +
      '<ol class="list-decimal pl-5 space-y-1.5">' +
      '<li><b>學習單自評(五點量表,1~5 分)</b>:每個階段有三種學習單,<b>回饋單(FB)</b>、<b>成就單(AC)</b>、<b>省思單(RF)</b>。每一種單,把那個階段<b>有填的題目</b>算出平均;畫面上每一根柱子 = 這三種單的平均再取平均(只算有填的那幾種),滿分 5。滑鼠停在柱子上可以看到三種各自的平均。</li>' +
      '<li><b>前測 / 後測(問卷平均,1~5 分)</b>:每一個循環做一次前測、一次後測,畫面寫成「前測 → 後測」,是那個循環前後的問卷平均。各循環的題目與構面不完全相同,所以<b>不能把第一循環和第三循環的分數直接比大小</b>,要和自己同一個循環的前後比。</li></ol>' +
      '<p><b>資料從哪裡來?</b>來自研究者整理好的資料包:階段平均出自「三個循環學習單五點量表量化整理」的學生階段摘要,前後測平均出自「三循環前後測完整統計分析」的個人跨循環表;不是平台自己施測的。平台只放<b>個人原始平均</b>,不放檢定、增益指數(Hake\'s g)與追查提示。</p>' +
      '<p><b>要注意:</b>分數是當時的感覺或問卷結果,<b>不代表想法有多深</b>;高低沒有對錯,重點是和自己前後比,再跟原話一起看。' + (forTeacher ? '全班只有匯入過資料包的學生才有這些分數,人數很少時(例如 17 人)只適合描述,不適合做推論。' : '') + '</p></div>';
  }
  function summary() {
    var p = load(); if (!p) return null;
    var codes = Object.keys(p.students), n = 0, cat = {};
    codes.forEach(function (c) { p.students[c].r.forEach(function (r) { n++; var q = p.qs[r[1]]; var k = q ? q.cat : 'none'; cat[k] = (cat[k] || 0) + 1; }); });
    return { students: codes.length, records: n, questions: p.qs.length, cat: cat, threads: (p.threads || []).length, built: p.built, codes: codes.slice().sort(), packs: listPacks().length };
  }

  global.KBSrc = {
    STAGES: STAGES, CATS: CATS, CAT_ORDER: CAT_ORDER, UNITS: UNITS, UNIT_ORDER: UNIT_ORDER, MODES: MODES, FROM: FROM,
    load: load, clear: clear, reset: reset, importPack: importPack, listPacks: listPacks, removePack: removePack, packData: packData, validate: validate, exportStudent: exportStudent, setThreads: setThreads,
    mapGet: mapGet, mapSet: mapSet, codeOf: codeOf, has: has, groupOf: groupOf,
    ordOf: ordOf, stageName: stageName, records: records, latestOrd: latestOrd, stagesWithData: stagesWithData,
    cards: cards, cardById: cardById, manualCards: manualCards, counts: counts, visibleCard: visibleCard,
    autoThreads: autoThreads, threadsFor: threadsFor, groupsInPack: groupsInPack, topTerms: topTerms,
    applyView: applyView, defaultPairs: defaultPairs, MAX_PAIRS: MAX_PAIRS, groupByCat: groupByCat, viewText: viewText, scale: scale, prepost: prepost, scaleHelp: scaleHelp, summary: summary, cutText: cutText
  };
})(typeof window !== 'undefined' ? window : globalThis);
