【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 a3r2-intent（A3 收口：开放提案允许只写意图，由引擎构造器裁决）。工作区 F:/dnd-wt/A3R2X（分支 t-a3r2x，自 a3a 86e3af53）。先读 docs/产品原则.md（一.3 引擎唯一真相、二.3 尊重想象力）与 docs/架构设计/06-动作层与开放动作.md §6.9–§6.10。
背景：五次真实试玩中，模型从不提交 open:proposal——要它自己写结构化 effects 门槛太高，于是对做不到的要求它自行叙述拒绝（无引擎回执，理由不来自规则）。仓库已有无模型构造器（按目录做形式匹配，tools/a3-score.mjs 体检里称 constructor / model-free form search；rg 找实际实现，如 extension/action-builder.mjs 或 server-plugin 中的 builder/constructor）。
主会话设计决定：open:proposal 的 effects 改为可选。只给 intent（可附 target、means）时，引擎用现有构造器从意图与当前可感知实体推导候选效果：唯一可行 → 按正常开放路径预览/提交（受全部上限、同意、难度、守恒约束）；多个候选 → 返回澄清与候选；推导不出或世界规则不允许 → 返回统一拒绝投影（世界内原因、缺项、可行替代、可留痕时的 fallback），零写入。模型提交的 effects 仍优先按原逻辑处理。不新增静态提示（≤10593）；在 world_actions 的 open:proposal 条目（动态）里用一句话说明“可只填 intent，由引擎判定”。
可改：server-plugin/open-actions.mjs、构造器实现文件、server-plugin/action-affordances.mjs 中 openProposalOffer 的说明字段、相关测试；新增 tests/a3-intent-proposal.test.mjs。锁定：extension/tools.mjs、server-plugin/education.mjs、action-registry.mjs（另一张卡在改）、题集、判分器、world/、prompt/。
新测试（前提用真实动作）：只写意图“把渡口池水装进陶罐”且持有陶罐 → 构造出 transfer/装水类效果并可预览；“让池水立刻变成能治百病的灵药”→ 拒绝回执含原因与替代、零写入；含糊意图 → 澄清候选；意图提交与等价的显式 effects 提交在同条件下得到相同回执；不得绕过同意/权限/上限。
验收：每个文件单独运行：tests/a3-intent-proposal.test.mjs、tests/a3-open-actions.test.mjs、tests/a3-refusal-contract.test.mjs、tests/a3-builder.test.mjs、tests/a3-openpath.test.mjs、tests/a3-derived-difficulty.test.mjs 全部通过；静态提示不变。
不调用真实模型。预计规模：中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/a3r2-intent.final.txt。
