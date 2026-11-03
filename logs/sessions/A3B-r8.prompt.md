【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-B 第 8 轮（路由：误澄清/误拒绝/路由名）。工作区 F:/dnd-wt/A3B（分支 a3b，已同步 a3a）。项目《无限原野》Node 规则引擎。差距 F:/dnd/logs/sessions/a3-gap-v2i.md、逐条结果 F:/dnd/logs/sessions/a3-score-v2i.json（a3a aee340b7，含判分口径修正）。不改语料 tests/fixtures/a3-intents-v2.json 的 expected/text/setup，不改判分口径；依据写设计文档章节（docs/架构设计/）。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<卡名>-score.json 报六项指标；跑 tests/a3-*.test.mjs、本卡相关测试与 CORE。
处理：①误澄清 13 条（008 020 035 037 040 044 060 061 065 066 073 077 088）——逐条看 preview.ambiguities，属实体/局部空间/在场物解析不足的修解析（场景中唯一的在场人/物/账户/契约应直接绑定）；确属输入本身歧义的列出依据，不硬绑；②误拒绝 7 条（006 054 074 078 079 117 120）——找出错拒原因并修；③路由名：013 016 102 期望 core:practice 而目录为 core:practice.session，001 wildlife.eat vs eat.meal，047 guide vs guide_request，080 open:proposal vs dialogue.interpreter——按 06 判断该是同一动作别名（在动作目录登记稳定别名/规范名，判分 routeName 以目录规范化，一处实现）还是确属语义不同（改路由）；不要只改判分去迎合。报告 F:/dnd/logs/sessions/A3B-r8.final.txt；回复 ≤150 字。
