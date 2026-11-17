# 每轮必守规矩（无限原野；李白 11-17 定，压缩后从磁盘重读）

只放规矩，不放进度。进度与裁定见 docs/当前状态.md、docs/PLAN.md 末节、docs/统一底层设计/审查/李白裁定-1117.md。项目通则另见 AGENTS.md。

## 分工

- 主会话只派卡、看结果、合并；具体活交执行者。
- 写或改：Sonnet 5.5 中档。难的（内核、加载器、跨三卷以上、同项错两次）：Opus 5.5 中档。不用 Fable。
- 派卡时写明模型全名与 effort（claude-sonnet-5-5 / claude-opus-5-5，medium）。

## 只核分档

- 写代码的卡、跨卷改动、牵涉裁定的卡：另一个 Opus 5.5 中档只核。
- 只改单个文档的小修（勘误、计数、措辞、记账）：另一个 Sonnet 5.5 中档只核。
- Sonnet 核两轮不过、或它自己报拿不准：升 Opus 5.5 中档再核。
- 只核判"必须改"的：改完至少派 Sonnet 5.5 中档复核一次再封，主会话不得改完不复核。
- 只核原始输出入库 docs/统一底层设计/审查/，路径写进提交说明。PLAN 记谁核、为何这一档。

## 开工与排期

- 每块开工前先做迁移体检（docs/迁移体检/块N.md），经另一个 Opus 只核放行后才派写码卡。
- 排期每条"谁先谁后、谁能并行"注明卷、节、行；没有出处的不排。
- 共用文件同一时段只由一路独占写，其他路只读；冲突即串行。

## 回报

- 每次回报李白写明照的是哪一卷，带卷标题（如"卷三甲《物质本源》"）。
- 每卡封进 master 都发通知：`D:/Anaconda/python.exe F:/dnd-tools/notify/enqueue.py <delivered|blocked|answer> "<≤300字>" "<≤300字>" < /dev/null`，再跑 `D:/Anaconda/python.exe F:/dnd-tools/notify/notify.py < /dev/null`（必须带 `< /dev/null`）。
- 卷文推不出、卷文矛盾、要改裁定方向的：停下报李白，不自补、不自选。

## API 派卡（周四 2026-11-19 10:00 前）

- 具体活一律 `claude -p` 带 API 密钥跑：`sh F:/dnd-tools/api/run-card.sh <模型全名> medium <worktree> <卡文文件>`。worktree 放 F:/dnd-wt/api-<卡名>，卡文放 F:/dnd-tmp/api-cards/。
- 密钥只从用户环境变量 CLAUDE_API_KEY 在子进程内读，不得打印、复制、写入仓库或日志。
- PLAN 记每卡花费（total_cost_usd）、写的模型、只核的模型及原因；每天报一次 API 累计，到 150 美元单独报李白一次。

## 仓库与环境

- 仓库只在 F 盘，不许用亮圳的 C 盘；临时文件放 F:/dnd-tmp。
- 不改 C 盘全局设置、全局 CLI、PATH 与钩子。
- 提交钩子已挂（.githooks/pre-commit），不许 --no-verify。
- 禁用：node -e、node -p、python -c、heredoc、sed -i、任何输出重定向写文件（含 > /dev/null、tee）。写文件只用 Write/Edit。
- 已封卷只走封卷后勘误：先追加"勘误前"快照、不覆盖旧快照、不升版本号、历史修订记录不回改。
- 不准硬编码：修复落在规则层或原语层，不按单个 id、文件名、卷名特判。
- 压缩由亮圳在块与块之间手动发，主会话不自行清空会话。
