【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 A3-C L3（场景加载：能力、知识与进行中活动类）。工作区 F:/dnd-wt/A3C（分支 a3c，已同步 a3a）。项目《无限原野》Node 规则引擎。语料 tests/fixtures/a3-intents-v2.json（已含第 6 轮结构化前提），字段契约见 F:/dnd/logs/sessions/a3-intents-v2.md「加载器待支持字段」表（逐字段形状与加载要求）。加载器框架：tools/a3-setup/index.mjs（registerSetupLoader({fields,order,load(ctx,setup,fields)})，ctx 含 engine/setup/bindings/ref/actor/unmet/note/native(item,write(draft))/document 读写）；新建本卡模块文件并在 tools/a3-setup/loaders.mjs 加一行 import。规则：一律经引擎原生接口建立（开账、开持有、建实体、立案、建义务、设位置等），不直接往 state 写“已发生”的结论，不创造原文没有的权利/同意/成功；引擎没有原生表示的字段，写 unmet 并注明缺哪个原生接点和设计章节（例如空间坐标属 S4），不得伪造。sourceEvent/history 引用经 ctx.bindings 跨模块解析。不改语料、不改判分函数和口径、不改引擎（若加载必须依赖的原生接口确实缺失，只在报告里列出）。每个字段配自检（tests/a3-setup-<本卡>.test.mjs），覆盖正例与非法输入记 unmet。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<卡名>-score.json，报六项指标与本卡字段剩余 setupUnmet 计数；跑 tests/a3-*.test.mjs 与 CORE。
本卡字段（order 70–90）：abilitiesByActor、vocations、reading、practiceState、knowledge、mapKnowledge、demonstrations、combats、conversations、summons、rites；以及已有 instances/holdings/status/present 在新语料中报 unmet 的条目（见 a3-intents-v2.md 表末“已有接点”行与 a3-score-v2n.json 的 setupUnmet）。模块文件 tools/a3-setup/agency.mjs（已有字段的修正在 tools/a3-score.mjs 原处做，改动最小）。报告 F:/dnd/logs/sessions/A3C-L3.final.txt；回复 ≤150 字。
