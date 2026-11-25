#!/bin/sh
# 已由 dispatch.mjs 取代。保留旧参数顺序供旧卡文用：<工作目录> <提示文件> [flash] [用途]。
# 型号只许 flash（= deepseek-flash）；环境清理、DeepSeek 地址、采样温度与调用全在 tools/dispatch/dispatch.mjs。
set -e
[ -n "$1" ] || { echo "用法: sh tools/dispatch/run-card-ds.sh <工作目录> <提示文件> [flash] [用途]" >&2; exit 2; }
case "${3:-flash}" in
  flash) : ;;
  *) echo "型号只许 flash: $3" >&2; exit 2 ;;
esac
exec node "$(CDPATH= cd "$(dirname "$0")" && pwd)/dispatch.mjs" --model deepseek-flash --wd "$1" --card "$2" --purpose "${4:-code}"
