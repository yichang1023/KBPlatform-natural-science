/* =====================================================================
 *  KB Core — 知識建構平台共用核心(測試版:單機運作,資料存在這台電腦的瀏覽器)
 *  功能:資料儲存與同步(多分頁)、帳號與登入、角色權限、稽核紀錄、備份還原、名單匯入
 *  介面保持不變的原則:各頁面只透過 window.KB 取用資料與權限
 *  日後接雲端(Firebase / Supabase)時,只需替換本檔的「儲存層」
 * ===================================================================== */
(function (global) {
  'use strict';
  var NS = 'kbp_v1_';
  var KEYS = ['users', 'classes', 'groups', 'topics', 'nodes', 'trash', 'settings', 'audit', 'backups'];
  var memStore = {};
  var listeners = [];
  var S = null;
  var cloud = null; // 雲端同步轉接器(kb-cloud.js 掛上;單機版為 null)

  /* ---------- 儲存層(localStorage,失敗時退回記憶體) ---------- */
  function rawGet(k) { try { return global.localStorage.getItem(NS + k); } catch (e) { return memStore[k] === undefined ? null : memStore[k]; } }
  function rawSet(k, v) { try { global.localStorage.setItem(NS + k, v); } catch (e) { memStore[k] = v; } }
  function rawDel(k) { try { global.localStorage.removeItem(NS + k); } catch (e) { delete memStore[k]; } }
  function readJSON(k, fallback) { var v = rawGet(k); if (v === null || v === undefined) return fallback; try { return JSON.parse(v); } catch (e) { return fallback; } }
  function writeJSON(k, v) { rawSet(k, JSON.stringify(v)); }

  /* ---------- SHA-256(純 JS,同步) ---------- */
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), result = '', i, j;
    var words = [], asciiBitLength;
    var utf8 = unescape(encodeURIComponent(ascii));
    asciiBitLength = utf8.length * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], primeCounter = k.length, isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    var H = hash.slice(0, 8);
    utf8 += '\x80';
    while (utf8.length % 64 - 56) utf8 += '\x00';
    for (i = 0; i < utf8.length; i++) { j = utf8.charCodeAt(i); words[i >> 2] |= j << ((3 - i) % 4) * 8; }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = H;
      H = H.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = H[0], e = H[4];
        var temp1 = H[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & H[5]) ^ (~e & H[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
        H = [(temp1 + temp2) | 0].concat(H);
        H[4] = (H[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (H[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); }
    return result;
  }
  function randSalt() { var s = ''; for (var i = 0; i < 12; i++) s += Math.floor(Math.random() * 36).toString(36); return s; }
  function hashPw(pw, salt) { return sha256(salt + '|' + pw); }
  // 學生登入時順便向伺服器換一張「憑證」(只存憑證,不存密碼),ASRA 頁用它自動同步老師存好的學習單資料。
  // 沒有 /api(單機測試版)或伺服器沒設定時什麼都不會發生。
  function asraToken(id, pw) {
    try {
      if (typeof global.fetch !== 'function' || !/^https?:$/.test(global.location.protocol) || !(global.KB && global.KB.cloud && global.KB.cloud.mode === 'cloud')) return;
      global.fetch('/api/asra-stu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', uid: id, password: pw }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.token) { try { global.localStorage.setItem('kb_asra_tok_' + id, JSON.stringify({ t: j.token, exp: j.exp })); } catch (x) {} } })
        .catch(function () {});
    } catch (x) {}
  }
  function nowISO() { return new Date().toISOString(); }
  function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- 預設資料 ---------- */
  function defaultSettings() {
    return {
      platformName: '知識建構平台',
      announcement: { enabled: false, text: '', level: 'info' },
      maintenance: false,
      guestEnabled: true,
      studentDeleteOwn: 'noReplies',      // always | noReplies | never
      studentEditOwn: true,
      crossGroupPost: true,
      crossClassPost: false,                // 學生可以跨班級發言(關閉:學生只能在「自己班級」與「全部班級共用」的討論區發言)
      forumLocked: false,
      postWindow: { enabled: false, start: '', end: '' },
      displayMode: 'name',                  // name(姓名,預設,所有人可見) | id(學號)
      idleMinutes: 60,
      lockout: { maxFails: 5, minutes: 10 },
      analysis: { agencyPass: 0.7, agencyRate: 0.6, agencyTargets: { init: 0.25, mon: 0.5, exp: 0.3 }, kbDiversityContrast: 0.3, kbSources: 0.05, kbQuestion: 0.15, extraTerms: '', ignoredTerms: '' },
      ai: { enabled: true, stripNames: true, model: 'auto' },
      media: { enabled: true },   // 發言視窗的「📷 加照片 / 🎙️ 錄音」(設定中心可關閉)
      voice: { enabled: true },   // 發言視窗的「🎤 用說的」語音輸入(測試中;設定中心可關閉,關閉後回到只有打字)
      requireStudentPwChange: false,   // 目前統一不強制改密碼(此設定已不再生效)
      consent: { enabled: false, version: 1, text: '歡迎使用本平台。本平台用於課程學習與教學研究:你在論壇的發言與操作紀錄會被保存,並可能以匿名方式(姓名會以代號取代)用於教學分析與研究。請妥善保管自己的帳號與密碼,不要借給別人使用。若有疑問請洽老師。按「同意並繼續」表示你已閱讀並同意。' }
    };
  }
  function defaultTopics() {
    var d = '2025-12-10T10:00:00Z';
    return [
      { id: 't_g1', name: '第一組 KF論壇：聲波與空氣過濾機制探究', categories: ['科學', '物理', '專題課'], desc: '探討聲波、流場與結構如何共同塑造粒子路徑並影響過濾效果。', author: 'master', date: d, status: 'open' },
      { id: 't_g2', name: '第二組 KF論壇：可信的居家非接觸判讀模型探究', categories: ['科學', 'AI', '專題課'], desc: '探討異常判讀的合理性，從單一門檻走向基線、情境、時間與風險的居家判讀模型。', author: 'master', date: d, status: 'open' },
      { id: 't_g3', name: '第三組 KF論壇：毛小孩健康狀態可信判讀模型探究', categories: ['科學', 'AI', '專題課'], desc: '探討毛小孩狀態的誤讀風險，從「單純偵測變化」推進到建立「基線×情境×資料可信度」的健康判讀與提醒模型。', author: 'master', date: d, status: 'open' },
      { id: 't_g4', name: '第四組 KF論壇：聲波滅火機制探究', categories: ['科學', '物理', '專題課'], desc: '探討聲波與火焰互動的失穩條件，從「音量迷思」推進到建立有效區、無效區與邊界區的理解地圖。', author: 'master', date: d, status: 'open' },
      { id: 't_g5', name: '第五組 KF論壇：生成式AI的高風險幻覺形成與代價探究', categories: ['科學', 'AI', '社會議題', '專題課'], desc: '探討生成式AI幻覺如何穿過流暢與自信的包裝，在特定任務與信任互動中放大成為真實風險的結構模型。', author: 'master', date: d, status: 'open' }
    ];
  }
  function makeUser(id, role, realName, password, extra) {
    var salt = randSalt();
    var u = { id: id, role: role, realName: realName || '', classId: '', groupId: '', status: 'active', mustChange: false, salt: salt, pwHash: hashPw(password, salt), createdAt: nowISO(), lastLogin: '', fails: 0, lockUntil: 0 };
    if (extra) for (var k in extra) u[k] = extra[k];
    return u;
  }
  function defaultUsers() {
    return [makeUser('master', 'master', '管理者', 'master'), makeUser('teacher', 'teacher', '老師', 'teacher')];
  }

  /* ---------- 載入與持久化 ---------- */
  function load() {
    S = {};
    KEYS.forEach(function (k) { S[k] = readJSON(k, null); });
    var dirty = [];
    if (!Array.isArray(S.users) || !S.users.length) { S.users = defaultUsers(); dirty.push('users'); }
    if (!Array.isArray(S.classes)) { S.classes = []; dirty.push('classes'); }
    if (!Array.isArray(S.groups)) { S.groups = []; dirty.push('groups'); }
    if (!Array.isArray(S.topics)) { S.topics = defaultTopics(); dirty.push('topics'); }
    if (!Array.isArray(S.nodes)) { S.nodes = []; dirty.push('nodes'); }
    if (!Array.isArray(S.trash)) { S.trash = []; dirty.push('trash'); }
    var ds = defaultSettings();
    if (!S.settings || typeof S.settings !== 'object') { S.settings = ds; dirty.push('settings'); }
    else { S.settings = deepMerge(ds, S.settings); }
    if (!Array.isArray(S.audit)) { S.audit = []; dirty.push('audit'); }
    if (!Array.isArray(S.backups)) { S.backups = []; dirty.push('backups'); }
    dirty.forEach(function (k) { writeJSON(k, S[k]); });
  }
  function deepMerge(base, over) {
    var out = clone(base);
    (function m(a, b) {
      for (var k in b) {
        if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') m(a[k], b[k]);
        else a[k] = b[k];
      }
    })(out, over || {});
    return out;
  }
  var lastNotify = 0;
  function notify(keys, remote) { listeners.slice().forEach(function (fn) { try { fn(keys || [], !!remote); } catch (e) { if (global.console) console.error(e); } }); }
  function persist(keys) {
    keys.forEach(function (k) { writeJSON(k, S[k]); }); notify(keys, false);
    if (cloud) { try { cloud.push(keys); } catch (e) { if (global.console) console.error(e); } }
  }

  if (global.addEventListener) {
    global.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf(NS) !== 0) return;
      var k = e.key.slice(NS.length);
      if (KEYS.indexOf(k) < 0 && k !== 'session') return;
      if (k !== 'session') { S[k] = readJSON(k, S[k]); if (k === 'settings') S.settings = deepMerge(defaultSettings(), S.settings); }
      notify([k], true);
    });
  }

  /* ---------- 稽核紀錄 ---------- */
  function actorInfo() {
    var s = readJSON('session', null);
    return s ? { id: s.account, role: s.role } : { id: '(未登入)', role: '' };
  }
  function audit(action, target, detail, ok) {
    var a = actorInfo();
    var entry = { _k: nowISO() + '_' + Math.random().toString(36).slice(2, 6), t: nowISO(), actor: a.id, role: a.role, action: action, target: target || '', detail: detail || '', ok: ok !== false };
    S.audit.push(entry);
    if (S.audit.length > 5000) S.audit = S.audit.slice(-4000);
    writeJSON('audit', S.audit);
    if (cloud && cloud.pushAudit) { try { cloud.pushAudit(entry); } catch (e) {} }
  }

  /* ---------- 設定 ---------- */
  var settings = {
    get: function () { return clone(S.settings); },
    update: function (patch) {
      S.settings = deepMerge(S.settings, patch);
      persist(['settings']);
      audit('settings.update', '', JSON.stringify(patch).slice(0, 300));
      return clone(S.settings);
    }
  };

  /* ---------- 顯示名稱 ---------- */
  var ROLE_LABEL = { master: '管理者', teacher: '老師', guest: '訪客' };
  function isStaffRole(r) { return r === 'master' || r === 'teacher'; }
  function userById(id) { for (var i = 0; i < S.users.length; i++) if (S.users[i].id === id) return S.users[i]; return null; }
  function avatarFor(id, role) {
    var colors = { master: '#7c3aed', teacher: '#2563eb', student: '#16a34a', guest: '#64748b' };
    var c = colors[role] || colors.student;
    var txt = role === 'master' ? '管' : role === 'teacher' ? '師' : role === 'guest' ? '訪' : String(id).slice(-2);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c + '"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#g)"/><text x="32" y="40" font-family="sans-serif" font-size="' + (txt.length > 1 ? 22 : 26) + '" font-weight="700" fill="#fff" text-anchor="middle">' + txt + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function labelFor(id, viewerRole) {
    if (id === 'guest') return ROLE_LABEL.guest;
    var u = userById(id);
    if (!u) return String(id);
    if (u.role === 'master') return ROLE_LABEL.master;
    if (u.role === 'teacher') return ROLE_LABEL.teacher;
    if (S.settings.displayMode !== 'id' && u.realName) {
      // 同名同姓時加上學號區分
      var dup = S.users.some(function (x) { return x.id !== u.id && x.role === 'student' && x.realName === u.realName; });
      return dup ? u.realName + '(' + u.id + ')' : u.realName;
    }
    return u.id;
  }
  var display = {
    label: labelFor,
    roleLabel: function (role) { return ROLE_LABEL[role] || '學生'; },
    avatar: avatarFor
  };

  /* ---------- 帳號與登入 ---------- */
  function sessionRead() { return readJSON('session', null); }
  function sessionWrite(s) { if (s) writeJSON('session', s); else rawDel('session'); }
  function idleLimitMs() { return (S.settings.idleMinutes || 0) * 60000; }

  /* ---------- 上線足跡:每個登入階段在雲端記一筆 session(開始、最後活動、進入過哪些頁面) ----------
   * 目的:總控制平台看得到「哪天登入、停留多久、進了哪些頁面」。
   * 為了不浪費雲端寫入:登入時寫 1 次;使用中最多每 5 分鐘更新 1 次(同一筆,不會越寫越多);換到沒去過的頁面、登出時各更新 1 次。
   * 只存雲端稽核集合(不放進本機的稽核清單,畫面上的稽核紀錄不會被塞滿)。訪客不記。 */
  var PRES_EVERY = 5 * 60000, PAGE_OF = { 'knowledge building forum.html': 'forum', 'analytics-student.html': 'student', 'analytics-teacher.html': 'teacher', 'asra.html': 'asra', 'setup.html': 'setup', 'index.html': 'home', '': 'home' };
  function pageName() {
    var p = ''; try { p = decodeURIComponent(((global.location && global.location.pathname) || '').split('/').pop()).toLowerCase(); } catch (e) {}
    return PAGE_OF[p] || 'other';
  }
  function presenceSend(s, force, ended) {
    if (!cloud || !cloud.pushAudit || !s || !s.sid || s.role === 'guest') return;
    var now = Date.now(); if (!force && now - (s.pw || 0) < PRES_EVERY) return;
    var last = Math.max(s.last || 0, s.since || 0);
    if (!ended) { s.pw = now; sessionWrite(s); }
    try { cloud.pushAudit({ _k: 'ses_' + s.sid, t: new Date(s.since).toISOString(), actor: s.account, role: s.role, action: 'session', target: s.sid, detail: '', ok: true, last: new Date(last).toISOString(), pages: s.pages || {}, end: ended || '' }); } catch (e) {}
  }
  var pageNoted = false;
  function presenceNote() {   // 這一頁載入時:記一次「進入了這個頁面」
    if (pageNoted) return; var s = sessionRead(); if (!s || !s.sid || s.role === 'guest') return;
    pageNoted = true; var n = pageName(); s.pages = s.pages || {}; var first = !s.pages[n]; s.pages[n] = (s.pages[n] || 0) + 1; sessionWrite(s); presenceSend(s, first);
  }
  function publicUser(u) {
    return { id: u.id, role: u.role, label: labelFor(u.id, u.role), avatar: avatarFor(u.id, u.role), realName: u.realName, classId: u.classId, groupId: u.groupId, mustChange: false,
      needConsent: u.role === 'student' && !!(S.settings.consent && S.settings.consent.enabled) && u.consentVersion !== S.settings.consent.version };
  }
  var auth = {
    current: function () {
      var s = sessionRead();
      if (!s) return null;
      if (s.role === 'guest') return { id: 'guest', role: 'guest', label: ROLE_LABEL.guest, avatar: avatarFor('guest', 'guest'), realName: '', classId: '', groupId: '', mustChange: false };
      var u = userById(s.account);
      if (!u || u.status !== 'active') { sessionWrite(null); return null; }
      if (isStaffRole(u.role) && idleLimitMs() > 0 && s.last && Date.now() - s.last > idleLimitMs()) { audit('auth.idleLogout', u.id, ''); presenceSend(s, true, 'idle'); sessionWrite(null); return null; }
      return publicUser(u);
    },
    touch: function () { var s = sessionRead(); if (s && s.role !== 'guest') { s.last = Date.now(); sessionWrite(s); presenceSend(s, false); } },
    login: function (expect, account, password) {
      account = String(account || '').trim(); password = String(password == null ? '' : password);
      if (!account || !password) return { ok: false, error: '請輸入帳號與密碼' };
      var u = userById(account);
      if (!u && expect === 'staff') { var low = account.toLowerCase(); for (var i = 0; i < S.users.length; i++) if (S.users[i].id.toLowerCase() === low) { u = S.users[i]; break; } }
      var generic = expect === 'staff' ? '帳號或密碼不正確' : '學號或密碼不正確';
      if (!u) { audit('auth.loginFail', account, '帳號不存在', false); return { ok: false, error: generic }; }
      if (u.status !== 'active') { audit('auth.loginFail', u.id, '帳號已停用', false); return { ok: false, error: '此帳號已停用,請洽老師或管理者' }; }
      if (u.lockUntil && Date.now() < u.lockUntil) { var mins = Math.ceil((u.lockUntil - Date.now()) / 60000); audit('auth.loginFail', u.id, '帳號鎖定中', false); return { ok: false, error: '登入失敗次數過多,請 ' + mins + ' 分鐘後再試' }; }
      var okRole = expect === 'staff' ? isStaffRole(u.role) : u.role === 'student';
      if (!okRole || hashPw(password, u.salt) !== u.pwHash) {
        u.fails = (u.fails || 0) + 1;
        var lim = S.settings.lockout || { maxFails: 5, minutes: 10 };
        if (u.fails >= lim.maxFails) { u.lockUntil = Date.now() + lim.minutes * 60000; u.fails = 0; audit('auth.lock', u.id, '連續失敗,暫時鎖定', false); }
        persist(['users']);
        audit('auth.loginFail', u.id, okRole ? '密碼錯誤' : '身分入口不符', false);
        return { ok: false, error: generic };
      }
      u.fails = 0; u.lockUntil = 0; u.lastLogin = nowISO();
      persist(['users']);
      var nowMs = Date.now(); sessionWrite({ account: u.id, role: u.role, since: nowMs, last: nowMs, sid: 'S' + nowMs.toString(36) + Math.random().toString(36).slice(2, 5), pages: {} });
      audit('auth.login', u.id, '');
      pageNoted = false; presenceSend(sessionRead(), true);
      if (expect !== 'staff') asraToken(u.id, password);
      return { ok: true, user: publicUser(u), mustChange: false };   // 目前統一不強制改密碼
    },
    acceptConsent: function () {
      var cur = auth.current(); if (!cur || cur.role !== 'student') return { ok: false };
      var u = userById(cur.id); u.consentVersion = S.settings.consent.version; u.consentAt = nowISO();
      persist(['users']); audit('auth.consent', u.id, '版本 ' + u.consentVersion); return { ok: true };
    },
    guest: function () {
      if (!S.settings.guestEnabled) return { ok: false, error: '目前未開放訪客登入' };
      sessionWrite({ account: 'guest', role: 'guest', since: Date.now(), last: Date.now() });
      audit('auth.guest', 'guest', '');
      return { ok: true, user: { id: 'guest', role: 'guest', label: ROLE_LABEL.guest } };
    },
    logout: function () { var a = actorInfo(), s = sessionRead(); audit('auth.logout', a.id, ''); if (s) { s.last = Date.now(); presenceSend(s, true, 'logout'); } sessionWrite(null); },
    changePassword: function (oldPw, newPw, opts) {
      var cur = auth.current();
      if (!cur || cur.role === 'guest') return { ok: false, error: '請先登入' };
      var u = userById(cur.id);
      if (!(opts && opts.skipOld) && hashPw(String(oldPw), u.salt) !== u.pwHash) { audit('auth.changePwFail', u.id, '舊密碼錯誤', false); return { ok: false, error: '目前的密碼不正確' }; }
      var pol = auth.checkPolicy(newPw, u);
      if (pol) return { ok: false, error: pol };
      u.salt = randSalt(); u.pwHash = hashPw(String(newPw), u.salt); u.mustChange = false;
      delete u.initialPw;   // 學生自己改了密碼:系統不再保存任何明碼
      persist(['users']);
      audit('auth.changePw', u.id, '');
      return { ok: true };
    },
    checkPolicy: function (pw, u) {
      pw = String(pw == null ? '' : pw);
      if (pw.length < 6) return '新密碼至少需要 6 個字元';
      if (u && pw === u.id) return '新密碼不可以與帳號(學號)相同';
      return '';
    },
    isStaff: function (r) { return isStaffRole(r); },
    _isStaff: function (r) { return isStaffRole(r); }
  };

  /* ---------- 權限 ---------- */
  function inPostWindow() {
    var w = S.settings.postWindow || {};
    if (!w.enabled) return true;
    var now = Date.now(), s = w.start ? Date.parse(w.start) : -Infinity, e = w.end ? Date.parse(w.end) : Infinity;
    return now >= s && now <= e;
  }
  // 討論區可以屬於某個班級(topic.classId);沒有指定班級 = 全部班級共用。
  // 學生只能在自己班級的討論區發言,除非老師打開「學生可以跨班級發言」;老師與管理者不受限制。
  function topicById(id) { for (var i = 0; i < S.topics.length; i++) if (S.topics[i].id === id) return S.topics[i]; return null; }
  // 這個討論區屬於哪個班級:有指定就用指定的;老師特別選了「全部班級共用」(shared)就是共用;
  // 舊資料沒有設定也沒標共用,就看是誰在裡面發言:全是同一個班的學生 → 當作那個班的討論區(例如五年級示範班的教材),其他情況 = 共用。
  function topicClassOf(tp) {
    if (typeof tp === 'string') tp = topicById(tp);
    if (!tp) return '';
    if (tp.classId) return tp.classId;
    if (tp.shared) return '';
    var seen = {}, cnt = 0, i, u;
    for (i = 0; i < S.nodes.length; i++) {
      if (S.nodes[i].topicId !== tp.id) continue;
      u = userById(S.nodes[i].author);
      if (u && u.role === 'student' && u.classId && !seen[u.classId]) { seen[u.classId] = 1; cnt++; if (cnt > 1) return ''; }
    }
    return cnt === 1 ? Object.keys(seen)[0] : '';
  }
  function classAllows(cur, topicId) {
    if (!topicId) return true;
    var tp = topicById(topicId); if (!tp) return true;
    var tc = topicClassOf(tp); if (!tc) return true;
    if (S.settings.crossClassPost) return true;
    var u = cur ? userById(cur.id) : null;
    return !!u && u.classId === tc;
  }
  // 為什麼現在不能發言(給畫面顯示);可以發言時回傳空字串
  function postBlock(topicId) {
    var cur = auth.current(); if (!cur) return '請先登入';
    if (cur.role === 'guest') return '訪客只能瀏覽,請登入後再發文';
    if (isStaffRole(cur.role)) return '';
    if (S.settings.forumLocked) return '論壇已鎖定,目前是唯讀';
    if (!inPostWindow()) return '現在不在開放發文的時間';
    if (!classAllows(cur, topicId)) {
      var tp = topicById(topicId), c = S.classes.filter(function (x) { return x.id === topicClassOf(tp); })[0];
      if (c && isMaterialClass(c)) return '這是教材班「' + c.name + '」的內容,只能閱讀。請回到自己班級的討論區發言。';
      return '這是「' + (c ? c.name : '其他班級') + '」的討論區,目前只有該班的學生能發言。(老師可以在「設定中心 → 論壇設定」開啟「學生可以跨班級發言」。)';
    }
    return '';
  }
  function can(action, ctx) {
    ctx = ctx || {};
    var cur = ctx.role ? { role: ctx.role, id: ctx.id } : auth.current();
    var role = cur ? cur.role : 'none';
    var staff = isStaffRole(role), loggedIn = role === 'student' || staff, st = S.settings;
    switch (action) {
      case 'forum.read': return loggedIn || (role === 'guest' && st.guestEnabled);
      case 'forum.post': if (!loggedIn) return false; if (staff) return true; return !st.forumLocked && inPostWindow() && classAllows(cur, ctx.topicId);
      case 'forum.editOwn': if (staff) return true; return role === 'student' && st.studentEditOwn && !st.forumLocked && ctx.author === cur.id;
      case 'forum.deleteOwn':
        if (staff) return true;
        if (role !== 'student' || ctx.author !== cur.id || st.forumLocked) return false;
        if (st.studentDeleteOwn === 'always') return true;
        if (st.studentDeleteOwn === 'noReplies') return !ctx.hasReplies;
        return false;
      case 'forum.deleteAny': return staff;
      case 'topic.manage': return staff;
      case 'analytics.teacher': return staff;
      case 'analytics.student': return loggedIn;
      case 'setup.access': return staff;
      case 'users.manage': case 'data.manage': case 'settings.manage': case 'audit.read': return staff;
      default: return false;
    }
  }
  function guard(opts) {
    opts = opts || {};
    var cur = auth.current();
    var okRole = false;
    if (cur) {
      if (cur.role === 'guest') okRole = !!(opts.allowGuest && S.settings.guestEnabled);
      else if (opts.staff) okRole = isStaffRole(cur.role);
      else if (opts.roles) okRole = opts.roles.indexOf(cur.role) >= 0;
      else okRole = true;
    }
    if (!okRole) { return { ok: false, user: cur }; }
    return { ok: true, user: cur };
  }

  /* ---------- 使用者管理 ---------- */
  function activeStaffCount(excludeId, alsoDemote) {
    var n = 0;
    S.users.forEach(function (u) { if (isStaffRole(u.role) && u.status === 'active' && u.id !== excludeId) n++; });
    return n;
  }
  // 比對姓名時,「溫」與「温」視為同一個字
  function normName(n) { return String(n == null ? '' : n).replace(/\s+/g, '').replace(/溫/g, '温'); }
  var ID_RE = /^[A-Za-z0-9_.@-]{1,40}$/;
  function isPwDefault(u) { return hashPw(u.initialPw ? String(u.initialPw) : u.id, u.salt) === u.pwHash; }
  function defaultPasswordFor(u) { return u.role === 'student' ? String(u.id) : String(u.id); }
  var users = {
    // pwDefault:密碼是否還是預設值(=帳號/學號)。系統只存加密後的密碼,看不到任何人自己改的密碼;忘記時請用「重設密碼」
    list: function () { return S.users.map(function (u) { var c = clone(u); c.pwDefault = isPwDefault(u); if (c.pwDefault) c.initialPw = String(u.initialPw || u.id); else delete c.initialPw; delete c.pwHash; delete c.salt; return c; }); },
    get: function (id) { var u = userById(id); if (!u) return null; var c = clone(u); delete c.pwHash; delete c.salt; return c; },
    create: function (o) {
      var id = String(o.id || '').trim(), role = o.role || 'student';
      if (!ID_RE.test(id)) return { ok: false, error: '帳號/學號只能使用英數字與 _ . @ -,長度 1 到 40' };
      if (id.toLowerCase() === 'guest') return { ok: false, error: '「guest」為系統保留字' };
      if (['master', 'teacher', 'student'].indexOf(role) < 0) return { ok: false, error: '角色不正確' };
      for (var i = 0; i < S.users.length; i++) if (S.users[i].id.toLowerCase() === id.toLowerCase()) return { ok: false, error: '帳號/學號已存在:' + id };
      var pw = o.password ? String(o.password) : id;
      var u = makeUser(id, role, String(o.realName || '').trim(), pw, { classId: o.classId || '', groupId: o.groupId || '' });
      u.mustChange = false;   // 目前統一不強制改密碼
      if (o.password) u.initialPw = String(o.password);   // 老師匯入/指定的初始密碼:學生還沒改之前,設定中心看得到
      S.users.push(u);
      persist(['users']);
      audit('user.create', id, role);
      return { ok: true, id: id };
    },
    update: function (id, patch) {
      var u = userById(id); if (!u) return { ok: false, error: '找不到使用者' };
      if (patch.role && patch.role !== u.role) {
        if (['master', 'teacher', 'student'].indexOf(patch.role) < 0) return { ok: false, error: '角色不正確' };
        if (isStaffRole(u.role) && !isStaffRole(patch.role) && activeStaffCount(u.id) < 1) return { ok: false, error: '不能把最後一個管理者/老師帳號降級(平台必須至少保留一個最高權限帳號)' };
        audit('user.roleChange', id, u.role + ' → ' + patch.role); u.role = patch.role;
      }
      ['realName', 'classId', 'groupId'].forEach(function (k) { if (patch[k] !== undefined) u[k] = String(patch[k]); });
      persist(['users']);
      audit('user.update', id, JSON.stringify({ realName: patch.realName, classId: patch.classId, groupId: patch.groupId }));
      return { ok: true };
    },
    setStatus: function (id, status) {
      var u = userById(id); if (!u) return { ok: false, error: '找不到使用者' };
      if (status === 'disabled' && isStaffRole(u.role) && u.status === 'active' && activeStaffCount(u.id) < 1) return { ok: false, error: '不能停用最後一個管理者/老師帳號(平台必須至少保留一個啟用中的最高權限帳號)' };
      u.status = status; persist(['users']); audit('user.status', id, status); return { ok: true };
    },
    remove: function (id) {
      var u = userById(id); if (!u) return { ok: false, error: '找不到使用者' };
      if (isStaffRole(u.role) && u.status === 'active' && activeStaffCount(u.id) < 1) return { ok: false, error: '不能刪除最後一個管理者/老師帳號(平台必須至少保留一個啟用中的最高權限帳號)' };
      S.users = S.users.filter(function (x) { return x.id !== id; });
      persist(['users']); audit('user.delete', id, u.role); return { ok: true };
    },
    resetPassword: function (id, newPw) {
      var u = userById(id); if (!u) return { ok: false, error: '找不到使用者' };
      var pw = newPw ? String(newPw) : defaultPasswordFor(u);
      u.salt = randSalt(); u.pwHash = hashPw(pw, u.salt); u.fails = 0; u.lockUntil = 0;
      u.mustChange = false;   // 目前統一不強制改密碼
      if (newPw) u.initialPw = String(newPw); else delete u.initialPw;   // 老師指定的新密碼視為新的初始密碼;重設為學號就不用另外記
      persist(['users']); audit('user.resetPw', id, newPw ? '指定新密碼' : '重設為預設'); return { ok: true, password: pw };
    },
    /* 更換學號:同步改寫貼文、主題建立者、回收桶中的作者,貼文上顯示的姓名不變 */
    renameId: function (oldId, newId) {
      newId = String(newId || '').trim();
      var u = userById(oldId); if (!u) return { ok: false, error: '找不到使用者' };
      if (oldId === newId) return { ok: true };
      if (!ID_RE.test(newId)) return { ok: false, error: '學號只能使用英數字與 _ . @ -,長度 1 到 40' };
      if (newId.toLowerCase() === 'guest') return { ok: false, error: '「guest」為系統保留字' };
      for (var i = 0; i < S.users.length; i++) if (S.users[i].id.toLowerCase() === newId.toLowerCase() && S.users[i].id !== oldId) return { ok: false, error: '學號已存在:' + newId };
      u.id = newId; delete u.placeholder;
      var n = 0;
      S.nodes.forEach(function (x) { if (x.author === oldId) { x.author = newId; n++; } });
      S.topics.forEach(function (x) { if (x.author === oldId) x.author = newId; });
      S.trash.forEach(function (it) {
        var arr = Array.isArray(it.data) ? it.data : [it.data];
        arr.concat(it.relatedNodes || []).forEach(function (x) { if (x && x.author === oldId) x.author = newId; });
        if (it.deletedBy === oldId) it.deletedBy = newId;
      });
      var sess = readJSON('session', null); if (sess && sess.account === oldId) { sess.account = newId; sessionWrite(sess); }
      persist(['users', 'nodes', 'topics', 'trash']);
      audit('user.renameId', oldId, oldId + ' → ' + newId + '(改寫 ' + n + ' 則貼文作者)');
      return { ok: true, posts: n };
    },
    unlock: function (id) { var u = userById(id); if (!u) return { ok: false }; u.fails = 0; u.lockUntil = 0; persist(['users']); audit('user.unlock', id, ''); return { ok: true }; },
    /* 匯入:rows 為物件陣列,欄位 id / realName / className / groupName / role / password */
    importRows: function (rows, opts) {
      opts = opts || {};
      var rep = { created: [], updated: [], skipped: [], errors: [], pwCustom: 0, pwKept: 0 }, seen = {};   // pwCustom:使用檔案中初始密碼的人數;pwKept:已自己改過密碼、不覆蓋的人數
      var autoClass = opts.autoCreateClass !== false;
      rows.forEach(function (r, idx) {
        var line = r._line || (idx + 2), id = String(r.id || '').trim();
        if (!id) { rep.errors.push({ row: line, id: '', msg: '缺少學號' }); return; }
        if (!ID_RE.test(id)) { rep.errors.push({ row: line, id: id, msg: '學號含有不允許的字元' }); return; }
        if (seen[id.toLowerCase()]) { rep.errors.push({ row: line, id: id, msg: '檔案內學號重複' }); return; }
        seen[id.toLowerCase()] = 1;
        var role = String(r.role || '學生').trim(), roleKey = (/老師|teacher/i.test(role)) ? 'teacher' : (/管理|master|admin/i.test(role)) ? 'master' : 'student';
        var name = String(r.realName || '').trim();
        if (!name) { rep.errors.push({ row: line, id: id, msg: '缺少姓名' }); return; }
        var classId = '', groupId = '';
        if (r.className) {
          var c = null; S.classes.forEach(function (x) { if (x.name === String(r.className).trim()) c = x; });
          if (!c) {
            if (!autoClass) { rep.errors.push({ row: line, id: id, msg: '班級不存在:' + r.className }); return; }
            if (!opts.dryRun) { c = { id: uid('c'), name: String(r.className).trim(), term: '', archived: false }; S.classes.push(c); } else c = { id: '(新)' };
          }
          classId = c.id;
          if (r.groupName) {
            var g = null; S.groups.forEach(function (x) { if (x.classId === classId && x.name === String(r.groupName).trim()) g = x; });
            if (!g) { if (!opts.dryRun) { g = { id: uid('g'), classId: classId, name: String(r.groupName).trim() }; S.groups.push(g); g.color = groupColorMapOf(S.groups.filter(function (x) { return x.classId === classId; }))[g.id]; } else g = { id: '(新)' }; }
            groupId = g.id;
          }
        }
        var exist = userById(id);
        if (!exist && opts.matchByName !== false) {
          var cand = S.users.filter(function (x) { return x.placeholder && x.role === 'student' && normName(x.realName) === normName(name); });
          if (cand.length === 1) {
            var oldId = cand[0].id;
            if (!opts.dryRun) {
              var rn = users.renameId(oldId, id);
              if (!rn.ok) { rep.errors.push({ row: line, id: id, msg: rn.error }); return; }
              var mu = userById(id); if (classId) mu.classId = classId; if (groupId) mu.groupId = groupId; mu.status = 'active';
              users.resetPassword(id, r.password || '');
            }
            if (r.password) rep.pwCustom++;
            rep.updated.push({ row: line, id: id, from: oldId, msg: '學號 ' + oldId + ' → ' + id + '(沿用既有貼文)' });
            return;
          }
        }
        if (exist) {
          // 學號就是登入帳號,全平台只能有一個。同一個學號出現在「另一個班級」時,不能略過、也不能更新(更新會把原本那位學生改成這個班級的人)
          if (classId && exist.classId && exist.classId !== classId) {
            var oc = S.classes.filter(function (x) { return x.id === exist.classId; })[0];
            rep.errors.push({ row: line, id: id, msg: '學號已被「' + (oc ? oc.name : '其他班級') + '」的「' + (exist.realName || exist.id) + '」使用。學號就是登入帳號,不能重複,請改用不同的學號(例如加上班級前綴 7-' + id + ')' });
            return;
          }
          if (opts.onDuplicate === 'update') {
            var pwNow = !!(r.password && isPwDefault(exist) && String(r.password) !== String(exist.initialPw || exist.id));   // 還在用初始密碼的人,才換成檔案裡的新初始密碼
            if (!opts.dryRun) { exist.realName = name; if (classId) exist.classId = classId; if (groupId) exist.groupId = groupId; if (pwNow) users.resetPassword(id, r.password); }
            if (pwNow) rep.pwCustom++;
            else if (r.password && !isPwDefault(exist)) rep.pwKept++;
            rep.updated.push({ row: line, id: id });
          }
          else rep.skipped.push({ row: line, id: id, msg: '帳號已存在,已略過' });
          return;
        }
        if (!opts.dryRun) {
          var res = users.create({ id: id, role: roleKey, realName: name, classId: classId, groupId: groupId, password: r.password || '' });
          if (!res.ok) { rep.errors.push({ row: line, id: id, msg: res.error }); return; }
        }
        if (r.password) rep.pwCustom++;
        rep.created.push({ row: line, id: id });
      });
      if (!opts.dryRun) { persist(['users', 'classes', 'groups']); audit('user.import', '', '新增 ' + rep.created.length + ' / 更新 ' + rep.updated.length + ' / 略過 ' + rep.skipped.length + ' / 錯誤 ' + rep.errors.length); }
      return rep;
    },
    defaultPassword: function (id) { return String(id); }
  };

  /* ---------- 班級與分組 ---------- */
  // 教材班(例如五年級示範班):所有學生登入後都可以進去看內容,但只有該班的學生能在裡面發言。舊資料的示範班(c_demo)視為教材班。
  function isMaterialClass(c) { if (typeof c === 'string') c = S.classes.filter(function (x) { return x.id === c; })[0]; return !!c && (c.material === undefined ? c.id === 'c_demo' : c.material === true); }
  // 組別顏色:老師可以自己選;沒選的,系統依組別順序從色盤配對(不會跟老師已選的顏色重複)。畫互動圖時,每一組用同一個顏色。
  // (kb-ego.js 裡的 colorMap 用同一套規則,兩邊要一樣)
  var GROUP_PALETTE = ['#e4572e', '#2e86de', '#2fa84f', '#f2a900', '#8e5bd9', '#0fa3b1', '#d6336c', '#7a8a2e', '#5c6f91', '#c0762d'];
  function validColor(v) { return /^#[0-9a-fA-F]{6}$/.test(String(v || '')); }
  function groupColorMapOf(list) {
    var used = {}, map = {}, i, k = 0;
    list.forEach(function (g) { if (validColor(g.color)) used[String(g.color).toLowerCase()] = 1; });
    list.forEach(function (g) {
      if (validColor(g.color)) { map[g.id] = g.color; return; }
      var tries = 0; while (used[GROUP_PALETTE[k % GROUP_PALETTE.length]] && tries++ < GROUP_PALETTE.length) k++;
      map[g.id] = GROUP_PALETTE[k % GROUP_PALETTE.length]; k++;
    });
    return map;
  }
  var classes = {
    isMaterial: isMaterialClass,
    GROUP_PALETTE: GROUP_PALETTE,
    // 某個班每一組的顏色 { 組別id: '#rrggbb' }(有設定用設定的,沒有就依順序配色)
    groupColorMap: function (classId) { return groupColorMapOf(S.groups.filter(function (g) { return !classId || g.classId === classId; })); },
    setGroupColor: function (id, color) { var g = S.groups.filter(function (x) { return x.id === id; })[0]; if (!g) return { ok: false, error: '找不到這個組別' }; if (!validColor(color)) return { ok: false, error: '顏色格式不對(要像 #2e86de)' }; g.color = String(color).toLowerCase(); persist(['groups']); audit('group.color', id, g.color); return { ok: true }; },
    // 自動配色:o.all = true → 全部重新配(預設只幫還沒有顏色的組別配)
    autoGroupColors: function (classId, o) {
      o = o || {}; var list = S.groups.filter(function (g) { return g.classId === classId; }); if (!list.length) return { ok: false, error: '這個班級還沒有組別' };
      if (o.all) list.forEach(function (g) { delete g.color; });
      var map = groupColorMapOf(list), n = 0; list.forEach(function (g) { if (!validColor(g.color)) { g.color = map[g.id]; n++; } });
      persist(['groups']); audit('group.color.auto', classId, '配色 ' + n + ' 組'); return { ok: true, colored: n };
    },
    // 某個人可以在論壇選到哪些班級:老師與管理者全部;學生 = 自己的班級 + 所有教材班
    visibleTo: function (cur) {
      var u = cur ? userById(cur.id) : null, staff = !cur || isStaffRole(cur.role);
      return clone(S.classes.filter(function (c) { return staff ? true : (!c.archived && (isMaterialClass(c) || (u && u.classId === c.id))) || (u && u.classId === c.id); }));
    },
    list: function () { return clone(S.classes); },
    create: function (name, term) { name = String(name || '').trim(); if (!name) return { ok: false, error: '請輸入班級名稱' }; if (S.classes.some(function (c) { return c.name === name; })) return { ok: false, error: '班級名稱已存在' }; var c = { id: uid('c'), name: name, term: term || '', archived: false }; S.classes.push(c); persist(['classes']); audit('class.create', c.id, name); return { ok: true, id: c.id }; },
    update: function (id, patch) { var c = S.classes.filter(function (x) { return x.id === id; })[0]; if (!c) return { ok: false }; ['name', 'term', 'archived', 'material'].forEach(function (k) { if (patch[k] !== undefined) c[k] = patch[k]; }); persist(['classes']); audit('class.update', id, JSON.stringify(patch)); return { ok: true }; },
    remove: function (id) {
      if (S.users.some(function (u) { return u.classId === id; })) return { ok: false, error: '班級內仍有使用者,請先移動或刪除' };
      S.classes = S.classes.filter(function (c) { return c.id !== id; }); S.groups = S.groups.filter(function (g) { return g.classId !== id; });
      persist(['classes', 'groups']); audit('class.delete', id, ''); return { ok: true };
    },
    groups: function (classId) { return clone(S.groups.filter(function (g) { return !classId || g.classId === classId; })); },
    createGroup: function (classId, name) { name = String(name || '').trim(); if (!name) return { ok: false, error: '請輸入組別名稱' }; var g = { id: uid('g'), classId: classId, name: name }; S.groups.push(g); var gm = groupColorMapOf(S.groups.filter(function (x) { return x.classId === classId; })); g.color = gm[g.id]; persist(['groups']); audit('group.create', g.id, name); return { ok: true, id: g.id }; },
    updateGroup: function (id, name) { var g = S.groups.filter(function (x) { return x.id === id; })[0]; if (!g) return { ok: false }; g.name = String(name); persist(['groups']); audit('group.update', id, name); return { ok: true }; },
    // 刪除組別。opts.unassign:true → 組內的學生一併移到「未分組」(否則組內還有學生時不能刪)
    removeGroup: function (id, opts) {
      var inside = S.users.filter(function (u) { return u.groupId === id; });
      if (inside.length && !(opts && opts.unassign)) return { ok: false, error: '組別內仍有學生,請先移動' };
      inside.forEach(function (u) { u.groupId = ''; });
      S.groups = S.groups.filter(function (g) { return g.id !== id; }); persist(inside.length ? ['groups', 'users'] : ['groups']); audit('group.delete', id, inside.length ? '並將 ' + inside.length + ' 位學生移到未分組' : ''); return { ok: true, moved: inside.length };
    },
    // 一次建立多組:pattern 裡的 {n} 換成 1、2、3…(沒有 {n} 就在後面接數字);已存在的名稱會略過
    createGroups: function (classId, count, pattern) {
      count = parseInt(count, 10);
      if (!classId || !S.classes.some(function (c) { return c.id === classId; })) return { ok: false, error: '請先選擇班級' };
      if (!(count >= 1) || count > 40) return { ok: false, error: '請輸入 1 到 40 之間的組數' };
      pattern = String(pattern || '第{n}組');
      var made = 0, skipped = 0;
      for (var i = 1; i <= count; i++) {
        var nm = (pattern.indexOf('{n}') >= 0 ? pattern.split('{n}').join(String(i)) : pattern + i).trim();
        if (!nm) continue;
        if (S.groups.some(function (g) { return g.classId === classId && g.name === nm; })) { skipped++; continue; }
        var ng = { id: uid('g'), classId: classId, name: nm }; S.groups.push(ng); ng.color = groupColorMapOf(S.groups.filter(function (x) { return x.classId === classId; }))[ng.id]; made++;
      }
      persist(['groups']); audit('group.bulk', classId, '建立 ' + made + ' 組'); return { ok: true, created: made, skipped: skipped };
    },
    // 自動分組:o.scope 'unassigned'(只分還沒分組的,預設)或 'all'(全部重新分);o.method 'block'(依學號順序連續分段,預設)/'round'(輪流)/'random'(隨機,各組人數接近);o.random 可指定亂數函式(測試用)
    autoAssign: function (classId, o) {
      o = o || {};
      var gs = S.groups.filter(function (g) { return g.classId === classId; });
      if (!gs.length) return { ok: false, error: '這個班級還沒有組別,請先建立組別' };
      var inGroup = {}; gs.forEach(function (g) { inGroup[g.id] = 1; });
      var members = S.users.filter(function (u) { return u.role === 'student' && u.classId === classId && u.status === 'active'; });
      var scope = o.scope === 'all' ? 'all' : 'unassigned', method = ['block', 'round', 'random'].indexOf(o.method) >= 0 ? o.method : 'block';
      var todo = scope === 'all' ? members.slice() : members.filter(function (u) { return !inGroup[u.groupId]; });
      var cnt = {}; gs.forEach(function (g) { cnt[g.id] = 0; });
      if (scope !== 'all') members.forEach(function (u) { if (inGroup[u.groupId]) cnt[u.groupId]++; });
      if (!todo.length) return { ok: true, assigned: 0, groups: gs.length };
      var nat = function (a, b) { return String(a.id).localeCompare(String(b.id), 'zh-Hant', { numeric: true }); };
      todo.sort(nat);
      if (method === 'random') { var rnd = o.random || Math.random; for (var i = todo.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = todo[i]; todo[i] = todo[j]; todo[j] = t; } }
      var smallest = function () { var best = gs[0]; gs.forEach(function (g) { if (cnt[g.id] < cnt[best.id]) best = g; }); return best; };
      if (method === 'block') {
        // 每組的目標人數:全班人數平均分,多出來的從前面幾組各多 1 人(例如 10 人分 3 組 → 4、3、3)
        var total = scope === 'all' ? todo.length : members.length, base = Math.floor(total / gs.length), extra = total % gs.length, k = 0;
        gs.forEach(function (g, gi) { var target = base + (gi < extra ? 1 : 0); while (k < todo.length && cnt[g.id] < target) { todo[k].groupId = g.id; cnt[g.id]++; k++; } });
        for (; k < todo.length; k++) { var g2 = smallest(); todo[k].groupId = g2.id; cnt[g2.id]++; }
      } else {
        if (scope === 'all') gs.forEach(function (g) { cnt[g.id] = 0; });
        todo.forEach(function (u) { var g3 = smallest(); u.groupId = g3.id; cnt[g3.id]++; });
      }
      persist(['users']); audit('group.auto', classId, scope + '/' + method + ' 共 ' + todo.length + ' 人');
      return { ok: true, assigned: todo.length, groups: gs.length, sizes: cnt };
    }
  };

  /* ---------- 論壇內容(主題、貼文、回收桶) ---------- */
  var content = {
    get: function () { return { topics: S.topics, nodes: S.nodes, trash: S.trash }; },
    save: function (c) {
      var keys = [];
      if (c.topics) { S.topics = c.topics; keys.push('topics'); }
      if (c.nodes) { S.nodes = c.nodes; keys.push('nodes'); }
      if (c.trash) { S.trash = c.trash; keys.push('trash'); }
      persist(keys);
    },
    audit: function (action, target, detail) { audit(action, target, detail); },
    /* 閱讀紀錄:學生「點開」別人的想法(看完整內容)時記下「哪一則、哪一天」,同一則只算一次;自己的貼文不算。
       存在使用者資料裡(user.reads = { 貼文編號: 'YYYY-MM-DD' }),分析頁的「閱讀他人」就是這份真實紀錄的篇數。 */
    markRead: function (nodeId) {
      var cur = auth.current(); if (!cur || cur.role !== 'student') return false;
      var n = S.nodes.filter(function (x) { return x.id === nodeId; })[0];
      if (!n || String(n.author) === String(cur.id)) return false;
      var u = S.users.filter(function (x) { return x.id === cur.id; })[0]; if (!u) return false;
      if (u.reads && u.reads[nodeId]) return false;
      var d = new Date(), day = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      u.reads = u.reads || {}; u.reads[nodeId] = day;
      persist(['users']); return true;
    },
    /* 所有人的閱讀紀錄(給分析頁用):{ 使用者編號: { 貼文編號: 日期 } } */
    reads: function () { var out = {}; S.users.forEach(function (u) { if (u.reads && Object.keys(u.reads).length) out[u.id] = clone(u.reads); }); return out; }
  };

  /* ---------- 備份、還原、清空 ---------- */
  function snapshot() {
    return { app: 'kb-platform', version: 1, time: nowISO(), users: clone(S.users), classes: clone(S.classes), groups: clone(S.groups), topics: clone(S.topics), nodes: clone(S.nodes), trash: clone(S.trash), settings: clone(S.settings) };
  }
  function validateSnapshot(o) {
    if (!o || o.app !== 'kb-platform') return '這不是本平台的備份檔';
    if (!Array.isArray(o.users) || !Array.isArray(o.nodes) || !Array.isArray(o.topics)) return '備份檔內容不完整';
    var staff = o.users.filter(function (u) { return isStaffRole(u.role) && u.status === 'active'; }).length;
    if (staff < 1) return '備份檔中沒有任何啟用中的管理者/老師帳號,還原後將無人能登入,已拒絕';
    return '';
  }
  var backup = {
    snapshot: snapshot,
    create: function (label) {
      var snap = snapshot(); snap.label = label || '手動備份'; snap.id = uid('b');
      S.backups.push(snap);
      while (S.backups.length > 5) S.backups.shift();
      try { persist(['backups']); } catch (e) { S.backups.shift(); persist(['backups']); }
      audit('backup.create', snap.id, snap.label);
      return { ok: true, id: snap.id, time: snap.time, label: snap.label };
    },
    list: function () { return S.backups.map(function (b) { return { id: b.id, time: b.time, label: b.label, posts: (b.nodes || []).length, users: (b.users || []).length }; }); },
    get: function (id) { for (var i = 0; i < S.backups.length; i++) if (S.backups[i].id === id) return clone(S.backups[i]); return null; },
    removeBackup: function (id) { S.backups = S.backups.filter(function (b) { return b.id !== id; }); persist(['backups']); audit('backup.delete', id, ''); return { ok: true }; },
    restore: function (obj) {
      var err = validateSnapshot(obj); if (err) return { ok: false, error: err };
      var pre = backup.create('還原前自動備份');
      S.users = clone(obj.users); S.classes = clone(obj.classes || []); S.groups = clone(obj.groups || []);
      S.topics = clone(obj.topics); S.nodes = clone(obj.nodes); S.trash = clone(obj.trash || []);
      if (obj.settings) S.settings = deepMerge(defaultSettings(), obj.settings);
      persist(['users', 'classes', 'groups', 'topics', 'nodes', 'trash', 'settings']);
      var cur = auth.current(); if (!cur) sessionWrite(null);
      audit('backup.restore', obj.label || obj.time || '', '還原前備份:' + pre.id);
      return { ok: true, preBackup: pre };
    },
    clearContent: function () {
      var pre = backup.create('清空資料前自動備份');
      var n = S.nodes.length + S.trash.length;
      S.nodes = []; S.trash = []; persist(['nodes', 'trash']);
      audit('data.clearContent', '', '清除貼文與回收桶共 ' + n + ' 筆;備份:' + pre.id);
      return { ok: true, cleared: n, preBackup: pre };
    },
    factoryReset: function () {
      var pre = backup.create('完整重置前自動備份');
      S.users = defaultUsers(); S.classes = []; S.groups = []; S.topics = defaultTopics(); S.nodes = []; S.trash = []; S.settings = defaultSettings();
      persist(['users', 'classes', 'groups', 'topics', 'nodes', 'trash', 'settings']);
      sessionWrite(null);
      audit('data.factoryReset', '', '備份:' + pre.id);
      return { ok: true, preBackup: pre };
    }
  };

  /* ---------- 相容層:給既有論壇與分析頁使用的 userList ---------- */
  var compat = {
    userList: function (viewerRole) {
      var out = {};
      var cn = {}; S.classes.forEach(function (c) { cn[c.id] = c.name; });
      S.users.forEach(function (u) {
        var r = isStaffRole(u.role) ? 'teacher' : 'student';
        out[u.id] = { id: u.id, name: labelFor(u.id, viewerRole), role: r, avatar: avatarFor(u.id, u.role), realRole: u.role, classId: u.classId || '', className: cn[u.classId] || '', groupId: u.groupId || '' };
      });
      // 訪客不會成為貼文作者,不放進使用者清單(避免被分析頁當成學生)
      return out;
    },
    /* 把登入者轉成論壇內部使用的 user 物件 */
    currentUser: function () {
      var c = auth.current(); if (!c) return null;
      var r = isStaffRole(c.role) ? 'teacher' : (c.role === 'guest' ? 'guest' : 'student');
      return { id: c.id, name: c.label, role: r, avatar: c.avatar, realRole: c.role };
    }
  };

  /* ---------- 匯入匯出(CSV) ---------- */
  var IMPORT_HEADERS = { '學號': 'id', '帳號': 'id', 'id': 'id', 'studentid': 'id', '姓名': 'realName', 'name': 'realName', '班級': 'className', 'class': 'className', '組別': 'groupName', '組': 'groupName', 'group': 'groupName', '角色': 'role', 'role': 'role', '初始密碼': 'password', '預設密碼': 'password', '密碼': 'password', 'password': 'password', 'pwd': 'password' };
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    var rows = [], row = [], cell = '', q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') { /* skip */ }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
    return rows;
  }
  /* ---------- 匯入名單:自動認出需要的欄位 ----------
   *  老師的名單不一定和我們的範本一樣(欄位順序不同、多了電子郵件/學校、標題是「學生姓名」「密碼」…)。
   *  這裡會:1) 在前幾列找出標題列  2) 依欄位名稱認出 學號、姓名、班級、初始密碼(密碼)、組別  3) 認不出來的欄位,看內容猜
   *  4) 不需要的欄位(電子郵件、學校、座號…)直接略過。認出的結果會顯示給老師確認,也可以自己改。 */
  var FIELD_SYN = {
    id: ['學號', '學生學號', '帳號', '學生帳號', '登入帳號', '學生編號', '學號/帳號', '帳號/學號', 'id', 'studentid', 'student_id', 'account', 'username', 'user'],
    realName: ['姓名', '學生姓名', '學生', '名字', '全名', '學生名稱', '學生姓名(中文)', 'name', 'studentname', 'fullname', 'student'],
    className: ['班級', '班別', '班', '年班', '班級名稱', '所屬班級', 'class', 'classname'],
    groupName: ['組別', '組', '小組', '分組', 'group'],
    password: ['初始密碼', '預設密碼', '密碼', '登入密碼', 'password', 'pwd', 'pw', 'initialpassword'],
    role: ['角色', '身分', '身份', 'role'],
    grade: ['年級', 'grade']
  };
  function normHeader(h) { return String(h == null ? '' : h).replace(/[（(][^）)]*[）)]/g, '').split(' ').join('').split('　').join('').trim().toLowerCase(); }
  function headerField(h) {
    var k = normHeader(h); if (!k) return '';
    for (var f in FIELD_SYN) if (FIELD_SYN[f].indexOf(k) >= 0) return f;
    if (/(電子郵件|電郵|信箱|e-?mail|mail)/.test(k)) return '_ignore';
    if (k.indexOf('座號') >= 0) return '_ignore';
    if (k.indexOf('學號') >= 0) return 'id';
    if (k.indexOf('姓名') >= 0) return 'realName';
    if (k.indexOf('密碼') >= 0 || k.indexOf('password') >= 0) return 'password';
    if (k.indexOf('班級') >= 0) return 'className';
    if (k.indexOf('組別') >= 0) return 'groupName';
    return '';
  }
  function cellText(v) { v = v == null ? '' : String(v).trim(); return /^\d+\.0+$/.test(v) ? v.split('.')[0] : v; }
  function rowHasData(r) { return !!r && r.some(function (x) { return cellText(x) !== ''; }); }
  var REQUIRED_FIELDS = ['id', 'realName'];
  function analyze(matrix) {
    matrix = matrix || [];
    var best = -1, bestScore = 0, i, c;
    for (i = 0; i < Math.min(10, matrix.length); i++) {
      var seen = {}, sc = 0; (matrix[i] || []).forEach(function (h) { var f = headerField(h); if (f && f !== '_ignore' && !seen[f]) { seen[f] = 1; sc++; } });
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    var headerRow = (bestScore >= 2 || (bestScore === 1 && best === 0)) ? best : -1;
    var dataStart = headerRow + 1, width = 0;
    matrix.forEach(function (r) { if (r && r.length > width) width = r.length; });
    var headers = [], mapping = { id: -1, realName: -1, className: -1, groupName: -1, password: -1, role: -1, grade: -1 }, source = {}, ignore = {};
    for (c = 0; c < width; c++) {
      var label = headerRow >= 0 ? cellText((matrix[headerRow] || [])[c]) : '';
      headers.push(label);
      var f = headerRow >= 0 ? headerField(label) : '';
      if (f === '_ignore') ignore[c] = 1;
      else if (f && mapping[f] < 0) { mapping[f] = c; source[f] = '欄位名稱'; }
    }
    // 認不出來的欄位:看內容猜(只猜 學號、姓名、班級)
    var sample = []; for (i = dataStart; i < matrix.length && sample.length < 200; i++) if (rowHasData(matrix[i])) sample.push(matrix[i]);
    function colVals(c2) { return sample.map(function (r) { return cellText((r || [])[c2]); }).filter(function (x) { return x !== ''; }); }
    function share(vals, test) { return vals.length ? vals.filter(test).length / vals.length : 0; }
    var taken = {}; Object.keys(mapping).forEach(function (k) { if (mapping[k] >= 0) taken[mapping[k]] = 1; });
    var guess = { realName: [], className: [], id: [] };
    for (c = 0; c < width; c++) {
      if (taken[c] || ignore[c]) continue;
      var vals = colVals(c); if (vals.length < 2) continue;
      if (share(vals, function (x) { return x.indexOf('@') >= 0; }) >= 0.6) { ignore[c] = 1; continue; }
      var uniq = {}; vals.forEach(function (x) { uniq[x] = 1; });
      var uniqShare = Object.keys(uniq).length / vals.length;
      var sName = share(vals, function (x) { return /^[㐀-鿿·．.]{2,6}$/.test(x) && !/(班|年級|學校|國小|國中)$/.test(x); });
      var sClass = share(vals, function (x) { return /(年.{0,3}班|^[0-9]{1,2}年[0-9]{1,2}班|班$)/.test(x); });
      var sId = share(vals, function (x) { return /^[A-Za-z0-9_.-]{3,20}$/.test(x) && /[0-9]/.test(x); });
      if (sName >= 0.8 && uniqShare >= 0.8) guess.realName.push({ c: c, s: sName });
      if (sClass >= 0.8) guess.className.push({ c: c, s: sClass });
      if (sId >= 0.8 && uniqShare >= 0.95) guess.id.push({ c: c, s: sId });
    }
    ['realName', 'className', 'id'].forEach(function (k) {
      if (mapping[k] >= 0 || !guess[k].length) return;
      guess[k].sort(function (a, b) { return b.s - a.s || a.c - b.c; });
      mapping[k] = guess[k][0].c; source[k] = '內容判斷'; taken[mapping[k]] = 1;
    });
    var missing = REQUIRED_FIELDS.filter(function (k) { return mapping[k] < 0; });
    var ignored = []; for (c = 0; c < width; c++) { var used = false; Object.keys(mapping).forEach(function (k) { if (mapping[k] === c) used = true; }); if (!used) ignored.push(headers[c] || ('第 ' + (c + 1) + ' 欄')); }
    return { headerRow: headerRow, dataStart: dataStart, headers: headers, mapping: mapping, source: source, missing: missing, ignored: ignored };
  }
  var NUM_ZH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function zhNum(s) { s = String(s).trim(); return /^[1-9]$/.test(s) ? NUM_ZH[Number(s)] : s; }
  // 依認出的欄位,把每一列轉成 { id, realName, className, groupName, password, role, _line }(_line 是檔案中的列號)
  function applyMapping(matrix, mapping, dataStart) {
    var out = [];
    for (var i = dataStart || 0; i < (matrix || []).length; i++) {
      var r = matrix[i] || []; if (!rowHasData(r)) continue;
      var o = { _line: i + 1 };
      ['id', 'realName', 'className', 'groupName', 'password', 'role'].forEach(function (k) { var idx = mapping[k]; if (idx != null && idx >= 0) o[k] = cellText(r[idx]); });
      // 年級與班級分開兩欄時(例如 6 與 7),合成「六年七班」
      if (mapping.grade >= 0 && o.className && /^[0-9一二三四五六七八九十]{1,2}班?$/.test(o.className)) {
        var g = cellText(r[mapping.grade]).replace(/[年級级]/g, ''), cn = o.className.replace(/班$/, '');
        if (g) o.className = zhNum(g) + '年' + zhNum(cn) + '班';
      }
      out.push(o);
    }
    return out;
  }
  function rowsToObjects(matrix) {
    var a = analyze(matrix);
    return applyMapping(matrix, a.mapping, a.dataStart);
  }
  function csvEscape(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  var io = {
    parseCSV: parseCSV, rowsToObjects: rowsToObjects, analyze: analyze, applyMapping: applyMapping,
    parseText: function (text) { return rowsToObjects(parseCSV(text)); },
    template: function () { return '﻿學號,姓名,班級,初始密碼(選填)\r\n1120001,王小明,一年一班,\r\n1120002,李小華,一年一班,\r\n'; },
    toCSV: function (arrOfArrays) { return '﻿' + arrOfArrays.map(function (r) { return r.map(csvEscape).join(','); }).join('\r\n'); },
    accountSheet: function () {
      var head = ['學號', '姓名', '班級', '初始密碼(未改密碼者)'];
      var rows = S.users.filter(function (u) { return u.role === 'student'; }).map(function (u) {
        var c = S.classes.filter(function (x) { return x.id === u.classId; })[0], g = S.groups.filter(function (x) { return x.id === u.groupId; })[0];
        return [u.id, u.realName, c ? c.name : '', isPwDefault(u) ? String(u.initialPw || u.id) : '(已自行修改)'];
      });
      return io.toCSV([head].concat(rows));
    }
  };

  /* ---------- 稽核查詢 ---------- */
  var auditApi = {
    list: function (f) {
      f = f || {};
      var a = S.audit.slice().reverse();
      if (f.actor) a = a.filter(function (x) { return String(x.actor).indexOf(f.actor) >= 0; });
      if (f.action) a = a.filter(function (x) { return String(x.action).indexOf(f.action) >= 0; });
      if (f.onlyFail) a = a.filter(function (x) { return x.ok === false; });
      return a.slice(0, f.limit || 500);
    },
    add: function (action, target, detail, ok) { audit(action, target, detail, ok); },
    refresh: function () { if (!cloud || !cloud.loadAudit) return Promise.resolve(); return cloud.loadAudit().then(function (l) { KB._mergeAudit(l); }); }
  };

  /* ---------- 公開 API ---------- */
  load();
  global.KB = {
    version: '1.1',
    ready: Promise.resolve(),
    cloud: { mode: 'local', state: 'local' },
    _cloudAttach: function (a) { cloud = a; try { var s = sessionRead(); if (s && s.sid) { if (pageNoted) presenceSend(s, true); else presenceNote(); } } catch (e) {} },
    _state: function () { return S; },
    _applyRemote: function (patch) {
      var keys = [];
      for (var k in patch) { S[k] = patch[k]; if (k === 'settings') S.settings = deepMerge(defaultSettings(), S.settings); writeJSON(k, S[k]); keys.push(k); }
      if (keys.length) notify(keys, true);
    },
    _mergeAudit: function (list) {
      var seen = {}; S.audit.forEach(function (x) { if (x._k) seen[x._k] = 1; });
      list.forEach(function (x) { if (x.action === 'session') return; if (!x._k || !seen[x._k]) S.audit.push(x); });   // 上線足跡(session)只給總控制平台看,不放進稽核清單
      S.audit.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
      if (S.audit.length > 5000) S.audit = S.audit.slice(-4000);
      writeJSON('audit', S.audit);
    },
    on: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    reload: function () { load(); notify(KEYS, true); },
    settings: settings, auth: auth, can: can, postBlock: postBlock, topicClass: topicClassOf, guard: guard, users: users, classes: classes, content: content,
    backup: backup, io: io, audit: auditApi, display: display, compat: compat,
    stats: function () {
      return {
        users: S.users.length, students: S.users.filter(function (u) { return u.role === 'student'; }).length,
        staff: S.users.filter(function (u) { return isStaffRole(u.role); }).length,
        classes: S.classes.length, groups: S.groups.length, topics: S.topics.length, posts: S.nodes.length, trash: S.trash.length,
        mustChange: S.users.filter(function (u) { return u.role === 'student' && isPwDefault(u); }).length,   // 仍使用預設密碼(=學號)的學生人數
        defaultStaffPw: S.users.filter(function (u) { return isStaffRole(u.role) && hashPw(u.id, u.salt) === u.pwHash; }).map(function (u) { return u.id; }),
        storageBytes: (function () { var n = 0; KEYS.forEach(function (k) { n += (rawGet(k) || '').length; }); return n; })()
      };
    },
    _sha256: sha256, _isStaff: isStaffRole, _presence: { note: function () { presenceNote(); }, send: function (force) { var s = sessionRead(); if (s) presenceSend(s, !!force); }, pageName: pageName }
  };
  try { if (typeof document !== 'undefined' && document.addEventListener) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', presenceNote); else setTimeout(presenceNote, 0); } } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
