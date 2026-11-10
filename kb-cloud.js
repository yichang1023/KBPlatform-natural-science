/* =====================================================================
 *  KB Cloud — 雲端同步層(Firebase Firestore)
 *  只有在頁面先載入 kb-config.js(設定 window.KB_CLOUD)時才會啟用;單機測試版沒有設定檔,此檔不做任何事。
 *
 *  資料放法(避免多人同時發文互相覆蓋):
 *    kb_v2/users | classes | groups | topics | trash   各一份文件,內容 { items: { 編號: 資料 } }
 *    kb_v2/nodes__<討論區>__<序號>                     貼文,每份最多 500 則
 *    kb_v2/settings                                    { value: {...} }
 *    kb_v2/asra__<學號>                                ASRA 反思與計畫的歷史紀錄 { items: { 紀錄編號: 紀錄 } }(只增不改,見 kb-asra.js)
 *    kb_v2_media/<附件編號>                             發言附的照片/錄音(壓縮後的 data URL),看貼文時才載入(見 kb-media.js)
 *    kb_v2_audit/<日期>                                稽核紀錄,依日期分文件
 *  寫入只改「有變動的那一筆」(欄位層級更新),所以兩個人同時發文不會互相蓋掉。
 *  備份檔只存在各裝置瀏覽器,不上雲端(請定期匯出完整備份)。
 * ===================================================================== */
(function (global) {
  'use strict';
  var KB = global.KB, CFG = global.KB_CLOUD;
  if (!KB || !CFG) return;
  var COL = CFG.collection || 'kb_v2', ACOL = CFG.auditCollection || 'kb_v2_audit';
  var SDK = CFG.sdk || 'https://www.gstatic.com/firebasejs/9.22.1/';
  var MCOL = CFG.mediaCollection || 'kb_v2_media';
  var KEYS = ['users', 'classes', 'groups', 'topics', 'nodes', 'trash'];
  var ORDERED = { topics: 1, classes: 1, groups: 1, trash: 1 };
  var BUCKET_MAX = 500;
  var db = null, FV = null, FP = null, ready = false, gotServer = false;
  var synced = {}, nodeBucket = {}, bucketCount = {}, auditQueue = [];
  var readyResolve = null;

  KB.cloud = { mode: 'cloud', state: 'connecting', error: '' };
  KB.ready = new Promise(function (res) { readyResolve = res; });

  /* ---------- 發言附件(照片/錄音)---------- 一個檔案一份文件 kb_v2_media/<id> { d: data URL, m: 檔案類型, t: 時間, w,h,dur };只能新增,不能改、不能刪 */
  function withTimeout(p, ms) { return new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error('timeout')); }, ms); p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); }); }); }
  KB.cloud.mediaPut = function (id, rec) {
    return KB.ready.then(function () {
      if (!db) throw new Error('offline');
      var o = { d: rec.d, m: rec.m, t: rec.t || Date.now() }; if (rec.w) { o.w = rec.w; o.h = rec.h; } if (rec.dur) o.dur = rec.dur;
      return withTimeout(db.collection(MCOL).doc(String(id)).set(o), 25000);
    });
  };
  KB.cloud.mediaGet = function (id) {
    return KB.ready.then(function () {
      if (!db) throw new Error('offline');
      return withTimeout(db.collection(MCOL).doc(String(id)).get(), 25000).then(function (s) { return s.exists ? s.data() : null; });
    });
  };

  function setState(st, err) {
    KB.cloud.state = st; KB.cloud.error = err || '';
    try { global.dispatchEvent(new global.CustomEvent('kb-cloud', { detail: { state: st, error: err || '' } })); } catch (e) {}
  }
  function finishReady() { if (readyResolve) { var r = readyResolve; readyResolve = null; r(); } }

  /* ---------- 工具 ---------- */
  function canon(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function clean(o) { return JSON.parse(JSON.stringify(o)); }
  function safe(s) { return String(s == null ? 'misc' : s).replace(/[^A-Za-z0-9_-]/g, '_') || 'misc'; }
  function toMap(key, arr) {
    var m = {};
    (arr || []).forEach(function (it, i) {
      if (!it || it.id === undefined || it.id === null || it.id === '') return;
      var o = clean(it); if (ORDERED[key]) o._o = i; m[String(it.id)] = o;
    });
    return m;
  }
  function belongs(docName, key) { return key === 'nodes' ? docName.indexOf('nodes__') === 0 : docName === key; }
  function bucketFor(topicId) {
    var base = 'nodes__' + safe(topicId) + '__', n = 0;
    while ((bucketCount[base + n] || 0) >= BUCKET_MAX) n++;
    return base + n;
  }
  function docFor(key, id, obj) {
    if (key !== 'nodes') return key;
    if (!nodeBucket[id]) { var b = bucketFor(obj && obj.topicId); nodeBucket[id] = b; bucketCount[b] = (bucketCount[b] || 0) + 1; }
    return nodeBucket[id];
  }

  /* ---------- 寫入(只送有變動的項目) ---------- */
  function writeDoc(name, sets, dels) {
    var ref = db.collection(COL).doc(name), args = [], ids = Object.keys(sets);
    ids.forEach(function (id) { args.push(new FP('items', id), sets[id]); });
    dels.forEach(function (id) { args.push(new FP('items', id), FV.delete()); });
    if (!args.length) return Promise.resolve();
    return ref.update.apply(ref, args).catch(function (e) {
      if (e && e.code === 'not-found') return ref.set({ items: sets }, { merge: true });
      throw e;
    });
  }
  function fail(e) {
    var msg = (e && (e.code || e.message)) ? String(e.code || e.message) : String(e);
    setState('error', msg);
    if (global.console) console.error('[KB Cloud] 寫入失敗', e);
  }
  function push(keys) {
    if (!ready || !db) return;
    var st = KB._state(), byDoc = {}, jobs = [];
    keys.forEach(function (key) {
      if (key === 'settings') {
        var c = canon(st.settings);
        if (synced.settings !== c) { synced.settings = c; jobs.push(db.collection(COL).doc('settings').set({ value: clean(st.settings) })); }
        return;
      }
      if (KEYS.indexOf(key) < 0) return; // audit / backups / session 只留在本機
      var desired = toMap(key, st[key]), prev = synced[key] || {}, next = {};
      Object.keys(desired).forEach(function (id) {
        var c2 = canon(desired[id]); next[id] = c2;
        if (prev[id] !== c2) { var dn = docFor(key, id, desired[id]); (byDoc[dn] = byDoc[dn] || { sets: {}, dels: [] }).sets[id] = desired[id]; }
      });
      Object.keys(prev).forEach(function (id) {
        if (id in desired) return;
        var dn2 = key === 'nodes' ? (nodeBucket[id] || 'nodes__misc__0') : key;
        (byDoc[dn2] = byDoc[dn2] || { sets: {}, dels: [] }).dels.push(id);
        if (key === 'nodes' && nodeBucket[id]) { bucketCount[nodeBucket[id]] = Math.max(0, (bucketCount[nodeBucket[id]] || 1) - 1); delete nodeBucket[id]; }
      });
      synced[key] = next;
    });
    Object.keys(byDoc).forEach(function (dn) { jobs.push(writeDoc(dn, byDoc[dn].sets, byDoc[dn].dels)); });
    if (jobs.length) { setState('syncing'); Promise.all(jobs).then(function () { if (KB.cloud.state === 'syncing') setState('online'); }).catch(fail); }
  }

  /* ---------- 讀取(即時監聽) ---------- */
  function sortFor(key, arr) {
    if (ORDERED[key]) arr.sort(function (a, b) { return (a._o || 0) - (b._o || 0); });
    else if (key === 'nodes') arr.sort(function (a, b) { return ((a.date || 0) - (b.date || 0)) || (String(a.id) < String(b.id) ? -1 : 1); });
    else arr.sort(function (a, b) { var x = String(a.createdAt || ''), y = String(b.createdAt || ''); return x < y ? -1 : x > y ? 1 : (String(a.id) < String(b.id) ? -1 : 1); });
    arr.forEach(function (o) { delete o._o; });
    return arr;
  }
  function applySnapshot(snap) {
    var docs = {}; snap.forEach(function (d) { docs[d.id] = d.data() || {}; });
    var patch = {}, changed = false;
    nodeBucket = {}; bucketCount = {};
    KEYS.forEach(function (key) {
      var arr = [], m = {};
      Object.keys(docs).forEach(function (dn) {
        if (!belongs(dn, key)) return;
        var items = docs[dn].items || {};
        Object.keys(items).forEach(function (id) {
          var o = items[id]; if (!o || typeof o !== 'object') return;
          arr.push(o); m[id] = canon(o);
          if (key === 'nodes') { nodeBucket[id] = dn; bucketCount[dn] = (bucketCount[dn] || 0) + 1; }
        });
      });
      var prev = synced[key], same = prev && Object.keys(prev).length === Object.keys(m).length && Object.keys(m).every(function (id) { return prev[id] === m[id]; });
      if (!same) { patch[key] = sortFor(key, arr); synced[key] = m; changed = true; }
    });
    // ASRA 反思/計畫紀錄:交給 kb-asra.js 合併(不放進主要資料)
    var asra = {};
    Object.keys(docs).forEach(function (dn) { if (dn.indexOf('asra__') === 0) asra[dn] = docs[dn].items || {}; });
    KB.cloud.asraDocs = asra;
    if (global.KBAsra && global.KBAsra._remote) { try { global.KBAsra._remote(asra); } catch (e) {} }
    if (docs.settings && docs.settings.value) {
      var c = canon(docs.settings.value);
      if (synced.settings !== c) { patch.settings = docs.settings.value; synced.settings = c; changed = true; }
    }
    if (changed) KB._applyRemote(patch);
    return docs;
  }
  // 新增 ASRA 紀錄(只送「雲端還沒有的」;規則會擋掉修改與刪除)
  function pushAsra(uid, list) {
    if (!ready || !db || !list || !list.length) return Promise.resolve(false);
    var sets = {}; list.forEach(function (e) { if (e && e.id) sets[e.id] = clean(e); });
    return writeDoc('asra__' + safe(uid), sets, []).then(function () { KB.cloud.asraError = ''; return true; }).catch(function (e) {
      KB.cloud.asraError = String((e && (e.code || e.message)) || e);
      try { global.dispatchEvent(new global.CustomEvent('kb-asra-error', { detail: KB.cloud.asraError })); } catch (x) {}
      if (global.console) console.warn('[KB Cloud] ASRA 紀錄沒有送出', e);
      return false;
    });
  }
  function asraSync() { if (global.KBAsra && global.KBAsra._sync) { try { global.KBAsra._sync(); } catch (e) {} } }
  function seed() {
    // 雲端還是空的(第一次啟用):把目前的預設資料(管理者、老師、五個討論區)寫上去
    ready = true; synced = {};
    push(KEYS.concat('settings'));
  }

  function loadScript(src) {
    return new Promise(function (res, rej) { var s = global.document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('無法載入 ' + src)); }; global.document.head.appendChild(s); });
  }
  function boot() {
    return Promise.resolve().then(function () {
      if (global.firebase && global.firebase.firestore) return;
      return loadScript(SDK + 'firebase-app-compat.js').then(function () { return loadScript(SDK + 'firebase-firestore-compat.js'); });
    }).then(function () {
      var fb = global.firebase;
      if (!fb.apps.length) fb.initializeApp(CFG.firebase);
      db = fb.firestore(); FV = fb.firestore.FieldValue; FP = fb.firestore.FieldPath;
      try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
      KB._cloudAttach({ push: push, pushAudit: pushAudit, loadAudit: loadAudit });
      KB.cloud.pushAsra = pushAsra;
      db.collection(COL).onSnapshot({ includeMetadataChanges: false }, function (snap) {
        if (snap.metadata.fromCache && !gotServer) { setState('offline'); return; }
        var first = !gotServer; gotServer = true;
        if (first) {
          if (snap.empty) { seed(); } else { applySnapshot(snap); ready = true; }
          setState('online'); finishReady(); flushAudit(); asraSync();
        } else { applySnapshot(snap); if (KB.cloud.state !== 'syncing') setState('online'); asraSync(); }
      }, function (err) { fail(err); finishReady(); });
    }).catch(function (e) { setState('offline', String(e && e.message || e)); finishReady(); });
  }

  /* ---------- 稽核紀錄 ---------- */
  function pushAudit(entry) {
    if (!db || !ready) { auditQueue.push(entry); return; }
    var items = {}; items[entry._k] = entry;
    db.collection(ACOL).doc(String(entry.t).slice(0, 10)).set({ items: items }, { merge: true }).catch(function () {});
  }
  function flushAudit() { var q = auditQueue; auditQueue = []; q.forEach(pushAudit); }
  function loadAudit() {
    if (!db) return Promise.resolve([]);
    return db.collection(ACOL).orderBy(FP.documentId(), 'desc').limit(14).get().then(function (snap) {
      var out = []; snap.forEach(function (d) { var it = (d.data() || {}).items || {}; Object.keys(it).forEach(function (k) { out.push(it[k]); }); }); return out;
    }).catch(function () { return []; });
  }

  // 逾時仍連不上:先用這台電腦上次的資料,頁面右下角會顯示「離線」
  setTimeout(function () { if (readyResolve) { if (KB.cloud.state === 'connecting') setState('offline', '連線逾時'); finishReady(); } }, CFG.timeoutMs || 12000);
  global.addEventListener('online', function () { if (KB.cloud.state === 'offline' && db) setState('connecting'); });
  boot();
})(typeof window !== 'undefined' ? window : globalThis);
