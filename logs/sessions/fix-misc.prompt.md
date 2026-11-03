【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 fix-misc（A3 收口：今天合并引入的 8 个测试回归）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3F3（分支 t-a3f3，自最新 a3a）。主会话全量扫描并逐个二分（在 a3a 每个合并点跑，找第一次失败）：下列文件在 master 与本会话开始前的 a3a（20caa4bb）上都通过——
1. 引入于 fix4-prelude（删除测试专用 restore* 快照接口、改用 setup.prelude）：tests/law.test.mjs、tests/bounty.test.mjs、tests/reputation-law.test.mjs，报 ReferenceError: cases is not defined（多半是删接口时留下的变量或导入遗漏）。
2. 引入于 a3cc-causal（关系证据统一走关系账、信任只存一份）：tests/m2-action-context.test.mjs「原shove顺序自认→有充分证据逮捕押解→在场审理…」、tests/m2-preconditions.test.mjs「推搡按真实骰点留伤情…」（npc_shove 第 1 回合断言失败）。
3. 引入于 fix4-data（鱼汤配方、修剑工时由 30 改为 60 分钟，依据日常题 D16.5/D18.2“半个时辰”）：tests/s3-offscreen-life.test.mjs、tests/s3-run001.test.mjs（E12: original scenario failed to execute）。若失败只是测试里写死了旧的 30 分钟时序，按新的已审批数据从数据派生时序；若是场景因多花 30 分钟而错过某个时点，调整前提的真实动作顺序，不改世界数据。
4. 引入于 a3p-domain（工具按用途标签、中转由路线推出、业务错误改 ActionRejection）：tests/m6-07.test.mjs 两条（只读投影不泄漏、屏幕标签避让）。
可改：根因所在的 server-plugin 模块与上述测试文件（逐处列出）。锁定：action-boundary、action-rejection、primitive-policy、primitives、open-actions、action-text、extension/action-builder（另一张卡在改）；credit、finance-bank、obligation-runtime、transport、action-consent（另一张卡在改）；world/、docs/、题集、判分器。若根因在锁定文件，停下报告最小接点。
规则：先读 docs/产品原则.md。修根因，不放宽断言、不删/跳过测试、不写特判；如果旧测试的期望与 A3 新设计冲突（例如业务失败现在返回 rejected 回执而非抛错），按设计更新断言并保留原意图、逐处写依据；如果是产品被改坏，修产品。TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要；单个失败只看最后 30 行。题集与判分器冻结。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。
验收：node --test --test-isolation=none 以上 9 个文件全部通过；再跑 tests/a3-causal-chain.test.mjs tests/a3-prelude.test.mjs tests/domain-rules.test.mjs tests/a3-domain-properties.test.mjs。最后回复不超过 10 行（每个文件的根因一句、改动文件、验收结果），同样写到 F:/dnd/logs/sessions/fix-misc.final.txt。
