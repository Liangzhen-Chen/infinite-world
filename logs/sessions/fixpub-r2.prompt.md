【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：180 分钟（到 170 分钟时停手写交接）。

续做 FIXPUB（正文见 F:/dnd/logs/sessions/fixpub.body.md，共同规则 s5law-common.md）。上一轮受工具阻塞提前停了，两处已由主会话修好：

1. **affected-tests2 在沙箱里可用了**：沙箱不能起 git 时，它自动用本树的 .base-index 与 .base-src/（主会话在沙箱外按 .base 写好）比较工作区。命令不变：`node F:/dnd-tools/affected-tests2.mjs . <.base 内容> WORKTREE 0`。若仍报错，把原文贴进汇报并继续做其余部分，不要停。
2. **测试摘要**：PowerShell 解码 ℹ 有问题，改用 TAP：`node --test --test-isolation=none --test-reporter=tap tests/<文件> 2>&1 | Select-String -Pattern '^# (pass|fail)|^not ok' | Select-Object -First 40`（设 TEMP/TMP=F:/dnd-tmp）。npc-profile-publication、w1-villages-publish 单文件约需数分钟，等它跑完。

上轮线索：K10b 合并在 world/people/baseline.json 给陆青新增"公事报修"关系，深度发布核验逐层比较当前人物与深度补丁结果。请继续：分别在首败提交上确认 W8E3（6b704e70）与 K10b（f5edba19）各自原因（你可以读 git 对象之外的文件；需要旧版本内容时在汇报里写明要主会话导出哪个提交的哪个文件，主会话会放到 F:/dnd-tmp/fixpub/ 下；已预先放好：两次首败提交前后的 world/people/baseline.json（baseline.<提交>.json / baseline.<提交>p1.json 为父提交）与各自改动文件列表 changed.<提交>.txt），修责任层，跑完验收清单。
