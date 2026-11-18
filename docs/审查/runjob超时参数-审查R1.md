审查标识：rev-runjob-r1-opus（第一轮，独立，非实现者）；所审：runjob.sh 80eef2ff…→32b5e667…

依据：docs/PLAN.md:3364「李白 11:59（T0 超时）」裁定：只给服务器 runjob.sh 加可选单文件超时参数，不传仍 3600，其他行为一字不变，只动这一个文件。
审查对象：F:/dnd-tmp/runjob-1116/{runjob.sh.orig, runjob.sh.new, runjob.diff, README.md}；参照 F:/dnd-tools/cloud/gate/{gate.sh, manifest.py, manifest.sh, stage.sh}（只读）。

## 1. 哈希、逐字相同、换行、语法 —— 通过
- sha256sum：runjob.sh.orig = 80eef2ffad2ef5c56f5c47134bfb30b07715d2f84cc51648a97f2dde61828e3f；runjob.sh.new = 32b5e667fa65af9c59316581a1ca63925a4d8e887fef696462f3278e546a1770；F:/dnd-tools/cloud/gate/runjob.sh = 80eef2ff…（与 orig 相同）。
- `cmp runjob.sh.orig F:/dnd-tools/cloud/gate/runjob.sh` 无差异，逐字相同。
- runjob.sh.new：`tr -cd '\r' | wc -c` = 0（纯 LF）；`bash -n` 通过。

## 2. 逐行对照 diff —— 通过
- 自行重算 `git diff --no-index runjob.sh.orig runjob.sh.new`，与 runjob.diff 除首两行外逐字一致；共 9 增 2 删。
- 新增 7 行在 new:20–26（注释、`JOB_TIMEOUT=3600`、if 读 .job-timeout、`export JOB_TIMEOUT`），位于 GIT_CONFIG 行（new:19）之后、`if [ "$mode" = full ]`（new:27）之前，即在哈希核对（new:11–15）之后。
- 改动两行：orig:36 → new:43（full，单引号 bash -c 内 `timeout -k 30 3600` → `timeout -k 30 $JOB_TIMEOUT`），orig:40 → new:47（script，同样替换）。两行其余字符不变。
- 其余各行（参数解析、.job 写入、哈希核对、mkdir、TEMP/TMPDIR、order_by_history、FINISHED/end 行）一字未变。

## 3. 不传参数时行为、回退、注入 —— 大体通过，一处不符（见结论）
- 无 .job-timeout：new:22 条件不成立，JOB_TIMEOUT=3600，两处 timeout 实参仍为 3600，与原行为相同。唯一可见差异是测试子进程环境多一个 JOB_TIMEOUT=3600；在 F:/dnd（除 logs/）搜 `JOB_TIMEOUT|job-timeout` 无命中，无消费者，判为无影响。
- 符号链接：`[ ! -L ]` 排除 → 3600。目录、FIFO：`-f` 不成立 → 3600。读不到（权限）：head 失败、t 为空，正则不匹配 → 3600（stderr 由 gate 的 launch 定向到 /dev/null，gate.sh:103）。空文件、0、负数、前导 0（`007200`）、>14400（14401、99999）、`1e3`、含制表符、`$(id)`、`7200;rm`：均不匹配 `^[1-9][0-9]{0,4}$` 或不满足 `-le 14400` → 3600（已用同一逻辑实测这些输入）。
- 注入：t 只有通过纯数字正则才会赋给 JOB_TIMEOUT，内容不会被当命令执行；`[ "$t" -le 14400 ]` 在正则通过后才执行，最多 5 位，无溢出。new:43 单引号 bash -c 内 `$JOB_TIMEOUT` 由子 bash 从环境展开，new:26 已 export，xargs 与其子 bash 继承环境，展开正确；new:21 无条件先赋值，外部环境同名变量（sudo -u 场景）不会漏进来。
- 不符处：new:23 用 `tr -d ' \r\n'` 删除所有空格和换行（不止首尾），再做正则。实测 `72 00` → 7200、`1\n2` → 12、` 7200 ` → 7200，即含空白或换行的内容被拼接后接受，而不是回退 3600。另外 `head -c 16` 只读前 16 字节，`7200` 后跟 12 个空白再跟任意内容也会被接受为 7200。这与本轮审查要求「含空白或换行……都回退 3600」不符，README「内容非 ^[1-9][0-9]{0,4}$ … 回退」的描述也不准确（实际是先删空白再匹配）。不构成注入，值仍在 1..14400 且随哈希锁定，但格式错的文件会被静默解释成另一个数（如 12 秒），会让整批测试误超时，正是本参数要防的错配。

## 4. .job-timeout 是否在哈希范围内 —— 成立
- 服务器侧：gate.sh:65 `dhash` = `manifest.py hash /work/<dir>`（遍历模式、不 normalize）；runjob new:11 用同一命令。manifest.py:10 只排除顶层 `node_modules/.out/.tmp/.git`，names_from_walk（:76–88）列出根目录全部普通文件，entries（:90–102）对 .job-timeout 计哈希；若它是符号链接，也按链接目标计哈希（:97–99）。所以它在批准哈希内，审批后改动会让 gate_check（gate.sh:95–98）拒绝，或让 runjob 二道核对 ABORTED。
- 读取时机：new:22 在 new:11 核对之后，launch 由持锁的 wrapper 启动（gate.sh:101–103），apply 需同锁且 busy 检查，核对与读取之间不能被正常通道改写。
- 本地侧：manifest.sh / stage.sh:14 用 `git ls-files -co --exclude-standard`，未跟踪文件也计入；F:/dnd 中 `git check-ignore .job-timeout` 无命中，不会被本地忽略，所以会被打包上传，本地哈希与服务器一致。gate.sh:158 往 snapshot 仓库的 .git/info/exclude 写入 `.job*`，只影响服务器上的 git 快照，不影响内容哈希（.git 本身不计入）。

## 5. 改动范围 —— 通过
- 只有 runjob.sh 有改动；README 写明不改 gate.sh、不改 F:/dnd-tools 下任何文件；F:/dnd-tools/cloud/gate/runjob.sh 仍是原哈希 80eef2ff…，说明尚未部署。参数通过树内文件传入，不需要改 gate.sh（gate.sh:178、:186 的 launch 参数不变），符合「只动这一个文件」。

## 建议修法（最小）
把 new:23 改为只容忍结尾换行，其余一律回退，例如：
`t=$(head -c 8 .job-timeout); t=${t%$'\r'}`，并加上文件大小不超过 7 字节的条件（`[ "$(wc -c < .job-timeout)" -le 7 ]`，5 位数字加 CRLF）。命令替换会自动去掉结尾 LF，这样 `7200`、`7200\n`、`7200\r\n` 都接受为 7200，`72 00`、` 7200`、`1\n2`、带尾随垃圾的内容都回退 3600。README 对应描述同步修正。其余部分无需改动。

changes：new:23 用 tr 删除全部空格和换行、只读前 16 字节，使含空白、换行或尾随内容的 .job-timeout 被拼接或截断后接受（如 `1\n2`→12），不符合「含空白或换行回退 3600」；其余 1、2、4、5 条及注入、默认行为检查均通过。
