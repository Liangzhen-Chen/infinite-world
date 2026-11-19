# 块 6 补值卡 A 回报（李白 11-19 18:1x ①③⑥）

写：Claude Sonnet 5.5 中档（会话内子代理）。工作树 F:/dnd-wt/ds-b6fa，分支 ds/b6-fixA。

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二 :510（rules.capacity 阈值表形状）、卷二 :47、§1.9 第 3 条 :302（casefold 取 CaseFolding C+S、冻结带 sha256）、:642（kernelApi codepointTables）、:1065（casefold.json 只由 kernel 读）、卷二 :2265（只留新屏蔽文件）；卷四 :472（以 0 为无）、:573、:1051–:1053（例值）；卷六 :112–:113、:243（单位）；P-3 推导规则 docs/审查/P-3-推导规则.md；裁定原文 docs/审查/李白裁定-1117.md 末节"18:1x" ①③⑥ |
| 2 | 没有按 id/名字/场景写特例 | 是 | 阈值三项同值按量程等分点；bps 改名按"资源 unit 不得与别义单位同码"整类写入卷六；casefold 是整张 unicode 表，matcher 不点名字符；旧屏蔽表 7 个读者统一改读新文件的 entries |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/kernel/output-gate.test.mjs：折叠表传 null、空 Map、undefined 都抛 E-I18N-BLOCKLIST；casefold.json 缺失、空 map、单元素、三元素、重复键、负码点、超上界、小数、非数字条目都抛；capacity 的"既没值又没登记 unbuilt 即抛"原测试保留 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 能力阈值期望按等分点 1/2、2/3、1/3 与卷四例值手算；casefold 期望是 A→a、ς→σ、ſ→s 的标准码点；不读条目总数（72 是原测试的屏蔽词表条目数，该测试本来就在） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | S6-14 检测器代码未动；item.json coverBps 改回 bps 后真实数据上 S6-14 仍零报（tests/accept/state-pattern.test.mjs 第一条 + pre_commit） |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | diff 共 31 个文件、约 4050 行增 60 行删（其中 3000 行是卷六勘误前快照整份、1533 行是 casefold 表）；额外：server-plugin/kernel/files.json、world/ontology/state-owners.json（登记新增的 kernel 文件与 kernelApi codepointTables，卷二 :642 本就规定），世界 capacity/registry 的说明字 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1003、pass 1003、fail 0；pre_commit verdict pass |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 试玩世界里"醒没醒、能力档"不再被"未知"挡住，物品护具覆盖率单位回到比率 bps，显示闸遇到英文不再整段遮蔽；全按规则层或整类做，没有写死 |

## 做了什么

① 能力阈值。`world/rules/tables/capacity.json` 写 awakeMin 0.5、full 与 limited 三项同值 0.6667 / 0.3333，unbuilt 清空；basis 写推导（量程 [0,1] 等分点，卷四 :1051–:1053、:573 的例值与之相容：熟睡 0.4 不醒、受伤 0.75 仍醒；失一手 0.7 仍 full），标"暂定·待试玩标定"，出处 P-3 的做法。`registry.json` 说明字同步。`tests/kernel/capacity.test.mjs` 原"阈值未建"那条改成真实暂定值下的行为（手算：1−0.6=0.4 不醒、1−0.5=0.5 取等醒；一腿 moving 0.5 → limited；双腿 0 → none）；"没登记即抛、full 只登一半仍未知"两条保留。

③ bps 一义。资源单位改名 `asset_share_bp`（新登记进 `_units.json`，dimension asset_share、si 1），`economy/resources.json` 两行同改；`item.json` guard.coverBps 单位改回 bps（说明字同步）；`ledger.test.mjs` 原样断言同改。卷六勘误 1119k9：§2.1 unit 行补"资源 unit 不得取已作别义的单位代号"整类规则、§2.6 单位登记改为 asset_share_bp 并注明 bps 归卷二 §1.4；附录加行；勘误前快照 版本快照/卷六-v10-勘误前-1119k9.md（与 origin/master 正文同内容，cmp 一致），现行快照 版本快照/卷六-v10.md 已覆盖并与正文 cmp 一致；不升版本。门禁 S6-14：检测器本来就是"字段单位的代号等于资源种类行 unit 的代号才计数"，不按字段名猜，误报是数据撞名而非检测器猜测；所以检测器代码不改，补用例 state_pattern-13（比率单位 bps，不报）与 -14（资源单位 asset_share_bp 必报、同路径 bps 不报），经 tools/accept/register.mjs 登记，判据 rev 24→25 带修订记录。

⑥(a) casefold。主会话下载的 F:/dnd-tmp/unicode/CaseFolding.txt 由 F:/dnd-tmp/gen-casefold.mjs 生成 `world/i18n/casefold.json`（位置与"C+S、一对一码点、冻结带 sha256"照卷二 :47、§1.9 第 3 条；1533 条）；出处 URL、版本 18.0.0、取用日、源文件 sha256（脚本重算与主会话给的一致）、map 的 sha256 都写在文件里。新建 `server-plugin/kernel/load/codepoint-tables.mjs`（卷二 :642 的 kernelApi codepointTables，casefold.json 只由 kernel 读，:1065），登记进 kernel/files.json 与 state-owners.json kernelApi。`gate/matcher.mjs` 删去"折叠表未建就整段遮蔽"的退路与 UNKNOWN_CATEGORY，折叠表必给（null、空表、非 Map 即抛）；`gate/load-blocklist.mjs` 同。NFC 仍只在 matcher 一处做。测试：大写英文不再整段遮蔽、屏蔽词的大小写变体被遮、ς→σ、ſ→s、汉字不变、必给与坏表拒收、sha 与版本出处核对。

⑥(b) 旧屏蔽表。新文件含旧表全集：旧 names 53 + realPeople 19 = 72 条，与 world/i18n/blocklist.zh.json 的 72 条逐条核对（脚本 F:/dnd-tmp/cmp-blocklist.mjs，缺 0、多 0，类别也对）。读者改指：AGENTS.md:55；world/design/a3-world-approval.mjs、a3-owner2-w-content.mjs、a3-content-approval-content.mjs、w1-baishi-market-depth.mjs、w1-baishi-dock-depth.mjs、w1-baishi-craft-depth.mjs 改读 entries 的 word（最小适配）。删 world/meta/blocklist.json。

## 自定裁定

- 能力阈值取量程等分点（1/2、2/3、1/3），三项同值：卷二 :510 只给键与形状、卷四例值无阈值，P-3 的做法是整类一个规则、标设定；例值与之相容（卷四 :573、:1051–:1053）。
- 资源单位新代号 `asset_share_bp`、dimension `asset_share`：卷六 :112、:371 写"最小记账单位为基点、一处实例一万基点"，量纲不是比率；不与 _units.json 任一已登记代号撞名。
- casefold 取 C+S，不取 F（一对多）与 T：卷二 §1.9 第 3 条原句"C 与 S 状态条目、一对一码点映射"。"完整表"指 C+S 全部条目（含 ς、ſ），不是含 F 的完整折叠。
- casefold.json 文件格式（卷二只说"冻结带 sha256"，没写格式）：{version, kind, status, source, unicodeVersion, fetchedOn, sourceSha256, tableSha256, note, map:[[从,到]…]}，码点用十进制整数。
- kernel 加载器不核 tableSha256：kernel 没有自己的摘要能力（DigestCap 由装配注入），且 node:crypto 不在 kernel 的允许清单；摘要由测试核，装配接上 DigestCap 后可再加一道。
- 门禁 S6-14 的检测器不改：见上，误报根因是数据撞名。

## 偏离指令的地方

- 卡文写"门禁 S6-14 改为按单位登记表计数"：检测器本来就按单位代号计数，且现有 9 个用例夹具里的资源单位（copper）并不在 _units.json 里，若强加"须是已登记单位"会推翻它们；真实数据上资源 unit 本就由账本加载校验（kernel/ledger.mjs E-DIM-UNIT-UNKNOWN）核已登记。所以只补用例、不改检测器。
- world/drafts/w1/yp-depth-rest/reopen/publication-source-files.json:41 没改：它是一次旧发布的源文件快照（内嵌 meta/blocklist.json 全文和 sha256），没有代码读它（只有 docs 提到），改它会使快照与记录的校验值不符。建议整份归档或退役。
- 没删旧设计工具。下列六个只读旧屏蔽表做"原创屏蔽"断言，已改指新文件；是否仍有人用我没有查证（本机没有调用它们的测试或脚本入口），建议退役挂 6-17 收尾：world/design/a3-world-approval.mjs、a3-owner2-w-content.mjs、a3-content-approval-content.mjs、w1-baishi-market-depth.mjs、w1-baishi-dock-depth.mjs、w1-baishi-craft-depth.mjs。
- 额外改了 kernel/files.json 与 state-owners.json（新增 kernel 文件与 kernelApi 登记；没这两处门禁会报 E-FILE-UNASSIGNED、E-GLOBAL-UNLISTED），登记器之外的人工登记，请主会话核。

## 未解决

- 装配（谁把 codepointTables 的折叠表交给 loadBlocklist）还没有：生产路径里目前没人调 loadBlocklist，卷二 §2.9 装配卡负责。
- 阈值与 lostBelow 一样是暂定值，待试玩标定。
- 卷文里没有"折叠表未建、整段遮蔽"的说法（grep casefold_unbuilt、折叠表未建 在 docs/统一底层设计 无命中），那是 6-17 的自定退路，已删。

## 验证

`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1003、pass 1003、fail 0。`node tools/accept/run.mjs pre_commit`：verdict pass（items fail 3 条，同 origin/master 基线：A12-4.5、S12-2、S12-3）。先前（1001 个）基线加本卡新增 2 个测试。
