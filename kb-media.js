/* =====================================================================
 *  KB Media — 發言可以附「照片/圖片」與「錄音」
 *
 *  為什麼不直接放進貼文:雲端的貼文是每 500 則一份文件(Firestore 單份上限約 1MB),
 *  圖片與錄音放進去會很快爆掉。所以:
 *    · 貼文裡只記一小段「附件清單」: post.media = [{ id, kind:'image'|'audio', w, h, dur, m }]
 *    · 檔案本身(壓縮後的 data URL)另存:雲端 kb_v2_media/<id>,本機 IndexedDB(離線/測試版只有這個)
 *    · 看貼文的時候才去載入(不會一打開論壇就下載全班的圖與錄音)
 *  上傳時機:選好照片/錄完音當下就先傳;傳好才能按「發布」,所以發出去的貼文一定附得到。
 *  限制:每則最多 3 張照片 + 1 段錄音;照片縮到長邊 2048px、約 640KB 以內(雲端單份文件上限約 1MB);錄音最長 2 分鐘(24kbps,約 360KB)。
 *  照片的「大小/位置/排列」(仿 Word 的文字繞圖)只記在貼文的附件清單裡: z 大小%、l 排列、p 放在第幾行後面;不動雲端檔案,所以改版面不用重傳。
 * ===================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;
  var CFG = { maxImages: 3, maxAudio: 1, maxSide: 2048, imgBytes: 640000, audioMaxSec: 120, audioBps: 24000, docMax: 880000, audioFileBytes: 640000 };
  var H = {};          // 測試用:可換掉壓縮 / 錄音
  var seq = 0;

  /* ---------- 本機儲存(IndexedDB;沒有就只放記憶體) ---------- */
  var mem = {}, idbP = null;
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise(function (res) {
      try {
        if (!global.indexedDB) return res(null);
        var rq = global.indexedDB.open('kb_media_v1', 1);
        rq.onupgradeneeded = function () { try { rq.result.createObjectStore('f'); } catch (e) {} };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
        rq.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
    return idbP;
  }
  function lput(id, rec) {
    mem[id] = rec;
    return idb().then(function (db) {
      if (!db) return;
      return new Promise(function (res) { try { var tx = db.transaction('f', 'readwrite'); tx.objectStore('f').put(rec, id); tx.oncomplete = res; tx.onerror = res; tx.onabort = res; } catch (e) { res(); } });
    });
  }
  function lget(id) {
    if (mem[id]) return Promise.resolve(mem[id]);
    return idb().then(function (db) {
      if (!db) return null;
      return new Promise(function (res) { try { var rq = db.transaction('f').objectStore('f').get(id); rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { res(null); }; } catch (e) { res(null); } });
    });
  }
  function cloud() { return global.KB && global.KB.cloud && typeof global.KB.cloud.mediaPut === 'function' ? global.KB.cloud : null; }
  function newId() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + (seq++).toString(36); }
  /* 存檔:先放本機,有雲端就再傳雲端。失敗會丟錯(讓畫面能顯示「重試」) */
  function send(id, rec) {
    return lput(id, rec).then(function () {
      var c = cloud(); if (!c) return;
      // 重試時,如果上一次其實已經寫進雲端(只是回應太慢),規則會擋下「覆蓋」;這時看雲端那份是不是一樣的,一樣就當成功
      return c.mediaPut(id, rec).catch(function (e) { return c.mediaGet(id).then(function (r) { if (r && r.d === rec.d) return; throw e; }, function () { throw e; }); });
    });
  }
  function get(id) {
    return lget(id).then(function (r) {
      if (r) return r;
      var c = cloud(); if (!c) return null;
      return c.mediaGet(id).then(function (rr) { if (rr) lput(id, rr); return rr || null; });
    });
  }

  /* ---------- 照片壓縮 ---------- */
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var u = global.URL.createObjectURL(file), im = new global.Image();
      im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('bad-image')); }; im.src = u;
    });
  }
  function loadImg(file) { return global.createImageBitmap ? global.createImageBitmap(file).catch(function () { return viaImg(file); }) : viaImg(file); }
  function compressImage(file) {
    if (H.compress) return H.compress(file);
    return loadImg(file).then(function (im) {
      var w0 = im.width || im.naturalWidth, h0 = im.height || im.naturalHeight; if (!w0 || !h0) throw new Error('bad-image');
      var k = Math.min(1, CFG.maxSide / Math.max(w0, h0)), w = Math.round(w0 * k), h = Math.round(h0 * k);
      var cv = doc.createElement('canvas'), cx = cv.getContext('2d');
      var draw = function () { cv.width = w; cv.height = h; cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); try { cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; } catch (e) {} cx.drawImage(im, 0, 0, w, h); };
      /* 先保住尺寸、慢慢降畫質(0.92 → 0.62);還是太大才把長寬縮小 12%,再來一次 */
      var d = '';
      for (var i = 0; i < 10; i++) {
        draw();
        var q = 0.92; d = cv.toDataURL('image/jpeg', q);
        while (d.length * 0.75 > CFG.imgBytes && q > 0.62) { q -= 0.06; d = cv.toDataURL('image/jpeg', q); }
        if (d.length * 0.75 <= CFG.imgBytes) break;
        w = Math.round(w * 0.88); h = Math.round(h * 0.88);
      }
      if (d.length > CFG.docMax) throw new Error('too-big');
      return { d: d, m: 'image/jpeg', w: w, h: h };
    });
  }

  /* ---------- 錄音 ---------- */
  function recSupported() { return !!(global.MediaRecorder && global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia); }
  function pickMime() {
    var c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < c.length; i++) { try { if (global.MediaRecorder.isTypeSupported && global.MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} }
    return '';
  }
  function toDataUrl(blob) { return new Promise(function (res, rej) { var fr = new global.FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(new Error('read-failed')); }; fr.readAsDataURL(blob); }); }
  /* 回傳 Promise<{ stop(), cancel(), result }>;result 在停止(或到 2 分鐘自動停)時給 { d, m, dur } */
  function startRecord(onTick) {
    if (H.record) return H.record(onTick);
    return global.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).then(function (stream) {
      var mime = pickMime(), opts = { audioBitsPerSecond: CFG.audioBps }; if (mime) opts.mimeType = mime;
      var mr = new global.MediaRecorder(stream, opts), chunks = [], t0 = Date.now(), timer = 0, cancelled = false, done = {};
      var result = new Promise(function (res, rej) { done.res = res; done.rej = rej; });
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        clearInterval(timer); try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        if (cancelled) return done.rej(new Error('cancelled'));
        var type = mr.mimeType || mime || 'audio/webm', dur = Math.max(1, Math.round((Date.now() - t0) / 1000));
        toDataUrl(new global.Blob(chunks, { type: type })).then(function (d) {
          if (d.length > CFG.docMax) return done.rej(new Error('too-big'));
          done.res({ d: d, m: String(type).split(';')[0], dur: dur });
        }, done.rej);
      };
      mr.start(1000);
      timer = setInterval(function () { var s = (Date.now() - t0) / 1000; if (onTick) onTick(s); if (s >= CFG.audioMaxSec && mr.state !== 'inactive') mr.stop(); }, 250);
      return { stop: function () { if (mr.state !== 'inactive') mr.stop(); return result; }, cancel: function () { cancelled = true; if (mr.state !== 'inactive') mr.stop(); else clearInterval(timer); }, result: result };
    });
  }

  /* ---------- 小工具 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function enabled() { try { var v = global.KB && global.KB.settings && global.KB.settings.get().media; return !v || v.enabled !== false; } catch (e) { return true; } }
  function say(msg, type) { try { if (global.ui && global.ui.showToast) global.ui.showToast(msg, type || 'info'); } catch (e) {} setHint(msg, type); }
  var ERR = {
    'bad-image': '這張圖片打不開,換一張試試看。', 'too-big': '這個檔案太大了,請換小一點的(照片會自動縮小,錄音請短一點)。',
    'cancelled': '', 'NotAllowedError': '麥克風被擋住了。請按網址列旁邊的鎖頭,把「麥克風」改成允許,再試一次。', 'NotFoundError': '找不到麥克風。請接上麥克風或耳機再試。', 'NotReadableError': '麥克風正在被別的程式使用,先關掉它再試。'
  };
  function errText(e) { var k = e && (e.name in ERR ? e.name : e.message); if (k in ERR) return ERR[k]; return (e && e.code === 'permission-denied') ? '雲端還不能存附件(請老師先更新雲端規則)。' : '沒有傳成功,請檢查網路後按「重試」。'; }

  /* ---------- 版面(仿 Word「文字繞圖」)----------
   * 附件清單裡每張照片可有:z 大小(佔文字區寬度的 %)、l 排列、p 放在第幾行後面(沒有 = 最後面)。
   * 沒有 l 的是舊貼文,維持原本「照片排在文字下面」的樣子。 */
  var LAYS = [['inline', '與文字排列(像一個字,接在那一行後面)'], ['wrapL', '矩形・文字環繞(圖在左)'], ['wrapR', '矩形・文字環繞(圖在右)'], ['blockL', '上及下・靠左'], ['blockC', '上及下・置中'], ['blockR', '上及下・靠右'], ['back', '文字在後(淡淡的底圖)']];
  var LAYK = {}; LAYS.forEach(function (x) { LAYK[x[0]] = 1; });
  var DEF_LAY = { z: 50, l: 'blockC', p: -1 }, OLD_LAY = { z: 35, l: 'blockL', p: -1 };
  function clampZ(z) { z = Math.round(+z); if (!isFinite(z) || !z) z = 50; return z < 10 ? 10 : z > 100 ? 100 : z; }
  function layOf(m) { return { z: clampZ((m && m.z) || 50), l: m && LAYK[m.l] ? m.l : 'blockC', p: m && typeof m.p === 'number' && m.p >= 0 ? Math.floor(m.p) : -1 }; }
  function hasLay(m) { return !!(m && m.kind === 'image' && LAYK[m.l]); }
  /* ----- 裁切:c = [x, y, w, h],都是佔「原圖」的比例(0~1)。只有使用者自己裁才會有;看貼文時照片永遠不變形 ----- */
  var MINC = 0.08;
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function cropOf(m) {
    var c = m && m.c; if (!Array.isArray(c) || c.length !== 4) return null;
    var x = +c[0], y = +c[1], w = +c[2], h = +c[3];
    if (!(isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h)) || x < 0 || y < 0 || w < MINC || h < MINC) return null;
    w = Math.min(w, 1 - x); h = Math.min(h, 1 - y); if (w < MINC || h < MINC) return null;
    if (x < 0.001 && y < 0.001 && w > 0.999 && h > 0.999) return null;
    return [r3(x), r3(y), r3(w), r3(h)];
  }
  /* 框(clip)的長寬比 = 裁下來那塊的長寬比;圖片放大到「整張圖」該有的大小再位移,所以只會露出裁切框裡的部分,不會擠壓 */
  function cropStyle(clip, im, c, W, H) {
    clip.style.aspectRatio = (c[2] * W) + ' / ' + (c[3] * H);
    im.style.width = (100 / c[2]) + '%'; im.style.left = (-c[0] / c[2] * 100) + '%'; im.style.top = (-c[1] / c[3] * 100) + '%';
  }
  /* 拖曳用的純計算(好測試) */
  function dropAt(lines, box, x, y) {   // lines: [{top,bottom}] 每行文字的位置;box: {left,width};回傳要放在第 p 行前面、靠哪一側
    var n = lines.length, p = n;
    for (var i = 0; i < n; i++) { if (y < (lines[i].top + lines[i].bottom) / 2) { p = i; break; } }
    var f = box.width > 0 ? (x - box.left) / box.width : 0.5;
    return { p: p >= n ? -1 : p, side: f < 0.33 ? 'L' : f > 0.67 ? 'R' : 'C', y: !n ? 0 : p < n ? lines[p].top : lines[n - 1].bottom };
  }
  function layAfterDrop(cur, side) { return side === 'L' ? 'wrapL' : side === 'R' ? 'wrapR' : (cur === 'inline' ? 'inline' : 'blockC'); }
  function cropDrag(h, c, dxf, dyf) {   // h: 'nw' 'n' 'ne' 'e' 'se' 's' 'sw' 'w';dxf/dyf: 滑鼠移動量(佔原圖寬高的比例)
    var x = c[0], y = c[1], r = c[0] + c[2], b = c[1] + c[3];
    if (h.indexOf('w') >= 0) x = Math.max(0, Math.min(x + dxf, r - MINC));
    if (h.indexOf('e') >= 0) r = Math.min(1, Math.max(r + dxf, x + MINC));
    if (h.indexOf('n') >= 0) y = Math.max(0, Math.min(y + dyf, b - MINC));
    if (h.indexOf('s') >= 0) b = Math.min(1, Math.max(b + dyf, y + MINC));
    return [r3(x), r3(y), r3(r - x), r3(b - y)];
  }
  function sizeDrag(h, startW, dx, Cw) { return clampZ((h.indexOf('w') >= 0 ? startW - dx : startW + dx) / Cw * 100); }

  /* 一張照片的元素。沒裁切、不在編輯區 = 單純一張 <img>;有裁切或在編輯區 = 外框(.kbm-ie)>裁切框(.kbm-cw)>圖 */
  function imgNode(x, edit) {
    var im = doc.createElement('img'); im.alt = x.alt || '附圖'; im.src = x.src; im.draggable = false;
    var hasWH = x.w > 0 && x.h > 0, c = hasWH ? (x.c || null) : null;
    if (!c && !edit) {
      im.className = 'kbm-fi'; im.style.width = x.z + '%';
      if (x.click) im.addEventListener('click', function () { x.click(x.src); });
      return im;
    }
    var ie = doc.createElement('div'), clip = doc.createElement('div');
    ie.className = 'kbm-ie' + (x.l === 'wrapL' ? ' kbm-fl' : x.l === 'wrapR' ? ' kbm-fr' : ''); ie.style.width = x.z + '%';
    if (x.key) ie.setAttribute('data-key', x.key);
    clip.className = 'kbm-cw'; clip.appendChild(im); ie.appendChild(clip);
    if (hasWH) cropStyle(clip, im, c || [0, 0, 1, 1], x.w, x.h); else { im.style.position = 'static'; im.style.width = '100%'; }
    if (x.click && !edit) im.addEventListener('click', function () { x.click(x.src); });
    return ie;
  }
  /* 把「文字 + 照片」排成一塊。imgs: [{ src, alt, z, l, p, click, c, w, h, key }];opts.edit = 編輯區(照片外框可選取) */
  function flow(box, text, imgs, opts) {
    var edit = !!(opts && opts.edit);
    box.innerHTML = ''; box.classList.add('kbm-flow');
    var lines = String(text == null ? '' : text).split('\n'), n = lines.length, by = {}, back = [], inl = [];
    imgs.forEach(function (x) {
      var p = typeof x.p === 'number' && x.p >= 0 && x.p <= n ? x.p : n;
      var o = { src: x.src, alt: x.alt, z: clampZ(x.z), l: LAYK[x.l] ? x.l : 'blockC', p: p, click: x.click, c: x.c || null, w: x.w, h: x.h, key: x.key };
      if (o.l === 'back') back.push(o); else if (o.l === 'inline') inl.push(o); else (by[p] = by[p] || []).push(o);
    });
    /* 文字在後:圖和文字疊在同一格(grid),格子高度取兩者較高的,所以底圖不會被切掉 */
    var root = box; box.classList.toggle('kbm-grid', back.length > 0);
    if (back.length) {
      back.forEach(function (x) { var b = imgNode(x, edit); b.classList.add('kbm-bgi'); box.appendChild(b); });
      root = doc.createElement('div'); root.className = 'kbm-txt'; box.appendChild(root);
    }
    var els = lines.map(function (ln) { var d = doc.createElement('div'); d.className = 'kbm-ln'; d.textContent = ln; return d; });
    inl.forEach(function (x) { var d = els[x.p >= 1 ? x.p - 1 : 0], im = imgNode(x, edit); if (x.p === 0) d.insertBefore(im, d.firstChild); else d.appendChild(im); });
    function put(p) {
      (by[p] || []).forEach(function (x) {
        var el;
        if (x.l === 'wrapL' || x.l === 'wrapR') { el = imgNode(x, edit); el.classList.add(x.l === 'wrapL' ? 'kbm-fl' : 'kbm-fr'); }
        else { el = doc.createElement('div'); el.className = 'kbm-bk'; el.style.textAlign = x.l === 'blockL' ? 'left' : x.l === 'blockR' ? 'right' : 'center'; el.appendChild(imgNode(x, edit)); }
        root.appendChild(el);
      });
    }
    for (var i = 0; i <= n; i++) { put(i); if (i < n) root.appendChild(els[i]); }
    return box;
  }

  /* ---------- 發言視窗:附件區 ---------- */
  var ST = { items: [], rec: null, host: null, hintEl: null, sel: null, crop: false, drag: null };
  function css() {
    if (doc.getElementById('kbm-style')) return;
    var s = doc.createElement('style'); s.id = 'kbm-style';
    s.textContent = '.kbm{margin-top:10px}.kbm-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.kbm-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:12px;border:2px solid #e2e8f0;background:#fff;font-weight:800;font-size:15px;color:#334155;cursor:pointer;min-height:44px}.kbm-btn:hover{border-color:#94a3b8}.kbm-btn[disabled]{opacity:.45;cursor:not-allowed}.kbm-btn.rec{background:#fee2e2;border-color:#f87171;color:#b91c1c}' +
      '.kbm-hint{font-size:12px;color:#64748b;margin-top:6px;min-height:16px}.kbm-hint.err{color:#b91c1c}.kbm-list{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}.kbm-it{position:relative;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;padding:6px;display:flex;flex-direction:column;gap:4px;max-width:100%}' +
      '.kbm-it img{width:96px;height:72px;object-fit:contain;border-radius:8px;display:block;background:#e2e8f0}.kbm-it audio{height:34px;max-width:240px}.kbm-x{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;border:0;background:#0f172a;color:#fff;font-size:13px;line-height:24px;cursor:pointer}' +
      '.kbm-st{font-size:11px;font-weight:700;color:#64748b}.kbm-st.err{color:#b91c1c}.kbm-st.ok{color:#15803d}.kbm-st button{margin-left:6px;text-decoration:underline;color:#4338ca;font-weight:800;background:none;border:0;cursor:pointer;font-size:11px}' +
      '.kbm-view{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.kbm-view img{max-width:100%;max-height:220px;border-radius:12px;border:1px solid #e2e8f0;cursor:zoom-in;background:#e2e8f0;min-width:96px;min-height:72px}.kbm-view audio{width:100%;max-width:340px}.kbm-view .kbm-ph{font-size:12px;color:#64748b;padding:10px;border:1px dashed #cbd5e1;border-radius:10px}' +
      '.kbm-it.open{width:calc(100% - 12px)}.kbm-adjb{font-size:12px;font-weight:800;color:#4338ca;background:none;border:0;cursor:pointer;text-decoration:underline;text-align:left;padding:2px 0;min-height:28px}.kbm-adj{display:flex;flex-direction:column;gap:8px;padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:10px}.kbm-r{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px}.kbm-r b{min-width:36px;color:#334155}.kbm-note{font-size:11px;color:#64748b}' +
      '.kbm-chip{padding:4px 10px;border-radius:999px;border:1.5px solid #cbd5e1;background:#fff;font-size:13px;font-weight:700;cursor:pointer;min-height:32px;color:#334155}.kbm-chip.on{background:#4338ca;border-color:#4338ca;color:#fff}.kbm-adj select{max-width:100%;padding:6px 8px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff;min-height:36px}.kbm-adj input[type=range]{flex:1;min-width:110px}' +
      '.kbm-prevw{margin-top:12px}.kbm-prevt{font-size:13px;font-weight:800;color:#334155;margin-bottom:6px}.kbm-prev{border:1px dashed #94a3b8;border-radius:10px;padding:12px;font-size:14px;line-height:1.7;color:#334155;background:#fff;max-height:560px;overflow:auto}' +
      '.kbm-tb{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}.kbm-tbr{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.kbm-tbh{font-size:12px;color:#64748b}.kbm-it img[data-sel]{cursor:pointer}' +
      '.kbm-flow{position:relative;display:flow-root}.kbm-flow>*{position:relative;z-index:1}.kbm-flow.kbm-grid{display:grid;grid-template-columns:minmax(0,1fr)}.kbm-grid>.kbm-bgi{grid-area:1/1;justify-self:center;align-self:center;max-width:100%;z-index:0}.kbm-grid>img.kbm-bgi,.kbm-grid>.kbm-bgi .kbm-cw{opacity:.22}.kbm-grid>.kbm-txt{grid-area:1/1;display:flow-root}' +
      '.kbm-ln{white-space:pre-wrap;word-break:break-word}.kbm-ln:empty{min-height:1.2em}' +
      '.kbm-fi{max-width:100%;height:auto;border-radius:10px;border:1px solid #e2e8f0;cursor:zoom-in;background:#e2e8f0}.kbm-ie{position:relative;display:block;max-width:100%}.kbm-cw{position:relative;overflow:hidden;border-radius:10px;border:1px solid #e2e8f0;background:#e2e8f0;line-height:0}.kbm-cw img{position:absolute;max-width:none;height:auto;display:block;cursor:zoom-in;-webkit-user-drag:none;user-select:none}' +
      '.kbm-ln .kbm-fi,.kbm-ln .kbm-ie{display:inline-block;vertical-align:middle;margin:2px 6px}.kbm-fl{float:left;margin:2px 14px 8px 0}.kbm-fr{float:right;margin:2px 0 8px 14px}.kbm-bk{clear:both;margin:8px 0}.kbm-bk .kbm-fi,.kbm-bk .kbm-ie{display:inline-block}@media(max-width:520px){.kbm-fl,.kbm-fr{max-width:55%}}' +
      '.kbm-edit .kbm-ie:hover{outline:2px dashed #a5b4fc;outline-offset:2px}.kbm-vtb{margin:8px 0}.kbm-edit .kbm-ie{cursor:grab;user-select:none;-webkit-user-select:none}.kbm-edit .kbm-cw img{cursor:inherit}.kbm-edit .kbm-ie.kbm-sel{outline:2px solid #4f46e5;outline-offset:2px;touch-action:none}.kbm-edit .kbm-ie.kbm-dragging{opacity:.35}.kbm-edit .kbm-ie.kbm-cropping .kbm-cw{box-shadow:inset 0 0 0 3px #f59e0b}.kbm-edit.kbm-grid .kbm-txt{pointer-events:none}.kbm-edit.kbm-grid .kbm-txt .kbm-ie{pointer-events:auto}.kbm-edit.kbm-grid>.kbm-bgi.kbm-sel .kbm-cw{opacity:.55}' +
      '.kbm-h{position:absolute;width:16px;height:16px;background:#fff;border:2px solid #4f46e5;border-radius:4px;z-index:5;touch-action:none;box-sizing:border-box}.kbm-h-nw{top:-8px;left:-8px;cursor:nwse-resize}.kbm-h-ne{top:-8px;right:-8px;cursor:nesw-resize}.kbm-h-se{bottom:-8px;right:-8px;cursor:nwse-resize}.kbm-h-sw{bottom:-8px;left:-8px;cursor:nesw-resize}.kbm-h-n{top:-8px;left:calc(50% - 8px);cursor:ns-resize}.kbm-h-s{bottom:-8px;left:calc(50% - 8px);cursor:ns-resize}.kbm-h-e{right:-8px;top:calc(50% - 8px);cursor:ew-resize}.kbm-h-w{left:-8px;top:calc(50% - 8px);cursor:ew-resize}.kbm-cropping .kbm-h{background:#f59e0b;border-color:#b45309}' +
      '.kbm-ghost{position:fixed;width:110px;height:auto;opacity:.75;border-radius:8px;pointer-events:none;z-index:100001;box-shadow:0 6px 18px rgba(0,0,0,.25)}.kbm-ind{position:absolute;left:6px;right:6px;height:0;border-top:3px solid #4f46e5;z-index:10;pointer-events:none}.kbm-ind span{position:absolute;top:-24px;background:#4f46e5;color:#fff;font-size:11px;font-weight:800;padding:2px 8px;border-radius:10px;white-space:nowrap;line-height:1.4}.kbm-ind.L span{left:0}.kbm-ind.C span{left:50%;transform:translateX(-50%)}.kbm-ind.R span{right:0}' +
      '.kbm-lb{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.88);display:flex;align-items:center;justify-content:center;padding:16px;cursor:zoom-out}.kbm-lb img{max-width:100%;max-height:100%;border-radius:10px;background:#fff}';
    (doc.head || doc.documentElement).appendChild(s);
  }
  function setHint(msg, type) { if (ST.hintEl) { ST.hintEl.textContent = msg || ''; ST.hintEl.className = 'kbm-hint' + (type === 'error' || type === 'err' ? ' err' : ''); } }
  function count(kind) { return ST.items.filter(function (x) { return x.kind === kind; }).length; }
  function baseHint() { return '最多 ' + CFG.maxImages + ' 張照片、' + CFG.maxAudio + ' 段錄音(最長 ' + (CFG.audioMaxSec / 60) + ' 分鐘;已錄好的錄音檔要小於 0.6MB)。'; }
  function mount() {
    var host = doc.getElementById('kbm-box'); if (!host) return null;
    ST.host = host; if (host.__kbm) return host; host.__kbm = true; css();
    host.className = 'kbm';
    host.innerHTML = '<div class="kbm-row"><button type="button" class="kbm-btn" data-k="img"><span aria-hidden="true">📷</span> 加照片</button><button type="button" class="kbm-btn" data-k="rec"><span aria-hidden="true">🎙️</span> <span data-k="rect">錄音</span></button><button type="button" class="kbm-btn" data-k="aud"><span aria-hidden="true">🎵</span> 加錄音檔</button><input type="file" accept="image/*" multiple data-k="file" style="display:none"><input type="file" accept="audio/*" data-k="afile" style="display:none"></div><div class="kbm-hint"></div><div class="kbm-list" aria-live="polite"></div><div class="kbm-prevw" style="display:none"><div class="kbm-prevt">✏️ 版面編輯區(發布後就是這個樣子)</div><div class="kbm-tb"></div><div class="kbm-prev kbm-edit"></div></div>';
    ST.hintEl = host.querySelector('.kbm-hint');
    host.querySelector('[data-k="img"]').addEventListener('click', function () { if (count('image') >= CFG.maxImages) return say('照片最多 ' + CFG.maxImages + ' 張喔。', 'error'); host.querySelector('[data-k="file"]').click(); });
    host.querySelector('[data-k="file"]').addEventListener('change', function (e) { var fs = Array.prototype.slice.call(e.target.files || []); e.target.value = ''; addImages(fs); });
    host.querySelector('[data-k="rec"]').addEventListener('click', toggleRecord);
    host.querySelector('[data-k="aud"]').addEventListener('click', function () { if (count('audio') >= CFG.maxAudio) return say('錄音最多 ' + CFG.maxAudio + ' 段,要換請先把舊的拿掉。', 'error'); host.querySelector('[data-k="afile"]').click(); });
    host.querySelector('[data-k="afile"]').addEventListener('change', function (e) { var f = (e.target.files || [])[0]; e.target.value = ''; if (f) addAudioFile(f); });
    host.addEventListener('click', function (e) {
      var c = function (q) { return e.target.closest ? e.target.closest(q) : null; };
      var x = c('[data-x]'), r = c('[data-retry]'), a = c('[data-adj]'), z = c('[data-z]'), tl = c('[data-tl]'), tc = c('[data-tc]'), sl = c('[data-sel]');
      if (x) removeItem(x.getAttribute('data-x')); else if (r) retry(r.getAttribute('data-retry'));
      else if (tl || tc) tbAction(CCX, e);
      else if (sl) { select(CCX, sl.getAttribute('data-sel')); var eb = host.querySelector('.kbm-prev'); try { if (eb && eb.scrollIntoView) eb.scrollIntoView({ block: 'nearest' }); } catch (e2) {} }
      else if (a) { var ia = itemOf(a); if (ia) { ia.open = !ia.open; render(); } }
      else if (z) { var iz = itemOf(z); if (iz) { setLay(iz, { z: +z.getAttribute('data-z') }); render(); } }
    });
    /* 大小滑桿:拖的時候只更新數字和預覽(不整個重畫,才不會斷掉);放開才重畫 */
    host.addEventListener('input', function (e) {
      var t = e.target; if (!t || !t.getAttribute || t.getAttribute('data-zr') == null) return;
      var it = itemOf(t); if (!it) return; setLay(it, { z: +t.value });
      var v = t.parentNode.querySelector('.kbm-zv'); if (v) v.textContent = layFor(it).z + '%'; schedPrev();
    });
    host.addEventListener('change', function (e) {
      var t = e.target; if (!t || !t.getAttribute) return; var it = itemOf(t); if (!it) return;
      if (t.getAttribute('data-zr') != null) setLay(it, { z: +t.value }); else if (t.getAttribute('data-lay') != null) setLay(it, { l: t.value }); else if (t.getAttribute('data-pos') != null) setLay(it, { p: +t.value }); else return;
      render();
    });
    /* 「放在哪裡」的選項要跟著現在打的文字走:打開選單前重新產生 */
    host.addEventListener('mousedown', refreshPos); host.addEventListener('focusin', refreshPos);
    var ta = doc.getElementById('node-content'); if (ta) ta.addEventListener('input', schedPrev);
    /* 縮圖/照片不能被瀏覽器「拖出去」:否則一不小心拖進文字框,會變成一長串圖片資料 */
    host.addEventListener('dragstart', function (e) { if (e.target && e.target.tagName === 'IMG') e.preventDefault(); });
    ['node-title', 'node-content'].forEach(function (id) {
      var f = doc.getElementById(id); if (!f) return;
      f.addEventListener('dragover', function (e) { var ty = e.dataTransfer && e.dataTransfer.types; if (ty && Array.prototype.indexOf.call(ty, 'Files') >= 0) e.preventDefault(); });
      f.addEventListener('drop', function (e) {
        var dt = e.dataTransfer; if (!dt) return;
        var fs = Array.prototype.slice.call(dt.files || []).filter(function (x) { return /^image\//.test(x.type); });
        if (fs.length) { e.preventDefault(); addImages(fs); return; }          // 把照片檔拖進來 = 加照片
        var tx = ''; try { tx = dt.getData('text') || ''; } catch (e2) {}
        if (/data:(image|audio)\//.test(tx)) e.preventDefault();               // 圖片資料不要變成文字
      });
      f.addEventListener('paste', function (e) { var tx = ''; try { tx = (e.clipboardData && e.clipboardData.getData('text')) || ''; } catch (e2) {} if (/^\s*data:(image|audio)\/[a-z0-9.+-]+;base64,/i.test(tx)) e.preventDefault(); });
    });
    host.querySelector('.kbm-prev').addEventListener('pointerdown', function (e) { onDown(e, CCX); });
    render(); return host;
  }
  function render() {
    var host = ST.host; if (!host) return;
    var list = host.querySelector('.kbm-list'), on = enabled();
    host.style.display = on ? '' : 'none';
    list.innerHTML = ST.items.map(function (it) {
      var body = it.kind === 'image' ? '<img draggable="false" alt="附圖(點一下在下方版面編輯區選取)" title="點一下,在下方版面編輯區選取這張照片" data-sel="' + esc(it.key) + '" src="' + esc(it.d || '') + '">' + (it.d ? '<button type="button" class="kbm-adjb" data-adj="1" aria-expanded="' + (it.open ? 'true' : 'false') + '">' + (it.open ? '▲ 收起' : '⚙ 用數字調整') + '</button>' + (it.open ? panelHtml(it) : '') : '') : '<div style="font-size:12px;font-weight:700">🎙️ 錄音 ' + mmss(it.dur || 0) + '</div>' + (it.d ? '<audio controls preload="metadata" src="' + esc(it.d) + '"></audio>' : '');
      var st = it.state === 'ok' ? '<span class="kbm-st ok">✓ 已準備好</span>' : it.state === 'err' ? '<span class="kbm-st err">⚠ ' + esc(it.err || '沒有傳成功') + '<button type="button" data-retry="' + esc(it.key) + '">重試</button></span>' : '<span class="kbm-st">傳送中…</span>';
      return '<div class="kbm-it' + (it.open ? ' open' : '') + '" data-key="' + esc(it.key) + '">' + body + st + '<button type="button" class="kbm-x" data-x="' + esc(it.key) + '" aria-label="拿掉這個附件">✕</button></div>';
    }).join('');
    var rb = host.querySelector('[data-k="rect"]'), recBtn = host.querySelector('[data-k="rec"]');
    if (!ST.rec) { rb.textContent = '錄音'; recBtn.className = 'kbm-btn'; recBtn.disabled = !ST.rec && count('audio') >= CFG.maxAudio; }
    host.querySelector('[data-k="img"]').disabled = count('image') >= CFG.maxImages;
    host.querySelector('[data-k="aud"]').disabled = !!ST.rec || count('audio') >= CFG.maxAudio;
    if (!ST.hintEl.textContent) setHint(baseHint());
    prev();
  }
  /* ----- 調整大小與位置 ----- */
  function layFor(it) { return it.lay || (it.legacy ? OLD_LAY : DEF_LAY); }
  function setLay(it, o) { var b = layFor(it), n = { z: b.z, l: b.l, p: b.p }; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k]; n.z = clampZ(n.z); it.lay = n; schedPrev(); }
  function itemOf(el) { var q = el.closest ? el.closest('.kbm-it') : null, k = q && q.getAttribute('data-key'); return ST.items.filter(function (x) { return x.key === k; })[0] || null; }
  function posOpts(sel) {
    var ta = doc.getElementById('node-content'), lines = String((ta && ta.value) || '').split('\n'), o = [[0, '最上面(文字之前)']];
    lines.forEach(function (ln, i) { var t = ln.replace(/\s+/g, ' ').trim(); if (t && i + 1 < lines.length) o.push([i + 1, '「' + t.slice(0, 14) + (t.length > 14 ? '…' : '') + '」後面']); });
    o.push([-1, '最下面(文字之後)']);
    if (sel >= 0 && sel < lines.length && !o.some(function (x) { return x[0] === sel; })) o.push([sel, '第 ' + sel + ' 行後面']);
    return o;
  }
  function posHtml(sel) { return posOpts(sel).map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === sel ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join(''); }
  function refreshPos(e) {
    var t = e && e.target; if (!t || !t.getAttribute || t.getAttribute('data-pos') == null) return;
    var it = itemOf(t); if (!it) return; var h = posHtml(layFor(it).p); if (t.__h !== h) { t.innerHTML = h; t.__h = h; }
  }
  function panelHtml(it) {
    var l = layFor(it), zb = [[25, '小'], [50, '中'], [75, '大'], [100, '滿版']].map(function (b) { return '<button type="button" class="kbm-chip' + (l.z === b[0] ? ' on' : '') + '" data-z="' + b[0] + '">' + b[1] + '</button>'; }).join('');
    var lo = LAYS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === l.l ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('');
    return '<div class="kbm-adj"><div class="kbm-r"><b>大小</b>' + zb + '<input type="range" min="10" max="100" step="5" value="' + l.z + '" data-zr="1" aria-label="照片大小"><span class="kbm-zv">' + l.z + '%</span></div>' +
      '<div class="kbm-r"><b>排列</b><select data-lay="1" aria-label="照片排列方式">' + lo + '</select></div>' +
      '<div class="kbm-r"><b>位置</b><select data-pos="1" aria-label="照片放在哪裡">' + posHtml(l.p) + '</select></div>' +
      '<div class="kbm-note">' + (it.lay ? '也可以直接在下方「版面編輯區」用滑鼠拖曳、拉角落、裁切。位置 = 照片放在哪一行文字的後面。' : '這是舊貼文的照片,調整後才會改用新版面。') + '</div></div>';
  }
  var prevT = 0;
  function schedPrev() { clearTimeout(prevT); prevT = setTimeout(prev, 100); }
  function prev() {
    clearTimeout(prevT); var host = ST.host; if (!host) return;
    var w = host.querySelector('.kbm-prevw'), pv = host.querySelector('.kbm-prev'); if (!w || !pv) return;
    var imgs = ST.items.filter(function (x) { return x.kind === 'image' && x.d; });
    w.style.display = imgs.length ? '' : 'none'; if (!imgs.length) { ST.sel = null; ST.crop = false; return; }
    var ta = doc.getElementById('node-content'), text = ta ? ta.value : '';
    flow(pv, text || '(這裡會顯示你寫的文字)', imgs.map(function (x, i) { var l = layFor(x); return { src: x.d, alt: '預覽 ' + (i + 1), z: l.z, l: l.l, p: l.p, key: x.key, c: x.crop || null, w: x.w, h: x.h }; }), { edit: true });
    pv.classList.add('kbm-edit'); decorate(CCX);
  }
  /* ----- 直接操作照片:點選、拖曳移動、拉角落縮放、裁切 -----
   * 做成「操作環境 cx」:發言視窗的編輯區(cx = CCX)和貼文視窗(作者本人)共用同一套。
   * cx = { S: { items, sel, crop }, box(): 放文字+照片的元素, tb(): 工具列元素, hint, again(): 改完重畫, changed(it): 改完存起來 } */
  var TB = [['inline', '與文字排列', '像一個字,接在那一行後面'], ['wrapL', '文字環繞・左', '圖在左邊,文字繞著圖排'], ['wrapR', '文字環繞・右', '圖在右邊,文字繞著圖排'], ['blockL', '上及下・靠左', '圖自己一行,靠左'], ['blockC', '上及下・置中', '圖自己一行,置中'], ['blockR', '上及下・靠右', '圖自己一行,靠右'], ['back', '文字在後', '當淡淡的底圖,文字蓋在上面']];
  var HINT = '💡 點一下照片就能選取:按住拖曳 = 移動(拖到左邊或右邊 = 文字環繞)、拖角落 = 調整大小、「✂ 裁切」= 切掉不要的部分。';
  var CCX = { S: ST, box: function () { return ST.host && ST.host.querySelector('.kbm-prev'); }, tb: function () { return ST.host && ST.host.querySelector('.kbm-tb'); }, hint: HINT, again: function () { render(); }, changed: null };
  var DRAG = null;
  function itemByKey(cx, k) { return cx.S.items.filter(function (x) { return x.key === k; })[0] || null; }
  function selItem(cx) { var S = cx.S, it = S.sel && itemByKey(cx, S.sel); if (!it || it.kind !== 'image' || !it.d) { S.sel = null; S.crop = false; return null; } return it; }
  function select(cx, key) { cx.S.sel = key; cx.S.crop = false; decorate(cx); }
  function decorate(cx) {
    var S = cx.S, box = cx.box(), tb = cx.tb(); if (!box || !tb) return;
    Array.prototype.forEach.call(box.querySelectorAll('.kbm-h'), function (h) { h.parentNode.removeChild(h); });
    Array.prototype.forEach.call(box.querySelectorAll('.kbm-sel'), function (e) { e.classList.remove('kbm-sel'); e.classList.remove('kbm-cropping'); });
    var it = selItem(cx);
    if (!it) { tb.innerHTML = '<span class="kbm-tbh">' + cx.hint + '</span>'; return; }
    var l = layFor(it), canCrop = it.w > 0 && it.h > 0;
    tb.innerHTML = '<div class="kbm-tbr">' + TB.map(function (b) { return '<button type="button" class="kbm-chip' + (l.l === b[0] ? ' on' : '') + '" data-tl="' + b[0] + '" title="' + esc(b[2]) + '">' + b[1] + '</button>'; }).join('') + '</div>' +
      '<div class="kbm-tbr">' + (canCrop ? '<button type="button" class="kbm-chip' + (S.crop ? ' on' : '') + '" data-tc="crop">' + (S.crop ? '✓ 完成裁切' : '✂ 裁切') + '</button>' : '') + (it.crop ? '<button type="button" class="kbm-chip" data-tc="uncrop">↺ 還原裁切</button>' : '') + '<button type="button" class="kbm-chip" data-tc="zoom">🔍 放大看</button>' +
      '<span class="kbm-tbh">' + (S.crop ? '拖邊或角落,切掉不要的部分(原圖不會被改,可隨時還原)' : l.l === 'back' ? '底圖不能拖曳,拉角落調整大小' : '按住照片拖曳移動;拖角落調整大小') + '</span></div>';
    var el = box.querySelector('.kbm-ie[data-key="' + it.key + '"]'); if (!el) return;
    el.classList.add('kbm-sel'); if (S.crop) el.classList.add('kbm-cropping');
    (S.crop ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] : ['nw', 'ne', 'se', 'sw']).forEach(function (h) { var sp = doc.createElement('span'); sp.className = 'kbm-h kbm-h-' + h; sp.setAttribute('data-h', h); el.appendChild(sp); });
  }
  /* 工具列按鈕(排列 / 裁切 / 放大) */
  function tbAction(cx, e) {
    var q = function (s) { return e.target && e.target.closest ? e.target.closest(s) : null; }, tl = q('[data-tl]'), tc = q('[data-tc]'), it = selItem(cx);
    if (!it || !(tl || tc)) return false;
    if (tl) { setLay(it, { l: tl.getAttribute('data-tl') }); if (cx.changed) cx.changed(it); cx.again(); return true; }
    var k = tc.getAttribute('data-tc');
    if (k === 'zoom') { lightbox(it.d); return true; }
    if (k === 'crop') cx.S.crop = !cx.S.crop; else if (k === 'uncrop') { it.crop = null; cx.S.crop = false; if (cx.changed) cx.changed(it); }
    cx.again(); return true;
  }
  function onDown(e, cx) {
    if (e.button > 0 || !cx) return;
    var S = cx.S, t = e.target, hEl = t && t.closest ? t.closest('[data-h]') : null, ie = t && t.closest ? t.closest('.kbm-ie') : null;
    if (!ie) { if (S.sel) { S.sel = null; S.crop = false; decorate(cx); } return; }
    var it = itemByKey(cx, ie.getAttribute('data-key')); if (!it) return;
    if (e.preventDefault) e.preventDefault();
    if (S.sel !== it.key) { S.sel = it.key; S.crop = false; decorate(cx); }
    var l = layFor(it), clip = ie.querySelector('.kbm-cw'), im = clip.querySelector('img'), r = ie.getBoundingClientRect(), cr = clip.getBoundingClientRect();
    DRAG = { cx: cx, it: it, ie: ie, clip: clip, im: im, x0: e.clientX, y0: e.clientY, h: hEl ? hEl.getAttribute('data-h') : '',
      mode: hEl ? (S.crop ? 'crop' : 'size') : (l.l === 'back' || S.crop ? 'none' : 'move'),
      startW: r.width, Cw: (ie.parentNode && ie.parentNode.clientWidth) || 0, c0: it.crop || [0, 0, 1, 1], cw: cr.width, ch: cr.height, moved: false, z: l.z, crop: it.crop || null, drop: null };
    doc.addEventListener('pointermove', onMove); doc.addEventListener('pointerup', onUp); doc.addEventListener('pointercancel', onUp);
  }
  function onMove(e) {
    var G = DRAG; if (!G) return; var dx = e.clientX - G.x0, dy = e.clientY - G.y0;
    if (G.mode === 'size') {
      if (!G.Cw) return; G.z = sizeDrag(G.h, G.startW, dx, G.Cw); G.moved = true; G.ie.style.width = G.z + '%';
    } else if (G.mode === 'crop') {
      var Dw = G.cw / G.c0[2], Dh = G.ch / G.c0[3]; if (!(Dw > 0 && Dh > 0 && G.Cw)) return;
      var nc = cropDrag(G.h, G.c0, dx / Dw, dy / Dh);
      G.crop = nc; G.z = clampZ(Dw * nc[2] / G.Cw * 100); G.moved = true; G.ie.style.width = G.z + '%'; cropStyle(G.clip, G.im, nc, G.it.w, G.it.h);
    } else if (G.mode === 'move') {
      if (!G.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      G.moved = true; moveGhost(G, e);
    }
  }
  function moveGhost(G, e) {
    var box = G.cx.box(), br = box.getBoundingClientRect();
    if (!G.ghost) {
      var g = doc.createElement('img'); g.src = G.it.d; g.className = 'kbm-ghost'; doc.body.appendChild(g); G.ghost = g;
      var ind = doc.createElement('div'); ind.className = 'kbm-ind'; ind.innerHTML = '<span></span>'; box.appendChild(ind); G.ind = ind; G.ie.classList.add('kbm-dragging');
    }
    G.ghost.style.left = (e.clientX + 12) + 'px'; G.ghost.style.top = (e.clientY + 12) + 'px';
    var lines = Array.prototype.map.call(box.querySelectorAll('.kbm-ln'), function (d) { var r = d.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    var d = dropAt(lines, { left: br.left, width: br.width }, e.clientX, e.clientY); G.drop = d;
    var cur = layFor(G.it).l, nl = layAfterDrop(cur, d.side);
    G.ind.className = 'kbm-ind ' + d.side; G.ind.style.top = (d.y - br.top + box.scrollTop) + 'px';
    G.ind.firstChild.textContent = nl === 'wrapL' ? '放這裡:靠左・文字環繞' : nl === 'wrapR' ? '放這裡:靠右・文字環繞' : nl === 'inline' ? '放這裡:接在這行文字裡' : '放這裡:自己一行・置中';
  }
  function onUp() {
    var G = DRAG; DRAG = null;
    doc.removeEventListener('pointermove', onMove); doc.removeEventListener('pointerup', onUp); doc.removeEventListener('pointercancel', onUp);
    if (!G) return;
    if (G.ghost && G.ghost.parentNode) G.ghost.parentNode.removeChild(G.ghost);
    if (G.ind && G.ind.parentNode) G.ind.parentNode.removeChild(G.ind);
    G.ie.classList.remove('kbm-dragging');
    if (!G.moved) return;
    if (G.mode === 'move' && G.drop) setLay(G.it, { p: G.drop.p, l: layAfterDrop(layFor(G.it).l, G.drop.side) });
    else if (G.mode === 'size') setLay(G.it, { z: G.z });
    else if (G.mode === 'crop') { setLay(G.it, { z: G.z }); G.it.crop = cropOf({ c: G.crop }); }
    if (G.cx.changed) G.cx.changed(G.it);
    G.cx.again();
  }
  var keySeq = 0;
  function addItem(o) { o.key = 'k' + (keySeq++); ST.items.push(o); render(); return o; }
  function upload(it, rec) {
    it.state = 'up'; it.err = ''; render();
    return send(it.id, rec).then(function () { it.state = 'ok'; render(); }, function (e) { it.state = 'err'; it.err = errText(e); it.rec = rec; render(); });
  }
  function retry(key) { var it = ST.items.filter(function (x) { return x.key === key; })[0]; if (it && it.rec) upload(it, it.rec); }
  function removeItem(key) { if (ST.sel === key) { ST.sel = null; ST.crop = false; } ST.items = ST.items.filter(function (x) { return x.key !== key; }); setHint(baseHint()); render(); }
  function addImages(files) {
    if (!mount()) return;
    var room = CFG.maxImages - count('image');
    files = files.filter(function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.name || ''); });
    if (!files.length) return say('請選圖片檔(照片或圖片)。', 'error');
    if (files.length > room) { say('照片最多 ' + CFG.maxImages + ' 張,多的先不放。', 'error'); files = files.slice(0, room); }
    files.forEach(function (f) {
      var it = addItem({ kind: 'image', state: 'up', name: f.name || '', id: newId(), lay: { z: DEF_LAY.z, l: DEF_LAY.l, p: DEF_LAY.p } });
      compressImage(f).then(function (r) { it.d = r.d; it.w = r.w; it.h = r.h; it.m = r.m; ST.sel = it.key; ST.crop = false; return upload(it, { d: r.d, m: r.m, t: Date.now(), w: r.w, h: r.h }); }, function (e) { removeItem(it.key); say(errText(e), 'error'); });
    });
  }
  /* 已經有的錄音檔(手機錄音、別的程式錄的):小檔直接收,太大請改用錄音鈕或先剪短 */
  function audioDur(url) { return new Promise(function (res) { try { var a = new global.Audio(); var done = function (v) { res(v); }; a.preload = 'metadata'; a.onloadedmetadata = function () { done(isFinite(a.duration) ? Math.round(a.duration) : 0); }; a.onerror = function () { done(0); }; a.src = url; setTimeout(function () { done(0); }, 3000); } catch (e) { res(0); } }); }
  function addAudioFile(f) {
    if (!mount()) return;
    if (count('audio') >= CFG.maxAudio) return say('錄音最多 ' + CFG.maxAudio + ' 段,要換請先把舊的拿掉。', 'error');
    if (!(/^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg|oga|webm|opus|amr|3gp)$/i.test(f.name || ''))) return say('請選錄音檔(像 mp3、m4a、wav)。', 'error');
    if (f.size > CFG.audioFileBytes) return say('這個錄音檔太大了(上限約 0.6MB,大約 1 分鐘)。請改用「錄音」按鈕直接錄,或先把它剪短。', 'error');
    var it = addItem({ kind: 'audio', state: 'up', name: f.name || '', id: newId() });
    toDataUrl(f).then(function (d) {
      if (d.length > CFG.docMax) throw new Error('too-big');
      var m = (f.type || 'audio/mpeg').split(';')[0]; if (!/^audio\/[a-z0-9.+-]+$/i.test(m)) m = 'audio/mpeg';
      return audioDur(d).then(function (dur) { it.d = d; it.m = m; it.dur = dur; return upload(it, { d: d, m: m, t: Date.now(), dur: dur || undefined }); });
    }, function (e) { removeItem(it.key); say(errText(e), 'error'); }).catch(function (e) { removeItem(it.key); say(errText(e), 'error'); });
  }
  function voiceBusy() { try { return !!(global.KBVoice && global.KBVoice.isActive && global.KBVoice.isActive()); } catch (e) { return false; } }
  function toggleRecord() {
    if (!mount()) return;
    var host = ST.host, rb = host.querySelector('[data-k="rect"]'), recBtn = host.querySelector('[data-k="rec"]');
    if (ST.rec) { ST.rec.stop(); return; }
    if (count('audio') >= CFG.maxAudio) return say('錄音最多 ' + CFG.maxAudio + ' 段,要重錄請先把舊的拿掉。', 'error');
    if (!H.record && !recSupported()) return say('這台裝置的瀏覽器不能錄音。可以換 Chrome 試試看。', 'error');
    if (voiceBusy()) return say('「用說的」還在聽,請先按「說完了」,再來錄音。', 'error');
    recBtn.disabled = true;
    Promise.resolve(startRecord(function (s) { if (ST.rec) rb.textContent = '⏹ 停止錄音 ' + mmss(s); })).then(function (r) {
      ST.rec = r; recBtn.disabled = false; recBtn.className = 'kbm-btn rec'; rb.textContent = '⏹ 停止錄音 0:00'; setHint('錄音中…說完請按「停止錄音」。最長 ' + (CFG.audioMaxSec / 60) + ' 分鐘。');
      r.result.then(function (rec) {
        ST.rec = null; setHint('');
        var it = addItem({ kind: 'audio', state: 'up', id: newId(), dur: rec.dur, d: rec.d, m: rec.m });
        upload(it, { d: rec.d, m: rec.m, t: Date.now(), dur: rec.dur });
      }, function (e) { ST.rec = null; setHint(''); render(); if (e && e.message !== 'cancelled') say(errText(e), 'error'); });
    }, function (e) { ST.rec = null; recBtn.disabled = false; render(); say(errText(e), 'error'); });
  }
  function reset() {
    if (ST.rec) { try { ST.rec.cancel(); } catch (e) {} ST.rec = null; }
    ST.items = []; ST.sel = null; ST.crop = false; if (ST.hintEl) setHint(''); render();
  }
  /* 編輯舊貼文:把原本的附件放回來(內容之後才載入,先顯示「載入中」) */
  function load(list) {
    reset(); if (!mount()) return;
    (list || []).forEach(function (m) {
      var it = addItem({ kind: m.kind, state: 'ok', id: m.id, w: m.w, h: m.h, dur: m.dur, m: m.m });
      if (m.kind === 'image') { if (hasLay(m)) it.lay = layOf(m); else it.legacy = true; var cc = cropOf(m); if (cc && m.w > 0 && m.h > 0) it.crop = cc; }
      get(m.id).then(function (r) { if (r) { it.d = r.d; render(); } }, function () {});
    });
  }
  function pending() { return ST.items.filter(function (x) { return x.state === 'up'; }).length + (ST.rec ? 1 : 0); }
  function failed() { return ST.items.filter(function (x) { return x.state === 'err'; }).length; }
  function collect() {
    return ST.items.filter(function (x) { return x.state === 'ok'; }).map(function (x) {
      var o = { id: x.id, kind: x.kind }; if (x.m) o.m = x.m; if (x.w) { o.w = x.w; o.h = x.h; } if (x.dur) o.dur = x.dur;
      if (x.kind === 'image' && x.lay) { var l = layOf(x.lay); o.z = l.z; o.l = l.l; if (l.p >= 0) o.p = l.p; if (x.crop && x.w > 0 && x.h > 0) o.c = x.crop; }
      return o;
    });
  }
  /* 發布前檢查:還在傳/錄音中/失敗 → 回傳要告訴小朋友的話;可以發布則回傳 '' */
  function gate() {
    if (ST.rec) return '還在錄音,請先按「停止錄音」。';
    if (pending()) return '照片或錄音還在傳送,等一下下再按發布。';
    if (failed()) return '有附件沒傳成功,請按「重試」或把它拿掉再發布。';
    return '';
  }

  /* ---------- 看貼文:顯示附件 ---------- */
  function lightbox(src) {
    var o = doc.createElement('div'); o.className = 'kbm-lb'; o.innerHTML = '<img alt="放大的圖片" src="' + esc(src) + '">';
    var close = function () { if (o.parentNode) o.parentNode.removeChild(o); doc.removeEventListener('keydown', onk); };
    var onk = function (e) { if (e.key === 'Escape') close(); };
    o.addEventListener('click', close); doc.addEventListener('keydown', onk); doc.body.appendChild(o);
  }
  function renderView(host, list) {
    if (!host) return; css(); host.innerHTML = '';
    if (!list || !list.length) { host.style.display = 'none'; return; }
    host.style.display = ''; host.className = 'kbm-view';
    var n = 0;
    list.forEach(function (m) {
      var ph = doc.createElement('div'); ph.className = 'kbm-ph'; ph.textContent = m.kind === 'audio' ? '🎙️ 錄音載入中…' : '📷 圖片載入中…'; host.appendChild(ph);
      var no = ++n;
      get(m.id).then(function (r) {
        var el;
        if (!r || !r.d) { ph.textContent = (m.kind === 'audio' ? '🎙️ 這段錄音' : '📷 這張圖片') + '現在打不開(可能網路還沒連上,或檔案還沒傳好)。'; return; }
        if (m.kind === 'audio') { el = doc.createElement('audio'); el.controls = true; el.preload = 'metadata'; el.src = r.d; el.setAttribute('aria-label', '錄音 ' + (m.dur ? mmss(m.dur) : '')); }
        else { el = doc.createElement('img'); el.alt = '附圖 ' + no; el.src = r.d; el.addEventListener('click', function () { lightbox(r.d); }); }
        if (ph.parentNode) ph.parentNode.replaceChild(el, ph);
      }, function () { ph.textContent = '附件現在打不開,請稍後再試。'; });
    });
  }
  /* 看貼文:文字 + 附件。照片有設定版面(z/l/p)就依版面排進文字裡;舊貼文維持照片排在文字下面。
   * opts.editable(作者本人)+ 照片已有版面 → 在這裡就能直接點選、拖曳、拉角落縮放、裁切;opts.onChange(新的附件清單) 會被呼叫來存檔。 */
  function mediaOf(it, base) {
    var o = {}; for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) o[k] = base[k];
    delete o.z; delete o.l; delete o.p; delete o.c;
    if (it.lay) { var l = layOf(it.lay); o.z = l.z; o.l = l.l; if (l.p >= 0) o.p = l.p; }
    if (it.crop && it.w > 0 && it.h > 0) o.c = it.crop;
    return o;
  }
  function viewTb(textEl) {
    var tb = textEl.parentNode && textEl.parentNode.querySelector('.kbm-vtb');
    if (!tb && textEl.parentNode) { tb = doc.createElement('div'); tb.className = 'kbm-tb kbm-vtb'; textEl.parentNode.insertBefore(tb, textEl); }
    return tb;
  }
  function renderBody(textEl, host, text, list, opts) {
    list = list || [];
    var imgs = list.filter(function (m) { return m.kind === 'image'; });
    var tb0 = textEl && textEl.parentNode ? textEl.parentNode.querySelector('.kbm-vtb') : null;
    if (!textEl || !imgs.some(hasLay)) {
      if (textEl) { textEl.classList.remove('kbm-flow'); textEl.classList.remove('kbm-edit'); textEl.style.whiteSpace = ''; textEl.__kbmTok = (textEl.__kbmTok || 0) + 1; textEl.__cx = null; }
      if (tb0) { tb0.innerHTML = ''; tb0.style.display = 'none'; }
      return renderView(host, list);
    }
    css(); textEl.style.whiteSpace = 'normal'; flow(textEl, text, []);
    renderView(host, list.filter(function (m) { return m.kind === 'audio'; }));
    var editable = !!(opts && opts.editable), cx = null, tb = null;
    if (editable) {
      tb = viewTb(textEl); tb.style.display = '';
      cx = {
        S: { items: [], sel: null, crop: false }, box: function () { return textEl; }, tb: function () { return tb; }, missing: 0,
        hint: '💡 這是你的貼文,可以直接調整照片:點一下照片選取,按住拖曳 = 移動(拖到左邊或右邊 = 文字環繞)、拖角落 = 調整大小、「✂ 裁切」= 切掉不要的部分。改完會自動儲存。',
        again: function () { redraw(); },
        changed: function () {
          var out = list.map(function (m) { if (m.kind !== 'image') return m; var it = cx.S.items.filter(function (x) { return x.id === m.id; })[0]; return it ? mediaOf(it, m) : m; });
          list = out; if (opts.onChange) opts.onChange(out);
        }
      };
      var redraw = function () {
        flow(textEl, text, cx.S.items.map(function (it, i) { var l = layFor(it); return { src: it.d, alt: '附圖 ' + (i + 1), z: l.z, l: l.l, p: l.p, key: it.key, c: it.crop || null, w: it.w, h: it.h }; }), { edit: true });
        textEl.classList.add('kbm-edit');
        if (cx.missing) { var ph = doc.createElement('div'); ph.className = 'kbm-ph'; ph.textContent = '📷 有 ' + cx.missing + ' 張圖片現在打不開(可能網路還沒連上,或檔案還沒傳好)。'; textEl.appendChild(ph); }
        decorate(cx);
      };
      cx.redraw = redraw; decorate(cx);
      if (!textEl.__kbmEd) { textEl.__kbmEd = true; textEl.addEventListener('pointerdown', function (e) { if (textEl.__cx) onDown(e, textEl.__cx); }); }
      if (!tb.__kbmEd) { tb.__kbmEd = true; tb.addEventListener('click', function (e) { if (textEl.__cx) tbAction(textEl.__cx, e); }); }
    } else { if (tb0) { tb0.innerHTML = ''; tb0.style.display = 'none'; } textEl.classList.remove('kbm-edit'); }
    textEl.__cx = cx;
    var tok = textEl.__kbmTok = (textEl.__kbmTok || 0) + 1;
    Promise.all(imgs.map(function (m, i) {
      return get(m.id).then(function (r) { return { m: m, i: i, d: r && r.d ? r.d : '' }; }, function () { return { m: m, i: i, d: '' }; });
    })).then(function (rs) {
      if (textEl.__kbmTok !== tok) return;
      var ok = rs.filter(function (x) { return x.d; });
      if (cx) {
        cx.S.items = ok.map(function (x) { var m = x.m, it = { key: m.id, id: m.id, kind: 'image', d: x.d, w: m.w, h: m.h, crop: cropOf(m) }; if (hasLay(m)) it.lay = layOf(m); else it.legacy = true; return it; });
        cx.missing = rs.length - ok.length; cx.redraw(); return;
      }
      flow(textEl, text, ok.map(function (x) { var l = hasLay(x.m) ? layOf(x.m) : OLD_LAY; return { src: x.d, alt: '附圖 ' + (x.i + 1), z: l.z, l: l.l, p: l.p, click: lightbox, c: cropOf(x.m), w: x.m.w, h: x.m.h }; }));
      if (ok.length < rs.length) { var ph = doc.createElement('div'); ph.className = 'kbm-ph'; ph.textContent = '📷 有 ' + (rs.length - ok.length) + ' 張圖片現在打不開(可能網路還沒連上,或檔案還沒傳好)。'; textEl.appendChild(ph); }
    });
  }
  /* 卡片上的小標記(只顯示有幾個,不載入檔案) */
  function badge(list) {
    if (!list || !list.length) return '';
    var im = list.filter(function (m) { return m.kind === 'image'; }).length, au = list.filter(function (m) { return m.kind === 'audio'; }).length;
    return (im ? '📷' + im : '') + (im && au ? ' ' : '') + (au ? '🎙️' : '');
  }

  global.KBMedia = {
    CFG: CFG, enabled: enabled, mount: mount, reset: reset, load: load, collect: collect, gate: gate, pending: pending, failed: failed,
    renderView: renderView, renderBody: renderBody, badge: badge, get: get, send: send, newId: newId, compressImage: compressImage, recSupported: recSupported,
    addImages: addImages, addAudioFile: addAudioFile,
    _t: { H: H, flow: flow, layOf: layOf, LAYS: LAYS, prev: prev, cropOf: cropOf, dropAt: dropAt, cropDrag: cropDrag, sizeDrag: sizeDrag, layAfterDrop: layAfterDrop, select: select, decorate: decorate, CCX: CCX, lput: lput, lget: lget, mem: mem, items: function () { return ST.items; }, toggleRecord: toggleRecord, state: ST }
  };
})(typeof window !== 'undefined' ? window : globalThis);
