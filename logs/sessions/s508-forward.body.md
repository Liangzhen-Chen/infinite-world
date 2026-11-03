# 卡 s508-forward：S5-08 远期运输（第 1 会话，计划共 3 会话）

工作区 F:/dnd-wt/S508（分支 t-s508，基于 s5a 最新：含 S5-01 派生、02 市场、05 资源、06 生态、07 水文）。

先读：
- docs/产品原则.md；
- F:/dnd/logs/sessions/s5-plan.final.md 的"退出"与"08 远期运输"；
- docs/架构设计/15 章 §15.1、§15.6、§15.7；
- 05 章 §5.1。

只汇报与本卡相关的结论。

## 用户已定的约束（必须遵守）
- 规则只保留一版、不做旧存档兼容：不加复演版本标记、不留旧行为分支。
- 派生优先：可派生的数值不手填，经 S5-01 派生修正槽（server-plugin/derived.mjs、world/ontology/slots）计算。
- 测试前提用真实游戏动作或 applyIntentSetup 声明非考查对象；测试走生产原生运行时；不为测试造接口或内容；不放宽断言、不删测试，改测试逐处注明设计依据。
- 不调用付费模型；世界内容只写 world/；已发布内容改动走审批管线（照 world/design/s4-law-content-approval.mjs 的做法）。**不要直接改已发布内容的生成源**：S5-03 曾直接改 W1 村庄设计文件，导致已审内容骨架变化、被判为篡改。新条款作为已审补充叠加，参照 S4 的 trialProcedureFor。
- **测试期望值不得用被测函数计算**：机制断言按设计公式手算数字字面量锚点，注释写计算步骤；手算与实现不一致时以设计为准修实现。

## 本卡结果（S5-08）
- 远期合约的预期价格读履约记录：没有履约记录、也没有担保时，不压价；已付比例与产能限制约束预期；违约降低可靠度，合意取消也降低可靠度（幅度经派生槽）。
- 运输到岸成本由真实因素构成：沿途关税、封关、路途风险与威慑、役畜运力。货款有位置：在途时在承运方或托管处，不凭空存在。
- 推进步长等价；失败操作零写入；存档往返一致。

## 机制断言（tests/s5-08.test.mjs，均含手算锚点）
- 无记录无担保的远期报价；
- 已付比例对预期的影响；
- 违约与合意取消后的可靠度变化；
- 一条两段路线的到岸成本分解：税、风险、运力各一个数字；
- 封关时拒绝或改道；
- 在途货款位置与守恒；
- 步长等价、失败零写入、存档往返。

## 可改
- server-plugin/transport.mjs、server-plugin/finance-tax.mjs，以及远期义务的直接消费者；
- world/ 下相关数据（经审批管线）；
- tests/s5-08.test.mjs。

锁：
- credit、finance-bank、money、documents：S5-03 在改，只读调用；
- remote-generation：S5-09 在改；
- business、labor-market、manufacturing、npc-autonomy：S5-04 待做；
- engine、primitives-runtime：S5-10 独占。

## 验收与汇报（流程 v2）
- 本卡验收：tests/s5-08.test.mjs 全过，CORE（engine、storage、plugin）逐文件全过，arch-metrics、system-map 通过，静态提示 ≤10593。
- 每个测试文件单独进程：`node --test --test-isolation=none tests/<文件>`，输出过滤为摘要。
- **不要跑 F:/dnd-tools/slow-tests.tsv 里的慢测试，也不要自己跑全部 affected 测试**：交卡后主会话的门禁会经调度器自动跑受影响测试，并与基线比对。
- 汇报 ≤300 字（UTF-8，F:/dnd/logs/sessions/s508-forward.final.md）：改了哪些文件、机制与锚点摘要、运行的测试与结果、偏离、未完成项与下一会话计划。
