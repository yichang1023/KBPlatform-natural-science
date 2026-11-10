/* kb-asra-core.js — ASRA 資料分析(純函式,不碰畫面;學生頁與教師頁共用) */
(function (global) {
  var EVID = /(實驗|觀察|實測|測量|量到|量了|資料|查到|查了|書上|網站|數據|證據|紀錄|記錄|研究|報告|做了|測試)/;
  var TYPES = ['question', 'extend', 'improve', 'counter', 'riseabove'];
  var TNAME = { question: '提問', extend: '延伸', improve: '改進', counter: '反例', riseabove: '昇華' };
  var TSYM = { question: '?', extend: '+', improve: '↗', counter: '!', riseabove: '↑' };
  var TCOLOR = { question: '#3b8df0', extend: '#f2b01e', improve: '#27b97a', counter: '#ef5b5b', riseabove: '#9a6cf0' };
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function mmdd(ts) { var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function hasEvid(n) { return EVID.test(String(n.title || '') + ' ' + String(n.content || '')); }

  // 把一位學生的紀錄整理成 ASRA 要用的資料
  function analyze(nodes, uid, topics) {
    nodes = nodes || []; topics = topics || [];
    var byId = {}, kids = {}, topicName = {};
    nodes.forEach(function (n) { byId[n.id] = n; if (n.parentId) (kids[n.parentId] = kids[n.parentId] || []).push(n); });
    topics.forEach(function (t) { topicName[t.id] = t.title || t.name || t.id; });
    var mine = nodes.filter(function (n) { return n.author === uid; }).sort(function (a, b) { return (a.date || 0) - (b.date || 0); });
    var byType = {}; TYPES.forEach(function (t) { byType[t] = 0; });
    mine.forEach(function (n) { if (byType[n.type] !== undefined) byType[n.type]++; });
    var days = {}; mine.forEach(function (n) { var k = dayKey(n.date); days[k] = (days[k] || 0) + 1; });
    var dayList = Object.keys(days).map(function (k) { var p = k.split('-'); return { key: k, ts: new Date(+p[0], +p[1] - 1, +p[2]).getTime(), n: days[k] }; }).sort(function (a, b) { return a.ts - b.ts; });
    var given = mine.filter(function (n) { var p = n.parentId && byId[n.parentId]; return p && p.author !== uid; });
    var received = []; var partners = {};
    mine.forEach(function (n) { (kids[n.id] || []).forEach(function (c) { if (c.author !== uid) { received.push(c); partners[c.author] = 1; } }); });
    var topicSet = {}; mine.forEach(function (n) { topicSet[n.topicId] = 1; });
    function descendants(id, acc, guard) { acc = acc || []; (kids[id] || []).forEach(function (c) { if (guard.n++ < 400) { acc.push(c); descendants(c.id, acc, guard); } }); return acc; }
    var ideas = mine.map(function (n) {
      var reps = (kids[n.id] || []).filter(function (c) { return c.author !== uid; });
      var desc = descendants(n.id, [], { n: 0 });
      var evid = hasEvid(n) || reps.some(hasEvid);
      var developed = desc.some(function (c) { return c.type === 'improve' || c.type === 'riseabove'; });
      var diff = reps.filter(function (c) { return c.type === 'counter'; }).length;
      var status = !reps.length ? 'wait' : (!evid ? 'check' : (developed ? 'grow' : 'ok'));
      return { id: n.id, topicId: n.topicId, topic: topicName[n.topicId] || '', type: n.type, title: n.title || '(沒有標題)', content: n.content || '', date: n.date, evid: evid, ownEvid: hasEvid(n), replies: reps.length, diff: diff, developed: developed, status: status, replyNodes: reps };
    });
    var cnt = { wait: 0, check: 0, ok: 0, grow: 0 }; ideas.forEach(function (i) { cnt[i.status]++; });
    return { uid: uid, posts: mine.length, given: given.length, received: received.length, partners: Object.keys(partners).length, topics: Object.keys(topicSet).length, days: dayList, byType: byType, ideas: ideas, counts: cnt, hasEvid: ideas.filter(function (i) { return i.ownEvid; }).length };
  }

  // 計畫之後有沒有行動:從計畫建立時間之後,數同一個討論區我的新貼文、目標想法新的回應
  function followUp(nodes, uid, plan) {
    nodes = nodes || [];
    var target = nodes.filter(function (n) { return n.id === plan.postId; })[0];
    var after = nodes.filter(function (n) { return (n.date || 0) > plan.ts; });
    var mineNew = after.filter(function (n) { return n.author === uid && (!target || n.topicId === target.topicId); });
    var repNew = after.filter(function (n) { return n.parentId === plan.postId && n.author !== uid; });
    var evidNew = mineNew.filter(hasEvid);
    return { mine: mineNew.length, replies: repNew.length, evid: evidNew.length, acted: mineNew.length > 0 || repNew.length > 0 };
  }

  /* ===== 計畫 → 行動 → 想法前進 =====
   * 想法狀態(wait 等同學回應 < check 待查證 < ok 有證據 < grow 在發展)與 analyze() 同一套規則,但可以指定「看到某個時間點為止」,
   * 這樣就能比較「訂計畫當時」和「現在」。 effect() 把一個計畫的後續整理成四種結果之一:
   *   acted_adv 行動了、想法前進 / acted_same 行動了、想法還沒前進 / idle_adv 還沒行動、同學把它推進了 / idle_same 還沒行動、也沒動靜
   * 這是從資料推出來的「可能」關係:想法的前進不一定是這個計畫造成的(可能是同學自己回應的)。 */
  var RANK = { wait: 0, check: 1, ok: 2, grow: 3 };
  function ideaStatus(nodes, postId, uid, atTs) {
    var set = atTs === undefined || atTs === null ? nodes : nodes.filter(function (n) { return (n.date || 0) <= atTs; });
    var byId = {}, kids = {};
    set.forEach(function (n) { byId[n.id] = n; if (n.parentId) (kids[n.parentId] = kids[n.parentId] || []).push(n); });
    var n0 = byId[postId]; if (!n0) return null;
    var reps = (kids[n0.id] || []).filter(function (c) { return c.author !== uid; });
    var desc = []; (function walk(id, g) { (kids[id] || []).forEach(function (c) { if (g.n++ < 400) { desc.push(c); walk(c.id, g); } }); })(n0.id, { n: 0 });
    var evid = hasEvid(n0) || reps.some(hasEvid), developed = desc.some(function (c) { return c.type === 'improve' || c.type === 'riseabove'; });
    return !reps.length ? 'wait' : (!evid ? 'check' : (developed ? 'grow' : 'ok'));
  }
  var OUT = {
    acted_adv: { name: '行動了,想法前進', tone: 'bg-emerald-50 border-emerald-200', pill: 'bg-emerald-100 text-emerald-700', hint: '計畫之後有新貼文,想法的狀態也往前走了。可以請他分享做法,給全班參考。', kid: '你做了,想法也往前走了,很棒!' },
    acted_same: { name: '行動了,想法還沒前進', tone: 'bg-amber-50 border-amber-200', pill: 'bg-amber-100 text-amber-700', hint: '有行動但想法還沒前進。可能是行動的方向沒對準被質疑的地方、還在等同學回應,或需要補上證據。可以問他:「你補的是哪一部分?」', kid: '你做了,想法還沒有變。可能要再等同學回應,或試試補上證據。' },
    idle_adv: { name: '還沒行動,同學把它推進了', tone: 'bg-sky-50 border-sky-200', pill: 'bg-sky-100 text-sky-700', hint: '想法已經被同學推進了。可以請他回頭看看同學寫了什麼,再決定下一步。這是「共同改進」的例子。', kid: '同學幫你把想法往前推了!回去看看他們寫了什麼。' },
    idle_same: { name: '還沒行動,也沒動靜', tone: 'bg-rose-50 border-rose-200', pill: 'bg-rose-100 text-rose-700', hint: '訂了計畫但還沒開始,想法也沒動靜。訂了超過 3 天,可以多關心一下。', kid: '還沒有動靜,先去論壇做一小步吧!' },
    unknown: { name: '找不到原本的想法', tone: 'bg-slate-50 border-slate-200', pill: 'bg-slate-100 text-slate-600', hint: '原本的貼文可能已被刪除或移到別處。', kid: '找不到原本的想法了。' },
    offforum: { name: '論壇外的想法', tone: 'bg-violet-50 border-violet-200', pill: 'bg-violet-100 text-violet-700', hint: '這個想法來自學習單或學生自己新增,不在論壇裡,系統不能自動看出它有沒有前進。可以直接問他:「你做了什麼?有什麼證據?」', kid: '這個想法不在論壇裡,要靠你自己檢查:你做了什麼?有什麼證據?' }
  };
  function effect(nodes, uid, plan) {
    nodes = nodes || [];
    if (plan && plan.srcType && plan.srcType !== 'forum') return { outcome: 'offforum', before: null, now: null, advanced: false, acted: false, follow: { mine: 0, replies: 0, evid: 0, acted: false }, events: [], bySelf: 0, byOthers: 0, types: {}, typeText: '' };
    var target = nodes.filter(function (n) { return n.id === plan.postId; })[0];
    var f = followUp(nodes, uid, plan);
    if (!target) return { outcome: 'unknown', before: plan.ideaStatus || null, now: null, advanced: false, acted: f.mine > 0, follow: f, events: [], bySelf: 0, byOthers: 0, types: {}, typeText: '' };
    var before = plan.ideaStatus || ideaStatus(nodes, plan.postId, uid, plan.ts), now = ideaStatus(nodes, plan.postId, uid);
    var kids = {}; nodes.forEach(function (n) { if (n.parentId) (kids[n.parentId] = kids[n.parentId] || []).push(n); });
    var events = [], g = { n: 0 };
    (function walk(id) { (kids[id] || []).forEach(function (c) { if (g.n++ < 400) { if ((c.date || 0) > plan.ts) events.push({ id: c.id, type: c.type, author: c.author, ts: c.date || 0, mine: c.author === uid, evid: hasEvid(c), title: c.title || '' }); walk(c.id); } }); })(plan.postId);
    events.sort(function (a, b) { return a.ts - b.ts; });
    var bySelf = events.filter(function (e) { return e.mine; }).length, types = {};
    events.forEach(function (e) { types[e.type] = (types[e.type] || 0) + 1; });
    var typeText = TYPES.filter(function (t) { return types[t]; }).map(function (t) { return TNAME[t] + ' ' + types[t]; }).join('、');
    var acted = f.mine > 0, adv = RANK[now] > RANK[before];
    return { outcome: acted ? (adv ? 'acted_adv' : 'acted_same') : (adv ? 'idle_adv' : 'idle_same'), before: before, now: now, advanced: adv, acted: acted, follow: f, events: events, bySelf: bySelf, byOthers: events.length - bySelf, types: types, typeText: typeText };
  }

  global.ASRA = { ideaStatus: ideaStatus, effect: effect, OUT: OUT, analyze: analyze, followUp: followUp, TYPES: TYPES, TNAME: TNAME, TSYM: TSYM, TCOLOR: TCOLOR, hasEvid: hasEvid, mmdd: mmdd };
})(window);
