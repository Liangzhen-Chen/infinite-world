【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 a3r1-discover（A3 收口：真实试玩复验暴露的“模型找不到怎么做”回归）。工作区 F:/dnd-wt/A3R1（分支 t-a3r1，自 a3a 86e3af53）。先读 docs/产品原则.md。
证据：F:/dnd/logs/sessions/a3-playtest/reverify/真实试玩.json（results[*].turns[*].calls 含 args 与返回）。
1. 学艺/做工第 3 回合中断（“8轮调用内未返回完整正文”）：模型先调 world_learn，operation 依次猜“师授/teach/acquire/study/learn”，均回“未知授业操作”（server-plugin/education.mjs:196；extension/tools.mjs:19 的说明“师授/读书/研究；student受教，book_give/study”易误导）；再调 world_act core:learn，craft 填 slots{entity:npc_hw_ayan,source:旧磨坊工作台,skill:木匠} 得“没有这些槽位：skill”，literacy 填 {entity:识字,source:npc_hw_luqing} 得“需要npc类型编号”。上一轮（core4，压缩前）同场学艺可成功，因模型从 world_actions 结果看到槽位含义/可选项；a3cp 压缩后 relatedActions 只剩必填槽名。要做：(a) 模型投影对与查询/目标最相关的前几个注册动作保留每个槽位的 kind 与简短可选项（如 skill 候选 id+名），仍守 ≤1200 估算 token 上限；(b) world_learn 收到未知 operation 时，拒绝里列出合法 operation 及“普通师授不填 operation”（若属实）等可纠正提示；core:learn 的槽位错误同样列出各槽含义与可填值；技能可按名称或别名解析为 id（实体按名称解析是允许的语言归一化），不放宽权限、学费与同意校验；(c) 若 tools.mjs:19 的说明与实际 operation 不符，在不增加静态提示总长（≤10593，当前 10587）的前提下改正措辞。
2. 交谈打听第 6 回合：玩家要“向公共粮仓柜台按粮仓账购买十份带壳燕麦”，模型只调 world_actions 就停了。查该调用的 query/target 与返回，找出粮仓购买动作（core:farm.buy 或实际 id）为何未出现在结果中（搜索、可见性、目标解析或压缩截断），修根因；不加同义词表、不写场景特判、不往静态提示加答案。
3. 奇思妙想第 8 回合 execution 失败：查返回原因并分类（引擎/工具/模型），属引擎或工具问题则修。
可改：extension/tools.mjs、server-plugin/education.mjs、server-plugin/action-registry.mjs 或 action-affordances.mjs 中与搜索/槽位描述相关部分（逐处列出）、相关测试；新增 tests/a3-discoverability.test.mjs（离线复现上述三处：用报告里的原参数重放，修后应得到可纠正提示或正确候选）。锁定：server-plugin/open-actions.mjs 与开放提案构造（另一张卡在改）、题集、判分器、world/、prompt/（除 tools.mjs:19 说明措辞）。
验收：每个文件单独运行：tests/a3-discoverability.test.mjs、tests/a3-model-catalog.test.mjs、tests/a3-affordance-state.test.mjs、tests/a3-tool-surface.test.mjs、tests/learning.test.mjs、tests/education.test.mjs（若存在）、tests/action-registry.test.mjs 全部通过。
不调用真实模型。预计规模：中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/a3r1-discover.final.txt。
