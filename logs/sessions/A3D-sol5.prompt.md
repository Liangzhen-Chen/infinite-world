【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-D 第 5 轮（构造器接入独立验收）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3D（分支 a3d，已同步最新 a3a）。独立验收构造器 0/98（F:/dnd/logs/sessions/a3-gap-v2d.md、F:/dnd/logs/sessions/a3-score-v2d.json、F:/dnd/logs/sessions/A3D-sol4.final.txt 说 A/E 接点待补）。任务：让 tools/a3-score.mjs 的构造器路径真实驱动你的四步构造器（无 LLM）完成 expected.constructor=true 的意图——若判分工具调用你的接口方式不对，修判分工具的构造器适配部分（只限该部分，写明理由），若构造器缺能力则补构造器；不改语料。重跑判分报构造器完成率。跑 tests/a3-*.test.mjs、CORE。报告 F:/dnd/logs/sessions/A3D-sol5.final.txt；回复 ≤150 字。
