'use strict';
/* AI 中繼:學生與老師的瀏覽器不需要金鑰,由這支程式帶著金鑰去呼叫 Gemini。
 *   GET  /api/ai            → { configured: true/false }   (只告訴有沒有設定,不給任何金鑰資訊)
 *   POST /api/ai            { model?, request: { contents, systemInstruction?, generationConfig? } } → Gemini 的原始回應
 * 防護:只接受本站來源、內容長度與欄位限制、每個網路位址的頻率限制、每日總上限。 */
const { clientIp, rate, dailyOk, originOk, send, bodyOf } = require('./_guard');
const { getKey } = require('./_gcp');

const MAX_CHARS = 30000, MODEL_RE = /^gemini-[a-z0-9.\-]{1,40}$/;

module.exports = async function handler(req, res) {
  try {
    const ip = clientIp(req);
    if (req.method === 'GET') {
      if (!rate('ai-status:' + ip, 60, 60000)) return send(res, 429, { error: { message: '請求太頻繁,請稍後再試。' } });
      const k = await getKey();
      return send(res, 200, { configured: !!(k && k.key), source: k && k.key ? k.source : 'none' });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: { message: '不支援這個方法' } }); }
    if (!originOk(req)) return send(res, 403, { error: { message: '只接受從本站發出的請求。' } });
    if (!rate('ai:' + ip, parseInt(process.env.AI_RATE_PER_MIN || '20', 10), 60000)) return send(res, 429, { error: { message: '請求太頻繁,請稍後再試。' } });
    if (!dailyOk()) return send(res, 429, { error: { message: '今天的 AI 使用量已達上限,明天再試。' } });
    const b = bodyOf(req, MAX_CHARS); if (b.error) return send(res, 400, { error: { message: b.error } });
    const r = b.body.request;
    if (!r || typeof r !== 'object' || !Array.isArray(r.contents) || !r.contents.length || r.contents.length > 30) return send(res, 400, { error: { message: '請求格式不正確' } });
    const model = b.body.model == null || b.body.model === '' ? 'gemini-2.5-flash' : String(b.body.model);
    if (!MODEL_RE.test(model)) return send(res, 400, { error: { message: '模型名稱不正確' } });
    // 只轉送必要的欄位(不轉送 tools 等其他設定)
    const out = { contents: r.contents };
    if (r.systemInstruction && typeof r.systemInstruction === 'object') out.systemInstruction = r.systemInstruction;
    if (r.generationConfig && typeof r.generationConfig === 'object') {
      const g = {}; ['temperature', 'topP', 'topK', 'maxOutputTokens', 'responseMimeType', 'candidateCount'].forEach((k) => { if (r.generationConfig[k] !== undefined) g[k] = r.generationConfig[k]; });
      if (g.maxOutputTokens > 8192) g.maxOutputTokens = 8192;
      if (g.candidateCount > 1) g.candidateCount = 1;
      out.generationConfig = g;
    }
    const k = await getKey();
    if (!k || !k.key) return send(res, 503, { error: { message: '老師還沒有設定 AI 金鑰(雲端)。' } });
    const up = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.key }, body: JSON.stringify(out) });
    const text = await up.text();
    res.statusCode = up.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(text);
  } catch (e) {
    return send(res, 500, { error: { message: 'AI 中繼發生錯誤' } });
  }
};
