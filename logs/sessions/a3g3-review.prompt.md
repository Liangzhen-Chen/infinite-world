【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 a3g3-review（回合契约 3/3：语义审查改为逐句断言核对出处）。工作区 F:/dnd-wt/A3G3（分支 t-a3g3，自 a3a，已含 1/3 服务端回合证据：settlement/currentFacts/preview/decisionSupports，见 F:/dnd/logs/sessions/a3g1-gate.final.txt）。先读 docs/产品原则.md、docs/架构设计/修订记录.md 末条、F:/dnd/logs/sessions/turn-design.final.txt 第 1 节后半与第 2 节中 consistency-review 部分。
先调研现成方案（用户要求）：开源的“LLM 输出事实核对/claim extraction + attribution（逐句断言抽取与出处核对）”做法与库（如引文/归因校验、结构化输出校验重试），只取思路与可复用的格式，不引入重依赖；结论写进报告第 1 行。
要做：server-plugin/consistency-review.mjs 的 prepare / consistencyReviewRequest / validateConsistencyResponse / reviewConsistency：审查模型改为逐句提取断言并给出原文位置、说话者、主体、谓词、对象/数量、时间、语气（事实/意图/转述）与来源引用（引用 1/3 证据里的 sourceId），判定支持/矛盾/无来源；服务端校验原文覆盖与引用有效性并决定阻断级别。价格、收费条件、制度、营业事实、NPC 新决定属需出处断言：无来源即阻断（不再一律降 warning）；普通姿态、感官描写、比喻保留自由；“当前暂停”不能支持“过去封仓”或“十二点保证开门”。合并 unsettledClaims 中“新变化/NPC 决定”的词表职责到结构化核对，不再扩同义词；保留钱物、时间、知情、原文引文与回执一致性等有效检查；修正“报价不报错”“缺来源一律 warning”等过宽豁免。首次严重问题沿用一次纯文字改写和复审，仍失败退模板。
可改：server-plugin/consistency-review.mjs、server-plugin/consistency-evidence.mjs（仅为提供 sourceId 的读接口，逐处列出）、相关测试；新增 tests/claim-review.test.mjs。锁定：extension/、tools/、server-plugin/consistency-service.mjs 的门禁逻辑（若需接口变化，停下报告）、prompt/、题集、判分器、world/。
验收（每个文件单独运行）：tests/claim-review.test.mjs（离线：用桩审查响应覆盖“两铜不够一堂/一堂八铜”无来源报价被阻断、“粮仓今早封仓、十二点开秤”中有来源的“暂停至12:00”放行而无来源因果与承诺阻断、合法旧报价与真实拒绝放行、纯感官描写放行、伪造 sourceId 被拒、覆盖不全被拒）、tests/m3-consistency.test.mjs、tests/m3-consistency-evidence.test.mjs、tests/m3-narrative-regressions.test.mjs、tests/turn-gate.test.mjs。
不调用真实模型。预计规模：中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3g3-review.final.txt。
