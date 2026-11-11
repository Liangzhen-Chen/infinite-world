# W8-E 并行卡共同规则

- 基于 s5a b031bb76（W8-A/B/C/D 已合入）。几张卡同时进行，各在自己的工作树：E2=F:/dnd-wt/W8E2、E3=F:/dnd-wt/W8E3、E4=F:/dnd-wt/W8E4（后续还会有 E1/E5/E6）。**只改本卡"可改文件"列出的文件**（加上你新建的文件）；必须改别的文件时不要改，写进汇报（文件:行与原因）。
- 不提交（沙箱不能写 git），改完留在工作树，由主会话审 diff 后代提交。
- 北极星 F:/dnd/docs/产品原则.md 先读：派生优先（数值从世界状态与规则表派生，不手填、不按 ID 特判）、真实不粉饰、不为测试造东西。
- 测试：前提用真实游戏动作产生（setup.prelude / 真实工具调用），不为测试造接口、人物、地点或内容；每条新用例带手算锚点注释；不得删测试、不得放宽断言；node:test 的 todo 若已兑现就转成正式用例，未兑现就保留 todo 并把理由改准（写明缺什么、归哪个阶段）。
- W8-C 起玩家入囊有负重检查（server-plugin/carry.mjs，安全负重 10+2×力量 公斤）：新用例的行囊夹具别超重。
- **金快照**（tests/advance-registry.test.mjs）不得重生成；若变化，按"字段｜旧→新｜原因"写进 F:/dnd/logs/sessions/<卡名>-golden-table.md（用 `node F:/dnd-tools/golden-diff/golden-dump.mjs` 在 s5a 与本工作树各导一份，再 golden-diff.mjs 对比）。
- 数值：持久化只存整数或有理数，超越函数用 server-plugin/det-math.mjs；`node tools/numeric-digest.mjs` 若变化须能逐项解释。
- 新模块须在 tools/arch-layers.mjs 追加 put 行归层、在 tools/system-map.mjs 对应系统追加；tests/arch-metrics.test.mjs 不得新增违例。
- 必跑（逐文件）：改到模块的同名测试；新测试；tests/overfit-guard.test.mjs；tests/arch-metrics.test.mjs；tests/advance-registry.test.mjs；tests/numeric-persistence.test.mjs。
- 汇报（≤300 字）：改了哪些文件；每项做法一句；命令与 pass/fail 数；金快照/numeric-digest 是否变化；偏离本卡的地方；未解决的问题。
