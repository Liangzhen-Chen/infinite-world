卡 a3pt-triage（A3 真实试玩失败的离线分诊与修复）。工作区 F:/dnd-wt/A3PT（分支 t-a3pt，自最新 a3a）。先读 docs/产品原则.md。
真实试玩报告（DeepSeek + SillyTavern 真实提示栈，a3a 9eddcaec 起）：F:/dnd/logs/sessions/a3-playtest/core4/真实试玩.json（7 场 142/170）与 F:/dnd/logs/sessions/a3-playtest/whimsy4/真实试玩.json。每回合 results[i].turns[j] 有 input、calls（tool、args、result，含失败原因）、assertions（pass/actual）。不调用真实模型——用记录下来的工具调用离线重放复现。
逐条分诊下列失败，归为：A 引擎缺陷（对照 master 或设计判断行为错误）→ 修产品并补机制测试；B 试玩运行器/断言口径问题 → 修工具；C 模型行为偏差（引擎正确拒绝或模型没调用）→ 只记录，不改；D 场景前提错误 → 修场景（只用真实动作）。每条写证据（回合、调用、实际返回）。
1. 工具名口径（疑 B）：craft 7/14（calls:world_craft=0，但模型调用了 world_act core:craft.manufacture / core:craft.repair）、literacy 7（world_practice）、npc_quest_social（world_quest）等。A1 设计 world_act 是翻译成旧调用的统一入口（server-plugin/action-gateway.mjs 一带）；若断言 calls:<旧工具> 时运行器只看模型调用的工具名，应改为同时认可经 world_act 翻译后的实际旧调用（按动作目录 call.tool），不放宽其余断言（args、success 仍须核对）。
2. 工具调用报错（疑 A，逐个离线重放）：trade 4 world_trade 买两只铁铰链失败；npc_quest_social 2/3/8 world_quest 发布后无任务记录、接受失败；literacy 4/5 core:learn 第二次失败且 skill_literacy 未保存、literacy 7 world_practice 报错；craft 14 core:craft.repair 两次失败；credit 4 欠款等待一小时后林穗信任未变（delta 0，今日关系账统一后可能回归）。对每个：用报告里的原参数在离线引擎重放（从同一场景开局与之前回合的真实调用序列重建状态），看实际错误；若与 master 行为不同且 master 是对的，即为回归，修复。
3. 时间与尾注（疑 C）：lodging 6、sleep 2 闲聊回合 elapsed=0；credit 7 休息到次日十点 minute 超范围——确认引擎计时正确后记为 C。
4. a3_whimsy（已由主会话改场景：拆分出行与购买、改写第 5 回合）：只读查看 whimsy4 第 1/2 回合，确认在白石镇“找到严辙并购买”在当前引擎下有真实可走的路径（他的作息与所在、交易入口），若无则为 D 或 A 并说明。
可改：根因所在的 server-plugin 模块、tools/playtest*.mjs（口径）、tests/playtests/*.json（仅 D 类，最小修改）、新增机制测试。锁定：题集、判分器、world/、docs/、静态提示（prompt/）。
验收：每个 A 类修复有离线重放复现与修后通过；node --test --test-isolation=none tests/playtest-runner.test.mjs 及被改模块的相关测试（逐个文件单独运行）通过；报告 A/B/C/D 分类表。
不调用真实模型。预计规模：中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 12 行（分类表：每条失败→类别→一句证据→处理），同样写到 F:/dnd/logs/sessions/a3pt-triage.final.txt。
