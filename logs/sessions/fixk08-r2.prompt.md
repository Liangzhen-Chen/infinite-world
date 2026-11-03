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
限时：180 分钟（到 170 分钟时停手写交接）。

续做 FIXK08（正文 fixk08.body.md，共同规则 s5law-common.md）。你上一轮已提交为 t-fixk08@7bbd2a18（主会话代提交），合并关卡按**子测名**对比 s5a 拦下：

tests/s5-09.test.mjs 在 s5a 上只有 1 个子测失败（three native county round trips…），在本分支多出 3 个：
- :163 first arrival borrows private stock once…：census.rostered 期望 2132 实际 2141（本卡新增的 9 名到场行商进入登记人口）；
- :239 a keeper that a memory refers to stays individual…：期望 268 实际 204；
- :298 three statistics downgrades restore…：期望 1188 实际 1191。

上一轮你把"文件在 .base 也失败"当成同败，没有比到子测——以后同一文件在 .base 也失败时，要按子测名逐项对照（`node --test --test-reporter=tap` 的 not ok 名单）。

## 要做
逐项查清：是新增行商的真实后果（人口登记、掌柜正午向行商进货付钱、降级/升级往返时行商的统计口径），还是本卡改动带来的 bug（例如行商在统计降级时没有像其他具名人物一样折叠/恢复，导致往返不守恒）。真实后果就按新规律手算更新锚点并写推导注释；bug 修代码。往返守恒（钱、货、人口在降级→升级后一致）是硬要求，不能改成近似。
确认 s5-09 只剩 s5a 原有的那 1 项，再按共同规则跑清单（注意同文件逐子测对照）。汇报 ≤300 字。
