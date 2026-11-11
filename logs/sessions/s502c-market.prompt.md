【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 续卡 s502c-market：S5-02 第 3 会话

接着你的第 2 会话（未提交；独立金额锚点已补、取整与议价精度已修、净资产接市场 value）。按你交接的顺序：
1. 商户口粮保留：商户自用与家庭口粮从可售量扣除（按 world 中的口粮/人口数据派生，不写死天数以外的常数）；补数字锚点测试。
2. 审批管线：world/design/s5-market-content-approval.mjs 跑完 L2 审阅（需要 DeepSeek 内容审阅，属用户已授权的 DeepSeek 额度；本卡上限 0.3 元，超出立即停止并汇报），然后 --publish、--verify 通过。若沙箱环境拿不到 DEEPSEEK_API_KEY，停在这一步写明，主会话外跑。
3. 继续迁移价格调用（docs/S5-02-价格迁移.md）：区域价、补货、NPC 自治中的定价。
4. 剩余 affected 文件对照 master（你的 matrix/pending 清单），把能跑的跑完，报 pass/fail 与 master 对比；沙箱拦的列给主会话。
约束同前（手算锚点、不加版本标记、不放宽）。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s502c-market.final.md），含 DeepSeek 实际花费。
