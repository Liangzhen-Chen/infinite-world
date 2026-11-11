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
