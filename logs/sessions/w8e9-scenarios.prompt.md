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
限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 W8-E9：真实试玩前的场景离线复放（trade、credit）

先读 F:/dnd/logs/sessions/w8e-common.md（共同规则）。

工作树 F:/dnd-wt/W8E9，分支 t-w8e9-scenarios（基于当前 s5a）。

## 背景
- 主会话马上要跑一轮付费真实试玩（DeepSeek），场景是 tests/playtests/trade.json、credit.json、a3_whimsy.json，另加一个种地场景（另卡做）。
- S5 期间价格改为市场派生（W8-A、W8-E6），负重也加了检查（W8-C）。
- trade、credit 两个场景目前没有离线复放测试。其他场景有，做法见 tests/m2-preconditions.test.mjs 的 session()/turn()：每回合用真实工具调用代替模型，再逐条跑场景里的断言。
- 场景里写死的数值可能已经过时，例如 credit.json 的房钱 -6、最后余额 168。花钱之前要先离线确认。

## 要做
1. 新增 tests/playtest-scenarios-s5.test.mjs，仿照 m2-preconditions 的做法，为 trade.json 和 credit.json 各写一个离线复放：
   - 每回合用该回合玩家意图对应的真实工具调用，即"正确的模型应该做的调用"；
   - 逐条执行场景里的 assertions。
2. 断言失败时先判断：
   - 是引擎行为按设计变了（价格派生、负重等）：按手算更新场景 JSON 里的期望值，测试里注释写清计算；
   - 是引擎 bug：不改场景，写进汇报（文件:行、现象）。
3. 场景的玩家输入文字若写了已过时的具体金额（如"六铜房钱"），且金额已变，就同步改输入文字，保持玩家话语自然，不要写算式。
4. 不改 tests/fixtures/t64-scenarios.json：它是历史报告的冻结副本。

## 可改文件
tests/playtests/trade.json、tests/playtests/credit.json、新测试文件。不改 server-plugin/。

## 测试
逐文件跑新测试、tests/playtest-runner.test.mjs、tests/m2-preconditions.test.mjs。
