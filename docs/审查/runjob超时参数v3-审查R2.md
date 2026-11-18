审查标识：rev-runjob3-r2-opus（第二轮，独立，非实现者，非第一轮审查者）；所审：runjob.sh 80eef2ff…→baa4201f…

审查时间：2026-11-16。所审目录 F:/dnd-tmp/runjob-1116/。依据：AGENTS.md、docs/PLAN.md「李白 11:59（T0 超时）」「李白 12:03」两条。未看本版第一轮结论。只读，未改任何被审文件。

## 1. 哈希、LF、bash -n、diff、只动 runjob.sh —— 通过

- sha256：runjob.sh.orig = F:/dnd-tools/cloud/gate/runjob.sh = 80eef2ffad2ef5c56f5c47134bfb30b07715d2f84cc51648a97f2dde61828e3f；runjob.sh.new = baa4201f753dfa1d62ca3d821984260f425ccfb954eec8f832ba26d24542e7d9。均与卡片一致。
- runjob.sh.new 中 CR 计数 0（纯 LF）；`bash -n` 通过。
- 自出 `diff -u orig new` 与 runjob.diff 逐行比对：除文件头（git diff 带 a/ b/ 前缀与 index 行）和 hunk 头后的函数上下文提示外，正文完全一致。
- 只改 runjob.sh：gate.sh、manifest.py、apply.py 未改动（本次只读），README 声明一致。

## 2. 不传时行为一字不差 —— 通过（附一条非阻断说明）

- diff 只有两块：:19 后新增 7 行（注释、`JOB_TIMEOUT=3600`、if 块 4 行、`export JOB_TIMEOUT`），位于哈希核对、.job 写入、mkdir、TEMP/TMPDIR、GIT_CONFIG 之后，`if [ "$mode" = full ]` 之前；原 :36（full）与 :40（script）两处 `timeout -k 30 3600` 仅把 `3600` 换为 `$JOB_TIMEOUT`，同行其余字符未动。
- 不放 .job-timeout：`JOB_TIMEOUT=3600` 无条件先赋值，环境里预置的 JOB_TIMEOUT（实测预置 99999）被覆盖，结果 3600；timeout 实参与原文相同。
- full 模式那处在单引号 `bash -c '…'` 内，靠 export 由 xargs 子 shell 继承；实测 `xargs -I{} bash -c 'echo timeout -k 30 $JOB_TIMEOUT node {}'` 展开为 `timeout -k 30 7200 node t.mjs`。
- 非阻断说明：node 进程环境多一个 `JOB_TIMEOUT=3600` 变量（以及父 shell 的非导出变量 t、n）。不影响超时值、输出格式与结果文件，测试代码未见读取该名字的必要；可接受，部署记录里写一句即可。

## 3. 解析：只接受 1–14400 无前导 0 十进制 + 至多一个换行且字节数相符 —— 通过

方法：只读地从 runjob.sh.new 第 23–24 行抄出解析段，只把文件名 `.job-timeout` 换成进程替换路径（head 一路、wc 一路），用 printf 喂值；第 21–26 行整段（含 -f/-L 判断与 export）把文件名换成变量后对现有路径测试。未写任何文件。

接受（结果为该值）：`7200`、`7200\n`、`1`、`14399`、`14400\n`；LC_ALL=C 下 `7200` 同样接受。

回退 3600（全部实测）：
- 范围/格式：`14401`、`99999`、`100000`、`0`、`00`、`0\n`、`01`、`07200`、`+7200`、`-1`、`-7200`、`7e3`、`0x1C20`、`1_000`、`7200.0`、空内容、仅 `\n`。
- 空白与多行：前导空格、尾随空格、`\t` 前/后、`\v`、`\f`、`7200\n\n`、`\n7200`、`72\n00`、`1\n\n`、`7200\nxx`。
- CR：`7200\r\n`、`7200\r`。
- NUL：`72\0`、`7200\0`（od 确认字节为 7 2 0 0 \0；bash 丢 NUL 后 t=7200、n=4，wc=5 不等而拒）、`\07200`、`7200\n\0`、仅 `\0`；C 区域下 `7200\0` 同样拒。
- 超长：`1234567`；head 读到 `7200` 但 wc 侧为 1 MB 或 8 字节时均拒（n ≤ 7 < 实际字节数）。
- Unicode/编码：全角 `７２００`、阿拉伯-印度数字 `١`、BOM+7200、`7200`+NBSP、Latin-1 0xFF 字节；C.UTF-8 与 C 区域均拒。正则通过要求 t 全为 ASCII 数字，此时字符数 = 字节数，多字节字符无法让 n 与 wc 相等。
- 注入形状：`$(id)`、`a[$(id)]`、`7200;id` 均拒；值只在过了 `^[1-9][0-9]{0,4}$` 后才进入 `-le` 与 timeout，`[ "$t" -le 14400 ]` 不做算术展开，无注入面。
- 文件类型：目录、不存在、空文件名、/dev/null（字符设备）、FIFO（进程替换）均因 `-f` 不成立回退；head 打不开（模拟不可读）时 t 为空、正则不过，回退，错误输出在 launch 里已重定向 /dev/null。符号链接由 `[ ! -L .job-timeout ]` 排除（本机无法不写文件造链接，按代码判定）。
- timeout 参数：取值 1..14400 纯十进制，`timeout -k 30 14400 true` 实测合法。

## 4. .job-timeout 计入目录哈希、随批准哈希锁定 —— 通过

- 服务器侧 runjob 用 `manifest.py hash /work/$d`（不带 --normalize），names_from_walk 只排除顶层 node_modules/.out/.tmp/.git，点文件 .job-timeout 计入；符号链接按链接目标计入哈希。
- gate.sh `valid_rel` 接受 `.job-timeout`（字符集合法、分量不是 . 或 ..，顶层不在排除表），apply.py 同样不排除，可经正常 apply 上传。
- gate_check 在启动前核批准哈希；runjob 在读 .job-timeout 之前再核一次树哈希（第 11 行），目录锁 fd 由作业继承，运行期间 apply/rm 被拒，故读到的就是被批准的内容。
- 快照 git 的 `.git/info/exclude` 含 `.job*` 只影响测试用快照仓库，不影响内容哈希。
- 使用提示（非阻断）：本地 manifest 走 `git ls-files -co --exclude-standard`，.job-timeout 不能被本地 gitignore 规则忽略，否则不会上传；本地打包会把 CRLF 规范成 LF，`7200\r\n` 上传后为 `7200\n`，按规则接受。

## 结论

四条均通过，未发现阻断问题。非阻断：node 环境多一个 JOB_TIMEOUT 变量（第 2 条）。

approve
