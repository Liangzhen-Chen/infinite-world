# A1b 计划（A1 动作层三处缺陷修复）

分支 a1b（F:/dnd-wt/A1B），不合入 master。约束：不碰 ledger.mjs 与物品写入路径、wildlife、agriculture 实现。

- [ ] 1. 同意规则：同意只能来自被作用的一方本人。动作数据声明 consent.from（self / party 槽 / target…）；本人则 world_act 放行（求医由引擎派生同意，不收调用方填的），NPC 则拒绝并答“需要对方答应”，任何情况不收替 NPC 填的同意；店主出租、钱庄放贷走旧判定。
- [ ] 2. 战斗等动作的回执 applied 补上对方受伤/倒下、经验升级、掉落（尸体）、武器耐久；事件流模板据此显示。
- [ ] 3. dayOffset 上限查明；world_act 层把超过单次上限的推进拆成多段。
- [ ] 4. 补测试；跑验收（a1-、daily-、CORE、advance-registry、arch-metrics、prompt、save-roundtrip）；merge master 复跑；提交；写汇报。
