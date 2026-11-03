【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 续卡 s502b-market：S5-02 第 2 会话

主会话审查你的第 1 会话（未提交）：
**必须改**：旧场景测试（daily-b2-trade、shop-restock、a1-lt-scenarios 等）把固定价格断言改成"等于 currentTradeQuote 的结果"。这用被测的生产函数算期望值，价格公式算错了测试照样通过——等于放宽断言。改法：
1. 在 tests/s5-02.test.mjs 加**独立的金额锚点**：按 docs/架构设计/15-经济与货币.md §15.2/§15.4 的公式，在测试里用世界数据**手算**期望价（写出计算步骤的注释：基准 × 供需项 × 深度项 × 品质/水质档 × 立场 × 修正项，取整规则），至少覆盖：中性供需的首笔价、同日连续买入的第 2/3 笔（深度）、次日回落、两个品质档、一个修正项生效、零售 3 件一次取整。期望值写成数字字面量，不调用 market.mjs 求值。
2. 旧场景测试每个场景保留至少一个**数字字面量**锚点（在该场景的固定世界数据与开局下手算），其余可以对照投影；在注释里写明这个数字怎么算出来的。
3. 若手算与实现不一致：先判断谁对（以设计文档为准），实现错就修实现，不得改锚点迁就实现。

**继续完成第 1 会话的验收**：affected 全部文件对比 master；ledger-price 全文件复验；world/rules/tables/market.json 经 world/design/s5-market-content-approval.mjs 走审批管线（照 S4 法典数据的做法：草稿→审阅记录→发布→--verify）。继续迁移价格调用清单（docs/S5-02-价格迁移.md）中本会话能完成的部分。
约束同第 1 会话。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s502b-market.final.md）。
