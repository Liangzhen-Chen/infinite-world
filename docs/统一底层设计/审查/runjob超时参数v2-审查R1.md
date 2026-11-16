审查标识：rev-runjob2-r1-opus（第一轮，独立，非实现者）；所审：runjob.sh 80eef2ff…→3a215a27…

依据：docs/PLAN.md:3364「李白 11:59（T0 超时）」与 :3366「李白 12:03」：只给服务器 runjob.sh 加可选单文件超时参数，不传仍 3600，其他一字不变，只动这一个文件，过两轮不同独立审查。前一版审查 runjob超时参数-审查R1.md 判 changes，理由是旧 :23 用 tr 删掉全部空白、只读前 16 字节，`1\n2`→12、`72 00`→7200 被拼接后接受。
审查对象：F:/dnd-tmp/runjob-1116/{runjob.sh.orig, runjob.sh.new, runjob.diff, README.md}；参照 F:/dnd-tools/cloud/gate/{runjob.sh, manifest.py}（只读）。

## 1. 哈希、LF、语法、diff —— 通过
- sha256sum：runjob.sh.orig = 80eef2ffad2ef5c56f5c47134bfb30b07715d2f84cc51648a97f2dde61828e3f，与 F:/dnd-tools/cloud/gate/runjob.sh 相同；runjob.sh.new = 3a215a278b67264f9a91c1fdfaa1e1b5b8275b5a3856c700d19b40c2f4a6ef78，与声明一致。
- runjob.sh.new 的 CR 计数为 0，纯 LF；`bash -n` 通过。
- 自行运行 `git diff --no-index runjob.sh.orig runjob.sh.new`，用 `diff -` 与 runjob.diff 比对，逐字相同。

## 2. 改动范围与不传时的行为 —— 通过
- diff 只有两段：new:20–26 新增 7 行（注释、`JOB_TIMEOUT=3600`、if 块 3 行、`export JOB_TIMEOUT`），位于 GIT_CONFIG 行之后、`if [ "$mode" = full ]` 之前，也就是在 new:11–15 哈希核对之后；另一段把 orig:36（full，单引号 bash -c 内）和 orig:40（script）两处 `timeout -k 30 3600` 换成 `timeout -k 30 $JOB_TIMEOUT`，这两行其余字符不变。其他各行一字未变。
- 没有该文件时：new:22 条件不成立，JOB_TIMEOUT=3600，两处 timeout 的实参仍是 3600。唯一可见的差别是子进程环境里多了 JOB_TIMEOUT=3600，前一版审查已确认没有消费者；new:21 无条件先赋值，外部同名环境变量不会漏进来。

## 3. R1 问题已修；回退与注入 —— 通过
- 新 :23：`t=$(head -c 7 .job-timeout; printf x); t=${t%x}; t=${t%$'\n'}`。用哨兵 x 保留结尾换行，只去掉一个 LF，不删内部空白；:24 要求整串匹配 `^[1-9][0-9]{0,4}$` 且 `-le 14400`。合规内容最多 6 字节（5 位数字加 LF），所以读 7 字节后，凡是超过 6 字节的文件都必然不合规，不会出现截断后接受的情况。
- 实测：把 :21、:23、:24 原样抄进 `bash -c`，只把文件名换成 /dev/stdin，用 printf 管道喂值，不写任何文件。结果如下。
  - 接受为原值：`7200`、`7200\n`、`14400`、`14400\n`、`1`。
  - 回退 3600：`14401`、`1\n2`、`72 00`、`7200\n\n`、`7200\r\n`、`0`、`012`、`1234567`、13 位超长串、`99999`、空串、单独 `\n`、` 7200`、`7200 `、`1440\nx`、`$(id)`。
  - 目录和不存在的路径：`[ -f ]` 都为假（已实测），保持 3600。符号链接由 `[ ! -L .job-timeout ]` 排除，保持 3600（逻辑核对，未建链接实测，因为本审查不写文件）。
- 注入：t 只有通过纯数字正则才会赋值；`$(...)` 中的内容只作为数据读入，不会执行；`-le` 在正则通过后才运行，最多 5 位，不会溢出。new:26 已 export，full 分支单引号 bash -c 内的 `$JOB_TIMEOUT` 由 xargs 启动的子 bash 从环境展开，继承正确；script 分支在本 shell 直接展开。
- 非阻断备注：bash 命令替换会丢弃 NUL 字节，所以 `72\0` 后接 `00` 或 `7200\0` 会被读成 7200 并接受（同时 stderr 报 warning）。这类文件不是「恰为数字」。不过这是 bash 固有行为，正常编辑或 printf 都不会写出 NUL，文件也随审批哈希锁定，得到的值就是可见数字，并非另一个数，因此不要求改。如果想做到绝对严格，可另加 `[ "$(wc -c < .job-timeout)" -le 6 ]`，但不是本轮必需。

## 4. .job-timeout 计入目录哈希 —— 成立
- manifest.py:10 `EXC = {'node_modules', '.out', '.tmp', '.git'}`，只排除这 4 个顶层名，根目录下的普通文件 .job-timeout 会计入哈希。runjob new:11 用同一 manifest.py 做二次核对，new:22 在核对之后才读取，所以文件内容随审批哈希锁定。

## 5. 只动 runjob.sh —— 通过
- F:/dnd-tools/cloud/gate/ 下所有文件的修改时间都不晚于 11-08，runjob.sh 仍是原哈希 80eef2ff…，尚未部署；这一版只涉及 runjob.sh 一个文件，参数经树内文件传入，不需要改 gate.sh。README 的解析规则与异常值表和上面的实测一致。

approve
