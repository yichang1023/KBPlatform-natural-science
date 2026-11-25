/* 論壇頁的「上一頁」(手機的返回鍵、從螢幕左邊往右滑的返回手勢、電腦瀏覽器的上一頁) 要回到「剛才的畫面」, 不是跳回登入首頁:
 *  1. 有對話框開著(貢獻想法、貼文內容、確認視窗…)→ 上一頁 = 關掉最上面那個對話框, 回到打開它之前的畫面
 *  2. 沒有對話框, 人在某個討論區(畫布)或個人頁 → 上一頁 = 回論壇第一頁(討論區列表)
 *  3. 已經在論壇第一頁 → 才離開論壇(回到上一個網頁)
 * 做法: 對話框「打開」時往瀏覽器歷史多放一格, 「用叉叉或按鈕關掉」時把那一格收回去(所以歷史不會愈積愈多);
 * 進入討論區也放一格, 回到論壇第一頁時收回去. 只靠頁面上現有的元素與 app.router, 不改動原本的開關對話框程式. */
(function (g) {
  'use strict';
  var d = g.document, H = g.history;
  if (!d || !H || !H.pushState || g.__kbNav) return;
  var entries = {}, order = [], ignoreUntil = 0, popNav = false, first = true;

  function isOpen(el) { return !!el && !el.classList.contains('hidden'); }
  function skipNext() { ignoreUntil = Date.now() + 900; }   // 接下來 0.9 秒內出現的 popstate 是我們自己叫的 back(), 不處理
  function push(state) { try { H.pushState(state, '', g.location.href); return true; } catch (e) { return false; } }
  function curState() { try { return H.state || null; } catch (e) { return null; } }

  function modalChanged(el) {
    var id = el.id, open = isOpen(el);
    if (open && !entries[id]) { if (push({ kbm: id })) { entries[id] = true; order.push(id); } }
    else if (!open && entries[id]) {
      delete entries[id]; order = order.filter(function (x) { return x !== id; });
      var st = curState();
      if (st && st.kbm === id) { skipNext(); try { H.back(); } catch (e) {} }   // 用叉叉關掉: 收回那一格歷史
    }
  }

  function hookModals() {
    var els = [].slice.call(d.querySelectorAll('[id^="modal-"]')).filter(function (e) { return e.classList.contains('fixed') && e.classList.contains('inset-0'); });   // 只認全螢幕的對話框(有些標題文字的 id 也叫 modal-xxx-title)
    if (typeof g.MutationObserver !== 'function') return;
    var mo = new g.MutationObserver(function (list) { list.forEach(function (m) { if (m.attributeName === 'class') modalChanged(m.target); }); });
    els.forEach(function (el) { mo.observe(el, { attributes: true, attributeFilter: ['class'] }); if (isOpen(el)) modalChanged(el); });
  }

  function hookRouter() {
    var app = g.app; if (!app || typeof app.router !== 'function' || app.router.__kbNav) return;
    var orig = app.router;
    var wrapped = function () {
      var prev = g.state && g.state.currentView, r = orig.apply(this, arguments), now = g.state && g.state.currentView;
      if (first) {   // 第一次(載入頁面時還原到的畫面): 人若在討論區, 在歷史裡墊一格「論壇第一頁」, 上一頁才回得去
        first = false;
        if (now && now !== 'entrance') { try { H.replaceState({ kbb: 1 }, '', g.location.href); } catch (e) {} push({ kbv: now }); }
        return r;
      }
      if (popNav || now === prev) return r;
      var st = curState();
      if (now !== 'entrance') { if (st && st.kbv) { try { H.replaceState({ kbv: now }, '', g.location.href); } catch (e) {} } else push({ kbv: now }); }
      else if (st && st.kbv) { skipNext(); try { H.back(); } catch (e) {} }   // 用畫面上的按鈕回到論壇第一頁: 收回那一格歷史
      return r;
    };
    wrapped.__kbNav = true; app.router = wrapped;
  }

  function onPop() {
    if (ignoreUntil && Date.now() < ignoreUntil) { ignoreUntil = 0; return; }
    ignoreUntil = 0;
    var i, top = null;
    for (i = order.length - 1; i >= 0; i--) { var el = d.getElementById(order[i]); if (isOpen(el)) { top = order[i]; break; } }
    order = order.filter(function (x) { return isOpen(d.getElementById(x)); });
    if (top) {
      delete entries[top]; order = order.filter(function (x) { return x !== top; });
      try { if (g.ui && g.ui.closeModal) g.ui.closeModal(top); else d.getElementById(top).classList.add('hidden'); } catch (e) { try { d.getElementById(top).classList.add('hidden'); } catch (x) {} }
      return;
    }
    var v = g.state && g.state.currentView;
    if (v && v !== 'entrance' && g.app && g.app.router) { popNav = true; try { g.app.router('entrance'); } finally { popNav = false; } }
  }

  g.__kbNav = { entries: entries, order: function () { return order.slice(); } };
  g.addEventListener('popstate', onPop);
  d.addEventListener('DOMContentLoaded', function () { hookModals(); hookRouter(); });
})(typeof window !== 'undefined' ? window : globalThis);
