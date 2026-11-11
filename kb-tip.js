/* =====================================================================
 *  KB Tip — 圖上的說明泡泡(給知識五力雷達、鷹架偏好用)
 *  滑鼠移到(或用 Tab 鍵選到)圖上任何一個數據圖形,就跳出一張字夠大、不擋住圖的說明卡。
 *  只負責「怎麼跳出來」和「雷達圖上滑鼠在哪個東西上」;說明的內容(用你的數字)由頁面提供。
 *  用法:
 *    var tip = KBTip.create(hostElement);            // host 要是 position:relative 的卡片(會自動設定)
 *    tip.show(html, x, y, key);  tip.hide();         // x、y = 相對於 host 左上角
 *    KBTip.h('標題', '標籤', '#顏色')                 // 標題列
 *    KBTip.radarHit(scale, values, x, y)             // 雷達圖:滑鼠在哪個軸、哪塊面積、哪一圈
 * ===================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function css() {
    if (!doc || doc.getElementById('kb-tip-css')) return;
    var s = doc.createElement('style'); s.id = 'kb-tip-css';
    s.textContent = [
      '.kbt-tip{position:absolute;left:0;top:0;z-index:40;width:min(330px,calc(100% - 16px));box-sizing:border-box;padding:13px 15px;border-radius:14px;background:rgba(255,255,255,.98);border:1px solid #c9d3e8;box-shadow:0 16px 36px -10px rgba(30,50,110,.5);font-size:16px;line-height:1.65;color:#33415c;pointer-events:none;opacity:0;transition:opacity .12s;font-weight:400;text-align:left;white-space:normal}',
      '.kbt-tip.show{opacity:1}',
      '.kbt-tip h5{margin:0 0 5px;font-size:19px;line-height:1.3;font-weight:800;color:#111827}',
      '.kbt-tip .tg{display:inline-block;margin-left:6px;padding:1px 10px;border-radius:999px;font-size:13.5px;font-weight:800;vertical-align:2px;color:#fff}',
      '.kbt-tip p{margin:5px 0 0}.kbt-tip .hl{color:#111827;font-weight:700}',
      '.kbt-tip .nx{margin-top:8px;padding:7px 10px;border-radius:10px;background:#eef4ff;color:#1f3a7a;font-weight:600}',
      '.kbt-tip .bar{height:8px;border-radius:99px;background:#e8ecf4;margin:8px 0 2px;overflow:hidden}.kbt-tip .bar i{display:block;height:100%;border-radius:99px}',
      '.kbt-tip ul{margin:6px 0 0;padding:0;list-style:none}.kbt-tip li{display:flex;justify-content:space-between;gap:12px;padding:1px 0}',
      '[data-kbtip]{cursor:help}[data-kbtip]:focus-visible{outline:3px solid rgba(79,70,229,.55);outline-offset:2px;border-radius:8px}'
    ].join('\n');
    (doc.head || doc.documentElement).appendChild(s);
  }
  function h(title, tag, bg) { return '<h5>' + title + (tag ? '<span class="tg" style="background:' + (bg || '#6366f1') + '">' + tag + '</span>' : '') + '</h5>'; }

  function create(host) {
    css();
    if (host.__kbtip) return host.__kbtip;
    var pos = global.getComputedStyle ? global.getComputedStyle(host).position : ''; if (!pos || pos === 'static') host.style.position = 'relative';
    var el = doc.createElement('div'); el.className = 'kbt-tip'; el.setAttribute('role', 'tooltip'); host.appendChild(el);
    var api = { el: el, key: null };
    function place(x, y) {
      var W = host.clientWidth || 400, H = host.clientHeight || 300, w = el.offsetWidth || 300, hh = el.offsetHeight || 120;
      var left = x + 16, top = y - hh - 14; if (left + w > W - 8) left = x - w - 16; if (left < 8) left = clamp(x - w / 2, 8, Math.max(8, W - w - 8));
      if (top < 8) top = y + 20; if (top + hh > H - 8) top = Math.max(8, H - hh - 8);
      el.style.left = left + 'px'; el.style.top = top + 'px';
    }
    api.show = function (html, x, y, key) { if (!html) { api.hide(); return; } if (api.key !== key || el.__h !== html) { el.innerHTML = html; el.__h = html; api.key = key; } el.classList.add('show'); place(x, y); };
    api.hide = function () { el.classList.remove('show'); api.key = null; };
    api.visible = function () { return el.classList.contains('show'); };
    host.addEventListener('mouseleave', api.hide);
    host.addEventListener('keydown', function (e) { if (e.key === 'Escape') api.hide(); });
    host.__kbtip = api; return api;
  }

  // ---- 雷達圖:滑鼠在哪一個東西上 ----
  // scale = Chart.js 的 r 軸(要有 xCenter、yCenter、drawingArea、getPointPositionForValue、getPointLabelPosition);values = 五個分數
  function radarHit(scale, values, x, y) {
    if (!scale || !values || !values.length) return null;
    var n = values.length, cx = scale.xCenter, cy = scale.yCenter, R = scale.drawingArea, i, poly = [];
    if (!(R > 0)) return null;
    for (i = 0; i < n; i++) { var p = scale.getPointPositionForValue(i, Number(values[i]) || 0); poly.push(p);
      if (Math.hypot(p.x - x, p.y - y) <= 13) return { kind: 'axis', i: i }; }
    for (i = 0; i < n; i++) {   // 軸的名稱(開創力…)
      var lp = scale.getPointLabelPosition ? scale.getPointLabelPosition(i) : null;
      if (lp && x >= lp.left - 6 && x <= lp.right + 6 && y >= lp.top - 4 && y <= lp.bottom + 4) return { kind: 'axis', i: i };
    }
    // 圖形裡面
    var inside = false, j; for (i = 0, j = n - 1; i < n; j = i++) { if (((poly[i].y > y) !== (poly[j].y > y)) && (x < (poly[j].x - poly[i].x) * (y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)) inside = !inside; }
    if (inside) return { kind: 'area' };
    var d = Math.hypot(x - cx, y - cy);
    if (d <= R + 4) { var lv = clamp(Math.ceil(d / R * 5 - 1e-9), 1, 5); return { kind: 'ring', level: lv * 20 }; }
    return null;
  }

  // vis-network 的圖:滑鼠移到圓球或線,跳出說明泡泡。o.node(id) / o.edge(id) 回傳 { html, key } 或 null
  function vis(net, container, o) {
    var card = (container.closest && container.closest('.card')) || container.parentElement, tip = create(card), ms = { x: 0, y: 0 };
    container.addEventListener('mousemove', function (ev) { var c = card.getBoundingClientRect(); ms = { x: ev.clientX - c.left, y: ev.clientY - c.top }; });
    function go(fn, id, pre) { try { var r = fn && fn(id); if (r && r.html) tip.show(r.html, ms.x, ms.y, r.key || (pre + id)); } catch (e) { if (global.console) console.error(e); } }
    net.on('hoverNode', function (p) { go(o.node, p.node, 'n:'); }); net.on('blurNode', function () { tip.hide(); });
    net.on('hoverEdge', function (p) { go(o.edge, p.edge, 'e:'); }); net.on('blurEdge', function () { tip.hide(); });
    return { tip: tip, hoverNode: function (id) { go(o.node, id, 'n:'); }, hoverEdge: function (id) { go(o.edge, id, 'e:'); } };
  }
  global.KBTip = { create: create, h: h, esc: esc, radarHit: radarHit, css: css, vis: vis };
})(typeof window !== 'undefined' ? window : globalThis);
