【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：45 分钟（到 35 分钟时停手写交接）。

续做 fix-misc（同一工作区 F:/dnd-wt/A3F3；你上轮的改动已由主会话提交并合入 a3a）。主会话决定：种私田须有具备 soil_work 用途的工具这一规则合理，保留（翻土需要工具）；tests/probes/s3-offscreen.mjs 不是冻结文件（冻结的只有 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs），可以改。
要做：在 tests/probes/s3-offscreen.mjs 的场景前提里，用真实游戏动作先取得播种与早收所需的工具（例如在出售锄头/镰刀的店铺真实购买，钱从玩家现有钱袋出；店铺与物品须是世界里真实存在的，rg world/ 核对；若需要先移动到店铺，就真实移动并等待），再继续原场景；保留原断言与 30/60 分钟时序从已审批数据派生。不改世界数据、不改规则、不为场景加物品。
验收：node --test --test-isolation=none tests/s3-offscreen-life.test.mjs tests/s3-run001.test.mjs 全部通过；再跑 tests/agriculture-private.test.mjs 若存在（rg 找私田相关测试一并跑）。最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/fix-misc2.final.txt。不再启动其他会话或子代理。
