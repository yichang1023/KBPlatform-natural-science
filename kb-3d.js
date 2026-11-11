/* =====================================================================
 *  KB3D — 關聯圖(網絡圖)的 3D 旋轉、平移與放大視窗
 *  拖空白處:🔄 旋轉(整張圖像球一樣 3D 轉動,有遠近大小)/ ✋ 平移(移動畫面)/ ↺ 回正(只把旋轉轉回平面)/ ⟲ 還原(全部回到最初)。
 *  原始設定是「平移」。在空白處用滑鼠左鍵連點兩下,在「旋轉」和「平移」之間切換;連點三下 = 回正。
 *  按住 Shift 拖 = 暫時做相反的動作;右鍵/中鍵拖 = 平移。滾輪 = 縮放。
 *  每張圖有「⤢ 放大」:整個視窗放大來看,操作和原本一樣,按 ✕ 或 ESC 關閉。
 *  只改畫面上的位置,不改任何資料;點圓球、拖單顆圓球、點兩下看說明都照舊。
 *  用法:
 *    KB3D.vis(net)              vis-network 的圖(kbLively 會自動呼叫)
 *    new KB3D.Rig({cx,cy,ext})  自己畫的 SVG 圖用(網絡實驗室、言談轉移網絡)
 *    KB3D.zoom({title, els})    放大視窗(把 els 搬進視窗,關閉時搬回原位)
 * ===================================================================== */
(function (global) {
  'use strict';
  var VERSION = '2.0';

  // 同一個 id 永遠得到同一個 -1~1 的數字(圓球的前後位置要固定,轉回來才會一樣)
  function hash(key) {
    var s = String(key), h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h % 20001) / 10000 - 1;
  }
  function rotY(p, a) { var c = Math.cos(a), s = Math.sin(a); return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }; }
  function rotX(p, a) { var c = Math.cos(a), s = Math.sin(a); return { x: p.x, y: p.y * c + p.z * s, z: -p.y * s + p.z * c }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function Rig(o) {
    o = o || {};
    this.cx = o.cx || 0; this.cy = o.cy || 0; this.ext = o.ext || 200;
    this.yaw = 0; this.pitch = 0;
  }
  Rig.prototype = {
    angle: function () { return Math.sqrt(this.yaw * this.yaw + this.pitch * this.pitch); },
    active: function () { return this.angle() > 1e-4; },
    // 剛開始轉的時候,圓球才慢慢從平面「浮」出前後位置;轉回正就又變回平面
    amp: function () { return Math.min(1, this.angle() / 0.35); },
    zm: function (key) { if (this.zmap && this.zmap[key] != null) return this.zmap[key] * this.amp(); return this.flat ? 0 : hash(key) * this.ext * 0.6 * this.amp(); },   // zmap:每個球指定的高度(離盤面多高);flat:沒有指定的球都貼在盤面上   // flat = true:所有球都在同一個平面上(像一個大圓盤,整個轉,不是各自浮在不同的前後位置)
    // 平面位置 (x,y) → 轉過之後畫面上的位置、前後(z,越大越靠近眼睛)與大小倍率 f
    project: function (x, y, key) {
      var r = rotX(rotY({ x: x - this.cx, y: y - this.cy, z: this.zm(key) }, this.yaw), this.pitch);
      return { x: this.cx + r.x, y: this.cy + r.y, z: r.z, f: 1 + 0.32 * clamp(r.z / this.ext, -1, 1) };
    },
    // 平面上的點(z = 0,例如圓盤、圓圈、扇形的邊)→ 轉過之後畫面上的位置;畫「底圖」用
    projectFlat: function (x, y) {
      var r = rotX(rotY({ x: x - this.cx, y: y - this.cy, z: 0 }, this.yaw), this.pitch);
      return { x: this.cx + r.x, y: this.cy + r.y, z: r.z, f: 1 + 0.32 * clamp(r.z / this.ext, -1, 1) };
    },
    // 畫面上的位置(前後 zr 不變)→ 平面位置;拖單顆球時用
    unproject: function (sx, sy, zr) {
      var r = rotY(rotX({ x: sx - this.cx, y: sy - this.cy, z: zr || 0 }, -this.pitch), -this.yaw);
      return { x: this.cx + r.x, y: this.cy + r.y };
    },
    reset: function () { this.yaw = 0; this.pitch = 0; },
    // 從 start({yaw,pitch})再轉 dx、dy 像素
    drag: function (start, dx, dy) { this.yaw = start.yaw + dx * 0.009; this.pitch = clamp(start.pitch + dy * 0.009, -1.45, 1.45); },
    snap: function () { return { yaw: this.yaw, pitch: this.pitch }; }
  };

  /* ---------- 拖空白處要做什麼:平移(原始設定)或 旋轉。全部關聯圖共用 ---------- */
  var dragMode = (function () {
    var mode = 'pan', subs = [], tapS = { n: 0, t: 0, x: 0, y: 0, timer: 0 }, TAP_MS = 420;
    function set(m) {
      mode = m === 'rotate' ? 'rotate' : 'pan';
      subs = subs.filter(function (s) { return !s.el || s.el.isConnected !== false; });
      subs.forEach(function (s) { try { s.f(mode); } catch (e) {} });
    }
    // 這一下拖曳是平移嗎?(Shift 會暫時換成另一個、滑鼠右鍵/中鍵一律平移)
    function isPan(e) { var b = e && e.button; if (b === 1 || b === 2) return true; return (mode === 'pan') !== !!(e && e.shiftKey); }
    function toast(host, text) {
      try {
        if (!host || !host.appendChild) return;
        var old = host.querySelector(':scope > .kb-3d-toast'); if (old) old.remove();
        var d = document.createElement('div'); d.className = 'kb-3d-toast'; d.textContent = text;
        d.style.cssText = 'position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:30;background:rgba(30,41,59,.92);color:#fff;font-size:12px;font-weight:700;padding:4px 14px;border-radius:999px;pointer-events:none;white-space:nowrap';
        var pos = global.getComputedStyle ? global.getComputedStyle(host).position : ''; if (!pos || pos === 'static') host.style.position = 'relative';
        host.appendChild(d); setTimeout(function () { try { d.remove(); } catch (e) {} }, 1500);
      } catch (e) {}
    }
    // 在空白處「點一下(沒有拖動)」:連點 2 下 = 換模式;連點 3 下 = 回正。等一下看有沒有第 3 下再決定
    // 不是「真的點一下」的動作都不算:壓住超過 0.35 秒、或壓著的時候有拖動(旋轉 / 平移時的短促拖曳、緩慢點擊),
    // 以前這些會被當成連點,模式就被悄悄切回平移。拖曳一開始也會取消「等一下要切換」的計時
    var press = { t: 0, x: 0, y: 0, down: false };
    if (global.addEventListener) {
      global.addEventListener('pointerdown', function (e) { press.t = Date.now(); press.x = e.clientX; press.y = e.clientY; press.down = true; }, true);
      global.addEventListener('pointermove', function (e) { if (press.down && Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) >= 3) { press.dragged = true; tapS.n = 0; clearTimeout(tapS.timer); } }, true);
      var endPress = function () { press.down = false; setTimeout(function () { press.dragged = false; }, 0); };
      global.addEventListener('pointerup', endPress, true); global.addEventListener('pointercancel', endPress, true);
    }
    function tap(e, host, resetFn) {
      var now = Date.now(), x = e.clientX || 0, y = e.clientY || 0;
      if (press.dragged || (press.t && now - press.t > 350)) { tapS.n = 0; clearTimeout(tapS.timer); return; }
      if (now - tapS.t < TAP_MS && Math.abs(x - tapS.x) < 12 && Math.abs(y - tapS.y) < 12) tapS.n++; else tapS.n = 1;
      tapS.t = now; tapS.x = x; tapS.y = y; clearTimeout(tapS.timer);
      if (tapS.n >= 3) { tapS.n = 0; try { if (resetFn) resetFn(); } catch (x2) {} toast(host, '↺ 已回正'); return; }
      if (tapS.n === 2) tapS.timer = setTimeout(function () { tapS.n = 0; set(mode === 'pan' ? 'rotate' : 'pan'); toast(host, mode === 'rotate' ? '🔄 已切換為「旋轉」' : '✋ 已切換為「平移」'); }, TAP_MS);
    }
    // 「拖空白處:🔄 旋轉 ✋ 平移 ↺ 回正」;resetFn = 按「回正」要做的事
    function ctl(resetFn, restoreFn) {
      var w = document.createElement('span'); w.className = 'kb-drag-ctl'; w.setAttribute('role', 'group'); w.setAttribute('aria-label', '拖空白處要做什麼');
      w.title = '小技巧:在空白處連點兩下,可以在「旋轉」和「平移」之間切換;連點三下 = 回正。按住 Shift 拖 = 暫時做相反的動作。';
      w.style.cssText = 'display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#334155;pointer-events:auto;flex-wrap:wrap';
      var bs = 'padding:1px 8px;border-radius:999px;border:1px solid #94a3b8;font-weight:700;cursor:pointer;line-height:1.5';
      w.innerHTML = '<span>拖空白處:</span><button type="button" data-dm="rotate" style="' + bs + '" title="按住左鍵拖曳,整張圖像球一樣 3D 旋轉">🔄 旋轉</button><button type="button" data-dm="pan" style="' + bs + '" title="按住左鍵拖曳,移動整張圖的位置">✋ 平移</button><button type="button" data-dm="reset" style="' + bs + '" title="把旋轉過的圖轉回平面(圓球位置不變)">↺ 回正</button><button type="button" data-dm="restore" style="' + bs + '" title="全部還原:圓球位置、旋轉角度、縮放和平移都回到最初的樣子">⟲ 還原</button>';
      function paint(m) { Array.prototype.forEach.call(w.querySelectorAll('[data-dm]'), function (b) { var k = b.getAttribute('data-dm'); if (k === 'reset' || k === 'restore') { b.style.background = '#fff'; b.style.color = '#334155'; b.style.borderColor = '#94a3b8'; return; } var on = k === m; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.style.background = on ? '#4f46e5' : '#fff'; b.style.color = on ? '#fff' : '#334155'; b.style.borderColor = on ? '#4f46e5' : '#94a3b8'; }); }
      w.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-dm]') : null; if (!b) return; e.stopPropagation();
        var k = b.getAttribute('data-dm'); if (k === 'reset') { try { if (resetFn) resetFn(); } catch (x) {} } else if (k === 'restore') { try { if (restoreFn) restoreFn(); } catch (x) {} } else set(k);
      });
      w.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      w.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      subs.push({ f: paint, el: w }); paint(mode); return w;
    }
    return { get: function () { return mode; }, set: set, isPan: isPan, ctl: ctl, tap: tap, toast: toast };
  })();

  /* ---------- 放大視窗:把圖搬進全螢幕視窗,操作和原本一樣;✕ / ESC / 點旁邊關閉 ---------- */
  var Z = null;
  function zoomStyle() {
    if (!document.getElementById('kb-zoom-css')) {
      var st = document.createElement('style'); st.id = 'kb-zoom-css';
      st.textContent = '.kb-zoom-body svg{max-height:calc(94vh - 170px)}.kb-zoom-body{-webkit-overflow-scrolling:touch}';
      (document.head || document.documentElement).appendChild(st);
    }
  }
  function zoomClose() {
    var z = Z; if (!z) return; Z = null;
    try { if (z.onClose) z.onClose(); } catch (e) {}
    z.holders.forEach(function (h) {
      try {
        if (h.ph.parentNode) h.ph.parentNode.insertBefore(h.el, h.ph);
        if (h.keep == null) h.el.removeAttribute('style'); else h.el.setAttribute('style', h.keep);
        h.ph.remove();
      } catch (e) {}
    });
    document.removeEventListener('keydown', z.key, true);
    try { z.ov.remove(); } catch (e) {}
    try { if (z.after) z.after(); } catch (e) {}
    try { if (z.opener && z.opener.focus) z.opener.focus(); } catch (e) {}
  }
  function zoom(o) {
    o = o || {}; var els = (o.els || []).filter(Boolean); if (!els.length) return null;
    if (Z) zoomClose();
    zoomStyle();
    var ov = document.createElement('div'); ov.className = 'kb-zoom-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', (o.title || '關聯網路圖') + '(放大視窗)');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(15,23,42,.74);display:flex;align-items:center;justify-content:center;padding:2.5vh 2vw';
    ov.innerHTML = '<div style="width:100%;height:100%;background:#fff;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.45)">' +
      '<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap"><b style="font-size:15px;color:#1e293b" class="kb-zoom-title"></b><span style="font-size:11px;color:#64748b">放大視窗・操作和原本一樣・按 ESC 或右邊的 ✕ 關閉</span>' +
      '<button type="button" data-zx aria-label="關閉放大視窗" title="關閉(ESC)" style="margin-left:auto;width:34px;height:34px;border-radius:999px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;font-size:18px;font-weight:900;cursor:pointer;line-height:1">✕</button></div>' +
      '<div class="kb-zoom-body" style="position:relative;flex:1;min-height:0;overflow:auto;padding:' + (o.pad == null ? '10px' : o.pad) + '"></div></div>';
    ov.querySelector('.kb-zoom-title').textContent = o.title || '關聯網路圖';
    var body = ov.querySelector('.kb-zoom-body'), holders = [];
    els.forEach(function (el) {
      var ph = document.createComment('kb-zoom'); if (!el.parentNode) return;
      el.parentNode.insertBefore(ph, el); holders.push({ el: el, ph: ph, keep: el.getAttribute('style') });
      body.appendChild(el);
    });
    var key = function (e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (document.querySelector('#kb-ego-dialog,.kbui-overlay,.kbui-pv')) return;           // 上面還有說明視窗:先讓它關
      e.preventDefault(); e.stopPropagation(); zoomClose();
    };
    document.addEventListener('keydown', key, true);
    ov.addEventListener('click', function (e) { if (e.target === ov || (e.target.closest && e.target.closest('[data-zx]'))) zoomClose(); });
    document.body.appendChild(ov);
    Z = { ov: ov, holders: holders, key: key, onClose: o.onClose, after: o.after, opener: o.opener || null, body: body };
    try { if (o.onOpen) o.onOpen(body); } catch (e) {}
    try { ov.querySelector('[data-zx]').focus(); } catch (e) {}
    return { close: zoomClose, body: body, ov: ov };
  }
  function zoomOpen() { return !!Z; }

  /* ---------- vis-network ---------- */
  var VIS_TITLES = { 'overview-network-container': '社群互動結構 (SNA)', 'lens-network-container': '深度對話透視鏡', 'concept-network-container': '概念語義網絡', 'ego-network-container': '互動圈(自我網絡)' };
  function titleOf(c) {
    if (VIS_TITLES[c.id]) return VIS_TITLES[c.id];
    try { var card = c.closest('.card') || (c.parentNode && c.parentNode.parentNode), h = card && card.querySelector('h2,h3,h4'); if (h && h.textContent.trim()) return h.textContent.trim().slice(0, 40); } catch (e) {}
    return '關聯網路圖';
  }
  function vis(net) {
    if (!net || net.__kb3d || !net.body || !net.body.container) return net;
    var c = net.body.container, rig = new Rig(), st = { flat: null, proj: {}, zr: {}, base: {}, set: {} }, raf = 0, gest = null, zoomed = false, zbtn = null;
    net.__kb3d = { rig: rig, st: st };
    try { net.setOptions({ interaction: { dragView: false } }); } catch (e) {}

    function nodeOf(id) { return net.body && net.body.nodes ? net.body.nodes[id] : null; }
    // 把「現在畫面上的位置」整理成「平面位置」:新出現的、或被使用者單獨拖過的圓球,用它現在的位置重新算
    function sync() {
      var cur = net.getPositions(), ids = Object.keys(cur), first = !st.flat, i, id, p, q;
      if (first) {
        var sx = 0, sy = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        ids.forEach(function (k) { var a = cur[k]; sx += a.x; sy += a.y; x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y); });
        if (!rig.fixedCenter) { rig.cx = ids.length ? sx / ids.length : 0; rig.cy = ids.length ? sy / ids.length : 0; }
        if (!rig.fixedExt) rig.ext = Math.max(120, ids.length ? Math.max(x1 - x0, y1 - y0) / 2 : 0);
        st.flat = {};
      }
      for (i = 0; i < ids.length; i++) {
        id = ids[i]; p = cur[id]; q = st.proj[id];
        if (!st.flat[id] || !q || Math.abs(p.x - q.x) > 1.5 || Math.abs(p.y - q.y) > 1.5) {
          st.flat[id] = rig.active() && st.zr[id] != null ? rig.unproject(p.x, p.y, st.zr[id]) : { x: p.x, y: p.y };
        }
      }
      Object.keys(st.flat).forEach(function (k) { if (!cur[k]) { delete st.flat[k]; delete st.proj[k]; delete st.zr[k]; } });
    }
    function apply() {
      raf = 0; if (!st.flat) return;
      Object.keys(st.flat).forEach(function (id) {
        var n = nodeOf(id); if (!n) return;
        var f = st.flat[id], P = rig.project(f.x, f.y, id);
        n.x = P.x; n.y = P.y;
        var o = n.options;
        if (o && typeof o.size === 'number') {
          if (st.set[id] == null || Math.abs(o.size - st.set[id]) > 1e-6) st.base[id] = o.size;   // 資料更新過,重新量原本的大小
          o.size = st.base[id] * P.f; st.set[id] = o.size;
        }
        st.proj[id] = { x: P.x, y: P.y }; st.zr[id] = P.z;
      });
      try { net.redraw(); } catch (e) {}
    }
    function later() { if (!raf) raf = (global.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(apply); }

    // 重畫圖時容器會換成新的 vis 圖,舊圖的監聽器還在:偵測到這張圖已經作廢就自己移除,不去動它
    function alive() { try { return !!(net.canvas && net.canvas.frame && net.body && net.body.nodes && c.contains(net.canvas.frame)); } catch (x) { return false; } }
    // 最初的版面(第一次碰圖、或排好版時記下),「還原」用
    function snapHome() { if (st.home || !alive()) return; try { var cur = net.getPositions(), h = {}; Object.keys(cur).forEach(function (k) { h[k] = { x: cur[k].x, y: cur[k].y }; }); if (Object.keys(h).length) st.home = h; } catch (x) {} }
    try { net.once('stabilizationIterationsDone', function () { setTimeout(snapHome, 100); }); } catch (x) {}
    function down(e) {
      snapHome();
      if (!alive()) { c.removeEventListener('pointerdown', down, true); c.removeEventListener('contextmenu', noMenu); return; }
      if (e.button != null && e.button > 2) return;
      var t = e.target; if (t && t.closest && t.closest('.kb-lively-hint,.kb-3d-btn,.kb-drag-ctl')) return;
      var r = c.getBoundingClientRect(), pos = { x: e.clientX - r.left, y: e.clientY - r.top }, hit, edge;
      try { hit = net.getNodeAt(pos); } catch (x) { hit = undefined; }
      if (hit !== undefined && hit !== null && e.button !== 1 && e.button !== 2) return;     // 點到圓球:交給原本的拖圓球
      try { edge = net.getEdgeAt(pos); } catch (x) { edge = undefined; }
      var pan = dragMode.isPan(e);
      gest = { x: e.clientX, y: e.clientY, pan: pan, moved: false, start: rig.snap(), vp: net.getViewPosition(), sc: net.getScale(), tap: (e.button === 0 || e.button == null) && !e.shiftKey && (edge === undefined || edge === null), ev: { clientX: e.clientX, clientY: e.clientY } };
      global.addEventListener('pointermove', move); global.addEventListener('pointerup', up); global.addEventListener('pointercancel', up);
    }
    function move(e) {
      if (!gest) return;
      var dx = e.clientX - gest.x, dy = e.clientY - gest.y;
      if (!gest.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        gest.moved = true;
        if (!gest.pan) { try { net.setOptions({ physics: false }); net.stopSimulation(); } catch (x) {} sync(); try { c.style.userSelect = 'none'; } catch (x) {} }
      }
      if (e.preventDefault) e.preventDefault();
      if (gest.pan) { try { net.moveTo({ position: { x: gest.vp.x - dx / gest.sc, y: gest.vp.y - dy / gest.sc }, scale: gest.sc, animation: false }); } catch (x) {} return; }
      rig.drag(gest.start, dx, dy); later();
    }
    function up() {
      global.removeEventListener('pointermove', move); global.removeEventListener('pointerup', up); global.removeEventListener('pointercancel', up);
      try { c.style.userSelect = ''; } catch (x) {}
      var g = gest; gest = null;
      if (g && !g.moved && g.tap) dragMode.tap(g.ev, c, reset);       // 空白處點一下:連點 2 下換模式、3 下回正
    }
    c.addEventListener('pointerdown', down, true);
    function noMenu(e) { if (alive()) e.preventDefault(); }                     // 右鍵拖曳 = 平移,不要跳出瀏覽器選單
    c.addEventListener('contextmenu', noMenu);

    function reset() {
      if (!st.flat) { rig.reset(); return; }
      sync(); rig.reset(); apply();
    }
    net.__kb3d.reset = reset;
    net.__kb3d.snapHome = snapHome;
    // 還原:圓球位置、旋轉角度、縮放與平移全部回到最初
    function restore() {
      rig.reset();
      if (st.home) Object.keys(st.home).forEach(function (id) {
        var n = nodeOf(id); if (!n) return; n.x = st.home[id].x; n.y = st.home[id].y;
        var o = n.options; if (o && st.base[id] != null && st.set[id] != null && Math.abs(o.size - st.set[id]) < 1e-6) o.size = st.base[id];
      });
      st.flat = null; st.proj = {}; st.zr = {}; st.set = {}; st.base = {};
      try { net.setOptions({ physics: false }); net.redraw(); } catch (x) {}
      setTimeout(function () { refit(zoomed); }, 30);
    }
    net.__kb3d.restore = restore;

    // 放大視窗:把整個圖容器(連同提示列)搬進視窗,圖還是同一張,所有操作都一樣
    function paintZoomBtn() { if (zbtn) { zbtn.textContent = zoomed ? '✕ 縮回' : '⤢ 放大'; zbtn.title = zoomed ? '關閉放大視窗(ESC)' : '放大視窗:整個視窗放大來看,操作和原本一樣'; zbtn.setAttribute('aria-label', zbtn.title); } }
    // big = 放大視窗裡:自動置中時允許把圖放大(vis 預設最多只放大到 1 倍,圖會縮成小小一團)
    function refit(big) {
      try {
        net.setSize('100%', '100%'); net.redraw(); if (net.__kbRefit) net.__kbRefit();
        net.fit({ animation: false, maxZoomLevel: big ? 3 : 1 });
        if (big) { var sc = net.getScale(); net.moveTo({ scale: sc * 0.92, animation: false }); }
      } catch (e) {}
    }
    function toggleZoom() {
      if (zoomed) { zoomClose(); return; }
      zoomed = true; paintZoomBtn();
      zoom({
        title: titleOf(c), els: [c], pad: '0', opener: zbtn,
        onOpen: function () { try { c.style.position = 'absolute'; c.style.inset = '0'; c.style.width = '100%'; c.style.height = '100%'; } catch (e) {} [30, 250, 700].forEach(function (ms) { setTimeout(function () { if (zoomed) refit(true); }, ms); }); },
        onClose: function () { zoomed = false; paintZoomBtn(); },
        after: function () { setTimeout(function () { refit(false); }, 30); setTimeout(function () { refit(false); }, 250); }
      });
    }
    net.__kb3d.zoom = toggleZoom;

    // 提示列:說明怎麼玩,並放「拖空白處」選項與「放大」鈕
    try {
      var hint = c.querySelector('.kb-lively-hint');
      if (hint) {
        var tx = hint.firstChild; if (tx && tx.nodeType === 1) tx.textContent = '👆 拖圓球・滾輪縮放';
        hint.appendChild(dragMode.ctl(reset, restore));
        zbtn = document.createElement('button'); zbtn.type = 'button'; zbtn.className = 'kb-3d-btn kb-zoom-btn';
        zbtn.style.cssText = 'pointer-events:auto;padding:1px 10px;border-radius:999px;border:1px solid #4f46e5;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:800;cursor:pointer;line-height:1.5';
        zbtn.addEventListener('click', function (e) { e.stopPropagation(); toggleZoom(); });
        zbtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        paintZoomBtn(); hint.appendChild(zbtn);
      }
    } catch (e) {}
    return net;
  }

  global.KB3D = { VERSION: VERSION, Rig: Rig, hash: hash, vis: vis, dragMode: dragMode, zoom: zoom, zoomClose: zoomClose, zoomOpen: zoomOpen };
})(typeof window !== 'undefined' ? window : this);
