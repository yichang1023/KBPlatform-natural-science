'use strict';
/* 老師在 App 裡把 Gemini 金鑰存到雲端(學生不用自己設定)。
 *   POST /api/ai-key  { action: 'status' | 'save' | 'clear', passcode, key? }
 * 需要管理密碼(環境變數 AI_ADMIN_PASSCODE)。金鑰存在 Firestore 的 kb_secret/ai,
 * 資料庫規則禁止瀏覽器存取;任何回應都不會包含完整金鑰(最多回傳後四碼)。 */
const crypto = require('crypto');
const { clientIp, rate, originOk, send, bodyOf } = require('./_guard');
const { getKey, setSecret, delSecret, account } = require('./_gcp');

const KEY_RE = /^AIza[0-9A-Za-z_\-]{20,80}$/;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: '不支援這個方法' }); }
    if (!originOk(req)) return send(res, 403, { error: '只接受從本站發出的請求。' });
    const ip = clientIp(req);
    // 猜密碼:每個網路位址 10 分鐘最多 8 次
    if (!rate('ai-key:' + ip, 8, 600000)) return send(res, 429, { error: '嘗試太多次,請 10 分鐘後再試。' });
    const pass = process.env.AI_ADMIN_PASSCODE;
    if (!pass) return send(res, 503, { error: '伺服器還沒有設定管理密碼(AI_ADMIN_PASSCODE)。' });
    if (!account()) return send(res, 503, { error: '伺服器還沒有設定 Firebase 服務帳戶(FIREBASE_SERVICE_ACCOUNT)。不想設的話,也可以直接在 Vercel 設環境變數 GEMINI_API_KEY。' });
    const b = bodyOf(req, 2000); if (b.error) return send(res, 400, { error: b.error });
    const { action, passcode, key } = b.body;
    if (typeof passcode !== 'string' || !same(passcode, pass)) { await wait(500); return send(res, 401, { error: '管理密碼不正確。' }); }
    if (action === 'status') {
      const k = await getKey();
      return send(res, 200, { configured: !!(k && k.key), source: k ? k.source : 'none', last4: k && k.key ? k.key.slice(-4) : '', updated: (k && k.updated) || '' });
    }
    if (action === 'clear') { await delSecret(); return send(res, 200, { ok: true }); }
    if (action === 'save') {
      if (typeof key !== 'string' || !KEY_RE.test(key.trim())) return send(res, 400, { error: '這看起來不是 Gemini 金鑰(應該是 AIza 開頭)。' });
      const k = key.trim();
      const chk = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': k } });
      if (!chk.ok) return send(res, 400, { error: 'Google 說這把金鑰不能用(HTTP ' + chk.status + '),沒有儲存。' });
      const r = await setSecret(k);
      return send(res, 200, { ok: true, last4: k.slice(-4), updated: r.updated });
    }
    return send(res, 400, { error: '不認得的動作' });
  } catch (e) {
    return send(res, 500, { error: '儲存金鑰時發生錯誤' });
  }
};
