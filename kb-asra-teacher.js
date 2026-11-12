/* =====================================================================
 *  KB ASRA 教師版 — 全班與每位學生的「分析支持的反思評量」
 *  資料來源:
 *    1) 論壇貼文與回應(算出歷程監控、想法有沒有證據、互動)
 *    2) 學生在 ASRA 頁寫下的反思與計畫(kb-asra.js 的歷史紀錄,每筆都有日期時間)
 *  這個畫面只在老師的瀏覽器裡計算與顯示,不會把學生的資料送到任何 AI 或外部服務。
 *  需要先載入: kb-core.js, kb-asra-core.js, kb-asra.js
 * ===================================================================== */
(function (global) {
  'use strict';
  var UI = { tab: 'class', stu: 'all', kind: 'all', limit: 40, sort: 'name', dir: 'asc', eff: 'all', ctx: null, root: null };
  var DAY = 86400000;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cut(s, n) { s = String(s || '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) + '…' : s; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }

  /* ---------- 計算 ---------- */
  function compute(ctx) {
    var nodes = ctx.nodes || [], topics = ctx.topics || [], ul = ctx.userList || {};
    var list = Object.keys(ul).map(function (k) { return ul[k]; }).filter(function (u) { return u.role !== 'teacher'; });
    var refNow = nodes.reduce(function (m, n) { return Math.max(m, n.date || 0); }, 0) || Date.now();
    var now = Date.now();
    var T = { students: list.length, posts: 0, given: 0, received: 0, refl: 0, plans: 0, reeval: 0, better: 0, users: 0, usersRefl: 0, usersPlan: 0, usersRe: 0, usersBetter: 0, usersPost: 0, planActed: 0, planOld: 0 };
    var types = {}, status = { wait: 0, check: 0, ok: 0, grow: 0 }, ideas = 0, ideasEvid = 0;
    var eff = { acted_adv: 0, acted_same: 0, idle_adv: 0, idle_same: 0, unknown: 0, offforum: 0 }, plansAll = [];
    ASRA.TYPES.forEach(function (t) { types[t] = 0; });
    var rows = list.map(function (u) {
      var A = ASRA.analyze(nodes, u.id, topics), E = KBAsra.entriesCollapsed(u.id), S = KBAsra.derive(u.id);   // 自動存下的多個版本只算一則(看最新版)
      var c = { note: 0, refl: 0, plan: 0, reeval: 0 }; E.forEach(function (e) { if (c[e.kind] !== undefined) c[e.kind]++; });
      var better = 0, more = 0, acted = 0, planOld = 0, lastRe = null;
      S.plans.forEach(function (p) {
        var f = ASRA.followUp(nodes, u.id, p); p._f = f;
        p._e = ASRA.effect(nodes, u.id, p); eff[p._e.outcome]++; plansAll.push({ u: u, p: p, e: p._e });
        if (f.acted) acted++; else if (now - p.ts >= 3 * DAY) planOld++;
        (p.reeval || []).forEach(function (r) { if (r.result === 'better') better++; else more++; if (!lastRe || r.ts > lastRe.ts) lastRe = r; });
      });
      var mineDates = nodes.filter(function (n) { return n.author === u.id; }).map(function (n) { return n.date || 0; });
      var lastPost = mineDates.length ? Math.max.apply(null, mineDates) : 0;
      var lastAsra = E.length ? E[E.length - 1].ts : 0;
      var improveShare = A.posts ? pct((A.byType.improve || 0) + (A.byType.riseabove || 0), A.posts) : 0;
      var r = { u: u, A: A, S: S, E: E, c: c, plans: S.plans.length, better: better, more: more, acted: acted, planOld: planOld, lastRe: lastRe, lastPost: lastPost, lastAsra: lastAsra, improveShare: improveShare, noEvid: A.ideas.filter(function (i) { return !i.ownEvid; }).length, reasons: [] };
      // 需要關心的原因
      var hasWs = !!(global.KBSrc && KBSrc.has(u.id));      // 有匯入學習單資料的學生:沒有論壇貼文是正常的
      if (!A.posts) { if (!hasWs) r.reasons.push('還沒發過貼文'); }
      else if (refNow - lastPost >= 7 * DAY) r.reasons.push('已 ' + Math.floor((refNow - lastPost) / DAY) + ' 天沒有發言');
      if (A.posts >= 3 && A.given === 0) r.reasons.push('只發表、沒有回應過同學');
      if (A.posts >= 3 && A.received === 0) r.reasons.push('同學都還沒回應過他');
      if (A.ideas.length >= 3 && r.noEvid / A.ideas.length >= 0.8) r.reasons.push('多數想法沒有寫證據');
      if (planOld) r.reasons.push(planOld + ' 個計畫訂了超過 3 天,還沒看到新行動');
      if (lastRe && lastRe.result === 'more') r.reasons.push('最近一次再評估是「還要再努力」');
      // 全班彙總
      T.posts += A.posts; T.given += A.given; T.received += A.received; T.refl += c.refl; T.plans += c.plan; T.reeval += c.reeval; T.better += better;
      if (A.posts) T.usersPost++;
      if (E.length) T.users++; if (c.refl) T.usersRefl++; if (c.plan) T.usersPlan++; if (c.reeval) T.usersRe++; if (better) T.usersBetter++;
      T.planActed += acted; T.planOld += planOld;
      ASRA.TYPES.forEach(function (t) { types[t] += A.byType[t] || 0; });
      A.ideas.forEach(function (i) { status[i.status]++; ideas++; if (i.ownEvid) ideasEvid++; });
      return r;
    });
    var improve = (types.improve || 0) + (types.riseabove || 0);
    var attention = rows.filter(function (r) { return r.reasons.length; }).sort(function (a, b) { return b.reasons.length - a.reasons.length || (a.u.name < b.u.name ? -1 : 1); });
    var tips = [];
    if (T.posts >= 10 && pct(improve, T.posts) < 20) tips.push('全班「改進」與「昇華」的貼文只占 ' + pct(improve, T.posts) + '%。可以安排一次「把大家的想法合起來」的活動,請學生互相改進、整合。');
    if (ideas >= 10 && pct(ideasEvid, ideas) < 40) tips.push('只有 ' + pct(ideasEvid, ideas) + '% 的想法寫了證據。下次可以先示範「怎麼寫證據」(實驗、觀察、資料來源)。');
    if (T.students && T.usersRefl < Math.ceil(T.students / 2)) tips.push('只有 ' + T.usersRefl + ' 位學生寫過反思。可以排一節課,帶全班一起走一次 ASRA 五步驟。');
    if (T.plans && pct(T.planActed, T.plans) < 50) tips.push('訂了計畫的學生裡,只有 ' + pct(T.planActed, T.plans) + '% 的計畫後來看得到新的貼文或回應。可以在課堂上提醒「去論壇做做看」。');
    var iso = rows.filter(function (r) { return r.A.posts >= 3 && r.A.received === 0; }).length;
    if (iso) tips.push('有 ' + iso + ' 位學生發了 3 則以上貼文卻沒人回應。可以請同學去回應他們,避免被冷落。');
    return { eff: eff, plansAll: plansAll, rows: rows, T: T, types: types, status: status, ideas: ideas, ideasEvid: ideasEvid, improve: improve, attention: attention, tips: tips, refNow: refNow };
  }

  /* ---------- 小元件 ---------- */
  function tile(n, label, sub, tone) { return '<div class="rounded-xl border p-3 ' + (tone || 'bg-white border-slate-200') + '"><div class="text-2xl font-black text-slate-800">' + n + '</div><div class="text-xs font-bold text-slate-600">' + label + '</div>' + (sub ? '<div class="text-[11px] text-slate-400 mt-0.5">' + sub + '</div>' : '') + '</div>'; }
  function bar(label, n, max, color, extra) { return '<div class="flex items-center gap-2 mb-1.5"><span class="w-14 text-sm font-bold text-slate-700 shrink-0">' + label + '</span><div class="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden"><i class="block h-full rounded-full" style="width:' + Math.round(n / Math.max(max, 1) * 100) + '%;background:' + color + '"></i></div><span class="w-20 text-right text-sm font-black text-slate-700 shrink-0">' + n + (extra || '') + '</span></div>'; }
  function pill(t, cls) { return '<span class="inline-block text-[11px] font-black px-2 py-0.5 rounded-full ' + cls + '">' + t + '</span>'; }
  var KCOL = { note: 'bg-slate-100 text-slate-600', refl: 'bg-indigo-100 text-indigo-700', plan: 'bg-emerald-100 text-emerald-700', reeval: 'bg-amber-100 text-amber-700', concept: 'bg-sky-100 text-sky-700', idea: 'bg-violet-100 text-violet-700' };
  var SNAME = { wait: '等同學回應', check: '待查證', ok: '有證據', grow: '在發展' };
  var SCOL = { wait: '#94a3b8', check: '#f59e0b', ok: '#10b981', grow: '#8b5cf6' };
  function asraHref(id) { return 'ASRA.html?student=' + encodeURIComponent(id); }
  function nameOf(r) { return esc(r.u.name) + (r.u.className ? ' <span class="text-[11px] text-slate-400">' + esc(r.u.className) + '</span>' : ''); }
  function cloudBanner() {
    var K = global.KB, c = K && K.cloud && K.cloud.mode === 'cloud' ? K.cloud : null;
    if (!c) return '<div class="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs px-3 py-2"><i class="fas fa-triangle-exclamation mr-1"></i>目前是單機模式:只看得到<b>這台電腦的瀏覽器</b>裡留下的反思與計畫。正式上線並連上雲端後,這裡會顯示全班所有學生的紀錄。</div>';
    if (c.asraError) return '<div class="rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs px-3 py-2"><i class="fas fa-circle-exclamation mr-1"></i>雲端目前不能存 ASRA 紀錄(' + esc(c.asraError) + '),請先到 Firebase 更新資料庫規則。</div>';
    return '<div class="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs px-3 py-2"><i class="fas fa-cloud mr-1"></i>已連上雲端:全班學生的反思與計畫會即時出現在這裡,並保留每一筆的日期時間。</div>';
  }

  /* ---------- 分頁 1:全班總覽 ---------- */
  function tabClass(D) {
    var T = D.T, tmax = Math.max.apply(null, ASRA.TYPES.map(function (t) { return D.types[t]; }).concat([1]));
    var smax = Math.max(D.status.wait, D.status.check, D.status.ok, D.status.grow, 1);
    var funnel = [
      ['有發過貼文', T.usersPost, '#6366f1'], ['寫過反思', T.usersRefl, '#8b5cf6'], ['訂過計畫', T.usersPlan, '#10b981'], ['做過再評估', T.usersRe, '#f59e0b'], ['回報「變好了」', T.usersBetter, '#22c55e']
    ].map(function (f) { return bar(f[0], f[1], T.students, f[2], ' 人'); }).join('');
    var types = ASRA.TYPES.map(function (t) { return bar(ASRA.TNAME[t], D.types[t], tmax, ASRA.TCOLOR[t], ' (' + pct(D.types[t], T.posts) + '%)'); }).join('');
    var stat = ['ok', 'grow', 'check', 'wait'].map(function (k) { return bar(SNAME[k], D.status[k], smax, SCOL[k], ' (' + pct(D.status[k], D.ideas) + '%)'); }).join('');
    var att = D.attention.slice(0, 10).map(function (r) {
      return '<div class="flex flex-wrap items-start gap-2 py-2 border-t border-slate-100"><div class="w-36 shrink-0 font-bold text-slate-800">' + nameOf(r) + '</div><div class="flex-1 min-w-[12rem] flex flex-wrap gap-1">' + r.reasons.map(function (x) { return pill(esc(x), 'bg-rose-50 text-rose-700 border border-rose-100'); }).join('') + '</div><div class="shrink-0 text-xs"><a class="text-indigo-600 font-bold underline mr-3" href="#" data-act="log" data-id="' + esc(r.u.id) + '">看紀錄</a><a class="text-indigo-600 font-bold underline" href="' + esc(asraHref(r.u.id)) + '">ASRA 頁</a></div></div>';
    }).join('') || '<p class="text-sm text-slate-400 py-2">目前沒有需要特別關心的學生。</p>';
    var tips = D.tips.length ? '<ul class="list-disc pl-5 space-y-1 text-sm text-slate-700">' + D.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '<p class="text-sm text-slate-400">目前資料還不夠多,或各項指標都在合理範圍。</p>';
    return '<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">' +
      tile(T.students, '學生人數', '') + tile(T.posts, '論壇貼文', '平均 ' + (T.students ? (T.posts / T.students).toFixed(1) : 0) + ' 則/人') +
      tile(T.users, '使用過 ASRA', pct(T.users, T.students) + '% 的學生', 'bg-indigo-50 border-indigo-200') + tile(T.refl, '反思篇數', T.usersRefl + ' 位學生寫過', 'bg-indigo-50 border-indigo-200') +
      tile(T.plans, '計畫個數', T.usersPlan + ' 位學生訂過', 'bg-emerald-50 border-emerald-200') + tile(pct(T.planActed, T.plans) + '%', '計畫後有行動', T.planActed + ' / ' + T.plans + ' 個', 'bg-emerald-50 border-emerald-200') +
      tile(T.reeval, '再評估次數', '') + tile(pct(T.better, T.reeval) + '%', '回報「變好了」', T.better + ' / ' + T.reeval + ' 次', 'bg-amber-50 border-amber-200') + '</div>' +
      '<div class="grid lg:grid-cols-2 gap-4 mt-4">' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4"><h4 class="font-black text-slate-800">ASRA 走到哪一步?<span class="ml-2 text-xs font-bold text-slate-400">監控 → 反思 → 調整 → 再評估</span></h4><p class="text-xs text-slate-500 mb-2">長條是人數,滿格代表全班。看哪一步卡住最多人。</p>' + funnel + '<div data-ai="funnel" class="mt-3"></div>' + refsBox('funnel') + '</section>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4"><h4 class="font-black text-slate-800">大家在做哪些思考?<span class="ml-2 text-xs font-bold text-slate-400">貼文類型(近似「認知動作」)</span></h4><p class="text-xs text-slate-500 mb-2">「改進」+「昇華」占 <b>' + pct(D.improve, T.posts) + '%</b>。這兩種越多,代表越常把想法變得更好、把大家的想法合起來。</p>' + types + '<div data-ai="types" class="mt-3"></div>' + refsBox('types') + '</section>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4"><h4 class="font-black text-slate-800">想法走多遠了?<span class="ml-2 text-xs font-bold text-slate-400">知識進展評估</span></h4><p class="text-xs text-slate-500 mb-2">全班共 ' + D.ideas + ' 個想法;其中 ' + D.ideasEvid + ' 個(' + pct(D.ideasEvid, D.ideas) + '%)作者自己寫了證據。</p>' + stat + '<div data-ai="ideas" class="mt-3"></div>' + refsBox('ideas') + '</section>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4"><h4 class="font-black text-slate-800">教學小建議<span class="ml-2 text-xs font-bold text-slate-400">由上面的數字自動整理</span></h4><div class="mt-2">' + tips + '</div><div data-ai="tips" class="mt-3"></div>' + refsBox('tips') + '</section></div>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800">這週建議多關心<span class="ml-2 text-xs font-bold text-slate-400">規則見「指標說明」</span></h4>' + att + '<div data-ai="attention" class="mt-3"></div>' + refsBox('attention') + '</section>';
  }

  /* ---------- 分頁:計畫 → 行動 → 想法前進 ---------- */
  var EFF_ORDER = ['idle_same', 'acted_same', 'idle_adv', 'acted_adv', 'offforum', 'unknown'];
  function tabEffect(D) {
    var E = D.eff, all = D.plansAll, N = all.length, OUT = ASRA.OUT, now = Date.now();
    if (!N) return '<section class="rounded-xl bg-white border border-slate-200 p-5"><h4 class="font-black text-slate-800 mb-1">計畫 → 行動 → 想法前進</h4><p class="text-sm text-slate-500">還沒有學生訂過計畫。學生在 ASRA 第 4 步訂下計畫後,這裡會看到:他有沒有去行動、原本的想法有沒有往前走。</p></section>';
    var tileKeys = ['acted_adv', 'acted_same', 'idle_adv', 'idle_same'].concat(E.offforum ? ['offforum'] : []);
    var tiles = tileKeys.map(function (k) { return tile(E[k], OUT[k].name, pct(E[k], N) + '% 的計畫', OUT[k].tone); }).join('');
    var rows = all.filter(function (x) { return UI.eff === 'all' || x.e.outcome === UI.eff; }).sort(function (a, b) { return (EFF_ORDER.indexOf(a.e.outcome) - EFF_ORDER.indexOf(b.e.outcome)) || (a.p.ts - b.p.ts); });
    var sel = '<select data-act="eff" class="border border-slate-300 rounded-lg px-2 py-1 text-sm"><option value="all"' + (UI.eff === 'all' ? ' selected' : '') + '>全部 ' + N + ' 個計畫</option>' + EFF_ORDER.filter(function (k) { return E[k]; }).map(function (k) { return '<option value="' + k + '"' + (UI.eff === k ? ' selected' : '') + '>' + OUT[k].name + '(' + E[k] + ')</option>'; }).join('') + '</select>';
    var list = rows.map(function (x) {
      var p = x.p, e = x.e, o = OUT[e.outcome], idea = (p.ideaTitle || '(想法)'), old = !e.acted && (now - p.ts) >= 3 * DAY;
      var st = e.before || e.now ? '想法狀態:<b>' + (SNAME[e.before] || '?') + '</b> → <b>' + (SNAME[e.now] || '?') + '</b>' + (e.advanced ? ' <span class="text-emerald-600 font-bold">▲ 前進了</span>' : (e.before === e.now ? ' <span class="text-slate-400">(沒變)</span>' : '')) : '';
      var off = e.outcome === 'offforum';
      var did = off ? '這個想法來自' + esc((KBAsra.describe(p).src) || '論壇外') + ',系統看不到後續的討論;請看學生的「再評估」,或直接問他做了什麼。' : '計畫之後:他在這個討論區新發 <b>' + e.follow.mine + '</b> 則;這則想法底下多了 <b>' + e.events.length + '</b> 則貼文' + (e.events.length ? '(同學 ' + e.byOthers + '、他自己 ' + e.bySelf + (e.typeText ? ';類型:' + e.typeText : '') + ')' : '');
      return '<div class="flex flex-wrap items-start gap-3 py-3 border-t border-slate-100"><div class="w-36 shrink-0 font-bold text-slate-800">' + nameOf({ u: x.u }) + '</div><div class="flex-1 min-w-[15rem]">' +
        '<div class="text-sm">' + (off ? '<span class="font-bold text-indigo-700">想法:' + esc(cut(idea, 26)) + '</span>' : '<button type="button" data-act="view" data-id="' + esc(p.postId) + '" class="font-bold text-indigo-700 underline text-left">想法:' + esc(cut(idea, 26)) + '</button>') + ' <span class="text-xs text-slate-400">' + KBAsra.fmtDate(p.ts) + ' 訂計畫</span></div>' +
        '<div class="text-sm text-slate-700 mt-0.5">' + pill(esc(KBAsra.ACT_NAME[p.act] || p.act || ''), 'bg-emerald-50 text-emerald-700') + (p.push ? ' ' + pill('🚀 ' + (p.push.from === 'ai' ? 'AI 助教排的' : '系統排的') + (p.push.edited ? '・自己改過' : ''), 'bg-violet-50 text-violet-700') : '') + (p.open ? ' ' + pill('草稿(還沒按「訂好」)', 'bg-amber-50 text-amber-700') : '') + ' ' + esc(cut(p.text, 70)) + '</div>' +
        '<div class="text-xs text-slate-600 mt-1">' + st + '</div><div class="text-xs text-slate-600">' + did + '</div></div>' +
        '<div class="w-44 shrink-0">' + pill(o.name, o.pill) + (old ? '<div class="text-[11px] text-rose-600 font-bold mt-1">已超過 3 天</div>' : '') + '</div></div>';
    }).join('');
    return '<div class="grid grid-cols-2 ' + (E.offforum ? 'md:grid-cols-5' : 'md:grid-cols-4') + ' gap-3">' + tiles + '</div>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800">計畫 → 行動 → 想法前進<span class="ml-2 text-xs font-bold text-slate-400">看見知識有沒有被改進</span></h4>' +
      '<p class="text-xs text-slate-500 mt-1 mb-2">比較「訂計畫當時」和「現在」想法的狀態(等同學回應 → 待查證 → 有證據 → 在發展),並看計畫之後,學生有沒有去行動、這則想法底下多了哪些貼文。<b>這是從資料推出來的可能關係</b>:想法前進不一定是這個計畫造成的,也可能是同學自己回應的。</p>' +
      '<div class="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 mb-3"><b>怎麼讀這四種結果:</b>' + ['acted_same', 'idle_adv', 'idle_same'].map(function (k) { return '<div class="mt-1"><b>' + OUT[k].name + '</b>:' + OUT[k].hint + '</div>'; }).join('') + '</div>' +
      '<div class="flex flex-wrap items-center gap-2 mb-1"><label class="text-sm font-bold text-slate-600">看哪一種</label>' + sel + '<span class="text-xs text-slate-400">先列最需要老師看一眼的</span></div>' + list + '</section>';
  }

  /* ---------- 分頁 2:學生一覽 ---------- */
  // 「學生一覽」的欄位排序:點標題 = 多到少,再點 = 少到多(姓名則是前到後 / 後到前);「從來沒用過 ASRA」的永遠排在最後
  var SORT_COLS = [
    { k: 'name', l: '學生', v: function (r) { return String(r.u.name || r.u.id); }, d0: 'asc', str: true },
    { k: 'posts', l: '貼文', v: function (r) { return r.A.posts; } },
    { k: 'given', l: '回應別人', v: function (r) { return r.A.given; } },
    { k: 'received', l: '被回應', v: function (r) { return r.A.received; } },
    { k: 'partners', l: '夥伴', v: function (r) { return r.A.partners; } },
    { k: 'evid', l: '想法有證據', v: function (r) { return r.A.hasEvid + (r.A.ideas.length ? r.A.hasEvid / r.A.ideas.length / 1000 : 0); } },
    { k: 'improve', l: '改進+昇華', v: function (r) { return r.improveShare; } },
    { k: 'refl', l: '反思', v: function (r) { return r.c.refl; } },
    { k: 'plans', l: '計畫', v: function (r) { return r.plans; } },
    { k: 'acted', l: '計畫後有行動', v: function (r) { return r.acted + (r.plans ? r.acted / r.plans / 1000 : 0); } },
    { k: 'reeval', l: '再評估', v: function (r) { return r.c.reeval + r.better / 1000; } },
    { k: 'last', l: '最近 ASRA', v: function (r) { return r.lastAsra; }, last0: true }
  ];
  var CARE_COL = { k: 'care', l: '需要關心的原因數', v: function (r) { return r.reasons.length; } };
  function sortCol(k) { return SORT_COLS.filter(function (c) { return c.k === k; })[0] || (k === 'care' ? CARE_COL : SORT_COLS[0]); }
  function sortRows(rows, key, dir) {
    var col = sortCol(key), sign = dir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var x = col.v(a), y = col.v(b);
      if (col.last0) { var za = !x, zb = !y; if (za !== zb) return za ? 1 : -1; }
      var c = col.str ? String(x).localeCompare(String(y), 'zh-Hant', { numeric: true }) : (x < y ? -1 : x > y ? 1 : 0);
      if (c) return c * sign;
      return String(a.u.name || a.u.id).localeCompare(String(b.u.name || b.u.id), 'zh-Hant', { numeric: true });
    });
    return rows;
  }
  function sortTh(c) {
    var on = UI.sort === c.k, dir = UI.dir || c.d0 || 'desc', desc = dir === 'desc';
    var tip = !on ? '點一下排序' : (c.str ? (desc ? '目前:後面的排前面(點一下改成前面的排前面)' : '目前:前面的排前面(點一下反過來)') : (desc ? '目前:多到少(點一下改成少到多)' : '目前:少到多(點一下改成多到少)'));
    return '<th class="pb-2 font-bold ' + (c.k === 'name' ? 'text-left' : '') + '" aria-sort="' + (on ? (desc ? 'descending' : 'ascending') : 'none') + '"><button type="button" data-act="sortcol" data-key="' + c.k + '" title="' + tip + '" class="font-bold whitespace-nowrap hover:text-indigo-700 ' + (on ? 'text-indigo-700' : '') + '">' + c.l + ' <span class="' + (on ? '' : 'opacity-40') + '">' + (on ? (desc ? '▼' : '▲') : '⇅') + '</span></button></th>';
  }
  function tabStudents(D) {
    var rows = sortRows(D.rows.slice(), UI.sort, UI.dir);
    var body = rows.map(function (r) {
      var A = r.A, reTxt = r.c.reeval ? ('<span class="text-emerald-600 font-bold">' + r.better + ' 好</span> / <span class="text-amber-600 font-bold">' + r.more + ' 努力</span>') : '<span class="text-slate-300">-</span>';
      return '<tr class="border-t border-slate-100 hover:bg-slate-50"><td class="py-2 pr-3 text-left align-top"><div class="font-bold text-slate-800 whitespace-nowrap">' + nameOf(r) + (r.reasons.length ? ' <span title="' + esc(r.reasons.join('、')) + '" class="text-rose-500"><i class="fas fa-flag"></i></span>' : '') + '</div>' + (r.reasons.length ? '<div class="mt-1 flex flex-wrap gap-1" style="max-width:18rem" data-k="reasons">' + r.reasons.map(function (x) { return pill(esc(x), 'bg-rose-50 text-rose-700 border border-rose-100'); }).join('') + '</div>' : '') + '</td>' +
        '<td>' + A.posts + '</td><td>' + A.given + '</td><td>' + A.received + '</td><td>' + A.partners + '</td><td>' + A.hasEvid + ' / ' + A.ideas.length + '</td><td>' + r.improveShare + '%</td>' +
        '<td class="font-black ' + (r.c.refl ? 'text-indigo-700' : 'text-slate-300') + '">' + r.c.refl + '</td><td class="font-black ' + (r.plans ? 'text-emerald-700' : 'text-slate-300') + '">' + r.plans + '</td><td>' + (r.plans ? r.acted + ' / ' + r.plans : '<span class="text-slate-300">-</span>') + '</td><td class="whitespace-nowrap">' + reTxt + '</td>' +
        '<td class="whitespace-nowrap text-xs text-slate-500">' + (r.lastAsra ? KBAsra.fmtDate(r.lastAsra) : '<span class="text-slate-300">尚未使用</span>') + '</td>' +
        '<td class="whitespace-nowrap text-xs"><a class="text-indigo-600 font-bold underline mr-2" href="#" data-act="log" data-id="' + esc(r.u.id) + '">看紀錄</a><a class="text-indigo-600 font-bold underline" href="' + esc(asraHref(r.u.id)) + '">ASRA 頁</a></td></tr>';
    }).join('') || '<tr><td colspan="13" class="py-4 text-center text-slate-400">沒有學生資料</td></tr>';
    var selOpts = [['name', '姓名'], ['care', '需要關心的原因數']].concat(SORT_COLS.slice(1).map(function (c) { return [c.k, c.l]; })).map(function (o) { return '<option value="' + o[0] + '"' + (UI.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    return '<div class="flex flex-wrap items-center gap-2 mb-3"><label class="text-sm font-bold text-slate-600">排序</label><select data-act="sort" class="border border-slate-300 rounded-lg px-2 py-1 text-sm">' + selOpts + '</select><span class="text-xs text-slate-500">也可以直接點下面的欄位標題:第一次「多到少」,再點一次「少到多」。</span><span class="text-xs text-slate-400"><i class="fas fa-flag text-rose-500"></i> = 有需要關心的原因,原因直接列在姓名下面(不是評價,只是提醒多看一眼)</span></div>' +
      '<div class="overflow-x-auto rounded-xl bg-white border border-slate-200 p-3"><table class="w-full text-sm text-center"><thead><tr class="text-xs text-slate-500">' + SORT_COLS.map(sortTh).join('') + '<th></th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  /* ---------- 分頁 3:反思與計畫紀錄(質性資料) ---------- */
  function visibleEntries(D) {
    var out = [];
    D.rows.forEach(function (r) {
      if (UI.stu !== 'all' && r.u.id !== UI.stu) return;
      r.E.forEach(function (e) {
        if (e.kind === 'reeval') return;                 // 再評估放在對應的計畫底下
        if (UI.kind !== 'all' && e.kind !== UI.kind) return;
        out.push({ e: e, r: r });
      });
    });
    out.sort(function (a, b) { return (b.e.ts || 0) - (a.e.ts || 0); });
    return out;
  }
  function entryCard(x) {
    var e = x.e, r = x.r, d = KBAsra.describe(e), extra = '';
    if (e.kind === 'plan') {
      var p = r.S.plans.filter(function (q) { return q.id === e.id; })[0], f = p && p._f;
      extra = (f ? '<div class="text-xs text-slate-600 mt-1">計畫之後:<b>' + f.mine + '</b> 則新貼文、<b>' + f.replies + '</b> 則同學新回應、<b>' + f.evid + '</b> 則有寫證據 ' + (f.acted ? pill('有行動', 'bg-emerald-100 text-emerald-700') : pill('還沒看到行動', 'bg-slate-100 text-slate-500')) + '</div>' : '') +
        (p && p.reeval.length ? '<div class="mt-1 space-y-0.5">' + p.reeval.map(function (q) { return '<div class="text-xs text-slate-600">↳ ' + KBAsra.fmtTime(q.ts) + ' 再評估:' + (q.result === 'better' ? pill('變好了', 'bg-emerald-100 text-emerald-700') : pill('還要再努力', 'bg-amber-100 text-amber-700')) + (q.follow ? ' <span class="text-slate-400">(當時新貼文 ' + q.follow.mine + '、新回應 ' + q.follow.replies + ')</span>' : '') + (q.note ? ' <span class="text-slate-700">「' + esc(cut(q.note, 80)) + '」</span>' : '') + '</div>'; }).join('') + '</div>' : '');
    }
    return '<div class="py-3 border-t border-slate-100 flex gap-3"><div class="w-32 shrink-0 text-xs text-slate-500"><div class="font-bold text-slate-700">' + d.time + '</div></div><div class="min-w-0 flex-1">' +
      '<div class="flex flex-wrap items-center gap-2"><span class="font-bold text-slate-800">' + nameOf(r) + '</span>' + pill(d.label + (d.act ? ':' + d.act : ''), KCOL[e.kind] || '') + (e.ideaStatus ? pill('當時:' + (SNAME[e.ideaStatus] || e.ideaStatus), 'bg-slate-100 text-slate-500') : '') + (e._open ? pill('草稿(學生還沒按存下)', 'bg-amber-50 text-amber-700 border border-amber-100') : '') + (e._versions > 1 ? pill('共 ' + e._versions + ' 個版本', 'bg-slate-100 text-slate-500') : '') + (d.src ? pill('想法來源:' + esc(d.src), 'bg-violet-50 text-violet-700 border border-violet-100') : '') + (d.view ? pill('時間方式:' + esc(d.view), 'bg-sky-50 text-sky-700 border border-sky-100') : '') + '</div>' +
      (d.idea ? '<div class="text-xs text-slate-500 mt-0.5">想法:' + esc(cut(d.idea, 40)) + (d.topic ? ' · ' + esc(cut(d.topic, 16)) : '') + '</div>' : '') +
      '<div class="text-sm text-slate-800 whitespace-pre-wrap mt-1">' + esc(d.text) + '</div>' + (d.q5 ? '<div class="text-xs text-slate-600 mt-1">想深化(第 5 題):' + esc(d.q5) + '</div>' : '') + extra + '</div></div>';
  }
  function tabLog(D) {
    var list = visibleEntries(D), shown = list.slice(0, UI.limit);
    var opts = '<option value="all">全部學生</option>' + D.rows.slice().sort(function (a, b) { return a.u.name < b.u.name ? -1 : 1; }).map(function (r) { return '<option value="' + esc(r.u.id) + '"' + (UI.stu === r.u.id ? ' selected' : '') + '>' + esc(r.u.name) + (r.E.length ? '(' + r.E.length + ')' : '') + '</option>'; }).join('');
    var kinds = [['all', '全部'], ['refl', '反思'], ['plan', '計畫'], ['note', '一句話'], ['concept', '概念追問']].map(function (k) { return '<option value="' + k[0] + '"' + (UI.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('');
    return '<div class="flex flex-wrap items-center gap-2 mb-2"><select data-act="stu" class="border border-slate-300 rounded-lg px-2 py-1 text-sm">' + opts + '</select><select data-act="kind" class="border border-slate-300 rounded-lg px-2 py-1 text-sm">' + kinds + '</select><span class="text-xs text-slate-500">共 ' + list.length + ' 筆(新的在上面);每筆都留著原本的日期時間,不會被改掉。</span></div>' +
      '<div class="rounded-xl bg-white border border-slate-200 px-4">' + (shown.map(entryCard).join('') || '<p class="py-6 text-center text-slate-400 text-sm">還沒有符合的紀錄。學生在 ASRA 頁寫下反思或計畫後,會出現在這裡。</p>') + '</div>' +
      (list.length > shown.length ? '<div class="text-center mt-3"><button type="button" data-act="more" class="px-4 py-1.5 rounded-full bg-slate-200 hover:bg-slate-300 text-sm font-bold text-slate-700">再看 ' + Math.min(40, list.length - shown.length) + ' 筆</button></div>' : '');
  }

  /* ---------- 分頁 4:指標說明與匯出 ---------- */
  function tabMethod(D) {
    var rows = [
      ['貼文類型分布(提問/延伸/改進/反例/昇華)', '國際研究常把貼文編碼成「認知動作/討論動作」(例:提問、想法、改進想法、進一步提問、論證、整合),再用 ONA 看動作之間的先後轉換。', '我們只有 5 種貼文類型,是粗略的近似。老師分析的「言談序列轉移」「鷹架回應模式」可以看「回應某一類貼文時,接著常用哪一類」(以百分比呈現),但還沒有 ONA 那樣的統計檢定與網絡圖;學生端沒有這項。'],
      ['回應別人 / 被回應 / 夥伴數', '社會網絡分析(SNA)的「誰回應誰」:入度、出度、接近中心性。', '老師分析已算「中介中心性」(知識經紀人),並畫出互動圈與誰回應誰;接近中心性還沒有。學生端只呈現互動圈與次數。平台有記錄「學生點開看過哪些貼文」(從開始記錄後才有),目前只統計篇數,還沒畫成「誰讀了誰」的閱讀網絡。'],
      ['想法狀態(有證據/待查證/在發展/等回應)', '有潛力的想法(promising ideas)、想法改進(idea improvement)。', '用關鍵字比對「實驗、觀察、資料…」判斷證據,是規則式近似,不是人工編碼,可能誤判。國際研究的「潛力想法」是由學生自己評選,平台目前沒有學生評選功能,所以這裡只是近似。'],
      ['反思文字(含日期時間)', '反思單與訪談的質性編碼:後設認知、調節、認知主體性。', '這裡提供原文與日期,編碼要由研究者人工做;可匯出 CSV。'],
      ['核心 / 邊緣概念追問', '概念網絡裡,中心的節點是討論的焦點,邊緣的節點可能是被忽略、還沒發展、或關係不大的方向(Yang 等人 2026 圖 7 教師引導全班這樣讀圖);學生要自己解釋為什麼。', '平台的核心/邊緣是簡單規則(連到的詞數前 25% 且至少 3 個為核心;只連 0~1 個為邊緣;雲裡要有 5 個以上的詞),詞是自動從貼文抓出來的,可能抓不準。「在中間」不代表比較重要或比較正確。這裡記下學生自己的解釋,沒有判斷對錯。'],
      ['計畫 → 行動 → 再評估', '自我調整與持續改進:反思之後有沒有真的行動、結果有沒有變好。', '每次再評估會一併記下當時計畫後的新貼文與新回應數,可追蹤個人層級的前後變化。「計畫→行動→想法前進」分頁再多比較「訂計畫當時」和「現在」想法的狀態,分成四種結果;但想法前進只是「可能」與計畫有關,也可能是同學自己回應的。'],
      ['學習單自評、前後測(「我給自己的評分」)', '形成性自評(self-assessment):讓學生看自己的評分,再跟想法、證據一起想。前後測為各循環一次的問卷平均。', '這些分數是研究者整理後匯入的資料包,不是平台自己施測;只放個人原始平均,不做檢定。詳見下方「我給自己的評分有哪些項目?」。'],
      ['尚未收集', '認知情緒問卷、認知主體性問卷。', '目前平台沒有這些資料;若要做研究,需另外施測再合併。']
    ];
    var aim = [
      ['讓學生自己用資料想一想', '分析工具常常是研究者在看;這裡讓學生自己看自己的貼文與回應,再寫下反思。'],
      ['想的不只是「說了什麼」', '也看想法有沒有證據、有沒有被回應、有沒有越改越好。'],
      ['老師看得到全班,也看得到個人', '全班總覽找出誰需要多關心;個別紀錄可以看到一個人一路的變化。'],
      ['把「反思 → 計畫 → 行動 → 結果」連起來', '每次存下都有日期;計畫之後有沒有新貼文、有沒有被回應,都會記下來。'],
      ['不綁定特定軟體', '用我們自己的討論平台就能做,不需要另外的分析工具。'],
      ['國小學生看得懂的說法', '用「看看走過的路」這類說法,不用專有名詞。']
    ];
    var scaleHtml = global.KBSrc && KBSrc.scaleHelp ? '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4" id="asra-scale-help"><h4 class="font-black text-slate-800 mb-2"><i class="fas fa-chart-simple text-indigo-500 mr-1"></i>「我給自己的評分」有哪些項目?怎麼算出來的?</h4>' + KBSrc.scaleHelp(true) + '</section>' : '';
    var aimHtml = '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800 mb-2">這個設計想補什麼?</h4><ul class="list-disc pl-5 text-sm text-slate-700 space-y-1">' + aim.map(function (a) { return '<li><b>' + a[0] + '</b>:' + a[1] + '</li>'; }).join('') + '</ul><p class="text-xs text-slate-400 mt-2">這是設計的方向,不是已經證明有效。效果要靠實際使用的資料來檢驗。</p></section>';
    var qsHtml = '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800 mb-1">學生的六個反思題(三個階段)</h4><p class="text-xs text-slate-500 mb-2">改寫自國際研究使用的反思單(Yang 等人,2026,附錄 B),把題目換成國小學生看得懂的說法,並放進本平台的五個步驟。原研究的對象是大學職前教師、以小組為單位,反思單是請學生看 KBDeX 的「累積度中心性曲線」與「關鍵詞網絡圖」來回答;本平台沒有那兩張圖,改用「哪幾天有發言」與想法清單當依據,而且是個人填寫。這個改寫還沒有驗證過成效。</p><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-xs text-slate-500 text-left"><th class="pb-2 pr-3">階段</th><th class="pb-2 pr-3">學生看到的題目</th><th class="pb-2 pr-3">在第幾步</th><th class="pb-2">原研究的題目(意譯)</th></tr></thead><tbody>' +
      ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map(function (k) { var q = KBAsra.QS[k], ph = KBAsra.PHASE[q.phase]; return '<tr class="border-t border-slate-100 align-top"><td class="py-2 pr-3 text-xs font-bold text-slate-600 whitespace-nowrap">' + ph[0] + '<br><span class="text-slate-400">' + ph[1] + '</span></td><td class="py-2 pr-3 font-bold text-slate-800">第 ' + q.no + ' 題 ' + esc(q.zh) + '</td><td class="py-2 pr-3 text-slate-600 whitespace-nowrap">第 ' + q.step + ' 步</td><td class="py-2 text-slate-500">' + esc(q.orig) + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
    var need = [
      '沒有發過貼文;或距離全班最新發言已 7 天以上',
      '貼文 3 則以上,但從來沒有回應過同學;或同學都沒有回應過他',
      '想法 3 個以上,且 80% 以上沒有寫證據',
      '有計畫訂了超過 3 天,之後沒有新貼文或新回應',
      '最近一次再評估選的是「還要再努力」'
    ];
    return scaleHtml + '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800 mb-1">匯出給研究用(CSV,可用 Excel 開啟)</h4><p class="text-xs text-slate-500 mb-3">包含日期時間、學號、姓名、班級、類型、想法標題、內容、做法、再評估結果與計畫後的行動數。檔案只存在你的電腦,不會上傳。</p>' +
      '<div class="flex flex-wrap gap-2"><button type="button" data-act="csv" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold"><i class="fas fa-download mr-1"></i>匯出目前範圍的全部紀錄</button><span class="text-xs text-slate-500 self-center">範圍:' + (UI.stu === 'all' ? '目前畫面上的全部學生' : '只有選取的學生(到「反思與計畫紀錄」分頁選)') + '</span></div></section>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800 mb-2">每個指標對應哪些國際研究的概念?<span class="ml-2 text-xs font-bold text-slate-400">與限制</span></h4><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-xs text-slate-500 text-left"><th class="pb-2 pr-3">本平台指標</th><th class="pb-2 pr-3">研究裡的對應概念</th><th class="pb-2">目前的限制</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr class="border-t border-slate-100 align-top"><td class="py-2 pr-3 font-bold text-slate-800">' + r[0] + '</td><td class="py-2 pr-3 text-slate-600">' + r[1] + '</td><td class="py-2 text-slate-500">' + r[2] + '</td></tr>'; }).join('') + '</tbody></table></div></section>' + qsHtml + aimHtml +
      '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800 mb-2">「建議多關心」的判斷規則</h4><ul class="list-disc pl-5 text-sm text-slate-700 space-y-1">' + need.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul><p class="text-xs text-slate-400 mt-2">這些只是提醒老師多看一眼,不是對學生的評價。</p></section>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800 mb-1">資料怎麼保存?</h4><p class="text-sm text-slate-600">學生每按一次「存下」就新增一筆紀錄,舊的紀錄不會被覆蓋或刪除(資料庫規則也會擋住修改與刪除)。所以同一位學生對同一個想法的反思,可以看到一次比一次的變化。</p></section>';
  }

  /* ---------- 🤖 AI 解說:給 AI 的資料只有數字與代號(S01…),姓名不會傳出去 ---------- */
  function aiCode(u) {
    var id = global.__kbIdent; if (!id && typeof global.kbAiIdent === 'function' && UI.D) { var ul = {}; UI.D.rows.forEach(function (r) { ul[r.u.id] = { id: r.u.id, name: r.u.name, role: 'student' }; }); id = global.kbAiIdent(ul); }
    return (id && id.codeOf && id.codeOf[String(u.id)]) || '某位同學';
  }
  function aiTables(D) {
    var T = D.T, NL = String.fromCharCode(10), p = function (a, b) { return pct(a, b) + '%'; };
    return {
      funnel: function () {
        return ['全班學生 ' + T.students + ' 人(目前範圍)。ASRA 五步驟「監控 → 反思 → 調整 → 再評估」,各步驟做到的人數(越往後越少,代表卡在那一步):',
          '- 有發過貼文:' + T.usersPost + ' 人', '- 寫過反思:' + T.usersRefl + ' 人(共 ' + T.refl + ' 篇)', '- 訂過計畫:' + T.usersPlan + ' 人(共 ' + T.plans + ' 個計畫)',
          '- 做過再評估:' + T.usersRe + ' 人(共 ' + T.reeval + ' 次)', '- 回報「變好了」:' + T.usersBetter + ' 人(' + T.better + ' / ' + T.reeval + ' 次再評估,' + p(T.better, T.reeval) + ')',
          '- 使用過 ASRA(寫過任何一筆紀錄):' + T.users + ' 人,占全班 ' + p(T.users, T.students),
          '- 計畫之後看得到新貼文或新回應的:' + T.planActed + ' / ' + T.plans + ' 個(' + p(T.planActed, T.plans) + ');另有 ' + T.planOld + ' 個計畫訂了超過 3 天還沒看到新行動'].join(NL);
      },
      types: function () {
        var rows = ASRA.TYPES.map(function (t) { return '- ' + ASRA.TNAME[t] + ':' + D.types[t] + ' 則(' + p(D.types[t], T.posts) + ')'; });
        return ['全班論壇貼文共 ' + T.posts + ' 則,依學生發文時自己選的類型分布(近似「認知動作」,不是人工編碼):'].concat(rows, ['「改進」+「昇華」合計 ' + D.improve + ' 則,占 ' + p(D.improve, T.posts) + '(越高代表越常把想法變得更好、把大家的想法合起來)。']).join(NL);
      },
      ideas: function () {
        return ['全班共 ' + D.ideas + ' 個想法;其中 ' + D.ideasEvid + ' 個(' + p(D.ideasEvid, D.ideas) + ')作者自己寫了證據(用「實驗、觀察、資料」等關鍵字判斷,可能誤判)。',
          '想法目前的狀態:', '- 有證據:' + D.status.ok + ' 個(' + p(D.status.ok, D.ideas) + ')', '- 在發展(後來有人改進或整合):' + D.status.grow + ' 個(' + p(D.status.grow, D.ideas) + ')',
          '- 待查證:' + D.status.check + ' 個(' + p(D.status.check, D.ideas) + ')', '- 等同學回應:' + D.status.wait + ' 個(' + p(D.status.wait, D.ideas) + ')'].join(NL);
      },
      tips: function () {
        return ['系統依上面的數字自動整理出的教學小建議(共 ' + D.tips.length + ' 條):'].concat(D.tips.length ? D.tips.map(function (t, i) { return (i + 1) + '. ' + t; }) : ['目前沒有觸發任何建議(資料還不夠多,或各項指標都在合理範圍)。'],
          ['背景:全班 ' + T.students + ' 人、論壇貼文 ' + T.posts + ' 則、反思 ' + T.refl + ' 篇、計畫 ' + T.plans + ' 個。']).join(NL);
      },
      attention: function () {
        var list = D.attention.slice(0, 12).map(function (r) { return '- ' + aiCode(r.u) + ':' + r.reasons.join(';'); });
        return ['系統用規則挑出「這週建議多關心」的學生共 ' + D.attention.length + ' 位(全班 ' + T.students + ' 人),下面列出前 ' + Math.min(12, D.attention.length) + ' 位。',
          '判斷規則:沒發過貼文或 7 天沒發言;貼文 3 則以上卻沒回應過同學或沒人回應他;想法 3 個以上且 80% 沒寫證據;計畫訂了超過 3 天沒有新行動;最近一次再評估是「還要再努力」。這只是提醒老師多看一眼,不是對學生的評價。']
          .concat(list.length ? list : ['(目前沒有需要特別關心的學生)']).join(NL);
      }
    };
  }

  /* ---------- 每個分頁:AI 白話說明 + 理論依據與期刊 ---------- */
  function refsBox(key) { return global.KBAsraRefs ? KBAsraRefs.box(key) : ''; }
  var AI_TABS = { class: '全班總覽(整頁)', students: '學生一覽', effect: '計畫→行動→想法前進', src: '學習單資料', log: '反思與計畫紀錄' };
  function extras(tab, html) {
    var add = '';
    if (AI_TABS[tab]) add += '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800"><i class="fas fa-robot text-violet-500 mr-1"></i>AI 白話說明<span class="ml-2 text-xs font-bold text-slate-400">用自然的語言,說明這一頁最重要的訊息(只送數字與代號,不送姓名)</span></h4><div data-ai="' + tab + '" style="display:none;gap:8px;align-items:center;flex-wrap:wrap" class="my-2"></div>' + (tab === 'class' ? '' : refsBox(tab)) + '</section>';
    else if (tab === 'push') add += '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4">' + refsBox('push') + '</section>';
    else if (tab === 'method' && global.KBAsraRefs) add += KBAsraRefs.all();
    return html + add;
  }
  function aiTables2(D) {
    var NL = String.fromCharCode(10), T = D.T, rows = D.rows, n = rows.length, p = function (a, b) { return pct(a, b) + '%'; };
    var avg = function (f) { return n ? (rows.reduce(function (a, r) { return a + f(r); }, 0) / n).toFixed(1) : '0'; };
    return {
      students: function () {
        var po = rows.map(function (r) { return r.A.posts; }).sort(function (a, b) { return a - b; }), med = po.length ? po[Math.floor(po.length / 2)] : 0;
        var top = rows.slice().sort(function (a, b) { return b.A.posts - a.A.posts; }).slice(0, 3).map(function (r) { return aiCode(r.u) + '(' + r.A.posts + ' 則)'; }).join('、');
        var low = rows.slice().sort(function (a, b) { return a.A.posts - b.A.posts; }).slice(0, 3).map(function (r) { return aiCode(r.u) + '(' + r.A.posts + ' 則)'; }).join('、');
        return ['學生一覽(目前範圍 ' + n + ' 位學生):',
          '- 論壇貼文數:最少 ' + (po[0] || 0) + '、中位數 ' + med + '、最多 ' + (po[po.length - 1] || 0) + ' 則;沒發過貼文的有 ' + rows.filter(function (r) { return !r.A.posts; }).length + ' 位',
          '- 平均每人回應別人 ' + avg(function (r) { return r.A.given; }) + ' 則、被回應 ' + avg(function (r) { return r.A.received; }) + ' 則、互動夥伴 ' + avg(function (r) { return r.A.partners; }) + ' 位',
          '- 發言最多的三位:' + (top || '無') + ';最少的三位:' + (low || '無'),
          '- 寫過反思 ' + T.usersRefl + ' 位、訂過計畫 ' + T.usersPlan + ' 位、做過再評估 ' + T.usersRe + ' 位',
          '- 貼文 3 則以上卻沒人回應的學生 ' + rows.filter(function (r) { return r.A.posts >= 3 && r.A.received === 0; }).length + ' 位;系統建議多關心的 ' + D.attention.length + ' 位'].join(NL);
      },
      effect: function () {
        var E = D.eff, N = D.plansAll.length, ps = pushStats(D), OUT = ASRA.OUT;
        return ['計畫 → 行動 → 想法前進(目前範圍共 ' + N + ' 個計畫):'].concat(['acted_adv', 'acted_same', 'idle_adv', 'idle_same', 'offforum', 'unknown'].map(function (k) { return '- ' + OUT[k].name + ':' + E[k] + ' 個(' + p(E[k], N) + ')'; }),
          ['想法的狀態是依規則推出來的(等同學回應 → 待查證 → 有證據 → 在發展),「想法前進」不一定是這個計畫造成的(可能是同學自己回應)。',
            '計畫訂了超過 3 天還沒看到新行動的:' + T.planOld + ' 個;用過「推進建議」訂的計畫:' + (ps.local + ps.ai) + ' 個(其中 AI 助教排的 ' + ps.ai + ' 個)']).join(NL);
      },
      src: function () {
        var K = global.KBSrc, sm = K && K.summary ? K.summary() : null;
        if (!sm) return '目前這台電腦的瀏覽器裡沒有匯入學習單資料包,所以「學習單想法、前後對照、自評與前後測」都沒有資料。';
        var have = rows.filter(function (r) { return K.has(r.u.id); }).length, cats = Object.keys(sm.cat).map(function (k) { return '- ' + (K.CATS[k] ? K.CATS[k].name : k) + ':' + sm.cat[k] + ' 則'; });
        return ['學習單資料包(研究者整理好的原話):' + sm.packs + ' 個資料包,共 ' + sm.students + ' 位學生、' + sm.records + ' 則回答、' + sm.questions + ' 種題目;目前範圍的 ' + n + ' 位學生裡有 ' + have + ' 位有資料。',
          '回答依題目性質分成這幾類(Q3~Q6 對照是系統先擬的,尚未逐題由研究者確認):'].concat(cats, ['老師自己列的關鍵想法線:' + sm.threads + ' 條(沒列時系統會自動找出來)。']).join(NL);
      },
      log: function () {
        var kinds = { note: 0, refl: 0, plan: 0, reeval: 0, concept: 0, idea: 0 }, KN = { note: '一句話/題目回答', refl: '反思', plan: '計畫', reeval: '再評估', concept: '概念追問', idea: '自己新增的想法' }, now = Date.now(), week = 0, users = 0, last = 0;
        rows.forEach(function (r) { if (r.E.length) users++; r.E.forEach(function (e) { if (kinds[e.kind] !== undefined) kinds[e.kind]++; if (now - e.ts < 7 * DAY) week++; if (e.ts > last) last = e.ts; }); });
        return ['反思與計畫紀錄(目前範圍 ' + n + ' 位學生,每一筆都有日期時間,只增不改):', '- 有留下紀錄的學生 ' + users + ' 位;最近 7 天新增 ' + week + ' 筆;最近一筆是 ' + (last ? fmtDT(last) : '(還沒有)')].concat(Object.keys(kinds).map(function (k) { return '- ' + KN[k] + ':' + kinds[k] + ' 筆'; })).join(NL);
      },
      class: function () {
        var tb = aiTables(D); return ['全班總覽的五個區塊(下面每一段是一個區塊):'].concat(['funnel', 'types', 'ideas', 'tips', 'attention'].map(function (k) { return '【' + { funnel: 'ASRA 走到哪一步', types: '大家在做哪些思考', ideas: '想法走多遠了', tips: '教學小建議', attention: '這週建議多關心' }[k] + '】' + NL + tb[k](); })).join(NL + NL);
      },
      push: function () { return pushAiTable(D); }
    };
  }
  function wireAi(D) {
    if (typeof global.kbAddExplain !== 'function') return;
    var tb = Object.assign({}, aiTables(D), aiTables2(D));
    var defs = {
      class: [['funnel', 'ASRA 走到哪一步'], ['types', '大家在做哪些思考'], ['ideas', '想法走多遠了'], ['tips', '教學小建議'], ['attention', '這週建議多關心'], ['class', '全班總覽(整頁)']],
      students: [['students', '學生一覽']], effect: [['effect', '計畫→行動→想法前進']], src: [['src', '學習單資料']], log: [['log', '反思與計畫紀錄']],
      push: [['push', '想法推進:卡住的想法與可以怎麼推一把']]
    }[UI.tab] || [];
    defs.forEach(function (d) {
      var wrap = UI.root.querySelector('[data-ai="' + d[0] + '"]'); if (!wrap || !tb[d[0]]) return;
      wrap.style.display = 'flex';
      global.kbAddExplain(wrap, { title: 'ASRA 反思歷程:' + d[1], table: tb[d[0]], label: d[0] === 'class' ? '🤖 請 AI 說明整頁' : '🤖 AI 解說', kind: 'snapshot' }, 'asra-' + d[0]);
    });
  }


  /* ---------- 分頁:想法推進(PUSH)— 哪些想法卡住了、可以怎麼推一把;學生在 ASRA 第 4 步可請 AI 助教排計畫 ---------- */
  var PUSH_KIND = {
    idle: { name: '訂了計畫還沒開始', cls: 'bg-rose-100 text-rose-700' },
    same: { name: '做了但想法沒前進', cls: 'bg-amber-100 text-amber-700' },
    noplan: { name: '想法還沒有下一步', cls: 'bg-sky-100 text-sky-700' }
  };
  function pushItems(D) {
    var now = Date.now(), items = [], K = global.KBPush;
    D.rows.forEach(function (r) {
      var planFor = {}; r.S.plans.forEach(function (p) { (planFor[p.postId] = planFor[p.postId] || []).push(p); });
      r.S.plans.forEach(function (p) {
        var e = p._e; if (!e || p.open) return;
        if (e.outcome === 'idle_same' && now - p.ts >= 3 * DAY) items.push({ r: r, kind: 'idle', rank: 0, title: p.ideaTitle || '(想法)', plan: p, status: e.now, info: { src: 'forum', title: p.ideaTitle, status: e.now || 'wait' } });
        else if (e.outcome === 'acted_same') items.push({ r: r, kind: 'same', rank: 1, title: p.ideaTitle || '(想法)', plan: p, status: e.now, info: { src: 'forum', title: p.ideaTitle, status: e.now || 'check', ownEvid: e.now === 'ok' || e.now === 'grow' } });
      });
      r.A.ideas.forEach(function (i) {
        if ((i.status === 'wait' || i.status === 'check') && !planFor[i.id]) items.push({ r: r, kind: 'noplan', rank: i.status === 'check' ? 2 : 3, title: i.title, status: i.status, info: { src: 'forum', title: i.title, status: i.status, replies: i.replies, diff: i.diff, ownEvid: i.ownEvid } });
      });
    });
    items.sort(function (a, b) { return a.rank - b.rank || String(a.r.u.name).localeCompare(String(b.r.u.name), 'zh-Hant', { numeric: true }); });
    items.forEach(function (it) {
      var list = K.local(it.info), pick = it.kind === 'same' && it.plan ? (list.filter(function (x) { return x.act !== it.plan.act; })[0] || list[0]) : list[0];
      it.sug = pick;
    });
    return items;
  }
  function pushStats(D) {
    var st = { ai: 0, local: 0, edited: 0, better: 0, re: 0, plans: 0 };
    D.rows.forEach(function (r) { r.S.plans.forEach(function (p) {
      st.plans++; if (!p.push) return;
      if (p.push.from === 'ai') st.ai++; else st.local++; if (p.push.edited) st.edited++;
      var re = p.reeval && p.reeval.length ? p.reeval[p.reeval.length - 1].result : ''; if (re) { st.re++; if (re === 'better') st.better++; }
    }); });
    return st;
  }
  function tabPush(D) {
    var K = global.KBPush; if (!K) return '<section class="rounded-xl bg-white border border-slate-200 p-5 text-sm text-slate-500">想法推進模組(kb-asra-push.js)沒有載入。</section>';
    var items = pushItems(D), st = pushStats(D), people = {}; items.forEach(function (it) { people[it.r.u.id] = 1; });
    var per = {}, listed = items.filter(function (it) { var k = it.r.u.id; per[k] = (per[k] || 0) + 1; return per[k] <= 2; });   // 每位學生最多列 2 個(最需要處理的),才看得到更多學生
    var shown = listed.slice(0, UI.pushLimit || 30);
    var tiles = '<div class="grid grid-cols-2 md:grid-cols-4 gap-3">' + tile(items.length, '卡住的想法', '分布在 ' + Object.keys(people).length + ' 位學生;下面每位學生最多列 2 個最需要處理的', 'bg-white border-slate-200') +
      tile(st.local + st.ai, '用了「推進建議」的計畫', '占全部 ' + st.plans + ' 個計畫的 ' + pct(st.local + st.ai, st.plans) + '%', 'bg-violet-50 border-violet-200') +
      tile(st.ai, '其中 AI 助教排的', '學生自己改過的有 ' + st.edited + ' 個', 'bg-white border-slate-200') +
      tile(st.re ? pct(st.better, st.re) + '%' : '—', '推進後回報「變好了」', st.re ? st.better + ' / ' + st.re + ' 次再評估' : '還沒有再評估', 'bg-emerald-50 border-emerald-200') + '</div>';
    var list = shown.map(function (it) {
      var k = PUSH_KIND[it.kind], s = it.sug, A = K.acts[s.act];
      var why = it.kind === 'idle' ? '計畫:' + esc(cut(it.plan.text, 40)) + '(訂了 ' + Math.floor((Date.now() - it.plan.ts) / DAY) + ' 天)。先請他做第一步。' : it.kind === 'same' ? '上次選「' + esc(K.acts[it.plan.act] || it.plan.act) + '」,想法沒前進,可以換個方向試試。' : (it.status === 'wait' ? '這個想法還沒有人回應。' : '有人回應了,但還看不到證據。');
      return '<div class="flex flex-wrap items-start gap-3 py-3 border-t border-slate-100"><div class="w-36 shrink-0 font-bold text-slate-800">' + nameOf(it.r) + '</div><div class="flex-1 min-w-[15rem]">' +
        '<div class="text-sm font-bold text-indigo-700">想法:' + esc(cut(it.title, 28)) + '</div><div class="mt-1">' + pill(k.name, k.cls) + ' <span class="text-xs text-slate-500">' + why + '</span></div>' +
        '<div class="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 mt-2 text-sm"><b class="text-violet-800">🚀 建議這樣推:' + esc(A) + ' — ' + esc(s.title) + '</b><ol class="list-decimal pl-5 text-xs text-slate-600 mt-1">' + s.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol><div class="text-[11px] text-slate-500 mt-1">為什麼:' + esc(s.why) + '</div></div></div>' +
        '<div class="w-40 shrink-0 text-right"><a href="' + asraHref(it.r.u.id) + '" target="_blank" rel="noopener" class="text-xs font-bold text-indigo-600 underline">打開他的 ASRA ↗</a></div></div>';
    }).join('');
    return tiles + '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800"><i class="fas fa-rocket text-violet-500 mr-1"></i>想法推進 <span class="ml-2 text-xs font-bold text-slate-400">讓想法繼續往前走</span></h4>' +
      '<p class="text-xs text-slate-500 mt-1">系統從論壇回應、證據、計畫與再評估,找出<b>卡住</b>的想法,並依資料排出建議的下一步(補證據、改想法、找夥伴)。學生在 ASRA 第 4 步也能看到這類建議,還可以請 AI 助教看他的論壇、學習單與自己新增的想法來排計畫,由學生自己挑、自己改。</p>' +
      '<div data-ai="push" style="display:none;gap:8px;align-items:center;flex-wrap:wrap" class="my-2"></div>' +
      (items.length ? list + (listed.length > shown.length ? '<button type="button" data-act="pushmore" class="mt-3 w-full text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg py-2">再看 ' + Math.min(30, listed.length - shown.length) + ' 個(共 ' + listed.length + ' 個)</button>' : '') : '<p class="text-sm text-slate-500 py-3">目前沒有看到卡住的想法。(想法等同學回應、待查證、或計畫還沒行動時才會出現。)</p>') + '</section>';
  }
  function pushAiTable(D) {
    var items = pushItems(D), K = global.KBPush, st = pushStats(D), NL = String.fromCharCode(10);
    var lines = items.slice(0, 15).map(function (it) { return '- ' + aiCode(it.r.u) + ':想法「' + cut(it.title, 20) + '」,' + PUSH_KIND[it.kind].name + ';系統建議「' + K.acts[it.sug.act] + '」(' + it.sug.title + ')'; });
    var t = ['全班卡住的想法共 ' + items.length + ' 個(判斷:想法等同學回應或待查證且沒有計畫;計畫訂了超過 3 天沒行動;行動後想法沒前進),下面列出前 ' + Math.min(15, items.length) + ' 個。',
      '學生用了「推進建議」訂計畫:' + (st.local + st.ai) + ' / ' + st.plans + ' 個(AI 助教排的 ' + st.ai + ' 個、自己改過 ' + st.edited + ' 個);推進後回報「變好了」' + st.better + ' / ' + st.re + ' 次。'].concat(lines.length ? lines : ['(目前沒有卡住的想法)']).join(NL);
    return global.kbAiScrub ? global.kbAiScrub(t) : t;
  }

  /* ---------- 分頁:學習單資料(多來源想法) ---------- */
  function threadsToText(list) { return (list || []).map(function (t) { return (t.group || 'ALL') + '|' + t.title + '|' + (t.kw || []).join(','); }).join('\n'); }
  function parseThreads(txt) {
    var out = []; String(txt || '').split(/\r?\n/).forEach(function (ln, i) {
      ln = ln.replace(/\uFF5C/g, '|').replace(/^[\s\-*>`\d.、)]+/, '').replace(/`/g, '').trim(); if (!ln) return; var p = ln.split('|'); if (p.length < 3) return;
      var kw = p[2].split(/[,，、]/).map(function (x) { return x.trim(); }).filter(Boolean); if (!p[1].trim() || !kw.length) return;
      out.push({ id: 't' + (i + 1), group: (p[0].trim() === '' || p[0].trim() === '全部') ? 'ALL' : p[0].trim().toUpperCase(), title: p[1].trim(), kw: kw });
    });
    return out;
  }
  // 關鍵想法線:老師可自己列;不列的話,學生端自動用「系統從回答裡找出的關鍵想法」
  function threadsSection(K) {
    var draft = UI.thrDraft != null ? UI.thrDraft : threadsToText(K.load().threads), mine = (K.load().threads || []).length;
    var groups = K.groupsInPack(), prev = groups.map(function (g) {
      var a = K.autoThreads(g, 5);
      return '<div class="flex flex-wrap items-center gap-1.5 py-1 border-t border-slate-100"><span class="w-10 shrink-0 font-bold text-slate-700 text-sm">' + esc(g) + '</span>' + (a.length ? a.map(function (t) { return '<span class="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100" title="出現 ' + t.df + ' 次、跨 ' + t.stages + ' 個階段、' + t.students + ' 位同學">' + esc(t.title) + '</span>'; }).join('') : '<span class="text-xs text-slate-400">沒有找到</span>') + '</div>';
    }).join('');
    return '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800">關鍵想法線<span class="ml-2 text-xs font-bold text-slate-400">想法卡的第 4 種單位</span></h4>' +
      '<p class="text-xs text-slate-500 mt-1">把各階段提到同一個想法的回答串在一起,讓學生用「前後對照」看它怎麼長大。<b>你不用先列清單</b>:' + (mine ? '目前使用你建立的 ' + mine + ' 條。' : '你還沒建立時,學生端會自動使用下面「系統找到的」關鍵想法。') + '</p>' +
      '<div class="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2"><div class="text-xs font-bold text-slate-600 mb-1">系統從學習單回答裡找到的(每組前幾名;滑鼠移上去看出現次數)</div>' + (prev || '<span class="text-xs text-slate-400">資料包裡沒有學生。</span>') + '<p class="text-[11px] text-slate-400 mt-1">依「在多個階段、被多位同學提到、不是每組都在講」找出,不需要 AI。偶爾會夾雜一般用語,可以自己刪掉。</p></div>' +
      '<div class="flex flex-wrap items-center gap-2 mt-3"><button type="button" data-act="src-suggest" class="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold"><i class="fas fa-wand-magic-sparkles mr-1"></i>讓系統建議(填進下面)</button><button type="button" data-act="src-ai" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold"><i class="fas fa-robot mr-1"></i>請 AI 整理</button><span class="text-xs ' + (UI.thrBad ? 'text-rose-600' : 'text-slate-500') + '">' + esc(UI.thrMsg || '') + '</span></div>' +
      '<p class="text-[11px] text-slate-400 mt-1">「請 AI 整理」只會把<b>詞和出現次數</b>送給 AI(請它挑選、合併相近的詞),不會送學生的原話或姓名。</p>' +
      '<p class="text-xs text-slate-500 mt-3 mb-1">想自己列或修改:每行一個 <code>組別|想法名稱|關鍵字,關鍵字</code>(組別寫 G1~G5,全部組別寫「全部」)。按「儲存想法線」後,學生端就改用你列的。</p>' +
      '<textarea data-k="threads" rows="5" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="例如:G3|多模態整合|多模態,整合,熱顯影">' + esc(draft) + '</textarea><div class="mt-2 flex flex-wrap gap-2"><button type="button" data-act="src-threads" class="px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold">儲存想法線</button>' + (mine ? '<button type="button" data-act="src-threads-clear" class="px-4 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 text-sm font-bold border border-slate-300">不用我的,改用系統自動找的</button>' : '') + '</div></section>';
  }
  function tabSrc(D) {
    var K = global.KBSrc; if (!K) return '<p class="text-sm text-slate-500">學習單資料模組沒有載入。</p>';
    var S = K.summary(), msg = UI.srcMsg ? '<span class="text-xs font-bold ' + (UI.srcMsgBad ? 'text-rose-600' : 'text-emerald-700') + '">' + esc(UI.srcMsg) + '</span>' : '';
    var intro = '<section class="rounded-xl bg-white border border-slate-200 p-4"><h4 class="font-black text-slate-800">學習單資料(讓沒有論壇的班級也能用 ASRA)<span class="ml-2 text-xs font-bold text-slate-400">多來源想法</span></h4>' +
      '<p class="text-sm text-slate-600 mt-1">ASRA 不一定要先有論壇貼文。只要有「一個可以被反思的想法」就能進行五個步驟。想法可以來自<b>論壇</b>、<b>學習單</b>(在這裡匯入),或由<b>學生自己新增</b>。</p>' +
      '<ul class="text-xs text-slate-500 mt-2 list-disc pl-5 space-y-0.5"><li>資料包預設只存在<b>這台電腦的瀏覽器</b>。要換電腦用,請用下面的「雲端同步(加密)」:先在你的瀏覽器用密碼加密才上傳,雲端只有看不懂的亂碼。學生要在自己的電腦用,請匯出「個別學生資料包」,再讓學生在 ASRA 頁自己匯入。</li><li>資料包由 <code>build_asra_pack.py</code> 從研究資料 Excel 轉出,內容只有:學生原話、題目、各階段自評平均、各循環前後測平均。<b>不含</b>質性主題編碼、教師觀察與反思。</li><li>歷史原話只當「反思的材料」給學生看,不會自動變成學生現在的想法;學生寫下的反思會另外存成新的紀錄,並標明用的是哪一種時間方式。</li></ul>' +
      '<div class="flex flex-wrap items-center gap-3 mt-3"><label class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer"><i class="fas fa-file-import mr-1"></i>匯入資料包(.json,可一次選好幾個)<input type="file" accept=".json,application/json" multiple data-act="src-file" class="hidden"></label>' + autoUpBox() + msg + '</div></section>' + cloudSection(global.KBSrc);
    if (!S) { cloudLoad(false); return intro; }
    cloudLoad(false);
    var cmax = Math.max.apply(null, K.CAT_ORDER.map(function (k) { return S.cat[k] || 0; }).concat([1]));
    var cats = K.CAT_ORDER.map(function (k) { return bar(K.CATS[k].name.replace(/^Q\d /, ''), S.cat[k] || 0, cmax, K.CATS[k].color, ' 筆'); }).join('');
    var users = D.rows.map(function (r) { return r.u; });
    var mapRev = {}, mp = K.mapGet(); Object.keys(mp).forEach(function (uid) { mapRev[mp[uid]] = uid; });
    var rowsH = S.codes.map(function (c) {
      var P = K.load().students[c], cur = mapRev[c] || '', auto = users.filter(function (u) { return String(u.id).toUpperCase() === c.toUpperCase(); })[0];
      var opts = '<option value=""' + (!cur ? ' selected' : '') + '>' + (auto ? '自動:' + esc(auto.name) : '(未對應)') + '</option>' + users.map(function (u) { return '<option value="' + esc(u.id) + '"' + (cur === String(u.id) ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('');
      var hasScale = K.load().scale && K.load().scale[c] && Object.keys(K.load().scale[c]).length;
      return '<tr class="border-t border-slate-100"><td class="py-1.5 font-bold text-slate-800">' + esc(c) + '</td><td>' + esc(P.g) + '</td><td>' + P.r.length + '</td><td class="text-xs text-slate-500">' + esc(cut(K.listPacks().filter(function (pk) { return pk.codes.indexOf(c) >= 0; }).map(function (pk) { return pk.name; }).join('、'), 24)) + '</td><td>' + (hasScale ? '有' : '<span class="text-slate-300">-</span>') + '</td><td><select data-act="src-map" data-code="' + esc(c) + '" class="border border-slate-300 rounded-lg px-2 py-0.5 text-xs">' + opts + '</select></td><td class="text-xs"><button type="button" data-act="src-export" data-code="' + esc(c) + '" class="text-indigo-600 font-bold underline">匯出此學生資料包</button></td></tr>';
    }).join('');
    var unm = S.codes.filter(function (c) { return !(mapRev[c] || users.some(function (u) { return String(u.id).toUpperCase() === c.toUpperCase(); })); }).length;
    return intro + packsSection(K) +
      '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">' + tile(S.students, '學生', unm ? unm + ' 位還沒對應到平台帳號' : '都已對應到帳號', unm ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200') + tile(S.records, '學生回答', '平均 ' + Math.round(S.records / Math.max(1, S.students)) + ' 則/人') + tile(S.questions, '題目種類', '已先對到 Q3~Q6') + tile(S.threads, '關鍵想法線', '在下方建立') + '</div>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800">題目對到 ASRA 的哪一題<span class="ml-2 text-xs font-bold text-slate-400">依「你確認過的對照表」</span></h4><p class="text-xs text-slate-500 mb-2">學生反思時,系統會把對應的回答放在對應題目旁邊當參考。「其他」是和反思沒有直接關係的題目(例如問 AI 幫了什麼)。要改對照,請修改 Excel 對照表後重新執行 build_asra_pack.py。</p>' + cats + '</section>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800">學生與平台帳號對應</h4><p class="text-xs text-slate-500 mb-2">資料包的學生代碼(如 S01)預設會對到「帳號相同」的學生。帳號不同時,在這裡手動選。</p><div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead><tr class="text-xs text-slate-500"><th class="pb-1">代碼</th><th>小組</th><th>回答數</th><th>來自資料包</th><th>自評</th><th>平台帳號</th><th></th></tr></thead><tbody>' + rowsH + '</tbody></table></div></section>' +
      threadsSection(K) +
      '<section class="rounded-xl bg-white border border-rose-200 p-4 mt-4"><button type="button" data-act="src-clear" class="px-4 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-bold border border-rose-200"><i class="fas fa-trash mr-1"></i>從這台電腦清除「所有」資料包</button><span class="text-xs text-slate-500 ml-2">只想刪其中一個,請用上面「已匯入的資料包」每一列的刪除鈕。學生寫過的反思與計畫都會留著。</span></section>';
  }
  // 請 AI 從「詞 + 出現次數」挑選、合併成關鍵想法線(不送原話、不送姓名)
  function aiThreads() {
    var K = global.KBSrc, ask = global.kbAiAsk;
    if (typeof ask !== 'function') { UI.thrMsg = '這個頁面還沒有接上 AI。'; UI.thrBad = true; draw(); return; }
    var groups = K.groupsInPack(), data = groups.map(function (g) { return g + ':' + K.autoThreads(g, 10).map(function (t) { return t.title + '(' + t.df + '次/' + t.stages + '階段/' + t.students + '人)'; }).join('、'); }).join('\n');
    if (!groups.length) { UI.thrMsg = '還沒有資料包。'; UI.thrBad = true; draw(); return; }
    var prompt = '你是教育研究助理。下面是各小組在三個循環學習單裡「反覆出現」的詞,括號是「出現次數/跨幾個階段/幾位同學」。請替每一組挑 3 到 5 個最能代表該組專題「關鍵想法」的詞(要是專題主題的名詞,不要選「然後、慢慢、得太」這類一般用語或不完整的字串),並把意思相近的詞合併成同一條。\n' +
      '只輸出下面格式,每行一條,不要加任何說明、標題或符號:\n組別|想法名稱|關鍵字,關鍵字\n例如:G1|濾網效果|濾網,過濾\n\n資料:\n' + data;
    UI.thrMsg = 'AI 整理中…'; UI.thrBad = false; draw();
    Promise.resolve().then(function () { return ask(prompt); }).then(function (txt) {
      txt = String(txt || ''); if (/^\s*⚠️/.test(txt)) { UI.thrMsg = txt.replace(/^\s*⚠️\s*/, ''); UI.thrBad = true; draw(); return; }
      var list = parseThreads(txt);
      if (!list.length) { UI.thrMsg = 'AI 的回覆我看不懂,請再試一次,或用「讓系統建議」。'; UI.thrBad = true; draw(); return; }
      UI.thrDraft = threadsToText(list); UI.thrMsg = 'AI 整理出 ' + list.length + ' 條,已填進下面。請檢查後按「儲存想法線」。'; UI.thrBad = false; draw();
    }).catch(function (e) { UI.thrMsg = 'AI 暫時無法使用:' + String(e && e.message || e).slice(0, 80); UI.thrBad = true; draw(); });
  }
  function download(name, text) {
    try { var blob = new Blob([text], { type: 'application/json;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(a.href); document.body.removeChild(a); } catch (e) {} }, 500); } catch (e) {}
  }
  function srcAction(el, a) {
    var K = global.KBSrc;
    if (a === 'src-export') { var sub = K.exportStudent(el.getAttribute('data-code')); if (sub) { UI.lastPack = JSON.stringify(sub); download('ASRA資料包_' + el.getAttribute('data-code') + '.json', UI.lastPack); } }
    else if (a === 'src-del') {
      var pid = el.getAttribute('data-id'), pk = K.listPacks().filter(function (p) { return p.id === pid; })[0]; if (!pk) return;
      if (global.confirm && !global.confirm('刪除資料包「' + pk.name + '」(' + pk.students + ' 位學生、' + pk.records + ' 則回答)?\n其他資料包不受影響;學生寫過的反思與計畫不會被刪除。')) return;
      var rr = K.removePack(pid); UI.srcMsg = rr.ok ? '已刪除資料包「' + rr.name + '」。' : rr.error; UI.srcMsgBad = !rr.ok; draw();
    }
    else if (a === 'src-clear') { if (global.confirm && !global.confirm('確定要從這台電腦清除學習單資料包嗎?(學生寫過的反思與計畫不會被刪除)')) return; K.clear(); UI.srcMsg = '已清除資料包。'; UI.srcMsgBad = false; draw(); }
    else if (a === 'src-threads') { var ta = UI.root.querySelector('[data-k="threads"]'), list = parseThreads(ta ? ta.value : ''); K.setThreads(list); UI.thrDraft = null; UI.thrMsg = list.length ? '已儲存 ' + list.length + ' 條想法線,學生端改用你列的。' : '已清空,學生端改用系統自動找的。'; UI.thrBad = false; draw(); }
    else if (a === 'src-threads-clear') { K.setThreads([]); UI.thrDraft = null; UI.thrMsg = '已改用系統自動找的。'; UI.thrBad = false; draw(); }
    else if (a === 'src-suggest') { var lines = []; K.groupsInPack().forEach(function (g) { K.autoThreads(g, 4).forEach(function (t) { lines.push(g + '|' + t.title + '|' + t.kw.join(',')); }); }); UI.thrDraft = lines.join('\n'); UI.thrMsg = lines.length ? '已把 ' + lines.length + ' 條建議填進下面,請檢查、修改後按「儲存想法線」。' : '資料不夠,系統沒有找到建議。'; UI.thrBad = !lines.length; draw(); }
    else if (a === 'src-ai') { aiThreads(); }
  }
  /* ---------- 雲端同步(加密):資料包先在這個瀏覽器用密碼加密,雲端只有亂碼 ---------- */
  function cloudOn() { var K = global.KB; return !!(K && K.cloud && K.cloud.mode === 'cloud' && global.KBSrcCloud); }
  function cl() { return UI.cloud || (UI.cloud = { list: null, loading: false, busy: '', msg: '', bad: false, err: '' }); }
  function cloudLoad(force) {
    if (!cloudOn()) return; var C = cl(); if (C.loading || (C.list && !force)) return;
    C.loading = true;
    global.KBSrcCloud.list().then(function (l) { C.list = l; C.err = ''; }, function (x) { C.err = String(x && (x.code || x.message) || x).slice(0, 100); if (!C.list) C.list = []; }).then(function () { C.loading = false; draw(); });
  }
  function autoUpBox() {
    if (!cloudOn()) return '';
    return '<label class="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" data-act="cl-auto"' + (UI.autoUp ? ' checked' : '') + '> 匯入後順便加密存雲端(要先在下面「雲端同步」填好密碼)</label>';
  }
  function cloudSection(K) {
    var head = '<section class="rounded-xl bg-white border border-emerald-200 p-4 mt-4" id="asra-cloudpack"><h4 class="font-black text-slate-800"><i class="fas fa-cloud mr-1 text-emerald-600"></i>雲端同步(加密)<span class="ml-2 text-xs font-bold text-slate-400">換電腦也能用同一批資料包</span></h4>';
    if (!cloudOn()) return head + '<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2"><i class="fas fa-triangle-exclamation mr-1"></i>目前是單機模式(沒有連上雲端),資料包只能存在這台電腦。正式上線並連上雲端後,這裡可以把資料包加密存到雲端。</p></section>';
    var av = global.KBSrcCloud.available(); if (!av.ok) return head + '<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">' + esc(av.why) + '</p></section>';
    var C = cl(), L = C.list, local = K.listPacks(), first = L && !L.length;
    var names = {}; local.forEach(function (p) { names[p.name] = p; });
    var h = head + '<ul class="text-xs text-slate-500 mt-2 list-disc pl-5 space-y-0.5"><li>資料包是學生的原話,所以<b>先在你的瀏覽器用密碼加密</b>才上傳。雲端上只有看不懂的亂碼;沒有密碼,任何人(包含管理這個平台的人)都看不到內容。</li><li>在另一台電腦打開這一頁,輸入同一組密碼,按「載入到這台電腦」就能用。</li><li><b>密碼忘了就解不開,而且沒有任何辦法救回</b>,請自己記好。密碼不會存在雲端、也不會存在瀏覽器。</li><li>同一個名稱再存一次,會變成最新的一版(舊版不會被改掉);「從雲端移除」是把它從清單藏起來。</li></ul>';
    h += '<div class="flex flex-wrap items-end gap-3 mt-3"><label class="text-xs font-bold text-slate-600">密碼(至少 ' + global.KBSrcCloud.MIN_PW + ' 個字)<br><input type="password" data-act="cl-pw" autocomplete="new-password" value="' + esc(UI.cpw || '') + '" class="mt-0.5 w-48 border border-slate-300 rounded-lg px-2 py-1 text-sm font-normal"></label>' +
      (first ? '<label class="text-xs font-bold text-slate-600">再輸入一次<br><input type="password" data-act="cl-pw2" autocomplete="new-password" value="' + esc(UI.cpw2 || '') + '" class="mt-0.5 w-48 border border-slate-300 rounded-lg px-2 py-1 text-sm font-normal"></label>' : '') +
      '<button type="button" data-act="cl-upall" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"' + (local.length ? '' : ' disabled style="opacity:.45;cursor:not-allowed"') + '><i class="fas fa-cloud-arrow-up mr-1"></i>這台電腦的資料包,全部加密存雲端</button>' +
      '<button type="button" data-act="cl-refresh" class="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 text-sm font-bold border border-slate-300"><i class="fas fa-rotate mr-1"></i>重新整理雲端清單</button></div>';
    h += '<div class="text-xs mt-2 min-h-[1.25rem] ' + (C.bad ? 'text-rose-600' : 'text-emerald-700') + ' font-bold" id="cl-msg" role="status">' + (C.busy ? '<i class="fas fa-spinner fa-spin mr-1"></i>' + esc(C.busy) : esc(C.msg || '')) + '</div>';
    if (C.err) h += '<p class="text-xs text-rose-600 mt-1">讀不到雲端清單(' + esc(C.err) + ')。如果是「permission-denied」,表示雲端規則還沒開通資料包區,請先到 Firebase 發布新規則。</p>';
    if (!L) h += '<p class="text-xs text-slate-400 mt-2"><i class="fas fa-spinner fa-spin mr-1"></i>正在讀雲端清單…</p>';
    else if (!L.length) h += '<p class="text-xs text-slate-500 mt-2">雲端上還沒有資料包。在這台電腦匯入資料包後,按上面「全部加密存雲端」;第一次存的密碼就是之後要用的密碼。</p>';
    else h += '<div class="overflow-x-auto mt-3"><table class="w-full text-sm text-left"><thead><tr class="text-xs text-slate-500"><th class="pb-1">雲端上的資料包</th><th>學生</th><th>回答</th><th>存到雲端的時間</th><th>這台電腦</th><th></th></tr></thead><tbody>' +
      L.map(function (r) {
        var lp = names[r.name];
        return '<tr class="border-t border-slate-100"><td class="py-1.5 font-bold text-slate-800">' + esc(r.name) + '</td><td>' + r.students + ' 位</td><td>' + r.records + ' 則</td><td class="text-xs text-slate-500">' + fmtDT(r.t) + '</td><td class="text-xs ' + (lp ? 'text-emerald-700' : 'text-slate-400') + '">' + (lp ? '已有同名(載入會更新它)' : '還沒有') + '</td><td class="text-xs whitespace-nowrap"><button type="button" data-act="cl-down" data-id="' + esc(r.id) + '" class="text-indigo-600 font-bold underline mr-3">載入到這台電腦</button><button type="button" data-act="cl-rm" data-name="' + esc(r.name) + '" class="text-rose-600 font-bold underline">從雲端移除</button></td></tr>';
      }).join('') + '</tbody></table></div><div class="mt-2"><button type="button" data-act="cl-downall" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold"><i class="fas fa-cloud-arrow-down mr-1"></i>雲端上的資料包,全部載入到這台電腦</button></div>';
    h += stuSection();
    return h + '</section>';
  }
  /* ---- 學生登入就自動同步:老師把每位學生的資料存到伺服器,學生登入後 ASRA 頁自動拿到「自己的」那份 ---- */
  function srvState() { return UI.srv || (UI.srv = { items: null, msg: '', bad: false, busy: '' }); }
  function stuRows() {
    var K = global.KBSrc, S = K.summary(); if (!S) return [];
    var users = (UI.D && UI.D.rows ? UI.D.rows : []).map(function (r) { return r.u; }), mp = K.mapGet(), rev = {};
    Object.keys(mp).forEach(function (u) { rev[mp[u]] = u; });
    var P = K.load();
    return S.codes.map(function (c) {
      var u = rev[c] ? users.filter(function (x) { return String(x.id) === String(rev[c]); })[0] : null;
      if (!u) u = users.filter(function (x) { return String(x.id).toUpperCase() === c.toUpperCase(); })[0] || null;
      return { code: c, uid: u ? String(u.id) : '', name: u ? u.name : '', group: P.students[c] ? P.students[c].g : '' };
    });
  }
  function stuSection() {
    var V = srvState(), rows = stuRows(), mapped = rows.filter(function (r) { return r.uid; }), ST = V.items || {};
    var h = '<div class="mt-5 pt-4 border-t border-emerald-100" id="asra-stusync"><h5 class="font-black text-slate-800"><i class="fas fa-user-graduate mr-1 text-emerald-600"></i>讓學生登入就自動同步<span class="ml-2 text-xs font-bold text-slate-400">每位學生只拿到自己的資料</span></h5>' +
      '<ul class="text-xs text-slate-500 mt-1 list-disc pl-5 space-y-0.5"><li>按下面的鈕,系統把每位學生<b>自己的</b>資料各存一份在<b>伺服器</b>(不是公開的雲端資料庫,瀏覽器直接讀不到)。學生用平台帳號登入後,ASRA 頁會自動把自己的資料放到那台電腦,<b>不用輸入任何碼</b>。</li><li>學生登入時,伺服器用平台的帳號密碼確認是本人,所以保護強度等於學生的平台密碼:密碼還是預設值(等於學號)的學生,知道他學號的人就能拿到他的資料,請提醒學生改密碼。</li><li>你更新資料包後再按一次,學生下次登入就會拿到最新的。學生已經登入中的,要登出再登入一次才會拿到憑證。</li><li>需要管理者在 Vercel 設定 <code>FIREBASE_SERVICE_ACCOUNT</code> 與 <code>AI_ADMIN_PASSCODE</code>(和儲存 AI 金鑰同一套,見「AI金鑰雲端設定說明」)。下面要填的「管理密碼」就是 <code>AI_ADMIN_PASSCODE</code>。只有已對應到平台帳號的學生能存。</li></ul>' +
      '<div class="flex flex-wrap items-end gap-3 mt-3"><label class="text-xs font-bold text-slate-600">管理密碼<br><input type="password" data-act="cl-adm" autocomplete="off" value="' + esc(UI.adm || '') + '" class="mt-0.5 w-48 border border-slate-300 rounded-lg px-2 py-1 text-sm font-normal"></label>' +
      '<button type="button" data-act="cl-srvput" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"' + (mapped.length ? '' : ' disabled style="opacity:.45;cursor:not-allowed"') + '><i class="fas fa-cloud-arrow-up mr-1"></i>為 ' + mapped.length + ' 位學生存到伺服器 / 更新</button>' +
      '<button type="button" data-act="cl-srvstat" class="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold border border-slate-300"><i class="fas fa-rotate mr-1"></i>看伺服器上有哪些</button>' +
      '<button type="button" data-act="cl-srvclear" class="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-bold border border-rose-200"><i class="fas fa-trash mr-1"></i>清除伺服器上所有學生資料</button></div>' +
      '<div class="text-xs mt-2 min-h-[1.25rem] font-bold ' + (V.bad ? 'text-rose-600' : 'text-emerald-700') + '" id="srv-msg" role="status">' + (V.busy ? '<i class="fas fa-spinner fa-spin mr-1"></i>' + esc(V.busy) : esc(V.msg || '')) + '</div>';
    if (rows.length) h += '<div class="overflow-x-auto mt-3"><table class="w-full text-sm text-left"><thead><tr class="text-xs text-slate-500"><th class="pb-1">帳號</th><th>姓名</th><th>資料包代碼</th><th>小組</th><th>伺服器上的資料</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var st = r.uid && ST[r.uid];
        return '<tr class="border-t border-slate-100"><td class="py-1.5 font-bold text-slate-800">' + (r.uid ? esc(r.uid) : '<span class="text-amber-600 text-xs">(未對應帳號)</span>') + '</td><td>' + esc(r.name) + '</td><td class="text-xs text-slate-500">' + esc(r.code) + '</td><td>' + esc(r.group) + '</td><td class="text-xs ' + (st ? 'text-emerald-700' : 'text-slate-400') + '">' + (st ? '已存(' + st.records + ' 則,' + fmtDT(Date.parse(st.updated) || 0) + ')' : (V.items ? (r.uid ? '還沒有' : '') : '按「看伺服器上有哪些」查看')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</div>';
  }
  function srvSay(msg, bad) { var V = srvState(); V.busy = ''; V.msg = msg; V.bad = !!bad; draw(); }
  function srvBusy(msg) { var V = srvState(); V.busy = msg; V.msg = ''; V.bad = false; draw(); }
  function srvFail(r) { return r.error + (r.kind === 'noserver' ? '(請管理者先在 Vercel 設定 FIREBASE_SERVICE_ACCOUNT 與 AI_ADMIN_PASSCODE,設定後要重新部署)' : ''); }
  function srvAction(a) {
    var V = srvState(), S = global.KBSrcCloud;
    if (V.busy) return;
    if (!UI.adm) { srvSay('請先填管理密碼。', true); return; }
    if (a === 'cl-srvstat' || a === 'cl-srvput') {
      var after = function () {
        return S.srv.status(UI.adm).then(function (r) {
          if (!r.ok) { srvSay(srvFail(r), true); return; }
          V.items = {}; r.items.forEach(function (x) { V.items[x.uid] = x; });
          return r;
        });
      };
      if (a === 'cl-srvstat') { srvBusy('讀取中…'); after().then(function (r) { if (r) srvSay('伺服器上有 ' + r.items.length + ' 位學生的資料。', false); }); return; }
      var ents = stuRows().filter(function (r) { return r.uid; }).map(function (r) { return { uid: r.uid, code: r.code }; });
      if (!ents.length) { srvSay('還沒有學生對應到平台帳號。', true); return; }
      srvBusy('正在存到伺服器…');
      S.srv.put(ents, UI.adm, function (n, total) { srvBusy('正在存到伺服器…(' + n + '/' + total + ')'); }).then(function (r) {
        if (!r.ok) { srvSay(srvFail(r), true); return; }
        return after().then(function (st) {
          if (st) srvSay((r.done.length ? '已為 ' + r.done.length + ' 位學生存好資料。學生下次登入平台就會自動同步。' : '') + (r.bad.length ? ' 沒有成功:' + r.bad.map(function (b) { return b.uid + '(' + b.error + ')'; }).join('、') : ''), !r.done.length);
        });
      });
      return;
    }
    if (a === 'cl-srvclear') {
      if (global.confirm && !global.confirm('清除伺服器上「所有」學生的學習單資料?\n(學生已經同步到自己電腦的不受影響;這台電腦的資料包也不會被刪。之後可以再按「存到伺服器」重新存。)')) return;
      srvBusy('清除中…');
      S.srv.clear(UI.adm).then(function (r) { if (!r.ok) { srvSay(r.error, true); return; } V.items = {}; srvSay('已清除伺服器上 ' + r.cleared + ' 位學生的資料。', false); });
    }
  }
  function clSay(msg, bad) { var C = cl(); C.busy = ''; C.msg = msg; C.bad = !!bad; draw(); }
  function clBusy(msg) { var C = cl(); C.busy = msg; C.msg = ''; C.bad = false; draw(); }
  function clPwOk() {
    var C = cl(), S = global.KBSrcCloud, p = S.pwProblem(UI.cpw); if (p) { clSay(p, true); return false; }
    if (C.list && !C.list.length && UI.cpw !== UI.cpw2) { clSay('兩次輸入的密碼不一樣。', true); return false; }
    return true;
  }
  function clUploadIds(ids) {
    var S = global.KBSrcCloud, K = global.KBSrc, C = cl(), done = [], bad = [];
    return S.checkPassword(UI.cpw, C.list).then(function (ck) {
      if (!ck.ok) { clSay(ck.error, true); return null; }
      return ids.reduce(function (p, id) {
        return p.then(function () { var nm = (K.listPacks().filter(function (x) { return x.id === id; })[0] || {}).name || '資料包'; clBusy('正在加密並上傳「' + nm + '」…'); return S.upload(id, UI.cpw, { checked: true }).then(function (r) { if (r.ok) done.push(r); else bad.push({ name: nm, error: r.error }); }); });
      }, Promise.resolve()).then(function () {
        var msg = (done.length ? '已加密存到雲端:' + done.map(function (r) { return r.name; }).join('、') + '。' : '') + (bad.length ? '沒有存成功:' + bad.map(function (r) { return r.name + '(' + r.error + ')'; }).join(';') : '');
        C.list = null; C.busy = ''; C.msg = msg; C.bad = !done.length && !!bad.length; cloudLoad(true); draw(); return { done: done, bad: bad };
      });
    });
  }
  function clAction(el, a) {
    var C = cl(), S = global.KBSrcCloud, K = global.KBSrc;
    if (C.busy) return;
    if (a === 'cl-refresh') { C.list = null; C.msg = ''; cloudLoad(true); draw(); return; }
    if (a === 'cl-up' || a === 'cl-upall') {
      if (!clPwOk()) return;
      var ids = a === 'cl-up' ? [el.getAttribute('data-id')] : K.listPacks().map(function (p) { return p.id; });
      if (!ids.length) { clSay('這台電腦還沒有資料包。', true); return; }
      clBusy('檢查密碼…'); clUploadIds(ids); return;
    }
    if (a === 'cl-down' || a === 'cl-downall') {
      var p0 = S.pwProblem(UI.cpw); if (p0) { clSay(p0, true); return; }
      var items = (C.list || []).filter(function (r) { return a === 'cl-downall' || r.id === el.getAttribute('data-id'); });
      if (!items.length) return;
      var ok = [], bad = [];
      items.reduce(function (p, it) { return p.then(function () { clBusy('正在下載並解開「' + it.name + '」…'); return S.download(it, UI.cpw).then(function (r) { if (r.ok) ok.push(r); else bad.push({ name: it.name, error: r.error }); }); }); }, Promise.resolve()).then(function () {
        UI.srcMsg = ok.length ? '已從雲端載入 ' + ok.length + ' 個資料包:' + ok.map(function (r) { return r.name + (r.replaced ? '(更新)' : '') + ':' + r.students + ' 位、' + r.records + ' 則'; }).join(';') : ''; UI.srcMsgBad = false;
        clSay((ok.length ? '載入完成,資料已放進這台電腦。' : '') + (bad.length ? (ok.length ? ' ' : '') + '沒有載入:' + bad.map(function (r) { return r.name + '(' + r.error + ')'; }).join(';') : ''), !ok.length);
      });
      return;
    }
    if (a === 'cl-rm') {
      var nm = el.getAttribute('data-name');
      if (global.confirm && !global.confirm('把「' + nm + '」從雲端清單移除?\n(只是從清單藏起來;這台電腦和其他電腦已經載入的不受影響。)')) return;
      clBusy('移除中…'); S.remove(nm).then(function (r) { C.list = null; if (r.ok) { C.busy = ''; C.msg = '已從雲端移除「' + nm + '」。'; C.bad = false; cloudLoad(true); draw(); } else clSay(r.error, true); });
    }
  }
  function fmtDT(ts) { var d = new Date(ts || 0); return d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  // 已匯入的資料包:系統把它們「合在一起」使用;刪除時可以自己選要刪哪一個
  function packsSection(K) {
    var list = K.listPacks(); if (!list.length) return '';
    return '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800">已匯入的資料包<span class="ml-2 text-xs font-bold text-slate-400">共 ' + list.length + ' 個,系統會合在一起使用</span></h4>' +
      '<p class="text-xs text-slate-500 mt-1 mb-2">同一位學生出現在好幾個資料包時,回答會合併(來源碼相同的,以較晚匯入的為準)。刪除其中一個,只會移除那個資料包提供的資料,其他資料包不受影響。重新匯入同名的檔案,會更新那個資料包。</p>' +
      '<div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead><tr class="text-xs text-slate-500"><th class="pb-1">資料包</th><th>學生</th><th>回答</th><th>匯入時間</th><th></th></tr></thead><tbody>' +
      list.map(function (p) { return '<tr class="border-t border-slate-100"><td class="py-1.5 font-bold text-slate-800">' + esc(p.name) + '</td><td>' + p.students + ' 位</td><td>' + p.records + ' 則</td><td class="text-xs text-slate-500">' + fmtDT(p.added) + '</td><td class="text-xs whitespace-nowrap">' + (cloudOn() ? '<button type="button" data-act="cl-up" data-id="' + esc(p.id) + '" class="text-emerald-700 font-bold underline mr-3">加密存雲端</button>' : '') + '<button type="button" data-act="src-del" data-id="' + esc(p.id) + '" class="text-rose-600 font-bold underline">刪除這個資料包</button></td></tr>'; }).join('') + '</tbody></table></div></section>';
  }
  // 一次可以選好幾個檔案;每個檔案是一個資料包(檔名當名稱)
  function srcFile(el) {
    var files = Array.prototype.slice.call(el.files || []); if (!files.length) return;
    var readOne = function (f) {
      return new Promise(function (resolve) {
        var rd = new FileReader();
        rd.onload = function () {
          var obj = null; try { obj = JSON.parse(String(rd.result)); } catch (e) { resolve({ name: f.name, ok: false, error: '不是正確的 .json' }); return; }
          var r = global.KBSrc.importPack(obj, { name: f.name }); r.fileName = f.name; resolve(r);
        };
        rd.onerror = function () { resolve({ name: f.name, ok: false, error: '讀不到這個檔案' }); };
        rd.readAsText(f, 'utf-8');
      });
    };
    var results = [];
    files.reduce(function (p, f) { return p.then(function () { return readOne(f).then(function (r) { results.push(r); }); }); }, Promise.resolve()).then(function () {
      var good = results.filter(function (r) { return r.ok; }), bad = results.filter(function (r) { return !r.ok; });
      UI.srcMsgBad = !good.length;
      UI.srcMsg = (good.length ? '匯入完成:' + good.length + ' 個資料包 — ' + good.map(function (r) { return r.name + (r.replaced ? '(更新)' : '') + ':' + r.students + ' 位、' + r.records + ' 則'; }).join(';') : '') + (bad.length ? (good.length ? '。' : '') + '沒有匯入:' + bad.map(function (r) { return (r.fileName || r.name) + '(' + r.error + ')'; }).join(';') : '');
      try { el.value = ''; } catch (e) {}
      draw();
      if (UI.autoUp && cloudOn() && good.length) {
        if (!clPwOk()) return;
        clBusy('檢查密碼…'); clUploadIds(good.map(function (r) { return r.id; }));
      }
    });
  }

  /* ---------- 組合 ---------- */
  var TABS = [['class', '全班總覽', 'fa-chart-pie'], ['students', '學生一覽', 'fa-users'], ['effect', '計畫→行動→想法前進', 'fa-route'], ['push', '想法推進 (PUSH)', 'fa-rocket'], ['src', '學習單資料', 'fa-file-lines'], ['log', '反思與計畫紀錄', 'fa-book-open'], ['method', '指標說明與匯出', 'fa-circle-info']];
  function draw() {
    if (!UI.root || !UI.ctx) return;
    var D = UI.D = compute(UI.ctx);
    var tabs = '<div class="flex flex-wrap gap-2 mb-4" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" data-act="tab" data-tab="' + t[0] + '" aria-selected="' + (UI.tab === t[0]) + '" class="px-4 py-2 rounded-full text-sm font-bold border ' + (UI.tab === t[0] ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50') + '"><i class="fas ' + t[2] + ' mr-1"></i>' + t[1] + '</button>'; }).join('') + '</div>';
    var body0 = UI.tab === 'push' ? tabPush(D) : UI.tab === 'effect' ? tabEffect(D) : UI.tab === 'src' ? tabSrc(D) : UI.tab === 'students' ? tabStudents(D) : UI.tab === 'log' ? tabLog(D) : UI.tab === 'method' ? tabMethod(D) : tabClass(D);
    var body = extras(UI.tab, body0);
    UI.root.innerHTML = '<header class="mb-3"><h2 class="text-xl md:text-2xl font-bold text-slate-800">ASRA 反思歷程 <span class="text-sm font-bold text-slate-400">Analytics-Supported Reflective Assessment</span></h2><p class="text-sm text-slate-500">看全班與每位學生:走過的路 → 想法走多遠 → 用證據反思 → 決定下一步 → 回頭再檢查</p></header>' +
      '<div class="mb-3">' + cloudBanner() + '</div>' + tabs + '<div id="asra-t-body">' + body + '</div>';
    try { wireAi(D); } catch (e) { if (global.console) console.error(e); }
  }
  function onClick(ev) {
    var el = ev.target.closest ? ev.target.closest('[data-act]') : null; if (!el || !UI.root.contains(el)) return;
    var a = el.getAttribute('data-act');
    if (a === 'tab') { UI.tab = el.getAttribute('data-tab'); draw(); }
    else if (a === 'log') { ev.preventDefault(); UI.stu = el.getAttribute('data-id'); UI.kind = 'all'; UI.limit = 40; UI.tab = 'log'; draw(); }
    else if (a === 'more') { UI.limit += 40; draw(); }
    else if (a === 'pushmore') { UI.pushLimit = (UI.pushLimit || 30) + 30; draw(); }
    else if (a === 'view') {
      ev.preventDefault(); var cx = UI.ctx || {};
      if (global.KBUI && global.KBUI.postViewer) global.KBUI.postViewer.open(el.getAttribute('data-id'), { nodes: cx.nodes || [], topics: cx.topics || [], nameOf: function (u) { var x = (cx.userList || {})[u]; return (x && x.name) || '同學'; } });
    }
    else if (a === 'sortcol') { var sk = el.getAttribute('data-key'); if (UI.sort === sk) UI.dir = UI.dir === 'asc' ? 'desc' : 'asc'; else { UI.sort = sk; UI.dir = sortCol(sk).d0 || 'desc'; } draw(); }
    else if (a === 'csv') { exportCSV(); }
    else if (a === 'src-export' || a === 'src-del' || a === 'src-clear' || a === 'src-threads' || a === 'src-threads-clear' || a === 'src-suggest' || a === 'src-ai') { ev.preventDefault(); srcAction(el, a); }
    else if (a.indexOf('cl-') === 0 && a !== 'cl-pw' && a !== 'cl-pw2' && a !== 'cl-auto' && a !== 'cl-adm') { ev.preventDefault(); if (a.indexOf('cl-srv') === 0) srvAction(a); else clAction(el, a); }
  }
  function onChange(ev) {
    var el = ev.target, a = el.getAttribute && el.getAttribute('data-act'); if (!a) return;
    if (a === 'src-file') { srcFile(el); return; }
    if (a === 'cl-auto') { UI.autoUp = !!el.checked; return; }
    if (a === 'src-map') { var K = global.KBSrc, code = el.getAttribute('data-code'), mp = K.mapGet(); Object.keys(mp).forEach(function (u) { if (mp[u] === code) K.mapSet(u, null); }); if (el.value) K.mapSet(el.value, code); draw(); return; }
    if (a === 'stu') { UI.stu = el.value; UI.limit = 40; draw(); } else if (a === 'kind') { UI.kind = el.value; UI.limit = 40; draw(); } else if (a === 'sort') { UI.sort = el.value; UI.dir = sortCol(el.value).d0 || 'desc'; draw(); } else if (a === 'eff') { UI.eff = el.value; draw(); }
  }
  function exportCSV() {
    var D = UI.D || compute(UI.ctx), ids = D.rows.filter(function (r) { return UI.stu === 'all' || r.u.id === UI.stu; }).map(function (r) { return r.u.id; });
    var byId = {}; D.rows.forEach(function (r) { byId[r.u.id] = r.u; });
    var csv = KBAsra.toCSV({ uids: ids, info: function (u) { return byId[u]; } });
    var d = new Date(), stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    UI.lastCSV = csv;
    try {
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'ASRA_反思與計畫紀錄_' + stamp + '.csv'; document.body.appendChild(a); a.click();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); document.body.removeChild(a); } catch (e) {} }, 500);
    } catch (e) {}
  }

  var bound = false;
  function render(root, ctx) {
    UI.root = root; UI.ctx = ctx;
    if (!bound) { bound = true; root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('input', function (ev) { var t = ev.target, a = t && t.getAttribute && t.getAttribute('data-act'); if (a === 'cl-pw') UI.cpw = t.value; else if (a === 'cl-pw2') UI.cpw2 = t.value; else if (a === 'cl-adm') UI.adm = t.value; }); KBAsra.onChange(function () { if (UI.root && UI.root.offsetParent !== null) { try { draw(); } catch (e) {} } }); }
    draw();
  }
  global.KBAsraTeacher = { render: render, compute: compute, state: function () { return UI; }, _csv: exportCSV };
})(window);
