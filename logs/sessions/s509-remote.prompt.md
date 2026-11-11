【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 s509-remote：S5-09 借出并回（第 1 会话，计划共 2 会话）

工作区 F:/dnd-wt/S509（分支 t-s509，基于 s5a 最新：含 S5-01 派生、02 市场、05 资源、06 生态、07 水文）。先读 docs/产品原则.md；F:/dnd/logs/sessions/s5-plan.final.md 的"退出"与"09 借出并回"；docs/架构设计/15 章 §15.8、§15.9；05 章 §5.5。只汇报与本卡相关的结论。

## 用户已定的约束（必须遵守）
- 规则只保留一版、不做旧存档兼容：不加复演版本标记、不留旧行为分支。
- 派生优先：可派生的数值不手填，经 S5-01 派生修正槽计算。
- 测试前提用真实游戏动作或 applyIntentSetup 声明非考查对象；测试走生产原生运行时；不为测试造接口或内容；不放宽断言、不删测试，改测试逐处注明设计依据。
- 不调用付费模型；世界内容只写 world/；已发布内容改动走审批管线，不直接改已发布内容的生成源。
- **测试期望值不得用被测函数计算**：手算数字字面量锚点，注释写计算步骤；手算与实现不一致以设计为准修实现。

## 本卡结果（S5-09）
离屏（远处）区域的"借出并回"：玩家进入时把远处的聚合状态物化成具体的人、物、种群；离开时并回聚合状态。
- 重复进出同一区域，钱、物、人数不增不减。
- 退出并回时，种群的 S/I/R（易感/感染/康复）病例转换守恒：S6 已建的 S/I/R 状态并回后可复原，不丢失、不重复。
- 再生类资源的离屏推进用闭式解，与逐步推进的结果等价；迭代型的生态、河流按设计声明的容差验证，容差写在测试注释里，并注明出处。

## 机制断言（tests/s5-09.test.mjs，均含手算锚点）
- 进出 N 次后，钱、物、人数守恒；
- 并回时 S/I/R 计数守恒，带一个具体数字例子；
- 闭式再生与逐日推进的数字等价；
- 迭代生态、河流在声明容差内一致；
- 失败操作零写入；
- 存档往返一致。

## 可改
- server-plugin/remote-generation.mjs，及现有物化消费者里与借出并回直接相关的接点；
- tests/s5-09.test.mjs。

锁：
- transport、finance-tax：S5-08 在改；
- credit、finance-bank、money、documents：S5-03 在改；
- engine、primitives-runtime：S5-10 独占；
- wildlife、husbandry、water-cycle：06/07 已合入，只做最小必要接点，改动要在汇报里列出。

## 验收与汇报（流程 v2）
- 本卡验收：
  - tests/s5-09.test.mjs 全过；
  - CORE（engine、storage、plugin）逐文件全过；
  - arch-metrics、system-map 通过；
  - 静态提示 ≤10593。
- 测试运行：每个测试文件单独进程 `node --test --test-isolation=none tests/<文件>`，输出过滤为摘要。
- **不要跑 F:/dnd-tools/slow-tests.tsv 里的慢测试，也不要自己跑全部 affected 测试**：交卡后，主会话的门禁会经调度器自动跑受影响测试，并与基线比对。
- 汇报 ≤300 字，写入 F:/dnd/logs/sessions/s509-remote.final.md（UTF-8），内容包括：
  - 改了哪些文件；
  - 机制与锚点摘要；
  - 运行的测试与结果；
  - 偏离；
  - 未完成项与下一会话计划。
