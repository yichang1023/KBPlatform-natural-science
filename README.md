# KBPlatform-natural-science

知識建構論壇、老師分析、學生分析(知識羅盤)與設定中心。資料與帳號存在 Firebase 專案 kbplatform-natural-science 的 Firestore(集合 `kb_v2`、`kb_v2_audit`),網頁由 Vercel 提供。

| 頁面 | 說明 |
|---|---|
| index.html | 首頁與登入分流(老師/管理者、學生、訪客) |
| Knowledge Building Forum.html | 知識論壇 |
| ANALYTICS-teacher.html | 老師分析(僅老師與管理者) |
| ANALYTICS-student.html | 知識羅盤(學生只能看自己) |
| setup.html | 設定中心(僅老師與管理者) |

核心檔案:`kb-core.js`(帳號、權限、資料、備份)、`kb-cloud.js`(雲端同步)、`kb-ui.js`(共用介面)、`kb-xlsx.js`(Excel 讀寫)、`kb-config.js`(雲端設定)。
Firestore 規則請見 `firestore.rules`。
