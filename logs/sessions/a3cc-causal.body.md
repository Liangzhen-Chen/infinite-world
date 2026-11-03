卡 a3cc-causal（A3 收口：行为后果真实连锁到关系与立场）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3CC（分支 t-a3cc，自 a3a）。先读 docs/产品原则.md（一.4 后果真实、可追溯：立场、记忆会连锁；二.4 不伪造）。

目标（一句话）：玩家打伤人、在人前留下侮辱或神圣的痕迹，对方和目击者的信任/立场会真实变化并有来源事件可查；而凭空引用一个不存在的事件不能刷关系。

主会话已核实的三处缺陷（Astra 审计 03/05/07）：
1. （03）server-plugin/engine.mjs 约 994–1004 行 world_relation：非 full 档人物走旧直写分支，只检查 sourceEvent 非空、事件类型在名单内，就按默认值改 trust 并追加 developments；同一不存在的“帮助”事件引用两次，信任 0→6。改为所有人物统一核验来源事件真实存在（存档事件/记录里能找到、且与双方相关）并按来源去重——复用 npc-relations.mjs 已有的 evidenceKeys 去重与 applyNpcRelation 的核验；删除旧直写分支（旧存档里已有的 developments 读取兼容保留）。
2. （05）原语伤害没有接上关系账：server-plugin/world-events.mjs:216 publishTransitionEvent 传入事后 before 与空 detail，而 npc-relations.mjs:104 的冲突关系要求 detail.targetHp，于是开放原语打伤 full NPC（生命 100→91）后信任不变。改为传递真实的事前状态与伤害结果，复用既有冲突关系记账与事件去重。原语发布处在 primitives.mjs（另一张卡正在改，本卡不碰）；若只能在 primitives.mjs 修，停下报告最小改动。
3. （07）server-plugin/mark-reactions.mjs:30/33 留痕立场反应只算出 delta（三个观察者各 -2）却无人落账，立场不变。接入现有立场/关系证据消费者，按真实事件去重，观察者须真实在场或之后真实看见。
可改：server-plugin/engine.mjs（仅 world_relation 分支）、npc-relations.mjs、world-events.mjs、mark-reactions.mjs；tests/a3-marks.test.mjs 及相关关系测试（rg 找 world_relation、npc-relations 的测试）；新增 tests/a3-causal-chain.test.mjs。锁定：primitives.mjs、open-actions.mjs、action-*.mjs、transport/obligation/credit/finance-bank、quest-board、festival 及其余文件。
验收：node --test --test-isolation=none tests/a3-causal-chain.test.mjs tests/a3-marks.test.mjs，以及 rg 找到的 world_relation/npc-relations 相关测试文件；最后跑一次全部 tests/a3-*.test.mjs（排除 a3-builder-ui），确认失败只有三个既有项（阶段门槛、r13、R2 137）。
新测试须覆盖：引用不存在或与双方无关的事件被拒且零写入；同一真实事件重复引用只计一次；开放原语伤害 full NPC 后信任/恐惧按既有冲突规则变化且有来源；留痕后在场观察者立场真实变化、不在场者不变、7 日内同作者同标签同地点逐次减半（§6.7 已有规则）；存档往返。
不调用真实模型。预计规模：中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要。题集与判分器冻结。不为测试新增生产接口或世界内容；前提用真实动作。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/a3cc-causal.final.txt。
