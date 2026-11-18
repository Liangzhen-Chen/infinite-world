# runjob.sh 可选单文件超时（准备件，未部署）

- 原文件：F:/dnd-tools/cloud/gate/runjob.sh，sha256 `80eef2ffad2ef5c56f5c47134bfb30b07715d2f84cc51648a97f2dde61828e3f`（备份 runjob.sh.orig）
- 新文件（R2 修订后）：runjob.sh.new，sha256 `baa4201f753dfa1d62ca3d821984260f425ccfb954eec8f832ba26d24542e7d9`；纯 LF（CR 计数 0）；`bash -n` 通过
- 作废的前两版：32b5e667…1770（空白处理缺陷）、3a215a27…ef78（NUL 字节被接受）。
- diff：runjob.diff（git diff --no-index，31 行）。不改 gate.sh、不改 F:/dnd-tools 任何文件。

## 参数传入方式
gate.sh 的 `launch` 只把 `full <dir> <hash> <P> <files>` / `script ...` 传给 runjob，且不改 gate.sh，因此参数不能走命令行。
runjob 已 `cd /work/<dir>`，且在其后做了树哈希核对。约定：代码目录根下放普通文件 `.job-timeout`，内容必须恰为一个十进制正整数（1..14400），后面最多一个换行。
该文件在哈希范围内（manifest.py 只排除顶层 node_modules/.out/.tmp/.git），随审查批准的哈希锁定；runjob 在哈希核对之后才读它。
用法：放 `.job-timeout`，内容 `7200`（或 `7200\n`），经 apply 上传，审查通过后正常 run / run-script。

## 解析规则
读前 7 字节（再补一个哨兵字符以保留结尾换行），记下读到的字符数 n，去掉至多一个结尾换行，剩余必须整体匹配 `^[1-9][0-9]{0,4}$` 且 ≤14400；并且文件真实字节数（`wc -c < 文件`）必须等于 n（bash 命令替换会丢弃 NUL，含 NUL 的文件字节数大于 n，因此被拒）。任一不满足，JOB_TIMEOUT 保持 3600。不删内部空白、不截断后再接受。

## 异常值处理（解析逻辑逐项实测）
| 文件内容 | 结果 |
|---|---|
| `7200` / `7200\n` | 7200 |
| `14400` | 14400 |
| `14401` | 3600 |
| `1\n2` | 3600 |
| `72 00` | 3600 |
| `7200\n\n` | 3600 |
| `7200\r\n` | 3600 |
| `72\0 00`（含 NUL） | 3600 |
| `7200\0`（含 NUL） | 3600 |
| `0` / `012` | 3600 |
| `1234567`（超长） / 更大的文件 | 3600 |
| 空文件、符号链接、文件不存在 | 3600 |

## 不传时行为不变（逐行）
- 新增 7 行（注释、JOB_TIMEOUT=3600、if 块、export）全部位于 :19 后、`if [ "$mode" = full ]` 前；哈希核对、.job 写入、mkdir、TEMP/TMPDIR、GIT_CONFIG 各行原样。
- 无文件或任何不合规内容：JOB_TIMEOUT 保持 3600，与原值相同（静默回退）。
- 原 :36（full）与 :40（script）两处 `timeout -k 30 3600` 仅把 `3600` 换成 `$JOB_TIMEOUT`；full 那处在单引号 bash -c 内，靠 `export JOB_TIMEOUT` 由 xargs 子 shell 继承展开。其余字符一字未动。
- 带 `.job-timeout` 的目录哈希不同，需单独审查批准；git snapshot 的 exclude 含 `.job*`，不影响快照。
