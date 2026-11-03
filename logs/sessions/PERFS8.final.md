# PERFS8 交接报告（性能目标未达）

结论：保留路线/天气局部收益，最终中位1.037424，未达≤1.00；行为输出不变，功能验收仅有已对照的沙箱环境限制。

基线：切出 s5a 为 `.base=623489f0`；master 为 `3bbd7e0c8e638a9726e0af0329c63c42c5220fe4`。没有 git 写操作。

## 结果与改动

engine.mjs 在已有固定拓扑的 graphCache/advanceGraphs 生命周期内复用 Dijkstra 搜索前沿。模式与季节仍分图；缓存键包含来源、精确分钟、种子、日历、封路及设施系数签名，目标按同一前沿投影。仅保留当前出发时刻，切换分钟、种子或日历即释放旧搜索。终点的出边延迟到后续查询才检查；中途抛错会丢弃不完整缓存，重试仍走完整搜索。每次返回独立路线，空气影响与行动检查点实时投影。

weather.mjs 在既有天气序列作用域内建立地点到气候区的索引，保持 find 的首区优先。旧 360 日历直接计算天气需要的年及年内日，不构造显示日期。未改变天气序列、抽签、公式或精度。

新增 tests/perfs8-cache.test.mjs，覆盖等时路线、前沿继续、返回值修改隔离、失败重试、设施/封路到期、种子、精确分钟、季节、跨年及双日历。FIELDS_INDEX_CHECK=1 时，路线命中会独立重搜核对，天气地点索引会与原 find 核对。没有删除旧测试或放宽断言。

docs/actions.json 仅按验收要求重导处理器行号。storage.mjs 最终与切出基线相同。家户、NPC、教育、advance-registry、food-supply/shop/transport、world/design、dist、docs/架构设计、待办和问题文件均未修改。没有提交、部署或操作原存档，未读取 secrets。

## 剖析和撤回的试验

使用 `node --cpu-prof ... F:/dnd-tools/bench-farm-pests.mjs 10 1`，再用 F:/dnd-tools/profile-diff.mjs 按自身时间增量排序。原始 master/before 剖析及后续候选剖析保留在本目录。

最终采用 route 及其内部函数合计、weather 模块自身时间作同口径比较，数值见文末；整体结论以三对60日计时为准。

复制相关试验未显示稳定收益，全部撤回：同值写入没有降低 take（0.776→0.820s）；手工宽表复制将 take 提至1.02s；get 展开反而0.3404→0.4757s；canonicalEqual 原始值快路也无稳定收益。最终保留原 take/cloneWalk/get/canonicalEqual，未减少快照隔离、验证或回调。

## 行为一致性

最终 golden-dump 与切出前逐字节一致，SHA256 均为：
0738ff5d44aa64aca1af54ab9986fd12127f076c8f4a0c1775480f7a484e2a19

golden-diff 输出 total 0；最终哈希再次核对相同。numeric-digest 文件 SHA256 均为：
881dd5a32062c036090733650eac70ce8c262bb25aab732402966b8c4ec3064e

advance-registry 5项通过，没有设置 UPDATE_ADVANCE_GOLDEN，也没有修改金快照。

## 验收

正式测试逐文件独立 node 进程；TEMP/TMP=F:/dnd-tmp；最多两个测试进程。PowerShell 当前输出编码为 gb2312，spec 的 ℹ 摘要无法匹配，因此使用 TAP 并只过滤 # pass/# fail/not ok。仅查看了一个失败用例的最后30行，没有读取完整测试输出。

最终受影响清单为347文件，超过120；按共同规则的大清单口径选中其中37文件，并另跑4个直接相关文件，共41文件。完整清单见 PERFS8-affected.txt；逐文件结果见 PERFS8-tests-final-A.tsv 与 PERFS8-tests-final-B.tsv。清单内其余310文件未跑，交主会话合并门禁（包含 gate-skips.txt 的整文件S7豁免）。

CORE 与同步四件套均通过，导出动作目录后分别运行。缓存相关专项都设 FIELDS_INDEX_CHECK=1；record-index-check 全文件通过，耗时约31分钟。全部 s5-law-*、试玩与5个 invariants 文件通过；试玩耗时39分52秒。最终41文件中40通过，1文件为已对照的环境限制。清单内37文件为36通过、1环境受限，另4个相关文件全部通过。

overfit-guard 失败的两个子测与 `.base` 源代码副本逐项一致：
- #2 overfit guard: world/actions synonyms of 4+ characters are not copied from the corpus
- #4 overfit guard: every allowlist entry carries a reason and still matches a real hit

两边均 pass2/fail2，没有新增失败子测。诊断为 spawnSync git show master:world/actions/core.json 返回 status=null、error=EPERM，无法读取 master 动作目录；须由主会话在沙箱外补跑。没有改 allowlist 或测试断言。

## 性能

直接 perf-gate.sh 会 git checkout，违反本卡禁止 git 写操作的规则，因此复用相同的 bench-farm-pests.mjs 30 2、master/本树串行交替三对。初步探索结果保存为 PERFS8-perf-exploratory.tsv，中位1.0737，未达≤1.00；这些数据在收窄前沿生命周期前，不能替代最终三对。

最终性能基线复制自干净的 PERFBASE，复制前后 HEAD 都为上述 master；独立副本避免其他门禁切换共享 PERFBASE。副本与本树均使用 F:/dnd/node_modules。正式测量期间不并行运行本会话 Node 测试。最终三对见下表，中位1.037424，未达≤1.00。

## 超出本卡所有权的剩余热点

切出源代码10日剖析自身时间：
- server-plugin/advance-registry.mjs:162 buildScheduleHeap 0.884s；:150 nextFromScheduleHeap 0.175s。建议沿到期堆的实际构建依赖分析重复工作，不减少真实结算。
- server-plugin/entity-view.mjs:355 personConstraint 0.251s；:23 baseOf 0.156s。建议核对同一物理快照的人物约束派生复用。
- server-plugin/education-state.mjs:124 sameCourseInputs 0.229s；:205 deriveEducationCourses 0.105s。建议沿课程/日程输入及失效路径定位重复派生。
- server-plugin/npc-state.mjs:97 npcSchedule 0.142s。未改作息和家户生计规律。

临时调试脚本和两份临时基线副本已删除；初始 .base/.base-index/.base-src 保留不动。没有手动结束任何进程；长测 PID 曾通过其父进程的 PERFS8 队列命令确认并记录，最后自然结束。未解决项为性能目标未达，以及 overfit-guard 的沙箱外复跑。


## 最终剖析与三对数字

最终代码的自身采样（含路线函数内部回调，避免函数拆分造成口径偏差）：

| 范围 | 切出基线 | 最终代码 | 变化 |
|---|---:|---:|---:|
| route及内部函数 | 0.370414s | 0.279726s | -24.5% |
| weather模块 | 0.271795s | 0.210035s | -22.7% |
| GC | 0.511921s | 0.534760s | +4.5% |

原始数据见 PERFS8-base-final.cpuprofile、PERFS8-final-current.cpuprofile、PERFS8-profile-final-current.txt、PERFS8-profile-totals.json。10日剖析场景单次计时14390→14100ms，仅用于定位。

| 对次 | master毫秒 | 本树毫秒 | 本树/master |
|---|---:|---:|---:|
| 1 | 77309 | 83236 | 1.076666 |
| 2 | 78291 | 81221 | 1.037424 |
| 3 | 77201 | 79537 | 1.030259 |

中位 **1.037424**，较master慢约3.7%，本卡性能验收未达标。两个热点的局部收益尚不足以腾出要求的余量。

Git Bash 锁版脚本在启动时被沙箱拒绝（CreateFileMapping，Win32 error 5）；实际执行为 PowerShell 同一基准命令串行三对，没有取得全局 perf.lock。测试队列已全部结束后才测量，未并行本会话 Node 测试。计时脚本、三对原始数值保留为 PERFS8-perf.ps1、PERFS8-perf.tsv。

## 另外的禁改路径热点

初始s5a剖析中，npc-schedule.mjs:202 settleSchedules 0.5179s（master对应0.4415s）；shop.mjs:181 经营者投影匿名映射0.1042s；household-budget.mjs:65 库存账户键分组匿名函数0.0287s。这些文件未修改。建议分别由所有者沿作息消费者的实际失效、businesses/rules投影、账户键集合依赖定位重复派生；尤其库存账户键索引不应仅因无关金额更新而反复重建，但须由主会话协调消费者显式声明依赖后再改通用层。

复制块的两种试验均无收益，已按停止规则撤回。后续需主会话基于上述数据规划调用者与依赖复用的责任层；保留真实规律计算、快照隔离和现有账本保证。本卡不按性能达标交付。

