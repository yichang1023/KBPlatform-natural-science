/* =====================================================================
 *  KB AI 中繼(前端)— 讓沒有金鑰的瀏覽器(學生、在家使用)也能用 AI
 *
 *  老師把 Gemini 金鑰「儲存到雲端」後,金鑰放在伺服器(/api/ai-key),
 *  學生的瀏覽器只呼叫 /api/ai,由伺服器帶著金鑰去問 Gemini;學生永遠看不到金鑰。
 *
 *  各頁的使用方式:
 *    - 本機有金鑰(localStorage kb_ai_key)→ 照舊直接呼叫 Gemini。
 *    - 本機沒有金鑰 → 問 KBAI.status();雲端已設定的話,把 apiKey 設成 KBAI.SENT,
 *      各頁原本的 geminiFetch(key, init) 看到這個代號就改走 KBAI.proxyFetch(init)。
 *    - 在 file:// 或沒有 /api 的環境(單機測試版)→ status() 回 { configured:false },完全不影響原本做法。
 * ===================================================================== */
(function (g) {
  'use strict';
  var SENT = '__kb_ai_proxy__', stCache = null, stT = 0;
  function usable() { try { return /^https?:$/.test(g.location.protocol) && typeof g.fetch === 'function'; } catch (e) { return false; } }
  // 雲端有沒有設定金鑰(只回 true/false,不含任何金鑰資訊);結果快取 5 分鐘
  function status(force) {
    if (!force && stCache && Date.now() - stT < 300000) return stCache;
    stT = Date.now();
    stCache = (function () {
      if (!usable()) return Promise.resolve({ configured: false, source: 'none' });
      return g.fetch('/api/ai', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return { configured: !!(j && j.configured), source: (j && j.source) || (j && j.configured ? 'cloud' : 'none') }; }).catch(function () { return { configured: false, source: 'none' }; });
    })();
    return stCache;
  }
  function modelPref() { try { var m = (g.KB.settings.get().ai || {}).model; return m && m !== 'auto' ? m : undefined; } catch (e) { return undefined; } }
  // 與 fetch(Gemini) 相容:init.body 是 Gemini 的請求 JSON,回傳的 Response 內容就是 Gemini 的回應
  function proxyFetch(init) {
    var req = {}; try { req = JSON.parse((init && init.body) || '{}'); } catch (e) {}
    return g.fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelPref(), request: req }) });
  }
  // 管理動作:save(存金鑰)/ clear(清除)/ status(看詳細,需要管理密碼)
  // 回傳 { ok, status, data, error }
  function admin(action, passcode, key) {
    if (!usable()) return Promise.resolve({ ok: false, status: 0, error: '目前不是線上環境(沒有 /api),無法儲存到雲端。' });
    var body = { action: action, passcode: passcode }; if (key) body.key = key;
    return g.fetch('/api/ai-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { stCache = null; return { ok: r.ok, status: r.status, data: j, error: r.ok ? '' : String((j && (j.error && j.error.message || j.error)) || ('HTTP ' + r.status)) }; });
    }).catch(function (e) { return { ok: false, status: 0, error: '連不上伺服器:' + String(e && e.message || e).slice(0, 80) }; });
  }
  var SRC_TEXT = { cloud: '雲端儲存的金鑰(老師在 App 裡存的)', env: 'Vercel 環境變數 GEMINI_API_KEY', none: '沒有' };
  g.KBAI = { SRC_TEXT: SRC_TEXT, SENT: SENT, status: status, proxyFetch: proxyFetch, admin: admin, reset: function () { stCache = null; } };
})(window);
