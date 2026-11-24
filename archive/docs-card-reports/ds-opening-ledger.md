# 材料物性补齐（mat_soil / mat_elm / mat_straw）回报

## 自查表
| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷十九 :408 规则 10（六项物性须已知）；P-3 第三节（设定值记 designed、citation null、basis 带"暂定·待试玩调"）。逐项值与 basis 见下"改动明细" |
| 2 | 没有按 id/名字/场景写特例 | 是 | 纯数据行补值，未改代码；三行按同一键名规则（数值用维度名、map 逐键、struct 逐字段）填 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 本卡不新增限额/校验；新值均落在 material.json 维度 domain 内（corrosionRate 0–1、soundAttenuation 0–20、thermalConductivity 0.01–500、strength 0–100） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 本卡不新增测试（纯数据卡，卡文指定不跑测试） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 只新增键与 cellGrades 格；`git diff --numstat` 删除数为 0，既有值一个字未动 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | `git diff --numstat -- world/ontology/dimensions/material.json` → `168 0`，共 168 行新增、0 删除；另按卡尾新增本回报文件 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 卡文为纯数据卡、指定不跑测试（"`node --test tests/kernel/item-world.test.mjs` 不适用，不跑"）；JSON 语法校验 `node F:/dnd-tmp/check-material-json.mjs world/ontology/dimensions/material.json` → `ok`；提交关口 `node tools/accept/commit-hook.mjs` → `pre_commit rejected`，原因见"提交状态"（与本卡文件无关）；未写"通过" |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 开局建筑所用的土、榆、秸秆三料补齐 corrosionRate、隔声、导热与六向强度，建筑用料与围护物性不再缺这三行的格，离可玩开局更近；未走捷径、未写死、未改规则引擎 |

## 改动明细（只动 material.json 三行）
- mat_soil：新增 `corrosionRate: 0.0008`、`soundAttenuation: 2`、`thermalConductivity: {solid: 0.6}`、`strength` 六键（弯 5、压 20、撞 5、剪 8、拉 3、扭 4）；cellGrades 对应加 1 + 1 + 1 + 6 格。
- mat_elm：新增 `soundAttenuation: 1`、`thermalConductivity: {solid: 0.17}`、`strength` 六键（弯 45、压 40、撞 45、剪 25、拉 50、扭 30）；已有 `corrosionRate` 未动。
- mat_straw：新增 `corrosionRate: 0.003`、`soundAttenuation: 0.3`、`thermalConductivity: {solid: 0.09}`、`strength` 六键（弯 5、压 3、撞 3、剪 3、拉 10、扭 3）。
- 所有新键按行内字母序插入，cellGrades 内按字母序插入；map 逐键、struct 只写 `solid`（gas、liquid 不写）；每格 `{grade: "designed", citation: null, basis: "设：…；暂定·待试玩调"}`。

## 偏差
- 无。除本回报文件外只改 material.json，未运行测试。

## 提交状态（关口未过，待主会话处理）
- `node tools/accept/commit-hook.mjs` → `E-ACC-CARD-SELFCHECK` 已过；`pre_commit rejected`。
- 唯一上升分量：`c_text_kernel_3`（baseline 0 → 2），两行命中 `server-plugin/kernel/blueprint.mjs|checkBlueprintForms|literal_non_ascii` 与 `server-plugin/kernel/gen/envelope.mjs|genEnvelope|literal_non_ascii`。两文件均为 card C 的代码，不是本卡文件；`typed_pos` 只扫代码，不扫描 `world/ontology/dimensions/material.json`，本卡数据不产生该分量。
- 另有 vol12 三项既有基线（A12-4.5、S12-2、S12-3）照旧不过。未用 `--no-verify`，未改基线，未动他人文件；改动留在工作区未提交。

