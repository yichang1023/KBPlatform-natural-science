'use strict';
/* ASRA 學生學習單資料:老師存到伺服器,學生「登入平台」後自動取得「自己的」那一份。
 *   POST /api/asra-stu
 *     { action:'put',    passcode, items:[{ uid, data }] }   老師:存(覆蓋)每位學生的資料。data 是個別學生資料包的 JSON 字串
 *     { action:'status', passcode }                           老師:看伺服器上有哪些學生的資料
 *     { action:'clear',  passcode, uid? }                     老師:清掉某位(或全部)學生的資料
 *     { action:'login',  uid, password }                      學生:登入平台時順便呼叫,驗證帳號密碼後拿到憑證(12 小時)
 *     { action:'get',    uid, token }                         學生:用憑證取自己的資料(只能取 uid 相同的那一份)
 * 資料存在 Firestore 的 kb_secret/asra__<帳號>;資料庫規則禁止瀏覽器直接存取,只有這支程式(服務帳戶)讀得到。
 * 學生身分:用平台的帳號密碼驗證(和登入同一套雜湊,sha256(salt|密碼)),所以保護強度等於該學生的平台密碼。
 * 管理密碼沿用 AI_ADMIN_PASSCODE(和儲存 AI 金鑰同一組)。 */
const crypto = require('crypto');
const { clientIp, rate, originOk, send, bodyOf } = require('./_guard');
const gcp = require('./_gcp');

const TTL = 12 * 3600 * 1000, MAX_ITEM = 600000;
const b64u = (x) => Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const UID_RE = /^[^\s/\\]{1,60}$/;
const docId = (uid) => 'asra__' + String(uid).replace(/[^A-Za-z0-9_-]/g, (c) => '~' + c.charCodeAt(0).toString(16));
const uidOfDoc = (id) => String(id).slice(6).replace(/~([0-9a-f]+)/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
const COL = () => process.env.KB_COLLECTION || 'kb_v2';
const str = (f) => (f && f.stringValue) || '';

function sign(uid) {
  const sec = gcp.tokenSecret(); const exp = Date.now() + TTL;
  const body = b64u(JSON.stringify({ u: uid, e: exp }));
  return { token: body + '.' + b64u(crypto.createHmac('sha256', sec).update(body).digest()), exp };
}
function verify(token, uid) {
  try {
    const sec = gcp.tokenSecret(); if (!sec || typeof token !== 'string') return false;
    const [body, mac] = token.split('.'); if (!body || !mac) return false;
    const want = b64u(crypto.createHmac('sha256', sec).update(body).digest());
    if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return false;
    const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return p.u === uid && p.e > Date.now();
  } catch (e) { return false; }
}
// 平台帳號驗證:讀 kb_v2/users,用和瀏覽器登入相同的雜湊比對
async function checkStudent(uid, password) {
  const f = await gcp.getDoc(COL() + '/users');
  const items = f && f.items && f.items.mapValue && f.items.mapValue.fields;
  const u = items && items[uid] && items[uid].mapValue && items[uid].mapValue.fields;
  if (!u) return false;
  if (str(u.role) !== 'student' || str(u.status) !== 'active') return false;
  const want = crypto.createHash('sha256').update(str(u.salt) + '|' + password, 'utf8').digest('hex');
  return want === str(u.pwHash);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: '不支援這個方法' }); }
    if (!originOk(req)) return send(res, 403, { error: '只接受從本站發出的請求。' });
    if (!gcp.account()) return send(res, 503, { error: '伺服器還沒有設定 Firebase 服務帳戶(FIREBASE_SERVICE_ACCOUNT)。' });
    const ip = clientIp(req);
    const b = bodyOf(req, 3000000); if (b.error) return send(res, 400, { error: b.error });
    const q = b.body, action = q.action;

    // ---- 學生 ----
    if (action === 'login') {
      const uid = q.uid, pw = q.password;
      if (typeof uid !== 'string' || !UID_RE.test(uid) || typeof pw !== 'string' || !pw || pw.length > 100) return send(res, 400, { error: '格式不正確' });
      if (!rate('asra-login-ip:' + ip, 40, 600000) || !rate('asra-login-u:' + uid, 12, 600000)) return send(res, 429, { error: '嘗試太多次,請稍後再試。' });
      if (!(await checkStudent(uid, pw))) { await wait(400); return send(res, 401, { error: '帳號或密碼不正確' }); }
      const t = sign(uid);
      return send(res, 200, { token: t.token, exp: t.exp });
    }
    if (action === 'get') {
      const uid = q.uid;
      if (typeof uid !== 'string' || !UID_RE.test(uid)) return send(res, 400, { error: '格式不正確' });
      if (!rate('asra-get:' + ip, 60, 600000)) return send(res, 429, { error: '請求太頻繁,請稍後再試。' });
      if (!verify(q.token, uid)) return send(res, 401, { error: '憑證無效或已過期,請重新登入一次。' });
      const f = await gcp.getDoc('kb_secret/' + docId(uid));
      if (!f || !str(f.data)) return send(res, 200, { none: true });
      return send(res, 200, { data: str(f.data), updated: str(f.updated), records: Number((f.records && f.records.integerValue) || 0) });
    }

    // ---- 老師(管理密碼)----
    const pass = process.env.AI_ADMIN_PASSCODE;
    if (!pass) return send(res, 503, { error: '伺服器還沒有設定管理密碼(AI_ADMIN_PASSCODE)。' });
    if (!rate('asra-admin:' + ip, 20, 600000)) return send(res, 429, { error: '嘗試太多次,請 10 分鐘後再試。' });
    if (typeof q.passcode !== 'string' || !same(q.passcode, pass)) { await wait(500); return send(res, 401, { error: '管理密碼不正確。' }); }

    if (action === 'status') {
      const docs = await gcp.listDocs('kb_secret', ['records', 'updated']);
      return send(res, 200, { items: docs.filter((d) => d.id.indexOf('asra__') === 0).map((d) => ({ uid: uidOfDoc(d.id), records: Number((d.fields.records && d.fields.records.integerValue) || 0), updated: str(d.fields.updated) })) });
    }
    if (action === 'put') {
      const items = Array.isArray(q.items) ? q.items : [];
      if (!items.length || items.length > 60) return send(res, 400, { error: '一次最多 60 位學生。' });
      const saved = [], bad = [];
      for (const it of items) {
        const uid = it && it.uid, data = it && it.data;
        if (typeof uid !== 'string' || !UID_RE.test(uid) || typeof data !== 'string' || data.length > MAX_ITEM) { bad.push({ uid: String(uid), error: '格式不正確或太大' }); continue; }
        let o = null; try { o = JSON.parse(data); } catch (e) {}
        if (!o || o.kind !== 'asra-pack' || !o.students || typeof o.students !== 'object') { bad.push({ uid, error: '不是資料包' }); continue; }
        const n = Object.keys(o.students).reduce((a, c) => a + ((o.students[c] && o.students[c].r) || []).length, 0);
        await gcp.setDoc('kb_secret/' + docId(uid), { data: { stringValue: data }, records: { integerValue: String(n) }, updated: { stringValue: new Date().toISOString() } });
        saved.push({ uid, records: n });
      }
      return send(res, 200, { ok: true, saved, bad });
    }
    if (action === 'clear') {
      if (q.uid) { if (typeof q.uid !== 'string' || !UID_RE.test(q.uid)) return send(res, 400, { error: '格式不正確' }); await gcp.delDoc('kb_secret/' + docId(q.uid)); return send(res, 200, { ok: true, cleared: 1 }); }
      const docs = (await gcp.listDocs('kb_secret', ['updated'])).filter((d) => d.id.indexOf('asra__') === 0);
      for (const d of docs) await gcp.delDoc('kb_secret/' + d.id);
      return send(res, 200, { ok: true, cleared: docs.length });
    }
    return send(res, 400, { error: '不認得的動作' });
  } catch (e) {
    return send(res, 500, { error: '伺服器發生錯誤' });
  }
};
