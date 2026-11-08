/* kb-xlsx.js — 不需要網路的 Excel(.xlsx)讀寫小工具(給名單範本下載與名單匯入使用)
 * 寫出:建立標準 .xlsx(zip,免壓縮),Excel / WPS / Google 試算表都能開。
 * 讀取:解析 .xlsx 第一個工作表(需瀏覽器支援 DecompressionStream:Chrome/Edge 80+、Firefox 113+、Safari 16.4+)。
 */
(function (global) {
  'use strict';
  var enc = new TextEncoder(), dec = new TextDecoder('utf-8');

  /* ---------- CRC32 ---------- */
  var CRCT = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function concat(list) { var n = 0, i; for (i = 0; i < list.length; i++) n += list[i].length; var out = new Uint8Array(n), p = 0; for (i = 0; i < list.length; i++) { out.set(list[i], p); p += list[i].length; } return out; }

  /* ---------- 寫 zip(免壓縮) ---------- */
  function zip(files) {
    var chunks = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new Uint8Array(30 + name.length), dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true); dv.setUint32(14, crc, true); dv.setUint32(18, size, true); dv.setUint32(22, size, true);
      dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true); lh.set(name, 30);
      chunks.push(lh, f.data);
      var ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); ch.set(name, 46);
      central.push(ch); offset += lh.length + size;
    });
    var cs = 0; central.forEach(function (c) { cs += c.length; });
    var end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cs, true); ev.setUint32(16, offset, true);
    return concat(chunks.concat(central, [end]));
  }

  /* ---------- 建立 xlsx ---------- */
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function xesc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
  var X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  function sheetXml(sh, first) {
    var rows = sh.rows || [], widths = sh.widths || [], ncol = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.length; })), widths.length);
    var textCols = sh.textCols || [], blankRows = sh.blankRows || 0;
    var x = X + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"' + (first ? ' tabSelected="1"' : '') + '/></sheetViews><sheetFormatPr defaultRowHeight="18"/>';
    if (widths.length) x += '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>';
    x += '<sheetData>';
    var total = rows.length + blankRows;
    for (var r = 0; r < total; r++) {
      var row = rows[r] || [];
      x += '<row r="' + (r + 1) + '">';
      for (var c = 0; c < ncol; c++) {
        var ref = colName(c) + (r + 1), v = row[c];
        var style = (r === 0 && sh.header) ? 1 : (textCols.indexOf(c) >= 0 ? 2 : 0);
        if (v === undefined || v === null || v === '') { if (style) x += '<c r="' + ref + '" s="' + style + '"/>'; }
        else x += '<c r="' + ref + '" t="inlineStr"' + (style ? ' s="' + style + '"' : '') + '><is><t xml:space="preserve">' + xesc(v) + '</t></is></c>';
      }
      x += '</row>';
    }
    return x + '</sheetData></worksheet>';
  }
  /* sheets: [{ name, rows:[[...]], header:true, widths:[..], textCols:[0], blankRows:300 }] → Uint8Array */
  function build(sheets) {
    var files = [];
    files.push({ name: '[Content_Types].xml', data: enc.encode(X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') });
    files.push({ name: '_rels/.rels', data: enc.encode(X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') });
    files.push({ name: 'xl/workbook.xml', data: enc.encode(X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map(function (s, i) { return '<sheet name="' + xesc(s.name).slice(0, 31) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>') });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc.encode(X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') });
    files.push({ name: 'xl/styles.xml', data: enc.encode(X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft JhengHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>') });
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc.encode(sheetXml(s, i === 0)) }); });
    return zip(files);
  }

  /* ---------- 讀 xlsx ---------- */
  function readZip(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), i = u8.length - 22;
    for (; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) break;
    if (i < 0) throw new Error('這不是有效的 Excel 檔(.xlsx)');
    var n = dv.getUint16(i + 10, true), off = dv.getUint32(i + 16, true), map = {};
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
      map[dec.decode(u8.subarray(off + 46, off + 46 + nl))] = { method: method, csize: csize, lho: lho };
      off += 46 + nl + el + cl;
    }
    return map;
  }
  function inflateRaw(raw) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('此瀏覽器不支援直接讀取 Excel,請改用 Chrome/Edge,或另存成 CSV'));
    var stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function entryText(u8, map, name) {
    var e = map[name]; if (!e) return Promise.resolve(null);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), nl = dv.getUint16(e.lho + 26, true), el = dv.getUint16(e.lho + 28, true), st = e.lho + 30 + nl + el, raw = u8.subarray(st, st + e.csize);
    var p = e.method === 0 ? Promise.resolve(raw) : (e.method === 8 ? inflateRaw(raw) : Promise.reject(new Error('不支援的壓縮格式')));
    return p.then(function (b) { return dec.decode(b); });
  }
  function unx(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); }).replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&amp;/g, '&'); }
  function textsOf(xml) { var out = '', re = /<t\b[^>]*>([\s\S]*?)<\/t>/g, m; xml = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''); while ((m = re.exec(xml))) out += unx(m[1]); return out; }
  function attr(tag, name) { var m = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(tag); return m ? unx(m[1]) : ''; }
  function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; if (!m) return 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64); return n - 1; }

  function read(buffer) {
    return Promise.resolve().then(function () {
      var u8 = new Uint8Array(buffer), map = readZip(u8);
      return Promise.all([entryText(u8, map, 'xl/workbook.xml'), entryText(u8, map, 'xl/_rels/workbook.xml.rels'), entryText(u8, map, 'xl/sharedStrings.xml')]).then(function (a) {
        var wb = a[0], rels = a[1], ss = a[2], target = 'xl/worksheets/sheet1.xml';
        if (!wb) throw new Error('這不是有效的 Excel 檔(.xlsx)');
        var sm = /<sheet\b[^>]*>/.exec(wb);
        if (sm && rels) {
          var rid = attr(sm[0], 'r:id'), rr = /<Relationship\b[^>]*>/g, m;
          while ((m = rr.exec(rels))) { if (attr(m[0], 'Id') === rid) { var t = attr(m[0], 'Target'); target = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t; break; } }
        }
        var shared = [];
        if (ss) { var re = /<si\b[^>]*>([\s\S]*?)<\/si>/g, mm; while ((mm = re.exec(ss))) shared.push(textsOf(mm[1])); }
        return entryText(u8, map, target).then(function (sx) {
          if (!sx) throw new Error('找不到工作表內容');
          var rows = [], rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, rm, ri = 0;
          while ((rm = rowRe.exec(sx))) {
            var rnum = parseInt(attr(rm[1], 'r'), 10); var idx = rnum ? rnum - 1 : ri; ri = idx + 1;
            var cells = [], body = rm[2] || '', cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm, ci = 0;
            while ((cm = cre.exec(body))) {
              var ref = attr(cm[1], 'r'), t = attr(cm[1], 't'), inner = cm[2] || '', col = ref ? colIndex(ref) : ci; ci = col + 1;
              var val = '', vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
              if (t === 'inlineStr') val = textsOf(inner);
              else if (t === 's') val = vm ? (shared[parseInt(vm[1], 10)] || '') : '';
              else if (vm) val = unx(vm[1]);
              cells[col] = String(val).trim();
            }
            for (var q = 0; q < cells.length; q++) if (cells[q] === undefined) cells[q] = '';
            rows[idx] = cells;
          }
          var out = []; for (var z = 0; z < rows.length; z++) if (rows[z] && rows[z].some(function (x) { return String(x).trim() !== ''; })) out.push(rows[z]);
          return out;
        });
      });
    });
  }

  global.KBXLSX = { build: build, read: read, supported: typeof DecompressionStream !== 'undefined', _crc32: crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
