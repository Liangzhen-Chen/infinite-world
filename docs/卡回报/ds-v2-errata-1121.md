# 卡回报：ds-v2-errata-1121（卷二第十八版封卷后勘误，勘误号 1121k1）

写者：DeepSeek v4-pro。工作区 F:/dnd-wt/ds-v2e，分支 ds/v2-errata-1121。勘误前快照 `版本快照/卷二-v18-勘误前-1121k1.md`（blob f27bb74b7d88bbc03cd6eca632fc1f32bfaac8b7 与 origin/master 卷二正文逐字节一致，`git hash-object` 核对），版本号不升。

## 一、自查表（本卡：追加项 gridKey，1121k1 ④）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 报批原句 docs/审查/合批勘误1120k3-5-Opus只核.md :146；落点卷二 :253-254（§1.5 两 struct）、:256、:710-711（pathTypes/keyKinds 示例）、:790（收录索引）、:851（§2.7 keyKinds）、:1582（E-PATH-KEYKINDS）、:3377（附录 1121k1） |
| 2 | 没有按 id/名字/场景写特例 | 是 | gridKey 是 (c) 整类新代号，只限定"cells.*.*.* 与 fieldCells.*.*.* 前三段"整类；`struct:gridCellDiff`、`struct:fieldCellMap` 照卷五/卷二十定义登记，无 id/名字/场景分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | gridKey 别处出现即加载报 E-PATH-KEYKINDS（沿用现有码，不新造），无豁免值；未新增限额/校验 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 本卡只改设计卷文，无新增测试 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无代码改动，未改常量、未降计数 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 只改卷二正文与本回报；卷二正文 diff 共 16 行（9 增 7 删） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node tools/accept/run.mjs pre_commit` verdict=pass（fail 3 均基线：vol12.A12-4.5、vol12.S12-2、vol12.S12-3）；`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` pass 1282、fail 0 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 落定格键段 keyKinds 类型（gridKey）与 fieldCells 命名 struct，解除 G6/G7 格写码"未声明路径一律拒写"的阻塞；派生优先、无写死无特例 |

## 二、两项落点

1. 骰值键按分布取值：卷二 §1.10（正文 :334 新增一段），入口 `drawByKey(worldSeed, streamCode, subjectId, worldTime, drawSiteCode, distribution) → value`。
2. 六个无名加载码：卷二 §4.3 错误码表（正文 :1603 新增一行）。

## 三、六个码名与理由（已定）

已定：六码取 E-GRID- 前缀，理由——同类的格世界错误码已有 E-GRID-OFFSCREEN-WRITE、E-GRID-LAND-UNKNOWN（卷二十七 :1024）、E-GRID-STRUCTURE-CELL（卷五 :505），六码同为卷五地点格世界的加载校验报出，沿用 E-GRID- 前缀保持一致；其余单词按错误性质取名。六码：

1. E-GRID-FOOTPRINT-OUTSIDE-PARENT——足迹不在父足迹内（层根除外）
2. E-GRID-SIBLING-OVERLAP——兄弟足迹相交（区域按区格，建筑、房间、体积按细格）
3. E-GRID-SEED-SAME-CELL——同父两种子同区格
4. E-GRID-WATERWAY-NO-CHANNEL——水路栅格化找不到航道
5. E-GRID-VOLUME-TOP-EXPOSED——体积顶面不在地表以下
6. E-GRID-CELL-NO-TERRAIN——区格无地形类可取

## 四、验收末行

- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`（fail 3 均基线：vol12.A12-4.5、vol12.S12-2、vol12.S12-3）
- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `pass 1282`、`fail 0`

## 五、追加项 gridKey（1121k1 ④，李白 11-21 裁定）

依据报批原句（`docs/审查/合批勘误1120k3-5-Opus只核.md` :146）。改动行（卷二正文，均已随本次提交）：

- §1.5 命名 struct 表（:253、:254）：新增 `struct:gridCellDiff`（格差分值 `{material, fixture, mark, sinceMinute}`）、`struct:fieldCellMap`（`map<ref vocab field, struct:stockAnchor>`，`<场>` 词表代号段收进命名 struct）。
- §1.5"词表代号段走命名 struct"列举句（:256）：(c) 五个 → 六个，加 `gridKey`，注李白 11-21 裁定。
- §2.7 `keyKinds` 定义（:851）：(c) 五个 → 六个，加 `gridKey`（格坐标段：格空间号 `w`、里块号、格键；只用于 `cells.*.*.*`、`fieldCells.*.*.*` 前三段；别处出现即报 E-PATH-KEYKINDS；加载期按文法核、运行期 storage 写入处再核）；运行期段整类规则与 E-PATH-KEYKINDS 判语同步加 `gridKey`。
- §2.7 JSON 示例（:710 pathTypes、:711 keyKinds）：补 `cells.*.*.*`（`struct:gridCellDiff`）、`fieldCells.*.*.*`（`struct:fieldCellMap`）两行；keyKinds 两行均 `["gridKey","gridKey","gridKey"]`；示例注释 (c) 三种之一 → 六种之一。
- §2.7 收录索引 fieldCells 行（:790）：`fieldCells.<w>.<里块>.<格键>.<场>` → `fieldCells.<w>.<里块>.<格键>`，值改 `struct:fieldCellMap`。
- §4.3 E-PATH-KEYKINDS 行（:1582）：判语 (c) 项不是 `event`、`dimKey`、`identityKey`、`handle`、`seedKey`、`gridKey` 之一；运行期段补 `gridKey`。
- 附录 1121k1 行（:3377）：改动描述追加 ④（卡文写"补③"，但该行 ③ 已被"附录 D.1 卷十 C10-14 行"占用，故追加为 ④，内容照卡文）。

diff：卷二正文 9 增 7 删（16 行），另本回报文件。

验收末行：
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`（fail 3 均基线：vol12.A12-4.5、vol12.S12-2、vol12.S12-3）
- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `pass 1282`、`fail 0`

## 六、修改轮（依 `docs/审查/卷二勘误1121k1-Opus只核.md`，M1–M5；写者 DeepSeek v4-pro，分支 ds/v2-errata-1121）

### 自查表（卡头第三节八项）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 只核原文 M1–M5（docs/审查/卷二勘误1121k1-Opus只核.md）；李白原话 docs/审查/李白裁定-1117.md :885；报批原句 docs/审查/合批勘误1120k3-5-Opus只核.md :146；落点卷二 :253、:336、:606、:852、:1583、:2949、:3378 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 五处都是串形/整类/引用还原与登记补全，无 id、名字、场景分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | gridKey 串形写明负号带 `-`、零写 `0`、不补前导零、向负无穷取整；核"格键所在里块必须等于路径里的里块号，否则 E-PATH-KEYKINDS"无豁免值；未新增限额/校验 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 本卡只改设计卷文，无新增测试 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无代码改动；D.1 行还原 origin/master 原文（git show 对照），非降计数 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 只改卷二正文与本回报；卷二正文 diff 共 13 行（7 增 6 删） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`（fail 3 均基线：vol12.A12-4.5、vol12.S12-2、vol12.S12-3）；`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → pass 1282、fail 0 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 骰值键与 gridKey 串形落定、kernelApi 闭集补 drawByKey，给 G6/G7 格写码确定性依据；派生优先、无写死无特例 |

### M1–M5 改了哪行（卷二正文，修改后行号）

- M1：:606 §2.7 kernelApi 增 `{"export": "kernel/sample.mjs#drawByKey", "callers": ["rules"], "acceptsState": false}`（与 `sample` 同文件，不读 state 故 acceptsState false）。
- M2：:336 骰值键串形照 §1.10 种子键写法写明 `sha256(utf8(worldSeed + "|" + streamCode + "|" + subjectId + "|" + worldTime 的十进制 + "|" + drawSiteCode))`，删"按 R27-8.5 文法"虚引，注"键五段与种子键四部件数不同，两种键不会撞"。
- M3：:852 运行期段整类规则还原李白原话"handle、seedKey 及以后同类"（删 gridKey），引语外另写"封卷后勘误 1121k1，李白 11-21 裁定加 `gridKey`，落在'及以后同类'里"。
- M4：:852 gridKey 定义写入串形（主会话 11-21 已定：w 段十进制整数（负号带 `-`、零写 `0`、不补前导零）；里块号 `<cx>:<cy>`，cx = floor(x ÷ (chunkRegionCells × regionCellM ÷ cellM))，cy 同理用 y，向负无穷取整；格键 `<x>:<y>:<z>` 即该格 struct:pos 的 x、y、z；加载与写入核"格键所在里块必须等于路径里的里块号，否则 E-PATH-KEYKINDS"），删"依卷五 §4.1 规则 15 格键文法"误引，改引裁定原文"keyKinds (c) 加第六类 gridKey（w、里块、格键），只用于 cells/fieldCells 前三段；<场> 段照 1118k5 收进命名 struct"。
- M5：:2949 附录 D.1 卷十 C10-14 行"⑤ 骰值键按分布对象取值的内核包装"还原 origin/master 原文"是新函数，机制未批"（历史修订不回改）；已批状态只记在 :3378 附录 1121k1 行（③ 改为"D.1 不回改，以本行为准"）。

### 建议七条取舍

- S1（返回标度）采纳：:336 补"返回本节 4 位定点值，clamp 只取分布对象自带 `clamp`，调用方写回目标维度时（如卷十 R10-2.6 写 `f.target`）再按该维度 `precision` 截断"。
- S2（ref 展开报错）采纳：:336 改"`ref` 展开后必须是上述五种之一，否则报 E-DIM-SAMPLE-PARAM"。
- S3（键成分恰为五段）采纳：:336 补"（键成分恰为五段，`distribution` 不是键成分）"。
- S4（规则 3 另两种运行期情形）不采纳：只核明说"不改也行"，留卷五定。
- S5（违者清单/§4.3 补 gridKey 别处出现）采纳：:852 违者清单与 :1583 E-PATH-KEYKINDS 判语都补"`gridKey` 用在 `cells.*.*.*` 与 `fieldCells.*.*.*` 前三段之外"。
- S6（sinceMinute 释义与裁定归属）采纳：:253 struct:gridCellDiff 改"`sinceMinute` 含义以卷五为准""随 gridKey 裁定，pathTypes 登记所需"。
- S7（卷二十牵连）采纳：:3378 附录 1121k1 行补"牵连：卷二十 `fields.*.*`、`fieldCells.*.*.*` 的 `<场>` 段登记写法须卷二十随勘误跟改（1118k5 同批改卷六先例，卷二:3206）"。

### 两条验收末行

- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`（fail 3 均基线：vol12.A12-4.5、vol12.S12-2、vol12.S12-3）
- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `pass 1282`、`fail 0`

### diff

卷二正文 7 增 6 删（13 行），另本回报文件。
