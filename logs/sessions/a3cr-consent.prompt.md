【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 a3cr-consent（A3 收口：同意与权利不可伪造）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3CR（分支 t-a3cr，自 a3a）。

目标（一句话）：玩家不能靠在请求里自填“对方同意”让 NPC 签约，欠方不能单方延期；借贷、远期买卖、展期都要有对方真实的同意（同意事件、服务约定或 NPC 当前决策——与 core:trade.lend 现有的校验同一机制），并且玩家能通过真实动作走通这些流程。

主会话已核实的缺陷：
1. server-plugin/transport.mjs 约 359 行 task==='forward' 只检查 args.consent===true（玩家自填），即可让 NPC 成为远期交货合同的债务人。改为复用 lend 已有的同意来源校验（rg 找 lend 的同意检查），删除 args.consent 通道。
2. server-plugin/obligation-runtime.mjs amendObligation（约 225–240 行）只校验 actor 对 debtor 的权限，债务人可单方改 deadline。改为：改期限须有债权人真实同意，或原合同条款授予的展期权；债权人对自己不利的让步（给对方展期）可单方作出。tests/s3-delivery-conditional.test.mjs:27 让债务人 DRIVER 单方展期——改为无同意被拒、有债权人同意才生效，保留“展期保留签署快照”的断言意图。
3. prelude 留下的 todo（保留断言，接上真实动作后改回 test）：#4 tests/a3-owner-c-r10「r10 C: waiver identifies the actual debtor and creditor…」、#5 tests/a3-owner-jia3 两条与 tests/a3-setup-institutions「obligations: native old loans…」——用真实动作建立贷款及借款/还款双方同意链；#3 tests/a3-owner-ding「O: the native snapshot writer books the existing collateral…」要求当票宽限 1440 分钟：先查世界数据或设计里有无当期/宽限依据，有就按依据实现，没有就不要编造，报告并保持 todo。
可改：server-plugin/transport.mjs、obligation-runtime.mjs、credit.mjs、finance-bank.mjs 及同意校验所在模块（若在 engine.mjs 则先停下报告，engine.mjs 归另一张卡）；上面列出的测试；新增 tests/a3-consent-rights.test.mjs。锁定：engine.mjs、storage.mjs、interactions/effects/magic、quest-board、festival、action-router、domain-rules 及其余文件。
验收：node --test --test-isolation=none tests/a3-consent-rights.test.mjs tests/s3-delivery-conditional.test.mjs tests/a3-owner-c-r10.test.mjs tests/a3-owner-jia3.test.mjs tests/a3-setup-institutions.test.mjs tests/a3-owner-ding.test.mjs tests/a3-policy.test.mjs，再 rg 列出 tests/s3-*.test.mjs 中调用 forward/extend/amend 的文件并一并跑。
新测试须覆盖：自填 consent 被拒且零写入；NPC 真实同意后签约成功并有同意记录；债务人单方展期被拒；债权人同意或合同授权后展期生效；存档往返。
不调用真实模型。预计规模：中。本卡名 a3cr-consent。
通用：先读 docs/产品原则.md。所有 node 命令先设 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，测试用 --test-isolation=none，输出过滤为摘要。题集 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs 冻结。不为测试新增生产接口、加载器分支或世界内容；测试前提用真实动作（tools/a3-setup/prelude.mjs 的 runPrelude 或直接 previewAction+reduce）。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/<本卡名>.final.txt。
