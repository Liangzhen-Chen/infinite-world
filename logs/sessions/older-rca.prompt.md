【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

只读根因分析卡（不改任何文件、不提交）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-tmp/wt-sweep（a3a 最新提交的分离副本，只读）。先读 docs/产品原则.md。

背景：a3a（A3 集成分支）相对 master 有一批测试回归。下列 25 个文件在 master 上全部通过，在本会话开始前的 a3a（20caa4bb）上就已失败——是前几天 A3 工作积下的回归。清单：F:/dnd/logs/sessions/older-files.txt（每行一个测试文件）。master 对照基线：F:/dnd/logs/sessions/sweep-master-bedb5078.tsv（master 其后只有 4 个小代码提交）。已知线索：advance-registry 两组金快照在 a3a 上不匹配（docs/PLAN.md 开头 10-22 修复 D 路一段提过，待统一用 UPDATE_ADVANCE_GOLDEN=1 重生成并登记原因）；system-map 测试因 tools/system-map.mjs 报“新模块须在 tools/arch-layers.mjs 归层”而整体失败。

任务：逐个文件跑（node --test --test-isolation=none <文件>，TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要，单个失败只看最后 30 行），找出每个失败用例的根因，并按根因分组。对每组给出：
- 根因一句话 + 证据（文件:行、实际 vs 期望；可用 git log -S / git log -L / git show 在 master..a3a 间定位引入它的提交）；
- 性质：产品缺陷（a3a 改坏了 master 上正确的行为）/ 测试期望过期（a3a 的新设计是对的，测试需按设计更新）/ 数据或金快照需按审批重生成 / 其他；按 docs/产品原则.md 判断，不以“让测试通过”为准；
- 建议修法与涉及文件、规模（小/中/大）；同一根因的多个文件合并成一组。
不要修改任何文件。不再启动其他会话或子代理。结果写到 F:/dnd/logs/sessions/older-rca.final.txt（不超过 80 行），最后回复同样内容。
