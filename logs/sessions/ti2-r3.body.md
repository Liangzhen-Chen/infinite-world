续做 TOWNINC 卡 I2（原指令 F:/dnd/logs/sessions/ti2.body.md 和 ti2-r2.body.md，先读这两份；共同规则 F:/dnd/logs/sessions/s5law-common.md；先读 docs/产品原则.md）。上一位执行者（Codex）按 ti2-r2 续做到一半，因额度用尽停了，没有交接。工作树 F:/dnd-wt/TI2（分支 t-ti2，头 f9c28825），未提交的改动在 business.mjs、finance-assets.mjs、labor-market.mjs、town-work.mjs、tests/town-work.test.mjs。

先看 git status 和 git diff，判断 ti2-r2 里的两个根因各修到哪一步，然后续做，不要推倒重写：
1. 招工地点要从“雇主有权使用配方所需工作台的地点”派生；
2. 统计组采购要走 business.mjs 里 TFA 已有的统计顾客流程。

## 要做
- 补完 ti2-r2 的两处修复，以及 ti2.body.md 的其余内容；
- 钱物守恒，不发钱，职业名本身不产生收入；
- 不改测试去迁就实现：town-work 测试里的断言不能放宽或删除；如果你认为某条断言本身有错，停下说明理由。

## 验收
同 ti2-r2.body.md：
- town-work 全过，必跑清单全过；
- 30 日审计在正式世界报各组工时、收入来源（雇工、自营、帮工）、购买量、缺餐，与 t-town 对照（缺餐 17,412.5、购买 0）；
- 性能对 t-town 三对中位 ≤1.05；
- 金快照逐字段解释，不重新生成。

## 运行约束
- 所有 node 命令前加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp，文件只放 F 盘；
- 同时最多 2 个 node 进程，测试一个文件一个文件跑：`node --test --test-reporter=tap <file>`；
- 不读 secrets.json；
- 不做任何 git 提交、合并、切分支，主会话代提交；
- 不改 world/ 下已发布的内容；
- 同一个问题失败两次就停下，写明根因证据（文件:行），不要试第三种绕法。

## 文件所有权
- 不得改：npc-autonomy.mjs、household-food.mjs（卡 C 同时在做）；household-subsistence、water-cycle、npc-state、npc-schedule、education-state（K16，正在合并）。
- business.mjs、household-budget.mjs 卡 C 也在改，只做最小改动，并在交接里逐处列出。

## 交接
写入 F:/dnd/logs/sessions/TI2-final.md，≤300 字：
- 改了哪些文件；
- 两个根因的修法（文件:行）；
- 运行的命令和结果；
- 审计数字，与 t-town 对照；
- 偏离指令的地方；
- 未解决的问题。
