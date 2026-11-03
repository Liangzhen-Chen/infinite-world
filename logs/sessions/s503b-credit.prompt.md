【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 续卡 s503b-credit：S5-03 第 2 会话

接着你的第 1 会话（准备金约束、动态存贷利率、柜台原因查询、贷款守恒、空库停兑与补款恢复，未提交）。主会话的自动门禁已在沙箱外跑过受影响快档 419 个：新回归 0（performance、scale 为基线同败）。主会话还原了你对 docs/问题.md 的修改（docs/ 不在可改范围）。
继续完成 s503-credit.body.md 的全部要求：铸币/信用币两分支与汇率、接受范围；超发贬值；撤回申请不能抬价；具名存单（伪造/错持有人/超支拒绝、部分支取不复制债权）；恢复对应 todo（存单支取、假单/错人/超支、部分支取不复制债、债权来源）；手算数字锚点；规则数据经审批管线。
**不要自己跑慢档测试**（F:/dnd-tools/slow-tests.tsv），交卡后自动门禁会跑受影响测试。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s503b-credit.final.md）。
