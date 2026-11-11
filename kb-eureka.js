/* =====================================================================
 *  KB Eureka — 認知頓悟軌跡(Eureka Arc)的畫面
 *  一條會發光的「想法高度」線:每發言一次往上爬一格,改進多爬 0.5、昇華多爬 2、提問/反例稍微下沉。
 *    - 上面的細線 = 每一則發言「之後」的想法高度,線上的點 = 發言(紅點=一般/提問/反例、黃點=改進、黃色大點=昇華)
 *    - 下面的粗色帶 = 每一則發言「之前」的想法高度。上線和下帶之間的距離 = 這一則發言讓想法爬了多少
 *    - 外圈與色帶的顏色 = 出現的時間:較早(青綠)→ 中期(藍)→ 近期(紫)
 *  把滑鼠移到任何一個點、線、色帶、座標軸或圖例,都會跳出說明(字大、不擋住圖)。
 *  只負責畫圖;高度怎麼算、播放、AI 解說,都還是頁面原本的(Chart.js 的資料沒有動)。
 *  用法:var art = KBEureka.create({ notes:[{type,title,content,when}], data:[高度…], root: 圖外框 });
 *        new Chart(ctx, { …, plugins:[art.plugin] });  art.bind(chart);  art.setCurrent(k-1);
 * ===================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;
  var TYPE = {
    question: { n: '提問', d: -0.5, mark: '?', say: '你提出了一個問題。提問會讓想法暫時「卡住一下」(線稍微下沉),代表你碰到了值得想的難題。' },
    counter: { n: '反例', d: -0.5, mark: '✕', say: '你提出了不同的看法。反例會讓想法先晃一下(線稍微下沉),常常是下一次進步的起點。' },
    improve: { n: '改進', d: 0.5, mark: '+0.5', say: '你把想法改得更好了!這是一次小進步(多爬 0.5)。' },
    riseabove: { n: '昇華', d: 2, mark: '+2', say: '你把零散的想法整合成更高一層的新觀點!這是一次大躍進(多爬 2)。' },
    extend: { n: '延伸', d: 0, mark: '', say: '你延伸、補充了想法,穩穩地往上爬一格。' }
  };
  var ERA = [{ n: '較早', c: '#26cdb0', ring: '#3ad9c2' }, { n: '中期', c: '#2f86f0', ring: '#2f86f0' }, { n: '近期', c: '#8f5cf3', ring: '#8f5cf3' }];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function r1(v) { return Math.round(v * 100) / 100; }

  function css() {
    if (!doc || doc.getElementById('kb-eu-css')) return;
    var s = doc.createElement('style'); s.id = 'kb-eu-css';
    s.textContent = [
      '.eu{position:relative;container-type:inline-size;color:#111827;font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;background:linear-gradient(180deg,#fff,#fafbfe);border:1px solid #e6e9f2;border-radius:16px;padding:3% 3.5% 2.5%}',
      '.eu-h{margin:0;text-align:center;font-size:clamp(17px,4.4cqw,27px);font-weight:800;letter-spacing:.01em;line-height:1.25}.eu-h span{font-weight:800}',
      '.eu-sub{text-align:center;margin:.5% 0 1.5%;font-size:clamp(12px,2.5cqw,15px);color:#4b5563}',
      '.eu-main{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2.4cqw;align-items:center}',
      '.eu .eureka-chart-container{position:relative;height:clamp(240px,52cqw,330px);width:100%;cursor:default}',
      '.eu-lg{display:flex;flex-direction:column;gap:2.6cqw;min-width:0;padding-right:.5cqw;font-size:clamp(11.5px,2.3cqw,14px);color:#1f2937}',
      '.eu-lgg b{display:block;margin-bottom:.8cqw;font-weight:800;white-space:nowrap}.eu-lgg [data-tip]{display:flex;align-items:center;gap:.7em;margin:.45em 0;white-space:nowrap}',
      '.eu-lgg .d{display:inline-block;flex:none;border-radius:50%;width:.95em;height:.95em}',
      '.eu-lgg .d.r{background:radial-gradient(circle at 35% 30%,#ff8a8f,#e5283a 70%);box-shadow:0 0 0 .22em rgba(239,59,74,.22),0 0 .5em rgba(239,59,74,.55)}',
      '.eu-lgg .d.y{background:radial-gradient(circle at 35% 30%,#fff3a0,#ffc928 70%);box-shadow:0 0 .55em rgba(255,193,40,.8)}',
      '.eu-lgg .d.y2{width:1.3em;height:1.3em;background:radial-gradient(circle at 35% 30%,#fffbd0,#ffcf2e 60%,#ffb020);box-shadow:0 0 .35em rgba(255,200,40,.9),0 0 .9em rgba(255,190,40,.6)}',
      '.eu-bars{display:flex;gap:.5em;margin-top:.5em}.eu-bars span{flex:1;height:.62em;border-radius:99px;min-width:3.2em;box-shadow:0 0 .5em currentColor}',
      '.eu-bars .e{color:#26cdb0;background:linear-gradient(90deg,#69e8d2,#26cdb0)}.eu-bars .m{color:#2f86f0;background:linear-gradient(90deg,#69acf7,#2f86f0)}.eu-bars .l{color:#8f5cf3;background:linear-gradient(90deg,#b394f8,#8f5cf3)}',
      '.eu-bl{display:flex;gap:.5em;margin-top:.45em;font-size:.95em;color:#374151}.eu-bl span{flex:1;text-align:center;min-width:3.2em}',
      '.eu [data-tip]{cursor:help}.eu [data-tip]:focus-visible{outline:3px solid rgba(79,70,229,.55);outline-offset:2px;border-radius:8px}',
      '.eu-tip{position:absolute;left:0;top:0;z-index:30;width:min(330px,calc(100% - 16px));box-sizing:border-box;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.98);border:1px solid #cdd5e6;box-shadow:0 14px 32px -10px rgba(30,50,110,.5);font-size:16px;line-height:1.6;color:#33415c;pointer-events:none;opacity:0;transition:opacity .12s}.eu-tip.show{opacity:1}',
      '.eu-tip h5{margin:0 0 4px;font-size:19px;line-height:1.3;font-weight:800;color:#111827}.eu-tip .tg{display:inline-block;margin-left:6px;padding:1px 10px;border-radius:999px;font-size:13.5px;font-weight:800;vertical-align:2px;color:#fff}',
      '.eu-tip p{margin:5px 0 0}.eu-tip .hl{color:#111827;font-weight:700}.eu-tip .nx{margin-top:7px;padding:6px 10px;border-radius:9px;background:#f1f5ff;color:#1f3a7a;font-weight:600}',
      '@container (max-width:640px){.eu-main{grid-template-columns:minmax(0,1fr)}.eu-lg{flex-direction:row;flex-wrap:wrap;gap:3cqw 6cqw;padding-top:1cqw}.eu-lgg [data-tip]{margin:.3em 0}}'
    ].join('\n');
    (doc.head || doc.documentElement).appendChild(s);
  }

  function create(o) {
    css();
    var notes = o.notes || [], data = o.data || [], M = data.length, root = o.root, art = { cur: -1, k: M };
    function era(i) { return M ? Math.min(2, Math.floor(i / M * 3)) : 0; }
    function typeOf(i) { return TYPE[(notes[i] || {}).type] || { n: '一般發言', d: 0, mark: '', say: '你發表了一則想法,往上爬一格。' }; }
    function prevOf(i) { return i === 0 ? 0 : data[i - 1]; }
    function visibleCount(chart) { var ds = chart && chart.data && chart.data.datasets && chart.data.datasets[0], k = 0; if (!ds) return M; while (k < M && ds.data[k] !== null && ds.data[k] !== undefined) k++; return k; }

    /* ---------- 曲線(Catmull-Rom → 貝茲):畫線和找「滑鼠在不在線上」共用 ---------- */
    function segs(p) {
      var out = [], i; for (i = 0; i < p.length - 1; i++) {
        var p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
        out.push({ a: p1, b: p2, c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 } });
      }
      return out;
    }
    function trace(ctx, sg, p) { ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); sg.forEach(function (s) { ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.b.x, s.b.y); }); }
    function bez(s, t) { var u = 1 - t; return { x: u * u * u * s.a.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.b.x, y: u * u * u * s.a.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.b.y }; }
    function distTo(sg, x, y) { var best = 1e9, bi = 0; sg.forEach(function (s, si) { for (var j = 0; j <= 14; j++) { var q = bez(s, j / 14), d = Math.hypot(q.x - x, q.y - y); if (d < best) { best = d; bi = si; } } }); return { d: best, seg: bi }; }

    /* ---------- 版面資料(每次畫圖重算,滑鼠找東西時也用同一份) ---------- */
    function layout(chart) {
      var xs = chart.scales.x, ys = chart.scales.y, area = chart.chartArea; if (!xs || !ys || !area) return null;
      var k = visibleCount(chart), up = [], lo = [], i;
      for (i = 0; i < M; i++) { up.push({ x: xs.getPixelForValue(i), y: ys.getPixelForValue(data[i]) }); lo.push({ x: up[i].x, y: ys.getPixelForValue(Math.max(prevOf(i), 0.3)) }); }
      var gap = M > 1 ? (up[M - 1].x - up[0].x) / (M - 1) : 60, r0 = clamp(gap * 0.2, 3.6, 8.2);
      return { xs: xs, ys: ys, area: area, k: k, up: up.slice(0, k), lo: lo.slice(0, k), upAll: up, gap: gap, r0: r0, upS: segs(up.slice(0, k)), loS: segs(lo.slice(0, k)) };
    }
    function grad(ctx, L, alpha, mix) {
      var x0 = L.upAll[0].x, x1 = L.upAll[M - 1].x; if (x1 - x0 < 1) x1 = x0 + 1;
      var g = ctx.createLinearGradient(x0, 0, x1, 0), cols = [mixc(ERA[0].c, mix, alpha), mixc('#2ea6e8', mix, alpha), mixc(ERA[1].c, mix, alpha), mixc('#6f6cf0', mix, alpha), mixc(ERA[2].c, mix, alpha)];
      [0, .25, .5, .75, 1].forEach(function (t, i) { g.addColorStop(t, cols[i]); }); return g;
    }
    function mixc(hex, m, a) { var n = parseInt(hex.slice(1), 16), R = n >> 16, G = (n >> 8) & 255, B = n & 255; R = Math.round(R + (255 - R) * m); G = Math.round(G + (255 - G) * m); B = Math.round(B + (255 - B) * m); return 'rgba(' + R + ',' + G + ',' + B + ',' + a + ')'; }

    /* ---------- 畫圖 ---------- */
    function draw(chart) {
      var L = layout(chart); if (!L || !L.k) { art.L = L; return; } art.L = L;
      var ctx = chart.ctx, k = L.k, i;
      ctx.save();
      // 下面的粗色帶(發言之前的高度)
      if (k > 1) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        trace(ctx, L.loS, L.lo); ctx.strokeStyle = grad(ctx, L, .95, 0); ctx.lineWidth = clamp(L.r0 * 1.35, 5, 11); ctx.shadowColor = 'rgba(47,134,240,.45)'; ctx.shadowBlur = 14; ctx.stroke();
        trace(ctx, L.loS, L.lo); ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = 2; ctx.save(); ctx.translate(0, -1.6); ctx.stroke(); ctx.restore();
      } else { ctx.beginPath(); ctx.moveTo(L.lo[0].x - 6, L.lo[0].y); ctx.lineTo(L.lo[0].x + 6, L.lo[0].y); ctx.strokeStyle = grad(ctx, L, .95, 0); ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke(); }
      // 上面的細線(發言之後的高度)
      if (k > 1) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        trace(ctx, L.upS, L.up); ctx.strokeStyle = grad(ctx, L, .95, .12); ctx.lineWidth = clamp(L.r0 * .62, 3, 5.2); ctx.shadowColor = 'rgba(120,150,255,.55)'; ctx.shadowBlur = 11; ctx.stroke();
        trace(ctx, L.upS, L.up); ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.3; ctx.stroke();
      }
      // 點:先畫外圈(紅點才有,顏色 = 出現時間),再畫點,最後畫上面的符號
      for (i = 0; i < k; i++) {
        var p = L.up[i], ty = (notes[i] || {}).type, e = ERA[era(i)], r = L.r0;
        if (ty === 'riseabove') {
          var R2 = r * 1.75, g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R2 * 2.2);
          g2.addColorStop(0, 'rgba(255,214,70,.75)'); g2.addColorStop(.45, 'rgba(255,200,60,.32)'); g2.addColorStop(1, 'rgba(255,200,60,0)');
          ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(p.x, p.y, R2 * 2.2, 0, 6.2832); ctx.fill();
          var g3 = ctx.createRadialGradient(p.x - R2 * .3, p.y - R2 * .3, 0, p.x, p.y, R2);
          g3.addColorStop(0, '#fffbd6'); g3.addColorStop(.55, '#ffd23a'); g3.addColorStop(1, '#ffae1f');
          ctx.shadowColor = 'rgba(255,190,40,.9)'; ctx.shadowBlur = 14; ctx.fillStyle = g3; ctx.beginPath(); ctx.arc(p.x, p.y, R2, 0, 6.2832); ctx.fill(); ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.6; ctx.stroke();
        } else if (ty === 'improve') {
          var R1 = r * 1.2, g1 = ctx.createRadialGradient(p.x - R1 * .3, p.y - R1 * .3, 0, p.x, p.y, R1);
          g1.addColorStop(0, '#fff6b0'); g1.addColorStop(.6, '#ffd02e'); g1.addColorStop(1, '#f5a418');
          ctx.shadowColor = 'rgba(255,190,40,.9)'; ctx.shadowBlur = 11; ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(p.x, p.y, R1, 0, 6.2832); ctx.fill(); ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.3; ctx.stroke();
        } else {
          var Rr = r * 1.95;   // 外圈
          ctx.beginPath(); ctx.arc(p.x, p.y, Rr, 0, 6.2832); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
          ctx.shadowColor = e.ring; ctx.shadowBlur = 9; ctx.strokeStyle = e.ring; ctx.lineWidth = clamp(r * .34, 1.6, 2.8); ctx.stroke(); ctx.shadowBlur = 0;
          var Rd = r * .88, gr = ctx.createRadialGradient(p.x - Rd * .3, p.y - Rd * .3, 0, p.x, p.y, Rd);
          gr.addColorStop(0, '#ff8f94'); gr.addColorStop(.55, '#ef3b4a'); gr.addColorStop(1, '#d11f33');
          ctx.shadowColor = 'rgba(239,59,74,.8)'; ctx.shadowBlur = 8; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, Rd, 0, 6.2832); ctx.fill(); ctx.shadowBlur = 0;
        }
        var mk = typeOf(i).mark;
        if (mk) {
          var top = ty === 'riseabove' ? r * 1.75 + r * 2.2 : ty === 'improve' ? r * 1.2 + 7 : r * 1.95 + 7;
          ctx.font = '700 ' + clamp(L.gap * .26, 10, 14) + 'px "Noto Sans TC","Microsoft JhengHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#374151';
          var lift = (art.cur === i) ? 7 : 0;
          if (ty === 'riseabove') ctx.fillText(mk, p.x, p.y - r * 1.75 - 11 - lift); else ctx.fillText(mk, p.x, p.y - top - lift);
        }
      }
      // 播放中的這一點:加一圈紫藍色的標記
      if (art.cur >= 0 && art.cur < k) {
        var c = L.up[art.cur], rc = L.r0 * (((notes[art.cur] || {}).type === 'riseabove') ? 2.9 : 2.5);
        ctx.beginPath(); ctx.arc(c.x, c.y, rc, 0, 6.2832); ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(79,70,229,.6)'; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
      }
      // 左上角:座標軸說明
      ctx.font = '700 13px "Noto Sans TC","Microsoft JhengHei",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#374151';
      ctx.fillText('想法高度(累積)', 6, 15);
      ctx.restore();
    }
    art.plugin = { id: 'eurekaArt', afterDatasetsDraw: function (chart) { try { draw(chart); } catch (e) { if (global.console) console.error('頓悟軌跡畫圖失敗', e); } } };

    /* ---------- 說明泡泡 ---------- */
    function h5(t, tag, bg) { return '<h5>' + t + (tag ? '<span class="tg" style="background:' + bg + '">' + tag + '</span>' : '') + '</h5>'; }
    function snippet(n) { var t = String((n && (n.title || '')) || '').trim(), c = String((n && n.content) || '').replace(/\s+/g, ' ').trim(); if (c.length > 70) c = c.slice(0, 68) + '…'; return { t: t, c: c }; }
    function ptTip(i) {
      var n = notes[i] || {}, ty = typeOf(i), e = ERA[era(i)], sn = snippet(n), d = ty.d;
      var up = n.type === 'riseabove' || n.type === 'improve', tag = d > 0 ? '多爬 ' + d : d < 0 ? '稍微下沉' : '';
      return h5('N' + (i + 1) + ' ' + ty.n, tag, up ? '#e69a00' : (d < 0 ? '#8b5cf6' : '#ef3b4a')) +
        '<p><span class="hl">發言內容:</span>' + (sn.t ? '「' + esc(sn.t) + '」' : '(沒有標題)') + '</p>' + (sn.c ? '<p>' + esc(sn.c) + '</p>' : '') +
        '<p>' + (n.when ? esc(n.when) + ' · ' : '') + '想法高度 <span class="hl">' + r1(data[i]) + '</span>(這則之前是 ' + r1(prevOf(i)) + ')</p>' +
        '<div class="nx">' + ty.say + '<br>外圈/色帶的顏色:' + e.n + '出現。</div>';
    }
    function lineTip(seg) {
      var a = seg, b = seg + 1; if (b >= M) b = a; if (a === b) return '';
      var dlt = r1(data[b] - data[a]);
      return h5('想法高度的線') + '<p>N' + (a + 1) + ' → N' + (b + 1) + ':從 <span class="hl">' + r1(data[a]) + '</span> 到 <span class="hl">' + r1(data[b]) + '</span>(' + (dlt >= 0 ? '+' : '') + dlt + ')。</p><p>每發言一次往上爬一格;改進多爬 0.5、昇華多爬 2,提問和反例稍微下沉。</p>';
    }
    function ribbonTip(seg) {
      var a = seg, b = Math.min(M - 1, seg + 1);
      return h5('下面的粗色帶') + '<p>這條帶子是每一則發言<span class="hl">之前</span>的想法高度。</p><p>上面的線和它之間的距離,就是那一則發言讓想法爬了多少(下沉時距離會變短)。</p><p>N' + (a + 1) + ' 之前是 ' + r1(prevOf(a)) + ',N' + (b + 1) + ' 之前是 ' + r1(prevOf(b)) + '。</p>';
    }
    function keyTip(key) {
      if (key === 'title') return h5('認知頓悟軌跡') + '<p>看你的想法怎麼一步一步往上爬:橫軸是你的每一則發言,縱軸是想法的高度。</p><p>把滑鼠移到任何一個點、線、色帶或圖例上,都有說明。</p>';
      if (key === 'yaxis') return h5('想法高度(累積)') + '<p>每發言一次就往上爬一格,線越往上,代表你的想法累積得越多。</p><p>改進多爬 0.5、昇華多爬 2;提問和反例會讓線稍微下沉一點。</p>';
      if (key === 'lg:normal') return h5('紅點:一般發言', '一般 / 提問 / 反例', '#ef3b4a') + '<p>一般發言(延伸)穩穩往上爬一格。上面有「?」是提問、「✕」是反例,它們會讓線稍微下沉,表示你碰到了值得想的難題。</p>';
      if (key === 'lg:improve') return h5('黃點:改進', '+0.5', '#e69a00') + '<p>把想法改得更好,這一次多爬 0.5。</p>';
      if (key === 'lg:rise') return h5('黃色大點:昇華', '+2', '#e69a00') + '<p>把零散的想法整合成新觀點,一口氣多爬 2,是最大的進步!</p>';
      if (key.indexOf('lg:era') === 0) { var ei = Number(key.slice(6)); return h5('外圈 / 色帶:' + ERA[ei].n, '出現時間', ERA[ei].c) + '<p>把你的所有發言依先後分成三等份:前三分之一是「較早」(青綠)、中間是「中期」(藍)、最後是「近期」(紫)。</p><p>紅點外圈和色帶的顏色,就是這一則發言出現的時間。</p>'; }
      return '';
    }
    function tipFor(hit) {
      if (!hit) return '';
      if (hit.kind === 'pt') return ptTip(hit.i);
      if (hit.kind === 'line') return lineTip(hit.seg);
      if (hit.kind === 'ribbon') return ribbonTip(hit.seg);
      if (hit.kind === 'yaxis') return keyTip('yaxis');
      if (hit.kind === 'key') return keyTip(hit.key);
      return '';
    }
    art.tipFor = tipFor;

    /* ---------- 滑鼠 / 鍵盤 ---------- */
    function hitTest(chart, x, y) {
      var L = art.L || layout(chart); if (!L || !L.k) return null; var area = L.area, i, best = null, bd = 1e9;
      for (i = 0; i < L.k; i++) {   // 點(含外圈、上面的符號)
        var p = L.up[i], d = Math.hypot(p.x - x, p.y - y), reach = Math.min(L.r0 * 2.1 + 3, L.gap * 0.4 + 1);
        if (d < reach && d < bd) { bd = d; best = { kind: 'pt', i: i }; }
        if (typeOf(i).mark && Math.abs(p.x - x) < 16 && y < p.y - L.r0 * 1.2 && y > p.y - L.r0 * 3.8 - 14 && Math.abs(p.x - x) < bd) { best = { kind: 'pt', i: i }; bd = Math.abs(p.x - x); }
      }
      if (best) return best;
      if (y > area.bottom && y < area.bottom + 34 && x > area.left - 6 && x < area.right + 8) {   // 橫軸的 N1、N2…
        var j = clamp(Math.round((x - L.upAll[0].x) / (L.gap || 1)), 0, M - 1); if (j < L.k) return { kind: 'pt', i: j };
      }
      if (x < area.left && y > area.top - 4 && y < area.bottom + 4 || (y < area.top && x < area.left + 110)) return { kind: 'yaxis' };
      if (L.k > 1) {
        var du = distTo(L.upS, x, y), dl = distTo(L.loS, x, y);
        if (du.d < 9 && du.d <= dl.d) return { kind: 'line', seg: du.seg };
        if (dl.d < 10) return { kind: 'ribbon', seg: dl.seg };
      }
      return null;
    }
    art.hitTest = function (chart, x, y) { return hitTest(chart, x, y); };
    art.bind = function (chart) {
      if (!chart || !chart.canvas || !root || chart.canvas.__euBound) return; chart.canvas.__euBound = true;
      var tip = root.querySelector('.eu-tip'); if (!tip) { tip = doc.createElement('div'); tip.className = 'eu-tip'; tip.setAttribute('role', 'tooltip'); root.appendChild(tip); }
      var cur = null;
      function place(x, y) {
        var W = root.clientWidth || 500, H = root.clientHeight || 400, w = tip.offsetWidth || 300, hh = tip.offsetHeight || 120;
        var left = x + 16, top = y - hh - 14; if (left + w > W - 8) left = x - w - 16; if (left < 8) left = clamp(x - w / 2, 8, Math.max(8, W - w - 8));
        if (top < 8) top = y + 20; if (top + hh > H - 8) top = Math.max(8, H - hh - 8);
        tip.style.left = left + 'px'; tip.style.top = top + 'px';
      }
      function show(html, x, y, id) { if (!html) { hide(); return; } if (cur !== id || tip.__h !== html) { tip.innerHTML = html; tip.__h = html; cur = id; } tip.classList.add('show'); place(x, y); }
      function hide() { tip.classList.remove('show'); cur = null; }
      function local(e) { var rc = chart.canvas.getBoundingClientRect(); return { x: e.clientX - rc.left, y: e.clientY - rc.top, rx: e.clientX - root.getBoundingClientRect().left, ry: e.clientY - root.getBoundingClientRect().top }; }
      function onMove(e) {
        var p = local(e), hit = hitTest(chart, p.x, p.y);
        chart.canvas.style.cursor = hit ? 'pointer' : 'default';
        if (!hit) { hide(); return; }
        show(tipFor(hit), p.rx, p.ry, hit.kind + (hit.i != null ? hit.i : (hit.seg != null ? hit.seg : '')));
      }
      chart.canvas.addEventListener('mousemove', onMove); chart.canvas.addEventListener('mouseleave', hide);
      chart.canvas.addEventListener('click', onMove);   // 手機:點一下就出現說明
      // 圖例、標題:靠 data-tip
      root.addEventListener('mouseover', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (!el || !root.contains(el)) return; var r = root.getBoundingClientRect(); show(keyTip(el.getAttribute('data-tip')), e.clientX - r.left, e.clientY - r.top, 'k:' + el.getAttribute('data-tip')); });
      root.addEventListener('mousemove', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el && root.contains(el) && cur && cur.indexOf('k:') === 0) { var r = root.getBoundingClientRect(); place(e.clientX - r.left, e.clientY - r.top); } });
      root.addEventListener('mouseout', function (e) { var to = e.relatedTarget; if (cur && cur.indexOf('k:') === 0 && !(to && to.closest && to.closest('[data-tip]'))) hide(); });
      root.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (!el) return; var r = el.getBoundingClientRect(), b = root.getBoundingClientRect(); show(keyTip(el.getAttribute('data-tip')), r.left - b.left + r.width / 2, r.top - b.top + r.height / 2, 'k:' + el.getAttribute('data-tip')); });
      root.addEventListener('focusout', hide); root.addEventListener('mouseleave', hide);
      root.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
      art.tip = tip; art.show = show; art.hide = hide;
    };
    art.setCurrent = function (i) { art.cur = i; };
    return art;
  }

  global.KBEureka = { create: create, TYPE: TYPE, ERA: ERA, css: css };
})(typeof window !== 'undefined' ? window : globalThis);
