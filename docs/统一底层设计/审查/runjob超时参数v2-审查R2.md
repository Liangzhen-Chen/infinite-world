审查标识：rev-runjob2-r2-opus（第二轮，独立，非实现者，非第一轮审查者）；所审：runjob.sh 80eef2ff…→3a215a27…

审查时间：2026-11-16。所审目录 F:/dnd-tmp/runjob-1116/；只读参照 F:/dnd-tools/cloud/gate/gate.sh、manifest.py。未看本版第一轮结论。依据：AGENTS.md；docs/PLAN.md"李白 11:59（T0 超时）""李白 12:03"两条（不传仍 3600、其他一字不变、只动这一个文件）。

## 1. 哈希、LF、bash -n、diff、范围 —— 通过

- sha256：runjob.sh.orig = 80eef2ffad2ef5c56f5c47134bfb30b07715d2f84cc51648a97f2dde61828e3f，与 F:/dnd-tools/cloud/gate/runjob.sh 相同；runjob.sh.new = 3a215a278b67264f9a91c1fdfaa1e1b5b8275b5a3856c700d19b40c2f4a6ef78，与卡面一致。
- CR 计数：orig 0、new 0（纯 LF）。`bash -n runjob.sh.new` 通过。
- 自出 `git diff --no-index runjob.sh.orig runjob.sh.new` 与 runjob.diff 逐字节相同。
- 改动只在 runjob.sh；gate.sh、manifest.py 未改（仅参照阅读）。

## 2. 不传时行为不变 —— 通过

- diff 只有两类：:19 后、`if [ "$mode" = full ]` 前新增 7 行（注释、`JOB_TIMEOUT=3600`、if 块 3 行、`export JOB_TIMEOUT`）；原 :36（full 的 xargs 行）与 :40（script 行）各把 `timeout -k 30 3600` 中的 `3600` 换成 `$JOB_TIMEOUT`，两行其余字符相同。其余行一字未变。
- 无 .job-timeout 时：实跑新增块（原样 :21–26，cwd 无该文件）→ JOB_TIMEOUT=3600。full 处在单引号 `bash -c` 内，由 export 继承；实测 `export` 后经 `xargs -I{} bash -c '... $JOB_TIMEOUT ...'` 展开为 `timeout -k 30 7200 ...`（3600 同理），即与原文 `timeout -k 30 3600` 等价。script 处直接展开。
- 非阻塞备注：node 子进程环境多一个 JOB_TIMEOUT 变量；对现有测试无影响，记录在案。

## 3. 解析 —— 不通过（NUL 字节被吞后接受）

方法：sed 抄出 :21–25，把 `.job-timeout` 换成 `"$F"`，用 `printf ... | F=/dev/stdin bash -c` 喂值（守卫换 true 只测内容）；守卫另以原文守卫测（未写任何文件）。

| 输入 | 结果 | 结论 |
|---|---|---|
| `7200`、`7200\n`、`14400`、`14400\n`、`1` | 原值 | 正确 |
| `14401`、`99999`、`0`、`00`、`012`、`123456`、`1234567` | 3600 | 正确 |
| `1\n2`、`72 00`、` 7200`、`7200 `、`7200\n\n`、`7200\r\n`、`7200\n7200` | 3600 | 正确 |
| `+7200`、`-1`、`-0`、`1e3`、`0x10`、`7200x`、`$(id)`、空、`\n` | 3600 | 正确 |
| 读不到（不存在路径） | 3600（head 报错到 stderr，launch 已丢弃） | 正确 |
| 目录、进程替换（非普通文件）——原文守卫 `-f` | 3600 | 正确 |
| 符号链接 | 由 `[ ! -L ]` 拒绝（`-f` 跟随链接，故 `-L` 必需且已有）；另 apply 会删树内链接 | 正确（分析） |
| **`72\x0000`** | **7200**（bash 警告 ignored null byte） | **错误** |
| **`7200\x00`** | **7200** | **错误** |
| **`\x00\x00\x00\x007200`** | **720** | **错误** |

原因：`$(head -c 7 ...)` 的命令替换会丢弃 NUL 字节，含 NUL 的非规范内容被拼成合法数字而接受，违反"只接受恰为 1–14400 十进制正整数后至多一个换行，其余一律回退"。实际取值仍落在 1..14400、仅数字，无越界/注入，且文件随哈希受审，风险低；但这是验收条款的字面违约，审查者在常见查看器里也可能只看到"7200"。

最小修法建议（规则层，一处）：在接受前核对读入字节数与 t 长度一致，例如把第二个 if 条件加上
`[ "$(head -c 7 .job-timeout | tr -d '\n' | wc -c)" = "${#t}" ]`
（含 NUL 时字节数大于 ${#t} → 回退；`7200\n` 为 4=4 照常接受）。改后重出哈希、diff 并重新过两轮审查。

注入与参数合法性：t 必须匹配 `^[1-9][0-9]{0,4}$` 才赋值，`[ -le 14400 ]` 在正则通过后执行、无前导 0、十进制比较；JOB_TIMEOUT 只可能是 3600 或 1..14400 的纯数字，作为 `timeout -k 30 N` 的 DURATION 合法；全程无 eval，变量未被当代码执行 —— 通过。

## 4. 哈希锁定 —— 通过

- manifest.py 的 `names_from_walk` 只在顶层排除 node_modules/.out/.tmp/.git，`.job-timeout` 是普通文件，计入 `hash`；runjob 在 :11 哈希核对之后（:21 起）才读它，故随批准哈希锁定，且 gate 的 flock 在作业期间阻止 apply/prep 改树。
- gate.sh 的 `valid_rel` 允许 `.job-timeout`（字符集含 `.`，非 `.`/`..` 段），可经 apply 上传；git 快照 exclude 的 `.job*` 只影响 .git 快照，不影响内容哈希。
- 非阻塞备注：不合规内容静默回退 3600，结果文件不记录生效超时；以后排查超时时需自行核对 .job-timeout 内容。

## 结论

第 1、2、4 条通过；第 3 条因 NUL 字节被命令替换吞掉后接受（`72\0 00`、`7200\0` → 7200）不符合"其余一律回退"，需按上文修一处后重审。

changes
