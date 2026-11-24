审查标识：rev-runjob-r2-opus（第二轮，独立，非实现者，非第一轮审查者）；所审：runjob.sh 80eef2ff…→32b5e667…

依据：PLAN.md「李白 11:59（T0 超时）」裁定（只加可选单文件超时参数，不传仍 3600，其他一字不变，只动 runjob.sh）；审查件 F:/dnd-tmp/runjob-1116/ 下 runjob.sh.orig、runjob.sh.new、runjob.diff、README.md；只读 F:/dnd-tools/cloud/gate/gate.sh、manifest.py。未看第一轮结论。

## 1. 哈希、LF、语法 —— 通过
- sha256：runjob.sh.orig = 线上 F:/dnd-tools/cloud/gate/runjob.sh = 80eef2ffad2ef5c56f5c47134bfb30b07715d2f84cc51648a97f2dde61828e3f；runjob.sh.new = 32b5e667fa65af9c59316581a1ca63925a4d8e887fef696462f3278e546a1770。均与声明一致。
- 两文件 CR 计数均为 0（纯 LF）；`bash -n` 两者均通过。

## 2. diff 一致、改动范围 —— 通过
- 自行 `git diff --no-index runjob.sh.orig runjob.sh.new` 输出与 runjob.diff 逐字相同（index b07c191..2b02029，两个 hunk）。
- 改动只有三处：在 GIT_CONFIG 行后、`if [ "$mode" = full ]` 前新增 7 行（注释、`JOB_TIMEOUT=3600`、读 .job-timeout 的 if 块、`export JOB_TIMEOUT`）；原 :36（full，xargs 单引号 bash -c 内）与原 :40（script）两处 `timeout -k 30 3600` 中 `3600` → `$JOB_TIMEOUT`。其余字符未动。新块位于哈希核对（:11）之后，读取的是已核对过的树。

## 3. 行为与健壮性 —— 通过（附两条非阻断说明）
用一个不写文件的测试脚本，把与新文件第 23–24 行相同的管道和条件跑了一遍，结果如下：
- 不传（无 .job-timeout 或内容为空）：3600，与原值相同；两处 timeout 收到的参数与原文一致，行为不变。
- 回退 3600 的情况：abc、0、-5（正则要求首位 1–9，按代码推理）、14401、99999、23 位超大数（正则限 1–5 位，`-le` 永远拿不到超长数，无溢出）、"7200\n100"（拼成 7 位数被拒）、带制表符、0700（拒前导 0，避免八进制歧义）、1e3、`$(id)`、`7200;id`、目录 `.job-timeout`（`-f` 假）。符号链接被 `! -L` 拒；而且 gate apply 前已经 `find -type l` 删光符号链接，manifest 在 normalize 侧也拒绝符号链接，是双重保护。FIFO 和设备文件过不了 `-f`，head 不会卡住。
- 接受的情况：7200、"7200\n"、"7200\r\n"、14400，均正确。
- 无注入：取值只经 `[[ =~ ]]` 和 `[ -le ]` 判断，赋给 JOB_TIMEOUT 的只能是 1..14400 的纯数字；文件内容从不被 eval，也不进 bash -c 的命令串（单引号内是变量名，由子 shell 展开）。
- 变量继承：`export JOB_TIMEOUT` 在 xargs 之前执行，测得 xargs → 单引号 bash -c 子进程拿到的值正确。runjob 第 21 行无条件赋 3600，所以外部环境里的同名变量会被覆盖、不起作用（已测）。sudo -n -u 的 env_reset 发生在 runjob 启动之前，不影响这里。`timeout -k 30 <1..14400>` 的参数都合法（已测）。
- 非阻断说明 a：`tr -d ' \r\n'` 会删掉所有空格和换行，不只是首尾的，所以 "72 00"、"72\n00"、" 7200 " 都会被当作 7200 接受，而不会回退 3600。README 写的是“内容不匹配正则即回退”，比实际行为宽一些。
- 非阻断说明 b：只读前 16 字节，第 17 字节起的内容被忽略（例如 "1"+15 个空格+"23" 取值为 1）。
- 判定理由：两种情况得到的值仍在 1..14400 之内，而且文件本身在审查范围内、被哈希锁定，审查者看得到原文，所以没有安全或越权影响。属于措辞和严格度问题，不阻断。如果以后要收紧，可以改成只去掉末尾的 \r\n 再整串匹配，但不应为此单独再开一轮。

## 4. .job-timeout 纳入目录哈希 —— 通过
- 服务器侧：gate_check → dhash → `manifest.py hash /work/<dir>`，走 names_from_walk。EXC 只排除顶层 node_modules、.out、.tmp、.git，所以顶层普通文件 `.job-timeout` 会进 manifest，内容一改哈希就变：approved 校验拒绝，runjob 第 11 行的二次核对也会写 ABORTED。
- 本地侧：manifest.sh、stage.sh 用 `git ls-files -co --exclude-standard`，未跟踪但没被忽略的 .job-timeout 也会列入，本地和服务器两侧一致（前提是本地 .gitignore 没有忽略它；如果被忽略，两侧哈希会对不上，run 会被拒，属于安全失败）。
- gate.sh 快照仓库的 `.git/info/exclude` 里的 `.job*` 只影响 git 快照，不影响内容哈希（.git 本身就在 EXC 内）。

## 5. 只动 runjob.sh —— 通过
- 改动件只有 runjob.sh.new；线上 runjob.sh 哈希仍是原值（未部署）；gate.sh、manifest.py 没有改动需要（参数通过哈希锁定的树内文件传入，不改 launch 的命令行）。审查件目录里只有 orig/new/diff/README。

approve —— 五项均通过：不传时行为逐字不变，异常值都回退 3600 或被限在 1..14400，无注入，值随批准哈希锁定，只动 runjob.sh。空白和换行被全删、16 字节截断两点比 README 描述宽，不影响安全，作为非阻断说明记录。
