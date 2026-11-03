# 卡 p5-select：保守选测与覆盖率地图生命周期（流程 v2 实施卡 P5）

工作区 F:/dnd-wt/GATEQ（分支 t-gateq）。设计：tools/gate/DESIGN.md。必读：§5.1–5.3（集合、建图、选择规则与失效）、§12 的 P5 段、§14 修订。只读相关部分。

## 为什么急
现在一张卡的门禁大约要跑 420 个测试文件，4 个执行名额全满时，一个门禁就要一小时以上。原因是 import 关系选测几乎总是选中全部：引擎是中枢，谁都依赖它。目标是改成按覆盖率选测：只跑真正执行到被改函数的测试。但设计要求宁多勿漏，并且必须先经过影子验证，才能真正用于排除测试。

## 现状（已上线 r3）
- tools/gate/test-impact/collect.mjs 已改用 runner.mjs。它逐文件写 shard（`<map>.shards/`），每 10 个文件更新一次聚合地图，可中断续采。采集失败、或测试本身不是 PASS 的记录，exitCode≠0，并带 unavailable/partialCoverage 标记。
- select.mjs 在 select.mjs:42 对 exitCode≠0 的记录一律选中。它已处理：未采集的测试、混合快照、偏移与 CRLF、顶层代码、增删文件的回退。
- card-gate.mjs：tia-map.json 存在就用 select.mjs，否则用 affected-tests.mjs。

## 所有权
只改：tools/gate/test-impact/{common,select,collect}.mjs、tools/gate/test-impact/test/**、tools/gate/policy/selection.json（新）、tools/gate/affected-tests.mjs（改为退役适配壳，转调统一选择器）。card-gate.mjs 只能改"选测调用与影子模式"这一处，判定部分不动。

## 要做
1. 统一选择器：一个入口同时给出两个集合，每个入选文件都附原因：
   - 保守集合：现在实际要跑的；
   - 覆盖率裁剪集合：影子模式下"本来只需要跑"的。
2. 按 §5.3 表格补全回退规则。以下情况一律回退到全量：
   - 顶层代码、导出、注册器、动态 import、加载器、schema/枚举；
   - storage、ledger、engine 调度、权限/私密等共享契约；
   - world/ 数据、package/lock、Node 版本；
   - extension/ 目录。extension 要纳入静态根。
   测试 helper/fixture 变更：让它的反向消费者的记录失效；无法枚举时回退全量。测试文件本身变更时必跑该文件。新函数、未执行函数、空选集不能算"无需跑"，要加上加载者和静态消费者。
3. 地图资格：
   - 记录 TTL 24 小时，按每条记录的采集时间算；
   - 记录 Node 版本与 lock 哈希，不符即视为过期；
   - 同一 HEAD 下工作区有脏文件时不复用；
   - 地图分代原子发布：读者固定读一代，写者写完新一代再切换。
4. 影子模式：policy/selection.json 里 `mode: "shadow"`（默认）或 `"prune"`。shadow 模式下，门禁照跑保守集合，同时把"裁剪集合会漏掉哪些文件"写进 gate.json，主会话据此统计。卡里不要实现自动切到 prune。
5. 测试：
   - 保留现有 impact.test.mjs 的全部用例；
   - 新增 fixtures 覆盖：extension 改动、JSON/动态读取、helper 变更、删除旧边、未执行函数、同 HEAD 脏树、Node/lock 变更、TTL 过期、失败采集不得排除、地图并发发布；
   - 影子输出格式。

## 约束
沙箱不能起子进程，只跑纯逻辑测试：`node --test --test-isolation=none tools/gate/test-impact/test/<文件>`。真实采集由主会话在机器空闲时安排。不放宽断言。

## 汇报（≤250 字，F:/dnd/logs/sessions/p5-select.final.md）
选择器接口、回退规则清单、影子输出格式、测试结果、偏离、需要宿主验证的项。
