/* =====================================================================
 *  KB ASRA PUSH — 「讓想法繼續往前走」:把論壇、學習單、自己新增的想法整理成可以做的小計畫
 *  學生頁(ASRA 第 4 步)與老師頁(想法推進)共用。純函式,不碰畫面。
 *    KBPush.local(info)        不用 AI,依資料排出 3 個候選計畫(補證據 / 改想法 / 找夥伴)
 *    KBPush.prompt(info, scrub) 給 AI 助教的提示詞(只輸出 JSON,最多 3 個計畫;學生自己挑、自己改)
 *    KBPush.parse(text)        把 AI 的回覆整理成候選計畫(看不懂就回 null)
 *    KBPush.acts               { evidence:'補證據', revise:'改想法', team:'找夥伴' }
 *  info = { src:'forum'|'ws'|'manual', title, status, replies, diff, ownEvid, text, replyTexts:[], ws:{ q4:[], q5:[], q6:[], evid:[] },
 *           past:{ refl:'', plans:[{ act, result }] } }
 * ===================================================================== */
(function (global) {
  'use strict';
  var ACTS = { evidence: '補證據', revise: '改想法', team: '找夥伴' };
  var SRC_NAME = { forum: '論壇', ws: '學習單', manual: '自己新增' };
  var STATUS = { wait: '還沒有人回應', check: '有人回應但還沒有證據', ok: '有證據了', grow: '已經被同學改進、整合' };

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function cut(s, n) { s = clean(s); return s.length > n ? s.slice(0, n) + '…' : s; }

  function mk(act, title, steps, check, why, src) { return { act: act, title: title, steps: steps, check: check, why: why, src: src || '', from: 'local' }; }

  // 不用 AI:依想法目前的情況,排出 3 個候選計畫(第一個是最建議的)
  function local(info) {
    info = info || {};
    var src = info.src || 'forum', st = info.status, diff = info.diff || 0, T = clean(info.title) ? '「' + cut(info.title, 14) + '」' : '這個想法';
    var ws = info.ws || {}, hasQ4 = !!(ws.q4 && ws.q4.length), noEvid = src === 'forum' ? !info.ownEvid && st !== 'ok' && st !== 'grow' : !(ws.evid && ws.evid.length);
    var by = {};
    by.evidence = mk('evidence', '找一個證據來試試',
      ['想一想:' + T + '可以用什麼方法確認?(量一量、做小實驗、查資料)', '真的做一次,把看到的結果記下來(數字、照片或一句話)', '把結果寫回去(論壇的新貼文,或學習單、作品)'],
      '我的想法旁邊多了一則「有結果」的記錄', noEvid ? '因為' + (src === 'forum' ? '這個想法裡還看不到證據' : '回答裡還看不到證據或回饋') : '有了證據,想法會更站得住腳', SRC_NAME[src]);
    by.revise = mk('revise', hasQ4 ? '把「還想深的地方」寫清楚' : '把想法改得更清楚',
      [hasQ4 ? '回頭看你當時寫的「還要想深的地方」:「' + cut(ws.q4[0], 24) + '」' : '把原本的想法,用一句話重新寫一次', '挑一個地方改:說得更清楚、改正錯的,或加上原因', '寫成新的一版(新貼文或新的一句話)'],
      '新的一版比原本更清楚、更完整', st === 'grow' ? '因為同學已經提出改進,可以把大家的想法整合起來' : (hasQ4 ? '因為你自己也覺得這裡還要想深' : '因為想完了就要讓想法長大'), SRC_NAME[src]);
    by.team = mk('team', diff ? '回應不同的看法' : '找夥伴一起想',
      [diff ? '看看哪位同學的想法和你不一樣' : '選一位同學(最好是還沒聽過他的想法)', diff ? '回應他:你同意哪裡?不同意哪裡?為什麼?' : '回應他的想法,再問他:「你覺得我的想法哪裡可以更好?」', '等他回覆後,把你學到的寫下來'],
      '有同學回應你,而且你有回覆他', diff ? '因為有 ' + diff + ' 則不同的看法,正好可以讓想法更完整' : (st === 'wait' ? '因為還沒有人回應這個想法' : '因為多一個人看,就多一個角度'), SRC_NAME[src]);
    var order;
    if (src === 'forum') order = diff ? ['team', 'revise', 'evidence'] : st === 'wait' ? ['team', 'evidence', 'revise'] : st === 'check' ? ['evidence', 'revise', 'team'] : ['revise', 'team', 'evidence'];
    else if (src === 'ws') order = noEvid ? ['evidence', 'revise', 'team'] : hasQ4 ? ['revise', 'evidence', 'team'] : ['team', 'revise', 'evidence'];
    else order = ['evidence', 'team', 'revise'];
    return order.map(function (k) { return by[k]; });
  }

  // 給 AI 助教的提示詞。scrub(text) 把姓名換成「某位同學」;只用目前這個想法與他自己的紀錄
  function prompt(info, scrub) {
    info = info || {}; scrub = scrub || function (x) { return x; };
    var L = [];
    L.push('想法:「' + cut(info.title, 40) + '」(來源:' + (SRC_NAME[info.src] || '論壇') + ')');
    if (info.text) L.push('他當時寫的:' + cut(scrub(info.text), 140));
    if (info.status) L.push('目前狀態:' + (STATUS[info.status] || info.status) + ';同學回應 ' + (info.replies || 0) + ' 則' + (info.diff ? '(其中 ' + info.diff + ' 則是不同的看法)' : '') + ';他的貼文' + (info.ownEvid ? '有' : '還沒有') + '寫到證據');
    (info.replyTexts || []).slice(0, 3).forEach(function (r, i) { L.push('同學的回應 ' + (i + 1) + ':' + cut(scrub(r), 80)); });
    var ws = info.ws || {};
    [['q4', '學習單裡他說「還要想深」的地方'], ['q5', '學習單裡他說想深化的方向'], ['q6', '學習單裡他當時寫的計畫'], ['evid', '學習單裡的證據或回饋']].forEach(function (p) {
      (ws[p[0]] || []).slice(0, 2).forEach(function (t) { L.push(p[1] + ':' + cut(scrub(t), 80)); });
    });
    var past = info.past || {};
    if (past.refl) L.push('他之前的反思:' + cut(scrub(past.refl), 100));
    (past.plans || []).slice(0, 2).forEach(function (p) { L.push('他之前訂過「' + (ACTS[p.act] || p.act) + '」的計畫,結果:' + (p.result === 'better' ? '想法變好了' : p.result === 'more' ? '還要再努力' : '還沒再評估')); });
    return '你是國小「知識建構」課的 AI 助教,要幫學生把一個想法「繼續往前推」:根據下面他的論壇、學習單與自己新增的紀錄,排出 3 個「他自己可以做得到」的小計畫。學生會自己挑、自己改,不要替他寫反思內容。\n' +
      '【資料】\n' + L.join('\n') + '\n' +
      '【輸出】只輸出 JSON,不要加任何說明:{"plans":[{"act":"evidence|revise|team","title":"計畫名稱","steps":["步驟1","步驟2","步驟3"],"check":"怎麼知道想法有進步","why":"為什麼建議這樣做(依據上面哪一項資料)"}]}\n' +
      '【規則】剛好 3 個計畫,act 各是 evidence(補證據:查資料、做實驗、量一量)、revise(改想法:改得更清楚、更正確、整合大家的說法)、team(找夥伴:問同學、回應不同看法)各一個,依最適合的順序排。title 16 字內。steps 2 到 3 步,每步 28 字內,一個小學生一兩天內做得完。check 25 字內。why 30 字內,只能根據上面的資料,不要猜。用國小高年級看得懂的話;不要出現學生姓名。';
  }

  function parse(txt) {
    var m = /\{[\s\S]*\}/.exec(String(txt || '')); if (!m) return null;
    var o; try { o = JSON.parse(m[0]); } catch (e) { return null; }
    var arr = Array.isArray(o) ? o : (o && o.plans);
    if (!Array.isArray(arr)) return null;
    var out = [];
    arr.slice(0, 3).forEach(function (p) {
      if (!p) return;
      var act = ACTS[p.act] ? p.act : (/證據|查|實驗|量/.test(String(p.act)) ? 'evidence' : /改|寫|整合/.test(String(p.act)) ? 'revise' : /夥伴|同學|問|回應/.test(String(p.act)) ? 'team' : '');
      var steps = (Array.isArray(p.steps) ? p.steps : []).map(function (s) { return cut(s, 40); }).filter(Boolean).slice(0, 3);
      var title = cut(p.title, 20);
      if (!act || !title || !steps.length) return;
      out.push({ act: act, title: title, steps: steps, check: cut(p.check, 40), why: cut(p.why, 50), src: '', from: 'ai' });
    });
    return out.length ? out : null;
  }

  // 把一個候選計畫變成「計畫內容」與「為什麼先做這個」(學生要再改成自己的話)
  function toText(p) { return (p.steps || []).map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n') + (p.check ? '\n(做完怎麼知道有進步:' + p.check + ')' : ''); }
  function toWhy(p) { return p.why ? '我想先' + p.title + ',' + (/^因為/.test(p.why) ? p.why : '因為' + p.why) : '我想先' + p.title; }

  global.KBPush = { local: local, prompt: prompt, parse: parse, toText: toText, toWhy: toWhy, acts: ACTS, STATUS: STATUS };
})(window);
