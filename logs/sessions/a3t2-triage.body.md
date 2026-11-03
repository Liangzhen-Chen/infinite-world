卡 a3t2-triage（A3 真实试玩 contract2 的离线分诊与修复；不调用真实模型）。工作区 F:/dnd-wt/A3T2（分支 t-a3t2，自 a3a de577fe1）。先读 docs/产品原则.md 与 docs/架构设计/修订记录.md 第 3 条。
报告：F:/dnd/logs/sessions/a3-playtest/contract2/真实试玩.json、真实试玩失败.json；服务端 sidecar 在 F:/dnd/.git/playtest-runs/a3-pt-contract2-1024/server/（只读）。89/131。
逐条分诊失败为 A 引擎缺陷 / B 试玩工具或断言口径 / C 模型行为（引擎正确拒绝或模型选错）/ D 场景前提错误，每条写证据（回合、调用、返回）。重点：
- 强制补跑时模型对明显行动回合选了 world_no_action（奇思妙想第 6 回合许愿变灵药、交谈打听第 3 回合接受委托）：判断补跑请求里 no_action 的说明或候选展示是否诱导误选；若构造器已对玩家原文给出明确行动候选，补跑请求应把候选作为首选并说明 no_action 只用于纯闲聊/纯观察——属工具/编排问题（B），最小修 extension/turn-contract.mjs 的补跑请求，不增加静态提示。
- 修理（world_craft repair）、委托（world_quest）反复失败：用记录的原参数离线重放，看报错是否给出可纠正的写法；若报错不可纠正或参数说明有误属 A/B 并修；纯模型填错属 C。
- 审查 unverified 17 次：用 sidecar 抽查是否仍有 F 类误伤（同 a3rv 口径），有则修根因、保留真拦。
可改：extension/turn-contract.mjs、server-plugin 中被证实有缺陷的模块（逐处列出）、tools/playtest-*.mjs（口径）、tests/playtests/*.json（仅 D）、相关测试与新增离线回归。锁定：门禁规则本身、题集、判分器、world/、prompt/（静态 ≤10593）。
验收：被改模块相关测试与新增离线回归逐文件单独运行通过；报告 A/B/C/D 分类表（每类计数 + 代表例）。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3t2-triage.final.txt。
