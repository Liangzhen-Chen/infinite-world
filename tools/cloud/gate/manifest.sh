#!/bin/bash
# Usage: manifest.sh <worktree> [--list]   -> prints sha256 of the worktree manifest (or the manifest itself with --list)
# Files = git ls-files -co --exclude-standard, actual bytes on disk (uncommitted + untracked included; text CRLF->LF).
set -eu
M="$(cd "$(dirname "$0")" && pwd)/manifest.py"   # resolve before cd: a relative $0 breaks after cd
cd "$1"
git ls-files -co --exclude-standard -z | python "$M" "$([ "${2:-}" = --list ] && echo manifest || echo hash)" . --normalize --stdin-list
