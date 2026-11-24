# F 盘与仓库清理记录（2026-11-24 夜，亮圳【停工清理1124】）

亮圳原话（伦敦 11-24 22:16）：「让claude暂停手上工作，整理工作区以及在我f盘本项目拉的所有大便。」随后补充：「你来决定本项目的所有文件删还是留，只保留项目推进所需内容。」

## 停工
- 停工时本项目没有在跑的卡或后台任务（只剩主会话自己）。Step 1 第二轮 DeepSeek 写码在上个会话结束时中断，写到一半的改动已留底（见下文备份）。

## 备份在哪
- **GitHub 分支 `backup/pre-cleanup-1124`（c4072b022）**：一个只为可达性留底的提交，父提交覆盖清理前所有没推到 GitHub 的东西——约 150 个本地分支末端、各 worktree 的 HEAD、2 个 stash、Step 1 第二轮中断改动（7b0309eaa）、F:/dnd 工作区未跟踪的 81 份 logs/sessions 旧会话日志（b158d20aa），以及清理时删掉的 5 个远端旧分支里独有的提交（book-reference、ds/b2w3、t-a1-overlay、t-acc、t-llm1）。树取 origin/master，只作留底，不用于开发。
- **留底标签 `pre-rewrite-1124`**（ae71f231e）：整理前的主线。
- 删前复查：本地分支、worktree HEAD、stash 里没有任何提交是 GitHub 上找不到的。

## 删了什么（大小为删前实测）

| 路径 | 删前大小 | 内容 | 留底 |
|---|---|---|---|
| F:/dnd-wt（163 个 worktree） | 134.6 GB | 历次卡的写码、出题、审卡工作区（每个是整份仓库检出） | 提交都在 GitHub（上表备份分支或原分支） |
| F:/dnd-tmp（除 3 个密钥文件外全部，含 worktree acc-234） | 21.9 GB | 临时卡文、产物、测试输出、旧补丁、小说正文副本 | 卡文与审查原文都已进各卡档案；小说正文不入库 |
| F:/temp 下本项目测试临时目录（outgate-*、save-*、saveroute-*、dex-* 等 16 类，75,556 个） | 约 3 GB | 测试用 testTempRoot 残留 | 无需留底 |
| F:/dnd-backup | 1.1 GB | 11-18 旧骨架 worktree 补丁与压缩包 | 对应分支在 GitHub；旧骨架不再续用 |
| F:/dnd-wt/SillyTavern、F:/dnd-wt$WT | （含在 dnd-wt） | 两份多余的酒馆副本 | 正式酒馆在 F:/dnd/SillyTavern，未动 |
| F:/dnd-worktrees | 0 | 空目录 | — |
| F:/dnd 未跟踪文件 | 很小 | logs/sessions 81 份旧会话日志、tools/bis-a2.mjs（引用已不存在的 engine.mjs 的旧二分脚本） | 日志在备份分支 |
| 本地分支 205 个、远端分支 33 个 | — | 已合并或已备份的卡分支 | 全部可从 master 或备份分支找到 |

F 盘清理后可用空间 386.1 GB；本项目目录合计由约 190 GB 降到约 5 GB（F:/dnd 正式克隆，含酒馆与依赖）。

## 留了什么
- **F:/dnd**：唯一的正式仓库克隆（已快进到 origin/master ae71f231e），含正在用的 SillyTavern 与其 data（secrets.json 未动、未读）。
- **F:/dnd/.claude/worktrees/new-session-8e4637**：主会话当前所在工作区（在用）。
- **F:/dnd-tmp/kh_tc、tc_dnd_patrol、tc_dnd_patrol2**：腾讯云测试台的主机指纹与私钥，上云测试要用，未动、未读。
- **F:/dnd-tools**：亮圳指示不动（agy 在里面）。
- **F:/Codex**：Codex 程序主目录（CODEX_HOME，含登录文件），不是本项目产物。
- 本地 stash 2 个：已在备份分支，项目规矩禁用 git stash 命令，未清。
- GitHub 远端分支只留 5 个：master、rewrite-guide-1124、chore/workspace-cleanup（待 Gemini 复审）、chore/step1-tooling（已暂停）、backup/pre-cleanup-1124。

## 没删成的
- **F:/codex-tmp（剩约 3.06 GB、72,923 个文件）**：Codex 的临时目录（含两个 Python 虚拟环境）。删除被运行环境的安全规则拦下（判为受保护路径），未绕过；亮圳可手动删除。

## .gitignore 补充
- 腾讯云私钥与指纹：tools/cloud/tc_dnd*、tc_review*、tc_admin*、tools/cloud/*.pub、tools/cloud/known_hosts。
- 通知本地配置与队列：tools/notify/config.local.json、tools/notify/outbox/、tools/notify/sent/。

## 仓库整理（指南第 2–3 章）
- 第 2–3 章的删除、归档、换规矩已在分支 chore/workspace-cleanup 做完（294245c0b，全量 2239/2239），待 Gemini 复审后再合入 master；本记录与 .gitignore 补充也提交在这个分支上。
