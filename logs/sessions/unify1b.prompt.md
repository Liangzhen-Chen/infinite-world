【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 续卡 unify1b：按用户批准处理旧兼容用例 + 修 5 个新回归

用户 10-25 已批准删除只为旧版本兼容存在的测试。主会话的处理口径（按此执行）：
- 你列的 21 个用例（logs/sessions/unify1-receipts.final.json 的 awaiting_user_approval_to_delete）中：**混合用例**（现行规则保证 + 尾段"旧存档按旧规则"）只删旧规则尾段，保留并通过现行规则部分，用例名去掉"旧复演"字样；**纯旧用例**整删：world-events「旧账重放不把旧施法补成社会伤害」、a3-legacy-replay 三例、s4-office-quests「旧入会事件复演保留原结果」、a3-owner-ding「Q: legacy cases retain party identity…」、advance-registry「历史服务回执 full/quiet」两例。s3-closeout-succession 那例删"无版本旧回放"部分，保留"版本回放采用继承条款与支付回执"作为现行规则断言。
- 删除时逐处在汇报列出（文件:用例:删了什么:保留了什么）。若某尾段其实还守着现行规则（如守恒、权限），改写保留，不要删。

## 另修 5 个新回归（全量扫描 F:/dnd/logs/sessions/sweep-unify1.tsv 中失败，s4a 上原本通过）
tests/quest-wildlife.test.mjs、tests/reputation-law.test.mjs、tests/scale.test.mjs、tests/war-diplomacy.test.mjs、tests/wildlife-encounters.test.mjs。多半是去掉版本分支后某处现行行为没保留、或某断言依赖已删字段。修根因；若断言只是检查被删除的版本字段，按"仅版本标记断言"处理并列出；不放宽规则断言。

## 验收
上述全部文件 + 21 例所在文件逐个单独进程全过；overfit-guard（沙箱拦 git 时写明）、arch-metrics、system-map、performance、CORE 全过；静态 ≤10593。
汇报（≤350 字）：删除/保留清单、5 个回归根因与修法、命令与 pass/fail、偏离。
