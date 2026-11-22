| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二十七 R27-1.13 :313–:318（展开时机、步骤、落格种子键五段、landCell 未知记 E-GRID-LAND-UNKNOWN）、R27-1.14 :319（收起：基底缓存丢弃、差分留存、位置不降精度）、R27-1.16 :325–:327（回场对账、按日重派生）、R27-8.5 :792（骰值键五段）、A27-1.12 :370、A27-1.13 :371、A27-1.15 :373、R27-3.14 :500–:502；卷五 §4.1 规则 14 :501–:502（landCell）、规则 17 :513、§4.5 规则 6 :745–:747；对照表 #61–#65、#68、#69、#76 |
| 2 | 没有按 id/名字/场景写特例 | 是 | server-plugin/bubble.mjs 只读个体表与 state.created 行的 pos、规则表泡半径（经 bubbleView）与 landSearchRadiusCells（经 landCell）；无 id、名字分支；个体次序只按 id 码点序（卷文 R27-5.3） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/kernel/bubble.test.mjs「landCell coarse 假：没给 near、near 不是位置、near 不在 place 里、没登记 landSearchRadiusCells…」：缺 near、非位置 near、near 不在 place、landSearchRadiusCells 缺失/0/-1/2.5/null/"unlimited" 一律拒收（E-DET-DOMAIN、E-DIM-STRUCT-FIELD、E-RULES-UNREGISTERED）；泡为空（before 与 after 相同、无泡）两表皆空；位置读不出的个体跳过不放行 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具世界自造（tests/kernel/bubble-world.mjs）；期望值手算：半径 3 候选 1 格、半径 4 候选 1+4+4+4+8=21 格、区格 13 格、泡 6/9/15/25 格；哈希最小者用公开函数 landCellKey 对手算候选集合对照；landSearchRadiusCells 在用例里经引擎副本覆盖，不抄真实表值（真实表值 10 没进断言） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 既有测试只改了两处手数计数（tests/kernel/error-codes.test.mjs 612→613 与 E 593→594；tests/accept/item-revisions.test.mjs 非扫描条目 52→54、卷二十七 5→7），都随登记新增；bubble.mjs 的 OUTCOME 表是 settleCell 返回种类的同值镜像并注明来源，不是为过检查器的改名（V-2.a 命中的是裸字面量比较，改成引表后过） |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是（含必要扩展，见下） | git diff：9 个已有文件 +195 −36；新文件 server-plugin/bubble.mjs 125、tests/kernel/bubble.test.mjs 317、tests/kernel/bubble-scale.test.mjs 118、tests/kernel/bubble-world.mjs 82；合计 873 行（不含本回报）。扩展：error-codes.mjs 登 E-GRID-LAND-UNKNOWN；place.mjs landCell 可立足分支；seed-keys.json 登一行；state-owners kernelApi 登 diceKeyOf（callerFiles bubble.mjs）；items.json 经登记器登 A27-1.13、A27-1.15；criteria.json 12 类判据指纹重盖（error-codes.mjs 入检测器闭包，rev+1 带记录，经登记器）；docs/问题.md 加 G10 遗留节 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 见文末"两条验收末行" |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 玩家走进一块地方时，现场泡该收起、展开哪些区格、里面每个人落在哪一格（或站不稳时怎么坠落、挤出）有了唯一的算法与可复核的结果，G12 写位置只照表写；没写死、没缩规模、没走特例 |

## 改了哪些文件

- 新：`server-plugin/bubble.mjs`（`bubbleDelta`、`bubbleTransition`：泡之差、先收起后展开、按区格序号与个体 id 序逐个落格或核可立足；不写状态）；`tests/kernel/bubble.test.mjs`（20 条）、`tests/kernel/bubble-scale.test.mjs`（5 条，DeepSeek 写、我审）、`tests/kernel/bubble-world.mjs`（共用夹具：w0 12×3 区格、w1 24×6 区格）。
- 改：`server-plugin/kernel/place.mjs`（`landCell` 的 coarse 为假分支，见已定 1）；`server-plugin/kernel/error-codes.mjs` 与 `tests/kernel/error-codes.test.mjs`（E-GRID-LAND-UNKNOWN，613 条）；`world/rules/tables/seed-keys.json`（落格种子键一行 `bubble`/`site_bubble_land`）；`world/ontology/state-owners.json`（kernelApi 登 `kernel/sample.mjs#diceKeyOf`，callerFiles `bubble.mjs`）；`tools/accept/items.json`、`criteria.json`（登记器写）；`tests/accept/item-revisions.test.mjs`（手数计数）；`docs/问题.md`（G10 余下遗留 8 条）。

## 对照表逐行落实（#59、#60 已由 G10a 落）

- #61 展开时机：`bubbleTransition` 只由改变泡的那一笔事务的写者调用，读档、推进切分不调；测试"读档不是展开时机"（读档后以现有泡为 before 调用，三表皆空）。**触发点接线**（placeSubject 写玩家实体位置、席位边写者）**未落：归 G12 与卷九席位边写者**（kernel 无"事务结束前"通用钩子，不造）。同一事务内出错整笔回滚：测试"同一笔事务"（展开出错 E-RULES-UNREGISTERED，先写的差分不留）。
- #62 展开步骤：区格 (w,x,y) 序、区格内个体 id 序；coarse 个体经 `landCell(coarse:false, near)` 落可立足格；种子键五段 `世界种子|bubble|个体id|事务世界时刻|site_bubble_land`（手写字面量断言）；`landCell` 返回空时位置不改、记 E-GRID-LAND-UNKNOWN（字段 space/rx/ry）；已在细格上的个体经 `settleCell`（坠落 6 m、挤出到 (249,150,1)、站稳无项，手算）。**写位置**经 placeSubject：**未落：归 G12**（本卡只出落点项）。
- #63 收起：状态上无写（基底与缓存是投影，gridView 无跨调用缓存）；测试：状态逐位不变、差分仍在、pos 不降精度。泡外移动写 coarse：**未落：归 G12**；细格场值折算：**未落：归 G14**。
- #64 展开恒同：测试"A27-1.13 切分无关"（一次推进、10+20 日、7 段并中途存盘读档，计划与最终状态相同）、"展开恒同"（同一区格收起再展开 gridView 逐格相同）。A27-1.13 登记为 registered（用时钟跳变代替真实推进，未用 R27-4.1 摘要）。
- #65 回场对账：建筑行变了现场按当前行派生（测试"回场对账"：小屋 1 层改 2 层，展开后二层外墙在）；**有形存量（树）未落**：gridView 无存量层。A27-1.14 不升级，仍 registered。
- #66 `pm_offscreen_cells`、#67 `pm_bubble_expand_ms`：**未落**，性能度量规则表与 E-PERF-BUDGET 计数器 0 命中，归卷二十七主体卡；本机冒烟：区格 (2,1) 里 20 个 coarse 个体展开落格约 400 ms（每个体约 20 ms），超过暂定 200 ms/区格，**须腾讯云实测并报李白，不自行放宽、不缩泡**（docs/问题.md G10 遗留 5）。
- #68 成本与世界规模无关：bubble-scale 测试（w0 12×3 与 w1 24×6 单实体泡同为 9 格、两实体并集 15 ≤ 18、差分字节数两格空间相等、半径 2 得 15/25 格）。
- #69 扩展性：新增格空间 w1 不改 sim-tiers.mjs、bubble.mjs 即成泡、能展开落格；改半径只改规则表。items.json 登 A27-1.15（registered）。
- #76（G11 移交）起始地区展开成细格、收起再展开恒同：本机只做夹具世界上的恒同与冒烟；真实起始地区的整区格展开与对账须腾讯云块验收，**未落**。
- 门禁：vol5.S5-9、vol5.S5-10、vol27.S27-11.a 均不在 failed 里，仍 pass。

## 已定（卷文推不出，须 Opus 核）

1. **`landCell(coarse: false)` 的搜索中心与区格限制**：卷五 :502 没说"landSearchRadiusCells 内"以谁为中心，卷二十七 :317 只传 place，卷十七 :297 却写展开"给 coarse 个体现有的 pos 由泡内一支落到近旁可立足格"，三处不一致。现定：须给 `near`（该个体现有的 coarse 位置）；候选为 near 半径内（距离平方 ≤ (半径·cellM)²，同挤出度量）、zone 恰为 place、与 near 同区格、可立足；取 hash(seedKey, 格序号) 最小，并列 (x,y,z) 序；无候选返回 null；没给 near 仍抛 E-DET-DOMAIN（既有两条测试不动）。理由：不限区格会把人落到正在展开的区格之外。
2. **bubble.mjs 只算不写**：卷二十七 :274 "本卷不写位置"，位置归 placeSubject；不另造回调注入口或全局钩子（那是为测试造设施）。
3. **个体枚举全表一遍**、已终止个体是否参加：见 docs/问题.md G10 遗留 6。
4. 物（批次）落格未落：卷三乙 spot 维度代码 0 命中。

## 委派与改正

- 委派 DeepSeek flash 一张卡（F:/dnd-tmp/card-g10b-ds-1.md）：写 tests/kernel/bubble-scale.test.mjs（泡大小与格空间无关、新格空间、改半径）。一轮；我逐行审：期望数手核无误、未碰既有文件，仅按实际数据层级解释"数差分条数"（里块下计数），接受。核心（landCell 可立足分支、bubble.mjs、bubble.test.mjs 与夹具）自写。
- 自认错：写 bubble.mjs 时用了一次 `sed -i`（把报告字段名 w、x、y 改为 space、rx、ry，因报告出口要求字段名至少两字符），违反命令纪律；改动本身正确，已用 Edit 校正注释与测试；之后再没用。其余首版错误（本机自改）：JSDoc 用 `{any}` 与裸字符串比较被门禁 vol1.V-2.a/b 抓到，已改 `{object}` 与表引用；夹具第二格空间层根须挂在世界树下。
- 未用 `git add -A`、`--no-verify`、重定向写文件。

## 须 Opus 核

1. 上节已定 1（landCell 可立足分支的口径，三卷不一致须裁）。
2. 展开只算不写的分工与 G12 接线方式（写入前取 bubbleView、写入后调 bubbleTransition、按项写位置）。
3. criteria.json 12 类指纹重盖是登记器按 error-codes.mjs 入闭包规则做的机械升版（rev+1，记录写"口径不变"）。

## 修改轮（Opus 只核必须改 1，docs/审查/G10b-Opus只核-1122.md；已定：主会话 11-22）

展开落格改以卷十七 §3.3 :297–:304、C17-18 为准：bubble.mjs 对 coarse 个体复用 `extrudeCell`（目标格可立足即落它，否则半径内直线最近、并列格序号字典序最小；落不下按未知并记 E-GRID-LAND-UNKNOWN）；撤回 place.mjs 的 landCell near 分支（git checkout 回 4954b636a 版）、seed-keys.json 的 bubble 行、state-owners 的 diceKeyOf 登记、bubble.mjs 种子键；bubble.test.mjs 删 landCell 与哈希用例，落格用例改按最近者手算（(250,150,0)→(250,150,1)；石料填格后并列取 (249,150,1)）。卷二十七 :317、卷五 :501 对齐勘误与 zone 筛选问题记入 docs/问题.md G10 遗留 1。性能 400 ms 记待腾讯云实测并报李白。上文"已定 1"与种子键相关各处以本节为准（items 里 A27-1.13 首条修订记录提到的种子键为历史记录，内容指纹未变故未升 rev）。

## 两条验收末行

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：ℹ tests 1801 / ℹ pass 1801 / ℹ fail 0（修改轮后，单独跑）。
- `node tools/accept/run.mjs pre_commit`：`"verdict": "pass"`；failed 仅 vol12.A12-4.5、vol12.S12-2、vol12.S12-3（基线）；vol5.S5-9、vol5.S5-10、vol27.S27-11.a 不在 failed。
