续做 TOWNFOOD 卡 C（原指令 F:/dnd/logs/sessions/tc.body.md；共同规则 F:/dnd/logs/sessions/s5law-common.md；先读 docs/产品原则.md）。上一位执行者（Codex）因额度用尽中途停了，没有交接。工作树 F:/dnd-wt/TC（分支 t-tc），未提交的改动是它留下的半成品：
- business.mjs、food-supply.mjs、npc-autonomy.mjs；
- 新增 server-plugin/household-food.mjs、tests/s5-law-household-processing.test.mjs、tools/audit-household-food.mjs；
- 另有 TC-audit-30.json 等。

先看 git status 和 git diff，在它的基础上续做，不要推倒重写。觉得某段做法违反原则可以改，但要在交接里说明。

## 现状（它最后一次 30 日审计，TC-audit-30.json）
- 具名户买成品 3，买原粮 0，加工 0；
- 统计组买入、加工都是 0，缺餐 17,412.5，和起点完全一样；
- 村民集市售粮 0。
也就是说，三条新路（家户加工、买原粮的决策、集市直购）在正式世界里一条都没跑起来。

## 要做
1. 先查清这三条路为什么在正式世界里都是 0，查到具体的文件:行，写进交接。可能的原因：没有触发、条件不满足、走到别的分支。不要先改参数“让它出数”。
2. 按 tc.body.md 的“要做”补完。钱物守恒，不造粮，失败了不替它补齐。
   - 如果是正式世界里真实缺条件（如缺工具、缺燃料、集期未到），如实报出来，并说明缺的是哪条规律或哪项数据；
   - 不为测试造世界内容。
3. 验收同 tc.body.md：
   - 机制测试的前提用真实动作产生；
   - 必跑清单、30 日审计、性能 ≤1.05（对 t-town 三对中位）、金快照逐字段解释。

## 运行约束
- 所有 node 命令前加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp，文件只放 F 盘；
- 同时最多 2 个 node 进程，测试一个文件一个文件跑：`node --test --test-reporter=tap <file>`；
- 不读 secrets.json；
- 不做任何 git 提交、合并、切分支，主会话代提交；
- 不改 world/ 下已发布的内容；
- 同一个问题失败两次就停下，写明根因证据（文件:行），不要试第三种绕法；
- 不放宽、不删任何断言。

## 文件所有权
- 不得改：labor-market.mjs、finance-assets.mjs、town-work.mjs（I2 同时在做）；household-subsistence、water-cycle、npc-state、npc-schedule、education-state（K16，正在合并）。
- business.mjs 是 I2 和本卡都要碰的地方，只做最小改动，并在交接里逐处列出。

## 交接
写入 F:/dnd/logs/sessions/TC-final.md，≤300 字：
- 改了哪些文件；
- 三条路为 0 的根因（文件:行）和修法；
- 运行的命令和结果；
- 审计数字，与起点对照；
- 偏离指令的地方；
- 未解决的问题。
