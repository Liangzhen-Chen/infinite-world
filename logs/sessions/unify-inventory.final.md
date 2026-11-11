# unify-inventory 规则归一盘点

范围：只读当前工作树。决定为单一现行规则、不兼容旧存档。保留同版存档读取后重放确定性，以及重放对已记录判决、同意、签约事实的复用。完整结构化字段/路径见同目录 `unify-inventory.json`。

## 版本标记

结果回执字段集中组装于 `server-plugin/engine.mjs:291-299,331,349,358,409,448-457`，具体写入与读取按域散布：教育、法律立案/程序/审判/代理、组织同意、感知/世界事件、NPC 犯罪与情报、主权/机构、日常成本、钓鱼、野生遭遇、远方推进/人口、劳务、医疗/处方/服务、派系时钟、任务来源/村域野生、部族/军务/战争、原语、商品销售/处置、义务运行/签约/结算、贷款继承、运输义务、召唤维护。精确标记名列于 JSON。常见读点为 `replayResult?.XVersion===1`；无标记分支应改为单一现行行为并恒定输出现行回执。签约、判决、同意仍读取已记录事实，不以重算取代。

记录上的 `reservationVersion`、`deliveryVersion`、`runtimeVersion`、法律 `filingVersion/trialVersion/legalFineVersion`、业务 `boardVersion` 可能是记录判型或事实，不可直接按回执开关删除。`schemaVersion`、`releaseVersion`、`runtimeRuleVersion`、`worldVersion`、账本/持有版本也不是旧规则回执开关，应逐项独立审查。

## 派发与测试

生产入口 `server-plugin/index.mjs` 装载原生运行时；旧派发候选在 `engine.mjs` 的 Phase1/compat (`:19`)、`compat/v2-phase1-engine.mjs`、`primitiveActionRuntime()` 缺失时的 registry/handler fallback，以及 `legacy-primitives.mjs`。生产玩家路径不可达；测试/旧导入直接构造可能仍可达。先收紧生产入口，再清理 fallback/compat；保留旧 seed 转当前文档的初始化路径，除非调用证明也无用。`legacy-primitives` 对账若仍是账本唯一归账接点，先迁移写入者。

删除候选测试：`a3-daily.test.mjs` 的旧事件零分钟重放；`a3-body.test.mjs` 的无 body 表旧存档睡眠；`a3-connectors.test.mjs` 的旧适配器/预览协议；`a3-legacy-primitives.test.mjs` 旧派发适配；`a3-legacy-replay.test.mjs` 版本分支。主会话逐例过目后再删。改写并保留：原语路径权限/拒绝、账本守恒与未配对写拒绝、回执与父子来源、同版确定性、判决/同意/签约事实复用、失败原子性。不要因 fixture 或业务字段含 legacy 批删。

## 拆卡、风险、估算

建议顺序：①回执归一，约20–35文件/400–700行；②派发与 compat 清理，约8–14文件/250–450行；③测试归一，约6–12文件/200–400行。三者共享 engine/replay 接点，应串行。若分域并行，仅教育、医疗、野生、军务等互不重叠域可拆；法务和义务事实不可并行，engine.mjs 单一所有者。

风险是重放结果分叉、存档往返差异，账本/签约/同意/判决事实丢失，静态提示菜单候选变化；旧 adapter 也可能仍被公开 API 或夹具使用。性能预期收益小，需实测后陈述。粗估可删/收敛650–1,100行；回执约减30–40个版本标记，大型回执约减25–45个标量字段。测试删除前应逐例确认断言意图；JSON列出标记家族、文件和重写意图。
