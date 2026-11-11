【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

卡 last3（a3a 收口：old-npc/old-content 修复后暴露的 3 个 A3 测试冲突 + 修理混跑）。工作区 F:/dnd-wt/A3L3（分支 t-a3l3，自最新 a3a）。先读 docs/产品原则.md。
1. tests/a3-r10.test.mjs:47「r10: self relief consumes MP and reduces only existing fear」与 tests/a3-r9-effects.test.mjs:68 中 A3V2-070：old-npc 按 master 行为恢复“法术数据声明 targeting.permit=mental_magic 时，对自己施放也须有许可”（magic-targeting.mjs:30；master 的 tests/m4-batch2.test.mjs:94 要求无许可自我定息被拒），A3 测试仍期望无许可成功。主会话设计决定：A3 阶段保留按数据要求许可（不悄悄丢掉法律后果）；“许可由硬拒绝改为先发生后依法定效（含自我施法）”登记 S4，由主会话登记，你不改 docs。据此：先 rg 查世界里是否存在玩家真实取得精神法术许可的动作（如向有 magicAuthorities 的人物申请；law-codes 的 magicAuthorities）。若有，A3 测试前提用该真实动作取得许可后施法，保留原断言（消耗 MP、只解除已有恐惧）；若没有，改为断言“无许可被拒、零写入，拒绝回执给出世界内原因与可行替代（例如向有权人物申请许可）”，并在报告中写明缺少的真实动作（交 S4）。不改 magic-targeting 的许可规则，不改 m4-batch2 反例。a3-r9-effects 中 070 的签名/路由断言按同一结论对齐，其余题保持。
2. tests/a3-owner2-w.test.mjs:34：内容 previewWorld:54 报同 ID 人物冲突——old-content 经审批给六名 A3 人物补了 tier 与作息（world/design/a3-people-life-approval.mjs），而 owner2-w 的审批闸门要求整行不变。参照 tests/a3-world-approval.test.mjs 对 a3w 用途标签的做法：先验后来的 a3-people-life 回执，再按历史字段核对 owner2-w 旧回执，保留原篡改断言。
3. tests/repair.test.mjs 等与修理相关的用例在多文件同进程（--test-isolation=none）混跑时有 2 处回执断言失败、单文件运行全过：查明是否为模块级共享状态（如运行时安装、缓存、全局计数器）导致的顺序依赖；若是产品代码里的全局可变状态，修成按引擎/文档隔离；若只是测试间污染，修测试的前提隔离。说明证据。
可改：上述测试文件；若第 3 项根因在产品代码，可改对应 server-plugin 模块（逐处列出）。锁定：magic-targeting.mjs 的许可规则、tests/m4-batch2.test.mjs、tests/bosses.test.mjs、tests/s3-run001.test.mjs、tests/probes/（另一张卡在改）、world/、docs/、题集、判分器。
验收：node --test --test-isolation=none tests/a3-r10.test.mjs tests/a3-r9-effects.test.mjs tests/a3-owner2-w.test.mjs tests/repair.test.mjs；再把全部 tests/a3-*.test.mjs（排除 a3-builder-ui）与 tests/repair.test.mjs 放在同一条 --test-isolation=none 命令里跑一次，失败只允许“A3 real proposal engine meets the explicit stage thresholds”。
不调用真实模型。预计规模：小到中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要，单个失败只看最后 30 行。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 8 行（每项结论与证据、改动文件、验收结果、交 S4 的缺口），同样写到 F:/dnd/logs/sessions/last3.final.txt。
