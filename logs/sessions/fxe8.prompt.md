【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：150 分钟（到 140 分钟时停手写交接）。

# 卡 FXE8：W8-E8 引入的回归（5 个测试）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/FXE8，分支 t-fxe8，基于 s5a@2032b5e6。

## 背景（主会话沿 s5a 合并点二分）
以下 5 个测试在 master 全过，在 s5a 失败；首个失败合并点都是 **804996a6**（merge t-w8e8-premises：田租依据 fieldRentBasis 与延期租、铁镰进货、public_property 职权与 seatPowers、业主自修 building-maintenance、设施损耗改五年参考寿命、日常采购双方在场快照等）：
a3-world-approval、bounty、entity-world、m5-authority-content、quest-sources（3 项）。
失败位置：a3-world-approval:68 与 tools/content-pipeline.mjs:229（shop_hw_forge_mining_pick 发布骨架/引用事实不匹配）、bounty:37 附近、entity-world:48、m5-authority-content、quest-sources:47/83/126。用 `git diff 804996a6^1 804996a6 --stat` 看那次合并改了什么。

## 要做
1. 逐个找根因（文件:行），归类：已批准的规律变化（如铁镰进货、损耗口径、seatPowers）导致锚点变化 / 真实回归（规律错误、守恒破坏、权限错误）/ 内容审批数据对不上。
2. 按类处理：
   - 已批准规律变化 → 手算新值、更新严格锚点并注明依据；
   - 真实回归 → 修代码，不动断言；
   - 已审内容对不上（如 forge 进货行与已审骨架）→ 不手改 dist/ 或已审 world/design；修数据接点使新增行独立于已审骨架，或写明需经审批管线补审的条目，由主会话决定。
3. 不删测试、不放宽断言。

## 验收
上述 5 个文件逐文件全过；CORE 三件、同步四件套；w8e8-premises、building-maintenance、s5-law-maintenance、s5-law-public-maintenance 不退化。汇报一张表：每处失败的原因、性质、处理。
