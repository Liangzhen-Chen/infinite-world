# API 派卡办法

## 1. 依据

- 亮圳 t470u 临时分工，有效期到 2026-11-19 10:00（额度重置）为止。
- 主会话只做三件事：派卡、看结果、合并。
- 写改稿卡、只核卡、补卡、体检修订，一律用 API 跑，扣亮圳 Ultra 每月 200 美元 API 额度。

## 2. 怎么跑

- 主会话执行：`F:/dnd-tools/api/run-card.sh <模型> <effort> <工作目录> <提示文件>`
- 脚本在子进程里做这些事：
  - 把用户环境变量 `CLAUDE_API_KEY` 交给 `ANTHROPIC_API_KEY`；
  - 去掉桌面端注入的会话变量；
  - 跑 `claude -p --output-format json`。
- 不写全局设置。
- 密钥值不打印、不入仓库、不入日志。

## 3. 模型

| 用途 | 模型 | effort |
|---|---|---|
| 写改 | claude-sonnet-5-5 | medium |
| 难的卡 | claude-opus-5-5 | medium |
| 只核 | 另开一个 claude-opus-5-5 会话 | medium |

- 不用 Fable。
- CLI 的 `sonnet`、`opus` 别名会解析到旧型号，必须写全名。

## 4. 工作目录与合并

- 每张卡一个 git worktree，放在 `F:/dnd-wt/` 下。
- 分支名为 `api/<卡名>`。
- 卡在分支上提交，不 push。
- 主会话读 diff；只核放行后，cherry-pick 合入 master。

## 5. 记账

- 每张卡的 `total_cost_usd` 记进 PLAN 里该卡的条目。
- 每天报一次累计。
- 累计到 150 美元时，单独报李白一次（只报不停工）。

## 6. 规矩照旧

- 禁用：`node -e`、`node -p`、`python -c`、heredoc、`sed -i`、任何输出重定向写文件。
- 写文件只用 Write / Edit。
- 不许 `--no-verify`（仓库有提交钩子）。
