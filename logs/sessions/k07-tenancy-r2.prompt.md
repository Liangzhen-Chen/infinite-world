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
限时：240 分钟（到 230 分钟时停手写交接）。

K07 续做（主会话核对后划定所有权，可以开工实现）：

**新增本卡所有权**（PERFS6 不碰这些文件）：
- world/actions/core.json:38–39 的 rent_in / rent_out 槽位：加租制（定额/分成）、毛产/净产基数、分成比例、投入承担、期末未收作物安排等必要槽位；只走动态目录，复用现有 world_trade 租约处理器，**不扩 extension/tools.mjs 静态参数**；静态提示必须仍 ≤10593（tests/a3-tool-surface.test.mjs、a3-owner2-T、action-registry 中的预算断言）。
- tests/action-registry.test.mjs:150–168 的槽位允许表：登记有意新增的参数，保留逐项 deepEqual 与未知槽位拒绝。
- server-plugin/action-consent.mjs:32–37,53–66,137–151：扩展同意条款白名单与匹配，保证旧的定额租同意不能替代新的分成租，也不能替没谈过的作物处分条款作数。

其余按你交接报告里已定位的卡内位置实施（finance-assets 签约/到期分开定额与分成、分成在真实收成后派生且先付只抵一次、到期未收作物不再无依据转给出租人；contract-state 纳入真实条款投影；agriculture 收成事件接租金基数、按累计应付差额处理分次与重放；household-budget 扣除未结算分成负担；减免复用 obligation-runtime 修约/债权人减免，不另建灾害自动免租）。

验收按原卡；另加 a3-tool-surface、a3-owner2-T（静态提示预算）、actions-catalog、action-registry。汇报同原卡，附五个手算锚点实测。
