【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

卡 fix4-data（续做，A3 收口第 1 步）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3F（分支 fix4-data，上一任 WIP 提交 14b1fc70 已在树上，从这里接着做，不重做）。先读 docs/产品原则.md。

目标（一句话）：五处世界数据经审批管线修正并生效——鱼汤配方工时 60 分钟（日常题 D16.5 的定案）、铁剑修整工时 60 分钟、外敷药售价不低于材料成本、牛奶饱食值改由规则推导（不手填）、估价物品注明估价依据。

现状：改动在 world/design/a3-world-catalog.mjs 与 world/drafts/a3-world-approval/（管线脚本 world/design/a3-world-approval.mjs，闸门测试 tests/a3-world-approval.test.mjs）；usage.jsonl 显示部分 L2 审核已跑过。先读 world/drafts/a3-world-approval/summary.json 判断哪些条目已过 L1/L2、哪些还没跑或未通过，只补没完成的，已通过的复用不重跑。

步骤：
1. 核对上述五处在 catalog 与 world/meta（items/recipes/rules.json）里的最终值与依据；牛奶饱食必须由规则推导，不得写死数值。
2. 跑审批管线补完 L1/L2（按管线现有用法）。真实模型：DeepSeek，key 只从环境变量 DEEPSEEK_API_KEY，不读 secrets.json；上限 20 次调用、0.5 元；如实记入 usage.jsonl。若沙箱拦截联网，停在这一步，把要运行的完整命令写进报告，由主会话在沙箱外运行。
3. 同步受影响测试（已改 tests/a3-daily、daily-b2-mechanisms、daily-b2-trade、a3-world-approval，复查断言意图不放宽、逐处写依据）。

可改：world/design/a3-world-*.mjs、world/drafts/a3-world-approval/、world/meta/ 中这五处相关条目、上述测试。锁定：tests/fixtures/、server-plugin/、tools/、docs/。不手改 dist/。预计规模：小（数据 + 少量测试）。

验收命令（TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出按规则过滤）：
- node --test --test-isolation=none tests/a3-world-approval.test.mjs tests/a3-content-approval.test.mjs tests/a3-daily.test.mjs tests/daily-b2-mechanisms.test.mjs tests/daily-b2-trade.test.mjs
- node --test tests/overfit-guard.test.mjs
- CORE：node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs

不再启动其他会话或子代理。最后回复不超过 10 行：改动文件、验收命令和结果、真实模型调用次数与金额、偏离卡片处、未解决问题；同样内容写到 F:/dnd/logs/sessions/fix4-data2.final.txt。
