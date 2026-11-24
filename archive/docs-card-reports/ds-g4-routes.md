# 格子迁移 G4《路网栅格化四项规则常数登记》卡回报

写：DeepSeek flash（照卡文登记数据，不写内核代码）。分支 ds/g4-routes，未提交（卡文：由主会话提交）。照卷五 §2.2 :244、§2.3 :271、:278、§4.1 规则 5 :471、§4.1.4 :523、§4.10.1 :1059、§4.10.3 规则 5 :1071、:1058。

## 交卷前自查（卡头第三节）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | grid.json 两行 basis 引卷五 §2.3 :271、§4.1 规则 5 :471、§4.1.4 :523；terrain-modifiers.json source 引 §4.10.1 :1059、§4.10.3 规则 5 :1071；_vocab.json 十条 basis 引 §2.2 :244；registry terrainModifiers volume 引 §2.3 :278、§4.10.1 :1059 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 只登数据：grid.json 两行、terrain-modifiers.json 一行、_vocab.json 按 terrain 族十条代号整族加字段、registry 两处登记；没有 .mjs 代码，也没有按 id/名字的分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 本卡不写校验代码，只声明取值域，由加载器统一核（tests/kernel/rules.test.mjs"表值按登记的类型与取值域查"用例通过，越域/类型不合报 E-DIM-DOMAIN-RANGE）；longCostCap 登 [1,null]，0 与负数被拒，写入 1000000 在域内；roadPaceFactor 登 [0,null]（卡文指定），0.8 在域内；slopeCurve"严格大于 0"与 roadPaceFactor ≤ 各地形 paceFactor 两项检查按卡文归主会话内核卡，本卡未写也未声称已守 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 本卡未新增测试（卡文未要求），验收用三组既有测试且未改一行；本卡改动均为登记与数据，不含断言 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 只加数据行与登记项，没有改任何 .mjs、没有改名或造假常量 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 恰四个文件：world/rules/registry.json（+17 −4）、world/rules/tables/grid.json（+10）、world/ontology/dimensions/_vocab.json（+10 −10）、新建 world/rules/tables/terrain-modifiers.json（12 行），diff 共 63 行（+49 −14） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 三张验收命令：rules 12 pass / 0 fail；grid+footprint 47 pass / 0 fail；place-world 13 pass / 0 fail。另跑全量 node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs：1 fail，系主会话并行新增 route-grid.mjs、route-edges.mjs 未登 files.json 报 E-FILE-UNASSIGNED，与本卡四文件无关（详见"未解决"） |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | G4 路网栅格化要读的四项规则常数（paceFactor、roadPaceFactor、longCostCap、slopeCurve）登记齐、加载零 error，寻路卡可直接读；数值全部标"暂定·待试玩标定"，无写死、特例、假数据 |

## 改了哪些文件

- world/ontology/dimensions/_vocab.json：terrain 族十条（cave 2、coast 1.2、desert 1.8、forest 1.5、hill 1.6、lake 4、marsh 2.5、mountain 3、plain 1、river 4）在 reliefRough 之后、basis 之前加数字字段 paceFactor；每条 basis 末尾追加卡文指定的一句。
- world/rules/tables/grid.json：rows 末尾追加 roadPaceFactor（0.8）、longCostCap（1000000）两行，basis 照卡文。
- world/rules/registry.json：grid 条目 type/domain/packOverridable 加 roadPaceFactor、longCostCap；volume 删去已登记的两键、追加 G4 读者说明。grid 之后新增 terrainModifiers 条目（file tables/terrain-modifiers.json，structure keys，slopeCurve 为 curve，domain {}，multiSourceMerge own_key_only，packOverridable slopeCurve false）。
- world/rules/tables/terrain-modifiers.json（新建）：一行 slopeCurve = [[0,1],[0.1,1.25],[0.3,2],[0.6,4],[1,8]]，file 指 server-plugin/kernel/route-edges.mjs，grade designed，source/basis 照卡文。

## 验收（命令与末行）

- `node --test tests/kernel/rules.test.mjs` → ℹ tests 12 / ℹ pass 12 / ℹ fail 0
- `node --test tests/kernel/grid.test.mjs tests/kernel/footprint.test.mjs` → ℹ tests 47 / ℹ pass 47 / ℹ fail 0
- `node --test tests/kernel/place-world.test.mjs` → ℹ tests 13 / ℹ pass 13 / ℹ fail 0
- `git diff --stat`（本卡三个已跟踪文件）：_vocab.json 20、registry.json 21、grid.json 10；新建 terrain-modifiers.json 12 行

## 偏离指令的地方

- 无。未提交；未改测试、未改内核；工作区里的 server-plugin/kernel/footprint.mjs、place.mjs、route-grid.mjs、route-edges.mjs 是主会话并行 G4 内核卡所改/新建，不是本卡改动，我没有动它们。

## 未解决的问题

- 全量 `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 的唯一失败：tests/accept/detectors.test.mjs"kernel/files.json 与磁盘上的 kernel 组文件一致"，报 route-edges.mjs、route-grid.mjs 的 E-FILE-UNASSIGNED。这两个文件由主会话并发新建，登记 files.json 属其内核卡收尾，不在本卡四文件内。
- slopeCurve 的"严格大于 0"校验（卡文说在 place.mjs checkPlaceTable）与道路步进系数不大于各地形 paceFactor 的校验，按卡文由主会话内核卡写；本卡只登记数据。terrain 条目的 paceFactor 目前没有加载器读取或校验（place.mjs 现只要求 reliefM、reliefRough），待 G4 读者接上后由测试守。
