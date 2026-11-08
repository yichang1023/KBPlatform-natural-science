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
  var KINDS = { note: '一句話', refl: '反思', plan: '計畫', reeval: '再評估' };
  var ACT_NAME = { evidence: '補證據', revise: '改想法', team: '找夥伴' };
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
  function entries(uid) {
    var m = {}, out = [];
    loadLocal(uid).log.forEach(function (e) { m[e.id] = e; });
    var r = remote[uid] || {};
    Object.keys(r).forEach(function (id) { if (!m[id]) m[id] = r[id]; });
    Object.keys(m).forEach(function (id) { out.push(m[id]); });
    out.sort(function (a, b) { return ((a.ts || 0) - (b.ts || 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    return out;
  }
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
  function derive(uid) {
    var list = entries(uid), S = { notes: {}, refl: [], plans: [], seen: seenGet(uid) }, byPlan = {};
    list.forEach(function (e) {
      if (e.kind === 'note') S.notes[e.ref || 'mon'] = e.text;
      else if (e.kind === 'refl') S.refl.push({ id: e.id, postId: e.postId, text: e.text, ts: e.ts, ideaTitle: e.ideaTitle });
      else if (e.kind === 'plan') { var p = { id: e.id, postId: e.postId, act: e.act, text: e.text, ts: e.ts, ideaTitle: e.ideaTitle, reeval: [] }; S.plans.push(p); byPlan[e.id] = p; }
    });
    list.forEach(function (e) { if (e.kind === 'reeval' && byPlan[e.planId]) byPlan[e.planId].reeval.push({ result: e.result, ts: e.ts, follow: e.follow }); });
    return S;
  }
  // 一筆紀錄的文字說明(畫面與匯出共用)
  function describe(e) {
    var base = { kind: e.kind, label: KINDS[e.kind] || e.kind, time: fmtTime(e.ts), date: fmtDate(e.ts), idea: e.ideaTitle || '', topic: e.topic || '', text: e.text || '', act: '', result: '', follow: e.follow || null };
    if (e.kind === 'plan') { base.act = ACT_NAME[e.act] || e.act || ''; }
    if (e.kind === 'reeval') { base.result = e.result === 'better' ? '變好了' : '還要再努力'; base.text = base.result; }
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
    var head = ['日期時間', '學號', '姓名', '班級', '類型', '想法標題', '討論區', '做法', '內容', '再評估結果', '計畫後新貼文數', '計畫後新回應數', '計畫後有證據的貼文數'];
    var rows = [head], list = opts.uids || uids();
    list.forEach(function (u) {
      var info = (opts.info && opts.info(u)) || {};
      entries(u).forEach(function (e) {
        var d = describe(e);
        rows.push([d.time, u, info.name || '', info.className || '', d.label, d.idea, d.topic, d.act, e.kind === 'reeval' ? '' : d.text, d.result, d.follow ? d.follow.mine : '', d.follow ? d.follow.replies : '', d.follow ? d.follow.evid : '']);
      });
    });
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  global.KBAsra = {
    KINDS: KINDS, ACT_NAME: ACT_NAME,
    append: append, entries: entries, uids: uids, derive: derive, describe: describe, pending: pending,
    seenGet: seenGet, seenSet: seenSet, fmtTime: fmtTime, fmtDate: fmtDate, toCSV: toCSV,
    onChange: function (f) { if (typeof f === 'function') listeners.push(f); },
    _remote: _remote, _sync: function () { var me = curUid(); if (me) sync(me); },
    _reset: function () { remote = {}; listeners = []; }
  };
  // kb-cloud.js 若比這支檔案先收到資料,這裡補拿
  try { if (global.KB && global.KB.cloud && global.KB.cloud.asraDocs) _remote(global.KB.cloud.asraDocs); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
