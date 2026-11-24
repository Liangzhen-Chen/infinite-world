#!/bin/sh
# 用 API 额度跑一张卡（亮圳 t470u 临时分工，至 11-19 10:00）。
# 用法：sh tools/dispatch/run-card.sh <模型> <effort> <工作目录> <提示文件> [单次预算USD]
#   模型：claude-sonnet-5-5 | claude-opus-5-5
#   单次预算默认 0.65 美元、只许调低（由 budget-check.mjs 核，出处 CLAUDE.md 第 3 节“--max-budget-usd 0.65”）。
# 只在本子进程里把用户环境变量 CLAUDE_API_KEY 交给 ANTHROPIC_API_KEY；不写全局设置，不打印密钥。
# 去掉桌面端会话注入的环境变量，避免子进程沿用宿主会话的登录与代理。
# 输出：claude -p 的 JSON 结果（含 total_cost_usd、usage）打到标准输出，由调用方工具收取。
# 派活卡头硬规矩（亮圳 11-18 批准）由 tools/dispatch/compose-card.mjs 拼在卡文最前面（李白 11-18 19:08），不靠派卡人记得。
set -e
model="$1"; effort="$2"; wd="$3"; pf="$4"
[ -n "$CLAUDE_API_KEY" ] || { echo "CLAUDE_API_KEY 不存在" >&2; exit 2; }
[ -d "$wd" ] || { echo "工作目录不存在: $wd" >&2; exit 2; }
[ -f "$pf" ] || { echo "提示文件不存在: $pf" >&2; exit 2; }
git -C "$wd" fetch -q origin 2>/dev/null || true
here="$(CDPATH= cd "$(dirname "$0")" && pwd)"
budget="$(node "$here/budget-check.mjs" "${5:-0.65}")" || exit 2
prompt="$(node "$here/compose-card.mjs" "$wd" "$pf")" || exit 2
cd "$wd"
exec env -u ANTHROPIC_BASE_URL -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_CHILD_SESSION \
  -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_HOST_SESSION_ID -u CLAUDE_CODE_MESSAGING_SOCKET \
  -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_OAUTH_SCOPES -u CLAUDE_CODE_ACCOUNT_UUID \
  -u CLAUDE_CODE_ORGANIZATION_UUID -u CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH -u CLAUDE_AGENT_SDK_VERSION \
  -u CLAUDE_AGENT_SDK_MCP_NO_PREFIX -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID \
  ANTHROPIC_API_KEY="$CLAUDE_API_KEY" CLAUDE_CONFIG_DIR="F:/dnd-tools/claude-config" DND_CARD_AGENT=1 \
  F:/dnd-tools/claude-cli/node_modules/@anthropic-ai/claude-code/bin/claude.exe -p "$prompt" --model "$model" --effort "$effort" \
    --max-budget-usd "$budget" \
    --permission-mode acceptEdits \
    --allowedTools "Read" "Edit" "Write" "Glob" "Grep" "Bash(git:*)" "Bash(node:*)" "Bash(ls:*)" "Bash(wc:*)" "Bash(grep:*)" "Bash(sed -n:*)" "Bash(cat:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(cp:*)" "Bash(cmp:*)" \
    --output-format json < /dev/null
