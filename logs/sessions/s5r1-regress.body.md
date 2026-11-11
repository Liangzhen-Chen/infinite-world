# 卡 s5r1-regress：修复 S5 合入造成的 5 个回归

工作区 F:/dnd-wt/S5R1（分支 t-s5r1，基于 s5a f7cbd017）。先读：
- docs/产品原则.md；
- docs/架构设计/15-经济与货币.md（只读相关小节）。

## 已确认的回归
master a27acae4 上通过，s5a 上失败：
1. **tests/ledger-price.test.mjs**，用例"价格输入点登记：每个读取点有调用处，每处调用都已登记；含价格字样的模块都已归类"。S5 新增的价格读取点或模块没有登记。
2. **tests/seasonal-migration.test.mjs**，用例"灭绝不恢复、满栖地不迁入，闭路不出发；途中死亡不复活"。很可能与 S5-06 生态或 S5-07 水文改动有关。这个测试单跑约 35 分钟。
3. **tests/w4-b2.test.mjs、tests/w4-b3.test.mjs**，用例"隔离发布重发零写；候选与 L4 篡改在写入前拒绝"。很可能与 S5 新增的审批或发布产物有关。每个单跑约 10 分钟。
4. **tests/action-registry.test.mjs**："注册表与 S0 动作清单一一对应且为最新同步"，期望里有 core:wildlife.release，实际注册表没有。
   - 来源是 S5-05 提交 9d0681ab。
   - 用 `node tools/build-action-registry.mjs` 重建会报"动作 id 重复：core:wildlife.release"，说明有两处来源定义了同一个动作。
   - 要查清哪一处才是正源，再修。

## 要求
- 每项先定位：是 s5a 上哪个提交引入的（可用 git log -S、git bisect 思路，但不做 git 写操作）。定位清楚根因后再修。
- 修产品代码或数据登记，使检查恢复通过。**不放宽断言、不删用例、不重生成金快照。** 世界数据改动走审批管线，不手改 dist/。
- 第 2、3 项单跑耗时很长：一次只跑一个，不并行。
- 交卡前必跑卡头规定的同步四件套和 CORE，以及上面 5 个文件，逐文件单跑。

## 汇报（≤300 字，写入 F:/dnd/logs/sessions/s5r1-regress.final.md）
每项的引入提交、根因、改法、测试结果，以及偏离之处。
