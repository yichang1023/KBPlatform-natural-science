/* =====================================================================
 *  KB UI — 共用介面元件(右上角使用者元件、對話框、守門、公告、閒置登出)
 *  依賴 kb-core.js(window.KB)。樣式以 kbui- 開頭,不影響原有頁面。
 * ===================================================================== */
(function (global) {
  'use strict';
  var KB = global.KB;
  if (!KB) { if (global.console) console.error('kb-core.js 尚未載入'); return; }
  var doc = global.document;

  var CSS = [
    '.kbui-overlay{position:fixed;inset:0;background:rgba(15,23,42,.62);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;animation:kbui-fade .18s ease-out}',
    '@keyframes kbui-fade{from{opacity:0}to{opacity:1}}@keyframes kbui-pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}',
    '.kbui-card{background:#fff;color:#0f172a;border-radius:16px;box-shadow:0 25px 60px -12px rgba(15,23,42,.45);width:100%;max-width:440px;padding:22px 22px 18px;font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;animation:kbui-pop .2s ease-out;max-height:92vh;overflow:auto}',
    '.kbui-card h3{margin:0 0 4px;font-size:1.1rem;font-weight:800;display:flex;align-items:center;gap:8px}',
    '.kbui-card p{margin:4px 0 10px;color:#475569;font-size:.88rem;line-height:1.6}',
    '.kbui-card label{display:block;font-size:.78rem;font-weight:700;color:#334155;margin:10px 0 4px}',
    '.kbui-input{width:100%;border:1.5px solid #cbd5e1;border-radius:10px;padding:9px 12px;font-size:.92rem;outline:none;background:#fff;color:#0f172a;transition:border-color .15s,box-shadow .15s}',
    '.kbui-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.18)}',
    '.kbui-row{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}',
    '.kbui-btn{border:0;border-radius:10px;padding:9px 16px;font-weight:700;font-size:.88rem;cursor:pointer;transition:transform .1s,box-shadow .15s,opacity .15s;font-family:inherit}',
    '.kbui-btn:active{transform:scale(.97)}.kbui-btn:disabled{opacity:.45;cursor:not-allowed}',
    '.kbui-primary{background:linear-gradient(135deg,#4f46e5,#2563eb);color:#fff;box-shadow:0 6px 16px -6px rgba(79,70,229,.7)}',
    '.kbui-ghost{background:#f1f5f9;color:#334155}.kbui-danger{background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;box-shadow:0 6px 16px -6px rgba(220,38,38,.7)}',
    '.kbui-err{color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:6px 10px;font-size:.82rem;margin-top:8px}',
    '.kbui-hint{font-size:.74rem;color:#64748b;margin-top:4px}',
    '.kbui-toast-wrap{position:fixed;right:16px;bottom:16px;z-index:10001;display:flex;flex-direction:column;gap:8px;pointer-events:none}',
    '.kbui-toast{background:#0f172a;color:#fff;border-radius:10px;padding:10px 14px;font-size:.86rem;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);animation:kbui-pop .2s ease-out;max-width:320px;font-family:"Noto Sans TC",sans-serif}',
    '.kbui-toast.ok{border-left:4px solid #22c55e}.kbui-toast.err{border-left:4px solid #ef4444}.kbui-toast.info{border-left:4px solid #6366f1}',
    '.kbui-chip{position:fixed;top:10px;right:14px;z-index:9990;font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif}',
    '.kbui-chip.static{position:relative;top:auto;right:auto;flex-shrink:0}',
    '.kbui-chipbtn{display:flex;align-items:center;gap:8px;background:rgba(15,23,42,.86);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:4px 12px 4px 4px;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 8px 24px -8px rgba(0,0,0,.5);transition:transform .12s}',
    '.kbui-chipbtn:hover{transform:translateY(-1px)}',
    '.kbui-avatar{width:28px;height:28px;border-radius:50%;object-fit:cover}',
    '.kbui-name{font-weight:700;font-size:.85rem;letter-spacing:.02em}',
    '.kbui-role{font-size:.66rem;font-weight:800;border-radius:999px;padding:1px 8px;color:#fff}',
    '.kbui-role.master{background:#7c3aed}.kbui-role.teacher{background:#2563eb}.kbui-role.student{background:#16a34a}.kbui-role.guest{background:#64748b}',
    '.kbui-menu{position:absolute;right:0;top:calc(100% + 8px);width:230px;background:#fff;color:#0f172a;border-radius:14px;box-shadow:0 20px 50px -10px rgba(15,23,42,.5);overflow:hidden;display:none;animation:kbui-pop .15s ease-out}',
    '.kbui-menu.open{display:block}.kbui-menu-h{padding:12px 14px;background:linear-gradient(135deg,#eef2ff,#f8fafc);border-bottom:1px solid #e2e8f0}',
    '.kbui-menu-h b{display:block;font-size:.9rem}.kbui-menu-h span{font-size:.72rem;color:#64748b}',
    '.kbui-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 14px;font-size:.86rem;background:none;border:0;cursor:pointer;color:#0f172a;text-decoration:none;font-family:inherit}',
    '.kbui-item:hover{background:#f1f5f9}.kbui-item i{width:16px;text-align:center;color:#6366f1}.kbui-item.danger{color:#b91c1c}.kbui-item.danger i{color:#dc2626}',
    '.kbui-sep{height:1px;background:#e2e8f0;margin:2px 0}',
    '.kbui-notice{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9995;max-width:min(92vw,640px);border-radius:12px;padding:10px 14px 10px 12px;display:flex;gap:10px;align-items:flex-start;font-size:.86rem;box-shadow:0 14px 34px -10px rgba(0,0,0,.5);font-family:"Noto Sans TC",sans-serif}',
    '.kbui-notice.info{background:#eef2ff;color:#312e81;border:1px solid #c7d2fe}.kbui-notice.warn{background:#fffbeb;color:#78350f;border:1px solid #fde68a}.kbui-notice.danger{background:#fef2f2;color:#7f1d1d;border:1px solid #fecaca}',
    '.kbui-notice button{background:none;border:0;font-size:1rem;cursor:pointer;color:inherit;opacity:.6}',
    '.kbui-cloud{position:fixed;left:12px;bottom:12px;z-index:9996;display:flex;align-items:center;gap:7px;border-radius:999px;padding:5px 12px;font-size:.72rem;font-weight:700;background:rgba(15,23,42,.88);color:#e2e8f0;border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 22px -8px rgba(0,0,0,.5);font-family:"Noto Sans TC",sans-serif;max-width:min(92vw,420px);backdrop-filter:blur(6px)}',
    '.kbui-cloud i{font-size:.7rem}.kbui-cloud.online i{color:#22c55e}.kbui-cloud.syncing i{color:#38bdf8}.kbui-cloud.offline,.kbui-cloud.error{background:#7c2d12;color:#ffedd5;border-color:#fdba74}.kbui-cloud.error{background:#7f1d1d;color:#fee2e2;border-color:#fca5a5}',
    '@media (max-width:640px){.kbui-name{display:none}.kbui-role{font-size:.62rem}}'
  ].join('\n');

  function injectCSS() {
    if (doc.getElementById('kbui-style')) return;
    var s = doc.createElement('style'); s.id = 'kbui-style'; s.textContent = CSS; (doc.head || doc.documentElement).appendChild(s);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(html) { var d = doc.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  /* ---------- 提示訊息 ---------- */
  function toast(msg, type) {
    injectCSS();
    var wrap = doc.querySelector('.kbui-toast-wrap');
    if (!wrap) { wrap = doc.createElement('div'); wrap.className = 'kbui-toast-wrap'; doc.body.appendChild(wrap); }
    var t = el('<div class="kbui-toast ' + (type || 'info') + '">' + esc(msg) + '</div>');
    wrap.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3600);
  }

  /* ---------- 對話框 ---------- */
  function modal(innerHTML, opts) {
    injectCSS(); opts = opts || {};
    var ov = el('<div class="kbui-overlay"><div class="kbui-card" role="dialog" aria-modal="true">' + innerHTML + '</div></div>');
    doc.body.appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); doc.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape' && !opts.locked) { close(); if (opts.onCancel) opts.onCancel(); } }
    doc.addEventListener('keydown', onKey);
    if (!opts.locked) ov.addEventListener('mousedown', function (e) { if (e.target === ov) { close(); if (opts.onCancel) opts.onCancel(); } });
    return { root: ov, card: ov.firstChild, close: close };
  }
  /* 一般確認 */
  function confirmBox(o) {
    return new Promise(function (resolve) {
      var m = modal('<h3>' + (o.icon ? '<i class="fa-solid ' + o.icon + '"></i>' : '') + esc(o.title || '請確認') + '</h3><p>' + (o.html || esc(o.message || '')) + '</p><div class="kbui-row"><button class="kbui-btn kbui-ghost" data-a="no">' + esc(o.cancelText || '取消') + '</button><button class="kbui-btn ' + (o.danger ? 'kbui-danger' : 'kbui-primary') + '" data-a="yes">' + esc(o.okText || '確定') + '</button></div>', { onCancel: function () { resolve(false); } });
      m.card.querySelector('[data-a=no]').onclick = function () { m.close(); resolve(false); };
      m.card.querySelector('[data-a=yes]').onclick = function () { m.close(); resolve(true); };
    });
  }
  /* 危險操作:需輸入確認文字才能按下確認 */
  function confirmText(o) {
    return new Promise(function (resolve) {
      var m = modal('<h3><i class="fa-solid fa-triangle-exclamation" style="color:#dc2626"></i>' + esc(o.title || '危險操作') + '</h3><p>' + (o.html || esc(o.message || '')) + '</p><label>請輸入「<b style="color:#b91c1c">' + esc(o.expected) + '</b>」以確認</label><input class="kbui-input" data-a="txt" autocomplete="off" placeholder="' + esc(o.expected) + '"><div class="kbui-hint">此操作無法輕易復原' + (o.autoBackup ? ',系統會先自動備份' : '') + '。</div><div class="kbui-row"><button class="kbui-btn kbui-ghost" data-a="no">取消</button><button class="kbui-btn kbui-danger" data-a="yes" disabled>' + esc(o.okText || '確認執行') + '</button></div>', { onCancel: function () { resolve(false); } });
      var inp = m.card.querySelector('[data-a=txt]'), yes = m.card.querySelector('[data-a=yes]');
      inp.oninput = function () { yes.disabled = inp.value.trim() !== o.expected; };
      inp.onkeydown = function (e) { if (e.key === 'Enter' && !yes.disabled) yes.click(); };
      m.card.querySelector('[data-a=no]').onclick = function () { m.close(); resolve(false); };
      yes.onclick = function () { if (inp.value.trim() !== o.expected) return; m.close(); resolve(true); };
      setTimeout(function () { inp.focus(); }, 30);
    });
  }
  /* 修改密碼(forced=true:首次登入強制,不能取消) */
  function changePassword(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var cur = KB.auth.current();
      var m = modal('<h3><i class="fa-solid fa-key" style="color:#4f46e5"></i>' + (o.forced ? '首次登入,請設定新密碼' : '修改密碼') + '</h3><p>' + (o.forced ? '為了帳號安全,請先把預設密碼換成只有你知道的新密碼。' : '請輸入目前密碼與新密碼。') + '</p>' +
        '<label>目前密碼</label><input class="kbui-input" type="password" data-a="old" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true"><div class="kbui-hint">還沒改過密碼的話,「目前密碼」就是你的學號。忘記了,請老師幫你重設。</div>' +
        '<label>新密碼(至少 6 個字元,不可與學號/帳號相同)</label><input class="kbui-input" type="password" data-a="n1" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true"><div class="kbui-hint" data-a="strength"></div>' +
        '<label>再輸入一次新密碼</label><input class="kbui-input" type="password" data-a="n2" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true"><label style="display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer;font-weight:600"><input type="checkbox" data-a="show"> 顯示我輸入的密碼(確認有沒有打對)</label><div data-a="err"></div>' +
        '<div class="kbui-row">' + (o.forced ? '<button class="kbui-btn kbui-ghost" data-a="out">登出</button>' : '<button class="kbui-btn kbui-ghost" data-a="no">取消</button>') + '<button class="kbui-btn kbui-primary" data-a="ok">儲存新密碼</button></div>', { locked: !!o.forced, onCancel: function () { resolve(false); } });
      var c = m.card, q = function (a) { return c.querySelector('[data-a=' + a + ']'); };
      q('show').onchange = function () { var t = q('show').checked ? 'text' : 'password'; q('old').type = t; q('n1').type = t; q('n2').type = t; };
      q('n1').oninput = function () {
        var v = q('n1').value, s = 0; if (v.length >= 6) s++; if (v.length >= 10) s++; if (/[A-Za-z]/.test(v) && /[0-9]/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
        q('strength').textContent = v ? ('強度:' + ['太弱', '普通', '不錯', '很好', '很強'][s]) : '';
      };
      function submit() {
        var e = q('err'); e.innerHTML = '';
        if (q('n1').value !== q('n2').value) { e.innerHTML = '<div class="kbui-err">兩次輸入的新密碼不一致</div>'; return; }
        var r = KB.auth.changePassword(q('old').value, q('n1').value);
        if (!r.ok) { e.innerHTML = '<div class="kbui-err">' + esc(r.error) + (/目前的密碼/.test(r.error) ? '。還沒改過的話,請輸入你的學號;忘記了請老師幫你重設。' : '') + '</div>'; return; }
        m.close(); toast('密碼已更新', 'ok'); resolve(true);
      }
      q('ok').onclick = submit;
      c.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
      var no = q('no'); if (no) no.onclick = function () { m.close(); resolve(false); };
      var out = q('out'); if (out) out.onclick = function () { KB.auth.logout(); global.location.replace('index.html'); };
      setTimeout(function () { q('old').focus(); }, 30);
    });
  }

  /* 學生第一次登入(或說明內容更新後)要先閱讀並同意 */
  function ensureConsent(user) {
    if (!user || !user.needConsent) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var c = KB.settings.get().consent;
      var m = modal('<h3><i class="fa-solid fa-file-signature" style="color:#4f46e5"></i>使用說明與同意</h3><div style="white-space:pre-wrap;color:#334155;font-size:.9rem;line-height:1.7;margin:8px 0 4px;max-height:50vh;overflow:auto">' + esc(c.text) + '</div><div class="kbui-row"><button class="kbui-btn kbui-ghost" data-a="no">不同意並登出</button><button class="kbui-btn kbui-primary" data-a="yes">同意並繼續</button></div>', { locked: true });
      m.card.querySelector('[data-a=yes]').onclick = function () { KB.auth.acceptConsent(); m.close(); resolve(true); };
      m.card.querySelector('[data-a=no]').onclick = function () { KB.auth.logout(); global.location.replace('index.html'); resolve(false); };
    });
  }

  /* ---------- 導覽捷徑(依權限) ---------- */
  function navItems() {
    var cur = KB.auth.current(), items = [];
    items.push({ icon: 'fa-house', text: '首頁', href: 'index.html' });
    if (cur && KB.can('forum.read')) items.push({ icon: 'fa-comments', text: '知識論壇', href: 'Knowledge Building Forum.html?home=1' });
    if (cur && KB.can('analytics.teacher')) items.push({ icon: 'fa-chart-line', text: '老師分析', href: 'ANALYTICS-teacher.html' });
    if (cur && KB.can('analytics.student')) items.push({ icon: 'fa-compass', text: '學生分析', href: 'ANALYTICS-student.html' });
    if (cur && KB.can('setup.access')) items.push({ icon: 'fa-gear', text: '設定中心', href: 'setup.html' });
    return items;
  }
  function menuHTML() {
    var cur = KB.auth.current(); if (!cur) return '';
    var h = '<div class="kbui-menu-h"><b>' + esc(cur.label) + '</b><span>' + esc(KB.display.roleLabel(cur.role)) + (cur.role === 'student' ? ' · 學號 ' + esc(cur.id) : '') + '</span></div>';
    navItems().forEach(function (i) { h += '<a class="kbui-item" href="' + esc(i.href) + '"><i class="fa-solid ' + i.icon + '"></i>' + esc(i.text) + '</a>'; });
    h += '<div class="kbui-sep"></div>';
    if (cur.role !== 'guest') h += '<button class="kbui-item" data-a="pw"><i class="fa-solid fa-key"></i>修改密碼</button>';
    h += '<button class="kbui-item danger" data-a="out"><i class="fa-solid fa-right-from-bracket"></i>' + (cur.role === 'guest' ? '回首頁登入' : '登出') + '</button>';
    return h;
  }
  function wireMenu(root) {
    var pw = root.querySelector('[data-a=pw]'), out = root.querySelector('[data-a=out]');
    if (pw) pw.onclick = function () { changePassword({}); };
    if (out) out.onclick = function () { KB.auth.logout(); global.location.href = 'index.html'; };
  }

  /* 固定在右上角的使用者元件(分析頁、設定頁使用) */
  function mountUserBar(opts) {
    opts = opts || {};
    injectCSS();
    var old = doc.querySelector('.kbui-chip'); if (old) old.parentNode.removeChild(old);
    var cur = KB.auth.current(); if (!cur) return null;
    var chip = el('<div class="kbui-chip"><button class="kbui-chipbtn" type="button" aria-haspopup="true"><img class="kbui-avatar" alt=""><span class="kbui-name"></span><span class="kbui-role"></span><i class="fa-solid fa-chevron-down" style="font-size:.6rem;opacity:.7"></i></button><div class="kbui-menu"></div></div>');
    chip.querySelector('.kbui-avatar').src = cur.avatar;
    chip.querySelector('.kbui-name').textContent = cur.label;
    var rl = chip.querySelector('.kbui-role'); rl.textContent = KB.display.roleLabel(cur.role); rl.className += ' ' + cur.role;
    var menu = chip.querySelector('.kbui-menu'); menu.innerHTML = menuHTML(); wireMenu(menu);
    chip.querySelector('.kbui-chipbtn').onclick = function (e) { e.stopPropagation(); menu.classList.toggle('open'); };
    doc.addEventListener('click', function (e) { if (!chip.contains(e.target)) menu.classList.remove('open'); });
    if (opts.container) { chip.className += ' static'; opts.container.appendChild(chip); } else doc.body.appendChild(chip);
    return chip;
  }

  /* ---------- 守門:頁面存取控制 ---------- */
  function blockPage(title, msg, href, btn) {
    injectCSS();
    var m = modal('<h3><i class="fa-solid fa-lock" style="color:#4f46e5"></i>' + esc(title) + '</h3><p>' + esc(msg) + '</p><div class="kbui-row"><button class="kbui-btn kbui-primary" data-a="go">' + esc(btn || '回首頁') + '</button></div>', { locked: true });
    m.card.querySelector('[data-a=go]').onclick = function () { global.location.replace(href || 'index.html'); };
    return m;
  }
  function requireLogin(opts) {
    opts = opts || {};
    var g = KB.guard(opts);
    if (!g.ok) {
      var why = !g.user ? 'login' : (opts.staff ? 'staff' : 'denied');
      blockPage(why === 'login' ? '請先登入' : '沒有權限進入此頁', why === 'login' ? '請回到首頁選擇身分並登入。' : '此頁面僅限老師與管理者使用。', 'index.html?need=' + why, '前往首頁');
      setTimeout(function () { global.location.replace('index.html?need=' + why); }, 1200);
      return null;
    }
    var st = KB.settings.get();
    if (st.maintenance && !KB.auth._isStaff(g.user.role)) { blockPage('平台維護中', '目前正在維護,請稍後再試。老師與管理者請由首頁登入。', 'index.html', '回首頁'); return null; }
    (g.user.mustChange ? changePassword({ forced: true }) : Promise.resolve()).then(function () { ensureConsent(KB.auth.current()); });
    watchIdle();
    announce();
    return g.user;
  }

  /* ---------- 閒置自動登出(老師與管理者) ---------- */
  var idleTimer = null, lastTouch = 0;
  function watchIdle() {
    if (idleTimer) return;
    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(function (ev) { doc.addEventListener(ev, function () { var n = Date.now(); if (n - lastTouch > 15000) { lastTouch = n; KB.auth.touch(); } }, { passive: true }); });
    idleTimer = setInterval(function () {
      if (!KB.auth.current()) { clearInterval(idleTimer); idleTimer = null; blockPage('已登出', '因為閒置過久或已在其他視窗登出,請重新登入。', 'index.html', '重新登入'); }
    }, 20000);
    KB.on(function (keys) { if (keys.indexOf('session') >= 0 && !KB.auth.current()) blockPage('已登出', '你已在其他視窗登出,請重新登入。', 'index.html', '重新登入'); });
  }

  /* ---------- 公告 ---------- */
  function announce() {
    var a = KB.settings.get().announcement;
    var old = doc.querySelector('.kbui-notice'); if (old) old.parentNode.removeChild(old);
    if (!a || !a.enabled || !a.text) return;
    var key = 'kbui_ann_' + (a.text.length) + '_' + a.text.slice(0, 12);
    try { if (global.sessionStorage.getItem(key)) return; } catch (e) {}
    injectCSS();
    var n = el('<div class="kbui-notice ' + esc(a.level || 'info') + '"><i class="fa-solid fa-bullhorn" style="margin-top:3px"></i><div style="flex:1">' + esc(a.text) + '</div><button aria-label="關閉">✕</button></div>');
    n.querySelector('button').onclick = function () { try { global.sessionStorage.setItem(key, '1'); } catch (e) {} n.parentNode.removeChild(n); };
    doc.body.appendChild(n);
  }

  /* ---------- 雲端連線狀態(只在雲端版顯示) ---------- */
  function mountCloudStatus() {
    if (!KB.cloud || KB.cloud.mode !== 'cloud') return;
    injectCSS();
    var pill = doc.createElement('div'); pill.className = 'kbui-cloud'; pill.setAttribute('role', 'status'); pill.setAttribute('aria-live', 'polite'); doc.body.appendChild(pill);
    var hideTimer = null, lastErr = '';
    function paint() {
      var st = KB.cloud.state, map = {
        connecting: ['fa-circle-notch fa-spin', '正在連線到雲端…'], online: ['fa-circle', '已同步'], syncing: ['fa-arrows-rotate fa-spin', '儲存中…'],
        offline: ['fa-triangle-exclamation', '離線:目前顯示的是這台電腦上次的資料,新的變更不會儲存。請檢查網路後重新整理'],
        error: ['fa-circle-xmark', '雲端儲存失敗,這次的變更可能沒有儲存(請重新整理再試一次)']
      }[st] || ['fa-circle', st];
      pill.className = 'kbui-cloud ' + st; pill.innerHTML = '<i class="fa-solid ' + map[0] + '"></i><span>' + esc(map[1]) + '</span>';
      pill.style.display = '';
      clearTimeout(hideTimer);
      if (st === 'online') hideTimer = setTimeout(function () { if (KB.cloud.state === 'online') pill.style.display = 'none'; }, 4000);
      if (st === 'error' && KB.cloud.error !== lastErr) { lastErr = KB.cloud.error; toast('雲端儲存失敗(' + (KB.cloud.error || '未知原因') + ')', 'err'); }
    }
    global.addEventListener('kb-cloud', paint); paint();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mountCloudStatus); else mountCloudStatus();

  global.KBUI = {
    toast: toast, modal: modal, confirm: confirmBox, confirmText: confirmText, changePassword: changePassword,
    mountUserBar: mountUserBar, requireLogin: requireLogin, announce: announce, navItems: navItems,
    menuHTML: menuHTML, wireMenu: wireMenu, esc: esc, injectCSS: injectCSS, ensureConsent: ensureConsent
  };
})(window);
