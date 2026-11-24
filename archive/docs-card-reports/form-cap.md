# 卡回报：建筑面积加倍上限改为形制登记上限（李白 11-22 裁定，事件 3ce50e60，取甲）

执行：claude-sonnet-5-5 中档（单会话完成，未委派 DeepSeek）。分支 ds/form-cap，基于 master c1d870cdb。

## 自查表（派活卡头规矩第三节）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 裁定原文五条照做；卷十 :684–:689（R10-7.12，上限原为 4096）、卷十九 :116（planCells 域 [1, 4096]）、:203（bform 字段）；设定出处 docs/世界设计/13-建筑、聚落形态与服饰器物.md:82（courtyard_house footprintM2 [120, 300]，river_house 原型见 :170） |
| 2 | 没有按 id/名字/场景写特例 | 是 | siteform 只读形制条目 `planSideMaxCells`；识别上限错误靠字段结构（`Object.hasOwn(e.fields, 'max_cells')`）不靠代号；blueprint.mjs 无形制代号 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | `blueprint.test.mjs` 与 `gen-siteform.test.mjs`：缺、null、0、负数、8.5、'24'、NaN 一律拒收（缺/非整数 E-DIM-REQUIRED-MISSING，≤0 E-DIM-DOMAIN-RANGE；补缺入口 E-GEN-ROW-INVALID） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值全部手算写在用例注释（面积 64 → 8×8；65 → 9×8；加倍 36·2^7 → 69×67 等）；起始地区用例只断言"不超形制上限"与由上限推出的格数界，不抄计数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 唯一一次为 c_text_kernel_4（bareCompare）改写：`e.code === 字面量` 换成结构判断，这是我新写的比较，不是改写既有允许写法；baseline 回到 0 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | tracked 改动 167 增 37 删（共 204 行，不含两个勘误前快照与本回报）；文件：卷十、卷十九、blueprint.mjs、siteform.mjs、_vocab.json、place.json、registry.json、facility.json、8 个测试文件（五个只给夹具形制加 planSideMaxCells 字段）。place.json 与规则表 registry/facility 不在卡文点名里，但"删 4096"必须删到这三处（同一硬数的三处登记），已说明 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → tests 1713 / pass 1713 / fail 0 |
| 8 | 这张卡让块 6 哪一步更近了，且没有违背北极星 | 是 | 手写建筑补缺的终止条件从全局 4096 变成形制自己的合理上限，装不下时明确报错可查，起始地区建筑可生成；派生优先、整类规则、无特例 |

## 勘误号与文件

- 卷十 1121k20（R10-7.12 "补出的房子必须能展开"段改；整类规则句；超大物按建筑群表达的原则句；A10-2.4 加 ⑥ 手算用例；附录行）。快照 `docs/统一底层设计/版本快照/卷十-v3-勘误前-1121k20.md`，与 origin/master 同 blob（cbf50bc15f23b45a1b778ceab79c60df0ad39364）。
- 卷十九 1121k21（§2.4 bform 加必填字段 `planSideMaxCells`；§2.1 planCells 域改为 [1, 形制上限]；附录行）。快照 `卷十九-v16-勘误前-1121k21.md`，同 blob（53a65ca22ebd5d2c46ce07e1d0be991128b6d7ca）。
- 快照不是用重定向写的：用 F:/dnd-tmp/fcap-snap.mjs（Write 写、node 跑）复制，再 `git hash-object` 核 blob 一致。
- 代码：`server-plugin/kernel/blueprint.mjs`（形制字段 `planSideMaxCells` 加载与纯函数入口必填校验；planCellsOf、planBlueprint/planFeasible 越界判据改读形制；越界错误带字段 reason、need_width_cells、need_depth_cells、max_cells）、`server-plugin/kernel/gen/siteform.mjs`（越界转 E-GEN-ROW-INVALID，字段加 building、form，message 写明需要多大与上限；删 4096 提法）。
- 数据：`world/ontology/dimensions/_vocab.json`（bldform_river_house 加 `planSideMaxCells: 18`）、`world/ontology/dimensions/place.json`（planCells 两个域上界 4096 改 null）、`world/rules/registry.json` 与 `world/rules/tables/facility.json`（rules.facility.blueprint 删 `planCellsMax`）。

## 已定（技术自定）

- 字段名 `planSideMaxCells`（整数，细格，外包宽与深各自的上限）。理由：裁定允许"最大边长或最大占地"，边长与现有 planCells 校验同一口径、整数、不引入新的面积换算；名字避开规则表原键 planCellsMax。
- 码：沿用 E-GEN-ROW-INVALID，不新登码；事由用字段 `reason=plan_cells_over_form_cap` 区分。理由：卷十原本越界结局就是这个码，同属"这行数据装不成房"，卷二登记表不必加码。纯函数层（planCellsOf/planBlueprint）仍抛 E-DET-DOMAIN 并带同一组字段。
- "生成日志"= KernelError 的 fields（只含代号与数值，经 report 出口记日志），与 E-GEN-WATER-FOOTPRINT 的写法一致。
- 上限值：见下节。

## 上限值与出处

| 形制 | planSideMaxCells | 出处 |
|---|---|---|
| bldform_river_house（现唯一的形制条目，起始地区 19 栋手写建筑全用它） | 18 | 设定原文 docs/世界设计/13-建筑、聚落形态与服饰器物.md:82 的 courtyard_house footprintM2 [120, 300]（river_house 为其变体，:170）；上限 300 m²，aspect 1、细格 1 m 折外包：D = ⌊√300⌋ = 17、W = ⌈300 ÷ 17⌉ = 18。占地出处是设定原文，折边长的算法是生成规则；标"暂定·待试玩标定"。这条有设定出处，没用 :601 示意值 |

## 测试名（新增）

- blueprint.test.mjs：`形制登记上限（封卷后勘误 1121k21）：外包任一边超过形制 planSideMaxCells 即拒收并带字段…`；`bform 加载校验` 加缺/0/非整数拒收（没登记的形制装载报错）。
- gen-siteform.test.mjs：`超出形制上限：加倍到上限就停，仍放不下即 E-GEN-ROW-INVALID，日志字段写明哪栋、哪个形制、要多大、上限多少…`（裁定 5 ①）；`作者写的 planCells 超过形制上限…`；`形制没登记上限…补缺入口一律拒收`；`起始地区现有全部手写建筑在真实形制上限下都排得下…内存在正常范围`（裁定 5 ②，19 栋真数据、真规则行、真形制；本机纯函数，不推进世界）；`统一硬数 4096 已删…`。
- 既有测试改动：夹具形制补 `planSideMaxCells`（必填字段新增，不得不加）；`终止靠卷十 :688…` 用例标题与消息断言由 /planCellsMax|exceeds/ 改为 /planSideMaxCells is 64/ 并加字段逐项断言（更严，不放宽）；blueprint.test.mjs 夹具 LIMITS 去掉 planCellsMax，BASE 形制取 4096 使既有"外包出 4096 拒收、4096×1 放行"两条断言原样成立。

## 验收末行

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：`ℹ tests 1713 / ℹ pass 1713 / ℹ fail 0`。
- `node tools/accept/run.mjs pre_commit`：`"verdict": "pass"`；items 失败仅 vol12.A12-4.5、vol12.S12-2、vol12.S12-3（基线 fail，不计）；vol5.S5-10 不在失败列表（pass）。
- 门禁说明：本卡没有新抽取点，故没有新 seed-keys 登记（抽取点 site_gen_bldfill_area、site_gen_bldfill_storeys 沿用）。中途 c_text_kernel_4（bareCompare）一度升到 2，是我写的 `e.code === 'E-DET-DOMAIN'` 等字面量比较；改为结构判断后回 0。

## 偏离与未落

- 偏离：place.json、registry.json、facility.json 三处不在卡文文件清单，但"统一硬数 4096 删掉"必须落到它们。
- 未落：卷二 :1816 与卷五 :172 两行 planCells 文字"各值 [1, 4096]"待各自勘误改为"下限 1、上限由形制 planSideMaxCells 定"（已在卷十 1121k20 登记为跟改项；登记表 place.json 的域已先改）。
- 未落：`storeys_max_unchecked` 缺口原样保留（本卡不涉及）。
- 备注：命令纪律——中途有一次我误用了 heredoc 的空命令，无写入、无副作用，之后未再用。
