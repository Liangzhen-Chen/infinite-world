【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

续做 a3cr-consent（同一工作区 F:/dnd-wt/A3CR，接着未提交改动）。主会话审核同意你的方向，并作如下安排：
1. 解锁 tests/credit.test.mjs、tests/finance-bank.test.mjs、tests/s3-finance-scenarios.test.mjs、tests/a3-owner-jia.test.mjs：其中依赖布尔同意（args.consent:true）的用例，改为用真实同意来源（applyConsentEvent 或真实动作链/runPrelude）建立前提，断言意图不变；“要求无标记拒绝而标记成功”的用例按新规则核对——若旧断言本身在验证“自填同意被接受”，就改为验证被拒且零写入，逐处写依据。
2. finance-bank:95「聚落级别与现任官员派生白石和远方钱庄…」与 s3-finance-scenarios:55「E05-6: 兑票实扣到达网点现金…」：主会话已核实，这两条在 master 上通过（17/0），在本会话开始前的 a3a（20caa4bb）上就已失败——是更早某次 A3 合并引入的回归，与你的改动无关。请找根因（对比 git diff master..a3a 中影响白石聚落级别、现任官员或钱庄派生的改动，例如 fix3-world 的治理/职位数据），在根因处修复，不改断言、不加特判。若根因在 world/ 已发布数据且须经审批管线才能改，停下报告根因与建议改法。
可改：上一轮的文件 + 上述 4 个测试文件 + 根因所在的 server-plugin 模块（若为 engine.mjs/storage.mjs 以外）。
验收：node --test --test-isolation=none tests/a3-consent-rights.test.mjs tests/s3-delivery-conditional.test.mjs tests/a3-owner-c-r10.test.mjs tests/a3-owner-jia3.test.mjs tests/a3-setup-institutions.test.mjs tests/a3-owner-ding.test.mjs tests/a3-policy.test.mjs tests/s3-runtime.test.mjs tests/credit.test.mjs tests/finance-bank.test.mjs tests/s3-finance-scenarios.test.mjs tests/a3-owner-jia.test.mjs 全部通过（todo 除外）。
最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3cr-consent2.final.txt。不再启动其他会话或子代理。
