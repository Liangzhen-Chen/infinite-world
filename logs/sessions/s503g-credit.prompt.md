【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：45 分钟（到 35 分钟时停手写交接）。

# 续 s503f-credit：门禁发现的 3 个问题

门禁在共同基线 314e5e3f 上两次独立复跑对照，以下 3 项在基线上通过，在本卡失败：
1. tests/arch-metrics.test.mjs「import 图：每个模块都已标层，没有新增的向上依赖或包间 import」——新增的 server-plugin/finance-liabilities.mjs 需在 tools/arch-layers.mjs 登记层，且依赖方向不能向上。
2. tests/actions-catalog.test.mjs「actions.json 是最新导出」——按测试提示运行 `node tools/export-actions.mjs` 重新导出，确认导出差异只来自本卡改动。
3. tests/a1-lt-scenarios.test.mjs「L4 库存有限：铁匠铺的镐卖完后买不到，菜单说明下次进货的日子，到货后能再买」——查明本卡哪处改动（发行按面值、共享负债模块、典当借款人等）影响了商店库存/补货/报价，修实现，不改该测试。

另：你上一会话在 docs/待办.md、docs/问题.md 写了登记，这两个文件不允许执行者修改，主会话已还原，会把内容登记到正式位置；本会话不要再改 docs/。

逐文件跑：上述 3 个 + tests/s5-03、credit、finance-bank、a3-owner-ding、CORE。汇报（≤200 字，F:/dnd/logs/sessions/s503g-credit.final.md）：每项根因与改法、测试结果。
