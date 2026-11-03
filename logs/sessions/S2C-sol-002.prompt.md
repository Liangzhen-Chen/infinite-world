卡 S2c（持有与转移阶段收口，架构迁移核心阶段）。项目《无限原野》：中西合璧修仙文字 RPG，Node 规则引擎是唯一真相源。用中文汇报。工作区 F:/dnd-wt/S2C（分支 s2c，主会话已基于最新 master 建好；node_modules 为联接勿删）。沙箱不允许 git 写操作：只用 git status/diff/log/show/grep；改完不提交。node 命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp，最多 2 个 node 进程。

先读：docs/PLAN.md“S2 拆分”条（S2c 定义）；docs/架构设计/10-现状映射与迁移路线.md 第 98 行（S2 退出标准）与第 144 行（PR-01/PR-02 思路吸收、代码不直接合入）；04-转移协议.md；已完成基础：S2a 持有存储（server-plugin/holdings*.mjs）、S2b-1 同刻调度器（scheduler.mjs）、S2b-2 转移协议（transition.mjs、identity.mjs；报告 F:/dnd/logs/sessions/S2B2-sol-002.final.txt）。PR-01/PR-02 的 WIP 代码在 F:/dnd-wt/PR01、F:/dnd-wt/PR02（只读参考其思路：义务交接登记改为声明；条款入记录、状态派生）。

上一轮交接报告：F:/dnd/logs/sessions/S2C-sol-001.final.txt（已由主会话提交；死亡关键词模块 118→118、E02/03/06/11/14 = 20%/80%/16.7%/40%/40%）。本轮从交接报告的未完成项继续，目标是达到退出标准；优先做对 E 题与关键词指标贡献最大的旧路径。
范围：
1. 吸收 PR-01：义务交接改为声明（义务种类声明 onDebtorGone/onCreditorGone，协议按声明处理），删除各模块里手写的交接逻辑。
2. 吸收 PR-02：条款入记录、状态由条款派生（不再写死状态字段）。
3. 死亡、免职、毁损、叛离、离开全部走转移协议：用 git grep 找出所有直接处理这些事件的旧路径（关键词如 死亡/dead/died/deceased/killed、免职/dismiss、毁损/destroy、叛离/defect、离开/leave/emigrat），逐个改走协议；旧字段双写保留、对账 0 漂移。
4. 退出标准：①“死亡”关键词模块数降到个位（写一个统计脚本 tools/death-keyword-modules.mjs 报出前后数字与模块清单）；②船沉载货不悬空（R3-E10⑤，若 S2b-2 已有测试则确认）；③run-001r 的 E02/E03/E06/E11/E14 合理率 ≥80%：题面见 docs/probes/run-001/（events.md 等），找到对应的可执行测试或推演工具（grep run-001 / probe 于 tools/ 与 tests/），能脚本化的写成 tests/s2c-run001r.test.mjs，报每题结论；不能自动判分的写明原因。
5. 测试：所有改动模块的相关测试 + tests/transition-*、holdings-reconcile、ledger-reconcile、save-roundtrip、invariants/i31-total-order、advance-registry、a2-*、scale、engine/storage/plugin/system-map。金快照不可重新生成；若必须变，停下并写逐哈希依据。
硬规则：不降标准、不删/跳过测试、不改断言迁就实现；不读 secrets.json；不改 docs/架构设计/；世界内容只写 world/。单个子问题超过 1 小时无进展就记下线索继续别的。
报告 F:/dnd/logs/sessions/S2C-sol-002.final.txt；最后回复 ≤300 字：迁移了哪些旧路径（数量）、死亡关键词模块数前后、E02/03/06/11/14 结论、测试数字、import 违例前后、未完成项。如实写。
