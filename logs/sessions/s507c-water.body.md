# 续卡 s507c-water：修交卡门禁抓出的新回归 + 完成内容审批

主会话的自动交卡门禁（沙箱外，按受影响快档测试与 s5a 基线对照）结果见 F:/dnd/logs/sessions/s507b-water.gate.md 与 .gate.tsv。**新回归**（s5a 上通过、你的工作区失败）：
- tests/advance-registry.test.mjs 3/2
- tests/entity-transitions.test.mjs 18/1
- tests/holdings-writers.test.mjs 2/1
## 要做
1. 逐个修新回归：先判断是本卡规则的合法变化（按设计对齐前提，断言改为手算数字锚点，逐处注明依据）还是实现缺陷（修实现）。advance-registry 的状态哈希快照若因本卡合法改变状态而变化，用测试自带的 UPDATE_ADVANCE_GOLDEN 流程重生成并复跑确认确定性，汇报里写明是哪项状态变化导致。holdings-writers 是"写入点必须经 holdingSet/holdingRemove"的守卫，新回归说明有直接写持有字段的地方，必须改为经接口写入，不得改守卫。
2. 完成正式内容数据的审批管线（L2 需 DeepSeek 内容审阅，属用户已授权额度，本卡上限 0.3 元，汇报实际花费；沙箱拿不到 key 就停在这一步写明）。
3. 不要自己跑慢档测试；交卡后自动门禁会重跑。
汇报 ≤300 字（UTF-8，F:/dnd/logs/sessions/s507c-water.final.md）：每个回归的根因一句（合法变化/实现缺陷）、改动文件、命令与 pass/fail、审批结果与花费。
