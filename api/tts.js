'use strict';
/* 朗讀(文字轉語音)中繼:學生的瀏覽器不需要金鑰,由這支程式帶著老師存的 Gemini 金鑰去呼叫語音模型(Gemini TTS)。
 *   GET  /api/tts            → { configured, model }          (只告訴有沒有設定與預設模型,不給任何金鑰資訊)
 *   POST /api/tts            { text, voice, style?, model? } → { audio: <base64 的 WAV>, mime: 'audio/wav', model }
 * 防護:只接受本站來源、文字長度與欄位格式限制、每個網路位址的頻率限制、每日合成次數上限(環境變數 TTS_DAILY_LIMIT)。
 * 提醒:合成語音要付費(免費額度有限),所以瀏覽器端會把同一段文字同一種聲音的結果存起來,不會重複合成。 */
const { clientIp, rate, originOk, send, bodyOf } = require('./_guard');
const { getKey } = require('./_gcp');

const MAX_TEXT = 700;                                   // 一次最多合成幾個字(瀏覽器端會把長貼文切成小段)
const MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
// 聲音名稱不設格式限制(想填什麼都可以: 預設聲音名 Kore…、自訂聲音編號 voice_…、AI Studio 上看到的名字); 只拿掉控制字元、限制長度. 名稱只會放進 JSON 傳給 Google, 對不對由 Google 判斷, 錯了會把原因顯示給使用者
let day = { d: '', n: 0 };
function dailyTts() {
  const d = new Date().toISOString().slice(0, 10), cap = parseInt(process.env.TTS_DAILY_LIMIT || '1500', 10);
  if (day.d !== d) day = { d, n: 0 };
  day.n++;
  return day.n <= cap;
}
function defaultModel() { const m = String(process.env.TTS_MODEL || ''); return MODELS.indexOf(m) >= 0 ? m : MODELS[0]; }
function cleanStyle(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600); }

// Gemini 3.8 的一次性請求會回傳完整 WAV;如果拿到的是沒有檔頭的 PCM(24kHz、單聲道、16-bit),在這裡補上 WAV 檔頭
function wrapWav(b64) {
  const pcm = Buffer.from(b64, 'base64'), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]).toString('base64');
}
function cleanDetail(m) { return String(m == null ? '' : m).replace(/(?:AIza|AQ\.)[0-9A-Za-z_.\-]{20,}/g, '***').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220); }
// 額度用完(HTTP 429)時, 給學生看得懂的說明. raw = Google 回的原始說明(含「Free Tier」「per day」「Please retry in 16h7m20s」這類字樣); 沒有就用一般說法
function quotaMessage(raw) {
  const d = String(raw == null ? '' : raw), free = /free.?tier/i.test(d), perMin = /per.?minute/i.test(d) && !/per.?day/i.test(d);
  const m = /retry in\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i.exec(d); let wait = '';
  if (m && (m[1] || m[2] || m[3])) { const h = +m[1] || 0, mi = +m[2] || 0, s = Math.ceil(+m[3] || 0); wait = h ? '約 ' + (h + (mi >= 30 ? 1 : 0)) + ' 小時後' : mi ? '約 ' + (mi + (s > 0 ? 1 : 0)) + ' 分鐘後' : '約 ' + Math.max(1, s) + ' 秒後'; }
  if (perMin) return '現在同時合成語音的人太多了(Gemini 每分鐘有次數限制),請等' + (wait ? wait.replace(/後$/, '') : '一分鐘') + '再試。聽過的內容仍可重複播放。';
  return '今天的語音額度用完了' + (free ? '。因為目前使用的是免費版的 Gemini API 金鑰,每天能合成的次數很少' : '(已超過目前 Gemini 方案的語音上限)') + '。' + (wait ? wait + '會恢復; ' : '') + '請明天再試,或請老師在 Google AI Studio 開啟計費(升級付費)。聽過的內容仍可重複播放。';
}
function upstreamMessage(status, raw) {
  if (status === 400) return '這段文字或這個聲音,語音模型不接受。';
  if (status === 401 || status === 403) return '語音服務拒絕了這把金鑰(請老師確認金鑰可以使用語音功能)。';
  if (status === 404) return '找不到這個語音模型或聲音。';
  if (status === 429) return quotaMessage(raw);
  return '語音服務暫時無法使用,請稍後再試。';
}

// 聲音清單(含性別): 向 Google 的 GET /v1beta/voices 讀, 在伺服器記憶體留 1 小時. 欄位用 Google 文件的寫法(id、display_name、gender...); 沒有的欄位就留空
let voicesCache = { t: 0, list: null };
async function listVoices(key) {
  if (voicesCache.list && Date.now() - voicesCache.t < 3600000) return voicesCache.list;
  const out = []; let token = '';
  for (let page = 0; page < 5; page++) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/voices?page_size=1000' + (token ? '&page_token=' + encodeURIComponent(token) : ''), { headers: { 'x-goog-api-key': key } });
    if (!r.ok) { const ej = await r.json().catch(() => null); const e = new Error(upstreamMessage(r.status, ej && ej.error && ej.error.message) + (r.status !== 429 && ej && ej.error && ej.error.message ? ' (Google 說: ' + cleanDetail(ej.error.message) + ')' : '')); e.status = r.status; throw e; }
    const j = await r.json().catch(() => null) || {};
    (j.voices || []).forEach((v) => { if (v && (v.id || v.name)) out.push({ id: String(v.id || String(v.name).replace(/^voices\//, '')), name: String(v.display_name || v.displayName || v.id || ''), gender: String(v.gender || '').toLowerCase(), type: String(v.type || ''), description: String(v.description || '').slice(0, 120) }); });
    token = j.next_page_token || j.nextPageToken || ''; if (!token || out.length >= 800) break;
  }
  voicesCache = { t: Date.now(), list: out.slice(0, 800) }; return voicesCache.list;
}

module.exports = async function handler(req, res) {
  try {
    const ip = clientIp(req);
    if (req.method === 'GET') {
      if (!rate('tts-status:' + ip, 60, 60000)) return send(res, 429, { error: { message: '請求太頻繁,請稍後再試。' } });
      const k = await getKey();
      let wantVoices = false; try { wantVoices = new URL(req.url || '', 'http://x').searchParams.get('voices') === '1'; } catch (e) {}
      if (wantVoices) {
        if (!k || !k.key) return send(res, 503, { error: { message: '老師還沒有設定 AI 金鑰(雲端),讀不到聲音清單。' } });
        try { return send(res, 200, { voices: await listVoices(k.key) }); }
        catch (e) { return send(res, e.status === 429 ? 429 : 502, { error: { message: e.message || '讀不到聲音清單' } }); }
      }
      return send(res, 200, { configured: !!(k && k.key), model: defaultModel(), models: MODELS });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: { message: '不支援這個方法' } }); }
    if (!originOk(req)) return send(res, 403, { error: { message: '只接受從本站發出的請求。' } });
    // 一個班的學生常常共用同一個網路位址,所以每分鐘的上限放寬一些;真正的總量由每日上限把關
    if (!rate('tts:' + ip, parseInt(process.env.TTS_RATE_PER_MIN || '120', 10), 60000)) return send(res, 429, { error: { message: '朗讀請求太頻繁,請稍後再試。' } });
    const b = bodyOf(req, 4000); if (b.error) return send(res, 400, { error: { message: b.error } });
    const text = typeof b.body.text === 'string' ? b.body.text.trim() : '';
    if (!text) return send(res, 400, { error: { message: '沒有要朗讀的文字' } });
    if (text.length > MAX_TEXT) return send(res, 400, { error: { message: '這一段太長了(最多 ' + MAX_TEXT + ' 字)' } });
    const voice = String(b.body.voice == null ? '' : b.body.voice).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
    if (!voice) return send(res, 400, { error: { message: '請填聲音名稱' } });
    const model = b.body.model == null || b.body.model === '' ? defaultModel() : String(b.body.model);
    if (MODELS.indexOf(model) < 0) return send(res, 400, { error: { message: '語音模型不正確' } });
    const style = cleanStyle(b.body.style);
    if (!dailyTts()) return send(res, 429, { error: { message: '這個網站今天的朗讀合成次數已達老師設定的上限,請明天再試(聽過的內容仍可重複播放)。' } });
    const k = await getKey();
    if (!k || !k.key) return send(res, 503, { error: { message: '老師還沒有設定 AI 金鑰(雲端),所以還不能用 AI 人聲。' } });
    const part = { text }; if (style) part.speech_metadata = { style };
    const body = { contents: [{ role: 'user', parts: [part] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice } } } };
    const up = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.key }, body: JSON.stringify(body) });
    if (!up.ok) {
      const ej = await up.json().catch(() => null), detail = cleanDetail(ej && ej.error && ej.error.message);   // Google 說的原因(例如「找不到這個聲音」), 一併顯示, 方便知道哪裡填錯
      return send(res, up.status === 429 ? 429 : 502, { error: { message: upstreamMessage(up.status, ej && ej.error && ej.error.message) + (detail && up.status !== 429 ? ' (Google 說: ' + detail + ')' : ''), upstream: up.status } });
    }
    const j = await up.json().catch(() => null);
    const parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || [];
    const a = parts.map((p) => p.inlineData || p.inline_data).filter(Boolean)[0];
    if (!a || !a.data) return send(res, 502, { error: { message: '語音模型沒有回傳聲音,請換一段文字再試。' } });
    const mime = String(a.mimeType || a.mime_type || 'audio/wav');
    const audio = /wav|wave/i.test(mime) ? a.data : wrapWav(a.data);
    return send(res, 200, { audio, mime: 'audio/wav', model });
  } catch (e) {
    return send(res, 500, { error: { message: '朗讀服務發生錯誤' } });
  }
};
module.exports._reset = function () { day = { d: '', n: 0 }; voicesCache = { t: 0, list: null }; };
