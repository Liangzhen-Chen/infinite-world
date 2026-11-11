你是《无限原野》（Node 规则引擎驱动的中西合璧修仙文字 RPG；规则引擎是唯一真相，LLM 只做可选叙述与意图解析）的修复工程师。用中文汇报。
**先读 docs/产品原则.md（北极星），本卡一切取舍以其为准。**

背景：10-22 全面审查发现了 Codex 执行者留下的问题，汇总在 F:/dnd/logs/sessions/review-1022-findings.md（每条带文件:行号与证据）。设计依据在本工作树 docs/架构设计/（目标架构 v10；01 账本与持有、04 生命周期、05 统一模型、06 动作层与开放动作、10 迁移路线）。你只负责下面指定的部分，不要改其他三路负责的文件（见文末分工表）。

硬约束（违反即返工）：
- 不读 secrets.json；不部署；不动用户原存档；世界内容只写 world/，不手改 dist/，已发布档案只能经仓库现有审批/发布管线（tools/ 下的 publish-*/content-pipeline）重新生成。
- 不降标准：不删测试、不跳过、不放宽断言；改断言只限“设计文档明确规定了新行为”，并在旁注写章节依据。不得为通过题集而按题号/ID/原句写特判——修复的目标正是删掉这类特判，改为从数据、动作目录、槽位或原生状态派生。
- 静态提示 ≤10593（tests/a3-tool-surface.test.mjs 校验），新参数只进动作目录（world/actions/*.json 的槽位），不进 extension/tools.mjs 的静态 schema。
- 所有 node 命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp；同时最多 2 个 node 进程；只结束自己启动的进程；文件只放 F 盘；临时调试文件结束前删除。

工作方式：在你的工作树里直接改、自己跑测试、按逻辑分几次 git commit（提交信息英文一句话，末尾加一行 `Co-Authored-By: Claude <noreply@anthropic.com>`）。修完一项就跑受影响的测试文件；收尾跑 tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs（CORE）与 tests/a3-*.test.mjs（排除 a3-builder-ui 浏览器测试）。判分：`node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<你的分支名>-score.json`。删掉特判后分数下降是预期的——如实报告下降多少、哪些题，不要为了保分保留或换个形式重写特判。

汇报（≤500 字）：逐条列出处理了哪些发现（文件:行号 → 怎么改），哪些判定为误报及理由，测试结果（通过/失败数，失败的逐条原因），A3 分数前后对比，未完成项。

分工表：A 判分器 = tools/a3-score.mjs、tools/a3-setup/*、tests/a3-score-self.test.mjs、tests/a3-acceptance.test.mjs；B 核心引擎 = server-plugin/ 的 action-router、routing-programs、open-actions、action-boundary、action-rejection、primitives、primitives-runtime、legacy-primitives、primitives-effects、action-consent、action-rite、action-capacity、action-affordances、engine.mjs、schemas/action.schema.json；C 领域模块 = 其余 server-plugin/ 文件（environment、education-state、items、agriculture、quest-board、governance、subjective-view、map-state、combat、primitives-learning、native-primitives、magic-consent、faith、money、world-events、facility-state、primitives-movement、local-exams、workstation-services、primitives-body、law、obligation-runtime、finance-bank、civic 等）及它们需要的 world/rules 数据表；D 世界数据与测试 = world/（除 C 新增的规则表外）、extension/、tools/publish-* 与内容管线、tests/ 中除 A 列出的以外的既有测试与 fixture。
