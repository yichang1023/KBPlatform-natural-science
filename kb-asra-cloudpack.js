/* =====================================================================
 *  KB ASRA 學習單資料包 — 加密後存雲端(換電腦也能用)
 *
 *  為什麼要加密:資料包是學生的原話(研究資料),但雲端資料庫的讀取是公開的。
 *  所以資料包在老師的瀏覽器裡先用「老師自己訂的密碼」加密,雲端只存亂碼;
 *  另一台電腦輸入同一組密碼,才在那台電腦的瀏覽器裡解開。密碼不會送出去、也不會存起來。
 *  做法:密碼 → PBKDF2-SHA256(15 萬次、每次上傳隨機 salt)→ AES-256-GCM(隨機 iv);GCM 有驗證,密碼錯或被竄改一定解不開。
 *  雲端放法見 kb-cloud.js(packPut/packList/packGet):每次上傳新增一筆,不改、不刪;「覆蓋」與「移除」都是再新增一筆,以最新的為準。
 *  純函式 + 非同步;不碰畫面。
 * ===================================================================== */
(function (global) {
  'use strict';
  var ITER = 150000, MAX_C = 880000, MIN_PW = 6;

  function subtle() { var c = global.crypto; return (c && c.subtle) || null; }
  function rnd(n) { var u = new Uint8Array(n); global.crypto.getRandomValues(u); return u; }
  function cloud() { var K = global.KB; return K && K.cloud && K.cloud.mode === 'cloud' && typeof K.cloud.packPut === 'function' ? K.cloud : null; }
  // 文字 <-> UTF-8 位元組(不依賴 TextEncoder,各種環境都能用)
  function utf8(str) { var s = unescape(encodeURIComponent(str)), u = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function unutf8(u) { var s = '', i; for (i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return decodeURIComponent(escape(s)); }
  function b64(buf) { var u = new Uint8Array(buf), s = '', i; for (i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return global.btoa(s); }
  function unb64(s) { var b = global.atob(String(s || '')), u = new Uint8Array(b.length), i; for (i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  // 可以用嗎?回傳 { ok, why }
  function available() {
    if (!cloud()) return { ok: false, why: '目前是單機模式(沒有連上雲端),只能存在這台電腦。' };
    if (!subtle()) return { ok: false, why: '這個瀏覽器或網址不支援加密功能(需要 https 網址或 localhost)。' };
    return { ok: true, why: '' };
  }
  function deriveKey(pw, salt, iter) {
    var S = subtle();
    return S.importKey('raw', utf8(String(pw)), 'PBKDF2', false, ['deriveKey']).then(function (km) {
      return S.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  // 加密:回傳 { c, iv, s, i }(都是字串/數字,可直接存雲端)
  function seal(obj, pw) {
    var salt = rnd(16), iv = rnd(12);
    return deriveKey(pw, salt, ITER).then(function (key) {
      return subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, utf8(JSON.stringify(obj)));
    }).then(function (ct) { return { c: b64(ct), iv: b64(iv), s: b64(salt), i: ITER }; });
  }
  // 解密:密碼錯誤會 reject Error('badpw')
  function open(rec, pw) {
    var salt = unb64(rec.s), iv = unb64(rec.iv), iter = Number(rec.i) || ITER;
    return deriveKey(pw, salt, iter).then(function (key) {
      return subtle().decrypt({ name: 'AES-GCM', iv: iv }, key, unb64(rec.c));
    }).then(function (pt) { return JSON.parse(unutf8(new Uint8Array(pt))); }, function () { throw new Error('badpw'); });
  }

  // 雲端清單:每個名稱只留最新一筆,被移除的不列。回傳 [{ id, name, t, students, records, size }](新的在前)
  function list() {
    var C = cloud(); if (!C) return Promise.resolve([]);
    return C.packList().then(function (rows) {
      var latest = {};
      rows.forEach(function (r) { if (!r || !r.n) return; var o = latest[r.n]; if (!o || (r.t || 0) > (o.t || 0) || ((r.t || 0) === (o.t || 0) && r.id > o.id)) latest[r.n] = r; });
      return Object.keys(latest).map(function (n) { return latest[n]; }).filter(function (r) { return r.k !== 'del'; })
        .map(function (r) { return { id: r.id, name: r.n, t: r.t || 0, students: r.a || 0, records: r.r || 0, size: r.sz || 0, s: r.s, i: r.i }; })
        .sort(function (a, b) { return b.t - a.t; });
    });
  }
  function pwProblem(pw) { return !pw || String(pw).length < MIN_PW ? '密碼至少要 ' + MIN_PW + ' 個字。' : ''; }

  // 檢查密碼是不是和雲端上已有的資料包一樣(雲端還沒有資料包 → 這組就是第一組密碼)。回傳 { ok, first, error }
  function checkPassword(pw, cur) {
    var C = cloud(); var p = pwProblem(pw); if (p) return Promise.resolve({ ok: false, error: p });
    return (cur ? Promise.resolve(cur) : list()).then(function (l) {
      if (!l.length) return { ok: true, first: true };
      return C.packGet(l[0].id).then(function (d) {
        if (!d) return { ok: true, first: false };   // 資料文件找不到:無從比對
        return open({ c: d.c, iv: d.iv, s: l[0].s, i: l[0].i }, pw).then(function () { return { ok: true, first: false }; }, function () { return { ok: false, error: '這組密碼和雲端上已經存的資料包不一樣。請輸入當初設的密碼(換成別的密碼會讓同一個雲端有兩種密碼,之後會混亂)。' }; });
      });
    });
  }

  // 把這台電腦的某個資料包加密存到雲端。回傳 { ok, name, students, records, error }
  function upload(packId, pw, opts) {
    var C = cloud(), av = available(); if (!av.ok) return Promise.resolve({ ok: false, error: av.why });
    var K = global.KBSrc, pk = K && K.packData(packId); if (!pk) return Promise.resolve({ ok: false, error: '找不到這個資料包。' });
    var info = K.listPacks().filter(function (p) { return p.id === packId; })[0] || {};
    var chk = opts && opts.checked ? Promise.resolve({ ok: true }) : checkPassword(pw, opts && opts.cur);
    return chk.then(function (ck) {
      if (!ck.ok) return { ok: false, error: ck.error };
      return seal({ v: 1, name: pk.name, added: pk.added, data: pk.data }, pw).then(function (sl) {
        if (sl.c.length > MAX_C) return { ok: false, error: '「' + pk.name + '」太大(加密後 ' + Math.round(sl.c.length / 1000) + ' KB),超過雲端單筆的上限。請把它拆成幾個較小的資料包再存。' };
        var id = 'k' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
        return C.packPut(id, { c: sl.c, iv: sl.iv }, { n: pk.name, t: Date.now(), k: 'pack', a: info.students || 0, r: info.records || 0, s: sl.s, i: sl.i, sz: sl.c.length }).then(function () {
          return { ok: true, name: pk.name, id: id, students: info.students || 0, records: info.records || 0 };
        });
      });
    }).catch(function (e) { return { ok: false, error: '沒有存成功:' + String((e && (e.code || e.message)) || e).slice(0, 120) + (/permission/i.test(String(e && e.code)) ? '(雲端規則還沒開通「資料包」區,請先到 Firebase 發布新規則)' : '') }; });
  }
  // 從雲端把某一筆解開,放進這台電腦(同名的資料包會被更新)。item = list() 的一列
  function download(item, pw) {
    var C = cloud(), av = available(); if (!av.ok) return Promise.resolve({ ok: false, error: av.why });
    var p = pwProblem(pw); if (p) return Promise.resolve({ ok: false, error: p });
    return C.packGet(item.id).then(function (d) {
      if (!d) return { ok: false, error: '雲端上找不到「' + item.name + '」的內容。' };
      return open({ c: d.c, iv: d.iv, s: item.s, i: item.i }, pw).then(function (pack) {
        var r = global.KBSrc.importPack(pack.data, { name: pack.name || item.name });
        return r.ok ? { ok: true, name: r.name, replaced: r.replaced, students: r.students, records: r.records } : { ok: false, error: r.error };
      }, function (e) {
        return { ok: false, error: e && e.message === 'badpw' ? '密碼不對,或這筆資料被改過,解不開。' : '解開時發生問題:' + String(e && e.message || e).slice(0, 100) };
      });
    }).catch(function (e) { return { ok: false, error: '讀取失敗:' + String((e && (e.code || e.message)) || e).slice(0, 120) }; });
  }
  // 從雲端移除(其實是再新增一筆「已移除」的標記;原本的密文仍留在資料庫裡,但已加密,沒有密碼看不到)
  function remove(name) {
    var C = cloud(), av = available(); if (!av.ok) return Promise.resolve({ ok: false, error: av.why });
    var id = 'k' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
    return C.packPut(id, null, { n: String(name), t: Date.now(), k: 'del', a: 0, r: 0, s: '', i: 0, sz: 0 }).then(function () { return { ok: true, name: name }; }, function (e) { return { ok: false, error: '沒有移除成功:' + String((e && (e.code || e.message)) || e).slice(0, 120) }; });
  }

  global.KBSrcCloud = { available: available, seal: seal, open: open, list: list, checkPassword: checkPassword, upload: upload, download: download, remove: remove, pwProblem: pwProblem, MIN_PW: MIN_PW, ITER: ITER };
})(typeof window !== 'undefined' ? window : globalThis);
