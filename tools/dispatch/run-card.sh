#!/bin/sh
# 已由 dispatch.mjs 取代。保留旧参数顺序供旧卡文用：<模型> <effort> <工作目录> <提示文件> [单次预算USD]。
# 参数、环境清理、预算闸门与 claude -p 调用全在 tools/dispatch/dispatch.mjs，本文件只转调。
set -e
[ -n "$1" ] || { echo "用法: sh tools/dispatch/run-card.sh <模型> <effort> <工作目录> <提示文件> [预算]" >&2; exit 2; }
exec node "$(CDPATH= cd "$(dirname "$0")" && pwd)/dispatch.mjs" --model "$1" --effort "$2" --wd "$3" --card "$4" --budget "${5:-0.65}"
