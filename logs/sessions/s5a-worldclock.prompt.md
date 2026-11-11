【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：45 分钟（到 35 分钟时停手写交接）。

# 续卡 s5a-worldclock：合并后 world-clock 锚点更新（在集成工作区）

工作区 **F:/dnd-wt/S5A**（分支 s5a，已合入 S5-01/02/05；没有其他执行者在用它）。全量扫描中 tests/world-clock.test.mjs「真实周贸易到货后推进阶段并消费区域报价…」失败：榆坡第一次观察实际 2.361258491121227，锚点 2.3619333935100766。锚点注释的公式是 环境基准 × D/(公仓粮 − D)；按实际值倒推，公仓粮约多 3 份，疑与你在 S5-05 修正的"精确有理累计"（如 15 班×20/480 应得 20 而非 19）有关。
## 要做
1. 确认根因：读出两次观察时刻（clock.history 的两个 minute）四个村公仓的**实际存粮量**与 D（在测试里经真实推进得到的文档状态，或用测试同样的推进重放到那两个时刻读取），说明多出的粮来自哪条 S5-05 规则。
2. 若是合法变化：按注释里的公式，用新读出的存粮事实**手算**新锚点，更新注释里的 [基准, D, S] 与字面量；不得用报价函数的输出当锚点。若是实现缺陷：修实现。
3. 跑 world-clock 与 s5-02、s5-05、ledger-price、settlement-trade 相关测试确认。
汇报 ≤200 字（UTF-8，F:/dnd/logs/sessions/s5a-worldclock.final.md）：根因、四村新旧存粮数、改动、pass/fail。
