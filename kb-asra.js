/* =====================================================================
 *  KB ASRA — 反思與計畫的「歷史紀錄」(只增不改)
 *
 *  每次學生按「存下」,就新增一筆有日期時間的紀錄;舊的紀錄不會被覆蓋或刪除。
 *  這樣老師與研究者才能看到想法如何一步步改變(質性資料)。
 *
 *  紀錄種類(kind):
 *    note    第 1 步寫下的一句話                 { text }
 *    refl    第 3 步的反思                         { postId, text, ideaTitle, ideaStatus, topic }
 *    plan    第 4 步訂的計畫                       { postId, act, text, ideaTitle, ideaStatus, topic }
 *    reeval  第 5 步的再評估(變好了/還要努力)     { planId, result, follow:{mine,replies,evid} }
 *  每筆都有: id, uid(學生), ts(時間), v(格式版本)
 *
 *  存放:
 *    本機  localStorage  kb_asra_v1_<學號>  { v:2, log:[...], seen:{} }(舊格式會自動轉換)
 *    雲端  kb_v2/asra__<學號>  { items: { 紀錄編號: 紀錄 } }(由 kb-cloud.js 負責讀寫;沒有雲端設定時只存本機)
 *  同一筆紀錄不論在哪裡都以「編號」合併,不會重複。
 * ===================================================================== */
(function (global) {
  'use strict';
  var PREFIX = 'kb_asra_v1_';
  var KINDS = { note: '一句話', refl: '反思', plan: '計畫', reeval: '再評估', concept: '概念追問', idea: '我的想法', void: '撤回' };
  var SRC_NAME = { forum: '論壇', ws: '學習單', manual: '自己新增' };
  // 反思/計畫是從哪一種想法、用哪一種時間方式寫的(研究時要分得清「當時」與「現在重新看」)
  function srcInfo(e) {
    var K = global.KBSrc, vt = '';
    if (e.timeMode && K && K.viewText) vt = K.viewText({ mode: e.timeMode, asOf: e.asOf, a: e.cmpA, b: e.cmpB, pairs: e.cmpPairs });
    return { src: SRC_NAME[e.srcType] || '', view: vt, unit: e.unit || '' };
  }
  function pickSrc(e) { return { srcType: e.srcType, srcRef: e.srcRef, timeMode: e.timeMode, asOf: e.asOf, cmpA: e.cmpA, cmpB: e.cmpB, cmpPairs: e.cmpPairs, unit: e.unit }; }
  var ROLE_NAME = { core: '核心概念', edge: '邊緣概念' };
  var CHOICE_NAME = { ignored: '被忽略了', undeveloped: '還沒發展', weak: '關係不大', unsure: '還不確定' };
  var ACT_NAME = { evidence: '補證據', revise: '改想法', team: '找夥伴' };
  // 六個反思題:改寫自國際研究使用的反思單(Yang et al., 2026, 附錄 B),用國小學生看得懂的說法;分成「分析 → 問題 → 計畫」三階段
  var QS = {
    q1: { no: 1, phase: 'analysis', short: '走過的路', zh: '看完圖,你覺得自己這段時間的探究過程怎麼樣?', step: 1, orig: '從累積度中心性成長曲線,如何看待小組探究的過程?' },
    q2: { no: 2, phase: 'analysis', short: '討論哪些方面', zh: '我討論了哪些方面?哪些講得比較多?', step: 2, orig: '從關鍵詞網絡圖,小組討論了哪些面向、哪些討論得比較多?' },
    q3: { no: 3, phase: 'problem', short: '越想越深入嗎', zh: '我的想法有越想越深入嗎?為什麼?', step: 3, orig: '探究是否逐漸深入?為什麼?' },
    q4: { no: 4, phase: 'problem', short: '還要再想深的地方', zh: '哪些地方應該再想深一點,卻還討論得很少?為什麼?', step: 3, orig: '哪些應深入的面向目前討論得較少?為什麼?' },
    q5: { no: 5, phase: 'plan', short: '想深化的方向', zh: '接下來我想把哪一部分想得更深?為什麼?', step: 4, orig: '接下來準備深化哪些探究面向?為什麼?' },
    q6: { no: 6, phase: 'plan', short: '我的行動計畫', zh: '我要怎麼做?寫下具體的行動計畫。', step: 4, orig: '延伸與深化探究的具體行動計畫是什麼?' }
  };
  var PHASE = { analysis: ['我們的分析', 'Our Analysis'], problem: ['我們發現的問題', 'Our Problems'], plan: ['我們的計畫', 'Our Plan'] };
  var SHOW_IMPORT_TAG = false;   // 老師匯入的紀錄要不要在畫面上標「老師匯入」(目前不標;資料裡仍有 imp 來源記錄)
  var NOTE_Q = { mon: 'q1', q2: 'q2' };   // 「一句話」類紀錄的 ref 對應到第幾題
  var remote = {};            // uid -> { id: entry }(從雲端收到的)
  var listeners = [];

  function ls() { try { return global.localStorage; } catch (e) { return null; } }
  function rawGet(k) { try { var s = ls(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function rawSet(k, v) { try { var s = ls(); if (s) s.setItem(k, v); } catch (e) {} }
  function rid() { return 'e' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(ts) { if (!ts) return '日期不詳'; var d = new Date(ts); return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtDate(ts) { if (!ts) return '日期不詳'; var d = new Date(ts); return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()); }
  function notify() { listeners.slice().forEach(function (f) { try { f(); } catch (e) { if (global.console) console.error(e); } }); }

  /* ---------- 本機 ---------- */
  // 舊格式 { notes, refl, plans, seen } → 新格式紀錄(編號固定,重複轉換不會產生重複紀錄)
  function migrate(uid, old) {
    var log = [];
    if (old.notes && old.notes.mon) log.push({ id: 'n_legacy_' + uid, uid: uid, kind: 'note', ref: 'mon', ts: 0, v: 1, text: String(old.notes.mon), legacy: true });
    (old.refl || []).forEach(function (r) { log.push({ id: 'r' + (r.ts || 0).toString(36), uid: uid, kind: 'refl', ts: r.ts || 0, v: 1, postId: r.postId, text: r.text, legacy: true }); });
    (old.plans || []).forEach(function (p) {
      var pid = p.id || ('p' + (p.ts || 0).toString(36));
      log.push({ id: pid, uid: uid, kind: 'plan', ts: p.ts || 0, v: 1, postId: p.postId, act: p.act, text: p.text, legacy: true });
      (p.reeval || []).forEach(function (e) { log.push({ id: 'x' + pid + (e.ts || 0).toString(36), uid: uid, kind: 'reeval', ts: e.ts || 0, v: 1, planId: pid, result: e.result, legacy: true }); });
    });
    return log;
  }
  function loadLocal(uid) {
    var rec = null;
    try { rec = JSON.parse(rawGet(PREFIX + uid) || 'null'); } catch (e) { rec = null; }
    if (!rec || typeof rec !== 'object') return { v: 2, log: [], seen: {} };
    if (rec.v === 2 && Array.isArray(rec.log)) { rec.seen = rec.seen || {}; return rec; }
    return { v: 2, log: migrate(uid, rec), seen: rec.seen || {} };
  }
  function saveLocal(uid, rec) { rawSet(PREFIX + uid, JSON.stringify(rec)); }

  /* ---------- 合併(本機 + 雲端) ---------- */
  // 所有紀錄(含「撤回」標記);備份、匯入、雲端同步都用這個,才不會漏掉
  function rawEntries(uid) {
    var m = {}, out = [];
    loadLocal(uid).log.forEach(function (e) { m[e.id] = e; });
    var r = remote[uid] || {};
    Object.keys(r).forEach(function (id) { if (!m[id]) m[id] = r[id]; });
    Object.keys(m).forEach(function (id) { out.push(m[id]); });
    out.sort(function (a, b) { return ((a.ts || 0) - (b.ts || 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    return out;
  }
  /* 畫面與統計用:拿掉「撤回」標記,以及被撤回的紀錄(紀錄只增不改,撤回是再加一筆說明「這幾筆不算」,原始紀錄仍留著可查) */
  function voidedIds(raw) { var dead = {}; raw.forEach(function (e) { if (e.kind === 'void' && Array.isArray(e.targets)) e.targets.forEach(function (t) { dead[t] = 1; }); }); return dead; }
  function entries(uid) { var raw = rawEntries(uid), dead = voidedIds(raw); return raw.filter(function (e) { return e.kind !== 'void' && !dead[e.id]; }); }
  function rawUids() { var m = {}; localUids().forEach(function (u) { m[u] = 1; }); Object.keys(remote).forEach(function (u) { m[u] = 1; }); return Object.keys(m); }
  function localUids() {
    var out = [], s = ls();
    try { if (s) for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); } } catch (e) {}
    return out;
  }
  function uids() {
    var m = {}; localUids().forEach(function (u) { m[u] = 1; }); Object.keys(remote).forEach(function (u) { m[u] = 1; });
    return Object.keys(m).filter(function (u) { return entries(u).length > 0; });
  }

  /* ---------- 新增一筆 ---------- */
  function append(uid, e) {
    var rec = loadLocal(uid), now = Date.now();
    var entry = {};
    Object.keys(e).forEach(function (k) { if (e[k] !== undefined) entry[k] = e[k]; });
    entry.id = entry.id || rid(); entry.uid = uid; entry.ts = entry.ts || now; entry.v = 1;
    rec.log.push(entry); saveLocal(uid, rec);
    sync(uid); notify();
    return entry;
  }
  function seenGet(uid) { return loadLocal(uid).seen; }
  function seenSet(uid, i) { var rec = loadLocal(uid); if (rec.seen[i]) return; rec.seen[i] = 1; saveLocal(uid, rec); }

  /* ---------- 整理成畫面用的資料 ---------- */
  /* ---------- 自動存下:同一則的多個版本合成一筆 ----------
   * 學生一邊寫、系統一邊自動存下(每個版本都是新的一筆紀錄,舊版本不會被改掉,保留「怎麼一步步寫出來」)。
   * 同一則的版本用 draftId 串起來(draftId = 第一個版本的編號);畫面與統計只算「最新的版本」,版本數另外記錄。
   * final:true 表示學生按了「寫完了」;沒有 final 的是還在寫(open)。沒有 draftId 的舊紀錄照舊,一筆就是一則。 */
  var DRAFT_KINDS = { refl: 1, plan: 1, idea: 1 };
  function collapse(list) {
    var first = {}, count = {}, last = {}, out = [];
    list.forEach(function (e) { var g = e.draftId; if (!g || !DRAFT_KINDS[e.kind]) return; if (!first[g]) first[g] = e; count[g] = (count[g] || 0) + 1; last[g] = e; });
    list.forEach(function (e) {
      var g = e.draftId;
      if (!g || !DRAFT_KINDS[e.kind]) { out.push(e); return; }
      if (last[g] !== e) return;
      var c = Object.assign({}, e); c.id = g; c._versions = count[g]; c._firstTs = first[g].ts; c._first = first[g]; c._open = !e.final; out.push(c);
    });
    return out;
  }
  function entriesCollapsed(uid) { return collapse(entries(uid)); }
  function derive(uid) {
    var list = collapse(entries(uid)), S = { notes: {}, refl: [], plans: [], concepts: [], ideas: [], seen: seenGet(uid) }, byPlan = {};
    list.forEach(function (e) {
      if (e.kind === 'note') S.notes[e.ref || 'mon'] = e.text;
      else if (e.kind === 'idea') S.ideas.push({ imported: !!(e.imp && !e.imp.undo), id: e.id, title: e.title || '', text: e.text || '', srcFrom: e.srcFrom || 'other', stageKey: e.stageKey || '', ts: e.ts, open: !!e._open, versions: e._versions || 1 });
      else if (e.kind === 'refl') S.refl.push(Object.assign({ imported: !!(e.imp && !e.imp.undo), id: e.id, postId: e.postId, text: e.text, ts: e.ts, ideaTitle: e.ideaTitle, q3: e.q3 || '', q4: e.q4 || '', open: !!e._open, versions: e._versions || 1, firstTs: e._firstTs || e.ts }, pickSrc(e)));
      else if (e.kind === 'concept') S.concepts.push({ id: e.id, term: e.term, role: e.role, choice: e.choice || '', text: e.text || '', ts: e.ts });
      else if (e.kind === 'plan') { var p = Object.assign({ imported: !!(e.imp && !e.imp.undo), id: e.id, postId: e.postId, act: e.act, text: e.text, q5: e.q5 || '', ts: e._firstTs || e.ts, updTs: e.ts, open: !!e._open, versions: e._versions || 1, ideaTitle: e.ideaTitle, ideaStatus: (e._first || e).ideaStatus, push: e.push || null, reeval: [] }, pickSrc(e)); S.plans.push(p); byPlan[e.id] = p; }
    });
    list.forEach(function (e) { if (e.kind === 'reeval' && byPlan[e.planId]) byPlan[e.planId].reeval.push({ result: e.result, ts: e.ts, follow: e.follow, note: e.note || '' }); });
    return S;
  }
  // 一筆紀錄的文字說明(畫面與匯出共用)
  function describe(e) {
    var base = { imported: !!(e.imp && !e.imp.undo), importFile: (e.imp && e.imp.f) || '', kind: e.kind, label: KINDS[e.kind] || e.kind, time: fmtTime(e.ts), date: fmtDate(e.ts), idea: e.ideaTitle || '', topic: e.topic || '', text: e.text || '', act: '', result: '', follow: e.follow || null, q3: e.q3 || '', q4: e.q4 || '', q5: e.q5 || '' };
    if (e.kind === 'note' && QS[NOTE_Q[e.ref || 'mon']]) { var qq = QS[NOTE_Q[e.ref || 'mon']]; base.label = '第' + qq.no + '題:' + qq.short; }
    if (e.kind === 'plan') { base.act = ACT_NAME[e.act] || e.act || ''; }
    if (e.kind === 'concept') { base.idea = e.term || ''; base.act = (ROLE_NAME[e.role] || '') + (e.choice ? '・' + (CHOICE_NAME[e.choice] || e.choice) : ''); if (!base.text && e.choice) base.text = '選了「' + (CHOICE_NAME[e.choice] || e.choice) + '」'; }
    if (e.kind === 'reeval') { base.result = e.result === 'better' ? '變好了' : '還要再努力'; base.text = base.result + (e.note ? ':' + e.note : ''); }
    if (e.kind === 'idea') { base.idea = e.title || ''; base.act = (global.KBSrc && KBSrc.FROM[e.srcFrom]) || ''; }
    var si = srcInfo(e); base.src = si.src; base.view = si.view; base.unit = si.unit;
    return base;
  }

  /* ---------- 雲端(kb-cloud.js 會呼叫 _remote / _sync) ---------- */
  function cloud() { var K = global.KB; return K && K.cloud && K.cloud.mode === 'cloud' ? K.cloud : null; }
  function curUid() { try { var u = global.KB && global.KB.auth && global.KB.auth.current(); return u && u.role === 'student' ? u.id : null; } catch (e) { return null; } }
  // 收到雲端的資料(整份取代,因為雲端只增不改)
  function _remote(map) {
    var next = {};
    Object.keys(map || {}).forEach(function (doc) {
      var items = map[doc] || {};
      Object.keys(items).forEach(function (id) { var e = items[id]; if (e && e.uid && e.kind) { (next[e.uid] = next[e.uid] || {})[id] = e; } });
    });
    remote = next; notify();
  }
  // 把「雲端還沒有」的本機紀錄補上去;只補目前登入學生自己的紀錄
  function sync(uid) {
    var c = cloud(); if (!c || !c.pushAsra) return;
    var me = curUid(); if (!me || (uid && uid !== me)) return;
    var r = remote[me] || {}, missing = loadLocal(me).log.filter(function (e) { return !r[e.id]; });
    if (!missing.length) return;
    c.pushAsra(me, missing);
  }
  // 雲端上有、本機還沒有 → 不需處理(entries() 已合併);回傳還沒送到雲端的筆數
  function pending(uid) {
    if (!cloud()) return 0;
    var r = remote[uid] || {};
    return loadLocal(uid).log.filter(function (e) { return !r[e.id]; }).length;
  }

  /* ---------- 匯出(給老師/研究者) ---------- */
  function csvCell(v) { var s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  // opts.info(uid) → { name, className };opts.uids 指定哪些學生
  function toCSV(opts) {
    opts = opts || {};
    var head = ['日期時間', '學號', '姓名', '班級', '類型', '想法標題', '討論區', '做法', '內容', '再評估結果', '計畫後新貼文數', '計畫後新回應數', '計畫後有證據的貼文數', '第3題:想法有越想越深入嗎?為什麼', '第4題:哪些該再想深卻討論很少', '第5題:想深化哪一部分?為什麼', '想法來源', '時間方式', '想法單位', '版本數', '狀態', '資料來源'];
    var rows = [head], list = opts.uids || uids();
    list.forEach(function (u) {
      var info = (opts.info && opts.info(u)) || {};
      collapse(entries(u)).forEach(function (e) {
        var d = describe(e);
        rows.push([d.time, u, info.name || '', info.className || '', d.label, d.idea, d.topic, d.act, e.kind === 'reeval' ? '' : d.text, d.result, d.follow ? d.follow.mine : '', d.follow ? d.follow.replies : '', d.follow ? d.follow.evid : '', d.q3, d.q4, d.q5, d.src, d.view, d.unit, e._versions || 1, e._open ? '草稿(還沒按存下)' : (e._versions ? '已存下' : ''), e.imp && !e.imp.undo ? '老師匯入' + (e.imp.f ? '(' + e.imp.f + ')' : '') : '學生輸入']);
      });
    });
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  /* ---------- 整份匯出 / 匯入(放進平台「完整備份」,換平台或還原時用) ----------
   * exportAll():{ 學號: [紀錄…] }(本機 + 雲端合併,含每一個版本,不整理)
   * importAll(obj):只「補上缺的」(以紀錄編號為準),不會刪除或改動現有紀錄;有連雲端時一併送上雲端(老師還原時,學生的紀錄也回到雲端) */
  function exportAll() { var out = {}; rawUids().forEach(function (u) { var l = rawEntries(u); if (l.length) out[u] = l; }); return out; }
  function importAll(obj) {
    var res = { students: 0, added: 0, skipped: 0 }, c = cloud();
    Object.keys(obj || {}).forEach(function (u) {
      var list = Array.isArray(obj[u]) ? obj[u] : []; if (!list.length) return;
      var have = {}; rawEntries(u).forEach(function (e) { have[e.id] = 1; });
      var rec = loadLocal(u), fresh = [];
      list.forEach(function (e) {
        if (!e || typeof e !== 'object' || !e.id || !e.kind || have[e.id]) { res.skipped++; return; }
        var x = Object.assign({}, e); x.uid = u; have[e.id] = 1; rec.log.push(x); fresh.push(x);
      });
      if (!fresh.length) return;
      saveLocal(u, rec); res.students++; res.added += fresh.length;
      if (c && c.pushAsra) { var r = remote[u] || {}; var up = fresh.filter(function (x) { return !r[x.id]; }); if (up.length) c.pushAsra(u, up); }
    });
    if (res.added) notify();
    return res;
  }

  global.KBAsra = {
    SHOW_IMPORT_TAG: SHOW_IMPORT_TAG, KINDS: KINDS, ACT_NAME: ACT_NAME, QS: QS, PHASE: PHASE, ROLE_NAME: ROLE_NAME, CHOICE_NAME: CHOICE_NAME,
    exportAll: exportAll, importAll: importAll, append: append, newId: rid, entries: entries, rawEntries: rawEntries, rawUids: rawUids, entriesCollapsed: entriesCollapsed, uids: uids, derive: derive, describe: describe, pending: pending,
    seenGet: seenGet, seenSet: seenSet, fmtTime: fmtTime, fmtDate: fmtDate, toCSV: toCSV,
    onChange: function (f) { if (typeof f === 'function') listeners.push(f); },
    _remote: _remote, _sync: function () { var me = curUid(); if (me) sync(me); },
    _reset: function () { remote = {}; listeners = []; }
  };
  // kb-cloud.js 若比這支檔案先收到資料,這裡補拿
  try { if (global.KB && global.KB.cloud && global.KB.cloud.asraDocs) _remote(global.KB.cloud.asraDocs); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
