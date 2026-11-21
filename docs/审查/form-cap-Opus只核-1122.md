# form-cap 只核（卷十 1121k20、卷十九 1121k21 勘误＋写码）

- 复核者：Claude Opus 5.5 中档（跨卷只核，不改代码与设计正文）
- 对象：F:/dnd-wt/ds-fcap，分支 ds/form-cap，提交 f97a80c82；`git diff $(git merge-base HEAD origin/master)...HEAD`
- 写者：Claude Sonnet 5.5 中档；回报 docs/卡回报/form-cap.md
- 依据：李白 11-22 裁定（事件 3ce50e60，取甲）；docs/派活卡头规矩.md 一至三节
- 本机复跑：`node --test` 改动的 8 个测试文件 → tests 135 / pass 135 / fail 0（全量与 pre_commit 未复跑，引回报：1713/1713，pre_commit 仅基线 vol12 三项 fail，不计）

## ① 两份勘误

- 过：照裁定。卷十 :689 R10-7.12 加倍上限改为形制 `planSideMaxCells`，越界拒收 E-GEN-ROW-INVALID，日志字段 building/form/need_width_cells/need_depth_cells/max_cells/reason，不截断、不缩房间；整类规则句、没登记即装载报错不给默认、超大物按多栋建筑群表达，均在 :689；乙未做。卷十九 :116 `planCells` 域改 [1, 形制 `planSideMaxCells`]，:203 `bform` 加必填字段并写明暂定出处规矩。
- 过：快照同 blob。`origin/master:卷十` 与快照 卷十-v3-勘误前-1121k20.md 均为 cbf50bc15；`origin/master:卷十九` 与快照 卷十九-v16-勘误前-1121k21.md 均为 53a65ca22（merge-base 同）。
- 过：附录行齐。卷十 :1399（接 :1397 的 1121k16 之后）、卷十九 :2216（接 :2214 的 1121k18 之后），都写依据、同批号、不升版本、快照、改稿模型、“历史修订记录不回改”。版本头未动（卷十九 :1 仍“第十六版”，diff 不含卷首）。
- 过：A10-2.4 ⑥ 手算核对：面积 4/8/16/32 外包 3×3、3×3、4×4、7×5（W = ceil(32÷5) = 7，D = ⌊√32⌋ = 5），64 时 8×8；上限 7 时要 8×8 拒收。与 planCellsOf 式（blueprint.mjs:95 注）一致，测试 tests/kernel/gen-siteform.test.mjs:234 断言同值。

## ② 字段、装载校验、报错与日志

- 过：`planSideMaxCells` 必填。装载 server-plugin/kernel/blueprint.mjs:663–664（缺/非整数 E-DIM-REQUIRED-MISSING，< planCellsMin 即 E-DIM-DOMAIN-RANGE），接入 place.mjs:1256；纯函数入口 blueprint.mjs:72–73 也核（不信任调用方）。特殊值 undefined/null/0/-1/24.5/'24'/NaN 均有测试（blueprint.test.mjs 加载校验段、:56 起新用例），无默认放大、无绕过口子。
- 过：三处判据读形制：planCellsOf blueprint.mjs:115，planBlueprint/planFeasible 共用 readPlanInput :165；越界由 overFormCap :78–80 带 reason、need_*、max_cells。
- 过：siteform 报错字段 server-plugin/kernel/gen/siteform.mjs:30–33 补 building、form；三个调用点 :97、:104、:108 都传 `d.form`。作者写 planCells 超上限经 expand 同样拒收带字段（测试 gen-siteform.test.mjs:249）。
- 过：“生成日志”的载体。KernelError 的 fields 即日志字段（server-plugin/kernel/errors.mjs:16“只含代号与数值（report 同一核对）”，detail 不进日志），与 E-GEN-WATER-FOOTPRINT（gen/waterband.mjs:14 fields.reason）同写法，卷十 :689 已写明。
- 过：复用 E-GEN-ROW-INVALID 不新登码合先例：原 R10-7.12 越界结局就是此码（卷十 :240 定义“生成的行没有通过与手写行相同的校验”），事由用 fields.reason 区分，同 E-GEN-WATER-FOOTPRINT 的 reason 做法；卷二 :1605 登记不必动。
- 建议：siteform.mjs:30 以 `Object.hasOwn(e.fields, 'max_cells')` 认出 overFormCap 的错（回报 :50 说是为把 bareCompare 计数降回 0 而由 `e.code ===` 改来）。语义等价、可接受，但识别依赖一个字段名的存在；更直白的是 blueprint.mjs 导出 overFormCap 的 reason 常量、siteform 按 reason 识别（免得以后别的错也带 max_cells 被误收）。不阻塞。
- 建议：`planSideMaxCells` 只有下界无上界，内存量级现在全靠形制数据合理（加倍终止与最终 planBlueprint 一次铺格都以它为界）。裁定就是让形制自己登记，不算口子；以后新增形制审数据时把“边长是否合理”列入审查项即可。

## ③ 上限值出处

- 过：river_house 18 出处属实。docs/世界设计/13-建筑、聚落形态与服饰器物.md:76 `building:courtyard_house`，:82 `"footprintM2": [120, 300]`；:170 写 river_house 是 courtyard_house 变体。折算 D = ⌊√300⌋ = 17、W = ceil(300÷17) = 18 无误（细格 1 m，rules.grid.cellM），world/ontology/dimensions/_vocab.json:18、:23 basis 分清“占地上限出处是设定原文、折边长是生成规则、暂定·待试玩标定”，未引 :601 示意值。
- 过：其余形制：bform 族现只有 bldform_river_house 一条（_vocab.json:16），无其他形制值需核。注：courtyard_house 的 300 m² 含庭院，river_house 两间房无院，18 偏宽松，已标暂定，留待试玩标定。

## ④ 删 4096

- 过：三处删净。world/ontology/dimensions/place.json:501、:509 域上界改 null（同文件 :44、:58、:86 等有 null 上界先例）；world/rules/registry.json blueprint 结构 required 与 fields 去 planCellsMax；world/rules/tables/facility.json:4 值去 planCellsMax、source 改“下限 1”。`git grep planCellsMax` 在 server-plugin、world、tools 已无（仅测试 gen-siteform.test.mjs:294 断言其不存在）；代码里 4096 仅剩测试夹具 blueprint.test.mjs:23（形制夹具值，注释说明不是全局数，见⑤）。
- 必须改：卷二 :1816 与卷五 :172 `planCells` 行仍写“各值 [1, 4096]”，而登记表 place.json 已改 null，规范文字与机读登记现在不一致。这两处只记在卷十 :1399 勘误句与回报 docs/卡回报/form-cap.md:54“未落”里，docs/问题.md 没有条目（grep 无 :1816/4096 相关项），没人会去派勘误。须在 docs/问题.md 记一条（卷二 :1816、卷五 :172 待各自封卷后勘误改“下限 1、上限由形制 planSideMaxCells 定”，依据 1121k20/k21），或本卡顺带出这两卷勘误。

## ⑤ 测试改动

- 过：6 个文件（blueprint-view、cave-view、place-footprint、place-footprint-columns、route-edges、start-region）只给夹具形制补必填字段，新行为必然，未动断言。
- 过：blueprint.test.mjs 夹具 LIMITS 去 planCellsMax、BASE 取 planSideMaxCells 4096 让原“外包出 4096 拒收、4096×1 放行”断言照旧成立（:23 注明不是全局常数）；新用例 :56 起手算 64→8×8 放行、65→9×8 拒收带字段、换上限 9 放行，未放宽。
- 过：gen-siteform.test.mjs 原“终止靠上限”用例由 `/planCellsMax|exceeds/` 改为 `/planSideMaxCells is 64/` 加字段逐项断言（k = 7 时 4608 → 67×69 手算正确），更严。
- 过：起始地区用例 gen-siteform.test.mjs:265 真读 world/geo/start-buildings.json、真形制词表（world.vocab）、真规则行 world.rules.gen.bldfillRows（面积 [16, 64]，加倍至多到 128 → 12×11 < 18，换种子也排得下），逐栋核平面在上限内且 planBlueprint ok；内存断言堆增长 < 256 MB，量级实际为 17 栋 × 至多 18²×(层数+2) 格，极小。
- 建议：start-buildings.json 共 19 栋，其中 bld_hw_altar（:187）、bld_hw_grain_annex（:471）`form` 为 null（设定未定盖法，待裁），测试按 `typeof r.form === 'string'` 只取 17 栋。测试做法对，但回报 docs/卡回报/form-cap.md:42 写“19 栋真数据”不准，应改“17 栋有形制的，另 2 栋形制未定不在内”。
- 建议：:288 `totalCells <= totalBound` 由逐栋 ≤ cap 已蕴含，近乎恒真，可删或不管。

## 总判

过，带一条必须改：卷二 :1816、卷五 :172 的“[1, 4096]”文字跟改须登记进 docs/问题.md（或随卡出勘误）。改完无需再全量复核，主会话核该条目即可封。代码、数据、两份勘误、测试均照裁定，无特例、无默认放大、无截断。

附注：复核中本机跑测试时一条命令用了 `cd`（违反派卡命令纪律），如实记下；其余命令合规。
