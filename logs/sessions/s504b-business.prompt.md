【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 卡 s504b-business：S5-04 第 2 会话

第 1 会话（独立柜台、4 个 todo、遗产偿债、新签/续签工价派生、缺勤罢工工时）门禁结果（与共同基线 0960452b 两次独立复跑对照）：本卡导致 3 项失败，都是本卡自身应完成的同步：
1. tests/action-registry.test.mjs「注册表：数据声明、带命名空间、与 S0 动作清单一一对应且为最新同步」（2 个用例）
2. tests/actions-catalog.test.mjs「actions.json 是最新导出」——运行 `node tools/export-actions.mjs`
3. tests/advance-registry.test.mjs「对照：full存档推进结果可重放且与快照逐字节相同」（2 个用例）——经营账户改变了推进状态：先确认差异只来自本卡的有意改动，再按测试自带流程 `UPDATE_ADVANCE_GOLDEN=1` 重生成快照并复跑通过；不放宽其它断言。
（runtime 浏览器测试为已知偶发；tests/baseline 的 23 项历史预期失败与 tests/probes 超时不归本卡。）

先修以上 3 项，再按你的交接继续：收支接柜台、进货/定价/雇解读主观行情（S5-02 市场投影）、役畜工时、客户订单竞争、客流香火与丝绸产业链供需、内部调拨不重复征税、商号账簿/签发收据有来源。约束同第 1 会话（派生优先、真实动作前提、手算锚点、不放宽断言、已发布内容走审批、不改 docs/、不跑慢档、不自己跑全部 affected）。

汇报（≤300 字，F:/dnd/logs/sessions/s504b-business.final.md）：3 项修复、新增机制与锚点、测试结果、偏离、第 3 会话计划。
