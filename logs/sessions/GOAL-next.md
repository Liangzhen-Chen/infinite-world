项目在 F:/dnd，《无限原野》。我（Claude）是主会话：调度、审卡、代提交与合并、维护文档；不亲自写大块功能代码，不通读代码。执行全部交 Codex：写 logs/sessions/<卡>-sol-<n>.prompt.md，用 run_in_background 运行 `sh logs/sessions/run-codex.sh <名> gpt-6.1-sol F:/dnd-wt/<卡> [net]`（net=需要 DeepSeek；规划/审计用 gpt-6-astra），绝不用 & 后台启动（会漏通知）。Codex 沙箱拦 git：我在 worktree 里 git add/commit，合 master，冲突简单的自己解、复杂的交 Codex 解（合并中勿 abort），再在沙箱外跑 CORE+卡测后 --no-ff 合入主线，登记 docs/PROGRESS.md、docs/CHANGELOG.md、PLAN 标完成，删 worktree（node_modules/SillyTavern 是联接，删前确认主线目录仍在）。同时最多约 5 个 Codex 会话，改同一批核心文件的卡错开。

目标：按 docs/无限原野_开发指南v2.md 与用户后续决定做完整个世界，系统全部接在底层上（“阶乘玩法”），然后跑最终验收。待办唯一依据：docs/PLAN.md 的「剩余工作总表」「真实世界缺口（RW）」「个体视图与状态贯通」；进度看 docs/当前状态.md、docs/PROGRESS.md 末段；用户决定看 docs/待用户确认.md。

设计原则（用户定）：
- 派生优先：由身份、职位、关系、所在地、季节等当前状态决定的东西一律读取时派生（经 server-plugin/entity-view.mjs），不写死；适用于世界所有个体（人、精怪、物品、建筑、聚落、势力）。审卡与验收专门查写死值。
- 新内容只写数据就能接入（系统地图 docs/system-map.html 由 tools/system-map.mjs 生成，新模块必须登记）。
- 技术取舍自己定，不问用户；只问玩法、内容方向、花费、部署。
- 用户已定：M2/M3/M8 审查拒绝某回合保留原文记失败继续整场（M2P 已实现）；精神/辅助/治疗法术需对方同意（C1 已实现）；试玩开新角色，不管旧存档；部署等世界做完再问。俸禄由主会话定（已实现）。

硬约束：不读 secrets.json，DeepSeek 只用环境变量 DEEPSEEK_API_KEY；不部署到用户酒馆，不动原存档；世界内容只写 world/，不手改 dist/；不缩减世界规模，不降低测试标准和完整档门槛，不删除失败测试，保留基线23项预期失败；真实模型费用如实记账（每卡独立预算账）；静态提示硬上限 12000（node -e 读 tools/build-card.mjs 的 loadPromptBundle 查数，接近上限就开压缩卡）。

当前进行中（接手时先查各 logs/sessions/<卡>-sol-*.last.txt 与 worktree 状态）：
- P4 提示压缩（F:/dnd-wt/P4，已提交并合过 master，11394→约10520）：在沙箱外逐文件跑 m2-/m3-/consistency/playtest 测试（大用例需 NODE_OPTIONS=--max-old-space-size=8192），无新增失败就合入。
- RW-04 林水（F:/dnd-wt/RW04，Codex 跑了很久，未提交）。
- RW-06 诊疗（F:/dnd-wt/RW06，Codex 运行中）。

剩余工作顺序：
1. 合 P4、RW-04、RW-06；再派 RW-08 门派资源、RW-10 畜牧（依赖 RW-04）。
2. 后续缺口（RW 审计列为后置）：情报与间谍、秘密结社、语言与方言、阴间与亡魂社会、监狱经营、娱乐场所（茶馆赌坊比武大会）、地震山火等更多灾害、NPC 获批宅基自建（复用 RW-03 入口）、离屏组织目标落成议案。按依赖排卡。
3. 回归收口：每合几张就在主线逐文件跑一次相关测试，出现回归开 R 卡修；已知旧失败：m2/m3 两项（审稿遗忘视图、零级实战死亡前置）、public-opinion:167、return-summary:114；agriculture.test 需空闲时单独跑（约1小时）。
4. 跨区旅行与贸易实证（M7）、界面验收（M6：创建至存档、面板、远方地图、390×844）。
5. 真实模型试玩与浸泡（M2P 口径）：M2 复验、M3 长程（200 回合记忆、两人格各150轮）、M8 各场景每场5次与五人格各300轮；费用按 PLAN 额度并如实记账。
6. 最终：npm test、npm run build:release、npm run build:final，更新 docs/当前状态.md，打 review 标签，交 Astra 做一次阶段审核，再用几行告诉用户：完成了什么、现在能玩到什么、卡在哪里、需要用户决定什么（含部署）。

工作方式：无人值守，不停下来等用户；额度用尽时停在原地即可（不要主动结束这一轮让用户说“继续”）；同一问题两种修法失败就换思路派一次，仍不行标卡住继续别的；每合三张卡检查给玩家多了什么。
