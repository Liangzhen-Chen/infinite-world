【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

回归修复（接续你的 a3rj-refusal 改动；你的改动已合入 a3a）。新工作区 F:/dnd-wt/A3F1（分支 t-a3f1，自最新 a3a）。主会话做了全量扫描并逐个二分：下列 10 个测试文件在 master 与本会话开始前的 a3a 上都通过，第一次失败出现在合入 a3rj-refusal 的那次合并：
tests/finance-assets.test.mjs、governance-titles、learning、r06-bs-craft（现在超时）、repair（TypeError: Cannot read properties of undefined (reading 'mechanic' / 'success')）、runtime-invention、verbs-extra、w2-s4（现在超时）、wildlife-society、world-events（K10 订阅者顺序 deep-equal 不符）。
特别注意性能：r06-bs-craft 与 w2-s4 由通过变超时。怀疑每次拒绝都对备选动作做真实预览（checkedAlternative / markFallback）使大量拒绝的测试变慢。请先测量（单文件用时 before/after，可用 git show 取旧文件做对照），若属实，在不降低“推荐的下一步须经当前状态核对”这一保证的前提下降低成本（例如按需/惰性生成备选、限制数量、复用同一次预览、或只在面向玩家的入口生成），并说明取舍。
规则：先读 docs/产品原则.md。修根因，不放宽断言、不删/跳过测试、不写特判；如果旧测试的期望与 A3 新设计冲突（例如业务失败现在返回 rejected 回执而非抛错），按设计更新断言并保留原意图、逐处写依据；如果是产品被改坏，修产品。TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要；单个失败只看最后 30 行。题集与判分器冻结。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。
验收：node --test --test-isolation=none 以上 10 个文件全部通过（逐文件报 pass/fail 与用时）；再跑 tests/a3-refusal-contract.test.mjs tests/a3-policy.test.mjs tests/a3-open-actions.test.mjs tests/a3-builder.test.mjs。最后回复不超过 10 行（每个文件的根因一句、改动文件、验收结果与用时对比），同样写到 F:/dnd/logs/sessions/fix-rj.final.txt。
