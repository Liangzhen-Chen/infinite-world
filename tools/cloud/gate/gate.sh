#!/bin/bash
# Forced command for the tc_dnd key. Only whitelisted verbs; no eval; every decision logged.
set -u
umask 002
GD=/home/ubuntu/gate; W=/work; G=$W/.gate; INBOX=$W/.inbox; R=$W/.reviews
mkdir -p "$G/jobs" "$INBOX" 2>/dev/null
verb=""; dir="-"; hash="-"
MAXPUT=536870912

log() { printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$verb" "$dir" "$hash" "$1" >> "$G/log" 2>/dev/null; }
deny() { echo "DENIED: $1"; log "DENIED $1"; exit 2; }
ok() { log "ALLOW${1:+ $1}"; }

valid_dir() { [[ ${#1} -le 64 && $1 =~ ^[a-z0-9][a-z0-9._-]*$ && $1 != *..* && $1 != nm && $1 != *.full && $1 != *.out ]]; }
need_dir() { valid_dir "$1" || deny "bad directory name"; [ -d "$W/$1" ] || deny "no such directory $1"; dir=$1; }
# relative path inside a code dir: no '.'/'..' components, not in the unhashed top-level dirs
valid_rel() {
  [[ $1 =~ ^[A-Za-z0-9._/@+-]+$ && $1 != /* && $1 != -* && $1 != */ && $1 != *//* ]] || return 1
  local IFS=/ c
  for c in $1; do [[ $c == . || $c == .. ]] && return 1; done
  case ${1%%/*} in node_modules|.out|.tmp|.git) return 1;; esac
  return 0
}
valid_stale() { # remote-only file to delete: any printable name (passed after -- with newline-delimited xargs), no escapes
  [[ -n $1 && $1 != /* && $1 != -* && $1 != */ && $1 != *//* ]] || return 1
  local LC_ALL=C
  [[ $1 == *[$''-$''$'']* ]] && return 1   # ASCII control chars only; UTF-8 bytes pass in any locale
  local IFS=/ c
  for c in $1; do [[ $c == . || $c == .. ]] && return 1; done
  case ${1%%/*} in node_modules|.out|.tmp|.git) return 1;; esac
  return 0
}
vpath() { # sets RP to resolved path under /work
  [[ $1 =~ ^/work(/[A-Za-z0-9._@+-]+)*/?$ && $1 != *..* ]] || return 1
  RP=$(realpath -m -- "$1") || return 1
  [[ $RP == /work || $RP == /work/* ]]
}
need_path() { vpath "$1" || deny "bad path"; }

# One lock per code dir, held for the whole check+act. For `run` the fd is inherited by the job,
# so apply/prep/rm/run on that dir are refused for the job's whole lifetime.
lockdir() {
  exec 9>"$G/lock-$1" || deny "lock unavailable"
  flock -n 9 || deny "$1 is locked by another gate operation or a running gate job"
}
wipe() { # delete a validated code dir and its result files
  local d=${1:?}
  valid_dir "$d" || return 1
  rm -rf "/work/${d:?}" "/work/${d:?}.full" "/work/${d:?}.script.out" "/work/.gate/jobs/${d:?}.job" 2>/dev/null \
    || sudo -n rm -rf "/work/${d:?}" "/work/${d:?}.full" "/work/${d:?}.script.out"
}
runas() { [ -f "$GD/runas" ] && cat "$GD/runas"; }   # set by `deploy.sh harden`: user that approved jobs run as
scan_cwd() { local p c; for p in /proc/[0-9]*; do c=$(readlink "$p/cwd" 2>/dev/null) || continue
    [[ $c == "/work/$1" || $c == "/work/$1/"* ]] && return 0; done; return 1; }
busy() { # any process (gate job or not, also those of the runner user) with cwd inside /work/$1
  scan_cwd "$1" && return 0
  local u; u=$(runas) || return 1
  sudo -n -u "$u" bash -c "$(declare -f scan_cwd); scan_cwd $1"
}
job_pid() { # live gate job of dir $1 -> its runjob pid
  [ -f "$G/jobs/$1.job" ] || return 1
  local p; p=$(sed -n 's/^pid=//p' "$G/jobs/$1.job")
  [[ $p =~ ^[0-9]+$ && -d /proc/$p ]] && tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | grep -qE "runjob\.sh (full|script) $1 " && echo "$p"
}
dhash() { python3 "$GD/manifest.py" hash "$W/$1"; }

REASON=""
approved() { # $1 hash
  local h=$1 d="$R/$1" f r1 have1=0 have2=0
  REASON="no review records for hash $h"
  [ -d "$d" ] || return 1
  shopt -s nullglob
  for f in "$d"/r*.json; do
    jq -e '.verdict=="changes"' "$f" >/dev/null 2>&1 && { REASON="a changes record exists for this hash ($(basename "$f")); a changes verdict vetoes the version"; return 1; }
  done
  for f in "$d"/r1-*.json; do have1=1; done
  for f in "$d"/r2-*.json; do
    have2=1
    jq -e --arg h "$h" '.round==2 and .verdict=="approve" and .hash==$h' "$f" >/dev/null 2>&1 || { REASON="round-2 record $(basename "$f") is not an approve for this hash"; continue; }
    r1=$(jq -r '.round1' "$f")
    [[ $r1 =~ ^[0-9a-f]{64}/r1-[A-Za-z0-9._-]+$ ]] || { REASON="round-2 record has no valid round1 reference"; continue; }
    [ -f "$R/$r1.json" ] || { REASON="referenced round-1 record $r1 does not exist"; continue; }
    jq -e '.round==1' "$R/$r1.json" >/dev/null 2>&1 || { REASON="referenced record is not round 1"; continue; }
    jq -en --slurpfile a "$f" --slurpfile b "$R/$r1.json" '($a[0].reviewer) as $A | ($b[0].reviewer) as $B | ($a[0].implementers + $b[0].implementers) as $I | $A != $B and ($I|index($A))==null and ($I|index($B))==null' >/dev/null 2>&1 \
      || { REASON="reviewers are not independent (same reviewer in both rounds, or a reviewer is an implementer)"; continue; }
    jq -en --slurpfile a "$f" --slurpfile b "$R/$r1.json" '$b[0].hash != $a[0].hash or $b[0].verdict=="approve"' >/dev/null 2>&1 \
      || { REASON="round-1 record for this same hash is not an approve"; continue; }
    return 0
  done
  if [ $have2 = 0 ]; then
    if [ $have1 = 1 ]; then REASON="only round 1 present for hash $h; a round-2 approve is required"; else REASON="no round-1/round-2 records for hash $h"; fi
  fi
  return 1
}

gate_check() { # $1 dir ; sets hash ; exits 3 on refusal
  hash=$(dhash "$1") || deny "cannot hash"
  if ! approved "$hash"; then echo "REFUSED: $REASON (dir=$1 hash=$hash)"; log "REFUSED $REASON"; exit 3; fi
}

launch() { # $@ = runjob args; wrapper (gate user) holds the lock fd while the job (maybe another user) runs
  local pre=(); local u; u=$(runas) && pre=(sudo -n -u "$u")
  ( cd "$W/$dir" && setsid nohup bash -c '"$@"; exit $?' _ "${pre[@]}" bash "$GD/runjob.sh" "$@" >/dev/null 2>&1 </dev/null & )
}

IFS=$' \t' read -ra A <<< "${SSH_ORIGINAL_COMMAND:-}"
verb=${A[0]:-}
[ -n "$verb" ] || { verb="(none)"; deny "interactive shell not allowed"; }
n=${#A[@]}

case $verb in
  put)
    [ $n = 2 ] || deny "usage: put <name>"
    [[ ${A[1]} =~ ^([a-z0-9][a-z0-9._-]*)\.(tgz|stale|master)$ ]] || deny "bad inbox name"
    stem=${BASH_REMATCH[1]}; valid_dir "$stem" || deny "bad inbox name"; dir=$stem
    t=$(mktemp "$INBOX/.part.XXXXXX") || deny "inbox unavailable"
    head -c $MAXPUT > "$t"
    if [ "$(stat -c %s "$t")" -ge $MAXPUT ]; then rm -f "$t"; deny "upload larger than $MAXPUT bytes"; fi
    mv -f "$t" "$INBOX/${A[1]}"; ok "$(stat -c %s "$INBOX/${A[1]}") bytes"; echo "put ${A[1]} ok";;
  prep)
    [ $n = 3 ] || deny "usage: prep <base> <tgt>"
    need_dir "${A[1]}"; valid_dir "${A[2]}" || deny "bad target name"; [ "${A[1]}" != "${A[2]}" ] || deny "base equals target"
    dir=${A[2]}
    lockdir "$dir"
    busy "$dir" && deny "target $dir has running processes"
    busy "${A[1]}" && echo "note: base ${A[1]} has running processes (copy may be inconsistent)"
    wipe "$dir"
    cp -a "$W/${A[1]}" "$W/$dir"; e=$?
    # unhashed dirs never come from the base; node_modules is always the shared symlink
    ( cd "$W/$dir" && rm -rf ./node_modules ./.out ./.tmp && chmod -R a+rwX . && ln -s /work/nm/node_modules node_modules ) || e=1
    ok "base=${A[1]} exit=$e"; echo "prep exit=$e"; exit $e;;
  apply)
    [ $n = 2 ] || deny "usage: apply <tgt>"
    need_dir "${A[1]}"; lockdir "$dir"; busy "$dir" && deny "$dir has running processes"
    [ -f "$INBOX/$dir.tgz" ] && [ -f "$INBOX/$dir.stale" ] || deny "inbox lacks $dir.tgz/$dir.stale"
    # work only on private copies: a concurrent `put` must not swap validated input
    tmp=$(mktemp -d "$G/apply.XXXXXX") || deny "no scratch space"; trap 'rm -rf "${tmp:?}"; rm -f "$INBOX/$dir.tgz" "$INBOX/$dir.stale" "$INBOX/$dir.master"' EXIT
    cp "$INBOX/$dir.tgz" "$tmp/p.tgz" && cp "$INBOX/$dir.stale" "$tmp/p.stale" || deny "cannot copy inbox files"
    [ -f "$INBOX/$dir.master" ] && { cp "$INBOX/$dir.master" "$tmp/p.master" || deny "cannot copy master file"; }
    # last line may lack a newline; only validated lines (each newline-terminated) are handed on to xargs
    : > "$tmp/ok.stale"
    while IFS= read -r l || [ -n "$l" ]; do [ -z "$l" ] && continue; valid_stale "$l" || deny "bad stale entry"; printf '%s\n' "$l" >> "$tmp/ok.stale"; done < "$tmp/p.stale"
    cd "$W/$dir" || deny "cd failed"
    rm -rf ./node_modules ./.out ./.tmp
    find . -type l -print0 | xargs -0 -r rm -f
    xargs -a "$tmp/ok.stale" -r -d '\n' rm -f --
    python3 "$GD/apply.py" "$tmp/p.tgz" "$W/$dir" || deny "apply.py rejected tarball"
    rm -f "$INBOX/$dir.tgz" "$INBOX/$dir.stale" "$INBOX/$dir.master"
    chmod -R a+rwX .
    ln -s /work/nm/node_modules node_modules
    # Snapshot repo for tests that call git: branch `master` = the real master's world/actions/*.json (uploaded by sync.sh,
    # safe-extracted; used by overfit-guard to see which synonyms are new), branch `snapshot` (HEAD) = this tree.
    # None of this is part of the content hash (.git is excluded).
    mkdir -p "$tmp/m"
    [ -f "$tmp/p.master" ] && { python3 "$GD/apply.py" "$tmp/p.master" "$tmp/m" || deny "apply.py rejected master file"; }
    (
      rm -rf .git; git init -q -b snapshot || exit 1
      printf 'node_modules\n.extra/\n.out/\n.tmp/\n.job*\n' >> .git/info/exclude
      export GIT_DIR="$PWD/.git" GIT_AUTHOR_NAME=rt GIT_AUTHOR_EMAIL=rt@local GIT_COMMITTER_NAME=rt GIT_COMMITTER_EMAIL=rt@local
      mt=$(GIT_WORK_TREE="$tmp/m" GIT_INDEX_FILE="$tmp/idx" git add -A && GIT_WORK_TREE="$tmp/m" GIT_INDEX_FILE="$tmp/idx" git write-tree) || exit 1
      echo "$mt" > "$tmp/mt"
      git update-ref refs/heads/master "$(git commit-tree "$mt" -m master)" || exit 1
      git add -A >/dev/null 2>&1 && git commit -qm snapshot >/dev/null 2>&1
    ) || echo "note: snapshot repo not fully built"
    chmod -R a+rwX .git 2>/dev/null
    hash=$(dhash "$dir"); mt=$(cat "$tmp/mt" 2>/dev/null); ok "master_tree=$mt"; echo "visible=$(ls | wc -l)"; echo "master_tree=$mt"; echo "hash=$hash";;
  manifest) [ $n = 2 ] || deny "usage: manifest <dir>"; need_dir "${A[1]}"; ok; python3 "$GD/manifest.py" manifest "$W/$dir";;
  hash) [ $n = 2 ] || deny "usage: hash <dir>"; need_dir "${A[1]}"; hash=$(dhash "$dir"); ok; echo "$hash";;
  run)
    [ $n -ge 4 ] || deny "usage: run <dir> <P> <files...|--all>"
    need_dir "${A[1]}"; [[ ${A[2]} =~ ^[0-9]+$ && ${A[2]} -ge 1 && ${A[2]} -le 32 ]] || deny "bad P"
    files=("${A[@]:3}")
    if [ "${files[0]}" = "--all" ]; then [ ${#files[@]} = 1 ] || deny "--all takes no files"
    else for f in "${files[@]}"; do valid_rel "$f" && [ -f "$W/$dir/$f" ] && [ ! -L "$W/$dir/$f" ] || deny "bad test file $f"; done; fi
    lockdir "$dir"
    busy "$dir" && { echo "REFUSED: $dir has running processes"; log "REFUSED busy"; exit 3; }
    gate_check "$dir"
    launch full "$dir" "$hash" "${A[2]}" "${files[@]}"; ok "approved"; echo "STARTED dir=$dir hash=$hash out=/work/$dir.full";;
  run-script)
    [ $n -ge 3 ] || deny "usage: run-script <dir> <rel.mjs> [args]"
    need_dir "${A[1]}"; [[ ${A[2]} == *.mjs ]] && valid_rel "${A[2]}" && [ -f "$W/$dir/${A[2]}" ] && [ ! -L "$W/$dir/${A[2]}" ] || deny "bad script path"
    for x in "${A[@]:3}"; do [[ $x =~ ^[A-Za-z0-9._:=/,@+-]+$ && $x != *..* && $x != /* && $x != -* ]] || deny "bad script argument"; done
    lockdir "$dir"
    busy "$dir" && { echo "REFUSED: $dir has running processes"; log "REFUSED busy"; exit 3; }
    gate_check "$dir"
    launch script "$dir" "$hash" "${A[2]}" "${A[@]:3}"; ok "approved ${A[2]}"; echo "STARTED dir=$dir hash=$hash out=/work/$dir.script.out";;
  get) [ $n = 2 ] || deny "usage: get <path>"; need_path "${A[1]}"; [ -f "$RP" ] || deny "not a file"; ok; head -c $MAXPUT -- "$RP";;
  ls) p=${A[1]:-/work}; need_path "$p"; ok; ls -la -- "$RP";;
  tail)
    N=200; p=${A[1]:-}
    if [ "${A[1]:-}" = "-n" ]; then [[ ${A[2]:-} =~ ^[0-9]{1,4}$ ]] || deny "bad -n"; N=${A[2]}; p=${A[3]:-}; fi
    need_path "$p"; [ -f "$RP" ] || deny "not a file"; ok; tail -n "$N" -- "$RP";;
  wc)
    fl=""; p=${A[1]:-}; if [[ $p == -l || $p == -c ]]; then fl=$p; p=${A[2]:-}; fi
    need_path "$p"; [ -f "$RP" ] || deny "not a file"; ok; wc $fl -- "$RP";;
  grep)
    fl=""; i=1; if [[ ${A[1]:-} =~ ^-[nciEl]+$ ]]; then fl=${A[1]}; i=2; fi
    pat=${A[$i]:-}; p=${A[$((i+1))]:-}
    [[ $pat =~ ^[][A-Za-z0-9._:=/^\$\|\(\)*+?-]+$ ]] || deny "bad pattern"
    need_path "$p"; [ -f "$RP" ] || deny "not a file"; ok; timeout 20 grep -E $fl -- "$pat" "$RP" | head -c 1000000;;
  uptime) ok; uptime;;
  jobs)
    ok; shopt -s nullglob
    for f in "$G"/jobs/*.job; do d=$(basename "$f" .job); s=$(job_pid "$d" >/dev/null && echo running || echo ended)
      echo "$d $s $(tr '\n' ' ' < "$f")"; done;;
  kill)
    [ $n = 2 ] || deny "usage: kill <dir>"; valid_dir "${A[1]}" || deny "bad directory name"; dir=${A[1]}
    p=$(job_pid "$dir") || { ok "no gate job"; echo "no running gate job in $dir"; exit 0; }
    sid=$(ps -o sid= -p "$p" | tr -d ' '); me=$(ps -o sid= -p $$ | tr -d ' ')
    [[ $sid =~ ^[0-9]+$ && $sid -gt 1 && $sid != "$me" ]] || deny "refusing to kill session $sid"
    if u=$(runas); then sudo -n -u "$u" pkill -TERM -s "$sid"; else pkill -TERM -s "$sid"; fi
    ok "killed session $sid (pid $p)"; echo "killed gate job pid=$p";;
  rm)
    [ $n = 2 ] || deny "usage: rm <dir>"; need_dir "${A[1]}"; lockdir "$dir"
    busy "$dir" && deny "$dir has running processes"
    wipe "$dir"; ok; echo "removed $dir";;
  *) deny "unknown verb";;
esac
