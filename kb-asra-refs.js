/* =====================================================================
 *  KB ASRA 理論依據與期刊 — 老師頁的每一項分析都能展開「📚 理論依據與期刊」
 *  每一篇都是真實文獻(題名、作者、年份、卷期頁碼、DOI 於 2026-11-11 用 OpenAlex 逐篇核對),
 *  可以下載或免費閱讀的,連結也在當天確認過;沒有找到免費全文的,只給 DOI 並標明「可能需要圖書館權限」。
 *    acc: 'pdf'  = 直接是 PDF(用程式確認回傳的是 PDF 檔)
 *         'free' = 開放取用或免費閱讀(出版社或典藏庫頁面),PDF 在頁面上下載
 *         'doi'  = 目前沒有找到合法的免費全文,請用學校圖書館
 *  同一篇文獻可以被許多分析共用(FOR 裡每個分析列出它用到哪幾篇、各自支持什麼)。
 *  注意:文獻說明的是「方法的依據」。平台的關鍵字判斷、門檻(例如「超過 3 天」「80%」)是自訂的,不是文獻的標準。
 * ===================================================================== */
(function (global) {
  'use strict';
  var REFS = {
    ss06: { cite: 'Scardamalia, M., & Bereiter, C. (2006). Knowledge building: Theory, pedagogy, and technology. In K. Sawyer (Ed.), The Cambridge handbook of the learning sciences (pp. 97–118). Cambridge University Press.', doi: '', acc: 'pdf', url: 'https://ikit.org/fulltext/2006_KBTheory.pdf', note: '作者放在 ikit.org 的全文 PDF' },
    zhang25: { cite: 'Zhang, X., Chan, C. K. K., Feng, S., Ouyang, W., Xie, Y., Zhao, J., & Feng, X. (2025). Scaffolding knowledge building processes through ONA-supported collective reflective assessment. In Proceedings of the Computer-Supported Collaborative Learning Conference (CSCL 2025) (pp. 214–222). International Society of the Learning Sciences.', doi: '10.22318/cscl2025.579730', acc: 'pdf', url: 'https://repository.isls.org/bitstream/1/11846/1/CSCL2025_214-222.pdf', note: 'ISLS 典藏庫 PDF' },
    zhang26: { cite: 'Zhang, X., Chan, C. K. K., Feng, S., & Zhao, J. (2026). Scaffolding knowledge building through ordered-epistemic network analysis-supported reflective assessment and meta-discourse. In Proceedings of the Computer-Supported Collaborative Learning Conference (CSCL 2026) (pp. 514–518). International Society of the Learning Sciences.', doi: '10.22318/cscl2026.796777', acc: 'pdf', url: 'https://repository.isls.org/bitstream/1/12519/1/CSCL2026_514-518.pdf', note: 'ISLS 典藏庫 PDF(短篇)' },
    yang26: { cite: 'Yang, Y., Chen, L., Sun, D., Zhu, W., & Pang, S. (2026). Fostering preservice teachers\' design thinking by integrating generative AI and analytics-supported reflective assessment in a collaborative inquiry environment. Computers & Education, 249, 105602.', doi: '10.1016/j.compedu.2026.105602', acc: 'doi', url: '', note: '完整論文;沒有找到合法免費全文' },
    yang26c: { cite: 'Yang, Y., Chen, L., Sun, D., Zhu, W., & Pang, S. (2026). Fostering preservice teachers\' design thinking by integrating generative AI and analytics-supported reflective assessment in a collaborative inquiry environment [Short paper]. In Proceedings of the Computer-Supported Collaborative Learning Conference (CSCL 2026) (pp. 773–775). International Society of the Learning Sciences.', doi: '10.22318/cscl2026.947002', acc: 'pdf', url: 'https://repository.isls.org/bitstream/1/12588/1/CSCL2026_773-775.pdf', note: '同一研究的短篇版本,可下載' },
    chang19: { cite: 'Chang, L., Chen, Q., & Yang, Y. (2019). Developing a productive knowledge-building discourse through judgments of promising ideas and epistemic reflection. In Proceedings of the IADIS International Conference on Educational Technologies (ICEduTech 2019) (pp. 3–10). IADIS.', doi: '10.33965/icedutech2019_201902l001', acc: 'pdf', url: 'http://www.iadisportal.org/components/com_booklibrary/ebooks/201902L001.pdf', note: 'IADIS 全文 PDF' },
    chen15: { cite: 'Chen, B., Scardamalia, M., & Bereiter, C. (2015). Advancing knowledge-building discourse through judgments of promising ideas. International Journal of Computer-Supported Collaborative Learning, 10(4), 345–366.', doi: '10.1007/s11412-015-9225-z', acc: 'doi', url: '', note: '沒有找到合法免費全文' },
    resendes15: { cite: 'Resendes, M., Scardamalia, M., Bereiter, C., Chen, B., & Halewood, C. (2015). Group-level formative feedback and metadiscourse. International Journal of Computer-Supported Collaborative Learning, 10(3), 309–336.', doi: '10.1007/s11412-015-9219-x', acc: 'doi', url: '', note: '沒有找到合法免費全文' },
    zhang18: { cite: 'Zhang, J., Tao, D., Chen, M.-H., Sun, Y., Judson, D., & Naqvi, S. (2018). Co-organizing the collective journey of inquiry with Idea Thread Mapper. Journal of the Learning Sciences, 27(3), 390–430.', doi: '10.1080/10508406.2018.1444992', acc: 'doi', url: '', note: '沒有找到合法免費全文' },
    oshima13: { cite: 'Oshima, J., & Oshima, R. (2013). Social network analysis of collective knowledge advancement. In Proceedings of the 21st International Conference on Computers in Education (ICCE 2013). Asia-Pacific Society for Computers in Education.', doi: '10.58459/icce.2013.429', acc: 'pdf', url: 'https://library.apsce.net/index.php/ICCE/article/download/429/385', note: 'APSCE 典藏庫 PDF' },
    oshima12: { cite: 'Oshima, J., Oshima, R., & Matsuzawa, Y. (2012). Knowledge Building Discourse Explorer: A social network analysis application for knowledge building discourse. Educational Technology Research and Development, 60(5), 903–921.', doi: '10.1007/s11423-012-9265-2', acc: 'doi', url: '', note: '沒有找到合法免費全文' },
    shaffer16: { cite: 'Shaffer, D. W., Collier, W., & Ruis, A. R. (2016). A tutorial on epistemic network analysis: Analyzing the structure of connections in cognitive, social, and interaction data. Journal of Learning Analytics, 3(3), 9–45.', doi: '10.18608/jla.2016.33.3', acc: 'free', url: 'https://learning-analytics.info/index.php/JLA/article/view/4329', note: '開放取用期刊的文章頁(已確認可開啟),PDF 在頁面上下載' },
    andrade19: { cite: 'Andrade, H. L. (2019). A critical review of research on student self-assessment. Frontiers in Education, 4, Article 87.', doi: '10.3389/feduc.2019.00087', acc: 'pdf', url: 'https://www.frontiersin.org/articles/10.3389/feduc.2019.00087/pdf', note: '開放取用 PDF' },
    panadero16: { cite: 'Panadero, E., Brown, G. T. L., & Strijbos, J.-W. (2016). The future of student self-assessment: A review of known unknowns and potential directions. Educational Psychology Review, 28(4), 803–830.', doi: '10.1007/s10648-015-9350-2', acc: 'free', url: 'https://doi.org/10.1007/s10648-015-9350-2', note: '出版社頁面,OpenAlex 標示為可免費閱讀' },
    panadero17: { cite: 'Panadero, E., Jönsson, A., & Botella, J. (2017). Effects of self-assessment on self-regulated learning and self-efficacy: Four meta-analyses. Educational Research Review, 22, 74–98.', doi: '10.1016/j.edurev.2017.08.004', acc: 'free', url: 'https://doi.org/10.1016/j.edurev.2017.08.004', note: 'OpenAlex 標示可免費閱讀(出版社頁面已確認可開啟)' },
    verbert13: { cite: 'Verbert, K., Duval, E., Klerkx, J., Govaerts, S., & Santos, J. L. (2013). Learning analytics dashboard applications. American Behavioral Scientist, 57(10), 1500–1509.', doi: '10.1177/0002764213479363', acc: 'free', url: 'https://doi.org/10.1177/0002764213479363', note: 'OpenAlex 標示可免費閱讀;出版社網站會擋自動檢查,請在瀏覽器開啟' },
    jivet18: { cite: 'Jivet, I., Scheffel, M., Specht, M., & Drachsler, H. (2018). License to evaluate: Preparing learning analytics dashboards for educational practice. In Proceedings of the 8th International Conference on Learning Analytics and Knowledge (LAK \'18) (pp. 31–40). ACM.', doi: '10.1145/3170358.3170421', acc: 'free', url: 'https://doi.org/10.1145/3170358.3170421', note: 'OpenAlex 標示可免費閱讀;ACM 網站會擋自動檢查,請在瀏覽器開啟' },
    hattie07: { cite: 'Hattie, J., & Timperley, H. (2007). The power of feedback. Review of Educational Research, 77(1), 81–112.', doi: '10.3102/003465430298487', acc: 'doi', url: '', note: '沒有找到合法免費全文' }
  };
  // 每一項分析用到哪些文獻、各自支持什麼(why 只寫文獻題目與摘要能支持的說法)
  var FOR = {
    funnel: [['yang26c', 'ASRA(分析支持的反思評量)把「看資料 → 反思 → 調整 → 再檢查」串成一個流程;這是短篇版本,可下載。'], ['zhang25', '用分析圖讓學生看見自己的討論,再做集體反思;小學五年級的研究,和本平台的對象接近。'], ['yang26', 'ASRA 結合生成式 AI 的完整研究(對象是職前教師,不是小學生,要留意差異)。'], ['ss06', '想法是可以被持續改進的對象,學習是社群知識的推進,不是走到終點。']],
    types: [['zhang25', '把學生論述編碼成「認知行動」(epistemic actions),用有順序的網絡圖呈現給學生看。'], ['zhang26', '同一組研究者的延續:ONA 支持的反思評量,加上「談論討論本身」(meta-discourse)。'], ['shaffer16', '認知網絡分析(ENA)的教學式說明:怎麼看各種行動之間的連結結構。']],
    ideas: [['chang19', '用「判斷有潛力的想法」加上認識論反思,發展有成效的知識建構論述(可下載)。'], ['chen15', '學生判斷哪些想法有潛力,可以推進知識建構論述。'], ['ss06', '想法被提出、被檢驗、被改進,是知識建構的核心動作。']],
    tips: [['verbert13', '學習分析儀表板的各種應用,說明為什麼要把數字整理成老師看得懂的畫面。'], ['jivet18', '儀表板要有學習理論的依據並實際評估,不能只是把數字畫出來。'], ['andrade19', '給學生或老師的回饋與自評,要變成「下一步的行動」才有用。']],
    attention: [['verbert13', '儀表板用來幫老師「看見需要關心的學生」。'], ['jivet18', '提醒:規則式的提示只是輔助,要和老師的判斷一起用。'], ['resendes15', '團體層級的形成性回饋與後設論述:把全班的狀況回饋給大家一起想。']],
    students: [['verbert13', '個別學生一覽屬於學習分析儀表板的常見形式。'], ['jivet18', '儀表板的設計與評估:要讓使用的人看得懂、用得上。'], ['oshima13', '用社會網絡分析看每個人在集體知識進展裡的位置(誰回應誰、連到幾個人)。']],
    effect: [['yang26c', 'ASRA 的「反思 → 計畫 → 再檢查」閉環(短篇版本,可下載)。'], ['panadero17', '自評與自我調整學習、自我效能的整合分析:自評配合後續行動,效果較明顯。'], ['panadero16', '自評研究回顧:自評要和學習歷程連起來,而不是只打分數。'], ['ss06', '想法有沒有前進,是知識建構關心的結果。']],
    push: [['ss06', '想法是可以改進的對象:補證據、改想法、找夥伴,都是讓想法繼續前進的做法。'], ['chang19', '判斷想法的潛力並做認識論反思,幫助決定下一步(可下載)。'], ['zhang18', '把跨時間的想法串成「想法線」,師生一起決定接著探究哪裡。'], ['yang26c', '生成式 AI 融入 ASRA 的研究(短篇版本,可下載)。'], ['andrade19', '自評之後要有行動與修正的機會,評量才會促進學習。']],
    src: [['zhang18', '想法線(Idea Thread):把各階段提到同一個想法的回答串起來看,對應本平台的「關鍵想法線」。'], ['ss06', '多種來源的想法都是社群知識的一部分。'], ['zhang25', '反思評量用多種資料(討論紀錄、分析圖)幫學生回頭看。']],
    compare: [['andrade19', '自評與前後比較要有明確的評準與修正機會,前後對照是形成性歷程。'], ['panadero16', '學生自評的已知與未知:前後比較時要小心「感覺」不等於能力。'], ['zhang18', '把不同階段的想法線並排,看想法怎麼長大。']],
    scale: [['andrade19', '自評研究回顧:自評要當成形成性歷程(有評準、有回饋、能修正),而不只是分數。'], ['panadero16', '學生自評的限制與未來方向:自評可能受心情與標準不一影響。'], ['panadero17', '自評與自我調整學習、自我效能的整合分析。']],
    log: [['zhang25', '反思紀錄(日期、版本)可用來看學生「怎麼一步步想出來」。'], ['yang26c', 'ASRA 反思的資料來源與歷程(短篇版本,可下載)。'], ['hattie07', '回饋的效果:回饋要具體、指向下一步。']],
    netlab: [['oshima13', '用社會網絡分析看集體知識的進展(可下載)。'], ['oshima12', 'KBDeX:知識建構論述的社會網絡分析工具,本平台的「網絡實驗室」參考這類分析,但不是它的複製。'], ['shaffer16', '網絡分析要小心解讀:連結結構不等於想法的品質。']],
    method: [['ss06', ''], ['zhang25', ''], ['zhang26', ''], ['yang26', ''], ['yang26c', ''], ['chang19', ''], ['chen15', ''], ['resendes15', ''], ['zhang18', ''], ['oshima13', ''], ['oshima12', ''], ['shaffer16', ''], ['andrade19', ''], ['panadero16', ''], ['panadero17', ''], ['verbert13', ''], ['jivet18', ''], ['hattie07', '']]
  };
  var ACC = { pdf: ['⬇ 下載 PDF', '#047857'], free: ['📖 免費閱讀', '#1d4ed8'], doi: ['🔗 DOI(可能需要圖書館權限)', '#64748b'] };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function links(r) {
    var h = [], a = ACC[r.acc] || ACC.doi;
    if (r.url) h.push('<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer" style="color:' + a[1] + ';font-weight:800;text-decoration:underline">' + a[0] + '</a>');
    if (r.doi) h.push('<a href="https://doi.org/' + esc(r.doi) + '" target="_blank" rel="noopener noreferrer" style="color:' + (r.url ? '#64748b' : a[1]) + ';' + (r.url ? '' : 'font-weight:800;') + 'text-decoration:underline">' + (r.url ? 'DOI:' + esc(r.doi) : a[0] + ' ' + esc(r.doi)) + '</a>');
    return h.join('<span style="color:#cbd5e1"> ・ </span>');
  }
  function item(id, why) {
    var r = REFS[id]; if (!r) return '';
    return '<li style="margin:.45rem 0;line-height:1.65"><div style="color:#334155">' + esc(r.cite) + '</div>' + (why ? '<div style="color:#475569;font-size:12px;margin-top:2px"><b>用在這裡:</b>' + esc(why) + '</div>' : '') +
      '<div style="font-size:12px;margin-top:2px">' + links(r) + (r.note ? ' <span style="color:#94a3b8">(' + esc(r.note) + ')</span>' : '') + '</div></li>';
  }
  var NOTE = '文獻說明的是「方法的依據」;平台的關鍵字判斷與門檻(例如「超過 3 天」「80%」)是自訂的,不是文獻的標準。引用前請自己打開原文確認。';
  // 展開式「理論依據與期刊」:key 是分析名稱
  function box(key, title) {
    var list = FOR[key]; if (!list || !list.length) return '';
    var n = list.length, dl = list.filter(function (p) { return REFS[p[0]] && REFS[p[0]].acc === 'pdf'; }).length;
    return '<details class="kb-refs" data-refs="' + esc(key) + '" style="margin-top:.7rem;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;padding:.5rem .8rem"><summary style="cursor:pointer;font-weight:800;color:#4338ca;font-size:13px">📚 ' + esc(title || '理論依據與期刊') + '(' + n + ' 篇' + (dl ? ',其中 ' + dl + ' 篇可直接下載 PDF' : '') + ')</summary>' +
      '<ol style="margin:.4rem 0 0 1.2rem;padding:0;list-style:decimal;font-size:13px">' + list.map(function (p) { return item(p[0], p[1]); }).join('') + '</ol><p style="font-size:11px;color:#94a3b8;margin:.4rem 0 0">' + esc(NOTE) + '</p></details>';
  }
  // 全部文獻一覽(指標說明分頁):每篇列出哪些分析用到
  var NAMES = { funnel: 'ASRA 走到哪一步', types: '大家在做哪些思考', ideas: '想法走多遠了', tips: '教學小建議', attention: '這週建議多關心', students: '學生一覽', effect: '計畫→行動→想法前進', push: '想法推進', src: '學習單資料', compare: '前後對照', scale: '我給自己的評分', log: '反思與計畫紀錄', netlab: '網絡實驗室' };
  function all() {
    var used = {}; Object.keys(FOR).forEach(function (k) { if (k === 'method') return; FOR[k].forEach(function (p) { (used[p[0]] = used[p[0]] || []).push(NAMES[k] || k); }); });
    var ids = Object.keys(REFS);
    var rows = ids.map(function (id) { var u = used[id] || []; return '<li style="margin:.5rem 0;line-height:1.65"><div style="color:#334155">' + esc(REFS[id].cite) + '</div><div style="font-size:12px;margin-top:2px">' + links(REFS[id]) + (REFS[id].note ? ' <span style="color:#94a3b8">(' + esc(REFS[id].note) + ')</span>' : '') + '</div>' + (u.length ? '<div style="font-size:12px;color:#475569;margin-top:2px"><b>用在:</b>' + esc(u.join('、')) + '</div>' : '') + '</li>'; }).join('');
    var c = { pdf: 0, free: 0, doi: 0 }; ids.forEach(function (id) { c[REFS[id].acc]++; });
    return '<section class="rounded-xl bg-white border border-slate-200 p-4 mt-4" id="asra-all-refs"><h4 class="font-black text-slate-800 mb-1">📚 理論依據與期刊(全部 ' + ids.length + ' 篇)</h4><p class="text-xs text-slate-500 mb-2">' + c.pdf + ' 篇可直接下載 PDF、' + c.free + ' 篇免費閱讀、' + c.doi + ' 篇請用 DOI 到圖書館取得。每一篇都是真實文獻,題名、作者、年份、卷期頁碼、DOI 已逐篇核對(2026-11-11)。' + esc(NOTE) + '</p><ol style="margin:0 0 0 1.2rem;padding:0;list-style:decimal;font-size:13px">' + rows + '</ol></section>';
  }
  global.KBAsraRefs = { REFS: REFS, FOR: FOR, box: box, all: all, NAMES: NAMES, links: links };
})(window);
