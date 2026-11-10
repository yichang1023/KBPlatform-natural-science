'use strict';
/* 共用的防護:來源檢查、頻率限制、每日上限、回應格式。
 * 注意:這些限制放在伺服器函式的記憶體裡(每個實例各自計算),只能擋一般濫用;
 * 真正的最後防線是 Google 端的金鑰額度與網域限制(見「AI金鑰雲端設定說明」)。 */
const buckets = new Map();
let day = { d: '', n: 0 };

function clientIp(req) {
  const x = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return x || (req.socket && req.socket.remoteAddress) || '?';
}
// 在 windowMs 內,同一個 key 最多 limit 次
function rate(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.t > windowMs) { b = { t: now, n: 0 }; buckets.set(key, b); }
  b.n++;
  if (buckets.size > 5000) { for (const [k, v] of buckets) if (now - v.t > windowMs) buckets.delete(k); }
  return b.n <= limit;
}
function dailyOk() {
  const d = new Date().toISOString().slice(0, 10), cap = parseInt(process.env.AI_DAILY_LIMIT || '3000', 10);
  if (day.d !== d) day = { d, n: 0 };
  day.n++;
  return day.n <= cap;
}
// 只接受從自己網站(或 AI_ALLOWED_ORIGINS 列出的網址)發出的請求
function originOk(req) {
  const h = req.headers || {}, origin = String(h.origin || ''), host = String(h.host || '');
  if (String(h['sec-fetch-site'] || '') === 'same-origin') return true;
  if (!origin) return false;
  let oh = ''; try { oh = new URL(origin).host; } catch (e) { return false; }
  if (oh && host && oh === host) return true;
  const allow = String(process.env.AI_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return allow.indexOf(origin) >= 0;
}
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
function bodyOf(req, maxChars) {
  let b = req.body;
  if (b == null) return { error: '沒有內容' };
  if (typeof b === 'string') { if (b.length > maxChars) return { error: '內容太長' }; try { b = JSON.parse(b); } catch (e) { return { error: '格式不正確' }; } }
  if (typeof b !== 'object') return { error: '格式不正確' };
  let n = 0; try { n = JSON.stringify(b).length; } catch (e) { return { error: '格式不正確' }; }
  if (n > maxChars) return { error: '內容太長' };
  return { body: b };
}
function _reset() { buckets.clear(); day = { d: '', n: 0 }; }
module.exports = { clientIp, rate, dailyOk, originOk, send, bodyOf, _reset };
