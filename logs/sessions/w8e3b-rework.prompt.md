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
限时：120 分钟（到 110 分钟时停手写交接）。

# W8-E3 返工（续你上一轮）

主会话审了你的 diff。耕作面积统一事实、淋湿/干燥、人物面板这几部分接受。下面三处要改，并放开对应文件。

## 1. D32⑤ 伤愈：只留一条回血规则（打回重做）
你在 body-needs.mjs finishSleep 里翻 `d.patches` 找"固定回血写入之前的 HP"再覆盖，还加了 `healthEnabled:!engine.replaying||...` 复演分支。两点都不接受：
- **规则只一版**：不能先让旧规则 +1/30 分钟写一遍，再用补丁回放撤销重算。
- 本项目不做旧存档/复演兼容，也不加复演判断分支。

改法：
- **现放开 server-plugin/engine.mjs**，只限睡眠/休息回血那一处（engine.time 里每 30 分钟 +1 生命的位置，grep 确认）。
- 在源头把休息回血改为一个函数：
  - 有伤情记录时，按 health.json wound 病程与 health:recoveryRate 闭式计算（沿用你的 (1−rate)^(天数) 分段做法）；
  - 没有伤情记录时，按原来的速率。两者在同一个函数里分支，不再有第二处写 HP。
- 删掉 body-needs.mjs 里的 patches 嗅探、replay 分支，以及 beginSleep 为此加的 hp/patchStart/healthEnabled/wounds 字段。
- 金快照若因此变化，按"字段｜旧→新｜原因"补进 w8e3-golden-table.md，不重生成。

## 2. D14 草药分种与季节密度：做
放开你在交接里列的文件：server-plugin/sites.mjs、world/meta/items.json、world/geo/locations.json（只追加或搬移数据，不改已有数值）。
- 分种（车前、金银花等以目录为准）；
- 每种的季节密度和再生各自独立；
- 采集读取它们；
- 对应 todo（daily-b2-mechanisms.test.mjs:72）转正式用例，带手算锚点。

## 3. 淋湿文字回执：做
放开 server-plugin/applied-effects.mjs、server-plugin/action-text.mjs（只限加淋湿/干燥的回执文字）。

## 其余要求不变
- 共同规则见 F:/dnd/logs/sessions/w8e-common.md。
- 逐文件跑：w8e3-consumers、daily-b2-*、medicine、weather、environment、a3-body、engine、advance-registry、arch-metrics、numeric-persistence。
- agriculture.test.mjs 很慢，不必等它；写明未跑。
- 汇报 ≤300 字。
