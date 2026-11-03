# PERFS6 交接（完成）

工作树 `F:/dnd-wt/PERFS6`，分支 `t-perf-s5law2`，基于 `16df4939`。全部为第1步行为不变优化；未启用第2步计划期复盘，未改世界内容、存档格式、随机键或持久化数值。未提交，由主会话代提交。

## 性能门

每次运行 `TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tools/bench-farm-pests.mjs 30 2`。计时期间不运行测试。本会话改前本树单次86122ms；最终本树三次中位数78040ms。门禁以配对比值判定，不混用 CPU profiler 的计时。

| 对次 | master / ms | PERFS6 / ms | 分支/master |
|---|---:|---:|---:|
| 1 | 73718 | 78421 | 1.063797 |
| 2 | 74342 | 77858 | 1.047295 |
| 3 | 74536 | 78040 | 1.047011 |

**三对比值中位数1.047295，低于1.10，通过。**

未直接运行 `perf-gate.sh`：脚本会对 PERFBASE 执行 checkout，本卡禁止 Git 写操作。已只读确认 `F:/dnd-wt/PERFBASE` 与 master 均固定为 `3bbd7e0c`，顺序运行同一基准；首对在1.05..1.15区间后补至三对，按脚本的配对比值中位数算法判定。

## 最终改法及行为保证

1. `autonomy-candidates.mjs` / `npc-autonomy.mjs`：完整保留原来的 relevant OR 入口。在入口打开后，新增明确的必要条件 `candidateRelevant`，使用同一份惰性候选投影检查所有 provider。只有全部能证明无候选时才省略 subjectiveView；未声明精确条件的扩展默认仍可能贡献候选。任一 provider 可能贡献时仍收集全部候选。已有计划、排队候选、目标/配方等入口保持原有处理。
2. `building-maintenance.mjs`：按最大已登记天气损耗计算 horizon 内损耗上界；若延后路径始终不低于60，完工路径也保持完整服务，两者服务因子均为2，avoidedLoss=0。材料、采购、工时成本非负，故不会产生正效用维修/采购候选。不能证明时继续完整比较；保留60/25边界、余数、在建工程和实际损耗。相同证明也用于候选内部，防止其他日常候选打开入口后仍重复做空评估。公共维修职权及私产检查使用原有真实产权入口，不按目录 owner 猜测。
3. `business.mjs`：仅跳过精确空集：暂停尚未到恢复期限；观察期不足且无现金缺口；无销量且无现金缺口、attachment>=-1000‰。无销量时收入/变动成本为0，continue效用不低于suspend的-switchCost，同分仍按原顺序续营。有有限截止付款义务即保守完整评估；固执尾部、实际销量和恢复期仍走原比较。入口及候选内部都应用证明，种子偏好公式仅抽出复用，骰键不变。
4. `market.mjs` / 上述维修、经营调用者：laborValue 可接收本次已有 view，经营报告、经营自治及维修估算复用同一观察者/文档的投影。无跨世界或跨时刻缓存；其他调用者默认路径不变。
5. `credit.mjs` / `faith.mjs`：只登记与现有候选前提相同的必要条件，分别复用 fundingRelevant、供奉地点条件，使用候选投影时刻，保留长步推进中“原状态不相关、较早投影可贡献”的机会。没有更改信贷、供奉规律。
6. `business.mjs` 零售循环：先运行原有 wants 零需求检查，再构建主观视图及预算。均为只读计算，期间无写入；报价、购买顺序、费用、税、行程和种子决定保持原样。
7. `docs/actions.json`：按要求重导，仅源码定位行号更新。

## 测试新增与必要对齐

`s5-law-maintenance.test.mjs`：优化路径与强制完整投影的文档逐字节比较，覆盖100/90/61/60/59/25/24、5300/5400损耗余数及四班在建修缮；新增历史在场的候选收集、未声明精确条件的扩展仍参与竞争。原成本7/12、避免损失10、预防性维护和少数固执等手算断言保留。

`s5-law-business-lifecycle.test.mjs`：覆盖观察期、无销量、attachment=-1000/-10000边界、过期付款缺口1000-100=900；与强制完整投影逐字节比较，尾部仍确实产生暂闭任务，付款路径仍完整评估。复用view的经营报告、工价派生与默认路径完全相等。原续营、暂停、恢复、未清义务断言保留。

本卡新测试的两处前提纠正：原生商铺行送入 businessLifecycle 时补上真实经营记录的“营业”状态，避免将缺 status 的 raw shop 当成停业；历史患病场景验证候选收集而非执行工作，保留 validateAction 对当前患病者的拒绝。这些均是新增用例对齐实际接口，不改已有断言。

`credit.test.mjs` 两处既有余额失败在 HEAD 原码复现4pass/2fail；所有生产文件和 actions.json 临时读 HEAD 对照后已逐字节恢复，无 Git 写操作。原因是合约推进中 NPC 正午真实购物支出6文，原断言只计工资/分红。按05§5.1.4，仅调整以下精确等式，保留原工资、本金、欠款结清、技能、时间及全局现金守恒断言：

- 短工雇主余额：200-工资 → 200-工资-本次真实零售支出。
- 合伙方余额+个人任务托管：200 → 余额+托管+本次真实零售支出=200。

支出来自 customer_flow 中成功购买的 paid 与 travel.paid，使用前后差额，不按6文硬编码。诊断代码已删除。

## 验收结果

每文件单独一个 node --test 进程，TEMP/TMP=F:/dnd-tmp。为当前 Node 输出指定 --test-reporter=tap，仅过滤 pass/fail/not ok 摘要；失败详情仅取对应单用例最后30行。

- 最终 CORE：engine22/22、storage14/14、plugin7/7。
- 最终先 export-actions，再同步四件套：actions-catalog4/4、action-registry7/7、advance-registry5/5、arch-metrics4/4。
- 最终功能代码固定时，FIELDS_INDEX_CHECK=1：s5-law-business-lifecycle13/13、s5-law-maintenance13/13、s5-law-public-maintenance9/9、s5-02 16/16；直接复用，未重复运行。
- 最终不变量：i01-conservation2/2、i02-non-negative3/3、i15-single-account2/2、i16-event-primary-write2/2。
- 最终 numeric-digest：full=`7835f14c6e3e916f64ff817182f19514cef684667114d79e66c3435b8a775088`、quiet=`f49889d910a6def969ea9dbf80c4347f074ef30f246eb512e17eb70d6d7608ce`，与改前一致；全部13个函数sha亦一致。
- 已完成最终 FIELDS_INDEX_CHECK=1：land-value9/9、household-budget27/27、household-labor16/16、periodic-market22/22、seasonal-credit21/21、production-inputs10/10、disease-contact7/7、delivery-capacity10/10；结合前述复用证据，全部11个s5-law专项通过。npc-autonomy10/10、building-maintenance4/4、business-contracts10/10亦通过。
- 最终 FIELDS_INDEX_CHECK=1 其余文件：npc-schedule12/12、shop-restock7/7、settlement-trade18/18、credit6/6、faith12/12、labor-market16/16、a2-autonomy3/3、perf-s5-cache4/4。全部逐文件退出码0。
- market没有独立同名测试文件，修改的laborValue由labor-market、经营专项的默认/复用view工价全字段对照及s5-02覆盖。

未修改任何 advance-registry 金快照，未设置 UPDATE_ADVANCE_GOLDEN。金快照及 numeric-digest 均不变，无需字段差异表或主会话重生成。

## 收尾与下一步

本卡实现与验收已完成，无未解决问题或卡内待补跑检查。下一步由主会话按原流程代提交、合入；复用本报告中的执行验收，合入后按项目规则跑CORE。无需第2步规律改动或重生成金快照。

临时 CPU profile 已删除；没有遗留调试文件或手动结束进程。预存未跟踪 `.base` 保留。最终11个改动路径及git diff --check已通过；未触及docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md。未做全量测试、release构建、真实提示栈试玩、部署或原存档操作。
