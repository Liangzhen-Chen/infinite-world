续做 a3cc-causal（同一工作区 F:/dnd-wt/A3CC，接着未提交改动）。主会话审核：来源核验、原语伤害与留痕落账的做法同意。但你去掉 full 档门槛后，非 full 人物的“信任”出现两份存储：
- 关系账（npc-relations 的 relationships 行；relationView 以 npcs[id].trust 为初值，但一旦有关系账行，其 trust 就覆盖初值）；
- 旧字段 npcs[id].trust：仍有直接写入者（activities.mjs:169 攻击扣信任、magic.mjs:130/162 施法扣信任）与直接读取者（contracts.mjs:95 赊账最低信任、npc-growth.mjs:108 授业意愿、npc-autonomy.mjs:248 显著度、scene-card.mjs 等，请 rg 复核完整清单）。
后果：有了关系账行之后，旧写入被遮住；旧读取者看不到经核验的关系变化。同一概念两份存储违反产品原则二.1 派生优先。
要做：统一成一份——所有对玩家关系的写入都走关系账（带真实来源事件、按来源去重），所有读取都走 relationView（或等价的单一视图）；旧存档里的 npcs[id].trust 作为关系账初值继续读取（兼容），不再被新代码写。不改数值规则（攻击 -5、法术 -10 等保持）。
可改：上一轮文件 + activities.mjs、magic.mjs、contracts.mjs、npc-growth.mjs、npc-autonomy.mjs、scene-card.mjs 及 rg 找到的其他直接读写 npcs[*].trust 的模块（compat/ 下的旧版本回放代码不改）；相关测试。锁定：primitives.mjs、open-actions.mjs、action-boundary/rejection/text、action-limits、primitives-runtime、primitives-checks、engine.mjs（除 world_relation 分支）、storage.mjs。
验收：上一轮的命令 + rg 找到的 contracts、npc-growth、activities、magic 相关测试文件 + tests/a3-legacy-replay.test.mjs；新增用例：非 full 人物先经核验关系变化、再被攻击，两者都反映在同一视图里；赊账/授业读取到经核验的关系变化；旧档 npcs[id].trust 作为初值读出不变。最后跑一次全部 tests/a3-*.test.mjs（排除 a3-builder-ui）。
另：tests/probes/a3-p1-p9.test.mjs E15 期待 E-OPEN-NOT-ROUTED、实得 E-OPEN-TRANSFER——请只读判断是否由你的改动引起（在 git stash 前后各跑一次该文件即可），不是你引起的就只报告。
最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3cc-causal2.final.txt。不再启动其他会话或子代理。
