审查标识：rev-runjob3-r1-opus（第一轮，独立，非实现者）；所审：runjob.sh 80eef2ff…→baa4201f…

审查日期 2026-11-16。所审目录 F:/dnd-tmp/runjob-1116/（runjob.sh.orig、runjob.sh.new、runjob.diff、README.md）；只读参考 F:/dnd-tools/cloud/gate/gate.sh、manifest.py。依据：AGENTS.md；PLAN.md「李白 11:59（T0 超时）」「李白 12:03」；前两版审查 R1（tr 删空白致 `1\n2`→12 被接受）、v2-R2（命令替换吞 NUL 致 `72\0 00`→7200 被接受）。全程未写除本记录外的任何文件。

## 1. 哈希、LF、语法、diff 范围 —— 通过

- sha256：runjob.sh.orig = 80eef2ffad2ef5c56f5c47134bfb30b07715d2f84cc51648a97f2dde61828e3f，与 F:/dnd-tools/cloud/gate/runjob.sh 相同；runjob.sh.new = baa4201f753dfa1d62ca3d821984260f425ccfb954eec8f832ba26d24542e7d9，与卡片一致。
- 两文件 CR 计数均为 0（纯 LF）；`bash -n runjob.sh.new` 通过。
- 自出 `git diff --no-index runjob.sh.orig runjob.sh.new` 与 runjob.diff 逐字节 `cmp` 相同。
- 改动只涉及 runjob.sh 一个文件；gate.sh、manifest.py 未在改动范围内。

## 2. 不传时行为不变 —— 通过

- 逐行核对：new 的 1–19 行与 orig 1–19 行相同；new 27–49 行与 orig 20–42 行在仅把 orig :36、:40 的 `timeout -k 30 3600 node` 换成 `timeout -k 30 $JOB_TIMEOUT node` 后 `cmp` 相同（42→49 行，净增 7 行）。
- 新增 7 行位于 GIT_CONFIG export 之后、`if [ "$mode" = full ]` 之前，在 :11 树哈希核对之后。
- 无 .job-timeout 时守卫为假，JOB_TIMEOUT=3600，两处 timeout 参数实际为 3600，与原版相同。新增仅一个导出变量 JOB_TIMEOUT 进入子进程环境，不影响 node 行为。

## 3. 解析规则（前两版问题） —— 通过

方法：`sed -n '21,26p'` 抄出解析段，守卫换成 true，把 `.job-timeout` 换成 `<(printf %b "$V")`（head 与 `wc -c <` 各读一份独立进程替换，内容相同），以 `V=... bash -c` 运行后打印 JOB_TIMEOUT。守卫另用原文逻辑对真实路径只读测试。

| 输入 | 结果 |
|---|---|
| `7200`、`7200\n`、`14400`、`14400\n`、`1`、`9999` | 原值（接受） |
| `14401`、`99999`、`0`、`00`、`012`、`07200` | 3600 |
| 空、`\n`、`1\n2`、`72 00`、` 7200`、`7200 `、`\t7200` | 3600 |
| `7200\n\n`、`7200\r\n`、`7200\r`、`7200\n7200` | 3600 |
| `72\0` 后接 `000`、`7200\0`、`\0\0\0\07200`（含 NUL） | 3600（bash 警告 ignored null byte，字节数≠n 被拒） |
| `1234567`、`123456`、`12345678901`（超长） | 3600 |
| `+7200`、`-1`、`7e3`、`0x10`、阿拉伯数字 `١٢` | 3600 |
| `$(id)`、`7200;id` | 3600（未执行） |

守卫：目录（/f/dnd）、不存在路径、/dev/null（字符设备）均拒；普通文件接受；符号链接由 `[ ! -L ]` 拒（`-f` 跟随链接，故需此项，逻辑正确）。

原理核对：`head -c 7` 后补哨兵 x 保留结尾换行；n=${#t} 为实读字符数；去至多一个 `\n` 后须整体匹配 `^[1-9][0-9]{0,4}$` 且 ≤14400（正则先过，`-le` 不会遇非数字，无前导 0 不涉八进制）；再要求 `wc -c` 真实字节数等于 n，故 NUL（被命令替换丢弃）、7 字节外的尾随内容均使字节数>n 而回退。接受时 t 为纯 ASCII 数字，n 等于字节数，locale 不影响。R1 的空白拼接、R2 的 NUL 吞并均已消除。

注入与传递：无 eval；JOB_TIMEOUT 只可能为 3600 或 1..14400 的纯十进制数字，作为 `timeout -k 30 N` 的 DURATION 合法；script 模式在本 shell 直接展开；full 模式在单引号 `bash -c` 内展开，由 `export JOB_TIMEOUT` 经 xargs 继承到子 shell，正确。export 发生在 runjob 进程内（launch 的用户切换之后），不依赖 sudo 保留环境。不可读文件：head 失败得空串→正则不过→3600，`t=$(…; printf x)` 退出码为 printf 的 0，无副作用。

## 4. .job-timeout 计入目录哈希 —— 通过

- manifest.py `names_from_walk` 只在顶层排除 EXC={node_modules,.out,.tmp,.git}，`.job-timeout` 作为普通文件列入；runjob :11 调用 `manifest.py hash /work/$d`（不带 --normalize），按原始字节哈希，故内容（含 CR/NUL）随批准哈希锁定；读取在哈希核对之后。
- gate.sh `valid_rel` 字符集含 `.`，`.job-timeout` 不是 `.`/`..` 段且非排除顶层名，可经 apply 上传；git 快照 exclude 的 `.job*` 只作用于 .git 快照，不影响内容哈希。

非阻塞备注（不影响结论）：不合规内容静默回退 3600，结果文件不记生效超时，排查时需自行核对 .job-timeout。

## 结论

1–4 条全部通过；前两版的空白拼接与 NUL 吞并问题已修，不传时行为与原版一致。

approve
