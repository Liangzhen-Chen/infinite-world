【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

卡 A3-E 第 2 轮（修判分工具，保证尺子准确）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3E（分支 a3e，已同步含 A3-A 第 9 轮的 a3a）。你是验收工具作者：不得修改引擎实现（server-plugin/、extension/ 只读）。
上一轮（F:/dnd/logs/sessions/A3E-luna.final.txt）tools/a3-score.mjs 只调用 previewAction，许多条目结果为 not_submitted；且语料 tests/fixtures/a3-intents.json 大量“（第N种情境）”重复凑数——语料将由另一出题者重写为 F:/dnd/logs/sessions/a3-intents-v2.json（字段见该文件，可能稍后才生成；先按其字段约定兼容：expected.route/signature/outOfBounds/fallback/constructor）。
任务：
1. 让 tools/a3-score.mjs 走完整两阶段流程：开放提案 preview→确认提交（读 engine.mjs 与 primitives-runtime.mjs 的 world_propose 两阶段协议，按真实接口确认）；已注册动作走 world_act；构造器路径走 A3-D 的四步构造器接口；澄清/拒绝按回执判定。路由判定比对“实际采用的动作/原语”与 expected.route，签名比对实际效果原语集合与 expected.signature；兜底反应率统计“应兜底”条目是否真的产生带标签实体与订阅反应。
2. 准确性自检：挑 6 条你能人工核对的意图（成功、越界拒绝、澄清、兜底、构造器各至少 1），写 tests/a3-score-self.test.mjs 断言判分器对这些条目的判定正确。
3. 让 tests/a3-acceptance.test.mjs 读 v2 语料（若存在）否则旧语料，断言阈值（不放宽）。
跑：a3-score-self、a3-acceptance（如实失败即可）、CORE。报告 F:/dnd/logs/sessions/A3E-sol2.final.txt；回复 ≤150 字：两阶段接法、自检结果、用旧语料重跑的各指标。
