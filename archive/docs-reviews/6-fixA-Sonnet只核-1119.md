# 块 6 补值卡 A 只核（Sonnet 5.5 中档，只读；写者另一会话；分支 ds/b6-fixA，HEAD a1352cdc3；11-19）

结论：可封。无必须改项；有两条建议（不挡封）。

依据：李白 18:1x 原文（docs/审查/李白裁定-1117.md:1347–1370 附）、docs/审查/P-3-推导规则.md、卷二 §1.9 第 3 条 :302、:47、:642、:1065、:2269、卷六 :112–:113、:243、卷四 :573、:1051–:1053、回报 docs/卡回报/ds-b6-fixA.md。

## 1 阈值（rules.capacity）
- world/rules/tables/capacity.json 一处登记 awakeMin 0.5、full 三项 0.6667、limited 三项 0.3333，grade designed，basis 以"暂定·待试玩标定"起头，unbuilt 清空；registry.json 说明字同步。同值、整类一个规则，没有按维度单设数。
- 与卷四例值相容（手核）：熟睡 consciousness 0.4 < 0.5 不醒（:1051）；受伤 0.75、失一手 0.7、半损腿 0.75（:573、:1053）仍 ≥ 0.6667 为 full；双手丧失 0.4 落 limited。测试期望值是手算字面量（capacity.test.mjs:132–140，含 0.5 取等边界、一腿 0.5→limited、双腿 0→none）。
- 对 P-3：P-3 没有一条叫"量程等分点"。P-3 的规则是 T1 取已有值中位数、T2 单一常量、T4 例值中位数（P-3 :19–:22）；"等分点"是写者新取的同类做法（整类一个规则、标暂定、锚卷文例值）。李白原话是"从已有维度量程推暂定值"，等分点即从 fraction 域 [0,1] 推，口径相符。**建议（不挡）**：basis 里"依 P-3 的做法"改为"仿 P3-T2（整类单一常量、标暂定）"，别让读者去 P-3 找不存在的条目。
- 6-5 不等：unbuilt 为空，awake/capacity 不再返回 unbuilt 未知；testing 与 action-capacity 读法未改。

## 2 bps 一义
- 卷六勘误 1119k9：§2.1 unit 行与 §2.6 改写，体例与 1118k* 行一致（出处、改稿模型、不升版本、改前快照 版本快照/卷六-v10-勘误前-1119k9.md、改后覆盖 卷六-v10.md；快照 diff 即整份）。
- `asset_share_bp`（dimension asset_share、si 1）登进 _units.json；resources.json 两行 unit 改；ledger.test.mjs 断言同步。全库 grep：资源种类行再无 `bps`；item.json guard.coverBps 改回 bps（与 species.json 的比率用法一致）；其余 `bps` 只剩比率字段与三个账本测试里自造的 `row()` 夹具。卷六 :112/:243 同路径改，合体例。
- **S6-14 检测器未改，我亲读 tools/accept/detectors/state_pattern.mjs:1–80**：它从 registry 的 economyResources 行取表，把资源种类行 `unit` 收成集合，再按"字段单位 ∈ 该集合"计数；不按字段名、不按 "bps" 字符串。这就是"按单位登记表（资源种类表的 unit）计数"，李白原句已满足。真正的误报根因是数据撞名（bps 同时是资源 unit 与比率 unit），已由改名解决。
- 写者称"硬要求资源单位已登记会推翻 copper 夹具"：_units.json 无 copper，夹具靠最小文件造的资源行；检测器要求登记就得给每个夹具补 _units.json，属为测试造设施。真实数据下资源 unit 已登记由 kernel/ledger.mjs:201（E-DIM-UNIT-UNKNOWN）加载时核。接受：不改检测器是对的。
- 新用例 state_pattern-13（bps 字段、资源 unit asset_share_bp，必过）、-14（asset_share_bp 字段必报 E-DIM-STRUCT-FIELD，同路径 bps 不报）登 cases.json、criteria.json rev 25；run 通过，是真测到（-14 同时含两个字段，只报一个，能区分）。

## 3 casefold
- 取 C+S，对卷二 :302 原句"CaseFolding.txt 的 C 与 S 状态条目、一对一码点映射"；F 一对多不取，正确。回报"完整表含 ς、ſ"指 C+S 全条目，ς(962)→σ、ſ(383)→s 本就是 C/S 条目，测试已断言。
- 条数：F:/dnd-tmp/unicode/CaseFolding.txt 里 `; C;` 1501 条 + `; S;` 32 条 = 1533，casefold.json 的 map 1533 行，吻合。头部有出处 URL、Unicode 18.0.0、取用日、源 sha256、map sha256；测试核 tableSha256 与 JSON.stringify(map) 相符。
- 位置：server-plugin/kernel/load/codepoint-tables.mjs，卷二 :642 与 :1073（kernel 读 casefold.json）一致；kernel/files.json 与 state-owners.json kernelApi 已登记（callers 与卷二 :642 逐字相同）。
- matcher.mjs：删 UNKNOWN_CATEGORY、unfoldable 与整段遮蔽退路；installBlocklist 与 loadBlocklist 对 null、空 Map、非 Map 一律抛 E-I18N-BLOCKLIST；测试覆盖 null、空 Map、undefined、八种坏条目、缺文件。大写英文放行、变体被遮、ς、ſ、汉字不变均有断言，期望是手填码点字面量。NFC 仍只在 matcher 一处。
- 加载器不核 tableSha256：kernel 无摘要能力（DigestCap 由装配注入）、node:crypto 不在 kernel 允许清单，理由成立；摘要由测试核，装配后可加一道。接受，已写进回报"未解决"。
- 注意（非本卡）：生产路径尚无人调 loadBlocklist，装配卡负责，回报已列。

## 4 旧屏蔽表
- 旧 names 53 + realPeople 19 = 72；我把 origin/master 的 world/meta/blocklist.json 与 world/i18n/blocklist.zh.json 的词逐条目视核对（含类别分档），同集 72 条。
- 六个 world/design 读者改读 `entries.map(e=>e.word)`，最小适配；AGENTS.md:55 只改路径；world/meta/blocklist.json 已删；全库 grep `meta/blocklist` 在代码里只剩 load-blocklist.mjs 的注释（说明迁移）与文档/历史引用。
- world/drafts/w1/yp-depth-rest/reopen/publication-source-files.json:41 未改：它是旧发布的快照，内嵌旧表全文与校验值；全库只有 docs 提到它，没有代码读；改了反而使校验值不符。理由成立。
- 卷二十九 :98、:1003 仍写旧路径是"迁出"的历史条目（M29-22 move_out），不必改。

## 5 kernel/files.json、state-owners.json
各只增一行，对应新 kernel 文件与卷二 :642 已规定的 kernelApi 项；没这两处门禁报 E-FILE-UNASSIGNED、E-GLOBAL-UNLISTED。必要且最小。

## 6 亲跑
- `node tools/accept/run.mjs pre_commit`：verdict pass（items fail 3，同基线 A12-4.5、S12-2、S12-3）。
- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1003、pass 1003、fail 0。

## 建议（不挡封）
1. capacity.json 三条 basis 里"依 P-3 的做法"改指 P3-T2，免误导。
2. 三个账本测试夹具仍用 unit 'bps' 当资源单位（ledger-capped、ledger-invariants、ledger-post 的 row()）；它们不进 S6-14，可留，但顺手改 asset_share_bp 更一致，留 6-17 收尾即可。
