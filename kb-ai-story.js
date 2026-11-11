/* =====================================================================
 *  KB AI Story — AI 歷程解說
 *  把「從最初到最後」依時間順序整理好的資料交給 AI,由 AI 說明整個知識建構歷程。
 *  - 給 AI 的資料一律把學生姓名/學號換成 S01、S02… 代號。
 *  - 各頁面需先定義 window.kbAiAsk(prompt) → Promise<文字>(老師分析、學生分析各自接上自己的 AI 呼叫)。
 * ===================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;

  // AI 解說文字的共同樣式(AI 解說歷程、Ref 的 AI 診斷、AI 導師洞察都套用,讀起來一致、重點醒目)
  (function () {
    if (!doc || doc.getElementById('kb-ai-body-css')) return;
    var st = doc.createElement('style'); st.id = 'kb-ai-body-css';
    st.textContent = '.kb-ai-body{line-height:1.8;font-size:14px;color:#1e293b;word-break:break-word}' +
      '.kb-ai-body h1,.kb-ai-body h2,.kb-ai-body h3,.kb-ai-body h4{font-weight:800;color:#4c1d95;margin:16px 0 6px;line-height:1.4}' +
      '.kb-ai-body h1,.kb-ai-body h2{font-size:1.1em}.kb-ai-body h3,.kb-ai-body h4{font-size:1.03em}' +
      '.kb-ai-body>:first-child{margin-top:0}.kb-ai-body p{margin:6px 0}' +
      '.kb-ai-body ul,.kb-ai-body ol{margin:6px 0 6px 1.3em;padding:0}.kb-ai-body ul{list-style:disc}.kb-ai-body ol{list-style:decimal}.kb-ai-body li{margin:3px 0}' +
      '.kb-ai-body strong{color:#5b21b6;font-weight:800;background:linear-gradient(transparent 60%,#ede9fe 60%)}' +
      '.kb-ai-body blockquote{border-left:3px solid #c4b5fd;margin:8px 0;padding:2px 10px;color:#475569;background:#faf5ff;border-radius:0 6px 6px 0}' +
      '.kb-ai-body hr{margin:12px 0;border:0;border-top:1px dashed #ddd6fe}';
    (doc.head || doc.documentElement).appendChild(st);
  })();

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function md(t) { if (global.marked && global.marked.parse) { try { return global.marked.parse(t); } catch (e) {} } return esc(t).replace(/\n/g, '<br>'); }
  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; }
  var aiCache = {};

  // ===== AI 等待中:會轉動的沙漏 + 估計完成百分比(AI 不會回報真正的進度,所以百分比是依一般等待時間估計,慢慢趨近 95%,結果出來才跳到 100%) =====
  (function () {
    if (!doc || doc.getElementById('kb-busy-css')) return;
    var st = doc.createElement('style'); st.id = 'kb-busy-css';
    st.textContent = '.kb-busy{display:flex;align-items:center;gap:12px;padding:6px 2px;color:#5b21b6}' +
      '.kb-hg{display:inline-block;font-size:30px;line-height:1;animation:kb-hg-turn 2.4s ease-in-out infinite;transform-origin:50% 55%}' +
      '@keyframes kb-hg-turn{0%,30%{transform:rotate(0)}70%,100%{transform:rotate(180deg)}}' +
      '.kb-busy-main{flex:1;min-width:0}.kb-busy-t{font-weight:800;font-size:13px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}' +
      '.kb-busy-pct{font-variant-numeric:tabular-nums;font-weight:900;font-size:18px;color:#7c3aed}' +
      '.kb-busy-bar{height:7px;border-radius:99px;background:#ede9fe;margin-top:6px;overflow:hidden}.kb-busy-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#a78bfa,#7c3aed);border-radius:99px;transition:width .5s ease}' +
      '.kb-busy-s{font-size:10.5px;color:#7c6aa8;margin-top:4px;font-weight:500}' +
      '@media (prefers-reduced-motion:reduce){.kb-hg{animation:none}}';
    (doc.head || doc.documentElement).appendChild(st);
  })();
  function busyHtml(text) {
    return '<div class="kb-busy" role="status" aria-live="polite"><span class="kb-hg" aria-hidden="true">⏳</span><div class="kb-busy-main"><div class="kb-busy-t"><span>' + esc(text || 'AI 正在處理…') + '</span><span class="kb-busy-pct">0%</span></div><div class="kb-busy-bar"><i></i></div><div class="kb-busy-s">已等 0 秒(百分比是估計值,AI 不會回報真正進度)</div></div></div>';
  }
  global.kbAiBusy = {
    html: busyHtml,
    // 把 el 的內容換成等待畫面並開始計時;只要等待畫面被換掉(結果出來了)計時就自動停止
    show: function (el, text, o) {
      if (!el) return null; o = o || {};
      el.innerHTML = busyHtml(text);
      var root = el.querySelector('.kb-busy'), pct = root.querySelector('.kb-busy-pct'), bar = root.querySelector('.kb-busy-bar i'), sec = root.querySelector('.kb-busy-s'), t0 = o.t0 || Date.now(), tau = (o.expect || 12) * 1000 / 2.2, timer;
      function tick() {
        if (!root.isConnected) { clearInterval(timer); return; }
        var ms = Date.now() - t0, p = Math.min(95, Math.round(96 * (1 - Math.exp(-ms / tau))));
        pct.textContent = p + '%'; bar.style.width = p + '%';
        sec.textContent = '已等 ' + Math.floor(ms / 1000) + ' 秒(百分比是估計值,AI 不會回報真正進度)';
      }
      timer = setInterval(tick, 300); tick();
      return { done: function () { clearInterval(timer); if (root.isConnected) { pct.textContent = '100%'; bar.style.width = '100%'; } } };
    }
  };

  // ===== 給 AI 的共同寫法:把數據「說成故事」,連國小高年級學生也看得懂;說明方式由 AI 自己挑最貼切的 =====
  var NL = String.fromCharCode(10);
  function styleRules(forStudent, snapshot) {
    var arr = [
      '【怎麼寫】',
      '1. 先自己判斷「這個項目用哪種方式講最容易懂」(可以是說故事、生活比喻、比賽、種樹、蓋積木、搭公車…),挑一種最貼切的就好,不要同時用太多比喻。',
      '2. 開頭先給一行「🔑 一句話重點」(用粗體,一句話直接說結論,讓人不用往下讀也知道大意),再用一句話說清楚:這張圖/這個數字在看什麼。',
      '3. 重要的數字、日期、關鍵詞用粗體標出來,讓人一眼看到重點;每段最多 3~4 句。接著依時間順序,分成 3~4 個章節,每章取一個生動的小標題(例如「起步:先有問題,才有討論」),說明那段時間發生了什麼、為什麼重要、有什麼轉折;一定要引用資料裡的日期、數字與代號(如 S03),讓人看得到畫面,但不可誇大、不可編造。',
      '4. 遇到專有名詞(例如吉尼係數、昇華、網路密度)第一次出現時,馬上用括號,用小朋友聽得懂的話解釋一句。',
      '5. 最後用一小段「這代表什麼」做總結,並' + (forStudent ? '給你 2~3 個接下來可以做的具體小行動' : '給 2~3 個老師可以馬上用的具體做法(也可以提醒學生能怎麼做)') + ',同時誠實說出還需要加強的地方。',
      '6. 資料看不出來的地方,直接說「資料看不出來」,不要硬猜。',
      '【語言】國小高年級學生也看得懂:用短句、日常用字,少用艱深的詞(一定要用時要馬上解釋);繁體中文;全文約 400~650 字;用小標題與條列,每個章節最多一個 emoji;不要用表格。'
    ];
    if (snapshot) arr[3] = '3. 重要的數字、關鍵詞用粗體標出來,讓人一眼看到重點;每段最多 3~4 句。接著分成 2~3 個小標題(例如「🔍 現在的樣子」「🚧 哪裡卡住了」「🌱 接下來可以怎麼做」),說明現在的狀態、為什麼重要、有什麼值得注意;一定要引用資料裡的數字與代號(如 S03),讓人看得到畫面,但不可誇大、不可編造。';
    return arr.join(NL);
  }
  function who(forStudent) { return forStudent ? '學生本人(請用「你」稱呼,語氣溫暖、鼓勵、誠實)' : '老師(語氣溫暖、肯定、誠實)'; }
  function buildHead(kind) {
    var forStudent = global.kbAiAudience === 'student';
    if (kind === 'snapshot') {
      return [
        '你是一位很會說故事的教育顧問,熟悉知識建構 (Knowledge Building) 理論與 ASRA(用分析資料幫學生看見自己的想法、反思、訂計畫、再檢查)。下面是' + (forStudent ? '你' : '老師') + '正在看的一個項目「目前這一刻」的統計資料。學生姓名與學號一律已換成 S01、S02… 代號,請沿用代號,不要猜測真實姓名。',
        '你的任務:用自然、生動的話,向' + who(forStudent) + '解說這份資料:現在發生了什麼、哪裡值得肯定、哪裡卡住了、接下來可以怎麼做。像在跟同事聊天,讓外行人也聽得懂,不要像在念報表。',
        styleRules(forStudent, true)
      ].join(NL) + NL + NL;
    }
    return [
      '你是一位很會說故事的教育顧問,熟悉知識建構 (Knowledge Building) 理論。下面是一份「從最初到最後」依時間順序整理的資料。學生姓名與學號一律已換成 S01、S02… 代號,請沿用代號,不要猜測真實姓名。',
      '你的任務:用「說故事」的方式,向' + who(forStudent) + '介紹這段歷程如何從最初一步步發展到最後。讀起來要自然、生動、好懂,像在說一段有起承轉合的故事,而不是在念報表。',
      styleRules(forStudent)
    ].join(NL) + NL + NL;
  }
  // Ref / Ref. 視窗的 AI 解說提示詞(兩個頁面共用)
  // o = { audience:'teacher'|'student', title, meaning, current, data, timeline, question, extraRules }
  global.kbRefPrompt = function (o) {
    var forStudent = o.audience === 'student';
    var lines = [
      '你是一位很會說故事的教育顧問,熟悉知識建構 (Knowledge Building) 理論。' + (forStudent ? '學生正在查看自己的分析項目「' : '老師正在查看分析項目「') + (o.title || '') + '」,請你把它講明白。學生姓名與學號一律已換成 S01、S02… 代號,請沿用代號,不要猜測真實姓名。',
      '你的任務:用「說故事」的方式,向' + who(forStudent) + '解說這個項目,讓人讀完就懂它在看什麼、這段時間怎麼發展、現在是什麼狀態。',
      '【這個項目的意思(學理)】' + (o.meaning || ''),
      '【目前的結果】' + (o.current || ''),
      o.data ? '【背景資料】' + NL + o.data : '',
      o.timeline ? '【從最初到最後的資料(依日期)】' + NL + o.timeline : '',
      o.question ? '【' + (forStudent ? '你' : '老師') + '特別想知道】' + o.question : '',
      styleRules(forStudent),
      '【規則】只能根據上面的資料下結論並引用具體數字;資料裡沒有的就說看不出來。' + (o.extraRules || '')
    ].filter(Boolean).join(NL);
    return lines;
  };

  // ---- AI 解說框:標題列(高度 小/中/大、收合)+ 可捲動內容(右下角可拖曳調整高度)----
  var SIZES = { s: 150, m: 340, l: 640 };
  function getSize() { try { var v = global.localStorage.getItem('kb_ai_size'); return SIZES[v] ? v : 'm'; } catch (e) { return 'm'; } }
  function setSize(v) { try { global.localStorage.setItem('kb_ai_size', v); } catch (e) {} }
  function sizePx(v) { var vh = (global.innerHeight || 800) * 0.82; return Math.round(Math.min(SIZES[v], Math.max(150, vh))); }
  var BTN = 'padding:1px 8px;border-radius:6px;border:1px solid #c4b5fd;background:#fff;color:#5b21b6;font-size:11px;font-weight:700;cursor:pointer;line-height:1.6';
  function frame(panel, title) {
    if (panel.__kbf && panel.__kbf.title === title && panel.contains(panel.__kbf.body)) return panel.__kbf;
    panel.innerHTML = '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px"><div data-a="ti" style="font-weight:800;color:#5b21b6;flex:1;min-width:150px"></div>' +
      '<span style="color:#7c6aa8;font-size:11px">高度</span>' +
      '<button type="button" data-sz="s" style="' + BTN + '" title="小">小</button><button type="button" data-sz="m" style="' + BTN + '" title="中">中</button><button type="button" data-sz="l" style="' + BTN + '" title="大">大</button>' +
      '<button type="button" data-a="fold" style="' + BTN + ';margin-left:4px" title="收合/展開解說">▾ 收合</button></div>' +
      '<div data-a="bd" style="overflow:auto;resize:vertical;min-height:60px;max-height:92vh;padding-right:4px"></div>';
    var F = { title: title, body: panel.querySelector('[data-a=bd]'), folded: false };
    panel.querySelector('[data-a=ti]').textContent = '🤖 AI 解說:' + title;
    var fold = panel.querySelector('[data-a=fold]');
    function paint() {
      var cur = getSize();
      Array.prototype.forEach.call(panel.querySelectorAll('[data-sz]'), function (x) { var on = x.getAttribute('data-sz') === cur; x.style.background = on ? '#7c3aed' : '#fff'; x.style.color = on ? '#fff' : '#5b21b6'; });
      F.body.style.display = F.folded ? 'none' : 'block'; fold.textContent = F.folded ? '▸ 展開' : '▾ 收合';
    }
    Array.prototype.forEach.call(panel.querySelectorAll('[data-sz]'), function (x) { x.onclick = function () { var v = x.getAttribute('data-sz'); setSize(v); F.folded = false; F.body.style.height = sizePx(v) + 'px'; paint(); }; });
    fold.onclick = function () { F.folded = !F.folded; paint(); };
    F.body.style.height = sizePx(getSize()) + 'px'; F.paint = paint; F.unfold = function () { F.folded = false; paint(); };
    paint(); panel.__kbf = F; return F;
  }

  // AI 解說的「工作登記簿」:切換畫面、畫面被重畫(播放列與解說框會重建)時,已經在跑的 AI 解說不會中斷,
  // 切回來時解說框會接著顯示「還在等」(計時接續)或直接顯示做好的結果。
  var jobs = {}, lastRun = {};
  function runExplain(panel, title, tableFn, force, kind, owner) {
    panel.style.display = 'block';
    var F = frame(panel, title), body = F.body; F.unfold();
    if (!global.kbAiAsk) { body.innerHTML = '<span style="color:#b45309">AI 功能尚未就緒。</span>'; return; }
    var table = '';
    try { table = tableFn(); } catch (e) { if (global.console) console.error(e); }
    if (!table) { body.innerHTML = '<span style="color:#64748b">資料不足,無法產生解說。</span>'; return; }
    var key = title + '|' + table.length + '|' + hash(table);
    if (owner) lastRun[owner] = { title: title, key: key };
    function show(txt, fromCache) {
      if (global.kbAiUnscrub) txt = global.kbAiUnscrub(txt);
      body.innerHTML = '<div class="kb-ai-body">' + md(txt) + '</div>' +
        '<div style="margin-top:6px;color:#94a3b8;font-size:10px">AI 依上方資料推論,僅供教學參考;姓名已用代號取代。' + (fromCache ? '(沿用先前結果)' : '') + ' <a href="#" data-a="again" style="color:#6366f1;text-decoration:underline">重新產生</a></div>';
      var again = body.querySelector('[data-a=again]');
      if (again) again.onclick = function (e) { e.preventDefault(); runExplain(panel, title, tableFn, true, kind, owner); };
    }
    if (aiCache[key] && !force) { show(aiCache[key], true); return; }
    var job = jobs[key];
    if (!job || force || job.status === 'error') {
      job = jobs[key] = { status: 'running', t0: Date.now() };
      job.promise = Promise.resolve(global.kbAiAsk(buildHead(kind) + '【分析對象】' + title + (kind === 'snapshot' ? '\n【資料(目前這一刻)】\n' : '\n【資料(由最初到最後)】\n') + table)).then(function (txt) {
        txt = String(txt || '');
        if (!txt || txt.indexOf('⚠️') === 0) { job.status = 'error'; job.msg = txt || 'AI 沒有回應,請稍後再試。'; return job; }
        aiCache[key] = txt; job.status = 'done'; job.txt = txt; return job;
      }, function (e) { job.status = 'error'; job.msg = 'AI 解說失敗:' + ((e && e.message) || e); return job; });
    }
    // 同一份工作可以有好幾個解說框(舊的、重建後的)在等;誰還在畫面上就顯示給誰
    global.kbAiBusy.show(body, kind === 'snapshot' ? 'AI 正在整理這份資料…' : 'AI 正在從最初讀到最後,整理這段歷程…', { expect: kind === 'snapshot' ? 10 : 18, t0: job.t0 });
    var mine = job;
    mine.promise.then(function (j) {
      if (!panel.contains(body) || panel.__kbf !== F) return;                         // 這個解說框已被新的取代:交給新的那個
      if (j.status === 'done') show(j.txt, false); else body.innerHTML = '<span style="color:#b91c1c">' + esc(j.msg) + '</span>';
    });
  }

  // 在播放控制列加上「AI 解說歷程」按鈕;ex = { title, table: function → 文字資料, label?: 按鈕文字 }
  global.kbAddExplain = function (wrap, ex, id) {
    if (!wrap || !ex || !ex.table) return null;
    var btn = doc.createElement('button');
    btn.type = 'button'; btn.setAttribute('data-a', 'explain');
    btn.style.cssText = 'padding:3px 10px;border-radius:6px;background:#7c3aed;color:#fff;font-weight:700;white-space:nowrap';
    btn.textContent = ex.label || '🤖 AI 解說歷程';
    wrap.appendChild(btn);
    Array.prototype.forEach.call(doc.querySelectorAll('[data-kbai="' + (id || '') + '"]'), function (x) { x.remove(); });
    var panel = doc.createElement('div');
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    panel.setAttribute('data-kbai', id || '');
    panel.style.cssText = 'display:none;margin-top:6px;padding:10px 12px;border:1px solid #ddd6fe;background:#f5f3ff;border-radius:10px;font-size:12px;line-height:1.7;color:#334155;text-align:left';
    wrap.insertAdjacentElement('afterend', panel);
    var owner = id || ex.title;
    btn.onclick = function () { runExplain(panel, ex.title, ex.table, false, ex.kind, owner); };
    // 這個位置之前有開過 AI 解說(畫面被重畫、或切換畫面又切回來):接著顯示(還在等就繼續等、做好了就直接顯示)
    try { var lr = lastRun[owner]; if (lr && lr.title === ex.title) { var k0 = lr.key; setTimeout(function () { if (!panel.isConnected) return; var t = ''; try { t = ex.table(); } catch (e) {} if (t && ex.title + '|' + t.length + '|' + hash(t) === k0 && (jobs[k0] || aiCache[k0])) runExplain(panel, ex.title, ex.table, false, ex.kind, owner); }, 0); } } catch (e) {}
    return { panel: panel, button: btn };
  };

  // 學生姓名與學號 → S01、S02… 代號(給 AI 的資料一律用代號)
  global.kbAiIdent = function (userList) {
    var users = Object.values(userList || {}).filter(function (u) { return u && u.role !== 'teacher'; }).sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; });
    var codeOf = {}, nameOf = {}, list = [];
    users.forEach(function (u, i) {
      var c = 'S' + String(i + 1).padStart(2, '0'); codeOf[String(u.id)] = c; nameOf[c] = String(u.name || '');
      var real = '';
      try { real = String(((global.KB && global.KB.users.get(u.id)) || {}).realName || ''); } catch (e) {}
      var label = String(u.name || '');
      [real, label].forEach(function (nm) { if (nm.length >= 2) list.push({ nm: nm, c: c }); });
      if (real.length >= 3) { var g = real.slice(-2); if (g.charCodeAt(0) > 127) list.push({ nm: g, c: c }); }
      if (String(u.id).length >= 2) list.push({ nm: String(u.id), c: c });
    });
    list.sort(function (a, b) { return b.nm.length - a.nm.length; });
    var A = String.fromCharCode(1), Z = String.fromCharCode(2);
    var scrub = function (txt) {
      var o = String(txt || '');
      list.forEach(function (p, i) { o = o.split(p.nm).join(A + i + Z); });
      list.forEach(function (p, i) { o = o.split(A + i + Z).join(p.c); });
      return o;
    };
    var codes = Object.keys(nameOf).sort(function (a, b) { return b.length - a.length; });
    var unscrub = function (txt) { var o = String(txt || ''); codes.forEach(function (c) { if (nameOf[c]) o = o.split(c).join('**' + nameOf[c] + '**'); }); return o; };
    global.kbAiScrub = scrub;   // 網路圖文字表會用到
    global.kbAiUnscrub = unscrub;
    return { codeOf: codeOf, nameOf: nameOf, scrub: scrub, unscrub: unscrub };
  };

  // 時間序列圖表 → 文字表(每個標籤一列)。播放時資料會被暫時清空,所以由播放器先存一份完整資料(ds.__full)
  global.kbSeriesTable = function (chart) {
    var labels = chart.data.labels || [], rows = [];
    for (var i = 0; i < labels.length; i++) {
      var parts = [];
      chart.data.datasets.forEach(function (ds) {
        var f = ds.__full || ds.data;
        if (ds.type === 'scatter' || !f || f[i] === undefined || f[i] === null || typeof f[i] === 'object') return;
        parts.push((ds.label || '數值') + '=' + (Math.round(Number(f[i]) * 100) / 100));
      });
      rows.push(labels[i] + ':' + parts.join(';'));
    }
    return rows.join('\n');
  };

  // 網路圖播放項目 → 文字表(只取每個發文日結束時的畫面)
  global.kbNetworkTable = function (o) {
    var rows = [], prev = {}, steps = o.steps || [], labels = o.labels || [], scrub = global.kbAiScrub || function (x) { return x; };
    for (var i = 0; i < labels.length; i++) {
      if (i > 0 && /\(/.test(String(labels[i]))) continue;      // 略過同一天的中間小步
      var f = o.build(o.steps ? steps[i] : i), cur = {}, added = [];
      f.nodes.forEach(function (n) {
        var key = String(n.id); cur[key] = 1;
        if (!prev[key]) added.push(scrub(String(n.label || n.id).replace(/\n[\s\S]*/, '')));
      });
      rows.push(labels[i] + ':節點 ' + f.nodes.length + ' 個、連線 ' + f.edges.length + ' 條' + (added.length && f.nodes.length < 60 ? ';新出現:' + added.slice(0, 8).join('、') : ''));
      prev = cur;
    }
    return rows.join('\n');
  };

  // 依發文日整理「從最初到最後」的貼文歷程(全班,或單一學生)
  // o = { nodes:[{id,author,parentId,type,title,content,date}], userId?, codeOf, scrub }
  global.kbStoryTable = function (o) {
    var nodes = o.nodes.slice().sort(function (a, b) { return a.date - b.date; }), byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    var days = global.kbMakeDays(nodes.map(function (n) { return n.date; })), me = o.userId == null ? null : String(o.userId);
    var TYPE = { question: '提問', extend: '延伸', improve: '改進', counter: '反例', riseabove: '整合' };
    var PRI = { riseabove: 0, improve: 1, counter: 2, question: 3, extend: 4 };
    var rows = [], cumPosts = 0, pairs = {}, partners = {};
    days.labels.forEach(function (lb, k) {
      var day = nodes.filter(function (n) { return days.index(n.date) === k; });
      var mine = me ? day.filter(function (n) { return String(n.author) === me; }) : day;
      var ty = {}, authors = {}, outReplies = 0, inReplies = 0;
      mine.forEach(function (n) { ty[n.type] = (ty[n.type] || 0) + 1; authors[n.author] = 1; });
      day.forEach(function (n) {
        var p = n.parentId ? byId[n.parentId] : null;
        if (!p || String(p.author) === String(n.author)) return;
        if (!me) { pairs[n.author + '>' + p.author] = 1; outReplies++; }
        else if (String(n.author) === me) { partners[p.author] = 1; outReplies++; }
        else if (String(p.author) === me) { partners[n.author] = 1; inReplies++; }
      });
      cumPosts += mine.length;
      var samples = mine.slice().sort(function (a, b) { return (PRI[a.type] === undefined ? 9 : PRI[a.type]) - (PRI[b.type] === undefined ? 9 : PRI[b.type]); })
        .slice(0, me ? 2 : 3).map(function (n) {
          var tx = String((n.title || '') + ':' + (n.content || '')).replace(/\s+/g, ' ').slice(0, 46);
          return '[' + (TYPE[n.type] || n.type) + ']' + (o.scrub ? o.scrub(tx) : tx);
        });
      rows.push(lb + ':新增貼文 ' + mine.length + ' 篇(累計 ' + cumPosts + ');類型 ' + Object.keys(ty).map(function (t) { return (TYPE[t] || t) + ty[t]; }).join('、') + ';' +
        (me ? '我回應別人 ' + outReplies + ' 次、別人回應我 ' + inReplies + ' 次、累計互動過 ' + Object.keys(partners).length + ' 位同學'
            : '當天發言 ' + Object.keys(authors).length + ' 人、跨人回應 ' + outReplies + ' 次、累計不同的互動連線 ' + Object.keys(pairs).length + ' 條') +
        (samples.length ? ';代表貼文:' + samples.join(' / ') : ''));
    });
    return rows.join('\n');
  };
})(typeof window !== 'undefined' ? window : globalThis);
