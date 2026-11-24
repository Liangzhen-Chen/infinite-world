# 卡回报 ds-brclean（GitHub 远程分支清理；亮圳 11-18 17:48 授权，李白 17:50 转）

## 交卷前自查（卡头第三节八项）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 本卡为 git 远程操作卡，无卷文条目；逐条照卡文"目标"与"要做"1–5 执行，未自补。对应见本回报"做了什么"1–5。 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 统一规则：祖先判定（merge-base）、worktree 挂载判定、卡文指定 book-reference 保留；未按单个名字开分支特例。 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 无代码限额/校验实现；删除前逐支核 `git merge-base --is-ancestor`（158 支退出码全 0）、45 个 archive 标签全部核到远程后才删对应分支；空/异常不跳过。未使用 force-push。 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 未新增测试；前后计数 308/105、0/45 是当次验收读数，未写进任何测试断言。 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无代码改动；未为计数好看改任何东西；记录如实写"保留 103、未合并 45 全打标签"。 |
| 6 | 只改了卡文列出的文件；diff 共 375 行 | 是 | 只新增 `docs/归档/清理记录-1118.md`（343 行）与 `docs/卡回报/ds-brclean.md`（32 行），两新文件共 375 行；`git status --short` 仅这两项。远程只删分支、只加 `archive/*` 标签。 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 本卡仅 git 远程操作与文档，无代码/测试改动，全量测试不适用。卡文验收命令已跑：`git branch -r \| wc -l` 308→105；`git ls-remote --tags origin 'archive/*' \| wc -l` 0→45。提交关口：`node tools/accept/commit-hook.mjs` → `pre_commit pass 887f9ba09b8238400b51d23312f1b207eb4987eb66e68ed2b3cd5bffce35ffad`（0 fail）。 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 远程分支从 308 清到 105，未合并工作全部有 `archive/*` 标签可恢复，后续派卡/查分支不再被陈旧分支淹没；本卡不动游戏代码与世界数据，无写死、无特例、未跳过规则引擎、未缩规模。 |

## 做了什么（对应卡文"要做"1–5）

1. `git fetch --prune origin`；列远程分支并排除 `origin/HEAD`、`origin/master`、`origin/book-reference`。操作前 `git branch -r | wc -l` = 308。
2. **已合并**：逐支 `git merge-base --is-ancestor origin/<分支> origin/master`，退出码 0 的共 158 个；四批 `git push origin --delete` 全部返回 `[deleted]`。逐支清单与证据见 `docs/归档/清理记录-1118.md` 表一。
3. **未合并**：45 个（book-reference 与 worktree 挂载的 21 个未合并分支按下条保留）。逐支用 `git log --oneline origin/master..origin/<分支>` 与 `git cherry origin/master origin/<分支>` 写了一句判断，见记录表二。
   - 在用判定：`git worktree list --porcelain` 的 `branch refs/heads/<名>` 行；挂载中的分支一律跳过并记"在用"（已合并、未合并同此口径，照卡文"挂着的一律跳过"）。据此保留 102 个在用分支（81 个已合并 + 21 个未合并）。
   - 45 个未合并分支先打 `archive/<分支>` 标签，推远程后 `git ls-remote --tags origin 'archive/*'` 返回 45 个名称并逐名核对，再删分支；远程标签全部保留。
   - 远程没有 `ds/*`、`api/*` 分支；`ds/b4-3`、`ds/selfchk`、`ds/rules`、`ds/brclean`、`ds/fixrt` 仅本地有、无远程对应，未涉及。
4. 记录写入 `docs/归档/清理记录-1118.md`：三表（已合并已删 158／未合并打标签后删 45／保留 103）。
5. 本回报随提交提交。

## 验收命令与输出

- 操作前：`git branch -r | wc -l` → `308`；`git ls-remote --tags origin 'archive/*' | wc -l` → `0`。
- 操作后：`git branch -r | wc -l` → `105`；`git ls-remote --tags origin 'archive/*' | wc -l` → `45`。
- 最终远程分支 = master + book-reference + 102 个 worktree 在用分支；`origin/HEAD` 另计一行。
- 全程未使用 force-push、未改写历史、未用 `--no-verify`。
