【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 p3-artifacts：测试运行产物隔离（流程 v2 实施卡 P3）

工作区 F:/dnd-wt/GATEP3（分支 t-gatep3，基于 s5a）。设计参考：F:/dnd-wt/GATEQ/tools/gate/DESIGN.md §9 最后一段与 §12 的 P3 段（只读）。

## 问题
每次跑测试，docs/测试报告/最新/** 下几十张截图、playback.json、T20-ledger-*.json，以及 docs/system-map.html、docs/system-map.json 都会被改写。改写的结果混进每张卡的改动里，主会话每次都要手工还原。并发跑测试时，这些产物还会互相覆盖。

## 所有权
只改：
- tools/system-map.mjs、tests/system-map.test.mjs
- tests/runtime.test.mjs
- tools/run-baseline.mjs
- 必要时 tools/tmp-root.mjs（先确认它存在、是谁在用）
- 以及你查到的其他真正写 docs/测试报告 的测试入口：先用 grep 列出所有写 docs/测试报告 或 docs/system-map 的代码位置，汇报里给出清单；清单外的文件不改，改之前在汇报里列出理由。

tests/m6-01.test.mjs 已默认写 tmpRoot，不要无故改动。

## 要做
1. 增加产物输出根：环境变量 FIELDS_TEST_ARTIFACTS。未设置时默认写进本次运行的临时目录（F:/dnd-tmp 下的唯一子目录）。只有显式的文档更新命令（例如 `npm run docs:update` 之类已有脚本，或设置 FIELDS_TEST_ARTIFACTS=docs）才写 docs/。
2. system-map：测试检查的仍是同一份生成内容，原有 JSON/HTML 断言逐条保留，只是从输出根读取。land.sh 用来更新 docs/system-map.* 的入口必须照常生效（查 F:/dnd-tools/land.sh 里怎么调用，确认路径；该脚本只读不改）。
3. runtime 测试：原截图、账本证据照常生成并做断言，只是写到输出根。
4. run-baseline.mjs：现在同一条 node 命令带两个测试文件。改成两个独立进程，结果仍要求原 23 项预期失败精确匹配，并写到输出根。
5. 每个被改的测试，逐处写设计依据：为什么改、保留了哪条断言。

## 验证
被改测试逐个单独跑：`node --test --test-isolation=none tests/<文件>`，输出只看摘要。浏览器、子进程类测试在沙箱里会 EPERM，列出即可，主会话在外面补跑。跑完用 `git status --short docs/` 确认没有新增改动。

## 约束
不删测试、不放宽断言；不改 docs/架构设计/；不调用付费模型。

## 汇报（≤250 字，F:/dnd/logs/sessions/p3-artifacts.final.md）
写产物的代码位置清单、改法、每个测试的结果、`git status docs/` 结果、偏离、需外跑的项。
