#!/bin/sh
# 用 DeepSeek（deepseek-flash）跑一张写码卡（亮圳 11-17 23:23 批准，经李白）。
# 用法：sh tools/dispatch/run-card-ds.sh <工作目录> <提示文件> [flash] [用途]
#   第四参数选采样用途（缺省 code），档表见 tools/dispatch/sampling.json，说明见 docs/门禁说明/DeepSeek温度分档.md。
#   第三参数型号只许 flash（= deepseek-flash，即 V4.1 Flash）：亮圳 11-22 20:07 定不再用 deepseek-v4-pro（李白 20:1x 核官方价目页与 /models：v4-pro 是单独的 V4-Pro，价钱是 Flash 的 3–4 倍，没有转给 Flash）。
# 接法照 https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code.md ：
#   只在本子进程环境里设 ANTHROPIC_BASE_URL 与 ANTHROPIC_AUTH_TOKEN（取自用户环境变量 DEEPSEEK_API_KEY），
#   所有模型名一律 deepseek-flash（以 claude-opus 开头的模型名会被转到更贵的 deepseek-v4-pro，这里一个都不出现）。
# 不写全局设置，不打印密钥；清掉 Claude 的 ANTHROPIC_API_KEY，防止它被发到 DeepSeek。
# 派活卡头硬规矩（亮圳 11-18 批准）由 tools/dispatch/compose-card.mjs 拼在卡文最前面（李白 11-18 19:08），不靠派卡人记得。
set -e
wd="$1"; pf="$2"
[ -n "$DEEPSEEK_API_KEY" ] || { echo "DEEPSEEK_API_KEY 不存在" >&2; exit 2; }
[ -d "$wd" ] || { echo "工作目录不存在: $wd" >&2; exit 2; }
[ -f "$pf" ] || { echo "提示文件不存在: $pf" >&2; exit 2; }
case "${3:-flash}" in
  flash) M=deepseek-flash ;;
  *) echo "型号只许 flash: $3" >&2; exit 2 ;;
esac
here="$(CDPATH= cd "$(dirname "$0")" && pwd)"
# 采样温度按用途分档（亮圳 11-22 19:46）：第四参数为用途，缺省 code；档表在 tools/dispatch/sampling.json。
# 用途不存在即非 0 退出；档值为 null 则不注入（并清掉继承来的 CLAUDE_CODE_EXTRA_BODY）。只在本进程及其子进程生效。
extra="$(node "$here/sampling-body.mjs" "${4:-code}")" || exit 2
if [ -n "$extra" ]; then export CLAUDE_CODE_EXTRA_BODY="$extra"; else unset CLAUDE_CODE_EXTRA_BODY; fi
git -C "$wd" fetch -q origin 2>/dev/null || true
prompt="$(node "$here/compose-card.mjs" "$wd" "$pf")" || exit 2
cd "$wd"
exec env -u ANTHROPIC_API_KEY -u CLAUDE_API_KEY -u ANTHROPIC_BASE_URL -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_CHILD_SESSION \
  -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_HOST_SESSION_ID -u CLAUDE_CODE_MESSAGING_SOCKET \
  -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_OAUTH_SCOPES -u CLAUDE_CODE_ACCOUNT_UUID \
  -u CLAUDE_CODE_ORGANIZATION_UUID -u CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH -u CLAUDE_AGENT_SDK_VERSION \
  -u CLAUDE_AGENT_SDK_MCP_NO_PREFIX -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID \
  ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic" ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY" \
  ANTHROPIC_MODEL="$M" ANTHROPIC_DEFAULT_OPUS_MODEL="$M" ANTHROPIC_DEFAULT_SONNET_MODEL="$M" \
  ANTHROPIC_DEFAULT_HAIKU_MODEL="$M" ANTHROPIC_SMALL_FAST_MODEL="$M" CLAUDE_CODE_SUBAGENT_MODEL="$M" \
  ANTHROPIC_DEFAULT_MODEL="$M" ANTHROPIC_DEFAULT_FABLE_MODEL="$M" CLAUDE_CODE_AUTO_MODE_MODEL="$M" \
  CLAUDE_CONFIG_DIR="F:/dnd-tools/claude-config-ds" DND_CARD_AGENT=1 \
  F:/dnd-tools/claude-cli/node_modules/@anthropic-ai/claude-code/bin/claude.exe -p "$prompt" --model "$M" \
    --permission-mode acceptEdits \
    --allowedTools "Read" "Edit" "Write" "Glob" "Grep" "Bash(git:*)" "Bash(node:*)" "Bash(ls:*)" "Bash(wc:*)" "Bash(grep:*)" "Bash(sed -n:*)" "Bash(cat:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(cp:*)" "Bash(cmp:*)" \
    --output-format json < /dev/null
