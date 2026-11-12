/* =====================================================================
 *  KB Research Export — 把論壇發言整理成 KBDeX 可以讀的資料(研究匯出)
 *
 *  輸出(對應 KBDeX 的資料夾格式):
 *    data.csv      Id, Author, Text, Group, Time(毫秒)      一則貼文一列,依時間排序
 *    word.txt      關鍵詞清單(由內建單元詞庫 + 老師自訂詞 + 發言中常出現的詞片段產生)
 *    lang.txt      JAPANESE(中文要用這個模式才會用子字串比對)
 *    group.csv     組別,成員
 *    發言對照.csv   KBDeX 的 Id ↔ 論壇的文章編號、上層發言(回覆關係)、討論區、類型
 *    對照表.csv     代號 ↔ 學號、姓名(只有選「代號」匿名時才有;要和資料檔分開保管)
 *    說明.txt
 *
 *  匿名方式(老師選):
 *    code  代號 P01、P02…(預設,最保險;老師另外保管對照表)
 *    id    學號(S01…;學號若是真實學號,仍可辨識出是誰)
 *    name  姓名(不匿名)
 *  選了 code 或 id 時,發言內容裡出現的同學姓名/學號也會換成同一個代號,避免從內容認出人。
 *
 *  純函式(只讀 KB 的資料,不寫回、不上網)。
 *  用法:var r = KBResearch.build({ anon:'code', topicIds:null, from:null, to:null }); r.files, r.stats
 *        KBResearch.packJSON(r) → 給 KBDeX 中文版「從知識論壇匯入」;KBResearch.zip(r.files, '資料夾名') → 給原版 KBDeX
 * ===================================================================== */
(function (global) {
  'use strict';
  var ANON = { code: '代號(P01、P02…)', id: '學號', name: '姓名(不匿名)' };

  function K() { return global.KB; }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function two(n) { return pad(n, 2); }
  function dateStr(ms) { var d = new Date(ms); return d.getFullYear() + '/' + two(d.getMonth() + 1) + '/' + two(d.getDate()); }
  function tsOf(n) { if (typeof n.date === 'number') return n.date; var t = Date.parse(n.date); return isFinite(t) ? t : 0; }
  function csvCell(v) { var s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function csv(rows) { return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n'; }
  function oneLine(s) { return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ---------- 取資料 ---------- */
  function load() {
    var KB = K(), c = KB.content.get();
    var users = KB.users.list(), byId = {};
    users.forEach(function (u) { byId[u.id] = u; });
    var groups = {}; (KB.classes.groups() || []).forEach(function (g) { groups[g.id] = g; });
    return { topics: c.topics || [], nodes: c.nodes || [], users: users, byId: byId, groups: groups };
  }
  function isStaff(u) { return !!u && u.role !== 'student'; }

  /* 代號:學生 P01…、老師 T01…(依學號排序,所以每次匯出同一位學生的代號相同) */
  function assignCodes(authorIds, byId) {
    var stu = [], tea = [];
    authorIds.forEach(function (id) { (isStaff(byId[id]) ? tea : stu).push(id); });
    var cmp = function (a, b) { return String(a).localeCompare(String(b), 'en', { numeric: true }); };
    stu.sort(cmp); tea.sort(cmp);
    var m = {}; stu.forEach(function (id, i) { m[id] = 'P' + pad(i + 1, Math.max(2, String(stu.length).length)); });
    tea.forEach(function (id, i) { m[id] = 'T' + pad(i + 1, 2); });
    return m;
  }
  function names(authorIds, byId) {
    var count = {}; authorIds.forEach(function (id) { var n = (byId[id] && byId[id].realName) || id; count[n] = (count[n] || 0) + 1; });
    var m = {}; authorIds.forEach(function (id) { var n = (byId[id] && byId[id].realName) || id; m[id] = count[n] > 1 ? n + '(' + id + ')' : n; });
    return m;
  }
  /* 把內容裡的姓名/學號換成這個人的作者標記 */
  function makeScrubber(users, label, anon) {
    if (anon === 'name') return function (s) { return s; };
    var rules = [];
    users.forEach(function (u) {
      var to = label[u.id]; if (!to) return;
      if (u.realName && String(u.realName).length >= 2 && anon === 'code') rules.push({ re: new RegExp(escRe(u.realName), 'g'), to: to });
      if (u.realName && String(u.realName).length >= 2 && anon === 'id') rules.push({ re: new RegExp(escRe(u.realName), 'g'), to: to });
      if (anon === 'code' && u.id && String(u.id).length >= 2) rules.push({ re: new RegExp('(^|[^0-9A-Za-z])' + escRe(u.id) + '(?![0-9A-Za-z])', 'gi'), to: '$1' + to, keep: true });
    });
    rules.sort(function (a, b) { return b.re.source.length - a.re.source.length; });
    return function (s) { s = String(s == null ? '' : s); rules.forEach(function (r) { s = s.replace(r.re, r.to); }); return s; };
  }

  /* ---------- 關鍵詞清單 ---------- */
  function buildWords(notes, extra, authorsCount) {
    var V = global.KBVocab; if (!V) return { text: '', active: [], cand: [] };
    var M = V.matcher(extra), df = {}, who = {}, ex = {}; V.splitExtra(extra).forEach(function (w) { ex[w] = 1; });
    notes.forEach(function (n) {
      var seen = M.find(n.text); seen.forEach(function (w) { df[w] = (df[w] || 0) + 1; (who[w] = who[w] || {})[n.author] = 1; });
    });
    var minAu = authorsCount >= 4 ? 2 : 1;
    var active = Object.keys(df).filter(function (w) { return ex[w] || (df[w] >= 2 && Object.keys(who[w]).length >= minAu); });
    active.sort(function (a, b) { return Object.keys(who[b]).length - Object.keys(who[a]).length || df[b] - df[a] || a.localeCompare(b); });
    active = active.slice(0, 60);
    // 字面上互為前綴/包含的詞:短的排前面、長的排後面(KBDeX 對互為前綴的詞只算排在後面的)
    active.sort(function (a, b) { return a.length - b.length || (df[b] - df[a]) || a.localeCompare(b); });
    var cand = [];
    try {
      cand = V.suggest(notes.map(function (n) { return { title: '', content: n.text, author: n.author }; }), M, { limit: 15 }).map(function (c) { return c.w; })
        .filter(function (w) { return active.indexOf(w) < 0; });
    } catch (e) { cand = []; }
    var lines = [
      '# 由知識論壇匯出(' + dateStr(Date.now()) + ')',
      '# 詞庫:內建單元詞庫 + 老師在設定中心補充的自訂詞;只列出在發言中至少出現 2 則' + (minAu > 1 ? '、至少 2 位學生用過' : '') + '的詞',
      '# 排列:短詞在前、長詞在後(KBDeX 對互為前綴的詞,只算排在後面的那個)',
      '# 下面「#候選」開頭的詞是從發言中常出現的詞片段挑出來的,預設不啟用;確認是好詞就把 # 拿掉(或在 KBDeX 的詞彙檢查按「加入」)'
    ].concat(active);
    if (cand.length) lines.push('# --- 候選 ---'); cand.forEach(function (w) { lines.push('#候選 ' + w); });
    return { text: lines.join('\r\n') + '\r\n', active: active, cand: cand };
  }

  /* ---------- 主函式 ---------- */
  function build(opts) {
    opts = opts || {};
    var anon = ANON[opts.anon] ? opts.anon : 'code';
    var D = load(), topicSel = null;
    if (opts.topicIds && opts.topicIds.length) { topicSel = {}; opts.topicIds.forEach(function (t) { topicSel[t] = 1; }); }
    var topicName = {}; D.topics.forEach(function (t) { topicName[t.id] = t.name || t.title || t.id; });
    var from = opts.from == null ? null : Number(opts.from), to = opts.to == null ? null : Number(opts.to);
    var nodes = D.nodes.filter(function (n) {
      if (topicSel && !topicSel[n.topicId]) return false;
      var t = tsOf(n); if (from != null && t < from) return false; if (to != null && t > to) return false;
      if (!opts.includeStaff && isStaff(D.byId[n.author])) return false;
      return !!n.author;
    });
    var order = {}; D.nodes.forEach(function (n, i) { order[n.id] = i; });
    nodes.sort(function (a, b) { return tsOf(a) - tsOf(b) || order[a.id] - order[b.id]; });

    var authorIds = []; nodes.forEach(function (n) { if (authorIds.indexOf(n.author) < 0) authorIds.push(n.author); });
    var codeMap = assignCodes(authorIds, D.byId), nameMap = names(authorIds, D.byId);
    var label = {}; authorIds.forEach(function (id) { label[id] = anon === 'code' ? codeMap[id] : anon === 'id' ? id : nameMap[id]; });
    // 內容裡提到「沒有發言的同學」也要處理 → 規則用全部使用者,代號用全班排序
    var allIds = D.users.map(function (u) { return u.id; }), allCode = assignCodes(allIds, D.byId), allLabel = {};
    D.users.forEach(function (u) { allLabel[u.id] = anon === 'code' ? allCode[u.id] : anon === 'id' ? u.id : (u.realName || u.id); });
    authorIds.forEach(function (id) { if (anon === 'code') allLabel[id] = codeMap[id]; });
    // 兩套代號要一致:有發言的人用 codeMap(只編有發言的人),沒發言的人用 Q 開頭避免和別人撞號
    D.users.forEach(function (u) { if (anon === 'code' && !codeMap[u.id]) allLabel[u.id] = (isStaff(u) ? 'T' : 'Q') + (allCode[u.id] || '').slice(1); });
    var scrub = makeScrubber(D.users, allLabel, anon);

    var gName = function (id) { var u = D.byId[id], g = u && u.groupId && D.groups[u.groupId]; return g ? g.name : ''; };
    var idOf = {}; nodes.forEach(function (n, i) { idOf[n.id] = i + 1; });
    var rows = [['Id', 'Author', 'Text', 'Group', 'Time']], link = [['Id', '論壇文章編號', '上層發言Id', '討論區', '類型', '標題']], notes = [];
    nodes.forEach(function (n, i) {
      var title = scrub(oneLine(n.title)), body = scrub(oneLine(n.content));
      var text = title && body.indexOf(title) !== 0 ? title + '。' + body : (body || title);
      rows.push([i + 1, label[n.author], text, gName(n.author) || '未分組', tsOf(n)]);
      notes.push({ author: label[n.author], text: text });
      link.push([i + 1, n.id, n.parentId && idOf[n.parentId] ? idOf[n.parentId] : '', topicName[n.topicId] || n.topicId, n.type || '', title]);
    });
    var gRows = [], gSeen = {};
    authorIds.forEach(function (id) { var g = gName(id); if (!g) return; var k = g + '|' + id; if (!gSeen[k]) { gSeen[k] = 1; gRows.push([g, label[id]]); } });

    var extra = ''; try { extra = (K().settings.get().analysis || {}).extraTerms || ''; } catch (e) {}
    var W = opts.words === false ? { text: '# 沒有產生關鍵詞清單\r\n', active: [], cand: [] } : buildWords(notes, extra, authorIds.length);

    var files = {
      'data.csv': csv(rows), 'word.txt': W.text, 'lang.txt': 'JAPANESE\r\n'
    };
    if (gRows.length) files['group.csv'] = csv(gRows);
    files['發言對照.csv'] = csv(link);
    var mapping = null;
    if (anon === 'code') {
      mapping = [['代號', '學號', '姓名', '組別']];
      authorIds.slice().sort(function (a, b) { return String(label[a]).localeCompare(String(label[b])); }).forEach(function (id) {
        mapping.push([label[id], id, (D.byId[id] && D.byId[id].realName) || '', gName(id)]);
      });
    }
    var stats = {
      posts: nodes.length, authors: authorIds.length, groups: Object.keys(gSeen).length ? gRows.reduce(function (m, r) { m[r[0]] = 1; return m; }, {}) : {},
      words: W.active.length, candidates: W.cand.length, anon: anon, from: nodes.length ? tsOf(nodes[0]) : 0, to: nodes.length ? tsOf(nodes[nodes.length - 1]) : 0,
      topics: nodes.reduce(function (m, n) { m[n.topicId] = 1; return m; }, {})
    };
    stats.groups = Object.keys(stats.groups).length; stats.topics = Object.keys(stats.topics).length;
    files['說明.txt'] = readme(stats, opts);
    return { files: files, stats: stats, mapping: mapping ? csv(mapping) : null, name: 'KBDeX資料_' + dateStr(Date.now()).replace(/\//g, '') };
  }

  function readme(st, opts) {
    return [
      '知識論壇 → KBDeX 研究匯出',
      '匯出日期:' + dateStr(Date.now()),
      '發言:' + st.posts + ' 則、' + st.authors + ' 位作者、' + st.groups + ' 個小組、' + st.topics + ' 個討論區',
      '發言期間:' + (st.posts ? dateStr(st.from) + ' ~ ' + dateStr(st.to) : '—'),
      '作者標記:' + ANON[st.anon] + (st.anon === 'code' ? '(代號與學號的對照表在另一個檔案「對照表.csv」,請和資料檔分開保管)' : ''),
      st.anon !== 'name' ? '內容中出現的同學姓名' + (st.anon === 'code' ? '、學號' : '') + '已換成同一個作者標記。仍請自行抽查,例如暱稱、綽號不會被換掉。' : '注意:這份資料含真實姓名,不要公開、不要寄給研究團隊以外的人。',
      '關鍵詞:' + st.words + ' 個(啟用)' + (st.candidates ? '、' + st.candidates + ' 個候選(預設不啟用)' : ''),
      '',
      '檔案:',
      '  data.csv      發言(Id, Author, Text, Group, Time)',
      '  word.txt      關鍵詞清單(用 KBDeX 的「關鍵詞選擇」可以修改)',
      '  lang.txt      JAPANESE(中文用這個模式)',
      '  group.csv     小組成員',
      '  發言對照.csv   KBDeX 的 Id 對應到論壇的文章編號與上層發言(回覆關係)',
      '',
      '用法:',
      '  KBDeX 中文版 → 資料集 → 「從知識論壇匯入…」選 .json 檔;或原版 KBDeX 匯入這個資料夾。',
      '  中文資料請確認語言是 JAPANESE(已設好)。'
    ].join('\r\n') + '\r\n';
  }

  /* ---------- 打包 ---------- */
  function packJSON(res) {
    var files = {}; Object.keys(res.files).forEach(function (k) { files[k] = res.files[k]; });
    return JSON.stringify({ app: 'kb-research-export', version: 1, time: new Date().toISOString(), name: res.name, anon: res.stats.anon, stats: res.stats, files: files });
  }

  var CRCT = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  /* 不壓縮的 zip(檔名用 UTF-8);files = { 檔名: 文字 };folder 是 zip 裡的資料夾名稱 */
  function zip(files, folder) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0, d = new Date();
    var dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    Object.keys(files).forEach(function (fn) {
      var name = enc.encode((folder ? folder + '/' : '') + fn), data = enc.encode(files[fn]), crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      var ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      parts.push(new Uint8Array(lh.buffer), name, data); central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var csz = 0; central.forEach(function (p) { csz += p.length; });
    var end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true); end.setUint32(12, csz, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]), total = 0; all.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), at = 0; all.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  global.KBResearch = { ANON: ANON, build: build, packJSON: packJSON, zip: zip, _crc32: crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
