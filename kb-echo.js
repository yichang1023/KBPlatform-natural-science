/* =====================================================================
 *  KB Echo — 跨溫層破壁指數的圖(拼圖連接盤)
 *  左邊:一片圓形拼圖。正中間是「自己」,周圍每一片是一位同組同學;
 *        顏色 = 你「第一次回應他」是什麼時候(較早 / 中期 / 近期),灰色 = 還沒互動。
 *  右邊:圓環儀表(破壁指數 0~100)、算式(已回應過的不同同學人數 ÷ 同組其他同學人數 ×100)、三個等級。
 *  資料全部來自論壇回應紀錄,不需要 AI。只負責畫圖,算分數的規則在頁面裡,沒有改。
 *  用法:
 *    KBEcho.mount(host)         把整張圖的畫面放進 host(裡面有 #echo-score、#echo-title、#echo-circle … 等固定的 id)
 *    KBEcho.render(host, data)  data = { score, targets, mates, tier(0|1|2), peers:[{ id, name, cat('e'|'m'|'l'|null), when }] }
 *    KBEcho.catOf(step, K)      第幾天 → 'e' 較早 / 'm' 中期 / 'l' 近期
 * ===================================================================== */
(function (global) {
  'use strict';
  var doc = global.document, uid = 0;
  var CIRC = 2 * Math.PI * 44;                 // 圓環的周長(半徑 44)
  var CAT = {
    e: { name: '較早', f1: '#dccff6', f2: '#c8b2f0', ink: '#2b2046' },
    m: { name: '中期', f1: '#b093e2', f2: '#9672d1', ink: '#ffffff' },
    l: { name: '近期', f1: '#70429f', f2: '#56298a', ink: '#ffffff' },
    n: { name: '尚未互動', f1: '#eeeef1', f2: '#dcdce1', ink: '#8a8a94' }
  };
  var TIER = [
    { name: '同溫層探索者', c1: '#ffa94d', c2: '#f08a1f', range: '0–39' },
    { name: '知識橋樑', c1: '#55a8ff', c2: '#1c6fe0', range: '40–79' },
    { name: '社群破壁者', c1: '#57d172', c2: '#27973f', range: '80–100' }
  ];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function f1(v) { return v.toFixed(1); }
  function catOf(step, K) { if (!K || K < 1) return 'e'; var r = step / K; return r <= 1 / 3 ? 'e' : (r <= 2 / 3 ? 'm' : 'l'); }

  /* ---------- 樣式(用 cqw:整張圖跟著卡片寬度等比例縮放,像一張圖片;太小的字有下限) ---------- */
  function css() {
    if (doc.getElementById('kb-echo-css')) return;
    var s = doc.createElement('style'); s.id = 'kb-echo-css';
    s.textContent = [
      '.ec{container-type:inline-size;color:#111827;font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;background:linear-gradient(160deg,#fbfcff,#f4f6fc);border:1px solid #e4e8f2;border-radius:18px;padding:3.4% 3.8% 3%}',
      '.ec{position:relative}.ec [data-tip]{cursor:help}.ec [data-tip]:focus-visible{outline:3px solid rgba(79,70,229,.55);outline-offset:2px;border-radius:8px}',
      '.ec-tip{position:absolute;left:0;top:0;z-index:30;width:min(330px,calc(100% - 16px));box-sizing:border-box;padding:13px 15px;border-radius:14px;background:rgba(255,255,255,.98);border:1px solid #c9d3e8;box-shadow:0 16px 36px -10px rgba(30,50,110,.5);font-size:16px;line-height:1.65;color:#33415c;pointer-events:none;opacity:0;transition:opacity .12s}.ec-tip.show{opacity:1}',
      '.ec-tip h5{margin:0 0 5px;font-size:19px;line-height:1.3;font-weight:800;color:#111827}.ec-tip .tg{display:inline-block;margin-left:6px;padding:1px 10px;border-radius:999px;font-size:13.5px;font-weight:800;vertical-align:2px;color:#fff}.ec-tip p{margin:5px 0 0}.ec-tip .hl{color:#111827;font-weight:700}.ec-tip .nx{margin-top:7px;padding:7px 10px;border-radius:10px;background:#eef4ff;color:#1f3a7a;font-weight:600}',
      '.ec-h{margin:0 0 2cqw;font-size:clamp(17px,4.7cqw,28px);font-weight:800;line-height:1.25;letter-spacing:.01em}',
      '.ec-main{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);gap:3cqw;align-items:start}',
      '.ec-l,.ec-r{display:flex;flex-direction:column;min-width:0}',
      '.ec-pz svg{display:block;width:100%;height:auto;overflow:visible}',
      '.ec-p{cursor:pointer;outline:none}.ec-p path.pc{transition:filter .15s}.ec-p:hover path.pc,.ec-p:focus path.pc{filter:brightness(1.07) drop-shadow(0 0 5px rgba(90,60,160,.55))}',
      '.ec-p text{pointer-events:none;font-weight:800;paint-order:normal}',
      '.ec-info{min-height:2.9em;margin:.8cqw 0 0;font-size:clamp(12.5px,2.8cqw,16px);line-height:1.5;color:#3b4560;text-align:center}',
      '.ec-lg{margin-top:2.2cqw}.ec-lg b{display:block;font-size:clamp(12px,2.7cqw,15px);margin-bottom:.9cqw}',
      '.ec-chips{display:flex;gap:1.2cqw;flex-wrap:wrap}.ec-chip{flex:1 1 0;min-width:fit-content;text-align:center;padding:.9cqw 1.4cqw;border-radius:1.1cqw;font-size:clamp(11.5px,2.5cqw,14.5px);font-weight:700;box-shadow:inset 0 0 0 1px rgba(255,255,255,.5),0 1px 2px rgba(60,40,110,.18)}',
      '.ec-ring{position:relative;width:100%;aspect-ratio:1;max-width:340px;margin:0 auto}.ec-ring>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
      '#echo-circle{transition:stroke-dashoffset 1s ease-out;filter:drop-shadow(0 0 3px rgba(40,120,230,.45))}',
      '.ec-ctr{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;width:62%}',
      '#echo-score{font-size:clamp(34px,11.5cqw,66px);font-weight:900;line-height:1;color:#0f172a}.ec-hr{display:block;width:70%;height:1px;background:#d9dde6;margin:.9cqw 0}',
      '#echo-frac{font-size:clamp(14px,3.6cqw,22px);font-weight:800;color:#1f2a44;letter-spacing:.04em}',
      '.ec-badge{position:absolute;right:-5%;bottom:1%;width:36%;aspect-ratio:1;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.2em;color:#fff;border:.7cqw solid rgba(255,255,255,.95);box-shadow:0 6px 16px rgba(30,90,200,.35),inset 0 2px 6px rgba(255,255,255,.35)}',
      '.ec-badge[data-tier="0"]{background:radial-gradient(circle at 35% 25%,#ffc27d,#f08a1f 75%);box-shadow:0 6px 16px rgba(240,138,31,.4),inset 0 2px 6px rgba(255,255,255,.35)}',
      '.ec-badge[data-tier="1"]{background:radial-gradient(circle at 35% 25%,#7cbcff,#1c6fe0 75%)}',
      '.ec-badge[data-tier="2"]{background:radial-gradient(circle at 35% 25%,#7be592,#27973f 75%);box-shadow:0 6px 16px rgba(39,151,63,.4),inset 0 2px 6px rgba(255,255,255,.35)}',
      '.ec-badge svg{width:46%;height:auto;display:none}.ec-badge[data-tier="0"] .i0,.ec-badge[data-tier="1"] .i1,.ec-badge[data-tier="2"] .i2{display:block}',
      '#echo-title{display:block;font-size:clamp(10.5px,2.45cqw,14px);font-weight:800;line-height:1.15;text-align:center;padding:0 .4em;word-break:keep-all}',
      '.ec-fm{display:flex;align-items:center;justify-content:center;gap:.7cqw;margin-top:2.2cqw;font-size:clamp(11px,2.3cqw,15px);font-weight:700;text-align:center;line-height:1.35}.ec-fm>span:first-child,.ec-fm>span:last-child{white-space:nowrap}',
      '.ec-fr{display:flex;flex-direction:column;align-items:stretch}.ec-fr span:first-child{border-bottom:1.5px solid #1f2a44;padding-bottom:.3em}.ec-fr span+span{padding-top:.3em}',
      '.ec-calc{margin-top:1.4cqw;text-align:center;font-size:clamp(13px,3cqw,18px);font-weight:800}',
      '.ec-note{margin-top:.6cqw;text-align:center;font-size:clamp(11px,2.3cqw,13.5px);color:#556079;line-height:1.45}',
      '.ec-lv{margin-top:2.2cqw}.ec-lv b{display:block;font-size:clamp(12px,2.7cqw,15px);margin-bottom:.9cqw}',
      '.ec-pills{display:grid;grid-template-columns:repeat(3,1fr);gap:1cqw}.ec-pill{text-align:center;transition:transform .2s}.ec-pill.on{transform:translateY(-1px)}',
      '.ec-pill i{display:block;font-style:normal;color:#fff;font-weight:800;font-size:clamp(11.5px,2.5cqw,14.5px);padding:.9cqw 0;border-radius:1.1cqw}.ec-pill i{box-shadow:0 1px 2px rgba(0,0,0,.15)}.ec-pill.on i{box-shadow:0 0 0 .55cqw rgba(60,90,160,.28),0 3px 8px rgba(0,0,0,.25)}.ec-pill.on span{color:#111827;font-weight:800}',
      '.ec-pill span{display:block;margin-top:.7cqw;font-size:clamp(10.5px,2.2cqw,13px);color:#3b4560;line-height:1.25}',
      '.ec-foot{margin-top:2.2cqw;font-size:clamp(11px,2.3cqw,13.5px);color:#556079}',
      '@container (max-width:700px){.ec-main{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}.ec-fm{flex-wrap:wrap;row-gap:.3em;font-size:clamp(12px,2.5cqw,15px)}.ec-fm>span:first-child{flex:1 0 100%}}',
      '@container (max-width:430px){.ec-main{grid-template-columns:minmax(0,1fr)}.ec-ring{max-width:260px}}',
      '@media (prefers-reduced-motion:reduce){#echo-circle,.ec-pill{transition:none!important}}'
    ].join('\n');
    (doc.head || doc.documentElement).appendChild(s);
  }

  /* ---------- 整張圖的固定畫面(id 不變:echo-score、echo-title、echo-circle) ---------- */
  function html() {
    var tp = TIER.map(function (t, i) { return '<div class="ec-pill" data-t="' + i + '" data-tip="tier:' + i + '" tabindex="0"><i style="background:linear-gradient(180deg,' + t.c1 + ',' + t.c2 + ')">' + t.range + '</i><span>' + t.name + '</span></div>'; }).join('');
    var chips = ['e', 'm', 'l', 'n'].map(function (k) { return '<span class="ec-chip" data-tip="cat:' + k + '" tabindex="0" style="background:linear-gradient(180deg,' + CAT[k].f1 + ',' + CAT[k].f2 + ');color:' + CAT[k].ink + '">' + CAT[k].name + '</span>'; }).join('');
    var ring = '<svg viewBox="0 0 120 120" aria-hidden="true"><defs>' +
      '<linearGradient id="ecbz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe3ec"/></linearGradient>' +
      TIER.map(function (t, i) { return '<linearGradient id="ecg' + i + '" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="' + t.c1 + '"/><stop offset="1" stop-color="' + t.c2 + '"/></linearGradient>'; }).join('') +
      '<filter id="ecsh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-color="#2b3a66" flood-opacity=".22"/></filter></defs>' +
      '<circle cx="60" cy="60" r="57" fill="url(#ecbz)" stroke="#d3d8e3" stroke-width="1" filter="url(#ecsh)"/>' +
      '<circle cx="60" cy="60" r="51.5" fill="#fff" stroke="#e9edf4" stroke-width="1"/>' +
      '<circle cx="60" cy="60" r="44" fill="none" stroke="#e8ecf3" stroke-width="9"/>' +
      '<circle id="echo-circle" cx="60" cy="60" r="44" fill="none" stroke="url(#ecg1)" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + CIRC.toFixed(2) + '" stroke-dashoffset="' + CIRC.toFixed(2) + '" transform="rotate(135 60 60)"/></svg>';
    var ic = 'fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"';
    var icons = '<svg class="i0" ' + ic + '><circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.2 5-5 2.2 2.2-5z"/></svg>' +
      '<svg class="i1" ' + ic + '><path d="M2 18h20M5 18V8M19 18V8M5 8c3.2 5 10.8 5 14 0M8.5 18v-3.2M12 18v-4.2M15.5 18v-3.2M3.5 21c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4 0"/></svg>' +
      '<svg class="i2" ' + ic + '><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4.1 6-.7z"/></svg>';
    return '<div class="ec" id="echo-fig"><h4 class="ec-h" data-tip="title" tabindex="0">拼圖連接盤｜破壁指數</h4><div class="ec-main">' +
      '<div class="ec-l"><div class="ec-pz" id="echo-puzzle"></div><div class="ec-info" id="echo-peer" aria-live="polite"></div>' +
      '<div class="ec-lg"><b>首次回應時間</b><div class="ec-chips">' + chips + '</div></div></div>' +
      '<div class="ec-r"><div class="ec-ring" data-tip="ring" tabindex="0">' + ring + '<div class="ec-ctr"><span id="echo-score">0</span><i class="ec-hr"></i><span id="echo-frac" data-tip="frac">0 / 0</span></div>' +
      '<div class="ec-badge" id="echo-badge" data-tier="0" data-tip="badge" tabindex="0">' + icons + '<span id="echo-title">同溫層探索者</span></div></div>' +
      '<div class="ec-fm" data-tip="formula" tabindex="0"><span>破壁指數＝</span><span class="ec-fr"><span>已回應過的不同同學人數</span><span>同組其他同學人數</span></span><span>×100</span></div>' +
      '<div class="ec-calc" id="echo-calc" data-tip="calc" tabindex="0">0 ÷ 0 ≈ 0%</div><div class="ec-note" data-tip="note" tabindex="0">重複回應同一人只算一次;自己不列入分母</div>' +
      '<div class="ec-lv"><b>指數等級</b><div class="ec-pills">' + tp + '</div></div></div></div>' +
      '<div class="ec-foot">衡量同組回應對象涵蓋率,不代表觀點差異或交流品質</div></div>';
  }

  /* ---------- 拼圖 ---------- */
  // 拼圖的「凸點」輪廓:邊長當 1,x 沿著邊走、y 往凸出的方向;傳回一串點(直線的部分也補點,畫在圓弧上才不會變成弦)
  function profile() {
    var P = [], i;
    function lin(a, b, n) { for (var j = 1; j <= n; j++) P.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); }
    function cub(p0, c1, c2, p3, n) { for (var j = 1; j <= n; j++) { var t = j / n, u = 1 - t; P.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]]); } }
    P.push([0, 0]); lin([0, 0], [.38, 0], 8);
    cub([.38, 0], [.415, .005], [.43, .05], [.4197, .0853], 6);
    for (i = 1; i <= 20; i++) { var th = (235 - 290 * i / 20) * Math.PI / 180; P.push([.5 + .14 * Math.cos(th), .2 + .14 * Math.sin(th)]); }
    cub([.5803, .0853], [.57, .05], [.585, .005], [.62, 0], 6);
    lin([.62, 0], [1, 0], 8);
    return P;
  }
  var PROF = profile();

  // 把一個個詞分成要畫的拼圖片:同學 ≤ 6 位 → 一人一片;更多 → 依「較早 / 中期 / 近期 / 尚未互動」分成幾大片(大小依人數)
  function pieces(peers) {
    var N = peers.length, out = [], order = { e: 0, m: 1, l: 2 };
    var ps = peers.slice().sort(function (a, b) { var A = a.cat ? order[a.cat] : 9, B = b.cat ? order[b.cat] : 9; return (A - B) || ((a.step || 0) - (b.step || 0)) || (String(a.id) < String(b.id) ? -1 : 1); });
    if (N === 0) return [{ cat: 'n', ang: Math.PI, label: '尚無同組同學', sub: '', who: [], empty: true }, { cat: 'n', ang: Math.PI, label: '', sub: '', who: [], dup: true }];
    if (N <= 6) {
      ps.forEach(function (p) { var c = p.cat || 'n'; out.push({ cat: c, ang: 2 * Math.PI / N, label: CAT[c].name, sub: c === 'n' ? '' : '已互動', who: [p] }); });
      if (N === 1) out.push({ cat: out[0].cat, ang: out[0].ang, label: '', sub: '', who: [], dup: true });
    } else {
      ['e', 'm', 'l', 'n'].forEach(function (k) {
        var who = ps.filter(function (p) { return (p.cat || 'n') === k; }); if (!who.length) return;
        out.push({ cat: k, count: who.length, who: who, label: CAT[k].name, sub: k === 'n' ? '' : '已互動', sub2: who.length + ' 位', raw: 2 * Math.PI * who.length / N });
      });
      var min = 50 * Math.PI / 180, tot, it = 0;   // 每片至少 50°,多的再等比例縮小
      out.forEach(function (o) { o.ang = Math.max(min, o.raw); });
      do { tot = out.reduce(function (a, o) { return a + o.ang; }, 0); var free = out.filter(function (o) { return o.ang > min + 1e-6; }); if (tot <= 2 * Math.PI + 1e-6 || !free.length) break; var ft = free.reduce(function (a, o) { return a + o.ang; }, 0), cut = tot - 2 * Math.PI; free.forEach(function (o) { o.ang = Math.max(min, o.ang - cut * o.ang / ft); }); } while (++it < 30);
      tot = out.reduce(function (a, o) { return a + o.ang; }, 0); out.forEach(function (o) { o.ang *= 2 * Math.PI / tot; });
    }
    return out;
  }

  function puzzleSVG(list) {
    var CX = 200, CY = 200, R = 168, R0 = 54, id = 'ecp' + (++uid), N = list.length, i, k;
    var c = [-Math.PI / 2]; for (i = 0; i < N; i++) c.push(c[i] - list[i].ang);      // 從 12 點鐘往左(逆時針)排,較早的在左上
    function pt(r, a) { return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; }
    // 兩片之間的邊(從中心往外),k = 第幾條邊;凸點的方向輪流換,左右片剛好咬合
    var E = [];
    for (k = 0; k < N; k++) {
      var th = c[k], ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux, L = R - R0, sg = (k % 2 === 0) ? 1 : -1, pts = [];
      PROF.forEach(function (q) { var r = R0 + q[0] * L, o = sg * q[1] * L; pts.push([CX + ux * r + nx * o, CY + uy * r + ny * o]); });
      E.push(pts);
    }
    // 每一片靠中間的邊(圓弧):凸點最大不超過 L 的長度,免得只有兩三片時凸點大得誇張
    var I = [];
    for (i = 0; i < N; i++) {
      var aS = c[i + 1], aE = c[i], span = aE - aS, arcLen = R0 * span, Leff = Math.min(arcLen, 62), f = Leff / arcLen, sg2 = (i % 2 === 0) ? 1 : -1, pts2 = [], j;
      var nFlat = Math.max(2, Math.round(span * 180 / Math.PI / 6));
      for (j = 0; j <= nFlat; j++) { var x0 = (.5 - .5 * f) * j / nFlat; pts2.push(pt(R0, aS + x0 * span)); }
      PROF.forEach(function (q) { var x = .5 + (q[0] - .5) * f; pts2.push(pt(R0 + sg2 * q[1] * Leff, aS + x * span)); });
      for (j = 1; j <= nFlat; j++) { var x1 = (.5 + .5 * f) + (.5 - .5 * f) * j / nFlat; pts2.push(pt(R0, aS + x1 * span)); }
      I.push(pts2);
    }
    function d(points) { return 'M' + points.map(function (p) { return f1(p[0]) + ' ' + f1(p[1]); }).join('L') + 'Z'; }
    function arc(a0, a1) { var n = Math.max(4, Math.round(Math.abs(a1 - a0) * 180 / Math.PI / 3)), o = [], j; for (j = 0; j <= n; j++) o.push(pt(R, a0 + (a1 - a0) * j / n)); return o; }
    var defs = '<defs>' + ['e', 'm', 'l', 'n'].map(function (kk) { return '<linearGradient id="' + id + kk + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + CAT[kk].f1 + '"/><stop offset="1" stop-color="' + CAT[kk].f2 + '"/></linearGradient>'; }).join('') +
      '<linearGradient id="' + id + 'c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eceef3"/></linearGradient>' +
      '<linearGradient id="' + id + 'b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e9ecf2"/><stop offset="1" stop-color="#d4d9e3"/></linearGradient>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2=".7" y2=".9"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<filter id="' + id + 's" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="9"/></filter>' +
      '<filter id="' + id + 'd" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#2a1d4a" flood-opacity=".28"/></filter></defs>';
    var svg = '<svg viewBox="0 0 400 400" role="img" aria-label="跟同組同學互動的拼圖:顏色是第一次回應的時間" class="ec-svg">' + defs +
      '<ellipse cx="200" cy="384" rx="150" ry="9" fill="#2b3350" opacity=".22" filter="url(#' + id + 's)"/>' +
      '<circle cx="200" cy="200" r="186" fill="url(#' + id + 'b)" stroke="#cdd2dd" stroke-width="1.5"/><circle cx="200" cy="200" r="177" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="3"/>' +
      '<g filter="url(#' + id + 'd)">';
    var texts = '';
    list.forEach(function (o, i) {
      var aS = c[i + 1], aE = c[i], path = E[(i + 1) % N].concat(arc(aS, aE), E[i].slice().reverse(), I[i].slice().reverse());
      var am = (aS + aE) / 2, big = o.ang > 1.7, fs = big ? 27 : (o.ang > 1.1 ? 24 : 20), lp, ok = false, tries = 0, fs2, hw, hh, rr, lines;
      if (o.empty) fs = 19;
      function tw(t, f) { var w = 0; for (var q = 0; q < t.length; q++) w += t.charCodeAt(q) > 255 ? f * .98 : f * .56; return w; }
      // 文字要放得進這一片:不超出圓盤外緣、也不壓到中間的「自己」(放不下就把字縮小一點)
      while (!ok && tries++ < 6) {
        fs2 = Math.round(fs * .7);
        // 四個字的類別名稱(尚未互動)太寬放不下時,先試著拆成兩行,再不行才縮小字
        var variants = (o.label && o.label.length === 4) ? [0, 1] : [0], vi;
        for (vi = 0; vi < variants.length && !ok; vi++) {
          var head = variants[vi] ? [{ t: o.label.slice(0, 2), f: fs, w: 600 }, { t: o.label.slice(2), f: fs, w: 600 }] : (o.label ? [{ t: o.label, f: fs, w: o.cat === 'n' ? 600 : 800 }] : []);
          lines = head.concat([o.sub ? { t: o.sub, f: fs2, w: 500 } : null, o.sub2 ? { t: o.sub2, f: fs2, w: 500 } : null].filter(Boolean));
          hw = Math.max.apply(null, lines.map(function (l) { return tw(l.t, l.f); }).concat([1])) / 2; hh = lines.reduce(function (a, l) { return a + l.f * 1.18; }, 0) / 2;
          // 先放在這一片的正中間;放不下就沿著圓周左右挪一點(離開正右/正左,那裡最窄)
          var cand = [0, .3, -.3, .6, -.6, .9, -.9, 1.2, -1.2].filter(function (dl) { return Math.abs(dl) <= o.ang / 2 - .32 + 1e-9; }), ci;
          for (ci = 0; ci < cand.length && !ok; ci++) {
            var a2 = am + cand[ci], hr = hw * Math.abs(Math.cos(a2)) + hh * Math.abs(Math.sin(a2));       // 文字在「從中心往外」這個方向佔的半長
            for (rr = R - 16 - hr; rr >= R0 + 26 + hr; rr -= 3) {
              lp = pt(rr, a2);
              if (Math.abs(lp[0] - 200) + hw <= Math.sqrt(R * R - Math.pow(lp[1] - 200 - Math.sign(lp[1] - 200) * hh, 2)) - 8) { ok = true; break; }
            }
          }
        }
        if (!ok) fs = Math.round(fs * .9);
      }
      if (!ok) lp = pt(R0 + (R - R0) * .6, am);
      if (o.empty) lp = pt(R0 + (R - R0) * .6, Math.PI / 2);
      var who = o.who && o.who[0], title = o.empty ? '這一組還沒有其他同學' : (o.dup ? '' : (o.who.length === 1 ? (who.name || '同學') + ':' + (o.cat === 'n' ? '還沒有互動' : '第一次回應在 ' + (who.when || '') + '(' + CAT[o.cat].name + ')') : CAT[o.cat].name + ':' + o.who.length + ' 位同學'));
      svg += '<g class="ec-p" data-i="' + i + '"' + (o.dup ? '' : ' data-tip="p:' + i + '"') + ' tabindex="' + (o.dup ? '-1' : '0') + '"' + (o.dup ? ' aria-hidden="true"' : ' role="img" aria-label="' + esc(title) + '"') + '><path class="pc" d="' + d(path) + '" fill="url(#' + id + o.cat + ')" stroke="#fff" stroke-opacity=".92" stroke-width="3" stroke-linejoin="round"/>' + '</g>';
      if (lines.length) { var y0 = lp[1] - hh, tx = '<g pointer-events="none" fill="' + CAT[o.cat].ink + '" text-anchor="middle">'; lines.forEach(function (l) { y0 += l.f * 1.18; tx += '<text x="' + f1(lp[0]) + '" y="' + f1(y0 - l.f * .26) + '" font-size="' + l.f + '" font-weight="' + l.w + '">' + esc(l.t) + '</text>'; }); texts += tx + '</g>'; }
    });
    var cp = []; for (i = N - 1; i >= 0; i--) cp = cp.concat(I[i]);
    svg += '</g><g class="ec-cp" data-tip="center" tabindex="0" filter="url(#' + id + 'd)"><path d="' + d(cp) + '" fill="url(#' + id + 'c)" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></g>' +
      '<text x="200" y="212" text-anchor="middle" font-size="32" font-weight="900" fill="#111827" pointer-events="none">自己</text>' + texts +
      '<circle cx="200" cy="200" r="168" fill="url(#' + id + 'g)" pointer-events="none"/></svg>';
    return svg;
  }

  function tierOf(score) { return score >= 80 ? 2 : (score >= 40 ? 1 : 0); }
  var DEF = '滑鼠移到(或用 Tab 鍵選到)拼圖上,看是哪一位同學、什麼時候第一次回應他。';

  /* ---------- 滑鼠移到(或用 Tab 鍵選到)圖上任何一個地方,跳出說明 ---------- */
  function needFor(m, t, target) { for (var x = t; x <= m; x++) if (Math.round(x / m * 100) >= target) return x - t; return 0; }
  function tipHtml(key, st) {
    var d = st.d, list = st.list, tier = st.tier, m = d.mates || 0, t = d.targets || 0, sc = d.score || 0;
    function h(title, tag, tagBg) { return '<h5>' + title + (tag ? '<span class="tg" style="background:' + (tagBg || '#6b4fa8') + '">' + tag + '</span>' : '') + '</h5>'; }
    var COLORS = 'color:#fff';
    if (key.indexOf('p:') === 0) {
      var o = list[Number(key.slice(2))]; if (!o) return '';
      if (o.empty) return h('這一組還沒有其他同學') + '<p>等同學加入討論後,這裡就會長出一片一片的拼圖。</p>';
      if (o.who.length === 1) {
        var w = o.who[0];
        if (o.cat === 'n') return h('👤 ' + esc(w.name || '同學'), '尚未互動', '#8d8d99') + '<p>你還沒有回應過他。</p><div class="nx">去看看他的想法、回應他,這片拼圖就會變色,破壁指數也會往上!</div>';
        return h('👤 ' + esc(w.name || '同學'), CAT[o.cat].name + '已互動', CAT[o.cat].f2) + '<p>你第一次回應他是 <span class="hl">' + esc(w.when || '') + '</span>。</p><p>顏色越深,代表你越晚才第一次回應他(較早 → 中期 → 近期)。</p>';
      }
      var names = o.who.length <= 8 ? '<p>' + o.who.map(function (x) { return esc(x.name || '同學'); }).join('、') + '</p>' : '';
      if (o.cat === 'n') return h('尚未互動', o.who.length + ' 位', '#8d8d99') + '<p>這些同學你還沒有回應過。</p>' + names + '<div class="nx">回應「還沒說過話」的新同學,灰色的片就會變成有顏色的片。</div>';
      return h(CAT[o.cat].name + '已互動', o.who.length + ' 位', CAT[o.cat].f2) + '<p>你第一次回應這 ' + o.who.length + ' 位同學的時間,都落在<span class="hl">' + (o.cat === 'e' ? '整段時間的前三分之一' : o.cat === 'm' ? '整段時間的中間三分之一' : '整段時間的最後三分之一') + '</span>。</p>' + names;
    }
    if (key === 'center') return h('自己') + '<p>這是你自己。周圍的每一片拼圖是一位同組同學(同學很多時,會把同一種顏色的合成一大片)。</p><p>自己不列入分母。</p>';
    if (key === 'ring') return h('破壁指數 ' + sc, TIER[tier].name, TIER[tier].c2) + (m ? '<p>你回應過 <span class="hl">' + t + '</span> 位不同的同學,同組其他同學共 <span class="hl">' + m + '</span> 位:' + t + ' ÷ ' + m + ' × 100 ≈ ' + sc + '。</p><p>圓環填滿的比例,就是這個分數(滿格 = 100)。</p>' : '<p>這一組還沒有其他同學可以比較。</p>');
    if (key === 'frac') return h(t + ' / ' + m) + '<p><span class="hl">' + t + '</span>:你回應過的不同同學人數(同一位回應很多次,只算 1 位)。</p><p><span class="hl">' + m + '</span>:同組其他同學的人數(自己不算)。</p>';
    if (key === 'badge') {
      var nx = tier === 2 ? '' : (function () { var tg = tier === 0 ? 40 : 80, k = needFor(m, t, tg); return k > 0 && m ? '<div class="nx">再回應 ' + k + ' 位「還沒說過話」的新同學,就能升到「' + TIER[tier + 1].name + '」(' + tg + ' 分以上)。</div>' : ''; })();
      return h(TIER[tier].name, TIER[tier].range + ' 分', TIER[tier].c2) + '<p>' + ['大多和固定幾位同學互動。', '開始連結不同的同學。', '跟幾乎每位同學都交流過!'][tier] + '</p>' + (tier === 2 ? '<div class="nx">太棒了,繼續保持!</div>' : nx);
    }
    if (key === 'formula') return h('破壁指數怎麼算') + '<p>已回應過的不同同學人數 ÷ 同組其他同學人數 × 100。</p>' + (m ? '<p>你的數字:<span class="hl">' + t + ' ÷ ' + m + ' × 100 ≈ ' + sc + '</span>。</p>' : '');
    if (key === 'calc') return h(m ? t + ' ÷ ' + m + ' ≈ ' + sc + '%' : '還沒有同組同學') + '<p>把兩個人數相除、乘以 100,再四捨五入,就是破壁指數。</p>';
    if (key === 'note') return h('怎麼算人數') + '<p>同一位同學回應很多次,只算 1 位;自己的貼文不算,分母也不包含自己。</p>';
    if (key.indexOf('tier:') === 0) {
      var i = Number(key.slice(5)), T = TIER[i];
      return h(T.name, T.range + ' 分', T.c2) + '<p>' + ['大多和固定幾位同學互動。', '開始連結不同的同學。', '跟幾乎每位同學都交流過。'][i] + '</p>' + (i === tier ? '<div class="nx">你現在在這一級。</div>' : '');
    }
    if (key.indexOf('cat:') === 0) {
      var c = key.slice(4);
      return h(CAT[c].name, c === 'n' ? '' : '首次回應', CAT[c].f2) + '<p>' + (c === 'n' ? '你還沒有回應過這位同學。' : '把整段討論時間分成三等份,你第一次回應他的時間落在<span class="hl">' + (c === 'e' ? '前三分之一' : c === 'm' ? '中間三分之一' : '最後三分之一') + '</span>。') + '</p>';
    }
    if (key === 'title') return h('拼圖連接盤') + '<p>左邊的拼圖看你跟哪些同組同學互動過,右邊的圓環是破壁指數。滑鼠移到任何地方都有說明。</p>';
    return '';
  }
  function bindTips(root) {
    if (root.__ecTip) return; root.__ecTip = true;
    var tip = doc.createElement('div'); tip.className = 'ec-tip'; tip.setAttribute('role', 'tooltip'); tip.id = 'echo-tip'; root.appendChild(tip);
    var cur = null;
    function place(x, y) {   // x、y 是相對於整張圖的位置
      var W = root.clientWidth || 600, H = root.clientHeight || 500, w = tip.offsetWidth || 300, hh = tip.offsetHeight || 120;
      var left = x + 16, top = y + 18; if (left + w > W - 8) left = x - w - 16; if (left < 8) left = Math.max(8, Math.min(W - w - 8, x - w / 2));
      if (top + hh > H - 8) top = y - hh - 14; if (top < 8) top = 8;
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
    function show(el, x, y) {
      var st = root.__ec; if (!st) return; var key = el.getAttribute('data-tip'), html = tipHtml(key, st); if (!html) return;
      if (cur !== el || tip.__html !== html) { tip.innerHTML = html; tip.__html = html; cur = el; }
      tip.classList.add('show'); place(x, y);
    }
    function hide() { tip.classList.remove('show'); cur = null; }
    function rel(e) { var r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    root.addEventListener('mouseover', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (!el || !root.contains(el)) { hide(); return; } var p = rel(e); show(el, p.x, p.y); });
    root.addEventListener('mousemove', function (e) { if (!cur) return; var p = rel(e); place(p.x, p.y); });
    root.addEventListener('mouseout', function (e) { var to = e.relatedTarget; if (!to || !cur || !cur.contains(to)) { var nx = to && to.closest ? to.closest('[data-tip]') : null; if (!nx) hide(); } });
    root.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (!el) return; var r = el.getBoundingClientRect(), b = root.getBoundingClientRect(); show(el, r.left - b.left + r.width / 2, r.top - b.top + r.height / 2); });
    root.addEventListener('focusout', hide);
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    root.addEventListener('click', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (!el) { hide(); return; } if (e.detail === 0) return; var p = rel(e); show(el, p.x, p.y); });   // 手機:點一下就出現說明
    root.addEventListener('mouseleave', hide);
    // 播放時資料換了:說明正顯示著的話,內容也跟著更新
    function refresh() { if (!cur || !tip.classList.contains('show') || !root.__ec) return; var html = tipHtml(cur.getAttribute('data-tip'), root.__ec); if (!html) { hide(); return; } if (tip.__html !== html) { tip.innerHTML = html; tip.__html = html; } }
    root.__ecTipApi = { show: show, hide: hide, html: tipHtml, refresh: refresh };
  }

  function render(host, d) {
    host = host || doc; d = d || {};
    var $ = function (s) { return host.querySelector(s); }, tier = d.tier == null ? tierOf(d.score || 0) : d.tier, peers = d.peers || [];
    var list = pieces(peers), pz = $('#echo-puzzle'), info = $('#echo-peer');
    var rootEl = $('#echo-fig') || host; rootEl.__ec = { d: d, list: list, tier: tier }; bindTips(rootEl); if (rootEl.__ecTipApi) rootEl.__ecTipApi.refresh();
    if (pz) {
      pz.innerHTML = puzzleSVG(list);
      Array.prototype.forEach.call(pz.querySelectorAll('.ec-p'), function (g) {
        var o = list[Number(g.getAttribute('data-i'))]; if (!o || o.dup) return;
        function show() {
          if (!info) return;
          if (o.empty) { info.textContent = '這一組還沒有其他同學,等同學加入後,拼圖就會長出來。'; return; }
          if (o.who.length === 1) { var w = o.who[0]; info.innerHTML = '👤 <b>' + esc(w.name || '同學') + '</b>:' + (o.cat === 'n' ? '你還沒有回應他,去看看他的想法吧!' : '你第一次回應他是 <b>' + esc(w.when || '') + '</b>(' + CAT[o.cat].name + ')'); return; }
          info.innerHTML = '<b>' + CAT[o.cat].name + (o.cat === 'n' ? '' : '已互動') + '</b>:' + o.who.length + ' 位同學' + (o.who.length <= 8 ? '(' + o.who.map(function (w) { return esc(w.name || '同學'); }).join('、') + ')' : '');
        }
        g.addEventListener('mouseenter', show); g.addEventListener('focus', show);
        g.addEventListener('mouseleave', function () { if (info) info.textContent = DEF; }); g.addEventListener('blur', function () { if (info) info.textContent = DEF; });
      });
    }
    if (info && !info.textContent) info.textContent = DEF;
    var circ = $('#echo-circle');
    if (circ) { circ.style.strokeDashoffset = (CIRC * (1 - Math.max(0, Math.min(100, d.score || 0)) / 100)).toFixed(2); circ.setAttribute('stroke', 'url(#ecg' + tier + ')'); }
    var fr = $('#echo-frac'); if (fr) fr.textContent = (d.targets || 0) + ' / ' + (d.mates || 0);
    var cl = $('#echo-calc'); if (cl) cl.textContent = (d.mates ? (d.targets || 0) + ' ÷ ' + d.mates + ' ≈ ' + (d.score || 0) + '%' : '還沒有同組同學可以比較');
    var bd = $('#echo-badge'); if (bd) bd.setAttribute('data-tier', String(tier));
    Array.prototype.forEach.call(host.querySelectorAll('.ec-pill'), function (p) { p.classList.toggle('on', Number(p.getAttribute('data-t')) === tier); });
    return list;
  }
  function mount(host) { if (!host) return null; css(); host.innerHTML = html(); return host.querySelector('#echo-fig'); }

  // 頁面上有 #echo-fig-host 就自動放進去(這個 script 放在 host 後面,所以此時 host 已經在畫面上)
  function auto() { var h = doc && doc.getElementById('echo-fig-host'); if (h && !h.querySelector('#echo-fig')) mount(h); }
  if (doc) { if (doc.getElementById('echo-fig-host')) auto(); else doc.addEventListener('DOMContentLoaded', auto); }

  global.KBEcho = { mount: mount, render: render, catOf: catOf, tierOf: tierOf, pieces: pieces, puzzleSVG: puzzleSVG, CAT: CAT, TIER: TIER, CIRC: CIRC };
})(typeof window !== 'undefined' ? window : globalThis);
