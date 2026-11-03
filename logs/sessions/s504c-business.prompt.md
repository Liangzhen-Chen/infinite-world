【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 卡 s504c-business：S5-04 第 3 会话

第 2 会话已完成：
- 目录、命名空间与 S0 导出同步；
- 收支接入柜台；
- 内部调拨不重复征税；
- 库存承诺；
- 主观行情。

第 2 会话的全量门禁已被主会话取消（为节省机器时间）。你在第 2 会话跑过的相关文件都通过了；全量检查留到本会话交卡时一并跑。

## 本会话按你的计划继续
1. NPC 候选接入执行；
2. 役畜工时派生；
3. 客流与香火；
4. 丝绸产业链的审批补充（已发布内容只走审批管线，不手改 dist/）。

做完后，回头检查 S5-04 设计（docs/架构设计 相关小节）是否还有未落地的闭环，并列入汇报。

## 约束
同前两会话：
- 派生优先；
- 测试前提用真实动作；
- 手算锚点；
- 不放宽断言；
- 不改 docs/；
- 不跑慢档，也不自己跑全部 affected。

## 交卡前
逐文件跑：
- 本卡测试；
- CORE（engine、storage、plugin）；
- action-registry、actions-catalog、advance-registry；
- 所有本会话改到的模块的直接测试。

## 汇报（≤300 字，写入 F:/dnd/logs/sessions/s504c-business.final.md）
新增的机制与锚点、测试结果、S5-04 剩余闭环清单、偏离。
