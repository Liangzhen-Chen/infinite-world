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
