# ds-dispatch 回报（派卡程序进仓库：卡头拼接、拒派与测试）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卡文依据两条已照录进下方「依据原句」：`docs/派活卡头规矩.md:36`「## 四、给派卡人（主会话）的写卡规矩」、`:37`「卡文顺序固定：①本卡头（上面一至三节）→……」；`docs/审查/李白裁定-1117.md:1026`「派卡脚本自动拼接规矩：卡文开头和 docs/派活卡头规矩.md 不一致，脚本拒绝派出。」卡尾文字照 `F:/dnd-tools/api/run-card-ds.sh:30-31` 原样搬（只读抄文字） |
| 2 | 没有按 id/名字/场景写特例 | 是 | `tools/dispatch/compose-card.mjs:24-42` 只有规矩全文逐字比对与固定卡尾拼接；卡头标记由规矩文件首行标题派生（`:18-22`），不按 id、文件名、卷名开分支；两个 sh 只调 compose-card.mjs，不再在 shell 里拼 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 规矩为空与纯空白两路都拒：`tools/dispatch/compose-card.mjs:26`，测试 `tests/accept/dispatch-compose.test.mjs:38-41`（`''` 与 `'\n\n'` 均抛「规矩为空，拒派」）；header 为 null 经 `String(text ?? '')` 同样落空拒；卡文自带卡头先按标题识别、再要求与规矩全文逐字前缀相同，否则拒（`:30-34`），拼完再核开头（`:41`）；无「空/不限放行」的分支 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望全由 `docs/派活卡头规矩.md` 原文（测试 `:10-14`）与测试内构造输入推出：`:24` 改一句造不同卡头、`:30` 拼自带头卡文；assert 无基线计数、无当下 diff 读数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未改任何既有代码或测试；新增文件独立，全量测试本卡只加 5 条（517 通过），未降阈值、未改期望、无假常量 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | diff 共 198 行：`git diff --cached --numstat` → `.gitattributes 3`、`tests/accept/dispatch-compose.test.mjs 47`、`tools/dispatch/compose-card.mjs 90`、`tools/dispatch/run-card-ds.sh 31`、`tools/dispatch/run-card.sh 27`；另本回报随提交。卡文清单外只多 `.gitattributes` 一行规则（另 2 行为注释与空行）：新增 sh 脚本在 `core.autocrlf=true` 的 Windows 检出会变 CRLF，带 CR 的 `#!/bin/sh` 与每行命令无法执行，仓库已有 `.githooks/* text eol=lf` 同理；按 AGENTS.md「完成本卡必需的……接点……已有任务授权，先说明实际扩展」先说明，主会话可核 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 517 / ℹ pass 517 / ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。`sh -n` 未跑，原因见备注 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 派卡流程从仓库外手工拼接收进仓库、卡头自动置顶且不一致即拒，派卡行为有 5 条测试可核、可复现；没有写死、特例、跳规则引擎或假数据 |

## 依据原句

- `docs/派活卡头规矩.md:36-37`：
  `## 四、给派卡人（主会话）的写卡规矩`
  `- 卡文顺序固定：①本卡头（上面一至三节）→ ②目标 2–3 句大白话（做什么、为什么、做完游戏多了什么）→ ③要照做的卷文原句（带"卷:行"）→ ④只需要的文件片段 → ⑤验收命令。`
- `docs/审查/李白裁定-1117.md:1026`（李白 11-18 17:45 补充第 2 条）：
  `2. 派卡脚本自动拼接规矩：卡文开头和 docs/派活卡头规矩.md 不一致，脚本拒绝派出。`

## 做了什么

- `tools/dispatch/compose-card.mjs`：导出纯函数 `composeCard(header, card, branch)`——规矩全文＋分隔行＋卡文＋卡尾；卡文自带卡头（含规矩首行标题）须与 header 逐字相同才放行且不重复拼，否则抛错；规矩为空抛错；拼完复核开头。命令行从 `git -C <工作目录> show origin/master:docs/派活卡头规矩.md` 取规矩、从 `rev-parse --abbrev-ref HEAD` 取分支（`/` 换 `-`），任何一步失败非 0 退出。
- `tools/dispatch/run-card-ds.sh`、`tools/dispatch/run-card.sh`：照 `F:/dnd-tools/api/` 两个现有脚本搬，唯一改动是提示改由 `compose-card.mjs` 生成（`prompt="$(node "$here/compose-card.mjs" "$wd" "$pf")" || exit 2`）；只在子进程设环境变量、清 Claude 密钥、`DND_CARD_AGENT=1`、allowedTools、`--output-format json`、无 `--bare` 全部原样。
- `tests/accept/dispatch-compose.test.mjs`：5 条，覆盖第一段逐字相同、自带不同卡头拒、自带相同卡头不重复、规矩为空拒、卡尾含 `docs/卡回报/<分支>.md`。
- `.gitattributes`：加 `tools/dispatch/*.sh text eol=lf`（必要接点，见第 6 项说明）。

## 验收命令与末行

- `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 517 / ℹ pass 517 / ℹ fail 0`
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`
- `node tools/dispatch/compose-card.mjs . docs/卡回报/ds-b4-3.md` → 首行 `# 派活卡头硬规矩（亮圳2026-11-18批准；任何人给任何子代理派活，每份任务最顶上原样放）`，末行为卡尾的 `docs/卡回报/ds-dispatch.md` 一句
- `sh -n tools/dispatch/run-card-ds.sh`、`sh -n tools/dispatch/run-card.sh` → 未跑

## 备注

- **`sh -n` 未跑**：本卡派发时 allowedTools 未含 `sh`，两条 `sh -n` 均被权限层拦下（返回「This command requires approval」），不是我没敲。原命令照上，请主会话复核时补跑或核语法。
- **CRLF**：本机 `core.autocrlf=true`，既有文件（含 `docs/派活卡头规矩.md`）检出为 CRLF。新增 sh 脚本若不钉成 LF，合并后主仓检出会带 CR，`sh` 无法执行；故在 `.gitattributes` 加一行，理由同仓库现有的 `.githooks/* text eol=lf`。
- 仓库外 `F:/dnd-tools/api/run-card-ds.sh`、`run-card.sh` 未改（卡文要求主会话合入后再改），当前仍在用旧拼接。
