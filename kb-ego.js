/* =====================================================================
 *  KB Ego — 互動圈(Ego Network)的「社群位置」排法
 *  不是隨機排,每一顆球的位置都有意思(看「相對位置」,不看絕對位置):
 *    - 你在正中央。
 *    - 距離(從內圈到外圈)= 你和這位同學互動的多寡:把「有互動的同學」依互動次數分成三等份
 *      (最內圈 = 互動最多的三分之一…),最外圍的一圈 = 還沒有互動的同學。
 *    - 方向(扇形區)= 組別:同一組的同學排在同一個扇形裡,你自己的那一組在正上方。
 *    - 顏色 = 組別(老師設定的組別,每一組一種顏色)。
 *  每次打開都一樣(沒有隨機);播放時,同學會隨著互動變多從外圈慢慢移到內圈。
 *  理論依據與限制:見 README(同心圓個人網絡圖、空間位置影響結構判讀、組別=社群的假設)。
 *  用法:KBEgo.layout({ me, peers:[{id,groupId}], groups:[{id,name,color?}], total:{id:次數}, th })
 * ===================================================================== */
(function (global) {
  'use strict';
  // 色盲友善為主的 10 色(Okabe-Ito / Tableau 風格),每一組一種;老師若在組別上設了 color,就用老師設的
  var PALETTE = ['#e4572e', '#2e86de', '#2fa84f', '#f2a900', '#8e5bd9', '#0fa3b1', '#d6336c', '#7a8a2e', '#5c6f91', '#c0762d'];
  var RING_NAMES = ['互動最多', '互動較多', '互動較少', '還沒有互動'];
  var BASE_R = [105, 168, 231, 305], SIZES = [22, 20, 18, 15];
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mixWhite(hex, m) { var n = parseInt(String(hex).slice(1), 16), R = n >> 16, G = (n >> 8) & 255, B = n & 255; R = Math.round(R + (255 - R) * m); G = Math.round(G + (255 - G) * m); B = Math.round(B + (255 - B) * m); return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1); }
  function darker(hex, m) { var n = parseInt(String(hex).slice(1), 16), R = n >> 16, G = (n >> 8) & 255, B = n & 255; R = Math.round(R * (1 - m)); G = Math.round(G * (1 - m)); B = Math.round(B * (1 - m)); return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1); }

  // 組別的顏色:老師設定的顏色優先;沒設定的,依「這個班的組別順序」從色盤配對,而且不會跟老師已選的顏色重複(和 kb-core 的 groupColorMap 同一套規則)
  function colorMap(groups) {
    var used = {}, map = {}, k = 0;
    (groups || []).forEach(function (g) { if (/^#[0-9a-fA-F]{6}$/.test(String(g.color || ''))) used[String(g.color).toLowerCase()] = 1; });
    (groups || []).forEach(function (g) {
      if (/^#[0-9a-fA-F]{6}$/.test(String(g.color || ''))) { map[g.id] = g.color; return; }
      var tries = 0; while (used[PALETTE[k % PALETTE.length]] && tries++ < PALETTE.length) k++;
      map[g.id] = PALETTE[k % PALETTE.length]; k++;
    });
    return map;
  }
  function groupColor(groups, gid) { if (gid === '' || gid == null) return '#94a3b8'; var m = colorMap(groups); return m[gid] || '#94a3b8'; }

  // 有互動的同學依「最後(整段時間)的互動次數」分三等份:回傳兩個門檻 q1 < q2(次數 ≥ q2 → 最內圈;≥ q1 → 第二圈;其餘有互動 → 第三圈)
  function thresholds(finalTotals) {
    var v = finalTotals.filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; }), n = v.length;
    if (!n) return { q1: 1, q2: 1 };
    var q1 = v[Math.floor(n / 3)], q2 = v[Math.floor(2 * n / 3)];
    if (n < 3) { q1 = v[0]; q2 = v[n - 1]; }
    return { q1: q1, q2: Math.max(q2, q1) };
  }
  function ringFor(total, th) { if (!(total > 0)) return 3; if (total >= th.q2 && th.q2 > th.q1) return 0; if (total >= th.q2 && th.q2 === th.q1) return total > th.q1 ? 0 : 1; if (total >= th.q1) return 1; return 2; }

  // o = { me, peers:[{id,groupId}], groups:[{id,name,color?}], myGroupId, total:{id→次數}, th }
  // 回傳 { pos:{id:{x,y}}, ring:{id}, size:{id}, color:{id}, sectors:[{gid,name,color,a0,a1,n}], radii:[…], P }
  function layout(o) {
    var peers = (o.peers || []).slice().sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; }), P = peers.length, th = o.th || { q1: 1, q2: 1 }, groups = o.groups || [];
    var order = [], seen = {}, myG = o.myGroupId == null ? '' : o.myGroupId;
    function addG(gid) { if (seen[gid]) return; seen[gid] = 1; order.push(gid); }
    addG(myG); groups.forEach(function (g) { addG(g.id); }); peers.forEach(function (p) { addG(p.groupId || ''); });
    var by = {}; peers.forEach(function (p) { var g = p.groupId || ''; (by[g] = by[g] || []).push(p); });
    order = order.filter(function (g) { return by[g] && by[g].length; });
    var res = { pos: {}, ring: {}, size: {}, color: {}, sectors: [], P: P }, f = clamp(Math.sqrt(P / 14), 0.9, 1.6);
    res.radii = BASE_R.map(function (r) { return Math.round(r * f); });
    if (!P) return res;
    var slot = 2 * Math.PI / P, total = 0; order.forEach(function (g) { total += by[g].length; });
    // 自己的那一組放在正上方:先算「自己這組之前」的角度,再把整圈轉過去
    var myIdx = order.indexOf(myG), before = 0, i, k;
    if (myIdx >= 0) { for (i = 0; i < myIdx; i++) before += by[order[i]].length; }
    var mySpan = myIdx >= 0 ? by[myG].length * slot : 0, start = -Math.PI / 2 - (before * slot + mySpan / 2);
    var a = start;
    order.forEach(function (g, gi) {
      var list = by[g], a0 = a; res.sectors.push({ gid: g, color: groupColor(groups, g), a0: a0, a1: a0 + list.length * slot, n: list.length });
      list.forEach(function (p, k2) {
        var t = (o.total && o.total[p.id]) || 0, r = ringFor(t, th), ang = a0 + (k2 + .5) * slot, rad = res.radii[r] + ((k2 % 2) ? 11 : -11) * (r === 3 ? 0.6 : 1);
        res.pos[p.id] = { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad }; res.ring[p.id] = r; res.size[p.id] = SIZES[r]; res.color[p.id] = groupColor(groups, g);
      });
      a = a0 + list.length * slot;
    });
    for (k = 0; k < groups.length; k++) { for (i = 0; i < res.sectors.length; i++) if (res.sectors[i].gid === groups[k].id) res.sectors[i].name = groups[k].name; }
    res.sectors.forEach(function (s) { if (s.name == null) s.name = s.gid ? '未命名組' : '未分組'; });
    return res;
  }




  /* ---------- 立體的球:有受光的亮面、暗面、邊緣光;沒互動的球是半透明的「空心球」 ---------- */
  var HEIGHTS = [64, 42, 22, 0], ME_H = 96;     // 離盤面的高度(旋轉後才看得出來):互動越多的同學,離你(最高的那顆)越近、也站得越高
  function sphereRenderer(col, hollow, label, labelColor, me, fontPx) {
    return function (a) {
      var ctx = a.ctx, x = a.x, y = a.y, r = (a.style && a.style.size) || 14, hov = a.state && (a.state.hover || a.state.selected);
      return {
        drawNode: function () {
          ctx.save();
          if (me) { var halo = ctx.createRadialGradient(x, y, r * .8, x, y, r * 2.3); halo.addColorStop(0, 'rgba(99,102,241,.38)'); halo.addColorStop(1, 'rgba(99,102,241,0)'); ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 2.3, 0, 6.2832); ctx.fill(); }
          var g = ctx.createRadialGradient(x - r * .38, y - r * .42, r * .08, x, y, r * 1.05);
          if (hollow) { g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.55, mixWhite(col, .78)); g.addColorStop(1, mixWhite(col, .45)); }
          else { g.addColorStop(0, mixWhite(col, .82)); g.addColorStop(.38, mixWhite(col, .12)); g.addColorStop(.78, col); g.addColorStop(1, darker(col, .42)); }
          ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = g; ctx.shadowColor = hollow ? 'rgba(15,23,42,.10)' : 'rgba(15,23,42,.32)'; ctx.shadowBlur = hollow ? 3 : 7; ctx.shadowOffsetY = 2; ctx.fill(); ctx.shadowColor = 'transparent';
          ctx.lineWidth = hov ? 3 : (hollow ? 1.6 : 1.4); ctx.strokeStyle = hov ? '#312e81' : (hollow ? mixWhite(col, .12) : darker(col, .3)); if (hollow) ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.ellipse(x - r * .34, y - r * .4, r * .3, r * .18, -0.6, 0, 6.2832); ctx.fillStyle = hollow ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.58)'; ctx.fill();   // 高光
          if (me) { ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, 6.2832); ctx.stroke(); }
          ctx.restore();
        },
        drawExternalLabel: function () {
          var lines = String(label).split('\n'), fs = fontPx || (me ? 17 : 14);
          ctx.save(); ctx.font = (me ? '700 ' : '600 ') + fs + 'px "Noto Sans TC",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          lines.forEach(function (ln, k) { var yy = y + r + 3 + k * (fs + 2); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(ln, x, yy); ctx.fillStyle = labelColor; ctx.fillText(ln, x, yy); });
          ctx.restore();
        },
        nodeDimensions: { width: r * 2, height: r * 2 }
      };
    };
  }

  /* ---------- 底圖要跟著 3D 一起轉:把「平面上的點」投影到畫面上(沒轉的時候就是原本的位置) ---------- */
  function projector(net) { var rg = net.__kb3d && net.__kb3d.rig; return function (x, y) { if (rg && rg.active()) return rg.projectFlat(x, y); return { x: x, y: y, f: 1, z: 0 }; }; }
  function arcPts(P, cx, cy, r, a0, a1, step) { var n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / (step || 0.06))), out = [], i; for (i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; out.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); } return out; }
  function trace(ctx, pts, close) { ctx.beginPath(); pts.forEach(function (q, i) { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); if (close) ctx.closePath(); }
  // 外面的玻璃球殼:所有同學都在這個球形空間裡(轉動時球殼的輪廓不變,像一個透明的地球儀)
  function drawGlobe(ctx, P, R, cx0, cy0) {
    return;   // 外面那一圈球殼已隱藏:看起來像把同學綁住,不需要
    var c = P(cx0 || 0, cy0 || 0), rs = (R + 14) * 1.05, g = ctx.createRadialGradient(c.x - rs * .28, c.y - rs * .34, rs * .1, c.x, c.y, rs);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(.72, 'rgba(226,236,250,.22)'); g.addColorStop(1, 'rgba(150,178,222,.42)');
    ctx.save(); ctx.beginPath(); ctx.arc(c.x, c.y, rs, 0, 6.2832); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(120,150,200,.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, c.y, rs * .94, Math.PI * 1.1, Math.PI * 1.42); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
  }
  // 轉動時:每個球在盤面上的影子,和一條連到球的細線(看得出球飄在盤子上方多高)
  function drawDrops(ctx, net, rg) {
    try {
      var pos = net.getPositions(), flat = (net.__kb3d && net.__kb3d.st && net.__kb3d.st.flat) || {}; ctx.save();
      Object.keys(pos).forEach(function (id) {
        var f = flat[id], nd = net.body.nodes[id]; if (!f || !nd) return; var gp = rg.projectFlat(f.x, f.y), np = pos[id], r = (nd.options && nd.options.size) || 12;
        ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(np.x, np.y); ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(71,85,105,.32)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.ellipse(gp.x, gp.y, r * .85, r * .38, 0, 0, 6.2832); ctx.fillStyle = 'rgba(15,23,42,.16)'; ctx.fill();
      });
      ctx.restore();
    } catch (x) {}
  }
  // 整個大環境:一個大圓盤(有邊、有一點厚度的陰影),扇形(組別)、同心圓(離你多近)、名稱都畫在盤面上
  function drawDisc(ctx, P, active, Rout, sectors, radii, nameOf, myGroup, ringNames) {
    ctx.save();
    var rim = arcPts(P, 0, 0, Rout + 14, 0, Math.PI * 2, 0.05);
    trace(ctx, rim, true); var g0 = P(0, 0), gr = ctx.createRadialGradient(g0.x, g0.y, 0, g0.x, g0.y, (Rout + 14) * (g0.f || 1)); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.8, 'rgba(238,242,248,.9)'); gr.addColorStop(1, 'rgba(238,242,248,0)'); ctx.fillStyle = gr; ctx.fill();   // 外緣淡出,不畫邊線(不要有一圈框住)
    sectors.forEach(function (sec) { var pts = [P(0, 0)].concat(arcPts(P, 0, 0, Rout, sec.a0, sec.a1, 0.05)); trace(ctx, pts, true); ctx.fillStyle = mixWhite(sec.color, .9); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3; ctx.stroke(); });
    radii.forEach(function (r, k) { trace(ctx, arcPts(P, 0, 0, r, 0, Math.PI * 2, 0.05), true); ctx.setLineDash(k === 3 ? [2, 7] : [5, 6]); ctx.strokeStyle = k === 3 ? 'rgba(100,116,139,.55)' : 'rgba(100,116,139,.34)'; ctx.lineWidth = 1.2; ctx.stroke(); });
    ctx.setLineDash([]); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    sectors.forEach(function (sec) { var am = (sec.a0 + sec.a1) / 2, rr = Rout + 30, q = P(Math.cos(am) * rr, Math.sin(am) * rr); ctx.font = '800 ' + (20 * (q.f || 1)).toFixed(1) + 'px "Noto Sans TC",sans-serif'; ctx.fillStyle = darker(sec.color, .15); ctx.fillText(sec.name + (sec.gid === myGroup ? '(' + nameOf + ')' : ''), q.x, q.y); });
    ctx.textAlign = 'left'; ringNames.forEach(function (nm, k) { var q = P(radii[k] + 4, -5); ctx.font = '700 ' + (15 * (q.f || 1)).toFixed(1) + 'px "Noto Sans TC",sans-serif'; ctx.fillStyle = 'rgba(51,65,85,.92)'; ctx.fillText(nm, q.x, q.y); });
    ctx.restore();
  }

  /* ---------- 互動圈整張圖(學生頁、老師頁共用) ----------
   * o = { container, legendBox?, me, users:{id→{id,name,role,classId,groupId}}, groups:[{id,name,color?}], events:[{from,to,d,type}],
   *       edgeFrame(i)→edges, isAlter(edge), lastIdx, nameOf(id), lively(net), talk(net), attach(net,nodesDS,edgesDS,build), peers?:[{id,name,groupId}] }
   * 回傳 { net, nodesDS, edgesDS, build, th, final, peers },沒有同班同學可畫時回傳 null(呼叫端改用舊排法) */
  function mountRing(o) {
    var vis = global.vis, KBTip = global.KBTip; if (!vis) return null;
    var me = o.me, users = o.users || {}, meU = users[me] || {};
    var peers = o.peers || Object.keys(users).map(function (k) { return users[k]; }).filter(function (u) { return u && u.role === 'student' && String(u.id) !== String(me) && u.classId && u.classId === meU.classId; }).map(function (u) { return { id: u.id, name: u.name, groupId: u.groupId || '' }; });
    if (peers.length < 2) return null;
    var groups = o.groups || [], myGroup = meU.groupId || '', events = o.events || [], last = o.lastIdx;
    function totalAt(i) {
      var t = {}, o2 = {}, i2 = {};
      events.forEach(function (e) { if (e.d > i) return; var other = String(e.from) === String(me) ? e.to : (String(e.to) === String(me) ? e.from : null); if (other == null) return; t[other] = (t[other] || 0) + 1; if (String(e.from) === String(me)) o2[other] = (o2[other] || 0) + 1; else i2[other] = (i2[other] || 0) + 1; });
      return { t: t, out: o2, inn: i2 };
    }
    var th = thresholds(peers.map(function (p) { return totalAt(last).t[p.id] || 0; }));
    var finalLayout = layout({ me: me, peers: peers, groups: groups, myGroupId: myGroup, total: totalAt(last).t, th: th });
    global.__egoLayout = { th: th, final: finalLayout, groups: groups, peers: peers, me: me };
    var cmap = colorMap(groups);
    function build(i) {
      var tt = totalAt(i), L = layout({ me: me, peers: peers, groups: groups, myGroupId: myGroup, total: tt.t, th: th });
      var nds = [{ id: me, label: o.nameOf(me), shape: 'custom', ctxRenderer: sphereRenderer('#4f46e5', false, o.nameOf(me), '#312e81', true, 20), size: 31, x: 0, y: 0, physics: false, borderWidth: 0, font: { size: 14, color: '#312e81', face: 'Noto Sans TC' }, ego: { me: true } }], zmap = {}; zmap[me] = ME_H;
      peers.forEach(function (p) {
        var r = L.ring[p.id], col = L.color[p.id], none = r === 3, pos = L.pos[p.id];
        zmap[p.id] = HEIGHTS[r];
        nds.push({ id: p.id, label: o.nameOf(p.id), shape: 'custom', ctxRenderer: sphereRenderer(col, none, o.nameOf(p.id), none ? '#7b8798' : '#1e293b', false, 17), size: L.size[p.id], x: pos.x, y: pos.y, physics: false, borderWidth: 0,
          color: { background: none ? mixWhite(col, .7) : col, border: none ? mixWhite(col, .15) : darker(col, .25) },
          font: { size: 12, color: none ? '#94a3b8' : '#334155', face: 'Noto Sans TC' }, ego: { ring: r, out: tt.out[p.id] || 0, inn: tt.inn[p.id] || 0, total: tt.t[p.id] || 0, gid: p.groupId } });
      });
      var eds = o.edgeFrame(i).map(function (ed) { return o.isAlter(ed) ? Object.assign({}, ed, { width: 1, arrows: '' }) : ed; });
      return { nodes: nds, edges: eds };
    }
    var net_ = null;
    var first = build(last), nodesDS = new vis.DataSet(first.nodes), edgesDS = new vis.DataSet(first.edges);
    var net = net_ = new vis.Network(o.container, { nodes: nodesDS, edges: edgesDS }, { nodes: { borderWidth: 2 }, edges: { smooth: false }, physics: false, interaction: { hover: true } });
    // 底圖:整個大環境是一個大圓盤(同心圓 = 離你多近、扇形 = 組別),跟圓球一起 3D 轉動;平移、旋轉、放大都不會消失
    var P0 = projector(net);
    net.on('beforeDrawing', function (ctx) {
      try { var FL = global.__egoLayout.final, rg = net.__kb3d && net.__kb3d.rig, Pj = projector(net), on = !!(rg && rg.active()); drawGlobe(ctx, Pj, FL.radii[3] + 52); drawDisc(ctx, Pj, on, FL.radii[3] + 52, FL.sectors, FL.radii, o.myLabel || '我的組', myGroup, RING_NAMES); if (on) drawDrops(ctx, net, rg); } catch (x) {}
    });
    if (o.lively) o.lively(net);
    // 所有圓球都在同一個平面上、旋轉中心固定在圓盤正中央(0,0):像轉動一個大圓盤
    try { var rg0 = net.__kb3d && net.__kb3d.rig; if (rg0) { rg0.flat = true; rg0.fixedCenter = true; rg0.fixedExt = true; rg0.cx = 0; rg0.cy = 0; rg0.ext = finalLayout.radii[3] + 52; var refreshH = function () { var tm = {}; nodesDS.get().forEach(function (n) { tm[n.id] = n.ego && n.ego.me ? ME_H : HEIGHTS[n.ego ? n.ego.ring : 3]; }); rg0.zmap = tm; }; refreshH(); nodesDS.on('*', refreshH); } } catch (x) {}
    setTimeout(function () { try { net.fit({ animation: false }); if (net.__kb3d && net.__kb3d.snapHome) net.__kb3d.snapHome(); } catch (x) {} }, 60);
    if (o.talk) { try { o.talk(net); } catch (x) { if (global.console) console.error(x); } }
    // 圖例:組別的顏色 + 怎麼看(相對位置)
    var box = o.legendBox;
    if (box) {
      box.innerHTML = '<span class="font-bold text-slate-500">組別顏色:</span>' + finalLayout.sectors.map(function (sec) { return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border" data-kbtip="egog:' + sec.gid + '" tabindex="0" style="border-color:' + sec.color + ';background:' + mixWhite(sec.color, .88) + '"><i style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + sec.color + '"></i><b>' + sec.name + (sec.gid === myGroup ? '(' + (o.myLabel || '我的組') + ')' : '') + '</b></span>'; }).join('') +
        '<span class="text-slate-600 w-full text-center text-[13px] leading-relaxed">看的是<b>相對位置</b>:越靠近中間的' + (o.meWord || '你') + ',互動越多;最外圍的虛線圈 = 還沒有互動的同學;同一個顏色、同一個扇形 = 同一組。球的立體高度只是讓人看出「誰離' + (o.meWord || '你') + '近」(越近越高),同一圈或同一扇形裡的先後順序沒有意義。</span>';
      box.classList.remove('hidden'); box.classList.add('flex');
    }
    // 說明泡泡:圓球、連線、組別圖例
    if (KBTip) {
      var card = o.container.closest('.card'), tip = KBTip.create(card), H = KBTip.h, meWord = o.meWord || '你';
      var RN = ['互動最多的三分之一', '互動較多的三分之一', '互動較少的三分之一', '還沒有互動'], mouse = { x: 0, y: 0 };
      var gname = function (gid) { var g = groups.filter(function (x) { return x.id === gid; })[0]; return g ? g.name : (gid ? '未命名組' : '未分組'); };
      o.container.addEventListener('mousemove', function (ev) { var c = card.getBoundingClientRect(); mouse = { x: ev.clientX - c.left, y: ev.clientY - c.top }; });
      var onHoverNode = function (p) {
        var nd = nodesDS.get().filter(function (x) { return x.id === p.node; })[0]; if (!nd || !nd.ego) return;
        if (nd.ego.me) { tip.show(H(meWord === '你' ? '你(自己)' : o.nameOf(me), '', '#4f46e5') + '<p>' + meWord + '在正中央。越靠近' + meWord + '的同學,跟' + meWord + '的互動越多;最外圍的虛線圈是還沒有互動的同學。</p><div class="nx">看的是相對位置,不是絕對位置。</div>', mouse.x, mouse.y, 'me'); return; }
        var ee = nd.ego, col = cmap[ee.gid] || '#94a3b8', who = meWord === '你' ? ['你', '你', '他'] : [o.nameOf(me), o.nameOf(me), '他'];
        var body = ee.total > 0 ? '<p>' + (meWord === '你' ? '你們' : o.nameOf(me) + '和他') + '互動 <span class="hl">' + ee.total + '</span> 次:' + who[0] + '回應他 <span class="hl">' + ee.out + '</span> 次、他回應' + who[0] + ' <span class="hl">' + ee.inn + '</span> 次。</p><p>在有互動的同學裡,他屬於<span class="hl">' + RN[ee.ring] + '</span>,所以排在第 ' + (ee.ring + 1) + ' 圈。</p>' : '<p>' + who[0] + '還沒有回應過他,他也還沒有回應' + who[0] + '。</p>' + (meWord === '你' ? '<div class="nx">去看看他的想法、回應他,他就會從最外圍慢慢移到你的旁邊。</div>' : '');
        tip.show(H('👤 ' + o.nameOf(p.node), gname(ee.gid) + (ee.gid === myGroup ? '(' + (o.myLabel || '我的組') + ')' : ''), col) + body, mouse.x, mouse.y, 'n:' + p.node + ':' + ee.total);
      };
      net.on('hoverNode', onHoverNode); net.on('blurNode', function () { tip.hide(); });
      var onHoverEdge = function (p) {
        var ed = edgesDS.get().filter(function (x) { return x.id === p.edge; })[0]; if (!ed) return;
        var a = o.nameOf(ed.from), b = o.nameOf(ed.to), cnt = (String(ed.title || '').replace(/\D+/g, '')) || '1', alter = o.isAlter(ed);
        tip.show(H(a + (alter ? ' — ' : ' → ') + b, cnt + ' 次') + (alter ? '<p>這是兩位同學彼此之間的互動(灰色細線)。</p>' : '<p>' + a + ' 回應了 ' + b + ' <span class="hl">' + cnt + '</span> 次。線越粗,回應越多次;線的顏色是回應類型。</p>') + '<div class="nx">點兩下這條線或圓球,可以看他們說了什麼。</div>', mouse.x, mouse.y, 'e:' + p.edge + ':' + cnt);
      };
      net.on('hoverEdge', onHoverEdge); net.on('blurEdge', function () { tip.hide(); });
      global.__egoTipTest = { hoverNode: function (id) { onHoverNode({ node: id }); }, hoverEdge: function (id) { onHoverEdge({ edge: id }); }, tip: tip };
      if (box) {
        var show = function (el, x, y) { var gid = (el.getAttribute('data-kbtip') || '').slice(5), L = global.__egoLayout, sec = L.final.sectors.filter(function (s) { return s.gid === gid; })[0]; if (!sec) return; var members = L.peers.filter(function (p) { return (p.groupId || '') === gid; }), done = members.filter(function (p) { return (L.final.ring[p.id] || 0) < 3; }).length; tip.show(H(sec.name + (gid === myGroup ? '(' + (o.myLabel || '我的組') + ')' : ''), members.length + ' 位同學', sec.color) + '<p>這一組的同學排在同一個扇形裡,球的顏色就是這一組的顏色。</p><p>' + meWord + '跟其中 <span class="hl">' + done + '</span> 位互動過,還有 <span class="hl">' + (members.length - done) + '</span> 位還沒有互動。</p>', x, y, 'g:' + gid); };
        var rel = function (ev) { var c = card.getBoundingClientRect(); return { x: ev.clientX - c.left, y: ev.clientY - c.top }; };
        box.addEventListener('mouseover', function (ev) { var el = ev.target.closest && ev.target.closest('[data-kbtip^="egog:"]'); if (!el) { tip.hide(); return; } var q = rel(ev); show(el, q.x, q.y); });
        box.addEventListener('mouseout', function (ev) { var to = ev.relatedTarget; if (!(to && to.closest && to.closest('[data-kbtip^="egog:"]'))) tip.hide(); });
        box.addEventListener('focusin', function (ev) { var el = ev.target.closest && ev.target.closest('[data-kbtip^="egog:"]'); if (!el) return; var r = el.getBoundingClientRect(), c = card.getBoundingClientRect(); show(el, r.left - c.left + r.width / 2, r.top - c.top + r.height / 2); });
        box.addEventListener('focusout', function () { tip.hide(); });
      }
    }
    if (o.attach) o.attach(net, nodesDS, edgesDS, build);
    return { net: net, nodesDS: nodesDS, edgesDS: edgesDS, build: build, th: th, final: finalLayout, peers: peers };
  }


  /* ---------- 全班互動網絡的「群集」排法 ----------
   * 每一組的同學圍成一小圈,各組的小圈再圍成一大圈;互動越多的兩組,在大圈上排得越近(貪婪串接)。固定排法,沒有隨機。
   * o = { members:[{id,groupId}], groups:[{id,name,color?}], weight(gidA,gidB)→兩組之間的互動次數 }
   * 回傳 { pos:{id:{x,y}}, clusters:[{gid,name,color,x,y,r,n}] } */
  function clusterLayout(o) {
    var by = {}, order = [];
    (o.members || []).slice().sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; }).forEach(function (m) { var g = m.groupId || ''; if (!by[g]) { by[g] = []; order.push(g); } by[g].push(m); });
    var groups = o.groups || [], gi = {}; groups.forEach(function (g, i) { gi[g.id] = i; });
    order.sort(function (a, b) { return ((gi[a] == null ? 999 : gi[a]) - (gi[b] == null ? 999 : gi[b])) || (a < b ? -1 : 1); });
    var w = o.weight || function () { return 0; }, chain = [], left = order.slice(), i, j;
    if (left.length) {   // 互動最多的那一組先放,下一個放「跟前一個互動最多」的
      var best = left[0], bs = -1; left.forEach(function (g) { var s = 0; order.forEach(function (h) { if (h !== g) s += w(g, h) + w(h, g); }); if (s > bs) { bs = s; best = g; } });
      chain.push(best); left.splice(left.indexOf(best), 1);
      while (left.length) { var prev = chain[chain.length - 1], nb = left[0], ns = -1; left.forEach(function (g) { var s = w(prev, g) + w(g, prev); if (s > ns) { ns = s; nb = g; } }); chain.push(nb); left.splice(left.indexOf(nb), 1); }
    }
    var cmap = colorMap(groups), res = { pos: {}, clusters: [] }, G = chain.length, maxr = 0;
    var rOf = {}; chain.forEach(function (g) { var n = by[g].length; rOf[g] = n <= 1 ? 26 : Math.max(46, 15 + 15 * n / (Math.PI / 2) * 0.5 + 14 * Math.sqrt(n)); maxr = Math.max(maxr, rOf[g]); });
    var RC = G <= 1 ? 0 : Math.max(maxr * 1.9, (maxr * 2 + 36) / (2 * Math.sin(Math.PI / G)));
    chain.forEach(function (g, k) {
      var a = -Math.PI / 2 + k * 2 * Math.PI / Math.max(G, 1), cx = Math.cos(a) * RC, cy = Math.sin(a) * RC, n = by[g].length, r = rOf[g];
      by[g].forEach(function (m, t) { var aa = a + Math.PI + t * 2 * Math.PI / Math.max(n, 1); res.pos[m.id] = n === 1 ? { x: cx, y: cy } : { x: cx + Math.cos(aa) * r * 0.62, y: cy + Math.sin(aa) * r * 0.62 }; });
      var gg = groups.filter(function (x) { return x.id === g; })[0];
      res.clusters.push({ gid: g, name: gg ? gg.name : (g ? '未命名組' : '未分組'), color: g ? (cmap[g] || '#94a3b8') : '#94a3b8', x: cx, y: cy, r: r, n: n });
    });
    return res;
  }
  // 在 vis 圖的背景畫出每一組的圈與名稱(clusters 由函式取得,資料變了也跟著變)
  function drawClusters(net, getClusters) {
    net.on('beforeDrawing', function (ctx) {
      try {
        var cs = getClusters() || [], P = projector(net); ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        cs.forEach(function (c) {
          trace(ctx, arcPts(P, c.x, c.y, c.r + 26, 0, Math.PI * 2, 0.08), true); ctx.fillStyle = mixWhite(c.color, .9); ctx.fill(); ctx.strokeStyle = mixWhite(c.color, .45); ctx.lineWidth = 2; ctx.stroke();
          var q = P(c.x, c.y - c.r - 38); ctx.font = '700 ' + (15 * (q.f || 1)).toFixed(1) + 'px "Noto Sans TC",sans-serif'; ctx.fillStyle = darker(c.color, .2); ctx.fillText(c.name, q.x, q.y);
        });
        ctx.restore();
      } catch (x) {}
    });
    // 所有同學都在同一個平面上,旋轉中心在正中央
    setTimeout(function () { try { var rg = net.__kb3d && net.__kb3d.rig; if (rg) { rg.flat = true; rg.fixedCenter = true; rg.cx = 0; rg.cy = 0; } } catch (x) {} }, 0);
  }


  // 地板:一個大圓盤(沒有扇形/同心圈,給全班關係圖用);轉動時會跟著傾斜
  function drawFloor(ctx, P, active, R, cx, cy) {
    ctx.save();
    var rim = arcPts(P, cx, cy, R, 0, Math.PI * 2, 0.05);
    trace(ctx, rim, true); var g0 = P(cx, cy), gr = ctx.createRadialGradient(g0.x, g0.y, 0, g0.x, g0.y, R * (g0.f || 1)); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.75, 'rgba(233,238,247,.85)'); gr.addColorStop(1, 'rgba(233,238,247,0)'); ctx.fillStyle = gr; ctx.fill();   // 只有淡淡的底色,外緣淡出,沒有邊線、沒有圈圈
    ctx.restore();
  }
  // 把「全班關係圖」放進同一個 3D 空間:圓心與半徑固定、所有球站在同一個盤面上、每顆球的高度由 heights 決定(不是隨機)
  function setup3D(net, cx, cy, R, heights) {
    var rg = net.__kb3d && net.__kb3d.rig; if (!rg) return null;
    rg.flat = true; rg.fixedCenter = true; rg.fixedExt = true; rg.cx = cx; rg.cy = cy; rg.ext = R; rg.zmap = heights || {}; return rg;
  }

  // 給「用物理排法」的圖(概念語義網絡、對話透視鏡):球殼 + 地板跟著球的範圍、每顆球的高度由 zOf(id) 決定(有原因,不是隨機)
  function attach(net, zOf) {
    function geo() {
      var r = net.__kb3d && net.__kb3d.rig, src = (r && r.active() && net.__kb3d.st && net.__kb3d.st.flat) ? net.__kb3d.st.flat : net.getPositions(), ids = Object.keys(src), x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      ids.forEach(function (k) { var q = src[k]; if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; });
      if (!ids.length) return { cx: 0, cy: 0, R: 160 };
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = 0; ids.forEach(function (k) { R = Math.max(R, Math.hypot(src[k].x - cx, src[k].y - cy)); });
      return { cx: cx, cy: cy, R: Math.max(130, R + 60) };
    }
    net.on('beforeDrawing', function (ctx) {
      try {
        var rg = net.__kb3d && net.__kb3d.rig, G = geo();
        if (rg) { var zm = {}; Object.keys(net.body.nodes).forEach(function (id) { var h = zOf(id, G.R); if (h != null) zm[id] = h; }); rg.flat = true; rg.fixedCenter = true; rg.fixedExt = true; if (!rg.active()) { rg.cx = G.cx; rg.cy = G.cy; rg.ext = G.R; } rg.zmap = zm; G.cx = rg.cx; G.cy = rg.cy; G.R = rg.ext; }
        var P = projector(net), on = !!(rg && rg.active());
        drawGlobe(ctx, P, G.R, G.cx, G.cy); drawFloor(ctx, P, on, G.R, G.cx, G.cy); if (on) drawDrops(ctx, net, rg);
      } catch (x) {}
    });
    return { geo: geo };
  }
  global.KBSphere = { attach: attach, sphereRenderer: sphereRenderer, drawGlobe: drawGlobe, drawFloor: drawFloor, drawDrops: drawDrops, projector: projector, setup3D: setup3D, mixWhite: mixWhite, darker: darker };
  global.KBEgo = { clusterLayout: clusterLayout, drawClusters: drawClusters, mountRing: mountRing, colorMap: colorMap, layout: layout, thresholds: thresholds, ringFor: ringFor, groupColor: groupColor, PALETTE: PALETTE, RING_NAMES: RING_NAMES, SIZES: SIZES, mixWhite: mixWhite, darker: darker };
})(typeof window !== 'undefined' ? window : globalThis);
