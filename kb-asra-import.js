/* =====================================================================
 *  KB ASRA 匯入 — 老師用 Excel / CSV,一次把全班學生的 ASRA 回答放進各自的帳號
 *
 *  檔案格式(每列一位學生):
 *    編號(學號 / 全班編號 / 帳號)、姓名(只拿來核對)、組別、專題主題(只當參考)、Q1~Q6 的回答
 *  每題放進哪裡(和學生自己在 ASRA 頁寫的位置一樣):
 *    Q1 → 第 1 題「走過的路」        (一句話 note,ref=mon)
 *    Q2 → 第 2 題「討論哪些方面」    (一句話 note,ref=q2)
 *    Q3、Q4 → 第 3 步 反思           (refl,q3 / q4)
 *    Q5、Q6 → 第 4 步 計畫           (plan,q5=原因 / text=行動)
 *  Q3~Q6 在系統裡本來是「針對一個想法」寫的,檔案沒指定想法,所以替每位學生建立一個
 *  「整體回答」想法來放(學生在 ASRA 頁選這個想法就看得到)。畫面上先不標示「老師匯入」;
 *  來源只記在每筆的 imp 欄位(撤回、研究匯出的「資料來源」欄用)。
 *
 *  安全:
 *   · 用「編號」找帳號;姓名不一致的列預設不匯入,要老師自己確認後勾選
 *   · 紀錄只增不改(雲端規則也是):重複匯入同一份不會重複;內容改過再匯 = 新版本,舊的留著
 *   · 匯錯了可以「撤回整批」:不是刪除,而是再加一筆「這幾筆不算」的標記,原始紀錄仍可查
 *   · 每筆都標記 imp = { b 批次, f 檔名, t 匯入時間, key 位置 },研究時分得出「老師匯入」與「學生自己輸入」
 * ===================================================================== */
(function (global) {
  'use strict';
  var A = function () { return global.KBAsra; };
  var QWORD = '一二三四五六';
  var IDEA_TITLE = '整體回答';   // 學生在 ASRA 頁看到的想法名稱(先不顯示「老師匯入」字樣;來源記錄在每筆的 imp 欄位)

  function norm(s) { return String(s == null ? '' : s).replace(/[　\s]+/g, ' ').trim(); }
  function h32(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function qOfHeader(h) {
    h = norm(h).replace(/[Ｑｑ]/g, 'Q').replace(/[１-６]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    var m = /^Q\s*([1-6])(?!\d)/i.exec(h) || /第\s*([1-6])\s*題/.exec(h);
    if (m) return +m[1];
    m = /第\s*([一二三四五六])\s*題/.exec(h);
    return m ? QWORD.indexOf(m[1]) + 1 : 0;
  }
  function colName(i) { var n = i, s = ''; do { s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; }

  /* ---------- 讀表格(matrix = 二維陣列,第一列通常是標題) ---------- */
  function parse(matrix) {
    var res = { ok: false, headerRow: -1, cols: { q: {} }, headers: [], records: [], problems: [] };
    matrix = (matrix || []).map(function (r) { return (r || []).map(function (c) { return c == null ? '' : c; }); });
    var best = -1, bestN = 0;
    for (var r = 0; r < Math.min(10, matrix.length); r++) {
      var n = 0; matrix[r].forEach(function (c) { if (qOfHeader(c)) n++; });
      if (n > bestN) { bestN = n; best = r; }
    }
    if (best < 0) { res.problems.push('找不到「Q1~Q6」欄。標題要寫 Q1、Q2…(或「第1題」),第一列最好就是標題。'); return res; }
    var H = matrix[best].map(norm); res.headerRow = best; res.headers = H;
    H.forEach(function (h, i) { var q = qOfHeader(h); if (q && res.cols.q[q] === undefined) res.cols.q[q] = i; });
    var firstQ = Math.min.apply(null, Object.keys(res.cols.q).map(function (k) { return res.cols.q[k]; }));
    var idIdx = -1, pri = [/學號|帳號/, /全班編號|編號/, /^id$|student\s*id/i];
    for (var p = 0; p < pri.length && idIdx < 0; p++) { H.forEach(function (h, i) { if (idIdx < 0 && !qOfHeader(h) && pri[p].test(h)) idIdx = i; }); }
    var body = matrix.slice(best + 1).filter(function (r) { return r.some(function (c) { return norm(c) !== ''; }); });
    if (idIdx < 0) {   // 標題沒寫「編號」:看哪一欄的內容最像學號(S01、1120001…)
      var bestC = -1, bestR = 0;
      H.forEach(function (h, i) { if (qOfHeader(h)) return; var ok = body.filter(function (row) { return /^[A-Za-z]{0,3}\d{1,9}$/.test(norm(row[i])); }).length; if (body.length && ok / body.length > 0.7 && ok > bestR) { bestR = ok; bestC = i; } });
      idIdx = bestC;
    }
    var find = function (re) { var k = -1; H.forEach(function (h, i) { if (k < 0 && i !== idIdx && !qOfHeader(h) && re.test(h)) k = i; }); return k; };
    res.cols.id = idIdx; res.cols.name = find(/姓名|名字|^name$/i); res.cols.group = find(/組別|^group$/i); res.cols.topic = find(/主題|專題|^topic$/i);
    if (idIdx < 0) { res.problems.push('找不到「編號」欄(學號、全班編號或帳號)。請確認標題列。'); return res; }
    var missingQ = [1, 2, 3, 4, 5, 6].filter(function (q) { return res.cols.q[q] === undefined; });
    if (missingQ.length) res.problems.push('沒有找到:' + missingQ.map(function (q) { return 'Q' + q; }).join('、') + '(沒有的題目就不會匯入)。');
    var seen = {};
    body.forEach(function (row, i) {
      var id = norm(row[idIdx]); if (!id) return;
      var rec = { line: best + 2 + i, id: id, name: res.cols.name >= 0 ? norm(row[res.cols.name]) : '', group: res.cols.group >= 0 ? norm(row[res.cols.group]) : '', topic: res.cols.topic >= 0 ? norm(row[res.cols.topic]) : '', q: {} };
      [1, 2, 3, 4, 5, 6].forEach(function (q) { var ci = res.cols.q[q]; rec.q[q] = ci === undefined ? '' : String(row[ci] == null ? '' : row[ci]).replace(/\r\n?/g, '\n').trim(); });
      var key = id.toLowerCase(); seen[key] = (seen[key] || 0) + 1; rec.key = key;
      res.records.push(rec);
    });
    res.records.forEach(function (rec) { rec.dup = seen[rec.key] > 1; });
    res.ok = res.records.length > 0;
    if (!res.ok) res.problems.push('標題列之後沒有學生資料。');
    return res;
  }

  /* ---------- 每位學生要放進去的紀錄 ---------- */
  function ideaId(uid) { return 'imp_' + uid + '_idea'; }
  // 紀錄編號 = 內容的雜湊:同一份內容永遠是同一個編號(重複匯入不會重複);被撤回過的,換一個新編號才會再出現
  function resolveId(base, have, dead) {
    for (var k = 1; k < 50; k++) { var cand = k === 1 ? base : base + '_' + k; if (!have[cand]) return { id: cand, same: false }; if (!dead[cand]) return { id: cand, same: true }; }
    return { id: base + '_x' + Date.now().toString(36), same: false };
  }
  function slotsOf(uid, rec) {
    var q = rec.q, out = [];
    if (q[1]) out.push({ key: 'q1', label: 'Q1', kind: 'note', ref: 'mon', text: q[1], hash: h32(q[1]) });
    if (q[2]) out.push({ key: 'q2', label: 'Q2', kind: 'note', ref: 'q2', text: q[2], hash: h32(q[2]) });
    if (q[3] || q[4]) out.push({ key: 'q34', label: 'Q3+Q4', kind: 'refl', q3: q[3], q4: q[4], text: (q[3] && q[4]) ? '【越想越深入嗎?】' + q[3] + '\n【還要再想深的地方】' + q[4] : (q[3] || '【還要再想深的地方】' + q[4]), hash: h32(q[3] + '\u0001' + q[4]) });
    if (q[5] || q[6]) out.push({ key: 'q56', label: 'Q5+Q6', kind: 'plan', q5: q[5], text: q[6] || '', hash: h32(q[5] + '\u0001' + q[6]) });
    return out;
  }
  function stateOf(uid) {
    var raw = A().rawEntries(uid), have = {}, dead = {}, lastTs = {};
    raw.forEach(function (e) { have[e.id] = 1; if (e.kind === 'void' && Array.isArray(e.targets)) e.targets.forEach(function (t) { dead[t] = 1; }); });
    raw.forEach(function (e) { if (e.imp && e.imp.key && !dead[e.id] && e.kind !== 'void') lastTs[e.imp.key] = Math.max(lastTs[e.imp.key] || 0, e.ts || 0); });
    return { have: have, dead: dead, lastTs: lastTs, own: raw.filter(function (e) { return !e.imp && !dead[e.id] && e.kind !== 'void'; }) };
  }

  /* ---------- 預覽:每一列對到哪個帳號、哪些會新增 ---------- */
  // ctx = { students: [{ id, realName }] }
  function plan(parsed, ctx) {
    var byId = {}; (ctx.students || []).forEach(function (u) { byId[String(u.id).toLowerCase()] = u; });
    return (parsed.records || []).map(function (rec) {
      var st = byId[rec.key], row = { rec: rec, uid: st ? st.id : '', platformName: st ? (st.realName || '') : '', slots: [], nameMismatch: false, status: 'ok', label: '', block: false, select: true };
      if (!st) { row.status = 'nomatch'; row.block = true; row.select = false; row.label = '找不到這個編號的學生帳號'; return row; }
      if (rec.dup) { row.status = 'dup'; row.block = true; row.select = false; row.label = '檔案裡這個編號出現不只一次'; return row; }
      var slots = slotsOf(st.id, rec);
      if (!slots.length) { row.status = 'empty'; row.block = true; row.select = false; row.label = 'Q1~Q6 都是空的'; return row; }
      var S = stateOf(st.id), nNew = 0, nUpd = 0, nSame = 0;
      slots.forEach(function (s) {
        var base = 'imp_' + st.id + '_' + s.key + '_' + s.hash, r = resolveId(base, S.have, S.dead);
        s.id = r.id; s.same = r.same; s.prev = S.lastTs[s.key] || 0;
        if (r.same) nSame++; else if (s.prev) nUpd++; else nNew++;
        s.hasOwn = S.own.some(function (e) { return (s.kind === 'note' && e.kind === 'note' && (e.ref || 'mon') === s.ref) || (s.kind === 'refl' && e.kind === 'refl') || (s.kind === 'plan' && e.kind === 'plan'); });
      });
      row.slots = slots;
      var nm = norm(rec.name), pn = norm(row.platformName);
      row.nameMismatch = !!(nm && pn && nm !== pn);
      if (row.nameMismatch) { row.status = 'name'; row.label = '編號與姓名不一致(檔案:' + nm + ',平台:' + pn + ')'; row.select = false; }
      else if (!nNew && !nUpd) { row.status = 'same'; row.label = '已匯入過(內容相同)'; row.select = false; }
      else { row.status = nUpd ? 'update' : 'ok'; row.label = nUpd ? '有改過的內容:會新增新版本(舊版本保留)' : '新增 ' + nNew + ' 項'; }
      row.nNew = nNew; row.nUpd = nUpd; row.nSame = nSame;
      return row;
    });
  }

  /* ---------- 產生紀錄 ---------- */
  function newBatchId() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return 'B' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + Math.floor(Math.random() * 900 + 100); }
  function entriesFor(row, o) {
    var uid = row.uid, S = stateOf(uid), out = [], base = o.baseTs || Date.now(), imp = { b: o.batch, f: o.fileName || '', t: o.now || Date.now() };
    var title = IDEA_TITLE, pid = 'manual:' + ideaId(uid), needIdea = row.slots.some(function (s) { return s.kind === 'refl' || s.kind === 'plan'; });
    var snap = { postId: pid, srcType: 'manual', srcRef: pid, unit: 'manual', ideaTitle: title, topic: '' };
    if (needIdea) {
      var ri = resolveId(ideaId(uid), S.have, S.dead);
      if (!ri.same) out.push({ id: ri.id === ideaId(uid) ? ri.id : ri.id, uid: uid, kind: 'idea', title: title, srcFrom: 'other', ts: base - 1000, v: 1, final: true, imp: Object.assign({ key: 'idea' }, imp) });
      if (ri.id !== ideaId(uid)) { pid = 'manual:' + ri.id; snap.postId = pid; snap.srcRef = pid; }
    }
    row.slots.forEach(function (s, i) {
      if (s.same) return;
      var ts = Math.max(base + i * 1000, s.prev ? s.prev + 1000 : 0), e = { id: s.id, uid: uid, kind: s.kind, ts: ts, v: 1, imp: Object.assign({ key: s.key }, imp) };
      if (s.kind === 'note') { e.ref = s.ref; e.text = s.text; }
      else if (s.kind === 'refl') { Object.assign(e, snap); e.text = s.text; if (s.q3) e.q3 = s.q3; if (s.q4) e.q4 = s.q4; e.draftId = 'imp_' + uid + '_refl'; e.final = true; }
      else { Object.assign(e, snap); e.text = s.text; if (s.q5) e.q5 = s.q5; e.draftId = 'imp_' + uid + '_plan'; e.final = true; }
      out.push(e);
    });
    return out;
  }
  // rows:plan() 的結果;o = { selected: { uid: true }, fileName, date: 'YYYY-MM-DD' }
  function apply(rows, o) {
    o = o || {}; var batch = newBatchId(), map = {}, per = [], total = 0;
    var d = o.date && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date.split('-').map(Number) : null;
    var baseTs = d ? new Date(d[0], d[1] - 1, d[2], 12, 0, 0).getTime() : Date.now();
    rows.forEach(function (row) {
      if (!row.uid || row.block || !(o.selected && o.selected[row.uid])) return;
      var list = entriesFor(row, { batch: batch, fileName: o.fileName, baseTs: baseTs, now: Date.now() });
      if (!list.length) return;
      map[row.uid] = list; total += list.length; per.push({ uid: row.uid, added: list.length });
    });
    var r = A().importAll(map);
    try { if (global.KB && KB.audit && KB.audit.add) KB.audit.add('asra.import', o.fileName || '', '批次 ' + batch + ':' + per.length + ' 位學生、' + total + ' 筆'); } catch (e) {}
    return { batch: batch, students: per.length, entries: total, per: per, res: r };
  }

  /* ---------- 匯入紀錄與撤回 ---------- */
  function batches() {
    var map = {};
    A().rawUids().forEach(function (u) {
      var raw = A().rawEntries(u), dead = {};
      raw.forEach(function (e) { if (e.kind === 'void' && Array.isArray(e.targets)) e.targets.forEach(function (t) { dead[t] = 1; }); });
      raw.forEach(function (e) {
        if (!e.imp || !e.imp.b || e.kind === 'void') return;
        var b = map[e.imp.b] || (map[e.imp.b] = { id: e.imp.b, file: e.imp.f || '', time: e.imp.t || 0, uids: {}, count: 0, alive: 0 });
        b.uids[u] = 1; b.count++; if (!dead[e.id]) b.alive++;
      });
    });
    return Object.keys(map).map(function (k) { var b = map[k]; return { id: b.id, file: b.file, time: b.time, students: Object.keys(b.uids).length, count: b.count, alive: b.alive, undone: b.alive === 0 }; }).sort(function (a, b) { return b.time - a.time; });
  }
  function undo(batchId) {
    var map = {}, n = 0, now = Date.now();
    A().rawUids().forEach(function (u) {
      var raw = A().rawEntries(u), dead = {};
      raw.forEach(function (e) { if (e.kind === 'void' && Array.isArray(e.targets)) e.targets.forEach(function (t) { dead[t] = 1; }); });
      var ids = raw.filter(function (e) { return e.imp && e.imp.b === batchId && e.kind !== 'void' && !dead[e.id]; }).map(function (e) { return e.id; });
      if (!ids.length) return;
      map[u] = [{ id: 'void_' + batchId + '_' + u, uid: u, kind: 'void', targets: ids, reason: '老師撤回匯入', ts: now, v: 1, imp: { b: batchId, undo: true, t: now } }]; n += ids.length;
    });
    var r = A().importAll(map);
    try { if (global.KB && KB.audit && KB.audit.add) KB.audit.add('asra.import.undo', batchId, '撤回 ' + Object.keys(map).length + ' 位學生、' + n + ' 筆'); } catch (e) {}
    return { students: Object.keys(map).length, entries: n, res: r };
  }

  /* ---------- 範本(給老師照著填) ---------- */
  function templateRows() {
    var QS = A().QS;
    var head = ['編號', '姓名', '組別', 'Q1|' + QS.q1.zh, 'Q2|' + QS.q2.zh, 'Q3|' + QS.q3.zh, 'Q4|' + QS.q4.zh, 'Q5|' + QS.q5.zh, 'Q6|' + QS.q6.zh].map(function (h) { return h.replace('|', '｜'); });
    return [head, ['S01', '(姓名只用來核對)', 'G1', '(第 1 題的回答)', '(第 2 題的回答)', '(第 3 題的回答)', '(第 4 題的回答)', '(第 5 題的回答)', '(第 6 題的回答)']];
  }

  global.KBAsraImport = { parse: parse, plan: plan, apply: apply, batches: batches, undo: undo, templateRows: templateRows, IDEA_TITLE: IDEA_TITLE, _slotsOf: slotsOf, _qOfHeader: qOfHeader, _colName: colName };
})(typeof window !== 'undefined' ? window : globalThis);
