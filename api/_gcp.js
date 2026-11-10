'use strict';
/* 用 Firebase 服務帳戶讀寫「AI 金鑰」文件(kb_secret/ai)。
 * 不需要安裝任何套件:自己用 JWT 向 Google 換存取權杖,再呼叫 Firestore REST。
 * 資料庫規則把 kb_secret 整個擋掉(瀏覽器讀不到也寫不到);只有這支伺服器程式(服務帳戶)能存取。
 * 環境變數:FIREBASE_SERVICE_ACCOUNT = 服務帳戶金鑰檔的 JSON(或 base64)。 */
const crypto = require('crypto');
const b64u = (x) => Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
let tok = null, keyCache = null;

function account() {
  let raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try {
    if (raw[0] !== '{') raw = Buffer.from(raw, 'base64').toString('utf8');
    const j = JSON.parse(raw);
    if (j.private_key && j.client_email && j.project_id) return j;
  } catch (e) {}
  return null;
}
async function token() {
  const s = account(); if (!s) throw new Error('尚未設定 FIREBASE_SERVICE_ACCOUNT');
  if (tok && tok.exp > Date.now() + 60000) return tok.v;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: s.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(s.private_key);
  const jwt = head + '.' + claim + '.' + b64u(sig);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('無法取得 Google 存取權杖');
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tok.v;
}
function docUrl(s) { return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(s.project_id) + '/databases/(default)/documents/kb_secret/ai'; }
async function getSecret() {
  const s = account(); if (!s) return null;
  const t = await token();
  const r = await fetch(docUrl(s), { headers: { Authorization: 'Bearer ' + t } });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('讀取雲端金鑰失敗');
  const f = j.fields || {};
  return { key: (f.key && f.key.stringValue) || '', updated: (f.updated && f.updated.stringValue) || '' };
}
async function setSecret(key) {
  const s = account(); if (!s) throw new Error('尚未設定 FIREBASE_SERVICE_ACCOUNT');
  const t = await token(), updated = new Date().toISOString();
  const r = await fetch(docUrl(s), { method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { key: { stringValue: key }, updated: { stringValue: updated } } }) });
  if (!r.ok) throw new Error('寫入雲端金鑰失敗');
  keyCache = null; return { updated };
}
async function delSecret() {
  const s = account(); if (!s) throw new Error('尚未設定 FIREBASE_SERVICE_ACCOUNT');
  const t = await token();
  const r = await fetch(docUrl(s), { method: 'DELETE', headers: { Authorization: 'Bearer ' + t } });
  if (!r.ok && r.status !== 404) throw new Error('清除雲端金鑰失敗');
  keyCache = null;
}
// 目前要用的 Gemini 金鑰:老師存在雲端的優先;沒有就用環境變數 GEMINI_API_KEY。(快取 60 秒)
async function getKey() {
  if (keyCache && keyCache.exp > Date.now()) return keyCache.v;
  let v = null;
  try { const s = await getSecret(); if (s && s.key) v = { key: s.key, source: 'cloud', updated: s.updated }; } catch (e) {}
  if (!v && process.env.GEMINI_API_KEY) v = { key: String(process.env.GEMINI_API_KEY).trim(), source: 'env', updated: '' };
  keyCache = { v, exp: Date.now() + 60000 };
  return v;
}
function _reset() { tok = null; keyCache = null; }
module.exports = { account, getKey, setSecret, delSecret, _reset };
