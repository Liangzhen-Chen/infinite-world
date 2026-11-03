【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：150 分钟（到 140 分钟时停手写交接）。

# 卡 W8-E3：S5 剩余四个消费者（D32⑤ 伤愈速率、D09④ 淋湿、D10⑤ 田地已锄进度、D14 草药分种与季节密度）

先读 F:/dnd/logs/sessions/w8e-common.md（必须遵守）、docs/架构设计/ 中相关段落（grep "recoveryRate" "wound" "淋湿" "wet" "weather_exposure" "暴露状态" "已锄" "草药" "herb"），以及下列 todo 原文。

工作树 F:/dnd-wt/W8E3（分支 t-w8e3-consumers）。

## 要做（每项先查规则表与架构文档，按文档做；文档没写的数值不要编，用表里已有的；确实缺的参数追加进 world/ 表并标 calibrate-pending 和出处）
1. **D32⑤**（tests/daily-b2-events2.test.mjs:84）：
   - 生命"几天逐步回升"按伤情病程走：消费 health.json 的 wound 病程与 health:recoveryRate 槽（world/ontology/slots/core.json 已声明）。
   - 替换或叠加引擎里睡眠/休息每 30 分钟 +1 生命的固定速率，以文档为准。
   - 闭式计算（按经过时间一次算出，不逐分钟循环）。
2. **D09④**（daily-b2-world.test.mjs:42）：
   - 淋湿暴露状态 wet 由天气暴露反应规则 weather_exposure 产生（附录 A §A.18 暴露状态行）。
   - 有遮蔽、雨具、室内时不淋湿。
   - 干燥按时间与环境消退。
   - 状态派生或带来源事件，回执和人物面板能看到。
3. **D10⑤**（daily-b2-mechanisms.test.mjs:14）：田地"已锄/耕作进度"成为事实，由真实劳作（受雇锄地或自家锄地）推进，并影响该田地的产量派生（按 agriculture 现有产量派生接入，不另造公式）。
   - 参考 magic-water-earth.mjs:155 的 till 已写 tilledAreaM2：这类写法要统一到同一个事实上。
4. **D14**（daily-b2-mechanisms.test.mjs:72）：草药分种（车前、金银花等，以目录与采集表为准），季节密度与再生各自独立；采集读取它。
   - 先 grep extraction.mjs / remote-generation.mjs 的采集候选处。

四项相互独立：先做成本小的。某项若要大改（例如需要新的公共框架），停在设计说明，写进汇报，不要硬做。

## 可改文件
server-plugin/ 下：health/伤情相关（primitives-body.mjs、body-needs.mjs、medicine-state.mjs、population-health.mjs）、天气暴露相关（weather.mjs、environment*.mjs，反应规则所在文件 grep 后确认）、agriculture.mjs（只限锄地进度；W8-E1 同时会改它的私田收割函数 privateFarmAction，不要动那个函数）、magic-water-earth.mjs（till）、extraction.mjs；world/rules/、world/ontology/ 下相关表（只追加字段，不改已有数值）；ui-personal.mjs（只加显示）；对应测试与新测试 tests/w8e3-consumers.test.mjs。不改 engine.mjs：确需改的写进汇报。

## 测试
- 四条 todo 转正式用例，每条带手算锚点。
- 另跑：tests/medicine*.test.mjs、weather*.test.mjs、agriculture.test.mjs（慢，单独跑，超时就写明）、extraction*.test.mjs、daily-b2-*.test.mjs。
