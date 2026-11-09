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
  var UI = { tab: 'class', stu: 'all', kind: 'all', limit: 40, sort: 'name', ctx: null, root: null };
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
    ASRA.TYPES.forEach(function (t) { types[t] = 0; });
    var rows = list.map(function (u) {
      var A = ASRA.analyze(nodes, u.id, topics), E = KBAsra.entries(u.id), S = KBAsra.derive(u.id);
      var c = { note: 0, refl: 0, plan: 0, reeval: 0 }; E.forEach(function (e) { if (c[e.kind] !== undefined) c[e.kind]++; });
      var better = 0, more = 0, acted = 0, planOld = 0, lastRe = null;
      S.plans.forEach(function (p) {
        var f = ASRA.followUp(nodes, u.id, p); p._f = f;
        if (f.acted) acted++; else if (now - p.ts >= 3 * DAY) planOld++;
        (p.reeval || []).forEach(function (r) { if (r.result === 'better') better++; else more++; if (!lastRe || r.ts > lastRe.ts) lastRe = r; });
      });
      var mineDates = nodes.filter(function (n) { return n.author === u.id; }).map(function (n) { return n.date || 0; });
      var lastPost = mineDates.length ? Math.max.apply(null, mineDates) : 0;
      var lastAsra = E.length ? E[E.length - 1].ts : 0;
      var improveShare = A.posts ? pct((A.byType.improve || 0) + (A.byType.riseabove || 0), A.posts) : 0;
      var r = { u: u, A: A, S: S, E: E, c: c, plans: S.plans.length, better: better, more: more, acted: acted, planOld: planOld, lastRe: lastRe, lastPost: lastPost, lastAsra: lastAsra, improveShare: improveShare, noEvid: A.ideas.filter(function (i) { return !i.ownEvid; }).length, reasons: [] };
      // 需要關心的原因
      if (!A.posts) r.reasons.push('還沒發過貼文');
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
    return { rows: rows, T: T, types: types, status: status, ideas: ideas, ideasEvid: ideasEvid, improve: improve, attention: attention, tips: tips, refNow: refNow };
  }

  /* ---------- 小元件 ---------- */
  function tile(n, label, sub, tone) { return '<div class="rounded-xl border p-3 ' + (tone || 'bg-white border-slate-200') + '"><div class="text-2xl font-black text-slate-800">' + n + '</div><div class="text-xs font-bold text-slate-600">' + label + '</div>' + (sub ? '<div class="text-[11px] text-slate-400 mt-0.5">' + sub + '</div>' : '') + '</div>'; }
  function bar(label, n, max, color, extra) { return '<div class="flex items-center gap-2 mb-1.5"><span class="w-14 text-sm font-bold text-slate-700 shrink-0">' + label + '</span><div class="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden"><i class="block h-full rounded-full" style="width:' + Math.round(n / Math.max(max, 1) * 100) + '%;background:' + color + '"></i></div><span class="w-20 text-right text-sm font-black text-slate-700 shrink-0">' + n + (extra || '') + '</span></div>'; }
  function pill(t, cls) { return '<span class="inline-block text-[11px] font-black px-2 py-0.5 rounded-full ' + cls + '">' + t + '</span>'; }
  var KCOL = { note: 'bg-slate-100 text-slate-600', refl: 'bg-indigo-100 text-indigo-700', plan: 'bg-emerald-100 text-emerald-700', reeval: 'bg-amber-100 text-amber-700', concept: 'bg-sky-100 text-sky-700' };
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
      '<section class="rounded-xl bg-white border border-slate-200 p-4"><h4 class="font-black text-slate-800">ASRA 走到哪一步?<span class="ml-2 text-xs font-bold text-slate-400">監控 → 反思 → 調整 → 再評估</span></h4><p class="text-xs text-slate-500 mb-2">長條是人數,滿格代表全班。看哪一步卡住最多人。</p>' + funnel + '<div data-ai="funnel" class="mt-3"></div></section>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4"><h4 class="font-black text-slate-800">大家在做哪些思考?<span class="ml-2 text-xs font-bold text-slate-400">貼文類型(近似「認知動作」)</span></h4><p class="text-xs text-slate-500 mb-2">「改進」+「昇華」占 <b>' + pct(D.improve, T.posts) + '%</b>。這兩種越多,代表越常把想法變得更好、把大家的想法合起來。</p>' + types + '<div data-ai="types" class="mt-3"></div></section>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4"><h4 class="font-black text-slate-800">想法走多遠了?<span class="ml-2 text-xs font-bold text-slate-400">知識進展評估</span></h4><p class="text-xs text-slate-500 mb-2">全班共 ' + D.ideas + ' 個想法;其中 ' + D.ideasEvid + ' 個(' + pct(D.ideasEvid, D.ideas) + '%)作者自己寫了證據。</p>' + stat + '<div data-ai="ideas" class="mt-3"></div></section>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4"><h4 class="font-black text-slate-800">教學小建議<span class="ml-2 text-xs font-bold text-slate-400">由上面的數字自動整理</span></h4><div class="mt-2">' + tips + '</div><div data-ai="tips" class="mt-3"></div></section></div>' +
      '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4"><h4 class="font-black text-slate-800">這週建議多關心<span class="ml-2 text-xs font-bold text-slate-400">規則見「指標說明」</span></h4>' + att + '<div data-ai="attention" class="mt-3"></div></section>';
  }

  /* ---------- 分頁 2:學生一覽 ---------- */
  function tabStudents(D) {
    var rows = D.rows.slice();
    var key = { name: function (r) { return r.u.name; }, posts: function (r) { return -r.A.posts; }, refl: function (r) { return -r.c.refl; }, last: function (r) { return -r.lastAsra; }, care: function (r) { return -r.reasons.length; } }[UI.sort] || function (r) { return r.u.name; };
    rows.sort(function (a, b) { var x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
    var head = ['學生', '貼文', '回應別人', '被回應', '夥伴', '想法有證據', '改進+昇華', '反思', '計畫', '計畫後有行動', '再評估', '最近 ASRA', ''];
    var body = rows.map(function (r) {
      var A = r.A, reTxt = r.c.reeval ? ('<span class="text-emerald-600 font-bold">' + r.better + ' 好</span> / <span class="text-amber-600 font-bold">' + r.more + ' 努力</span>') : '<span class="text-slate-300">-</span>';
      return '<tr class="border-t border-slate-100 hover:bg-slate-50"><td class="py-2 pr-3 text-left align-top"><div class="font-bold text-slate-800 whitespace-nowrap">' + nameOf(r) + (r.reasons.length ? ' <span title="' + esc(r.reasons.join('、')) + '" class="text-rose-500"><i class="fas fa-flag"></i></span>' : '') + '</div>' + (r.reasons.length ? '<div class="mt-1 flex flex-wrap gap-1" style="max-width:18rem" data-k="reasons">' + r.reasons.map(function (x) { return pill(esc(x), 'bg-rose-50 text-rose-700 border border-rose-100'); }).join('') + '</div>' : '') + '</td>' +
        '<td>' + A.posts + '</td><td>' + A.given + '</td><td>' + A.received + '</td><td>' + A.partners + '</td><td>' + A.hasEvid + ' / ' + A.ideas.length + '</td><td>' + r.improveShare + '%</td>' +
        '<td class="font-black ' + (r.c.refl ? 'text-indigo-700' : 'text-slate-300') + '">' + r.c.refl + '</td><td class="font-black ' + (r.plans ? 'text-emerald-700' : 'text-slate-300') + '">' + r.plans + '</td><td>' + (r.plans ? r.acted + ' / ' + r.plans : '<span class="text-slate-300">-</span>') + '</td><td class="whitespace-nowrap">' + reTxt + '</td>' +
        '<td class="whitespace-nowrap text-xs text-slate-500">' + (r.lastAsra ? KBAsra.fmtDate(r.lastAsra) : '<span class="text-slate-300">尚未使用</span>') + '</td>' +
        '<td class="whitespace-nowrap text-xs"><a class="text-indigo-600 font-bold underline mr-2" href="#" data-act="log" data-id="' + esc(r.u.id) + '">看紀錄</a><a class="text-indigo-600 font-bold underline" href="' + esc(asraHref(r.u.id)) + '">ASRA 頁</a></td></tr>';
    }).join('') || '<tr><td colspan="13" class="py-4 text-center text-slate-400">沒有學生資料</td></tr>';
    return '<div class="flex flex-wrap items-center gap-2 mb-3"><label class="text-sm font-bold text-slate-600">排序</label><select data-act="sort" class="border border-slate-300 rounded-lg px-2 py-1 text-sm">' +
      [['name', '姓名'], ['care', '需要關心的原因數'], ['posts', '貼文數'], ['refl', '反思篇數'], ['last', '最近使用 ASRA']].map(function (o) { return '<option value="' + o[0] + '"' + (UI.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select><span class="text-xs text-slate-400"><i class="fas fa-flag text-rose-500"></i> = 有需要關心的原因,原因直接列在姓名下面(不是評價,只是提醒多看一眼)</span></div>' +
      '<div class="overflow-x-auto rounded-xl bg-white border border-slate-200 p-3"><table class="w-full text-sm text-center"><thead><tr class="text-xs text-slate-500">' + head.map(function (h, i) { return '<th class="pb-2 font-bold ' + (i === 0 ? 'text-left' : '') + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>';
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
        (p && p.reeval.length ? '<div class="mt-1 space-y-0.5">' + p.reeval.map(function (q) { return '<div class="text-xs text-slate-600">↳ ' + KBAsra.fmtTime(q.ts) + ' 再評估:' + (q.result === 'better' ? pill('變好了', 'bg-emerald-100 text-emerald-700') : pill('還要再努力', 'bg-amber-100 text-amber-700')) + (q.follow ? ' <span class="text-slate-400">(當時新貼文 ' + q.follow.mine + '、新回應 ' + q.follow.replies + ')</span>' : '') + '</div>'; }).join('') + '</div>' : '');
    }
    return '<div class="py-3 border-t border-slate-100 flex gap-3"><div class="w-32 shrink-0 text-xs text-slate-500"><div class="font-bold text-slate-700">' + d.time + '</div></div><div class="min-w-0 flex-1">' +
      '<div class="flex flex-wrap items-center gap-2"><span class="font-bold text-slate-800">' + nameOf(r) + '</span>' + pill(d.label + (d.act ? ':' + d.act : ''), KCOL[e.kind] || '') + (e.ideaStatus ? pill('當時:' + (SNAME[e.ideaStatus] || e.ideaStatus), 'bg-slate-100 text-slate-500') : '') + '</div>' +
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
      ['計畫 → 行動 → 再評估', '自我調整與持續改進:反思之後有沒有真的行動、結果有沒有變好。', '每次再評估會一併記下當時計畫後的新貼文與新回應數,可追蹤個人層級的前後變化。'],
      ['尚未收集', '認知情緒問卷、領域前後測、認知主體性問卷。', '目前平台沒有這些資料;若要做研究,需另外施測再合併。']
    ];
    var aim = [
      ['讓學生自己用資料想一想', '分析工具常常是研究者在看;這裡讓學生自己看自己的貼文與回應,再寫下反思。'],
      ['想的不只是「說了什麼」', '也看想法有沒有證據、有沒有被回應、有沒有越改越好。'],
      ['老師看得到全班,也看得到個人', '全班總覽找出誰需要多關心;個別紀錄可以看到一個人一路的變化。'],
      ['把「反思 → 計畫 → 行動 → 結果」連起來', '每次存下都有日期;計畫之後有沒有新貼文、有沒有被回應,都會記下來。'],
      ['不綁定特定軟體', '用我們自己的討論平台就能做,不需要另外的分析工具。'],
      ['國小學生看得懂的說法', '用「看看走過的路」這類說法,不用專有名詞。']
    ];
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
    return '<section class="rounded-xl bg-white border border-slate-200 p-4"><h4 class="font-black text-slate-800 mb-1">匯出給研究用(CSV,可用 Excel 開啟)</h4><p class="text-xs text-slate-500 mb-3">包含日期時間、學號、姓名、班級、類型、想法標題、內容、做法、再評估結果與計畫後的行動數。檔案只存在你的電腦,不會上傳。</p>' +
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
  function wireAi(D) {
    if (UI.tab !== 'class' || typeof global.kbAddExplain !== 'function') return;
    var tb = aiTables(D), defs = [['funnel', 'ASRA 走到哪一步'], ['types', '大家在做哪些思考'], ['ideas', '想法走多遠了'], ['tips', '教學小建議'], ['attention', '這週建議多關心']];
    defs.forEach(function (d) {
      var wrap = UI.root.querySelector('[data-ai="' + d[0] + '"]'); if (!wrap) return;
      wrap.style.display = 'flex';
      global.kbAddExplain(wrap, { title: 'ASRA 反思歷程:' + d[1], table: tb[d[0]], label: '🤖 AI 解說', kind: 'snapshot' }, 'asra-' + d[0]);
    });
  }

  /* ---------- 組合 ---------- */
  var TABS = [['class', '全班總覽', 'fa-chart-pie'], ['students', '學生一覽', 'fa-users'], ['log', '反思與計畫紀錄', 'fa-book-open'], ['method', '指標說明與匯出', 'fa-circle-info']];
  function draw() {
    if (!UI.root || !UI.ctx) return;
    var D = UI.D = compute(UI.ctx);
    var tabs = '<div class="flex flex-wrap gap-2 mb-4" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" data-act="tab" data-tab="' + t[0] + '" aria-selected="' + (UI.tab === t[0]) + '" class="px-4 py-2 rounded-full text-sm font-bold border ' + (UI.tab === t[0] ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50') + '"><i class="fas ' + t[2] + ' mr-1"></i>' + t[1] + '</button>'; }).join('') + '</div>';
    var body = UI.tab === 'students' ? tabStudents(D) : UI.tab === 'log' ? tabLog(D) : UI.tab === 'method' ? tabMethod(D) : tabClass(D);
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
    else if (a === 'csv') { exportCSV(); }
  }
  function onChange(ev) {
    var el = ev.target, a = el.getAttribute && el.getAttribute('data-act'); if (!a) return;
    if (a === 'stu') { UI.stu = el.value; UI.limit = 40; draw(); } else if (a === 'kind') { UI.kind = el.value; UI.limit = 40; draw(); } else if (a === 'sort') { UI.sort = el.value; draw(); }
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
    if (!bound) { bound = true; root.addEventListener('click', onClick); root.addEventListener('change', onChange); KBAsra.onChange(function () { if (UI.root && UI.root.offsetParent !== null) { try { draw(); } catch (e) {} } }); }
    draw();
  }
  global.KBAsraTeacher = { render: render, compute: compute, state: function () { return UI; }, _csv: exportCSV };
})(window);
