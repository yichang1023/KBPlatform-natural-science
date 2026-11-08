/* =====================================================================
 *  KB Replay — 各項目自己的「動態播放」(老師分析、學生分析共用)
 *  1) kbAttachSeriesPlayer:時間序列圖表(折線/面積)由左到右逐步長出來,從「起點」(空白)開始
 *  2) kbAttachReplay:累積型項目(分布圖、雷達圖、時間軸…)從「起點」(尚無任何貼文)開始,
 *     依發文日逐日累積,每個項目各自有播放鈕,只看想看的那一項。
 *  網路圖的播放(起點只有自己)在各頁面的 kbAttachPlayer。
 * ===================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;
  var SPEEDS = [0.5, 1, 2, 4, 8];
  function lsGet(k, d) { try { var v = global.localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- 共用:播放控制列 ---------- */
  function controls(opts) {
    var wrap = doc.createElement('div');
    wrap.setAttribute('data-kbnet', opts.id);
    wrap.addEventListener('click', function (e) { e.stopPropagation(); });
    wrap.style.cssText = opts.style || 'grid-column:1/-1;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:11px;color:#334155';
    var SP = opts.speeds || SPEEDS, speed = Number(lsGet('kb_net_speed', '1')); if (SP.indexOf(speed) < 0) speed = 1;
    wrap.innerHTML = '<button type="button" data-a="play" style="padding:3px 10px;border-radius:6px;background:#4f46e5;color:#fff;font-weight:700;white-space:nowrap">▶ 播放</button>' +
      '<button type="button" data-a="sprev" title="回到上一步" style="padding:3px 9px;border-radius:6px;background:#e0e7ff;color:#3730a3;font-weight:700;white-space:nowrap">◀ 上一步</button><button type="button" data-a="snext" title="前進到下一步" style="padding:3px 9px;border-radius:6px;background:#e0e7ff;color:#3730a3;font-weight:700;white-space:nowrap">下一步 ▶</button>' +
      (opts.stepper ? '<button type="button" data-a="prev" style="padding:3px 9px;border-radius:6px;background:#fce7f3;color:#9d174d;font-weight:700;white-space:nowrap">◀ 上一天</button><button type="button" data-a="next" style="padding:3px 9px;border-radius:6px;background:#fce7f3;color:#9d174d;font-weight:700;white-space:nowrap">下一天 ▶</button>' : '') +
      '<input type="range" data-a="seek" min="0" max="' + opts.max + '" value="' + opts.max + '" style="flex:1;min-width:90px">' +
      '<span data-a="label" style="min-width:' + (opts.labelWidth || 44) + 'px;font-weight:700;text-align:center"></span>' +
      '<label style="display:flex;align-items:center;gap:3px;white-space:nowrap">速度 <select data-a="speed" style="border:1px solid #cbd5e1;border-radius:4px;padding:1px 3px;background:#fff;color:#0f172a">' +
      SP.map(function (s) { return '<option value="' + s + '"' + (s === speed ? ' selected' : '') + '>' + s + 'x</option>'; }).join('') + '</select></label>';
    return { wrap: wrap, speed: function () { return Number(wrap.querySelector('[data-a=speed]').value) || 1; }, saveSpeed: function (v) { lsSet('kb_net_speed', String(v)); } };
  }

  /* ---------- 歷程說明:圖例 + 即時說明 + 只增不減的歷程清單(所有播放項目共用) ---------- */
  var gcssDone = false;
  function guideCss() {
    if (gcssDone || !doc.head) return; gcssDone = true;
    var s = doc.createElement('style'); s.id = 'kbg-css';
    s.textContent = [
      '.kbg{margin-top:8px;border:1px solid #e0e7ff;border-radius:12px;background:#fff;font-size:12px;line-height:1.7;color:#334155;text-align:left;font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif}',
      '.kbg summary{cursor:pointer;font-weight:800;padding:6px 10px;color:#4338ca;list-style:none}.kbg summary::-webkit-details-marker{display:none}',
      '.kbg summary:before{content:"▸ ";color:#818cf8}.kbg details[open]>summary:before{content:"▾ "}',
      '.kbg-hb{padding:0 12px 8px;color:#475569}.kbg-hb b{color:#1e293b}',
      '.kbg-now{margin:0 8px 8px;padding:8px 10px;border-radius:10px;background:#eef2ff;border:1px solid #c7d2fe;min-height:52px;color:#1e293b}',
      '.kbg-now b{color:#3730a3}.kbg-d{font-size:11px;font-weight:700;margin-left:1px}.kbg-up{color:#059669}.kbg-dn{color:#e11d48}',
      '.kbg-lw{margin:0 8px 8px}.kbg-lt{font-weight:800;font-size:11.5px;color:#4338ca;margin-bottom:4px}',
      '.kbg-log{max-height:150px;overflow:auto;resize:vertical;padding-right:4px}',
      '.kbg-e{display:block;width:100%;text-align:left;margin:0 0 4px;padding:4px 8px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;font-size:11.5px;line-height:1.6;color:#334155;cursor:pointer}',
      '.kbg-e:hover{background:#f5f3ff;border-color:#a5b4fc}.kbg-e.on{background:#eef2ff;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.15)}.kbg-e b{color:#3730a3}'
    ].join('\n');
    doc.head.appendChild(s);
  }
  function gesc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // 兩段文字除了數字以外都一樣 → 把有變的數字加粗並標出增減;否則直接顯示新的文字
  function diffHtml(cur, prev) {
    cur = String(cur == null ? '' : cur); prev = prev == null ? null : String(prev);
    if (!cur) return { html: '', changed: false };
    if (prev === null || prev === '') return { html: gesc(cur), changed: true };
    if (cur === prev) return { html: gesc(cur), changed: false };
    var re = /(-?\d+(?:\.\d+)?)/, a = cur.split(new RegExp(re.source, 'g')), b = prev.split(new RegExp(re.source, 'g'));
    var same = a.length === b.length; for (var i = 0; same && i < a.length; i += 2) if (a[i] !== b[i]) same = false;
    if (!same) return { html: gesc(cur), changed: true };
    var out = '', ch = false;
    for (var j = 0; j < a.length; j++) {
      if (j % 2 === 0) { out += gesc(a[j]); continue; }
      if (a[j] === b[j]) { out += gesc(a[j]); continue; }
      var d = Math.round((Number(a[j]) - Number(b[j])) * 100) / 100; ch = true;
      out += '<b>' + gesc(a[j]) + '</b><span class="kbg-d ' + (d > 0 ? 'kbg-up' : 'kbg-dn') + '">(' + (d > 0 ? '▲' : '▼') + Math.abs(d) + ')</span>';
    }
    return { html: out, changed: ch };
  }
  // cfg: { id, labels:[起點,…], how?, state(k)→文字, say?(k, prevK)→html|null, isDay?(k), start?, intro?, jump(k) }
  global.kbGuide = function (wrap, cfg) {
    if (!wrap || !cfg || !cfg.labels || cfg.guide === false) return null;
    guideCss();
    var how = cfg.how != null ? cfg.how : (global.kbHow && global.kbHow[cfg.id]);
    Array.prototype.forEach.call(doc.querySelectorAll('[data-kbguide="' + cfg.id + '"]'), function (x) { x.remove(); });
    var box = doc.createElement('div'); box.className = 'kbg'; box.setAttribute('data-kbguide', cfg.id);
    box.addEventListener('click', function (e) { e.stopPropagation(); });
    var key = 'kb_how_' + cfg.id, open = lsGet(key, '1') !== '0';
    box.innerHTML = (how ? '<details class="kbg-how"' + (open ? ' open' : '') + '><summary>📖 怎麼看這個圖?</summary><div class="kbg-hb">' + how + '</div></details>' : '') +
      '<div class="kbg-now" aria-live="polite"></div><div class="kbg-lw" style="display:none"><div class="kbg-lt"></div><div class="kbg-log" tabindex="0" role="log"></div></div>';
    wrap.insertAdjacentElement('afterend', box);
    var det = box.querySelector('details'); if (det) det.addEventListener('toggle', function () { lsSet(key, det.open ? '1' : '0'); });
    var now = box.querySelector('.kbg-now'), lw = box.querySelector('.kbg-lw'), lt = box.querySelector('.kbg-lt'), log = box.querySelector('.kbg-log');
    var cache = {}, lines = {}, userAt = 0, lastN = -1;
    ['wheel', 'touchmove', 'mousedown'].forEach(function (ev) { log.addEventListener(ev, function () { userAt = Date.now(); }, { passive: true }); });
    function isDay(k) { return cfg.isDay ? cfg.isDay(k) : true; }
    function st(k) { if (cache[k] === undefined) { var v = ''; try { v = cfg.state(k); } catch (e) { if (global.console) console.error(e); } cache[k] = v == null ? '' : String(v); } return cache[k]; }
    function prevDay(k) { var j = k - 1; while (j > 0 && !isDay(j)) j--; return Math.max(0, j); }
    function lineOf(k, pj) {
      if (cfg.say) { var s = null; try { s = cfg.say(k, pj); } catch (e) { if (global.console) console.error(e); } if (s) return s; if (cfg.say.only) return null; }
      var d = diffHtml(st(k), st(pj)); return d.changed ? d.html : null;
    }
    function dayLine(k) { if (lines[k] === undefined) lines[k] = lineOf(k, prevDay(k)); return lines[k]; }
    function paintLog(k) {
      var items = []; for (var j = 1; j <= k && j < cfg.labels.length; j++) { if (!isDay(j)) continue; var h = dayLine(j); if (h) items.push({ k: j, html: h }); }
      if (!items.length) { lt.textContent = '📜 歷程說明:目前還沒有變化'; log.innerHTML = ''; lastN = 0; return; }
      var cur = -1; for (var q = 0; q < items.length; q++) if (items[q].k <= k) cur = items[q].k;
      lt.textContent = '📜 歷程說明(到目前共 ' + items.length + ' 筆,只增不減;點一下回到那個時候)';
      log.innerHTML = items.map(function (e) { return '<button type="button" class="kbg-e' + (e.k === cur && isDay(k) ? ' on' : '') + '" data-k="' + e.k + '"><b>' + gesc(cfg.labels[e.k]) + '</b> ' + e.html + '</button>'; }).join('');
      if (items.length > lastN && lastN >= 0 && Date.now() - userAt > 3000) log.scrollTop = log.scrollHeight;
      lastN = items.length;
    }
    log.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('[data-k]') : null; if (b && cfg.jump) cfg.jump(Number(b.getAttribute('data-k'))); });
    var api = {
      box: box,
      init: function () { now.innerHTML = cfg.intro || '👆 <b>按下 ▶ 播放</b>:一步一步看它怎麼變化,這裡會即時說明「現在發生了什麼」,看過的說明會留在下面,不會消失。'; },
      update: function (k) {
        lw.style.display = 'block';
        if (k <= 0) now.innerHTML = cfg.start || '🌰 <b>起點</b>:還沒有任何貼文,一切從這裡開始。按 ▶ 或拖動進度條,看它一步一步長出來。';
        else {
          var h = lineOf(k, k - 1);
          now.innerHTML = '<b>' + gesc(cfg.labels[k]) + '</b> ' + (h || ('這一步沒有新的變化。' + (st(k) ? '目前:' + gesc(st(k)) : '')));
        }
        paintLog(k);
      }
    };
    api.init();
    return api;
  };
  // 網路圖:新加入的節點、長出的連線、變粗的線
  global.kbNetGuide = function (wrap, o) {
    if (!wrap || !o || !o.build || !o.labels || o.guide === false) return null;
    var frames = {}, N = o.labels.length;
    function fr(k) { if (!frames[k]) frames[k] = o.build(o.steps ? o.steps[k] : k); return frames[k]; }
    function nm(n) { return String(n.label == null ? n.id : n.label).split(String.fromCharCode(10))[0]; }
    var cnt = /\((\d+)\)\s*$/;
    function counted(f) { return f.nodes.length > 0 && f.nodes.every(function (n) { return cnt.test(String(n.label)); }); }
    var isCount = false; try { isCount = counted(fr(N - 1)); } catch (e) {}
    function list(a, m) { var s = a.slice(0, m).map(gesc).join('、'); return s + (a.length > m ? ' 等 ' + a.length + ' 個' : ''); }
    return global.kbGuide(wrap, {
      id: o.id, labels: o.labels, how: o.how, jump: o.jump, guide: o.guide,
      isDay: function (k) { return k > 0 && !/\(/.test(String(o.labels[k])); },
      start: o.start || '🌰 <b>起點</b>:還沒有任何互動,畫面上只有最初的樣子。按 ▶ 看它一步一步長出來。',
      state: function (k) {
        var f = fr(k);
        if (isCount) return f.nodes.map(function (n) { var m = cnt.exec(String(n.label)); return nm(n).replace(/\s*\(\d+\)\s*$/, '') + ' ' + (m ? m[1] : ''); }).join('、');
        return '節點 ' + f.nodes.length + ' 個、連線 ' + f.edges.length + ' 條';
      },
      say: isCount ? null : function (k, pj) {
        var f = fr(k), p = fr(pj), pn = {}, pe = {}, lab = {};
        p.nodes.forEach(function (n) { pn[n.id] = 1; lab[n.id] = nm(n); }); p.edges.forEach(function (e) { pe[e.id] = e; });
        f.nodes.forEach(function (n) { lab[n.id] = nm(n); });
        var addN = f.nodes.filter(function (n) { return !pn[n.id]; }), addE = f.edges.filter(function (e) { return !pe[e.id]; });
        var thick = f.edges.filter(function (e) { return pe[e.id] && (e.width || 0) > (pe[e.id].width || 0) + 1e-9; });
        if (!addN.length && !addE.length && !thick.length) return null;
        var parts = [];
        if (addN.length) parts.push('新加入 <b>' + addN.length + '</b> 個:' + list(addN.map(nm), 5));
        if (addE.length) parts.push('長出 <b>' + addE.length + '</b> 條新連線:' + list(addE.map(function (e) { return (lab[e.from] || e.from) + (e.arrows === '' ? '—' : '→') + (lab[e.to] || e.to); }), 4));
        if (thick.length) parts.push(thick.length + ' 條線變粗了(互動變多)');
        parts.push('現在共 ' + f.nodes.length + ' 個節點、' + f.edges.length + ' 條連線');
        return parts.join(';');
      }
    });
  };

  /* ---------- 每個項目的「怎麼看」(圖例說明) ---------- */
  var C = { q: '<b style="color:#2563eb">藍=提問</b>', e: '<b style="color:#ca8a04">黃=延伸</b>', i: '<b style="color:#16a34a">綠=改進</b>', c: '<b style="color:#dc2626">紅=反駁</b>', r: '<b style="color:#9333ea">紫=整合</b>' };
  global.kbHow = {
    // ---- 學生分析 ----
    's-role': '下面四條能力棒:<b>開創力</b>(提出新問題、新想法)、<b>連結力</b>(回應並接上別人的想法)、<b>整合力</b>(把零散的想法合成新觀點)、<b>維護力</b>(持續關心、延續討論)。棒越長,代表你越常做這件事;最長的那一項,決定你的「知識角色」。<br><b>為什麼一開始很短?</b>發文還少的時候,只靠一兩篇看不出你的特色,所以分數會先打折;發滿 10 篇才算滿,棒子會隨著你發文慢慢長長。',
    's-cards': '四張數字卡都是「累積數字」,只會越來越多:<b>發文貢獻</b>=你寫了幾則;<b>閱讀他人</b>=你在論壇點開看過幾則別人的想法(真實紀錄,同一則只算一次);<b>觀點連結</b>=你回應別人幾次;<b>社群影響力</b>=別人回應你幾次。',
    's-radar': '五個角度的能力雷達:<b>開創力、連結力、整合力、維護力、影響力</b>。越往外圈代表越強,圖形越大、越圓,就是你的能力越突出、越均衡。<br><b>為什麼一開始很小?</b>發文還少的時候,分數會先打折(發滿 10 篇才算滿),所以圖形會從小小的一圈,隨著發文慢慢長大。',
    's-bars': '五種發言方式(鷹架):提問、延伸、改進、反駁、整合。棒子越長,代表你用得越多。多用不同的方式,想法才會從「一個問題」慢慢長成「新的觀點」。',
    's-timeline': '每一張卡片是你的<b>一則發言</b>,依時間排列;圖示和顏色代表發言的類型(提問、改進、整合…)。播放時,卡片會一則一則加進來,就是你的想法一步一步走過的路。',
    's-diversity': '「觀點多樣性」=你參與了<b>幾條不同的討論串</b>。條數越多,下面的棒子越滿,代表你接觸、貢獻的觀點越多元。',
    's-path': '「認知路徑長度」=你的發言平均在討論串的<b>第幾層</b>。第 1 層是直接回應主貼文,層數越大,代表你越常接著別人的回應繼續往下討論;下面連在一起的圓點,就是這條「想法接力」的長度。',
    's-lexical': '「語義深度」看你用的字:<b>LV.1</b> 日常用語(我覺得…)、<b>LV.2</b> 邏輯推演(因為…所以…)、<b>LV.3</b> 學術與整合用語(理論顯示…、總結是…)。等級越高,表達越像在做研究。',
    's-concept': '一朵會長大的雲:<b>字越大</b>=用越多次;<b>顏色</b>=這個想法現在的狀態(藍=提問中、黃=被延伸、綠=改進中、紅=被質疑、紫=已整合),★ 是轉折點(被質疑後你用改進或昇華回應);<b>虛線</b>連起常一起出現的詞。點一個詞,看它怎麼一路變過來,還能回到原本的貼文;滾輪或右下角按鈕可以放大縮小,拖曳移動,⟲ 還原。',
    's-lineage': '這張卡片追蹤你<b>最能引出討論的那個想法</b>:最上面是「初始觀點種子」,下面依層數列出每一層的回應(第 1 層是直接回應你的人)。層數越深、篇數越多,代表你的想法被討論得越久。',
    'ego-s': '<b style="color:#4f46e5">大的靛色圓點是你</b>,灰色圓點是跟你互動過的同學。線是「誰回應了誰」,<b>箭頭</b>從回應的人指向被回應的人,<b>線越粗</b>代表回應越多次;線的顏色是回應類型(' + C.q + '、' + C.e + '、' + C.i + '、' + C.c + '、' + C.r + '),灰色細線是這些同學彼此之間的互動。',
    // ---- 老師分析 ----
    'seq': '這是一張「接龍表」:<b>左邊</b>是前一則發言的類型,<b>上面</b>是接下來回應的類型,格子裡的百分比是「前一則是這種類型時,下一則最常接哪一種」。<b>顏色越深、數字越大</b>,代表這種接法越常發生。例如「提問 → 延伸 60%」,就是被問了問題之後,多數人會接著延伸。',
    'brokers': '「知識經紀人」是班上的<b>橋樑</b>:他連起原本不太互相說話的同學或小組。分數(中介中心性)越高,代表越多互動要經過他才連得起來。播放時,看看誰先出現、排名怎麼改變。',
    'kpi': '五個班級脈動數字:<b>總貼文</b>、<b>網路密度</b>(同學之間連線有多緊密,0~1)、<b>昇華率</b>(整合型貼文的比例)、<b>發言吉尼係數</b>(越接近 0 代表發言越平均,越接近 1 越集中在少數人)、<b>平均討論串深度</b>(討論平均接了幾層)。',
    'traj': '兩條折線是全班的<b>累積量</b>:一條是提出的問題,一條是發展出的理論。線越往上爬,代表累積越多;兩條線的距離,就是「問題」和「理論」誰跑得比較快。',
    'sna': '每個<b>圓點是一位同學</b>(顏色只是用來分辨人),<b>圓點越大</b>代表累計發文越多。<b>線</b>是「誰回應了誰」,<b>箭頭</b>從回應的人指向被回應的人,<b>線越粗</b>代表回應越多次。位在中間、連線很多的人,就是討論的中心。',
    'principles': '圓環圖是五種發言類型的比例:' + C.q + '、' + C.e + '、' + C.i + '、' + C.c + '、' + C.r + '。哪一種色塊越大,代表班上越常出現這種發言。',
    'kb12radar': '雷達圖有六個方向(KB 12 原則的重點):<b>觀點多樣性、集體責任、真實問題、權威資料、觀點改進、民主化</b>,依實際貼文換算成分數。越往外圈代表落實得越好,圖形越大越完整。<br><b>為什麼一開始很小?</b>討論才剛開始、貼文還少的時候,比例不準,所以分數會先打折(全班貼文累積到「人數×2」篇才算滿),圖形會隨討論變多慢慢長大。',
    'lens': '四個圓代表四類想法:<b style="color:#64748b">灰=事實</b>、<b style="color:#2563eb">藍=理論</b>(延伸/改進)、<b style="color:#ca8a04">黃=挑戰</b>(反駁)、<b style="color:#16a34a">綠=整合</b>。<b>圓越大</b>代表這類貼文越多(括號裡是篇數);箭頭是對話常見的走向:事實 → 理論 → 挑戰 → 整合。',
    'concept': '每個圓點是一個<b>關鍵詞</b>,兩個詞常常<b>一起出現</b>就會連起來;連得越多的詞,越是討論的中心概念。紅色是熱點觀點。播放時,看詞怎麼一個一個長出來、連起來。',
    'lexical': '折線是班上「知識詞彙」的<b>累積量</b>:每多出現一個專業、知識用語就往上爬一點。線越陡,代表全班用詞進步得越快。',
    'promising': '每個點是<b>一則貼文</b>。越往右,代表被越多人回應(<b>關注度</b>越高);越往上,代表越是提問、整合、改進這類會帶來<b>認知落差</b>的想法。<b style="color:#dc2626">紅點是提問</b>,<b style="color:#2563eb">藍點是其他</b>。右上角的點,最有繼續討論的潛力。',
    'evotimeline': '一則一則依時間排下來的貼文卡片:圖示與顏色代表類型(<b style="color:#dc2626">紅=提問</b>、<b style="color:#16a34a">綠=改進</b>、<b style="color:#9333ea">紫=整合</b>)。從上往下看,就是想法從發散走向整合的過程。',
    'stream': '像一條河:每種顏色是一種發言(<b style="color:#dc2626">紅=提問</b>、<b style="color:#2563eb">藍=延伸</b>、<b style="color:#16a34a">綠=深化</b>、<b style="color:#9333ea">紫=整合</b>),疊起來的<b>厚度</b>就是那一天各類發言的數量。<b>白色圓點</b>是當天的「關鍵發言」。',
    'impact': '每個點是<b>一位同學</b>:越往右=發文越多,越往上=被回應越多。以全班平均分成四區:<b style="color:#d97706">🌟 核心領袖</b>(發得多也被回應多)、<b style="color:#059669">💡 高效影響</b>(發得少但常被回應)、<b style="color:#2563eb">📝 獨立貢獻</b>(發得多但少人回應)、<b style="color:#64748b">👀 邊緣參與</b>。',
    'fingerprint': '每一根直條是一位同學(第一根是全班平均),分成四種顏色:' + C.q + '、' + C.e + '、' + C.i + '、' + C.r + ',代表他的發言各佔幾 %。顏色比例不一樣,就是每個人不同的「思考指紋」。',
    'kb12check': '逐項檢查 KB 12 原則有沒有達標:<b>達標</b>的項目會打勾,其餘代表還需要加強。播放時,看哪幾項是從哪一天開始變成達標的。',
    'ego-t': '<b style="color:#4f46e5">大的靛色圓點是這位學生</b>,灰色圓點是跟他互動過的同學。<b>箭頭</b>從回應的人指向被回應的人,<b>線越粗</b>代表回應越多次;線的顏色是回應類型(' + C.q + '、' + C.e + '、' + C.i + '、' + C.c + '、' + C.r + '),灰色細線是這些同學彼此之間的互動。',
    'stu-radar': '雷達圖的五個方向:<b>主體性、社群互動、觀點改進、昇華整合、持續探究</b>。越往外圈代表這位同學在這方面越強,圖形越大越均衡。<br><b>為什麼一開始很小?</b>這位同學發文還少的時候,分數會先打折(發滿 10 篇才算滿),所以圖形會隨他發文慢慢長大。',
    'stu-balance': '甜甜圈分成兩段:<b style="color:#2563eb">藍=自主</b>(自己發起的想法)、<b style="color:#16a34a">綠=協作</b>(回應別人的想法)。看他是自己提想法比較多,還是跟大家一起討論比較多。',
    'stu-depth': '依討論的深淺分成五個階段,看這位同學的發言落在哪些深度。階段越深,代表越能把討論往下推進、不只停在表面。',
    'stu-keywords': '這位同學常用的<b>概念詞彙</b>;出現越多次的詞越明顯。詞彙一天一天變多、變豐富,就是他的「詞彙指紋」。',
    'emotion': '把發言的語氣分成四種情緒:<b>好奇、困惑、驚訝、中性</b>,每一塊是各佔幾 %。好奇和困惑常常是學習最好的起點。',
    'lexgrow': '兩條線:<b>學術語言</b>和<b>生活語言</b>的使用量累積。學術的線爬得比生活的線快,代表討論越來越「像在做研究」。',
    'scaffold-trans': '這是「接續表」:<b>左邊</b>是前一則的鷹架類型,<b>上面</b>是接下來回應的類型,格子越深、數字越大,代表這種接法越常見。例如「提問 → 延伸」很大,就是問題後面常有人接著延伸。'
  };

  /* ---------- 1) 時間序列圖表逐步長出來 ---------- */
  var seriesPlayers = {};
  global.kbAttachSeriesPlayer = function (o) {
    var chart = o.chart;
    if (global.__kbReplaying || !chart || !chart.data || !chart.canvas) return null;
    if (seriesPlayers[o.id]) seriesPlayers[o.id].destroy();
    var labels = (chart.data.labels || []).slice(), M = labels.length;
    if (M < 2) return null;
    var full = chart.data.datasets.map(function (d) { return d.data.slice(); });
    chart.data.datasets.forEach(function (d, i) { d.__full = full[i]; });   // 給 AI 解說用的完整資料
    // 先固定座標軸範圍,播放時圖才不會一直縮放跳動
    try {
      chart.options.scales = chart.options.scales || {};
      Object.keys(chart.scales).forEach(function (id) { var sc = chart.scales[id]; if (sc.type === 'linear') chart.options.scales[id] = Object.assign({}, chart.options.scales[id] || {}, { min: sc.min, max: sc.max }); });
    } catch (e) {}
    var st = { k: M, playing: false, timer: null, gone: false };
    var ui = controls({ id: o.id, max: M, speeds: o.slow ? [0.25, 0.5, 1, 2, 4] : null });
    var anchor = o.anchor || chart.canvas.parentElement;
    Array.prototype.forEach.call(doc.querySelectorAll('[data-kbnet="' + o.id + '"]'), function (x) { x.remove(); });
    anchor.insertAdjacentElement('afterend', ui.wrap);
    if (o.explainTitle && global.kbAddExplain) global.kbAddExplain(ui.wrap, { title: o.explainTitle, table: function () { return global.kbSeriesTable(chart); } }, o.id);
    var guide = (o.guide === false) ? null : global.kbGuide(ui.wrap, { id: o.id, how: o.how, labels: ['起點'].concat(labels.map(String)), jump: function (k) { render(k); },
      state: function (k) { if (k <= 0) return ''; var parts = []; chart.data.datasets.forEach(function (ds, di) { var f = full[di]; if (!f || ds.type === 'scatter') return; var v = f[k - 1]; if (v === null || v === undefined || typeof v === 'object') return; parts.push((ds.label || '數值') + ' ' + (Math.round(Number(v) * 100) / 100)); }); return parts.join('、'); } });
    var btn = ui.wrap.querySelector('[data-a=play]'), seek = ui.wrap.querySelector('[data-a=seek]'), label = ui.wrap.querySelector('[data-a=label]'), spSel = ui.wrap.querySelector('[data-a=speed]');
    function alive() { return !st.gone && chart.canvas && chart.canvas.isConnected !== false && chart.data; }
    function render(k) {
      if (!alive()) return;
      st.k = k;
      chart.data.datasets.forEach(function (ds, di) {
        var f = full[di];
        if (f.length && f[0] !== null && typeof f[0] === 'object' && f[0].x !== undefined) ds.data = f.filter(function (p) { return labels.indexOf(p.x) < k; }); // 散點(關鍵發言)
        else ds.data = f.map(function (v, j) { return j < k ? v : null; });
      });
      if (o.onStep) { try { o.onStep(k, chart); } catch (e) { if (global.console) console.error(e); } }
      chart.update('none');
      if (guide) guide.update(k);
      seek.value = k; label.textContent = k === 0 ? '起點' : String(labels[k - 1]);
    }
    // 有「即時說明」的圖表放慢,遇到重點(o.hold)多停一下,讓人看得完說明
    function delay() { var base = o.baseDelay || Math.max(150, Math.min(900, 16000 / M)), extra = 0; try { extra = o.hold ? (o.hold(st.k) || 0) : 0; } catch (e) {} return (base + extra) / ui.speed(); }
    function setPlaying(p) { st.playing = p; btn.textContent = p ? '⏸ 暫停' : '▶ 播放'; if (!p) { clearTimeout(st.timer); st.timer = null; } }
    function tick() { if (!st.playing || !alive()) { setPlaying(false); return; } if (st.k >= M) { setPlaying(false); return; } render(st.k + 1); if (st.k >= M) setPlaying(false); else st.timer = setTimeout(tick, delay()); }
    function play() { if (!alive()) return; if (st.k >= M) render(0); setPlaying(true); st.timer = setTimeout(tick, delay()); }
    btn.onclick = function () { if (st.playing) setPlaying(false); else play(); };
    seek.oninput = function () { setPlaying(false); render(Number(seek.value)); };
    spSel.onchange = function () { ui.saveSpeed(Number(spSel.value)); };
    // 一步一步看:上一步 / 下一步(會先暫停播放)
    ui.wrap.querySelector('[data-a=sprev]').onclick = function () { setPlaying(false); render(Math.max(0, st.k - 1)); };
    ui.wrap.querySelector('[data-a=snext]').onclick = function () { setPlaying(false); render(Math.min(M, st.k + 1)); };
    label.textContent = String(labels[M - 1]);
    var api = { destroy: function () { st.gone = true; clearTimeout(st.timer); if (ui.wrap.parentNode) ui.wrap.parentNode.removeChild(ui.wrap); }, play: play, goto: render, state: st };
    seriesPlayers[o.id] = api;
    if (lsGet('kb_net_autoplay', '0') === '1' && !global.__kbReplayActive) setTimeout(function () { if (alive() && !st.playing) { render(0); play(); } }, 700);
    return api;
  };

  /* ---------- 2) 累積型項目:依發文日逐日累積 ---------- */
  var replayPlayers = {};
  // o: { id, anchor(控制列放在這個元素後面), labels:['起點', 第1天, 第2天…], render(step) }  step=0 是起點
  global.kbAttachReplay = function (o) {
    var L = o.labels.length; if (global.__kbReplaying || L < 2 || !o.anchor) return null;
    if (replayPlayers[o.id]) replayPlayers[o.id].destroy();
    var st = { k: L - 1, playing: false, timer: null, gone: false };
    var ui = controls({ id: o.id, max: L - 1, labelWidth: o.labelWidth || 54, stepper: o.stepper, speeds: o.slow ? [0.25, 0.5, 1, 2, 4] : null });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-kbnet="' + o.id + '"]'), function (x) { x.remove(); });
    if (o.inside) o.anchor.appendChild(ui.wrap); else o.anchor.insertAdjacentElement('afterend', ui.wrap);
    if (o.explainTitle && global.kbAddExplain) global.kbAddExplain(ui.wrap, { title: o.explainTitle, table: function () { return o.labels.map(function (lb, i) { var v = ''; try { v = o.values ? o.values(i) : ''; } catch (e) {} return lb + ':' + v; }).join(String.fromCharCode(10)); } }, o.id);
    var guide = (o.guide === false || !(o.values || o.say)) ? null : global.kbGuide(ui.wrap, { id: o.id, how: o.how, labels: o.labels, say: o.say, jump: function (k) { render(k); }, state: function (k) { return o.values ? o.values(k) : ''; } });
    var btn = ui.wrap.querySelector('[data-a=play]'), seek = ui.wrap.querySelector('[data-a=seek]'), label = ui.wrap.querySelector('[data-a=label]'), spSel = ui.wrap.querySelector('[data-a=speed]');
    function alive() { return !st.gone && o.anchor.isConnected !== false; }
    // 先算歷程說明(算數字時有些項目會順便重畫畫面),最後才畫「目前這一步」,畫面才不會停在別天
    function render(k) { if (!alive()) return; st.k = k; if (guide) guide.update(k); try { o.render(k); } catch (e) { if (global.console) console.error(e); } seek.value = k; label.textContent = String(o.labels[k]); }
    // 每一步停留的時間:有「歷程演進說明」的項目放慢,每天結束時再多停一下,讓人看得完說明
    function delay() { var base = o.baseDelay || Math.max(250, Math.min(900, 15000 / L)), extra = (o.dayPause && st.k % o.dayPause.every === 0) ? o.dayPause.ms : 0; return (base + extra) / ui.speed(); }
    function setPlaying(p) { st.playing = p; btn.textContent = p ? '⏸ 暫停' : '▶ 播放'; if (!p) { clearTimeout(st.timer); st.timer = null; } }
    function tick() { if (!st.playing || !alive()) { setPlaying(false); return; } if (st.k >= L - 1) { setPlaying(false); return; } render(st.k + 1); if (st.k >= L - 1) setPlaying(false); else st.timer = setTimeout(tick, delay()); }
    function play() { if (!alive()) return; if (st.k >= L - 1) render(0); setPlaying(true); st.timer = setTimeout(tick, delay()); }
    btn.onclick = function () { if (st.playing) setPlaying(false); else play(); };
    seek.oninput = function () { setPlaying(false); render(Number(seek.value)); };
    spSel.onchange = function () { ui.saveSpeed(Number(spSel.value)); };
    // 一步一步看:上一步 / 下一步(會先暫停播放)
    ui.wrap.querySelector('[data-a=sprev]').onclick = function () { setPlaying(false); render(Math.max(0, st.k - 1)); };
    ui.wrap.querySelector('[data-a=snext]').onclick = function () { setPlaying(false); render(Math.min(L - 1, st.k + 1)); };
    // 上一天 / 下一天(每 o.jump 步為一天)
    var jumpN = o.jump || 1, prevB = ui.wrap.querySelector('[data-a=prev]'), nextB = ui.wrap.querySelector('[data-a=next]');
    if (prevB) prevB.onclick = function () { setPlaying(false); var k = st.k; render(Math.max(0, k % jumpN === 0 ? k - jumpN : Math.floor(k / jumpN) * jumpN)); };
    if (nextB) nextB.onclick = function () { setPlaying(false); render(Math.min(L - 1, (Math.floor(st.k / jumpN) + 1) * jumpN)); };
    label.textContent = String(o.labels[L - 1]);
    var api = { destroy: function () { st.gone = true; clearTimeout(st.timer); if (ui.wrap.parentNode) ui.wrap.parentNode.removeChild(ui.wrap); }, play: play, goto: render, state: st };
    replayPlayers[o.id] = api;
    if (lsGet('kb_net_autoplay', '0') === '1') setTimeout(function () { if (alive() && !st.playing) { render(0); play(); } }, 700);
    return api;
  };
  // 依時間戳建立「起點 + 每個發文日」的步驟;idx(ts) 是該時間所屬的步驟,貼文在 step >= idx(ts) 時才出現
  global.kbStepDays = function (timestamps) {
    var d = global.kbMakeDays(timestamps);
    return { labels: ['起點'].concat(d.labels), idx: function (ts) { return d.index(ts) + 1; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
