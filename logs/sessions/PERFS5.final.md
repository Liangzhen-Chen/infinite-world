# PERFS5 交接

本卡尚未通过性能门；保留已验证的优化，不提交。工作树 `F:/dnd-wt/PERFS5`，基于 `037a3458`，分支 `t-perf-s5law`。没有改规律、世界规模或结算次数。

## 性能结果

相同命令 `node F:/dnd-tools/bench-farm-pests.mjs 30 2`，最终源码固定，主会话提供的 master 冻结工作树 `F:/dnd-wt/PERFBASE` 为 `3bbd7e0c`。最后顺序配对没有并行测试：master **71568ms**，本树 **86537ms**，比值 **1.209158**，超过 **1.10**；还需约 **7812ms**。原始 S5A 自行 CPU profile 为 **375653ms**，最终同样带 profiler 为 **96268ms**（约3.90倍提速、减少74.4%）。带 profiler 与普通计时分开记录，不能混作性能门结果。

证据：`PERFS5-gate-final.json`、`PERFS5-before.cpuprofile`、`PERFS5-final.cpuprofile`、`PERFS5-master.cpuprofile`、`PERFS5-final-profile.txt`、`PERFS5-hotspots-final.json`，均在本报告同目录。中间波次 profile 保留供定位，wave11/12/13含已撤回实验，不是最终代码证据。

以下为相同60天场景 CPU 样本自耗时秒；重命名函数将薄包装与实际读取函数相加，非各项优化的独立墙钟收益。

| 热点 | 原始→最终秒 | 重复链与修法 |
|---|---:|---|
| entity-view.personRoutine | 58.809→0.261 | 日程堆/逐人日程反复扫所有记录；共用 personConstraints 分类索引，默认免职语义照旧 |
| contract-state.contractTerms | 39.266→0.597 | personEmployment→currentEmployment 每个人重新解析所有雇佣合同；records+查询分钟按 worker 分组，活跃服务义务每次仍查 |
| holdings.aliveHoldings | 24.110→0.082 | 权限/估值临时 reader 反复扫描；推进保护域内按真实 holdings 对象+seq共用，增 subject-only 索引 |
| holdings.push / index | 20.755 / 13.395→0.003 / 0.016 | 同一 holdings 多 reader 重建；唯一写入点维护索引，推进外维持 reader 隔离 |
| obligationRows | 14.173→0.064 | 预算/认知/市场反复扫全 records；只读 debt 分类桶，保留原生投影抑制和原顺序 |
| currentControllers | 12.288→0.077 | 公共维护提案为每个主体复制目录并扫持有历史；目录惰性查找、历史按 subject/kind 建索引 |
| personBusiness | 12.740→0.705 | currentShops/经营自治反复推全部NPC商铺；无变业者不算无用日程，按输入memo、等价商铺资格预筛 |
| personBusinesses | 3.880→0.522 | 同上，多次全体推导改同一state/engine/keepers memo |
| personConstraint | 6.535→1.384 | 全推进共用现有记录索引，缩小重复扫描的生命周期 |
| placeSettlement | 4.977→0.329 | 商铺/约束反复爬地点祖先；state+engine+location memo |
| personEmployment | 3.447→0.397 | 雇佣条款分组复用，仍保留逐次状态判定 |
| baseNpcSchedule / npcSchedule | 5.571 / 4.303→0.649 / 0.715 | 商铺推导取消不消费的日程，租赁/农场/集市行程使用分类桶和参与者索引 |
| householdWorkTime | 0.849→0.142 | 农业逐成员重复劳时；memo含人物/分钟/通勤/工作参数/约束 |
| seedNeeds | 4.893→0.003 | 预算对每人扫所有记录；种粮候选索引+同state输入memo |
| futureSources | 3.247→0.016 | 全表扫描未来收益；workshop/private_farm按所有者索引，真实cursor/revision缓存 |
| householdResources | 2.649→0.214 | 临时reader重复预算；真实cursor+revision+engine+owner+完整选项缓存，主观view不缓存 |
| commitmentAllocation | 1.893→0.036 | 同一推进状态重复分配承诺；state写入即失效memo |

`market.mjs` 的 marketDeals、`noble-state.mjs` 的 nationRows、`organization-state.mjs` 的组织扫描改用现有 recordsMemo/分类桶；与 engine 扩大真 PatchCursor 的 withRecordIndex 范围一起，消除其他全表重算。它们的独立墙钟收益未单独隔离测量。

## 缓存保证与行为

`storage.mjs` 新 stateMemo 仅在 withRecordIndex 内有效，最外层进出清空；按 state对象、engine/scope和显式输入分键，任何游标state写入/reset失效。真实cursor预算按revision失效；无账本stateReader显式能力另带捕获的randomSeed，绝不与账本预算混用。主观view仍每次计算。索引自查模式保留重算核对。

新增 `tests/perf-s5-cache.test.mjs` 覆盖跨分钟、合同修订、深写、义务关闭、跨文档、观察者、reset和默认免职语义；holdings回归覆盖同seq分叉、快照及推进外可变夹具；预算回归覆盖天数、账本revision、无账本区别、可变view、跨文档和返回快照稳定性。

advance-registry **5/5**，金快照无修改，从未设置 UPDATE_ADVANCE_GOLDEN；扩展推进索引域后 FIELDS_INDEX_CHECK=1 的 advance-registry亦5/5。record-index-check **2/2**（含72天农害自查，944秒）。numeric-digest 前后完整JSON的文件SHA256相同：`a315b6c723c89dd1055adac12a63a40948d10ade35811f2e5910ddf51929ece6`；full=`7835f14c6e3e916f64ff817182f19514cef684667114d79e66c3435b8a775088`，quiet=`f49889d910a6def969ea9dbf80c4347f074ef30f246eb512e17eb70d6d7608ce`。

60天完整文档/补丁/消息/结果比对：干净S5A@037a3458和最终本树以相同bench种子、b0/b1事件各推进30天。`PERFS5-bench-before.json`与`PERFS5-bench-after.json`两份5984675字节文件SHA256均为`47a285457bdbbe5a369c67e390126c6e4436ffe39fdc84f6431401c7ff620327`，逐字节一致，包含真实`result.messages`。`PERFS5-equivalence-final.json`记录文档、补丁、消息和result各自哈希，equal=true。原始推进结束后辅助摘要首次因缺省out.messages报错，原始完整JSON此前已落盘；修正摘要读取result.messages后直接比较，没有重跑或改变模拟。优化版这次推进86767ms，非配对门禁计时。

## 验收

所有测试文件分别运行一个 `node --test --test-isolation=none --test-reporter=tap tests/<文件>.test.mjs`，TEMP/TMP均为F:/dnd-tmp，只读摘要。报告同目录 `PERFS5-tests.txt`、`PERFS5-tests-final.txt`、`PERFS5-tests-close.txt`、`PERFS5-tests-extra.txt` 保存逐文件结果，旧日志中的 organizations 失败由下述夹具修正后的8/8覆盖。

- CORE：engine22/22、storage14/14、plugin7/7。
- 先重导 export-actions，再同步四件套：actions-catalog4/4、action-registry7/7、advance-registry5/5、arch-metrics4/4。
- 全部11个s5-law-*：seasonal-credit21/21、public-maintenance9/9、production-inputs10/10、periodic-market22/22、maintenance10/10、land-value9/9、household-labor16/16、household-budget27/27、disease-contact7/7、delivery-capacity10/10、business-lifecycle12/12。
- 卡片引用：npc-schedule12/12、labor-market16/16、农业12个短测12/12、holdings-writers3/3、finance-assets12/12、s5-02 16/16、shop-restock7/7、settlement-trade18/18、s5-08 21/21、npc-obligations8/8、a3-consent-rights6/6。
- 直接改动/相邻保证：perf-s5-cache4/4、holdings-registry12/12、record-index-update5/5、entity-view7/7、entity-authority13/13、finance-bank8/8、organizations8/8；其余相关测试见final日志，包含a3-transaction78/78、s5-05 16/16、s5-06 20/20、holdings-roundtrip/reconcile、合约、自治、官职、贵族和日程缓存。
- 未跑农业多年长测：春季13个月、跨季年度长推/分推、3年20种子；farm-pests-clock两年长测也留主会话。没有声称全量测试、release构建或真实提示栈试玩通过。

## 必要接点及夹具修正

`finance-bank.mjs`：交卡必跑 holdings-writers 原有静态检查失败，discloseCreditPlan 的 knowledge写入改用现成 holdingSet适配器；该类别不产生持有记录，事实与补丁不变。

原始干净S5A@037a3458同样复现 organizations会费例及农业3例失败。只对齐设计夹具，未删测、跳过或放宽断言：

1. organizations：月初现金0不能保证整月无劳动收入；在完整月份的到期前1分钟清空欠费者钱包，再过最后1分钟，保留精确扣费/入库/欠费/三期除名断言（05§5.1、§5.7）。
2. agriculture零劳力：人口聚合值1仍可雇真实NPC；把现有潜在工人状态设昏迷，真正构造零可用劳力，保留生产/播种均0断言（LAB01）。
3. 成熟满仓：补齐D05§5.5已长成实物grownFood=1700及成熟/过期日，并为隔离库存夹具重开匹配账本；保留种粮优先、溢出、容量、守恒断言。
4. 加工上限：粮食day1过期先于第一餐，夹具改day2到期并同步开账，保留精确2单位加工上限及守恒断言。

没有改world、dist、docs/架构设计、world/design、docs/待办或docs/问题。docs/actions.json只更新5个函数行号，actions248不变。未读secrets、未部署、未操作原存档、未做git写入、未结束任何进程。本会话临时调试脚本已删除，既有未跟踪.base保留。源码和测试改动未提交，由主会话代提交及更新项目状态文档。

## 剩余性能块与下一步

按“两种修法仍失败停块”规则，停止继续猜测性优化，交主会话规划一次。已撤回：每演员静止时段复用（日程层）、预算peek-reader包装（读取层），均无稳定收益；更早的maintenance相关性收窄也撤回，因为provider粗筛可能唤醒其他provider，不足以证明等价。不要恢复这三条路径或用改名重试。

最终profile与master的inclusive对照：advanceNpcAutonomy **12.239 vs1.908秒**，subjectiveView本树 **5.694秒**，settleNpcReflection **2.896 vs0.947秒**。日程advanceNpcSchedules **17.058 vs16.046秒**，buildScheduleHeap **13.212 vs15.234秒**；大块游标快照是共有成本，不应误判为S5新增退化。建议主会话把剩余问题交规划，沿新增自治候选→主观视图/预算的实际重复消费定位，必须保留候选集合与主观可见性。尚不能宣告PERFS5验收。
