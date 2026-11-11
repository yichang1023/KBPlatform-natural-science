/* =====================================================================
 *  KB Stream — 關鍵對話流的畫面(老師分析平台)
 *  對話時序熱度分佈:每一天、每一種發言(提問 / 延伸 / 深化 / 整合)的數量疊成色帶,色帶的「厚度」= 當天該類發言的則數;
 *  白點 = 關鍵發言。左邊「現在發生了什麼?」「已看過的說明」會跟著播放一起更新;滑鼠移到任何色帶、白點、數字、座標軸、
 *  圖例都會跳出說明(字大、不擋住圖)。
 *  只負責畫面;資料怎麼算、播放、AI 解說,都還是頁面原本的(Chart.js 的資料沒有動)。
 *  用法:var art = KBStream.create({ buckets:[{label,start,counts:{question,extend,improve,riseabove},notes:{…}}], root: #stream-fig, open: noteId=>… });
 *        new Chart(ctx, { data:{labels:art.labels, datasets:art.datasets(points)}, options:art.options(), plugins:[art.plugin] });
 *        art.bind(chart);  kbAttachSeriesPlayer({ …, anchor: art.chartCard, onStep:(k)=>art.setStep(k) });  art.afterPlayer(playerApi)
 * ===================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;
  var TYPES = [
    { k: 'question', n: '提問', c: '#f0525b', a: 'rgba(240,82,91,.94)', tc: '#b4232f', say: '有人提出問題,討論就從這裡開始。' },
    { k: 'extend', n: '延伸', c: '#2e8cf6', a: 'rgba(46,140,246,.94)', tc: '#1a57b8', say: '有人接著補充、延伸別人的想法。' },
    { k: 'improve', n: '深化', c: '#3cd06e', a: 'rgba(60,208,110,.94)', tc: '#157a38', say: '有人把想法改得更好、說得更深(包含反例)。' },
    { k: 'riseabove', n: '整合', c: '#a45ee8', a: 'rgba(164,94,232,.94)', tc: '#6d2fba', say: '有人把零散的想法整理成更大的觀點。' }
  ];
  var BY = {}; TYPES.forEach(function (t) { BY[t.k] = t; });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  var WD = '日一二三四五六';
  function dateOf(b) { var d = new Date(b.start); return (d.getMonth() + 1) + '月' + d.getDate() + '日(週' + WD[d.getDay()] + ')'; }

  function css() {
    if (!doc || doc.getElementById('kb-ks-css')) return;
    var s = doc.createElement('style'); s.id = 'kb-ks-css';
    s.textContent = [
      '.ks{position:relative;container-type:inline-size;font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;color:#0f172a;border-radius:20px;padding:clamp(10px,2cqw,20px);background:radial-gradient(120% 90% at 85% 0%,#d9eaff 0%,#eaf3ff 38%,#f5f9ff 100%);border:1px solid #cfe0f7}',
      '.ks-main{display:grid;grid-template-columns:minmax(220px,26cqw) minmax(0,1fr);gap:clamp(10px,1.8cqw,18px);align-items:start}',
      '.ks-left{display:flex;flex-direction:column;gap:clamp(10px,1.6cqw,16px);min-width:0}',
      '.ks-card{background:rgba(255,255,255,.88);border:1.5px solid #bcd3f5;border-radius:16px;padding:clamp(12px,1.8cqw,18px);box-shadow:0 6px 18px -10px rgba(30,80,160,.35)}',
      '.ks-card h4{margin:0 0 10px;font-size:16px;font-weight:800;color:#0b1b3a}',
      '.ks-pill{display:inline-block;min-width:60%;padding:5px 12px;border-radius:9px;background:linear-gradient(180deg,#1d73e8,#0f56c2);color:#fff;font-size:14px;font-weight:800;margin-bottom:8px;box-shadow:0 4px 10px -4px rgba(15,86,194,.6)}',
      '.ks-now{font-size:14px;line-height:1.65;color:#1e293b;font-weight:600}.ks-now .sub{display:block;color:#334155;font-weight:500}',
      '.ks-hist{display:flex;flex-direction:column;gap:7px;max-height:min(330px,40cqw);overflow:auto;padding-right:3px}',
      '.ks-hi{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;border-radius:9px;padding:6px 8px;background:#e3eefc;cursor:pointer;font:inherit;color:#0f172a}',
      '.ks-hi:hover{background:#d3e4fb}.ks-hi.on{background:#cfe2ff;box-shadow:inset 0 0 0 2px #2f7de8}',
      '.ks-hi b{flex:none;min-width:2.4em;text-align:center;padding:3px 7px;border-radius:7px;background:#1d6fe0;color:#fff;font-size:13px;font-weight:800}',
      '.ks-hi span{font-size:13.5px;line-height:1.4;font-weight:600}',
      '.ks-empty{color:#475569;font-size:14px;line-height:1.6}',
      '.ks-chartcard{background:rgba(255,255,255,.95);border:1.5px solid #bcd3f5;border-radius:16px;padding:clamp(10px,1.6cqw,16px) clamp(10px,1.6cqw,18px) 6px;box-shadow:0 6px 18px -10px rgba(30,80,160,.35)}',
      '.ks-lgd{display:flex;flex-wrap:wrap;align-items:center;gap:6px clamp(12px,2.4cqw,28px);font-size:14px;font-weight:700;color:#0f172a;padding:2px 2px 4px}',
      '.ks-lgd [data-tip]{display:inline-flex;align-items:center;gap:.5em;white-space:nowrap}',
      '.ks-sq{display:inline-block;width:1.15em;height:1.15em;border-radius:.3em;box-shadow:inset 0 -2px 0 rgba(0,0,0,.12)}',
      '.ks-ring{display:inline-block;width:1.1em;height:1.1em;border-radius:50%;border:2.5px solid #1e293b;background:#fff}',
      '.ks-cap{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 14px;margin:0 0 2px;font-size:13px;color:#334155}.ks-cap b{color:#0f172a;font-size:1.02em}',
      '.ks-cv{position:relative;height:clamp(260px,34cqw,400px);width:100%}',
      '.ks-chartcard>[data-kbnet]{display:flex!important;align-items:center;gap:10px!important;flex-wrap:wrap;margin:10px -6px 8px!important;padding:9px 14px;border:1.5px solid #bcd3f5;border-radius:14px;background:#fff;font-size:13px!important;color:#0f172a!important}',
      '.ks-chartcard>[data-kbnet] button{font-size:13px;border-radius:8px!important;padding:5px 11px!important}',
      '.ks-chartcard>[data-kbnet] [data-a=play]{background:linear-gradient(180deg,#1d73e8,#0f56c2)!important;color:#fff!important;font-weight:800!important;min-width:84px}',
      '.ks-chartcard>[data-kbnet] [data-a=label]{font-weight:800!important;font-size:14px!important;color:#0b1b3a;min-width:80px!important}',
      '.ks-chartcard>[data-kbnet] input[type=range]{-webkit-appearance:none;appearance:none;height:10px;border-radius:99px;background:linear-gradient(90deg,#1f78f0 var(--p,100%),#c5d0df var(--p,100%));outline:0;min-width:140px}',
      '.ks-chartcard>[data-kbnet] input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid #1f78f0;box-shadow:0 2px 6px rgba(15,60,140,.4);cursor:pointer}',
      '.ks-chartcard>[data-kbnet] input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #1f78f0;cursor:pointer}',
      '.ks-chartcard .kbg{margin-top:4px}',
      '.ks-foot{margin-top:clamp(10px,1.6cqw,16px);padding:10px 16px;border-radius:12px;background:rgba(214,230,252,.75);color:#1e293b;font-size:13px;line-height:1.6;font-weight:500}',
      '.ks-more{margin-top:10px;background:rgba(255,255,255,.85);border:1px solid #cfe0f7;border-radius:12px;padding:8px 12px}.ks-more>summary{cursor:pointer;font-size:13px;font-weight:700;color:#1d4fb3}',
      '.ks [data-tip]{cursor:help}.ks [data-tip]:focus-visible{outline:3px solid rgba(37,99,235,.55);outline-offset:2px;border-radius:8px}',
      '@container (max-width:760px){.ks-main{grid-template-columns:minmax(0,1fr)}.ks-hist{max-height:220px}}'
    ].join('\n');
    (doc.head || doc.documentElement).appendChild(s);
  }

  function create(o) {
    css();
    var B = o.buckets || [], M = B.length, root = o.root, art = { k: M, playing: false, M: M };
    var KBTip = global.KBTip, tip = null, chart = null;
    art.labels = B.map(function (b) { return b.label; });
    var total = B.map(function (b) { return TYPES.reduce(function (s, t) { return s + (b.counts[t.k] || 0); }, 0); });
    var keyOf = B.map(function () { return 0; });

    /* ---------- 圖的資料設定(只換樣式,數字還是頁面算的) ---------- */
    art.datasets = function (points) {
      points = points || []; points.forEach(function (p) { var i = art.labels.indexOf(p.x); if (i >= 0) keyOf[i]++; });
      var ds = TYPES.map(function (t, ti) {
        return { type: 'line', label: t.n, data: B.map(function (b) { return b.counts[t.k] || 0; }), backgroundColor: t.a, borderColor: 'rgba(255,255,255,.55)', borderWidth: 1, fill: ti === 0 ? 'origin' : '-1', tension: 0, pointRadius: 0, pointHoverRadius: 0 };
      });
      ds.push({ type: 'scatter', label: '關鍵發言', data: points, backgroundColor: '#ffffff', borderColor: '#1e293b', borderWidth: 2.5, pointRadius: 7.5, pointHoverRadius: 7.5, order: -1 });
      return ds;
    };
    art.options = function () {
      var axisTxt = '#1e293b';
      return {
        responsive: true, maintainAspectRatio: false, animation: false, events: [], layout: { padding: { top: 30, right: 6 } },
        scales: {
          y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(100,130,180,.25)' }, border: { display: false }, ticks: { color: axisTxt, font: { size: 12.5, weight: '600' }, precision: 0, padding: 6 } },
          x: { offset: true, grid: { color: 'rgba(100,130,180,.22)', tickLength: 8 }, border: { color: '#8aa3c8' }, ticks: { autoSkip: true, maxRotation: 0, minRotation: 0, color: function (c) { return c.index === art.cur ? '#0b1b3a' : axisTxt; }, font: function (c) { return { size: c.index === art.cur ? 13 : 12, weight: c.index === art.cur ? '800' : '600', lineHeight: 1.25 }; }, callback: function (v, i) { return ['D' + (i + 1), art.labels[i]]; } } }
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      };
    };

    /* ---------- 版面:圖上的位置(畫圖與找滑鼠位置共用) ---------- */
    function visibleCount(c) { var ds = c && c.data && c.data.datasets && c.data.datasets[0], k = 0; if (!ds) return M; while (k < M && ds.data[k] !== null && ds.data[k] !== undefined) k++; return k; }
    function geo(c) {
      var xs = c.scales.x, ys = c.scales.y, area = c.chartArea; if (!xs || !ys || !area) return null;
      var k = visibleCount(c), px = [], cum = [], i, j;
      for (i = 0; i < M; i++) { px.push(xs.getPixelForValue(i)); var run = 0, row = [0]; for (j = 0; j < TYPES.length; j++) { run += B[i].counts[TYPES[j].k] || 0; row.push(run); } cum.push(row); }
      return { xs: xs, ys: ys, area: area, k: k, px: px, cum: cum, gap: M > 1 ? (px[M - 1] - px[0]) / (M - 1) : 80 };
    }
    art.cur = -1;

    art.plugin = {
      id: 'ksPlugin',
      afterDatasetsDraw: function (c) {
        var L = geo(c); if (!L || !L.k) return; art.L = L;
        var ctx = c.ctx, ys = L.ys, i, k = L.k;
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        // 每天的總數(色帶上方)
        var every = Math.max(1, Math.ceil(34 / Math.max(L.gap, 1)));
        for (i = 0; i < k; i++) {
          if (!total[i] || (i % every !== 0 && i !== k - 1)) continue;
          var y = ys.getPixelForValue(total[i]) - (i === art.cur ? 26 : 6); ctx.font = (i === k - 1 ? '800 ' : '700 ') + '13px "Noto Sans TC","Microsoft JhengHei",sans-serif'; ctx.fillStyle = '#0f172a'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(total[i], L.px[i], y); ctx.fillText(total[i], L.px[i], y);
        }
        // 現在播放到的這一天:虛線游標 + 十字
        if (art.cur >= 0 && art.cur < k) {
          var cx = L.px[art.cur]; ctx.beginPath(); ctx.moveTo(cx, L.area.top - 8); ctx.lineTo(cx, L.area.bottom); ctx.setLineDash([7, 6]); ctx.lineWidth = 2; ctx.strokeStyle = '#1e293b'; ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(cx - 6, L.area.top - 8); ctx.lineTo(cx + 6, L.area.top - 8); ctx.moveTo(cx, L.area.top - 14); ctx.lineTo(cx, L.area.top - 2); ctx.lineWidth = 2; ctx.stroke();
          // 當天的白點外面加一圈光
          var ds = c.data.datasets[TYPES.length];
          (ds && ds.data || []).forEach(function (p) { var idx = art.labels.indexOf(p.x); if (idx !== art.cur) return; var px = L.px[idx], py = ys.getPixelForValue(p.y); ctx.beginPath(); ctx.arc(px, py, 13, 0, 6.2832); ctx.lineWidth = 3.5; ctx.strokeStyle = '#ffffff'; ctx.shadowColor = 'rgba(30,60,120,.45)'; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(px, py, 7.5, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#1e293b'; ctx.stroke(); });
        }
        ctx.restore();
      }
    };

    /* ---------- 左邊的兩張卡 ---------- */
    function sayDay(i) {
      var b = B[i], parts = TYPES.map(function (t) { return { t: t, n: b.counts[t.k] || 0 }; }).filter(function (x) { return x.n > 0; }).sort(function (x, y) { return y.n - x.n; });
      return parts.map(function (x) { return x.t.n + ' ' + x.n + ' 則'; }).join(',') || '這天沒有發言';
    }
    function histLine(i) {
      var b = B[i], txt = sayDay(i), seen = {}, j, extra = [];
      for (j = 0; j < i; j++) TYPES.forEach(function (t) { if (B[j].counts[t.k]) seen[t.k] = 1; });
      var fresh = TYPES.filter(function (t) { return b.counts[t.k] && !seen[t.k]; });
      if (i === 0) extra.push('討論開始');
      else if (fresh.length === TYPES.length - Object.keys(seen).length && fresh.length && Object.keys(seen).length + fresh.length === TYPES.length) extra.push('四類發言皆出現');
      else if (fresh.length) extra.push('第一次出現' + fresh.map(function (t) { return t.n; }).join('、'));
      return txt + (extra.length ? ';' + extra.join(';') : '');
    }
    function box(sel) { return root && root.querySelector(sel); }
    art.setStep = function (k) {
      art.k = k; art.cur = k - 1;
      var pill = box('.ks-pill'), now = box('.ks-now'), hist = box('.ks-hist');
      if (pill) pill.textContent = k <= 0 ? '起點' : 'D' + k + ' / ' + M + ' · ' + (art.playing ? '播放中' : (k >= M ? '播放完畢' : '已暫停'));
      if (now) {
        if (k <= 0) now.innerHTML = '<span class="ks-empty">還沒有任何發言。按下「▶ 播放」,一天一天看對話怎麼長出來。</span>';
        else { var i = k - 1, nk = keyOf[i]; now.innerHTML = esc(sayDay(i)) + '<span class="sub">' + esc(dateOf(B[i])) + ' · 當天共 ' + total[i] + ' 則</span><span class="sub">' + (nk ? '當天標記 ' + nk + ' 則關鍵發言' : '當天沒有標記關鍵發言') + '</span>'; }
      }
      if (hist) {
        if (k <= 0) hist.innerHTML = '<div class="ks-empty">播放之後,看過的每一天都會留在這裡(只增不減),點一下可以回到那一天。</div>';
        else {
          var h = '', j; for (j = 0; j < k; j++) h += '<button type="button" class="ks-hi' + (j === k - 1 ? ' on' : '') + '" data-k="' + (j + 1) + '"><b>D' + (j + 1) + '</b><span>' + esc(histLine(j)) + '</span></button>';
          var prev = hist.scrollTop, atEnd = hist.scrollTop + hist.clientHeight >= hist.scrollHeight - 30; hist.innerHTML = h; if (atEnd || art.playing) hist.scrollTop = hist.scrollHeight; else hist.scrollTop = prev;
        }
      }
      var seek = root && root.querySelector('[data-a=seek]'); if (seek) seek.style.setProperty('--p', (M ? k / M * 100 : 0) + '%');
      var lb = root && root.querySelector('[data-kbnet] [data-a=label]'); if (lb && k > 0) lb.textContent = 'D' + k + ' / ' + M; else if (lb) lb.textContent = '起點';
    };
    // 播放器建好之後:接上「播放中/暫停」的狀態、把原本的逐步說明收進摺疊區
    art.afterPlayer = function (api) {
      art.player = api; if (!root) return;
      var wrap = root.querySelector('[data-kbnet]'), btn = wrap && wrap.querySelector('[data-a=play]');
      if (btn && global.MutationObserver) new global.MutationObserver(function () { var p = /暫停/.test(btn.textContent); if (p !== art.playing) { art.playing = p; art.setStep(art.k); } }).observe(btn, { childList: true, characterData: true, subtree: true });
      var lb = wrap && wrap.querySelector('[data-a=label]');
      if (lb && global.MutationObserver) new global.MutationObserver(function () { var want = art.k > 0 ? 'D' + art.k + ' / ' + M : '起點'; if (lb.textContent !== want) lb.textContent = want; }).observe(lb, { childList: true, characterData: true, subtree: true });
      var g = root.querySelector('.kbg'), more = box('.ks-more-body');
      if (g && more) more.appendChild(g);   // 原本的「怎麼看 / 即時說明 / 歷程說明(含可能原因)」整個搬進摺疊區
      art.setStep(api && api.state ? api.state.k : M);
    };
    // 點左邊「已看過的說明」→ 回到那一天
    if (root) root.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.ks-hi'); if (b && art.player && art.player.goto) { art.player.goto(Number(b.getAttribute('data-k'))); } });

    /* ---------- 滑鼠移上去:跳出說明 ---------- */
    function H(t, tag, bg) { return KBTip.h(t, tag, bg); }
    function bandHtml(i, t, cnt, frac) {
      var b = B[i], rows = TYPES.map(function (x) { return '<li><span><i style="display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;background:' + x.c + '"></i>' + x.n + '</span><b>' + (b.counts[x.k] || 0) + ' 則</b></li>'; }).join('');
      return H(t.n + ' · ' + esc(b.label), cnt + ' 則', t.c) + '<p>' + esc(dateOf(b)) + ',這一天「' + t.n + '」有 <span class="hl">' + cnt + '</span> 則,占當天 <span class="hl">' + Math.round(total[i] ? cnt / total[i] * 100 : 0) + '%</span>。</p><p>' + t.say + '</p><ul>' + rows + '</ul><div class="nx">色帶的厚度 = 當天這一類發言的則數。</div>';
    }
    function hit(x, y) {
      var c = chart, L = art.L || (c && geo(c)); if (!c || !L) return null; var a = L.area, i, j;
      if (x < a.left - 2 && x > 0 && y >= a.top - 12 && y <= a.bottom + 4) return { key: 'y', html: H('縱軸:當日發言數', '', '#475569') + '<p>每一天,全班一共寫了幾則發言(把四種顏色的色帶疊起來)。</p><div class="nx">把滑鼠移到色帶上,看那一類發言當天有幾則。</div>' };
      // 白點(關鍵發言)
      var ds = c.data.datasets[TYPES.length], best = null, bd = 13;
      (ds && ds.data || []).forEach(function (p) { var idx = art.labels.indexOf(p.x); if (idx < 0 || idx >= L.k) return; var d = Math.hypot(L.px[idx] - x, L.ys.getPixelForValue(p.y) - y); if (d < bd) { bd = d; best = { p: p, idx: idx }; } });
      if (best) { var n = null, tt = null; TYPES.forEach(function (t) { (B[best.idx].notes[t.k] || []).forEach(function (nn) { if (nn.id === best.p.noteId) { n = nn; tt = t; } }); }); return { key: 'k:' + best.p.noteId, click: best.p.noteId, html: H('關鍵發言', tt ? tt.n : '', tt ? tt.c : '#475569') + '<p>' + esc(dateOf(B[best.idx])) + '</p><p><span class="hl">' + esc((best.p.title || (n && n.title) || '(沒有標題)')) + '</span></p><p>這是當天「最深一層」那類發言(整合 > 深化 > 延伸 > 提問)的第一則,用來代表當天的想法。</p><div class="nx">點一下白點,看這則發言的內容。</div>' }; }
      // 底下的日期
      if (y > a.bottom + 2 && x >= a.left - 10 && x <= a.right + 10) { var di = Math.round(L.xs.getValueForPixel(x)); if (di >= 0 && di < M) return { key: 'd:' + di, html: H('D' + (di + 1) + ' · ' + esc(B[di].label), total[di] + ' 則', '#334155') + '<p>' + esc(dateOf(B[di])) + ',全班一共 <span class="hl">' + total[di] + '</span> 則發言:' + esc(sayDay(di)) + '。</p><div class="nx">這裡只列出有人發言的日子,不是每天都有。</div>' }; return null; }
      if (x < a.left || x > a.right || y < a.top - 34 || y > a.bottom) return null;
      // 游標
      if (art.cur >= 0 && art.cur < L.k && Math.abs(x - L.px[art.cur]) < 6) return { key: 'cur', html: H('現在播放到這一天', 'D' + (art.cur + 1), '#1f6fe0') + '<p>' + esc(dateOf(B[art.cur])) + ' · ' + esc(sayDay(art.cur)) + '。</p><div class="nx">虛線 = 播放進度;左邊的卡片會說明這一天發生了什麼。</div>' };
      // 每天的總數(色帶上方)
      var fx = L.xs.getValueForPixel(x), ni = Math.round(fx);
      if (ni >= 0 && ni < L.k && Math.abs(L.px[ni] - x) < 13 && y < L.ys.getPixelForValue(total[ni]) - 1 && y > L.ys.getPixelForValue(total[ni]) - 26) return { key: 'tot:' + ni, html: H('D' + (ni + 1) + ' 當天總數', total[ni] + ' 則', '#334155') + '<p>' + esc(dateOf(B[ni])) + ',四類發言加起來 <span class="hl">' + total[ni] + '</span> 則:' + esc(sayDay(ni)) + '。</p>' };
      // 色帶(沿著折線內插,找滑鼠在哪一條)
      if (fx < 0 || fx > L.k - 1 + 0.001) { if (fx > L.k - 1 && fx < L.k - 1 + 0.6) fx = L.k - 1; else if (fx < 0 && fx > -0.6) fx = 0; else return null; }
      i = Math.floor(fx); if (i >= L.k - 1) i = Math.max(0, L.k - 2); var u = L.k > 1 ? fx - i : 0, v = L.ys.getValueForPixel(y);
      var cum = []; for (j = 0; j <= TYPES.length; j++) cum.push(L.k > 1 ? L.cum[i][j] * (1 - u) + L.cum[i + 1][j] * u : L.cum[0][j]);
      if (v < 0 || v > cum[TYPES.length]) return null;
      for (j = 0; j < TYPES.length; j++) if (v <= cum[j + 1]) { var di2 = Math.round(fx); di2 = clamp(di2, 0, L.k - 1); return { key: 'b:' + j + ':' + di2, html: bandHtml(di2, TYPES[j], B[di2].counts[TYPES[j].k] || 0) }; }
      return null;
    }
    art.hit = hit;
    art.bind = function (c) {
      chart = c; var cv = c.canvas, card = cv.closest('.ks') || cv.parentElement;
      if (cv.__ksOff) { try { cv.__ksOff(); } catch (e) {} }
      if (!KBTip) return;
      tip = KBTip.create(card);
      var rel = function (ev) { var r = cv.getBoundingClientRect(), cr = card.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top, cx: ev.clientX - cr.left, cy: ev.clientY - cr.top }; };
      var mv = function (ev) { var q = rel(ev), h = hit(q.x, q.y); cv.style.cursor = h && h.click ? 'pointer' : 'default'; if (h) tip.show(h.html, q.cx, q.cy, h.key); else tip.hide(); };
      var lv = function () { tip.hide(); };
      var ck = function (ev) { var q = rel(ev), h = hit(q.x, q.y); if (h && h.click && o.open) o.open(h.click); };
      cv.addEventListener('mousemove', mv); cv.addEventListener('mouseleave', lv); cv.addEventListener('click', ck);
      cv.__ksOff = function () { cv.removeEventListener('mousemove', mv); cv.removeEventListener('mouseleave', lv); cv.removeEventListener('click', ck); };
      // 圖例、說明列
      if (root && !root.__ksLg) {
        root.__ksLg = true;
        var show = function (el, x, y) { var k = el.getAttribute('data-tip'); var h = legendTip(k); if (h) tip.show(h, x, y, 'lg:' + k); };
        root.addEventListener('mouseover', function (ev) { var el = ev.target.closest && ev.target.closest('[data-tip]'); if (!el) return; var r = card.getBoundingClientRect(); show(el, ev.clientX - r.left, ev.clientY - r.top); });
        root.addEventListener('mouseout', function (ev) { var to = ev.relatedTarget; if (!(to && to.closest && to.closest('[data-tip]'))) tip.hide(); });
        root.addEventListener('focusin', function (ev) { var el = ev.target.closest && ev.target.closest('[data-tip]'); if (!el) return; var r = el.getBoundingClientRect(), c2 = card.getBoundingClientRect(); show(el, r.left - c2.left + r.width / 2, r.top - c2.top + r.height / 2); });
        root.addEventListener('focusout', function () { tip.hide(); });
      }
    };
    function legendTip(k) {
      var t = BY[k]; if (t) { var all = B.reduce(function (s, b) { return s + (b.counts[k] || 0); }, 0), sum = total.reduce(function (s, v) { return s + v; }, 0); return H(t.n, all + ' 則', t.c) + '<p>' + t.say + '</p><p>整段時間共 <span class="hl">' + all + '</span> 則,占全部的 <span class="hl">' + (sum ? Math.round(all / sum * 100) : 0) + '%</span>。</p><div class="nx">色帶越厚,表示那一天這類發言越多。</div>'; }
      if (k === 'key') return H('關鍵發言', '○', '#1e293b') + '<p>白色圓點每天一個:當天最深一層那類發言(整合 > 深化 > 延伸 > 提問)的第一則,用來代表當天的想法。</p><div class="nx">把滑鼠移到白點可以看標題,點一下看內容。僅看發言數不能判定內容的好壞。</div>';
      if (k === 'cap') return H('怎麼看這張圖', '', '#475569') + '<p>橫軸是有人發言的日子(D1、D2…),縱軸是當天的發言則數。四種顏色疊起來,每條色帶的厚度就是那一類發言的則數。</p>';
      return null;
    }
    return art;
  }

  /* 圖外框(圖例、圖說、左邊兩張卡、說明列);把它放進卡片裡,圖的 <canvas id="streamChart"> 在裡面 */
  function html() {
    var lg = TYPES.map(function (t) { return '<span data-tip="' + t.k + '" tabindex="0"><i class="ks-sq" style="background:' + t.c + '"></i>' + t.n + '</span>'; }).join('');
    return '<div class="ks" id="stream-fig"><div class="ks-main">' +
      '<div class="ks-left"><div class="ks-card"><h4>現在發生了什麼?</h4><div class="ks-pill">起點</div><div class="ks-now"></div></div><div class="ks-card"><h4>已看過的說明</h4><div class="ks-hist"></div></div></div>' +
      '<div class="ks-right"><div class="ks-chartcard" id="ks-chartcard"><div class="ks-lgd">' + lg + '<span data-tip="key" tabindex="0"><i class="ks-ring"></i>關鍵發言</span></div>' +
      '<div class="ks-cap" data-tip="cap" tabindex="0"><b>當日發言數</b><span>每條色帶在當天的厚度 = 該類發言的則數</span></div><div class="ks-cv"><canvas id="streamChart"></canvas></div></div></div></div>' +
      '<div class="ks-foot">說明:每一天、每一種發言的數量疊成色帶。白點是當天最深一層發言的第一則(關鍵發言),點一下可以看內容;僅看發言數不能判定內容品質或因果。</div>' +
      '<details class="ks-more"><summary>看詳細的逐步說明(含怎麼看這個圖、可能原因)</summary><div class="ks-more-body"></div></details></div>';
  }
  global.KBStream = { create: create, html: html, TYPES: TYPES };
})(typeof window !== 'undefined' ? window : globalThis);
