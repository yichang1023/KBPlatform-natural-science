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

  global.ASRA = { analyze: analyze, followUp: followUp, TYPES: TYPES, TNAME: TNAME, TSYM: TSYM, TCOLOR: TCOLOR, hasEvid: hasEvid, mmdd: mmdd };
})(window);
